"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { FileText, Pencil, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/presentation/empty-state";
import { InlineFeedback } from "@/components/presentation/inline-feedback";
import type { Resume } from "@/lib/resumes";
import { saveResume, type ResumeFormState, type SavedResume } from "./actions";

export function ResumeEditor({ resume }: { resume: Resume | null }) {
  const [saved, setSaved] = useState<SavedResume | null>(resume);
  const [editing, setEditing] = useState(false);
  const [success, setSuccess] = useState(false);
  const editButton = useRef<HTMLButtonElement>(null);
  const preview = useRef<HTMLHeadingElement>(null);

  const focusTarget = useRef<"edit" | "preview" | null>(null);
  useEffect(() => {
    if (editing) return;
    if (focusTarget.current === "edit") editButton.current?.focus();
    if (focusTarget.current === "preview") preview.current?.focus();
    focusTarget.current = null;
  }, [editing, saved]);

  function closeEditor() {
    focusTarget.current = "edit";
    setEditing(false);

  }

  return (
    <div className="min-w-0 space-y-5">
      {success && <InlineFeedback tone="success" title="Resume saved">Your saved content is ready to use in job analysis.</InlineFeedback>}
      {editing ? (
        <ResumeForm resume={saved} onCancel={closeEditor} onSaved={(record) => {
          focusTarget.current = "preview";
          setSaved(record);
          setEditing(false);
          setSuccess(true);

        }} />
      ) : saved ? (
        <Card className="gap-0 overflow-hidden py-0 shadow-subtle">
          <CardContent className="p-5 sm:p-8">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wider text-text-secondary">Saved resume</p>
                <h2 ref={preview} tabIndex={-1} className="mt-2 break-words text-xl font-semibold tracking-tight text-text-primary focus-visible:rounded-md focus-visible:outline-2 focus-visible:outline-focus">{saved.name}</h2>
                <p className="mt-2 text-sm text-text-secondary">This is the content used when comparing your resume with job descriptions.</p>
              </div>
              <Button ref={editButton} type="button" variant="outline" onClick={() => { setSuccess(false); setEditing(true); }} className="shrink-0 self-start"><Pencil aria-hidden="true" />Edit resume</Button>
            </div>
            <div className="mt-6 border-t border-border pt-6">
              <h3 className="text-sm font-medium text-text-primary">Resume content</h3>
              {saved.content.trim() ? <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-7 text-text-secondary">{saved.content}</p> : <InlineFeedback tone="warning" title="Add your resume content" className="mt-3">Edit your resume to add experience and skills before analyzing opportunities.</InlineFeedback>}
            </div>
          </CardContent>
        </Card>
      ) : (
        <EmptyState icon={FileText} title="Start with your experience" description="Save your resume as text so you can compare your skills with opportunities. Give it a name that is easy to recognize." actions={<Button ref={editButton} onClick={() => setEditing(true)} type="button">Add your resume</Button>} />
      )}
    </div>
  );
}

function ResumeForm({ resume, onCancel, onSaved }: { resume: SavedResume | null; onCancel: () => void; onSaved: (resume: SavedResume) => void }) {
  const [name, setName] = useState(resume?.name ?? "");
  const [content, setContent] = useState(resume?.content ?? "");
  const nameInput = useRef<HTMLInputElement>(null);
  const contentInput = useRef<HTMLTextAreaElement>(null);
  const [state, formAction, pending] = useActionState(async (previous: ResumeFormState, data: FormData) => {
    const result = await saveResume(previous, data);
    if (result.saved) onSaved(result.saved);
    else requestAnimationFrame(() => {
      if (result.errors?.name) nameInput.current?.focus();
      else if (result.errors?.content) contentInput.current?.focus();
    });
    return result;
  }, {});

  return (
    <Card className="gap-0 py-0 shadow-subtle">
      <CardContent className="p-5 sm:p-8">
        <h2 className="text-xl font-semibold tracking-tight">{resume ? "Edit your resume" : "Add your resume"}</h2>
        <p className="mt-2 text-sm leading-6 text-text-secondary">Paste your resume text below. Include your experience, skills, education, and achievements.</p>
        <form action={formAction} noValidate aria-busy={pending} className="mt-6 space-y-6">
          {resume && <input type="hidden" name="resumeId" value={resume.id} />}
          <div className="space-y-2">
            <label htmlFor="resume-name" className="text-sm font-medium">Resume name <span className="text-text-secondary">(required)</span></label>
            <Input ref={nameInput} autoFocus id="resume-name" name="name" required maxLength={200} value={name} onChange={event => setName(event.target.value)} readOnly={pending} aria-invalid={Boolean(state.errors?.name)} aria-describedby={`resume-name-help${state.errors?.name ? " resume-name-error" : ""}`} className="h-11 w-full min-w-0" />
            <p id="resume-name-help" className="text-xs leading-5 text-text-secondary">For example, “Software engineering resume”. Up to 200 characters.</p>
            {state.errors?.name && <p id="resume-name-error" className="text-sm text-error">{state.errors.name}</p>}
          </div>
          <div className="space-y-2">
            <label htmlFor="resume-content" className="text-sm font-medium">Resume content <span className="text-text-secondary">(required)</span></label>
            <Textarea ref={contentInput} id="resume-content" name="content" required rows={15} value={content} onChange={event => setContent(event.target.value)} readOnly={pending} aria-invalid={Boolean(state.errors?.content)} aria-describedby={`resume-content-help${state.errors?.content ? " resume-content-error" : ""}`} className="min-h-80 w-full min-w-0 resize-y text-sm leading-7" />
            <p id="resume-content-help" className="text-xs leading-5 text-text-secondary">Plain text is supported. Your line breaks are preserved.</p>
            {state.errors?.content && <p id="resume-content-error" className="text-sm text-error">{state.errors.content}</p>}
          </div>
          {(state.message || state.errors) && <InlineFeedback tone="error" title={state.message ? "Resume not saved" : "Check your resume"}>{state.message ?? "Complete the required fields, then save again."} Your edits are still here.</InlineFeedback>}
          <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
            <Button type="submit" disabled={pending}><Save aria-hidden="true" />{pending ? "Saving…" : resume ? "Save changes" : "Save resume"}</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={onCancel}>Cancel</Button>
            {pending && <span role="status" className="text-sm text-text-secondary">Saving your resume…</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
