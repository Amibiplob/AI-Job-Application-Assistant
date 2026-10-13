# Privacy-request handling checklist

**INTERNAL OPERATOR PREPARATION - verification method, contact and secure register
still need approval.** Updated for Phase 7D.2. This checklist creates no public endpoint,
export service, email integration or authority to delete an account.

The Phase 7D.1 baseline is `6e7613b`, updated with the
[Phase 7D.2 safeguards](retention-operations.md). Use this alongside
[manual website account deletion](manual-website-account-deletion.md).
No live deletion or live dry-run was performed while preparing these documents.

## What is implemented and what is missing

The utility accepts an exact website UUID, operator-supplied database URL,
database-name check, explicit mode and matching deletion confirmation. These are
technical execution guards, not requester identity verification or proof of a
human operator's authority. The database authenticates its connection role, not
the requester. Possession of a UUID, an email address, a matching Auth0 email or
access to the script is not sufficient authorization.

An approved requester-verification procedure, working request channel, restricted
register, account-resolution workflow and responsible operator are prerequisites
for real requests. The application does not yet implement these workflows.
Applicable rights/deadlines must be determined separately; this checklist sets
no response deadline or legal entitlement.

## Operator preparation (manual decisions)

- [ ] Approve operator identity, monitored public privacy contact, backup coverage
  for the contact channel, and request escalation responsibilities.
- [ ] Approve proportionate identity verification for website-only, Auth0-only
  and combined requests, including lost-access and authorized-representative
  cases. Define what constitutes adequate evidence; do not improvise on receipt.
- [ ] Decide how access/correction/export requests can be fulfilled securely.
  There is no automated export/profile-edit workflow. Do not promise one before
  the manual workflow is approved and tested.
- [ ] Define a restricted register, minimal fields, access, retention and secure
  delivery method. The request-record approach is provisionally 90 days, separate
  from application data. Approve its start event, unresolved-request treatment,
  reviewed exceptions and protected restore linkage before collection. No new
  request storage or automatic disposal is implemented. Minimize evidence; do not retain identity
  documents by default or copy personal content into general logs/Git/issues.
- [ ] Restrict operator machine, repository/script execution and database
  credentials to authorized operators. Use a separate approved operator role:
  database CONNECT, schema USAGE, SELECT on the five reviewed public tables,
  DELETE on users/resumes/applications/sessions for the utility's locks/deletion.
  No superuser or DELETE on shared jobs is required. Do not expose the role or
  `ACCOUNT_DELETION_DATABASE_URL` to route handlers, MCP or customers.
- [ ] Confirm a verified TLS connection for remote databases and secure credential
  delivery. The CLI does not load `.env` or fall back to `DATABASE_URL`.
- [ ] Inventory independent Auth0, ChatGPT/client, support, log, backup, branch
  and export scopes and name their authorized handlers. Approve restore handling.
- [ ] Rehearse authorized and unauthorized requests, uncertain commits and
  partial provider failures with synthetic data in an isolated environment.

## Per-request procedure

1. **Receive and minimize.** Record a request reference, receipt time, requested
   action and scope in the approved register. Acknowledge through the approved
   channel under the operator-approved schedule. Ask the person not to send
   passwords, cookies, tokens, client secrets or a full resume as proof. If
   sensitive data is volunteered, restrict it and follow approved handling.
2. **Verify authority before lookup/disclosure or deletion.** Apply the approved
   requester procedure and record the verification outcome, not reusable secrets.
   Verification still pending means no deletion and no account-data disclosure.
   Escalate uncertain/lost-access requests; do not treat knowledge of an email
   or a request received from it as automatically sufficient proof.
3. **Agree scope.** Distinguish website account/data deletion from Auth0/MCP
   identity/authorization handling, client chat records and other copies. Explain
   irreversible website deletion and its limitations. If access/export is
   requested first, use the approved secure workflow before deletion; this
   utility does not implement it. Resolve any legally reviewed exceptions without
   inventing one or promising immediate complete erasure.
4. **Resolve identities independently.** Obtain the exact canonical lowercase
   internal website UUID through the authorized administrative workflow. Verify
   any Auth0 identity separately using its own approved process. Never link or
   delete across systems just because emails match; no identity mapping exists.
5. **Verify the database target and permission to proceed.** Independently check
   host/Neon branch, environment, database, schema and approved request. The
   CLI's database-name comparison is necessary but not proof of the correct
   production target because names can be reused. Use the approved secret
   mechanism, not command-line connection strings or a copied production `.env`.
