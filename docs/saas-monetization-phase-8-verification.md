# Phase 8 verification follow-up

Architecture follow-up: [durable sandbox webhook ingestion and worker](paddle-webhook-processing.md).
The verification results below are retained as historical evidence.

Baseline: `32d01a5` (clean working tree at start). Date: 2026-10-16.
Read with [Phase 8 implementation and staging runbook](saas-monetization-phase-8.md).

**Genuine Paddle verification is BLOCKED. No genuine provider acceptance is claimed.**

## Environment gate

Only presence and safe boolean classifications were inspected in the process
configuration and existing `.env`/Next environment files. No credential, host,
connection URL, customer identifier or secret value was printed.

| Prerequisite | Result |
| --- | --- |
| Dedicated staging HTTPS origin | BLOCKED: `APP_BASE_URL` absent; no explicit sandbox deployment designation |
| Explicitly confirmed isolated staging PostgreSQL | BLOCKED: `PADDLE_SANDBOX_DATABASE_URL` absent |
| Existing `DATABASE_URL` | Present, isolation unconfirmed; never connected to or modified |
| Paddle sandbox API key, signing secret, client token, price ID | All absent |
| Sandbox billing / entitlement / worker flags | Not enabled |
| Auth0 linking | Not enabled; no MCP payment/quota behavior changed |

Provider-dependent steps stopped at this gate. Checkout, genuine provider
subscription/payment reads, notification delivery verification, staging activation,
cancellation, expiration, refund/dispute lifecycle, real 3/100 matching acceptance,
account-isolation/event replay acceptance and configured staging worker execution
are **NOT TESTED**. Local synthetic tests below are explicitly not substitutes.
No remote database was probed and no migrations, deployment, scheduler or
configuration changes were applied to staging or production.

## Migration audit

Reviewed 004–009 and compared them with the baseline; no migration SQL changed.
004 adds provider-neutral entitlements and event deduplication; 005 adds UTC monthly
usage; 006 adds unique external identities; 007 adds short-lived session-bound link
protocol storage; 008 adds uniquely owned sandbox checkout/customer/subscription
mappings; 009 adds payment watermarks, sticky revocation and bounded worker metadata.
These require existing users/auth tables from 001–003 and their documented order.
They do not backfill Pro or enable linking/payment flags. The separate reviewed
account-deletion utility recognizes these dependencies.

**No staging migration was applied:** no target was explicitly confirmed isolated.
The current reader also requires **010** (entitlement provenance). Applying only
004–009 is insufficient for this commit's website usage reads. Review/authorize
010 as a deployment prerequisite, in addition to the requested 004–009 staging
migration review. All migration execution during tests was confined to newly
created disposable `/tmp` PostgreSQL clusters, with TCP disabled and no `.env` or
`DATABASE_URL` fallback.

## Failure diagnosis and changes

No confirmed production application defect was established. Changes are confined
to test fixtures, diagnostics, browser orchestration and this evidence report.
Authentication, payment verification, entitlement policy, quotas and security
checks remain unchanged.

- **Resume timeout:** reproduced. Chrome's first CDP target was an extension
  `background_page`; the actual page stayed at `about:blank`. The test selected
  `targets[0]`. It now explicitly selects `type === 'page'`, matching the other
  browser scripts, and exercises the original assertions.
- **Public auth assertion:** reproduced. The redesigned homepage places Sign in
  in the footer, while the old test required it in the header. The test now checks
  that actual navigation location and still verifies signed-out/signed-in HTML,
  revoked/invalid sessions, cache headers, route guards and authentication actions.
  Its old fixture also lacked abuse-limit SQL; the fixture now supplies bounded
  synthetic attempt counters and the runner provides an explicit synthetic
  rate-limit secret. Production abuse protection is not bypassed.
- **Public signup validation race:** exposed after the first auth fixes. The test
  waited for a password-error element already present from the previous empty
  submission, then edited/submitted while the short-password response was pending.
  It now waits for the specific “at least 8” error from that submission before
  entering valid credentials. No validation or assertion was removed.
- **Job analysis/details matching timeouts:** the legacy synthetic fixture rejected
  current owner-lock/entitlement/usage SQL. Added explicit known-account support,
  UTC periods, usage caps and reservation rollback snapshots. The populated account
  is an explicitly **synthetic manual Pro fixture** so long UI scenarios can run;
  all other fixture accounts are Free. This does not activate Paddle or represent
  a provider entitlement. Unsupported SQL still throws without forwarding.
- **Intermittent quota failure:** the historical incident's exact pg exception
  remains unconfirmed. New deterministic reproduction uses a fresh pool, the
  original 500 ms connection/acquisition deadline, forty admissions and a 700 ms
  injected event-loop stall. It observes actual pg acquisition timeout failures,
  verifies at most three admissions and exact persisted successful usage, with
  no automatic retries. Existing saturation, rollback and downgrade tests remain.
  Account contention diagnostics now distinguish acquisition, query and commit
  failures using only a boolean timeout classification or allowlisted SQLSTATE
  (`55P03`, `40P01`, `57014`, `40001`), never raw SQL, parameters or errors.
  A controlled failure mechanism is confirmed; it is not retrospective proof of
  the older incident. No production timeout or quota was relaxed.

