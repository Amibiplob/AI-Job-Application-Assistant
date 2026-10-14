"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { JobMatchSummary } from "@/components/jobs/job-match-summary";
import { matchJobWithResume, type MatchJobState } from "./actions";
import { MonthlyMatchUsage } from "@/components/dashboard/monthly-match-usage";

const initialState: MatchJobState = { status: "idle" };

export function JobMatcher({ jobId, hasDescription = true }: { jobId: string; hasDescription?: boolean }) {
  const [state, formAction, pending] = useActionState(matchJobWithResume, initialState);
  return (
    <Card className="gap-0 py-0 shadow-subtle"><CardContent className="p-5 sm:p-8">
      <ScanText className="size-5 text-brand" aria-hidden="true" />
      <h2 className="mt-3 text-xl font-semibold tracking-tight">Compare with your resume</h2>
      <p className="mt-3 text-sm leading-6 text-text-secondary">Compare recognized skills in this description with your saved resume. Your resume text stays on the server. Save any resume edits before comparing.</p>
      {hasDescription ? <form action={formAction} aria-busy={pending} className="mt-5"><input type="hidden" name="jobId" value={jobId} /><Button type="submit" disabled={pending} className="h-auto min-h-11 max-w-full whitespace-normal">{pending ? "Comparing…" : "Compare with my resume"}</Button>{pending && <p role="status" className="mt-3 text-sm text-text-secondary">Comparing recognized skills…</p>}</form> : <InlineFeedback tone="info" announcement="off" className="mt-5">A comparison needs job-description text. No description was provided for this listing.</InlineFeedback>}
      {(state.status === "no-resume" || state.status === "empty-resume") && <InlineFeedback tone="info" title="Add your resume first" className="mt-5">{state.message} <Link href="/dashboard/resume" className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Open your resume workspace</Link>.</InlineFeedback>}
      {state.status === "no-description" && <InlineFeedback tone="info" title="Description unavailable" className="mt-5">{state.message}</InlineFeedback>}
      {state.status === "quota-exhausted" && <InlineFeedback tone="info" title="Monthly allowance used up" className="mt-5">{state.message}</InlineFeedback>}
      {(state.status === "error" || state.status === "job-not-found") && <InlineFeedback tone="error" title="Comparison unavailable" className="mt-5">{state.message}</InlineFeedback>}
      {state.status === "success" && state.result && <JobMatchSummary result={state.result} />}
      {state.usage && <div className="mt-5"><MonthlyMatchUsage usage={state.usage} /></div>}
    </CardContent></Card>
  );
}
