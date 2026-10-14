-- Additive foundation only: existing users implicitly remain Free. The migration
-- runner wraps each file in a transaction; no authentication tables are changed.
CREATE TABLE subscription_entitlements (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free', 'pro')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN (
    'inactive', 'active', 'trialing', 'past_due', 'canceled', 'unpaid', 'paused', 'expired'
  )),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK ((current_period_start IS NULL) = (current_period_end IS NULL)),
  CHECK (current_period_end > current_period_start),
  CHECK (plan <> 'pro' OR status NOT IN ('active', 'trialing') OR current_period_end IS NOT NULL)
);

-- Minimal provider-neutral ledger: no tokens, raw payloads, email or user FK.
-- A successful insert and its eventual entitlement mutation must commit together.
CREATE TABLE billing_events (
  provider TEXT NOT NULL CHECK (length(provider) BETWEEN 1 AND 64),
  event_id TEXT NOT NULL CHECK (length(event_id) BETWEEN 1 AND 255),
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);
