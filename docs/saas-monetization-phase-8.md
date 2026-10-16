# Phase 8 — sandbox entitlement prerequisites

Baseline: `1f12869be35048d716b7800265ef9129949de580`. Read with
[Phase 7](saas-monetization-phase-7.md) and its worker/credential instructions.
Verification date: 2026-10-16. **Genuine Paddle acceptance remains UNVERIFIED.
Activation stays disabled. This is not production readiness.**

## Audit and implementation

- Checkout requires an authenticated website session and same-origin POST. It
  ignores browser-supplied user, customer, subscription and price identifiers.
  A durable per-user intent reserves one server-created transaction; uncertain
  creation is never retried automatically. Redirects and Paddle.js callbacks
  have no grant path. A second/unrelated subscription cannot replace that binding.
- Webhooks verify HMAC over bounded raw bytes before parsing. Event contents only
  locate candidate records. Server API reads establish the original transaction,
  intent, customer, subscription, catalog price and latest completed payment.
  Canonical transaction totals must be present and strictly positive; zero-value
  completed transactions cannot grant. The configured active standard USD
  $10/month price must have no trial or overrides. Unsupported evidence fails closed.
- Reconciliation writes billing state, provenance-bound entitlement and event
  receipt in one transaction. All writers and matching admissions lock the user
  first. Unique customer/subscription mappings reject ambiguous or cross-account
  ownership. The entitlement upsert refuses manual/other-subscription ownership;
  it never resets monthly usage. A conflicting manual entitlement requires
  separately reviewed operator resolution; no automatic takeover exists.
- Migration **010** adds `source` (`manual` by default) and a unique sandbox
  subscription reference. It contains no grants or data updates. Migrations
  004–009 are unchanged. Only disposable test clusters received migrations.
- `PADDLE_SANDBOX_ENTITLEMENTS_ENABLED=true` is an independent server-only read/write
  switch requiring valid existing sandbox configuration and nonproduction runtime.
  It defaults false. Entitlement reads also require matching verified billing
  provenance, nonrevoked payment, eligible status and identical paid period. Turning
  the switch off suppresses existing sandbox grants immediately; turning it back
  on cannot resurrect a refund observed while disabled. Every serving instance
  must use the same configuration; restart/redeploy all instances when changing it.
- The bounded worker and authenticated refresh use the same writer. Batch size,
  SKIP LOCKED ordering, retries, exhaustion and isolated worker DB restrictions
  are unchanged. No scheduler was installed. API/DB errors roll back grants and
  event receipts; periodic failures retain the previous verified period without
  extending it. A verified approved adjustment for the persisted current payment
  revokes directly, independently of subscription/list API availability or ordering.
- Website matching retains Free **3** / Pro **100** successful matches per UTC
  calendar month. A thrown matching computation rolls back its unit. Denials do
  not execute matching. Downgrades preserve usage, including usage above Free's
  limit. Matching and revocation serialize: a match admitted before revocation
  may finish; admissions after revocation see Free. No MCP quota or Auth0/linking
  path was enabled or changed.
- Billing, checkout and pricing copy now describes conditional verified sandbox
  activation. The website plan remains authoritative; the diagnostic preview is
  not an authorization decision.

## Entitlement policy

| Verified evidence | Access |
| --- | --- |
| Eligible completed positive-value payment and active subscription | Pro inside its verified `[start,end)` period |
| Initial failure, unpaid activation, missing payment, forged event or redirect | No grant |
| Past due / renewal failure | Preserve previously paid-through only |
| Scheduled or immediate cancellation | Preserve verified paid-through, zero additional grace |
| Paid-through clock expiration | Free without any worker/webhook |
| Paused / trialing | Free; unsupported for paid access |
| Pending/rejected refund or credit | No independent revocation |
| Approved full or partial refund, chargeback or chargeback warning | Revoke current payment |
| Refund on an older payment | Does not revoke an independently verified newer period |
| Stale snapshot or same-payment reversal | Cannot undo sticky revocation |
| Different completed payment with strictly later period end | May establish new verified access |

Approved partial refunds deliberately revoke the entire payment's entitlement in
this conservative sandbox policy. Reversal restoration, subscription replacement,
plan changes and production policy require separate review. Cancellation policy
is the explicit requested paid-through policy, including immediate cancellation;
it is not a claim that Paddle's default provisioning guidance promises that access.

