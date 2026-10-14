import "server-only";

import type { Pool, PoolClient } from "pg";

export type Plan = "free" | "pro";
export type UsageMetric = "job_analysis";
// Phase 1 internal policy, not published pricing. Never take limits from a client.
export const MONTHLY_LIMITS = Object.freeze({
  free: Object.freeze({ job_analysis: 10 }),
  pro: Object.freeze({ job_analysis: 200 }),
});
export type Entitlement = { plan: Plan; monthlyLimits: typeof MONTHLY_LIMITS[Plan] };
export type Usage = { plan: Plan; used: number; limit: number; remaining: number; monthStart: string; resetsAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const entitlementSql = `SELECT CASE WHEN e.plan = 'pro'
  AND e.status IN ('active', 'trialing')
  AND e.current_period_start <= statement_timestamp()
  AND e.current_period_end > statement_timestamp()
  THEN 'pro' ELSE 'free' END AS plan,
  to_char(date_trunc('month', statement_timestamp() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS month_start,
  to_char(date_trunc('month', statement_timestamp() AT TIME ZONE 'UTC') + interval '1 month', 'YYYY-MM-DD') AS resets_at
  FROM public.users u LEFT JOIN public.subscription_entitlements e ON e.user_id = u.id
  WHERE u.id = $1::uuid`;
type EntitlementRow = { plan: Plan; month_start: string; resets_at: string };

function validateUser(userId: string) {
  if (typeof userId !== "string" || !UUID.test(userId)) throw new Error("A trusted internal user UUID is required.");
}
function validateMetric(metric: UsageMetric) {
  if (metric !== "job_analysis") throw new Error("Unknown usage metric.");
}
function usage(row: EntitlementRow, used: number): Usage {
  const limit = MONTHLY_LIMITS[row.plan].job_analysis;
  return { plan: row.plan, used, limit, remaining: Math.max(0, limit - used),
    monthStart: row.month_start, resetsAt: `${row.resets_at}T00:00:00.000Z` };
}

/** Internal DAL only. IDs must come from verified server identity, never tool input,
 * headers, email matching, or a JWT UUID guess. No authentication is performed here. */
export function createMonetizationStore(db: Pick<Pool, "query" | "connect">) {
  async function readEntitlement(client: Pick<PoolClient, "query">, userId: string) {
    const result = await client.query<EntitlementRow>(entitlementSql, [userId]);
    const row = result.rows[0];
    if (!row || !["free", "pro"].includes(row.plan)) throw new Error("Account unavailable.");
    return row;
  }

  async function transaction<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    let client: PoolClient | undefined;
    let committed = false;
    try {
      client = await db.connect();
      await client.query("BEGIN");
      const result = await operation(client);
      await client.query("COMMIT");
      committed = true;
      return result;
    } catch {
      await client?.query("ROLLBACK").catch(() => {});
      // No raw database errors, row values or connection details escape the DAL.
      // An uncertain commit must not be retried as though it definitely rolled back.
      throw new Error("Monetization operation failed or outcome could not be confirmed.");
    } finally {
      client?.release(!committed);
    }
  }

  return {
    async getEntitlement(userId: string): Promise<Entitlement> {
      validateUser(userId);
      try {
        const row = await readEntitlement(db, userId);
        return { plan: row.plan, monthlyLimits: MONTHLY_LIMITS[row.plan] };
      } catch { throw new Error("Entitlements unavailable."); }
    },

    async getMonthlyUsage(userId: string, metric: UsageMetric): Promise<Usage> {
      validateUser(userId); validateMetric(metric);
      // One statement keeps the entitlement and UTC month snapshot consistent.
      try {
        const result = await db.query<EntitlementRow & { used: number }>(`WITH entitlement AS (${entitlementSql})
          SELECT e.*, COALESCE(m.used, 0)::int AS used FROM entitlement e
          LEFT JOIN public.monthly_usage m ON m.user_id = $1::uuid AND m.metric = $2
            AND m.month_start = e.month_start::date`, [userId, metric]);
        const row = result.rows[0];
        if (!row) throw new Error("Account unavailable.");
        return usage(row, row.used);
      } catch { throw new Error("Usage unavailable."); }
    },

    async consumeMonthlyUsage(userId: string, metric: UsageMetric, amount = 1): Promise<Usage & { allowed: boolean }> {
      validateUser(userId); validateMetric(metric);
      if (!Number.isSafeInteger(amount) || amount < 1 || amount > 200) throw new Error("Invalid usage amount.");
      return transaction(async client => {
        // Serialize this user's admissions across processes; hold the lock through
        // entitlement read + counter mutation and protect against account deletion.
        const owner = await client.query("SELECT id FROM public.users WHERE id = $1::uuid FOR UPDATE", [userId]);
        if (!owner.rowCount) throw new Error("Account unavailable.");
        const row = await readEntitlement(client, userId);
        const limit = MONTHLY_LIMITS[row.plan][metric];
        const result = await client.query<{ used: number }>(`INSERT INTO public.monthly_usage (user_id, metric, month_start, used)
          SELECT $1::uuid, $2, $3::date, $4::int WHERE $4::int <= $5::int
          ON CONFLICT (user_id, metric, month_start) DO UPDATE
          SET used = monthly_usage.used + EXCLUDED.used, updated_at = statement_timestamp()
          WHERE monthly_usage.used <= $5::int - EXCLUDED.used RETURNING used`,
        [userId, metric, row.month_start, amount, limit]);
        const allowed = result.rows.length === 1;
        const used = allowed ? result.rows[0].used : (await client.query<{ used: number }>(
          "SELECT used FROM public.monthly_usage WHERE user_id=$1::uuid AND metric=$2 AND month_start=$3::date",
          [userId, metric, row.month_start])).rows[0]?.used ?? 0;
        return { ...usage(row, used), allowed };
      });
    },

    /** Future verified billing adapter only. Callback must use this transaction's
     * client, lock the user's row before changing entitlements, and avoid external
     * side effects. Deduplication does not authenticate or order provider events. */
    async withBillingEvent(provider: string, eventId: string, apply: (client: PoolClient) => Promise<void>): Promise<{ duplicate: boolean }> {
      if (typeof provider !== "string" || !/^[a-z0-9_-]{1,64}$/.test(provider) ||
          typeof eventId !== "string" || eventId.length < 1 || eventId.length > 255 || /[\s\x00-\x1f]/.test(eventId) ||
          typeof apply !== "function") throw new Error("Invalid billing event.");
      return transaction(async client => {
        const inserted = await client.query(`INSERT INTO public.billing_events(provider, event_id) VALUES ($1, $2)
          ON CONFLICT (provider, event_id) DO NOTHING RETURNING event_id`, [provider, eventId]);
        if (!inserted.rowCount) return { duplicate: true };
        await apply(client);
        return { duplicate: false };
      });
    },
  };
}
