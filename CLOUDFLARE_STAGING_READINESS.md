# Cloudflare staging readiness and migration plan

## Scope and safety

This branch is an isolated Cloudflare staging workstream. It must not change `main`, any existing production Worker, the existing `hussam-infographic-prod` D1 database, or any production hostname.

Dedicated staging resources:
- D1: `abu-hussam-exam-builder-staging`
- R2: `abu-hussam-exam-builder-staging`

The D1 database is currently empty. The R2 bucket is currently empty and private by default. Neither resource is connected to the application yet.

## Verified current application architecture

The application is currently an Express + React Node.js application:
- `server.ts` starts Express and mounts `server/routes.ts`.
- `server/db.ts` uses synchronous local filesystem operations against `data/database.json`; writes use a temporary file followed by `renameSync`.
- Exam question images are currently embedded as PNG/JPEG/WEBP data URLs in question records.
- The production Docker image installs local Chromium. PDF export currently depends on a local browser runtime.
- The app has not yet been converted to a Cloudflare Worker runtime and does not currently use D1 or R2 bindings.

## Architecture decision

Do not deploy the current JSON-file database directly on Cloudflare Containers.

Cloudflare Containers have ephemeral local disks by default. R2 FUSE is not a safe drop-in replacement for this application's JSON database: Cloudflare documents that FUSE does not provide full POSIX filesystem semantics, and mounted object storage does not provide local-disk rename/lock behavior. The current database's atomic temp-file/rename write pattern therefore cannot be assumed to remain safe on an R2 mount.

Recommended target:
1. Keep the React/Vite frontend as Workers Static Assets.
2. Move the API to a Worker-compatible request layer while preserving the existing API contract.
3. Migrate application records from JSON into D1 with versioned SQL migrations and explicit repository methods.
4. Store uploaded question images as private R2 objects. Persist object keys and validated metadata in D1; never expose the bucket publicly by default.
5. Use Cloudflare Browser Run for PDF rendering after porting the existing exam HTML/CSS and validating Arabic fonts, page breaks, images, and both student/answer-key outputs.
6. Use Cloudflare Containers only if a specific server-side dependency cannot be moved to Workers; containers must remain stateless and use external durable storage.

## Required implementation sequence

### Phase 1 — Data model and migration
- Inventory every read/write method in `server/db.ts` and every call site.
- Define normalized D1 tables for users, registration requests, notifications, subjects, school settings, curricula, questions, exams, archive, layout templates, analyzed documents, AI settings/usage, audit logs, and migration metadata.
- Add forward-only, idempotent migration files and schema tests.
- Build a one-time JSON import tool that validates the source snapshot, hashes it, imports into staging only, checks record counts and relationships, and supports dry-run. Never overwrite production data.
- Preserve password hashes and auth-version invalidation semantics; do not export secrets.

### Phase 2 — Private image storage
- Add authenticated upload and download handlers using an R2 binding.
- Validate content type by file signature as well as declared MIME type, enforce per-file and per-exam quotas, generate opaque object keys, and store ownership metadata in D1.
- Ensure downloads require an authenticated, authorized request or short-lived signed access; do not enable public bucket access.
- Update editor, exam preview, print view, archive, and PDF paths to use object keys.
- Add orphan cleanup and deletion behavior with tests.

### Phase 3 — API runtime
- Port routes and middleware incrementally to Workers-compatible handlers.
- Preserve JWT validation, authVersion checks, role/subject/grade authorization, CORS allowlists, rate limits, audit logging, and safe error responses.
- Use shared/distributed rate-limit state; in-memory process-local limits are not sufficient for horizontally scaled Workers.
- Add staging-only secrets through Cloudflare secret bindings; never commit secret values.

### Phase 4 — PDF and acceptance tests
- Integrate Browser Run PDF rendering behind an authenticated API route.
- Compare generated PDFs against existing output for Arabic text shaping, fonts, image scaling, RTL/LTR sections, page numbering, headers, footers, and page breaks.
- Test student paper and teacher answer key separately.
- Run D1 migration/import tests, R2 upload/download/authorization tests, auth/RBAC integration tests, and browser-based end-to-end tests.

### Phase 5 — Release gate
Do not call the app publish-ready until all of the following pass on isolated staging:
- clean install, TypeScript checks, unit tests, Worker build, and deployment smoke test;
- login, logout, password change, token revocation, registration, and role/academic-scope isolation;
- exam create/edit/archive/restore and image upload/replace/delete/download;
- both PDF exports with visual regression checks;
- backup/restore and JSON import rehearsal with record-count reconciliation;
- security review of secrets, CORS, private object access, rate limits, and audit logs;
- production migration and rollback plan reviewed before any production action.

## Known user impact to communicate before production

The auth hardening introduces an `authVersion` claim. On the first release containing that change, existing tokens without the claim are rejected and users must sign in again. This must be announced before production deployment.

## Current status

This document records the verified architecture and safe migration sequence. It is not evidence that D1/R2 integration, API migration, PDF rendering, or live acceptance tests have been completed.
