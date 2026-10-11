"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { JOB_DESCRIPTION_LIMITS } from "@/lib/job-matching";
import { analyzeJobDescription, type AnalyzeJobDescriptionState } from "./actions";

const initialState: AnalyzeJobDescriptionState = { status: "idle" };

export function AnalyzeForm() {
  const [state, formAction, pending] = useActionState(analyzeJobDescription, initialState);
  const values = state.values;

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.8fr)]">
      <Card className="gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
        <CardContent className="p-5 sm:p-7">
          <form action={formAction} className="space-y-5">
            <div className="space-y-2">
              <label htmlFor="analysis-title" className="text-sm font-medium text-[#303a33]">Job title</label>
              <Input id="analysis-title" name="title" required maxLength={JOB_DESCRIPTION_LIMITS.title} defaultValue={values?.title} aria-invalid={Boolean(state.errors?.title)} aria-describedby={state.errors?.title ? "analysis-title-error" : undefined} className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3" />
              {state.errors?.title && <p id="analysis-title-error" className="text-sm text-red-700">{state.errors.title}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="analysis-company" className="text-sm font-medium text-[#303a33]">Company</label>
              <Input id="analysis-company" name="company" required maxLength={JOB_DESCRIPTION_LIMITS.company} defaultValue={values?.company} aria-invalid={Boolean(state.errors?.company)} aria-describedby={state.errors?.company ? "analysis-company-error" : undefined} className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3" />
              {state.errors?.company && <p id="analysis-company-error" className="text-sm text-red-700">{state.errors.company}</p>}
            </div>

            <div className="space-y-2">
              <label htmlFor="analysis-description" className="text-sm font-medium text-[#303a33]">Job description</label>
              <Textarea id="analysis-description" name="description" required maxLength={JOB_DESCRIPTION_LIMITS.description} rows={14} defaultValue={values?.description} placeholder="Paste the role description and requirements here." aria-invalid={Boolean(state.errors?.description)} aria-describedby={state.errors?.description ? "analysis-description-error" : "analysis-description-help"} className="min-h-[280px] resize-y rounded-lg border-[#dfe4dc] bg-white px-3 py-3 leading-6" />
              <p id="analysis-description-help" className="text-xs text-[#7b837a]">Up to {JOB_DESCRIPTION_LIMITS.description.toLocaleString()} characters. This text is analyzed for this request and is not saved.</p>
              {state.errors?.description && <p id="analysis-description-error" className="text-sm text-red-700">{state.errors.description}</p>}
            </div>

            {state.status === "error" && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p>}
            <Button type="submit" disabled={pending} className="h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">
              {pending ? "Analyzing…" : "Analyze against my resume"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-5">
        {(state.status === "no-resume" || state.status === "empty-resume") && (
          <Card className="rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="p-5 sm:p-7" role="status">
              <h2 className="font-semibold">Add your resume first</h2>
              <p className="mt-2 text-sm leading-6 text-[#747c73]">{state.message ?? "Save resume content to compare this role with your experience."}</p>
              <Button render={<Link href="/dashboard/resume" />} className="mt-4 h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">Go to my resume</Button>
            </CardContent>
          </Card>
        )}

        {state.status === "success" && state.analysis && (
          <Card className="rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="p-5 sm:p-7" aria-live="polite">
              <p className="text-xs font-medium text-[#818980]">ANALYSIS</p>
              <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{values?.title} at {values?.company}</h2>
              {state.analysis.score === null ? (
                <p className="mt-4 rounded-lg bg-[#f6f8f5] p-4 text-sm leading-6 text-[#59645a]">No score is shown because the description did not contain skills from the current matching dictionary.</p>
              ) : (
                <div className="mt-5 flex items-baseline gap-2">
                  <span className="text-4xl font-semibold tracking-[-0.06em] text-[#365440]">{state.analysis.score}%</span>
                  <span className="text-sm text-[#566057]">detected skill overlap</span>
                </div>
              )}

              <section className="mt-6">
                <h3 className="text-sm font-semibold">Skills detected in both</h3>
                {state.analysis.matchingSkills.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">{state.analysis.matchingSkills.map((skill) => <li key={skill}><Badge variant="secondary" className="border-0 bg-[#edf2ec] text-[#47604b]">{skill}</Badge></li>)}</ul>
                ) : <p className="mt-2 text-sm text-[#747c73]">No shared dictionary skills were detected.</p>}
              </section>

              <section className="mt-5">
                <h3 className="text-sm font-semibold">Job-description skills not detected in your resume</h3>
                {state.analysis.skillsNotDetected.length ? (
                  <ul className="mt-2 flex flex-wrap gap-2">{state.analysis.skillsNotDetected.map((skill) => <li key={skill}><Badge variant="outline" className="border-[#e3e8e1] text-[#647064]">{skill}</Badge></li>)}</ul>
                ) : <p className="mt-2 text-sm text-[#747c73]">No additional dictionary skills were detected.</p>}
              </section>

              <div className="mt-5 rounded-lg bg-[#f6f8f5] p-4">
                <h3 className="text-sm font-semibold">Suggested next step</h3>
                <p className="mt-2 text-sm leading-6 text-[#59645a]">{state.analysis.explanation}</p>
                <p className="mt-2 text-sm leading-6 text-[#59645a]">{state.analysis.nextStep}</p>
                <p className="mt-2 text-xs leading-5 text-[#7b837a]">This score is a text-overlap heuristic, not a hiring probability or a complete assessment. The dictionary may miss skills and wording; undetected skills may still be part of your experience.</p>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
