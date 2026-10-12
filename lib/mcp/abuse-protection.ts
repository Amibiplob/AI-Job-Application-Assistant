import type { AuthInfo, CallToolResult } from "@modelcontextprotocol/server";
// @ts-expect-error Explicit extension supports Node's TypeScript test runner.
import { checkLimits, retryMessage, trustedSource, type Limiter } from "../rate-limit.ts";

export type ToolAdmission = (tool: "jobs" | "analysis", auth?: AuthInfo) => Promise<CallToolResult | null>;

export function authenticatedIdentity(auth: AuthInfo): string {
  const subject = auth.extra?.rateLimitSubject;
  return JSON.stringify([auth.clientId, typeof subject === "string" ? subject : null]);
}

export function createToolAdmission(limiter: Limiter): ToolAdmission {
  return async (tool, auth) => {
    if (!auth) return { isError: true, content: [{ type: "text", text: "Authorization required." }] };
    const decision = await limiter(tool === "analysis" ? "mcp_analysis" : "mcp_jobs", authenticatedIdentity(auth));
    if (decision.allowed) return null;
    return { isError: true, content: [{ type: "text", text: retryMessage(decision) }] };
  };
}

function rejection(decision: { retryAfter: number; unavailable?: boolean; allowed: boolean }): Response {
  return Response.json({ error: retryMessage(decision) }, {
    status: decision.unavailable ? 503 : 429,
    headers: { "Cache-Control": "no-store", "Retry-After": String(decision.retryAfter) },
  });
}

export async function protectMcpRequest(
  request: Request,
  limiter: Limiter,
  gate: (request: Request) => Promise<AuthInfo | Response>,
  fetch: (request: Request, auth: AuthInfo) => Promise<Response>,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Response> {
  const admission = await checkLimits(limiter, [
    ["mcp_global", "all"], ["mcp_source", trustedSource(request.headers, env)],
  ]);
  if (!admission.allowed) return rejection(admission);
  const auth = await gate(request);
  if (auth instanceof Response) return auth;
  const identity = await limiter("mcp_identity", authenticatedIdentity(auth));
  if (!identity.allowed) return rejection(identity);
  return fetch(request, auth);
}
