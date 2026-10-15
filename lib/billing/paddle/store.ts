import "server-only";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { createMonetizationStore } from "@/lib/monetization/store";
import type { PaddleSandboxConfig } from "./config";
import type { PaddleSandboxClient } from "./client";
import { assertPlanItems, paddleId, projectSandboxSubscription, supportedEvent, type PaddleEvent } from "./protocol";

type Row = {
  user_id: string; intent_id: string; transaction_id: string | null; customer_id: string | null;
  subscription_id: string | null; checkout_state: "creating" | "ready" | "linked";
  subscription_status: string | null; provider_updated_at: Date | null;
  paid_start: Date | null; paid_through: Date | null; reconciled_at: Date | null;
  cancel_at_period_end: boolean;
};
const user = (id: string) => z.uuid().parse(id);

export function createPaddleSandboxStore(db: Pick<Pool, "query" | "connect">, config: PaddleSandboxConfig, api: PaddleSandboxClient) {
  async function locked<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.connect(); let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='15s'");
      const result = await operation(client);
      await client.query("COMMIT"); committed = true; return result;
    } catch { await client.query("ROLLBACK").catch(() => {}); throw new Error("Sandbox billing unavailable or outcome uncertain."); }
    finally { client.release(!committed); }
  }
  async function owner(client: PoolClient, userId: string) {
    const result = await client.query("SELECT id FROM public.users WHERE id=$1::uuid FOR UPDATE", [userId]);
    if (result.rowCount !== 1) throw new Error("Account unavailable.");
  }
  async function session(client: Pick<PoolClient, "query">, userId: string, sessionId: string) {
    const result = await client.query(`SELECT id FROM public.sessions WHERE id=$1::uuid AND user_id=$2::uuid
      AND expires_at>clock_timestamp()`, [sessionId, userId]);
    if (result.rowCount !== 1) throw new Error("Session unavailable.");
  }
  async function reconcile(client: PoolClient, row: Row, subscriptionId: string, eventAt?: string) {
    if (!row.transaction_id) throw new Error("Checkout creation pending.");
    if (row.subscription_id && row.subscription_id !== subscriptionId) throw new Error("Conflicting subscription.");
    // Fetch only AFTER taking the owner lock, serializing all reconciliation
    // reads/writes. Webhook payload state and ordering never grant access.
    const subscription = await api.subscription(subscriptionId);
    const original = await api.transaction(row.transaction_id);
    assertPlanItems(original.items, config.priceId);
    if (original.custom_data?.link_intent !== row.intent_id || original.subscription_id !== subscription.id ||
        original.customer_id !== subscription.customer_id || original.status !== "completed" ||
        (row.customer_id && row.customer_id !== subscription.customer_id)) throw new Error("Checkout relationship mismatch.");
    await api.verifyPrice();
    const projection = projectSandboxSubscription(subscription, await api.latestCompleted(subscription.id), config.priceId);
    if (row.provider_updated_at) {
      const previous = row.provider_updated_at.getTime(), incoming = Date.parse(projection.providerUpdatedAt);
      // Do not acknowledge a stale API replica as successfully reconciled.
      // Roll back the receipt so a later delivery can fetch current state.
      if (incoming < previous) throw new Error("Stale provider state.");
      if ((incoming === previous && row.subscription_status !== projection.status) ||
          (row.subscription_status === "canceled" && projection.status !== "canceled")) throw new Error("Conflicting provider state.");
    }
    await client.query(`UPDATE public.paddle_sandbox_accounts SET
      customer_id=$2, subscription_id=$3, checkout_state='linked', subscription_status=$4,
      provider_updated_at=$5::timestamptz, paid_start=$6::timestamptz, paid_through=$7::timestamptz,
      cancel_at_period_end=$8, reconciled_at=clock_timestamp(),
      last_event_at=GREATEST(last_event_at,$9::timestamptz)
      WHERE user_id=$1::uuid`, [row.user_id, subscription.customer_id, subscription.id, projection.status,
      projection.providerUpdatedAt, projection.paidStart, projection.paidThrough, projection.cancelAtPeriodEnd, eventAt ?? null]);
    // Intentionally NO subscription_entitlements or monthly_usage writes.
  }
  return {
    async checkout(userId: string, sessionId: string): Promise<string> {
      user(userId); user(sessionId);
      await api.verifyPrice();
      const reserved = await locked(async client => {
        await owner(client, userId); await session(client, userId, sessionId);
        const inserted = await client.query<Row>(`INSERT INTO public.paddle_sandbox_accounts(user_id) VALUES ($1::uuid)
          ON CONFLICT (user_id) DO NOTHING RETURNING *`, [userId]);
        if (inserted.rowCount === 1) return { row: inserted.rows[0], create: true };
        const existing = (await client.query<Row>("SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid", [userId])).rows[0];
        if (!existing || existing.checkout_state !== "ready" || !existing.transaction_id) throw new Error("Checkout pending or subscription already exists.");
        return { row: existing, create: false };
      });
      if (!reserved.create) return reserved.row.transaction_id!;
      // Durable reservation precedes external POST. On timeout/uncertain commit,
      // never issue a second create automatically. Operator reconciliation needed.
      const transactionId = await api.createCheckout(reserved.row.intent_id);
      const saved = await db.query(`UPDATE public.paddle_sandbox_accounts SET transaction_id=$3,checkout_state='ready'
        WHERE user_id=$1::uuid AND intent_id=$2::uuid AND checkout_state='creating' RETURNING user_id`,
      [userId, reserved.row.intent_id, transactionId]);
      if (saved.rowCount !== 1) throw new Error("Checkout outcome uncertain.");
      await session(db, userId, sessionId);
      return transactionId;
    },
    async acceptsCheckout(userId: string, transactionId: string): Promise<boolean> {
      user(userId); paddleId("txn").parse(transactionId);
      const result = await db.query(`SELECT 1 FROM public.paddle_sandbox_accounts
        WHERE user_id=$1::uuid AND transaction_id=$2 AND checkout_state='ready'
        AND created_at>statement_timestamp()-interval '1 hour'`, [userId, transactionId]);
      return result.rowCount === 1;
    },
    async status(userId: string) {
      user(userId);
      const result = await db.query<Row>("SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid", [userId]);
      const row = result.rows[0];
      // Return no provider identifiers, API credentials, or inferred Pro grant.
      return row ? { checkoutState: row.checkout_state, subscriptionStatus: row.subscription_status,
        paidThrough: row.paid_through?.toISOString() ?? null, reconciledAt: row.reconciled_at?.toISOString() ?? null,
        cancelAtPeriodEnd: row.cancel_at_period_end } : null;
    },
    async processEvent(event: PaddleEvent) {
      if (!supportedEvent(event)) return { ignored: true };
      return createMonetizationStore(db).withBillingEvent("paddle_sandbox", event.event_id, async client => {
        const isSubscription = event.event_type.startsWith("subscription.");
        const id = paddleId(isSubscription ? "sub" : "txn").parse(event.data.id);
        const intent = z.uuid().safeParse(event.data.custom_data?.link_intent);
        // Custom data is only a lookup hint, never proof of ownership. The
        // canonical original server-created transaction must bind all IDs.
        const found = await client.query<Row>(`SELECT * FROM public.paddle_sandbox_accounts
          WHERE ${isSubscription ? "subscription_id" : "transaction_id"}=$1 OR intent_id=$2::uuid OR subscription_id=$3`,
        [id, intent.success ? intent.data : null, isSubscription ? id : event.data.subscription_id ?? null]);
        if (found.rowCount === 0) return; // Unrelated sandbox catalog/customer.
        if (found.rowCount !== 1) throw new Error("Conflicting account mapping.");
        const userId = found.rows[0].user_id;
        await owner(client, userId);
        const row = (await client.query<Row>("SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid FOR UPDATE", [userId])).rows[0];
        if (!row) throw new Error("Account unavailable.");
        const transaction = !isSubscription ? await api.transaction(id) : null;
        if (transaction && row.transaction_id !== transaction.id && row.subscription_id !== transaction.subscription_id) throw new Error("Unowned transaction.");
        const subId = isSubscription ? id : transaction?.subscription_id;
        if (!subId) return; // Initial failed/canceled checkout cannot grant anything.
        await reconcile(client, row, subId, event.occurred_at);
      });
    },
    async reconcileUser(userId: string, sessionId: string) {
      user(userId); user(sessionId);
      return locked(async client => {
        await owner(client, userId); await session(client, userId, sessionId);
        const row = (await client.query<Row>("SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid FOR UPDATE", [userId])).rows[0];
        if (!row?.transaction_id) throw new Error("Checkout unavailable.");
        const original = await api.transaction(row.transaction_id);
        if (!original.subscription_id) return;
        await reconcile(client, row, original.subscription_id);
      });
    },
  };
}
