import type { PoolClient } from "pg";

// Operator tooling only: never import this module from app/, lib/, or MCP tools.
export type DeletionOptions = { userId: string; databaseName: string; mode: "dry-run" | "delete"; confirmation?: string };
type Counts = { users: number; resumes: number; applications: number; sessions: number; subscription_entitlements?: number; monthly_usage?: number };
type MonetizationTable = "subscription_entitlements" | "monthly_usage";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function parseDeletionArguments(args: string[]): DeletionOptions {
  const values = new Map<string, string>();
  let mode: DeletionOptions["mode"] | undefined;
  for (let index = 0; index < args.length; index++) {
    const flag = args[index];
    if (flag === "--dry-run" || flag === "--delete") {
      if (mode) throw new Error("Select exactly one mode: --dry-run or --delete.");
      mode = flag === "--delete" ? "delete" : "dry-run";
    } else {
      if (!["--user-id", "--database-name", "--confirm"].includes(flag) || values.has(flag)) {
        throw new Error("Unknown or repeated argument.");
      }
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error("Missing argument value.");
      values.set(flag, value);
    }
  }
  const userId = values.get("--user-id") ?? "";
  const databaseName = values.get("--database-name") ?? "";
  if (!UUID.test(userId)) throw new Error("Supply an exact canonical lowercase internal user UUID.");
  if (!databaseName || databaseName !== databaseName.trim() || databaseName.includes("\0")) {
    throw new Error("Supply the exact database name.");
  }
  if (!mode) throw new Error("Select exactly one mode: --dry-run or --delete.");
  if (mode === "delete" && values.get("--confirm") !== userId) {
    throw new Error("Deletion requires --confirm matching the exact user UUID.");
  }
  if (mode === "dry-run" && values.has("--confirm")) throw new Error("Dry-run must not include confirmation.");
  return { userId, databaseName, mode, ...(mode === "delete" ? { confirmation: values.get("--confirm") } : {}) };
}

async function lockMonetizationTables(client: PoolClient, mode: DeletionOptions["mode"]): Promise<MonetizationTable[]> {
  const result = await client.query(`SELECT c.relname FROM pg_catalog.pg_class c
    JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('subscription_entitlements','monthly_usage')`);
  const tables: MonetizationTable[] = result.rows.map(row => row.relname);
  // Names originate only from the fixed catalog allowlist above.
  for (const table of tables) {
    await client.query(`LOCK TABLE public.${table} IN ${mode === "delete" ? "SHARE ROW EXCLUSIVE" : "ACCESS SHARE"} MODE`);
  }
  return tables;
}

