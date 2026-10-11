"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/presentation/page-header";
import { InlineFeedback } from "@/components/presentation/inline-feedback";

export default function JobDetailsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10"><PageHeader title="We couldn’t load this job" description="Job details or your tracking information could not be loaded." /><InlineFeedback tone="error" className="mt-6">Try again in a moment, or return to the job search. No tracking changes were made by loading this page.</InlineFeedback><div className="mt-6 flex flex-wrap gap-3"><Button type="button" onClick={retry}>Try again</Button><Link href="/dashboard/jobs" className={buttonVariants({ variant: "outline" })}>Back to jobs</Link></div></div>;
}
