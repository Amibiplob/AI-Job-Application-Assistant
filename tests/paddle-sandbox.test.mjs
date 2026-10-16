import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { spawnSync } from "node:child_process";
const require = createRequire(import.meta.url); require("tsx/cjs");
const Module = require("node:module"); const original = Module._load;
Module._load = function(id, ...args) { if (id === "server-only") return {}; return original.call(this, id, ...args); };
let protocol, getConfig, clientFactory, getWorkerConfig, entitlementGate;
try {
  protocol = require("../lib/billing/paddle/protocol.ts");
  getConfig = require("../lib/billing/paddle/config.ts").getPaddleSandboxConfig;
  entitlementGate = require("../lib/billing/paddle/config.ts").sandboxEntitlementsEnabled;
  clientFactory = require("../lib/billing/paddle/client.ts").createPaddleSandboxClient;
  getWorkerConfig = require("../lib/billing/paddle/worker-config.ts").getSandboxWorkerConfig;
} finally { Module._load = original; }
const pid = (prefix, char = "a") => `${prefix}_${char.repeat(26)}`;
const env = { PADDLE_SANDBOX_ENABLED: "true", BILLING_DEPLOYMENT_ENV: "sandbox", PADDLE_SANDBOX_API_KEY: `pdl_sdbx_apikey_${"k".repeat(32)}`,
  PADDLE_SANDBOX_WEBHOOK_SECRET: "secret-for-synthetic-testing-only-32", PADDLE_SANDBOX_CLIENT_TOKEN: `test_${"t".repeat(32)}`,
  PADDLE_SANDBOX_PRICE_ID: pid("pri"), APP_BASE_URL: "https://sandbox.example.test" };
const config = getConfig(env); assert.ok(config);
const now = Date.now(); const start = new Date(now - 86400000).toISOString(), end = new Date(now + 86400000).toISOString();
const items = [{ quantity: 1, price: { id: config.priceId } }];
const sub = { id: pid("sub"), customer_id: pid("ctm"), status: "active", updated_at: start, items,
  current_billing_period: { starts_at: start, ends_at: end }, scheduled_change: null, custom_data: null };
const payment = { id: pid("txn"), status: "completed", customer_id: sub.customer_id, subscription_id: sub.id, items,
  custom_data: null, billing_period: { starts_at: start, ends_at: end }, currency_code: "USD", details: { totals: { grand_total: "1000" } } };
const event = { event_id: pid("evt"), event_type: "subscription.activated", occurred_at: start, data: { id: sub.id } };
const raw = Buffer.from(JSON.stringify(event)); const ts = Math.floor(now / 1000);
const signature = (body = raw, timestamp = ts) => `ts=${timestamp};h1=${createHmac("sha256", config.webhookSecret).update(`${timestamp}:`).update(body).digest("hex")}`;

