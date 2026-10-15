import "server-only";

import { createHash, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TRANSACTION_SECONDS = 5 * 60;

export type PendingAccountLink = { codeVerifier: string; nonce: string };

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "ascii").digest();
}

function randomBase64Url(bytes: number): string {
  return randomBytes(bytes).toString("base64url");
}

function validSessionIdentity(userId: string, sessionId: string) {
  if (!UUID.test(userId) || !UUID.test(sessionId)) throw new Error("Authenticated website session required.");
}

export function createAccountLinkTransactionStore(db: Pick<Pool, "query">) {
  return {
    async create(userId: string, sessionId: string) {
      validSessionIdentity(userId, sessionId);
      const state = randomBase64Url(32);
      const codeVerifier = randomBase64Url(64);
      const nonce = randomBase64Url(32);
      try {
        const result = await db.query(`INSERT INTO public.account_link_transactions
          (state_hash,user_id,session_id,code_verifier,nonce,expires_at)
          SELECT $1,$2::uuid,$3::uuid,$4,$5,statement_timestamp()+make_interval(secs=>$6)
          FROM public.sessions s WHERE s.id=$3::uuid AND s.user_id=$2::uuid AND s.expires_at>statement_timestamp()
          RETURNING expires_at`, [digest(state), userId, sessionId, codeVerifier, nonce, TRANSACTION_SECONDS]);
        if (result.rowCount !== 1) throw new Error("Session unavailable.");
        return { state, codeVerifier, nonce, expiresAt: result.rows[0].expires_at as Date };
      } catch {
        throw new Error("Account linking is unavailable.");
      }
    },

    /** Delete-before-exchange makes every state one-use, including failed token
     * exchanges, and binds it to the same still-valid website session. */
    async consume(state: string, userId: string, sessionId: string): Promise<PendingAccountLink | null> {
      validSessionIdentity(userId, sessionId);
      if (!/^[A-Za-z0-9_-]{43}$/.test(state)) return null;
      try {
        const result = await db.query<{ code_verifier: string; nonce: string }>(`DELETE FROM public.account_link_transactions t
          USING public.sessions s
          WHERE t.state_hash=$1 AND t.user_id=$2::uuid AND t.session_id=$3::uuid
            AND t.expires_at>statement_timestamp()
            AND s.id=t.session_id AND s.user_id=t.user_id AND s.expires_at>statement_timestamp()
          RETURNING t.code_verifier,t.nonce`, [digest(state), userId, sessionId]);
        const row = result.rows[0];
        return row ? { codeVerifier: row.code_verifier, nonce: row.nonce } : null;
      } catch {
        throw new Error("Account linking is unavailable.");
      }
    },
  };
}
