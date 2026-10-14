-- UTC calendar months, independent of a subscription's provider billing cycle.
CREATE TABLE monthly_usage (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  metric TEXT NOT NULL CHECK (metric IN ('job_analysis')),
  month_start DATE NOT NULL CHECK (EXTRACT(DAY FROM month_start) = 1),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, metric, month_start)
);
