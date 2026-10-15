import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { beforeEach, test } from "node:test";

const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const original = Module._load;
const origin = "https://app.example.test";
const config = { appOrigin: origin, redirectUri: `${origin}/api/account-link/callback` };
const session = { userId: "website-owner", id: "website-session" };
let enabled, currentSession, pending, exchanges, writes, creates;
Module._load = function(id, ...args) {
  if (id === "@/lib/auth") return { getSession: async () => currentSession };
  if (id === "@/lib/db/pool") return { pool: {} };
  if (id === "@/lib/account-link/config") return { getAccountLinkConfig: () => enabled ? config : null };
  if (id === "@/lib/account-link/oauth") return {
    isSameOriginPost: req => req.headers.get("origin") === origin,
    createAuthorizationUrl: () => new URL("https://tenant.example.test/authorize"),
    exchangeAndVerifyAccountLink: async () => { exchanges++; return { verified: true }; },
  };
  if (id === "@/lib/account-link/store") return { createAccountLinkTransactionStore: () => ({
    create: async (...args) => { creates.push(args); return {}; },
    consume: async (state, userId, sessionId) => {
      assert.equal(userId, session.userId); assert.equal(sessionId, session.id);
      if (state !== "valid-state" || !pending) return null;
      pending = false; return { codeVerifier: "private-verifier", nonce: "private-nonce" };
    },
  }) };
  if (id === "@/lib/mcp/identity-store") return { createExternalIdentityStore: () => ({ link: async (...args) => writes.push(args) }) };
  return original.call(this, id, ...args);
};
let start, callback;
try {
  start = require("../app/api/account-link/start/route.ts").POST;
  callback = require("../app/api/account-link/callback/route.ts").GET;
} finally { Module._load = original; }
beforeEach(() => { enabled = true; currentSession = session; pending = true; exchanges = 0; writes = []; creates = []; });
const post = (requestOrigin = origin) => new Request(`${origin}/api/account-link/start`, { method: "POST", headers: { origin: requestOrigin } });
const get = (query = "state=valid-state&code=code") => new Request(`${config.redirectUri}?${query}`);

test("disabled configuration, absent session and CSRF cannot initiate linking", async () => {
  enabled = false; assert.equal((await start(post())).status, 503);
  enabled = true; assert.equal((await start(post("https://evil.test"))).status, 403);
  currentSession = null; assert.equal((await start(post())).headers.get("location"), `${origin}/login`);
  assert.deepEqual(creates, []);
});
test("initiation derives both identities from the session and redirects privately", async () => {
  const response = await start(post());
  assert.equal(response.status, 303);
  assert.deepEqual(creates, [[session.userId, session.id]]);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("callback rejects disabled configuration and missing session before exchange", async () => {
  enabled = false; assert.equal((await callback(get())).status, 503);
  enabled = true; currentSession = null;
  assert.equal((await callback(get())).headers.get("location"), `${origin}/login`);
  assert.equal(exchanges, 0); assert.deepEqual(writes, []);
});
test("malformed, duplicate, missing, denied and replayed callbacks cannot write identities", async () => {
  for (const query of ["code=x", "state=wrong&code=x", "state=valid-state&state=valid-state&code=x", "state=valid-state&code=x&code=y", "state=valid-state&error=access_denied", "state=valid-state"]) {
    pending = true;
    assert.match((await callback(get(query))).headers.get("location"), /link=failed/);
  }
  assert.equal(exchanges, 0); assert.deepEqual(writes, []);
  pending = true;
  const response = await callback(get());
  assert.match(response.headers.get("location"), /link=success/);
  assert.deepEqual(writes, [[session.userId, { verified: true }, session.id]]);
  assert.match((await callback(get())).headers.get("location"), /link=failed/);
  assert.equal(exchanges, 1);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
});
test("callback requires the exact configured origin and path", async () => {
  await callback(new Request("https://evil.test/api/account-link/callback?state=valid-state&code=x"));
  assert.equal(exchanges, 0); assert.deepEqual(writes, []);
});
