import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { processWebsiteAccount } from "../scripts/account-deletion.ts";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
let directory, server, pool, store, currentUser;
const connectionClosures = [];
const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "@/lib/db/pool") return { pool: { query: (...args) => pool.query(...args), connect: () => pool.connect() } };
  if (id === "@/lib/auth") return { getCurrentUser: async () => currentUser };
  return originalLoad.call(this, id, ...args);
};
let createMonetizationStore, website;
try {
  ({ createMonetizationStore } = require("../lib/monetization/store.ts"));
  website = require("../lib/monetization/current-user.ts");
} finally { Module._load = originalLoad; }

before(async () => {
  // Never load dotenv, DATABASE_URL or any remote connection. Synthetic local
  // cluster only, private Unix socket, TCP disabled, independent of live schema.
  const bin = process.env.ACCOUNT_DELETION_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
  directory = await mkdtemp(path.join(tmpdir(), "monetization-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "Disposable PostgreSQL binaries required; no live database fallback.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6552", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700", "-c", "timezone=Pacific/Auckland"], { stdio: "ignore" });
  server.on("error", () => {});
  pool = new Pool({ host: directory, port: 6552, user: "synthetic_operator", database: "postgres", connectionTimeoutMillis: 500, max: 20 });
  pool.on("connect", client => connectionClosures.push(new Promise(resolve => client.once("end", resolve))));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, "Disposable PostgreSQL failed to start.");
  for (const file of ["001_initial_schema.sql", "002_auth_sessions.sql", "003_rate_limits.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  // Validate upgrade with an existing user, session, and resume, not just an empty schema.
  await pool.query("INSERT INTO users(id,email,password_hash) VALUES ($1,'existing@example.test','synthetic-hash')", [userId]);
  await pool.query("INSERT INTO sessions(user_id,expires_at) VALUES ($1,now()+interval '1 day')", [userId]);
  await pool.query("INSERT INTO resumes(user_id,name,content) VALUES ($1,'Synthetic','Synthetic resume')", [userId]);
  const before = {};
  for (const table of ["users", "sessions", "resumes"]) before[table] = (await pool.query(`SELECT * FROM ${table}`)).rows;
  const migrations = await Promise.all(["004_subscription_entitlements.sql", "005_monthly_usage.sql"].map(file => readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8")));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const sql of migrations) await client.query(sql);
    await client.query("ROLLBACK");
    assert.equal((await client.query("SELECT to_regclass('public.subscription_entitlements') AS relation")).rows[0].relation, null);
    for (const sql of migrations) {
      await client.query("BEGIN"); await client.query(sql); await client.query("COMMIT");
    }
  } finally { client.release(); }
  for (const table of ["users", "sessions", "resumes"]) assert.deepEqual((await pool.query(`SELECT * FROM ${table}`)).rows, before[table]);
  store = createMonetizationStore(pool);
});
beforeEach(async () => {
  await pool.query("TRUNCATE public.users, public.billing_events CASCADE");
  await pool.query("INSERT INTO users(id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')", [userId, otherId]);
  currentUser = { id: userId };
});
after(async () => {
  await pool?.end();
  await Promise.all(connectionClosures);
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT"); await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function subscription(status = "active", start = "now()-interval '1 day'", end = "now()+interval '1 day'") {
  await pool.query(`INSERT INTO subscription_entitlements(user_id,plan,status,current_period_start,current_period_end)
    VALUES ($1,'pro',$2,${start},${end}) ON CONFLICT(user_id) DO UPDATE SET
    plan=EXCLUDED.plan,status=EXCLUDED.status,current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end`, [userId, status]);
}

test("existing users are Free; UTC month snapshot is read-only and tenant scoped", async () => {
  assert.equal((await store.getEntitlement(userId)).plan, "free");
  const snapshot = await store.getMonthlyUsage(userId, "job_analysis");
  const clock = (await pool.query("SELECT to_char(date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS month")).rows[0];
  assert.equal(snapshot.monthStart, clock.month);
  assert.equal(snapshot.used, 0); assert.equal(snapshot.remaining, 3);
  assert.match(snapshot.resetsAt, /^\d{4}-\d{2}-01T00:00:00.000Z$/);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM monthly_usage")).rows[0].count, 0);
  await store.consumeMonthlyUsage(otherId, "job_analysis", 3);
  assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 0);
  assert.equal((await store.getMonthlyUsage(otherId, "job_analysis")).used, 3);
});

test("only current active or trialing Pro periods grant Pro; cancellation at period end preserves active access", async () => {
  for (const status of ["active", "trialing"]) {
    await subscription(status);
    assert.equal((await store.getEntitlement(userId)).plan, "pro");
  }
  await pool.query("UPDATE subscription_entitlements SET cancel_at_period_end=true");
  assert.equal((await store.getEntitlement(userId)).plan, "pro");
  for (const status of ["inactive", "past_due", "canceled", "unpaid", "paused", "expired"]) {
    await subscription(status);
    assert.equal((await store.getEntitlement(userId)).plan, "free");
  }
  await subscription("active", "now()-interval '2 days'", "now()-interval '1 day'");
  assert.equal((await store.getEntitlement(userId)).plan, "free");
  await subscription("active", "now()+interval '1 day'", "now()+interval '2 days'");
  assert.equal((await store.getEntitlement(userId)).plan, "free");
  await subscription("inactive", "NULL", "NULL");
  assert.equal((await store.getEntitlement(userId)).plan, "free");
  await pool.query("UPDATE subscription_entitlements SET plan='free',status='active'");
  assert.equal((await store.getEntitlement(userId)).plan, "free");
});

test("concurrent instances admit exactly Free budget and never increment on denial", async () => {
  const stores = Array.from({ length: 4 }, () => createMonetizationStore(pool));
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => stores[i % 4].consumeMonthlyUsage(userId, "job_analysis")));
  assert.equal(results.filter(result => result.allowed).length, 3);
  const before = (await pool.query("SELECT * FROM monthly_usage")).rows;
  assert.equal((await store.consumeMonthlyUsage(userId, "job_analysis")).allowed, false);
  assert.deepEqual((await pool.query("SELECT * FROM monthly_usage")).rows, before);
  assert.equal(before[0].used, 3);
});

