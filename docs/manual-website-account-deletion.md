# Manual website account deletion — closed beta

This is an operator procedure, not a public endpoint. It removes one website
account from the connected PostgreSQL database. It does **not** establish that
all personal information has been erased. No retention period is defined here.

## Authorization and target verification

- Restrict this script, the operator machine, and database credentials to
  authorized operators. Possession of a UUID is not authorization.
- Verify the requester using an approved identity-verification procedure and
  confirm whether they request website deletion, Auth0/MCP deletion, or both.
  The operator must approve the verification procedure before processing real
  requests. Do not request passwords, session cookies, OAuth tokens, or a full
  resume through email.
- Resolve the exact internal website user UUID in an authorized administrative
  workflow. Do not delete by email or infer an Auth0 identity from matching email.
- Offer an approved secure data-access/export procedure if requested, before
  deletion. This tooling does not implement export or identity verification.
- Independently verify the host, database, environment and approved request.
  Database names can be identical across environments; the name check alone
  does not establish that the connection is correct.

## Connection and dry-run

Supply `ACCOUNT_DELETION_DATABASE_URL` through your approved secret mechanism.
The script does not load `.env` and never falls back to `DATABASE_URL`. Do not put
connection strings in command arguments, documentation, shell history or logs.
Use verified TLS for a remote database through the operator connection settings.
Use an operator database role with SELECT on the five reviewed public tables and
DELETE on users, resumes, applications and sessions (needed for deletion locks).
After the Phase 1 monetization migrations, also grant SELECT and DELETE on
`subscription_entitlements` and `monthly_usage` for their counts and locks.
The tool does not provision credentials or grant permissions. Do not make this
role available to customers or route handlers; no superuser is required.

Run directly from the repository with Node's TypeScript support:

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/delete-website-account.mjs --user-id EXACT_INTERNAL_UUID --database-name EXACT_DATABASE_NAME --dry-run
```

Replace the uppercase placeholders with reviewed values. UUIDs must use exact
canonical lowercase form. Dry-run checks the live schema and returns only counts
for that user: users, resumes, applications and sessions. When present,
`subscription_entitlements` and `monthly_usage` are also included in the counts
and reviewed cascade graph. It uses a read-only transaction and rolls back.
It never selects or prints email, resume text, notes,
password hashes, or session IDs. Counts are a snapshot, not a promise that data
will remain unchanged before a later deletion. Review all counts, including older
resume records and expired sessions.

## Confirmed deletion

Only after reviewing the dry-run and authorization, execute:

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/delete-website-account.mjs --user-id EXACT_INTERNAL_UUID --database-name EXACT_DATABASE_NAME --delete --confirm EXACT_INTERNAL_UUID
```

The confirmation must exactly match the target UUID. Missing, repeated, unknown,
or contradictory options fail closed before connecting. There is no default
mode. Deletion rechecks the schema in the same transaction as the DELETE; it
does not rely on a previous dry-run.

The utility expects ordinary public tables, UUID primary/owner keys, no row
security, inheritance, user-defined triggers or rules, and exactly the reviewed
foreign-key graph: resumes, sessions and applications reference users with
validated, immediate ON DELETE CASCADE constraints; applications references jobs
with NO ACTION. Additional incoming/outgoing foreign keys, disabled constraint
triggers, or changed constraints stop execution. Do not bypass a refusal:
investigate schema changes and update the reviewed tooling/tests first.

The approved optional monetization tables reference users with the same validated,
immediate ON DELETE CASCADE constraints. They have reviewed primary keys
(`user_id` and `user_id,metric,month_start`) and receive the same table-safety
checks. The utility still supports the pre-monetization schema.

Deletion briefly blocks writes to the personal-data tables, including the two
optional monetization tables when present, while checking
the schema and removing the account. Lock and statement timeouts bound waiting;
schedule during low traffic and retry safely if busy. Shared jobs are only read
and locked against incompatible schema changes. A single parameterized DELETE
targets the exact user; cascading children and post-delete zero counts are checked
before commit. An already-absent user returns `not-found`, not a claim that a new
deletion occurred.

## Results, failures and sessions

- Success reports `website-database-deleted` and the pre-deletion counts.
- Run dry-run afterward; the selected user and every reported dependent category
  must be zero. Record minimal request reference, operator, time, database scope
  and outcome in the approved restricted request register; do not copy deleted
  data into audit logs. Set register retention separately through policy.
- All database sessions for this user are removed. Existing browser cookies
  may remain until expiry, but the website session lookup will reject them.
  An already completed/in-flight request or open browser can retain previously
  delivered data; do not promise to remotely erase browser memory.
- SQL failures are rolled back and raw database errors are not printed. If the
  connection fails during commit, its outcome may be unknown: independently run
  dry-run before retrying or notifying the requester. Never report completion
  merely because an attempted command was issued.
- Website database operations and provider operations are not one transaction.
  Track each scope separately, retry partial failures, and communicate exactly
  what was completed and what remains.

## Separate retained copies

- **Billing deduplication:** The minimal `billing_events` provider/event-ID ledger
  has no user foreign key and remains after website account deletion. It contains
  no raw payload, email or tokens. Provider records and retention of the ledger
  require separate handling before a future payment integration. See
  [SaaS monetization Phase 1](saas-monetization-phase-1.md).
- **Auth0/MCP:** Use a separately authorized Auth0 process for the exact verified
  Auth0 identity, grants, refresh tokens, sessions and relevant provider records.
  This utility neither accesses nor deletes them. The MCP validates signed JWTs
  locally: deleting the website account does not revoke MCP access, and issued
  access tokens may remain usable until expiry. Verify the tenant's actual
  revocation and token-lifetime behavior before making an access-termination claim.
- **ChatGPT:** Chat history and connector records are separate. Give the requester
  accurate instructions for their ChatGPT account; website deletion cannot erase
  them. MCP analysis has no intentional website database persistence, but that
  does not prove no provider copies exist.
- **Backups, branches and exports:** Inventory database backups, PITR history,
  snapshots, test branches, exports and copied datasets. Verify actual expiry and
  restrictions. Keep removed data out of active use and reapply approved deletion
  records before a restored database becomes accessible. Do not create a new
  full-data backup per deletion. Define durations only after policy approval.
- **Logs and support:** Hosting/database/Auth0 logs, support messages and request
  records require separate handling, permissions and an approved retention policy.

## Isolated verification

`tests/account-deletion.test.mjs` initializes a disposable PostgreSQL cluster in a
private temporary directory, disables TCP, loads repository migrations, and uses
synthetic users only. It never reads `DATABASE_URL` or an external test URL.
PostgreSQL server binaries must be available locally; an optional
`ACCOUNT_DELETION_TEST_POSTGRES_BIN` points to their directory. Tests fail rather
than fall back to a production database if binaries are unavailable.

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/account-deletion.test.mjs
```

Do not run automated fixtures against the application database. This procedure
must be verified on synthetic data before the first authorized live request.
Publishing a privacy notice/contact and defining retention remain separate work.
