# Data retention proposal

**INTERNAL RETENTION RECORD - PARTIALLY APPROVED, NOT A PUBLIC POLICY.**
Phase 7D.2 updates the Phase 7D.1 baseline `6e7613b` with the safeguards described
in [retention operations](retention-operations.md). Approval of product policy
does not establish provider capabilities or legal compliance. Provider settings,
secrets and real records were not inspected; live deployment remains unverified.

Approved beta scope: retain the current resume until deletion and remove
superseded rows after successful replacement; maintain seven-day session validity
and periodically clean expired rows through an operator utility; preserve
application records until authorized deletion and analysis without added history.
Rate-limit storage remains bounded and unchanged. No automatic scheduler or
deployment-time legacy cleanup is introduced.

Privacy-request records have a **provisional 90-day** retention approach, separate
from application data. No request-record store is created. Start event, exceptions,
secure register/access workflow and restore linkage still require review. Existing
session validity and limiter windows are not storage-erasure promises.

## Category inventory and proposed approach

Items explicitly marked approved/implemented below reflect Phase 7D.2. Other
proposals require approval and, where applicable, separate implementation/tests.
"No intentional persistence" is limited to the reviewed application paths; it
does not establish the absence of provider, client, log or backup copies.

| Category | Storage location | Currently verified behavior | Approved policy or remaining proposal | Risks | Operator decisions required | Deletion mechanism (implemented or proposed) |
| --- | --- | --- | --- | --- | --- | --- |
| User accounts | PostgreSQL `users`: UUID, name, normalized email, password hash, timestamps | Remain without an inactivity/age cleanup rule. Operator utility can delete the exact website UUID. | Keep while needed for the approved service relationship; define requested deletion, inactivity and beta-end handling. | Indefinite unused accounts; email enumeration; sensitive hashes; separate identities. | Purpose, duration/trigger, inactivity notice, exceptions and beta-end plan. | Existing approved operator account deletion; future inactivity cleanup only after separate approval. |
| Saved resumes, including older rows | PostgreSQL `resumes`: full text, name, owner, timestamps | Owner-locked first save/retry avoids duplicates. Current-ID replacement and removal of other owned rows commit together. Reads/deployment do not prune legacy rows; stale IDs/creates are rejected. New writes enforce 200-character names/50,000-character content; existing oversized text stays readable. | Approved: retain current resume until deletion; remove superseded rows only after successful replacement. No revision-history feature or bulk migration cleanup. | Legacy rows remain until replacement/deletion; old writers/direct SQL can bypass locking; sensitive content and backup copies. | Legacy identity-specific assistance, operator role grants, rollout/draining old writers, public wording and provider-copy handling. | Implemented transactional user-scoped replacement/prune; existing whole-account cascade. Separate exceptional legacy cleanup requires a reviewed plan, not automatic SQL. |
| Application notes, dates and statuses | PostgreSQL `applications`, linked to `users` and shared `jobs` | Created/updated on request; blank notes can be cleared by update. No archive/age cleanup or individual record delete UI. Account cascade removes all owned records. | Approved: preserve until authorized deletion. No new age/status cleanup. | Sensitive free-text notes; unneeded old tracking history; job association can reveal interests. | Beta closure, any future policy change, exceptions and individual removal workflow. | Existing account cascade; individual deletion remains a proposal. Updating fields is not verified erasure of backups. |
| Website sessions and expired rows | PostgreSQL `sessions`; browser `session` cookie | Seven-day expiry; lookup rejects expired rows. Logout deletes current row/cookie; account cascade deletes all. Operator-only bounded cleanup with read-only dry-run/confirmation now exists; no scheduler runs it. | Approved: keep validity seven days and periodically remove expired rows through the operator process. | Backlog if operator does not run maintenance; sensitive identifiers; brief write contention; other active sessions survive logout. | Assign operator/cadence, dedicated credentials/role, target review and any future scheduler approval. | Implemented single-batch cleanup with DB transaction-start expiry cutoff and 1-1000 row bound, default 100; existing logout/account cascade. |
| MCP submitted resume/job-description text and results | HTTP/SDK/analysis request memory and client responses; ChatGPT/other client's own records | Analysis logic writes no text/history to PostgreSQL and does not echo full inputs. Limiter writes separate counters. No application result-history store. | Preserve request-scoped application processing with no new text/history persistence; confirm client/provider handling separately. | Chat/connector copies; results disclose detected skills; provider logging/debug capture; no application control over client history. | Client/provider policies and controls, observability inventory, any future feature changing persistence. | Request memory becomes eligible for reclamation, not verified secure wiping. Client/provider deletion processes for separate copies. |
| Website job-analysis input and results | Submitted title/company/description in request and returned action state; React draft memory; saved resume and existing job text separately in PostgreSQL | No additional analysis input/result DB writes or external AI call. In-memory draft can survive client navigation. Refresh/logout normally discard it; confirmed leave clears draft. | Preserve no analysis-history persistence; retain drafts only for the current workspace interaction. Saved resume retention remains separate. | Browser memory/history/cache; descriptions returned to browser; infrastructure processing; broad existing UI wording. | Approved public wording, browser behavior checks, logging controls and any future history feature. | Existing draft lifecycle. No DB analysis record to delete; saved resumes/other copies use their own mechanisms. |
| Rate-limit counters | PostgreSQL `abuse_rate_limits`: policy, bucket, capped count, expiry | Atomic reuse/reset after window expiry, not deletion. HMAC inputs include transient source/email/verified identity; raw values are not stored. At most 524290 rows through current code. No automatic cleanup or account cascade. | Retain bounded security state only for approved abuse purposes; choose whether expired unused buckets need maintenance. Do not equate bounded storage with approved retention. | Stable pseudonymous buckets; collisions/shared budgets; indefinite unused rows; deleting/rotating keys can reset protection. | Retention after expiry, maintenance authority, secret rotation and privacy-request treatment of shared buckets. | Existing row reuse. Proposed expired-row maintenance only after review; never delete active/shared buckets as an ad hoc account-deletion step. |
| Runtime logs and operational diagnostics | Hosting/runtime, PostgreSQL and Auth0/provider systems; any operator-held diagnostic exports | Limiter suppresses raw errors/identities. Many actions return generic errors. No repository-defined central log retention/redaction rule. Local stdio diagnostics can print error messages. Actual provider capture is unverified. | Minimize collection, prohibit bodies/secrets in intentional diagnostics, prefer aggregate status/load metrics; approve retention per verified log source. | IPs, URLs/search terms, headers, errors or bodies may appear in provider/debug logs; broad no-logging claims would be inaccurate. | Inventory, access, redaction, provider limits, export duration, incident exceptions and deletion capability. | Provider controls and restricted export disposal after approval; may not support selective erasure. No cleanup is implemented here. |
| Auth0 user information, tokens and grants | Auth0 tenant/provider records; MCP bearer token/verified claims in request memory; OAuth client token storage outside this app | Website schema has no Auth0-user link/token store. Server verifies signed JWTs locally. Token/profile/grant/log retention and refresh-token use are not established by repo. | Keep only approved identity/authorization data needed by each scope; minimize claims and independently define provider/client lifecycle. | Website deletion does not revoke MCP; issued JWTs may remain valid until expiry; provider/client copies; false email-based identity matching. | Tenant fields/region/logs, actual access/refresh lifetimes, revocation, grants, account deletion and provider retention. | Separately authorized Auth0/client process. No Management API deletion/revocation workflow is implemented in this application. |
| Backups, branches, snapshots, PITR and exports | Database/hosting/provider recovery systems and any operator-created copies; exact inventory unverified | Repository sets no backup expiry or restore-deletion process. Active DB deletion does not directly erase historical copies. Tests create synthetic private local clusters and remove them. | Approve finite recovery retention, restricted access and expiry for every verified copy; keep deleted data out of active use and reapply deletion decisions before restoration is exposed. | Recovery can resurrect deleted data; branches/exports can outlive production; selective removal may be unavailable. | Actual provider plan/settings, durations, regions, export inventory, access, restore workflow and evidence. | Verified provider expiry/deletion and approved disposal of copies; restricted restore followed by reapplication and verification. No new per-request full backup. |
| Privacy/deletion request records | Proposed restricted operator register and support channel; no application request table/mail integration | Minimal records are recommended; secure storage/channel/access workflow is still unimplemented and unverified. Utility outputs counts/status, not personal text. | Provisional 90 days for minimal request records only; not application-data retention or a response deadline. No store added here. | Verification evidence creates new sensitive data; deletion-restore linkage may conflict with disposing all request evidence. | Approve start event, unresolved-request handling, reviewed exceptions, contact/register owner, access/minimization and protected restore linkage before collection. | Manual secure register disposal after workflow approval; no app cleanup, DB table or email integration. |

