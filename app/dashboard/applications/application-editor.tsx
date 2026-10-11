"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import { applicationDate, statusLabel } from "@/components/jobs/application-presentation";
import type { Application } from "@/lib/applications";
import { APPLICATION_STATUSES } from "@/lib/application-validation";
import { saveApplication, type UpdateApplicationState } from "./actions";

const initialState: UpdateApplicationState = { status: "idle" };

export function ApplicationEditor({ application }: { application: Application }) {
  const [state, formAction, pending] = useActionState(saveApplication, initialState);
  // Controlled drafts survive React's action form reset, including failed saves.
  const [status, setStatus] = useState<string>(application.status);
  const [appliedAt, setAppliedAt] = useState(applicationDate(application.appliedAt));
  const [notes, setNotes] = useState(application.notes ?? "");
  const prefix = `application-${application.id}`;
  return (
    <form action={formAction} aria-label={`Update ${application.job.title || "application"}`} aria-busy={pending} aria-describedby={`${prefix}-help`} className="mt-6 border-t border-border pt-6">
      <h3 className="text-sm font-semibold">Update tracking</h3>
      <p id={`${prefix}-help`} className="mt-2 text-xs leading-5 text-text-secondary">Choose your current status. The optional applied date records when you applied; it is never filled automatically. Save before changing filters or leaving this page.</p>
      <input type="hidden" name="applicationId" value={application.id} />
      <fieldset disabled={pending} className="mt-5 min-w-0 space-y-5">
        <legend className="sr-only">Application details</legend>
        <div className="grid min-w-0 gap-5 sm:grid-cols-2">
          <div className="min-w-0 space-y-2"><label htmlFor={`${prefix}-status`} className="text-sm font-medium">Status</label><select id={`${prefix}-status`} name="status" value={status} onChange={event => setStatus(event.target.value)} className="h-11 w-full min-w-0 rounded-lg border border-input bg-surface px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus">{APPLICATION_STATUSES.map(value => <option key={value} value={value}>{statusLabel(value)}</option>)}</select></div>
          <div className="min-w-0 space-y-2"><label htmlFor={`${prefix}-date`} className="text-sm font-medium">Applied date <span className="font-normal text-text-secondary">(optional)</span></label><Input id={`${prefix}-date`} name="appliedAt" type="date" value={appliedAt} onChange={event => setAppliedAt(event.target.value)} className="h-11 min-w-0 max-w-full" /></div>
        </div>
        <div className="space-y-2"><label htmlFor={`${prefix}-notes`} className="text-sm font-medium">Notes <span className="font-normal text-text-secondary">(optional)</span></label><Textarea id={`${prefix}-notes`} name="notes" value={notes} onChange={event => setNotes(event.target.value)} maxLength={5000} rows={4} aria-describedby={`${prefix}-notes-help`} placeholder="Keep useful details about your application here" className="min-h-28 resize-y" /><p id={`${prefix}-notes-help`} className="text-xs text-text-secondary">Up to 5,000 characters.</p></div>
        <Button type="submit" className="min-h-11">{pending ? "Saving…" : "Save updates"}</Button>
      </fieldset>
      {pending && <p role="status" className="mt-4 text-sm text-text-secondary">Saving your tracking update…</p>}
      {!pending && state.message && <InlineFeedback className="mt-4" tone={state.status === "error" ? "error" : "success"} title={state.status === "error" ? "Update not saved" : "Changes saved"}>{state.message}{state.status === "error" && " Your edits are still in the form."}</InlineFeedback>}
    </form>
  );
}
