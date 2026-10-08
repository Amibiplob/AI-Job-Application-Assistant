import "server-only";
import { Pool } from "pg";

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before using the PostgreSQL pool.");
}

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export const pool =
  globalForPostgres.postgresPool ?? new Pool({ connectionString });

if (process.env["NODE_ENV"] !== "production") {
  globalForPostgres.postgresPool = pool;
}
