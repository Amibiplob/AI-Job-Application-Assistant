export default function JobsLoading() {
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10" aria-busy="true" aria-label="Loading jobs">
      <p role="status" className="sr-only">Loading job results…</p>
      <div aria-hidden="true" className="animate-pulse space-y-6 motion-reduce:animate-none">
        <div className="space-y-3"><div className="h-3 w-36 rounded bg-surface-muted" /><div className="h-10 w-72 max-w-full rounded bg-surface-muted" /><div className="h-4 w-96 max-w-full rounded bg-surface-muted" /></div>
        <div className="h-64 rounded-xl border border-border bg-surface md:h-28" />
        <div className="h-20 rounded-xl border border-info-border bg-info-subtle" />
        {Array.from({ length: 3 }, (_, index) => <div key={index} className="space-y-5 rounded-xl border border-border bg-surface p-6"><div className="h-5 w-3/4 rounded bg-surface-muted" /><div className="h-4 w-1/2 rounded bg-surface-muted" /><div className="h-20 rounded bg-surface-muted" /><div className="h-8 w-28 rounded bg-surface-muted" /></div>)}
      </div>
    </div>
  );
}
