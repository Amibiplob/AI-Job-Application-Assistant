# Phase 6: sandbox billing prerequisites

This implementation is a disabled-by-default sandbox rehearsal. It cannot accept
live payments or activate Pro. There is no entitlement activation flag. Real
sandbox credentials and end-to-end verification were unavailable during this work;
the safety condition therefore limits delivery to prerequisites. Do not treat the
automated fixtures as proof of a real Paddle integration.

## Audit and design

Baseline: `c075984db87864b100834490597ac9bbddce8f11`. Before edits, reviewed migration
004, `lib/monetization/store.ts`, the entitlement wrapper, custom website sessions,
the existing uncommitted sandbox draft, and Next.js 16.3.8's installed route-handler
and Server/Client Component guides.

* Migration 004 stores one provider-neutral entitlement per user. Only active or
  trialing Pro rows whose period contains the database clock qualify for Pro.
* The existing `(provider,event_id)` primary key and `withBillingEvent` transaction
  atomically deduplicate receipt and mutation. Rollback allows retry; concurrent
  inserts wait for the first transaction. Receipt alone does not prove ownership,
  authenticate events, or order subscription state.
* Website quota admission serializes on the user row and counts successful matches
  only: Free 3 / Pro 100, shared between saved-job and pasted-description matches
  per UTC month. None of those rules change.
* Sandbox records use a separate table and ledger namespace `paddle_sandbox`.
  There are no writes to entitlements or usage from Paddle. Auth0, account linking,
  and MCP enforcement remain unchanged and disabled as before.

Authenticated same-origin POST `/api/billing/paddle/checkout` accepts no browser
price or user identity. It verifies the configured standard price is active,
USD 1000 minor units, monthly, quantity one, with no trial or regional price
overrides. A durable opaque checkout intent binds a server-created transaction to
the session owner. No email-based account matching is performed. Unique customer,
transaction and subscription identifiers prevent cross-account reassignment.

POST `/api/billing/paddle/webhook` verifies HMAC-SHA256 over the timestamp and raw
bytes before parsing JSON, with timing-safe comparison, a five-second timestamp
window (also rejecting future timestamps), multiple signatures and a 256 KiB cap.
Only verified deliveries enter the receipt transaction. Payload custom data is a
lookup hint; reconciliation verifies the original transaction using the sandbox
API, its checkout intent, customer, subscription and configured price.

Canonical subscription and completed-payment reads happen after acquiring the
user lock. Both different concurrent events and manual reconciliation serialize.
Older API snapshots and equal-version conflicting statuses fail and roll back the
receipt. A canceled subscription cannot become active again under the same ID.
Event arrival order never directly overwrites status; `occurred_at` is recorded as
a maximum audit watermark. Duplicate committed IDs do not reapply updates.
API failures and incomplete initial transaction processing return 503 for retry.
Unknown events and unrelated sandbox customers are acknowledged without mutation.

Handled notifications: `subscription.created`, `activated`, `updated`, `canceled`,
`past_due`, `paused`, `resumed`, `trialing`; and `transaction.completed`,
`payment_failed`, `past_due`, `canceled`, `updated`. Initial failures cannot bind a
paid subscription. A completed transaction's verified billing period bounds the
internal paid-access preview; an active status or an unpaid new billing period
cannot extend it. Past-due and canceled records preserve a verified paid-through
period. At its end the preview expires based on time, without requiring a webhook.
Paused/trialing previews do not qualify. Paddle has no `subscription.expired`
event/status in this lifecycle. All these are rehearsal records, never Pro grants.

Pricing is at `/pricing`; session-protected status and reconciliation controls are
at `/dashboard/billing`. `/billing/checkout` verifies transaction ownership before
loading sandbox Paddle.js. Redirects and client callbacks grant nothing. The
public client token is intentionally browser-visible; API keys and webhook secrets
stay server-side. Existing account deletion recognizes and cascades the new table.

## Configuration and migrations

Use a separate HTTPS staging host and separate disposable/staging database. Do not
set these flags on the production deployment. Required configuration:

