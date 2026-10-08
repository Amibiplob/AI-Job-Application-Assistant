"use server";

import { redirect } from "next/navigation";
import { createSession, verifyPassword } from "@/lib/auth";
import { pool } from "@/lib/db/pool";

type LoginField = "email" | "password";

export type LoginState = {
  errors?: Partial<Record<LoginField, string>>;
  message?: string;
  email?: string;
};

type LoginUser = {
  id: string;
  password_hash: string | null;
};

function readText(formData: FormData, field: string): string {
  const value = formData.get(field);
  return typeof value === "string" ? value : "";
}

export async function login(
  _previousState: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = readText(formData, "email").trim().toLowerCase();
  const password = readText(formData, "password");
  const errors: Partial<Record<LoginField, string>> = {};

  if (!email) {
    errors.email = "Enter your email address.";
  } else if (
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    errors.email = "Enter a valid email address.";
  }

  if (!password) {
    errors.password = "Enter your password.";
  } else if (Buffer.byteLength(password, "utf8") > 1024) {
    errors.password = "Password must be 1024 bytes or fewer.";
  }

  if (Object.keys(errors).length > 0) {
    return { errors, email };
  }

  let userId: string | undefined;

  try {
    const result = await pool.query<LoginUser>(
      "SELECT id, password_hash FROM users WHERE email = $1 LIMIT 1",
      [email],
    );
    const user = result.rows[0];

    if (user?.password_hash && (await verifyPassword(password, user.password_hash))) {
      userId = user.id;
    }
  } catch {
    return { message: "Unable to sign in right now. Please try again.", email };
  }

  if (!userId) {
    return { message: "Invalid email or password.", email };
  }

  try {
    await createSession(userId);
  } catch {
    return { message: "Unable to sign in right now. Please try again.", email };
  }

  redirect("/dashboard");
}
