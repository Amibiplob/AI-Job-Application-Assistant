import "server-only";
import { getIsolatedStagingConfig } from "../../staging/config";
import { getPaddleSandboxConfig } from "./config";

export function getSandboxWorkerConfig(env: NodeJS.ProcessEnv = process.env, worker: "reconciliation" | "webhook" = "reconciliation") {
  const billing = getPaddleSandboxConfig(env);
  if (!billing || (worker === "webhook" ? env.PADDLE_WEBHOOK_WORKER_ENABLED : env.PADDLE_RECONCILIATION_ENABLED) !== "true") return null;
  try {
    // No legacy URL-only bypass: direct CLI calls require the same identity and
    // disabled activation/linking profile as the private scheduler and website.
    const staging = getIsolatedStagingConfig(env);
    return { billing, database: staging.database, host: staging.host, port: staging.port, user: staging.user, staging };
  } catch { return null; }
}
