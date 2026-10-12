import { Pool } from "pg";
import { parseDeletionArguments, processWebsiteAccount } from "./account-deletion.ts";

// Deliberately no dotenv import and no fallback to the website DATABASE_URL.
let pool;
let client;
try {
  const options = parseDeletionArguments(process.argv.slice(2));
  const connectionString = process.env.ACCOUNT_DELETION_DATABASE_URL;
  if (!connectionString) throw new Error("An operator-supplied database connection is required.");
  pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5000 });
  client = await pool.connect();
  const result = await processWebsiteAccount(client, options);
  console.log(JSON.stringify(result));
  console.log("Website database scope only. Auth0, ChatGPT, backups, logs, and other retained copies are separate.");
} catch {
  console.error("Account operation refused or failed. Check exact arguments, confirmation, operator connection, database name, and schema. If connection failed during commit, check dry-run before retrying. No complete-erasure claim is made.");
  process.exitCode = 1;
} finally {
  client?.release(true);
  await pool?.end().catch(() => {});
}
