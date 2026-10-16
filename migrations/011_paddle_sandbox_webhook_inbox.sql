-- Durable sandbox ingress only; no user FK, raw payload, entitlement grant or backfill.
CREATE TABLE paddle_sandbox_webhook_inbox (
  event_id TEXT PRIMARY KEY CHECK (event_id ~ '^evt_[a-z0-9]{26}$'),
  event_type TEXT NOT NULL CHECK (length(event_type) BETWEEN 1 AND 100),
  occurred_at TIMESTAMPTZ NOT NULL,
  data_id TEXT NOT NULL CHECK (length(data_id) <= 100),
  subscription_hint TEXT CHECK (subscription_hint ~ '^sub_[a-z0-9]{26}$'),
  transaction_hint TEXT CHECK (transaction_hint ~ '^txn_[a-z0-9]{26}$'),
  intent_hint UUID,
  fingerprint TEXT NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  state TEXT NOT NULL CHECK (state IN ('pending','processing','done','ignored','failed')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token UUID,
  lease_until TIMESTAMPTZ,
  last_error TEXT CHECK (last_error IN ('processing_failed','lease_expired')),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  CHECK ((state='processing') = (lease_token IS NOT NULL)),
  CHECK ((state='processing') = (lease_until IS NOT NULL)),
  CHECK ((state IN ('done','ignored','failed')) = (finished_at IS NOT NULL))
);
CREATE INDEX paddle_sandbox_webhook_due_idx
  ON paddle_sandbox_webhook_inbox(next_attempt_at,event_id) WHERE state='pending';
CREATE INDEX paddle_sandbox_webhook_lease_idx
  ON paddle_sandbox_webhook_inbox(lease_until,event_id) WHERE state='processing';
