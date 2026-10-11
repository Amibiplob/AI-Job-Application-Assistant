import Link from "next/link";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  ClipboardList,
  FileText,
  ScanText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const features = [
  { icon: FileText, label: "Resume", title: "Start with your experience.", description: "Save your resume text in one place. Keep it up to date as your experience grows, ready for your next comparison." },
  { icon: Search, label: "Job search", title: "Give each opportunity a closer look.", description: "Browse available listings by title or company, filter by workplace, and review the details. Sample listings are identified by their demo source." },
  { icon: ScanText, label: "Job description analysis", title: "Make sense of the requirements.", description: "Paste a job description to compare recognized skills with your saved resume. See shared terms and skills worth reviewing." },
  { icon: ClipboardList, label: "Application tracking", title: "Keep the next step in sight.", description: "Save a role to your applications, update its status, and keep applied dates and notes together as your search progresses." },
];

const steps = [
  { number: "01", title: "Save your resume", description: "Add your resume text to give each comparison a consistent starting point." },
  { number: "02", title: "Analyze opportunities", description: "Explore a listed role or paste a job description, then compare its recognized skills with your resume." },
  { number: "03", title: "Track applications", description: "Add listed roles to your tracker. Record your progress and notes as you apply yourself." },
];

const focus = "focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#4F46E5]";
const primaryButton = "h-12 rounded-xl bg-[#4F46E5] px-5 text-sm text-white hover:bg-[#4338CA] focus-visible:border-[#4F46E5] focus-visible:ring-[#4F46E5]/30 motion-reduce:transition-none motion-reduce:transform-none";

