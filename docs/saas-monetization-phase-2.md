# SaaS monetization Phase 2

Website resume matching now shares a monthly allowance of **3 successful
matches for Free** and **100 for Pro**, measured in UTC calendar months. No
payments, checkout, webhooks, account linking or MCP quota enforcement are added.

## Audit and entry points

The audited baseline is `2f3c607`. PostgreSQL access uses `pg`, parameterized
SQL, a shared server-only pool, and dedicated connections for transactions.
Phase 1 migrations 004 and 005 already define subscription entitlements and
monthly usage. Users without an entitlement row are Free. Pro still requires an
active or trialing entitlement within its stored period; authentication and
subscription status rules are unchanged.

The website has two real authenticated matching Server Actions:

| Entry point | Existing operation | Quota |
| --- | --- | --- |
| `/dashboard/jobs/[jobId]`, `matchJobWithResume` | Compares the session-owned saved resume with a database job description | Shared `job_analysis` counter |
| `/dashboard/analyze`, `analyzeJobDescription` | Compares the session-owned saved resume with a validated pasted description | Shared `job_analysis` counter |

Both use the existing deterministic dictionary matcher in `lib/job-matching.ts`.
There is no website matching API route. Both actions verify `getCurrentUser()`
before data reads; `getResume()` independently scopes its query to the existing
PostgreSQL session. No caller can select another user's resume. The quota wrapper
also derives the account from `getCurrentUser()`; it accepts no client user ID,
plan, limit or period. The previous action state is not trusted for admission.
Direct Server Action POSTs execute these same checks, regardless of form controls.
No endpoint has been invented and no matching work is performed during page reads.

Remote `/api/mcp` remains Auth0-authenticated and uses its existing abuse limiter.
Its `analyze_job_match` tool consumes caller-supplied text, with no verified
mapping to website user UUIDs. Local stdio has no end-user identity. All MCP
handlers, tool registration, auth, and stdio files remain unchanged. Paid-user
MCP enforcement remains blocked on verified account linking.

## Accounting and failures

`runWithCurrentUserMonthlyUsage` calls the new transactional
`runWithMonthlyUsage` store helper. It reuses Phase 1's atomic admission SQL and
owner-row lock rather than doing a read-then-increment check. The operation:

1. Validates the action's input and loads its existing job/resume data.
2. Starts a dedicated PostgreSQL transaction, with bounded SQL/lock waits.
3. Locks the owning user, reads the current entitlement and UTC month, and
   conditionally increments usage by one within the plan limit.
4. Returns denial without running matching if no unit is available.
5. Runs the local deterministic matching callback and commits its unit only
   after the callback completes successfully.

The owner lock is held through computation and commit, so concurrent calls to
either action share exactly one allowance. Entitlement writers must continue to
take this same lock. Each comparison belongs to the UTC month selected at
admission, after acquiring the owner lock; finishing across midnight does not
transfer its charge to another month. Callbacks are internal server code and must remain short;
they must not perform external side effects or use another connection to acquire
the same user's lock. Stored resume and job reads retain their existing access
patterns and do not introduce writes to matching inputs.

Invalid input, missing jobs/resumes, empty resumes, missing/blank saved job
descriptions, and read failures are excluded before admission. A matching
exception or confirmed failure before COMMIT rolls back the increment. There is
no separate refund update, which would race with other requests or month changes.
Tests hold a failed in-flight reservation while concurrent callers queue, then
confirm that rollback permits exactly one of them to take the final unit.

A successful match means a completed comparison with committed accounting. Zero
overlap and nonempty descriptions with no recognized skills are still completed
comparisons and count. Match results and pasted text are not persisted. Repeated
successful comparisons count separately; there is no request-ID deduplication.

A connection failure during COMMIT can leave the outcome uncertain. The action
reports a generic failure and **does not blindly refund or automatically retry**;
the unit may have committed. Similarly, a committed comparison counts if the
browser loses the response or rendering later fails. Exactly-once delivery and
reconciliation of these cases would require a separate operation ledger, which
is not introduced here. Users can refresh the dashboard to inspect usage.

The legacy `consumeMonthlyUsage` helpers remain available for internal callers
but still count admissions, not successful work. Website matching uses only the
transactional callback helper. Existing counters are preserved, including any
internal Phase 1 admissions already recorded this month; no data is reset or
reclassified during rollout.

## Errors and dashboard

Both actions return `status: 'quota-exhausted'` and the same non-sensitive
message. Denied responses contain no match result or analysis. The pasted form
keeps the submitter's own input. Database, callback and connection errors retain
the actions' generic failure messages; raw errors and user identifiers are never
returned in quota responses.

The dashboard reads the authenticated user's usage alongside existing resume
and application summaries. The indicator shows Free/Pro, remaining allowance,
and the next reset date in UTC. A failed usage read displays unavailable, rather
than invented zero usage or unlimited allowance. Success/denial responses also
show the resulting usage in both matching forms. Successful operations invalidate
the dashboard page; a cache invalidation failure does not turn an already
committed comparison into an apparent matching failure. Other open tabs can
show an older snapshot until refreshed; server admission remains authoritative.

## Migration and rollout

**Phase 2 adds no SQL migrations.** It requires the already committed
`004_subscription_entitlements.sql` and `005_monthly_usage.sql` to have been
applied before rollout. If needed, the operator should use the existing manual
`pnpm db:migrate` process. No migration or production-data operation was run
as part of this work. There is no startup/build migration or hidden backfill.

Without the Phase 1 tables, matching fails closed with a generic error and the
dashboard shows usage unavailable. Apply prerequisites before enabling this code.
The application role needs SELECT on entitlements/usage, INSERT and UPDATE on
usage, and the existing owner-lock privilege on users. No database grants or
credentials are changed by the implementation. Account deletion retains its
reviewed Phase 1 cascades. There is no payment-backed process to grant Pro yet;
Pro remains an internal entitlement administered by trusted server operations.

## Verification

`tests/website-matching-quota.test.mjs` uses the actual auth, resume/job DAL,
website quota wrapper, both Server Actions and dashboard with a fresh synthetic
PostgreSQL cluster. Only Next request/cache context and controlled fault injection
are substituted. The tests never load `.env`, read `DATABASE_URL`, or connect to
an application database. The PostgreSQL cluster uses a private temporary Unix
socket with TCP disabled and a non-UTC database timezone.

Coverage includes shared Free/Pro budgets, concurrent calls through both actions,
forged inputs/state, per-user isolation, missing/malformed/expired/revoked sessions,
monthly resets, unchanged rows on exhaustion, skipped invalid/missing data,
rollback after matching failure, quota storage failures, pre-commit failure,
uncertain commit, cache invalidation failure, zero/unscored comparisons, dashboard
allowance and unavailable states. Phase 1 regression tests now use 3/100 and test
a failed reservation against competing requests.

Run the existing suite, TypeScript, lint, and webpack build:

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build --webpack
git diff --check
```

Set `ACCOUNT_DELETION_TEST_POSTGRES_BIN` for PostgreSQL 16 binaries installed in
a different directory. Build verification uses synthetic database and Auth0
settings; it does not need a live database or payment service.

Verified on 2026-10-14: all 168 repository tests passed, including the 11 new
website integration tests and concurrent failed-reservation regression.
TypeScript, repository ESLint, production webpack build and diff whitespace
checks passed. PostgreSQL tests used fresh local synthetic clusters, and the
build used synthetic configuration. No production migrations, production-data
changes or payment-provider calls were performed.
