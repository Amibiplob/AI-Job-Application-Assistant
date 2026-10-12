# Privacy publication checklist

**INTERNAL RELEASE GATE - `/privacy` IS NOT CREATED BY THIS PHASE.**
Phase 7D, Part 1. All items below require evidence/approval; unchecked items are
not completed merely by committing these documents. No placeholder belongs on
a customer-facing page.

Review [notice draft](privacy-notice-draft.md),
[retention proposal](data-retention-proposal.md),
[request handling](privacy-request-handling-checklist.md) and
[existing deletion procedure](manual-website-account-deletion.md) together.
The evidence baseline is `8a5f2c23b4332949a793620e3645cefe19007be5`; reconfirm any
behavior changed after that commit. Provider settings/contracts were not audited.

## Decisions the operator must make manually

- [ ] Verify and approve the operator identity and any address/identification
  appropriate for the final notice. Do not infer personal details from Git or
  local machine paths.
- [ ] Supply and verify a public privacy/support email. Assign monitoring and
  escalation responsibilities; manually test receiving and replying without
  sending credentials or personal test data. No email is invented or sent here.
- [ ] Define scope: intended closed beta of 5-10 international job seekers,
  accepted participant locations/eligibility and how the beta will close.
  Limiting participant count is not a compliance exemption.
- [ ] Obtain applicable jurisdiction/legal review for operator/user locations,
  processing purposes/bases, cookie requirements, user rights, response periods,
  exceptions and international processing. No blanket GDPR/other-law compliance
  statement or universal right/deadline is approved by these drafts.
- [ ] Approve retention per category: purpose, trigger, duration or objective
  criterion, exceptions, responsible operator and actual enforcement. Include
  older resumes, expired sessions, unused counters, provider logs, Auth0,
  backups/branches/exports and privacy-request records. Do not mistake access
  expiry or bounded storage for deletion.
- [ ] Approve a usable requester-verification procedure, website/Auth0 scope
  separation, secure access/export delivery and a restricted request register.
  Define how uncertain commits, provider failures and lost-access requests work.
- [ ] Approve access controls for operator credentials/roles and records. Verify
  the dedicated deletion connection is not exposed to app handlers/customers.
- [ ] Approve version/effective-date control and any required user-notification
  process. Do not promise automatic email notifications without implementation.

## Provider and processing evidence (operator verification)

- [ ] Verify Vercel project/environments, request and runtime log capture,
  retention/access, integrations, regions, agreements and subprocessors relevant
  to this deployment. Inspect settings under operator control without copying
  secrets or real request bodies into documentation.
- [ ] Verify Neon project/branch/database, active regions, application/operator
  roles, actual transport/storage encryption configuration, backup/PITR/branch
  retention, exports and restore process. Do not invent a plan-specific duration
  or claim selective backup erasure is available.
- [ ] Verify Auth0 tenant/client/API roles, collected identity fields, granted
  claims, permissions, token lifetimes/revocation, grants, sessions, logs,
  regions, deletion capability and applicable agreements.
- [ ] Verify the supported ChatGPT account/workspace and any other client handling
  material to the notice, including chat/connector records and user controls.
  Distinguish those independent/client-selected services from operator providers.
  No zero-retention or training-use guarantee can be inferred from MCP code.
- [ ] Inventory any monitoring, analytics, error reporting, mail/support tools,
  third-party assets and operator-held copies actually used. Reviewed source
  contains no analytics integration, but that does not audit provider-injected
  services or future deployment changes. `next/font/google` is used; verify the
  actual delivered assets before making a blanket third-party-request claim.
- [ ] Verify actual international processing/backup locations and any applicable
  safeguards with qualified review. A URL or request region is not residency
  evidence. Preserve reviewed public references/settings evidence without secrets.

## Operational readiness before promising retention or deletion

- [ ] For each approved rule, implement and test a mechanism in a separate change
  or establish an assigned, documented manual process that can meet it. This
  phase implements no scheduled cleanup, automatic deletion or new period.
- [ ] Rehearse the complete privacy-request workflow on synthetic isolated data:
  authorization, approved scope, target verification, count-only dry-run,
  confirmed deletion, zero-count check and minimal outcome recording.
