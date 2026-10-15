import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";

const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  return originalLoad.call(this, id, ...args);
};
let configModule, oauth;
try {
  configModule = require("../lib/account-link/config.ts");
  oauth = require("../lib/account-link/oauth.ts");
} finally { Module._load = originalLoad; }

const issuer = "https://tenant.example.test/";
const audience = "https://jobs.example.test/api/mcp";
const clientId = "interactive-link-client";
const redirectUri = "https://app.example.test/api/account-link/callback";
const env = {
  AUTH0_LINK_ENABLED: "true",
  AUTH0_ISSUER: issuer,
  AUTH0_AUDIENCE: audience,
  AUTH0_INTERACTIVE_CLIENT_IDS: clientId,
  AUTH0_LINK_CLIENT_ID: clientId,
  AUTH0_LINK_CLIENT_SECRET: "s".repeat(48),
  APP_BASE_URL: "https://app.example.test",
  AUTH0_LINK_REDIRECT_URI: redirectUri,
};
const config = configModule.getAccountLinkConfig(env);
assert.ok(config);
const { privateKey, publicKey } = await generateKeyPair("RS256");
const { privateKey: attackerKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
Object.assign(jwk, { kid: "link-test", alg: "RS256", use: "sig" });
const keySet = createLocalJWKSet({ keys: [jwk] });

function atHash(accessToken) {
  return createHash("sha256").update(accessToken, "ascii").digest().subarray(0, 16).toString("base64url");
}

async function tokens({ subject = "auth0|customer", idSubject = subject, nonce = "n".repeat(43), permissions = ["jobs:read"], accessClaims = {}, idClaims = {}, idKey = privateKey, idExpiry = "5m", idIssuer = issuer, idAudience = clientId, accessIssuer = issuer, accessAudience = audience, accessKey = privateKey, accessExpiry = "5m" } = {}) {
  const accessToken = await new SignJWT({ permissions, azp: clientId, sub: subject, ...accessClaims })
    .setProtectedHeader({ alg: "RS256", kid: "link-test" }).setIssuer(accessIssuer).setAudience(accessAudience)
    .setIssuedAt().setExpirationTime(accessExpiry).sign(accessKey);
  const idToken = await new SignJWT({ nonce, at_hash: atHash(accessToken), ...idClaims })
    .setProtectedHeader({ alg: "RS256", kid: "link-test" }).setIssuer(idIssuer).setAudience(idAudience)
    .setSubject(idSubject).setIssuedAt().setExpirationTime(idExpiry).sign(idKey);
  return { access_token: accessToken, id_token: idToken, token_type: "Bearer" };
}

function response(body, status = 200) {
  return async () => Response.json(body, { status });
}

test("configuration fails closed unless one exact interactive confidential client and callback are configured", () => {
  for (const override of [
    { AUTH0_LINK_ENABLED: undefined },
    { AUTH0_LINK_ENABLED: "false" },
    { AUTH0_LINK_CLIENT_SECRET: "short" },
    { AUTH0_INTERACTIVE_CLIENT_IDS: "different-client" },
    { AUTH0_INTERACTIVE_CLIENT_IDS: `${clientId},another-client` },
    { APP_BASE_URL: "http://app.example.test" },
    { AUTH0_LINK_REDIRECT_URI: "https://app.example.test/other" },
  ]) assert.equal(configModule.getAccountLinkConfig({ ...env, ...override }), null);
});

test("authorization request uses exact callback, audience, nonce, state and PKCE S256", () => {
  const verifier = "v".repeat(64);
  const url = oauth.createAuthorizationUrl(config, "x".repeat(43), verifier, "n".repeat(43));
  assert.equal(url.origin + url.pathname, `${issuer.slice(0, -1)}/authorize`);
  assert.deepEqual(Object.fromEntries(url.searchParams), {
    response_type: "code", client_id: clientId, redirect_uri: redirectUri, audience,
    scope: "openid jobs:read", state: "x".repeat(43), nonce: "n".repeat(43),
    code_challenge: createHash("sha256").update(verifier, "ascii").digest("base64url"), code_challenge_method: "S256",
  });
});

test("token exchange keeps credentials server-side and returns only a verified issuer-subject identity", async () => {
  const issued = await tokens();
  let request;
  const identity = await oauth.exchangeAndVerifyAccountLink(config, "authorization-code", "v".repeat(64), "n".repeat(43), {
    keySet,
    fetch: async (url, options) => { request = { url, options }; return Response.json(issued); },
  });
  assert.deepEqual(identity, { issuer, subject: "auth0|customer" });
  assert.equal(request.url, `${issuer}oauth/token`);
  const body = new URLSearchParams(request.options.body);
  assert.equal(body.get("client_secret"), env.AUTH0_LINK_CLIENT_SECRET);
  assert.equal(body.get("code_verifier"), "v".repeat(64));
  assert.equal(body.get("redirect_uri"), redirectUri);
  assert.equal(request.options.cache, "no-store");
});

test("rejects bad token endpoint, scope, machine grants, nonce, subject, at_hash, signature and expiry", async () => {
  const valid = await tokens();
  const attempts = [
    response({}, 400),
    response({ ...valid, token_type: "bearer" }),
    response(await tokens({ permissions: [] })),
    response(await tokens({ accessClaims: { gty: "client-credentials" } })),
    response(await tokens({ idClaims: { nonce: "wrong" } })),
    response(await tokens({ idClaims: { azp: "wrong-client" } })),
    response(await tokens({ accessClaims: { azp: "wrong-client" } })),
    response(await tokens({ accessClaims: { client_id: "different-client" } })),
    response(await tokens({ accessClaims: { sub_profile: "service" } })),
    response(await tokens({ accessClaims: { sub_profile: "ai_agent" } })),
    response(await tokens({ accessClaims: { act: { sub: "agent" } } })),
    response(await tokens({ idClaims: { at_hash: undefined } })),
    response(await tokens({ subject: "machine@clients" })),
    response(await tokens({ idSubject: "auth0|other" })),
    response(await tokens({ idClaims: { at_hash: "wrong" } })),
    response(await tokens({ idKey: attackerKey })),
    response(await tokens({ idExpiry: "-1m" })),
    response(await tokens({ accessExpiry: "-1m" })),
    response(await tokens({ accessKey: attackerKey })),
    response(await tokens({ accessIssuer: "https://attacker.test/" })),
    response(await tokens({ accessAudience: "https://other-api.test/" })),
    response(await tokens({ idIssuer: "https://attacker.test/" })),
    response(await tokens({ idAudience: "different-client" })),
    response(await tokens({ idAudience: [clientId, "another-client"] })),
  ];
  for (const fetcher of attempts) {
    await assert.rejects(oauth.exchangeAndVerifyAccountLink(config, "code", "v".repeat(64), "n".repeat(43), { keySet, fetch: fetcher }), /Account linking failed/);
  }
});

test("same-origin POST validation rejects CSRF and cross-site fetches", () => {
  assert.equal(oauth.isSameOriginPost(new Request("https://app.example.test/api/account-link/start", { method: "POST", headers: { origin: "https://app.example.test", "sec-fetch-site": "same-origin" } }), config.appOrigin), true);
  assert.equal(oauth.isSameOriginPost(new Request("https://app.example.test/api/account-link/start", { method: "POST" }), config.appOrigin), false);
  assert.equal(oauth.isSameOriginPost(new Request("https://app.example.test/api/account-link/start", { method: "POST", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }), config.appOrigin), false);
});

 test("RFC 9068 client_id compatibility still requires the exact authorized interactive client", async () => {
  const issued = await tokens({ accessClaims: { azp: undefined, client_id: clientId } });
  const identity = await oauth.exchangeAndVerifyAccountLink(config, "code", "v".repeat(64), "n".repeat(43), { keySet, fetch: response(issued) });
  assert.deepEqual(identity, { issuer, subject: "auth0|customer" });
});
