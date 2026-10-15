# Phase 4 production readiness — 2026-10-15

**Decision: FAIL the production activation gate. Keep linking disabled.**
Audited baseline `87b161ce24415a8a13c588741fb5738dd16addaf` and the targeted
hardening described below. No production database connection, migrations, data
writes, Auth0 configuration changes, package installation or push was performed.
Local environment inspection reported presence/absence only, without credentials.
Production configuration and migration state are operator-supplied facts, not
independently inspected deployment state.

PASS means source review and available tests support the stated boundary;
BLOCKED means a required service or environment capability is unavailable;
NOT TESTED means no live exercise was possible; FAIL identifies an acceptance
criterion not satisfied or a reproduced baseline source defect. PASS on mocked
routes or synthetic signed tokens is not a live-provider or PostgreSQL pass.

| Requirement | Status | Evidence / limit |
| --- | --- | --- |
| Repository, identity flow and deployment prerequisites inspected | PASS | Phase 4 guide read first; routes, sessions, verifier, stores, migrations and deletion reviewed |
| 004–007 ordering, constraints, indexes and compatibility reviewed | PASS | Static review below; live DDL remains unverified |
| Production migration prohibited; backup/rollback prepared | PASS | No migration run; operator sequence below |
| Isolated PostgreSQL security/regression suites | BLOCKED | Six files fail setup: `initdb` and `postgres` return ENOENT; no Docker/Podman or alternative local server found |
| Available non-database tests | PASS | 120 tests in 19 files pass, including OAuth, route guards, MCP authorization and onboarding |
| TypeScript / ESLint | PASS | `npx tsc --noEmit`; `npm run lint` |
| Default production build | BLOCKED | Turbopack PostCSS worker cannot bind local port: EPERM |
| Webpack production build | BLOCKED | TypeScript `--showConfig` child process returns empty output; isolated spawn reproduction reports EPERM |
| Browser regressions | BLOCKED | All seven `tests/browser/*.mjs` attempted; denied CDP socket connection on 127.0.0.1:9223; no usable fixture/CDP service verified |
| Authorization code / S256 / nonce / exact callback / token checks | PASS | Compared with official references; synthetic positive/negative tests pass; live PKCE/code rejection NOT TESTED |
| Actual tenant profile (`azp` versus `client_id`) | BLOCKED | Interactive client, secret, allowlist, redirect, origin and enable flag absent/empty locally; no live JWT or Management API tenant evidence available |
| Ambiguous client claims / non-user token profiles at baseline | FAIL → PASS | Regression tests reproduced silent claim precedence and linkable non-user profiles; targeted rejection now passes |
| M2M linking and user-specific entitlement isolation | PASS | Known machine grants/subjects and signed non-user/delegated profiles yield no verified identity; MCP has no entitlement lookup path; see trust limit below |
| Initiation authentication and CSRF / callback replay | PASS | Route and OAuth tests pass; one-use DB DELETE reviewed, DB execution BLOCKED |
| Session swap, user isolation, uniqueness, owner unlink, deletion | BLOCKED | SQL and owner predicates reviewed; six PostgreSQL suites must execute before approval |
| Live Auth0 website → callback → MCP same-user resolution | NOT TESTED | No dedicated real client/configuration or live login flow |
| Linking remains disabled; no authentication architecture replacement | PASS | Local enable flag absent; complete config is required; website PostgreSQL sessions retained |
| MCP subscription/quotas and payments remain off | PASS | No entitlement/metering integration added to MCP; no Paddle/Stripe integration |
| Production deployment / restore rehearsal | NOT TESTED | Intentionally not performed |

## Source findings and reviewed compatibility

Two added regression cases failed on the baseline and pass after hardening:

1. A token containing contradictory `azp` and `client_id` silently preferred
   `azp`. The verifier now rejects disagreement and malformed/empty present
   claims. Either documented claim alone, or both with the same value, works
   only after the existing signature, issuer, audience and expiry checks.