test("concurrent Pro admission stops at its budget and serializes with a locked downgrade", async () => {
  await subscription();
  await store.consumeMonthlyUsage(userId, "job_analysis", 90);
  const results = await Promise.all(Array.from({ length: 30 }, () => store.consumeMonthlyUsage(userId, "job_analysis")));
  assert.equal(results.filter(result => result.allowed).length, 10);
  assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 100);
  await pool.query("DELETE FROM monthly_usage WHERE user_id=$1", [userId]);
  await store.consumeMonthlyUsage(userId, "job_analysis", 3);
  const writer = await pool.connect();
  try {
    await writer.query("BEGIN");
    await writer.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await writer.query("UPDATE subscription_entitlements SET status='past_due' WHERE user_id=$1", [userId]);
    const pending = store.consumeMonthlyUsage(userId, "job_analysis");
    await writer.query("COMMIT");
    const decision = await pending;
    assert.equal(decision.allowed, false); assert.equal(decision.plan, "free");
    assert.equal(decision.used, 3);
  } finally { await writer.query("ROLLBACK"); writer.release(); }
});

test("batched use, upgrades, downgrades and UTC month rollover preserve counters", async () => {
  assert.equal((await store.consumeMonthlyUsage(userId, "job_analysis", 4)).allowed, false);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM monthly_usage")).rows[0].count, 0);
  await store.consumeMonthlyUsage(userId, "job_analysis", 3);
  await subscription();
  const pro = await store.consumeMonthlyUsage(userId, "job_analysis", 97);
  assert.equal(pro.allowed, true); assert.equal(pro.used, 100); assert.equal(pro.remaining, 0);
  assert.equal((await store.consumeMonthlyUsage(userId, "job_analysis")).allowed, false);
  await subscription("past_due");
  const downgraded = await store.consumeMonthlyUsage(userId, "job_analysis");
  assert.equal(downgraded.allowed, false); assert.equal(downgraded.used, 100); assert.equal(downgraded.remaining, 0);
  await pool.query("UPDATE monthly_usage SET month_start=(month_start-interval '1 month')::date");
  const renewed = await store.consumeMonthlyUsage(userId, "job_analysis");
  assert.equal(renewed.allowed, true); assert.equal(renewed.used, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM monthly_usage")).rows[0].count, 2);
});

test("invalid identities, metrics and amounts fail before database access; missing accounts do not get Free", async () => {
  const noDb = createMonetizationStore({ query() { assert.fail("Unexpected query"); }, connect() { assert.fail("Unexpected connect"); } });
  for (const id of [undefined, "", "auth0|subject", "a@example.test", "x' OR true--"]) await assert.rejects(noDb.getEntitlement(id));
  for (const metric of ["__proto__", "anything", null]) await assert.rejects(noDb.consumeMonthlyUsage(userId, metric));
  for (const amount of [0, -1, 1.5, NaN, Infinity, 101, "1"]) await assert.rejects(noDb.consumeMonthlyUsage(userId, "job_analysis", amount));
  const missing = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  await assert.rejects(store.getEntitlement(missing), /unavailable/);
  await assert.rejects(store.consumeMonthlyUsage(missing, "job_analysis"), /could not be confirmed/);
});

test("website helpers use only the authenticated user; unauthenticated and Free Pro checks deny", async () => {
  currentUser = null;
  await assert.rejects(website.getCurrentUserEntitlement(), /Authentication required/);
  await assert.rejects(website.consumeCurrentUserMonthlyUsage("job_analysis"), /Authentication required/);
  await assert.rejects(website.runWithCurrentUserMonthlyUsage("job_analysis", () => assert.fail("Unauthenticated computation")), /Authentication required/);
  currentUser = { id: userId };
  await assert.rejects(website.requireCurrentUserPro(), /Pro subscription required/);
  await subscription();
  assert.equal((await website.requireCurrentUserPro()).plan, "pro");
  await website.consumeCurrentUserMonthlyUsage("job_analysis");
  assert.equal((await website.getCurrentUserMonthlyUsage("job_analysis")).used, 1);
  currentUser = { id: otherId };
  assert.equal((await website.getCurrentUserMonthlyUsage("job_analysis")).used, 0);
  assert.equal((await website.getCurrentUserEntitlement()).plan, "free");
});

test("a failed in-flight match rolls back its reservation before concurrent callers take the last unit", async () => {
  await store.consumeMonthlyUsage(userId, "job_analysis", 2);
  let entered, release;
  const started = new Promise(resolve => { entered = resolve; });
  const gate = new Promise(resolve => { release = resolve; });
  const failed = assert.rejects(store.runWithMonthlyUsage(userId, "job_analysis", async () => {
    entered(); await gate; throw Error("Private synthetic matching text");
  }), error => !/Private|synthetic/.test(error.message));
  await started;
  const pending = Promise.all(Array.from({ length: 5 }, () => store.runWithMonthlyUsage(userId, "job_analysis", () => "completed")));
  try { assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 2); }
  finally { release(); }
  await failed;
  const results = await pending;
  assert.equal(results.filter(result => result.allowed).length, 1);
  assert.equal(results.find(result => result.allowed).value, "completed");
  assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 3);
});

