import "dotenv/config";

let pool;

try {
  ({ pool } = await import("../lib/db/pool.ts"));
  await pool.query("SELECT 1");
  console.log("PostgreSQL connection successful.");
} catch (error) {
  const code =
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
      ? ` (${error.code})`
      : "";

  console.error(`PostgreSQL connection check failed${code}.`);
  process.exitCode = 1;
} finally {
  await pool?.end().catch(() => {});
}
