# API contracts

`openapi.yaml` is the versioned, language-neutral HTTP contract. The backend
serves it as Swagger UI at `/api/docs/` and as JSON at `/api/docs/json`.

The frontend still normalizes both JSON files and API responses into its
existing `Exercise` entity before writing the result to Dexie. Backend source
files are deliberately not imported by the frontend.
