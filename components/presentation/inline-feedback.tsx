import type { ComponentProps, ReactNode } from "react";
import { CircleCheck, CircleAlert, Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

const tones = {
  success: { icon: CircleCheck, classes: "border-success-border bg-success-subtle text-success" },
  warning: { icon: TriangleAlert, classes: "border-warning-border bg-warning-subtle text-warning" },
  error: { icon: CircleAlert, classes: "border-error-border bg-error-subtle text-error" },
  info: { icon: Info, classes: "border-info-border bg-info-subtle text-info" },
};

type InlineFeedbackProps = Omit<ComponentProps<"div">, "title" | "children" | "role" | "aria-live"> & {
  tone?: keyof typeof tones;
  title?: string;
  children: ReactNode;
  /** Use "off" for persistent guidance; live announcements suit action feedback. */
  announcement?: "polite" | "assertive" | "off";
};

export function InlineFeedback({
  tone = "info", title, children, announcement,
  className, ...props
}: InlineFeedbackProps) {
  const { icon: Icon, classes } = tones[tone];
  const live = announcement ?? (tone === "error" ? "assertive" : "polite");

  return (
    <div
      {...props}
      role={live === "off" ? undefined : live === "assertive" ? "alert" : "status"}
      aria-live={live}
      aria-atomic={live === "off" ? undefined : true}
      className={cn("flex min-w-0 items-start gap-3 rounded-xl border p-4 text-sm leading-6", classes, className)}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 break-words">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}
