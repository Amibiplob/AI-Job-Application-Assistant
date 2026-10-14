-- Apply explicitly with the migration runner after review. Application startup
-- never runs migrations automatically.
CREATE TABLE external_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT external_identities_issuer_format CHECK (
    issuer = btrim(issuer) AND length(issuer) BETWEEN 12 AND 2048
    AND issuer LIKE 'https://%/'
  ),
  CONSTRAINT external_identities_subject_format CHECK (
    subject = btrim(subject) AND length(subject) BETWEEN 1 AND 255
    AND subject !~ '[[:cntrl:]]'
  ),
  CONSTRAINT external_identities_issuer_subject_key UNIQUE (issuer, subject),
  CONSTRAINT external_identities_user_issuer_key UNIQUE (user_id, issuer)
);

CREATE INDEX external_identities_user_id_idx ON external_identities(user_id);
