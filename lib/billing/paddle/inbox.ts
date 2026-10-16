import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import { z } from "zod";
import { assertVerifiedWebhook, eventSchema, paddleId, supportedEvent, type PaddleEvent } from "./protocol";

type InboxRow = {
  event_id: string; event_type: string; occurred_at: Date; data_id: string;
  subscription_hint: string | null; transaction_hint: string | null; intent_hint: string | null;
  fingerprint: string; attempts: number; lease_token: string;
};
export const INBOX_CAPACITY = 10000;
export const WEBHOOK_JOB_TIMEOUT_MS = 25000;
const RETRY_SECONDS = [60, 300, 1800, 3600];

function minimal(event: PaddleEvent) {
  const supported = supportedEvent(event);
  const intent = z.uuid().safeParse(event.data.custom_data?.link_intent);
  if (supported) paddleId(event.event_type.startsWith("subscription.") ? "sub" : event.event_type.startsWith("adjustment.") ? "adj" : "txn").parse(event.data.id);
  return { event_id: event.event_id, event_type: event.event_type, occurred_at: new Date(event.occurred_at).toISOString(),
    data_id: supported ? event.data.id : "", subscription_hint: supported ? event.data.subscription_id ?? null : null,
    transaction_hint: supported ? event.data.transaction_id ?? null : null, intent_hint: supported && intent.success ? intent.data : null };
}
function eventFrom(row: InboxRow): PaddleEvent {
  return eventSchema.parse({ event_id: row.event_id, event_type: row.event_type, occurred_at: row.occurred_at.toISOString(),
    data: { id: row.data_id, ...(row.subscription_hint ? { subscription_id: row.subscription_hint } : {}),
      ...(row.transaction_hint ? { transaction_id: row.transaction_hint } : {}),
      ...(row.intent_hint ? { custom_data: { link_intent: row.intent_hint } } : {}) } });
}

