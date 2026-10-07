import Link from "next/link";
import { Bell, BriefcaseBusiness, ChevronDown } from "lucide-react";

export function Navbar() {
  return (
    <header className="sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e8ebe6] bg-white/95 px-5 backdrop-blur sm:px-8">
      <Link href="/" className="flex items-center gap-2.5 lg:hidden" aria-label="AI Job Assistant home">
        <span className="flex size-8 items-center justify-center rounded-lg bg-[#203c32] text-white"><BriefcaseBusiness size={16} aria-hidden="true" /></span>
        <span className="text-sm font-semibold tracking-[-0.03em]">AI Job Assistant</span>
      </Link>
      <p className="hidden text-sm text-[#777f76] lg:block">Your workspace <span className="px-2 text-[#c4c9c2]">/</span> Overview</p>
      <div className="ml-auto flex items-center gap-3">
        <button aria-label="Notifications" className="relative flex size-9 items-center justify-center rounded-lg text-[#737b72] hover:bg-[#f4f6f3] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#54765d]"><Bell size={18} aria-hidden="true" /><span className="absolute right-2 top-2 size-1.5 rounded-full bg-[#6c8b70]" /></button>
        <span className="hidden h-7 w-px bg-[#e8ebe6] sm:block" />
        <button className="flex items-center gap-2 rounded-lg p-1.5 text-left hover:bg-[#f6f7f5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#54765d]" aria-label="Account menu, demo profile">
          <span className="flex size-8 items-center justify-center rounded-full bg-[#e9eee6] text-xs font-semibold text-[#47614b]">JD</span>
          <span className="hidden text-xs font-medium text-[#424a42] sm:block">Demo profile</span>
          <ChevronDown size={14} className="hidden text-[#838a82] sm:block" aria-hidden="true" />
        </button>
      </div>
    </header>
  );
}
