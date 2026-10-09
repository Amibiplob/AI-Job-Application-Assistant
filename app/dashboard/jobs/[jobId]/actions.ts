"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getJobById } from "@/lib/jobs";
import { matchResumeToJob, type JobMatchResult } from "@/lib/job-matching";
import { getResume } from "@/lib/resumes";

export type MatchJobState = {
  status: "idle" | "success" | "no-resume" | "job-not-found" | "error";
  result?: JobMatchResult;
  message?: string;
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

    return {
      status: "success",
      result: matchResumeToJob(resume.content, job.description ?? ""),
    };
  } catch {
    return { status: "error", message: "We couldn’t compare your resume right now. Please try again." };
  }
}
