export const RESUME_LIMITS = { name: 200, content: 50_000 } as const;
export type ResumeField = keyof typeof RESUME_LIMITS;

export function validateResumeFields(name: string, content: string): Partial<Record<ResumeField, string>> {
  const errors: Partial<Record<ResumeField, string>> = {};
  if (typeof name !== "string" || !name.trim()) {
    errors.name = "Enter a name for your resume.";
  } else if (name.trim().length > RESUME_LIMITS.name) {
    errors.name = "Keep the resume name to 200 characters or fewer.";
  }
  if (typeof content !== "string" || !content.trim()) {
    errors.content = "Enter your resume content.";
  } else if (content.length > RESUME_LIMITS.content) {
    errors.content = "Keep the resume content to 50,000 characters or fewer.";
  }
  return errors;
}
