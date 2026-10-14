# SaaS monetization Phase 3: verified identity prerequisites

## Audit result and security boundary

Commits `2f3c607` and `3775654` establish website entitlements and enforce the
existing Free (3) and Pro (100) monthly website matching limits. Those values and
all website admission paths are unchanged. No payments, checkout, MCP metering,
or production data changes are part of this phase.

The existing Auth0 verifier validates RS256 signatures against the configured
JWKS, exact issuer, exact single audience, expiration, and the `jobs:read`
permission. Its `clientId` comes from `azp`/`client_id`; `sub` was used only for
rate limiting. The checked-in configuration contains only issuer and audience,
so it cannot establish which OAuth grant produced deployed tokens. A
client-credentials token identifies an OAuth client (software), not an individual
customer. Its client ID or `client-id@clients` subject must never be mapped to a
website user. Until real interactive token claims are verified end to end, this
implementation conservatively treats all deployed identities as non-linkable.

## Implemented safe prerequisites

Migration `006_external_identities.sql` adds a minimal mapping from a website
user to a verified `(issuer, subject)` pair. `(issuer, subject)` is globally
unique, and `(user_id, issuer)` is unique, preventing one Auth0 identity from
crossing accounts or silently replacing an account's identity. The user foreign
key uses `ON DELETE CASCADE`. The server-only store supports idempotent same-owner
linking, exact-pair resolution, and owner-scoped unlinking; it never compares or
stores email addresses.

Token verification continues accepting valid machine tokens for the existing MCP
tools and preserving `jobs:read` enforcement. A token becomes eligible as an
individual identity only when its verified client is explicitly allowlisted in
`AUTH0_INTERACTIVE_CLIENT_IDS`, its signed subject is nonempty, and it is not a
client-credentials or Auth0 client subject. The verifier brands its in-memory
result so request JSON cannot forge the trusted principal.

The linking store's two inputs have deliberately separate trust requirements:
the website UUID must come from `getCurrentUser()` after the existing PostgreSQL
session check, and the external principal must come from the verified interactive
token result. Neither belongs in request JSON, URL parameters, hidden fields, or
email matching. Database constraints are the final concurrency backstop.

## Deliberately not activated

No public link endpoint or UI is enabled yet. The repository and current Auth0
machine-to-machine setup do not demonstrate an end-user authorization-code flow,
PKCE, callback registration, consent, or refresh-token lifecycle. Exposing a link
button before those are configured and verified would invite treating a client
credential as proof of a person.

Before activation:

1. Create a distinct Auth0 interactive application for the MCP client and use
   Authorization Code with PKCE. Do not enable client credentials on that client.
2. Configure exact callbacks, logout URLs, origins, audience, and `jobs:read`;
   verify the actual tokens contain a stable Auth0 user `sub` and the expected
   `azp`, not an `@clients` subject.
3. Set only that reviewed client ID in `AUTH0_INTERACTIVE_CLIENT_IDS`.
4. Add a same-origin POST handler that obtains the website UUID solely from
   `getCurrentUser()`, obtains the external identity solely from the Auth0 token
   verifier, rejects absent `jobs:read`, and calls `link`. Add CSRF/origin checks
   appropriate to the final browser redirect design.
5. Exercise link, relink conflict, unlink, website deletion, provider-account
   deletion/revocation, token expiry, and two-user isolation end to end in a
   non-production tenant. Only then may MCP entitlement lookup or usage metering
   use `resolve`; until then MCP quotas remain disabled.

Unlinking removes only the selected owner/exact issuer-subject mapping. Website
account deletion now locks, counts, validates, and cascade-deletes mappings.
Auth0 provider deletion, grants, tokens, logs, and revocation remain a separate
provider operation and are not falsely claimed by website-database deletion.

## Migration and verification

Review and manually apply `006_external_identities.sql` with the existing
`pnpm db:migrate` operator process before any future linking endpoint is enabled.
Application startup and build do not run it; this change does not migrate or
backfill production data. The application role will eventually need SELECT,
INSERT, and DELETE on `external_identities` plus the existing SELECT/lock access
to `users` for linking.

Security tests cover signature/issuer/audience/scope rejection, explicit
interactive classification, M2M exclusion, forged verifier results, uniqueness
conflicts, owner-scoped unlink, resolution isolation, invalid identifiers, and
account-deletion cascade behavior. Disposable local PostgreSQL clusters are used;
tests do not connect to the configured application database.
