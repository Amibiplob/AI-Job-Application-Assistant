/**
 * Explicit vocabulary for this rule-based baseline. Aliases are matched as
 * whole terms so, for example, "Go" does not match the end of another word.
 * This is intentionally an explicit and editable dictionary, not a claim that it
 * covers every relevant skill or wording used in resumes and job descriptions.
 */
export const SKILL_DICTIONARY = [
  { skill: "Accessibility", aliases: ["Accessibility"] },
  { skill: "Angular", aliases: ["Angular", "Angular.io"] },
  { skill: "ARIA", aliases: ["WAI-ARIA", "Accessible Rich Internet Applications"] },
  { skill: "ARIA", aliases: ["ARIA"], caseSensitive: true },
  { skill: "AWS", aliases: ["AWS", "Amazon Web Services"] },
  { skill: "Azure", aliases: ["Azure", "Microsoft Azure"] },
  { skill: "C#", aliases: ["C#", "C Sharp", "CSharp"] },
  { skill: "C++", aliases: ["C++", "CPP"] },
  { skill: "CSS", aliases: ["CSS", "CSS3", "Cascading Style Sheets"] },
  { skill: "Cypress", aliases: ["Cypress"] },
  { skill: "Django", aliases: ["Django"] },
  { skill: "Docker", aliases: ["Docker"] },
  { skill: ".NET", aliases: [".NET", "Dot Net"] },
  { skill: "Express", aliases: ["Express", "Express.js", "Express JS", "ExpressJS"] },
  { skill: "FastAPI", aliases: ["FastAPI", "Fast API"] },
  { skill: "GCP", aliases: ["GCP", "Google Cloud Platform"] },
  { skill: "Git", aliases: ["Git"] },
  { skill: "Go", aliases: ["Golang"] },
  { skill: "Go", aliases: ["Go"], caseSensitive: true },
  { skill: "GraphQL", aliases: ["GraphQL"] },
  { skill: "HTML", aliases: ["HTML", "HTML5", "HyperText Markup Language"] },
  { skill: "Java", aliases: ["Java"] },
  { skill: "JavaScript", aliases: ["JavaScript", "ECMAScript"] },
  { skill: "Jest", aliases: ["Jest"] },
  { skill: "Keyboard accessibility", aliases: ["Keyboard accessibility", "Keyboard accessible", "Keyboard navigation", "Keyboard support"] },
  { skill: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
  { skill: "MongoDB", aliases: ["MongoDB", "Mongo DB"] },
  { skill: "MySQL", aliases: ["MySQL"] },
  { skill: "NestJS", aliases: ["NestJS", "Nest.js", "Nest JS"] },
  { skill: "Next.js", aliases: ["Next.js", "Next JS", "NextJS"] },
  { skill: "Node.js", aliases: ["Node.js", "Node JS", "NodeJS"] },
  { skill: "Playwright", aliases: ["Playwright"] },
  { skill: "PostgreSQL", aliases: ["PostgreSQL", "Postgres"] },
  { skill: "Python", aliases: ["Python"] },
  { skill: "React", aliases: ["React", "React.js", "React JS", "ReactJS"] },
  { skill: "Redis", aliases: ["Redis"] },
  { skill: "REST APIs", aliases: ["REST API", "REST APIs", "RESTful API", "RESTful APIs"] },
  { skill: "Responsive design", aliases: ["Responsive design", "Responsive web design", "Responsive layouts", "Responsive layout", "Responsive web applications", "Responsive web application"] },
  { skill: "Ruby", aliases: ["Ruby"] },
  { skill: "Ruby on Rails", aliases: ["Ruby on Rails", "Rails"] },
  { skill: "Rust", aliases: ["Rust"] },
  { skill: "Semantic HTML", aliases: ["Semantic HTML", "Semantic HTML5", "Semantic markup"] },
  { skill: "Spring", aliases: ["Spring", "Spring Boot"] },
  { skill: "SQL", aliases: ["SQL"] },
  { skill: "Tailwind CSS", aliases: ["Tailwind CSS", "Tailwind", "TailwindCSS"] },
  { skill: "Terraform", aliases: ["Terraform"] },
  { skill: "TypeScript", aliases: ["TypeScript"] },
  { skill: "Vitest", aliases: ["Vitest"] },
  { skill: "Vue", aliases: ["Vue", "Vue.js", "Vue JS", "VueJS"] },
  { skill: "WCAG", aliases: ["WCAG", "Web Content Accessibility Guidelines"] },
] as const;

export type JobMatchResult = {
  score: number;
  matchingSkills: string[];
  jobSkillsNotDetected: string[];
  explanation: string;
};

export const JOB_DESCRIPTION_LIMITS = {
  title: 200,
  company: 200,
  description: 20_000,
} as const;

export type JobDescriptionInput = { title: string; company: string; description: string };
export type JobDescriptionField = keyof JobDescriptionInput;
type JobDescriptionValidation =
  | { success: true; data: JobDescriptionInput }
  | { success: false; errors: Partial<Record<JobDescriptionField, string>> };

export type JobDescriptionAnalysis = {
  score: number | null;
  matchingSkills: string[];
  skillsNotDetected: string[];
  explanation: string;
  nextStep: string;
};

export function validateJobDescriptionInput(input: unknown): JobDescriptionValidation {
  const record = typeof input === "object" && input !== null
    ? input as Record<string, unknown>
    : {};
  const data: JobDescriptionInput = {
    title: typeof record.title === "string" ? record.title.trim() : "",
    company: typeof record.company === "string" ? record.company.trim() : "",
    description: typeof record.description === "string" ? record.description.trim() : "",
  };
  const errors: Partial<Record<JobDescriptionField, string>> = {};

  for (const field of ["title", "company", "description"] as const) {
    if (!data[field]) {
      errors[field] = field === "description"
        ? "Paste a job description."
        : `Enter ${field === "title" ? "the job title" : "the company name"}.`;
    } else if (data[field].length > JOB_DESCRIPTION_LIMITS[field]) {
      errors[field] = `Keep this field under ${JOB_DESCRIPTION_LIMITS[field].toLocaleString()} characters.`;
    }
  }

  return Object.keys(errors).length > 0 ? { success: false, errors } : { success: true, data };
}

export function analyzeJobDescriptionAgainstResume(
  resumeContent: string,
  description: string,
): JobDescriptionAnalysis {
  const match = matchResumeToJob(resumeContent, description);
  const hasDetectedJobSkills =
    match.matchingSkills.length > 0 || match.jobSkillsNotDetected.length > 0;

  return {
    score: hasDetectedJobSkills ? match.score : null,
    matchingSkills: match.matchingSkills,
    skillsNotDetected: match.jobSkillsNotDetected,
    explanation: match.explanation,
    nextStep: match.jobSkillsNotDetected.length > 0
      ? "Review the skills not detected and add relevant evidence to your resume only where it accurately reflects your experience. Prepare a concrete example for each skill you choose to highlight."
      : hasDetectedJobSkills
        ? "Use the detected overlap to choose the most relevant experience and examples to emphasize in your application."
        : "Compare the role requirements with your experience manually; this dictionary did not identify skills that can be scored reliably.",
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string, caseSensitive: boolean): boolean {
  const flags = caseSensitive ? "u" : "iu";
  // Resume extraction and pasted descriptions often wrap multiword skills or
  // use nonbreaking spaces. Keep punctuation literal while accepting whitespace.
  const phrase = term.split(/\s+/u).map(escapeRegExp).join("\\s+");
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${phrase}(?=$|[^\\p{L}\\p{N}])`, flags);
  return pattern.test(text);
}

/** Return canonical skills detected in text, in dictionary order, without duplicates. */
export function detectSkills(text: string): string[] {
  const detected = new Set<string>();

  for (const entry of SKILL_DICTIONARY) {
    if (entry.aliases.some((alias) => containsTerm(text, alias, "caseSensitive" in entry && entry.caseSensitive))) {
      detected.add(entry.skill);
    }
  }

  return [...detected];
}

/**
 * Compares explicit dictionary terms found in resume and job-description text.
 * The score is rounded detected-skill overlap: shared job skills / all detected
 * job skills. It is a transparent text heuristic, not a validated measure of
 * qualification. An absent term only means it was not detected in this text.
 */
export function matchResumeToJob(
  resumeContent: string,
  jobDescription: string,
): JobMatchResult {
  const resumeSkills = new Set(detectSkills(resumeContent));
  const jobSkills = detectSkills(jobDescription);
  const matchingSkills = jobSkills.filter((skill) => resumeSkills.has(skill));
  const jobSkillsNotDetected = jobSkills.filter((skill) => !resumeSkills.has(skill));
  const score = jobSkills.length === 0
    ? 0
    : Math.round((matchingSkills.length / jobSkills.length) * 100);
  const explanation = jobSkills.length === 0
    ? "No dictionary skills were detected in the job description, so there is no skill overlap to score. This text-based baseline may miss skills phrased outside its dictionary."
    : `Detected ${matchingSkills.length} of ${jobSkills.length} job-description skills in the resume (${score}% overlap). Skills not detected may still be part of the candidate’s experience; this text-based baseline only compares terms in the supplied text.`;

  return { score, matchingSkills, jobSkillsNotDetected, explanation };
}
