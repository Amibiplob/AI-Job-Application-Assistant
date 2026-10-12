import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { stat } from "node:fs/promises";
import test from "node:test";

const require = createRequire(import.meta.url);
require("tsx/cjs");
const Module = require("node:module");
const originalLoad = Module._load;
let signedIn = false;
const privateUser = { id: "private-user-id", email: "private@example.test", name: "Private Name" };
Module._load = function(id, ...args) {
  if (id === "@/lib/auth") return { getCurrentUser: async () => signedIn ? privateUser : null };
  return originalLoad.call(this, id, ...args);
};
const { default: Connect, metadata } = require("../app/connect/page.tsx");
const Home = require("../app/page.tsx").default;
Module._load = originalLoad;
const { renderToStaticMarkup } = require("react-dom/server");
const { MCP_SERVER_URL, CHATGPT_CONNECTION_GUIDE, CONNECT_EXAMPLES, SAMPLE_SEARCH_INPUT, SAMPLE_MATCH_INPUT } = require("../lib/connect-guide.ts");
const { searchJobsInputSchema, getJobDetailsInputSchema, analyzeJobMatchInputSchema, createJobMatchToolLogic } = require("../lib/mcp/job-tools.ts");
const render = async component => renderToStaticMarkup(await component());

test("public onboarding renders for signed-out and signed-in visitors without exposing identity", async () => {
  for (const authenticated of [false, true, false]) {
    signedIn = authenticated;
    const html = await render(Connect);
    assert.match(html, /<h1[^>]*>Connect to ChatGPT<\/h1>/);
    assert.match(html, /<a(?=[^>]*href="\/connect")(?=[^>]*aria-current="page")[^>]*>/);
    assert.match(html, /href="\/dashboard"/);
    assert.equal(html.includes('href="/signup"'), !authenticated);
    assert.equal(html.includes('href="/login"'), !authenticated);
    assert.equal(html.includes("Go to Dashboard"), authenticated);
    for (const value of Object.values(privateUser)) assert.equal(html.includes(value), false);
    const hrefs = Array.from(html.matchAll(/href="(\/[^"#]*)"/g), match => match[1]);
    for (const href of new Set(hrefs)) assert.ok((await stat(new URL(`../app${href === "/" ? "" : href}/page.tsx`, import.meta.url))).isFile(), href);
  }
  assert.match(metadata.title, /Connect to ChatGPT/);
});

test("marketing navigation exposes onboarding and preserves authentication-aware CTAs", async () => {
  for (const authenticated of [false, true]) {
    signedIn = authenticated;
    const html = await render(Home);
    const nav = html.match(/<nav aria-label="Main navigation"[^>]*>(.*?)<\/nav>/s)[1];
    assert.match(nav, /href="\/connect"[^>]*>Connect to ChatGPT/);
    assert.match(nav, authenticated ? /href="\/dashboard"/ : /href="\/signup"/);
  }
});

test("copyable examples conform to deployed tool inputs and use a returned job ID", () => {
  assert.equal(searchJobsInputSchema.safeParse(SAMPLE_SEARCH_INPUT).success, true);
  assert.equal(analyzeJobMatchInputSchema.safeParse(SAMPLE_MATCH_INPUT).success, true);
  assert.equal(createJobMatchToolLogic().analyzeJobMatch(SAMPLE_MATCH_INPUT).score, 60);
  assert.equal(getJobDetailsInputSchema.safeParse({ jobId: "frontend" }).success, false);
  const search = CONNECT_EXAMPLES.find(example => example.tool === "search_jobs");
  const details = CONNECT_EXAMPLES.find(example => example.tool === "get_job_details");
  const match = CONNECT_EXAMPLES.find(example => example.tool === "analyze_job_match");
  assert.ok(search.prompt.includes(JSON.stringify(SAMPLE_SEARCH_INPUT, null, 2)));
  assert.ok(match.prompt.includes(JSON.stringify(SAMPLE_MATCH_INPUT, null, 2)));
  assert.match(details.prompt, /jobId.*exact job ID \(UUID\).*previous search_jobs/);
  assert.match(details.prompt, /do not invent a job ID/);
});

test("onboarding explains demo data, separate identities, text sharing, availability and manual copying", async () => {
  signedIn = false;
  const html = await render(Connect);
  const text = html.replace(/<[^>]*>/g, " ");
  for (const phrase of [/demonstration listings/, /not a hiring probability/, /does not currently retrieve website-saved resumes/, /ChatGPT sends the supplied resume/, /does not save it to the website database/, /infrastructure logs/, /Auth0/, /Website login is separate/, /plans or workspaces may not allow/, /Never paste passwords/]) assert.match(text, phrase);
  assert.ok(html.includes(MCP_SERVER_URL));
  assert.ok(html.includes(`href="${CHATGPT_CONNECTION_GUIDE}"`));
  const url = new URL(MCP_SERVER_URL);
  assert.equal(url.protocol, "https:");
  assert.equal(url.pathname, "/api/mcp");
  assert.equal(url.username + url.password + url.search, "");
  assert.doesNotMatch(html, /<form|<input[^>]*type="password"|<script[^>]*src="https:/);
  assert.match(html, /role="status" aria-live="polite"/);
  assert.match(html, /select and copy the text manually/);
  assert.match(html, /href="#connect-content"/);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1);
});
