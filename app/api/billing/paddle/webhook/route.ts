import { ingestionPool } from "@/lib/billing/paddle/ingestion-pool";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";
import { createPaddleWebhookInbox } from "@/lib/billing/paddle/inbox";
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
    await createPaddleWebhookInbox(ingestionPool).ingest(event);
    return billingResponse("Accepted", 200);
  } catch { return billingResponse("Sandbox persistence unavailable; retry delivery.", 503); }
}
