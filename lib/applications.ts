import "server-only";

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { isUuid, validateApplicationUpdate, type ApplicationStatus } from "@/lib/application-validation";

export { APPLICATION_STATUSES, type ApplicationStatus } from "@/lib/application-validation";

export type Application = {
  id: string;
  jobId: string;
  status: ApplicationStatus;
  appliedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  job: {
    title: string;
    company: string;
    location: string | null;
    workplaceType: "REMOTE" | "HYBRID" | "ONSITE" | null;
    employmentType: string | null;
    salaryMin: string | null;
    salaryMax: string | null;
    salaryCurrency: string | null;
    salaryPeriod: string | null;
    postedAt: Date | null;
    source: string;
  };
};

type ApplicationRow = {
  id: string;
  job_id: string;
  status: ApplicationStatus;
  applied_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  title: string;
  company: string;
  location: string | null;
  workplace_type: Application["job"]["workplaceType"];
  employment_type: string | null;
  salary_min: string | null;
  salary_max: string | null;
  salary_currency: string | null;
  salary_period: string | null;
  posted_at: Date | null;
  source: string;
};

type ApplicationOnlyRow = {
  id: string;
  job_id: string;
  status: ApplicationStatus;
  applied_at: Date | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
};

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error("Authentication is required to access applications.");
  }
  return session.userId;
}

function toApplication(row: ApplicationRow): Application {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    appliedAt: row.applied_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    job: {
      title: row.title,
      company: row.company,
      location: row.location,
      workplaceType: row.workplace_type,
      employmentType: row.employment_type,
      salaryMin: row.salary_min,
      salaryMax: row.salary_max,
      salaryCurrency: row.salary_currency,
      salaryPeriod: row.salary_period,
      postedAt: row.posted_at,
      source: row.source,
    },
  };
}

function toApplicationOnly(row: ApplicationOnlyRow): Omit<Application, "job"> {
  return {
    id: row.id,
    jobId: row.job_id,
    status: row.status,
    appliedAt: row.applied_at,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const APPLICATION_COLUMNS = `a.id, a.job_id, a.status, a.applied_at, a.notes,
  a.created_at, a.updated_at, j.title, j.company, j.location,
  j.workplace_type, j.employment_type, j.salary_min, j.salary_max,
  j.salary_currency, j.salary_period, j.posted_at, j.source`;

export type AddApplicationResult =
  | { status: "added"; application: Omit<Application, "job"> }
  | { status: "already-tracked"; application: Omit<Application, "job"> }
  | { status: "job-not-found" };

export async function addApplication(jobId: string): Promise<AddApplicationResult> {
  const userId = await requireUserId();
  if (!isUuid(jobId)) {
    return { status: "job-not-found" };
  }

  const inserted = await pool.query<ApplicationOnlyRow>(
    `INSERT INTO applications (user_id, job_id, status)
     SELECT $1, j.id, 'SAVED'::application_status
     FROM jobs AS j
     WHERE j.id = $2
     ON CONFLICT (user_id, job_id) DO NOTHING
     RETURNING id, job_id, status, applied_at, notes, created_at, updated_at`,
    [userId, jobId],
  );

  if (inserted.rows[0]) {
    return { status: "added", application: toApplicationOnly(inserted.rows[0]) };
  }

  const existing = await pool.query<ApplicationOnlyRow>(
    `SELECT id, job_id, status, applied_at, notes, created_at, updated_at
     FROM applications
     WHERE user_id = $1 AND job_id = $2
     LIMIT 1`,
    [userId, jobId],
  );
  if (existing.rows[0]) {
    return { status: "already-tracked", application: toApplicationOnly(existing.rows[0]) };
  }

  return { status: "job-not-found" };
}

export async function getApplicationForJob(jobId: string): Promise<Omit<Application, "job"> | null> {
  const userId = await requireUserId();
  if (!isUuid(jobId)) return null;

  const result = await pool.query<ApplicationOnlyRow>(
    `SELECT id, job_id, status, applied_at, notes, created_at, updated_at
     FROM applications
     WHERE user_id = $1 AND job_id = $2
     LIMIT 1`,
    [userId, jobId],
  );
  return result.rows[0] ? toApplicationOnly(result.rows[0]) : null;
}

export async function listApplications(): Promise<Application[]> {
  const userId = await requireUserId();
  const result = await pool.query<ApplicationRow>(
    `SELECT ${APPLICATION_COLUMNS}
     FROM applications AS a
     INNER JOIN jobs AS j ON j.id = a.job_id
     WHERE a.user_id = $1
     ORDER BY a.updated_at DESC, a.created_at DESC, a.id DESC`,
    [userId],
  );
  return result.rows.map(toApplication);
}

export type UpdateApplicationInput = {
  applicationId: string;
  status: string;
  notes: string;
  appliedAt: string;
};

export type UpdateApplicationResult = "updated" | "not-found" | "invalid-input";

export async function updateApplication(
  input: UpdateApplicationInput,
): Promise<UpdateApplicationResult> {
  const userId = await requireUserId();
  const validated = validateApplicationUpdate(input);
  if (!validated) return "invalid-input";

  const result = await pool.query(
    `UPDATE applications
     SET status = $1::application_status,
         notes = $2,
         applied_at = $3,
         updated_at = now()
     WHERE id = $4 AND user_id = $5
     RETURNING id`,
    [validated.status, validated.notes, validated.appliedAt, validated.applicationId, userId],
  );

  return result.rows.length ? "updated" : "not-found";
}
