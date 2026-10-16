import { Pool, type PoolClient } from "pg";
import type { IsolatedStaging } from "./config";

// Provisioner-owned marker and nonprivileged runtime role. No DDL or fallback.
export async function assertStagingDatabase(db: Pick<PoolClient, "query">, config: IsolatedStaging) {
  const result = await db.query(`SELECT current_database() AS database,current_user AS role,
    i.identity::text AS identity,r.rolsuper,r.rolcreatedb,r.rolcreaterole,r.rolbypassrls,
    EXISTS(SELECT 1 FROM pg_auth_members WHERE member=r.oid) AS memberships,
    d.datdba=r.oid OR pg_has_role(current_user,d.datdba,'MEMBER') AS owns_database,
    c.relkind,c.relrowsecurity,c.relforcerowsecurity,
    c.relowner=r.oid OR pg_has_role(current_user,c.relowner,'MEMBER') AS owns_marker,
    n.nspowner=r.oid OR pg_has_role(current_user,n.nspowner,'MEMBER') AS owns_schema,
    has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER') AS mutable_marker,
    has_schema_privilege(current_user,n.oid,'CREATE') AS mutable_schema,
    EXISTS(SELECT 1 FROM pg_database WHERE datallowconn AND NOT datistemplate
      AND datname NOT IN (current_database(),'postgres')) AS other_databases
    FROM staging_guard.identity i
    JOIN pg_roles r ON r.rolname=current_user
    JOIN pg_database d ON d.datname=current_database()
    JOIN pg_namespace n ON n.nspname='staging_guard'
    JOIN pg_class c ON c.relnamespace=n.oid AND c.relname='identity'`);
  const row = result.rows[0];
  if (result.rowCount !== 1 || row.database !== config.database || row.role !== config.user || row.identity !== config.identity ||
      row.rolsuper || row.rolcreatedb || row.rolcreaterole || row.rolbypassrls || row.memberships || row.owns_database ||
      row.owns_marker || row.owns_schema || row.mutable_marker || row.mutable_schema || row.other_databases ||
      row.relkind !== "r" || row.relrowsecurity || row.relforcerowsecurity) throw Error("Staging database identity rejected.");
}

/** Guard every checkout. Never cache verification across connections/restarts. */
export function guardStagingPool(raw: Pool, config: IsolatedStaging): Pool {
  async function connect() {
    const client = await raw.connect();
    try { await assertStagingDatabase(client, config); return client; }
    catch { client.release(true); throw Error("Staging database identity rejected."); }
  }
  return new Proxy(raw, { get(target, property) {
    if (property === "connect") return connect;
    if (property === "query") return async (...args: Parameters<PoolClient["query"]>) => {
      const client = await connect();
      try { return await Reflect.apply(client.query, client, args); } finally { client.release(); }
    };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
}
