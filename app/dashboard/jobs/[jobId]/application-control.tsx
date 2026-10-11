"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { BookmarkPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/presentation/status-badge";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { addJobToApplications, type AddTrackedJobState } from "./application-actions";
import type { ApplicationStatus } from "@/lib/applications";

const initialState: AddTrackedJobState = { status: "idle" };

export function ApplicationControl({ jobId, initialStatus }: { jobId: string; initialStatus: ApplicationStatus | null }) {
  const [state, formAction, pending] = useActionState(addJobToApplications, initialState);
  const applicationsLink = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (state.status === "added" || state.status === "already-tracked") applicationsLink.current?.focus();
  }, [state.status]);
  const alreadyTracked = initialStatus !== null || state.status === "added" || state.status === "already-tracked";
  const trackedStatus = state.applicationStatus ?? initialStatus;
  return (
    <Card className="gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-6">
      <BookmarkPlus aria-hidden="true" className="size-5 text-brand" />
      <h2 className="mt-3 text-base font-semibold">Application tracking</h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">Save this role to keep its status and your notes together. Adding it to your tracker does not submit an application to the employer.</p>
      {alreadyTracked ? <div className="mt-5 space-y-3"><StatusBadge status={trackedStatus ?? "SAVED"} /><InlineFeedback tone="success" title={state.status === "added" ? "Added to your tracker" : "Already tracked"}>{state.message ?? "This job is already in your applications."}</InlineFeedback><Link ref={applicationsLink} href="/dashboard/applications" className="inline-flex min-h-11 items-center rounded-md text-sm font-medium text-brand underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">View applications</Link></div> : <form action={formAction} aria-busy={pending} className="mt-5"><input type="hidden" name="jobId" value={jobId} /><Button type="submit" disabled={pending} className="h-auto min-h-11 w-full whitespace-normal">{pending ? "Adding…" : "Add to tracking"}</Button>{pending && <p role="status" className="mt-3 text-sm text-text-secondary">Adding this role to your tracker…</p>}{(state.status === "error" || state.status === "job-not-found") && <InlineFeedback tone="error" title="Job not added" className="mt-4">{state.message}</InlineFeedback>}</form>}
    </CardContent></Card>
  );
}
