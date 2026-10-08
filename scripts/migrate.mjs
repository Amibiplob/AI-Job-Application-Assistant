import "dotenv/config";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pool } from "../lib/db/pool.ts";

const migrationsDirectory = path.join(process.cwd(), "migrations");
let client;
let currentMigration;

try {
  const filenames = (await readdir(migrationsDirectory))
    .filter((filename) => filename.endsWith(".sql"))
    .sort();

  client = await pool.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  for (const filename of filenames) {
    currentMigration = filename;
    const sql = await readFile(path.join(migrationsDirectory, filename), "utf8");

    await client.query("BEGIN");
    try {
      const applied = await client.query(
        "SELECT 1 FROM schema_migrations WHERE filename = $1",
        [filename],
      );

      if (applied.rowCount) {
        await client.query("COMMIT");
        console.log(`Skipped ${filename} (already applied).`);
        continue;
      }

      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
      await client.query("COMMIT");
      console.log(`Applied ${filename}.`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    }
  }

  if (filenames.length === 0) {
    console.log("No SQL migrations found.");
  }
} catch {
  console.error(
    currentMigration
      ? `Database migration failed while applying ${currentMigration}.`
      : "Database migration failed.",
  );
  process.exitCode = 1;
} finally {
  client?.release();
  await pool.end().catch(() => {});
}
