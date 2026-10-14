import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { Pool } from "pg";

const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const otherId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const sessionId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const otherSessionId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const expiredSessionId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const revokedSessionId = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const jobId = "11111111-1111-4111-8111-111111111111";
const context = new AsyncLocalStorage();
const connections = [];
let directory, server, pool, auth, failure, computations, admissions, invalidations;
const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
const actualMatching = require("../lib/job-matching.ts");
const database = {
  async query(sql, values) {
    if (failure === "read" && sql.includes("FROM resumes")) throw Error("Private synthetic resume password");
    if (failure === "usage-read" && sql.includes("WITH entitlement")) throw Error("Private synthetic usage password");
    return pool.query(sql, values);
  },
  async connect() {
    admissions++;
    if (failure === "connect") throw Error("Private synthetic connection password");
    const client = await pool.connect();
    return {
      async query(sql, values) {
        if (failure === "charge" && sql.includes("INSERT INTO public.monthly_usage")) throw Error("Private synthetic charge password");
        if (failure === "commit" && sql === "COMMIT") throw Error("Private synthetic commit password");
        const result = await client.query(sql, values);
        if (failure === "commit-ack" && sql === "COMMIT") throw Error("Private synthetic acknowledgement password");
        return result;
      },
      release: discard => client.release(discard),
    };
  },
};
function compute(method, args) {
  computations++;
  if (failure === "compute") throw Error("Private synthetic resume password");
  return actualMatching[method](...args);
}
Module._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "@/lib/db/pool") return { pool: database };
  if (id === "@/lib/auth") return auth;
  if (id === "next/headers") return { cookies: async () => ({ get: () => context.getStore() ? { value: context.getStore() } : undefined }) };
  if (id === "next/navigation") return { redirect: path => { throw Object.assign(Error("Redirect"), { path }); } };
  if (id === "next/cache") return { revalidatePath: path => {
    if (failure === "invalidate") throw Error("Private synthetic cache password");
    invalidations.push(path);
  } };
  if (id === "@/lib/job-matching") return {
    ...actualMatching,
    matchResumeToJob: (...args) => compute("matchResumeToJob", args),
    analyzeJobDescriptionAgainstResume: (...args) => compute("analyzeJobDescriptionAgainstResume", args),
  };
  return originalLoad.call(this, id, ...args);
};
let matchJobWithResume, analyzeJobDescription, website, DashboardPage, MonthlyMatchUsage;
try {
  auth = require("../lib/auth.ts");
  ({ matchJobWithResume } = require("../app/dashboard/jobs/[jobId]/actions.ts"));
  ({ analyzeJobDescription } = require("../app/dashboard/analyze/actions.ts"));
  website = require("../lib/monetization/current-user.ts");
  DashboardPage = require("../app/dashboard/page.tsx").default;
  ({ MonthlyMatchUsage } = require("../components/dashboard/monthly-match-usage.tsx"));
} finally { Module._load = originalLoad; }
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const asUser = operation => context.run(sessionId, operation);
const asOther = operation => context.run(otherSessionId, operation);
function jobForm() {
  const form = new FormData(); form.set("jobId", jobId); return form;
}
function descriptionForm() {
  const form = new FormData();
  form.set("title", "Synthetic Developer"); form.set("company", "Synthetic Company"); form.set("description", "React SQL");
  return form;
}
const saved = (form = jobForm(), state = { status: "idle" }) => matchJobWithResume(state, form);
const pasted = (form = descriptionForm(), state = { status: "idle" }) => analyzeJobDescription(state, form);
const usage = () => asUser(() => website.getCurrentUserMonthlyUsage("job_analysis"));
async function pro() {
  await pool.query("INSERT INTO subscription_entitlements(user_id,plan,status,current_period_start,current_period_end) VALUES ($1,'pro','active',now()-interval '1 day',now()+interval '1 month')", [userId]);
}

