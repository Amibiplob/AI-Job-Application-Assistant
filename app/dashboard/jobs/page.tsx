import Link from "next/link";
import { BriefcaseBusiness, ChevronLeft, ChevronRight, MapPin, Search } from "lucide-react";
import { redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { listJobs, type Job, type WorkplaceType } from "@/lib/jobs";

const PAGE_SIZE = 10;
const workplaceTypes: { value: WorkplaceType; label: string }[] = [
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "Onsite" },
];

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

function single(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

function formatSalary(job: Job): string | null {
  if (job.salaryMin === null && job.salaryMax === null) return null;
  const currency = job.salaryCurrency ?? "USD";
  const format = (amount: string) => {
    const number = Number(amount);
    return Number.isFinite(number)
      ? new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 0 }).format(number)
      : amount;
  };
  const range = job.salaryMin !== null && job.salaryMax !== null
    ? `${format(job.salaryMin)} – ${format(job.salaryMax)}`
    : format(job.salaryMin ?? job.salaryMax ?? "");
  return `${range}${job.salaryPeriod ? ` / ${job.salaryPeriod.toLowerCase()}` : ""}`;
}

function formatDate(date: Date | null): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function pageHref(page: number, search: string, workplace: string): string {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (workplace) params.set("workplace", workplace);
  params.set("page", String(page));
  return `/dashboard/jobs?${params.toString()}`;
}

export default async function JobsPage({ searchParams }: { searchParams: SearchParams }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const params = await searchParams;
  const search = single(params.q).trim().slice(0, 100);
  const requestedWorkplace = single(params.workplace).toUpperCase();
  const workplace = workplaceTypes.some(({ value }) => value === requestedWorkplace)
    ? requestedWorkplace as WorkplaceType
    : "";
  const requestedPage = Number.parseInt(single(params.page), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 100_000)
    : 1;

  let jobs: Job[] = [];
  let hasMore = false;
  let failed = false;
  try {
    const results = await listJobs({
      limit: PAGE_SIZE + 1,
      offset: (page - 1) * PAGE_SIZE,
      search: search || null,
      workplaceType: workplace || null,
    });
    hasMore = results.length > PAGE_SIZE;
    jobs = results.slice(0, PAGE_SIZE);
  } catch {
    failed = true;
  }

  const start = jobs.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const end = (page - 1) * PAGE_SIZE + jobs.length;

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar activeHref="/dashboard/jobs" />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto max-w-[1200px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div>
            <p className="text-xs font-medium text-[#818980]">EXPLORE OPPORTUNITIES</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-[34px]">Find your next role</h1>
            <p className="mt-2 text-sm text-[#747c73]">Browse jobs and narrow the list to what works for you.</p>
          </div>

          <form action="/dashboard/jobs" method="get" className="mt-7 rounded-xl bg-white p-4 ring-1 ring-[#e8ebe6] sm:p-5">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
              <div className="space-y-2">
                <label htmlFor="job-search" className="text-xs font-medium text-[#566057]">Job title or company</label>
                <div className="relative">
                  <Search size={16} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-[#92998f]" />
                  <Input id="job-search" name="q" type="search" defaultValue={search} placeholder="Try “designer” or a company" className="h-10 rounded-lg border-[#dfe4dc] pl-9 text-sm" />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="workplace" className="text-xs font-medium text-[#566057]">Workplace</label>
                <select id="workplace" name="workplace" defaultValue={workplace} className="h-10 w-full rounded-lg border border-[#dfe4dc] bg-white px-3 text-sm text-[#344039] outline-none focus-visible:ring-3 focus-visible:ring-[#91a894]/40">
                  <option value="">Any workplace</option>
                  {workplaceTypes.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
                </select>
              </div>
              <Button type="submit" className="h-10 rounded-lg bg-[#203c32] px-5 text-sm text-white hover:bg-[#2d5143]">Search jobs</Button>
            </div>
            {page > 1 && <input type="hidden" name="page" value="1" />}
          </form>

          <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-[#727a71]">{failed ? "Job results are unavailable" : jobs.length ? `Showing ${start}–${end} jobs` : "No jobs to show"}</p>
            {workplace && <Badge variant="secondary" className="border-0 bg-[#edf2ec] text-[#55705a]">{workplace[0] + workplace.slice(1).toLowerCase()}</Badge>}
          </div>

          {failed ? (
            <Card role="alert" className="mt-4 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
              <CardContent className="p-8 text-center sm:p-12">
                <p className="font-semibold">We couldn’t load jobs right now</p>
                <p className="mt-2 text-sm text-[#747c73]">Please try again in a moment.</p>
                <Button render={<Link href={pageHref(page, search, workplace)} />} variant="outline" className="mt-5 rounded-lg border-[#dfe4dc]">Try again</Button>
              </CardContent>
            </Card>
          ) : jobs.length === 0 ? (
            <Card className="mt-4 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
              <CardContent className="flex flex-col items-center p-8 text-center sm:p-12">
                <span className="flex size-12 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#66806a]"><BriefcaseBusiness size={21} aria-hidden="true" /></span>
                <h2 className="mt-4 font-semibold">{search || workplace ? "No matching jobs" : "No jobs available yet"}</h2>
                <p className="mt-2 max-w-md text-sm leading-6 text-[#747c73]">{search || workplace ? "Try a different title, company, or workplace filter." : "Check back later for new opportunities."}</p>
                {(search || workplace) && <Button render={<Link href="/dashboard/jobs" />} variant="outline" className="mt-5 rounded-lg border-[#dfe4dc]">Clear filters</Button>}
              </CardContent>
            </Card>
          ) : (
            <div className="mt-4 grid gap-3">
              {jobs.map((job) => {
                const salary = formatSalary(job);
                const posted = formatDate(job.postedAt);
                return (
                  <Card key={job.id} className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
                    <CardContent className="p-4 sm:p-5">
                      <div className="flex items-start gap-3.5">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#eef2e9] text-[#4c684f]"><BriefcaseBusiness size={17} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <h2 className="break-words font-semibold tracking-[-0.02em]">{job.title}</h2>
                          <p className="mt-1 text-sm text-[#5e685f]">{job.company}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-[#737c72]">
                            {job.location && <span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{job.location}</span>}
                            {job.workplaceType && <Badge variant="outline" className="h-6 border-[#e3e8e1] px-2 text-[11px] text-[#59685a]">{job.workplaceType[0] + job.workplaceType.slice(1).toLowerCase()}</Badge>}
                            {job.employmentType && <span>{job.employmentType}</span>}
                            {salary && <span className="font-medium text-[#425c46]">{salary}</span>}
                          </div>
                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-[#8b9289]">
                            {posted && <span>Posted {posted}</span>}
                            <span>Source: {job.source}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!failed && jobs.length > 0 && <nav aria-label="Jobs pages" className="mt-6 flex items-center justify-between border-t border-[#e8ebe6] pt-4">
            <p className="text-xs text-[#818980]">Page {page}</p>
            <div className="flex gap-2">
              {page > 1 && <Button render={<Link href={pageHref(page - 1, search, workplace)} />} variant="outline" className="h-9 rounded-lg border-[#dfe4dc] px-3 text-xs"><ChevronLeft size={14} aria-hidden="true" />Previous</Button>}
              {hasMore && <Button render={<Link href={pageHref(page + 1, search, workplace)} />} variant="outline" className="h-9 rounded-lg border-[#dfe4dc] px-3 text-xs">Next<ChevronRight size={14} aria-hidden="true" /></Button>}
            </div>
          </nav>}
        </main>
      </div>
    </div>
  );
}
