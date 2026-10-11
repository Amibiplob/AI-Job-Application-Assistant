import Link from "next/link";
import { Search } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { PageHeader } from "@/components/presentation/page-header";
import { EmptyState } from "@/components/presentation/empty-state";

export default function JobNotFound() {
  return <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 lg:px-10"><PageHeader title="Job not found" description="This listing may have been removed or the link may be incorrect." /><EmptyState className="mt-8" icon={Search} title="Find another opportunity" description="Return to your job search to browse the listings that are currently available." actions={<Link href="/dashboard/jobs" className={buttonVariants()}>Back to jobs</Link>} /></div>;
}
