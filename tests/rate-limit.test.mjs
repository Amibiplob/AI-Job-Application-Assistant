import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { Pool } from "pg";
import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";
import { bucketFor, createLimiter, trustedSource } from "../lib/rate-limit.ts";
import { createToolAdmission, protectMcpRequest } from "../lib/mcp/abuse-protection.ts";
import { registerJobAnalysisTool } from "../lib/mcp/register-job-analysis-tool.ts";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("tsx/cjs");
const { registerJobTools } = require("../lib/mcp/register-job-tools.ts");
const env = { RATE_LIMIT_SECRET: "synthetic-test-secret-with-at-least-32-bytes" };
const auth = { clientId: "synthetic-client", token: "synthetic-token", scopes: ["jobs:read"], extra: { rateLimitSubject: "synthetic-member" } };
let directory, server, pool, limiter;
const connectionClosures = [];

before(async () => {
  // Private local Unix socket only. Never use DATABASE_URL or any external DB.
  const bin = process.env.ACCOUNT_DELETION_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
  directory = await mkdtemp(path.join(tmpdir(), "rate-limit-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "Disposable PostgreSQL server binaries are required.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6550", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700"], { stdio: "ignore" });
  server.on("error", () => {});
  pool = new Pool({ host: directory, port: 6550, user: "synthetic_operator", database: "postgres", connectionTimeoutMillis: 500, max: 20 });
  pool.on("connect", client => {
    connectionClosures.push(new Promise(resolve => client.once("end", resolve)));
  });
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready);
  await pool.query(await readFile(new URL("../migrations/003_rate_limits.sql", import.meta.url), "utf8"));
  limiter = createLimiter((sql, values) => pool.query(sql, values), env);
});
beforeEach(async () => { await pool.query("TRUNCATE abuse_rate_limits"); });
after(async () => {
  await pool?.end();
  await Promise.all(connectionClosures);
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT"); await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("allows exactly the configured budget across concurrent instances, caps counter, and reuses expired rows", async () => {
  const instances = Array.from({ length: 5 }, () => createLimiter((sql, values) => pool.query(sql, values), env));
  const results = await Promise.all(Array.from({ length: 60 }, (_, i) => instances[i % 5]("login_account", "synthetic@example.test")));
  assert.equal(results.filter(result => result.allowed).length, 10);
  assert.ok(results.every(result => result.retryAfter >= 1 && result.retryAfter <= 900));
  assert.equal((await pool.query("SELECT attempts FROM abuse_rate_limits")).rows[0].attempts, 11);
  await pool.query("UPDATE abuse_rate_limits SET expires_at = now() - interval '1 second'");
  assert.equal((await limiter("login_account", "synthetic@example.test")).allowed, true);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM abuse_rate_limits")).rows[0].count, 1);
});

test("configuration and storage failures fail closed without private errors", async () => {
  let calls = 0;
  const query = async () => { calls++; throw Error("private connection password"); };
  for (const config of [{}, { ...env, RATE_LIMIT_MCP_JOBS_LIMIT: "0" }, { ...env, RATE_LIMIT_LOGIN_SOURCE_WINDOW_SECONDS: "NaN" }]) {
    assert.deepEqual(await createLimiter(query, config)("login_account", "private@example.test"), { allowed: false, retryAfter: 60, unavailable: true });
  }
  assert.equal(calls, 0);
  assert.equal((await createLimiter(query, env)("mcp_analysis", "private-token")).unavailable, true);
  assert.equal((await createLimiter(async () => ({ rows: [] }), env)("mcp_jobs", "member")).unavailable, true);
  const denied = await createToolAdmission(createLimiter(query, env))("analysis", auth);
  assert.equal(denied.isError, true);
  assert.doesNotMatch(JSON.stringify(denied), /private connection/);
});

test("database-clock window expiration admits a new budget without extending on denial", async () => {
  const short = createLimiter((sql, values) => pool.query(sql, values), { ...env, RATE_LIMIT_SIGNUP_ACCOUNT_LIMIT: "1", RATE_LIMIT_SIGNUP_ACCOUNT_WINDOW_SECONDS: "1" });
  assert.equal((await short("signup_account", "synthetic@example.test")).allowed, true);
  const expiry = (await pool.query("SELECT expires_at FROM abuse_rate_limits")).rows[0].expires_at;
  assert.equal((await short("signup_account", "synthetic@example.test")).allowed, false);
  assert.deepEqual((await pool.query("SELECT expires_at FROM abuse_rate_limits")).rows[0].expires_at, expiry);
  await new Promise(resolve => setTimeout(resolve, 1100));
  assert.equal((await short("signup_account", "synthetic@example.test")).allowed, true);
});

