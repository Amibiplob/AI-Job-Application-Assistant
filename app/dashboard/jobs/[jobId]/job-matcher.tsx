"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { matchJobWithResume, type MatchJobState } from "./actions";

const initialState: MatchJobState = { status: "idle" };

export function JobMatcher({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(matchJobWithResume, initialState);

  return (
    <Card className="mt-4 gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
      <CardContent className="p-5 sm:p-7 lg:p-8">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">Match with my resume</h2>
            <p className="mt-1.5 max-w-2xl text-sm leading-6 text-[#747c73]">
              Compare skills mentioned in this job description with terms found in your saved resume. Your resume text stays on the server.
            </p>
          </div>
          <form action={formAction}>
            <input type="hidden" name="jobId" value={jobId} />
            <Button type="submit" disabled={pending} className="h-10 w-full rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143] sm:w-auto">
              {pending ? "Comparing…" : "Match with my resume"}
            </Button>
          </form>
        </div>

        {state.status === "no-resume" && (
          <div role="status" className="mt-5 rounded-lg bg-[#f6f8f5] p-4 text-sm text-[#566057]">
            <p>{state.message}</p>
            <Link href="/dashboard/resume" className="mt-2 inline-block font-medium text-[#4c6b52] underline underline-offset-4 hover:text-[#203c32]">Add your resume</Link>
          </div>
        )}
        {(state.status === "error" || state.status === "job-not-found") && (
          <p role="alert" className="mt-5 rounded-lg bg-red-50 p-4 text-sm text-red-800">{state.message}</p>
        )}

        {state.status === "success" && state.result && (
          <div className="mt-6 border-t border-[#edf0eb] pt-5" aria-live="polite">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="text-3xl font-semibold tracking-[-0.06em] text-[#365440]">{state.result.score}%</p>
              <p className="text-sm font-medium text-[#566057]">detected skill overlap</p>
            </div>

            <div className="mt-5 grid gap-5 sm:grid-cols-2">
              <section aria-labelledby="matching-skills-heading">
                <h3 id="matching-skills-heading" className="text-sm font-semibold">Matching skills</h3>
                {state.result.matchingSkills.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {state.result.matchingSkills.map((skill) => <li key={skill}><Badge variant="secondary" className="border-0 bg-[#edf2ec] text-[#47604b]">{skill}</Badge></li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#747c73]">No matching skills were detected in the supplied text.</p>
                )}
              </section>

              <section aria-labelledby="undetected-skills-heading">
                <h3 id="undetected-skills-heading" className="text-sm font-semibold">Job skills not detected in your resume</h3>
                {state.result.jobSkillsNotDetected.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {state.result.jobSkillsNotDetected.map((skill) => <li key={skill}><Badge variant="outline" className="border-[#e3e8e1] text-[#647064]">{skill}</Badge></li>)}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-[#747c73]">No additional job-description skills were detected.</p>
                )}
              </section>
            </div>

            <div className="mt-5 rounded-lg bg-[#f6f8f5] p-4">
              <p className="text-sm leading-6 text-[#59645a]">{state.result.explanation}</p>
              <p className="mt-2 text-xs leading-5 text-[#7b837a]">This is a text-overlap heuristic, not a validated qualification score. A skill not detected in your resume text may still be part of your experience.</p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
