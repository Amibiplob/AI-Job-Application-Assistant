# Phase 7 release readiness — sandbox only

Baseline: `1345c83e97ef7e22857a27a32360e191298554ce`. Read together with the
[Phase 6 runbook](saas-monetization-phase-6.md). No production migration,
deployment, payment, data change, or push is authorized or performed.

## Release decision

**BLOCKED for paid access and real payments.** No real Paddle sandbox credentials
are available. The application still has **no Paddle entitlement writer** and no
activation flag. Setting checkout or reconciliation flags cannot activate Pro.
Only sandbox billing records and a clearly labeled access preview change.

| Verification | Status | Evidence / limit |
| --- | --- | --- |
| Migration 004–008 compatibility | PASS | Applied transactionally over seeded 001–003 in disposable PostgreSQL; users/sessions preserved; no entitlement backfill |
| New migration 009 | PASS | Applied only in disposable tests; retry constraint and cascade tested |
| Billing deduplication, concurrent delivery, rollback/retry | PASS | Real local PostgreSQL, synthetic Paddle responses |
| Signed raw webhook, forged signatures, stale/future replay | PASS | Signature verification gates actual database processing; committed IDs deduplicate |
| Checkout, creation, renewal, failure, cancellation, expiry | PASS | Mocked Paddle API plus real PostgreSQL; not payment-provider e2e |
| Refund approval, disputes, account isolation | PASS | API-adapter/policy tests plus refund lifecycle and forged-relationship database tests |
| Periodic reconciliation, retry exhaustion, concurrent workers | PASS | Real PostgreSQL, mocked Paddle API; disabled CLI guard tested |
| Free 3 / Pro 100 monthly quotas | PASS | Actual existing quota helper against isolated entitlement fixtures; downgrade retains usage |
| Genuine sandbox subscription activates actual Pro | BLOCKED | Missing credentials and verified provider lifecycle; no application grant path exists |
| Actual refund/failure/cancellation changes website entitlements | BLOCKED | Application grant/revocation writer intentionally absent; preview only |
| Configured worker against real Paddle | NOT TESTED | Requires sandbox credentials and isolated operator setup |
| Browser readiness | PASS | Isolated Chrome + synthetic session/DB fixtures; pricing, mobile width, login guard, disabled billing and checkout |
| Real Paddle checkout/browser lifecycle | NOT TESTED | No sandbox account credentials or configured HTTPS test destination |
| Auth0 / MCP behavior | PASS | Runtime code unchanged; linking and paid MCP quotas remain disabled |
| Initial unrestricted test run | FAIL | 224/225 passed; one existing quota concurrency transaction failed; isolated rerun recorded below |

Current verification on 2026-10-16 used Node 24.21.0 and freshly extracted
PostgreSQL 16.15 binaries under `/tmp/phase7-postgres/root`. All 29 top-level
test files were executed sequentially against disposable clusters. The first
unrestricted run passed 224 of 225 cases; the existing Free-budget concurrency
case in `monetization.test.mjs` failed with a redacted transaction error while
the production build was also running. The isolated rerun passed all 12 monetization cases. All 225 current cases
therefore have a verified pass, with the initial intermittent failure retained
here as a limitation. Its underlying cause was not established.
No test timeout or runtime quota rule was relaxed.

TypeScript, ESLint and `git diff --check`: **PASS**. Complete webpack production
build (`node node_modules/next/dist/bin/next build --webpack`): **PASS**, with local
subprocess access. Default `pnpm build` (Turbopack): **BLOCKED** by sandbox port
binding (`Operation not permitted`). Initial restricted test execution was also
blocked by missing PostgreSQL binaries and local subprocess restrictions; these
were resolved for the unrestricted test pass by extracting a package into `/tmp`,
without installing or starting a system database service.

Paddle API key, signing secret, client token, price ID and worker database URL
were absent/empty in both process configuration and `.env` (values were never
printed). No real Paddle requests, checkout or subscription evidence exist.
The isolated Chrome smoke test: **PASS** (pricing, responsive widths, login
guard, disabled billing and rejected checkout). Older browser regression scripts
requiring separate fixture setups were **NOT TESTED**.

For deterministic reporting, execute each top-level file in its own Node process
with `node --test --test-isolation=none tests/<file>.test.mjs`, sequentially, with
local socket/subprocess access. Database tests never load `.env` or use the
website database URL.

## Audit findings and hardening

