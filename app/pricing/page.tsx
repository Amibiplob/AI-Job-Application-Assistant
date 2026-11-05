import Link from "next/link";
import { PublicPage } from "@/components/layout/public-page";
import { MONTHLY_LIMITS, PRO_DRAFT_PRICE } from "@/lib/plans";

export const metadata = { title: "Pricing | AI Job Application Assistant" };
export default function PricingPage() {
  return <PublicPage title="Website plans">
    <p className="max-w-2xl leading-7 text-text-secondary">Start with a free workspace for your resume, skill comparisons, and application tracker.</p>
    <div className="grid gap-6 sm:grid-cols-2">
      <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-xl font-semibold">Free — $0</h2><p>Available now</p>
        <p>{MONTHLY_LIMITS.free.job_analysis} successful website matches per UTC calendar month.</p>
        <ul className="list-inside list-disc space-y-2 text-sm leading-6"><li>Save and update your resume text</li><li>Compare listed or pasted job descriptions</li><li>Track applications, dates, and notes</li></ul>
        <Link className="inline-flex min-h-11 items-center font-medium text-brand underline" href="/signup">Create a free account</Link>
      </section>
      <section className="space-y-4 rounded-xl border border-border bg-surface p-6">
        <h2 className="text-xl font-semibold">Pro — coming soon</h2>
        <p>Draft price: {PRO_DRAFT_PRICE}, before applicable taxes. Price and offer are subject to review.</p>
        <p>Planned allowance: {MONTHLY_LIMITS.pro.job_analysis} successful website matches per UTC calendar month.</p>
        <p>Paid access is not available. There is no checkout or payment required for the free workspace.</p>
      </section>
    </div>
    <p className="text-sm leading-6 text-text-secondary">Saved-job and pasted-description comparisons share the allowance. Completed comparisons count, including zero-overlap and unscored results. Invalid or failed comparisons do not count.</p>
    <p className="text-sm leading-6 text-text-secondary">MCP tools have separate abuse rate limits and no monthly paid plan. Pro does not unlock extra MCP capabilities. No unlimited AI usage is included.</p>
    <p className="text-sm leading-6 text-text-secondary">Matching checks a fixed skill dictionary; it does not predict hiring outcomes. Listings include clearly labeled demonstration data and unverified records.</p>
  </PublicPage>;
}