## Decisions and approval record

For **each** category, record the approved or still-proposed purpose, scope, retention
start event, duration or objective deletion criterion, exception rationale,
responsible person, storage/provider details, mechanism and verification method.
Do not fill in a number merely because the beta is small or a provider offers a
default. Record the verified provider constraint and distinguish it from an
operator-selected period. Decide how the beta will end before collecting data.

No proposal authorizes a legal hold, indefinite retention or automatic erasure.
If an exception is needed, obtain applicable review, limit its scope and access,
document its release condition and communicate approved information accurately.

The resume and session mechanisms are implemented but still need deployment/role
review and manual maintenance. Before any public commitment, implement/test the
remaining approved rules or establish a
realistic assigned manual process. The notice must reflect what can actually be
performed, including remaining copies and provider limitations.

## Deletion boundaries and recovery

The existing utility deletes only `users`, owned `resumes`, `applications` and
`sessions` in the connected website database. It does not remove shared `jobs`,
`abuse_rate_limits` or independent copies. A website UUID cannot identify an
Auth0 account, and a rate-limit bucket can represent several identities.

Changing a secret or deleting a bucket is not a verified individual-erasure
mechanism and may weaken abuse protection. No such operation is approved here.
Expired counters can be reused indefinitely; future maintenance must preserve
atomic admission and avoid granting new budgets by deleting active rows.