test("billing deduplication is concurrent, provider scoped and atomic with entitlement updates", async () => {
  let callbacks = 0;
  const apply = async client => {
    callbacks++;
    await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE", [userId]);
    await client.query("INSERT INTO subscription_entitlements(user_id,plan,status,current_period_start,current_period_end) VALUES ($1,'pro','active',now(),now()+interval '1 month')", [userId]);
  };
  const results = await Promise.all(Array.from({ length: 20 }, () => store.withBillingEvent("synthetic", "evt_1", apply)));
  assert.equal(callbacks, 1); assert.equal(results.filter(result => !result.duplicate).length, 1);
  assert.equal((await store.getEntitlement(userId)).plan, "pro");
  assert.equal((await store.withBillingEvent("other", "evt_1", async () => {})).duplicate, false);
  await assert.rejects(store.withBillingEvent("synthetic", "evt_failed", async client => {
    await client.query("UPDATE subscription_entitlements SET status='past_due' WHERE user_id=$1", [userId]);
    throw new Error("private payload password");
  }), error => !/private|password/.test(error.message));
  assert.equal((await store.getEntitlement(userId)).plan, "pro");
  assert.equal((await store.withBillingEvent("synthetic", "evt_failed", async () => {})).duplicate, false);
  for (const [provider, id] of [["", "event"], ["x", ""], ["x", "a".repeat(256)], ["x", "secret\n"], ["../x", "event"]]) {
    await assert.rejects(store.withBillingEvent(provider, id, async () => assert.fail("callback must not run")));
  }
});

