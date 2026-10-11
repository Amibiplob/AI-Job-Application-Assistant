import type { Application } from "@/lib/applications";
import type { Resume } from "@/lib/resumes";

/** Presentation-only aggregation. Null applications mean unavailable, never zero. */
export function getOverviewSummary(resume: Resume | null, applications: readonly Application[] | null, resumeUnavailable = false) {
  const resumeStatus: "unavailable" | "missing" | "ready" | "empty" = resumeUnavailable ? "unavailable" : !resume ? "missing" : resume.content.trim() ? "ready" : "empty";
  const counts = new Map<Application["status"], number>();
  for (const application of applications ?? []) {
    counts.set(application.status, (counts.get(application.status) ?? 0) + 1);
  }
  return {
    resumeStatus,
    total: applications?.length ?? null,
    statuses: applications === null ? null : [...counts.keys()].sort().map((status) => ({ status, count: counts.get(status)! })),
    // Existing listApplications sorts by updates; "recently tracked" uses creation.
    recent: applications === null ? null : [...applications].sort((a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0)
    ).slice(0, 5),
  };
}
