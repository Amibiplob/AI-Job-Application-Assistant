import "server-only";
import { Pool } from "pg";
import { pool } from "@/lib/db/pool";

// Isolate webhook acknowledgment from matching/provider workers' pool occupancy.
// Reuse the application's reviewed connection/IPv4 options; never a new host.
const shared = globalThis as typeof globalThis & { paddleIngestionPool?: Pool };
export const ingestionPool = shared.paddleIngestionPool ?? new Pool({ ...pool.options,
  max: 2, connectionTimeoutMillis: 250, query_timeout: 750, statement_timeout: 750,
  application_name: "paddle_sandbox_ingest" });
if (!shared.paddleIngestionPool) ingestionPool.on("error", () => {
  console.warn(JSON.stringify({ operation: "paddle_sandbox_ingest_pool", result: "unavailable" }));
});
shared.paddleIngestionPool = ingestionPool;