6. **Review the count-only dry-run.** Use the existing documented CLI procedure
   only after authorization. It runs a read-only transaction, rolls back and
   reports user/resume/application/session counts, including older resumes and
   expired sessions. It does not print email, content, notes, hashes or session
   IDs. Counts are a snapshot, not proof the later delete will have identical
   counts. Investigate unexpected counts or schema refusals; do not bypass them.
7. **Approve and execute website deletion.** Follow the established explicit
   delete/confirmation procedure with the exact UUID. Schedule low traffic:
   reviewed deletion locks briefly block writes to personal-data tables. The
   utility checks table/FK structure, uses lock/statement timeouts, deletes one
   user with cascading children, verifies zero counts and commits together.
   It refuses unexpected dependencies, triggers, policies or schema changes.
8. **Independently verify completion.** After reported
   `website-database-deleted`, run an authorized fresh dry-run and confirm zero
   users/resumes/applications/sessions. Preserve minimal counts, scope, operator,
   target reference, timestamps and outcome in the restricted register. On
   synthetic fixtures, also verify another user/shared jobs remain unchanged
   and a previously valid session no longer authenticates. Do not query other
   live users' contents as completion evidence.
9. **Handle separate scopes.** Use separately approved provider processes for
   the exact Auth0 identity, grants, refresh tokens, sessions and relevant logs.
   Do not infer immediate access-token revocation: locally verified issued JWTs
   can remain valid until expiry. For ChatGPT/other client records, provide
   verified current account instructions or refer to the appropriate account/
   workspace administrator; the website cannot erase those records.
10. **Handle retained copies and close accurately.** Restrict deleted-data copies
    from active use and record separately verified backup/branch/export/log/
    support handling and expiry. No new full-data backup per request. Keep any
    restoration restricted until approved deletion decisions are reapplied and
    verified. Notify the requester using the approved channel with completed
    scope, remaining scope and limitations. Mark the request complete only under
    the approved criteria, not merely because one command was issued.

## Failure and recovery decisions

| Outcome | Operator action |
| --- | --- |
| Schema/target/argument refusal | Stop. Recheck authorization/target and investigate the schema. Do not disable constraints, edit the utility ad hoc or bypass its refusal. |
| Known SQL/lock failure before commit | Utility attempts rollback. Review restricted status, resolve contention/cause and perform a fresh dry-run before any approved retry. Never assume success. |
| Lost connection or uncertain commit acknowledgement | Outcome may be committed or rolled back. Reconnect through the approved mechanism and run a fresh dry-run before retrying or notifying. Zero counts establish current website scope, not erasure of all copies. |
| `not-found` | Confirm target and zero dependent counts. Record already-absent website scope; do not claim this execution performed a new deletion or that all systems are empty. |
| Website succeeded, provider operation failed | Track separate pending scope, escalate and retry only that scope under approval. Do not recreate the website account or claim overall completion. |
| Provider succeeded, website operation failed | Record separate outcome, verify website state and retry the authorized website scope when safe. Operations are not one distributed transaction. |
| Requester verification fails or scope is disputed | No destructive action or personal-data disclosure. Follow approved escalation/response handling. |

## Boundaries to communicate

- Website deletion removes all website-owned resume/application/session rows,
  but not shared jobs or rate-limit buckets. Buckets can be shared and have no
  user FK; do not delete them or rotate the secret as an account-deletion shortcut.
- Browser cookies may remain until expiry, but absent sessions cannot authenticate.
  Open pages, already delivered responses and completed/in-flight work cannot be
  remotely erased by deleting a database row.
- Auth0 and client records, provider logs, backups/PITR, branches, exports and
  request/support records need their own authorized handling. Some systems may
  offer expiry rather than selective deletion; verify, do not assume.
- Resume replacement and manual expired-session maintenance are approved and
  implemented as scoped safeguards, not provider erasure. The provisional 90-day
  request-record approach still needs a secure workflow, clock start and exception
  review. Do not apply it to accounts/resumes/applications, or communicate complete
  erasure, implemented register disposal or compliance without evidence/review.

## Technical evidence

`scripts/account-deletion.ts` checks options, exact reviewed table/FK graph,
database identity, constraint enforcement and post-delete counts in a transaction.
`scripts/delete-website-account.mjs` requires the dedicated operator connection
and prints generic failures/count-only outcomes. `tests/account-deletion.test.mjs`
tests dry-run nonmutation, multiple/older owned rows, isolation, invalid sessions,
transaction rollback, uncertain commit, schema refusal and non-superuser operation
in a private disposable PostgreSQL cluster. It is not requester identity proof or
evidence of live provider erasure. Do not run operator deletion commands against
live databases as part of this documentation task. The existing automated tests
exercise the CLI only against disposable synthetic databases.
