# Privacy notice draft

**INTERNAL DRAFT - NOT APPROVED FOR PUBLICATION.** Phase 7D, Part 1.
This is review material, not the service's published privacy notice or a legal
compliance determination. Do not serve this document at `/privacy` or put its
placeholders on customer-facing pages. No retention or production behavior is
changed by this document.

Evidence baseline: repository commit
`8a5f2c23b4332949a793620e3645cefe19007be5`. Statements below describe reviewed code,
not an inspection of live user records, secrets, provider settings or contracts.
The operator reports that Phase 7C is deployed and normal requests work; this
document does not independently verify that deployment.

All `[INTERNAL REVIEW: ...]` items must be resolved before publication. See the
[retention proposal](data-retention-proposal.md),
[request checklist](privacy-request-handling-checklist.md) and
[publication checklist](privacy-publication-checklist.md).

## Product and operator

AI Job Application Assistant helps people save resume text, compare recognized
skills with job descriptions, search job records and keep application notes and
statuses. Tracking a job does not submit an application to an employer. The
current tools disclose demonstration listings and unverified job records.

Despite the product name, the implemented website and MCP comparisons use a
fixed skill dictionary and deterministic text overlap, not an external language
model. A score is not a hiring probability or a complete assessment of a person.
ChatGPT may separately generate conversational responses when used as the MCP
client.

- Operator: [INTERNAL REVIEW: verified operator identity and service address or
  other identification required for the approved notice. Do not infer identity
  from a local filesystem path or repository author.]
- Privacy contact: [INTERNAL REVIEW: operator-supplied, working public contact
  email and any approved alternative request channel. No address is assigned.]
- Effective date and version: [INTERNAL REVIEW: set only for the approved public
  notice, not for this draft.]
- Scope: [INTERNAL REVIEW: confirm the website, remote MCP service, closed-beta
  audience and jurisdictions to which the final notice applies.]

## Account information

Website signup receives a name, email, password and password confirmation. The
website trims and lowercases the email. PostgreSQL stores an internal user UUID,
name, email, account timestamps and an Argon2id password hash. The reviewed
signup/login code does not insert the plaintext password or confirmation into
the database or return them in form state. Passwords are processed to create or
verify the hash. Hashes remain sensitive authentication data.

The website displays account name/email in the authenticated workspace. Signup
can reveal that an email is already registered through its existing duplicate
account message. No website email-verification, password-reset or MFA workflow
is implemented in the reviewed code; Auth0 settings are separate and unverified.

## Saved resumes and application records

Saving a resume stores its name and full text, user association, internal UUID
and timestamps in PostgreSQL. Its text can include whatever personal information
the user chooses to provide, such as work history or contact details. These are
text database columns; no application-level field encryption is implemented.

The editor normally updates the displayed resume. The schema also allows
multiple resume rows, and the website retrieves only the most recently updated
one. Earlier rows are not automatically removed. This is not an implemented
version-history feature or a guarantee that older copies have been erased.

Application tracking stores a user/job association, status, optional applied
date, notes, internal UUID and timestamps. Users can update these fields; notes
can contain personal information. The reviewed interface has no individual
resume/application deletion control. Website account deletion covers all owned
rows, including older resumes, using the operator process described below.

Avoid including unnecessary sensitive information, secrets or another person's
confidential information in resumes, notes or pasted descriptions.

## Authentication cookies and sessions

Website login/signup creates a random session UUID stored in PostgreSQL with a
user association, creation timestamp and expiry. The browser receives a
`session` cookie containing that identifier, not the password. The implemented
lifetime is seven days. The cookie is HttpOnly, SameSite=Lax, path `/`, and
Secure when `NODE_ENV` is `production`.

Expired sessions do not authenticate. Expiration does not delete their database
rows. Logout deletes the current session row and browser cookie, not every
session for the account. Website account deletion removes all its session rows;
remaining browser cookies cannot authenticate against the deleted rows.

[INTERNAL REVIEW: confirm deployed cookie behavior and the actual inventory of
hosting, Auth0, client and other cookies. No blanket claim that this is the only
cookie, or that a particular consent rule applies, is approved.]

## Website analysis processing

