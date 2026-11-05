import type { ReactNode } from "react";
import { PublicPage } from "./public-page";
import { PUBLIC_DETAILS } from "@/lib/public-site";

export function LegalDraft({ title, children }: { title: string; children: ReactNode }) {
  return <PublicPage title={title}>
    <div className="rounded-xl border border-amber-300 bg-amber-50 p-5 text-sm leading-7 text-amber-950">
      <p className="font-semibold">DRAFT — FOR OWNER AND LEGAL REVIEW</p>
      <p>Prepared 5 November 2026. No effective date has been adopted. This review copy contains placeholders and must be finalized before public launch or Paddle domain submission.</p>
    </div>
    <p className="text-sm leading-7">Service: AI Job Application Assistant at {PUBLIC_DETAILS.domain}. Operator: {PUBLIC_DETAILS.legalName}, {PUBLIC_DETAILS.address}. Contact: {PUBLIC_DETAILS.supportEmail}.</p>
    <div className="space-y-7 text-sm leading-7 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_ul]:list-disc [&_a]:text-brand [&_a]:underline">{children}</div>
  </PublicPage>;
}
