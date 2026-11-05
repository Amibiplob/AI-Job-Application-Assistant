import { PublicPage } from "@/components/layout/public-page";
import { PUBLIC_DETAILS } from "@/lib/public-site";

export const metadata = { title: "Contact | AI Job Application Assistant" };
export default function ContactPage() {
  return <PublicPage title="Contact">
    <p>For product help, connection problems, privacy requests, or questions about the planned paid offer, contact the service operator.</p>
    <dl className="space-y-4 rounded-xl border border-border bg-surface p-6">
      <div><dt className="font-semibold">Support and privacy email</dt><dd className="mt-1 break-words">{PUBLIC_DETAILS.supportEmail}</dd></div>
      <div><dt className="font-semibold">Operator</dt><dd className="mt-1">{PUBLIC_DETAILS.legalName}</dd></div>
      <div><dt className="font-semibold">Address</dt><dd className="mt-1">{PUBLIC_DETAILS.address}</dd></div>
      <div><dt className="font-semibold">Website</dt><dd className="mt-1">{PUBLIC_DETAILS.domain}</dd></div>
    </dl>
    <p className="text-sm leading-6 text-text-secondary">Launch preparation: these are explicit placeholders, not a working contact channel. The operator must replace them and test the mailbox before public launch or Paddle domain submission.</p>
    <p className="text-sm leading-6 text-text-secondary">Include a short description of the issue and the page or tool involved. Do not send passwords, API keys, access tokens, payment-card details, or your full resume.</p>
  </PublicPage>;
}
