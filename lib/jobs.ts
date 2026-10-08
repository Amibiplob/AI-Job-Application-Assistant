import "server-only";

import { pool } from "@/lib/db/pool";

export type WorkplaceType = "REMOTE" | "HYBRID" | "ONSITE";

export type Job = {
  id: string;
  externalId: string | null;
  source: string;
  title: string;
  company: string;
  location: string | null;
  workplaceType: WorkplaceType | null;
  employmentType: string | null;
  // node-postgres returns PostgreSQL NUMERIC columns as strings by default.
  salaryMin: string | null;
  salaryMax: string | null;
  salaryCurrency: string | null;
  salaryPeriod: string | null;
  description: string | null;
  jobUrl: string | null;
  postedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type CreateJobInput = {
  source: string;
  title: string;
  company: string;
  externalId?: string | null;
  location?: string | null;
  workplaceType?: WorkplaceType | null;
  employmentType?: string | null;
  salaryMin?: number | string | null;
  salaryMax?: number | string | null;
  salaryCurrency?: string | null;
  salaryPeriod?: string | null;
  description?: string | null;
  jobUrl?: string | null;
  postedAt?: Date | string | null;
};

export type ListJobsOptions = {
  limit?: number;
  offset?: number;
  source?: string | null;
  workplaceType?: WorkplaceType | null;
  search?: string | null;
};

type JobRow = {
  id: string;
  external_id: string | null;
  source: string;
  title: string;
  company: string;
  location: string | null;
  workplace_type: WorkplaceType | null;
  employment_type: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  description: string | null;
  job_url: string | null;
  posted_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const JOB_COLUMNS = `id, external_id, source, title, company, location,
  workplace_type, employment_type, salary_min, salary_max, salary_currency,
  salary_period, description, job_url, posted_at, created_at, updated_at`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function toJob(row: JobRow): Job {
  return {
    id: row.id,
    externalId: row.external_id,
    source: row.source,
    title: row.title,
    company: row.company,
    location: row.location,
    workplaceType: row.workplace_type,
    employmentType: row.employment_type,
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: row.salary_period,
    description: row.description,
    jobUrl: row.job_url,
    postedAt: row.posted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(MAX_LIMIT, Math.max(1, Math.trunc(limit)));
}

function normalizeOffset(offset: number | undefined): number {
  if (offset === undefined || !Number.isFinite(offset) || offset < 0) {
    return 0;
  }

  return Math.trunc(offset);
}

export async function createJob(input: CreateJobInput): Promise<Job> {
  if (!input.source.trim() || !input.title.trim() || !input.company.trim()) {
    throw new Error("Job source, title, and company are required.");
  }

  const result = await pool.query<JobRow>(
    `INSERT INTO jobs (
       external_id, source, title, company, location, workplace_type,
       employment_type, salary_min, salary_max, salary_currency, salary_period,
       description, job_url, posted_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (source, external_id) DO NOTHING
     RETURNING ${JOB_COLUMNS}`,
    [
      input.externalId ?? null,
      input.source.trim(),
      input.title.trim(),
      input.company.trim(),
      input.location ?? null,
      input.workplaceType ?? null,
      input.employmentType ?? null,
      input.salaryMin ?? null,
      input.salaryMax ?? null,
      input.salaryCurrency ?? null,
      input.salaryPeriod ?? null,
      input.description ?? null,
      input.jobUrl ?? null,
      input.postedAt ?? null,
    ],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("A job with this source and external ID already exists.");
  }

  return toJob(row);
}

export async function getJobById(id: string): Promise<Job | null> {
  if (!UUID_PATTERN.test(id)) {
    return null;
  }

  const result = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM jobs
     WHERE id = $1
     LIMIT 1`,
    [id],
  );

  const row = result.rows[0];
  return row ? toJob(row) : null;
}

export async function listJobs(options: ListJobsOptions = {}): Promise<Job[]> {
  const conditions: string[] = [];
  const values: (number | string)[] = [];

  if (options.source) {
    values.push(options.source);
    conditions.push(`source = $${values.length}`);
  }

  if (options.workplaceType) {
    values.push(options.workplaceType);
    conditions.push(`workplace_type = $${values.length}::workplace_type`);
  }

  if (options.search?.trim()) {
    values.push(`%${options.search.trim()}%`);
    conditions.push(`(title ILIKE $${values.length} OR company ILIKE $${values.length})`);
  }

  values.push(normalizeLimit(options.limit));
  const limitParameter = `$${values.length}`;
  values.push(normalizeOffset(options.offset));
  const offsetParameter = `$${values.length}`;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const result = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM jobs
     ${whereClause}
     ORDER BY posted_at DESC NULLS LAST, created_at DESC, id DESC
     LIMIT ${limitParameter} OFFSET ${offsetParameter}`,
    values,
  );

  return result.rows.map(toJob);
}

export async function findJobByExternalId(
  source: string,
  externalId: string | null,
): Promise<Job | null> {
  if (!externalId?.trim()) {
    return null;
  }

  const result = await pool.query<JobRow>(
    `SELECT ${JOB_COLUMNS}
     FROM jobs
     WHERE source = $1 AND external_id = $2
     LIMIT 1`,
    [source, externalId],
  );

  const row = result.rows[0];
  return row ? toJob(row) : null;
}
