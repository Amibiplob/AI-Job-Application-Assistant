# SaaS monetization Phase 1

This document records the Phase 1 foundation at commit `2f3c607`. The current
website policy and enforcement are described in [Phase 2](saas-monetization-phase-2.md),
which supersedes the original admission limits and attempt-counting guidance below.

This phase adds internal subscription, usage and billing-event foundations. No
payments, webhooks, checkout, pricing UI, authentication changes or automatic
database migration are included. Existing website actions and MCP tools do not
yet consume quotas; enabling enforcement is a separate integration step.

## Architecture audit

The repository uses `pg` and handwritten SQL, not an ORM. Migrations 001–003
define UUID-owned users, resumes, applications and sessions, shared public jobs,
and bounded abuse-rate-limit buckets. `scripts/migrate.mjs` records filenames in
`schema_migrations` and runs each unapplied SQL file in its own transaction.
Nothing runs migrations during application startup or build.

Website authentication (`lib/auth.ts`) verifies an opaque session cookie against
PostgreSQL and resolves `users.id`; passwords use Argon2id. Existing server
actions scope private data to `getCurrentUser()`. These flows are unchanged.

Remote `/api/mcp` verifies Auth0 RS256 JWT issuer, audience, expiry and
`jobs:read` permissions. `extra.rateLimitSubject` comes from a verified `sub`,
but there is **no account-linking table or verified mapping to `users.id`**.
Neither an Auth0 subject, OAuth client ID, supplied UUID nor email is a safe
website subscription identity. Remote MCP quota integration must first design
an explicit verified account-linking flow. The current Auth0 verifier and tool
admission remain unchanged. Local stdio MCP has no end-user authentication and
must not receive a shared user's subscription or be treated as Free by default.
Remote tools are `search_jobs`, `get_job_details` and `analyze_job_match`; stdio
registers only the two public job tools. Existing abuse protection remains
independent of monthly monetization quotas.

## Schema and manual rollout

`004_subscription_entitlements.sql` adds one optional entitlement per website
user and a provider/event-ID billing ledger. `005_monthly_usage.sql` adds a
counter keyed by user, metric and UTC calendar month. Existing rows, constraints,
sessions and authentication columns are untouched; no user backfill is required.
Users without an entitlement row receive Free. Missing users and database errors
fail closed, rather than masquerading as Free or unlimited Pro.

Apply these files using the existing migration runner only during a separately
authorized operator rollout (`pnpm db:migrate`), before importing these helpers
into live request flows. **They were not applied to the application database as
part of this implementation.** Existing code works with the prior schema because
no live request path imports the new helpers. The helpers require both new
migrations; missing tables produce generic errors. Rollback of application code
can leave these additive tables in place. Do not automatically drop usage or
event records, as that loses accounting and deduplication history.

Subscription and usage rows cascade on user deletion. The manual deletion
utility now explicitly locks, validates and counts these approved tables when
present, while continuing to support the earlier schema. Extra dependencies,
RLS, disabled FK enforcement, triggers and unexpected structures still stop it.
`billing_events` has no user association or raw payload and survives deletion to
retain provider event deduplication. Its retention period must be decided before
a future billing integration; pruning it permits previously seen events to run
again. No pruning job or retention claim is introduced here.

## Entitlement and usage policy

`lib/monetization/current-user.ts` is the website entry point. It imports
`server-only` and calls the existing `getCurrentUser()` for every operation:

- `getCurrentUserEntitlement()` returns the effective plan and monthly limits.
- `requireCurrentUserPro()` rejects Free and unauthenticated accounts.
- `getCurrentUserMonthlyUsage('job_analysis')` reads usage without reserving it.
- `consumeCurrentUserMonthlyUsage('job_analysis')` atomically admits one unit.

These are ordinary server helpers, not exported Server Actions or HTTP routes.
Callers cannot supply a user ID, plan, clock or quota override. A future action
must validate its work first, call consumption before expensive work, and stop
when `allowed` is false. Admission counts attempts; there is no refund or
request-ID deduplication. Do not automatically retry an uncertain commit: the
unit may already have been consumed.

`lib/monetization/store.ts` is an internal server-only DAL with dependency
injection for tests. It accepts only trusted, server-resolved user UUIDs; it
does not authenticate callers. Never expose its account-ID methods directly to
tool input or request parameters. Its billing callback is also an internal API.

Pro requires stored `plan='pro'`, status `active` or `trialing`, and a period
containing the database's current time (inclusive start, exclusive end).
Inactive, expired, future, past-due, unpaid, paused and canceled subscriptions
resolve to Free. `cancel_at_period_end=true` leaves an active subscription Pro
until its period ends; already `canceled` subscriptions are Free.

The initial internal policy grants 10 job-analysis admissions per month on Free
and 200 on Pro. These values are explicit provisional policy, not published
pricing. There is no unlimited tier or client-controlled limit. Only
`job_analysis` is metered in this phase. Counters reset by entering a new UTC
month, not by deletion or a provider billing cycle. Upgrades and downgrades
retain the current month's counter; a downgraded account already above Free's
limit is denied until the next month or another upgrade.

Consumption uses a dedicated transaction, locks the owning user row, reads the
current entitlement, and conditionally upserts the counter. The upsert's limit
predicate prevents overspending even with concurrent instances. A denial does
not increment or touch the counter. All entitlement writers must take the same
user lock before mutation so plan changes serialize with admissions. Returned
month/reset boundaries use PostgreSQL's clock in UTC, regardless of server or
client timezone. PostgreSQL failures are redacted and never grant access.
The application role needs SELECT on entitlements and usage, INSERT/UPDATE on
usage, and the permission on users required by `SELECT ... FOR UPDATE` (as with
the existing resume owner lock). A future billing writer separately needs
INSERT on the event ledger and entitlement mutation privileges. This phase does
not grant database privileges automatically.

## Billing event foundation

`withBillingEvent(provider, eventId, apply)` inserts a unique provider/event key
and runs its callback using the same PostgreSQL transaction. Concurrent duplicate
events execute the callback once; failures roll back both ledger and effects,
allowing a later retry. The callback must use the supplied connection, acquire
the owning user lock before changing entitlements, and perform no external side
effects. The ledger stores only provider, event ID and processing timestamp.

This helper does not verify provider signatures, authenticate events, associate
customers with users, handle out-of-order events, or integrate a payment service.
Those checks must precede this API in a future verified billing adapter. There
is intentionally no endpoint or public method for granting Pro.

## Verification

`tests/monetization.test.mjs` creates a fresh private PostgreSQL cluster under
`/tmp` with TCP disabled and synthetic records. It never loads dotenv or uses
`DATABASE_URL`. Set `ACCOUNT_DELETION_TEST_POSTGRES_BIN` if the PostgreSQL 16
server binaries are outside `/usr/lib/postgresql/16/bin`.

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build --webpack
git diff --check
```

Coverage includes additive migration rollback and preservation of existing
users/sessions/resumes, status and period checks, UTC accounting, concurrent
admission, tenant isolation, upgrade/downgrade counters, invalid inputs, session
wrapper behavior, transaction failures and uncertain commits, concurrent billing
deduplication and rollback, database constraints, and reviewed account deletion.
Build verification should use synthetic configuration; no live DB is needed.

Verified on 2026-10-14: all 156 repository tests passed, including 11 new
monetization tests; TypeScript, repository ESLint, production webpack build and
diff whitespace checks passed. PostgreSQL tests used disposable private clusters
and the production build used synthetic database/Auth0 settings. Local PostgreSQL
sockets and the build required execution outside sandbox process restrictions.
No application database migrations or payment-provider calls were performed.
