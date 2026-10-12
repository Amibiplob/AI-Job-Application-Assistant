import "server-only";

import { headers } from "next/headers";
import { pool } from "@/lib/db/pool";
import { checkLimits, createLimiter, trustedSource, type Decision } from "@/lib/rate-limit";

export const limiter = createLimiter(async (sql, values) =>
  pool.query(sql, values),
);

export async function protectAuth(flow: "login" | "signup", email: string): Promise<Decision> {
  return checkLimits(limiter, [
    ["auth_global", "all"],
    [`${flow}_source`, trustedSource(await headers())],
    [`${flow}_account`, email],
  ]);
}