Website analysis reads the authenticated user's saved resume and compares it
with either a database job description or a submitted description. The pasted
workflow also receives job title and company for display, not skill matching.
The reviewed actions add no analysis input/history/result database records and
make no external AI/model API call. The saved resume and any existing job record
remain stored independently.

Pasted title/company/description and results are returned to the user's browser.
The analysis draft is kept in React memory scoped to the authenticated workspace,
not localStorage, sessionStorage or IndexedDB. It can survive client navigation
and Back/Forward while that layout remains mounted. Confirmed leave navigation
clears the draft; refreshing or logging out normally discards that in-memory
state. This is not a promise of secure erasure from browser memory or caches.

Hosting infrastructure processes requests, and PostgreSQL supplies the saved
resume. "No external AI call" does not mean "no infrastructure provider processes
the data." Runtime logging and provider copies need separate verification.

## Remote MCP, Auth0 and ChatGPT

Remote MCP offers `search_jobs`, `get_job_details` and `analyze_job_match`.
Search/details read job records and return job information with source
disclosures. They do not retrieve website accounts, saved resumes or application
records, and do not submit applications.

For `analyze_job_match`, the client sends resume and job-description text to the
MCP server. Its analysis logic validates the supplied text and computes results
in memory. It has no database dependency and does not intentionally persist that
text or analysis history. The result returns skill names, score and explanatory
text, not the full submitted resume or description. Results can still convey
information about the submitted text. The surrounding HTTP service uses the
database for rate-limit counters.

When ChatGPT is the client, supplied text travels through ChatGPT and may be part
of the user's chat or connector records. The application cannot delete those
records or determine their retention from its own code. Other MCP clients have
their own handling too. Prefer short, anonymized excerpts and review the client's
current policies and account/workspace controls before sharing information.

Auth0 handles the connection's interactive authentication/authorization. The
MCP server receives a bearer access token and verifies its signature, issuer,
single configured audience, expiry and required `jobs:read` permission. It uses
verified client identity and, when supplied, the signed subject for admission.
Tokens and claims are present in request/authentication memory; there is no
application token/profile table or token persistence in the reviewed handler.
Auth0 records, OAuth grants and any client-held refresh tokens are separate.

Website users/sessions and Auth0 identities are **not linked or synchronized**.
Matching email addresses do not establish a link. Website deletion neither
deletes Auth0 identities nor revokes MCP authorization. Issued JWT access tokens
may remain usable until expiry because the server verifies them locally rather
than checking a revocation list on each request.

[INTERNAL REVIEW: verify Auth0 tenant identity fields, granted claims, connection
settings, token lifetimes/revocation, log retention and client storage. Verify
the actual ChatGPT account/workspace practices; do not claim zero retention or
that conversations are or are not used for training.]

## Processing purposes and abuse protection

The implemented processing supports website account authentication, storage and
display of user-owned resume/application data, job lookups, requested skill
comparisons, and shared abuse protection for signup/login and remote MCP.

The limiter transiently uses submitted normalized email, a trusted Vercel source
IP when available, and verified Auth0 client/subject as inputs to secret-keyed
HMAC bucket selection. PostgreSQL stores only policy, bounded bucket number,
attempt count and expiry. It does not store raw IPs, emails, tokens, passwords,
resumes or descriptions in the limiter table. These buckets are not a basis for
claiming complete anonymity; the operator controls the secret and collisions
can share a bucket. They have no user-account foreign key.

Failed and successful attempts both consume budgets. Counters reset on reuse
after a window expires; expiry is not row deletion. The limiter intentionally
does not log its request identifiers or raw errors. This does not establish a
no-logging guarantee for the framework, SDK or providers.

[INTERNAL REVIEW: confirm any additional support, analytics, business or legal
purposes before stating them. No sale/advertising/training claim or legal basis
is inferred solely from the absence of corresponding application code.]

## Providers and international processing

The project context identifies Vercel hosting, Neon PostgreSQL, Auth0 MCP
authentication and ChatGPT as a supported external MCP client. Repository
configuration/code supports those integration roles, but provider account
settings, agreements, regions and subprocessors have not been inspected.

[INTERNAL REVIEW: verify each provider's actual role, applicable terms and data
processing agreement, data categories, regions, access, logging, backups,
deletion and subprocessors. Distinguish operator-selected service providers
from services selected or independently controlled by the user.]

