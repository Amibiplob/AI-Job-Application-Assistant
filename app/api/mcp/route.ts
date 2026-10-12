import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import { getJobById, listJobs } from "@/lib/jobs";
import { registerJobTools } from "@/lib/mcp/register-job-tools";
import { registerJobAnalysisTool } from "@/lib/mcp/register-job-analysis-tool";
import { limiter } from "@/lib/abuse-protection";
import { createToolAdmission, protectMcpRequest } from "@/lib/mcp/abuse-protection";
import {
  getRemoteMcpAuthConfig,
  getRemoteMcpBearerGate,
} from "@/lib/mcp/auth0-auth";

export const runtime = "nodejs";

const mcpHandler = createMcpHandler(() => {
  const server = new McpServer({
    name: "ai-job-application-assistant",
    version: "0.1.0",
  });

  const admission = createToolAdmission(limiter);
  registerJobTools(server, { getJobById, listJobs }, admission);
  registerJobAnalysisTool(server, admission);
  return server;
}, { maxRequestBodySize: 256 * 1024 });

async function handleRequest(request: Request): Promise<Response> {
  const config = getRemoteMcpAuthConfig();
  if (!config) {
    return Response.json(
      { error: "Remote MCP authorization is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return protectMcpRequest(request, limiter, getRemoteMcpBearerGate(config),
    (incoming, auth) => mcpHandler.fetch(incoming, { authInfo: auth }));
}

export const POST = handleRequest;
export const GET = handleRequest;
export const DELETE = handleRequest;
