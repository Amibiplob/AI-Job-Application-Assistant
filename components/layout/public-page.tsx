import Link from "next/link";
import type { ReactNode } from "react";

export function PublicLinks() {
  return <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
    <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/pricing">Pricing</Link>
    <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/faq">FAQ</Link>
    <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/contact">Contact</Link>
  </div>;
}

export function PublicPage({ title, children }: { title: string; children: ReactNode }) {
  return <div className="min-h-screen bg-canvas text-text-primary">
    <a href="#public-content" className="sr-only focus:not-sr-only focus:absolute focus:bg-surface focus:p-3">Skip to content</a>
    <header className="border-b border-border bg-surface">
      <nav aria-label="Main navigation" className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-4">
        <Link className="font-semibold" href="/">AI Job Application Assistant</Link>
        <PublicLinks />
        <Link className="inline-flex min-h-11 items-center underline" href="/connect">MCP connection guide</Link>
      </nav>
    </header>
    <main id="public-content" tabIndex={-1} className="mx-auto max-w-5xl space-y-6 px-6 py-12 outline-none">
      <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
      {children}
    </main>
    <footer className="mx-auto max-w-5xl border-t border-border px-6 py-6"><PublicLinks /></footer>
  </div>;
}
