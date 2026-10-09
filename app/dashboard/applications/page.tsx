import Link from "next/link";
import { BriefcaseBusiness, MapPin } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { listApplications, type Application } from "@/lib/applications";
import { ApplicationEditor } from "./application-editor";

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatSalary(application: Application): string | null {
  const { salaryMin, salaryMax, salaryCurrency, salaryPeriod } = application.job;
  if (salaryMin === null && salaryMax === null) return null;
  const range = salaryMin !== null && salaryMax !== null
    ? `${salaryMin}–${salaryMax}`
    : salaryMin ?? salaryMax;
  return `${salaryCurrency ? `${salaryCurrency} ` : ""}${range}${salaryPeriod ? ` / ${salaryPeriod.toLowerCase()}` : ""}`;
}

export default async function ApplicationsPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  let applications: Application[] = [];
  let failed = false;
  try {
    applications = await listApplications();
  } catch {
    failed = true;
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar activeHref="/dashboard/applications" />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div>
            <p className="text-xs font-medium text-[#818980]">YOUR JOB SEARCH</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-[34px]">Applications</h1>
            <p className="mt-2 text-sm text-[#747c73]">Track the roles you’re pursuing and keep your notes close.</p>
          </div>

          {failed ? (
            <Card role="alert" className="mt-8 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
              <CardContent className="p-8 text-center sm:p-12">
                <h2 className="font-semibold">We couldn’t load your applications</h2>
                <p className="mt-2 text-sm text-[#747c73]">Please try again in a moment.</p>
                <Link href="/dashboard/applications" className="mt-4 inline-block text-sm font-medium text-[#4c6b52] underline underline-offset-4">Try again</Link>
              </CardContent>
            </Card>
          ) : applications.length === 0 ? (
            <Card className="mt-8 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
              <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
                <span className="flex size-12 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#66806a]"><BriefcaseBusiness size={21} aria-hidden="true" /></span>
                <h2 className="mt-4 font-semibold">No applications yet</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#747c73]">Add a role from its job details page to start keeping track here.</p>
                <Link href="/dashboard/jobs" className="mt-4 text-sm font-medium text-[#4c6b52] underline underline-offset-4">Browse jobs</Link>
              </CardContent>
            </Card>
          ) : (
            <div className="mt-7 grid gap-4">
              {applications.map((application) => {
                const posted = formatDate(application.job.postedAt);
                const salary = formatSalary(application);
                return (
                  <Card key={application.id} className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2e9] text-[#4c684f]"><BriefcaseBusiness size={17} aria-hidden="true" /></span>
                          <div className="min-w-0">
                            <h2 className="break-words font-semibold tracking-[-0.02em]"><Link href={`/dashboard/jobs/${application.jobId}`} className="rounded-sm hover:text-[#4c6b52] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#66806a]">{application.job.title}</Link></h2>
                            <p className="mt-1 text-sm text-[#5e685f]">{application.job.company}</p>
                            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#737c72]">
                              {application.job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{application.job.location}</span>}
                              {application.job.workplaceType && <span>{statusLabel(application.job.workplaceType)}</span>}
                              {application.job.employmentType && <span>{application.job.employmentType}</span>}
                              {salary && <span className="font-medium text-[#425c46]">{salary}</span>}
                              {posted && <span>Posted {posted}</span>}
                            </div>
                          </div>
                        </div>
                        <Badge variant="secondary" className="w-fit border-0 bg-[#edf2ec] text-[#47604b]">{statusLabel(application.status)}</Badge>
                      </div>

                      <ApplicationEditor application={application} />
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
