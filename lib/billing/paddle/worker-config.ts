import "server-only";
import { getPaddleSandboxConfig } from "./config";

export function getSandboxWorkerConfig(env: NodeJS.ProcessEnv = process.env) {
  const billing = getPaddleSandboxConfig(env);
  if (!billing || env.PADDLE_RECONCILIATION_ENABLED !== "true") return null;
  try {
    // Separate connection only: no DATABASE_URL fallback, localhost TCP or remote
    // hosts. Initial worker rollout is restricted to an isolated Unix socket.
    const url = new URL(env.PADDLE_SANDBOX_DATABASE_URL ?? "");
    const database = url.pathname.slice(1);
    const socket = url.searchParams.get("host");
    const user = url.searchParams.get("user");
    const port = Number(url.searchParams.get("port") ?? "5432");
    if (!["postgres:", "postgresql:"].includes(url.protocol) || url.hostname || url.port || url.password || url.username ||
        !/^paddle_sandbox_[a-z0-9_]{1,48}$/.test(database) ||
        !socket || !/^\/tmp\/[a-zA-Z0-9_-]+$/.test(socket) ||
        !user || !/^[a-z_][a-z0-9_]{0,62}$/.test(user) ||
        Array.from(url.searchParams.keys()).some(key => !["host", "port", "user"].includes(key) || url.searchParams.getAll(key).length !== 1) ||
        !Number.isInteger(port) || port < 1 || port > 65535) return null;
    return { billing, database, host: socket, port, user };
  } catch { return null; }
}
