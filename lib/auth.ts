import "server-only";

import { randomUUID } from "node:crypto";
import * as argon2 from "argon2";
import { cookies } from "next/headers";
import { pool } from "@/lib/db/pool";

const SESSION_COOKIE_NAME = "session";
const SESSION_DURATION_SECONDS = 60 * 60 * 24 * 7;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SessionRow = {
  id: string;
  user_id: string;
  expires_at: Date;
};

type CurrentUserRow = {
  id: string;
  email: string;
  name: string | null;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: Date;
};

export type CurrentUser = {
  id: string;
  email: string;
  name: string | null;
};

export async function hashPassword(password: string): Promise<string> {
  if (Buffer.byteLength(password, "utf8") > 1024) {
    throw new Error("Password must be 1024 bytes or fewer.");
  }

  return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!hash.startsWith("$argon2id$") || Buffer.byteLength(password, "utf8") > 1024) {
    return false;
  }

  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

export async function createSession(userId: string): Promise<void> {
  if (!UUID_PATTERN.test(userId)) {
    throw new Error("A valid user ID is required to create a session.");
  }

  // Cookie writes must be initiated from a Server Action or Route Handler.
  const cookieStore = await cookies();
  const sessionId = randomUUID();
  const expiresAt = new Date(Date.now() + SESSION_DURATION_SECONDS * 1000);

  await pool.query(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES ($1, $2, $3)",
    [sessionId, userId, expiresAt],
  );

  try {
    cookieStore.set(SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: process.env["NODE_ENV"] === "production",
      sameSite: "lax",
      path: "/",
      expires: expiresAt,
      maxAge: SESSION_DURATION_SECONDS,
    });
  } catch (error) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]).catch(() => {});
    throw error;
  }
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!sessionId || !UUID_PATTERN.test(sessionId)) {
    return null;
  }

  const result = await pool.query<SessionRow>(
    `SELECT id, user_id, expires_at
     FROM sessions
     WHERE id = $1 AND expires_at > now()
     LIMIT 1`,
    [sessionId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    userId: row.user_id,
    expiresAt: row.expires_at,
  };
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session) {
    return null;
  }

  const result = await pool.query<CurrentUserRow>(
    "SELECT id, email, name FROM users WHERE id = $1 LIMIT 1",
    [session.userId],
  );

  return result.rows[0] ?? null;
}

export async function deleteSession(): Promise<void> {
  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (sessionId && UUID_PATTERN.test(sessionId)) {
    await pool.query("DELETE FROM sessions WHERE id = $1", [sessionId]);
  }

  cookieStore.delete(SESSION_COOKIE_NAME);
}
