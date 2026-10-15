import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";
const require = createRequire(import.meta.url); require("tsx/cjs");
const Module = require("node:module"), original = Module._load;
let enabled, authenticated, fail, calls;
const config = { appOrigin: "https://sandbox.example.test", checkoutUrl: "https://sandbox.example.test/billing/checkout", webhookSecret: "synthetic-secret-for-signature-verification" };
const session = { userId: "session-owner", id: "session-id" };
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "@/lib/auth") return { getSession: async () => authenticated ? session : null };
  if (id === "@/lib/db/pool") return { pool: {} };
  if (id === "@/lib/billing/paddle/config") return { getPaddleSandboxConfig: () => enabled ? config : null };
  if (id === "@/lib/billing/paddle/client") return { createPaddleSandboxClient: () => ({}) };
  if (id === "@/lib/billing/paddle/store") return { createPaddleSandboxStore: () => ({
    checkout: async (...args) => { calls.push(args); if (fail) throw Error("sensitive-secret"); return "txn_" + "a".repeat(26); },
    reconcileUser: async (...args) => { calls.push(args); if (fail) throw Error("sensitive-secret"); },
    processEvent: async e => { calls.push(e); if (fail) throw Error("sensitive-secret"); },
  }) };
  return original.call(this, id, ...args);
};
let checkout, webhook, reconcile;
try {
  checkout = require("../app/api/billing/paddle/checkout/route.ts").POST;
  webhook = require("../app/api/billing/paddle/webhook/route.ts").POST;
  reconcile = require("../app/api/billing/paddle/reconcile/route.ts").POST;
} finally { Module._load = original; }
beforeEach(() => { enabled = true; authenticated = true; fail = false; calls = []; });
const request = (origin = config.appOrigin) => new Request(`${config.appOrigin}/api/billing/paddle/checkout`, { method: "POST", headers: { Origin: origin }, body: JSON.stringify({ userId: "victim", priceId: "cheap-price" }) });
test("checkout/reconciliation require config, same origin and website session", async () => {
  for (const route of [checkout, reconcile]) {
    enabled = false; assert.equal((await route(request())).status, 503);
    enabled = true; assert.equal((await route(request("https://evil.test"))).status, 403);
    authenticated = false; assert.equal((await route(request())).status, 401); authenticated = true;
    const cross = request(); cross.headers.set("sec-fetch-site", "cross-site"); assert.equal((await route(cross)).status, 403);
  }
  assert.deepEqual(calls, []);
});
test("browser prices/users are ignored, redirects never grant access, failures never disclose secrets", async () => {
  const result = await checkout(request());
  assert.equal(result.status, 303); assert.deepEqual(calls, [[session.userId, session.id]]);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.match(result.headers.get("location"), /^https:\/\/sandbox\.example\.test\/billing\/checkout\?_ptxn=txn_/);
  fail = true; const failed = await checkout(request()); assert.equal(failed.status, 503); assert.doesNotMatch(await failed.text(), /sensitive-secret/);
});
test("forged webhook never reaches storage; a valid signed raw delivery is accepted; reconciliation failure requests retry", async () => {
  const body = JSON.stringify({ event_id: "evt_" + "a".repeat(26), event_type: "subscription.activated", occurred_at: new Date().toISOString(), data: { id: "sub_" + "a".repeat(26) } });
  const ts = Math.floor(Date.now() / 1000);
  const signature = `ts=${ts};h1=${createHmac("sha256", config.webhookSecret).update(`${ts}:${body}`).digest("hex")}`;
  const make = sig => new Request(`${config.appOrigin}/api/billing/paddle/webhook`, { method: "POST", headers: { "Paddle-Signature": sig }, body });
  assert.equal((await webhook(make("forged"))).status, 400); assert.deepEqual(calls, []);
  assert.equal((await webhook(make(signature))).status, 200); assert.equal(calls.length, 1);
  fail = true; const retry = await webhook(make(signature)); assert.equal(retry.status, 503); assert.doesNotMatch(await retry.text(), /sensitive-secret/);
  enabled = false; assert.equal((await webhook(make(signature))).status, 503);
});
