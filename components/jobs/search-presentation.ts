import type { Job, WorkplaceType } from "@/lib/jobs";

export const PAGE_SIZE = 10;
export const workplaceTypes: { value: WorkplaceType; label: string }[] = [
  { value: "REMOTE", label: "Remote" },
  { value: "HYBRID", label: "Hybrid" },
  { value: "ONSITE", label: "Onsite" },
];
export type JobSearchParams = { [key: string]: string | string[] | undefined };
const single = (value: string | string[] | undefined) => typeof value === "string" ? value : "";

// Preserve the existing query normalization and title/company search semantics.
export function readJobFilters(params: JobSearchParams) {
  const search = single(params.q).trim().slice(0, 100);
  const requestedWorkplace = single(params.workplace).toUpperCase();
  const workplace: WorkplaceType | "" = workplaceTypes.some(({ value }) => value === requestedWorkplace) ? requestedWorkplace as WorkplaceType : "";
  const requestedPage = Number.parseInt(single(params.page), 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? Math.min(requestedPage, 100_000) : 1;
  return { search, workplace, page };
}

export function pageHref(page: number, search: string, workplace: string) {
  const params = new URLSearchParams();
  if (search) params.set("q", search);
  if (workplace) params.set("workplace", workplace);
  params.set("page", String(page));
  return `/dashboard/jobs?${params.toString()}`;
}

const currencies = new Set(Intl.supportedValuesOf("currency"));
const periods: Record<string, string> = { YEAR: "year", MONTH: "month", WEEK: "week", DAY: "day", HOUR: "hour" };
export function formatSalary(job: Pick<Job, "salaryMin" | "salaryMax" | "salaryCurrency" | "salaryPeriod">): string | null {
  const currency = job.salaryCurrency?.trim().toUpperCase();
  const periodKey = job.salaryPeriod?.trim().toUpperCase() ?? "";
  const period = Object.hasOwn(periods, periodKey) ? periods[periodKey] : null;
  if (!currency || !currencies.has(currency) || !period) return null;
  const amount = (value: string | null) => value !== null && /^\d+(?:\.\d+)?$/.test(value.trim()) && Number.isFinite(Number(value)) ? Number(value) : null;
  const min = amount(job.salaryMin);
  const max = amount(job.salaryMax);
  if ((job.salaryMin !== null && min === null) || (job.salaryMax !== null && max === null) || (min === null && max === null) || (min !== null && max !== null && min > max)) return null;
  try {
    const formatter = new Intl.NumberFormat("en-GB", { style: "currency", currency, currencyDisplay: "code", minimumFractionDigits: Number.isInteger(min ?? max) && (max === null || Number.isInteger(max)) ? 0 : 2, maximumFractionDigits: 2 });
    const range = min !== null && max !== null ? `${formatter.format(min)} – ${formatter.format(max)}` : min !== null ? `From ${formatter.format(min)}` : `Up to ${formatter.format(max!)}`;
    return `${range} / ${period}`;
  } catch {
    return null;
  }
}

export function formatPostedDate(date: Date | null): string | null {
  if (!date || !Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}
