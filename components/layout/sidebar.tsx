import Link from "next/link";
import {
  Bookmark,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  LogOut,
  FileUser,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { logout } from "@/app/dashboard/actions";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Resume", href: "/dashboard/resume", icon: FileUser },
  { label: "Jobs", href: "/dashboard/jobs", icon: Search },
  { label: "Saved jobs", href: "#saved-jobs", icon: Bookmark },
  { label: "Applications", href: "/dashboard/applications", icon: FileText },
];

export function Sidebar({ activeHref = "/dashboard" }: { activeHref?: string }) {
  return (
    <aside className="border-b border-[#e8ebe6] bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[250px] lg:flex-col lg:border-b-0 lg:border-r">
      <Link href="/" className="hidden h-[68px] items-center gap-2.5 border-b border-[#e8ebe6] px-6 lg:flex" aria-label="AI Job Assistant home">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#203c32] text-white"><BriefcaseBusiness size={16} aria-hidden="true" /></span>
        <span className="text-sm font-semibold tracking-[-0.03em]">AI Job Assistant</span>
      </Link>
      <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-4 lg:py-7">
        <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa097] lg:block">Workspace</p>
        {navigation.map(({ label, href, icon: Icon }) => {
          const active = href === activeHref;
          return (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? "bg-[#edf2ec] text-[#365440]" : "text-[#697169] hover:bg-[#f6f7f5] hover:text-[#34483a]"}`}>
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}
          </Link>
          );
        })}
      </nav>
      <div className="hidden flex-1 lg:block" />
      <div className="border-t border-[#e8ebe6] p-3 lg:p-4">
        <Link href="#settings" className="hidden items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#697169] hover:bg-[#f6f7f5] hover:text-[#34483a] lg:flex"><Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />Settings</Link>
        <div className="mt-4 hidden rounded-xl bg-[#f6f8f5] p-4 lg:block">
          <p className="text-xs font-semibold text-[#48544a]">A note for your search</p>
          <p className="mt-1.5 text-[11px] leading-5 text-[#7b8379]">Match scores are a starting point for your own judgment.</p>
        </div>
        <form action={logout} className="lg:mt-3">
          <Button type="submit" variant="ghost" className="h-10 w-full justify-start gap-3 px-3 text-[13px] font-medium text-[#697169] hover:bg-[#f6f7f5] hover:text-[#34483a]">
            <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />Log out
          </Button>
        </form>
      </div>
    </aside>
  );
}
