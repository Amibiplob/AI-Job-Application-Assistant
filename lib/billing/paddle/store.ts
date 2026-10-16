import "server-only";
import { z } from "zod";
import type { Pool, PoolClient } from "pg";
import { sandboxEntitlementsEnabled, type PaddleSandboxConfig } from "./config";
import type { PaddleSandboxClient } from "./client";
import { assertPlanItems, paddleId, paymentIsRevoked, projectSandboxSubscription, supportedEvent, type PaddleEvent, type Adjustment } from "./protocol";

type Row = {
  user_id: string; intent_id: string; transaction_id: string | null; customer_id: string | null;
  subscription_id: string | null; checkout_state: "creating" | "ready" | "linked";
  subscription_status: string | null; provider_updated_at: Date | null;
  paid_start: Date | null; paid_through: Date | null; reconciled_at: Date | null;
  cancel_at_period_end: boolean;
  verified_payment_id: string | null; payment_revoked: boolean;
  reconcile_attempts: number;
};
const user = (id: string) => z.uuid().parse(id);

export function createPaddleSandboxStore(db: Pick<Pool, "query" | "connect">, config: PaddleSandboxConfig, api: PaddleSandboxClient, accountApi?: () => PaddleSandboxClient) {
  async function locked<T>(operation: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await db.connect(); let committed = false;
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout='5s'");
      await client.query("SET LOCAL statement_timeout='5s'");
      await client.query("SET LOCAL idle_in_transaction_session_timeout='35s'");
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
  async function reconcile(client: PoolClient, row: Row, subscriptionId: string, eventAt?: string, adjustment?: Adjustment | null, provider: PaddleSandboxClient = api) {
    if (!row.transaction_id) throw new Error("Checkout creation pending.");
    if (row.subscription_id && row.subscription_id !== subscriptionId) throw new Error("Conflicting subscription.");
    // Fetch only AFTER taking the owner lock, serializing all reconciliation
    // reads/writes. Webhook payload state and ordering never grant access.
    const subscription = await provider.subscription(subscriptionId);
    const original = await provider.transaction(row.transaction_id);
    assertPlanItems(original.items, config.priceId);
    if (original.currency_code !== "USD" || original.custom_data?.link_intent !== row.intent_id || original.subscription_id !== subscription.id ||
        original.customer_id !== subscription.customer_id || original.status !== "completed" ||
        (row.customer_id && row.customer_id !== subscription.customer_id)) throw new Error("Checkout relationship mismatch.");
    await provider.verifyPrice();
    const completed = await provider.latestCompleted(subscription.id);
    const projection = projectSandboxSubscription(subscription, completed, config.priceId);
    // A canonical single adjustment read is also evidence: a stale list must
    // not hide a refund already confirmed by the provider's detail endpoint.
    const revoked = completed ? paymentIsRevoked(completed, await provider.adjustments(completed.id)) ||
      (adjustment?.transaction_id === completed.id && paymentIsRevoked(completed, [adjustment])) ||
      (row.verified_payment_id === completed.id && row.payment_revoked) : false;
    // Subscription updated_at does not order transactions or adjustments.
    // Keep a refund sticky for that payment, and reject regressing payment reads.
    if (row.paid_through && (!projection.paidThrough || Date.parse(projection.paidThrough) < row.paid_through.getTime() ||
        !projection.paidStart || Date.parse(projection.paidStart) < row.paid_start!.getTime() ||
        (row.verified_payment_id && row.verified_payment_id !== completed?.id && Date.parse(projection.paidThrough) <= row.paid_through.getTime()))) {
      throw new Error("Stale or conflicting payment state.");
    }
    if (row.provider_updated_at) {
      const previous = row.provider_updated_at.getTime(), incoming = Date.parse(projection.providerUpdatedAt);
      // Do not acknowledge a stale API replica as successfully reconciled.
      // Roll back the receipt so a later delivery can fetch current state.
      if (incoming < previous) throw new Error("Stale provider state.");
      if ((incoming === previous && row.subscription_status !== projection.status) ||
          (row.subscription_status === "canceled" && projection.status !== "canceled")) throw new Error("Conflicting provider state.");
    }
    provider.checkDeadline?.();
    await client.query(`UPDATE public.paddle_sandbox_accounts SET
      customer_id=$2, subscription_id=$3, checkout_state='linked', subscription_status=$4,
      provider_updated_at=$5::timestamptz, paid_start=$6::timestamptz, paid_through=$7::timestamptz,
      cancel_at_period_end=$8, reconciled_at=clock_timestamp(),
      last_event_at=GREATEST(last_event_at,$9::timestamptz),
      verified_payment_id=$10, payment_revoked=$11, reconcile_attempts=0,
      next_reconcile_at=clock_timestamp()+interval '15 minutes', last_reconcile_result='ok'
      WHERE user_id=$1::uuid`, [row.user_id, subscription.customer_id, subscription.id, projection.status,
      projection.providerUpdatedAt, projection.paidStart, projection.paidThrough, projection.cancelAtPeriodEnd, eventAt ?? null, completed?.id ?? null, revoked]);
    // Same transaction and owner lock as billing state, receipt and quota writers.
    // Refuse to overwrite entitlements managed by another provider/operator.
    if (sandboxEntitlementsEnabled()) {
      const result = await client.query(`INSERT INTO public.subscription_entitlements
        (user_id,source,source_subscription_id,plan,status,current_period_start,current_period_end,cancel_at_period_end)
        VALUES ($1::uuid,'paddle_sandbox',$2,$3,$4,$5::timestamptz,$6::timestamptz,$7)
        ON CONFLICT (user_id) DO UPDATE SET plan=EXCLUDED.plan,status=EXCLUDED.status,
          current_period_start=EXCLUDED.current_period_start,current_period_end=EXCLUDED.current_period_end,
          cancel_at_period_end=EXCLUDED.cancel_at_period_end,updated_at=clock_timestamp()
        WHERE subscription_entitlements.source='paddle_sandbox'
          AND subscription_entitlements.source_subscription_id=EXCLUDED.source_subscription_id
        RETURNING user_id`, [row.user_id, subscription.id,
        projection.wouldBePro && !revoked ? "pro" : "free",
        projection.wouldBePro && !revoked ? "active" : "inactive",
        projection.paidStart, projection.paidThrough, projection.cancelAtPeriodEnd]);
      if (result.rowCount !== 1) throw new Error("Conflicting entitlement ownership.");
    }
  }
  // Internal worker entry point: caller owns BEGIN/COMMIT and the inbox lease.
  // Receipt, billing projection and entitlement writes share that transaction.
  async function processEventInTransaction(client: PoolClient, event: PaddleEvent) {
    if (!supportedEvent(event)) return { ignored: true };
    const inserted = await client.query(`INSERT INTO public.billing_events(provider,event_id)
      VALUES ('paddle_sandbox',$1) ON CONFLICT (provider,event_id) DO NOTHING RETURNING event_id`, [event.event_id]);
    if (!inserted.rowCount) return { duplicate: true };
    const isSubscription = event.event_type.startsWith("subscription.");
    const isAdjustment = event.event_type.startsWith("adjustment.");
    const id = paddleId(isSubscription ? "sub" : isAdjustment ? "adj" : "txn").parse(event.data.id);
    const adjustment = isAdjustment ? await api.adjustment(id) : null;
    const transactionId = adjustment?.transaction_id ?? id;
    const intent = z.uuid().safeParse(event.data.custom_data?.link_intent);
    // Custom data is only a lookup hint, never proof of ownership. The
    // canonical original server-created transaction must bind all IDs.
    const found = await client.query<Row>(`SELECT * FROM public.paddle_sandbox_accounts
      WHERE ${isSubscription ? "subscription_id" : "transaction_id"}=$1 OR intent_id=$2::uuid OR subscription_id=$3`,
    [isSubscription ? id : transactionId, intent.success ? intent.data : null, isSubscription ? id : adjustment?.subscription_id ?? event.data.subscription_id ?? null]);
    if (found.rowCount === 0) return { duplicate: false }; // Unrelated sandbox catalog/customer.
    if (found.rowCount !== 1) throw new Error("Conflicting account mapping.");
    const userId = found.rows[0].user_id;
    await owner(client, userId);
    const row = (await client.query<Row>("SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid FOR UPDATE", [userId])).rows[0];
    if (!row) throw new Error("Account unavailable.");
    const transaction = !isSubscription ? await api.transaction(transactionId) : null;
    if (transaction && row.transaction_id !== transaction.id && row.subscription_id !== transaction.subscription_id) throw new Error("Unowned transaction.");
    if (adjustment && transaction && (adjustment.customer_id !== transaction.customer_id || adjustment.subscription_id !== transaction.subscription_id)) throw new Error("Unowned adjustment.");
    // A verified approved adjustment for the persisted current payment can
    // revoke independently of subscription replicas or a failing list API.
    // Older-payment refunds still reconcile the independently newer period.
    if (adjustment && transaction && row.verified_payment_id === transaction.id &&
        row.subscription_id === transaction.subscription_id && row.customer_id === transaction.customer_id &&
        paymentIsRevoked(transaction, [adjustment])) {
      await client.query(`UPDATE public.paddle_sandbox_accounts SET payment_revoked=true,
        last_event_at=GREATEST(last_event_at,$2::timestamptz),next_reconcile_at=clock_timestamp(),
        reconcile_attempts=0,last_reconcile_result='ok'
        WHERE user_id=$1::uuid`, [userId, event.occurred_at]);
      if (sandboxEntitlementsEnabled()) await client.query(`UPDATE public.subscription_entitlements
        SET plan='free',status='inactive',updated_at=clock_timestamp()
        WHERE user_id=$1::uuid AND source='paddle_sandbox' AND source_subscription_id=$2`, [userId, row.subscription_id]);
      return { duplicate: false };
    }
    const subId = isSubscription ? id : transaction?.subscription_id;
    if (!subId) return { duplicate: false }; // Initial failed/canceled checkout cannot grant anything.
    await reconcile(client, row, subId, event.occurred_at, adjustment);
    return { duplicate: false };
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
        cancelAtPeriodEnd: row.cancel_at_period_end,
        paymentRevoked: row.payment_revoked,
        // Diagnostic preview only; actual access uses the gated entitlement reader.
        sandboxAccessPreview: !row.payment_revoked && ["active", "past_due", "canceled"].includes(row.subscription_status ?? "") &&
          row.paid_start !== null && row.paid_start.getTime() <= Date.now() && row.paid_through !== null && row.paid_through.getTime() > Date.now() ? "pro" : "free" } : null;
    },
    processEventInTransaction,
    async processEvent(event: PaddleEvent) {
      return locked(client => processEventInTransaction(client, event));
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
    async reconcileBatch(limit = 5) {
      if (!Number.isInteger(limit) || limit < 1 || limit > 10) throw new Error("Invalid batch limit.");
      const candidates = await db.query<{ user_id: string }>(`SELECT user_id FROM public.paddle_sandbox_accounts
        WHERE transaction_id IS NOT NULL AND reconcile_attempts<3 AND next_reconcile_at<=clock_timestamp()
        ORDER BY next_reconcile_at,user_id LIMIT $1`, [limit]);
      const counts = { selected: candidates.rowCount ?? 0, ok: 0, retry: 0, exhausted: 0, skipped: 0 };
      for (const candidate of candidates.rows) {
        const outcome = await locked(async client => {
          // Same lock order as checkout/webhooks; don't wait for another worker.
          const owner = await client.query("SELECT id FROM public.users WHERE id=$1::uuid FOR UPDATE SKIP LOCKED", [candidate.user_id]);
          if (!owner.rowCount) return "skipped" as const;
          const row = (await client.query<Row>(`SELECT * FROM public.paddle_sandbox_accounts WHERE user_id=$1::uuid
            AND reconcile_attempts<3 AND next_reconcile_at<=clock_timestamp() FOR UPDATE`, [candidate.user_id])).rows[0];
          if (!row?.transaction_id) return "skipped" as const;
          await client.query("SAVEPOINT reconcile_account");
          try {
            const provider = accountApi?.() ?? api;
            const original = await provider.transaction(row.transaction_id);
            if (original.subscription_id) await reconcile(client, row, original.subscription_id, undefined, undefined, provider);
            else await client.query(`UPDATE public.paddle_sandbox_accounts SET reconcile_attempts=0,
              next_reconcile_at=clock_timestamp()+interval '15 minutes',last_reconcile_result='ok' WHERE user_id=$1`, [row.user_id]);
            provider.checkDeadline?.();
            await client.query("RELEASE SAVEPOINT reconcile_account");
            return "ok" as const;
          } catch {
            await client.query("ROLLBACK TO SAVEPOINT reconcile_account");
            const attempts = row.reconcile_attempts + 1;
            const result = attempts === 3 ? "exhausted" as const : "retry" as const;
            await client.query(`UPDATE public.paddle_sandbox_accounts SET reconcile_attempts=$2,last_reconcile_result=$3,
              next_reconcile_at=clock_timestamp()+($4::int * interval '1 minute') WHERE user_id=$1`,
            [row.user_id, attempts, result, attempts === 1 ? 1 : attempts === 2 ? 5 : 30]);
            return result;
          }
        });
        counts[outcome]++;
      }
      const blocked = await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM public.paddle_sandbox_accounts WHERE reconcile_attempts=3`);
      return { ...counts, blocked: blocked.rows[0].count }; // No user IDs, payloads or secrets.
    },
  };
}