export default function Home() {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 selection:bg-indigo-100 selection:text-indigo-950">
      <a href="#main-content" className={`sr-only z-50 rounded-lg bg-white p-3 text-sm font-medium focus:not-sr-only focus:fixed focus:left-4 focus:top-4 ${focus}`}>
        Skip to content
      </a>

      <header className="border-b border-slate-200/80 bg-white">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-8 lg:px-12">
          <Link href="/" className={`flex min-w-0 items-center gap-2.5 rounded-lg ${focus}`} aria-label="AI Job Application Assistant home">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#4F46E5] text-white">
              <BriefcaseBusiness size={20} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="text-sm font-semibold leading-5 tracking-tight sm:text-base">AI Job<span className="block text-xs font-normal tracking-normal text-slate-600 sm:text-sm">Application Assistant</span></span>
          </Link>
          <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:gap-6">
            <a href="#features" className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium text-slate-600 hover:text-indigo-700 hover:underline underline-offset-4 ${focus}`}>Features</a>
            <Link href="/login" className={`inline-flex min-h-11 items-center rounded-md text-sm font-medium text-slate-600 hover:text-indigo-700 hover:underline underline-offset-4 ${focus}`}>Sign in</Link>
            <Link href="/signup" className={cn(buttonVariants(), primaryButton, "h-11 px-4")}>Get started <ArrowRight aria-hidden="true" /></Link>
          </div>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1} className="outline-none">
        <section aria-labelledby="hero-heading" className="mx-auto grid max-w-7xl gap-12 px-4 py-14 sm:px-8 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:px-12 lg:py-24">
          <div className="min-w-0">
            <p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700"><span className="h-px w-6 bg-indigo-400" aria-hidden="true" /> A more considered career move</p>
            <h1 id="hero-heading" className="max-w-xl text-[clamp(2.5rem,5vw,4.25rem)] font-semibold leading-[1.08] tracking-[-0.055em]">Less scattered searching.<br /><span className="text-[#4F46E5]">More clarity on your next role.</span></h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-slate-600 sm:text-lg sm:leading-8">Bring your resume, job comparisons, and applications into one focused workspace. Understand the requirements before you decide what comes next.</p>
            <div className="mt-8 flex flex-col gap-3 min-[400px]:flex-row">
              <Link href="/signup" className={cn(buttonVariants(), primaryButton)}>Create your workspace <ArrowRight aria-hidden="true" /></Link>
              <a href="#how-it-works" className={`inline-flex min-h-12 items-center justify-center rounded-xl px-4 text-sm font-medium text-slate-700 hover:text-indigo-700 hover:underline underline-offset-4 ${focus}`}>See how it works</a>
            </div>
            <p className="mt-5 text-sm text-slate-500">Your experience. Your decisions. One place to stay organized.</p>
          </div>

          <figure aria-labelledby="preview-heading" className="min-w-0 rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_-30px_rgba(15,23,42,0.2)]">
            <figcaption className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4 sm:px-6">
              <h2 id="preview-heading" className="text-sm font-semibold">A comparison, explained</h2>
              <span className="rounded-md border border-indigo-100 bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-700">Sample data</span>
            </figcaption>
            <div className="space-y-5 p-5 sm:p-6">
              <div className="flex items-start gap-3">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><BriefcaseBusiness size={19} aria-hidden="true" /></span>
                <div className="min-w-0"><h3 className="font-semibold tracking-tight">Frontend Developer</h3><p className="mt-1 text-sm text-slate-600">Northstar Studio · Fictional company</p><p className="mt-1 text-xs text-slate-500">Example role · Remote</p></div>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-700"><FileText size={15} className="text-indigo-600" aria-hidden="true" /> SAMPLE RESUME EXCERPT</div>
                <p className="mt-2 text-sm leading-6 text-slate-600">“Built web applications with React and TypeScript, using Git for version control.”</p>
              </div>
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recognized job skills</h3>
                <ul className="mt-2 flex flex-wrap gap-2 text-xs font-medium">
                  {["React", "TypeScript", "Git", "SQL"].map((skill) => <li key={skill} className="rounded-md border border-slate-200 px-2.5 py-1.5 text-slate-700">{skill}</li>)}
                </ul>
              </div>
              <div className="rounded-xl border border-indigo-100 bg-indigo-50/70 p-4">
                <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-sm font-semibold text-indigo-950">Recognized-skill overlap</h3><p className="mt-1 text-xs text-indigo-800">3 of 4 job skills found in the sample resume</p></div><span className="text-3xl font-semibold tracking-tight text-[#4F46E5]">75%</span></div>
                <div className="mt-4 h-1.5 rounded-full bg-indigo-100" aria-hidden="true"><div className="h-full w-3/4 rounded-full bg-[#4F46E5]" /></div>
                <ul className="mt-4 space-y-2 text-sm text-slate-700">
                  <li className="flex items-start gap-2"><Check size={16} className="mt-0.5 shrink-0 text-indigo-600" aria-hidden="true" /><span>Found in both: React, TypeScript, Git</span></li>
                  <li className="flex items-start gap-2"><Search size={16} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" /><span>Not detected in resume: SQL</span></li>
                </ul>
              </div>
              <p className="text-xs leading-5 text-slate-500">Illustrative comparison, not a live job listing or hiring prediction. A skill not detected in your text may still be part of your experience.</p>
            </div>
          </figure>
        </section>

        <section id="features" aria-labelledby="features-heading" className="scroll-mt-6 border-y border-slate-200 bg-white">
          <div className="mx-auto max-w-7xl px-4 py-16 sm:px-8 sm:py-20 lg:px-12">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
              <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">One connected workspace</p><h2 id="features-heading" className="mt-3 max-w-xl text-3xl font-semibold leading-tight tracking-[-0.04em] sm:text-4xl">A little less admin.<br />A little more perspective.</h2></div>
              <p className="max-w-sm text-sm leading-6 text-slate-600">From your first comparison to your latest application, keep the details that matter close.</p>
            </div>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {features.map(({ icon: Icon, label, title, description }) => (
                <article key={label} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50/50 p-6 sm:p-7">
                  <div className="flex items-center gap-3"><span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-indigo-100 bg-white text-[#4F46E5]"><Icon size={19} strokeWidth={1.8} aria-hidden="true" /></span><p className="text-sm font-medium text-slate-600">{label}</p></div>
                  <h3 className="mt-5 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 max-w-lg text-sm leading-6 text-slate-600">{description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="how-it-works" aria-labelledby="steps-heading" className="mx-auto max-w-7xl scroll-mt-6 px-4 py-16 sm:px-8 sm:py-20 lg:px-12">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-700">A simple rhythm</p>
          <h2 id="steps-heading" className="mt-3 text-3xl font-semibold tracking-[-0.04em] sm:text-4xl">Start where you are. Keep moving.</h2>
          <ol className="mt-10 grid gap-8 md:grid-cols-3 md:gap-10">
            {steps.map(({ number, title, description }) => <li key={number} className="border-t border-slate-300 pt-5"><span className="font-mono text-sm text-indigo-700" aria-hidden="true">{number}</span><h3 className="mt-4 text-lg font-semibold tracking-tight">{title}</h3><p className="mt-2 text-sm leading-6 text-slate-600">{description}</p></li>)}
          </ol>
        </section>

        <section aria-labelledby="matching-heading" className="mx-auto max-w-7xl px-4 pb-16 sm:px-8 sm:pb-20 lg:px-12">
          <div className="grid gap-6 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-12">
            <div><ShieldCheck size={24} className="text-[#4F46E5]" aria-hidden="true" /><h2 id="matching-heading" className="mt-4 text-2xl font-semibold tracking-tight">Useful signals.<br />Room for your judgment.</h2></div>
            <div className="space-y-3 text-sm leading-6 text-slate-600"><p>Matching is deterministic: it checks a fixed dictionary of recognized skills against the job description and your resume. The overlap score is the share of detected job skills also found in your resume.</p><p>It does not predict hiring outcomes, assess your full qualifications, or replace reading the role. The dictionary can miss skills and wording. Use the comparison to guide a closer look, then make your own decision.</p></div>
          </div>
        </section>

        <section aria-labelledby="cta-heading" className="border-y border-indigo-100 bg-indigo-50/60">
          <div className="mx-auto flex max-w-7xl flex-col justify-between gap-7 px-4 py-14 sm:px-8 md:flex-row md:items-center lg:px-12">
            <div><h2 id="cta-heading" className="text-3xl font-semibold tracking-[-0.04em]">Give your next move a clear starting point.</h2><p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Save your resume, compare opportunities, and bring your applications together.</p></div>
            <Link href="/signup" className={cn(buttonVariants(), primaryButton, "shrink-0 md:w-auto")}>Get started <ArrowRight aria-hidden="true" /></Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex w-full max-w-7xl flex-col justify-between gap-4 px-4 py-7 sm:flex-row sm:items-center sm:px-8 lg:px-12">
        <p className="text-xs font-medium text-slate-600">AI Job Application Assistant</p>
        <p className="text-xs text-slate-500">A more organized search. A more considered next step.</p>
        <Link href="/login" className={`inline-flex min-h-11 w-fit items-center rounded-md text-sm font-medium text-slate-600 hover:text-indigo-700 hover:underline underline-offset-4 ${focus}`}>Sign in</Link>
      </footer>
    </div>
  );
}
