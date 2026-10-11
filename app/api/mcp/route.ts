import { McpServer, createMcpHandler } from "@modelcontextprotocol/server";

import { getJobById, listJobs } from "@/lib/jobs";
import { registerJobTools } from "@/lib/mcp/register-job-tools";
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

  registerJobTools(server, { getJobById, listJobs });
  return server;
});

async function handleRequest(request: Request): Promise<Response> {
  const config = getRemoteMcpAuthConfig();
  if (!config) {
    return Response.json(
      { error: "Remote MCP authorization is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const auth = await getRemoteMcpBearerGate(config)(request);
  if (auth instanceof Response) return auth;

  return mcpHandler.fetch(request, { authInfo: auth });
}

export const POST = handleRequest;
export const GET = handleRequest;
export const DELETE = handleRequest;
