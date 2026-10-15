import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { createHmac } from "node:crypto";
const bin = process.env.PADDLE_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", sessionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const pid = (prefix, char = "a") => `${prefix}_${char.repeat(26)}`;
const config = { priceId: pid("pri") };
const now = Date.now(); const start = new Date(now - 86400000).toISOString(), end = new Date(now + 86400000).toISOString();
let directory, server, pool, store, createStore, transactions, subscriptions, failCreate, creates, payments, adjustments, verifyWebhook, createMonetizationStore;
const connectionClosures = [];
const items = [{ quantity: 1, price: { id: config.priceId } }];
const api = {
  adjustments: async transactionId => [...adjustments.values()].filter(a => a.transaction_id === transactionId),
  adjustment: async id => { if (!adjustments.has(id)) throw new Error("Unavailable"); return adjustments.get(id); },
  verifyPrice: async () => {},
  createCheckout: async intent => {
    creates++; if (failCreate) throw new Error("Uncertain provider outcome");
    const id = pid("txn", creates === 1 ? "a" : "b");
    transactions.set(id, { id, status: "draft", items, customer_id: null, subscription_id: null, currency_code: "USD", billing_period: null, custom_data: { link_intent: intent } });
    return id;
  },
  transaction: async id => { if (!transactions.has(id)) throw new Error("Unavailable"); return transactions.get(id); },
  subscription: async id => { if (!subscriptions.has(id)) throw new Error("Unavailable"); return subscriptions.get(id); },
  latestCompleted: async id => payments.get(id) ?? null,
};
const event = (type = "subscription.activated", char = "a", id = pid("sub"), custom_data) => ({ event_id: pid("evt", char), event_type: type, occurred_at: new Date().toISOString(), data: { id, ...(custom_data ? { custom_data } : {}) } });
before(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "paddle-sandbox-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "Disposable PostgreSQL binaries required; no live database fallback.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6554", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700"], { stdio: "ignore" });
  server.on("error", () => {});
  pool = new Pool({ host: directory, port: 6554, user: "synthetic_operator", database: "postgres", connectionTimeoutMillis: 500 });
  pool.on("connect", client => connectionClosures.push(new Promise(resolve => client.once("end", resolve))));
  let ready = false;
  for (let i = 0; i < 100; i++) { try { await pool.query("SELECT 1"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  assert.ok(ready);
  for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort())
    await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const require = createRequire(import.meta.url); require("tsx/cjs"); const Module = require("node:module"), original = Module._load;
  Module._load = function(id, ...args) { if (id === "server-only") return {}; return original.call(this, id, ...args); };
  try {
    createStore = require("../lib/billing/paddle/store.ts").createPaddleSandboxStore;
    verifyWebhook = require("../lib/billing/paddle/protocol.ts").verifyPaddleWebhook;
    createMonetizationStore = require("../lib/monetization/store.ts").createMonetizationStore;
  } finally { Module._load = original; }
});
after(async () => {
  await pool?.end();
  await Promise.all(connectionClosures);
  if (server && server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGINT"); await stopped; }
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query("TRUNCATE public.users,public.billing_events CASCADE");
  await pool.query("INSERT INTO users(id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')", [userA, userB]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')", [sessionA, userA, sessionB, userB]);
  transactions = new Map(); subscriptions = new Map(); payments = new Map(); adjustments = new Map(); failCreate = false; creates = 0;
  store = createStore(pool, config, api);
});
async function completed(userId = userA, sessionId = sessionA, char = "a") {
  const transactionId = await store.checkout(userId, sessionId);
  const original = transactions.get(transactionId);
  const subscriptionId = pid("sub", char), customerId = pid("ctm", char);
  Object.assign(original, { status: "completed", subscription_id: subscriptionId, customer_id: customerId, billing_period: { starts_at: start, ends_at: end } });
  subscriptions.set(subscriptionId, { id: subscriptionId, customer_id: customerId, status: "active", updated_at: start, items,
    current_billing_period: original.billing_period, scheduled_change: null, custom_data: original.custom_data });
  payments.set(subscriptionId, original);
  return { original, subscription: subscriptions.get(subscriptionId) };
}
test("retries and concurrent duplicate deliveries commit one ledger row and no entitlements", async () => {
  const { original } = await completed(); const e = event("subscription.activated", "a", pid("sub"), original.custom_data);
  const results = await Promise.all(Array.from({ length: 6 }, () => store.processEvent(e)));
  assert.equal(results.filter(r => r.duplicate === false).length, 1);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM billing_events")).rows[0].count, 1);
  assert.equal((await store.status(userA)).subscriptionStatus, "active");
  assert.equal((await pool.query("SELECT * FROM subscription_entitlements")).rowCount, 0);
  assert.equal((await pool.query("SELECT * FROM monthly_usage")).rowCount, 0);
});
test("cross-account hints and conflicting subscriptions cannot reassign ownership", async () => {
  const a = await completed(); const b = await completed(userB, sessionB, "b");
  await store.processEvent(event("subscription.created", "a", a.subscription.id, a.original.custom_data));
  await assert.rejects(store.processEvent(event("subscription.updated", "b", a.subscription.id, b.original.custom_data)));
  subscriptions.set(pid("sub", "c"), { ...a.subscription, id: pid("sub", "c") });
  await assert.rejects(store.processEvent(event("subscription.created", "c", pid("sub", "c"), a.original.custom_data)));
  assert.equal((await store.status(userB)).subscriptionStatus, null);
  assert.equal(await store.acceptsCheckout(userB, a.original.id), false);
  assert.equal((await pool.query("SELECT subscription_id FROM paddle_sandbox_accounts WHERE user_id=$1", [userA])).rows[0].subscription_id, a.subscription.id);
});
test("old events reconcile current state and stale API snapshots cannot undo cancellation", async () => {
  const { original, subscription } = await completed();
  await store.processEvent(event("subscription.created", "a", subscription.id, original.custom_data));
  const old = { ...subscription };
  Object.assign(subscription, { status: "canceled", updated_at: new Date(now).toISOString(), current_billing_period: null });
  await store.processEvent(event("subscription.canceled", "b", subscription.id));
  await store.processEvent({ ...event("subscription.activated", "c", subscription.id), occurred_at: start });
  assert.equal((await store.status(userA)).subscriptionStatus, "canceled");
  subscriptions.set(subscription.id, old);
  await assert.rejects(store.processEvent(event("subscription.updated", "d", subscription.id)));
  assert.equal((await store.status(userA)).subscriptionStatus, "canceled");
  assert.equal((await pool.query("SELECT 1 FROM billing_events WHERE event_id=$1", [pid("evt", "d")])).rowCount, 0);
});
test("payment failure only retains the verified old paid-through period and API failures roll back event receipt", async () => {
  const { original, subscription } = await completed();
  await store.processEvent(event("subscription.created", "a", subscription.id, original.custom_data));
  subscription.status = "past_due"; subscription.updated_at = new Date(now).toISOString();
  await store.processEvent({ ...event("transaction.payment_failed", "b", original.id), data: { id: original.id, subscription_id: subscription.id } });
  const status = await store.status(userA); assert.equal(status.subscriptionStatus, "past_due"); assert.equal(status.paidThrough, end);
  subscriptions.delete(subscription.id);
  await assert.rejects(store.processEvent(event("subscription.updated", "c", subscription.id)));
  assert.equal((await pool.query("SELECT 1 FROM billing_events WHERE event_id=$1", [pid("evt", "c")])).rowCount, 0);
});
test("uncertain checkout creation cannot be retried into a second subscription and sessions are owner scoped", async () => {
  await assert.rejects(store.checkout(userA, sessionB)); assert.equal(creates, 0);
  failCreate = true; await assert.rejects(store.checkout(userA, sessionA));
  await assert.rejects(store.checkout(userA, sessionA)); assert.equal(creates, 1);
  assert.equal((await store.status(userA)).checkoutState, "creating");
});
test("manual reconciliation is owner scoped; user deletion cascades sandbox mapping only", async () => {
  const a = await completed(); const b = await completed(userB, sessionB, "b");
  await store.reconcileUser(userA, sessionA);
  assert.equal((await store.status(userA)).subscriptionStatus, "active");
  assert.equal((await store.status(userB)).subscriptionStatus, null);
  await assert.rejects(store.reconcileUser(userA, sessionB));
  await pool.query("DELETE FROM users WHERE id=$1", [userA]);
  assert.equal(await store.status(userA), null); assert.ok(await store.status(userB));
  assert.ok(a.original && b.original);
});

test("early activation retries after payment completion; replay cannot overwrite a later reconciliation", async () => {
  const { original, subscription } = await completed();
  const activation = event("subscription.activated", "a", subscription.id, original.custom_data);
  original.status = "paid";
  await assert.rejects(store.processEvent(activation));
  assert.equal((await pool.query("SELECT * FROM billing_events")).rowCount, 0);
  original.status = "completed";
  await store.processEvent(activation);
  subscription.status = "canceled";
  subscription.updated_at = new Date(now).toISOString();
  await store.reconcileUser(userA, sessionA);
  assert.deepEqual(await store.processEvent(activation), { duplicate: true });
  assert.equal((await store.status(userA)).subscriptionStatus, "canceled");
});

test("distinct concurrent events serialize canonical reads; expired sessions cannot create checkout", async () => {
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [sessionB]);
  await assert.rejects(store.checkout(userB, sessionB));
  assert.equal(creates, 0);
  const { original, subscription } = await completed();
  await Promise.all(["a", "b", "c"].map(char => store.processEvent(event("subscription.updated", char, subscription.id, original.custom_data))));
  assert.equal((await pool.query("SELECT * FROM billing_events")).rowCount, 3);
  assert.equal((await store.status(userA)).subscriptionStatus, "active");
  assert.equal((await pool.query("SELECT * FROM subscription_entitlements")).rowCount, 0);
});

test("signed raw webhook verification gates database writes and replays deduplicate", async () => {
  const { original, subscription } = await completed();
  const raw = Buffer.from(JSON.stringify(event("subscription.activated", "a", subscription.id, original.custom_data)));
  const secret = "synthetic-webhook-secret-only";
  const ts = Math.floor(Date.now() / 1000);
  const sign = timestamp => `ts=${timestamp};h1=${createHmac("sha256", secret).update(`${timestamp}:`).update(raw).digest("hex")}`;
  for (const header of [null, "forged", sign(ts - 60), sign(ts + 60)])
    assert.throws(() => verifyWebhook(raw, header, secret));
  assert.equal((await pool.query("SELECT * FROM billing_events")).rowCount, 0);
  const verified = verifyWebhook(raw, sign(ts), secret);
  await store.processEvent(verified);
  assert.deepEqual(await store.processEvent(verified), { duplicate: true });
  assert.equal((await pool.query("SELECT * FROM billing_events")).rowCount, 1);
  assert.equal((await pool.query("SELECT * FROM subscription_entitlements")).rowCount, 0);
});

test("renewal payment watermark is independent of subscription version and cannot regress", async () => {
  const { original, subscription } = await completed();
  await store.reconcileUser(userA, sessionA);
  const renewal = { ...original, id: pid("txn", "r"), billing_period: { starts_at: new Date(now - 3600000).toISOString(), ends_at: new Date(now + 30 * 86400000).toISOString() } };
  transactions.set(renewal.id, renewal); payments.set(subscription.id, renewal);
  await store.processEvent({ ...event("transaction.completed", "r", renewal.id), data: { id: renewal.id, subscription_id: subscription.id } });
  assert.equal((await store.status(userA)).paidThrough, renewal.billing_period.ends_at);
  payments.set(subscription.id, original);
  await assert.rejects(store.processEvent(event("subscription.updated", "s", subscription.id)));
  assert.equal((await pool.query("SELECT * FROM billing_events WHERE event_id=$1", [pid("evt", "s")])).rowCount, 0);
  assert.equal((await store.status(userA)).paidThrough, renewal.billing_period.ends_at);
});

test("refund approval revokes preview, stale reads cannot restore it, new paid period can", async () => {
  const { original, subscription } = await completed();
  await store.reconcileUser(userA, sessionA);
  const refund = { id: pid("adj"), transaction_id: original.id, subscription_id: subscription.id, customer_id: subscription.customer_id, action: "refund", status: "pending_approval" };
  adjustments.set(refund.id, refund);
  await store.processEvent(event("adjustment.created", "a", refund.id));
  assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  refund.status = "approved";
  await store.processEvent(event("adjustment.updated", "b", refund.id));
  assert.equal((await store.status(userA)).sandboxAccessPreview, "free");
  adjustments.clear(); // Simulate a stale replica or reversal: no automatic restoration.
  await store.reconcileUser(userA, sessionA);
  assert.equal((await store.status(userA)).paymentRevoked, true);
  const renewal = { ...original, id: pid("txn", "r"), billing_period: { starts_at: new Date(now - 3600000).toISOString(), ends_at: new Date(now + 30 * 86400000).toISOString() } };
  transactions.set(renewal.id, renewal); payments.set(subscription.id, renewal);
  await store.reconcileUser(userA, sessionA);
  assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  assert.equal((await store.status(userA)).paymentRevoked, false);
  assert.equal((await pool.query("SELECT * FROM subscription_entitlements")).rowCount, 0);
});

test("refund relationship forgery cannot affect either account", async () => {
  const a = await completed(), b = await completed(userB, sessionB, "b");
  await store.reconcileUser(userA, sessionA); await store.reconcileUser(userB, sessionB);
  const refund = { id: pid("adj"), transaction_id: a.original.id, subscription_id: b.subscription.id, customer_id: b.subscription.customer_id, action: "refund", status: "approved" };
  adjustments.set(refund.id, refund);
  await assert.rejects(store.processEvent(event("adjustment.created", "a", refund.id)));
  assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  assert.equal((await store.status(userB)).sandboxAccessPreview, "pro");
  assert.equal((await pool.query("SELECT * FROM billing_events")).rowCount, 0);
});

test("batch retries are bounded and isolated; successful manual reconciliation recovers exhaustion", async () => {
  const a = await completed(), b = await completed(userB, sessionB, "b");
  subscriptions.delete(a.subscription.id);
  let result = await store.reconcileBatch();
  assert.equal(result.retry, 1); assert.equal(result.ok, 1);
  assert.equal((await store.status(userB)).subscriptionStatus, "active");
  assert.equal((await store.reconcileBatch()).selected, 0); // Backoff is enforced.
  for (let attempt = 2; attempt <= 3; attempt++) {
    await pool.query("UPDATE paddle_sandbox_accounts SET next_reconcile_at=now()-interval '1 second' WHERE user_id=$1", [userA]);
    result = await store.reconcileBatch(); assert.equal(result[attempt === 3 ? "exhausted" : "retry"], 1);
  }
  await pool.query("UPDATE paddle_sandbox_accounts SET next_reconcile_at=now()-interval '1 second'");
  result = await store.reconcileBatch(); assert.equal(result.selected, 1); // Exhausted A isn't retried.
  assert.equal(result.blocked, 1); // Remains visible even when excluded from work.
  subscriptions.set(a.subscription.id, a.subscription);
  await store.reconcileUser(userA, sessionA);
  const row = (await pool.query("SELECT * FROM paddle_sandbox_accounts WHERE user_id=$1", [userA])).rows[0];
  assert.equal(row.reconcile_attempts, 0); assert.equal(row.last_reconcile_result, "ok");
  assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  assert.ok(b.original);
  await assert.rejects(store.reconcileBatch(11));
});

test("concurrent batch workers do not reconcile the same account twice", async () => {
  await completed();
  const results = await Promise.all([store.reconcileBatch(), store.reconcileBatch()]);
  assert.equal(results.reduce((sum, result) => sum + result.ok, 0), 1);
  assert.equal((await store.status(userA)).subscriptionStatus, "active");
});

test("paid-through policy transitions expire without webhook; real entitlements stay disconnected", async () => {
  const { original, subscription } = await completed();
  await store.reconcileUser(userA, sessionA);
  for (const [index, status] of ["past_due", "canceled"].entries()) {
    subscription.status = status; subscription.updated_at = new Date(now + index).toISOString();
    await store.reconcileUser(userA, sessionA);
    assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  }
  // Advance the persisted verified period into the past; no delivery required.
  await pool.query("UPDATE paddle_sandbox_accounts SET paid_start=now()-interval '2 days',paid_through=now()-interval '1 second' WHERE user_id=$1", [userA]);
  assert.equal((await store.status(userA)).sandboxAccessPreview, "free");
  assert.equal((await pool.query("SELECT * FROM subscription_entitlements")).rowCount, 0);
  assert.equal((await createMonetizationStore(pool).getEntitlement(userA)).plan, "free");
  assert.ok(original);
});

test("isolated entitlement fixtures validate Free 3 / Pro 100 and downgrade without resetting usage", async () => {
  const { subscription } = await completed(); await store.reconcileUser(userA, sessionA);
  const meter = createMonetizationStore(pool);
  assert.equal((await meter.consumeMonthlyUsage(userB, "job_analysis", 3)).allowed, true);
  assert.equal((await meter.consumeMonthlyUsage(userB, "job_analysis")).allowed, false);
  assert.equal((await meter.getEntitlement(userA)).plan, "free");
  assert.equal((await store.status(userA)).sandboxAccessPreview, "pro");
  // Test-only fixture, NOT an application activation path or Paddle e2e proof.
  await pool.query(`INSERT INTO subscription_entitlements(user_id,plan,status,current_period_start,current_period_end)
    SELECT user_id,'pro','active',paid_start,paid_through FROM paddle_sandbox_accounts WHERE user_id=$1`, [userA]);
  assert.equal((await meter.consumeMonthlyUsage(userA, "job_analysis", 100)).allowed, true);
  assert.equal((await meter.consumeMonthlyUsage(userA, "job_analysis")).allowed, false);
  assert.equal((await meter.getMonthlyUsage(userA, "job_analysis")).limit, 100);
  await pool.query("UPDATE subscription_entitlements SET status='expired' WHERE user_id=$1", [userA]);
  const usage = await meter.getMonthlyUsage(userA, "job_analysis");
  assert.equal(usage.plan, "free"); assert.equal(usage.limit, 3); assert.equal(usage.used, 100);
  assert.equal((await meter.getMonthlyUsage(userB, "job_analysis")).used, 3);
  assert.ok(subscription);
});

test("004-009 migrate an existing 001-003 database transactionally without backfills", async () => {
  await pool.query("CREATE DATABASE paddle_sandbox_migration_test");
  const isolated = new Pool({ host: directory, port: 6554, user: "synthetic_operator", database: "paddle_sandbox_migration_test" });
  try {
    const files = (await readdir(new URL("../migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort();
    for (const file of files.slice(0, 3)) await isolated.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
    await isolated.query("INSERT INTO users(id,email) VALUES ($1,'existing@example.test')", [userA]);
    await isolated.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day')", [sessionA, userA]);
    const users = (await isolated.query("SELECT * FROM users")).rows;
    const sessions = (await isolated.query("SELECT * FROM sessions")).rows;
    const connection = await isolated.connect();
    try {
      for (const file of files.slice(3)) {
        await connection.query("BEGIN");
        await connection.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
        await connection.query("COMMIT");
      }
    } finally { connection.release(); }
    assert.deepEqual((await isolated.query("SELECT * FROM users")).rows, users);
    assert.deepEqual((await isolated.query("SELECT * FROM sessions")).rows, sessions);
    for (const table of ["subscription_entitlements", "monthly_usage", "billing_events", "external_identities", "account_link_transactions", "paddle_sandbox_accounts"])
      assert.equal((await isolated.query(`SELECT * FROM ${table}`)).rowCount, 0);
    assert.equal((await createMonetizationStore(isolated).getEntitlement(userA)).plan, "free");
    await assert.rejects(isolated.query("INSERT INTO paddle_sandbox_accounts(user_id,reconcile_attempts) VALUES ($1,4)", [userA]));
    await isolated.query("INSERT INTO paddle_sandbox_accounts(user_id) VALUES ($1)", [userA]);
    await isolated.query("DELETE FROM users WHERE id=$1", [userA]);
    assert.equal((await isolated.query("SELECT * FROM paddle_sandbox_accounts")).rowCount, 0);
  } finally { await isolated.end(); await pool.query("DROP DATABASE paddle_sandbox_migration_test"); }
});
