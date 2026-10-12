import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
process.env.RATE_LIMIT_SECRET = "synthetic-auth-test-secret-with-32-bytes";
delete process.env.VERCEL;
let records, queries, hashes, verifies, sessions, outage, duplicate, validPassword;
const pool = { query: async (sql, values) => {
  queries.push(sql);
  if (sql.includes("INSERT INTO abuse_rate_limits")) {
    if (outage) throw Error("private DB secret");
    const [policy, bucket, limit, seconds] = values;
    const key = `${policy}:${bucket}`;
    records.set(key, (records.get(key) ?? 0) + 1);
    return { rows: [{ allowed: records.get(key) <= limit, retry_after: seconds }] };
  }
  if (sql.includes("SELECT id, password_hash")) return { rows: [{ id: "synthetic-id", password_hash: "synthetic-hash" }] };
  if (sql.includes("SELECT 1 FROM users")) return { rows: [], rowCount: duplicate ? 1 : 0 };
  if (sql.includes("INSERT INTO users")) return { rows: [{ id: "synthetic-id" }] };
  throw Error("Unexpected synthetic query");
} };
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "next/headers") return { headers: async () => new Headers({ "x-forwarded-for": "198.51.100.1" }) };
  if (id === "@/lib/db/pool") return { pool };
  if (id === "@/lib/auth") return {
    hashPassword: async () => { hashes++; return "synthetic-hash"; },
    verifyPassword: async () => { verifies++; return validPassword; },
    createSession: async () => { sessions++; },
  };
  if (id === "next/navigation") return { redirect: path => { throw Object.assign(Error("Redirect"), { path }); } };
  return originalLoad.call(this, id, ...args);
};
const { login } = require("../app/login/actions.ts");
const { signup } = require("../app/signup/actions.ts");
Module._load = originalLoad;

beforeEach(() => {
  records = new Map(); queries = []; hashes = 0; verifies = 0; sessions = 0;
  outage = false; duplicate = false; validPassword = false;
});
function form(email = "synthetic@example.test") {
  const data = new FormData();
  for (const [key, value] of Object.entries({ name: "Synthetic Member", email, password: "synthetic-password", confirmPassword: "synthetic-password" })) data.set(key, value);
  return data;
}
const userQueries = () => queries.filter(sql => !sql.includes("abuse_rate_limits")).length;

test("failed login attempts exhaust budget; denial performs no user query, password work or session creation", async () => {
  for (let i = 0; i < 10; i++) assert.equal((await login({}, form())).message, "Invalid email or password.");
  const reads = userQueries();
  assert.match((await login({}, form(" SYNTHETIC@example.test "))).message, /Too many requests.*900 seconds/);
  assert.equal(userQueries(), reads); assert.equal(verifies, 10); assert.equal(hashes, 0); assert.equal(sessions, 0);
});

test("repeated signup attempts and duplicate emails consume budget before hashing", async () => {
  duplicate = true;
  for (let i = 0; i < 3; i++) assert.match((await signup({}, form())).errors.email, /already exists/);
  const reads = userQueries();
  assert.match((await signup({}, form())).message, /Too many requests.*3600 seconds/);
  assert.equal(userQueries(), reads); assert.equal(hashes, 0); assert.equal(sessions, 0);
});

test("source budget blocks rotating accounts and spoofed forwarding headers", async () => {
  duplicate = true;
  for (let i = 0; i < 5; i++) assert.ok((await signup({}, form(`synthetic-${i}@example.test`))).errors);
  const reads = userQueries();
  assert.match((await signup({}, form("rotated@example.test"))).message, /Too many requests/);
  assert.equal(userQueries(), reads);
});

test("allowed login and signup preserve sessions and redirects", async () => {
  validPassword = true;
  await assert.rejects(login({}, form()), error => error.path === "/dashboard");
  await assert.rejects(signup({}, form()), error => error.path === "/dashboard");
  assert.equal(verifies, 1); assert.equal(hashes, 1); assert.equal(sessions, 2);
});

test("limiter outage blocks both actions and does not expose errors or perform password work", async () => {
  outage = true;
  for (const action of [login, signup]) {
    const result = await action({}, form());
    assert.match(result.message, /temporarily unavailable.*60 seconds/);
    assert.doesNotMatch(result.message, /private|secret/);
  }
  assert.equal(userQueries(), 0); assert.equal(hashes + verifies + sessions, 0);
});

test("malformed submissions also consume admission budget", async () => {
  for (let i = 0; i < 3; i++) assert.ok((await signup({}, new FormData())).errors);
  assert.match((await signup({}, new FormData())).message, /Too many requests/);
  assert.equal(userQueries(), 0);
});
