import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { AnalysisDraftProvider } from "@/components/jobs/analysis-draft";
import { LogoutControl } from "@/components/layout/logout-control";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const currentUser = await getCurrentUser();
  if (!currentUser) redirect("/login");

  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <a href="#dashboard-content" className="sr-only z-50 rounded-lg bg-surface p-3 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">Skip to workspace content</a>
      <Sidebar />
      <div className="min-w-0 lg:pl-64">
        <Navbar name={currentUser.name} email={currentUser.email} logoutControl={<LogoutControl />} />
        <main id="dashboard-content" tabIndex={-1} className="min-w-0 outline-none"><AnalysisDraftProvider key={currentUser.id}>{children}</AnalysisDraftProvider></main>
      </div>
    </div>
  );
}