Official references reviewed: [transaction status, totals and billing period](https://developer.paddle.com/api-reference/transactions/get-transaction/),
[adjustments and approval](https://developer.paddle.com/api-reference/adjustments/),
[cancellation and scheduled changes](https://developer.paddle.com/build/subscriptions/cancel-subscriptions/).

## Quota concurrency investigation

The original Free concurrency failure **was reproduced** during the first full
Phase 8 run: 40 calls, failure at Promise index 34, about 750 ms, the same redacted
DAL error. It is not treated as resolved by later green reruns. Twelve fresh
runs during the first build and fifteen subsequent diagnostic runs passed.

The fixture sets a **500 ms pool acquisition/connection timeout**, pool size 20,
and fans out 40 admissions starting with a cold pool. Deterministic saturation
of all 20 connections reproduces pg's `timeout exceeded when trying to connect`
and the identical public DAL failure. The added test verifies zero consumed
units after rejection and exactly three admissions after releasing connections.
The original one-off error predates classified instrumentation, so its precise
underlying pg error remains **unconfirmed**; pool starvation is supported as a
reproduction mechanism, not conclusively attributed as the original root cause.

The quota concurrency fixture now establishes the 20 sockets sequentially before
contending on the account lock, retaining the 500 ms deadline and all forty calls.
It settles all admissions before assertions/teardown so a failure cannot leak work
into the next test. Acquisition failures emit a test-only boolean classification,
never raw database messages. The separate saturation test retains explicit
infrastructure failure coverage. No production timeout, transaction retry, quota
limit or accounting semantics were relaxed. Cold-connection/load diagnosis remains
an explicit release blocker; do not automatically retry outcome-uncertain matches.

## Verification results

- Full final top-level suite: **234/234 PASS**, 29 files, zero skipped. Real local
  PostgreSQL 16.15, synthetic provider responses. Includes seven additional
  payment/entitlement lifecycle cases, gate tests and pool saturation coverage.
- First full run: **232/233 PASS**, one reproduced quota-concurrency failure.
  A later kill-switch regression increased the suite to 234. Do not erase the
  initial failure from the release evidence.
- TypeScript, ESLint, whitespace checks and webpack production build: PASS in
  both the complete final verification and final artifact checks.
- Standard Turbopack production build: **ENVIRONMENT BLOCKED**, restricted and
  elevated attempts both failed creating a subprocess's port (`Operation not
  permitted`). Webpack is the independently verified build path.
- Initial sandbox PostgreSQL process execution was blocked by local socket/process
  restrictions. Tests ran with local execution access and binaries extracted into
  `/tmp/phase8-postgres/root`; no system service/package installation or live DB
  fallback was used. Node is `/home/biplob/.nvm/versions/node/v24.21.0/bin/node`.
- Isolated Paddle browser smoke: PASS (pricing, responsive widths, login guard,
  disabled billing and rejected checkout), synthetic session/query fixtures only.
- Genuine checkout, provider webhook delivery, sandbox purchase-to-Pro, actual
  refund/dispute and real-provider worker lifecycle: **NOT PERFORMED / UNVERIFIED**.
  API key, signing secret, client token, price ID and sandbox worker DB URL were
  absent from environment and `.env`. Only presence was checked; no secrets were
  printed, requested or committed, and no real Paddle requests were made.

Final reruns: all 29 files passed (234/234); the last signed-webhook/activation
change was also rechecked in the 24-case PostgreSQL billing file. TypeScript,
ESLint, `git diff --check`, complete webpack production build and isolated Paddle
browser smoke all passed on the final artifact.

Broader browser regression run: all seven legacy scripts were attempted against
fresh production fixture servers and isolated Chrome profiles. **PASS**:
`connect-onboarding`, `application-tracking-workspace`, `job-search-workspace`.
**FAIL**: `public-auth-navigation` (authenticated-home assertion, expected true /
received false); `job-analysis-workspace` and `job-details-workspace` (timed out
waiting for `75%` matching output). **TIMEOUT**: `resume-workspace` (90-second
runner bound, no completion). These are retained failures, not declared passes
or established application regressions. In particular, the old matching fixtures
do not implement the quota SQL used by current website matching; their query
allowlist refuses unsupported database calls. Their headers prescribe dev
servers; this additional run used the production artifact. Dev-mode reproduction
and fixture modernization were not performed. No existing browser or production
account was used. These failures remain release review items.

## Reproduction

Use local subprocess/socket access and PostgreSQL server binaries. Tests never
load `.env` or use `DATABASE_URL`; each database test creates a private `/tmp`
cluster with TCP disabled. Execute files sequentially to avoid cross-test runtime
contention; within-file concurrency remains enabled where explicitly tested.

```sh
export PADDLE_TEST_POSTGRES_BIN=/path/to/postgresql/16/bin
export ACCOUNT_DELETION_TEST_POSTGRES_BIN="$PADDLE_TEST_POSTGRES_BIN"
export IDENTITY_LINKING_TEST_POSTGRES_BIN="$PADDLE_TEST_POSTGRES_BIN"
for file in tests/*.test.mjs; do
  node --test --test-isolation=none "$file" || exit 1
done
pnpm exec tsc --noEmit
pnpm lint
pnpm build
node node_modules/next/dist/bin/next build --webpack
node tests/browser/paddle-sandbox-readiness.mjs
```

Other browser scripts require fresh fixture-preloaded servers at localhost:3100
and fresh Chrome profiles with CDP on localhost:9223, as specified in their file
headers. Never attach these scripts to an existing browser. Force a synthetic
`DATABASE_URL`, disable billing/linking flags, and use each script's matching
fixture. These browser fixtures are not PostgreSQL or Paddle integration evidence.

## Exact isolated staging verification

1. Provision a separate HTTPS website and empty private PostgreSQL database. Do
   not use the current production `.env`, production DB, or production host.
   Review 001–010 and have an authorized migration operator apply them **there
   only**, before deploying this reader. Code now requires 008–010 even with
   activation disabled; deployment without schema preparation would fail closed
   with unavailable website usage. No production migration is authorized here.
2. Configure runtime secrets through the staging secret manager: sandbox API key
   with price/transaction/subscription/adjustment read and transaction write
   permissions, sandbox Paddle.js client token, price ID and destination signing
   secret. Configure `APP_BASE_URL` to the exact HTTPS staging origin,
   `BILLING_DEPLOYMENT_ENV=sandbox`, `PADDLE_SANDBOX_ENABLED=true`. Keep live
   payments, linking, MCP paid quotas and the entitlement switch off initially.
3. Register the staging checkout URL and webhook `/api/billing/paddle/webhook`.
   Subscribe to supported subscription and transaction events plus
   `adjustment.created` and `adjustment.updated` (Phase 7). Verify staging identifies
   as nonproduction. Verify the price is active standard USD 1000 minor units,
   monthly, quantity one, no trial or overrides. Do not paste credentials into SQL,
   source, logs or this document.
4. Create website users A and B with separate browser profiles. Verify both Free,
   consume A's three matches, and confirm the fourth is denied. Request checkout
   as A using the actual website form. Before payment and on redirects alone,
   verify A and B remain Free. Verify B cannot open A's transaction or refresh A
   using another session. Forged signatures/body transformations must return 400
   with no ledger, billing or entitlement mutation.
5. For this isolated acceptance exercise only, configure
   `PADDLE_SANDBOX_ENTITLEMENTS_ENABLED=true` consistently on web and worker
   runtimes. Complete a **genuine Paddle sandbox purchase** as A. Wait for signed
   delivery or use authenticated “Refresh sandbox status from Paddle.” Confirm
   the original server intent and canonical provider customer/subscription/payment
   agree, `source=paddle_sandbox`, website A is Pro, B stays Free, and billing event
   and entitlement commit atomically. Retain private provider evidence IDs and
   timestamps without including credentials in public artifacts.
6. Confirm A has 97 remaining matches after its earlier three; a failed computation
   consumes nothing. Run simultaneous successful matches through the actual
   website matching flow; stop at 100 total this UTC month, then deny the next.
   Replay the successful event and deliver distinct events concurrently: one
   receipt per event, unchanged account/period, no usage reset. Try an unrelated
   subscription and forged cross-account custom data: neither account moves.
7. Schedule cancellation and verify paid-through remains unchanged. Test failure
   of renewal: retain only the completed payment's period. Wait for genuine
   verified period expiration (do not edit staging entitlement rows as proof);
   without delivery/worker, verify Free at the boundary and no additional grace.
   Preserve used units. Do not shorten a provider period using client input.
8. With a separate genuine purchase fixture, request full and partial refunds.
   Pending/rejected remains paid-through; provider **approved** refund revokes
   the current payment. Test provider-supported disputes/warnings separately.
   Replay older activation events and stale API responses: no restoration. An
   older-payment refund must not revoke a verified newer period. If the sandbox
   cannot produce a real dispute, mark that case unverified; simulation is not
   equivalent evidence. Check refund with subscription/list API unavailable and
   while activation is off; re-enabling must not restore the revoked payment.
9. Configure the Phase 7 bounded worker against the **same isolated database**
   through its supported private `/tmp` Unix socket and `paddle_sandbox_*` DB name.
   Set `PADDLE_SANDBOX_DATABASE_URL` separately and
   `PADDLE_RECONCILIATION_ENABLED=true`; run
   `node --conditions=react-server --import tsx scripts/reconcile-paddle-sandbox.ts`.
   Run two workers concurrently, verify one account update, test retries/backoff/
   exhaustion, API outage, recovery and webhook/worker races. Do not substitute a
   hosted/production URL; unsupported hosted access needs separate review. Only
   after reviewing one-pass evidence should an operator arrange the existing
   external schedule (initially at least five minutes apart).
10. Turn activation off on every instance and verify sandbox Pro is suppressed
    immediately on the next request while counters remain intact. Leave it off
    after the rehearsal. Record evidence, failed/unavailable cases and explicit
    decisions before considering any subsequent deployment.

## Release blockers

- No genuine Paddle purchase-to-entitlement, expiration/refund revocation,
  cross-account provider lifecycle or 100-successful-match acceptance evidence.
- Original cold-pool quota flake reproduced, but exact initial pg error unconfirmed;
  fixture mitigation and deterministic saturation test do not establish root cause.
- Synchronous provider verification can exceed Paddle's webhook response deadline;
  durable asynchronous delivery remains a production architecture blocker.
- No production schema application, deployment, live payments, Auth0 linking,
  paid MCP quotas, provider replacement or automatic reversal recovery authorized.
- Environment prevents the default Turbopack build. Broader legacy browser failures
  (when present below) require separate reproduction/review before release.

No production data was modified. No deployment, scheduler registration or push was
performed. Only verified task-related files are intended for the local commit.
