# Exercise loading and API migration

## Goal

Exercise loading is isolated behind `ExerciseLoadingService`. The UI does not
depend on JSON files or an API response directly. This keeps the existing file
source usable while the new backend contract is being designed.

## Runtime data flow

```text
Settings (`exerciseSource`)
        |
        v
ExerciseLoadingService (`json` or `api`)
        |
        v
Validate and replace the source-specific set in Dexie
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
records belonging to the active source in one transaction. JSON and API records
therefore have separate caches, even if they use the same exercise IDs.

Changing the source in the settings takes effect immediately and is persisted
as `exerciseSource` in `bodo-mc-settings`.

## JSON file service

`JsonUrlExerciseLoadingService` preserves the existing loading sequence:

1. Load `/data/exercises/index.json`.
2. Load every filename listed in the index from `/data/exercises/`.
3. Derive the exercise ID from the filename without `.json`.
4. Store the successfully loaded exercises in Dexie.

An invalid index fails the complete refresh. A single invalid or unavailable
exercise file is logged and skipped so that the remaining files stay usable.
Images continue to be resolved from `/data/img/`.

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
      "correct": 1,
      "instruction": "Question text",
      "answerOptions": ["A", "B"]
    }
  ]
}
```

Each API item follows the `Exercise` model. Unlike the JSON source, the API must
provide a stable `id`; it cannot be derived from a filename.

The current adapter deliberately does not define authentication, pagination,
incremental synchronization, or API-provided image URLs. Those belong to the
backend contract and can be added inside the adapter without changing pages.

## Loading and error behavior

- A source switch starts a refresh immediately.
- Cards are exposed to the UI through Dexie `liveQuery`.
- A successful response transactionally replaces that source's cached set.
- A failed request does not delete an already cached set for that source.
- If no cached cards are available, the practice page shows the load error.
- Switching back to JSON files restores their independently cached set.

## Backend migration checklist

Before making the API the default source:

1. Define the endpoint, authentication, pagination, image handling, and error
   response format.
2. Capture the final contract in OpenAPI and add contract compatibility checks.
3. Adapt the API DTO mapping and validation without changing the `Exercise`
   model consumed by the UI.
4. Add service tests for valid, partial, empty, and invalid responses.
5. Test source switching, offline startup, and cached-data behavior.
6. Decide whether JSON remains an offline fallback or can be removed.
7. Change the default `exerciseSource` only after the backend is deployed.
