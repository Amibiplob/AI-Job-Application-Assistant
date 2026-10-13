import { Pool } from "pg";
import { cleanupExpiredSessions, parseSessionCleanupArguments } from "./session-cleanup.ts";

// No dotenv import or DATABASE_URL fallback: this is an explicit operator action.
let pool;
let client;
try {
  const options = parseSessionCleanupArguments(process.argv.slice(2));
  const connectionString = process.env.SESSION_CLEANUP_DATABASE_URL;
  if (!connectionString) throw new Error("An operator-supplied cleanup connection is required.");
  pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  client = await pool.connect();
  console.log(JSON.stringify(await cleanupExpiredSessions(client, options)));
} catch {
  console.error("Session cleanup refused, failed or outcome uncertain. Check authorization, exact target, arguments, confirmation, permissions and schema. Run a fresh dry-run before an approved retry.");
  process.exitCode = 1;
} finally {
  client?.release(true);
  await pool?.end().catch(() => {});
}
