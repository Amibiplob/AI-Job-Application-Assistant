import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { registerJobAnalysisTool } from "../lib/mcp/register-job-analysis-tool.ts";

test("remote analysis registration exposes the tool with structured, non-echoing content", async () => {
  const tools = new Map();
  const fakeServer = {
    registerTool(name, config, callback) {
      tools.set(name, { config, callback });
    },
  };

  registerJobAnalysisTool(fakeServer);

  assert.deepEqual([...tools.keys()], ["analyze_job_match"]);
  const registered = tools.get("analyze_job_match");
  assert.ok(registered.config.inputSchema);
  const result = await registered.callback({
    resumeText: "Resume contains React.",
    jobDescription: "Role requires React and AWS.",
  });
  assert.equal(result.structuredContent.score, 50);
  assert.deepEqual(result.structuredContent.matchingSkills, ["React"]);
  assert.deepEqual(result.structuredContent.skillsNotDetected, ["AWS"]);
  assert.match(result.structuredContent.scoreDescription, /not a hiring probability/);
  assert.doesNotMatch(JSON.stringify(result), /Resume contains|Role requires/);
});

test("remote handler registers existing and analysis tools only behind bearer authorization", async () => {
  const route = await readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8");
  const stdio = await readFile(new URL("../scripts/mcp-server.ts", import.meta.url), "utf8");

  assert.match(route, /registerJobTools\(server, \{ getJobById, listJobs \}\)/);
  assert.match(route, /registerJobAnalysisTool\(server\)/);
  assert.match(route, /maxRequestBodySize:\s*256\s*\*\s*1024/);
  assert.ok(route.indexOf("getRemoteMcpBearerGate(config)") < route.indexOf("mcpHandler.fetch(request"));
  assert.match(stdio, /registerJobTools\(server, \{ getJobById, listJobs \}\)/);
  assert.doesNotMatch(stdio, /registerJobAnalysisTool|analyze_job_match/);
});

test("remote analysis preserves structured/text contracts for expanded skills and aliases", async () => {
  let analyze;
  registerJobAnalysisTool({ registerTool(_name, _config, callback) { analyze = callback; } });
  const result = await analyze({
    resumeText: "Private resume: NextJS, NodeJS, WAI-ARIA, Vitest.",
    jobDescription: "Private posting: Next.js, Node JS, ARIA, Vitest, Angular, WCAG 2.2.",
  });
  assert.deepEqual(Object.keys(result.structuredContent).sort(),
    ["score", "matchingSkills", "skillsNotDetected", "explanation", "nextStep", "scoreDescription"].sort());
  assert.equal(result.structuredContent.score, 67);
  assert.deepEqual(result.structuredContent.matchingSkills, ["ARIA", "Next.js", "Node.js", "Vitest"]);
  assert.deepEqual(result.structuredContent.skillsNotDetected, ["Angular", "WCAG"]);
  assert.deepEqual(result.content, [{ type: "text", text: JSON.stringify(result.structuredContent) }]);
  assert.doesNotMatch(JSON.stringify(result), /Private resume|Private posting/);
});
