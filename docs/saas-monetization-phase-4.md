# SaaS monetization Phase 4: interactive identity linking

## Delivery and activation boundary

Phase 4 adds a server-side Authorization Code + PKCE S256 account-link flow and
an authenticated status panel on `/connect`. It preserves PostgreSQL website
sessions, existing MCP `jobs:read` enforcement, and website entitlements. It does
not enable MCP billing, quota admission, payments, or email-based linking.

**Not production ready.** No dedicated real Auth0 interactive application or live
end-to-end token verification was available during this task. The endpoints fail
closed with 503 unless the complete configuration and `AUTH0_LINK_ENABLED=true`
are supplied. Missing identity tables also fail closed. The flag is an operator
activation decision, not automated proof of Auth0 tenant configuration. Leave it
false in production until the checklist below passes. No production migrations
or user-data modifications were performed; nothing was pushed.

The initial worktree already contained a Phase 4 draft. This delivery audits and
completes those task-related changes. Audited Phase 1 `2f3c607`, Phase 2
`3775654`, Phase 3 `f3f5b25`, the Phase 3 document, website sessions, MCP JWT
verification, identity store, deletion tooling and migrations 004–007.

## Security behavior and findings

- Initiation is POST only, requires an exact configured Origin and same-origin
  Fetch Metadata when present, and obtains user and session IDs only from
  `getSession()`. Existing website authentication is retained.
- Each transaction has independent cryptographic random state, verifier and
  nonce. Only the SHA-256 state hash is stored. The verifier stays in
  the server database and is never returned to the browser. Transactions expire
  after five minutes. The public state, nonce and S256 challenge travel in the authorization
  request as required by OAuth; no tokens or client secret do.
- The callback requires the exact configured HTTPS origin/path and the same
  still-valid website session. Duplicate state/code parameters, denial, missing
  code and invalid state fail. Atomic DELETE RETURNING consumes state before
  token exchange, including failed exchanges; retries require a new initiation.
- Token exchange uses fixed issuer-derived endpoints, the exact callback URI,
  server-side confidential client authentication, S256 verifier, no redirect
  following, no caching and a ten-second timeout. Tokens are held only in memory
  and discarded. No refresh-token scope is requested.
- RS256 signatures, JWKS, issuer, expiry, API audience, client ID, and
  `jobs:read` permissions are checked through the existing verifier. The ID
  token must have the exact single client audience, matching subject and nonce,
  matching `azp` if present, and a valid `at_hash` binding the access token.
  Machine grants, client subjects and `@clients` identities cannot link.
- The existing verified external identity store exclusively writes the mapping.
  Its unique constraints prevent cross-account reassignment or replacement.
  There is no email lookup, merge, or automatic linking.
- A race in the draft was closed: after OAuth exchange the identity write
  revalidates and locks the original session through commit, so logout during
  the exchange cannot leave a new mapping. Concurrent logout is serialized at
  this check; a session already revoked or expired is rejected.
- Redirects use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  Errors are generic, without secrets, provider response bodies or token logs.
  Configure proxy/APM logs to redact callback query strings and token-endpoint
  request/response bodies too; application code cannot enforce upstream logging.
- Account deletion now validates, counts and cascade-deletes pending link rows.
  Provider-account deletion, Auth0 grant revocation and operator unlink remain
  separate operations. Existing unlink primitives remain owner scoped; no new
  public unlink endpoint is exposed.

The existing MCP verifier intentionally rejects multi-audience access tokens and
requires `permissions`, rather than accepting an arbitrary `scope` string. Auth0
OIDC flows may issue a second `/userinfo` audience. This is a potential live
compatibility blocker: do not weaken the existing verifier to bypass it. Likewise
this flow deliberately requires `at_hash`, even though some code-flow ID tokens
may omit it. Verify the real token profile; unsupported profiles fail closed and
require a separately reviewed compatibility change before activation.

## Environment names (never publish values)

| Name | Requirement |
| --- | --- |
| `DATABASE_URL` | Existing server-only website database configuration |
| `AUTH0_ISSUER` | Exact HTTPS tenant/custom-domain issuer, ending `/` |
| `AUTH0_AUDIENCE` | Existing exact MCP API audience |
| `AUTH0_INTERACTIVE_CLIENT_IDS` | Only the reviewed dedicated interactive client ID; this flow requires one entry |
| `AUTH0_LINK_CLIENT_ID` | Dedicated confidential Regular Web Application ID, matching that allowlist |
| `AUTH0_LINK_CLIENT_SECRET` | Server-only secret for that application, 32–512 characters |
| `APP_BASE_URL` | Canonical HTTPS website origin, no path/query/fragment |
| `AUTH0_LINK_REDIRECT_URI` | Exactly `${APP_BASE_URL}/api/account-link/callback` |
| `AUTH0_LINK_ENABLED` | Default `false`; set `true` only in the reviewed environment |
| `RATE_LIMIT_SECRET` | Existing independent abuse-protection secret; unchanged |

Never use `NEXT_PUBLIC_` for these credentials. Never reuse the existing M2M
application as the interactive application or add its ID to the allowlist.

## Auth0 configuration and live verification checklist

1. In a non-production tenant/environment, create a dedicated **Regular Web
   Application**. Use confidential `client_secret_post` authentication matching
   the implemented token exchange. Enable Authorization Code with PKCE S256;
   disable client credentials, implicit, password and unused grants. Do not
   enable refresh tokens for this one-shot linking flow.
2. Register exactly `https://<canonical-host>/api/account-link/callback` as the
   Allowed Callback URL; no wildcards. This implementation supports HTTPS only.
   Keep Allowed Logout URLs and Web Origins empty if unused; if tenant policy
   requires them, use only the canonical website origin, without wildcards.
   Website logout continues deleting the local PostgreSQL session; it does not
   use Auth0 logout or replace website authentication.
