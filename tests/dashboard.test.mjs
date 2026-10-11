import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";
import { dashboardNavigation, dashboardPageTitle, isDashboardRouteActive } from "../components/layout/dashboard-navigation.ts";
import { getOverviewSummary } from "../components/dashboard/overview-model.ts";
import { APPLICATION_STATUSES } from "../lib/application-validation.ts";

function application(id, status, createdAt, updatedAt = createdAt) {
  return { id, status, createdAt: new Date(createdAt), updatedAt: new Date(updatedAt), jobId: id, job: { title: "Test role", company: "Test employer", source: "demo-board-alpha" } };
}

test("every dashboard destination resolves to a supported page", async () => {
  assert.deepEqual(dashboardNavigation.map(item => item.href), ["/dashboard", "/dashboard/resume", "/dashboard/jobs", "/dashboard/analyze", "/dashboard/applications"]);
  for (const {href} of dashboardNavigation) {
    assert.ok((await stat(new URL(`../app${href}/page.tsx`, import.meta.url))).isFile());
  }
});

test("active routes and contextual titles distinguish overview, descendants and unrelated prefixes", () => {
  assert.equal(isDashboardRouteActive("/dashboard", "/dashboard"), true);
  assert.equal(isDashboardRouteActive("/dashboard/jobs", "/dashboard"), false);
  assert.equal(isDashboardRouteActive("/dashboard/jobs/123", "/dashboard/jobs"), true);
  assert.equal(isDashboardRouteActive("/dashboard/jobs-extra", "/dashboard/jobs"), false);
  assert.equal(dashboardPageTitle("/dashboard/jobs/123"), "Job details");
  assert.equal(dashboardPageTitle("/dashboard/resume"), "Resume");
  assert.equal(dashboardPageTitle("/dashboard/unsupported"), "Workspace");
});

test("empty account summaries have truthful zero counts and distinguish blank resumes", () => {
  const empty = getOverviewSummary(null, []);
  assert.equal(empty.resumeStatus, "missing");
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.statuses, []);
  assert.deepEqual(empty.recent, []);
  assert.equal(getOverviewSummary({content: " \n "}, []).resumeStatus, "empty");
  assert.equal(getOverviewSummary({content: "React experience"}, []).resumeStatus, "ready");
});

test("failed reads remain unavailable rather than being represented as empty accounts", () => {
  const failed = getOverviewSummary(null, null, true);
  assert.equal(failed.resumeStatus, "unavailable");
  assert.equal(failed.total, null);
  assert.equal(failed.statuses, null);
  assert.equal(failed.recent, null);
  assert.equal(getOverviewSummary(null, [], true).total, 0);
  assert.equal(getOverviewSummary({content: "Resume"}, null).resumeStatus, "ready");
});

test("status counts reflect every existing application status including saved and terminal records", () => {
  const records = APPLICATION_STATUSES.flatMap((status, index) => Array.from({length:index + 1}, (_, n) => application(`${status}-${n}`, status, "2026-10-01T12:00:00Z")));
  const summary = getOverviewSummary(null, records);
  assert.equal(summary.total, 21);
  assert.equal(summary.statuses.reduce((total, item) => total + item.count, 0), records.length);
  for(const [index,status] of APPLICATION_STATUSES.entries()) assert.equal(summary.statuses.find(item=>item.status===status).count, index + 1);
});

test("recently tracked uses creation dates rather than updates, limits to five, and preserves input", () => {
  const records = Array.from({length:7}, (_, index) => application(String(index), "SAVED", `2026-10-0${index + 1}T12:00:00Z`, "2026-10-09T12:00:00Z"));
  records[0].updatedAt = new Date("2026-10-10T12:00:00Z");
  const original = records.map(item=>item.id);
  assert.deepEqual(getOverviewSummary(null, records).recent.map(item=>item.id), ["6", "5", "4", "3", "2"]);
  assert.deepEqual(records.map(item=>item.id), original);
});

