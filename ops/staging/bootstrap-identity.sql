-- OPERATOR REVIEW ONLY. Not an application migration; never run against production.
-- On a fresh dedicated cluster/database, supply psql variables database, runtime_role,
-- staging_id. The provisioner owns the DB/schema/marker; runtime_role must not.
\set ON_ERROR_STOP on
BEGIN;
SELECT set_config('staging.expected_database', :'database', true),
       set_config('staging.runtime_role', :'runtime_role', true),
       set_config('staging.identity', :'staging_id', true);
DO $$
BEGIN
  IF current_database() <> current_setting('staging.expected_database')
    OR current_database() !~ '^paddle_sandbox_[a-z0-9_]{1,48}$'
    OR current_setting('staging.runtime_role') !~ '^paddle_staging_[a-z0-9_]{1,40}$'
    OR current_setting('staging.identity') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    OR EXISTS(SELECT 1 FROM pg_database WHERE datallowconn AND NOT datistemplate
      AND datname NOT IN(current_database(),'postgres')) THEN
    RAISE EXCEPTION 'isolated staging bootstrap rejected';
  END IF;
END $$;
CREATE SCHEMA staging_guard;
CREATE TABLE staging_guard.identity(singleton boolean PRIMARY KEY CHECK(singleton), identity uuid NOT NULL UNIQUE);
INSERT INTO staging_guard.identity VALUES(true, :'staging_id'::uuid);
REVOKE ALL ON SCHEMA staging_guard FROM PUBLIC;
REVOKE ALL ON staging_guard.identity FROM PUBLIC;
GRANT USAGE ON SCHEMA staging_guard TO :"runtime_role";
GRANT SELECT ON staging_guard.identity TO :"runtime_role";
COMMIT;
