import "server-only";

import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { createMonetizationStore, type UsageMetric } from "@/lib/monetization/store";

const store = createMonetizationStore(pool);

async function requireUserId() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Authentication required.");
  return user.id;
}

// Website callers cannot supply an account, plan, period, or quota override.
export async function getCurrentUserEntitlement() {
  return store.getEntitlement(await requireUserId());
}

export async function requireCurrentUserPro() {
  const entitlement = await getCurrentUserEntitlement();
  if (entitlement.plan !== "pro") throw new Error("Pro subscription required.");
  return entitlement;
}

export async function getCurrentUserMonthlyUsage(metric: UsageMetric) {
  return store.getMonthlyUsage(await requireUserId(), metric);
}

export async function consumeCurrentUserMonthlyUsage(metric: UsageMetric) {
  return store.consumeMonthlyUsage(await requireUserId(), metric);
}