| Variable | Value |
| --- | --- |
| `PADDLE_SANDBOX_ENABLED` | `true` only for an intentional sandbox rehearsal; default `false` |
| `BILLING_DEPLOYMENT_ENV` | Exactly `sandbox` |
| `PADDLE_SANDBOX_API_KEY` | Sandbox `pdl_sdbx_apikey_...` server credential |
| `PADDLE_SANDBOX_WEBHOOK_SECRET` | Notification destination secret, 32–256 printable non-space ASCII characters |
| `PADDLE_SANDBOX_CLIENT_TOKEN` | Public sandbox `test_...` Paddle.js token |
| `PADDLE_SANDBOX_PRICE_ID` | Server-selected `pri_...` for standard USD $10/month, no trial or overrides |
| `APP_BASE_URL` | Exact HTTPS staging origin, no path/query/credentials |
| `DATABASE_URL` | Separate staging PostgreSQL connection |
| `RATE_LIMIT_SECRET` | Existing website authentication requirement; independent random secret |

Missing or malformed configuration disables billing with 503 responses and hides
checkout controls. `VERCEL_ENV=production` or `DEPLOYMENT_ENV=production` also
disables billing; `NODE_ENV=production` is allowed for staging production builds.
Never use `NEXT_PUBLIC_` for private billing configuration. No configurable API
host or live mode exists; API calls pin `https://sandbox-api.paddle.com`.

No migrations were applied and no production data was modified. Migrations
004–007 remain pending in production. Rehearsal requires reviewed migrations
001–008 in an isolated database; 008 adds only `paddle_sandbox_accounts` and its
index. It does not backfill or alter entitlements. Do not run the migration runner
against production for this phase. Removing rehearsal data requires an operator's
reviewed cleanup; no automatic uncertain-checkout reset exists.

In Paddle sandbox, create the product and price above, configure the default
payment link to `https://<staging-host>/billing/checkout`, and create an active
notification destination pointing at
`https://<staging-host>/api/billing/paddle/webhook` subscribed to all handled events.
Use the destination's signing secret (not the API key). Grant the API key only
required price-read, transaction-read/write and subscription-read permissions.

If checkout POST times out, the durable reservation remains `creating`. Inspect
Paddle's transactions for its `custom_data.link_intent` before any operator repair;
never blindly delete the reservation or repeat the create POST. One subscription
per account is supported for this rehearsal; replacement/resubscription after
cancellation requires future reviewed lifecycle work.

## Official Paddle review

Reviewed official sources on 2026-10-15:

