import { Badge } from "@/components/ui/badge";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import type { JobMatchResult } from "@/lib/job-matching";

export function JobMatchSummary({ result }: { result: JobMatchResult }) {
  const recognized = result.matchingSkills.length + result.jobSkillsNotDetected.length;
  return (
    <div className="mt-6 space-y-5 border-t border-border pt-6" aria-live="polite" aria-atomic="true">
      <div className="rounded-xl border border-brand/15 bg-brand-subtle p-5">
        <h3 className="text-sm font-medium text-brand-foreground">Recognized-skill text overlap</h3>
        <p className="mt-2 text-3xl font-semibold tracking-tight text-brand">{recognized ? `${result.score}%` : "Not scored"}</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">{recognized ? `${result.matchingSkills.length} of ${recognized} recognized job skills detected in your saved resume.` : "No dictionary skills were recognized in the job description, so there is no meaningful overlap score."}</p>
      </div>
      {recognized > 0 && <div className="grid min-w-0 gap-5 sm:grid-cols-2">
        <section aria-labelledby="matching-skills-heading"><h4 id="matching-skills-heading" className="text-sm font-semibold">Matching skills</h4>{result.matchingSkills.length ? <ul className="mt-3 flex flex-wrap gap-2">{result.matchingSkills.map(skill => <li key={skill}><Badge variant="secondary">{skill}</Badge></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-text-secondary">No shared skills were detected in the supplied text.</p>}</section>
        <section aria-labelledby="undetected-skills-heading"><h4 id="undetected-skills-heading" className="text-sm font-semibold">Job skills not detected in your resume</h4>{result.jobSkillsNotDetected.length ? <ul className="mt-3 flex flex-wrap gap-2">{result.jobSkillsNotDetected.map(skill => <li key={skill}><Badge variant="outline">{skill}</Badge></li>)}</ul> : <p className="mt-2 text-sm leading-6 text-text-secondary">All recognized job skills were detected in your resume text.</p>}</section>
      </div>}
      <p className="text-sm leading-6 text-text-secondary">{result.explanation}</p>
      <InlineFeedback tone="info" announcement="off">This deterministic dictionary comparison is a text-overlap heuristic, not a hiring probability or a full assessment of your qualifications. Skills not detected in your text may still be part of your experience.</InlineFeedback>
    </div>
  );
}
