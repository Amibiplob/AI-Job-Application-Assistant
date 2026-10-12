import type { McpServer } from "@modelcontextprotocol/server";
import type { ToolAdmission } from "./abuse-protection";

// @ts-expect-error Explicit extension lets Node's built-in TypeScript test runner resolve this module.
import { analyzeJobMatchInputSchema, createJobMatchToolLogic } from "./job-tools.ts";

function structuredResult(data: object) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data) }],
    structuredContent: data,
  };
}

/** Register the caller-supplied-text analysis tool for remote MCP only. */
export function registerJobAnalysisTool(server: McpServer, admission?: ToolAdmission): void {
  const analysis = createJobMatchToolLogic();

  server.registerTool(
    "analyze_job_match",
    {
      title: "Analyze job match",
      description:
        "Compare caller-supplied resume and job-description text using a deterministic skill dictionary. The nullable score is a skills-text-overlap heuristic, not a hiring probability. Submitted text is processed for this request and is not stored by this tool.",
      inputSchema: analyzeJobMatchInputSchema,
    },
    async (input, context) => {
      const rejected = await admission?.("analysis", context?.http?.authInfo);
      return rejected ?? structuredResult(analysis.analyzeJobMatch(input));
    },
  );
}
