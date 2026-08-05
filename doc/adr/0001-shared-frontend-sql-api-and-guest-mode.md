# ADR 0001: Shared frontend, SQL exercise store, and guest mode

- Status: Accepted
- Date: 2026-08-04

## Context

The current Vue PWA is an offline-capable MVP. It loads exercises from JSON
files, stores exercise caches and learner state in Dexie, and already has a
draft API loader selected by a public setting.

The repository will become a monorepo containing at least the frontend, a
backend API, SQL persistence, and local DDEV orchestration. The product must
remain usable without a mandatory login while authenticated learners gain
cross-device synchronization.

The current JSON files will be imported into SQL. Whether the CMS continues to
edit or generate JSON is intentionally left open, so JSON may remain a durable
import format.

## Decision

### One product frontend

Guest and authenticated use remain two modes of the same frontend. Product
development continues on the main line; the JSON-only MVP does not become a
separately developed product branch. A release tag may preserve the last
standalone MVP, and a temporary release branch may receive critical fixes
during the transition.

The frontend keeps its existing feature-sliced source structure after it moves
into the monorepo.

### Separate catalog delivery, identity, and synchronization

The following concerns remain independent:

- Exercise delivery determines how the local exercise cache is refreshed.
- Session identity is either a local guest profile or an authenticated account.
- Synchronization is disabled for guests and enabled for authenticated accounts
  when the backend is available.

Authentication does not select the exercise source. The connected product
offers exercise reads without authentication, so guests and authenticated
learners use the same public catalog API. Both continue to read cached exercises
from Dexie while offline.

The current public `json`/`api` setting is transitional. It may remain available
for development and migration tests, but it is removed from the production
settings after the API cutover. Deployment configuration and runtime
capabilities replace it; no product code should accumulate checks for a single
global "backend enabled" flag.

### Data authority and flow

SQL becomes the authoritative productive exercise store. The API is the regular
runtime delivery path. JSON becomes an import and interchange format rather
than an independently maintained runtime source.

```text
CMS -> JSON package --\
                      -> import application -> validation -> SQL -> public API
CMS -> admin API -----/
```

If both authoring paths exist, they invoke the same import application and
validation rules. JSON and SQL must not be edited as independent competing
sources. A future backend-free export, if required, is generated from SQL as a
build artifact.

Every exercise retains its stable canonical `exerciseId`. Material content
changes also carry a `contentRevision`. Imports are idempotent upserts, report
their result, and do not infer deletions from absent records. Deletion or
retirement is explicit.

Inside the browser, Dexie remains the single runtime source of truth. Pages do
not render directly from API responses. API clients refresh or synchronize
Dexie, and reactive queries publish the resulting local state. SQL is the
durable cross-device authority for synchronized account data.

### Guest and account data

Every browser starts with a stable local guest profile. All learner-owned Dexie
records are scoped by `profileId` before authentication is introduced. This
includes settings, progress, bookmarks, answer events, sessions, streaks, and
training state.

Signing in selects an account profile; it must not expose another local
profile's data. Importing existing guest progress into an account is an
explicit, one-time user decision rather than an automatic side effect of login.

Local learning actions commit to Dexie first. Synchronizable changes and their
outbox records are written in the same transaction. The synchronization
protocol uses stable client event IDs, idempotent mutations, pull cursors,
explicit conflict rules, and tombstones or domain events for deletions. Guests
retain the same offline learning behavior but do not send personal data.

### Contracts and local orchestration

The API contract is versioned and captured in OpenAPI. Import validation and the
public API map to the same domain model while using purpose-specific DTOs where
needed. Contract compatibility checks protect the generated frontend client and
backend implementation.

DDEV is the root entry point for local development and composes the frontend,
backend, and SQL services. The browser uses a same-origin relative API path such
as `/api/v1`; container hostnames do not leak into frontend application code.

## Consequences

### Benefits

- Guest access remains a supported product mode without duplicating features.
- Offline behavior is shared by guest and authenticated learners.
- Frontend fixes, migrations, accessibility work, and learning behavior have
  one implementation.
- JSON can remain useful to the CMS without becoming a second productive data
  authority.
- Backend and frontend can progress independently against a versioned contract.

### Costs and risks

- Existing single-profile Dexie keys require a deliberate migration.
- Account switching, guest-to-account import, retries, and conflicts add test
  cases that a JSON-only MVP does not have.
- The import process needs audit records, dry-run reporting, and explicit
  retirement semantics.
- The transition temporarily supports both JSON and API loaders, but this is a
  migration concern rather than permanent product variability.

## Rejected alternatives

### Long-lived JSON-only development branch

Rejected because migrations, PWA fixes, learning behavior, and security fixes
would diverge or need duplicate implementation. A tag or temporary maintenance
branch is sufficient to preserve the existing deployment.

### Public backend feature switch as the permanent architecture

Rejected because exercise delivery, authentication, and synchronization are
orthogonal. A user-controlled source switch can also select combinations that
the deployed product cannot support safely.

### Independently editable JSON and SQL catalogs

Rejected because two productive authorities inevitably drift. Both possible CMS
workflows must converge on the same import and validation application.

### Pages reading remote API responses directly

Rejected because it would split online and offline behavior. Remote data enters
Dexie first, preserving one browser-side read model.

## Deferred decisions

- Backend language and framework
- SQL schema details beyond stable IDs, revisions, and import auditability
- Authentication provider and session implementation
- Whether the CMS emits JSON or writes through an administrative API
- Image storage and delivery
- Exact per-entity synchronization and conflict rules
- Whether a generated backend-free exercise snapshot remains a supported
  deployment artifact

The implementation sequence and acceptance gates are documented in
[Monorepo and backend migration](../monorepo-migration.md).
