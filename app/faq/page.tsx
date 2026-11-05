import Link from "next/link";
import { PublicPage } from "@/components/layout/public-page";
import { MONTHLY_LIMITS } from "@/lib/plans";

export const metadata = { title: "FAQ | AI Job Application Assistant" };
const questions = [
  ["Who is this for?", "Job seekers who want a consistent way to review software and technical roles and keep their application details together. The current skill dictionary focuses on technical skills."],
  ["How does matching work?", "A fixed dictionary detects skill terms in your resume and the job description. The score is the share of detected job skills found in both texts. Missing terms do not prove missing experience; this is not a hiring probability or a guarantee of employment."],
  ["Are these live job vacancies?", "The database includes fictional demonstration listings, which are labeled. Other records are unverified. Check the employer and availability independently; never apply through fictional .test links."],
  ["Does this apply for jobs for me?", "No. Tracking a role records your own progress. You decide where and how to apply."],
  ["What does Free include?", `A saved resume, job browsing, application tracking, and ${MONTHLY_LIMITS.free.job_analysis} successful website comparisons per UTC calendar month. Both website comparison workflows share that allowance.`],
  ["Can I buy Pro?", "Pro is coming soon. The displayed price is a draft, and there is no paid checkout on the pricing page. MCP access does not gain extra capabilities from Pro."],
  ["Can MCP read my saved resume or tracker?", "No. The remote MCP exposes search_jobs, get_job_details, and analyze_job_match. Analysis needs text supplied in the request. Local stdio exposes only search and details."],
  ["What happens to text I share?", "Saved resume text and application notes are stored in your website account. Analysis adds no text or results history to the database. Your MCP client, hosting, authentication, and database providers have separate data handling; use anonymized excerpts where possible."],
] as const;
export default function FaqPage() {
  return <PublicPage title="Frequently asked questions">
    <div className="divide-y divide-border rounded-xl border border-border bg-surface px-5">
      {questions.map(([question, answer]) => <details key={question} className="py-4"><summary className="cursor-pointer py-2 font-semibold">{question}</summary><p className="max-w-3xl py-3 text-sm leading-7 text-text-secondary">{answer}</p></details>)}
    </div>
    <p><Link className="text-brand underline" href="/connect">Read the MCP connection guide</Link> or <Link className="text-brand underline" href="/contact">contact the operator</Link>.</p>
  </PublicPage>;
}
