import "server-only";
import { Pool } from "pg";
import { pool } from "@/lib/db/pool";
import { getIsolatedStagingConfig } from "@/lib/staging/config";
import { guardStagingPool } from "@/lib/staging/database";

// Isolate webhook acknowledgment from matching/provider workers' pool occupancy.
// Reuse the application's reviewed connection/IPv4 options; never a new host.
const shared = globalThis as typeof globalThis & { paddleIngestionPool?: Pool; paddleIngestionScope?: string };
const staging = process.env.PADDLE_STAGING_PROFILE === undefined ? null : getIsolatedStagingConfig();
const scope = staging ? `isolated:${staging.identity}` : "normal";
if (shared.paddleIngestionPool && (shared.paddleIngestionScope ?? "normal") !== scope) throw Error("Database profile changed; restart required.");
const raw = shared.paddleIngestionPool ?? new Pool({ ...pool.options,
  max: 2, connectionTimeoutMillis: 250, query_timeout: 750, statement_timeout: 750,
  application_name: "paddle_sandbox_ingest" });
export const ingestionPool = shared.paddleIngestionPool ?? (staging ? guardStagingPool(raw, staging) : raw);
if (!shared.paddleIngestionPool) ingestionPool.on("error", () => {
  console.warn(JSON.stringify({ operation: "paddle_sandbox_ingest_pool", result: "unavailable" }));
});
shared.paddleIngestionPool = ingestionPool;
shared.paddleIngestionScope = scope;
