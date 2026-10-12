import { z } from "zod";

// @ts-expect-error Explicit extension lets Node's built-in TypeScript test runner resolve this module.
import { analyzeJobDescriptionAgainstResume } from "../job-matching.ts";
import type { Job, ListJobsOptions, WorkplaceType } from "../jobs";

export const MAX_SEARCH_RESULTS = 25;
export const DEFAULT_SEARCH_RESULTS = 10;
export const MAX_ANALYSIS_TEXT_LENGTH = 20_000;

export const analyzeJobMatchInputSchema = z.object({
  resumeText: z.string().max(MAX_ANALYSIS_TEXT_LENGTH).trim().min(1),
  jobDescription: z.string().max(MAX_ANALYSIS_TEXT_LENGTH).trim().min(1),
}).strict();

export const searchJobsInputSchema = z.object({
  keywords: z.string().trim().min(1).max(200),
  workplaceType: z.enum(["REMOTE", "HYBRID", "ONSITE"]).optional(),
  limit: z.number().int().min(1).max(MAX_SEARCH_RESULTS).optional(),
});

export const getJobDetailsInputSchema = z.object({
  jobId: z.uuid(),
});

export type JobSummary = {
  id: string;
  title: string;
  company: string;
  location: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: string | null;
  salary: {
    minimum: string | null;
    maximum: string | null;
    currency: string | null;
    period: string | null;
  } | null;
  postedAt: string | null;
  source: string;
  listingStatus: "demonstration" | "unverified";
  listingDisclosure: string;
};

export type JobDetails = JobSummary & {
  description: string | null;
  jobUrl: string | null;
  jobUrlDisclosure: string | null;
};

export type JobToolDependencies = {
  listJobs: (options: ListJobsOptions) => Promise<Job[]>;
  getJobById: (id: string) => Promise<Job | null>;
};

export function serializeJobSummary(job: Job): JobSummary {
  // Match the website JobSourceBadge convention; keep the original source intact.
  const demo = /^demo(?:[-_\s]|$)/i.test(job.source.trim());
  const hasSalary =
    job.salaryMin !== null ||
    job.salaryMax !== null ||
    job.salaryCurrency !== null ||
    job.salaryPeriod !== null;

  return {
    id: job.id,
    title: job.title,
    company: job.company,
    location: job.location,
    workplaceType: job.workplaceType,
    employmentType: job.employmentType,
    salary: hasSalary
      ? {
          minimum: job.salaryMin,
          maximum: job.salaryMax,
          currency: job.salaryCurrency,
          period: job.salaryPeriod,
        }
      : null,
    postedAt: job.postedAt?.toISOString() ?? null,
    source: job.source,
    listingStatus: demo ? "demonstration" : "unverified",
    listingDisclosure: demo
      ? "Demonstration data, not an active job vacancy. Demo listing URLs, including .test domains, are fictional and must not be used to apply for jobs."
      : "Unverified listing. The employer and vacancy have not been verified; confirm availability independently before applying.",
  };
}

function safeHttpUrl(value: string | null): string | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function serializeJobDetails(job: Job): JobDetails {
  const summary = serializeJobSummary(job);
  const jobUrl = safeHttpUrl(job.jobUrl);
  // A .test URL is fictional even when its source is not marked as a demo.
  const hostname = jobUrl ? new URL(jobUrl).hostname.toLowerCase().replace(/\.$/, "") : "";
  const fictional = summary.listingStatus === "demonstration" || hostname === "test" || hostname.endsWith(".test");
  return {
    ...summary,
    description: job.description,
    jobUrl,
    jobUrlDisclosure: jobUrl
      ? fictional
        ? "Fictional listing URL; must not be used to apply for jobs."
        : "Unverified listing URL. Confirm the destination and employer independently before sharing personal information or applying."
      : null,
  };
}

export function createJobToolLogic(dependencies: JobToolDependencies) {
  return {
    async searchJobs(input: unknown) {
      const args = searchJobsInputSchema.parse(input);
      const options: ListJobsOptions = {
        search: args.keywords,
        workplaceType: args.workplaceType ?? null,
        limit: Math.min(args.limit ?? DEFAULT_SEARCH_RESULTS, MAX_SEARCH_RESULTS),
        offset: 0,
      };
      const jobs = (await dependencies.listJobs(options)).slice(0, options.limit);

      return {
        keywords: args.keywords,
        workplaceType: args.workplaceType ?? null,
        count: jobs.length,
        jobs: jobs.map(serializeJobSummary),
        searchScope: "Job title and company name",
      };
    },

    async getJobDetails(input: unknown) {
      const args = getJobDetailsInputSchema.parse(input);
      const job = await dependencies.getJobById(args.jobId);

      return job ? { job: serializeJobDetails(job) } : { job: null };
    },
  };
}

/** Analyze only caller-supplied text. This function has no database or auth dependencies. */
export function createJobMatchToolLogic() {
  return {
    analyzeJobMatch(input: unknown) {
      const parsed = analyzeJobMatchInputSchema.safeParse(input);
      if (!parsed.success) {
        // Keep submitted text and validator input details out of tool error messages.
        throw new Error("Invalid analysis input. Provide nonblank text in both fields, each no longer than 20,000 characters.");
      }

      const analysis = analyzeJobDescriptionAgainstResume(
        parsed.data.resumeText,
        parsed.data.jobDescription,
      );

      return {
        ...analysis,
        scoreDescription: "A skills-text-overlap heuristic, not a hiring probability.",
      };
    },
  };
}
