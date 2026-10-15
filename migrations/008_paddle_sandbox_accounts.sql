-- Sandbox rehearsal only. Apply after 004-007; never applied at startup.
-- No entitlement backfill, triggers or mutation of subscription_entitlements.
CREATE TABLE paddle_sandbox_accounts (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  intent_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  transaction_id TEXT UNIQUE CHECK (transaction_id ~ '^txn_[a-z0-9]{26}$'),
  customer_id TEXT UNIQUE CHECK (customer_id ~ '^ctm_[a-z0-9]{26}$'),
  subscription_id TEXT UNIQUE CHECK (subscription_id ~ '^sub_[a-z0-9]{26}$'),
  checkout_state TEXT NOT NULL DEFAULT 'creating' CHECK (checkout_state IN ('creating','ready','linked')),
  subscription_status TEXT CHECK (subscription_status IN ('active','trialing','past_due','paused','canceled')),
  provider_updated_at TIMESTAMPTZ,
  last_event_at TIMESTAMPTZ,
  paid_start TIMESTAMPTZ,
  paid_through TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  reconciled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((paid_start IS NULL) = (paid_through IS NULL)),
  CHECK (paid_through > paid_start),
  CHECK (checkout_state='creating' OR transaction_id IS NOT NULL),
  CHECK (checkout_state<>'linked' OR (customer_id IS NOT NULL AND subscription_id IS NOT NULL))
);
-- Supports a future operator reconciliation sweep without retaining webhook PII.
CREATE INDEX paddle_sandbox_accounts_reconciled_at_idx ON paddle_sandbox_accounts(reconciled_at);
