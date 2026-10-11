import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { listApplications } from "@/lib/applications";
import { DashboardOverview } from "@/components/dashboard/dashboard-overview";

export default async function DashboardPage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  const [resumeResult, applicationsResult] = await Promise.allSettled([getResume(), listApplications()]);

  return (
    <DashboardOverview
      resume={resumeResult.status === "fulfilled" ? resumeResult.value : null}
      resumeUnavailable={resumeResult.status === "rejected"}
      applications={applicationsResult.status === "fulfilled" ? applicationsResult.value : null}
    />
  );
}
