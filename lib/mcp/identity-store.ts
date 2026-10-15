import "server-only";

import type { Pool, PoolClient } from "pg";
import { isVerifiedExternalIdentity, type VerifiedExternalIdentity } from "./auth0-auth";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function validateWebsiteUserId(userId: string) {
  if (!UUID.test(userId)) throw new Error("A trusted website identity is required.");
}

function validateIdentity(identity: VerifiedExternalIdentity) {
  if (
    !isVerifiedExternalIdentity(identity) ||
    typeof identity.issuer !== "string" ||
    typeof identity.subject !== "string" ||
    identity.issuer.length > 2048 ||
    identity.subject.length > 255 ||
    identity.issuer !== identity.issuer.trim() ||
    identity.subject !== identity.subject.trim() ||
    !identity.subject ||
    /[\x00-\x1f\x7f]/.test(identity.subject)
  ) throw new Error("A verified external identity is required.");

  let issuer: URL;
  try { issuer = new URL(identity.issuer); }
  catch { throw new Error("A verified external identity is required."); }
  if (issuer.protocol !== "https:" || issuer.pathname !== "/" || issuer.search || issuer.hash || issuer.username || issuer.password) {
    throw new Error("A verified external identity is required.");
  }
}

async function transaction<T>(db: Pick<Pool, "connect">, operation: (client: PoolClient) => Promise<T>) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout='5s'");
    await client.query("SET LOCAL statement_timeout='15s'");
    const result = await operation(client);
    await client.query("COMMIT");
    return result;
  } catch {
    await client.query("ROLLBACK").catch(() => {});
    throw new Error("External identity operation failed.");
  } finally {
    client.release();
  }
}

export function createExternalIdentityStore(db: Pick<Pool, "query" | "connect">) {
  return {
    async status(websiteUserId: string): Promise<{ linked: boolean }> {
      validateWebsiteUserId(websiteUserId);
      try {
        const result = await db.query(
          "SELECT 1 FROM public.external_identities WHERE user_id=$1::uuid LIMIT 1",
          [websiteUserId],
        );
        return { linked: result.rowCount === 1 };
      } catch {
        throw new Error("External identity lookup failed.");
      }
    },

    /** `websiteUserId` must come from the authenticated website session and
     * `identity` from signature/issuer/audience-verified interactive OAuth.
     * Neither value may be accepted from a request body. */
    async link(websiteUserId: string, identity: VerifiedExternalIdentity, sessionId?: string) {
      validateWebsiteUserId(websiteUserId);
      validateIdentity(identity);
      if (sessionId !== undefined && !UUID.test(sessionId)) throw new Error("Authenticated website session required.");
      return transaction(db, async (client) => {
        const owner = await client.query("SELECT id FROM public.users WHERE id=$1::uuid FOR UPDATE", [websiteUserId]);
        if (owner.rowCount !== 1) throw new Error("Account unavailable.");
        // Lock through commit so logout cannot revoke the session between this
        // final check and the identity write following a slow OAuth exchange.
        if (sessionId !== undefined) {
          const session = await client.query(`SELECT id FROM public.sessions
            WHERE id=$1::uuid AND user_id=$2::uuid AND expires_at>clock_timestamp()
            FOR UPDATE`, [sessionId, websiteUserId]);
          if (session.rowCount !== 1) throw new Error("Session unavailable.");
        }
        const inserted = await client.query<{ user_id: string }>(`INSERT INTO public.external_identities(user_id,issuer,subject)
          VALUES ($1::uuid,$2,$3)
          ON CONFLICT (issuer,subject) DO UPDATE SET subject=EXCLUDED.subject
            WHERE external_identities.user_id=EXCLUDED.user_id
          RETURNING user_id`, [websiteUserId, identity.issuer, identity.subject]);
        if (inserted.rowCount !== 1 || inserted.rows[0].user_id !== websiteUserId) {
          throw new Error("Identity already linked.");
        }
        return { linked: true as const };
      });
    },

    async resolve(identity: VerifiedExternalIdentity): Promise<string | null> {
      validateIdentity(identity);
      try {
        const result = await db.query<{ user_id: string }>(
          "SELECT user_id FROM public.external_identities WHERE issuer=$1 AND subject=$2 LIMIT 1",
          [identity.issuer, identity.subject],
        );
        return result.rows[0]?.user_id ?? null;
      } catch {
        throw new Error("External identity lookup failed.");
      }
    },

    async unlink(websiteUserId: string, identity: VerifiedExternalIdentity): Promise<boolean> {
      validateWebsiteUserId(websiteUserId);
      validateIdentity(identity);
      try {
        const result = await db.query(
          "DELETE FROM public.external_identities WHERE user_id=$1::uuid AND issuer=$2 AND subject=$3",
          [websiteUserId, identity.issuer, identity.subject],
        );
        return result.rowCount === 1;
      } catch {
        throw new Error("External identity operation failed.");
      }
    },
  };
}
