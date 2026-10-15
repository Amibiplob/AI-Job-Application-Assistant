import "server-only";

import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { AccountLinkConfig } from "./config";
import { createAuth0TokenVerifier, externalIdentityFromAuth, MCP_REQUIRED_SCOPE } from "@/lib/mcp/auth0-auth";

function sha256Base64Url(value: string): string {
  return createHash("sha256").update(value, "ascii").digest("base64url");
}

function oidcTokenHash(value: string): string {
  return createHash("sha256").update(value, "ascii").digest().subarray(0, 16).toString("base64url");
}

export function createAuthorizationUrl(config: AccountLinkConfig, state: string, codeVerifier: string, nonce: string): URL {
  const url = new URL(config.authorizationEndpoint);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    audience: config.auth.audience,
    scope: `openid ${MCP_REQUIRED_SCOPE}`,
    state,
    nonce,
    code_challenge: sha256Base64Url(codeVerifier),
    code_challenge_method: "S256",
  }).toString();
  return url;
}

type TokenResponse = { access_token?: unknown; id_token?: unknown; token_type?: unknown };

export async function exchangeAndVerifyAccountLink(
  config: AccountLinkConfig,
  code: string,
  codeVerifier: string,
  nonce: string,
  dependencies: { fetch?: typeof fetch; keySet?: JWTVerifyGetKey } = {},
) {
  if (!/^[\x21-\x7e]{1,4096}$/.test(code)) throw new Error("Account linking failed.");
  const fetcher = dependencies.fetch ?? fetch;
  const keySet = dependencies.keySet ?? createRemoteJWKSet(config.auth.jwksUrl);
  let response: Response;
  try {
    response = await fetcher(config.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Accept": "application/json" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        code_verifier: codeVerifier,
        redirect_uri: config.redirectUri,
      }),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch { throw new Error("Account linking failed."); }
  if (!response.ok) throw new Error("Account linking failed.");

  let tokens: TokenResponse;
  try { tokens = await response.json() as TokenResponse; }
  catch { throw new Error("Account linking failed."); }
  if (typeof tokens.access_token !== "string" || typeof tokens.id_token !== "string" || tokens.token_type !== "Bearer") {
    throw new Error("Account linking failed.");
  }

  let auth;
  try {
    auth = await createAuth0TokenVerifier(config.auth, keySet).verifyAccessToken(tokens.access_token);
  } catch { throw new Error("Account linking failed."); }
  if (auth.clientId !== config.clientId || !auth.scopes.includes(MCP_REQUIRED_SCOPE)) throw new Error("Account linking failed.");
  const identity = externalIdentityFromAuth(auth);
  if (!identity) throw new Error("Account linking failed.");

  let idPayload;
  try {
    ({ payload: idPayload } = await jwtVerify(tokens.id_token, keySet, {
      algorithms: ["RS256"], issuer: config.auth.issuer, audience: config.clientId,
      requiredClaims: ["exp", "iss", "aud", "sub", "nonce"],
    }));
  } catch { throw new Error("Account linking failed."); }
  if (idPayload.nonce !== nonce || idPayload.sub !== identity.subject ||
      (idPayload.azp !== undefined && idPayload.azp !== config.clientId)) throw new Error("Account linking failed.");
  const idAudiences = Array.isArray(idPayload.aud) ? idPayload.aud : [idPayload.aud];
  if (idAudiences.length !== 1 || idAudiences[0] !== config.clientId ||
      typeof idPayload.at_hash !== "string" || idPayload.at_hash !== oidcTokenHash(tokens.access_token)) {
    throw new Error("Account linking failed.");
  }
  return identity;
}

export function isSameOriginPost(request: Request, appOrigin: string): boolean {
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return origin === appOrigin && (!fetchSite || fetchSite === "same-origin");
}
