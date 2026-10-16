import type { PoolConfig } from "pg";

export type IsolatedStaging = { database: string; user: string; host: string; port: number; identity: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export function getIsolatedStagingConfig(env: NodeJS.ProcessEnv = process.env): IsolatedStaging {
  if (env.PADDLE_STAGING_PROFILE !== "isolated" || env.DEPLOYMENT_ENV !== "staging" ||
      env.BILLING_DEPLOYMENT_ENV !== "sandbox" || env.VERCEL || env.VERCEL_ENV || env.DATABASE_URL ||
      !env.PADDLE_STAGING_ID || !uuid.test(env.PADDLE_STAGING_ID) ||
      env.PADDLE_SANDBOX_ENTITLEMENTS_ENABLED !== "false" || env.AUTH0_LINK_ENABLED !== "false" ||
      env.AUTH0_ISSUER || env.AUTH0_AUDIENCE || env.AUTH0_INTERACTIVE_CLIENT_IDS ||
      env.AUTH0_LINK_CLIENT_ID || env.AUTH0_LINK_CLIENT_SECRET || env.AUTH0_LINK_REDIRECT_URI) throw Error("Isolated staging configuration rejected.");
  for (const key of ["PADDLE_SANDBOX_ENABLED", "PADDLE_RECONCILIATION_ENABLED", "PADDLE_WEBHOOK_WORKER_ENABLED"]) {
    if (!["true", "false"].includes(env[key] ?? "")) throw Error("Isolated staging configuration rejected.");
  }
  if (env.PADDLE_SANDBOX_ENABLED !== "true" &&
      [env.PADDLE_RECONCILIATION_ENABLED, env.PADDLE_WEBHOOK_WORKER_ENABLED].includes("true")) throw Error("Isolated staging configuration rejected.");
  if (env.PADDLE_SANDBOX_ENABLED === "true" && (!env.PADDLE_SANDBOX_API_KEY || !env.PADDLE_SANDBOX_CLIENT_TOKEN ||
      !/^[\x21-\x7e]{32,256}$/.test(env.PADDLE_SANDBOX_WEBHOOK_SECRET ?? "") ||
      !/^pri_[a-z0-9]{26}$/.test(env.PADDLE_SANDBOX_PRICE_ID ?? ""))) throw Error("Isolated staging configuration rejected.");
  // Reject live-looking values even before billing is enabled.
  if ((env.PADDLE_SANDBOX_API_KEY && !/^pdl_sdbx_apikey_[A-Za-z0-9_-]{20,256}$/.test(env.PADDLE_SANDBOX_API_KEY)) ||
      (env.PADDLE_SANDBOX_CLIENT_TOKEN && !/^test_[A-Za-z0-9_-]{20,256}$/.test(env.PADDLE_SANDBOX_CLIENT_TOKEN))) throw Error("Isolated staging configuration rejected.");
  try {
    const origin = new URL(env.APP_BASE_URL ?? "");
    if (origin.protocol !== "https:" || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash) throw Error();
    const url = new URL(env.PADDLE_SANDBOX_DATABASE_URL ?? "");
    const database = url.pathname.slice(1), host = url.searchParams.get("host"), user = url.searchParams.get("user");
    const port = Number(url.searchParams.get("port") ?? "5432");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname || url.username || url.password || url.port || url.hash ||
        !/^paddle_sandbox_[a-z0-9_]{1,48}$/.test(database) || !host || !/^\/tmp\/[a-zA-Z0-9_-]+$/.test(host) ||
        !user || !/^paddle_staging_[a-z0-9_]{1,40}$/.test(user) || !Number.isInteger(port) || port < 1 || port > 65535 ||
        [...url.searchParams.keys()].some(key => !["host", "port", "user"].includes(key) || url.searchParams.getAll(key).length !== 1)) throw Error();
    return { database, user, host, port, identity: env.PADDLE_STAGING_ID };
  } catch { throw Error("Isolated staging configuration rejected."); }
}
export function stagingPoolOptions(config: IsolatedStaging): PoolConfig {
  return { host: config.host, port: config.port, user: config.user, database: config.database,
    password: "", ssl: false, options: "", max: 5, connectionTimeoutMillis: 3000,
    query_timeout: 6000, statement_timeout: 5000, application_name: "paddle_isolated_staging" };
}
