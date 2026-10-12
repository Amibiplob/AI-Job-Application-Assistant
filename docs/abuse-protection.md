# Phase 7C: Authentication and Remote MCP Abuse Protection

Protection uses the existing Neon PostgreSQL database, with no new paid service.
Every admission performs a parameterized INSERT ... ON CONFLICT DO UPDATE.
PostgreSQL locks the conflicting primary-key row across all serverless instances;
the returned counter is the decision, with no read/check/write race. Windows
start with the first request and expire using the database clock. Counts saturate
at limit + 1; denied requests do not extend the window. At a window boundary a
new budget is available, so short bursts across two windows are possible.

## Conservative Beta Defaults

| Policy (environment name) | Requests | Window | Boundary |
| --- | ---: | ---: | --- |
| AUTH_GLOBAL | 100 | 60 seconds | All signup and login attempts combined |
| LOGIN_SOURCE | 20 | 900 seconds | Trusted source |
| LOGIN_ACCOUNT | 10 | 900 seconds | Normalized submitted email |
| SIGNUP_SOURCE | 5 | 3600 seconds | Trusted source |
| SIGNUP_ACCOUNT | 3 | 3600 seconds | Normalized submitted email |
| MCP_GLOBAL | 300 | 60 seconds | All remote GET, POST, DELETE requests |
| MCP_SOURCE | 120 | 60 seconds | Trusted source, including unauthorized requests |
| MCP_IDENTITY | 60 | 60 seconds | Verified Auth0 client and subject |
| MCP_JOBS | 30 | 60 seconds | Verified identity; search/details share budget |
| MCP_ANALYSIS | 10 | 60 seconds | Verified identity; analysis executions |

Override each policy with `RATE_LIMIT_<POLICY>_LIMIT` and/or
`RATE_LIMIT_<POLICY>_WINDOW_SECONDS`. Limits must be integers from 1 to 1000000,
windows from 1 to 86400 seconds. Every override is validated on every admission.
Deploy identical settings to every instance using the same database and secret.
Mixed settings during rolling deployments can affect counters; coordinate changes.

All attempts, including malformed forms, duplicate signups, invalid passwords,
successful logins, and successful signups, consume admission budgets. Counters
are never reset on success. Global and source budgets are consumed before account
budgets. Earlier admissions stay consumed when a later check denies the request.
Rejection precedes user queries, Argon2id work, and session creation. Existing
password/session security and duplicate-email messages remain in place.

MCP admission precedes JWT verification. Unauthorized traffic consumes global
and source budgets and retains the SDK's 401/403 challenges while under budget.
At exhaustion it receives 429; when limiter configuration/storage fails it gets
503. Both include `Retry-After` and `Cache-Control: no-store`. Verified tokens
provide `clientId` and, when present, their signed `sub`; tokens without `sub`
share the client's budget. Token rotation does not reset identity budgets.
Tool callbacks enforce their budgets using the SDK's validated HTTP auth context,
before job queries or deterministic analysis. Tool denials retain an HTTP 200
MCP tool result with `isError: true` and safe retry text; transport admissions use
HTTP 429/503. The three tool schemas and demonstration-job disclosures are
unchanged. Stdio is local and retains its existing two-tool behavior.

## Privacy and Storage Bound

Keys use a domain-separated HMAC-SHA256 with `RATE_LIMIT_SECRET`, then map to
65536 fixed buckets per policy. Only policy, bucket number, saturated counter,
and expiry are stored. No IP, email, token, password, resume or job description
is persisted by the limiter. No request data or database errors are logged.
Emails are normalized and capped at the accepted 254-character input boundary.
Each identity always uses the same bucket; a rare collision shares a budget
and can cause conservative false rejection, never additional admission. This
tradeoff bounds storage without an externally scheduled cleanup or arbitrary
identity growth: at most 524290 rows (eight identity policies plus two global
rows). Rows are reused at expiration, not appended for every window. There is
no required cleanup job. Optional deletion of expired rows should only run as
routine maintenance; never delete active rows to resolve abuse.