3. Configure the existing API audience with RS256 and RBAC/permissions so the
   individual user is authorized for `jobs:read` and receives it in `permissions`.
   Confirm a stable end-user `sub`, the expected `azp`, exact issuer/audiences,
   ID-token nonce and `at_hash`. Confirm these match the strict profile above.
   Do not export or paste actual tokens into documentation, logs or chats.
4. Review Auth0 discovery/JWKS and token endpoint using the same issuer/custom
   domain. Check exact endpoint origins, signing algorithm, token authentication
   method and authorization-code support. This implementation derives standard
   Auth0 endpoints; it does not trust browser-supplied discovery URLs.
5. Apply reviewed migrations to a disposable/staging database first. Set the
   complete staging configuration, then explicitly enable the staging flag.
   Test website login → `/connect` → link → Auth0 login/consent → callback →
   linked status. Confirm website session ID is preserved, and database mapping
   contains only the exact verified issuer/subject pair.
6. Exercise denial, wrong state/nonce/verifier, callback replay, duplicate query
   fields, token expiry, wrong audience/issuer/client, M2M tokens, expired and
   revoked sessions, logout during exchange, login as another website user,
   same-user different sessions, concurrent callbacks, and attempts to link one
   Auth0 account to two website accounts. Test owner unlink and website deletion.
   Confirm all failures leave mappings unchanged and disclose no secrets.
7. Verify that the actual MCP interactive connection presents the **same Auth0
   issuer/subject**, has the authorized interactive client and `jobs:read`, and
   resolves to the intended website owner. Dedicated website linking alone does
   not establish that ChatGPT's OAuth client is configured for end-user tokens.
   The current one-client restriction may require an explicit architecture review
   before supporting a separate MCP interactive client.
8. Record successful staging evidence, review provider deletion/revocation and
   identity-recovery operations, verify logging redaction, then separately decide
   production activation. Keep quotas disabled throughout this phase.

Auth0 references: [Authorize with PKCE](https://auth0.com/docs/api/authentication/authorization-code-flow-with-pkce/authorize-with-pkce),
[Exchange a PKCE code](https://auth0.com/docs/api/authentication/authorization-code-flow-with-pkce/get-token-pkce),
[Regular web app code exchange](https://auth0.com/docs/api/authentication/authorization-code-flow/get-token).

## Migration and operational requirements

Production migrations **004, 005, 006 and new 007 remain unapplied**. Review their
SQL, backup/restore and deployment plan before an operator manually runs the
existing `pnpm db:migrate` process against an explicitly selected environment.
Do not run it casually: it applies every pending migration. Build/startup do not
run migrations. 007 adds only `account_link_transactions` and its indexes/checks,
with a cascading user FK and no backfill. It intentionally has no session FK;
all creation/consumption/final linking checks independently validate sessions.

The application role needs SELECT/INSERT/DELETE on link transactions,
SELECT/INSERT/UPDATE/DELETE on external identities (idempotent linking uses an
ON CONFLICT UPDATE), existing
user/session SELECT plus row-lock permissions (which require UPDATE privilege
on at least one column of each locked table). Migration 006 uses a UUID default
and needs no sequence privileges. Use least privilege; do not grant
DDL privileges to the app. Treat the transaction table and backups as sensitive.
Schedule a trusted database cleanup for expired transaction rows, e.g.
`DELETE FROM public.account_link_transactions WHERE expires_at < now()`.
Expiry blocks use immediately even before cleanup; cleanup is required to remove
abandoned protocol secrets and prevent unbounded storage. A dedicated initiation
rate limit should be reviewed before public rollout under expected traffic.

## Verification in this environment

Run the existing suites with native TypeScript support (not a global tsx ESM
loader, which changes existing named-export behavior):

```sh
for test_file in tests/*.test.mjs; do
  node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON "$test_file" || exit 1
done
npx tsc --noEmit
npm run lint
npm run build
```

Tests cover protocol request construction, configuration failures, server-only
exchange, signature/issuer/audience/client/nonce/subject/hash/expiry rejection,
M2M exclusion, CSRF, authenticated route guards, malformed and replayed callbacks,
private redirects, unchanged onboarding, scopes and identity primitives.
PostgreSQL tests additionally cover concurrent state consumption, original
session binding, revocation/expiry, identity conflicts and deletion cascades.

Local results: 19 test files passed. Six PostgreSQL-backed files could not run:
`account-deletion`, `identity-linking`, `monetization`, `rate-limit`,
`retention-safeguards`, and `website-matching-quota`. `/usr/lib/postgresql/16/bin`
exists but contains neither `initdb` nor `postgres`; their setup fails rather than
falling back to any external database. PostgreSQL assertions are therefore
**unverified here** and must run with local PostgreSQL 16 server binaries.

TypeScript and ESLint pass. The default production build failed fetching Google
Fonts; a network-enabled retry passed that point but failed on Turbopack's local
port binding (`Operation not permitted`). The Webpack fallback was also attempted
and failed parsing the spawned TypeScript `--showConfig` output. No successful
production build is claimed. The manual browser CDP regression could not run
because its Chrome CDP/fixture services were absent. No live Auth0 tenant flow
was executed. These are outstanding validation blockers, not passing checks.

## Blockers before enabling MCP quotas

Obtain and verify the dedicated real interactive configuration and strict token
profile, run PostgreSQL and browser security regressions and a production build
in a capable environment, review/apply migrations separately, validate the real
MCP interactive issuer/subject/client path, and establish revocation/recovery,
logging and transaction-cleanup operations. Then separately design atomic MCP
entitlement/quota enforcement. This phase does not turn on MCP metering and does
not integrate Paddle or Stripe.
