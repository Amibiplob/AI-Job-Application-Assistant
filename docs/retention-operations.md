# Retention safeguards and operator maintenance

Phase 7D.2 implements the approved closed-beta resume/session safeguards.
This is internal operational guidance, not a public privacy notice or authority
to inspect/delete production records. No production data or settings were
accessed while implementing/testing these changes. No `/privacy` page is added.

## Approved policy and implemented scope

- Retain the current saved resume until authorized deletion. After a successful
  user-requested replacement, remove superseded rows belonging to that user.
- Keep seven-day website session validity and existing cookie/logout behavior.
  Clean expired session rows periodically through an approved operator process.
- Preserve application records until authorized deletion. Website and MCP
  analysis add no history/text store; Auth0 and bounded limiter behavior are
  unchanged. No log/backup deletion or privacy-request table is implemented.
- Privacy-request records have a **provisional 90-day retention approach**, separate
  from application data. No register/channel/access workflow is implemented.
  The operator must approve the start event, handling of unresolved requests,
  any reviewed exceptions, restore-deletion linkage and secure disposal before
  collecting records. This is not an account/resume/session retention period or
  a legal response deadline. See the [request checklist](privacy-request-handling-checklist.md).

Provider log/backup/token practices and applicable legal requirements remain
unverified. A product-policy approval does not approve a provider guarantee.

## Website resume behavior

`lib/resumes.ts` obtains the authenticated website user from the session and uses
one dedicated PostgreSQL connection per save. It locks that user's `users` row
before reading/writing resumes, serializing cooperating writers across instances.
No new table, unique constraint, migration or background job is introduced.

- First save inserts one resume. An identical repeated first save returns the
  current record without creating another row. A different stale create request
  is rejected, not used to overwrite the latest resume. Refresh before retrying.
- The current row is selected by `updated_at DESC, created_at DESC, id DESC`.
  A current-ID update writes the new validated name/text, preserves that UUID,
  then deletes other rows with the same authenticated owner in the transaction.
  No old row is removed before the replacement write succeeds.
- Foreign IDs, absent IDs and older legacy IDs are rejected without replacement
  or pruning. Concurrent edits of the same current ID remain last-successful-save
  wins, as before; this is not optimistic version control or a revision history.
- A failed replacement/prune rolls back together, retaining previous rows. A
  lost commit acknowledgement is reported as uncertain; refresh and inspect the
  current resume before retrying, rather than assuming failure means no commit.
- Reads, analysis, deployment and migration runs do not prune legacy rows. A
  successful future current-resume replacement can prune that user's legacy
  rows. There is no bulk legacy cleanup scheduled on deployment.

New saves require a nonblank trimmed name of at most 200 characters and nonblank
content of at most 50,000 characters, measured by JavaScript UTF-16 string length.
Content and line breaks are not trimmed or truncated. The content textarea does
not clip oversized pastes; server validation returns field errors and retains
the draft. Existing oversized content remains readable and unchanged until the
user supplies a valid replacement. The editor has no new upload/history feature.

### Legacy review procedure (not executed)

1. Leave untouched legacy rows in place unless the user saves a valid replacement
   through the reviewed path or separately authorizes deletion.
2. For an exceptional operator-assisted cleanup, verify requester authority,
   website UUID, environment/branch/database and purpose through the existing
   request process. The account utility's authorized count-only dry-run can
   establish how many owned resumes exist; do not expose their text in logs.
3. Review the current row using the same ordering, including timestamp ties and
   whether content is empty/oversized. Do not infer which version the person
   wants from a name, age or matching Auth0 email. Use an approved secure workflow
   for any necessary access/export; none is added by this task.
4. Prefer a user-confirmed valid replacement in the website. If a separate bulk/
   legacy cleanup is genuinely needed, prepare an identity-specific reviewed
   plan with explicit kept row, transaction/owner lock, ownership predicates,
   confirmation, rollback and isolated tests. No such bulk deletion is approved
   or executed by this implementation. Whole-account deletion remains the
   established separately authorized utility.
5. Verify the intended surviving resume and unchanged unrelated accounts. Track
   provider/backups separately; deleting active rows is not complete erasure.

## Expired-session cleanup CLI

The utility is operator-only, not imported into routes and not run by login,
logout, build or deployment. Run from the repository using a dedicated
`SESSION_CLEANUP_DATABASE_URL` supplied by your approved secret mechanism. It
does not load `.env`, accept connection strings as arguments or fall back to
`DATABASE_URL`. Do not print connection strings, put them in shell history/Git,
or reuse customer-accessible credentials. Verify TLS for a remote database.