test("sandbox configuration is disabled by default and rejects live credentials, production, malformed origin and missing values", () => {
  assert.equal(getConfig({}), null);
  for (const key of Object.keys(env)) assert.equal(getConfig({ ...env, [key]: "" }), null, key);
  for (const override of [{ PADDLE_SANDBOX_ENABLED: "false" }, { BILLING_DEPLOYMENT_ENV: "production" }, { VERCEL_ENV: "production" },
    { DEPLOYMENT_ENV: "production" }, { PADDLE_SANDBOX_API_KEY: "pdl_live_apikey_" + "x".repeat(32) },
    { PADDLE_SANDBOX_CLIENT_TOKEN: "live_" + "x".repeat(32) }, { APP_BASE_URL: "http://localhost:3000" },
    { APP_BASE_URL: "https://sandbox.example.test/path" }, { PADDLE_SANDBOX_PRICE_ID: "browser-price" }]) assert.equal(getConfig({ ...env, ...override }), null);
});
test("raw-body signatures reject forgery, body transformations, stale/future replay, duplicate timestamps and malformed signed JSON", () => {
  assert.deepEqual(protocol.verifyPaddleWebhook(raw, signature(), config.webhookSecret, now), event);
  assert.deepEqual(protocol.verifyPaddleWebhook(raw, signature() + ";h1=" + "0".repeat(64), config.webhookSecret, now), event);
  for (const header of [null, "ts=x;h1=00", signature(raw, ts - 10), signature(raw, ts + 10), signature() + `;ts=${ts}`, `ts=${ts};h1=${"0".repeat(64)}`])
    assert.throws(() => protocol.verifyPaddleWebhook(raw, header, config.webhookSecret, now));
  assert.throws(() => protocol.verifyPaddleWebhook(Buffer.concat([raw, Buffer.from(" ")]), signature(), config.webhookSecret, now));
  assert.throws(() => protocol.verifyPaddleWebhook(raw, signature(), "wrong-secret", now));
  const broken = Buffer.from("{bad-json"); assert.throws(() => protocol.verifyPaddleWebhook(broken, signature(broken), config.webhookSecret, now));
});
test("streaming webhook reader limits bytes even without Content-Length", async () => {
  const request = new Request("https://sandbox.test/webhook", { method: "POST", body: new ReadableStream({ start(controller) {
    controller.enqueue(new Uint8Array(256 * 1024)); controller.enqueue(new Uint8Array(1)); controller.close();
  } }), duplex: "half" });
  await assert.rejects(protocol.readRawWebhook(request));
});
test("paid-through preview cannot extend on failed payment, unpaid activation, scheduled cancellation, or elapsed time", () => {
  const project = (s, p = payment, clock = now) => protocol.projectSandboxSubscription(s, p, config.priceId, clock);
  assert.equal(project(sub).wouldBePro, true);
  assert.equal(project(sub, null).wouldBePro, false);
  assert.equal(project(sub, payment, Date.parse(end)).wouldBePro, false);
  for (const status of ["past_due", "canceled"]) {
    assert.equal(project({ ...sub, status, current_billing_period: null }).wouldBePro, true);
    assert.equal(project({ ...sub, status }, payment, Date.parse(end) + 1).wouldBePro, false);
  }
  for (const status of ["paused", "trialing"]) assert.equal(project({ ...sub, status }).wouldBePro, false);
  const scheduled = project({ ...sub, scheduled_change: { action: "cancel", effective_at: end } });
  assert.equal(scheduled.cancelAtPeriodEnd, true); assert.equal(scheduled.paidThrough, end);
  assert.throws(() => project(sub, { ...payment, status: "past_due" }));
  assert.throws(() => project(sub, { ...payment, customer_id: pid("ctm", "b") }));
  assert.throws(() => project(sub, { ...payment, subscription_id: pid("sub", "b") }));
  assert.throws(() => project({ ...sub, items: [{ ...items[0], quantity: 2 }] }));
});
test("API adapter pins the sandbox host, price, currency and recurring interval and refuses remote errors without leaking keys", async () => {
  const validPrice = { id: config.priceId, status: "active", type: "standard", unit_price: { amount: "1000", currency_code: "USD" },
    billing_cycle: { interval: "month", frequency: 1 }, trial_period: null, unit_price_overrides: [] };
  const requests = [];
  const client = clientFactory(config, async (url, options) => { requests.push({ url, options }); return Response.json({ data: validPrice }); });
  await client.verifyPrice();
  assert.equal(requests[0].url, `https://sandbox-api.paddle.com/prices/${config.priceId}`);
  assert.equal(requests[0].options.redirect, "error"); assert.equal(requests[0].options.cache, "no-store");
  for (const changed of [{ unit_price: { amount: "100", currency_code: "USD" } }, { trial_period: { interval: "month", frequency: 1 } },
    { billing_cycle: { interval: "year", frequency: 1 } }, { unit_price_overrides: [{}] }, { status: "archived" }])
    await assert.rejects(clientFactory(config, async () => Response.json({ data: { ...validPrice, ...changed } })).verifyPrice());
  await assert.rejects(clientFactory(config, async () => new Response(config.apiKey, { status: 500 })).verifyPrice(), error => !error.message.includes(config.apiKey));
});
test("checkout transaction uses only server price, quantity and opaque intent; invalid IDs never become API paths", async () => {
  const intent = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; let request;
  const transaction = { ...payment, status: "draft", customer_id: null, subscription_id: null, billing_period: null, custom_data: { link_intent: intent } };
  const client = clientFactory(config, async (url, options) => { request = { url, options }; return Response.json({ data: transaction }); });
  assert.equal(await client.createCheckout(intent), payment.id);
  assert.deepEqual(JSON.parse(request.options.body), { items: [{ price_id: config.priceId, quantity: 1 }], collection_mode: "automatic",
    currency_code: "USD", custom_data: { link_intent: intent }, checkout: { url: config.checkoutUrl } });
  request = null; await assert.rejects(client.subscription("../users")); assert.equal(request, null);
});
test("sandbox integration has no quota writes and keeps the entitlement writer behind an independent sandbox gate", async () => {
  const store = await readFile(new URL("../lib/billing/paddle/store.ts", import.meta.url), "utf8");
  assert.doesNotMatch(store, /(?:INSERT INTO|UPDATE|DELETE FROM)\s+(?:public\.)?monthly_usage/i);
  assert.match(store, /if \(sandboxEntitlementsEnabled\(\)\)/);
  const migration = await readFile(new URL("../migrations/008_paddle_sandbox_accounts.sql", import.meta.url), "utf8");
  assert.doesNotMatch(migration, /(?:INSERT INTO|UPDATE|DELETE FROM|ALTER TABLE)\s+(?:public\.)?(subscription_entitlements|monthly_usage)/i);
});

