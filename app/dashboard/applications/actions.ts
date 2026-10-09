"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { updateApplication } from "@/lib/applications";

export type UpdateApplicationState = {
  status: "idle" | "success" | "error";
  message?: string;
};

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function saveApplication(
  _previousState: UpdateApplicationState,
  formData: FormData,
): Promise<UpdateApplicationState> {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  let result;
  try {
    result = await updateApplication({
      applicationId: readText(formData, "applicationId"),
      status: readText(formData, "status"),
      notes: readText(formData, "notes"),
      appliedAt: readText(formData, "appliedAt"),
    });
  } catch {
    return { status: "error", message: "We couldn’t save your update. Please try again." };
  }

  if (result === "invalid-input") {
    return { status: "error", message: "Check the status, notes, and applied date, then try again." };
  }
  if (result === "not-found") {
    return { status: "error", message: "We couldn’t find that application in your list. Refresh and try again." };
  }

  revalidatePath("/dashboard/applications");
  return { status: "success", message: "Application updated." };
}
