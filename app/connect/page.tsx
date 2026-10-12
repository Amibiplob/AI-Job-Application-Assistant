import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Check, Link2, ShieldCheck } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { CHATGPT_CONNECTION_GUIDE, CONNECT_EXAMPLES, MCP_SERVER_URL } from "@/lib/connect-guide";
import { CopyField } from "@/components/connect/copy-field";
import { PageHeader } from "@/components/presentation/page-header";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Connect to ChatGPT | AI Job Application Assistant",
  description: "Connect AI Job Application Assistant to ChatGPT with secure Auth0 sign-in. Learn to search demonstration jobs and compare supplied resume text.",
};

const textLink = "inline-flex min-h-11 items-center rounded-md text-sm font-medium text-brand hover:underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus";
const connectionSteps = [
  { title: "Open ChatGPT on the web", text: "Sign in to ChatGPT and open Plugins. Custom connections depend on your plan, workspace permissions, and security settings. If the option is missing, ask your workspace administrator about access." },
  { title: "Add a custom server", text: "Use the plus control, then Add custom MCP server. Give it the name AI Job Application Assistant and paste this page’s copyable server URL into the connection’s Server URL field." },
  { title: "Choose OAuth authentication", text: "Select OAuth for this server. If setup requests client credentials you have not been given, ask the service administrator for the supported setup. Never substitute an access token." },
  { title: "Review and create the connection", text: "Read the connection warning and permissions. Continue only if you trust the service, then choose Create as a plugin." },
  { title: "Sign in through Auth0", text: "Follow the authentication prompt to the Auth0-hosted sign-in screen. Review the account and permissions, authorize the connection, and return to ChatGPT. Website login is separate from this connection sign-in." },
  { title: "Install and try a sample prompt", text: "Find the connection in your personal or workspace plugins and install it for use in a conversation. Try the search example below and confirm that ChatGPT calls the connected tool." },
];
const troubleshooting = [
  { title: "I cannot find the custom connection option", text: "Use ChatGPT on the web and check your account and workspace. Options and labels can vary; some plans or workspaces may not allow custom MCP connections. Ask your workspace administrator or consult the official guide below." },
  { title: "Sign-in was cancelled or keeps looping", text: "Retry the connection’s sign-in flow and complete the Auth0 consent screen. Check whether your browser blocked the sign-in window. Website sign-in alone does not authorize the MCP connection." },
  { title: "OAuth callback, invalid client, or permission error", text: "Ask the service administrator to check the registered OAuth client, callback URL, and granted permissions. Share only the error message with credentials removed. Never paste tokens or client secrets into a chat." },
  { title: "The connection failed or says unauthorized", text: "Check that the server URL exactly matches the one shown on this page, including /api/mcp. Retry Auth0 sign-in. If the error persists, report it to the service administrator. Opening the URL in a browser may show an authorization error; it is a tool endpoint, not a web page." },
  { title: "ChatGPT cannot find the tools", text: "Check that the connection is installed and its tools are enabled. Refresh the connection’s tool information in its settings, then retry in a new conversation. Ask explicitly for one of the three tools shown below." },
  { title: "No jobs, missing details, or an unexpected score", text: "Try another title or company keyword and remove the workplace filter. Use a job ID returned by search. A missing record can return no job. Matching scores count only recognized dictionary skills; descriptions without recognized skills return no score." },
];