Phase 6's event ledger already atomically committed deduplication and billing
record mutation; reconciliation already checked canonical IDs under the user row
lock. Gaps addressed here: no refund processing, no periodic reconciliation, and
subscription version ordering alone did not prevent an old completed payment
from regressing the paid-through period.

`adjustment.created` and `adjustment.updated` now trigger canonical adjustment and
transaction reads. The API adapter paginates adjustments for the current completed
payment, checks relationships, rejects incomplete/duplicate pages and caps reads
at five pages of 50. It never follows a returned URL. API keys now also require
`adjustment.read`; subscribe the sandbox destination to both adjustment events.

The payment watermark is separate from subscription `updated_at`. Earlier payment
periods and a different payment with the same period end are rejected. Approved
refund/dispute revocation is sticky for that transaction: stale API responses or
later reversal cannot silently restore its preview. A verified different payment
with a strictly later period end can establish a new preview. Reversal recovery
for the same transaction requires future reviewed operator tooling; automatic
restoration is deliberately unsupported.

Test-only repairs: the account-deletion lost-commit assertion now includes all
existing supplemental counts. Identity tests use one TS module instance for the
verifier/store (avoiding independent ESM/CJS verification WeakSets), and await PG
socket closure before shutting down the disposable server. Auth0 implementation
and linking behavior are unchanged.

## Explicit paid-through policy

This policy currently applies to the **sandbox preview**, not actual entitlements:

| State / evidence | Preview policy |
| --- | --- |
| Active, verified completed USD monthly payment | Pro only inside its verified `[start,end)` period |
| Checkout redirect, browser claim, activation without completed payment | Never sufficient |
| Failed initial payment | Free; no subscription access established |
| Failed renewal / past due | Preserve only the previously verified paid-through period |
| Scheduled or immediate cancellation | Preserve the verified paid-through period; no renewal extension |
| Paid-through expiration | Free immediately by clock comparison, even without webhook or worker |
| Paused or trialing | Free; unsupported for paid access |
| Pending/rejected refund, credit | Does not independently revoke a completed paid period |
| Approved full **or partial** refund, chargeback or chargeback warning | Revoke that payment's preview; conservative sandbox policy |
| Approved refund for an older payment | Does not revoke an independently verified newer paid period |
| API outage / pagination failure | No new verified state; retry; never extend paid-through |

**Grace period is zero beyond verified paid-through.** Refunds do not erase the
recorded period; `payment_revoked` denies its preview. There is no automatic
same-payment restoration. Paddle has no `subscription.expired` event in this
lifecycle; access expiration is evaluated using the clock. Actual entitlements
remain controlled by existing helpers, not these previews. Production policy and
entitlement mapping must be reviewed again before any grant/revocation writer.

