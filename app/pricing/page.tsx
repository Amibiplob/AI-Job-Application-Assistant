import Link from "next/link";
import { getPaddleSandboxConfig } from "@/lib/billing/paddle/config";

export default function PricingPage() {
  const sandbox = Boolean(getPaddleSandboxConfig());
  return <main className="mx-auto max-w-4xl space-y-8 px-6 py-12 text-text-primary">
    <Link href="/" className="text-brand underline">Home</Link>
    <h1 className="text-3xl font-semibold">Website plans</h1>
    <p>Compare saved jobs and pasted job descriptions with your resume. Matching uses deterministic skill overlap.</p>
    <div className="grid gap-6 sm:grid-cols-2">
      <section className="rounded-xl border border-border bg-surface p-6"><h2 className="text-xl font-semibold">Free — $0</h2><p className="mt-3">3 successful website matches per UTC calendar month.</p><Link className="mt-4 inline-block text-brand underline" href="/signup">Create an account</Link></section>
      <section className="rounded-xl border border-border bg-surface p-6"><h2 className="text-xl font-semibold">Pro — proposed $10 USD/month</h2><p className="mt-3">100 successful website matches per UTC calendar month.</p><p className="mt-3">Paid access is not available yet. Sandbox checkouts use test payments and do not upgrade your account.</p><Link className="mt-4 inline-block text-brand underline" href="/dashboard/billing">View billing status</Link></section>
    </div>
    <p className="text-sm text-text-secondary">Saved-job and pasted-description comparisons share the allowance. Invalid or failed comparisons do not count. No unlimited AI usage is included. MCP paid plans are not enabled.</p>
    <p className="text-sm text-text-secondary">{sandbox ? "Sandbox billing tests are configured for this environment." : "Checkout is disabled in this environment."} The proposed price is before any applicable taxes; real payments are not accepted.</p>
  </main>;
}
