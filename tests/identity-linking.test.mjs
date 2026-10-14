import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { createAuth0TokenVerifier, externalIdentityFromAuth, getRemoteMcpAuthConfig } from "../lib/mcp/auth0-auth.ts";

const bin = process.env.IDENTITY_LINKING_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
const userA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const userB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const issuer = "https://tenant.example.test/";
const audience = "https://jobs.example.test/api/mcp";
let directory, server, pool, store, identity, otherIdentity;

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
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready, "Disposable PostgreSQL failed to start.");
  for (const filename of ["001_initial_schema.sql", "002_auth_sessions.sql", "006_external_identities.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${filename}`, import.meta.url), "utf8"));
  }
  const require = createRequire(import.meta.url);
  require("tsx/cjs");
  const Module = require("node:module");
  const originalLoad = Module._load;
  Module._load = function(id, ...args) {
    if (id === "server-only") return {};
    return originalLoad.call(this, id, ...args);
  };
  try { store = require("../lib/mcp/identity-store.ts").createExternalIdentityStore(pool); }
  finally { Module._load = originalLoad; }
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
  await pool.query("TRUNCATE public.users CASCADE");
  await pool.query("INSERT INTO users(id,email,password_hash) VALUES ($1,'a@example.test','hash'),($2,'b@example.test','hash')", [userA, userB]);
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