* [Node SDK](https://github.com/PaddleHQ/paddle-node-sdk): Billing, not Classic;
  `Environment.sandbox` must be explicit (the default client targets production).
  SDK properties use camelCase and list methods return lazy paginated iterators.
  `webhooks.unmarshal(rawBody, secret, signature)` verifies then deserializes.
* [Signature verification](https://developer.paddle.com/webhooks/signature-verification):
  raw bytes, `ts:body`, HMAC-SHA256, five-second default SDK tolerance.
* [Delivery semantics](https://developer.paddle.com/webhooks/about/how-webhooks-work/):
  at-least-once, unordered delivery; deduplicate `event_id`; use `occurred_at` for
  ordering when consuming payload state. This adapter instead re-reads API state.
* [Past due](https://developer.paddle.com/webhooks/subscriptions/subscription-past-due/)
  and [cancellation](https://developer.paddle.com/webhooks/subscriptions/subscription-canceled/):
  payment recovery may reactivate, pause or cancel; scheduled cancellation first
  emits an update, cancellation occurs when effective.
* [List transactions](https://developer.paddle.com/api-reference/transactions/list-transactions/):
  filter completed transactions by subscription and retrieve the latest payment.

The SDK was reviewed, not added as a dependency. This deliberately small adapter
uses the documented raw HTTP API and manual signature protocol, preserving
snake_case wire schemas and enforcing a fixed sandbox host, timeouts, no redirects
and no automatic create retries. Do not mix SDK camelCase objects into these
schemas. No claim of SDK integration testing is made.

## Sandbox end-to-end checklist (pending)

- [ ] Apply reviewed migrations to an isolated database and confirm production
  connection strings are absent from that environment.
- [ ] Configure real sandbox credentials, HTTPS staging origin, price, payment
  link and notification destination; verify unsupported/live values fail closed.
- [ ] Authenticate two website accounts. Check unauthenticated and cross-origin
  POSTs fail; browser-supplied price/user IDs have no effect; account B cannot open
  account A's transaction or refresh its records.
- [ ] Complete a real sandbox checkout. Deliver signed creation, activation and
  completion notifications in different orders; early processing must retry after
  Paddle completes the transaction. Confirm all canonical identifiers agree.
- [ ] Replay notifications, deliver simultaneous copies and distinct events, and
  check exactly one receipt per ID with no cross-account mutations.
- [ ] Send missing/forged signatures, transformed bodies and stale signed requests;
  verify no receipts or billing mutations occur.
- [ ] Exercise failed initial payment, failed renewal, payment recovery, scheduled
  and immediate cancellation, pause/resume, and paid-through expiry. An unpaid new
  period must never extend the verified completed-payment period.
- [ ] Replay an old activation after cancellation; simulate stale/conflicting API
  snapshots and API outages. Confirm rollback/retry and no cancellation reversal.
- [ ] Use the authenticated refresh endpoint to reconcile without a new webhook.
  Exercise uncertain checkout creation and operator review without duplicate POSTs.
- [ ] Confirm actual website plan stays Free, quotas stay 3/100 under the existing
  entitlement tests, and no MCP linking/enforcement or Auth0 behavior changes.
- [ ] Record Paddle notification IDs, test results and reviewed configuration
  evidence privately before proposing any entitlement-writing implementation.

## Remaining release work

Real sandbox credentials and end-to-end evidence are absent. Pro activation is
intentionally unimplemented. Before real payments: finish the checklist, implement
and test reviewed entitlement projection/revocation and periodic reconciliation,
handle refunds/adjustments and replacement subscriptions, provide subscription
management/cancellation, and complete operational and production migration review.
The synchronous webhook path can exceed Paddle's response deadline when multiple
API requests are slow; before payment release use durable background processing
with prompt acknowledgement and retry/monitoring. Do not simply change the host or
enable production credentials in this sandbox-only implementation.

Browser CDP regression scripts require separately started fixture servers and
Chrome; they are not part of the unit test command and have not been executed in
this environment. Real Paddle e2e is not substituted by mocked route/UI tests.

## Validation results

2026-10-15, Node 24.21.0 from the existing NVM installation:

* TypeScript (`tsc --noEmit`), ESLint, and `git diff --check`: pass.
* All 29 top-level test files executed. Running each file in a separate Node
  process with `--test --test-isolation=none` exposes the individual results:
  211 cases, 133 pass, 78 fail during database setup. The 13 Paddle protocol,
  API-adapter, route and UI cases all pass.
* Seven database suites are blocked by missing
  `/usr/lib/postgresql/16/bin/initdb` and `postgres`: account-deletion,
  identity-linking, monetization, paddle-sandbox-postgres, rate-limit,
  retention-safeguards and website-matching-quota. The tests intentionally have
  no live-database fallback. New concurrency, ownership, conflicting-subscription,
  payment failure, cancellation and committed-event replay integration cases are
  present but unverified until these server binaries are available.
* Default `pnpm build` (Turbopack): blocked by sandbox local port binding
  (`Operation not permitted`). Sandboxed webpack also could not capture the
  TypeScript configuration subprocess output. Retrying
  `node node_modules/next/dist/bin/next build --webpack` with subprocess execution
  access passed the complete production build, type checking, page generation and
  build tracing. No project configuration was changed to work around the sandbox.
* Real Paddle sandbox e2e and browser CDP scripts: not run; require credentials,
  staging setup and browser fixtures respectively.

To rerun database tests, provide PostgreSQL 16 server binaries. The new suite
supports `PADDLE_TEST_POSTGRES_BIN`; existing database suites support
`ACCOUNT_DELETION_TEST_POSTGRES_BIN`. These paths select local binaries only;
never point tests at a remote database. Run `node --test tests/*.test.mjs`,
`pnpm exec tsc --noEmit`, `pnpm lint`, and `pnpm build` in an unrestricted local
development environment after resolving prerequisites.
