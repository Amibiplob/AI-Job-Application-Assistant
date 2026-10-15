import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { getAccountLinkConfig } from "@/lib/account-link/config";
import { exchangeAndVerifyAccountLink } from "@/lib/account-link/oauth";
import { createAccountLinkTransactionStore } from "@/lib/account-link/store";
import { createExternalIdentityStore } from "@/lib/mcp/identity-store";

export const runtime = "nodejs";

function result(configuredOrigin: string, outcome: "success" | "failed"): Response {
  const url = new URL("/connect", configuredOrigin);
  url.searchParams.set("link", outcome);
  return privateRedirect(url, 303);
}

export async function GET(request: Request): Promise<Response> {
  const config = getAccountLinkConfig();
  if (!config) return new Response("Account linking is not configured.", { status: 503, headers: { "Cache-Control": "no-store" } });
  const incoming = new URL(request.url);
  if (`${incoming.origin}${incoming.pathname}` !== config.redirectUri) return result(config.appOrigin, "failed");
  const session = await getSession();
  if (!session) return privateRedirect(new URL("/login", config.appOrigin), 303);

  const states = incoming.searchParams.getAll("state");
  const codes = incoming.searchParams.getAll("code");
  if (states.length !== 1) return result(config.appOrigin, "failed");
  let pending;
  try {
    pending = await createAccountLinkTransactionStore(pool).consume(states[0], session.userId, session.id);
  } catch { return result(config.appOrigin, "failed"); }
  if (!pending || incoming.searchParams.has("error") || codes.length !== 1) return result(config.appOrigin, "failed");

  try {
    const identity = await exchangeAndVerifyAccountLink(config, codes[0], pending.codeVerifier, pending.nonce);
    await createExternalIdentityStore(pool).link(session.userId, identity, session.id);
    return result(config.appOrigin, "success");
  } catch {
    return result(config.appOrigin, "failed");
  }
}

function privateRedirect(url: string | URL, status: number): Response {
  return new Response(null, { status, headers: {
    Location: String(url), "Cache-Control": "no-store", "Referrer-Policy": "no-referrer",
  } });
}