export function createPaddleWebhookInbox(db: Pick<Pool, "connect" | "query">) {
  async function transaction<T>(operation: (client: PoolClient) => Promise<T>) {
    const client = await db.connect(); let committed = false;
    const connectionError = () => {}; // In-use disconnects surface through the next query, never an unhandled raw error.
    client.on?.("error", connectionError);
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='1s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='35s'");
      const result = await operation(client);
      await client.query("COMMIT"); committed = true; return result;
    } finally {
      // Disconnect on any uncertain outcome. Server rolls back unfinished work;
      // never continue on, or automatically retry, this connection.
      if (committed) client.removeListener?.("error", connectionError);
      client.release(!committed);
    }
  }
  return {
    async ingest(event: PaddleEvent) {
      assertVerifiedWebhook(event); // Only objects returned by raw signature verification.
      const value = minimal(event);
      const fingerprint = createHash("sha256").update(JSON.stringify(value)).digest("hex");
      const client = await db.connect(); const deadline = Date.now() + 1500; let committed = false;
      const connectionError = () => {};
      client.on?.("error", connectionError);
      async function query(sql: string, values?: unknown[]) {
        const remaining = deadline - Date.now();
        if (remaining <= 0) throw Error("Ingestion deadline exceeded.");
        const options = { text: sql, values, query_timeout: Math.min(750, remaining) };
        return client.query(options);
      }
      try {
        await query("BEGIN");
        await query("SET LOCAL statement_timeout='750ms'");
        await query("SET LOCAL lock_timeout='250ms'");
        await query("SET LOCAL idle_in_transaction_session_timeout='2s'");
        await query("SET LOCAL synchronous_commit=on");
        const existing = await query("SELECT fingerprint FROM public.paddle_sandbox_webhook_inbox WHERE event_id=$1", [event.event_id]);
        if (existing.rowCount) {
          if (existing.rows[0].fingerprint !== fingerprint) throw Error("Conflicting event identity.");
          await query("COMMIT"); committed = true; return { duplicate: true };
        }
        // Bound total retained rows, including terminal deduplication tombstones.
        // Global capacity lock is held only for a short ingress tx (250 ms lock timeout).
        await query("SELECT pg_advisory_xact_lock(811011)");
        const count = await query(`SELECT count(*)::int AS count FROM
          (SELECT 1 FROM public.paddle_sandbox_webhook_inbox LIMIT ${INBOX_CAPACITY}) bounded`);
        if (count.rows[0].count >= INBOX_CAPACITY) throw Error("Inbox capacity reached.");
        const inserted = await query(`INSERT INTO public.paddle_sandbox_webhook_inbox
          (event_id,event_type,occurred_at,data_id,subscription_hint,transaction_hint,intent_hint,fingerprint,state,finished_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,CASE WHEN $9='ignored' THEN clock_timestamp() ELSE NULL END)
          ON CONFLICT (event_id) DO NOTHING RETURNING fingerprint`,
        [value.event_id, value.event_type, value.occurred_at, value.data_id, value.subscription_hint,
          value.transaction_hint, value.intent_hint, fingerprint, supportedEvent(event) ? "pending" : "ignored"]);
        // A simultaneous duplicate may have committed since the first lookup.
        if (!inserted.rowCount) {
          const duplicate = await query("SELECT fingerprint FROM public.paddle_sandbox_webhook_inbox WHERE event_id=$1", [event.event_id]);
          if (duplicate.rows[0]?.fingerprint !== fingerprint) throw Error("Conflicting event identity.");
        }
        await query("COMMIT"); committed = true; return { duplicate: !inserted.rowCount };
      } catch { throw Error("Webhook persistence unavailable or outcome uncertain."); }
      finally {
        if (committed) client.removeListener?.("error", connectionError);
        client.release(!committed);
      }
    },

    async claim(): Promise<InboxRow | null> {
      return transaction(async client => {
        // A crash on the last attempt must become visible as terminal failure,
        // rather than remain an unrecoverable processing lease forever.
        await client.query(`WITH exhausted AS (SELECT event_id FROM public.paddle_sandbox_webhook_inbox
          WHERE state='processing' AND lease_until<=clock_timestamp() AND attempts=5
          ORDER BY lease_until LIMIT 10 FOR UPDATE SKIP LOCKED)
          UPDATE public.paddle_sandbox_webhook_inbox q SET state='failed',lease_token=NULL,lease_until=NULL,
            last_error='lease_expired',finished_at=clock_timestamp() FROM exhausted e WHERE q.event_id=e.event_id`);
        const result = await client.query<InboxRow>(`WITH candidate AS (
          SELECT event_id FROM public.paddle_sandbox_webhook_inbox
          WHERE attempts<5 AND ((state='pending' AND next_attempt_at<=clock_timestamp())
            OR (state='processing' AND lease_until<=clock_timestamp()))
          ORDER BY next_attempt_at,event_id LIMIT 1 FOR UPDATE SKIP LOCKED)
          UPDATE public.paddle_sandbox_webhook_inbox q SET state='processing',attempts=attempts+1,
            lease_token=$1::uuid,lease_until=clock_timestamp()+interval '60 seconds',
            last_error=CASE WHEN q.state='processing' THEN 'lease_expired' ELSE q.last_error END
          FROM candidate c WHERE q.event_id=c.event_id RETURNING q.*`, [randomUUID()]);
        return result.rows[0] ?? null;
      });
    },

    async processClaim(job: InboxRow, process: (client: PoolClient, event: PaddleEvent, signal: AbortSignal) => Promise<unknown>, timeoutMs = WEBHOOK_JOB_TIMEOUT_MS) {
      if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > WEBHOOK_JOB_TIMEOUT_MS) throw Error("Invalid job deadline.");
      try {
        return await transaction(async client => {
          const current = await client.query<InboxRow>(`SELECT * FROM public.paddle_sandbox_webhook_inbox
            WHERE event_id=$1 AND state='processing' AND lease_token=$2::uuid AND lease_until>clock_timestamp()
            FOR UPDATE`, [job.event_id, job.lease_token]);
          if (!current.rowCount) return "skipped" as const;
          const signal = AbortSignal.timeout(timeoutMs);
          await process(client, eventFrom(current.rows[0]), signal);
          signal.throwIfAborted();
          const done = await client.query(`UPDATE public.paddle_sandbox_webhook_inbox SET state='done',finished_at=clock_timestamp(),
            lease_token=NULL,lease_until=NULL,last_error=NULL WHERE event_id=$1 AND lease_token=$2::uuid
            AND lease_until>clock_timestamp() RETURNING event_id`, [job.event_id, job.lease_token]);
          if (!done.rowCount) throw Error("Lease expired.");
          signal.throwIfAborted();
          return "done" as const;
        });
      } catch {
        // Business writes and processed-event receipt rolled back together. The
        // token predicate fences a late worker from another worker's new lease.
        const failed = await db.query(`UPDATE public.paddle_sandbox_webhook_inbox SET
          state=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
          next_attempt_at=clock_timestamp()+($3::int * interval '1 second'),
          finished_at=CASE WHEN attempts>=5 THEN clock_timestamp() ELSE NULL END,
          lease_token=NULL,lease_until=NULL,last_error='processing_failed'
          WHERE event_id=$1 AND state='processing' AND lease_token=$2::uuid RETURNING state`,
        [job.event_id, job.lease_token, RETRY_SECONDS[Math.min(job.attempts - 1, 3)]]);
        return !failed.rowCount ? "skipped" as const : failed.rows[0].state === "failed" ? "failed" as const : "retry" as const;
      }
    },

    async runBatch(process: (client: PoolClient, event: PaddleEvent, signal: AbortSignal) => Promise<unknown>, limit = 5) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw Error("Invalid batch limit.");
      const counts = { selected: 0, done: 0, retry: 0, failed: 0, skipped: 0 };
      for (let i = 0; i < limit; i++) {
        const job = await this.claim(); if (!job) break;
        counts.selected++; counts[await this.processClaim(job, process)]++;
      }
      const state = await db.query(`SELECT count(*) FILTER (WHERE state='failed')::int AS blocked,
        count(*) FILTER (WHERE state IN ('pending','processing'))::int AS outstanding,
        COALESCE(EXTRACT(EPOCH FROM clock_timestamp()-min(received_at) FILTER (WHERE state IN ('pending','processing'))),0)::int AS oldest_seconds
        FROM public.paddle_sandbox_webhook_inbox`);
      return { ...counts, ...state.rows[0] };
    },
  };
}
