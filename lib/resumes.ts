import "server-only";

import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";

type ResumeRow = {
  id: string;
  name: string;
  content: string;
  created_at: Date;
  updated_at: Date;
};

export type Resume = {
  id: string;
  name: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) {
    throw new Error("Authentication is required to access resumes.");
  }

  return session.userId;
}

function toResume(row: ResumeRow): Resume {
  return {
    id: row.id,
    name: row.name,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function validateResumeFields(name: string, content: string): void {
  if (!name.trim()) {
    throw new Error("Resume name is required.");
  }

  if (!content.trim()) {
    throw new Error("Resume content is required.");
  }
}

export async function getResume(): Promise<Resume | null> {
  const userId = await requireUserId();
  const result = await pool.query<ResumeRow>(
    `SELECT id, name, content, created_at, updated_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY updated_at DESC, created_at DESC
     LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  return row ? toResume(row) : null;
}

export async function createResume(name: string, content: string): Promise<Resume> {
  const userId = await requireUserId();
  validateResumeFields(name, content);

  const result = await pool.query<ResumeRow>(
    `INSERT INTO resumes (user_id, name, content)
     VALUES ($1, $2, $3)
     RETURNING id, name, content, created_at, updated_at`,
    [userId, name.trim(), content],
  );

  const row = result.rows[0];
  if (!row) {
    throw new Error("Resume could not be created.");
  }

  return toResume(row);
}

export async function updateResume(
  resumeId: string,
  name: string,
  content: string,
): Promise<Resume | null> {
  const userId = await requireUserId();
  validateResumeFields(name, content);

  if (!UUID_PATTERN.test(resumeId)) {
    return null;
  }

  const result = await pool.query<ResumeRow>(
    `UPDATE resumes
     SET name = $1, content = $2, updated_at = now()
     WHERE id = $3 AND user_id = $4
     RETURNING id, name, content, created_at, updated_at`,
    [name.trim(), content, resumeId, userId],
  );

  const row = result.rows[0];
  return row ? toResume(row) : null;
}
