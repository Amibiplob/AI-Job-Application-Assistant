import "server-only";
import { Socket } from "node:net";
import { Pool } from "pg";
import { getIsolatedStagingConfig, stagingPoolOptions } from "@/lib/staging/config";
import { guardStagingPool } from "@/lib/staging/database";

function createIpv4Socket(): Socket {
  const socket = new Socket();
  const connect = socket.connect.bind(socket);

  // pg calls stream.connect(port, host); pass Node's socket options to keep
  // DNS resolution while avoiding unreachable IPv6 candidates.
  socket.connect = ((port: number, host: string) =>
    connect({ port, host, family: 4, autoSelectFamily: false })) as typeof socket.connect;

  return socket;
}

const staging = process.env.PADDLE_STAGING_PROFILE === undefined ? null : getIsolatedStagingConfig();
// Sandbox web traffic must opt into the isolated profile; never reuse a normal
// deployment's DATABASE_URL because someone enabled only the billing switch.
if (!staging && process.env.PADDLE_SANDBOX_ENABLED === "true") throw Error("Sandbox website requires isolated staging profile.");
const connectionString = process.env["DATABASE_URL"];

if (!staging && !connectionString) {
  throw new Error("DATABASE_URL must be set before using the PostgreSQL pool.");
}

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
  postgresPoolScope?: string;
};

const scope = staging ? `isolated:${staging.identity}` : "normal";
if (globalForPostgres.postgresPool && (globalForPostgres.postgresPoolScope ?? "normal") !== scope) throw Error("Database profile changed; restart required.");
export const pool =
  globalForPostgres.postgresPool ??
  (staging ? guardStagingPool(new Pool(stagingPoolOptions(staging)), staging)
    : new Pool({ connectionString, stream: createIpv4Socket }));

if (staging && !globalForPostgres.postgresPool) pool.on("error", () => {
  console.error(JSON.stringify({ operation: "isolated_staging_pool", result: "unavailable" }));
});

if (process.env["NODE_ENV"] !== "production") {
  globalForPostgres.postgresPool = pool;
  globalForPostgres.postgresPoolScope = scope;
}