Official references reviewed: [adjustment events](https://developer.paddle.com/webhooks/adjustments/adjustment-updated/),
[adjustment listing and filters](https://developer.paddle.com/api-reference/adjustments/list-adjustments/),
[refund approval](https://developer.paddle.com/build/transactions/create-transaction-adjustments/).
Sandbox refunds can remain pending until Paddle's approval cycle; do not treat a
refund request or a client callback as approval.

## Reconciliation operation

`scripts/reconcile-paddle-sandbox.ts` runs one bounded pass. Nothing registers a
cron job automatically. Default checkout and worker flags stay false.

* Default batch five, internal maximum ten. Accounts are visited sequentially.
* Per-account transactions acquire the user lock first, using `SKIP LOCKED`, then
  recheck eligibility under the billing-row lock. Overlapping workers cannot apply
  simultaneous snapshots for the same account. Webhooks/manual refresh use the
  same lock order.
* Success schedules another check in 15 minutes. Failure rolls back its savepoint,
  preserves last verified state, then records backoff: one minute, five minutes,
  and exhaustion on failure three. Exhausted rows are excluded until a successful
  authenticated refresh or an explicitly reviewed operator recovery. Webhook
  success also resets attempts. No automatic checkout-create retry exists.
* Requests retain three-second API timeouts, five-second DB lock timeout and
  15-second SQL timeout. A pass is bounded by account/page limits; schedule no more
  often than every five minutes initially and monitor run duration/backlog.
* JSON output: `operation`, `selected`, `ok`, `retry`, `exhausted`, `skipped`,
  outstanding `blocked`, `durationMs`. No account IDs, raw payloads or credentials.
  Exit 1 indicates failed/disabled startup, retries or outstanding exhausted rows.
  Alert on nonzero exits, `blocked>0`, repeated skips, missing runs and long duration.
  Inspect private per-account `last_reconcile_result`, `reconcile_attempts`,
  `next_reconcile_at` and `reconciled_at` only through trusted operator access.

Worker configuration requires all Phase 6 sandbox variables plus
`PADDLE_RECONCILIATION_ENABLED=true` and **separate**
`PADDLE_SANDBOX_DATABASE_URL`. It never loads `.env`, imports the website pool,
falls back to `DATABASE_URL`, runs migrations, or accepts a TCP/remote connection.
The initial worker supports local private Unix sockets only, a database named
`paddle_sandbox_<suffix>`, an explicit user, and an actual database-name check.
Hosted staging database access needs a separately reviewed connection mechanism.

Example, using exported sandbox-only environment variables and an already
initialized isolated database (not the production `.env`):

```sh
export PADDLE_SANDBOX_DATABASE_URL='postgresql:///paddle_sandbox_rehearsal?host=/tmp/paddle-isolated&port=6554&user=synthetic_operator'
export PADDLE_RECONCILIATION_ENABLED=true
node --conditions=react-server --import tsx scripts/reconcile-paddle-sandbox.ts
```

Run it manually first. After reviewing evidence, an operator can schedule that
one-shot command on the isolated host. Do not schedule against production.

## Database order and reproduction

Migrations 004–008 were not edited. Reviewed order:

| Migration | Dependency / compatibility |
| --- | --- |
| 004 | Existing `users` from 001; adds entitlement table and provider/event ledger |
| 005 | Existing `users`; adds monthly usage; readers also require 004 |
| 006 | Existing `users`; adds unique external identity mappings |
| 007 | Existing `users` and logical session dependency from 002; follow 004–006 as documented; no session FK |
| 008 | Existing `users`; billing application also needs 004's ledger; follow 004–007 |
| 009 | Alters 008; adds payment watermark, revocation and reconciliation metadata |

No 004–009 migration was applied to production. All new DB tests create their own
private `/tmp` cluster with TCP disabled and never load `.env` or `DATABASE_URL`.
PostgreSQL 16.15 was downloaded as an Ubuntu package and extracted under
`/tmp/phase7-postgres/root`; no service or system package was installed. It is a
temporary test prerequisite, not a repository dependency.

On a machine with PostgreSQL 16 server binaries, run:

```sh
export PADDLE_TEST_POSTGRES_BIN=/path/to/postgresql/16/bin
export ACCOUNT_DELETION_TEST_POSTGRES_BIN="$PADDLE_TEST_POSTGRES_BIN"
export IDENTITY_LINKING_TEST_POSTGRES_BIN="$PADDLE_TEST_POSTGRES_BIN"
node --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build
node tests/browser/paddle-sandbox-readiness.mjs
```

The browser test requires a completed production build, Chrome (default
`/opt/google/chrome/chrome`, override `PADDLE_TEST_CHROME`), and unused local ports
3147/9337. It launches a fresh profile and synthetic DB/session fixture, never an
existing browser or real Paddle checkout. Tests requiring sockets/subprocesses
must run with local execution access.

## Real sandbox checklist and next deployment

1. Keep production flags unset/false, linking disabled, and production migrations
   untouched. Do not deploy or enable paid access based on mocked test success.
2. Provision an isolated HTTPS staging website/database. Review and apply 001–009
   there only, using one migration operator. Keep a backup and schema inventory.
3. Supply sandbox API key (price/transaction/subscription/adjustment permissions),
   client token, configured standard USD $10/month price and destination secret.
   Configure the exact staging checkout URL and signed notification endpoint.
4. Complete the Phase 6 provider checklist plus pending/approved/rejected partial
   and full refunds, disputes, renewal failure/recovery, canceled paid-through
   expiration, cross-account attempts, event replays and API outages. Retain private
   notification/evidence IDs. Exercise manual and scheduled reconciliation.
5. Review the genuine lifecycle evidence. Only then propose a separate disabled
   entitlement writer with explicit ownership/provenance, revocation and quota
   transition tests. Today actual Paddle activation/revocation is blocked.
6. Before real payments, separately authorize production architecture/configuration,
   migration/deployment, async webhook processing, subscription management,
   replacement subscriptions and reversal recovery. Synchronous webhook processing
   can exceed Paddle's response deadline; this phase does not remove that blocker.

No production deployment or push was performed.
