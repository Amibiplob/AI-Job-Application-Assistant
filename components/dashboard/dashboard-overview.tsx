import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, ClipboardCheck, FileText, FileUser, Search } from "lucide-react";
import type { Application } from "@/lib/applications";
import type { Resume } from "@/lib/resumes";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/presentation/page-header";
import { EmptyState } from "@/components/presentation/empty-state";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { StatusBadge } from "@/components/presentation/status-badge";
import { JobSourceBadge } from "@/components/presentation/job-source-badge";
import { cn } from "@/lib/utils";
import { getOverviewSummary } from "./overview-model";
import { MonthlyMatchUsage } from "./monthly-match-usage";
import type { Usage } from "@/lib/monetization/store";

const linkFocus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus";
const actionClass = cn(buttonVariants(), "h-11 rounded-xl px-4");
const quickActions = [
  { href: "/dashboard/resume", title: "Your resume", description: "Save or update your experience.", icon: FileUser },
  { href: "/dashboard/jobs", title: "Browse jobs", description: "Review the available listings.", icon: Search },
  { href: "/dashboard/analyze", title: "Analyze a job", description: "Compare a description with your resume.", icon: ClipboardCheck },
  { href: "/dashboard/applications", title: "Applications", description: "Update your progress and notes.", icon: FileText },
];
const resumeLabels = { ready: "Ready to compare", missing: "Not added yet", empty: "Add resume text", unavailable: "Unavailable" };

export function DashboardOverview({ resume, applications, resumeUnavailable = false, usage = null }: {
  resume: Resume | null;
  applications: readonly Application[] | null;
  resumeUnavailable?: boolean;
  usage?: Usage | null;
}) {
  const summary = getOverviewSummary(resume, applications, resumeUnavailable);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
      <PageHeader
        eyebrow="Your job search"
        title="Your search, at a glance"
        description="A summary of your saved resume and the roles you’re tracking."
        actions={<Link href="/dashboard/jobs" className={actionClass}>Browse jobs <ArrowRight aria-hidden="true" /></Link>}
      />

      <MonthlyMatchUsage usage={usage} />

      <section aria-label="Workspace summary" className="grid gap-4 md:grid-cols-2">
        <Card className="gap-0 py-0 ring-border shadow-subtle">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary"><FileUser size={18} aria-hidden="true" /><h2>Resume status</h2></div>
            <p className="mt-4 text-2xl font-semibold tracking-tight">{resumeLabels[summary.resumeStatus]}</p>
            <p className="mt-2 break-words text-sm leading-6 text-text-secondary">
              {summary.resumeStatus === "ready" ? resume?.name : summary.resumeStatus === "unavailable" ? "We couldn’t load your resume. Try refreshing the page." : "Save your resume text to start comparing recognized skills with job descriptions."}
            </p>
            <Link href="/dashboard/resume" className={`mt-4 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-brand hover:underline underline-offset-4 ${linkFocus}`}>
              {summary.resumeStatus === "ready" ? "View your resume" : summary.resumeStatus === "unavailable" ? "Open resume page" : "Set up your resume"}<ArrowRight size={15} aria-hidden="true" />
            </Link>
          </CardContent>
        </Card>
        <Card className="gap-0 py-0 ring-border shadow-subtle">
          <CardContent className="p-5 sm:p-6">
            <div className="flex items-center gap-2 text-sm font-medium text-text-secondary"><BriefcaseBusiness size={18} aria-hidden="true" /><h2>Tracked applications</h2></div>
            <p className="mt-4 text-4xl font-semibold tracking-tight">{summary.total ?? "—"}</p>
            <p className="mt-2 text-sm leading-6 text-text-secondary">{summary.total === null ? "Your application records are unavailable right now." : "All roles in your tracker, including saved opportunities and completed applications."}</p>
            <Link href="/dashboard/applications" className={`mt-4 inline-flex min-h-11 items-center gap-1 rounded-md text-sm font-medium text-brand hover:underline underline-offset-4 ${linkFocus}`}>View applications <ArrowRight size={15} aria-hidden="true" /></Link>
          </CardContent>
        </Card>
      </section>

      {summary.statuses && summary.total !== 0 && (
        <section aria-labelledby="status-heading">
          <h2 id="status-heading" className="text-lg font-semibold tracking-tight">By application status</h2>
          <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {summary.statuses.map(({ status, count }) => (
              <div key={status} className="min-w-0 rounded-xl border border-border bg-surface p-4">
                <dt><StatusBadge status={status} /></dt><dd className="mt-3 text-2xl font-semibold">{count}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-xs leading-5 text-text-secondary">Counts reflect the statuses you’ve recorded. Interview status does not imply a scheduled interview.</p>
        </section>
      )}

      <section aria-labelledby="recent-heading">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 id="recent-heading" className="text-lg font-semibold tracking-tight">Recently tracked</h2>
          {summary.recent && summary.recent.length > 0 && <Link href="/dashboard/applications" className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium text-brand hover:underline underline-offset-4 ${linkFocus}`}>View all applications</Link>}
        </div>
        {summary.recent === null ? (
          <InlineFeedback tone="error" title="We couldn’t load your applications">Refresh the page to try again, or visit <Link href="/dashboard/applications" className={`rounded-sm font-medium underline underline-offset-4 ${linkFocus}`}>Applications</Link>.</InlineFeedback>
        ) : summary.recent.length === 0 ? (
          <EmptyState title="Your next opportunity starts here" icon={BriefcaseBusiness} description="No roles are tracked yet. Browse the available listings and add a role from its details page. Adding it to your tracker does not submit an application." actions={<Link href="/dashboard/jobs" className={actionClass}>Explore jobs <ArrowRight aria-hidden="true" /></Link>} />
        ) : (
          <ul className="space-y-3">
            {summary.recent.map((application) => (
              <li key={application.id} className="min-w-0 rounded-xl border border-border bg-surface p-5 shadow-subtle">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="min-w-0">
                    <h3 className="break-words font-semibold"><Link href={`/dashboard/jobs/${application.jobId}`} className={`rounded-sm hover:text-brand hover:underline underline-offset-4 ${linkFocus}`}>{application.job.title}</Link></h3>
                    <p className="mt-1 break-words text-sm text-text-secondary">{application.job.company}</p>
                  </div>
                  <StatusBadge status={application.status} />
                </div>
                <div className="mt-4 flex min-w-0 flex-wrap items-center gap-3">
                  <JobSourceBadge source={application.job.source} />
                  <p className="text-xs text-text-secondary">Tracked <time dateTime={application.createdAt.toISOString()}>{new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(application.createdAt)}</time></p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading" className="text-lg font-semibold tracking-tight">Keep your search moving</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {quickActions.map(({ href, title, description, icon: Icon }) => (
            <li key={href} className="min-w-0">
              <Link href={href} className={`flex h-full items-start gap-3 rounded-xl border border-border bg-surface p-5 hover:border-brand hover:bg-brand-subtle ${linkFocus}`}>
                <Icon size={20} className="mt-0.5 shrink-0 text-brand" aria-hidden="true" /><div className="min-w-0"><h3 className="text-sm font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-text-secondary">{description}</p></div>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
