import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
// Use the same TS module instance as the CJS-loaded store below. Mixing native
// ESM stripping with tsx/CJS creates two independent verification WeakSets.
const require = createRequire(import.meta.url);
require("tsx/cjs");
const { createAuth0TokenVerifier, externalIdentityFromAuth, getRemoteMcpAuthConfig } = require("../lib/mcp/auth0-auth.ts");

const bin = process.env.IDENTITY_LINKING_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionA = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const sessionB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const issuer = "https://tenant.example.test/";
const audience = "https://jobs.example.test/api/mcp";
let directory, server, pool, store, transactionStore, identity, otherIdentity;
const connectionClosures = [];

before(async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const jwk = await exportJWK(publicKey);
  Object.assign(jwk, { kid: "identity-test", alg: "RS256", use: "sig" });
  const config = getRemoteMcpAuthConfig({ AUTH0_ISSUER: issuer, AUTH0_AUDIENCE: audience, AUTH0_INTERACTIVE_CLIENT_IDS: "interactive-test-client" });
  const verifier = createAuth0TokenVerifier(config, createLocalJWKSet({ keys: [jwk] }));
  const verifiedIdentity = async subject => {
    const token = await new SignJWT({ permissions: ["jobs:read"], azp: "interactive-test-client", sub: subject })
      .setProtectedHeader({ alg: "RS256", kid: "identity-test" }).setIssuer(issuer).setAudience(audience)
      .setIssuedAt().setExpirationTime("5m").sign(privateKey);
    return externalIdentityFromAuth(await verifier.verifyAccessToken(token));
  };
  identity = await verifiedIdentity("auth0|customer-a");
  otherIdentity = await verifiedIdentity("auth0|other");
  assert.ok(identity && otherIdentity);
  directory = await mkdtemp(path.join(tmpdir(), "identity-linking-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "A local PostgreSQL distribution is required.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6551", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700"], { stdio: "ignore" });
  server.on("error", () => {});
  pool = new Pool({ host: directory, port: 6551, user: "synthetic_operator", database: "postgres", connectionTimeoutMillis: 500 });
  pool.on("connect", client => connectionClosures.push(new Promise(resolve => client.once("end", resolve))));
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, "Disposable PostgreSQL failed to start.");
  for (const filename of ["001_initial_schema.sql", "002_auth_sessions.sql", "006_external_identities.sql", "007_account_link_transactions.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  }
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(id, ...args) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
  };
  try {
    store = require("../lib/mcp/identity-store.ts").createExternalIdentityStore(pool);
    transactionStore = require("../lib/account-link/store.ts").createAccountLinkTransactionStore(pool);
  }
  finally { Module._load = originalLoad; }
});

after(async () => {
  await pool?.end();
  await Promise.all(connectionClosures);
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT");
    await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

beforeEach(async () => {
  await pool.query("TRUNCATE public.users CASCADE");
  await pool.query("INSERT INTO users(id,email,password_hash) VALUES ($1,'a@example.test','hash'),($2,'b@example.test','hash')", [userA, userB]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day')", [sessionA, userA, sessionB, userB]);
});

test("links and resolves only the verified issuer-subject pair", async () => {
  assert.deepEqual(await store.link(userA, identity), { linked: true });
  assert.equal(await store.resolve(identity), userA);
  assert.equal(await store.resolve(otherIdentity), null);
  assert.deepEqual(await store.link(userA, identity), { linked: true });
});

test("unique constraints prevent an identity crossing website accounts", async () => {
  await store.link(userA, identity);
  await assert.rejects(store.link(userB, identity), /External identity operation failed/);
  assert.equal(await store.resolve(identity), userA);
  await assert.rejects(store.link(userA, otherIdentity), /External identity operation failed/);
});

test("unlink is owner scoped and deletion cascades the mapping", async () => {
  await store.link(userA, identity);
  assert.equal(await store.unlink(userB, identity), false);
  assert.equal(await store.resolve(identity), userA);
  assert.equal(await store.unlink(userA, identity), true);
  assert.equal(await store.resolve(identity), null);
  await store.link(userA, identity);
  await pool.query("DELETE FROM users WHERE id=$1", [userA]);
  assert.equal(await store.resolve(identity), null);
});

test("rejects untrusted identifiers before querying", async () => {
  await assert.rejects(store.link(userB, { issuer: "http://tenant.example.test/", subject: "auth0|customer" }), /verified external identity/);
  await assert.rejects(store.link("not-a-user", identity), /trusted website identity/);
  await assert.rejects(store.resolve({ issuer: identity.issuer, subject: " " }), /verified external identity/);
});

test("account-link state is random, hashed, session-bound, one-use and short-lived", async () => {
  const pending = await transactionStore.create(userA, sessionA);
  assert.match(pending.state, /^[A-Za-z0-9_-]{43}$/);
  assert.match(pending.codeVerifier, /^[A-Za-z0-9_-]{86}$/);
  assert.match(pending.nonce, /^[A-Za-z0-9_-]{43}$/);
  const stored = (await pool.query("SELECT encode(state_hash,'hex') AS state_hash,code_verifier,nonce,expires_at FROM account_link_transactions")).rows[0];
  assert.notEqual(stored.state_hash, pending.state);
  assert.equal(stored.code_verifier, pending.codeVerifier);
  assert.equal(stored.nonce, pending.nonce);
  assert.ok(new Date(stored.expires_at).getTime() <= Date.now() + 5 * 60 * 1000 + 1000);

  assert.equal(await transactionStore.consume(pending.state, userB, sessionB), null);
  assert.deepEqual(await transactionStore.consume(pending.state, userA, sessionA), { codeVerifier: pending.codeVerifier, nonce: pending.nonce });
  assert.equal(await transactionStore.consume(pending.state, userA, sessionA), null);
});

test("account-link state rejects session swapping, logout and expiry", async () => {
  const swapped = await transactionStore.create(userA, sessionA);
  assert.equal(await transactionStore.consume(swapped.state, userA, sessionB), null);
  await pool.query("DELETE FROM sessions WHERE id=$1", [sessionA]);
  assert.equal(await transactionStore.consume(swapped.state, userA, sessionA), null);

  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day')", [sessionA, userA]);
  const expired = await transactionStore.create(userA, sessionA);
  await pool.query("UPDATE account_link_transactions SET created_at=now()-interval '10 minutes', expires_at=now()-interval '1 second'");
  assert.equal(await transactionStore.consume(expired.state, userA, sessionA), null);
});

 test("final linking rejects revoked, expired and other-owner sessions after exchange", async () => {
  await assert.rejects(store.link(userA, identity, sessionB));
  await pool.query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE id=$1", [sessionA]);
  await assert.rejects(store.link(userA, identity, sessionA));
  await pool.query("DELETE FROM sessions WHERE id=$1", [sessionA]);
  await assert.rejects(store.link(userA, identity, sessionA));
  assert.equal(await store.resolve(identity), null);
});

test("concurrent callbacks consume state exactly once", async () => {
  const pending = await transactionStore.create(userA, sessionA);
  const results = await Promise.all(Array.from({ length: 8 }, () => transactionStore.consume(pending.state, userA, sessionA)));
  assert.equal(results.filter(Boolean).length, 1);
});
