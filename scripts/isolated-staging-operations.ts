import { spawn } from "node:child_process";
import { Pool } from "pg";
import { getIsolatedStagingConfig, stagingPoolOptions } from "../lib/staging/config";
import { assertStagingDatabase } from "../lib/staging/database";
import { cleanupInbox, stagingHealth } from "../lib/staging/maintenance";

async function main() {
  const mode = process.argv[2];
  if (!["web", "preflight", "webhooks", "reconcile", "cleanup", "health"].includes(mode) || process.argv.length !== 3) throw Error("mode rejected");
  const config = getIsolatedStagingConfig();
  // Validate identity even if a worker's own opt-in flag is off.
  const db = new Pool({ ...stagingPoolOptions(config), max: 1 });
  db.on("error", () => { process.exitCode = 1; });
  const started = Date.now();
  try {
    await assertStagingDatabase(db, config);
    if (["preflight", "cleanup", "health"].includes(mode)) {
      const result = mode === "cleanup" ? await cleanupInbox(db) : mode === "health" ? await stagingHealth(db) : { isolated: true };
      console.log(JSON.stringify({ operation: `staging_${mode}`, ...result, durationMs: Date.now() - started }));
      if ("healthy" in result && !result.healthy) process.exitCode = 1;
      return;
    }
  } finally { await db.end(); }
  const command = mode === "web" ? ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3100"] :
    ["--conditions=react-server", "--import", "tsx", mode === "webhooks" ? "scripts/process-paddle-sandbox-webhooks.ts" : "scripts/reconcile-paddle-sandbox.ts"];
  const child = spawn(process.execPath, command, { env: process.env, stdio: "inherit" });
  process.once("SIGTERM", () => child.kill("SIGTERM")); process.once("SIGINT", () => child.kill("SIGTERM"));
  let forced: ReturnType<typeof setTimeout> | undefined;
  const timer = mode === "web" ? undefined : setTimeout(() => {
    child.kill("SIGTERM");
    forced = setTimeout(() => child.kill("SIGKILL"), 10000);
  }, 180000);
  const code = await new Promise<number>(resolve => { child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1)); child.once("error", () => resolve(1)); });
  clearTimeout(timer); clearTimeout(forced);
  process.exitCode = code;
}
main().catch(() => { console.error(JSON.stringify({ operation: "isolated_staging", result: "configuration_or_database_rejected" })); process.exitCode = 1; });
