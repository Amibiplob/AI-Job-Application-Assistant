"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { dashboardNavigation, isDashboardRouteActive } from "./dashboard-navigation";

export function DashboardNav({ label = "Dashboard navigation", onNavigate }: { label?: string; onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav aria-label={label}>
      <ul className="space-y-1">
        {dashboardNavigation.map(({ label, href, icon: Icon }) => {
          const active = isDashboardRouteActive(pathname, href);
          return (
            <li key={href}>
              <Link
                href={href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn("flex min-h-11 items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus motion-reduce:transition-none", active ? "bg-brand-subtle text-brand-foreground" : "text-text-secondary hover:bg-surface-muted hover:text-text-primary")}
              >
                <Icon size={18} strokeWidth={1.8} aria-hidden="true" />{label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
