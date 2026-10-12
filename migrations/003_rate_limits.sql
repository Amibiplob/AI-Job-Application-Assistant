CREATE TABLE abuse_rate_limits (
  policy TEXT NOT NULL CHECK (policy IN (
    'auth_global', 'login_source', 'login_account', 'signup_source', 'signup_account',
    'mcp_global', 'mcp_source', 'mcp_identity', 'mcp_jobs', 'mcp_analysis'
  )),
  bucket INTEGER NOT NULL CHECK (bucket >= 0 AND bucket < 65536),
  attempts INTEGER NOT NULL CHECK (attempts BETWEEN 1 AND 1000001),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (policy, bucket)
);

-- Rows are reused, never added per window or per arbitrary identity. Hard cap:
-- ten policies * 65536 buckets, with only two global buckets actually used.
