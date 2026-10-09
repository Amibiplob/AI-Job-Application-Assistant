"use server";

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { addApplication } from "@/lib/applications";

export type AddTrackedJobState = {
  status: "idle" | "added" | "already-tracked" | "job-not-found" | "error";
  applicationStatus?: string;
  message?: string;
};

export async function addJobToApplications(
  _previousState: AddTrackedJobState,
  formData: FormData,
): Promise<AddTrackedJobState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const value = formData.get("jobId");
  const jobId = typeof value === "string" ? value : "";

  try {
    const result = await addApplication(jobId);
    if (result.status === "job-not-found") {
      return { status: "job-not-found", message: "This job is no longer available." };
    }
    return {
      status: result.status,
      applicationStatus: result.application.status,
      message: result.status === "added" ? "Added to your applications." : "This job is already in your applications.",
    };
  } catch {
    return { status: "error", message: "We couldn’t add this job right now. Please try again." };
  }
}