export default async function ConnectPage() {
  const currentUser = await getCurrentUser();
  return (
    <div className="min-h-screen bg-canvas text-text-primary">
      <a href="#connect-content" className="sr-only z-50 rounded-lg bg-surface p-3 text-sm focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus-visible:outline-2 focus-visible:outline-focus">Skip to connection guide</a>
      <header className="border-b border-border bg-surface">
        <nav aria-label="Main navigation" className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-4 sm:px-8 lg:px-12">
          <Link href="/" aria-label="AI Job Application Assistant home" className="flex items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand text-primary-foreground"><BriefcaseBusiness size={20} aria-hidden="true" /></span>
            <span className="text-sm font-semibold">AI Job<span className="block text-xs font-normal text-text-secondary">Application Assistant</span></span>
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/connect" aria-current="page" className={textLink}>Connect to ChatGPT</Link>
            {!currentUser && <Link href="/login" className={textLink}>Sign in</Link>}
            <Link href={currentUser ? "/dashboard" : "/signup"} className={cn(buttonVariants(), "min-h-11 px-4")}>{currentUser ? "Go to Dashboard" : "Get started"}<ArrowRight aria-hidden="true" /></Link>
          </div>
        </nav>
      </header>
      <main id="connect-content" tabIndex={-1} className="mx-auto w-full max-w-7xl space-y-12 px-4 py-12 outline-none sm:px-8 sm:py-16 lg:px-12">
        <section aria-labelledby="connect-heading" className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <div className="min-w-0 space-y-6">
            <PageHeader title="Connect to ChatGPT" titleId="connect-heading" eyebrow="Your job search, in conversation" description="Search available jobs and compare your experience from a ChatGPT conversation, using the same tools that power your website workspace." />
            <p className="max-w-2xl text-sm leading-7 text-text-secondary">MCP, short for Model Context Protocol, is a way for ChatGPT to use tools from another service. Connect this assistant once, then ask ChatGPT to look up jobs or compare a resume with a job description.</p>
            <div className="flex flex-wrap gap-3">
              <a href="#setup" className={cn(buttonVariants(), "min-h-11 px-5")}>Follow the setup steps<ArrowRight aria-hidden="true" /></a>
              <a href="#examples" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 px-5")}>See example prompts</a>
            </div>
            <InlineFeedback announcement="off" title="Start with demonstration data">The current job database contains demonstration listings. Results are not a verified feed of live vacancies; review each source and confirm availability independently.</InlineFeedback>
          </div>
          <Card className="min-w-0 border border-brand/15 shadow-panel">
            <CardHeader><div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-brand-subtle text-brand"><Link2 size={20} aria-hidden="true" /></div><h2 className="text-lg font-semibold">Your connection address</h2><p className="text-sm leading-6 text-text-secondary">Copy this URL into ChatGPT’s custom server setup.</p></CardHeader>
            <CardContent className="space-y-4"><CopyField label="MCP server URL" text={MCP_SERVER_URL} rows={3} /><p className="flex items-center gap-2 text-xs text-text-secondary"><ShieldCheck size={16} aria-hidden="true" /> Secure sign-in through Auth0</p><p className="text-xs leading-6 text-text-secondary">The URL is public. It is not a password, and copying it does not connect your account.</p></CardContent>
          </Card>
        </section>

        <section id="setup" aria-labelledby="setup-heading" className="scroll-mt-8 space-y-6">
          <PageHeader title="Set up your connection" titleId="setup-heading" headingLevel={2} description="Use the current web setup flow below. Access and interface labels can vary across ChatGPT accounts and workspaces." />
          <ol className="grid gap-4 md:grid-cols-2">
            {connectionSteps.map(({ title, text }, index) => <li key={title} className="flex min-w-0 gap-4 rounded-xl border border-border bg-surface p-5 sm:p-6"><span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-subtle text-sm font-semibold text-brand-foreground">{index + 1}</span><div className="min-w-0"><h3 className="font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p></div></li>)}
          </ol>
          <p className="text-sm leading-6 text-text-secondary">Instructions checked against <a className={textLink} href={CHATGPT_CONNECTION_GUIDE}>OpenAI’s custom MCP connection guide</a> on October 12, 2026. If your interface differs, use that guide for the latest steps.</p>
        </section>

        <section id="examples" aria-labelledby="examples-heading" className="scroll-mt-8 space-y-6">
          <PageHeader title="Try your first conversation" titleId="examples-heading" headingLevel={2} description="These examples use fictional, non-sensitive data. Copy a prompt into a conversation where your connection is available." />
          <div className="grid items-start gap-6 xl:grid-cols-3">
            {CONNECT_EXAMPLES.map(example => <Card key={example.id} className="min-w-0 border border-border"><CardHeader><span className="text-xs font-medium text-brand">{example.tool}</span><h3 className="text-lg font-semibold">{example.title}</h3><p className="text-sm leading-6 text-text-secondary">{example.description}</p></CardHeader><CardContent className="space-y-4"><CopyField label={`${example.title} prompt`} text={example.prompt} rows={9} /><p className="text-xs leading-6 text-text-secondary">{example.note}</p></CardContent></Card>)}
          </div>
          <InlineFeedback announcement="off" title="Understand the comparison">Skill matching is deterministic text overlap: shared recognized job skills divided by all recognized job skills. It is not a hiring probability or a complete assessment of your experience. A skill not detected in your text may still be part of your experience.</InlineFeedback>
        </section>

        <section aria-labelledby="privacy-heading" className="grid gap-6 lg:grid-cols-2">
          <Card className="min-w-0 border border-border"><CardHeader><ShieldCheck className="text-brand" size={22} aria-hidden="true" /><h2 id="privacy-heading" className="text-xl font-semibold">Choose what you share</h2></CardHeader><CardContent className="space-y-4 text-sm leading-7 text-text-secondary"><p>When you request a comparison, ChatGPT sends the supplied resume and job-description text to this MCP server. The analysis tool processes it for that request, does not save it to the website database, and does not return the full submitted text in its result.</p><p>This does not mean your chat or all infrastructure logs are erased. ChatGPT and hosting services have their own data handling and retention policies. Review those policies and your workspace settings before sharing personal information.</p><p>Use a short, anonymized resume excerpt. Remove contact details, addresses, account numbers, and other confidential information. Never paste passwords, access tokens, or client secrets into a prompt.</p></CardContent></Card>
          <Card className="min-w-0 border border-border"><CardHeader><h2 className="text-xl font-semibold">Your website workspace is separate</h2></CardHeader><CardContent className="space-y-4 text-sm leading-7 text-text-secondary"><p>Resume matching through MCP requires supplying resume text directly. The remote MCP does not currently retrieve website-saved resumes, track applications, or submit applications for you.</p><p>Auth0 handles the connection’s interactive sign-in and authorization. Use the sign-in screen rather than sharing credentials in a chat. Connecting does not synchronize your website account or saved resume.</p><ul className="space-y-2"><li className="flex items-start gap-2"><Check size={17} className="mt-1 shrink-0 text-brand" aria-hidden="true" />Use ChatGPT for lookups and text comparisons.</li><li className="flex items-start gap-2"><Check size={17} className="mt-1 shrink-0 text-brand" aria-hidden="true" />Use the website for saved resumes and application tracking.</li></ul></CardContent></Card>
        </section>

        <section aria-labelledby="troubleshooting-heading" className="space-y-6">
          <PageHeader title="Need a hand connecting?" titleId="troubleshooting-heading" headingLevel={2} description="Start with these common connection and sign-in issues." />
          <div className="divide-y divide-border rounded-xl border border-border bg-surface">
            {troubleshooting.map(item => <details key={item.title} className="group px-5 sm:px-6"><summary className="min-h-14 cursor-pointer py-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{item.title}</summary><p className="pb-5 text-sm leading-7 text-text-secondary">{item.text}</p></details>)}
          </div>
        </section>
        <section aria-labelledby="workspace-heading" className="flex flex-col justify-between gap-6 rounded-2xl border border-border bg-surface p-6 sm:p-8 md:flex-row md:items-center">
          <div><h2 id="workspace-heading" className="text-xl font-semibold">Keep your next steps organized</h2><p className="mt-2 text-sm leading-6 text-text-secondary">Your website workspace holds your saved resume and application tracker.</p></div>
          <div className="flex flex-wrap gap-3"><Link href="/dashboard" className={cn(buttonVariants(), "min-h-11 px-4")}>Open dashboard<ArrowRight aria-hidden="true" /></Link>{!currentUser && <><Link href="/signup" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 px-4")}>Create website account</Link><Link href="/login" className={textLink}>Sign in</Link></>}</div>
        </section>
      </main>
      <footer className="border-t border-border bg-surface px-4 py-6 text-sm text-text-secondary sm:px-8"><div className="mx-auto flex max-w-7xl flex-wrap justify-between gap-3"><p>AI Job Application Assistant</p><Link href="/" className={textLink}>Back to the website</Link></div></footer>
    </div>
  );
}