async function verifySchema(client: PoolClient, monetizationTables: MonetizationTable[]) {
  const relations = await client.query(`
    SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
      EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,
      EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND (NOT t.tgisinternal OR t.tgenabled <> 'O')) AS unsafe_triggers,
      EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) AS rules,
      EXISTS (SELECT 1 FROM pg_catalog.pg_constraint p WHERE p.conrelid=c.oid AND p.contype='p'
        AND NOT p.condeferrable AND p.convalidated AND p.conkey=ARRAY[
          (SELECT a.attnum FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='id' AND NOT a.attisdropped)]) AS id_primary_key,
      EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='id'
        AND a.atttypid='pg_catalog.uuid'::regtype AND a.attnotnull AND NOT a.attisdropped) AS uuid_id,
      EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='user_id'
        AND a.atttypid='pg_catalog.uuid'::regtype AND a.attnotnull AND NOT a.attisdropped) AS uuid_owner
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname IN ('users','resumes','applications','sessions','jobs')
  `);
  if (relations.rows.length !== 5 || relations.rows.some(row =>
    row.relkind !== "r" || row.relrowsecurity || row.relforcerowsecurity || row.inherited ||
    row.unsafe_triggers || row.rules || !row.id_primary_key || !row.uuid_id ||
    (!["users", "jobs"].includes(row.relname) && !row.uuid_owner))) {
    throw new Error("Unsafe or unexpected table structure, triggers, policies, or keys; deletion refused.");
  }
  const monetization = await client.query(`SELECT c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity,
    EXISTS (SELECT 1 FROM pg_catalog.pg_inherits i WHERE i.inhrelid=c.oid OR i.inhparent=c.oid) AS inherited,
    EXISTS (SELECT 1 FROM pg_catalog.pg_trigger t WHERE t.tgrelid=c.oid AND (NOT t.tgisinternal OR t.tgenabled <> 'O')) AS unsafe_triggers,
    EXISTS (SELECT 1 FROM pg_catalog.pg_rewrite r WHERE r.ev_class=c.oid) AS rules,
    EXISTS (SELECT 1 FROM pg_catalog.pg_attribute a WHERE a.attrelid=c.oid AND a.attname='user_id'
      AND a.atttypid='pg_catalog.uuid'::regtype AND a.attnotnull AND NOT a.attisdropped) AS uuid_owner,
    ARRAY(SELECT a.attname::text FROM pg_catalog.pg_constraint p
      JOIN LATERAL unnest(p.conkey) WITH ORDINALITY k(num,ord) ON true
      JOIN pg_catalog.pg_attribute a ON a.attrelid=p.conrelid AND a.attnum=k.num
      WHERE p.conrelid=c.oid AND p.contype='p' AND NOT p.condeferrable AND p.convalidated ORDER BY k.ord) AS primary_columns
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[])`, [monetizationTables]);
  if (monetization.rows.length !== monetizationTables.length || monetization.rows.some(row =>
    row.relkind !== "r" || row.relrowsecurity || row.relforcerowsecurity || row.inherited ||
    row.unsafe_triggers || row.rules || !row.uuid_owner || row.primary_columns.join(",") !==
      (row.relname === "subscription_entitlements" ? "user_id" : "user_id,metric,month_start"))) {
    throw new Error("Unsafe monetization table structure; deletion refused.");
  }
  // Inspect all incoming AND outgoing foreign keys, across all schemas. Extra
  // dependencies can cascade into unreviewed data and must stop this utility.
  const constraints = await client.query(`
    SELECT ns.nspname AS child_schema, c.relname AS child, nr.nspname AS parent_schema, r.relname AS parent,
      ARRAY(SELECT a.attname::text FROM unnest(f.conkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.num ORDER BY k.ord) AS child_columns,
      ARRAY(SELECT a.attname::text FROM unnest(f.confkey) WITH ORDINALITY k(num,ord)
        JOIN pg_catalog.pg_attribute a ON a.attrelid=r.oid AND a.attnum=k.num ORDER BY k.ord) AS parent_columns,
      f.confdeltype, f.confupdtype, f.confmatchtype, f.convalidated, f.condeferrable
    FROM pg_catalog.pg_constraint f
    JOIN pg_catalog.pg_class c ON c.oid=f.conrelid JOIN pg_catalog.pg_namespace ns ON ns.oid=c.relnamespace
    JOIN pg_catalog.pg_class r ON r.oid=f.confrelid JOIN pg_catalog.pg_namespace nr ON nr.oid=r.relnamespace
    WHERE f.contype='f' AND (
      (ns.nspname='public' AND c.relname IN ('users','resumes','applications','sessions','jobs','subscription_entitlements','monthly_usage')) OR
      (nr.nspname='public' AND r.relname IN ('users','resumes','applications','sessions','jobs','subscription_entitlements','monthly_usage')))
  `);
  const expected = new Set(["resumes:user_id:users:c", "applications:user_id:users:c", "sessions:user_id:users:c", "applications:job_id:jobs:a"]);
  for (const table of monetizationTables) expected.add(`${table}:user_id:users:c`);
  if (constraints.rows.length !== expected.size) throw new Error("Unexpected foreign-key dependencies; deletion refused.");
  for (const row of constraints.rows) {
    const key = `${row.child}:${row.child_columns.join(",")}:${row.parent}:${row.confdeltype}`;
    if (row.child_schema !== "public" || row.parent_schema !== "public" ||
      row.parent_columns.join(",") !== "id" || row.confupdtype !== "a" || row.confmatchtype !== "s" ||
      !row.convalidated || row.condeferrable || !expected.delete(key)) {
      throw new Error("Expected validated immediate cascade constraints are absent; deletion refused.");
    }
  }
}

