import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type JobSourceBadgeProps = Omit<ComponentProps<typeof Badge>, "children" | "variant" | "render" | "title"> & {
  source: string | null;
  /** Explicitly flag other sample sources; known demo sources always stay demos. */
  isDemo?: boolean;
};

/** A source or listing URL is not evidence of employer verification. */
export function JobSourceBadge({ source, isDemo = false, className, ...props }: JobSourceBadgeProps) {
  const sourceName = source?.trim() || "Unknown source";
  const demo = isDemo || /^demo(?:[-_\s]|$)/i.test(sourceName);

  return (
    <Badge
      {...props}
      variant="outline"
      title={demo ? "Sample job data for demonstration; not a verified vacancy." : "Source supplied with the listing; employer and vacancy have not been verified."}
      className={cn("h-auto min-h-6 max-w-full whitespace-normal break-all rounded-md px-2.5 py-1", demo ? "border-warning-border bg-warning-subtle text-warning" : "border-border bg-surface-muted text-text-secondary", className)}
    >
      {demo ? "Demo listing" : "Unverified listing"} · {sourceName}
    </Badge>
  );
}
