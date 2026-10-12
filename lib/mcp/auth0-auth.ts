import {
  OAuthError,
  OAuthErrorCode,
  requireBearerAuth,
  type AuthInfo,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import {
  createRemoteJWKSet,
  jwtVerify,
  type JWTVerifyGetKey,
} from "jose";

export const MCP_REQUIRED_SCOPE = "jobs:read";
export const MCP_METADATA_PATH = "/.well-known/oauth-protected-resource/api/mcp";

export type RemoteMcpAuthConfig = {
  issuer: string;
  audience: string;
  jwksUrl: URL;
  resource: URL;
};

function isHttpsUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      !url.hostname ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    ) {
      return null;
    }
    return url;
  } catch {
    return null;
  }
}

export function getRemoteMcpAuthConfig(
  env: NodeJS.ProcessEnv = process.env,
): RemoteMcpAuthConfig | null {
  const issuer = env.AUTH0_ISSUER;
  const audience = env.AUTH0_AUDIENCE;
  if (!issuer || !audience || !issuer.endsWith("/")) return null;

  const issuerUrl = isHttpsUrl(issuer);
  const audienceUrl = isHttpsUrl(audience);
  if (!issuerUrl || !audienceUrl || issuerUrl.pathname !== "/") return null;

  return {
    issuer,
    audience,
    jwksUrl: new URL(".well-known/jwks.json", issuerUrl),
    resource: audienceUrl,
  };
}

function invalidToken(): OAuthError {
  return new OAuthError(OAuthErrorCode.InvalidToken, "Invalid access token");
}

export function createAuth0TokenVerifier(
  config: RemoteMcpAuthConfig,
  keySet: JWTVerifyGetKey = createRemoteJWKSet(config.jwksUrl),
): OAuthTokenVerifier {
  return {
    async verifyAccessToken(token): Promise<AuthInfo> {
      try {
        const { payload } = await jwtVerify(token, keySet, {
          algorithms: ["RS256"],
          issuer: config.issuer,
          audience: config.audience,
          requiredClaims: ["exp", "iss", "aud"],
        });

        const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
        if (audiences.length !== 1 || audiences[0] !== config.audience) {
          throw invalidToken();
        }

        const permissions = payload.permissions;
        const scopes = Array.isArray(permissions)
          ? permissions.filter(
              (permission): permission is string =>
                typeof permission === "string" && permission === MCP_REQUIRED_SCOPE,
            )
          : [];
        const clientId =
          typeof payload.azp === "string"
            ? payload.azp
            : typeof payload.client_id === "string"
              ? payload.client_id
              : null;

        if (!clientId || typeof payload.exp !== "number") throw invalidToken();

        return {
          token,
          clientId,
          scopes,
          expiresAt: payload.exp,
          resource: config.resource,
          extra: typeof payload.sub === "string" && payload.sub
            ? { rateLimitSubject: payload.sub } : undefined,
        };
      } catch {
        throw invalidToken();
      }
    },
  };
}

let cachedVerifier:
  | { issuer: string; audience: string; verifier: OAuthTokenVerifier }
  | undefined;

export function getRemoteMcpBearerGate(config: RemoteMcpAuthConfig) {
  if (
    !cachedVerifier ||
    cachedVerifier.issuer !== config.issuer ||
    cachedVerifier.audience !== config.audience
  ) {
    cachedVerifier = {
      issuer: config.issuer,
      audience: config.audience,
      verifier: createAuth0TokenVerifier(config),
    };
  }

  return requireBearerAuth({
    verifier: cachedVerifier.verifier,
    requiredScopes: [MCP_REQUIRED_SCOPE],
    expectedResource: config.resource,
    resourceMetadataUrl: new URL(MCP_METADATA_PATH, config.resource.origin).href,
  });
}

export function createProtectedResourceMetadata(config: RemoteMcpAuthConfig) {
  return {
    resource: config.audience,
    authorization_servers: [config.issuer],
    scopes_supported: [MCP_REQUIRED_SCOPE],
    bearer_methods_supported: ["header"],
  };
}
