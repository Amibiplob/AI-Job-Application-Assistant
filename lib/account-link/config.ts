import "server-only";

import type { RemoteMcpAuthConfig } from "@/lib/mcp/auth0-auth";
import { getRemoteMcpAuthConfig } from "@/lib/mcp/auth0-auth";

export type AccountLinkConfig = {
  auth: RemoteMcpAuthConfig;
  clientId: string;
  clientSecret: string;
  appOrigin: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
};

function exactHttpsOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") return null;
    return url.origin;
  } catch { return null; }
}

export function getAccountLinkConfig(env: NodeJS.ProcessEnv = process.env): AccountLinkConfig | null {
  const auth = getRemoteMcpAuthConfig(env);
  const clientId = env.AUTH0_LINK_CLIENT_ID;
  const clientSecret = env.AUTH0_LINK_CLIENT_SECRET;
  const appOrigin = exactHttpsOrigin(env.APP_BASE_URL);
  const redirectUri = env.AUTH0_LINK_REDIRECT_URI;
  if (
    env.AUTH0_LINK_ENABLED !== "true" || !auth || !clientId || !/^[A-Za-z0-9_-]{8,128}$/.test(clientId) ||
    !clientSecret || clientSecret.length < 32 || clientSecret.length > 512 ||
    !appOrigin || redirectUri !== `${appOrigin}/api/account-link/callback` ||
    !auth.interactiveClientIds.has(clientId) || auth.interactiveClientIds.size !== 1
  ) return null;

  return {
    auth,
    clientId,
    clientSecret,
    appOrigin,
    redirectUri,
    authorizationEndpoint: new URL("authorize", auth.issuer).href,
    tokenEndpoint: new URL("oauth/token", auth.issuer).href,
  };
}
