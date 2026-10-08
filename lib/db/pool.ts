import "server-only";
import { Socket } from "node:net";
import { Pool } from "pg";

function createIpv4Socket(): Socket {
  const socket = new Socket();
  const connect = socket.connect.bind(socket);

  // pg calls stream.connect(port, host); pass Node's socket options to keep
  // DNS resolution while avoiding unreachable IPv6 candidates.
  socket.connect = ((port: number, host: string) =>
    connect({ port, host, family: 4, autoSelectFamily: false })) as typeof socket.connect;

  return socket;
}

const connectionString = process.env["DATABASE_URL"];

if (!connectionString) {
  throw new Error("DATABASE_URL must be set before using the PostgreSQL pool.");
}

const globalForPostgres = globalThis as typeof globalThis & {
  postgresPool?: Pool;
};

export const pool =
  globalForPostgres.postgresPool ??
  new Pool({ connectionString, stream: createIpv4Socket });

if (process.env["NODE_ENV"] !== "production") {
  globalForPostgres.postgresPool = pool;
}