Restores must remain restricted until approved deletion decisions are reapplied
and checked. Define a minimal protected linkage for that purpose without copying
deleted data into general audit logs. Provider operations and website deletion
are not one transaction. Follow the
[privacy-request checklist](privacy-request-handling-checklist.md) for partial or
uncertain outcomes; never promise that every copy was erased by one command.

## Implementation evidence

- `migrations/001_initial_schema.sql`, `migrations/002_auth_sessions.sql` and
  `migrations/003_rate_limits.sql` define reviewed persistent categories.
- `lib/auth.ts`, `lib/resumes.ts` and `lib/applications.ts` define session,
  latest-resume and owner-scoped workspace behavior.
- `app/dashboard/analyze/actions.ts`, `app/dashboard/jobs/[jobId]/actions.ts`,
  `components/jobs/analysis-draft.tsx` and
  `app/dashboard/analyze/analyze-form.tsx` define website analysis/draft handling.
- `lib/mcp/job-tools.ts`, `lib/mcp/auth0-auth.ts`,
  `lib/mcp/abuse-protection.ts` and `lib/rate-limit.ts` define MCP processing and
  bounded counters, not a provider-retention policy.
- `scripts/account-deletion.ts`, `scripts/delete-website-account.mjs` and
  [manual deletion guidance](manual-website-account-deletion.md) define the
  implemented website-only deletion boundary.

`tests/retention-safeguards.test.mjs` additionally tests real resume save/prune
transactions, concurrent first saves, legacy/read behavior, limits and bounded
session cleanup/dry-run/failure recovery on synthetic private PostgreSQL. These
and existing tests are not evidence of provider expiry, live maintenance or a
working privacy-request register.
