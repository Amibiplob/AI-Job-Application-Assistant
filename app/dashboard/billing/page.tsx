import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { getCurrentUserMonthlyUsage } from "@/lib/monetization/current-user";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";
import { createPaddleSandboxClient } from "@/lib/billing/paddle/client";
import { createPaddleSandboxStore } from "@/lib/billing/paddle/store";

export default async function BillingPage() {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const config = getPaddleSandboxConfig();
  let status = null, unavailable = false;
  if (config) {
    try { status = await createPaddleSandboxStore(pool, config, createPaddleSandboxClient(config)).status(user.id); }
    catch { unavailable = true; }
  }
  const usage = await getCurrentUserMonthlyUsage("job_analysis").catch(() => null);
  return <div className="mx-auto max-w-3xl space-y-6 p-6 text-text-primary">
    <h1 className="text-2xl font-semibold">Billing status</h1>
    <p>{usage ? `Website plan: ${usage.plan === "pro" ? "Pro" : "Free"}. ${usage.remaining} of ${usage.limit} matches remaining this month.` : "Website plan and usage are unavailable. Refresh to retry."}</p>
    <p>Paddle integration is for sandbox testing only. Test payments do not activate Pro access.</p>
    {!config ? <p>Sandbox checkout is disabled.</p> : unavailable ? <p>Sandbox billing records are unavailable. Checkout cannot start.</p> : <>
      <p>Sandbox subscription: {status?.subscriptionStatus ?? "None verified"}.</p>
      {status?.paidThrough && <p>Last verified sandbox paid-through time: <time dateTime={status.paidThrough}>{status.paidThrough}</time>. This is a test record, not your website entitlement.</p>}
      {status?.cancelAtPeriodEnd && <p>The sandbox subscription is scheduled to cancel.</p>}
      {status?.reconciledAt && <p>Last checked: <time dateTime={status.reconciledAt}>{status.reconciledAt}</time>. Status may change; refresh from Paddle below.</p>}
      {(!status || status.checkoutState === "ready") && <form method="post" action="/api/billing/paddle/checkout"><button className="min-h-11 rounded-lg bg-brand px-5 text-primary-foreground" type="submit">Open sandbox checkout</button></form>}
      {status?.checkoutState === "creating" && <p>A checkout result is pending review. Contact the operator before retrying.</p>}
      {status && <form method="post" action="/api/billing/paddle/reconcile"><button className="min-h-11 rounded-lg border border-border px-5" type="submit">Refresh sandbox status from Paddle</button></form>}
    </>}
    <Link className="text-brand underline" href="/pricing">Compare website plans</Link>
  </div>;
}