async function countRecords(client: PoolClient, userId: string, monetizationTables: MonetizationTable[]): Promise<Counts> {
  const { rows } = await client.query(`SELECT
    (SELECT count(*)::int FROM public.users WHERE id=$1::uuid) AS users,
    (SELECT count(*)::int FROM public.resumes WHERE user_id=$1::uuid) AS resumes,
    (SELECT count(*)::int FROM public.applications WHERE user_id=$1::uuid) AS applications,
    (SELECT count(*)::int FROM public.sessions WHERE user_id=$1::uuid) AS sessions`, [userId]);
  const counts: Counts = rows[0];
  for (const table of monetizationTables) {
    const result = await client.query(`SELECT count(*)::int AS count FROM public.${table} WHERE user_id=$1::uuid`, [userId]);
    counts[table] = result.rows[0].count;
  }
  return counts;
}

/** Caller owns this dedicated connection and must dispose it after any failure. */
export async function processWebsiteAccount(client: PoolClient, options: DeletionOptions) {
  // Revalidate even when called without the CLI wrapper.
  parseDeletionArguments(["--user-id", options.userId, "--database-name", options.databaseName,
    options.mode === "delete" ? "--delete" : "--dry-run",
    ...(options.confirmation !== undefined ? ["--confirm", options.confirmation] : [])]);
  if (!["dry-run", "delete"].includes(options.mode)) throw new Error("Invalid mode.");
  await client.query(options.mode === "dry-run" ? "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY" : "BEGIN");
  try {
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    await client.query("SET LOCAL search_path=pg_catalog");
    // A deletion briefly blocks writes to personal-data tables, including DDL
    // that could change the cascade graph after validation. Shared jobs are never written.
    await client.query(options.mode === "delete"
      ? "LOCK TABLE public.users, public.resumes, public.applications, public.sessions IN SHARE ROW EXCLUSIVE MODE"
      : "LOCK TABLE public.users, public.resumes, public.applications, public.sessions IN ACCESS SHARE MODE");
    await client.query("LOCK TABLE public.jobs IN ACCESS SHARE MODE");
    const monetizationTables = await lockMonetizationTables(client, options.mode);
    const identity = await client.query("SELECT current_database() AS name, current_setting('session_replication_role') AS replication_role");
    if (identity.rows[0].name !== options.databaseName || identity.rows[0].replication_role !== "origin") {
      throw new Error("Database identity or constraint enforcement mismatch; operation refused.");
    }
    await verifySchema(client, monetizationTables);
    const before = await countRecords(client, options.userId, monetizationTables);
    if (options.mode === "dry-run") {
      await client.query("ROLLBACK");
      return { status: "dry-run" as const, counts: before };
    }
    if (before.users === 0) {
      if (Object.values(before).some(count => count !== 0)) throw new Error("Orphaned records; deletion refused.");
      await client.query("ROLLBACK");
      return { status: "not-found" as const, counts: before };
    }
    const deleted = await client.query("DELETE FROM public.users WHERE id=$1::uuid", [options.userId]);
    if (deleted.rowCount !== 1) throw new Error("Unexpected deletion result.");
    const after = await countRecords(client, options.userId, monetizationTables);
    if (Object.values(after).some(count => count !== 0)) throw new Error("Dependent records remain; deletion rolled back.");
    await client.query("COMMIT");
    return { status: "website-database-deleted" as const, counts: before };
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    // Never forward pg errors: they may contain row values or connection details.
    throw new Error("Operation failed or outcome could not be confirmed. Re-run dry-run before retrying; no complete-erasure claim is made.");
  }
}
