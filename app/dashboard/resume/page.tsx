import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, ScanText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/presentation/page-header";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { ResumeEditor } from "./resume-editor";

export default async function ResumePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  let resume;
  try {
    resume = await getResume();
  } catch {
    return <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10"><PageHeader eyebrow="Your profile" title="Your resume" description="Keep your experience in one place for your job search." /><InlineFeedback tone="error" title="We couldn’t load your resume" className="mt-8">Reload this page to try again. Your saved resume has not been changed.</InlineFeedback></div>;
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Your profile" title="Your resume" description="Keep your experience in one place. Save your resume, then use it to explore how your skills align with a job description." />
      <div className="mt-8 grid min-w-0 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_280px]">
        <ResumeEditor resume={resume} />
        <Card className="gap-0 bg-surface-muted py-0 shadow-none">
          <CardContent className="p-5 sm:p-6">
            <ScanText aria-hidden="true" className="size-5 text-brand" />
            <h2 className="mt-4 text-base font-semibold">Put your resume to work</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Job analysis compares recognized skills in your saved resume with those in a job description. Save your changes before analyzing an opportunity.</p>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Matching uses deterministic skill overlap. It does not predict hiring outcomes or assess every aspect of your experience.</p>
            <Link href="/dashboard/analyze" className="mt-5 inline-flex items-center gap-2 rounded-md text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">Analyze a job description<ArrowRight aria-hidden="true" className="size-4" /></Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
