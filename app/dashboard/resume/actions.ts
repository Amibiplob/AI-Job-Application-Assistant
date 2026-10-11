"use server";

import { revalidatePath } from "next/cache";
import { createResume, updateResume } from "@/lib/resumes";

type ResumeField = "name" | "content";

export type SavedResume = { id: string; name: string; content: string };

export type ResumeFormState = {
  saved?: SavedResume;
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

  let saved;
  try {
    if (resumeId) {
      const updatedResume = await updateResume(resumeId, name, content);
      if (!updatedResume) {
        return { message: "We couldn't find that resume. Refresh the page and try again.", values: { name, content } };
      }
      saved = updatedResume;
    } else {
      saved = await createResume(name, content);
    }
  } catch {
    return {
      message: "We couldn't save your resume. Please try again.",
      values: { name, content },
    };
  }

  revalidatePath("/dashboard/resume");
  revalidatePath("/dashboard");
  return { saved: { id: saved.id, name: saved.name, content: saved.content } };
}
