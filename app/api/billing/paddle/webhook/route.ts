import { pool } from "@/lib/db/pool";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";
import { createPaddleSandboxClient } from "@/lib/billing/paddle/client";
import { createPaddleSandboxStore } from "@/lib/billing/paddle/store";
import { readRawWebhook, verifyPaddleWebhook } from "@/lib/billing/paddle/protocol";
import { billingResponse } from "@/lib/billing/paddle/http";
export const runtime = "nodejs";
export async function POST(request: Request) {
  const config = getPaddleSandboxConfig();
  if (!config) return billingResponse("Sandbox billing is disabled.", 503);
  let event;
  try { event = verifyPaddleWebhook(await readRawWebhook(request), request.headers.get("paddle-signature"), config.webhookSecret); }
  catch { return billingResponse("Invalid webhook.", 400); }
  try {
    await createPaddleSandboxStore(pool, config, createPaddleSandboxClient(config)).processEvent(event);
    return billingResponse("Accepted", 200);
  } catch { return billingResponse("Sandbox reconciliation unavailable; retry delivery.", 503); }
}