test("shared layout and all feature pages retain authorization before account data reads", async () => {
  for(const path of ["layout.tsx", "page.tsx", "resume/page.tsx", "jobs/page.tsx", "jobs/[jobId]/page.tsx", "applications/page.tsx", "analyze/page.tsx"]) {
    const source = await readFile(new URL(`../app/dashboard/${path}`, import.meta.url), "utf8");
    const guard = source.indexOf('if (!currentUser)');
    assert.ok(source.indexOf("await getCurrentUser()") >= 0 && guard > source.indexOf("await getCurrentUser()"), path);
    assert.ok(source.indexOf('redirect("/login")',guard) > guard, path);
    for(const read of ["await getResume()", "await listApplications()", "await getJobById(", "Promise.allSettled([getResume(), listApplications()])"]) {
      if(source.includes(read)) assert.ok(source.indexOf(read) > guard, `${path}: ${read}`);
    }
  }
  for(const path of ["resumes.ts", "applications.ts"]) {
    const source = await readFile(new URL(`../lib/${path}`, import.meta.url), "utf8");
    assert.match(source, /const userId = await requireUserId\(\)/);
    assert.match(source, /WHERE (?:a\.)?user_id = \$1/);
  }
});

test("logout still invokes the existing server action and the shell owns a single content landmark", async () => {
  const control = await readFile(new URL("../components/layout/logout-control.tsx", import.meta.url), "utf8");
  assert.match(control, /import \{ logout \} from "@\/app\/dashboard\/actions"/);
  assert.match(control, /<form action=\{logout\}>/);
  const layout = await readFile(new URL("../app/dashboard/layout.tsx", import.meta.url), "utf8");
  assert.match(layout, /href="#dashboard-content"/);
  assert.match(layout, /<main id="dashboard-content"/);
  for(const path of ["resume/page.tsx", "jobs/page.tsx", "jobs/[jobId]/page.tsx", "applications/page.tsx", "analyze/page.tsx", "jobs/[jobId]/not-found.tsx", "jobs/[jobId]/error.tsx", "jobs/loading.tsx"]) {
    const source = await readFile(new URL(`../app/dashboard/${path}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /<main|<Sidebar|<Navbar/);
  }
});

test("overview renders onboarding, real counts, provenance and partial failure states", async () => {
  const { createRequire } = await import("node:module");
  const require = createRequire(import.meta.url);
  // Use the existing TSX dependency only for JSX presentation rendering.
  require("tsx/cjs");
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { DashboardOverview } = require("../components/dashboard/dashboard-overview.tsx");
  const render = props => renderToStaticMarkup(React.createElement(DashboardOverview, props));

  const empty = render({resume:null, applications:[]});
  assert.match(empty, /Not added yet/);
  assert.match(empty, /No roles are tracked yet/);
  assert.match(empty, /Set up your resume/);
  assert.match(empty, /does not submit an application/);
  for(const {href} of dashboardNavigation.filter(item=>item.href!=="/dashboard")) assert.ok(empty.includes(`href="${href}"`));
  assert.doesNotMatch(empty, /Recommended jobs|reminders coming up|\d+%/);

  const first = application("11111111-1111-4111-8111-111111111111", "APPLIED", "2026-10-01T12:00:00Z");
  const second = {...application("22222222-2222-4222-8222-222222222222", "INTERVIEW", "2026-10-02T12:00:00Z"), job:{title:"Another role",company:"Other employer",source:"company-careers"}};
  const populated = render({resume:{name:"My resume",content:"TypeScript"}, applications:[first,second]});
  assert.match(populated, /Ready to compare/);
  assert.match(populated, /Tracked applications<\/h2>.*?<p[^>]*>2<\/p>/s);
  assert.match(populated, /Demo listing/);
  assert.match(populated, /Unverified listing/);
  assert.match(populated, /My resume/);
  assert.ok(populated.indexOf("Another role") < populated.indexOf("Test role"));

  const failed = render({resume:null, resumeUnavailable:true, applications:null});
  assert.match(failed, /Unavailable/);
  assert.match(failed, /We couldn’t load your applications/);
  assert.match(failed, /Tracked applications<\/h2>.*?<p[^>]*>—<\/p>/s);
  assert.doesNotMatch(failed, /No roles are tracked yet|Set up your resume/);
});
