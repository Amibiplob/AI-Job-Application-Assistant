import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  Bookmark,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  CircleHelp,
  FileText,
  MapPin,
  Search,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const steps = [
  {
    number: "01",
    icon: Search,
    title: "Find jobs worth your time",
    description:
      "Explore relevant roles in one focused place, with the details you need to make a good call.",
  },
  {
    number: "02",
    icon: Sparkles,
    title: "See where you stand",
    description:
      "Compare a role with your experience and spot the strengths and gaps before you apply.",
  },
  {
    number: "03",
    icon: Check,
    title: "Keep your search moving",
    description:
      "Save opportunities and keep application next steps from slipping through the cracks.",
  },
];

export default function Home() {
  return (
    <main className="min-h-screen overflow-hidden bg-[#fafaf8] text-[#20241f]">
      <header className="mx-auto flex h-[76px] max-w-7xl items-center justify-between px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label="AI Job Assistant home">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#203c32] text-white">
            <BriefcaseBusiness size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.03em]">AI Job Assistant</span>
        </Link>
        <nav aria-label="Main navigation" className="hidden items-center gap-8 text-sm text-[#646a63] md:flex">
          <a className="transition-colors hover:text-[#203c32]" href="#how-it-works">How it works</a>
          <a className="transition-colors hover:text-[#203c32]" href="#preview">Product preview</a>
        </nav>
        <div className="flex items-center gap-3">
          <Link href="/dashboard" className="hidden text-sm font-medium text-[#535a53] hover:text-[#203c32] sm:inline">Sign in</Link>
          <Button render={<Link href="/dashboard" />} className="h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">
            Get started <ArrowRight className="ml-1" size={15} aria-hidden="true" />
          </Button>
        </div>
      </header>

      <section className="mx-auto grid max-w-7xl items-center gap-14 px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:grid-cols-[1.02fr_0.98fr] lg:gap-16 lg:px-12 lg:pb-28 lg:pt-24">
        <div className="relative z-10">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-[#dce6dc] bg-white px-3.5 py-2 text-xs font-medium text-[#42624e] shadow-sm shadow-[#203c32]/[0.03]">
            <span className="size-1.5 rounded-full bg-[#62866b]" /> A calmer way to job search
          </div>
          <h1 className="max-w-[650px] text-[clamp(2.8rem,6vw,5rem)] font-semibold leading-[1.04] tracking-[-0.065em] text-[#202a24]">
            Your next role starts with a <span className="text-[#66816a]">clearer plan.</span>
          </h1>
          <p className="mt-6 max-w-[530px] text-base leading-7 text-[#687069] sm:text-lg sm:leading-8">
            Find the right jobs, understand how well you match, and manage your job search in one place.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button render={<Link href="/dashboard" />} className="h-12 rounded-lg bg-[#203c32] px-5 text-sm text-white shadow-sm hover:bg-[#2d5143]">
              Get Started <ArrowRight className="ml-2" size={16} aria-hidden="true" />
            </Button>
            <Button render={<a href="#how-it-works" />} variant="outline" className="h-12 rounded-lg border-[#d9ddd7] bg-white px-5 text-sm text-[#303a33] hover:bg-[#f1f4ef]">
              See How It Works <ChevronRight className="ml-1" size={16} aria-hidden="true" />
            </Button>
          </div>
          <p className="mt-5 text-xs text-[#858b84]">A thoughtful workspace for your next career move.</p>
        </div>

        <div id="preview" className="relative mx-auto w-full max-w-[560px] scroll-mt-8">
          <div className="absolute -right-8 -top-12 size-64 rounded-full bg-[#e8eee5] blur-3xl" aria-hidden="true" />
          <div className="relative rounded-[20px] border border-[#e3e6e0] bg-white p-3 shadow-[0_28px_80px_-38px_rgba(35,55,42,0.28)] sm:p-5">
            <div className="flex items-center justify-between border-b border-[#edf0eb] px-2 pb-4">
              <div>
                <p className="text-xs font-medium text-[#8b918a]">YOUR JOB SEARCH</p>
                <h2 className="mt-1 text-sm font-semibold tracking-tight">A good fit, at a glance</h2>
              </div>
              <span className="flex size-9 items-center justify-center rounded-lg bg-[#f2f5f0] text-[#55735c]"><CircleHelp size={17} aria-hidden="true" /></span>
            </div>
            <div className="p-2 pt-5 sm:p-4 sm:pt-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-xl bg-[#eef2e9] text-[#4c684f]"><span className="text-lg font-semibold">N</span></span>
                  <div>
                    <h3 className="font-semibold tracking-[-0.02em]">Product Designer</h3>
                    <p className="mt-1 text-sm text-[#727970]">Northstar · Full-time</p>
                  </div>
                </div>
                <button aria-label="Save Product Designer job" className="flex size-9 items-center justify-center rounded-lg text-[#889087] transition-colors hover:bg-[#f3f5f2] hover:text-[#43634b]"><Bookmark size={17} aria-hidden="true" /></button>
              </div>
              <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-[#747b73]">
                <span className="inline-flex items-center gap-1.5"><MapPin size={14} aria-hidden="true" /> Remote · US</span>
                <span className="inline-flex items-center gap-1.5"><BriefcaseBusiness size={14} aria-hidden="true" /> 3–5 years</span>
              </div>
              <div className="mt-6 rounded-xl border border-[#e4ebe1] bg-[#f8faf7] p-4 sm:p-5">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-[#727b71]">YOUR MATCH</p>
                    <p className="mt-1 text-sm font-medium">Strong alignment</p>
                  </div>
                  <div className="text-right"><span className="text-3xl font-semibold tracking-[-0.06em] text-[#355640]">86</span><span className="text-sm text-[#738174]"> / 100</span></div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[#e3e9e1]"><div className="h-full w-[86%] rounded-full bg-[#6d8a70]" /></div>
                <p className="mt-3 text-xs leading-5 text-[#737b72]">Your product design and research experience align with several key requirements.</p>
              </div>
              <div className="mt-4 flex items-center justify-between rounded-xl border border-[#edf0eb] px-4 py-3">
                <div className="flex items-center gap-3"><span className="flex size-8 items-center justify-center rounded-lg bg-[#f5f4ed] text-[#8b7a42]"><FileText size={15} aria-hidden="true" /></span><span className="text-xs font-medium text-[#545b54]">Resume match summary</span></div>
                <ArrowUpRight size={16} className="text-[#90968e]" aria-hidden="true" />
              </div>
            </div>
            <div className="flex items-center gap-2 border-t border-[#edf0eb] px-2 pt-3 text-[11px] text-[#8b918a]"><Sparkles size={13} aria-hidden="true" /> Example preview · Match scores are a guide, not a guarantee.</div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="scroll-mt-8 border-y border-[#e9ece6] bg-white py-20 sm:py-24">
        <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-12">
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718675]">A little more clarity</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-[-0.045em] sm:text-4xl">Three steps. One more focused search.</h2>
          </div>
          <div className="mt-12 grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map(({ number, icon: Icon, title, description }) => (
              <article key={number} className="border-t border-[#e5e9e3] pt-5">
                <div className="flex items-center justify-between"><span className="text-xs font-medium tracking-[0.12em] text-[#929a91]">{number}</span><Icon size={19} strokeWidth={1.7} className="text-[#66816a]" aria-hidden="true" /></div>
                <h3 className="mt-7 text-lg font-semibold tracking-[-0.025em]">{title}</h3>
                <p className="mt-2 max-w-sm text-sm leading-6 text-[#727970]">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-7xl flex-col gap-3 px-5 py-7 text-xs text-[#858b84] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-12">
        <Link href="/" className="font-semibold text-[#48544a]">AI Job Assistant</Link>
        <p>Make your next move with a little more clarity.</p>
        <p>© {new Date().getFullYear()} AI Job Assistant</p>
      </footer>
    </main>
  );
}
