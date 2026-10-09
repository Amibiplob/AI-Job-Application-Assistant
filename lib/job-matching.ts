/**
 * Explicit vocabulary for this rule-based baseline. Aliases are matched as
 * whole terms so, for example, "Go" does not match the end of another word.
 * This is intentionally a small and editable dictionary, not a claim that it
 * covers every relevant skill or wording used in resumes and job descriptions.
 */
export const SKILL_DICTIONARY = [
  { skill: "AWS", aliases: ["AWS", "Amazon Web Services"] },
  { skill: "Azure", aliases: ["Azure", "Microsoft Azure"] },
  { skill: "C#", aliases: ["C#", "C Sharp"] },
  { skill: "C++", aliases: ["C++", "CPP"] },
  { skill: "CSS", aliases: ["CSS", "Cascading Style Sheets"] },
  { skill: "Cypress", aliases: ["Cypress"] },
  { skill: "Django", aliases: ["Django"] },
  { skill: "Docker", aliases: ["Docker"] },
  { skill: ".NET", aliases: [".NET", "Dot Net"] },
  { skill: "Express", aliases: ["Express", "Express.js", "Express JS"] },
  { skill: "FastAPI", aliases: ["FastAPI", "Fast API"] },
  { skill: "GCP", aliases: ["GCP", "Google Cloud Platform"] },
  { skill: "Git", aliases: ["Git"] },
  { skill: "Go", aliases: ["Golang"] },
  { skill: "Go", aliases: ["Go"], caseSensitive: true },
  { skill: "GraphQL", aliases: ["GraphQL"] },
  { skill: "HTML", aliases: ["HTML", "HyperText Markup Language"] },
  { skill: "Java", aliases: ["Java"] },
  { skill: "JavaScript", aliases: ["JavaScript"] },
  { skill: "Jest", aliases: ["Jest"] },
  { skill: "Kubernetes", aliases: ["Kubernetes", "K8s"] },
  { skill: "MongoDB", aliases: ["MongoDB", "Mongo DB"] },
  { skill: "MySQL", aliases: ["MySQL"] },
  { skill: "Next.js", aliases: ["Next.js", "Next JS"] },
  { skill: "Node.js", aliases: ["Node.js", "Node JS"] },
  { skill: "Playwright", aliases: ["Playwright"] },
  { skill: "PostgreSQL", aliases: ["PostgreSQL", "Postgres"] },
  { skill: "Python", aliases: ["Python"] },
  { skill: "React", aliases: ["React", "React.js", "React JS"] },
  { skill: "Redis", aliases: ["Redis"] },
  { skill: "REST APIs", aliases: ["REST API", "REST APIs", "RESTful API", "RESTful APIs"] },
  { skill: "Ruby", aliases: ["Ruby"] },
  { skill: "Ruby on Rails", aliases: ["Ruby on Rails", "Rails"] },
  { skill: "Rust", aliases: ["Rust"] },
  { skill: "Spring", aliases: ["Spring", "Spring Boot"] },
  { skill: "SQL", aliases: ["SQL"] },
  { skill: "Tailwind CSS", aliases: ["Tailwind CSS", "Tailwind"] },
  { skill: "Terraform", aliases: ["Terraform"] },
  { skill: "TypeScript", aliases: ["TypeScript"] },
  { skill: "Vue", aliases: ["Vue", "Vue.js", "Vue JS"] },
] as const;

export type JobMatchResult = {
  score: number;
  matchingSkills: string[];
  jobSkillsNotDetected: string[];
  explanation: string;
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string, caseSensitive: boolean): boolean {
  const flags = caseSensitive ? "u" : "iu";
  const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(term)}(?=$|[^\\p{L}\\p{N}])`, flags);
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
