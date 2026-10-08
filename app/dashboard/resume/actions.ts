"use server";

import { redirect } from "next/navigation";
import { createResume, updateResume } from "@/lib/resumes";

type ResumeField = "name" | "content";

export type ResumeFormState = {
  errors?: Partial<Record<ResumeField, string>>;
  message?: string;
  values?: {
    name: string;
    content: string;
  };
};

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function saveResume(
  _previousState: ResumeFormState,
  formData: FormData,
): Promise<ResumeFormState> {
  const name = readText(formData, "name").trim();
  const content = readText(formData, "content");
  const resumeId = readText(formData, "resumeId");
  const errors: Partial<Record<ResumeField, string>> = {};

  if (!name) {
    errors.name = "Enter a name for your resume.";
  }

  if (!content.trim()) {
    errors.content = "Enter your resume content.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, content } };
  }

  try {
    if (resumeId) {
      const updatedResume = await updateResume(resumeId, name, content);
      if (!updatedResume) {
        return { message: "We couldn't find that resume. Refresh the page and try again." };
      }
    } else {
      await createResume(name, content);
    }
  } catch {
    return {
      message: "We couldn't save your resume. Please try again.",
      values: { name, content },
    };
  }

  redirect("/dashboard/resume");
}
