// One bounded durable-inbox pass. No dotenv, project DB fallback, migration or scheduler.
import { Pool } from "pg";
import { getSandboxWorkerConfig } from "../lib/billing/paddle/worker-config";
import { createPaddleWebhookInbox } from "../lib/billing/paddle/inbox";
import { createPaddleSandboxClient } from "../lib/billing/paddle/client";
import { createPaddleSandboxStore } from "../lib/billing/paddle/store";

async function main() {
  const config = getSandboxWorkerConfig(process.env, "webhook");
  if (!config) throw Error("disabled");
  const db = new Pool({ host: config.host, port: config.port, user: config.user, database: config.database,
    password: "", ssl: false, options: "", max: 2, connectionTimeoutMillis: 3000,
    query_timeout: 6000, statement_timeout: 5000, application_name: "paddle_sandbox_webhooks" });
  db.on("error", () => {
    console.error(JSON.stringify({ operation: "paddle_sandbox_webhooks", result: "pool_unavailable" }));
    process.exitCode = 1;
  });
  const started = Date.now();
  try {
    const identity = await db.query<{ name: string }>("SELECT current_database() AS name");
    if (identity.rows[0]?.name !== config.database) throw Error("database mismatch");
    const counts = await createPaddleWebhookInbox(db).runBatch((client, event, signal) =>
      createPaddleSandboxStore(db, config.billing, createPaddleSandboxClient(config.billing, fetch, signal))
        .processEventInTransaction(client, event));
    console.log(JSON.stringify({ operation: "paddle_sandbox_webhooks", ...counts, durationMs: Date.now() - started }));
    if (counts.blocked > 0 || counts.retry > 0) process.exitCode = 1;
  } finally { await db.end(); }
}
main().catch(() => {
  console.error(JSON.stringify({ operation: "paddle_sandbox_webhooks", result: "disabled_or_failed" }));
  process.exitCode = 1;
});