test("storage failures fail closed, redact errors, roll back writes and release connections", async () => {
  const unavailable = createMonetizationStore({ async query() { throw Error("private connection password"); }, async connect() { throw Error("private connection password"); } });
  for (const operation of [() => unavailable.getEntitlement(userId), () => unavailable.getMonthlyUsage(userId, "job_analysis"), () => unavailable.consumeMonthlyUsage(userId, "job_analysis")]) {
    await assert.rejects(operation(), error => !/private|password/.test(error.message));
  }
  let released = false;
  const faulty = createMonetizationStore({ query: (...args) => pool.query(...args), async connect() {
    const client = await pool.connect();
    return { async query(sql, args) {
      const result = await client.query(sql, args);
      if (sql.includes("RETURNING used")) throw Error("private counter failure");
      return result;
    }, release(discard) { released = true; client.release(discard); } };
  } });
  await assert.rejects(faulty.consumeMonthlyUsage(userId, "job_analysis"));
  assert.equal(released, true);
  assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 0);
  const uncertain = createMonetizationStore({ query: (...args) => pool.query(...args), async connect() {
    const client = await pool.connect();
    return { async query(sql, args) {
      const result = await client.query(sql, args);
      if (sql === "COMMIT") throw Error("private lost commit acknowledgement");
      return result;
    }, release: discard => client.release(discard) };
  } });
  await assert.rejects(uncertain.consumeMonthlyUsage(userId, "job_analysis"), /could not be confirmed/);
  assert.equal((await store.getMonthlyUsage(userId, "job_analysis")).used, 1);
});

test("database constraints reject invalid periods, usage, plans and ownership", async () => {
  for (const sql of [
    "INSERT INTO subscription_entitlements(user_id,plan) VALUES ($1,'enterprise')",
    "INSERT INTO subscription_entitlements(user_id,plan,status) VALUES ($1,'pro','active')",
    "INSERT INTO subscription_entitlements(user_id,current_period_start,current_period_end) VALUES ($1,now(),now()-interval '1 day')",
    "INSERT INTO monthly_usage(user_id,metric,month_start,used) VALUES ($1,'job_analysis','2026-01-01',-1)",
    "INSERT INTO monthly_usage(user_id,metric,month_start) VALUES ($1,'job_analysis','2026-01-02')",
    "INSERT INTO monthly_usage(user_id,metric,month_start) VALUES ($1,'unknown','2026-01-01')",
  ]) await assert.rejects(pool.query(sql, [userId]));
  await assert.rejects(pool.query("INSERT INTO monthly_usage(user_id,metric,month_start) VALUES ($1,'job_analysis','2026-01-01')", ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"]));
});

test("reviewed account deletion handles new cascades and retains minimal billing dedup ledger", async () => {
  await subscription();
  await store.consumeMonthlyUsage(userId, "job_analysis");
  await store.consumeMonthlyUsage(otherId, "job_analysis");
  await store.withBillingEvent("synthetic", "event", async () => {});
  const run = async mode => {
    const client = await pool.connect();
    try { return await processWebsiteAccount(client, { userId, databaseName: "postgres", mode, ...(mode === "delete" ? { confirmation: userId } : {}) }); }
    finally { client.release(true); }
  };
  const dry = await run("dry-run");
  assert.equal(dry.counts.subscription_entitlements, 1); assert.equal(dry.counts.monthly_usage, 1);
  await pool.query("ALTER TABLE monthly_usage ENABLE ROW LEVEL SECURITY");
  try { await assert.rejects(run("delete")); } finally { await pool.query("ALTER TABLE monthly_usage DISABLE ROW LEVEL SECURITY"); }
  // An extra incoming cascade remains forbidden even after adding approved tables.
  await pool.query("CREATE TABLE extra_entitlement_data(user_id uuid REFERENCES subscription_entitlements(user_id) ON DELETE CASCADE)");
  try { await assert.rejects(run("delete")); } finally { await pool.query("DROP TABLE extra_entitlement_data"); }
  assert.equal((await run("delete")).status, "website-database-deleted");
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM monthly_usage WHERE user_id=$1", [userId])).rows[0].count, 0);
  assert.equal((await store.getMonthlyUsage(otherId, "job_analysis")).used, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM billing_events")).rows[0].count, 1);
  assert.equal((await run("delete")).status, "not-found");
});
