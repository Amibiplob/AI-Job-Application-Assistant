"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Application } from "@/lib/applications";
import { APPLICATION_STATUSES } from "@/lib/application-validation";
import { saveApplication, type UpdateApplicationState } from "./actions";

const initialState: UpdateApplicationState = { status: "idle" };

function formatStatus(status: string): string {
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function dateValue(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : "";
}

export function ApplicationEditor({ application }: { application: Application }) {
  const [state, formAction, pending] = useActionState(saveApplication, initialState);

  return (
    <form action={formAction} className="mt-5 border-t border-[#edf0eb] pt-4">
      <input type="hidden" name="applicationId" value={application.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label htmlFor={`status-${application.id}`} className="text-xs font-medium text-[#566057]">Status</label>
          <select id={`status-${application.id}`} name="status" defaultValue={application.status} className="h-10 w-full rounded-lg border border-[#dfe4dc] bg-white px-3 text-sm text-[#344039] outline-none focus-visible:ring-3 focus-visible:ring-[#91a894]/40">
            {APPLICATION_STATUSES.map((status) => <option key={status} value={status}>{formatStatus(status)}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <label htmlFor={`applied-at-${application.id}`} className="text-xs font-medium text-[#566057]">Applied date <span className="font-normal text-[#8b9289]">(optional)</span></label>
          <Input id={`applied-at-${application.id}`} name="appliedAt" type="date" defaultValue={dateValue(application.appliedAt)} className="h-10 rounded-lg border-[#dfe4dc] text-sm" />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label htmlFor={`notes-${application.id}`} className="text-xs font-medium text-[#566057]">Notes <span className="font-normal text-[#8b9289]">(optional)</span></label>
        <Textarea id={`notes-${application.id}`} name="notes" defaultValue={application.notes ?? ""} maxLength={5000} rows={3} placeholder="Add a note about this application" className="min-h-20 resize-y rounded-lg border-[#dfe4dc] px-3 py-2 text-sm leading-5" />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending} variant="outline" className="h-9 rounded-lg border-[#dfe4dc] px-3 text-xs">{pending ? "Saving…" : "Save updates"}</Button>
        {state.message && <p role={state.status === "error" ? "alert" : "status"} className={`text-xs ${state.status === "error" ? "text-red-700" : "text-[#55705a]"}`}>{state.message}</p>}
      </div>
    </form>
  );
}
