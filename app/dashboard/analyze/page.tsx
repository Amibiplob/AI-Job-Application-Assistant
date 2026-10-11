import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/presentation/page-header";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { AnalyzeForm } from "./analyze-form";

export default async function AnalyzeJobPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");
  let readiness: "ready" | "missing" | "empty" | "unavailable";
  try {
    const resume = await getResume();
    readiness = !resume ? "missing" : resume.content.trim() ? "ready" : "empty";
  } catch {
    readiness = "unavailable";
  }
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
      <PageHeader eyebrow="Your job search" title="Analyze a job description" description="Compare a role with your saved resume using recognized-skill text overlap. Paste the details below to see which dictionary skills appear in both texts." />
      <InlineFeedback className="mt-6" tone={readiness === "ready" ? "success" : readiness === "unavailable" ? "error" : "info"} announcement="off" title={readiness === "ready" ? "Saved resume ready" : readiness === "unavailable" ? "Resume status unavailable" : readiness === "empty" ? "Your saved resume is empty" : "Save your resume first"}>
        {readiness === "ready" ? "Analysis uses your latest saved resume text. Save any resume edits before comparing." : readiness === "unavailable" ? "We couldn’t check your resume right now. You can enter job details and retry the analysis." : "You can enter job details now, but a comparison needs saved resume content."} <Link href="/dashboard/resume" className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Open your resume workspace</Link>.
      </InlineFeedback>
      <div className="mt-6"><AnalyzeForm /></div>
    </div>
  );
}
