import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { redirect } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/presentation/page-header";
import { EmptyState } from "@/components/presentation/empty-state";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { StatusBadge } from "@/components/presentation/status-badge";
import { JobSourceBadge } from "@/components/presentation/job-source-badge";
import { applicationCounts, applicationDate, statusLabel } from "@/components/jobs/application-presentation";
import { formatPostedDate, formatSalary, workplaceTypes } from "@/components/jobs/search-presentation";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-validation";
import { getCurrentUser } from "@/lib/auth";
import { listApplications, type Application } from "@/lib/applications";
import { cn } from "@/lib/utils";
import { ApplicationEditor } from "./application-editor";

export default async function ApplicationsPage({ searchParams }: { searchParams?: Promise<{ status?: string | string[] }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  const requested = (await searchParams)?.status;
  const filter = APPLICATION_STATUSES.includes(requested as ApplicationStatus) ? requested as ApplicationStatus : null;
  let applications: Application[];
  try {
    applications = await listApplications();
  } catch {
    return <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10"><PageHeader title="Applications" description="Keep your application progress and notes together." /><InlineFeedback tone="error" title="We couldn’t load your applications" className="mt-8">Your records could not be loaded. No changes were made. <a href="/dashboard/applications" className="rounded-sm font-medium underline focus-visible:outline-2 focus-visible:outline-focus">Try again</a>.</InlineFeedback></div>;
  }
  const counts = applicationCounts(applications);
  const visible = filter ? applications.filter(application => application.status === filter) : applications;
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Your job search" title="Applications" description="Track the roles you’re pursuing, update your progress, and keep your notes close." actions={<Link href="/dashboard/jobs" className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}>Browse jobs</Link>} />
      <p className="mt-6 text-sm leading-6 text-text-secondary">Adding a job saves it to your tracker; it does not submit an application to an employer. Mark it Applied when you have applied yourself. Demo listings are sample data, not active openings.</p>
      <section aria-label="Application summary" className="mt-6 rounded-xl border border-border bg-surface p-5 shadow-subtle">
        <p className="text-sm text-text-secondary">Total tracked applications</p><p className="mt-1 text-3xl font-semibold">{applications.length}</p>
        <dl className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">{APPLICATION_STATUSES.map(status => <div key={status}><dt className="text-xs text-text-secondary">{statusLabel(status)}</dt><dd className="mt-1 text-lg font-semibold">{counts[status]}</dd></div>)}</dl>
      </section>
      <nav aria-label="Filter applications by status" className="mt-6 flex flex-wrap gap-2">{[null, ...APPLICATION_STATUSES].map(status => <Link key={status ?? "all"} href={status ? `/dashboard/applications?status=${status}` : "/dashboard/applications"} aria-current={filter === status ? "page" : undefined} className={`inline-flex min-h-11 items-center gap-2 rounded-lg border px-3 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus ${filter === status ? "border-brand bg-brand-subtle text-brand" : "border-border bg-surface text-text-secondary hover:text-brand"}`}>{status ? statusLabel(status) : "All"}<span>{status ? counts[status] : applications.length}</span></Link>)}</nav>
      {applications.length === 0 ? <EmptyState className="mt-6" icon={BriefcaseBusiness} title="Start your application tracker" description="Browse jobs, open a listing, and add it to tracking. Your saved roles and application progress will appear here." actions={<Link href="/dashboard/jobs" className={cn(buttonVariants(), "min-h-11")}>Browse jobs</Link>} /> : visible.length === 0 ? <EmptyState className="mt-6" title={`No ${statusLabel(filter!).toLowerCase()} applications`} description="There are no tracked roles with this status. Your other applications are still available." actions={<Link href="/dashboard/applications" className={cn(buttonVariants({ variant: "outline" }), "min-h-11")}>View all applications</Link>} /> : <div className="mt-6 space-y-6">{visible.map(application => {
        const date = applicationDate(application.appliedAt);
        const salary = formatSalary(application.job);
        return <Card key={application.id} className="gap-0 py-0 shadow-subtle"><CardContent className="min-w-0 p-5 sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><h2 className="break-words text-xl font-semibold tracking-tight"><Link href={`/dashboard/jobs/${application.jobId}`} className="rounded-sm hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">{application.job.title?.trim() || "Untitled listing"}</Link></h2><p className="mt-2 break-words text-sm text-text-secondary">{application.job.company?.trim() || "Company not provided"}</p></div><StatusBadge status={application.status} className="w-fit shrink-0" /></div>
          <div className="mt-4"><JobSourceBadge source={application.job.source} /></div>
          <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2"><div><dt className="text-xs text-text-secondary">Location</dt><dd className="mt-1 break-words">{application.job.location || "Not provided"}</dd></div><div><dt className="text-xs text-text-secondary">Applied date</dt><dd className="mt-1">{date ? <time dateTime={date}>{formatPostedDate(application.appliedAt)}</time> : "Not recorded"}</dd></div>{application.job.workplaceType && <div><dt className="text-xs text-text-secondary">Workplace</dt><dd className="mt-1">{workplaceTypes.find(item => item.value === application.job.workplaceType)?.label || "Not provided"}</dd></div>}{application.job.employmentType && <div><dt className="text-xs text-text-secondary">Employment type</dt><dd className="mt-1 break-words">{application.job.employmentType}</dd></div>}{formatPostedDate(application.job.postedAt) && <div><dt className="text-xs text-text-secondary">Listing posted</dt><dd className="mt-1">{formatPostedDate(application.job.postedAt)}</dd></div>}{salary && <div><dt className="text-xs text-text-secondary">Salary</dt><dd className="mt-1 break-words">{salary}</dd></div>}</dl>
          <section className="mt-5" aria-label="Saved notes"><h3 className="text-sm font-medium">Saved notes</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-text-secondary">{application.notes?.trim() || "No notes yet."}</p></section>
          <ApplicationEditor application={application} />
        </CardContent></Card>;
      })}</div>}
    </div>
  );
}
