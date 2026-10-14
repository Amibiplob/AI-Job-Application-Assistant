"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef } from "react";
import { ScanText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { useAnalysisDraft } from "@/components/jobs/analysis-draft";
import { AnalysisResults } from "@/components/jobs/analysis-results";
import { JOB_DESCRIPTION_LIMITS, type JobDescriptionInput } from "@/lib/job-matching";
import { analyzeJobDescription, type AnalyzeJobDescriptionState } from "./actions";
import { MonthlyMatchUsage } from "@/components/dashboard/monthly-match-usage";

const initialState: AnalyzeJobDescriptionState = { status: "idle" };

export function AnalyzeForm() {
  const [state, formAction, pending] = useActionState(analyzeJobDescription, initialState);
  const [draft, setDraft] = useAnalysisDraft();
  const form = useRef<HTMLFormElement>(null);
  const result = useRef<HTMLDivElement>(null);
  const hasDraft = Boolean(draft.title || draft.company || draft.description);
  useEffect(() => {
    if (state.status === "invalid") form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
    else if (state.status !== "idle") result.current?.focus();
  }, [state]);
  useEffect(() => {
    if (!hasDraft) return;
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const beforeNavigate = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const anchor = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      if (!window.confirm("Leave this analysis? Your pasted job details are not saved.")) { event.preventDefault(); event.stopPropagation(); }
      else setDraft({ title: "", company: "", description: "" });
    };
    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", beforeNavigate, true);
    return () => { window.removeEventListener("beforeunload", beforeUnload); document.removeEventListener("click", beforeNavigate, true); };
  }, [hasDraft, setDraft]);
  const update = (field: keyof JobDescriptionInput, value: string) => setDraft(previous => ({ ...previous, [field]: value }));
  return (
    <div className="grid min-w-0 items-start gap-6 xl:grid-cols-2">
      <Card className="gap-0 py-0 shadow-subtle"><CardContent className="min-w-0 p-5 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">Opportunity details</h2>
        <p className="mt-3 text-sm leading-6 text-text-secondary">Copy the actual role requirements for the most useful comparison. Example only: “React and TypeScript experience; SQL is useful.” This sample is not a real job listing.</p>
        <form ref={form} action={formAction} aria-label="Analyze a job description" aria-busy={pending} className="mt-6">
          <fieldset disabled={pending} className="min-w-0 space-y-5"><legend className="sr-only">Job description details</legend>
            {(["title", "company", "description"] as const).map(field => {
              const id = `analysis-${field}`;
              const error = state.errors?.[field];
              const common = { id, name: field, required: true, maxLength: JOB_DESCRIPTION_LIMITS[field], value: draft[field], onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => update(field, event.target.value), "aria-invalid": Boolean(error), "aria-describedby": `${id}-help${error ? ` ${id}-error` : ""}` };
              return <div key={field} className="min-w-0 space-y-2"><label htmlFor={id} className="text-sm font-medium">{field === "title" ? "Job title" : field === "company" ? "Company" : "Job description"}</label>{field === "description" ? <Textarea {...common} rows={12} placeholder="Paste the role description and requirements here." className="min-h-72 resize-y leading-6" /> : <Input {...common} className="h-11" />}<p id={`${id}-help`} className="text-xs text-text-secondary">{draft[field].length} / {JOB_DESCRIPTION_LIMITS[field]} characters{field === "description" ? ". Processed for this request only; not saved or sent to an external service." : "."}</p>{error && <p id={`${id}-error`} className="text-sm text-error">{error}</p>}</div>;
            })}
            <Button type="submit" disabled={pending} className="h-auto min-h-11 max-w-full whitespace-normal">{pending ? "Analyzing…" : "Analyze against my resume"}</Button>
          </fieldset>
          {pending && <p role="status" className="mt-4 text-sm text-text-secondary">Comparing recognized skills with your saved resume…</p>}
          <p className="mt-4 text-xs leading-5 text-text-secondary">Pasted details remain in this form after analysis. Back/Forward within your workspace keeps this draft. Confirming the leave prompt, refreshing, or logging out discards it.</p>
        </form>
      </CardContent></Card>
      <div className="min-w-0 space-y-6">
        <Card className="gap-0 py-0 shadow-subtle"><CardContent ref={result} tabIndex={-1} className="min-w-0 rounded-xl p-5 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus sm:p-8">
          {state.status === "success" && state.analysis && state.values ? <AnalysisResults analysis={state.analysis} values={state.values} /> : <>
            <ScanText aria-hidden="true" className="size-6 text-brand" /><h2 className="mt-4 text-xl font-semibold tracking-tight">{pending ? "Analysis in progress" : "Your comparison appears here"}</h2>
            <p className="mt-3 text-sm leading-6 text-text-secondary">Submit the job details to compare recognized skills. Results describe text overlap with your saved resume, not your overall suitability for the role.</p>
          </>}
          {state.status === "invalid" && <InlineFeedback tone="error" title="Check the job details" className="mt-5">Review the highlighted fields. Your input has been kept.</InlineFeedback>}
          {state.status === "error" && <InlineFeedback tone="error" title="Analysis unavailable" className="mt-5">{state.message} Your input has been kept; try again.</InlineFeedback>}
          {state.status === "quota-exhausted" && <InlineFeedback tone="info" title="Monthly allowance used up" className="mt-5">{state.message} Your input has been kept.</InlineFeedback>}
          {(state.status === "no-resume" || state.status === "empty-resume") && <InlineFeedback title="Add resume content first" className="mt-5">{state.message ?? "Save a resume before comparing this role."} <Link href="/dashboard/resume" className="rounded-sm font-medium underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-focus">Open your resume workspace</Link>.</InlineFeedback>}
        </CardContent></Card>
        {state.usage && <MonthlyMatchUsage usage={state.usage} />}
        <InlineFeedback announcement="off" title="How to read the results">The denominator contains only job-description skills recognized by the dictionary. Accessibility and responsive-design requirements may not be recognized unless included in that dictionary. Review the full role requirements yourself.</InlineFeedback>
      </div>
    </div>
  );
}
