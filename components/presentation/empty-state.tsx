import type { ComponentProps, ReactNode } from "react";
import { FileSearch, type LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EmptyStateProps = Omit<ComponentProps<"section">, "title" | "children"> & {
  title: string;
  description: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  headingLevel?: 2 | 3;
};

export function EmptyState({
  title, description, icon: Icon = FileSearch, actions, headingLevel = 2,
  className, ...props
}: EmptyStateProps) {
  const Heading = `h${headingLevel}` as "h2" | "h3";

  return (
    <section aria-label={title} className={cn("min-w-0", className)} {...props}>
      <Card className="gap-0 py-0 ring-border shadow-subtle">
        <CardContent className="flex flex-col items-center px-5 py-10 text-center sm:px-8 sm:py-12">
          <span className="flex size-12 items-center justify-center rounded-xl bg-brand-subtle text-brand-foreground"><Icon size={22} aria-hidden="true" /></span>
          <Heading className="mt-5 max-w-lg break-words text-lg font-semibold tracking-tight text-text-primary">{title}</Heading>
          <div className="mt-2 max-w-md text-sm leading-6 text-text-secondary">{description}</div>
          {actions && <div className="mt-6 flex max-w-full flex-wrap justify-center gap-3">{actions}</div>}
        </CardContent>
      </Card>
    </section>
  );
}
