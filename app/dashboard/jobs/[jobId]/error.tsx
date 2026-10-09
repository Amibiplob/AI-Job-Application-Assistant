"use client";

import { Button } from "@/components/ui/button";

export default function JobDetailsError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-5 text-[#20241f]">
      <div role="alert" className="w-full max-w-md rounded-xl bg-white p-7 text-center ring-1 ring-[#e8ebe6] sm:p-9">
        <h1 className="text-xl font-semibold tracking-[-0.03em]">We couldn’t load this job</h1>
        <p className="mt-2 text-sm leading-6 text-[#747c73]">Something went wrong while loading the job details. Please try again.</p>
        <Button type="button" onClick={retry} className="mt-5 h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]">Try again</Button>
      </div>
    </main>
  );
}
