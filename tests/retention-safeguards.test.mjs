import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { cleanupExpiredSessions, parseSessionCleanupArguments } from "../scripts/session-cleanup.ts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherSessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const databaseName = "retention_synthetic_test";
const context = new AsyncLocalStorage();
let directory, server, pool, failure, connections, useResumeRole;
const options = (mode, batchSize = 100) => ({ databaseName, mode, batchSize, ...(mode === "delete" ? { confirmation: databaseName } : {}) });

const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
let auth;
const websitePool = {
  query: (...args) => pool.query(...args),
  async connect() {
    connections++;
    if (failure === "connect") throw Error("Private synthetic connection password");
    const client = await pool.connect();
    const roleApplied = useResumeRole;
    if (roleApplied) await client.query("SET ROLE synthetic_resume_writer");
    return {
      async query(sql, values) {
        if (failure === "write" && /^(INSERT INTO|UPDATE) resumes/.test(sql)) throw Error("Private synthetic resume");
        if (failure === "prune" && sql.startsWith("DELETE FROM resumes")) throw Error("Private synthetic resume");
        if (failure === "commit" && sql === "COMMIT") throw Error("Private synthetic password");
        const result = await client.query(sql, values);
        if (failure === "commit-ack" && sql === "COMMIT") throw Error("Private synthetic lost acknowledgement");
        return result;
      },
      release: discard => client.release(discard || roleApplied),
    };
  },
};
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "@/lib/db/pool") return { pool: websitePool };
  if (id === "next/headers") return { cookies: async () => ({ get: () => context.getStore() ? { value: context.getStore() } : undefined }) };
  if (id === "@/lib/auth") return auth;
  return originalLoad.call(this, id, ...args);
};
let resumes, validation;
try {
  auth = require("../lib/auth.ts");
  resumes = require("../lib/resumes.ts");
  validation = require("../lib/resume-validation.ts");
} finally { Module._load = originalLoad; }
const asUser = callback => context.run(sessionId, callback);
const asOther = callback => context.run(otherSessionId, callback);

