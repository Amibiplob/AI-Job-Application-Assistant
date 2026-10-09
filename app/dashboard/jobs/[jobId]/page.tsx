import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, CalendarDays, ChevronLeft, MapPin } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { getApplicationForJob } from "@/lib/applications";
import { getJobById, type Job } from "@/lib/jobs";
import { ApplicationControl } from "./application-control";
import { JobMatcher } from "./job-matcher";

function formatSalary(job: Job): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const currency = job.salaryCurrency ?? "USD";
  const formatAmount = (amount: string) => {
    const number = Number(amount);
    return Number.isFinite(number)
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(number)
      : amount;
  };
  const range = job.salaryMin !== null && job.salaryMax !== null
    ? `${formatAmount(job.salaryMin)} – ${formatAmount(job.salaryMax)}`
    : formatAmount(job.salaryMin ?? job.salaryMax ?? "");
  return `${range}${job.salaryPeriod ? ` / ${job.salaryPeriod.toLowerCase()}` : ""}`;
}

function safeExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
      return null;
    }
    return url.href;
  } catch {
    return null;
  }
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", year: "numeric" }).format(date);
}

export default async function JobDetailsPage({ params }: { params: Promise<{ jobId: string }> }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const { jobId } = await params;
  const job = await getJobById(jobId);
  if (!job) notFound();

  const application = await getApplicationForJob(job.id);
  const salary = formatSalary(job);
  const posted = formatDate(job.postedAt);
  const externalUrl = safeExternalUrl(job.jobUrl);

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar activeHref="/dashboard/jobs" />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto max-w-[1100px] px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
          <Link href="/dashboard/jobs" className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-[#58715c] hover:text-[#203c32] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#66806a]">
            <ChevronLeft size={16} aria-hidden="true" /> Back to jobs
          </Link>

          <Card className="mt-5 gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="p-5 sm:p-7 lg:p-8">
              <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
                <div className="flex min-w-0 items-start gap-3.5">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#eef2e9] text-[#4c684f]"><BriefcaseBusiness size={18} aria-hidden="true" /></span>
                  <div className="min-w-0">
                    <h1 className="break-words text-2xl font-semibold tracking-[-0.045em] sm:text-[30px]">{job.title}</h1>
                    <p className="mt-2 text-base text-[#5e685f]">{job.company}</p>
                  </div>
                </div>
                {externalUrl && (
                  <Button render={<a href={externalUrl} target="_blank" rel="noopener noreferrer" />} className="h-10 w-fit rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">
                    View original job listing <ArrowUpRight size={15} aria-hidden="true" />
                  </Button>
                )}
              </div>

              <div className="mt-6 flex flex-wrap gap-2 border-t border-[#edf0eb] pt-5">
                {job.location && <Badge variant="outline" className="h-7 gap-1.5 border-[#e3e8e1] px-2.5 text-xs text-[#59685a]"><MapPin size={13} aria-hidden="true" />{job.location}</Badge>}
                {job.workplaceType && <Badge variant="outline" className="h-7 border-[#e3e8e1] px-2.5 text-xs text-[#59685a]">{job.workplaceType[0] + job.workplaceType.slice(1).toLowerCase()}</Badge>}
                {job.employmentType && <Badge variant="outline" className="h-7 border-[#e3e8e1] px-2.5 text-xs text-[#59685a]">{job.employmentType}</Badge>}
                {salary && <Badge variant="secondary" className="h-7 border-0 bg-[#edf2ec] px-2.5 text-xs text-[#47604b]">{salary}</Badge>}
                {posted && <Badge variant="outline" className="h-7 gap-1.5 border-[#e3e8e1] px-2.5 text-xs text-[#737c72]"><CalendarDays size={13} aria-hidden="true" />Posted {posted}</Badge>}
                <Badge variant="outline" className="h-7 border-[#e3e8e1] px-2.5 text-xs text-[#737c72]">Source: {job.source}</Badge>
              </div>
            </CardContent>
          </Card>

          <ApplicationControl jobId={job.id} initialStatus={application?.status ?? null} />

          <JobMatcher jobId={job.id} />

          <Card className="mt-4 gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="p-5 sm:p-7 lg:p-8">
              <h2 className="text-lg font-semibold tracking-[-0.03em]">Job description</h2>
              {job.description?.trim() ? (
                <div className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-[#465047]">{job.description}</div>
              ) : (
                <p className="mt-4 text-sm text-[#747c73]">No description is available for this job.</p>
              )}
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
