import type { ComponentProps } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statuses = {
  SAVED: { label: "Saved", classes: "border-border bg-surface-muted text-text-secondary" },
  APPLIED: { label: "Applied", classes: "border-info-border bg-info-subtle text-info" },
  INTERVIEW: { label: "Interview", classes: "border-warning-border bg-warning-subtle text-warning" },
  OFFER: { label: "Offer", classes: "border-success-border bg-success-subtle text-success" },
  REJECTED: { label: "Rejected", classes: "border-error-border bg-error-subtle text-error" },
  WITHDRAWN: { label: "Withdrawn", classes: "border-border bg-surface-muted text-text-secondary" },
};

type StatusBadgeProps = Omit<ComponentProps<typeof Badge>, "children" | "variant" | "render"> & {
  status: string;
};

/** Unknown statuses remain visible and neutral; this component never changes data. */
export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
  const key = status.trim().toUpperCase();
  const entry = Object.hasOwn(statuses, key) ? statuses[key as keyof typeof statuses] : null;
  const label = entry?.label ?? (status.trim() || "Unknown status");

  return (
    <Badge {...props} variant="outline" className={cn("h-auto min-h-6 max-w-full whitespace-normal break-words rounded-md px-2.5 py-1", entry?.classes ?? "border-border bg-surface-muted text-text-secondary", className)}>
      {label}
    </Badge>
  );
}