test("worker is disabled by default and refuses remote, production, ambiguous or non-sandbox databases", () => {
  const base = { ...env, PADDLE_RECONCILIATION_ENABLED: "true", PADDLE_SANDBOX_DATABASE_URL: "postgresql:///paddle_sandbox_test?host=/tmp/paddle-isolated&user=synthetic_operator&port=6554" };
  assert.equal(getWorkerConfig(base).database, "paddle_sandbox_test");
  assert.equal(getWorkerConfig({ ...base, PADDLE_RECONCILIATION_ENABLED: "false" }), null);
  assert.equal(getWorkerConfig({ ...base, VERCEL_ENV: "production" }), null);
  for (const value of ["", "postgresql://prod.example/paddle_sandbox_test", "postgresql:///postgres?host=/tmp/test&user=test",
    "postgresql:///paddle_sandbox_test?host=/var/run/postgresql&user=test", "postgresql:///paddle_sandbox_test?host=/tmp/test&user=test&options=x",
    base.PADDLE_SANDBOX_DATABASE_URL + "&host=/tmp/other", base.PADDLE_SANDBOX_DATABASE_URL.replace("6554", "65536")])
    assert.equal(getWorkerConfig({ ...base, PADDLE_SANDBOX_DATABASE_URL: value }), null, value);
});

