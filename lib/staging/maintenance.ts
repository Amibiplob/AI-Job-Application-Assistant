import type { Pool } from "pg";

export async function cleanupInbox(db: Pick<Pool, "query">, limit = 100) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw Error("Invalid cleanup bound.");
  // Keep the processed-event ledger forever. Pending, processing, failed and
  // ignored records are never automatically removed. Retain done metadata 30 days.
  const result = await db.query(`WITH eligible AS (
    SELECT q.event_id FROM public.paddle_sandbox_webhook_inbox q
    WHERE q.state='done' AND q.finished_at<clock_timestamp()-interval '30 days'
      AND EXISTS(SELECT 1 FROM public.billing_events b WHERE b.provider='paddle_sandbox' AND b.event_id=q.event_id)
    ORDER BY q.finished_at,q.event_id LIMIT $1 FOR UPDATE SKIP LOCKED
  ) DELETE FROM public.paddle_sandbox_webhook_inbox q USING eligible e WHERE q.event_id=e.event_id RETURNING q.event_id`, [limit]);
  return { deleted: result.rowCount ?? 0 };
}
export async function stagingHealth(db: Pick<Pool, "query">) {
  const inbox = await db.query(`SELECT count(*)::int AS retained,
    count(*) FILTER (WHERE state='failed')::int AS failed,
    count(*) FILTER (WHERE state IN ('pending','processing'))::int AS outstanding,
    COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(received_at) FILTER (WHERE state IN ('pending','processing'))),0)::int AS oldest_seconds
    FROM public.paddle_sandbox_webhook_inbox`);
  const accounts = await db.query(`SELECT count(*) FILTER(WHERE reconcile_attempts=3)::int AS exhausted,
    COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(next_reconcile_at) FILTER
      (WHERE transaction_id IS NOT NULL AND reconcile_attempts<3 AND next_reconcile_at<clock_timestamp())),0)::int AS overdue_seconds
    FROM public.paddle_sandbox_accounts`);
  const values = { ...inbox.rows[0], ...accounts.rows[0] };
  return { ...values, healthy: values.retained < 8000 && values.failed === 0 && values.oldest_seconds < 180 &&
    values.exhausted === 0 && values.overdue_seconds < 600 };
}