before(async () => {
  // Fresh private Unix socket only. Never read DATABASE_URL or use an external database.
  const bin = process.env.ACCOUNT_DELETION_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
  directory = await mkdtemp(path.join(tmpdir(), "retention-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "Disposable PostgreSQL server binaries are required; no live database fallback.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6551", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700"], { stdio: "ignore" });
  server.on("error", () => {});
  const config = { host: directory, port: 6551, user: "synthetic_operator", connectionTimeoutMillis: 500 };
  const admin = new Pool({ ...config, database: "postgres" });
  try {
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      try { await admin.query("SELECT 1"); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert.ok(ready, "Disposable PostgreSQL failed to start.");
    await admin.query(`CREATE DATABASE ${databaseName}`);
  } finally { await admin.end(); }
  pool = new Pool({ ...config, database: databaseName, max: 15 });
  for (const filename of ["001_initial_schema.sql", "002_auth_sessions.sql", "003_rate_limits.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  }
});

after(async () => {
  await pool?.end();
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT"); await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  failure = undefined; connections = 0; useResumeRole = false;
  await pool.query("TRUNCATE public.users, public.jobs, public.abuse_rate_limits CASCADE");
  await pool.query("INSERT INTO users(id,name,email) VALUES ($1,'Synthetic A','a@example.test'),($2,'Synthetic B','b@example.test')", [userId, otherId]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '7 days'),($3,$4,now()+interval '7 days')", [sessionId, userId, otherSessionId, otherId]);
});

async function rows(table) {
  const order = table === "abuse_rate_limits" ? "policy, bucket" : "id";
  return (await pool.query(`SELECT * FROM public.${table} ORDER BY ${order}`)).rows;
}
async function runCleanup(input = options("dry-run"), wrap = client => client) {
  const client = await pool.connect();
  try { return await cleanupExpiredSessions(wrap(client), input); }
  finally { client.release(true); }
}
async function addExpired(count = 3) {
  await pool.query("INSERT INTO sessions(user_id,expires_at) SELECT $1,now()-interval '1 day' FROM generate_series(1,$2::int)", [userId, count]);
}
async function legacy() {
  await pool.query("INSERT INTO resumes(user_id,name,content,updated_at) VALUES ($1,'Older','Old synthetic React',now()-interval '1 day'),($1,'Current','Current synthetic React',now()),($2,'Other','Private other user SQL',now())", [userId, otherId]);
  return asUser(() => resumes.getResume());
}

test("first resume creation and identical retries keep one row, content and stable ID", async () => {
  const content = "React\nTypeScript\n\u{1F680}";
  const created = await asUser(() => resumes.createResume(" First ", content));
  assert.equal(created.name, "First"); assert.equal(created.content, content);
  assert.deepEqual(await asUser(() => resumes.getResume()), created);
  const repeated = await asUser(() => resumes.createResume("First", content));
  assert.equal(repeated.id, created.id); assert.equal((await rows("resumes")).length, 1);
  await assert.rejects(asUser(() => resumes.createResume("Stale create", "different valid content")), /Refresh/);
  assert.deepEqual(await asUser(() => resumes.getResume()), created);
});

test("concurrent first saves serialize across connections instead of creating duplicates", async () => {
  const attempts = await Promise.all(Array.from({ length: 12 }, () => asUser(() => resumes.createResume("First", "React"))));
  assert.equal(new Set(attempts.map(row => row.id)).size, 1);
  assert.equal((await rows("resumes")).length, 1);
  const second = await asOther(() => resumes.createResume("Other", "SQL"));
  assert.notEqual(second.id, attempts[0].id);
});

test("different concurrent first saves never overwrite the winner", async () => {
  const results = await Promise.allSettled(Array.from({ length: 8 }, (_, i) => asUser(() => resumes.createResume(`Synthetic ${i}`, `React ${i}`))));
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const saved = results.find(result => result.status === "fulfilled").value;
  assert.deepEqual(await asUser(() => resumes.getResume()), saved);
  assert.equal((await rows("resumes")).length, 1);
});

test("legacy rows stay on reads; replacement updates the current ID and prunes only its owner's old rows", async () => {
  const current = await legacy();
  const before = await rows("resumes");
  await asUser(() => resumes.getResume()); assert.deepEqual(await rows("resumes"), before);
  const saved = await asUser(() => resumes.updateResume(current.id.toUpperCase(), " Replacement ", "New React\nSQL"));
  assert.equal(saved.id, current.id); assert.equal(saved.name, "Replacement");
  const after = await rows("resumes");
  assert.equal(after.filter(row => row.user_id === userId).length, 1);
  assert.deepEqual(after.filter(row => row.user_id === otherId), before.filter(row => row.user_id === otherId));
});

test("stale legacy IDs, foreign IDs and unauthenticated requests cannot replace or prune", async () => {
  await legacy(); const before = await rows("resumes");
  const old = before.find(row => row.name === "Older"); const foreign = before.find(row => row.user_id === otherId);
  for (const id of [old.id, foreign.id, "00000000-0000-4000-8000-000000000000", "not-a-uuid"]) {
    assert.equal(await asUser(() => resumes.updateResume(id, "Wrong", "React")), null);
  }
  await assert.rejects(resumes.createResume("Wrong", "React"), /Authentication/);
  await assert.rejects(resumes.updateResume(old.id, "Wrong", "React"), /Authentication/);
  assert.deepEqual(await rows("resumes"), before);
});

test("a legacy timestamp tie has a deterministic current row; stale ties cannot prune it", async () => {
  await pool.query("INSERT INTO resumes(id,user_id,name,content,created_at,updated_at) VALUES ('10000000-0000-4000-8000-000000000001',$1,'A','React',now(),now()),('10000000-0000-4000-8000-000000000002',$1,'B','SQL',now(),now())", [userId]);
  assert.equal((await asUser(() => resumes.getResume())).name, "B");
  assert.equal(await asUser(() => resumes.updateResume("10000000-0000-4000-8000-000000000001", "Stale", "React")), null);
  assert.equal((await rows("resumes")).length, 2);
});

test("failed writes, pruning and pre-commit failures roll back and retain all previous resumes", async () => {
  const current = await legacy(); const before = await rows("resumes");
  for (const stage of ["write", "prune", "commit", "connect"]) {
    failure = stage;
    await assert.rejects(asUser(() => resumes.updateResume(current.id, "New", "New valid React")), error => {
      assert.match(error.message, /Refresh/); assert.doesNotMatch(error.message, /Private|password/); return true;
    });
    assert.deepEqual(await rows("resumes"), before);
  }
});

test("first insert failure retains no partial row and an uncertain committed save never claims success", async () => {
  failure = "prune";
  await assert.rejects(asUser(() => resumes.createResume("First", "React")), /uncertain/);
  assert.equal((await rows("resumes")).length, 0);
  failure = "commit-ack";
  await assert.rejects(asUser(() => resumes.createResume("First", "React")), /uncertain/);
  failure = undefined;
  const saved = await asUser(() => resumes.getResume());
  assert.equal(saved.content, "React");
  assert.equal((await asUser(() => resumes.createResume("First", "React"))).id, saved.id);
});

test("content/name limits reject without truncation or writes; oversized legacy text remains readable", async () => {
  const { RESUME_LIMITS, validateResumeFields } = validation;
  assert.deepEqual(validateResumeFields("A", "React"), {});
  assert.ok(validateResumeFields(" ", "\n").name); assert.ok(validateResumeFields(" ", "\n").content);
  assert.ok(validateResumeFields("x".repeat(201), "React").name);
  assert.ok(validateResumeFields("A", "x".repeat(RESUME_LIMITS.content + 1)).content);
  assert.ok(validateResumeFields("A", "\u{1F680}".repeat(25001)).content);
  await assert.rejects(asUser(() => resumes.createResume("A", "x".repeat(50001))), /50,000/);
  assert.equal(connections, 0);
  const boundary = await asUser(() => resumes.createResume("x".repeat(200), "x".repeat(50000)));
  assert.equal(boundary.content.length, 50000);
  await assert.rejects(asUser(() => resumes.updateResume(boundary.id, "A", " ")), /Enter/);
  assert.equal((await asUser(() => resumes.getResume())).content.length, 50000);
  await pool.query("UPDATE resumes SET content=$1 WHERE id=$2", ["x".repeat(50001), boundary.id]);
  assert.equal((await asUser(() => resumes.getResume())).content.length, 50001);
});

test("resume owner locks and pruning work with reviewed role grants and fail safely without them", async () => {
  const current = await legacy();
  await pool.query("CREATE ROLE synthetic_resume_writer");
  await pool.query("GRANT USAGE ON SCHEMA public TO synthetic_resume_writer; GRANT SELECT ON users TO synthetic_resume_writer; GRANT UPDATE(id) ON users TO synthetic_resume_writer; GRANT SELECT, INSERT, UPDATE, DELETE ON resumes TO synthetic_resume_writer");
  useResumeRole = true;
  try {
    assert.equal((await asUser(() => resumes.updateResume(current.id, "New", "React"))).id, current.id);
    const before = await rows("resumes");
    await pool.query("REVOKE DELETE ON resumes FROM synthetic_resume_writer");
    await assert.rejects(asUser(() => resumes.updateResume(current.id, "Denied", "SQL")), /Refresh/);
    assert.deepEqual(await rows("resumes"), before);
    await pool.query("REVOKE UPDATE(id) ON users FROM synthetic_resume_writer");
    await assert.rejects(asUser(() => resumes.updateResume(current.id, "Denied", "SQL")), /Refresh/);
    assert.deepEqual(await rows("resumes"), before);
  } finally {
    useResumeRole = false;
    await pool.query("DROP OWNED BY synthetic_resume_writer; DROP ROLE synthetic_resume_writer");
  }
});

test("cleanup arguments require exact explicit mode, bounded batch and matching confirmation", () => {
  const base = ["--database-name", databaseName];
  assert.deepEqual(parseSessionCleanupArguments([...base, "--dry-run"]), options("dry-run"));
  assert.deepEqual(parseSessionCleanupArguments([...base, "--delete", "--confirm", databaseName, "--batch-size", "1000"]), options("delete", 1000));
  for (const args of [[], base, [...base, "--delete"], [...base, "--delete", "--confirm", "wrong"],
    [...base, "--dry-run", "--confirm", databaseName], [...base, "--dry-run", "--delete"],
    [...base, "--dry-run", "--dry-run"], [...base, "--dry-run", "--database-name", databaseName],
    [...base, "--unknown"], [...base, "--dry-run", "--batch-size"],
    ...["0", "-1", "1001", "1.5", "NaN", "1e2", "Infinity"].map(size => [...base, "--dry-run", "--batch-size", size])]) {
    assert.throws(() => parseSessionCleanupArguments(args));
  }
});

test("dry-run identifies only a bounded expired batch, rolls back and prints no identifiers", async () => {
  await addExpired(5); const before = await rows("sessions");
  assert.deepEqual(await runCleanup(options("dry-run", 2)), { status: "dry-run", eligible: 2, batchSize: 2 });
  assert.deepEqual(await rows("sessions"), before);
  assert.equal((await runCleanup()).eligible, 5);
  assert.doesNotMatch(JSON.stringify(await runCleanup()), /cccccccc|aaaaaaaa/);
});

test("confirmed cleanup removes at most a batch, only expired sessions; active sessions still authenticate", async () => {
  await addExpired(5); const before = await rows("sessions");
  const result = await runCleanup(options("delete", 2));
  assert.deepEqual(result, { status: "expired-sessions-deleted", deleted: 2, batchSize: 2 });
  assert.equal((await rows("sessions")).length, before.length - 2);
  assert.deepEqual((await rows("sessions")).filter(row => row.expires_at > new Date()), before.filter(row => row.expires_at > new Date()));
  assert.equal((await asUser(() => auth.getSession())).userId, userId);
  assert.equal((await asOther(() => auth.getSession())).userId, otherId);
  assert.equal((await runCleanup(options("delete"))).deleted, 3);
  assert.equal((await runCleanup(options("delete"))).deleted, 0);
});

test("cutoff uses the database transaction clock; a session expiring during the run is retained", async () => {
  await pool.query("INSERT INTO sessions(user_id,expires_at) VALUES ($1,now()+interval '1 second')", [userId]);
  const result = await runCleanup(options("delete"), client => ({ async query(sql, values) {
    if (sql.startsWith("WITH expired")) await new Promise(resolve => setTimeout(resolve, 1200));
    return client.query(sql, values);
  } }));
  assert.equal(result.deleted, 0);
  assert.equal((await runCleanup()).eligible, 1);
});

test("concurrent cleanup batches serialize safely and retain all active sessions", async () => {
  await addExpired(5);
  const results = await Promise.all(Array.from({ length: 3 }, () => runCleanup(options("delete", 2))));
  assert.equal(results.reduce((sum, result) => sum + result.deleted, 0), 5);
  assert.equal((await rows("sessions")).length, 2);
});

test("cleanup rolls back after real DELETE failure and redacts raw errors", async () => {
  await addExpired(); const before = await rows("sessions");
  await assert.rejects(runCleanup(options("delete"), client => ({ async query(sql, values) {
    if (sql === "COMMIT") throw Error("Private connection password");
    return client.query(sql, values);
  } })), error => { assert.match(error.message, /uncertain/); assert.doesNotMatch(error.message, /Private|password/); return true; });
  assert.deepEqual(await rows("sessions"), before);
});

test("cleanup transaction-start/storage failures never expose database details or change sessions", async () => {
  await addExpired(); const before = await rows("sessions");
  await assert.rejects(runCleanup(options("delete"), client => ({ async query(sql, values) {
    if (sql === "BEGIN") throw Error("Private synthetic database password");
    return client.query(sql, values);
  } })), error => { assert.match(error.message, /uncertain/); assert.doesNotMatch(error.message, /Private|password/); return true; });
  assert.deepEqual(await rows("sessions"), before);
});

test("uncertain cleanup commit requires fresh inspection, and invalid direct options refuse deletion", async () => {
  await addExpired();
  await assert.rejects(runCleanup(options("delete"), client => ({ async query(sql, values) {
    const result = await client.query(sql, values);
    if (sql === "COMMIT") throw Error("Private lost acknowledgement"); return result;
  } })), /uncertain/);
  assert.equal((await runCleanup()).eligible, 0);
  for (const input of [{ ...options("delete"), confirmation: undefined }, { ...options("delete"), batchSize: 0 }, { ...options("delete"), databaseName: "wrong", confirmation: "wrong" }]) {
    await assert.rejects(runCleanup(input));
  }
  assert.equal((await asUser(() => auth.getSession())).userId, userId);
});

test("cleanup refuses triggers, row security, incoming cascades and disabled constraints", async () => {
  await addExpired(); const before = await rows("sessions");
  await pool.query("ALTER TABLE sessions ENABLE ROW LEVEL SECURITY");
  try { await assert.rejects(runCleanup(options("delete"))); }
  finally { await pool.query("ALTER TABLE sessions DISABLE ROW LEVEL SECURITY"); }
  await pool.query("CREATE TABLE extra_session_data(session_id uuid REFERENCES sessions(id) ON DELETE CASCADE)");
  try { await assert.rejects(runCleanup(options("delete"))); }
  finally { await pool.query("DROP TABLE extra_session_data"); }
  await pool.query("CREATE FUNCTION test_session_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$");
  await pool.query("CREATE TRIGGER test_session_delete BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION test_session_trigger()");
  try { await assert.rejects(runCleanup(options("delete"))); }
  finally { await pool.query("DROP TRIGGER test_session_delete ON sessions; DROP FUNCTION test_session_trigger()"); }
  await pool.query("ALTER TABLE sessions DISABLE TRIGGER ALL");
  try { await assert.rejects(runCleanup(options("delete"))); }
  finally { await pool.query("ALTER TABLE sessions ENABLE TRIGGER ALL"); }
  assert.deepEqual(await rows("sessions"), before);
});

test("least-privileged operator cleanup works; insufficient permissions fail without mutation", async () => {
  await addExpired();
  await pool.query("CREATE ROLE synthetic_cleanup_operator");
  await pool.query("GRANT USAGE ON SCHEMA public TO synthetic_cleanup_operator; GRANT SELECT, DELETE ON public.sessions TO synthetic_cleanup_operator");
  const client = await pool.connect();
  try {
    await client.query("SET ROLE synthetic_cleanup_operator");
    assert.equal((await cleanupExpiredSessions(client, options("delete"))).deleted, 3);
    await pool.query("REVOKE DELETE ON sessions FROM synthetic_cleanup_operator");
    await addExpired();
    await assert.rejects(cleanupExpiredSessions(client, options("delete")), /uncertain/);
    assert.equal((await runCleanup()).eligible, 3);
  } finally {
    client.release(true);
    await pool.query("DROP OWNED BY synthetic_cleanup_operator; DROP ROLE synthetic_cleanup_operator");
  }
});

test("operator CLI requires its dedicated URL and confirmation, outputs only scoped counts", async () => {
  await addExpired(3); const before = await rows("sessions");
  const connection = new URL(`postgresql://synthetic_operator@localhost/${databaseName}`);
  connection.searchParams.set("host", directory); connection.searchParams.set("port", "6551");
  const execute = promisify(execFile);
  const base = ["--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/cleanup-expired-sessions.mjs", "--database-name", databaseName, "--batch-size", "2"];
  const config = { cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH, SESSION_CLEANUP_DATABASE_URL: connection.href }, timeout: 10000 };
  const dry = await execute(process.execPath, [...base, "--dry-run"], config);
  assert.equal(JSON.parse(dry.stdout).eligible, 2); assert.deepEqual(await rows("sessions"), before);
  await assert.rejects(execute(process.execPath, [...base, "--delete"], config));
  await assert.rejects(execute(process.execPath, [...base, "--dry-run"], { ...config, env: { PATH: process.env.PATH, DATABASE_URL: connection.href } }));
  assert.deepEqual(await rows("sessions"), before);
  const deleted = await execute(process.execPath, [...base, "--delete", "--confirm", databaseName], config);
  assert.equal(JSON.parse(deleted.stdout).deleted, 2);
  assert.doesNotMatch(dry.stdout + deleted.stdout, /cccccccc|aaaaaaaa|postgresql:\/\//);
  assert.equal((await runCleanup()).eligible, 1);
});

test("retention operations preserve applications, jobs, accounts and bounded rate-limit state", async () => {
  await pool.query("INSERT INTO jobs(id,source,title,company) VALUES ('10000000-0000-4000-8000-000000000001','demo-board-test','Synthetic','Synthetic')");
  await pool.query("INSERT INTO applications(user_id,job_id,notes) VALUES ($1,'10000000-0000-4000-8000-000000000001','Synthetic note')", [userId]);
  await pool.query("INSERT INTO abuse_rate_limits VALUES ('mcp_analysis',1,1,now()+interval '1 minute')");
  const tables = ["users", "applications", "jobs", "abuse_rate_limits"];
  const before = await Promise.all(tables.map(rows));
  const current = await legacy(); await addExpired();
  await asUser(() => resumes.updateResume(current.id, "New", "React")); await runCleanup(options("delete"));
  assert.deepEqual(await Promise.all(tables.map(rows)), before);
});
