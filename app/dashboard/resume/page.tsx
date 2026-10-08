import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/layout/navbar";
import { Sidebar } from "@/components/layout/sidebar";
import { getCurrentUser } from "@/lib/auth";
import { getResume } from "@/lib/resumes";
import { ResumeEditor } from "./resume-editor";

export default async function ResumePage() {
  const currentUser = await getCurrentUser();
  if (!currentUser) {
    redirect("/login");
  }

  const resume = await getResume();

  return (
    <div className="min-h-screen bg-[#f7f8f6] text-[#20241f]">
      <Sidebar activeHref="/dashboard/resume" />
      <div className="min-h-screen lg:pl-[250px]">
        <Navbar />
        <main className="mx-auto max-w-[1100px] px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
          <div>
            <p className="text-xs font-medium text-[#818980]">YOUR PROFILE</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em] sm:text-[34px]">Your resume</h1>
            <p className="mt-2 text-sm text-[#747c73]">Keep your experience in one place for your job search.</p>
          </div>

          <Card className="mt-8 gap-0 rounded-xl border-0 bg-white py-0 shadow-none ring-1 ring-[#e8ebe6]">
            <CardContent className="p-5 sm:p-7">
              <ResumeEditor resume={resume} />
            </CardContent>
          </Card>
        </main>
      </div>
    </div>
  );
}
