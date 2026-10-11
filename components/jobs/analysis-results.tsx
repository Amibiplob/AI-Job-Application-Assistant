import { JobMatchSummary } from "@/components/jobs/job-match-summary";
import type { JobDescriptionAnalysis, JobDescriptionInput } from "@/lib/job-matching";

export function AnalysisResults({ analysis, values }: { analysis: JobDescriptionAnalysis; values: JobDescriptionInput }) {
  return (
    <>
      <h2 className="break-words text-xl font-semibold tracking-tight">{values.title} at {values.company}</h2>
      <p className="mt-2 text-sm text-text-secondary">Comparison with your saved resume</p>
      <JobMatchSummary result={{ score: analysis.score, matchingSkills: analysis.matchingSkills, jobSkillsNotDetected: analysis.skillsNotDetected, explanation: analysis.explanation }} />
      <section className="mt-6 rounded-xl border border-border bg-surface-muted p-5">
        <h3 className="text-sm font-semibold">Suggested next step</h3>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{analysis.nextStep}</p>
      </section>
    </>
  );
}
