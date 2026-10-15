import assert from "node:assert/strict";
import { before, beforeEach, after, test } from "node:test";
import { mkdtemp, readFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";
const bin = process.env.PADDLE_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc", sessionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const pid = (prefix, char = "a") => `${prefix}_${char.repeat(26)}`;
const config = { priceId: pid("pri") };
const now = Date.now(); const start = new Date(now - 86400000).toISOString(), end = new Date(now + 86400000).toISOString();
let directory, server, pool, store, createStore, transactions, subscriptions, failCreate, creates, payments;
const items = [{ quantity: 1, price: { id: config.priceId } }];
const api = {
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
  let ready = false;
  for (let i = 0; i < 100; i++) { try { await pool.query("SELECT 1"); ready = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 100)); } }
  assert.ok(ready);
  for (const file of (await readdir(new URL("../migrations/", import.meta.url))).filter(f => f.endsWith(".sql")).sort())
    await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  const require = createRequire(import.meta.url); require("tsx/cjs"); const Module = require("node:module"), original = Module._load;
  Module._load = function(id, ...args) { if (id === "server-only") return {}; return original.call(this, id, ...args); };
  try { createStore = require("../lib/billing/paddle/store.ts").createPaddleSandboxStore; } finally { Module._load = original; }
});
after(async () => {
  await pool?.end();
  if (server && server.exitCode === null) { const stopped = new Promise(resolve => server.once("exit", resolve)); server.kill("SIGINT"); await stopped; }
  if (directory) await rm(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await pool.query("TRUNCATE public.users,public.billing_events CASCADE");
  await pool.query("INSERT INTO users(id,email) VALUES ($1,'a@example.test'),($2,'b@example.test')", [userA, userB]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')", [sessionA, userA, sessionB, userB]);
  transactions = new Map(); subscriptions = new Map(); payments = new Map(); failCreate = false; creates = 0;
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
