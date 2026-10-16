// Private server-side entry point. No inherited app/PG/Node credentials, shell,
// network scheduler endpoint or dotenv fallback. Never invokes migrations.
import { constants } from "node:fs";
import { open } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowed = new Set(["web", "preflight", "webhooks", "reconcile", "cleanup", "health"]);
async function main() {
  const [mode, filename, ...extra] = process.argv.slice(2);
  if (!allowed.has(mode) || extra.length || !filename || !path.isAbsolute(filename) ||
      filename === root || filename.startsWith(root + path.sep)) throw Error("configuration rejected");
  const file = await open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  let values;
  try {
    const stat = await file.stat();
    if (!stat.isFile() || stat.uid !== process.getuid() || (stat.mode & 0o777) !== 0o600 || stat.size > 16384) throw Error("configuration rejected");
    values = parse(await file.readFile());
  } finally { await file.close(); }
  const permitted = new Set(["PADDLE_STAGING_PROFILE", "PADDLE_STAGING_ID", "PADDLE_SANDBOX_DATABASE_URL", "DEPLOYMENT_ENV",
    "BILLING_DEPLOYMENT_ENV", "APP_BASE_URL", "RATE_LIMIT_SECRET", "PADDLE_SANDBOX_ENABLED", "PADDLE_SANDBOX_API_KEY",
    "PADDLE_SANDBOX_WEBHOOK_SECRET", "PADDLE_SANDBOX_CLIENT_TOKEN", "PADDLE_SANDBOX_PRICE_ID", "PADDLE_RECONCILIATION_ENABLED",
    "PADDLE_WEBHOOK_WORKER_ENABLED", "PADDLE_SANDBOX_ENTITLEMENTS_ENABLED", "AUTH0_LINK_ENABLED"]);
  if (Object.keys(values).some(key => !permitted.has(key)) || !values.RATE_LIMIT_SECRET || values.RATE_LIMIT_SECRET.length < 32) throw Error("configuration rejected");
  // Explicit empties prevent Next's .env files from supplying inherited secrets.
  const env = { PATH: process.env.PATH ?? "/usr/bin:/bin", NODE_ENV: "production", NODE_OPTIONS: "", TZ: "UTC",
    DATABASE_URL: "", VERCEL: "", VERCEL_ENV: "", AUTH0_ISSUER: "", AUTH0_AUDIENCE: "", AUTH0_INTERACTIVE_CLIENT_IDS: "",
    AUTH0_LINK_CLIENT_ID: "", AUTH0_LINK_CLIENT_SECRET: "", AUTH0_LINK_REDIRECT_URI: "", ...values };
  for (const key of permitted) if (!(key in env)) env[key] = "";
  const args = ["--conditions=react-server", "--import", "tsx", "scripts/isolated-staging-operations.ts", mode];
  const child = spawn(process.execPath, args, { cwd: root, env, stdio: ["ignore", "inherit", "inherit"] });
  const abort = () => child.kill("SIGTERM");
  process.once("SIGTERM", abort); process.once("SIGINT", abort);
  const code = await new Promise((resolve, reject) => { child.once("exit", (code, signal) => resolve(signal ? 1 : code ?? 1)); child.once("error", reject); });
  process.exitCode = code;
}
main().catch(() => {
  console.error(JSON.stringify({ operation: "isolated_staging", result: "configuration_or_authorization_rejected" }));
  process.exitCode = 1;
});