2. An allowlisted signed token with `sub_profile=service` or `ai_agent` and no
   `@clients` suffix was classified as an individual. Identity classification now
   rejects non-user/malformed subject profiles, delegated `act` claims and
   unreviewed grants. Only absent `gty` (normal code token) or `refresh_token`
   can preserve a user identity. Standard `user` profiles remain supported.
   This restricts identity eligibility; valid M2M `jobs:read` tool access remains.

This is claim-name compatibility, not a claim of complete RFC 9068 conformance.
Auth0 documents `azp` for its default profile, `client_id` for RFC 9068, omission
of `gty` in RFC 9068, and newer non-user subjects without `@clients`. **Missing
`gty` is not proof of an interactive grant.** Security still requires the
allowlisted client to have only reviewed interactive grants, with client
credentials disabled; the issuer must not misrepresent the subject type. Those
real tenant restrictions are unverified. Do not allowlist the existing M2M ID.
[Official token-profile reference](https://auth0.com/docs/secure/tokens/access-tokens/access-token-profiles).

OAuth tests also exercise `client_id`-only success, conflicting clients,
non-user/delegated rejection and missing `at_hash`. Existing RS256, exact single
API audience and `permissions: ["jobs:read"]` checks are unchanged. Auth0's
published OIDC examples include API plus `/userinfo` audiences, which this app
rejects. ID-token `at_hash` is optional in the OIDC code-flow standard but
mandatory in this app. These are unresolved **compatibility gates**, not reasons
to weaken validation. Stop if real tokens do not match this strict profile.
[OIDC code-flow access-token validation](https://openid.net/specs/openid-connect-core-1_0-18.html#CodeFlowTokenValidation).

No email matching, public user-ID input, OAuth token persistence, billing, quotas,
font removal or authentication architecture change was introduced. MCP currently
exposes shared job data/text analysis, not website resumes or user entitlements.
Operator unlink is owner scoped; provider revocation/deletion remains separate.

## Migration review

| File | Ordering and integrity | Index / compatibility findings |
| --- | --- | --- |
| 004 | After users (001); creates entitlements keyed by user, FK CASCADE; billing ledger keyed by provider/event | PK indexes cover owner and event lookups; no user backfill; missing entitlement remains Free; billing ledger intentionally has no user FK |
| 005 | After users; monthly usage keyed by user/metric/month, FK CASCADE; nonnegative counts and first-of-month check | PK supports user/month admission lookups and deletion; no existing data or sessions changed |
| 006 | After users; UUID PK; unique issuer/subject globally and user/issuer per owner; FK CASCADE | Both unique constraints index the conflict paths; separate user index duplicates the user-prefix benefit of user/issuer (harmless overhead); UUID default has no sequence |
| 007 | After users/sessions and deployed after 004–006; state hash PK, verifier/nonce/expiry checks, user FK CASCADE | User and expiry indexes support deletion/cleanup; no session FK by design; exact live session checked on create, consume and final write; abandoned rows require cleanup |

All four are additive, with no auth-table replacement or destructive backfill.
New FKs can briefly lock referenced tables; schedule and rehearse under representative
load. Migration 007 checks expiry against creation but does not itself cap a row
at five minutes; application creation does. Revoking a session invalidates pending
links but does not physically delete those rows until expiry cleanup/user deletion.
Database constraints complement server validation; issuer SQL checks alone are not
a full URL validator. Keep the application role untrusted for arbitrary DML.

**Idempotency is supplied by `schema_migrations`, not by raw SQL.** Direct reruns
of CREATE TABLE fail. The runner sorts 001–007, wraps each file and its ledger
insert in one transaction, and skips committed filenames on serial reruns. It
has no global migration/advisory lock and no checksums: permit exactly one runner,
verify deployed SQL against the reviewed commit, and investigate schema/ledger
drift before proceeding. A late failure can leave earlier files committed; do
not assume the whole batch rolled back. No automatic down migrations exist.
DDL and rollback rehearsals are NOT TESTED here.

## Exact manual Auth0 verification steps

1. In a separate staging tenant, open **Applications → Applications → Create
   Application → Regular Web Application**. Create a dedicated confidential
   client; leave the existing M2M application unchanged. Under application
   credentials/advanced OAuth settings select `client_secret_post` (the current
   exchange sends credentials in the form body). Enable only Authorization Code
   for the linking application; disable client credentials, implicit, password
   and refresh-token grants. Enable only the intended user identity connections.
2. Set Allowed Callback URLs to exactly
   `https://<canonical-staging-host>/api/account-link/callback`. No wildcard,
   fragment, alternative path or query. Use a separate production client with its
   exact production host later. Leave logout URLs/origins empty when unused; if
   required, restrict them to the canonical HTTPS origin. Website logout remains
   the existing local session deletion.
3. Open **Applications → APIs → the existing MCP API → Settings**. Confirm exact
   API Identifier (`AUTH0_AUDIENCE`), RS256 signing and access-token profile.
   Scroll to **Access Token Settings → JSON Web Token (JWT) Profile**
   and inspect the selected value (Auth0 or RFC 9068), or reviewed resource-server
   `token_dialect`: `access_token_authz` uses `azp`;
   `rfc9068_profile_authz` uses `client_id`. Record the actual configured value,
   not an assumption based on the default. Follow the
   [current profile settings guide](https://auth0.com/docs/get-started/apis/configure-access-token-profile). Enable RBAC and Add Permissions in
   the Access Token. Define/assign `jobs:read` to the test user via a role.
   Do not change the existing production profile to satisfy a sandbox test.
4. Check issuer discovery and JWKS using the same tenant/custom domain. Verify
   `/authorize`, `/oauth/token`, RS256, code grant and S256 support, and exact
   redirect matching. Set server-only staging names from the existing guide:
   `AUTH0_ISSUER`, `AUTH0_AUDIENCE`, `AUTH0_INTERACTIVE_CLIENT_IDS`,
   `AUTH0_LINK_CLIENT_ID`, `AUTH0_LINK_CLIENT_SECRET`, `APP_BASE_URL`,
   `AUTH0_LINK_REDIRECT_URI`, plus existing `DATABASE_URL`/`RATE_LIMIT_SECRET`.
   The allowlist must contain only this reviewed client. Keep production
   `AUTH0_LINK_ENABLED=false`; enable it only in isolated staging for validation.
5. After staging migrations, sign into the website, initiate from `/connect`,
   sign into Auth0 and inspect validation results server-side without logging
   tokens. Confirm exact stable user sub, expected client claim, correct single
   audience, permissions, expiry, nonce and `at_hash`. Verify wrong verifier,
   reused code, wrong client and callback are rejected by Auth0. If audience or
   `at_hash` differs, leave linking off and commission a separate compatibility
   review. No insecure fallback or email lookup is approved.
6. Exercise two website accounts and two sessions for one account; deny consent,
   replay/duplicate state or code, expire/logout during exchange, attempt
   cross-account identity reuse, then owner unlink and website deletion. Verify
   row counts and unchanged other-user data in the staging database. Confirm
   revocation/deletion procedures in Auth0 separately.
7. Test the actual MCP connection's interactive OAuth client and issuer/subject
   against the link. If it uses a separate client, the current one-client linking
   restriction needs a separately reviewed allowlist design. Never substitute
   an M2M access token. Retain sanitized evidence before any activation decision.

These steps follow [Auth0's regular web app code flow](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow/add-login-auth-code-flow),
[S256 exchange](https://auth0.com/docs/get-started/authentication-and-authorization-flow/authorization-code-flow-with-pkce/call-your-api-using-the-authorization-code-flow-with-pkce),
and [ID-token validation](https://auth0.com/docs/secure/tokens/id-tokens/validate-id-tokens).

## Safe production deployment and rollback sequence (operator only)

1. Keep `AUTH0_LINK_ENABLED=false` and MCP quotas off. First obtain successful
   CI production builds, disposable PostgreSQL tests, browser regressions and
   staging Auth0 evidence. Install no system packages as part of this audit.
2. Select the reviewed release and record the production database identifier,
   schema, migration ledger, PostgreSQL version, app-role grants and rollback
   release. Do not print a connection URL/secret. Verify 001–003 and ledger agree;
   confirm 004–007 are pending and no conflicting/manual objects exist.
3. Arrange a maintenance window and ensure a single migration operator. Take a
   provider snapshot/PITR checkpoint plus an encrypted `pg_dump --format=custom`
   using a protected service/credential file, not a command-line password.
   Preserve roles/grants securely. Verify archive listing, checksums and a full
   restore into an isolated database, including users, sessions and ledger.
   Record RPO/RTO; an untested backup is not a rollback plan.
4. Rehearse the runner on the restored staging clone with external notifications
   disabled. Apply 004 → 005 → 006 → 007, serially; verify constraints/indexes,
   ledger entries, app/deletion-role permissions and repeat-run skip behavior.
   Configure controlled `public` search_path and reviewed connection-level lock
   and statement timeouts; the runner itself does not set migration timeouts.
5. Only after approval and backup validation, an operator selects production
   credentials and manually runs `pnpm db:migrate`. It runs **all pending** files.
   Inspect each committed ledger entry; halt on errors and reconcile partial
   progress. Recheck row counts, sessions, website quota behavior, missing/invalid
   auth rejection and disabled linking. No user creation/backfill is required.
6. Deploy the successfully built artifact with linking off. App-role grants need
   transaction SELECT/INSERT/DELETE; external identity SELECT/INSERT/UPDATE/DELETE;
   SELECT and sufficient UPDATE privilege for row locks on users/sessions. Review
   existing deletion-tool permissions. No new sequence privileges are required.
   Configure expired-transaction cleanup, retention and initiation-abuse controls;
   redact callback query strings and token-exchange bodies in proxy/APM logs.
7. Verify the production client/configuration with controlled test accounts only
   after separate authorization. Keep linking off until the complete live checklist
   passes. A successful disabled deployment alone does not approve activation.
   MCP quota/subscription enforcement remains a separate future release.
8. **Rollback:** first disable linking and stop new initiations; drain in-flight
   requests. Prefer redeploying the reviewed prior app while retaining additive
   tables and ledger. Never drop usage/identity tables to undo an app deployment.
   For migration failure, retain successful earlier files and repair forward after
   review. If database restore is unavoidable, stop writers, preserve a forensic
   copy, restore into a separate verified target, validate and switch deliberately;
   account for writes since the checkpoint. Reverse-order table removal
   (007,006,005,004) is only an explicitly approved offline destructive operation
   after exporting new data and verifying no dependents; use no blanket CASCADE
   and change only matching ledger records. No rollback SQL was executed or
   provided for automatic production use.

## Reproducibility and remaining blockers

All 25 `tests/*.test.mjs` files were attempted individually with Node's native
TypeScript support, so a failed setup did not hide later suites:

```sh
for test_file in tests/*.test.mjs; do
  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$test_file"
done
npx tsc --noEmit
npm run lint
npm run build
npm run build -- --webpack
```

The six PostgreSQL setup failures are `account-deletion`, `identity-linking`,
`monetization`, `rate-limit`, `retention-safeguards`, and `website-matching-quota`.
They create private temporary clusters and never fall back to `DATABASE_URL`.
Their assertions did **not** execute successfully. All seven browser scripts were
attempted; CDP access failed before UI assertions. Build diagnostics and test
output were retained outside the repository under `/tmp/phase4-audit-*`; no raw
credentials or tokens were added to the report. Fonts and security checks remain.

Remaining approval blockers: successful PostgreSQL and browser security runs;
a production build in an unrestricted CI environment; actual Auth0 profile,
client grant and end-to-end validation; backup/restore and serial migration
rehearsal; operational cleanup, log-redaction, abuse/revocation/recovery review.
Production migrations and activation remain manual and unauthorized by this audit.
