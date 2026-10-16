// One bounded pass, called by an operator's external scheduler. No dotenv import,
// project pool, automatic migrations, live API host. Entitlements require the separate sandbox kill switch.
import { Pool } from "pg";
import { assertStagingDatabase, guardStagingPool } from "../lib/staging/database";
import { getSandboxWorkerConfig } from "../lib/billing/paddle/worker-config";
import { createPaddleSandboxClient } from "../lib/billing/paddle/client";
import { createPaddleSandboxStore } from "../lib/billing/paddle/store";

async function main() {
  const config = getSandboxWorkerConfig();
  if (!config) throw new Error("disabled");
  const raw = new Pool({ host: config.host, port: config.port, user: config.user, database: config.database,
    password: "", ssl: false, options: "", max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 6000, statement_timeout: 5000, application_name: "paddle_sandbox_reconcile" });
  const db = config.staging ? guardStagingPool(raw, config.staging) : raw;
  db.on("error", () => { console.error(JSON.stringify({ operation: "paddle_sandbox_reconcile", result: "pool_unavailable" })); process.exitCode = 1; });
  const started = Date.now();
  try {
    const identity = await db.query<{ name: string }>("SELECT current_database() AS name");
    if (config.staging) await assertStagingDatabase(db, config.staging);
    if (identity.rows[0]?.name !== config.database) throw new Error("database mismatch");
    const counts = await createPaddleSandboxStore(db, config.billing, createPaddleSandboxClient(config.billing), () => createPaddleSandboxClient(config.billing, fetch, AbortSignal.timeout(25000))).reconcileBatch();
    console.log(JSON.stringify({ operation: "paddle_sandbox_reconcile", ...counts, durationMs: Date.now() - started }));
    if (counts.blocked > 0 || counts.retry > 0) process.exitCode = 1;
  } finally { await db.end(); }
}
main().catch(() => {
  console.error(JSON.stringify({ operation: "paddle_sandbox_reconcile", result: "disabled_or_failed" }));
  process.exitCode = 1;
});
