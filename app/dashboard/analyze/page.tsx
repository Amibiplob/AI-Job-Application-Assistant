import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { AnalyzeForm } from "./analyze-form";

export default async function AnalyzeJobPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const resume = await getResume();

  return (
    <div className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div className="mb-7">
            <p className="text-xs font-medium text-[#818980]">YOUR JOB SEARCH</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-[34px]">Analyze a job description</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#747c73]">Compare a role with your saved resume using the app’s existing skill dictionary. The description is processed for this request only and is not stored or sent to an external service.</p>
          </div>

          {!resume && (
            <Card className="mb-5 rounded-xl border-0 bg-[#eef3ec] py-0 shadow-none ring-1 ring-[#e1e9df]">
              <CardContent className="p-4 text-sm leading-6 text-[#566057]">You have not saved a resume yet. You can enter the job details now, then add your resume to get a comparison.</CardContent>
            </Card>
          )}
          {resume && !resume.content.trim() && (
            <Card className="mb-5 rounded-xl border-0 bg-[#eef3ec] py-0 shadow-none ring-1 ring-[#e1e9df]">
              <CardContent className="p-4 text-sm leading-6 text-[#566057]">Your saved resume has no text to compare. Update it on the <Link className="font-medium underline underline-offset-2" href="/dashboard/resume">resume page</Link>.</CardContent>
            </Card>
          )}

          <AnalyzeForm />
    </div>
  );
}
