import {
  createProtectedResourceMetadata,
  getRemoteMcpAuthConfig,
} from "@/lib/mcp/auth0-auth";

export const runtime = "nodejs";

export function GET(): Response {
  const config = getRemoteMcpAuthConfig();
  if (!config) {
    return Response.json(
      { error: "Remote MCP authorization is not configured." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(createProtectedResourceMetadata(config), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "no-store",
    },
  });
}

export function OPTIONS(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
    },
  });
}
