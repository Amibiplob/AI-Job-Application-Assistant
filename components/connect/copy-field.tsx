"use client";

import { useId, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function CopyField({ label, text, rows = 5 }: { label: string; text: string; rows?: number }) {
  const id = useId();
  const field = useRef<HTMLTextAreaElement>(null);
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "manual">("idle");

  async function copy() {
    setStatus("copying");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      field.current?.focus();
      field.current?.select();
      setStatus("manual");
    }
  }

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-sm font-medium text-text-primary">{label}</label>
        <Button type="button" variant="outline" className="min-h-11 px-3" disabled={status === "copying"} onClick={copy} aria-label={`Copy ${label}`} aria-describedby={`${id}-status`}>
          {status === "copied" ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {status === "copying" ? "Copying…" : status === "copied" ? "Copied" : "Copy"}
        </Button>
      </div>
      <Textarea ref={field} id={id} value={text} readOnly rows={rows} spellCheck={false} autoComplete="off" aria-describedby={`${id}-status`} className="min-h-0 w-full resize-y break-all bg-surface-muted font-mono text-xs leading-6 sm:text-sm" />
      <p id={`${id}-status`} role="status" aria-live="polite" aria-atomic="true" className="min-h-6 text-xs leading-6 text-text-secondary">
        {status === "copied" ? `${label} copied to clipboard.` : status === "manual" ? "Copy is unavailable. The text is selected; use your device’s Copy command." : "You can also select and copy the text manually."}
      </p>
    </div>
  );
}
