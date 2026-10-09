import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";

export default function JobNotFound() {
  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar activeHref="/dashboard/jobs" />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto flex max-w-[1100px] justify-center px-5 py-12 sm:px-8 lg:px-10 lg:py-16">
          <Card className="w-full max-w-lg gap-0 rounded-xl border-0 bg-white py-0 text-center shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="flex flex-col items-center p-8 sm:p-10">
              <span className="flex size-12 items-center justify-center rounded-xl bg-[#f1f4ef] text-[#66806a]"><BriefcaseBusiness size={21} aria-hidden="true" /></span>
              <h1 className="mt-4 text-xl font-semibold tracking-[-0.03em]">Job not found</h1>
              <p className="mt-2 text-sm leading-6 text-[#747c73]">This job may have been removed or the link may be incorrect.</p>
              <Button render={<Link href="/dashboard/jobs" />} className="mt-5 h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">Back to jobs</Button>
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
