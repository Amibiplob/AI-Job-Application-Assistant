import type { Application } from "@/lib/applications";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-validation";

export function applicationCounts(applications: Application[]) {
  const counts = Object.fromEntries(APPLICATION_STATUSES.map(status => [status, 0])) as Record<ApplicationStatus, number>;
  for (const application of applications) counts[application.status]++;
  return counts;
}

export function applicationDate(date: Date | null) {
  return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : "";
}

export function statusLabel(status: string) {
  return status.charAt(0) + status.slice(1).toLowerCase();
}
