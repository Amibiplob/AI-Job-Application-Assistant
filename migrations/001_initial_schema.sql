CREATE TYPE workplace_type AS ENUM ('REMOTE', 'HYBRID', 'ONSITE');

CREATE TYPE application_status AS ENUM (
  'SAVED',
  'APPLIED',
  'INTERVIEW',
  'REJECTED',
  'OFFER',
  'WITHDRAWN'
);

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resumes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX resumes_user_id_idx ON resumes(user_id);

CREATE TABLE jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT,
  source TEXT NOT NULL,
  title TEXT NOT NULL,
  company TEXT NOT NULL,
  location TEXT,
  workplace_type workplace_type,
  employment_type TEXT,
  salary_min NUMERIC(12, 2),
  salary_max NUMERIC(12, 2),
  salary_currency VARCHAR(3),
  salary_period TEXT,
  description TEXT,
  job_url TEXT,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT jobs_source_external_id_key UNIQUE (source, external_id)
);

CREATE INDEX jobs_company_idx ON jobs(company);
CREATE INDEX jobs_source_posted_at_idx ON jobs(source, posted_at);

CREATE TABLE applications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES jobs(id),
  status application_status NOT NULL DEFAULT 'SAVED',
  applied_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT applications_user_id_job_id_key UNIQUE (user_id, job_id)
);

CREATE INDEX applications_user_id_idx ON applications(user_id);
CREATE INDEX applications_job_id_idx ON applications(job_id);
CREATE INDEX applications_user_status_updated_at_idx
  ON applications(user_id, status, updated_at);
