import { createHmac } from "node:crypto";
import { isIP } from "node:net";

export const policies = {
  auth_global: [100, 60],
  login_source: [20, 900],
  login_account: [10, 900],
  signup_source: [5, 3600],
  signup_account: [3, 3600],
  mcp_global: [300, 60],
  mcp_source: [120, 60],
  mcp_identity: [60, 60],
  mcp_jobs: [30, 60],
  mcp_analysis: [10, 60],
} as const;
export type Policy = keyof typeof policies;
export type Decision = { allowed: boolean; retryAfter: number; unavailable?: boolean };
export type Query = (sql: string, values: unknown[]) => Promise<{
  rows: { allowed: boolean; retry_after: number }[];
}>;

export const consumeSql = `
INSERT INTO abuse_rate_limits (policy, bucket, attempts, expires_at)
VALUES ($1, $2, 1, statement_timestamp() + make_interval(secs => $4))
ON CONFLICT (policy, bucket) DO UPDATE SET
  attempts = CASE WHEN abuse_rate_limits.expires_at <= statement_timestamp()
    THEN 1 ELSE LEAST(abuse_rate_limits.attempts + 1, $3 + 1) END,
  expires_at = CASE WHEN abuse_rate_limits.expires_at <= statement_timestamp()
    THEN statement_timestamp() + make_interval(secs => $4)
    ELSE abuse_rate_limits.expires_at END
RETURNING attempts <= $3 AS allowed,
  GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expires_at - statement_timestamp()))))::int AS retry_after
`;

export function trustedSource(
  headers: Pick<Headers, "get">,
  env: NodeJS.ProcessEnv = process.env,
): string {
  // Trust the deployment boundary, never a client assertion that it is Vercel.
  const value = env.VERCEL === "1" ? headers.get("x-vercel-forwarded-for") : null;
  if (!value || !isIP(value)) return "shared-untrusted-source";
  // URL serialization canonicalizes equivalent IPv6 spellings.
  try {
    return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname : value;
  } catch {
    return "shared-untrusted-source";
  }
}

export function bucketFor(policy: Policy, identity: string, secret: string): number {
  if (policy.endsWith("_global")) return 0;
  return createHmac("sha256", secret)
    .update(JSON.stringify([policy, identity])).digest().readUInt16BE(0);
}

export function createLimiter(query: Query, env: NodeJS.ProcessEnv = process.env) {
  return async (policy: Policy, identity: string): Promise<Decision> => {
    try {
      const secret = env.RATE_LIMIT_SECRET;
      if (!secret || Buffer.byteLength(secret) < 32) throw new Error("Invalid configuration");
      // Validate every override so partial invalid deployments always fail closed.
      const configured = Object.fromEntries(Object.entries(policies).map(([name, defaults]) => {
        const prefix = `RATE_LIMIT_${name.toUpperCase()}`;
        const limit = Number(env[`${prefix}_LIMIT`] ?? defaults[0]);
        const seconds = Number(env[`${prefix}_WINDOW_SECONDS`] ?? defaults[1]);
        if (!Number.isInteger(limit) || limit < 1 || limit > 1000000 ||
            !Number.isInteger(seconds) || seconds < 1 || seconds > 86400) {
          throw new Error("Invalid configuration");
        }
        return [name, [limit, seconds]];
      }));
      const [limit, seconds] = configured[policy];
      const result = await query(consumeSql, [policy, bucketFor(policy, identity, secret), limit, seconds]);
      const row = result.rows[0];
      if (!row || typeof row.allowed !== "boolean" || !Number.isInteger(row.retry_after) || row.retry_after < 1) {
        throw new Error("Invalid limiter result");
      }
      return { allowed: row.allowed, retryAfter: row.retry_after };
    } catch {
      // Do not log query errors, identities, configuration, or request data.
      return { allowed: false, retryAfter: 60, unavailable: true };
    }
  };
}

export type Limiter = ReturnType<typeof createLimiter>;

export async function checkLimits(limiter: Limiter, checks: [Policy, string][]): Promise<Decision> {
  for (const [policy, identity] of checks) {
    const decision = await limiter(policy, identity);
    if (!decision.allowed) return decision;
  }
  return { allowed: true, retryAfter: 0 };
}

export function retryMessage(decision: Decision): string {
  return decision.unavailable
    ? "This service is temporarily unavailable. Please try again in 60 seconds."
    : `Too many requests. Please try again in ${decision.retryAfter} seconds.`;
}
