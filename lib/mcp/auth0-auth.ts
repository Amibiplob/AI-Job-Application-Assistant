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
  interactiveClientIds: ReadonlySet<string>;
};

const verifiedIdentityBrand = Symbol("verified-external-identity");

export type VerifiedExternalIdentity = {
  issuer: string;
  subject: string;
  readonly [verifiedIdentityBrand]: true;
};

const verifiedAuthInfos = new WeakSet<AuthInfo>();

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

  const interactiveClientIds = new Set(
    (env.AUTH0_INTERACTIVE_CLIENT_IDS ?? "")
      .split(",")
      .map((value) => value.trim())
      .filter((value) => /^[A-Za-z0-9_-]{8,128}$/.test(value)),
  );

  return {
    issuer,
    audience,
    jwksUrl: new URL(".well-known/jwks.json", issuerUrl),
    resource: audienceUrl,
    interactiveClientIds,
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
        // Auth0's profile uses azp; RFC 9068 uses client_id. Never silently
        // prefer one signed claim over a contradictory or malformed other one.
        const azp = payload.azp;
        const clientClaim = payload.client_id;
        if (
          (azp !== undefined && (typeof azp !== "string" || !azp.trim())) ||
          (clientClaim !== undefined && (typeof clientClaim !== "string" || !clientClaim.trim())) ||
          (azp !== undefined && clientClaim !== undefined && azp !== clientClaim)
        ) throw invalidToken();
        const clientId = typeof azp === "string" ? azp : typeof clientClaim === "string" ? clientClaim : null;

        if (!clientId || typeof payload.exp !== "number") throw invalidToken();

        const subject = typeof payload.sub === "string" && payload.sub ? payload.sub : null;
        // Code tokens normally omit gty. A reviewed refresh-token user grant
        // may preserve an individual identity. Other grants cannot establish it.
        const individualGrant = payload.gty === undefined || payload.gty === "refresh_token";
        const individualProfile = payload.sub_profile === undefined || payload.sub_profile === "user";
        // Only a separately configured interactive OAuth application may assert
        // an end-user principal. Client-credentials subjects identify software,
        // never a customer, even when their signed `sub` happens to be stable.
        const isInteractiveUser = Boolean(
          subject &&
          config.interactiveClientIds.has(clientId) &&
          individualGrant &&
          individualProfile &&
          payload.act === undefined &&
          subject !== clientId &&
          !subject.endsWith("@clients"),
        );

        const authInfo: AuthInfo = {
          token,
          clientId,
          scopes,
          expiresAt: payload.exp,
          resource: config.resource,
          extra: subject
            ? {
                rateLimitSubject: subject,
                ...(isInteractiveUser
                  ? { externalIdentity: { issuer: config.issuer, subject } }
                  : {}),
              }
            : undefined,
        };
        verifiedAuthInfos.add(authInfo);
        return authInfo;
      } catch {
        throw invalidToken();
      }
    },
  };
}

/** Returns only an identity produced by this verified-token path. Callers must
 * never construct this value from request JSON, email, headers, or account IDs. */
export function externalIdentityFromAuth(auth: AuthInfo): VerifiedExternalIdentity | null {
  if (!verifiedAuthInfos.has(auth)) return null;
  const identity = auth.extra?.externalIdentity;
  if (!identity || typeof identity !== "object") return null;
  const issuer = Reflect.get(identity, "issuer");
  const subject = Reflect.get(identity, "subject");
  if (typeof issuer !== "string" || typeof subject !== "string") return null;
  const verified = { issuer, subject } as VerifiedExternalIdentity;
  Object.defineProperty(verified, verifiedIdentityBrand, { value: true });
  return verified;
}

export function isVerifiedExternalIdentity(value: unknown): value is VerifiedExternalIdentity {
  return Boolean(value && typeof value === "object" && Reflect.get(value, verifiedIdentityBrand) === true);
}

let cachedVerifier:
  | { issuer: string; audience: string; interactiveClients: string; verifier: OAuthTokenVerifier }
  | undefined;

export function getRemoteMcpBearerGate(config: RemoteMcpAuthConfig) {
  const interactiveClients = [...config.interactiveClientIds].sort().join(",");
  if (
    !cachedVerifier ||
    cachedVerifier.issuer !== config.issuer ||
    cachedVerifier.audience !== config.audience ||
    cachedVerifier.interactiveClients !== interactiveClients
  ) {
    cachedVerifier = {
      issuer: config.issuer,
      audience: config.audience,
      interactiveClients,
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
