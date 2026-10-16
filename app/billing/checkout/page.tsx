import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";
import { createPaddleSandboxClient } from "@/lib/billing/paddle/client";
import { createPaddleSandboxStore } from "@/lib/billing/paddle/store";
import { SandboxCheckout } from "./sandbox-checkout";

export default async function CheckoutPage({ searchParams }: { searchParams: Promise<{ _ptxn?: string | string[] }> }) {
  const user = await getCurrentUser(); if (!user) redirect("/login");
  const config = getPaddleSandboxConfig();
  const id = (await searchParams)._ptxn;
  let allowed = false;
  if (config && typeof id === "string") {
    try { allowed = await createPaddleSandboxStore(pool, config, createPaddleSandboxClient(config)).acceptsCheckout(user.id, id); }
    catch { allowed = false; }
  }
  return <main className="mx-auto max-w-2xl space-y-6 p-8 text-text-primary">
    <h1 className="text-2xl font-semibold">Sandbox checkout</h1>
    <p>Test payments only. Access changes only after server verification when sandbox activation is enabled.</p>
    {allowed && config && typeof id === "string" ? <SandboxCheckout clientToken={config.clientToken} transactionId={id} /> : <p>Checkout is disabled, expired, or unavailable for this account.</p>}
    <Link className="text-brand underline" href="/dashboard/billing">Return to billing status</Link>
  </main>;
}
