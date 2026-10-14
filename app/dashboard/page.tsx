import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { listApplications } from "@/lib/applications";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";
import { getCurrentUserMonthlyUsage } from "@/lib/monetization/current-user";

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [resumeResult, applicationsResult, usageResult] = await Promise.allSettled([
    getResume(), listApplications(), getCurrentUserMonthlyUsage("job_analysis"),
  ]);

  return (
    <DashboardOverview
      resume={resumeResult.status === "fulfilled" ? resumeResult.value : null}
      resumeUnavailable={resumeResult.status === "rejected"}
      applications={applicationsResult.status === "fulfilled" ? applicationsResult.value : null}
      usage={usageResult.status === "fulfilled" ? usageResult.value : null}
    />
  );
}
