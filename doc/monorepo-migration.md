# Monorepo and backend migration

## Purpose

This plan implements [ADR 0001](adr/0001-shared-frontend-sql-api-and-guest-mode.md)
without maintaining separate guest and account frontends. It separates
behavior-preserving repository moves from data-model changes and gives frontend,
backend, and content work explicit integration gates.

The demo implementation selects TypeScript, Fastify, and MariaDB for the
backend boundary. It does not yet select an authentication provider, CMS
workflow, or new learning-level behavior.

## Target boundaries

The final names may follow the selected backend toolchain, but the monorepo has
these logical owners:

```text
.
|-- apps/
|   |-- frontend/       Vue PWA; existing feature-sliced `src` structure
|   |-- backend/        public catalog, authenticated sync, and import API
|   `-- content-cms/    Python exercise authoring and indexing tools
|-- packages/
|   |-- contracts/      OpenAPI, import schema, compatibility checks
|   `-- exercise-content/  transition JSON packages and content validation
|-- .ddev/              local frontend, backend, and SQL orchestration
`-- README.md           root commands and project map
```

Only shared artifacts belong in `packages`. Backend domain logic is not shared
with the frontend as source code merely to avoid defining an API contract. If
the backend is not TypeScript, OpenAPI and generated clients remain the language-
neutral boundary.

## Runtime topology

```text
                         public, no login required
SQL exercise catalog <---------- backend API
        ^                              |
        |                              v
validated JSON import       sync and catalog adapters
                                       |
                                       v
                               Dexie / IndexedDB
                                       |
                                       v
                                  Vue pages