test("keys are private, domain separated and bounded; only Vercel's boundary identifies clients", async () => {
  let parameters;
  await createLimiter(async (_sql, values) => { parameters = values; return { rows: [{ allowed: true, retry_after: 60 }] }; }, env)("signup_account", "private@example.test");
  assert.doesNotMatch(JSON.stringify(parameters), /private|example|secret/);
  assert.ok(Number.isInteger(parameters[1]) && parameters[1] < 65536);
  assert.notEqual(bucketFor("signup_account", "member", env.RATE_LIMIT_SECRET), bucketFor("login_account", "member", env.RATE_LIMIT_SECRET));
  const headers = new Headers({ "x-forwarded-for": "198.51.100.1", "x-real-ip": "198.51.100.2", "x-vercel-forwarded-for": "198.51.100.3", "vercel": "1" });
  assert.equal(trustedSource(headers, {}), "shared-untrusted-source");
  assert.equal(trustedSource(headers, { VERCEL: "1" }), "198.51.100.3");
  headers.set("x-vercel-forwarded-for", "198.51.100.3, 198.51.100.4");
  assert.equal(trustedSource(headers, { VERCEL: "1" }), "shared-untrusted-source");
  assert.equal(trustedSource(new Headers({ "x-vercel-forwarded-for": "fe80::1%eth0" }), { VERCEL: "1" }), "shared-untrusted-source");
  assert.equal(trustedSource(new Headers({ "x-vercel-forwarded-for": "2001:0db8::1" }), { VERCEL: "1" }), trustedSource(new Headers({ "x-vercel-forwarded-for": "2001:db8::1" }), { VERCEL: "1" }));
  await assert.rejects(pool.query("INSERT INTO abuse_rate_limits VALUES ('login_account',65536,1,now())"));
});

test("unauthorized MCP preserves challenges and consumes only admission budgets", async () => {
  let fetches = 0;
  const challenge = new Response("Unauthorized", { status: 401, headers: { "WWW-Authenticate": "Bearer resource_metadata=synthetic" } });
  const response = await protectMcpRequest(new Request("https://example.test/api/mcp"), limiter, async () => challenge, async () => { fetches++; return new Response(); }, {});
  assert.equal(response, challenge);
  assert.equal(fetches, 0);
  assert.deepEqual((await pool.query("SELECT policy FROM abuse_rate_limits ORDER BY policy")).rows.map(row => row.policy), ["mcp_global", "mcp_source"]);
});

test("MCP HTTP denial precedes verification, returns 429/503 and retry headers", async () => {
  let verifies = 0;
  const gate = async () => { verifies++; return auth; };
  const limited = createLimiter((sql, values) => pool.query(sql, values), { ...env, RATE_LIMIT_MCP_SOURCE_LIMIT: "1" });
  const request = new Request("https://example.test/api/mcp");
  const accepted = new Response("SDK response", { status: 202 });
  assert.equal(await protectMcpRequest(request, limited, gate, async () => accepted, {}), accepted);
  const response = await protectMcpRequest(request, limited, gate, async () => accepted, {});
  assert.equal(response.status, 429); assert.equal(verifies, 1);
  assert.ok(Number(response.headers.get("Retry-After")) > 0);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const outage = await protectMcpRequest(request, createLimiter(async () => { throw Error("private"); }, env), gate, async () => accepted, {});
  assert.equal(outage.status, 503); assert.equal(outage.headers.get("Retry-After"), "60");
  assert.doesNotMatch(await outage.text(), /private/);
});

test("authenticated MCP identity and tool budgets protect execution and preserve SDK HTTP results", async () => {
  let jobReads = 0;
  const limited = createLimiter((sql, values) => pool.query(sql, values), { ...env, RATE_LIMIT_MCP_JOBS_LIMIT: "1", RATE_LIMIT_MCP_ANALYSIS_LIMIT: "1" });
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "synthetic", version: "1" });
    const admission = createToolAdmission(limited);
    registerJobTools(server, { listJobs: async () => { jobReads++; return []; }, getJobById: async () => { jobReads++; return null; } }, admission);
    registerJobAnalysisTool(server, admission);
    return server;
  }, { maxRequestBodySize: 256 * 1024 });
  const call = async (name, args, caller = auth) => {
    const request = new Request("https://example.test/api/mcp", { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-03-26" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }) });
    const response = await protectMcpRequest(request, limited, async () => caller, (incoming, verified) => handler.fetch(incoming, { authInfo: verified }), {});
    assert.equal(response.status, 200);
    const text = await response.text();
    return JSON.parse(text.startsWith("event:") ? text.split("data: ")[1].trim() : text).result;
  };
  assert.equal((await call("search_jobs", { keywords: "synthetic" })).isError, undefined);
  assert.equal((await call("get_job_details", { jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })).isError, true);
  assert.equal(jobReads, 1);
  assert.deepEqual((await call("get_job_details", { jobId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }, { ...auth, extra: { rateLimitSubject: "other-synthetic-member" } })).structuredContent, { job: null });
  assert.equal(jobReads, 2);
  const input = { resumeText: "Private synthetic React resume", jobDescription: "Private synthetic React posting" };
  assert.ok((await call("analyze_job_match", input)).structuredContent);
  const denied = await call("analyze_job_match", input);
  assert.equal(denied.isError, true); assert.doesNotMatch(JSON.stringify(denied), /Private synthetic/);
  assert.equal((await createToolAdmission(limited)("jobs")).isError, true);
  const identityLimited = createLimiter((sql, values) => pool.query(sql, values), { ...env, RATE_LIMIT_MCP_IDENTITY_LIMIT: "1" });
  // Prior authenticated calls consumed this identity; rotating the token cannot bypass it.
  assert.equal((await protectMcpRequest(new Request("https://example.test/api/mcp"), identityLimited, async () => ({ ...auth, token: "rotated" }), async () => new Response(), {})).status, 429);
  const rows = await pool.query("SELECT * FROM abuse_rate_limits");
  assert.doesNotMatch(JSON.stringify(rows.rows), /Private synthetic|synthetic-member|synthetic-token/);
});
