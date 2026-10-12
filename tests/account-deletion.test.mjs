import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile, spawn, spawnSync } from "node:child_process";
import { promisify } from "node:util";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { parseDeletionArguments, processWebsiteAccount } from "../scripts/account-deletion.ts";

// Never accept a DATABASE_URL or a test connection string. Every run creates a
// fresh cluster on a private temporary Unix socket with TCP disabled.
const bin = process.env.ACCOUNT_DELETION_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const jobId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const databaseName = "account_deletion_synthetic_test";
const options = mode => ({ userId, databaseName, mode, ...(mode === "delete" ? { confirmation: userId } : {}) });
let directory, server, pool;

before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "account-deletion-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "A working PostgreSQL server distribution is required; no external database fallback is permitted.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6549", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700"], { stdio: "ignore" });
  server.on("error", () => {});
  const config = { host: directory, port: 6549, user: "synthetic_operator", connectionTimeoutMillis: 500 };
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
  pool = new Pool({ ...config, database: databaseName });
  for (const filename of ["001_initial_schema.sql", "002_auth_sessions.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  }
});

after(async () => {
  await pool?.end();
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT");
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query("TRUNCATE public.users, public.jobs CASCADE");
  await pool.query("INSERT INTO users(id,name,email,password_hash) VALUES ($1,'Synthetic A','a@example.test','synthetic-hash'),($2,'Synthetic B','b@example.test','other-hash')", [userId, otherId]);
  await pool.query("INSERT INTO jobs(id,source,title,company) VALUES ($1,'demo-board-test','Synthetic Job','Synthetic Co')", [jobId]);
  for (const owner of [userId, otherId]) {
    await pool.query("INSERT INTO resumes(user_id,name,content) VALUES ($1,'Synthetic','Private synthetic resume'),($1,'Older','Old synthetic resume')", [owner]);
    await pool.query("INSERT INTO applications(user_id,job_id,notes,applied_at) VALUES ($1,$2,'Private synthetic notes',now())", [owner, jobId]);
  }
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day'),(gen_random_uuid(),$2,now()-interval '1 day'),(gen_random_uuid(),$3,now()+interval '1 day')", [sessionId, userId, otherId]);
});

async function run(input) {
  const client = await pool.connect();
  try { return await processWebsiteAccount(client, input); }
  finally { client.release(true); }
}

async function snapshot() {
  const rows = {};
  for (const table of ["users", "resumes", "applications", "sessions", "jobs"]) {
    rows[table] = (await pool.query(`SELECT * FROM public.${table} ORDER BY id`)).rows;
  }
  return rows;
}

test("strict arguments reject invalid UUIDs, missing/mismatched confirmation and ambiguous options", async () => {
  const valid = ["--user-id", userId, "--database-name", databaseName];
  assert.deepEqual(parseDeletionArguments([...valid, "--dry-run"]), options("dry-run"));
  assert.deepEqual(parseDeletionArguments([...valid, "--delete", "--confirm", userId]), options("delete"));
  for (const args of [[], [...valid], [...valid, "--delete"], [...valid, "--delete", "--confirm", otherId],
    [...valid, "--dry-run", "--delete"], [...valid, "--dry-run", "--dry-run"],
    [...valid, "--dry-run", "--confirm", userId], [...valid, "--dry-run", "--user-id", userId],
    [...valid, "--dry-run", "--unknown"], ["--user-id", "--dry-run"],
    ["--user-id", "not-a-uuid", "--database-name", databaseName, "--dry-run"],
    ["--user-id", userId.toUpperCase(), "--database-name", databaseName, "--dry-run"]]) {
    assert.throws(() => parseDeletionArguments(args));
  }
  await assert.rejects(run({ userId, databaseName, mode: "delete" }));
  await assert.rejects(run({ ...options("dry-run"), userId: "invalid" }));
});

test("dry-run reports only counts and does not mutate any records", async () => {
  const before = await snapshot();
  const result = await run(options("dry-run"));
  assert.deepEqual(result, { status: "dry-run", counts: { users: 1, resumes: 2, applications: 1, sessions: 2 } });
  assert.doesNotMatch(JSON.stringify(result), /Private|synthetic-hash|cccccccc/);
  assert.deepEqual(await snapshot(), before);
});

