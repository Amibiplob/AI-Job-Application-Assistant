-- Additive only; no backfill or grant. Apply in isolated staging after 009.
ALTER TABLE subscription_entitlements
  ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual', 'paddle_sandbox')),
  ADD COLUMN source_subscription_id TEXT,
  ADD CONSTRAINT entitlement_source_relationship CHECK (
    (source='manual' AND source_subscription_id IS NULL) OR
    (source='paddle_sandbox' AND source_subscription_id IS NOT NULL
      AND source_subscription_id ~ '^sub_[a-z0-9]{26}$')
  );
CREATE UNIQUE INDEX subscription_entitlements_sandbox_subscription_idx
  ON subscription_entitlements(source_subscription_id) WHERE source='paddle_sandbox';
