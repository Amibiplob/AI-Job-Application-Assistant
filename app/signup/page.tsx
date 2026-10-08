import Link from "next/link";
import { BriefcaseBusiness } from "lucide-react";
import { SignupForm } from "./signup-form";

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col bg-[#fafaf8] text-[#20241f]">
      <header className="mx-auto flex h-[76px] w-full max-w-7xl items-center px-5 sm:px-8 lg:px-12">
        <Link href="/" className="flex items-center gap-2.5" aria-label="AI Job Assistant home">
          <span className="flex size-9 items-center justify-center rounded-xl bg-[#203c32] text-white">
            <BriefcaseBusiness size={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="text-[15px] font-semibold tracking-[-0.03em]">AI Job Assistant</span>
        </Link>
      </header>

      <section className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-2xl border border-[#e3e6e0] bg-white p-6 shadow-[0_20px_60px_-40px_rgba(35,55,42,0.3)] sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718675]">
            Get started
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.05em]">
            Create your account
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#687069]">
            Set up your workspace and keep your job search moving.
          </p>

          <SignupForm />

          <p className="mt-6 text-center text-sm text-[#687069]">
            Already have an account?{" "}
            <Link href="/login" className="font-medium text-[#355640] underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
