-- Apply explicitly after migrations 004-006. Application startup never runs
-- migrations automatically. Rows contain short-lived OAuth protocol secrets.
CREATE TABLE account_link_transactions (
  state_hash BYTEA PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Callback consumption independently requires this exact session to remain
  -- live. Avoiding a session FK preserves the reviewed cleanup dependency graph.
  session_id UUID NOT NULL,
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT account_link_state_hash_length CHECK (octet_length(state_hash) = 32),
  CONSTRAINT account_link_code_verifier_format CHECK (
    length(code_verifier) BETWEEN 43 AND 128
    AND code_verifier ~ '^[A-Za-z0-9._~-]+$'
  ),
  CONSTRAINT account_link_nonce_format CHECK (
    length(nonce) BETWEEN 32 AND 128
    AND nonce ~ '^[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT account_link_expiry CHECK (expires_at > created_at)
);

CREATE INDEX account_link_transactions_expires_at_idx
  ON account_link_transactions(expires_at);
CREATE INDEX account_link_transactions_user_id_idx
  ON account_link_transactions(user_id);