Before any live operation, independently verify the target Neon project/branch,
host, database, environment, role and approval. The database-name argument alone
does not distinguish databases with the same name in different environments.
Rehearse on synthetic isolated data first. **These commands require operator
approval and were not run against production.**

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/cleanup-expired-sessions.mjs --database-name EXACT_DATABASE_NAME --batch-size 100 --dry-run
```

Dry-run uses a read-only repeatable-read transaction and rolls back. It returns
only `{ status, eligible, batchSize }`, where `eligible` is capped at the batch
size, **not the total backlog**. It does not output session IDs, users, cookies or
connection details. Counts can change between runs.

After approving the dry-run and target, execute one confirmed batch:

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON scripts/cleanup-expired-sessions.mjs --database-name EXACT_DATABASE_NAME --batch-size 100 --delete --confirm EXACT_DATABASE_NAME
```

Deletion requires an exact database-name confirmation and an explicit mode.
Missing/duplicate/unknown/conflicting arguments fail before connection. Batch
size defaults to 100 and must be an integer from 1 to 1000. There is no unbounded
loop, caller-supplied cutoff or "delete all" mode.

The utility checks ordinary `public.sessions` table structure, UUID primary/
owner keys, non-null timestamptz expiry, the reviewed immediate validated users
FK, and absence of RLS, inheritance, rules, custom/disabled triggers and incoming
FK dependencies. Refusal means investigate; do not bypass the checks.

Cleanup uses the database transaction-start timestamp, bounded ordered selection
and a second expiry predicate on DELETE. Sessions active at transaction start
remain untouched, even if they expire while cleanup waits/runs. A short session
table write lock stabilizes schema and serializes cleanup processes; it can
briefly delay login/logout writes but does not prevent ordinary session reads.
Lock timeout is 5 seconds; each statement timeout is 15 seconds, not a guarantee
of a 15-second total transaction. Existing expiry index supports batch selection.

Success returns only `{ status: "expired-sessions-deleted", deleted, batchSize }`.
Run a fresh dry-run to assess remaining eligible work. If approved, run another
explicit batch; do not add an unchecked shell loop against production.

### Failure and recovery

- SQL/schema/permission failures attempt rollback and produce generic safe
  errors, without raw connection or row details. Resolve the cause and run a
  fresh dry-run before any approved retry.
- A lost COMMIT acknowledgement may mean the batch committed. Fresh dry-run
  identifies currently eligible work, not necessarily the previous batch or its
  exact count. A newly approved retry still selects only expired rows. Record
  uncertainty; do not claim an exact deletion count from a failed command.
- Never compensate by deleting active sessions, resuming an uncertain
  transaction on a pooled connection, or disabling constraints. The CLI closes
  its dedicated connection after success/failure.
- The utility touches only expired session rows in the selected website DB.
  Browser cookie handling, Auth0 tokens, resumes, applications, jobs and limiter
  buckets are outside its scope. Backup/log copies remain independently handled.

## Permissions, deployment and future scheduling

No migration or new website/Vercel secret is required. Before deploying, verify
the application role has its existing resume SELECT/INSERT/UPDATE privileges,
plus DELETE on resumes and SELECT plus UPDATE privilege on at least one users
column (for `SELECT ... FOR UPDATE`; `UPDATE(id)` suffices). The code does not
update user values. Existing owners may already have these privileges. Do not
grant rights automatically or change production settings during implementation.

The cleanup operator needs database CONNECT, public schema USAGE and SELECT,
DELETE on `public.sessions`; no superuser, user-data writes, UPDATE or permissions
on unrelated application tables are required. Dry-run requires only the read
permissions. Keep this dedicated connection off the deployment and client.

Deploy the safeguards only after role review and isolated verification. Drain
old deployments/long-lived tabs before claiming all writes follow the new path:
old code or direct SQL writers do not take the owner lock, and the existing
schema still allows multiple resumes. A rollback does not restore superseded
rows already removed by successful user saves; it can resume old duplicate
creation. No recovery promise is made for those active rows or backup copies.

Periodic cleanup is approved as an operator responsibility, but no cadence or
scheduler is configured here. Assign an operator and choose/record a practical
maintenance cadence for the beta. After explicit operational approval, a trusted
scheduled runner could invoke the same confirmed single-batch CLI with isolated
credentials, target checks, nonoverlap, timeouts, aggregate outcome monitoring,
failure alerts and a stop mechanism. Evaluate capacity/backlog and provider cost
before approving that runner. Do not expose a public cleanup endpoint or assume
Vercel/Neon automatically schedules this script.

## Verification and remaining gates

`tests/retention-safeguards.test.mjs` creates a private temporary PostgreSQL cluster
with TCP disabled and synthetic data. It loads migrations only there, exercises
real transactions/concurrency/rollback/schema refusal and CLI behavior, and
removes the cluster afterward. It never reads a deployment/test database URL.
Existing auth, MCP and limiter tests must also pass; see the publication checklist
for the commands. No production migrations, cleanup or records are used.

Contact email/operator details, secure request workflow/register, provisional
request-period start/exceptions, legal/jurisdiction review, provider regions/
logs/backups/revocation and public wording/links remain publication/beta privacy
gates. Approving product retention does not resolve those decisions.
