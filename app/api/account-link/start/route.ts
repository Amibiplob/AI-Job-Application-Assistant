import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { getAccountLinkConfig } from "@/lib/account-link/config";
import { createAuthorizationUrl, isSameOriginPost } from "@/lib/account-link/oauth";
import { createAccountLinkTransactionStore } from "@/lib/account-link/store";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const config = getAccountLinkConfig();
  if (!config) return new Response("Account linking is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  if (!isSameOriginPost(request, config.appOrigin)) return new Response("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  const session = await getSession();
  if (!session) return privateRedirect(new URL("/login", config.appOrigin), 303);

  try {
    const pending = await createAccountLinkTransactionStore(pool).create(session.userId, session.id);
    return privateRedirect(createAuthorizationUrl(config, pending.state, pending.codeVerifier, pending.nonce), 303);
  } catch {
    return new Response("Account linking is unavailable.", { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

function privateRedirect(url: string | URL, status: number): Response {
  return new Response(null, { status, headers: {
    Location: String(url), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
