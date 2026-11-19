# D1 migration 0001 — staging record store

This migration creates the first durable D1 schema for the Cloudflare staging workstream.

## Design
- Preserves the existing application record shape in validated JSON columns while the repository is converted from synchronous filesystem calls to asynchronous D1 operations.
- Adds relational columns for identity, ownership, filtering, and common sort paths.
- Keeps users, registration requests, AI settings, and audit records in separate tables.
- Does not store Gemini API keys or other environment secrets in these records.
- Question image payloads are intentionally not redesigned here; the later R2 migration must move image bytes to private objects and replace embedded data URLs with object metadata.

## Safety
- Additive schema only; no production resource is referenced.
- Applying this migration to the isolated staging D1 database is a separate, explicit operation.
- No user data is imported by this SQL file.
- Do not mark the application Cloudflare-ready until the async repository adapter, import/dry-run reconciliation, R2 image flow, Worker API, and integration tests exist.

## Apply later
Use the Cloudflare D1 migration mechanism against the database named `abu-hussam-exam-builder-staging` only. Verify the database UUID before applying. Never target `hussam-infographic-prod`.
