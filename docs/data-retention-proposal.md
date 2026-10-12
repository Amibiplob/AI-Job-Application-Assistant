# Data retention proposal

**INTERNAL PROPOSAL - NOT AN IMPLEMENTED OR APPROVED RETENTION POLICY.**
Phase 7D, Part 1. Evidence baseline:
`8a5f2c23b4332949a793620e3645cefe19007be5`.

No new retention durations are chosen here. The seven-day session lifetime and
limiter windows referenced below already exist in code; neither is a promise
that stored rows are deleted then. This work adds no cleanup task, migration or
production operation. Provider settings, secrets and real records were not
inspected. Actual deployed configuration needs operator verification.

## Category inventory and proposed approach

Each retention approach and deletion mechanism marked proposed requires operator
approval and, where applicable, separate implementation and isolated tests.
"No intentional persistence" is limited to the reviewed application paths; it
does not establish the absence of provider, client, log or backup copies.

| Category | Storage location | Currently verified behavior | Proposed retention approach (not approved) | Risks | Operator decisions required | Possible deletion mechanism |
| --- | --- | --- | --- | --- | --- | --- |
| User accounts | PostgreSQL `users`: UUID, name, normalized email, password hash, timestamps | Remain without an inactivity/age cleanup rule. Operator utility can delete the exact website UUID. | Keep while needed for the approved service relationship; define requested deletion, inactivity and beta-end handling. | Indefinite unused accounts; email enumeration; sensitive hashes; separate identities. | Purpose, duration/trigger, inactivity notice, exceptions and beta-end plan. | Existing approved operator account deletion; future inactivity cleanup only after separate approval. |
| Saved resumes, including older rows | PostgreSQL `resumes`: full text, name, owner, timestamps | Latest row displayed; updates overwrite that row. Multiple rows can exist; no automatic purge or individual delete UI. All owned rows cascade on website deletion. No revision-history table. | Keep current user-requested content; minimize hidden/obsolete rows through a separately approved process, not silently during this task. | Hidden older resumes; concurrent creates; sensitive or third-party content; old values in backups. | Whether to support versions, access to older rows, retention, user notice and per-resume deletion. | Existing whole-account cascade. Proposed owner-scoped older-row/per-resume removal requires implementation and testing. |
| Application notes, dates and statuses | PostgreSQL `applications`, linked to `users` and shared `jobs` | Created/updated on request; blank notes can be cleared by update. No archive/age cleanup or individual record delete UI. Account cascade removes all owned records. | Retain for the approved tracking purpose; decide treatment of completed/withdrawn records and closed beta. | Sensitive free-text notes; unneeded old tracking history; job association can reveal interests. | Duration, archive/inactivity triggers, exceptions, individual removal and beta closure. | Existing account cascade; proposed owner-scoped record deletion. Updating fields is not verified erasure of backups. |
| Website sessions and expired rows | PostgreSQL `sessions`; browser `session` cookie | Seven-day expiry; lookup rejects expired rows. Logout deletes current row/cookie. Account cascade deletes all sessions. No automatic expired-row cleanup. | Keep usable sessions only as needed for authentication; approve periodic removal of expired rows separately. | Expired-row accumulation; sensitive session identifiers; other active sessions survive logout. | Cleanup cadence, any approved security-evidence need, session lifetime review and all-session revocation workflow. | Existing logout/account cascade. Proposed bounded cleanup constrained to `expires_at <= now()` after review; no job added here. |
| MCP submitted resume/job-description text and results | HTTP/SDK/analysis request memory and client responses; ChatGPT/other client's own records | Analysis logic writes no text/history to PostgreSQL and does not echo full inputs. Limiter writes separate counters. No application result-history store. | Preserve request-scoped application processing with no new text/history persistence; confirm client/provider handling separately. | Chat/connector copies; results disclose detected skills; provider logging/debug capture; no application control over client history. | Client/provider policies and controls, observability inventory, any future feature changing persistence. | Request memory becomes eligible for reclamation, not verified secure wiping. Client/provider deletion processes for separate copies. |
| Website job-analysis input and results | Submitted title/company/description in request and returned action state; React draft memory; saved resume and existing job text separately in PostgreSQL | No additional analysis input/result DB writes or external AI call. In-memory draft can survive client navigation. Refresh/logout normally discard it; confirmed leave clears draft. | Preserve no analysis-history persistence; retain drafts only for the current workspace interaction. Saved resume retention remains separate. | Browser memory/history/cache; descriptions returned to browser; infrastructure processing; broad existing UI wording. | Approved public wording, browser behavior checks, logging controls and any future history feature. | Existing draft lifecycle. No DB analysis record to delete; saved resumes/other copies use their own mechanisms. |
| Rate-limit counters | PostgreSQL `abuse_rate_limits`: policy, bucket, capped count, expiry | Atomic reuse/reset after window expiry, not deletion. HMAC inputs include transient source/email/verified identity; raw values are not stored. At most 524290 rows through current code. No automatic cleanup or account cascade. | Retain bounded security state only for approved abuse purposes; choose whether expired unused buckets need maintenance. Do not equate bounded storage with approved retention. | Stable pseudonymous buckets; collisions/shared budgets; indefinite unused rows; deleting/rotating keys can reset protection. | Retention after expiry, maintenance authority, secret rotation and privacy-request treatment of shared buckets. | Existing row reuse. Proposed expired-row maintenance only after review; never delete active/shared buckets as an ad hoc account-deletion step. |
| Runtime logs and operational diagnostics | Hosting/runtime, PostgreSQL and Auth0/provider systems; any operator-held diagnostic exports | Limiter suppresses raw errors/identities. Many actions return generic errors. No repository-defined central log retention/redaction rule. Local stdio diagnostics can print error messages. Actual provider capture is unverified. | Minimize collection, prohibit bodies/secrets in intentional diagnostics, prefer aggregate status/load metrics; approve retention per verified log source. | IPs, URLs/search terms, headers, errors or bodies may appear in provider/debug logs; broad no-logging claims would be inaccurate. | Inventory, access, redaction, provider limits, export duration, incident exceptions and deletion capability. | Provider controls and restricted export disposal after approval; may not support selective erasure. No cleanup is implemented here. |
| Auth0 user information, tokens and grants | Auth0 tenant/provider records; MCP bearer token/verified claims in request memory; OAuth client token storage outside this app | Website schema has no Auth0-user link/token store. Server verifies signed JWTs locally. Token/profile/grant/log retention and refresh-token use are not established by repo. | Keep only approved identity/authorization data needed by each scope; minimize claims and independently define provider/client lifecycle. | Website deletion does not revoke MCP; issued JWTs may remain valid until expiry; provider/client copies; false email-based identity matching. | Tenant fields/region/logs, actual access/refresh lifetimes, revocation, grants, account deletion and provider retention. | Separately authorized Auth0/client process. No Management API deletion/revocation workflow is implemented in this application. |
| Backups, branches, snapshots, PITR and exports | Database/hosting/provider recovery systems and any operator-created copies; exact inventory unverified | Repository sets no backup expiry or restore-deletion process. Active DB deletion does not directly erase historical copies. Tests create synthetic private local clusters and remove them. | Approve finite recovery retention, restricted access and expiry for every verified copy; keep deleted data out of active use and reapply deletion decisions before restoration is exposed. | Recovery can resurrect deleted data; branches/exports can outlive production; selective removal may be unavailable. | Actual provider plan/settings, durations, regions, export inventory, access, restore workflow and evidence. | Verified provider expiry/deletion and approved disposal of copies; restricted restore followed by reapplication and verification. No new per-request full backup. |
| Privacy/deletion request records | Proposed restricted operator register and support channel; no application request table/mail integration | Existing deletion docs recommend minimal scoped outcome records; storage/channel/retention are not implemented or verified. Utility outputs counts and status, not personal text. | Record minimum reference, verification outcome, scope, operator/time and fulfillment evidence; retain only for an approved purpose and duration. | Verification documents or copied resume/credentials create new sensitive datasets; identifiers retained for restore handling require protection. | Contact/register owner, access, verification evidence minimization, retention, applicable deadlines and restore linkage. | Separately approved restricted register/support deletion workflow; no new DB table or email sent here. |

## Decisions and approval record

For **each** category, the operator must record the purpose, scope, retention
start event, duration or objective deletion criterion, exception rationale,
responsible person, storage/provider details, mechanism and verification method.
Do not fill in a number merely because the beta is small or a provider offers a
default. Record the verified provider constraint and distinguish it from an
operator-selected period. Decide how the beta will end before collecting data.

No proposal authorizes a legal hold, indefinite retention or automatic erasure.
If an exception is needed, obtain applicable review, limit its scope and access,
document its release condition and communicate approved information accurately.

Before public commitment, either implement/test the approved rule or establish a
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

Existing tests exercise synthetic owner isolation, analysis without persistence,
local JWT validation, limiter windows/privacy and transactional deletion. None
is evidence of provider backup/log expiry or execution of an approved schedule.
