"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getJobById } from "@/lib/jobs";
import { matchResumeToJob, type JobMatchResult } from "@/lib/job-matching";
import { getResume } from "@/lib/resumes";
import { runWithCurrentUserMonthlyUsage } from "@/lib/monetization/current-user";
import { MATCH_QUOTA_EXHAUSTED_MESSAGE } from "@/lib/monetization/messages";
import type { Usage } from "@/lib/monetization/store";

export type MatchJobState = {
  status: "idle" | "success" | "no-resume" | "empty-resume" | "no-description" | "job-not-found" | "quota-exhausted" | "error";
  result?: JobMatchResult;
  message?: string;
  usage?: Usage;
};

function readJobId(formData: FormData): string {
  const value = formData.get("jobId");
  return typeof value === "string" ? value : "";
}

export async function matchJobWithResume(
  _previousState: MatchJobState,
  formData: FormData,
): Promise<MatchJobState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const jobId = readJobId(formData);
  try {
    const job = await getJobById(jobId);
    if (!job) {
      return { status: "job-not-found", message: "This job is no longer available." };
    }

    // getResume uses the active session and constrains its query to that user's ID.
    const resume = await getResume();
    if (!resume) {
      return { status: "no-resume", message: "Add a resume before comparing it with this job." };
    }
    if (!resume.content.trim()) {
      return { status: "empty-resume", message: "Your saved resume is empty. Add resume content before comparing." };
    }
    const description = job.description;
    if (!description?.trim()) {
      return { status: "no-description", message: "A comparison needs job-description text. No description was provided for this listing." };
    }

    const match = await runWithCurrentUserMonthlyUsage("job_analysis", () =>
      matchResumeToJob(resume.content, description));
    if (!match.allowed) {
      return { status: "quota-exhausted", message: MATCH_QUOTA_EXHAUSTED_MESSAGE, usage: match.usage };
    }

    return {
      status: "success",
      result: match.value,
      usage: match.usage,
    };
  } catch {
    return { status: "error", message: "We couldn’t compare your resume right now. Please try again." };
  }
}
