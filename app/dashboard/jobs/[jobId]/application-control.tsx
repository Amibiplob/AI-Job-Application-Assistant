"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { addJobToApplications, type AddTrackedJobState } from "./application-actions";
import type { ApplicationStatus } from "@/lib/applications";

const initialState: AddTrackedJobState = { status: "idle" };

function statusLabel(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

export function ApplicationControl({
  jobId,
  initialStatus,
}: {
  jobId: string;
  initialStatus: ApplicationStatus | null;
}) {
  const [state, formAction, pending] = useActionState(addJobToApplications, initialState);
  const alreadyTracked = initialStatus !== null || state.status === "added" || state.status === "already-tracked";
  const trackedStatus = state.applicationStatus ?? initialStatus;

  return (
    <section aria-label="Application tracking" className="mt-4 rounded-xl bg-white p-5 ring-1 ring-[#e8ebe6] sm:flex sm:items-center sm:justify-between sm:gap-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold tracking-[-0.02em]">Your applications</h2>
        <p className="mt-1 text-sm leading-6 text-[#747c73]">Keep track of this role and update your progress when it changes.</p>
      </div>

      {alreadyTracked ? (
        <div role="status" className="mt-4 flex flex-wrap items-center gap-2 text-sm text-[#49634d] sm:mt-0">
          <Badge variant="secondary" className="border-0 bg-[#edf2ec] text-[#47604b]">
            {state.status === "added" ? "Saved" : statusLabel(trackedStatus ?? "SAVED")}
          </Badge>
          <span>{state.message ?? "This job is already in your applications."}</span>
          <Link href="/dashboard/applications" className="font-medium underline underline-offset-4 hover:text-[#203c32]">View applications</Link>
        </div>
      ) : (
        <form action={formAction} className="mt-4 sm:mt-0">
          <input type="hidden" name="jobId" value={jobId} />
          <Button type="submit" disabled={pending} className="h-10 w-full rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143] sm:w-auto">
            {pending ? "Adding…" : "Add to applications"}
          </Button>
          {(state.status === "error" || state.status === "job-not-found") && <p role="alert" className="mt-2 text-sm text-red-700">{state.message}</p>}
        </form>
      )}
    </section>
  );
}