- [ ] Test requester-verification rejection, wrong-target/schema refusal,
  uncertain commit acknowledgement and partially completed provider requests.
- [ ] Verify older resumes and expired sessions are included, other users/shared
  jobs are preserved, and deleted sessions fail authentication. Verify Auth0
  behavior independently; website deletion is not MCP revocation.
- [ ] Inventory retained copies and approve restricted restore plus reapplication
  of deletion decisions before restored data becomes accessible. Establish an
  approved minimal linkage without reproducing deleted content in audit logs.
- [ ] Verify support/log/request records and client/provider instructions; assign
  owners for scopes the application cannot erase directly.

## Public wording and link work (future implementation)

Current inspection found no `app/privacy` route or privacy-policy links on
signup, the resume page, `/connect` or the homepage/connect footers. Do not add
links to a missing route or publish the internal draft to fill that gap.

- [ ] Replace every internal placeholder only with approved facts. Remove internal
  evidence notes from the final public notice, retaining a private review record.
- [ ] Review marketing terminology against deterministic matching, no automatic
  applications, demonstration-job disclosures and the actual data flows.
- [ ] Review existing website analysis copy: it says pasted descriptions are
  "not saved or sent to an external service". The reviewed action makes no
  external AI/model call, but requests still traverse hosting and saved resumes
  come from the database provider. In a separately approved UI change, use
  precise wording that does not imply zero infrastructure processing or immediate
  erasure of browser drafts. Do not change behavior/copy in this phase.
- [ ] Keep `/connect` disclosures consistent: caller-supplied MCP text, no
  website-resume retrieval, no full-input echo, no analysis-text DB persistence,
  separate Auth0 identity and separate ChatGPT/provider handling.
- [ ] Publish an approved `/privacy` page only after the release gate passes. It
  must be accessible while signed out, have an approved effective date/version,
  and contain no placeholders, secrets or unverified provider/legal guarantees.
- [ ] Add accurate, accessible links near signup, resume saving, `/connect` sharing
  guidance and all existing public footers. Review login/dashboard access to the
  notice/contact too. Notice acknowledgment or consent changes, if required,
  need separate review; a policy link alone is not proof of consent.

## Verification requirements

- [ ] Recheck draft statements against current code, schema and tests. Pay special
  attention to session expiry vs cleanup, latest-resume display vs retained rows,
  no added analysis history vs saved source data, and counters vs raw identities.
- [ ] Check that every storage category has approved retention and a feasible
  deletion/expiry path. Never claim "everything deleted" from website zero counts.
- [ ] Run the existing automated suite, TypeScript, lint, webpack production build
  and diff checks. Database fixtures must use their disposable local PostgreSQL
  clusters; never run them against production or copy real users into staging.

```sh
node --experimental-strip-types --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/*.test.mjs
pnpm exec tsc --noEmit
pnpm lint
pnpm build --webpack
git diff --check
```

The DB tests need local PostgreSQL 16 server binaries; optionally set
`ACCOUNT_DELETION_TEST_POSTGRES_BIN` to a reviewed local distribution. They do not
accept `DATABASE_URL` as a test target. Use synthetic build configuration when
possible; do not run migration, seed, connection-check or deletion scripts as
part of documentation verification.

- [ ] When the public page/links are implemented later, add focused route/link
  tests and manually check signed-out/signed-in navigation, mobile/desktop
  rendering, keyboard access, contact links and no draft/placeholders exposed.
- [ ] Complete isolated staging checks for any retention/deletion changes and
  get explicit approval before provider changes, production migrations or data
  operations. Existing tests do not validate provider policies or legal approval.
- [ ] Record final operator approval, legal/provider evidence and release scope.
  Recheck the published page and links after the separately approved deployment.

## Publication decision

**Not ready to publish from this preparation alone.** Operator identity/contact,
approved retention, applicable review, provider/backup verification and a working
privacy-request process are unresolved gates. Public policy/link work is a later
task. This documentation commit preserves the existing website and MCP behavior;
it does not certify beta privacy readiness or production provider configuration.