The new `tests/browser/run-regressions.mjs` runs each UI script against its own
fixture-preloaded server and fresh Chrome profile, refuses occupied ports, forces
synthetic DB/rate-limit configuration and disables billing, entitlements, linking
and reconciliation. It bounds each script, preserves a private temporary output
log, cleans up its own processes/profile and returns nonzero for any failure.
It supports production `start` (default), `BROWSER_TEST_SERVER_MODE=dev`, and
optional script names. It never attaches to a user's existing browser.

## Results

| Check | Outcome and evidence |
| --- | --- |
| Top-level automated suite | PASS: 235/235 cases, 29 files, zero skipped; disposable PostgreSQL 16.15 and synthetic provider data |
| Quota diagnostic repetitions | PASS: five additional 14-case runs (70 executions); final query/commit diagnostic change also passed the 14-case file |
| TypeScript / ESLint / whitespace | PASS: `tsc --noEmit`, ESLint and `git diff --check` |
| Webpack production build | PASS: complete build, TypeScript, prerender and trace collection |
| Standard Turbopack build | BLOCKED: restricted run failed Google Fonts access; elevated retry failed internal subprocess port binding (`Operation not permitted`) |
| Disabled-billing browser smoke | PASS: pricing, mobile/desktop widths, login guard, disabled billing/checkout; fresh synthetic session fixture |
| Final seven-script browser regression suite | PASS: public auth, onboarding, resume, application tracking, job analysis, job details and job search; fresh server/profile per script, exit 0 |
| Initial browser failures | FAIL evidence retained: old header assertion and wrong CDP target; after fixture updates, signup test exposed a validation-response race; final rerun verifies fixes |
| Invalid overlapping-build auth rerun | Excluded: a build invalidated manifests while that rerun used them; rebuilt artifact and reran sequentially |
| Actual staging and Paddle acceptance | BLOCKED / NOT TESTED: missing isolated staging configuration and genuine credentials |
| Dev-mode browser variant | NOT TESTED; browser evidence uses the completed production artifact |

The complete final automated run finished with 235 passes; only a diagnostic
wrapper changed afterward and the full 14-case quota file passed again. Backend
payment/entitlement tests exercise real PostgreSQL, with synthetic provider
responses. The historical non-deterministic quota incident is retained as an
unattributed failure; deterministic resource-starvation reproductions do not
retroactively identify its original exception.

All local provider lifecycle results use synthetic API responses plus disposable
real PostgreSQL. They are useful regressions for ownership, refunds, expiration,
deduplication and quotas; they are not genuine Paddle evidence.

## Reproduce local checks

Use Node 24 and PostgreSQL 16 server binaries, with local socket/subprocess access.

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
node tests/browser/run-regressions.mjs
node tests/browser/paddle-sandbox-readiness.mjs
```

For one script: `node tests/browser/run-regressions.mjs public-auth-navigation`.
The equivalent dev run sets `BROWSER_TEST_SERVER_MODE=dev`. Browser fixtures are
strictly local test data, never a staging payment rehearsal.

## Deployment prerequisites and remaining blockers

1. Provision/identify a dedicated HTTPS staging site and explicitly confirm its
   nonproduction database, independently of the existing unknown `DATABASE_URL`.
   No migration should run until that target is confirmed. Review migration 010
   too; otherwise Phase 8's reader will report usage unavailable.
2. Configure genuine sandbox credentials through the runtime secret manager,
   sandbox price and notification destination. Never put secret values into source
   files, this report or chat. Do not enable any production payment or MCP feature.
3. Follow the exact genuine acceptance exercise in the Phase 8 runbook. Evidence
   must include actual payment/subscription relationships, signed delivery IDs,
   correct website owner, 100 successful matches, expiration and approved refund
   revocation, attempted forgery/cross-account access, and replay/order tests.
   Sandbox-supported disputes must be observed or explicitly left unverified.
4. The staging worker needs the same isolated DB via its supported private Unix
   socket, separate sandbox URL, explicit flag and external scheduler. Hosted
   database connectivity remains unsupported by its current connection guard.
5. Historical cold-pool flake attribution remains incomplete despite a classified
   deterministic reproduction and verified fail-closed accounting. Preserve that
   limitation; never retry an uncertain matching commit automatically.
6. Synchronous provider calls can exceed Paddle's webhook deadline; durable async
   processing remains a production architecture blocker. No production readiness
   follows from local test success or from a future sandbox-only acceptance pass.

No push, production deployment, production database change or feature activation
was performed. Genuine provider acceptance remains unverified.
