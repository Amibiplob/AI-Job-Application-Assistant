import Link from "next/link";
import {
  Bookmark,
  BriefcaseBusiness,
  FileText,
  LayoutDashboard,
  Search,
  Settings2,
} from "lucide-react";

const navigation = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard, active: true },
  { label: "Find jobs", href: "#find-jobs", icon: Search, active: false },
  { label: "Saved jobs", href: "#saved-jobs", icon: Bookmark, active: false },
  { label: "Applications", href: "#applications", icon: FileText, active: false },
];

export function Sidebar() {
  return (
    <aside className="border-b border-[#e8ebe6] bg-white lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-[250px] lg:flex-col lg:border-b-0 lg:border-r">
      <Link href="/" className="hidden h-[68px] items-center gap-2.5 border-b border-[#e8ebe6] px-6 lg:flex" aria-label="AI Job Assistant home">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#203c32] text-white"><BriefcaseBusiness size={16} aria-hidden="true" /></span>
        <span className="text-sm font-semibold tracking-[-0.03em]">AI Job Assistant</span>
      </Link>
      <nav aria-label="Dashboard navigation" className="flex gap-1 overflow-x-auto px-3 py-2 lg:flex-col lg:gap-1.5 lg:overflow-visible lg:px-4 lg:py-7">
        <p className="hidden px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#9aa097] lg:block">Workspace</p>
        {navigation.map(({ label, href, icon: Icon, active }) => (
          <Link key={label} href={href} aria-current={active ? "page" : undefined} className={`flex shrink-0 items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-colors ${active ? "bg-[#edf2ec] text-[#365440]" : "text-[#697169] hover:bg-[#f6f7f5] hover:text-[#34483a]"}`}>
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />{label}
          </Link>
        ))}
      </nav>
      <div className="hidden flex-1 lg:block" />
      <div className="hidden border-t border-[#e8ebe6] p-4 lg:block">
        <Link href="#settings" className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-medium text-[#697169] hover:bg-[#f6f7f5] hover:text-[#34483a]"><Settings2 size={17} strokeWidth={1.8} aria-hidden="true" />Settings</Link>
        <div className="mt-4 rounded-xl bg-[#f6f8f5] p-4">
          <p className="text-xs font-semibold text-[#48544a]">A note for your search</p>
          <p className="mt-1.5 text-[11px] leading-5 text-[#7b8379]">Match scores are a starting point for your own judgment.</p>
        </div>
      </div>
    </aside>
  );
}
