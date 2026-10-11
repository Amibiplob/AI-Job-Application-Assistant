import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/utils";

type PageHeaderProps = Omit<ComponentProps<"header">, "title" | "children"> & {
  title: string;
  description?: ReactNode;
  eyebrow?: string;
  actions?: ReactNode;
  headingLevel?: 1 | 2 | 3;
  titleId?: string;
};

/** Keep page headings server-rendered; actions may contain interactive children. */
export function PageHeader({
  title, description, eyebrow, actions, headingLevel = 1, titleId,
  className, ...props
}: PageHeaderProps) {
  const Heading = `h${headingLevel}` as "h1" | "h2" | "h3";

  return (
    <header className={cn("flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between", className)} {...props}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-text-secondary">{eyebrow}</p>}
        <Heading id={titleId} className="break-words text-3xl font-semibold leading-tight tracking-tight text-text-primary sm:text-4xl">{title}</Heading>
        {description && <div className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">{description}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-3 sm:shrink-0">{actions}</div>}
    </header>
  );
}
