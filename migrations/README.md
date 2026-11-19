# Cloudflare staging database migration

## Applied staging migrations

- `0001_initial_d1_schema` — applied successfully to isolated D1 database `abu-hussam-exam-builder-staging` (UUID `204dbdf9-5ae5-4ea3-a701-176e31bafe06`). Verification found 15 application tables (plus Cloudflare's internal `_cf_KV`) and zero rows in users, questions, exams, and registration requests.
- `0002_question_images_metadata` — adds private R2 image metadata and ownership columns. Image bytes are not stored in D1.

No production resource was modified and no user data was imported.

## Adapter and image storage groundwork

`server/cloudflare/d1RecordStore.ts` is an isolated, allowlisted D1 adapter for simple collection records. `server/cloudflare/questionImageStorage.ts` stores compressed PNG/JPEG/WEBP image bytes in a private R2 bucket and stores ownership metadata in D1. The upload service accepts an owner ID only from the verified server session; callers must enforce authentication before calling it.

These modules are not wired into the Express routes. The existing route handlers call synchronous methods on the local JSON database, while D1 is asynchronous. Connecting them before converting route handlers and middleware would break the application.

## Remaining conversion

1. Inventory every `db.*` call and classify reads, writes, ownership checks, and multi-record operations.
2. Introduce async service interfaces and convert route handlers and middleware to await them.
3. Preserve audit-log append-only/hash-chain semantics and implement transaction boundaries.
4. Move backup/restore into explicit export/import services.
5. Move provider secrets out of database records and into Worker secrets.
6. Build a dry-run JSON importer that reports counts, duplicate IDs, invalid rows, and relationship mismatches before writing.
7. Wire question-image UI/API to private R2 storage and authenticated image reads; add deletion/replace cleanup and ownership tests.
8. Convert the Express API to Worker request handlers (or justify a separately managed Node container).
9. Replace local Chromium PDF generation with Browser Run and verify Arabic shaping, RTL layout, page breaks, and embedded images.
10. Run D1/R2 integration and end-to-end tests against an isolated preview.

## Safety

- D1 migrations are staging-only. The JSON source and uploaded ZIP remain untouched.
- Do not connect this adapter to production or expose the R2 bucket publicly.
- The current app is not ready for publication.
