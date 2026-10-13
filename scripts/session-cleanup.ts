import type { PoolClient } from "pg";

// Operator tooling only; never import this module into website or MCP handlers.
export type SessionCleanupOptions = {
  databaseName: string;
  mode: "dry-run" | "delete";
  batchSize: number;
  confirmation?: string;
};
export const MAX_SESSION_CLEANUP_BATCH = 1000;

export function parseSessionCleanupArguments(args: string[]): SessionCleanupOptions {
  const values = new Map<string, string>();
  let mode: SessionCleanupOptions["mode"] | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--dry-run" || flag === "--delete") {
      if (mode) throw new Error("Select exactly one cleanup mode.");
      mode = flag === "--dry-run" ? "dry-run" : "delete";
    } else {
      if (!["--database-name", "--batch-size", "--confirm"].includes(flag) || values.has(flag)) {
        throw new Error("Unknown or repeated cleanup argument.");
      }
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Missing cleanup argument value.");
      values.set(flag, value);
    }
  }
  const databaseName = values.get("--database-name") ?? "";
  const batch = values.get("--batch-size") ?? "100";
  const batchSize = Number(batch);
  if (!databaseName || databaseName !== databaseName.trim() || databaseName.includes("\0")) {
    throw new Error("Supply the exact database name.");
  }
  if (!/^[1-9]\d*$/.test(batch) || !Number.isInteger(batchSize) || batchSize > MAX_SESSION_CLEANUP_BATCH) {
    throw new Error("Batch size must be an integer from 1 to 1000.");
  }
  if (!mode) throw new Error("Select exactly one cleanup mode.");
  if (mode === "delete" && values.get("--confirm") !== databaseName) {
    throw new Error("Deletion confirmation must match the database name.");
  }
  if (mode === "dry-run" && values.has("--confirm")) throw new Error("Dry-run must not include confirmation.");
  return { databaseName, mode, batchSize, ...(mode === "delete" ? { confirmation: values.get("--confirm") } : {}) };
}

async function verifySessionSchema(client: PoolClient) {
  const relation = await client.query(`
    SELECT c.relkind, c.relrowsecurity, c.relforcerowsecurity,
      EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,
      EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND (NOT t.tgisinternal OR t.tgenabled <> 'O')) AS unsafe_triggers,
      EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) AS rules,
      EXISTS (SELECT 1 FROM pg_catalog.pg_constraint p WHERE p.conrelid=c.oid AND p.contype='p'
        AND NOT p.condeferrable AND p.convalidated AND p.conkey=ARRAY[
          (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped)]) AS id_primary_key,
      (SELECT count(*)=2 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid
        AND a.attname IN ('id','user_id') AND a.atttypid='pg_catalog.uuid'::regtype
        AND a.attnotnull AND NOT a.attisdropped) AS uuid_keys,
      EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='expires_at'
        AND a.atttypid='pg_catalog.timestamptz'::regtype AND a.attnotnull AND NOT a.attisdropped) AS expiry_column
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname='sessions'
  `);
  const row = relation.rows[0];
  if (relation.rowCount !== 1 || row.relkind !== "r" || row.relrowsecurity || row.relforcerowsecurity ||
      row.inherited || row.unsafe_triggers || row.rules || !row.id_primary_key || !row.uuid_keys || !row.expiry_column) {
    throw new Error("Unexpected session schema; cleanup refused.");
  }
  // Incoming dependencies could cascade into other data; refuse any new graph.
  const foreignKeys = await client.query(`
    SELECT ns.nspname AS child_schema, c.relname AS child, nr.nspname AS parent_schema, r.relname AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(f.conkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS child_columns,
      ARRAY(SELECT a.attname::text FROM unnest(f.confkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns,
      f.confdeltype, f.confupdtype, f.confmatchtype, f.convalidated, f.condeferrable
    FROM pg_catalog.pg_constraint f
    JOIN pg_catalog.pg_class c ON c.oid=f.conrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_catalog.pg_class r ON r.oid=f.confrelid JOIN pg_catalog.pg_namespace nr ON nr.oid=r.relnamespace
    WHERE f.contype='f' AND ((ns.nspname='public' AND c.relname='sessions') OR
      (nr.nspname='public' AND r.relname='sessions'))
  `);
  const key = foreignKeys.rows[0];
  if (foreignKeys.rowCount !== 1 || key.child_schema !== "public" || key.child !== "sessions" ||
      key.parent_schema !== "public" || key.parent !== "users" ||
      key.child_columns.join(",") !== "user_id" || key.parent_columns.join(",") !== "id" ||
      key.confdeltype !== "c" || key.confupdtype !== "a" || key.confmatchtype !== "s" ||
      !key.convalidated || key.condeferrable) {
    throw new Error("Unexpected session dependencies; cleanup refused.");
  }
}

/** Caller must use a dedicated connection and dispose it after any failure. */
export async function cleanupExpiredSessions(client: PoolClient, options: SessionCleanupOptions) {
  if (!["dry-run", "delete"].includes(options.mode)) throw new Error("Invalid cleanup mode.");
  parseSessionCleanupArguments(["--database-name", options.databaseName, "--batch-size", String(options.batchSize),
    options.mode === "dry-run" ? "--dry-run" : "--delete",
    ...(options.confirmation !== undefined ? ["--confirm", options.confirmation] : [])]);
  try {
    await client.query(options.mode === "dry-run" ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL search_path=pg_catalog");
    await client.query(options.mode === "dry-run"
      ? "LOCK TABLE public.sessions IN ACCESS SHARE MODE"
      : "LOCK TABLE public.sessions IN SHARE ROW EXCLUSIVE MODE");
    const identity = await client.query("SELECT current_database() AS name, current_setting('session_replication_role') AS replication_role");
    if (identity.rows[0].name !== options.databaseName || identity.rows[0].replication_role !== "origin") {
      throw new Error("Database target or constraint enforcement mismatch.");
    }
    await verifySessionSchema(client);
    if (options.mode === "dry-run") {
      const result = await client.query<{ eligible: number }>(
        `SELECT count(*)::int AS eligible FROM (
          SELECT id FROM public.sessions WHERE expires_at <= transaction_timestamp()
          ORDER BY expires_at, id LIMIT $1
        ) AS expired`, [options.batchSize],
      );
      const eligible = result.rows[0]?.eligible;
      if (typeof eligible !== "number" || !Number.isInteger(eligible) || eligible < 0 || eligible > options.batchSize) throw new Error("Invalid cleanup count.");
      await client.query("ROLLBACK");
      return { status: "dry-run" as const, eligible, batchSize: options.batchSize };
    }
    const result = await client.query<{ expired: boolean }>(
      `WITH expired AS (
        SELECT id FROM public.sessions WHERE expires_at <= transaction_timestamp()
        ORDER BY expires_at, id LIMIT $1
      )
      DELETE FROM public.sessions AS s USING expired
      WHERE s.id = expired.id AND s.expires_at <= transaction_timestamp()
      RETURNING s.expires_at <= transaction_timestamp() AS expired`, [options.batchSize],
    );
    if (result.rowCount === null || !Number.isInteger(result.rowCount) || result.rowCount < 0 ||
        result.rowCount > options.batchSize || result.rows.length !== result.rowCount || result.rows.some(row => row.expired !== true)) {
      throw new Error("Unexpected cleanup result.");
    }
    await client.query("COMMIT");
    return { status: "expired-sessions-deleted" as const, deleted: result.rowCount, batchSize: options.batchSize };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("Session cleanup failed or its outcome is uncertain. Run a fresh dry-run before an approved retry.");
  }
}
