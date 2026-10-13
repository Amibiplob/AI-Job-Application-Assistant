import "server-only";

import type { PoolClient } from "pg";
import { getSession } from "@/lib/auth";
import { pool } from "@/lib/db/pool";
import { validateResumeFields } from "@/lib/resume-validation";

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

export async function getResume(): Promise<Resume | null> {
  const userId = await requireUserId();
  const result = await pool.query<ResumeRow>(
    `SELECT id, name, content, created_at, updated_at
     FROM resumes
     WHERE user_id = $1
     ORDER BY updated_at DESC, created_at DESC, id DESC
     LIMIT 1`,
    [userId],
  );

  const row = result.rows[0];
  return row ? toResume(row) : null;
}

export async function createResume(name: string, content: string): Promise<Resume> {
  const userId = await requireUserId();
  assertValidResume(name, content);
  const saved = await saveCurrentResume(userId, name.trim(), content);
  if (!saved) throw new Error("A resume is already saved or the account is unavailable. Refresh before retrying.");
  return saved;
}

export async function updateResume(
  resumeId: string,
  name: string,
  content: string,
): Promise<Resume | null> {
  const userId = await requireUserId();
  assertValidResume(name, content);

  if (!UUID_PATTERN.test(resumeId)) {
    return null;
  }

  return saveCurrentResume(userId, name.trim(), content, resumeId.toLowerCase());
}

function assertValidResume(name: string, content: string): void {
  const errors = validateResumeFields(name, content);
  if (errors.name || errors.content) throw new Error(errors.name ?? errors.content);
}

async function saveCurrentResume(userId: string, name: string, content: string, resumeId?: string): Promise<Resume | null> {
  let client: PoolClient | undefined;
  let discard = false;
  try {
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    // All website resume writers lock the same owner, including the first insert.
    const owner = await client.query("SELECT id FROM users WHERE id = $1 FOR UPDATE", [userId]);
    if (owner.rowCount !== 1) {
      await client.query("ROLLBACK");
      return null;
    }
    const existing = await client.query<ResumeRow>(
      `SELECT id, name, content, created_at, updated_at FROM resumes
       WHERE user_id = $1 ORDER BY updated_at DESC, created_at DESC, id DESC LIMIT 1`,
      [userId],
    );
    const current = existing.rows[0];
    if (!resumeId && current) {
      // An identical first-save retry is idempotent; a stale create cannot replace newer data.
      await client.query("ROLLBACK");
      return current.name === name && current.content === content ? toResume(current) : null;
    }
    if (resumeId && current?.id !== resumeId) {
      await client.query("ROLLBACK");
      return null;
    }
    const result = resumeId
      ? await client.query<ResumeRow>(
        `UPDATE resumes SET name = $1, content = $2, updated_at = statement_timestamp()
         WHERE id = $3 AND user_id = $4 RETURNING id, name, content, created_at, updated_at`,
        [name, content, resumeId, userId],
      )
      : await client.query<ResumeRow>(
        `INSERT INTO resumes (user_id, name, content) VALUES ($1, $2, $3)
         RETURNING id, name, content, created_at, updated_at`,
        [userId, name, content],
      );
    const row = result.rows[0];
    if (result.rowCount !== 1 || !row) throw new Error("Replacement was not saved.");
    // Pruning is part of the successful replacement, never a deployment/read side effect.
    await client.query("DELETE FROM resumes WHERE user_id = $1 AND id <> $2", [userId, row.id]);
    await client.query("COMMIT");
    return toResume(row);
  } catch {
    discard = true;
    if (client) await client.query("ROLLBACK").catch(() => {});
    throw new Error("Resume save failed or its outcome is uncertain. Refresh before retrying.");
  } finally {
    client?.release(discard);
  }
}
