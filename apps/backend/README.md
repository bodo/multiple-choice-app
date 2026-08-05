# TypeScript backend demo

The Fastify backend exposes:

- `GET /api/v1/health`
- `GET /api/v1/exercises`
- Swagger UI at `/api/docs/`
- the OpenAPI document as JSON at `/api/docs/json`
- the compiled Vue SPA, including its history fallback, on every non-API route

`MariaDbExerciseRepository.findAll()` deliberately executes exactly:

```sql
SELECT * FROM exercises
```

MariaDB JSON fields and boolean values are normalized to the existing frontend
`Exercise` shape. The frontend remains responsible for validating the payload
and storing its offline copy in Dexie.

The SQL lifecycle is split into ordered files:

1. `sql/001-create-tables.sql` creates the deliberately denormalized table.
2. `sql/002-reset-content.sql` restores an empty content baseline.
3. `sql/003-demo-data.sql` inserts 20 demo rows.

On an already initialized database volume, apply reset and demo data explicitly;
container entrypoint initialization scripts only run for an empty data volume.