test("deletion removes every owned row, preserves other users and jobs, and safely repeats", async () => {
  const before = await snapshot();
  assert.equal((await run(options("delete"))).status, "website-database-deleted");
  const after = await snapshot();
  for (const table of ["users", "resumes", "applications", "sessions"]) {
    assert.deepEqual(after[table], before[table].filter(row => table === "users" ? row.id !== userId : row.user_id !== userId));
  }
  assert.deepEqual(after.jobs, before.jobs);
  assert.deepEqual(await run(options("delete")), { status: "not-found", counts: { users: 0, resumes: 0, applications: 0, sessions: 0 } });
  assert.deepEqual(await snapshot(), after);
});

test("existing website session lookup no longer authenticates a deleted account", async () => {
  const require = createRequire(import.meta.url);
  require("tsx/cjs");
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(id, ...args) {
    if (id === "server-only") return {};
    if (id === "next/headers") return { cookies: async () => ({ get: () => ({ value: sessionId }) }) };
    if (id === "@/lib/db/pool") return { pool };
    return originalLoad.call(this, id, ...args);
  };
  let auth;
  try { auth = require("../lib/auth.ts"); } finally { Module._load = originalLoad; }
  assert.equal((await auth.getSession()).userId, userId);
  await run(options("delete"));
  assert.equal(await auth.getSession(), null);
  assert.equal(await auth.getCurrentUser(), null);
});

test("a transaction failure after DELETE rolls back and never exposes sensitive pg errors", async () => {
  const before = await snapshot();
  const client = await pool.connect();
  let deleted = false;
  const wrapped = { async query(sql, values) {
    if (deleted && sql.startsWith("SELECT")) throw new Error("Private synthetic resume synthetic-hash");
    const result = await client.query(sql, values);
    if (sql.startsWith("DELETE FROM")) deleted = true;
    return result;
  } };
  try { await assert.rejects(processWebsiteAccount(wrapped, options("delete")), error => !/Private|synthetic-hash/.test(error.message)); }
  finally { client.release(true); }
  assert.equal(deleted, true, "Failure must be injected after the real DELETE.");
  assert.deepEqual(await snapshot(), before);
});

test("uncertain commit is reported as failure and a fresh dry-run establishes the database outcome", async () => {
  const client = await pool.connect();
  const wrapped = { async query(sql, values) {
    const result = await client.query(sql, values);
    if (sql === "COMMIT") throw new Error("Synthetic lost commit acknowledgement");
    return result;
  } };
  try { await assert.rejects(processWebsiteAccount(wrapped, options("delete")), /outcome could not be confirmed/); }
  finally { client.release(true); }
  assert.deepEqual((await run(options("dry-run"))).counts, { users: 0, resumes: 0, applications: 0, sessions: 0 });
  assert.equal((await run(options("delete"))).status, "not-found");
});

test("database mismatch, unexpected cascades and unvalidated constraints fail closed", async () => {
  const before = await snapshot();
  await assert.rejects(run({ ...options("delete"), databaseName: "wrong_database" }));
  await pool.query("CREATE TABLE public.extra_personal_data(user_id uuid REFERENCES public.users(id) ON DELETE CASCADE)");
  try { await assert.rejects(run(options("delete"))); }
  finally { await pool.query("DROP TABLE public.extra_personal_data"); }
  await pool.query("ALTER TABLE public.sessions DROP CONSTRAINT sessions_user_id_fkey");
  try {
    await pool.query("ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE CASCADE NOT VALID");
    await assert.rejects(run(options("delete")));
    await pool.query("ALTER TABLE public.sessions DROP CONSTRAINT sessions_user_id_fkey");
    await pool.query("ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE RESTRICT");
    await assert.rejects(run(options("delete")));
  } finally {
    await pool.query("ALTER TABLE public.sessions DROP CONSTRAINT IF EXISTS sessions_user_id_fkey");
    await pool.query("ALTER TABLE public.sessions ADD CONSTRAINT sessions_user_id_fkey FOREIGN KEY(user_id) REFERENCES public.users(id) ON DELETE CASCADE");
  }
  assert.deepEqual(await snapshot(), before);
});

