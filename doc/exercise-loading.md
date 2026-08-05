# Exercise loading and API migration

## Goal

Exercise loading is isolated behind `ExerciseLoadingService`. The UI does not
depend on JSON files or an API response directly. This keeps the existing file
source usable while the new backend contract is being designed.

This document describes the current transition implementation. The accepted
target makes SQL the productive exercise store, delivers the catalog through a
public API to guests and authenticated learners, and retains JSON only as a
validated import/interchange format. See
[ADR 0001](adr/0001-shared-frontend-sql-api-and-guest-mode.md) and the
[monorepo migration plan](monorepo-migration.md).

## Runtime data flow

```text
Settings (`exerciseSource`, `specialization`)
        |
        v
ExerciseLoadingService (`json` or `api`)
        |
        v
Validate and replace the source-and-specialization set in Dexie
        |
        v
Dexie `liveQuery`
        |
        v
`useExercises` and the exercise catalog
        |
        v
Pages
```

Dexie is the runtime source of truth. A successful refresh replaces only the
records belonging to the active source and specialization in one transaction.
JSON and API records and every downloaded specialization therefore have
separate caches, even if they use the same exercise IDs.

Dexie version 4 initializes missing `categories` fields in legacy cached cards
as an empty list. Version 5 migrates the temporary `FIAN AP1`/`FIAN AP2`
categories into explicit specialization metadata and removes `FIAN` plus the
combined labels from learner-facing categories. Version 6 normalizes caches
that had already completed an older version 5 migration: FIAN AP2 cards remain
`FIAN`, while other legacy cards receive the four explicitly supported IT
specializations. This prevents empty metadata from becoming an open-ended
catch-all. Workflow markers from `adminTags` are never copied into categories.
Version 7 splits legacy `json` and `api` caches into source-and-specialization
sets such as `json:FIAN`. It also gives every specialization its own persisted
training session. Existing offline cards are retained during the migration.
Version 8 converts the former single-string `correct` value of cached `TEXT`
cards to a one-element array, preserving those cards while offline.
Version 9 does the same for the former numeric scalar used by `SINGLE_CHOICE`
and `NUMBER`.
Version 10 adds IndexedDB tables for settings, bookmarks, exercise progress,
answer events, practice sessions, streaks, and migration metadata. A separate
idempotent startup import copies legacy localStorage values into these tables in
one transaction. It removes only the recognized legacy keys and only after the
transaction succeeds.
Version 11 adds cumulative XP to progress and learning-level, difficulty,
session, Leitner-box, and daily-goal snapshots to new answer events. Existing
progress receives a backward-compatible XP value. The exercise cache alone is
cleared once and then refreshed because `learningLevel` and `difficulty` are
new required content metadata; user settings, answers, bookmarks, and progress
are retained.

Before the database is opened, the application checks
`navigator.storage.persisted()` and requests origin-wide persistent storage with
`navigator.storage.persist()` when necessary. Browsers may deny this request;
in that case the application continues with best-effort IndexedDB storage and
logs a warning. Persistence prevents automatic storage-pressure eviction, but
does not prevent users from explicitly clearing site data.

Changing the source or specialization in the settings takes effect immediately.
Both choices are persisted in the Dexie `settings` table.

## JSON file service

`JsonUrlExerciseLoadingService` preserves the existing loading sequence:

1. Load the selected index, for example
   `/data/exercises/index_fian.json`.
2. Load every filename listed in the index from `/data/exercises/`.
3. Derive the exercise ID from the filename without `.json`.
4. Confirm that every loaded card explicitly includes the selected
   specialization.
5. Store the successfully loaded exercises in that specialization's Dexie
   cache.
6. Download referenced question images into the PWA's `exercise-images` cache.

The index generator keeps a complete `index.json` for authoring and produces
one runtime index for each of `FIAN`, `FISI`, `FIDP`, and `FIDV`. An invalid or
empty runtime index fails the refresh. A single invalid or unavailable exercise
file is logged and skipped so that the remaining files stay usable. Images
continue to be resolved from `/data/img/`; the service worker serves previously
downloaded images from the same cache while offline.

## Backend API service

`ApiExerciseLoadingService` is a draft adapter. Until the backend contract is
finalized, it uses this request:

```http
GET /api/v1/exercises
Accept: application/json
```

The API base URL defaults to `/api/v1` and can be changed at build time:

```dotenv
VITE_EXERCISE_API_URL=https://example.test/api/v1
```

The current draft response is:

```json
{
  "items": [
    {
      "id": "12_13_01",
      "inputMode": "SINGLE_CHOICE",
      "mobileSolvable": true,
      "learningLevel": 2,
      "difficulty": 1,
      "categories": ["Arbeitsrecht"],
      "specializations": ["FIAN", "FISI", "FIDP", "FIDV"],
      "correct": [1],
      "instruction": "Question text",
      "answerOptions": ["A", "B"]
    }
  ]
}
```

Each API item follows the `Exercise` model. Unlike the JSON source, the API must
provide the same stable canonical `id` used by the corresponding JSON card; it
cannot be derived from an API response position. Exercise caches remain
separated by source and specialization, while bookmarks, progress, and weak-spot
state use this source-independent ID. User state therefore survives the later
switch from `json` to `api`. A future API should add a content revision when a
material card change needs scheduling to be reconsidered without deleting its
answer history.

`learningLevel` is a required integer from 1 through 10 and identifies the
curriculum stage. `difficulty` is a separate required integer from 1 through 5
and weights XP. API and JSON sources must use the same values so switching the
source does not change the learner's available subset or scoring semantics.

`correct` is invariantly a non-empty array. `SINGLE_CHOICE` and `NUMBER`
require exactly one numeric item; all other cardinality and item-type rules are
defined by their input mode.

For `MATCH`, `answerOptions` contains the left-side items and `matchOptions`
contains the selectable right-side labels. `correct[i]` is the index in
`matchOptions` assigned to `answerOptions[i]`. Both lists must have equal
length, and `correct` must contain every index exactly once.

For `TEXT`, `correct` is a non-empty array of accepted strings. Plain entries
use the app's fuzzy word comparison. Entries in `/pattern/flags` form use
native JavaScript regular expressions and must match the complete trimmed
input; only `i` and `u` are accepted as flags. The loading service compiles
each pattern during validation and rejects invalid answer data. These patterns
are trusted authoring content. If a future API lets end users supply patterns,
the matcher must move to a bounded engine such as RE2 before enabling that
input.

`specializations` may contain one or more of `FIAN`, `FISI`, `FIDP`, and
`FIDV`. Multiple values model overlapping scope, such as AP2 network content
for both `FISI` and `FIDV`. Current AP1 cards explicitly contain all four
values. Missing and empty lists are invalid: every applicable specialization
must be listed so later occupations do not inherit older cards accidentally.
The MVP stores the selected specialization locally. The JSON service selects
the matching index before downloading; the draft API adapter still filters its
complete response locally. A future backend may apply the filter server-side
or supply the user's selection without overloading learner-facing categories.

The current adapter deliberately does not define authentication, pagination,
incremental synchronization, or API-provided image URLs. Those belong to the
backend contract and can be added inside the adapter without changing pages.

## Loading and error behavior

- A source or specialization switch selects its own cache and starts a refresh
  immediately when the browser reports that it is online.
- `navigator.onLine` plus the `online` and `offline` events provide the
  connection hint. A reconnect refreshes the active set automatically.
- If the browser reports offline, no refresh is attempted and an existing
  source-and-specialization cache remains available.
- Cards are exposed to the UI through Dexie `liveQuery`.
- A successful response transactionally replaces only the active cached set.
- A failed request does not delete an already cached set.
- If no cached cards are available, the practice page shows the load error.
- Switching back to a downloaded source or specialization restores its
  independently cached set.

`navigator.onLine` is only a browser/operating-system hint: `true` does not
guarantee that the server is reachable, so request failures still use the
cached set. When available, the experimental Network Information API supplies
`wifi`, `cellular`, or `ethernet` for the Settings display. Unsupported
browsers show an unknown connection type instead of guessing from `4g` or
similar effective-speed labels.

## Backend migration checklist

Before making the API the default source:

1. Define the public endpoint, pagination, image handling, and error response
   format. Exercise reads do not require authentication.
2. Capture the final contract in OpenAPI and add contract compatibility checks.
3. Adapt the API DTO mapping and validation without changing the `Exercise`
   model consumed by the UI.
4. Add service tests for valid, partial, empty, and invalid responses.
5. Test source switching, offline startup, and cached-data behavior.
6. Import the current JSON corpus into SQL with stable IDs and content revisions,
   then verify API and source-corpus parity.
7. Change the default source only after the backend is deployed and remove the
   public source setting after the rollback window.
8. Retain JSON as a versioned import format if the CMS or operations workflow
   still needs it; do not maintain it as an independent productive catalog.
