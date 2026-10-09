import { z } from "zod";

import type { Job, ListJobsOptions, WorkplaceType } from "../jobs";

export const MAX_SEARCH_RESULTS = 25;
export const DEFAULT_SEARCH_RESULTS = 10;

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
};

export type JobDetails = JobSummary & {
  description: string | null;
  jobUrl: string | null;
};

export type JobToolDependencies = {
  listJobs: (options: ListJobsOptions) => Promise<Job[]>;
  getJobById: (id: string) => Promise<Job | null>;
};

export function serializeJobSummary(job: Job): JobSummary {
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
  return {
    ...serializeJobSummary(job),
    description: job.description,
    jobUrl: safeHttpUrl(job.jobUrl),
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
