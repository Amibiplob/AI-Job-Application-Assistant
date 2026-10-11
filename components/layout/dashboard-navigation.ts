import { ClipboardCheck, FileText, FileUser, LayoutDashboard, Search } from "lucide-react";

export const dashboardNavigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Resume", href: "/dashboard/resume", icon: FileUser },
  { label: "Jobs", href: "/dashboard/jobs", icon: Search },
  { label: "Analyze a job", href: "/dashboard/analyze", icon: ClipboardCheck },
  { label: "Applications", href: "/dashboard/applications", icon: FileText },
] as const;

export function isDashboardRouteActive(pathname: string, href: string): boolean {
  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function dashboardPageTitle(pathname: string): string {
  if (pathname.startsWith("/dashboard/jobs/")) return "Job details";
  return dashboardNavigation.find(({ href }) => isDashboardRouteActive(pathname, href))?.label ?? "Workspace";
}
