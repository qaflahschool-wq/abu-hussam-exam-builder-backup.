# Cloudflare staging database migration

## Current state

The D1 staging schema is in [0001_initial_d1_schema.sql](./0001_initial_d1_schema.sql). The application itself still uses the synchronous in-memory/local-JSON `Database` class in `server/db.ts`; Express route handlers call its methods synchronously throughout `server/routes.ts`.

Cloudflare D1 is accessed asynchronously through Worker bindings. Replacing the current database object with an asynchronous implementation without changing its callers would break request behavior. The existing Express entry point also depends on Node APIs and cannot be deployed unchanged as a Worker.

## Staging application status

Migration `0001_initial_d1_schema` was applied successfully to the isolated D1 database `abu-hussam-exam-builder-staging` (UUID `204dbdf9-5ae5-4ea3-a701-176e31bafe06`). A live schema query confirmed 15 application tables (plus Cloudflare's internal `_cf_KV` table). Verification queries confirmed zero rows in users, questions, exams, and registration requests. No application data was imported.

The migration registry is populated with version `0001_initial_d1_schema`. This confirms schema setup only; it does not mean the app is connected to D1.

## Adapter added

`server/cloudflare/d1RecordStore.ts` is a small, allowlisted D1 adapter for collection records stored as `id` + `record_json`. It uses parameter binding for values and does not accept arbitrary SQL table names. It is intentionally not imported by `server/db.ts` or `server/routes.ts` yet.

Tests in `tests/d1RecordStore.test.ts` exercise bound IDs, JSON parsing, list/upsert/delete, and invalid input with a mock D1 binding.

## Required conversion before integration

1. Inventory every `db.*` call in `server/routes.ts` and classify reads/writes and ownership checks.
2. Introduce async service interfaces and convert route handlers and middleware call chains to await them.
3. Implement transactional multi-record operations and preserve audit-log append-only/hash-chain semantics.
4. Move backups and restore into explicit export/import services; do not model backups as a mutable table.
5. Move AI settings into a singleton configuration record without storing provider secrets in D1.
6. Add D1 migration tests against a real local/preview D1 database, not only mocks.
7. Add a dry-run JSON importer that reports counts, duplicate IDs, invalid rows, and relationship mismatches before any write.
8. Move question image bytes from data URLs into private R2 objects and persist object keys plus ownership metadata.
9. Convert the Express API to Worker request handlers (or separately justify a containerized Node service) and replace local Chromium PDF generation with Browser Run.
10. Run end-to-end tests for auth, roles, registration, exams, question images, Arabic/RTL PDFs, backups, and audit integrity.

## Safety

- This is staging-only groundwork. No D1 migration has been applied and no user data has been imported.
- Do not connect this adapter to production or the live application yet.
- Keep the original JSON file and archive untouched until a verified import and restore test is complete.
