import Link from "next/link";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, MapPin, Search, ArrowUpRight } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/presentation/page-header";
import { EmptyState } from "@/components/presentation/empty-state";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { JobSourceBadge } from "@/components/presentation/job-source-badge";
import { PAGE_SIZE, workplaceTypes, readJobFilters, pageHref, formatSalary, formatPostedDate, type JobSearchParams } from "@/components/jobs/search-presentation";
import { getCurrentUser } from "@/lib/auth";
import { listJobs, type Job } from "@/lib/jobs";
import { cn } from "@/lib/utils";

export default async function JobsPage({ searchParams }: { searchParams: Promise<JobSearchParams> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const { search, workplace, page } = readJobFilters(await searchParams);
  let jobs: Job[] = [];
  let hasMore = false;
  let failed = false;
  try {
    const results = await listJobs({ limit: PAGE_SIZE + 1, offset: (page - 1) * PAGE_SIZE, search: search || null, workplaceType: workplace || null });
    hasMore = results.length > PAGE_SIZE;
    jobs = results.slice(0, PAGE_SIZE);
  } catch {
    failed = true;
  }
  // Redirect outside the catch: Next.js redirects terminate rendering by throwing.
  if (!failed && !jobs.length && page > 1) redirect(pageHref(1, search, workplace));
  const start = (page - 1) * PAGE_SIZE + 1;
  const end = (page - 1) * PAGE_SIZE + jobs.length;
  const filtered = Boolean(search || workplace);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Explore opportunities" title="Find your next role" description="Search listings by title or company, review the details, and decide which opportunities deserve a closer look." />
      <Card className="mt-8 gap-0 py-0 shadow-subtle">
        <CardContent className="p-5 sm:p-6">
          <form key={`${search}:${workplace}`} action="/dashboard/jobs" method="get" aria-label="Search jobs" className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_180px_auto] md:items-end">
            <div className="min-w-0 space-y-2">
              <label htmlFor="job-search" className="text-sm font-medium">Job title or company</label>
              <div className="relative"><Search size={17} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-secondary" /><Input id="job-search" name="q" type="search" maxLength={100} defaultValue={search} placeholder="Title or company name" className="h-11 w-full min-w-0 pl-10" /></div>
            </div>
            <div className="min-w-0 space-y-2">
              <label htmlFor="workplace" className="text-sm font-medium">Workplace</label>
              <select id="workplace" name="workplace" defaultValue={workplace} className="h-11 w-full rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">
                <option value="">Any workplace</option>
                {workplaceTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <Button type="submit" className="h-11">Search jobs</Button>
          </form>
          {filtered && <Link href="/dashboard/jobs" className="mt-4 inline-flex rounded-md text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">Clear filters</Link>}
        </CardContent>
      </Card>
      <InlineFeedback tone="info" announcement="off" className="mt-5">Demo listings are sample data, not active openings. Other listings are unverified; confirm vacancy details with the employer before applying.</InlineFeedback>
      <section aria-labelledby="job-results-heading" className="mt-8 min-w-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><h2 id="job-results-heading" className="text-lg font-semibold">Job results</h2><p className="mt-1 text-sm text-text-secondary">{failed ? "Results are unavailable" : jobs.length ? `Showing ${start}–${end} listings` : "No listings to show"}</p></div>
          {workplace && <Badge variant="secondary">{workplaceTypes.find(item => item.value === workplace)?.label}</Badge>}
        </div>
        {failed ? <InlineFeedback tone="error" title="We couldn’t load jobs right now">Your search filters are still applied. <a href={pageHref(page, search, workplace)} className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Reload these results</a> to try again.</InlineFeedback> : !jobs.length ? <EmptyState headingLevel={3} icon={Search} title={filtered ? "No matching listings" : "No listings available yet"} description={filtered ? "Try a different title, company, or workplace filter. Search checks job titles and company names." : "There are no listings to browse right now. Check back later."} actions={filtered ? <Link href="/dashboard/jobs" className={buttonVariants({ variant: "outline" })}>Clear filters</Link> : undefined} /> : (
          <ul className="grid min-w-0 gap-4">
            {jobs.map(job => {
              const salary = formatSalary(job);
              const posted = formatPostedDate(job.postedAt);
              return <li key={job.id} className="min-w-0"><Card className="gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-6">
                <article className="min-w-0">
                  <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand-foreground"><BriefcaseBusiness size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="break-words text-sm text-text-secondary">{job.company}</p><h3 className="mt-1 break-words text-lg font-semibold tracking-tight"><Link href={`/dashboard/jobs/${job.id}`} className="rounded-sm hover:text-brand hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{job.title}</Link></h3></div>
                  </div>
                  <div className="mt-4"><JobSourceBadge source={job.source} /></div>
                  <dl className="mt-5 grid min-w-0 gap-x-5 gap-y-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
                    <div className="min-w-0"><dt className="text-xs text-text-secondary">Location</dt><dd className="mt-1 flex items-start gap-1.5 break-words"><MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-text-secondary" /><span className="min-w-0 break-words">{job.location || "Not provided"}</span></dd></div>
                    <div className="min-w-0"><dt className="text-xs text-text-secondary">Workplace</dt><dd className="mt-1">{workplaceTypes.find(item => item.value === job.workplaceType)?.label ?? "Not provided"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-text-secondary">Employment</dt><dd className="mt-1 break-words">{job.employmentType || "Not provided"}</dd></div>
                    <div className="min-w-0"><dt className="text-xs text-text-secondary">Salary</dt><dd className="mt-1 break-words">{salary ?? "Not available"}</dd></div>
                  </dl>
                  <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
                    <p className="text-xs text-text-secondary">{posted ? <>Posted <time dateTime={job.postedAt!.toISOString()}>{posted}</time></> : "Posting date not provided"}</p>
                    <Link href={`/dashboard/jobs/${job.id}`} aria-label={`View details for ${job.title} at ${job.company}`} className={cn(buttonVariants({ variant: "outline" }), "max-w-full")}>View details<ArrowUpRight aria-hidden="true" /></Link>
                  </div>
                </article>
              </CardContent></Card></li>;
            })}
          </ul>
        )}
      </section>
      {!failed && jobs.length > 0 && <nav aria-label="Jobs pages" className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="text-sm text-text-secondary">Page {page}</p><div className="flex flex-wrap gap-2">{page > 1 && <Link href={pageHref(page - 1, search, workplace)} className={buttonVariants({ variant: "outline" })}><ChevronLeft aria-hidden="true" />Previous</Link>}{hasMore && page < 100_000 && <Link href={pageHref(page + 1, search, workplace)} className={buttonVariants({ variant: "outline" })}>Next<ChevronRight aria-hidden="true" /></Link>}</div></nav>}
    </div>
  );
}