test("disabled worker exits before connecting and emits only a redacted result", () => {
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/reconcile-paddle-sandbox.ts"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8", timeout: 10000,
    env: { PATH: process.env.PATH, PADDLE_RECONCILIATION_ENABLED: "false", DATABASE_URL: "postgresql://sensitive.invalid/production" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /disabled_or_failed/);
  assert.doesNotMatch(result.stderr + result.stdout, /sensitive|production|postgresql:\/\//);
});

test("refund policy ignores pending/rejected refunds and credits; approved refunds/disputes revoke only the bound payment", () => {
  const adjustment = { id: pid("adj"), transaction_id: payment.id, subscription_id: sub.id, customer_id: sub.customer_id, action: "refund", status: "approved" };
  assert.equal(protocol.paymentIsRevoked(payment, [adjustment]), true);
  for (const status of ["pending_approval", "rejected", "reversed"])
    assert.equal(protocol.paymentIsRevoked(payment, [{ ...adjustment, status }]), false);
  for (const action of ["credit", "credit_reverse", "chargeback_reverse", "chargeback_warning_reverse"])
    assert.equal(protocol.paymentIsRevoked(payment, [{ ...adjustment, action }]), false);
  for (const action of ["chargeback", "chargeback_warning"])
    assert.equal(protocol.paymentIsRevoked(payment, [{ ...adjustment, action }]), true);
  for (const change of [{ customer_id: pid("ctm", "b") }, { subscription_id: pid("sub", "b") }, { transaction_id: pid("txn", "b") }])
    assert.throws(() => protocol.paymentIsRevoked(payment, [{ ...adjustment, ...change }]));
});

test("adjustment API uses bounded pagination, never follows returned URLs, and fails incomplete or foreign reads", async () => {
  const adjustment = { id: pid("adj"), transaction_id: payment.id, subscription_id: sub.id, customer_id: sub.customer_id, action: "refund", status: "approved" };
  const requests = [];
  const client = clientFactory(config, async url => {
    requests.push(url);
    return Response.json({ data: requests.length === 1 ? [adjustment] : [], meta: { pagination: { has_more: requests.length === 1, next: "https://evil.test/steal" } } });
  });
  assert.deepEqual(await client.adjustments(payment.id), [adjustment]);
  assert.equal(requests.length, 2); assert.match(requests[1], /&after=adj_/);
  assert.ok(requests.every(url => url.startsWith("https://sandbox-api.paddle.com/adjustments?")));
  for (const response of [{ data: [] }, { data: [], meta: { pagination: { has_more: true } } },
    { data: [{ ...adjustment, transaction_id: pid("txn", "b") }], meta: { pagination: { has_more: false } } }])
    await assert.rejects(clientFactory(config, async () => Response.json(response)).adjustments(payment.id));
  let page = 0;
  await assert.rejects(clientFactory(config, async () => Response.json({ data: [{ ...adjustment, id: pid("adj", String(++page)) }], meta: { pagination: { has_more: true } } })).adjustments(payment.id));
  assert.equal(page, 5);
});


test("entitlement switch requires explicit valid sandbox configuration and blocks production", () => {
  assert.equal(entitlementGate({}), false);
  assert.equal(entitlementGate(env), false);
  const enabled = { ...env, PADDLE_SANDBOX_ENTITLEMENTS_ENABLED: "true" };
  assert.equal(entitlementGate(enabled), true);
  for (const override of [{ PADDLE_SANDBOX_ENABLED: "false" }, { DEPLOYMENT_ENV: "production" }, { VERCEL_ENV: "production" },
    { BILLING_DEPLOYMENT_ENV: "production" }, { PADDLE_SANDBOX_API_KEY: "" }, { PADDLE_SANDBOX_ENTITLEMENTS_ENABLED: "TRUE" }])
    assert.equal(entitlementGate({ ...enabled, ...override }), false);
});

test("webhook body deadline rejects stalled streams even when cancellation never completes", async () => {
  let cancelled = false;
  const request = new Request("https://sandbox.example.test/webhook", { method: "POST", duplex: "half",
    body: new ReadableStream({ pull() { return new Promise(() => {}); }, cancel() { cancelled = true; return new Promise(() => {}); } }) });
  await assert.rejects(protocol.readRawWebhook(request, 20), /timed out/);
  assert.equal(cancelled, true);
});

test("provider adapter propagates the worker deadline and redacts cancellation errors", async () => {
  const deadline = new AbortController(); let started;
  const entering = new Promise(resolve => { started = resolve; });
  const client = clientFactory(config, async (_url, options) => {
    started(); return new Promise((_, reject) => options.signal.addEventListener("abort", () => reject(Error("private upstream detail")), { once: true }));
  }, deadline.signal);
  const request = client.subscription(sub.id); await entering; deadline.abort();
  await assert.rejects(request, error => error.message === "Sandbox billing service unavailable.");
});

test("webhook worker is independently disabled and retains isolated sandbox database guards", () => {
  const values = { ...env, PADDLE_WEBHOOK_WORKER_ENABLED: "true", PADDLE_SANDBOX_DATABASE_URL: "postgresql:///paddle_sandbox_test?host=/tmp/paddle-test&user=synthetic_operator" };
  assert.equal(getWorkerConfig(env, "webhook"), null);
  assert.ok(getWorkerConfig(values, "webhook"));
  assert.equal(getWorkerConfig(values), null); // Does not implicitly enable periodic reconciliation.
  for (const change of [{ PADDLE_WEBHOOK_WORKER_ENABLED: "false" }, { VERCEL_ENV: "production" }, { PADDLE_SANDBOX_DATABASE_URL: "postgresql://remote.invalid/postgres" }])
    assert.equal(getWorkerConfig({ ...values, ...change }, "webhook"), null);
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--import", "tsx", "scripts/process-paddle-sandbox-webhooks.ts"], {
    cwd: process.cwd(), env: { ...process.env, PADDLE_SANDBOX_ENABLED: "false", PADDLE_WEBHOOK_WORKER_ENABLED: "false" }, encoding: "utf8" });
  assert.equal(result.status, 1); assert.match(result.stderr, /disabled_or_failed/);
});
