"use client";

import type { ReactNode } from "react";
import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, ChevronDown, Menu } from "lucide-react";
import { DashboardNav } from "./dashboard-nav";
import { dashboardPageTitle } from "./dashboard-navigation";

export function Navbar({ name, email, logoutControl }: { name: string | null; email: string; logoutControl: ReactNode }) {
  const pathname = usePathname();
  const menuRef = useRef<HTMLDetailsElement>(null);
  const identity = name?.trim() || email;
  const initials = Array.from(identity).slice(0, 2).join("").toUpperCase();

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-surface">
      <div className="flex min-h-20 min-w-0 items-center justify-between gap-3 px-4 sm:px-8 lg:px-10">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/" className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus lg:hidden" aria-label="AI Job Application Assistant home"><BriefcaseBusiness size={18} aria-hidden="true" /></Link>
          <div className="min-w-0"><p className="hidden text-xs text-text-secondary sm:block">Your workspace</p><p className="break-words text-sm font-semibold text-text-primary sm:mt-1">{dashboardPageTitle(pathname)}</p></div>
        </div>
        <div className="flex min-w-0 max-w-[45%] items-center gap-2.5 sm:max-w-[50%]">
          <span aria-hidden="true" className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-xs font-semibold text-brand-foreground">{initials}</span>
          <div className="min-w-0"><p title={identity} className="truncate text-xs font-medium text-text-primary sm:text-sm">{identity}</p>{name?.trim() && <p title={email} className="mt-0.5 hidden truncate text-xs text-text-secondary sm:block">{email}</p>}</div>
        </div>
      </div>
      <details
        key={pathname}
        ref={menuRef}
        className="group border-t border-border lg:hidden"
        onKeyDown={(event) => {
          if (event.key === "Escape" && menuRef.current?.open) {
            menuRef.current.open = false;
            menuRef.current.querySelector("summary")?.focus();
          }
        }}
      >
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-4 text-sm font-medium text-text-secondary focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-focus sm:px-8 [&::-webkit-details-marker]:hidden">
          <Menu size={17} aria-hidden="true" /> Workspace menu <ChevronDown size={16} aria-hidden="true" className="ml-auto group-open:rotate-180" />
        </summary>
        <div className="space-y-3 border-t border-border px-4 py-4 sm:px-8">
          <DashboardNav label="Mobile dashboard navigation" onNavigate={() => { if (menuRef.current) menuRef.current.open = false; }} />
          <div className="border-t border-border pt-3">{logoutControl}</div>
        </div>
      </details>
    </header>
  );
}
