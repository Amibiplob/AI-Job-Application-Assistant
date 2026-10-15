-- Sandbox-only reconciliation metadata. No entitlement writes or backfill.
ALTER TABLE paddle_sandbox_accounts
  ADD COLUMN verified_payment_id TEXT CHECK (verified_payment_id ~ '^txn_[a-z0-9]{26}$'),
  ADD COLUMN payment_revoked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN reconcile_attempts INTEGER NOT NULL DEFAULT 0 CHECK (reconcile_attempts BETWEEN 0 AND 3),
  ADD COLUMN next_reconcile_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN last_reconcile_result TEXT CHECK (last_reconcile_result IN ('ok','retry','exhausted'));

CREATE INDEX paddle_sandbox_accounts_due_idx ON paddle_sandbox_accounts(next_reconcile_at)
  WHERE reconcile_attempts < 3 AND transaction_id IS NOT NULL;
