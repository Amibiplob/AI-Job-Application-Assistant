import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  exportJWK,
  generateKeyPair,
  SignJWT,
  createLocalJWKSet,
} from "jose";
import { requireBearerAuth } from "@modelcontextprotocol/server";

import {
  createAuth0TokenVerifier,
  createProtectedResourceMetadata,
  getRemoteMcpAuthConfig,
  MCP_METADATA_PATH,
} from "../lib/mcp/auth0-auth.ts";

const ISSUER = "https://tenant.example.test/";
const AUDIENCE = "https://jobs.example.test/api/mcp";
const CLIENT_ID = "mcp-test-client";

const { privateKey, publicKey } = await generateKeyPair("RS256");
const { privateKey: otherPrivateKey } = await generateKeyPair("RS256");
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "test-key";
publicJwk.alg = "RS256";
publicJwk.use = "sig";
const keySet = createLocalJWKSet({ keys: [publicJwk] });
const config = getRemoteMcpAuthConfig({
  AUTH0_ISSUER: ISSUER,
  AUTH0_AUDIENCE: AUDIENCE,
});
assert.ok(config);

async function token(overrides = {}, signingKey = privateKey, issuer = ISSUER, audience = AUDIENCE) {
  return new SignJWT({
    permissions: ["jobs:read"],
    azp: CLIENT_ID,
    ...overrides,
  })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(signingKey);
}

function verifier() {
  return createAuth0TokenVerifier(config, keySet);
}

test("rejects missing or malformed Auth0 configuration", () => {
  assert.equal(getRemoteMcpAuthConfig({}), null);
  assert.equal(
    getRemoteMcpAuthConfig({ AUTH0_ISSUER: "http://tenant.example.test/", AUTH0_AUDIENCE: AUDIENCE }),
    null,
  );
  assert.equal(
    getRemoteMcpAuthConfig({ AUTH0_ISSUER: "https://tenant.example.test", AUTH0_AUDIENCE: AUDIENCE }),
    null,
  );
  assert.equal(
    getRemoteMcpAuthConfig({ AUTH0_ISSUER: "https://tenant.example.test/path/", AUTH0_AUDIENCE: AUDIENCE }),
    null,
  );
});

test("maps only verified Auth0 permissions to MCP scopes and returns SDK AuthInfo", async () => {
  const auth = await verifier().verifyAccessToken(await token());

  assert.equal(auth.clientId, CLIENT_ID);
  assert.deepEqual(auth.scopes, ["jobs:read"]);
  assert.equal(auth.resource.href, AUDIENCE);
  assert.equal(typeof auth.expiresAt, "number");
  assert.ok(auth.expiresAt > Math.floor(Date.now() / 1000));
});

test("rejects an invalid signature", async () => {
  await assert.rejects(
    verifier().verifyAccessToken(await token({}, otherPrivateKey)),
    { code: "invalid_token" },
  );
});

test("rejects issuer and audience mismatches", async () => {
  await assert.rejects(
    verifier().verifyAccessToken(
      await token({}, privateKey, "https://attacker.example/"),
    ),
    { code: "invalid_token" },
  );
  await assert.rejects(
    verifier().verifyAccessToken(
      await token({}, privateKey, ISSUER, "https://other.example/api/mcp"),
    ),
    { code: "invalid_token" },
  );
  await assert.rejects(
    verifier().verifyAccessToken(
      await new SignJWT({ permissions: ["jobs:read"], azp: CLIENT_ID })
        .setProtectedHeader({ alg: "RS256", kid: "test-key" })
        .setIssuer(ISSUER)
        .setAudience([AUDIENCE, "https://other.example/api/mcp"])
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey),
    ),
    { code: "invalid_token" },
  );
});

test("rejects expired and not-yet-valid tokens", async () => {
  const expired = await new SignJWT({ permissions: ["jobs:read"], azp: CLIENT_ID })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("-1s")
    .sign(privateKey);
  const notYetValid = await new SignJWT({ permissions: ["jobs:read"], azp: CLIENT_ID })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setNotBefore("5m")
    .setExpirationTime("10m")
    .sign(privateKey);

  await assert.rejects(verifier().verifyAccessToken(expired), { code: "invalid_token" });
  await assert.rejects(verifier().verifyAccessToken(notYetValid), { code: "invalid_token" });
});

test("returns 401 and 403 WWW-Authenticate challenges without token details", async () => {
  const gate = requireBearerAuth({
    verifier: verifier(),
    requiredScopes: ["jobs:read"],
    expectedResource: config.resource,
    resourceMetadataUrl: new URL(MCP_METADATA_PATH, config.resource.origin).href,
  });

  const badSignature = await gate(
    new Request(AUDIENCE, {
      headers: { Authorization: `Bearer ${await token({}, otherPrivateKey)}` },
    }),
  );
  assert.ok(badSignature instanceof Response);
  assert.equal(badSignature.status, 401);
  assert.match(badSignature.headers.get("WWW-Authenticate"), /error="invalid_token"/);
  assert.match(badSignature.headers.get("WWW-Authenticate"), /resource_metadata=/);
  assert.doesNotMatch(await badSignature.text(), /test-key|mcp-test-client/);

  const missingPermission = await gate(
    new Request(AUDIENCE, {
      headers: {
        Authorization: `Bearer ${await token({ permissions: ["other:permission"] })}`,
      },
    }),
  );
  assert.ok(missingPermission instanceof Response);
  assert.equal(missingPermission.status, 403);
  assert.match(missingPermission.headers.get("WWW-Authenticate"), /error="insufficient_scope"/);
  assert.match(missingPermission.headers.get("WWW-Authenticate"), /scope="jobs:read"/);
});

test("publishes protected-resource metadata with the configured resource, issuer, and scope", () => {
  assert.deepEqual(createProtectedResourceMetadata(config), {
    resource: AUDIENCE,
    authorization_servers: [ISSUER],
    scopes_supported: ["jobs:read"],
    bearer_methods_supported: ["header"],
  });
});

test("keeps the existing stdio entry point on its current tool registration", async () => {
  const source = await readFile(new URL("../scripts/mcp-server.ts", import.meta.url), "utf8");
  assert.match(source, /serveStdio/);
  assert.match(source, /registerJobTools\(server, \{ getJobById, listJobs \}\)/);
});