The beta is intended for international users. Do not infer data residency from
a domain, request-serving region or operator location.

[INTERNAL REVIEW: identify operator/user jurisdictions, actual processing and
backup locations, any applicable cross-border requirements and safeguards with
qualified review. No residency, transfer compliance or provider security
certification guarantee is made in this draft.]

## Retention and deletion

No approved general retention schedule is encoded in the reviewed application.
Accounts, saved resumes, application records, expired session rows and unused
rate-limit rows can remain until separately deleted. A session lifetime or
rate-limit window is not a database retention period. See the proposal for the
category-by-category decisions still required.

[INTERNAL REVIEW: approve retention purposes, triggers, periods, exceptions,
provider-copy handling and enforcement before replacing this paragraph with
public commitments. No new numeric period has been selected.]

An operator-only utility can delete one verified website user and cascade to
all owned resumes, applications and sessions in a checked transaction. It
verifies zero remaining rows in those categories before commit. It does not
authenticate the requester; the operator must use an approved verification
procedure. There is no customer-facing deletion endpoint or automated export.

The utility does not delete shared jobs, limiter buckets, Auth0, ChatGPT,
infrastructure logs, support/request records, backups, branches or exports.
Previously delivered browser data and in-flight requests are not remotely
erased. Each separate scope must be verified and tracked, including restrictions
and deletion reapplication before a backup is restored to active use.

## Privacy requests and rights

[INTERNAL REVIEW: approve the public contact, requester verification method,
request register, response workflow and applicable rights/deadlines for the
jurisdictions in scope. Do not publish a guaranteed response time or universal
legal entitlement without that review.]

The proposed operator process accepts questions and requests concerning access,
correction, deletion and other rights determined to apply. Resume/application
editing already exists; account profile editing, full data export and other
request fulfillment need separately approved operator workflows. Any identity
evidence should be proportionate and minimized. Never ask a requester to email
passwords, cookies, tokens or a full resume as proof of ownership.

## Security and notice changes

Reviewed controls include Argon2id password hashing, restricted session-cookie
attributes, server-side session checks, parameterized database queries,
user-scoped resume/application queries, verified Auth0 JWT authorization, bounded
shared rate limits and explicit operator confirmation/schema checks for website
deletion. These reduce particular risks; they do not guarantee security or
establish compliance. Operator access controls, TLS/database encryption,
monitoring, backup handling and provider configuration still require review.

[INTERNAL REVIEW: approve a change/version process, effective dates and how users
will receive any required notice of material changes. Do not promise email
notifications before a working and approved notification process exists.]

## Evidence for reviewers

- Accounts/sessions: `app/signup/actions.ts`, `app/login/actions.ts`, `lib/auth.ts`,
  `migrations/001_initial_schema.sql`, `migrations/002_auth_sessions.sql`.
- Stored workspace: `lib/resumes.ts`, `lib/applications.ts`,
  `app/dashboard/resume/actions.ts`, `app/dashboard/applications/actions.ts`.
- Website analysis: `app/dashboard/analyze/actions.ts`,
  `app/dashboard/jobs/[jobId]/actions.ts`, `lib/job-matching.ts`,
  `components/jobs/analysis-draft.tsx`, `app/dashboard/analyze/analyze-form.tsx`.
- Remote MCP: `app/api/mcp/route.ts`, `lib/mcp/auth0-auth.ts`,
  `lib/mcp/job-tools.ts`, `lib/mcp/register-job-analysis-tool.ts`.
- Abuse records: `lib/rate-limit.ts`, `lib/mcp/abuse-protection.ts`,
  `migrations/003_rate_limits.sql`, `docs/abuse-protection.md`.
- Deletion: `scripts/account-deletion.ts`,
  `scripts/delete-website-account.mjs`, `docs/manual-website-account-deletion.md`.
- Existing disclosures: `app/page.tsx`, `app/connect/page.tsx`,
  `app/signup/page.tsx`, `app/dashboard/resume/page.tsx`.

Relevant existing tests cover analysis/input handling, owner-scoped queries,
cookie/session navigation, Auth0 verification, rate-limit privacy and deletion
rollback/verification. They do not establish provider retention or legal approval.