before(async () => {
  // Only fresh local synthetic databases. Never load .env or DATABASE_URL.
  const bin = process.env.ACCOUNT_DELETION_TEST_POSTGRES_BIN ?? "/usr/lib/postgresql/16/bin";
  directory = await mkdtemp(path.join(tmpdir(), "website-matching-quota-test-"));
  const init = spawnSync(path.join(bin, "initdb"), ["-D", path.join(directory, "data"), "-U", "synthetic_operator", "-A", "trust", "--no-locale", "-E", "UTF8"], { stdio: "ignore" });
  assert.equal(init.status, 0, "Disposable PostgreSQL server binaries required; no live DB fallback.");
  server = spawn(path.join(bin, "postgres"), ["-D", path.join(directory, "data"), "-k", directory, "-p", "6553", "-c", "listen_addresses=", "-c", "unix_socket_permissions=0700", "-c", "timezone=Pacific/Kiritimati"], { stdio: "ignore" });
  server.on("error", () => {});
  // This test deliberately queues >100 requests. Allow pool acquisition to wait
  // through that burst, including when the complete repository suite runs.
  pool = new Pool({ host: directory, port: 6553, user: "synthetic_operator", database: "postgres", max: 20, connectionTimeoutMillis: 5000 });
  pool.on("connect", client => connections.push(new Promise(resolve => client.once("end", resolve))));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try { await pool.query("SELECT 1"); ready = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(ready);
  for (const file of ["001_initial_schema.sql", "002_auth_sessions.sql", "003_rate_limits.sql", "004_subscription_entitlements.sql", "005_monthly_usage.sql"]) {
    await pool.query(await readFile(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
});
beforeEach(async () => {
  failure = undefined; computations = 0; admissions = 0; invalidations = [];
  await pool.query("TRUNCATE users,jobs CASCADE");
  await pool.query("INSERT INTO users(id,email,name) VALUES ($1,'private-a@example.test','Private A'),($2,'private-b@example.test','Private B')", [userId, otherId]);
  await pool.query("INSERT INTO sessions(id,user_id,expires_at) VALUES ($1,$2,now()+interval '1 day'),($3,$4,now()+interval '1 day'),($5,$2,now()-interval '1 day')", [sessionId, userId, otherSessionId, otherId, expiredSessionId]);
  await pool.query("INSERT INTO resumes(user_id,name,content) VALUES ($1,'Synthetic','React TypeScript'),($2,'Synthetic other','SQL')", [userId, otherId]);
  await pool.query("INSERT INTO jobs(id,source,title,company,description) VALUES ($1,'demo-board-test','Synthetic developer','Synthetic company','React SQL')", [jobId]);
});
after(async () => {
  await pool?.end(); await Promise.all(connections);
  if (server && server.exitCode === null) {
    const stopped = new Promise(resolve => server.once("exit", resolve));
    server.kill("SIGINT"); await stopped;
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

test("both real server actions share Free's three successful matches and consistent exhaustion", async () => {
  const first = await asUser(saved); const second = await asUser(pasted); const third = await asUser(saved);
  assert.equal(first.status, "success"); assert.equal(first.result.score, 50);
  assert.equal(second.status, "success"); assert.equal(second.analysis.score, 50);
  assert.deepEqual([first.usage.remaining, second.usage.remaining, third.usage.remaining], [2, 1, 0]);
  const before = (await pool.query("SELECT * FROM monthly_usage")).rows;
  const a = await asUser(saved); const b = await asUser(pasted);
  assert.equal(a.status, "quota-exhausted"); assert.equal(b.status, "quota-exhausted"); assert.equal(a.message, b.message);
  assert.equal(a.result, undefined); assert.equal(b.analysis, undefined);
  assert.equal(computations, 3);
  assert.deepEqual((await pool.query("SELECT * FROM monthly_usage")).rows, before);
  assert.equal(invalidations.length, 3); assert.ok(invalidations.every(path => path === "/dashboard"));
  for (const result of [a, b]) assert.doesNotMatch(JSON.stringify(result), /private-[ab]|aaaaaaaa|cccccccc|password|Private A/);
});

test("concurrent direct action calls across both entry points cannot exceed Free or Pro", async () => {
  for (const [plan, limit] of [["free", 3], ["pro", 100]]) {
    if (plan === "pro") { await pool.query("DELETE FROM monthly_usage"); await pro(); }
    computations = 0;
    const results = await Promise.all(Array.from({ length: limit + 12 }, (_, i) => asUser(i % 2 ? saved : pasted)));
    assert.equal(results.filter(result => result.status === "error").length, 0, `Unexpected storage failure during ${plan} concurrency test`);
    assert.equal(results.filter(result => result.status === "success").length, limit);
    assert.equal(results.filter(result => result.status === "quota-exhausted").length, 12);
    assert.equal(computations, limit);
    const snapshot = await usage();
    assert.equal(snapshot.plan, plan); assert.equal(snapshot.used, limit); assert.equal(snapshot.remaining, 0);
  }
});

test("forged user IDs, plans, limits, resume content and previous success state do not bypass server accounting", async () => {
  for (let i = 0; i < 3; i++) await asUser(saved);
  for (const [operation, form] of [[saved, jobForm()], [pasted, descriptionForm()]]) {
    form.set("userId", otherId); form.set("plan", "pro"); form.set("limit", "99999"); form.set("resume", "SQL");
    const result = await asUser(() => operation(form, { status: "success", usage: { plan: "pro", remaining: 99999 } }));
    assert.equal(result.status, "quota-exhausted");
  }
  assert.equal((await asOther(() => website.getCurrentUserMonthlyUsage("job_analysis"))).used, 0);
  const other = await asOther(saved);
  assert.equal(other.status, "success"); assert.deepEqual(other.result.matchingSkills, ["SQL"]);
  assert.equal((await usage()).used, 3);
});

test("missing, malformed, expired and revoked sessions reject actions and dashboard before matching or quota access", async () => {
  for (const cookie of [undefined, "not-a-session", expiredSessionId, revokedSessionId]) {
    for (const operation of [saved, pasted, DashboardPage]) await assert.rejects(context.run(cookie, operation), error => error.path === "/login");
  }
  assert.equal(computations, 0); assert.equal(admissions, 0);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM monthly_usage")).rows[0].count, 0);
});

test("invalid input, missing jobs/resumes, empty text and read failures are excluded without charging", async () => {
  const invalid = descriptionForm(); invalid.set("description", " ");
  assert.equal((await asUser(() => pasted(invalid))).status, "invalid");
  const missingJob = jobForm(); missingJob.set("jobId", otherId);
  assert.equal((await asUser(() => saved(missingJob))).status, "job-not-found");
  const invalidJob = jobForm(); invalidJob.set("jobId", "forged-id");
  assert.equal((await asUser(() => saved(invalidJob))).status, "job-not-found");
  await pool.query("UPDATE resumes SET content='   ' WHERE user_id=$1", [userId]);
  assert.equal((await asUser(saved)).status, "empty-resume"); assert.equal((await asUser(pasted)).status, "empty-resume");
  await pool.query("DELETE FROM resumes WHERE user_id=$1", [userId]);
  assert.equal((await asUser(saved)).status, "no-resume"); assert.equal((await asUser(pasted)).status, "no-resume");
  await pool.query("INSERT INTO resumes(user_id,name,content) VALUES ($1,'Synthetic','React')", [userId]);
  await pool.query("UPDATE jobs SET description='  ' WHERE id=$1", [jobId]);
  assert.equal((await asUser(saved)).status, "no-description");
  failure = "read";
  assert.equal((await asUser(saved)).status, "error"); assert.equal((await asUser(pasted)).status, "error");
  failure = undefined;
  assert.equal(computations, 0); assert.equal(admissions, 0); assert.equal((await usage()).used, 0);
});

test("failed matching rolls back the reserved unit and a later success gets the full allowance", async () => {
  failure = "compute";
  for (const operation of [saved, pasted]) {
    const result = await asUser(operation);
    assert.equal(result.status, "error"); assert.doesNotMatch(JSON.stringify(result), /Private|password/);
  }
  failure = undefined;
  assert.equal((await usage()).used, 0);
  for (let i = 0; i < 3; i++) assert.equal((await asUser(saved)).status, "success");
  assert.equal((await asUser(pasted)).status, "quota-exhausted");
});

test("quota storage and pre-commit failures fail closed with no success or retained charge", async () => {
  for (const mode of ["connect", "charge", "commit"]) {
    failure = mode;
    const result = await asUser(pasted);
    assert.equal(result.status, "error"); assert.equal(result.analysis, undefined);
    assert.doesNotMatch(JSON.stringify(result), /Private|password/);
    failure = undefined; assert.equal((await usage()).used, 0);
  }
  assert.equal((await asUser(pasted)).status, "success");
});

test("uncertain commit does not issue an unsafe refund; cache failure preserves a completed match", async () => {
  failure = "commit-ack";
  assert.equal((await asUser(saved)).status, "error");
  failure = undefined; assert.equal((await usage()).used, 1);
  failure = "invalidate";
  const result = await asUser(pasted); assert.equal(result.status, "success"); assert.equal(result.usage.used, 2);
  failure = undefined; assert.equal((await usage()).used, 2);
});

test("UTC monthly reset creates a new allowance and leaves prior usage intact", async () => {
  for (let i = 0; i < 3; i++) await asUser(saved);
  const month = (await usage()).monthStart;
  await pool.query("UPDATE monthly_usage SET month_start=(month_start-interval '1 month')::date WHERE user_id=$1", [userId]);
  const before = await usage(); assert.equal(before.used, 0); assert.equal(before.remaining, 3); assert.equal(before.monthStart, month);
  const result = await asUser(pasted); assert.equal(result.status, "success"); assert.equal(result.usage.remaining, 2);
  const rows = (await pool.query("SELECT month_start::text,used FROM monthly_usage WHERE user_id=$1 ORDER BY month_start", [userId])).rows;
  assert.equal(rows.length, 2); assert.equal(rows[0].used, 3); assert.equal(rows[1].used, 1); assert.equal(rows[1].month_start, month);
  assert.match(result.usage.resetsAt, /^\d{4}-\d{2}-01T00:00:00.000Z$/);
});

test("completed zero-overlap and unscored matches count as successful operations", async () => {
  const zero = descriptionForm(); zero.set("description", "SQL");
  const unscored = descriptionForm(); unscored.set("description", "A thoughtful colleague");
  const first = await asUser(() => pasted(zero)); assert.equal(first.analysis.score, 0); assert.equal(first.usage.used, 1);
  const second = await asUser(() => pasted(unscored)); assert.equal(second.analysis.score, null); assert.equal(second.usage.used, 2);
});

test("dashboard indicator shows current Free/Pro remaining usage, exhaustion and truthful read failure", async () => {
  let html = renderToStaticMarkup(await asUser(DashboardPage));
  assert.match(html, /3 of 3 matches remaining/); assert.match(html, /Free/);
  await asUser(saved);
  html = renderToStaticMarkup(await asUser(DashboardPage)); assert.match(html, /2 of 3 matches remaining/);
  await pro();
  html = renderToStaticMarkup(await asUser(DashboardPage)); assert.match(html, /99 of 100 matches remaining/); assert.match(html, /Pro/);
  const exhausted = renderToStaticMarkup(React.createElement(MonthlyMatchUsage, { usage: { ...(await usage()), used: 100, remaining: 0 } }));
  assert.match(exhausted, /0 of 100 matches remaining/); assert.match(exhausted, /allowance is used up/); assert.match(exhausted, /UTC/);
  failure = "usage-read";
  html = renderToStaticMarkup(await asUser(DashboardPage));
  assert.match(html, /Usage is unavailable/); assert.doesNotMatch(html, /matches remaining|Private synthetic|password/);
});