test("row security and custom deletion triggers prevent operation", async () => {
  const before = await snapshot();
  await pool.query("ALTER TABLE public.resumes ENABLE ROW LEVEL SECURITY");
  try { await assert.rejects(run(options("delete"))); }
  finally { await pool.query("ALTER TABLE public.resumes DISABLE ROW LEVEL SECURITY"); }
  await pool.query("CREATE FUNCTION public.test_delete_trigger() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN OLD; END $$");
  await pool.query("CREATE TRIGGER test_delete BEFORE DELETE ON public.users FOR EACH ROW EXECUTE FUNCTION public.test_delete_trigger()");
  try { await assert.rejects(run(options("delete"))); }
  finally { await pool.query("DROP TRIGGER test_delete ON public.users; DROP FUNCTION public.test_delete_trigger()"); }
  assert.deepEqual(await snapshot(), before);
});

test("operator role works without superuser and disabled FK triggers are rejected", async () => {
  await pool.query("CREATE ROLE synthetic_deletion_operator");
  await pool.query("GRANT USAGE ON SCHEMA public TO synthetic_deletion_operator; GRANT SELECT ON public.users,public.resumes,public.applications,public.sessions,public.jobs TO synthetic_deletion_operator; GRANT DELETE ON public.users,public.resumes,public.applications,public.sessions TO synthetic_deletion_operator");
  const client = await pool.connect();
  try {
    await client.query("SET ROLE synthetic_deletion_operator");
    assert.equal((await processWebsiteAccount(client, options("delete"))).status, "website-database-deleted");
  } finally {
    client.release(true);
    await pool.query("DROP OWNED BY synthetic_deletion_operator; DROP ROLE synthetic_deletion_operator");
  }
  await pool.query("ALTER TABLE public.sessions DISABLE TRIGGER ALL");
  try { await assert.rejects(run({ ...options("delete"), userId: otherId, confirmation: otherId })); }
  finally { await pool.query("ALTER TABLE public.sessions ENABLE TRIGGER ALL"); }
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM users WHERE id=$1", [otherId])).rows[0].count, 1);
});

test("CLI dry-run and confirmed deletion print only counts and accurately scoped results", async () => {
  const connection = new URL(`postgresql://synthetic_operator@localhost/${databaseName}`);
  connection.searchParams.set("host", directory);
  connection.searchParams.set("port", "6549");
  const execute = promisify(execFile);
  const base = ["--experimental-strip-types", "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON", "scripts/delete-website-account.mjs", "--user-id", userId, "--database-name", databaseName];
  const config = { cwd: new URL("..", import.meta.url), env: { PATH: process.env.PATH, ACCOUNT_DELETION_DATABASE_URL: connection.href }, timeout: 10000 };
  const before = await snapshot();
  const dry = await execute(process.execPath, [...base, "--dry-run"], config);
  assert.equal(JSON.parse(dry.stdout.split("\n")[0]).status, "dry-run");
  assert.deepEqual(await snapshot(), before);
  await assert.rejects(execute(process.execPath, [...base, "--delete"], config), error => {
    assert.match(error.stderr, /refused or failed/);
    assert.doesNotMatch(error.stderr, /synthetic-hash|Private|cccccccc|postgresql:\/\//);
    return true;
  });
  assert.deepEqual(await snapshot(), before);
  const deleted = await execute(process.execPath, [...base, "--delete", "--confirm", userId], config);
  assert.equal(JSON.parse(deleted.stdout.split("\n")[0]).status, "website-database-deleted");
  for (const result of [dry, deleted]) {
    assert.match(result.stdout, /Website database scope only/);
    assert.doesNotMatch(result.stdout + result.stderr, /Private|synthetic-hash|cccccccc|postgresql:\/\//);
  }
});
