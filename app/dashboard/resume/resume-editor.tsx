"use client";

import { useState, useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Resume } from "@/lib/resumes";
import { saveResume, type ResumeFormState } from "./actions";

const initialState: ResumeFormState = {};

export function ResumeEditor({ resume }: { resume: Resume | null }) {
  const [editing, setEditing] = useState(!resume);
  const [state, formAction, pending] = useActionState(saveResume, initialState);
  const name = state.values?.name ?? resume?.name ?? "";
  const content = state.values?.content ?? resume?.content ?? "";

  if (resume && !editing) {
    return (
      <div>
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <p className="text-xs font-medium text-[#818980]">RESUME NAME</p>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.03em]">{resume.name}</h2>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={() => setEditing(true)}
            className="h-10 w-fit rounded-lg border-[#dfe4dc] px-4 text-sm"
          >
            Edit resume
          </Button>
        </div>
        <div className="mt-6 border-t border-[#edf0eb] pt-5">
          <p className="text-xs font-medium text-[#818980]">RESUME CONTENT</p>
          <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-[#465047]">{resume.content}</p>
        </div>
      </div>
    );
  }

  return (
    <form action={formAction} noValidate className="space-y-5">
      {resume && <input type="hidden" name="resumeId" value={resume.id} />}

      <div className="space-y-2">
        <label htmlFor="resume-name" className="text-sm font-medium text-[#303a33]">Resume name</label>
        <Input
          id="resume-name"
          name="name"
          type="text"
          required
          maxLength={200}
          defaultValue={name}
          aria-invalid={Boolean(state.errors?.name)}
          aria-describedby={state.errors?.name ? "resume-name-error" : undefined}
          className="h-11 rounded-lg border-[#dfe4dc] bg-white px-3"
        />
        {state.errors?.name && <p id="resume-name-error" className="text-sm text-red-700">{state.errors.name}</p>}
      </div>

      <div className="space-y-2">
        <label htmlFor="resume-content" className="text-sm font-medium text-[#303a33]">Resume content</label>
        <Textarea
          id="resume-content"
          name="content"
          required
          rows={18}
          defaultValue={content}
          placeholder="Add your experience, skills, education, and achievements."
          aria-invalid={Boolean(state.errors?.content)}
          aria-describedby={state.errors?.content ? "resume-content-error" : undefined}
          className="min-h-[360px] resize-y rounded-lg border-[#dfe4dc] bg-white px-3 py-3 leading-6"
        />
        {state.errors?.content && <p id="resume-content-error" className="text-sm text-red-700">{state.errors.content}</p>}
      </div>

      {state.message && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{state.message}</p>}

      <div className="flex flex-wrap gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="h-10 rounded-lg bg-[#203c32] px-4 text-sm text-white hover:bg-[#2d5143]"
        >
          {pending ? "Saving…" : resume ? "Save changes" : "Save Resume"}
        </Button>
        {resume && (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => setEditing(false)}
            className="h-10 rounded-lg border-[#dfe4dc] px-4 text-sm"
          >
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
