"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  analyzeJobDescriptionAgainstResume,
  validateJobDescriptionInput,
  type JobDescriptionAnalysis,
  type JobDescriptionField,
} from "@/lib/job-matching";
import { getResume } from "@/lib/resumes";

export type AnalyzeJobDescriptionState = {
  status: "idle" | "success" | "invalid" | "no-resume" | "empty-resume" | "error";
  errors?: Partial<Record<JobDescriptionField, string>>;
  values?: { title: string; company: string; description: string };
  analysis?: JobDescriptionAnalysis;
  message?: string;
};

function readField(formData: FormData, field: JobDescriptionField): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function analyzeJobDescription(
  _previousState: AnalyzeJobDescriptionState,
  formData: FormData,
): Promise<AnalyzeJobDescriptionState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const values = {
    title: readField(formData, "title"),
    company: readField(formData, "company"),
    description: readField(formData, "description"),
  };
  const parsed = validateJobDescriptionInput(values);

  if (!parsed.success) {
    return { status: "invalid", errors: parsed.errors, values };
  }

  try {
    // getResume scopes its query to the authenticated PostgreSQL session user.
    const resume = await getResume();
    if (!resume) {
      return { status: "no-resume", values: parsed.data };
    }
    if (!resume.content.trim()) {
      return {
        status: "empty-resume",
        values: parsed.data,
        message: "Your saved resume is empty. Add resume content before analyzing a role.",
      };
    }

    return {
      status: "success",
      values: parsed.data,
      analysis: analyzeJobDescriptionAgainstResume(resume.content, parsed.data.description),
    };
  } catch {
    return {
      status: "error",
      values: parsed.data,
      message: "We couldn’t analyze this job description right now. Please try again.",
    };
  }
}
