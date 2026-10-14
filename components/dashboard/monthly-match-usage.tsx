import type { Usage } from "@/lib/monetization/store";

export function MonthlyMatchUsage({ usage }: { usage: Usage | null }) {
  return (
    <section aria-label="Monthly resume matches" className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-subtle">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Monthly resume matches</h2>
        {usage && <span className="rounded-md bg-brand-subtle px-2 py-1 text-xs font-medium text-brand">{usage.plan === "pro" ? "Pro" : "Free"}</span>}
      </div>
      {usage ? <>
        <p className="mt-3 text-xl font-semibold">{usage.remaining} of {usage.limit} matches remaining</p>
        <p className="mt-2 text-sm text-text-secondary">Resets <time dateTime={usage.resetsAt}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(usage.resetsAt))}</time> (UTC).</p>
        {usage.remaining === 0 && <p className="mt-2 text-sm text-text-secondary">Your monthly allowance is used up. You can match again when it resets.</p>}
        <p className="mt-3 text-xs leading-5 text-text-secondary">Saved-job comparisons and pasted-description analyses share this allowance. Completed comparisons count, including zero overlap and unscored results. Invalid or failed comparisons do not.</p>
      </> : <p className="mt-3 text-sm text-text-secondary">Usage is unavailable right now. Refresh the page to check your remaining allowance.</p>}
    </section>
  );
}