```

For learner-owned data, the UI writes to Dexie first. An authenticated sync
worker exchanges committed local changes with the backend. Guests use the same
local domain behavior without uploading personal data.

## Delivery phases

Local status on 2026-08-05: the Phase 1 workspace move and a runnable Phase 2
demo slice are implemented. DDEV and standalone Compose start the Vue watcher,
Fastify watcher, and MariaDB. OpenAPI describes the public health and exercise
endpoints. A deliberately denormalized Phase 3 demo table contains 20 rows;
the production import, revision history, assets, and compatibility checks are
still future work. The release tag from Phase 0 remains an explicit repository
operation and is not created by the local restructuring itself.

The local Phase 1 verification covers a clean root `npm ci`, frontend lint and
tests, the production PWA build, deterministic regeneration of all exercise
indexes, Python compilation and CMS dependency imports, shell syntax, and HTTP
responses for the built application, exercise index, and web manifest.

### Phase 0: Preserve and baseline the MVP

- Ensure the worktree is clean and all current validations pass.
- Create an annotated release tag for the last standalone JSON MVP.
- Record the supported browser database version and current production build.
- If a transition release branch is needed, limit it to critical fixes and give
  it an explicit retirement condition.

Gate: the tagged build can be reproduced without relying on the future
monorepo layout.

### Phase 1: Mechanical monorepo move

- Introduce the root workspace and move the Vue project to `apps/frontend`.
- Move the CMS only as a path change; do not redesign it in the same change.
- Keep exercise JSON and images working from their existing runtime paths.
- Provide root commands for install, lint, test, build, and development.
- Move CI paths and caches without changing application behavior.

Gate: frontend lint and build output are equivalent to the pre-move baseline,
and the existing JSON MVP still runs.

### Phase 2: Contracts and local orchestration

- Add the versioned OpenAPI contract for the public exercise catalog and health
  endpoint.
- Define a versioned exercise import envelope around the existing exercise
  schema, including canonical ID and content revision.
- Define structured validation and problem responses.
- Add contract linting, generated-client verification, and breaking-change
  checks.
- Add root DDEV orchestration for frontend, backend, and SQL.
- Route browser requests through a relative same-origin `/api/v1` path.

Gate: one `ddev start` brings up healthy services, and contract checks run
without either implementation importing the other's internal code.

### Phase 3: SQL catalog and repeatable JSON import

- Create SQL tables for exercises, revisions, asset references, and import runs.
- Implement dry-run and apply modes through one import application.
- Reuse the existing schema and semantic checks before database writes.
- Make imports transactional and idempotent by canonical exercise ID and
  revision.
- Record source, checksum, timestamps, counts, validation failures, and the
  importer version.
- Require explicit retirement or deletion instructions; absence from an import
  does not delete an exercise.
- Import the current JSON corpus and compare counts, IDs, and content hashes.
- Serve the imported catalog through the unauthenticated read API.

Gate: repeating the same import makes no content changes, invalid input writes
nothing, and the API returns the expected canonical IDs and revisions.

### Phase 4: Profile-scope local learner data

- Create a stable local guest `profileId` before login exists.
- Scope every learner-owned Dexie table by profile, using composite keys or an
  equivalently isolated database strategy.
- Migrate the existing single-profile data to the local guest profile in one
  idempotent upgrade.
- Make all subscriptions and commands operate on the active profile.
- Test multiple local profiles and account switching without data leakage.

Gate: the migrated guest retains settings, history, bookmarks, weak spots,
sessions, and current training state, while another profile sees none of them.

### Phase 5: Catalog API cutover

- Generate or implement the frontend API client from the accepted contract.
- Refresh the Dexie exercise cache from the public API.
- Preserve cached startup and offline behavior; pages continue to read only
  from Dexie.
- Compare the API-backed catalog with the imported JSON corpus.
- Hide the source switch in production once rollout and rollback checks pass.
- Retain the JSON loader only for transition tests until the cutover is proven.

Gate: guests can learn without login both online and after an offline restart,
and API failure does not erase a valid cache.

### Phase 6: Optional authentication

- Add session discovery without blocking the guest application startup.
- Keep the public catalog endpoint unauthenticated.
- Select a profile for the authenticated account and isolate it from the local
  guest and other accounts.
- Specify login, logout, expired-session, and offline-session behavior.
- Ask explicitly before importing local guest data into an account.
- Keep credentials outside learner-state tables and prevent client-supplied
  identity from becoming authorization.

Gate: rejecting or skipping login leaves the full guest workflow usable, and
account changes cannot expose another profile's local data.

### Phase 7: Learner-data synchronization

- Define synchronization contracts per learner-owned entity.
- Write the domain change and its outbox record in the same Dexie transaction.
- Use stable client event IDs and idempotent server mutations.
- Pull remote changes through a cursor and apply them transactionally to Dexie.
- Represent removals and state transitions explicitly rather than inferring
  them from missing rows.
- Specify conflict ownership for append-only events, bookmarks, settings,
  weak-spot transitions, and derived progress.
- Expose compact sync status and recovery actions without blocking offline use.

Gate: an authenticated learner can answer offline, restart, reconnect, retry a
partially failed sync, and converge across two devices without duplicate answer
events.

### Phase 8: Remove transition paths

- Remove the production source setting and obsolete source-specific copy.
- Remove runtime JSON assets only after the API deployment and rollback window
  are complete.
- Keep the JSON import contract and importer if the CMS or operations workflow
  still uses them.
- Archive the temporary MVP maintenance branch, if one was created.
- Update operational, architecture, help, and contributor documentation.

Gate: production has one catalog delivery path, guests remain supported, and a
documented import or CMS workflow can still populate SQL.

## Parallel work after the contract gate

After Phases 1 and 2, work can proceed in parallel with narrow ownership:

- Backend track: SQL schema, importer, public catalog, authentication, and sync
  endpoints.
- Frontend track: profile-scoped Dexie migration, generated API client, cached
  catalog refresh, authentication adapter, and sync worker.
- Content track: import envelope, corpus validation, assets, and deterministic
  import fixtures.
- Platform track: DDEV, CI, database migrations, observability, backups, and
  deployment.

Integration happens at the gates above. Parallel work must not independently
change the canonical exercise contract or synchronization semantics.

## Required test matrix

At minimum, CI and browser-level tests cover:

| Mode | Network | Expected behavior |
|------|---------|-------------------|
| Guest | Online | Public API refreshes Dexie; no personal upload |
| Guest | Offline | Cached catalog and local progress remain usable |
| Authenticated | Online | Local writes persist first and synchronize |
| Authenticated | Offline | Full learning flow works and queues changes |
| Authenticated | Reconnect | Retry-safe convergence without duplicate events |
| Account switch | Any | Profiles remain isolated |
| Import | Repeated | Same package produces no unintended changes |
| Import | Invalid | Dry-run reports errors and apply writes nothing |

## Cross-cutting acceptance criteria

- Login is optional for the learner-facing exercise flow.
- Dexie remains the only data source read directly by Vue pages.
- SQL is the productive exercise authority after import cutover.
- JSON and administrative API writes use the same validation and import logic.
- Canonical exercise IDs survive the JSON-to-SQL migration.
- No public setting exposes unsupported infrastructure combinations.
- Existing guest data has an explicit, tested migration path.
- Backend unavailability does not destroy valid local data.
