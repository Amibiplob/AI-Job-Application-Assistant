"use server";

import { redirect } from "next/navigation";
import { createSession, hashPassword } from "@/lib/auth";
import { pool } from "@/lib/db/pool";

type SignupField = "name" | "email" | "password" | "confirmPassword";

export type SignupState = {
  errors?: Partial<Record<SignupField, string>>;
  message?: string;
  values?: {
    name: string;
    email: string;
  };
};

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

function isDuplicateEmail(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505" &&
    (!("constraint" in error) || error.constraint === "users_email_key")
  );
}

export async function signup(
  _previousState: SignupState,
  formData: FormData,
): Promise<SignupState> {
  const name = readText(formData, "name").trim();
  const email = readText(formData, "email").trim().toLowerCase();
  const password = readText(formData, "password");
  const confirmPassword = readText(formData, "confirmPassword");
  const errors: Partial<Record<SignupField, string>> = {};

  if (!name) {
    errors.name = "Enter your name.";
  } else if (name.length > 100) {
    errors.name = "Name must be 100 characters or fewer.";
  }

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Enter a password.";
  } else if ([...password].length < 8) {
    errors.password = "Use at least 8 characters for your password.";
  } else if (Buffer.byteLength(password, "utf8") > 1024) {
    errors.password = "Password must be 1024 bytes or fewer.";
  }

  if (!confirmPassword) {
    errors.confirmPassword = "Confirm your password.";
  } else if (password !== confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, values: { name, email } };
  }

  const existingUser = await pool.query("SELECT 1 FROM users WHERE email = $1 LIMIT 1", [email]);
  if (existingUser.rowCount) {
    return {
      errors: { email: "An account with this email already exists." },
      values: { name, email },
    };
  }

  let createdUserId: string | undefined;

  try {
    const passwordHash = await hashPassword(password);
    const result = await pool.query<{ id: string }>(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [name, email, passwordHash],
    );

    createdUserId = result.rows[0]?.id;
    if (!createdUserId) {
      return { message: "We could not create your account. Please try again." };
    }

    await createSession(createdUserId);
  } catch (error) {
    if (createdUserId) {
      await pool.query("DELETE FROM users WHERE id = $1", [createdUserId]).catch(() => {});
    }

    if (isDuplicateEmail(error)) {
      return {
        errors: { email: "An account with this email already exists." },
        values: { name, email },
      };
    }

    return { message: "We could not create your account. Please try again." };
  }

  redirect("/dashboard");
}
