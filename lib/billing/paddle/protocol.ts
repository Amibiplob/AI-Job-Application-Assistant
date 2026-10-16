import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const paddleId = (prefix: string) => z.string().regex(new RegExp(`^${prefix}_[a-z0-9]{26}$`));
const date = z.iso.datetime({ offset: true });
const period = z.object({ starts_at: date, ends_at: date });
export const itemSchema = z.object({ quantity: z.number().int(), price: z.object({ id: paddleId("pri") }) });
export const transactionSchema = z.object({
  id: paddleId("txn"), status: z.string(), customer_id: paddleId("ctm").nullable(),
  subscription_id: paddleId("sub").nullable(), items: z.array(itemSchema),
  custom_data: z.record(z.string(), z.unknown()).nullable(),
  billing_period: period.nullable(), currency_code: z.string(),
  details: z.object({ totals: z.object({ grand_total: z.string().regex(/^\d+$/) }) }).nullable().optional(),
});
export const subscriptionSchema = z.object({
  id: paddleId("sub"), customer_id: paddleId("ctm"),
  status: z.enum(["active", "trialing", "past_due", "paused", "canceled"]),
  updated_at: date, items: z.array(itemSchema),
  current_billing_period: period.nullable(),
  scheduled_change: z.object({ action: z.string(), effective_at: date }).nullable(),
  custom_data: z.record(z.string(), z.unknown()).nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export const adjustmentSchema = z.object({
  id: paddleId("adj"), transaction_id: paddleId("txn"), subscription_id: paddleId("sub").nullable(),
  customer_id: paddleId("ctm"), action: z.enum(["refund", "credit", "chargeback", "chargeback_warning", "chargeback_reverse", "chargeback_warning_reverse", "credit_reverse"]),
  status: z.enum(["pending_approval", "approved", "rejected", "reversed"]),
});
export type Adjustment = z.infer<typeof adjustmentSchema>;
export const eventSchema = z.object({
  event_id: paddleId("evt"), event_type: z.string().min(1).max(100), occurred_at: date,
  data: z.object({ id: z.string(), subscription_id: paddleId("sub").nullable().optional(), transaction_id: paddleId("txn").optional(),
    custom_data: z.record(z.string(), z.unknown()).nullable().optional() }),
});
export type PaddleEvent = z.infer<typeof eventSchema>;

// Official documented ts:raw-body HMAC-SHA256 protocol. Verify BEFORE JSON parse.
// Bound both old and future timestamps, support multiple h1 values for rotation.
export function verifyPaddleWebhook(raw: Buffer, header: string | null, secret: string, now = Date.now()): PaddleEvent {
  if (!header || header.length > 2048 || raw.length > 256 * 1024) throw new Error("Invalid webhook.");
  const parts = header.split(";").map(value => value.trim().split("="));
  const timestamps = parts.filter(([key]) => key === "ts");
  const signatures = parts.filter(([key]) => key === "h1").map(([,value]) => value);
  const ts = timestamps[0]?.[1];
  if (timestamps.length !== 1 || !ts || !/^\d{10}$/.test(ts) ||
      Math.abs(now / 1000 - Number(ts)) > 5 || !signatures.length) throw new Error("Invalid webhook.");
  const hash = createHmac("sha256", secret).update(`${ts}:`).update(raw).digest();
  if (!signatures.some(value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value) && timingSafeEqual(hash, Buffer.from(value, "hex")))) throw new Error("Invalid webhook.");
  try { return eventSchema.parse(JSON.parse(raw.toString("utf8"))); }
  catch { throw new Error("Invalid webhook."); }
}

export function supportedEvent(event: PaddleEvent): boolean {
  return /^(subscription\.(created|activated|updated|canceled|past_due|paused|resumed|trialing)|transaction\.(completed|payment_failed|past_due|canceled|updated)|adjustment\.(created|updated))$/.test(event.event_type);
}

// Conservative sandbox policy: any approved refund (including partial),
// chargeback or chargeback warning invalidates this payment's access.
export function paymentIsRevoked(payment: Transaction, adjustments: Adjustment[]) {
  for (const adjustment of adjustments) {
    if (adjustment.transaction_id !== payment.id || adjustment.subscription_id !== payment.subscription_id ||
        adjustment.customer_id !== payment.customer_id) throw new Error("Adjustment relationship mismatch.");
  }
  return adjustments.some(a => a.status === "approved" && ["refund", "chargeback", "chargeback_warning"].includes(a.action));
}

export function assertPlanItems(items: z.infer<typeof itemSchema>[], priceId: string) {
  if (items.length !== 1 || items[0].price.id !== priceId || items[0].quantity !== 1) throw new Error("Unsupported subscription.");
}

// Verified period policy shared by preview and the gated sandbox writer.
// Completed payment periods, not a renewed unpaid billing period, bound access.
export function projectSandboxSubscription(subscription: Subscription, completed: Transaction | null, priceId: string, now = Date.now()) {
  assertPlanItems(subscription.items, priceId);
  let paidStart: string | null = null, paidThrough: string | null = null;
  if (completed) {
    assertPlanItems(completed.items, priceId);
    if (completed.status !== "completed" || completed.currency_code !== "USD" ||
        !completed.details || !/^[0-9]*[1-9][0-9]*$/.test(completed.details.totals.grand_total) ||
        completed.subscription_id !== subscription.id || completed.customer_id !== subscription.customer_id) throw new Error("Payment relationship mismatch.");
    const p = completed.billing_period;
    if (p && Date.parse(p.starts_at) < Date.parse(p.ends_at)) {
      paidStart = p.starts_at; paidThrough = p.ends_at;
    }
  }
  const paid = paidStart !== null && paidThrough !== null && Date.parse(paidStart) <= now && Date.parse(paidThrough) > now;
  return {
    status: subscription.status, paidStart, paidThrough,
    // Paused/trialing is deliberately unsupported for paid access in this phase.
    wouldBePro: paid && ["active", "past_due", "canceled"].includes(subscription.status),
    cancelAtPeriodEnd: subscription.scheduled_change?.action === "cancel",
    providerUpdatedAt: subscription.updated_at,
  };
}

export async function readRawWebhook(request: Request): Promise<Buffer> {
  if (!request.body) throw new Error("Invalid webhook.");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      size += value.byteLength;
      if (size > 256 * 1024) { await reader.cancel(); throw new Error("Invalid webhook."); }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
