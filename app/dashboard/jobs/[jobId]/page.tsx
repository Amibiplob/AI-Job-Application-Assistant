import Link from "next/link";
import { ArrowUpRight, ChevronLeft } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/presentation/page-header";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { JobSourceBadge } from "@/components/presentation/job-source-badge";
import { formatSalary, formatPostedDate, workplaceTypes } from "@/components/jobs/search-presentation";
import { safeOriginalListingUrl } from "@/components/jobs/details-presentation";
import { getCurrentUser } from "@/lib/auth";
import { getApplicationForJob } from "@/lib/applications";
import { getJobById } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { ApplicationControl } from "./application-control";
import { JobMatcher } from "./job-matcher";

export default async function JobDetailsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const { jobId } = await params;
  const job = await getJobById(jobId);
  if (!job) notFound();
  const application = await getApplicationForJob(job.id);
  const salary = formatSalary(job);
  const posted = formatPostedDate(job.postedAt);
  const externalUrl = safeOriginalListingUrl(job.jobUrl);
  const hasDescription = Boolean(job.description?.trim());

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <Link href="/dashboard/jobs" className="inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus"><ChevronLeft aria-hidden="true" className="size-4" />Back to jobs</Link>
      <Card className="mt-4 gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-8">
        <PageHeader eyebrow="Job details" title={job.title} description={<span className="block break-words text-base">{job.company}</span>} actions={externalUrl ? <a href={externalUrl} target="_blank" rel="noopener noreferrer" className={cn(buttonVariants(), "h-auto min-h-11 max-w-full whitespace-normal text-center")}>View original listing<ArrowUpRight aria-hidden="true" /><span className="sr-only"> (opens in a new tab)</span></a> : undefined} />
        <div className="mt-5"><JobSourceBadge source={job.source} /></div>
        <p className="mt-3 text-sm leading-6 text-text-secondary">Demo listings are sample data, not active openings. Other listings have not been verified; confirm vacancy details with the employer.</p>
      </CardContent></Card>
      <div className="mt-6 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          <Card className="gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-8">
            <h2 className="text-xl font-semibold tracking-tight">Job description</h2>
            {hasDescription ? <div className="mt-5 whitespace-pre-wrap break-words text-sm leading-7 text-text-secondary">{job.description}</div> : <InlineFeedback className="mt-5" tone="info" announcement="off" title="No description available">There is no job-description text to review or compare. {externalUrl ? "Check the original listing for details." : "An original listing URL was not provided or could not be safely displayed."}</InlineFeedback>}
          </CardContent></Card>
          <JobMatcher key={job.id} jobId={job.id} hasDescription={hasDescription} />
        </div>
        <aside aria-label="Job information and tracking" className="min-w-0 space-y-6">
          <ApplicationControl key={job.id} jobId={job.id} initialStatus={application?.status ?? null} />
          <Card className="gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-6">
            <h2 className="text-base font-semibold">Listing information</h2>
            <dl className="mt-5 space-y-4 text-sm">
              <div><dt className="text-xs text-text-secondary">Location</dt><dd className="mt-1 break-words">{job.location || "Not provided"}</dd></div>
              <div><dt className="text-xs text-text-secondary">Workplace</dt><dd className="mt-1">{workplaceTypes.find(item => item.value === job.workplaceType)?.label ?? "Not provided"}</dd></div>
              {job.employmentType && <div><dt className="text-xs text-text-secondary">Employment type</dt><dd className="mt-1 break-words">{job.employmentType}</dd></div>}
              {salary && <div><dt className="text-xs text-text-secondary">Salary</dt><dd className="mt-1 break-words">{salary}</dd></div>}
              {posted && <div><dt className="text-xs text-text-secondary">Posted</dt><dd className="mt-1"><time dateTime={job.postedAt!.toISOString()}>{posted}</time></dd></div>}
              <div><dt className="text-xs text-text-secondary">Original source</dt><dd className="mt-1 break-all">{job.source?.trim() || "Unknown source"}</dd></div>
            </dl>
            {!externalUrl && <p className="mt-5 border-t border-border pt-4 text-xs leading-5 text-text-secondary">An original listing URL was not provided or could not be safely displayed.</p>}
          </CardContent></Card>
        </aside>
      </div>
    </div>
  );
}
