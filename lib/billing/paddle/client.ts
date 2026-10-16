import "server-only";
import { z } from "zod";
import type { PaddleSandboxConfig } from "./config";
import { adjustmentSchema, assertPlanItems, paddleId, subscriptionSchema, transactionSchema, type Adjustment } from "./protocol";

// Raw Paddle Billing API adapter. No configurable host, live mode, redirects,
// automatic POST retries, SDK logging, or production fallback exists.
export function createPaddleSandboxClient(config: PaddleSandboxConfig, fetcher: typeof fetch = fetch, deadline?: AbortSignal) {
  async function envelope(path: string, method = "GET", body?: unknown): Promise<{ data?: unknown; meta?: unknown }> {
    try {
      const response = await fetcher(`https://sandbox-api.paddle.com${path}`, {
        method, headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", "Paddle-Version": "1" },
        ...(body ? { body: JSON.stringify(body) } : {}),
        cache: "no-store", redirect: "error", signal: deadline ? AbortSignal.any([deadline, AbortSignal.timeout(3000)]) : AbortSignal.timeout(3000),
      });
      if (!response.ok) throw new Error();
      return await response.json() as { data?: unknown; meta?: unknown };
    } catch { throw new Error("Sandbox billing service unavailable."); }
  }
  async function api(path: string, method = "GET", body?: unknown) {
    return (await envelope(path, method, body)).data;
  }
  return {
    async adjustment(id: string) {
      paddleId("adj").parse(id);
      const value = adjustmentSchema.parse(await api(`/adjustments/${id}`));
      if (value.id !== id) throw new Error("Adjustment mismatch.");
      return value;
    },
    async adjustments(transactionId: string): Promise<Adjustment[]> {
      paddleId("txn").parse(transactionId);
      const result: Adjustment[] = []; const seen = new Set<string>(); let after = "";
      // Never follow a provider-supplied URL. Bound pagination; incomplete reads
      // fail rather than treating missing refund evidence as approval.
      for (let page = 0; page < 5; page++) {
        const response = await envelope(`/adjustments?transaction_id=${transactionId}&per_page=50&order_by=id%5BASC%5D${after ? `&after=${after}` : ""}`);
        const values = z.array(adjustmentSchema).max(50).parse(response.data);
        const meta = z.object({ pagination: z.object({ has_more: z.boolean() }) }).parse(response.meta);
        for (const value of values) {
          if (value.transaction_id !== transactionId || seen.has(value.id)) throw new Error("Unexpected adjustment page.");
          seen.add(value.id); result.push(value);
        }
        if (!meta.pagination.has_more) return result;
        if (!values.length) throw new Error("Incomplete adjustment page.");
        after = values[values.length - 1].id;
      }
      throw new Error("Adjustment pagination limit reached.");
    },
    async verifyPrice() {
      const price = z.object({ id: paddleId("pri"), status: z.literal("active"), type: z.literal("standard"),
        unit_price: z.object({ amount: z.literal("1000"), currency_code: z.literal("USD") }),
        billing_cycle: z.object({ interval: z.literal("month"), frequency: z.literal(1) }),
        trial_period: z.null(), unit_price_overrides: z.array(z.unknown()).length(0),
      }).parse(await api(`/prices/${config.priceId}`));
      if (price.id !== config.priceId) throw new Error("Unsupported sandbox price.");
    },
    async createCheckout(intentId: string) {
      z.uuid().parse(intentId);
      const value = await api("/transactions", "POST", {
        items: [{ price_id: config.priceId, quantity: 1 }], collection_mode: "automatic",
        currency_code: "USD", custom_data: { link_intent: intentId }, checkout: { url: config.checkoutUrl },
      });
      const transaction = transactionSchema.parse(value);
      assertPlanItems(transaction.items, config.priceId);
      if (transaction.custom_data?.link_intent !== intentId || transaction.currency_code !== "USD" ||
          !["draft", "ready"].includes(transaction.status) || transaction.subscription_id) throw new Error("Unexpected sandbox checkout.");
      return transaction.id;
    },
    async transaction(id: string) {
      paddleId("txn").parse(id);
      const value = transactionSchema.parse(await api(`/transactions/${id}`));
      if (value.id !== id) throw new Error("Transaction mismatch.");
      return value;
    },
    async subscription(id: string) {
      paddleId("sub").parse(id);
      const value = subscriptionSchema.parse(await api(`/subscriptions/${id}`));
      if (value.id !== id) throw new Error("Subscription mismatch.");
      return value;
    },
    async latestCompleted(subscriptionId: string) {
      paddleId("sub").parse(subscriptionId);
      const values = z.array(transactionSchema).parse(await api(`/transactions?subscription_id=${subscriptionId}&status=completed&order_by=created_at%5BDESC%5D&per_page=1`));
      if (values.length > 1) throw new Error("Unexpected payment response.");
      return values[0] ?? null;
    },
  };
}
export type PaddleSandboxClient = ReturnType<typeof createPaddleSandboxClient>;
