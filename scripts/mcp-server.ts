import { McpServer } from "@modelcontextprotocol/server";
import { serveStdio } from "@modelcontextprotocol/server/stdio";

import { getJobById, listJobs } from "@/lib/jobs";
import { pool } from "@/lib/db/pool";
import { registerJobTools } from "@/lib/mcp/register-job-tools";

const serverHandle = serveStdio(
  () => {
    const server = new McpServer({
      name: "ai-job-application-assistant",
      version: "0.1.0",
    });

    registerJobTools(server, { getJobById, listJobs });
    return server;
  },
  {
    onerror(error) {
      // Stdio MCP reserves stdout for protocol messages; diagnostics go to stderr.
      console.error("MCP server error:", error.message);
    },
  },
);

let shutdownPromise: Promise<void> | undefined;

function shutdown(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = (async () => {
      try {
        await serverHandle.close();
      } finally {
        await pool.end();
      }
    })().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "Unknown shutdown error";
      console.error("MCP server shutdown error:", message);
      process.exitCode = 1;
    });
  }

  return shutdownPromise;
}

process.stdin.once("end", () => void shutdown());
process.stdin.once("close", () => void shutdown());
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