The raw source is used transiently only when the server environment has
`VERCEL=1`, using a single syntactically valid `x-vercel-forwarded-for` IP.
IPv6 spellings are canonicalized. No generic `Forwarded`, `x-forwarded-for`,
`x-real-ip`, or client-supplied deployment assertion is accepted. This relies
on requests entering through Vercel's edge, as described in the
[Vercel request-header documentation](https://vercel.com/docs/headers/request-headers#x-vercel-forwarded-for).
Do not manually set `VERCEL=1` for a publicly accessible self-hosted origin.
Missing/malformed trusted headers and non-Vercel deployments share a single
fallback source budget, rather than accepting spoofable identities. Local
development is protected with this shared fallback too. A proxy ahead of Vercel
may share its source budget across clients. Confirm the actual beta ingress
path before launch; changing headers does not prove a trusted source.

## Deployment Checklist

1. Review `migrations/003_rate_limits.sql`. Back up using normal operator practice,
   confirm the target Neon branch/database, and apply with `pnpm db:migrate` as
   an explicit operator action before deploying the code. Implementation/tests
   never apply migrations to the configured deployment database. The migration
   only adds a new table and does not alter existing user data.
2. Give the application role SELECT, INSERT, UPDATE on `abuse_rate_limits`. Use
   the existing Neon connection convention; pooled Neon connections are suitable
   because enforcement is a single SQL statement without session state.
3. Generate a separate cryptographically random secret (for example
   `openssl rand -hex 32`) and set `RATE_LIMIT_SECRET` in Vercel for each protected
   environment. Do not reuse Auth0 credentials or expose it to the browser. Keep
   it stable across instances. Rotation changes bucket assignments and may grant
   fresh budgets; coordinate rotations and avoid rotating during active abuse.
4. Set any overrides, deploy, then smoke-test synthetic login/signup accounts,
   invalid/missing MCP tokens, authorized tool calls, 429 retries, and outage
   responses on a separate staging Neon branch. Confirm the Vercel header
   boundary and that no public origin bypasses it. Never run destructive fixtures
   on production. The automated DB fixtures create private temporary local
   clusters and never accept `DATABASE_URL`.
5. Monitor aggregate HTTP status counts and database load without logging bodies,
   source identifiers, submitted emails, tokens, or secrets. Review these beta
   limits against actual usage before increasing them. Configure sensible Neon
   role statement timeouts and connection limits for the deployment workload.

Missing/short secret, invalid overrides, missing table, permission errors, malformed
query results, or database outages fail closed with a generic 60-second retry.
Website Server Actions return safe form state; they cannot set a transport 429
through this return contract. Missing Auth0 configuration continues to return
the existing no-store 503. There is no in-memory fallback or disable switch.
Existing sessions remain usable; signup/login and remote MCP require working
limiter configuration/storage. Deploying before setup will block those flows.
`DATABASE_URL` remains the repository's required startup configuration; without
it the existing PostgreSQL module refuses to initialize. Do not serve a deployment
that cannot initialize its database configuration.

## Verification and Remaining Risks

Run `node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON
--test tests/*.test.mjs`, `pnpm exec tsc --noEmit`, `pnpm lint`,
`pnpm build --webpack`, and `git diff --check`. Database tests require local
PostgreSQL 16 server binaries; set `ACCOUNT_DELETION_TEST_POSTGRES_BIN` for a
temporary distribution. They create isolated private Unix-socket clusters with
TCP disabled and synthetic data, then stop and remove them.

These limits protect application work, not network-level DDoS or serverless
invocation/DB billing. Every attempt still reaches the limiter database; global
counter contention can become a bottleneck under flooding. Use Vercel's existing
edge protections and deployment monitoring. NATs, fallback sources, shared OAuth
clients without subjects, and bucket collisions can cause shared-budget denial.
Attackers with many valid sources/identities can exhaust global budgets. Targeted
account lockout remains possible through the email budget. Signup duplicate-email
messages still reveal account existence, as before. Limits cap work starts per
window, not simultaneous in-flight requests or long-lived transport duration.
They do not protect unrelated authenticated website mutations, public page
rendering, or OAuth metadata reads. This phase adds no CAPTCHA, MFA, or recovery
system. Production setup and smoke tests remain required before opening beta.
