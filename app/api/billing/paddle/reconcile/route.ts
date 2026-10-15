import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";
import { createPaddleSandboxClient } from "@/lib/billing/paddle/client";
import { createPaddleSandboxStore } from "@/lib/billing/paddle/store";
import { billingRedirect, billingResponse, sameOriginBillingPost } from "@/lib/billing/paddle/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = getPaddleSandboxConfig();
  if (!config) return billingResponse("Sandbox billing is disabled.", 503);
  if (!sameOriginBillingPost(request, config.appOrigin)) return billingResponse("Forbidden", 403);
  try {
    const session = await getSession();
    if (!session) return billingResponse("Sign in required.", 401);
    await createPaddleSandboxStore(pool, config, createPaddleSandboxClient(config)).reconcileUser(session.userId, session.id);
    return billingRedirect(new URL("/dashboard/billing", config.appOrigin));
  } catch { return billingResponse("Sandbox reconciliation unavailable.", 503); }
}
