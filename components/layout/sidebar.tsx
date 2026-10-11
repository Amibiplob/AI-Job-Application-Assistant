import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { DashboardNav } from "./dashboard-nav";
import { LogoutControl } from "./logout-control";

export function Sidebar() {
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-border bg-surface lg:flex">
      <Link href="/" className="flex min-h-20 shrink-0 items-center gap-3 border-b border-border px-6 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus" aria-label="AI Job Application Assistant home">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-primary-foreground"><BriefcaseBusiness size={20} strokeWidth={1.8} aria-hidden="true" /></span>
        <span className="text-sm font-semibold tracking-tight">AI Job<span className="block text-xs font-normal text-text-secondary">Application Assistant</span></span>
      </Link>
      <div className="flex-1 px-4 py-6">
        <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-widest text-text-secondary">Workspace</p>
        <DashboardNav />
      </div>
      <div className="space-y-4 border-t border-border p-4">
        <p className="rounded-xl bg-surface-muted p-4 text-xs leading-5 text-text-secondary">Skill comparisons help you review a role. They do not predict hiring outcomes.</p>
        <LogoutControl />
      </div>
    </aside>
  );
}
