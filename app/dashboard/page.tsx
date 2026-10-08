import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  CalendarClock,
  CheckCheck,
  ChevronRight,
  CircleHelp,
  FileText,
  MapPin,
  Plus,
  Sparkles,
  UsersRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

// Local demonstration data; replace with the user's job-search data when available.
const stats = [
  { label: "Saved jobs", value: "12", detail: "3 added this week", icon: Bookmark },
  { label: "Applications", value: "8", detail: "2 in progress", icon: FileText },
  { label: "Interviews", value: "2", detail: "1 coming up", icon: UsersRound },
  { label: "Follow-ups", value: "3", detail: "Worth checking in", icon: CalendarClock },
];

const recommendedJobs = [
  {
    company: "Northstar",
    initials: "N",
    color: "bg-[#eef2e9] text-[#4c684f]",
    role: "Product Designer",
    location: "Remote · United States",
    type: "Full-time",
    match: 86,
    note: "Your product design and research experience align with several key requirements.",
    posted: "Posted 2 days ago",
  },
  {
    company: "Fieldnotes",
    initials: "F",
    color: "bg-[#f2eee8] text-[#8b6846]",
    role: "UX Researcher",
    location: "Brooklyn, NY · Hybrid",
    type: "Full-time",
    match: 79,
    note: "Your interview research and synthesis work look relevant to this role.",
    posted: "Posted yesterday",
  },
  {
    company: "Common Ground",
    initials: "C",
    color: "bg-[#edf0f5] text-[#536986]",
    role: "Product Design Lead",
    location: "Remote · United States",
    type: "Full-time",
    match: 73,
    note: "Your design systems background aligns; the role also asks for team leadership.",
    posted: "Posted 4 days ago",
  },
];

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-medium text-[#818980]">YOUR JOB SEARCH</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-[34px]">Your search, at a glance</h1>
              <p className="mt-2 text-sm text-[#747c73]">A little progress adds up. Here&apos;s where things stand.</p>
            </div>
            <Button render={<Link href="#find-jobs" />} className="h-10 w-fit rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">
              <Plus size={16} aria-hidden="true" /> Find a job
            </Button>
          </div>

          <section aria-label="Job search statistics" className="mt-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map(({ label, value, detail, icon: Icon }) => (
              <Card key={label} className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <p className="text-[13px] font-medium text-[#717970]">{label}</p>
                    <span className="flex size-8 items-center justify-center rounded-lg bg-[#f2f5f1] text-[#66806a]"><Icon size={16} strokeWidth={1.8} aria-hidden="true" /></span>
                  </div>
                  <p className="mt-4 text-[30px] font-semibold leading-none tracking-[-0.06em]">{value}</p>
                  <p className="mt-2 text-xs text-[#8b9289]">{detail}</p>
                </CardContent>
              </Card>
            ))}
          </section>

          <section className="mt-10" aria-labelledby="recommended-heading">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><h2 id="recommended-heading" className="text-lg font-semibold tracking-[-0.035em]">Recommended jobs</h2><Badge variant="secondary" className="border-0 bg-[#edf2ec] text-[#55705a]">For you</Badge></div>
                <p className="mt-1 text-sm text-[#7b827a]">Roles that may fit what you&apos;re looking for.</p>
              </div>
              <Link href="#find-jobs" className="inline-flex items-center gap-1 text-xs font-medium text-[#4c6b52] hover:text-[#203c32]">Browse jobs <ArrowRight size={14} aria-hidden="true" /></Link>
            </div>

            <div className="mt-4 grid gap-3">
              {recommendedJobs.map((job) => (
                <Card key={job.company} className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6] transition-shadow hover:shadow-sm">
                  <CardContent className="p-4 sm:p-5">
                    <div className="flex flex-col gap-5 md:flex-row md:items-center">
                      <div className="flex min-w-0 flex-1 items-start gap-3.5">
                        <span className={`flex size-11 shrink-0 items-center justify-center rounded-xl text-base font-semibold ${job.color}`}>{job.initials}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1"><h3 className="font-semibold tracking-[-0.02em]">{job.role}</h3><span className="text-xs text-[#818880]">at {job.company}</span></div>
                          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#7a8179]"><span className="inline-flex items-center gap-1"><MapPin size={13} aria-hidden="true" />{job.location}</span><span className="hidden size-1 rounded-full bg-[#c2c8c0] sm:block" /><span>{job.type}</span><span className="hidden size-1 rounded-full bg-[#c2c8c0] sm:block" /><span>{job.posted}</span></div>
                          <p className="mt-3 max-w-2xl text-xs leading-5 text-[#727a71]">{job.note}</p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4 border-t border-[#edf0eb] pt-4 md:w-[205px] md:shrink-0 md:flex-col md:items-stretch md:border-l md:border-t-0 md:pl-5 md:pt-0">
                        <div className="flex items-center gap-2"><span className="flex size-8 items-center justify-center rounded-full border-[3px] border-[#dce8db] text-[10px] font-semibold text-[#45634a]">{job.match}</span><div><p className="text-xs font-semibold text-[#425c46]">{job.match}% match</p><p className="mt-0.5 text-[10px] text-[#899087]">A useful starting point</p></div><button aria-label={`About ${job.match}% match score`} className="text-[#a0a69e] hover:text-[#5a705d]"><CircleHelp size={14} aria-hidden="true" /></button></div>
                        <div className="flex items-center gap-2 md:justify-end"><Button variant="outline" size="icon" aria-label={`Save ${job.role} at ${job.company}`} className="size-9 rounded-lg border-[#e3e8e1] text-[#657064]"><Bookmark size={15} aria-hidden="true" /></Button><Button render={<Link href="#job-details" />} className="h-9 rounded-lg bg-[#203c32] px-3 text-xs text-white hover:bg-[#2d5143]">View role <ArrowUpRight size={14} aria-hidden="true" /></Button></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <Card className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
              <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#f3f4ed] text-[#877d4e]"><CalendarClock size={17} aria-hidden="true" /></span><div><h2 className="text-sm font-semibold">Follow-ups to revisit</h2><p className="mt-1 max-w-lg text-xs leading-5 text-[#7b837a]">You have 3 reminders coming up. A thoughtful check-in can help you stay organized.</p></div></div>
                <Button render={<Link href="#applications" />} variant="outline" className="h-9 shrink-0 rounded-lg border-[#e3e8e1] px-3 text-xs">Review reminders <ChevronRight size={14} aria-hidden="true" /></Button>
              </CardContent>
            </Card>
            <Card className="gap-0 rounded-xl border-0 bg-[#eef3ec] py-0 shadow-none ring-1 ring-[#e1e9df]">
              <CardContent className="flex items-start gap-3 p-5"><span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white text-[#68836c]"><Sparkles size={17} aria-hidden="true" /></span><div><h2 className="text-sm font-semibold text-[#37493a]">Keep your search yours</h2><p className="mt-1 text-xs leading-5 text-[#69776a]">Suggestions and match scores are prompts for your judgment, not a measure of your potential.</p></div></CardContent>
            </Card>
          </section>

          <div className="mt-8 flex items-center justify-center gap-2 py-2 text-[11px] text-[#999f97]"><CheckCheck size={14} aria-hidden="true" /> Demo dashboard · Example information only</div>
        </main>
      </div>
    </div>
  );
}
