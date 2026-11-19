# Cloudflare async migration inventory

This inventory was generated from the current staging branch source, not inferred from the deployment guide.

## Findings

- `server/db.ts` exports a singleton `db` backed by local JSON and exposes **67 public methods**.
- `server/routes.ts` contains **78 Express route declarations** and **109 direct `db.*` call sites**.
- Only **6 route declarations** currently use async handlers (pattern scan); most handlers assume synchronous database reads/writes.
- `server.ts` starts Express, uses Node filesystem/path APIs, and mounts the Express router.
- `server/db.ts` imports `fs`, `path`, `crypto`, and synchronous bcrypt operations; it reads/writes `data/database.json` and local backup files.
- The existing JSON schema contains 15 top-level data collections/settings areas plus migration flags. Several methods mutate multiple collections in one operation (exam archive/restore, registration approval, user auth-version changes, audit chain, restore/backup).

## Database API inventory

### Identity and authentication
`getUsers`, `findUserByUsername`, `findUserById`, `getAuthVersion`, `isAuthVersionCurrent`, `recordUserLoginSuccess`, `recordUserLoginFailure`, `touchUserActivity`, `createUser`, `updateUser`, `updateUserPassword`.

### Registration
`getRegistrationRequests`, `findRawRegistrationRequestById`, `findRegistrationRequestByUsername`, `createRegistrationRequest`, `approveRegistrationRequest`, `updateRegistrationRequestStatus`.

### School, subjects, curriculum
`getSubjects`, `addSubject`, `updateSubject`, `deleteSubject`, `getSchoolSettings`, `updateSchoolSettings`, `getCurricula`, `addUnit`, `updateUnit`, `deleteUnit`, `resetToDefaults`.

### Question bank and exams
`getQuestions`, `getQuestionById`, `addQuestion`, `updateQuestion`, `deleteQuestion`, `getExams`, `getExamById`, `saveExam`, `deleteExam`, `archiveExam`, `restoreExam`, `getArchive`.

### Templates and analyzed documents
`getLayoutTemplatesForOwner`, `getLayoutTemplateById`, `saveLayoutTemplate`, `deleteLayoutTemplate`, `getAnalyzedDocuments`, `getAnalyzedDocumentById`, `saveAnalyzedDocument`, `deleteAnalyzedDocument`.

### AI and audit
`getAISettings`, `updateAISettings`, `logAIUsage`, `getAILogs`, `addAuditLog`, `getAuditLogs`, `verifyAuditLogIntegrity`.

### Notifications and backups
`addNotification`, `getNotificationsForUser`, `markNotificationRead`, `markAllNotificationsRead`, `createBackup`, `listBackups`, `getBackupContent`, `getCurrentSnapshotJson`, `restoreBackup`, `restoreFromJsonString`, `getStorageStatus`.

### Utility
`save`.

## Migration implications

1. **Do not replace the exported `db` singleton with asynchronous methods in place.** Doing so would make existing route handlers serialize Promises or branch on Promise objects instead of records.
2. Convert service operations and every dependent Express route to async/await. Auth middleware must await user lookup and auth-version checks before calling `next()`.
3. Preserve multi-collection operations with D1 batches/transactions where supported. Registration approval, exam archive/restore, and auth-version invalidation must be atomic from the application's perspective.
4. Keep the audit chain append-only. The current in-memory implementation hashes the previous entry; a D1 implementation must serialize appends or use a durable sequence/transaction strategy to prevent concurrent forks.
5. Keep AI provider credentials in Worker secrets, never in D1 `record_json`.
6. Treat backups as export/import jobs, not as rows in the generic collection store. Validate JSON structure and report reconciliation before any import.
7. Move question image bytes to private R2 and retain only owner, question, object key, content type, size, and checksum in D1.
8. Convert the API runtime separately from the database migration: Express/Node filesystem and local Chromium PDF export are not Worker-compatible as-is.

## Current staging implementation

- D1 migrations 0001 and 0002 have been applied to `abu-hussam-exam-builder-staging`.
- `D1RecordStore` and `QuestionImageStorage` are isolated adapters only. They are not imported by the running app.
- The R2 bucket exists but no Worker binding or application upload endpoint has been configured.
- No JSON source data has been imported.


## D1 adapter schema correction (2026-11-20)

A source review found that the original generic `put()` wrote only `id` and `record_json`. That is insufficient for tables whose migration schema requires or indexes denormalized columns. In particular, `app_users` requires `username`, `role`, `status`, and `created_at`; `registration_requests` requires `username`, `status`, and `created_at`. It also left owner/scope indexes stale for questions and exams.

The adapter now uses a static per-collection column projection when upserting:
- Validates required user and registration fields before issuing SQL.
- Populates required indexed identity/status/date columns.
- Keeps owner, subject, grade, unit, status, and timestamp columns synchronized for questions, exams, archive, and other indexed collections.
- Keeps all table/column identifiers on fixed allowlists and binds every value, including the JSON document.
- Preserves the complete domain object in `record_json`.

New unit coverage includes required-column checks, owner/scope projection, registration requests, and early rejection of incomplete user records.

A live, temporary probe was also executed against the isolated staging D1 database using the same upsert column sets for `app_users` and `registration_requests`. Both inserts and read-backs succeeded, and both probe rows were deleted in the same batch. This verifies those SQL projections against the deployed staging schema; it is not a substitute for running the repository's full CI suite.

## Remaining release blockers

- The updated adapter is still not connected to `server/db.ts` or the Express routes.
- The application still has synchronous filesystem persistence and Node/Express runtime dependencies.
- Multi-record operations (registration approval, auth-version changes, archive/restore, audit hash-chain append) still need explicit transactional D1 implementations.
- No staging Worker or application API deployment has been created.
- R2 image storage remains an isolated service; authenticated upload/read/replace/delete endpoints and editor integration are not complete.
- PDF generation still depends on local Chromium and has not been ported or validated through Browser Rendering.
- No production data has been imported and no production resource has been changed.

A follow-up disposable D1 batch exercised the generated insert-column shape for all 11 generic collections (`app_users`, `registration_requests`, `notifications`, `subjects`, `curricula`, `questions`, `exams`, `archived_exams`, `layout_templates`, `analyzed_documents`, and `ai_usage_logs`). Each insert and read-back succeeded; all probe rows were deleted in the same batch. A subsequent count check confirmed the user, registration, question, and exam tables remained empty. This was a direct staging-schema smoke test, not execution of the TypeScript unit tests or full CI.


## Worker authentication foundation (2026-11-20)

Added a Worker-native authentication foundation without changing the existing Express authentication path:

- `server/cloudflare/workerAuth.ts` implements HMAC-SHA256 token signing and verification using Web Crypto, TextEncoder/TextDecoder, and base64url. It validates identity bounds, token lifetime, issued-at/expiry, signature, and auth-version equality.
- `server/cloudflare/d1AuthVersionReader.ts` reads `authVersion` asynchronously from the private `app_users.record_json` field using a bound user ID. Missing users and malformed stored versions fail closed; legacy records with no version use version 0, matching the existing filesystem repository.
- `tests/workerAuth.test.ts` covers valid tokens, tampering, expiry, invalid lifetimes, and version invalidation.
- `tests/d1AuthVersionReader.test.ts` covers bound lookups, legacy records, invalid versions, and missing users.

**Integration status:** these modules are isolated foundations only. The current `server/auth.ts` still imports Node crypto, filesystem, Express, and the synchronous `db` singleton. The current `requireAuth` middleware still performs synchronous user lookup and activity updates. Do not route production or staging traffic through the new token functions until an async D1 user repository, user-status lookup, activity update, and Worker request middleware are implemented together.

**CI status:** GitHub currently reports no status checks and no workflow run associated with the latest commit. Therefore the new TypeScript tests have not been confirmed as executed. No test pass is claimed.


## Async D1 user repository (2026-11-20)

Added `server/cloudflare/d1UserRepository.ts` as the next authentication vertical slice:

- `findPublicById` retrieves a user by bound ID and strips both `passwordHash` and internal `authVersion` before returning it.
- `findForLoginByUsername` validates the username format, performs a case-insensitive bound lookup, and requires a structurally valid stored password hash.
- `touchActivity` uses SQLite `json_set` to update last activity and the indexed `updated_at` timestamp without replacing the complete user document.
- Malformed stored user records and malformed login credentials fail closed.

Unit tests cover public-field redaction, case-insensitive bound lookup, invalid usernames, malformed records/credentials, and activity updates.

**Still not integrated:** registration approval, password verification/update, failed-login counters and lockouts, status/role checks, security event writes, notification side effects, and the actual Worker request handler. The current Express login and middleware continue to use the synchronous filesystem repository. Do not enable the Worker auth path until these operations have explicit transaction and rate-limit behavior.

The new unit tests have been added to the existing `tests/*.test.ts` pattern, but the latest GitHub status endpoint still reports no CI checks. Execution remains unverified.


### Follow-up schema constraint correction

A second pass against migration 0001 confirmed that `created_at` is also `NOT NULL` for `app_users` and `registration_requests`. The D1 adapter now validates these timestamps before issuing SQL, and regression tests cover both missing-timestamp cases. This closes a schema constraint that the first adapter test pass had not covered.


## Authentication lifecycle expansion (2026-11-20)

Extended `D1UserRepository` with additional async operations:
- `setPasswordHash` rotates the password hash and increments `authVersion` in the same SQL update, invalidating prior sessions.
- `recordLoginSuccess` clears failed-login counters and lockout state and updates login/activity timestamps.
- `recordLoginFailure` increments failed attempts atomically in SQL and applies a bounded lock duration after the configured threshold.
- Added validation for user IDs, password-hash shape, attempt thresholds, and lock durations.

Added regression tests for password/session rotation, successful-login reset, failed-login counter behavior, and invalid lockout configuration.

These are repository primitives only. The Worker login endpoint, password comparison, unknown-user/IP throttling, registration workflow, approval transactions, notification/audit side effects, and account status checks still need to be composed and integrated. They do not replace or modify the current Express auth path.

## Deployment decision: NO-GO until migration acceptance gates pass

The user authorized finishing the work and then publishing. Authorization is noted; it does not make an incomplete build safe to publish. Current source inspection confirms:
- `package.json` still builds `server.ts` as a Node/Express server.
- `server.ts` imports Node filesystem/path modules and mounts `server/routes.ts`.
- `server/db.ts` remains a synchronous JSON-file database with filesystem backups and migration-on-read behavior.
- The current route module calls synchronous `db.*` methods throughout the application. The previously inventoried surface is 67 database methods and 78 Express routes.
- The new D1 user/token modules are not wired into the running app.
- There is no complete Cloudflare Worker entrypoint serving the application API and frontend, and no verified D1 import/restore path for existing data.
- R2 image storage is not yet connected to authenticated routes or the editor.
- PDF export still depends on local Chromium.
- CI execution for the latest migration commits has not been verified.

Deploying this state would publish an incomplete Worker or run the existing filesystem-backed app on an unsuitable ephemeral runtime, risking loss of exam/user data and broken authentication or PDF export.

**Release gate:** do not create or deploy a production Worker, change production D1/R2 resources, or route the domain until all API routes are migrated, transactional workflows are tested, data import/rollback is proven, image/PDF workflows pass, CI is green, and a staging end-to-end acceptance run succeeds. Production remains untouched.


## Worker request authentication guard (2026-11-20)

Added `server/cloudflare/workerAuthGuard.ts` as the next authentication vertical-slice primitive:
- Extracts only a bounded Bearer token from the Authorization header.
- Verifies the HMAC token and current D1 `authVersion`.
- Loads the current public user record from D1.
- Rejects missing users, inactive accounts, and role changes since token issuance.
- Ignores client-provided identity/role headers entirely.
- Returns a discriminated result with 401/403 status semantics for a future Worker router.

Added focused tests for active-user authentication, forged identity headers, stale auth versions, inactive users, role mismatch, and deleted users.

**Integration boundary remains explicit:** this helper is not mounted in an actual Worker fetch handler, and does not by itself migrate Express routes or implement login/password verification. A production API still requires the complete async route/service conversion, rate limiting for known and unknown usernames/IPs, registration and approval transactions, security audit/notification behavior, and runtime tests with real D1 bindings.


## Initial Worker API entrypoint added (2026-11-20)

Added a minimal API-only module Worker at `worker.ts` plus isolated `wrangler.jsonc` configuration:
- `GET /api/worker/health` reports the Worker runtime.
- `GET /api/worker/auth/me` authenticates a Bearer token against the D1 auth-version reader and current user repository, returning only public user fields.
- Unknown routes return 404; missing/weak staging secret fails closed; responses are marked no-store.
- Added entrypoint tests for health, authenticated identity redaction, missing token, and missing secret.
- Configuration targets only the already-created isolated staging D1 database, disables `workers.dev`, and defines no production route or R2 binding.

This is a deliberately narrow Worker foundation, not a complete app deployment. Login and registration are not implemented in Worker yet; neither are the 78 Express API routes, Vite static assets, R2 upload endpoints, PDF rendering, or data migration. Wrangler is not yet pinned in package dependencies, and the Worker-runtime tests have not been run in Miniflare/Cloudflare. Do not deploy or route production traffic to this entrypoint.

## Worker registration and login endpoints (2026-11-20)

Added a first executable authentication slice on the staging branch:

- `POST /api/worker/auth/register` validates name, username, password confirmation, role, subject IDs, and grade assignments. It uses `bcryptjs` asynchronous hashing, writes only a pending registration request, and removes the password hash from the response.
- `POST /api/worker/auth/login` verifies the same bcryptjs hash format used by the existing Express application, enforces account status and persistent account lockout, updates successful/failed login state, and issues a Web Crypto HMAC session.
- `GET /api/worker/auth/me` continues to validate token signature, expiry, authVersion, current user status, and role.
- Migration 0003 adds a unique index for pending registration usernames, a durable IP rate-limit table, and the canonical eight subject records required for teacher assignment validation.
- Worker tests now include a pending registration response and a successful login using a bcryptjs hash.

**Important scope boundary:** this is not yet the complete authentication lifecycle. Owner approval/rejection and atomic user creation, password reset/change, security audit and notification parity, and registration management routes remain unimplemented. The endpoints have been committed but not yet validated by a successful CI run or a staging Worker runtime smoke test. Migration 0003 has not been applied to staging D1. Do not use these endpoints until the migration is applied and tests pass.

The existing Express login/register routes remain unchanged and continue to use the JSON-file database. The Worker endpoints are separate staging paths; no production traffic has been switched.

### Worker account approval and review (2026-11-20)

The Worker authentication slice now also includes owner-only registration management:

- `GET /api/worker/owner/registration-requests` lists requests and strips password hashes.
- `POST /api/worker/owner/registration-requests/:id/approve` verifies a current owner session and creates the active user while updating the request in a single D1 batch. The bcrypt hash from signup is reused; no plaintext password is stored or returned.
- `POST .../:id/reject` and `POST .../:id/needs-edit` update review state.
- A partial unique index prevents concurrent duplicate pending registration names.

The owner route checks the signed token against the current D1 user and auth version, then requires `PlatformOwner` or `Administrator`. Teacher assignments are revalidated against active D1 subjects and Grade 1–9. School-admin permissions are set by the server, not by client input.

Migration 0003 was applied to the isolated staging D1 database and verified: the migration marker exists, the durable rate-limit table exists, eight canonical subjects are present, and both user and registration tables remain empty. This is a schema/configuration change only; no user or production data was imported or changed.

**Validation caveat:** endpoint tests have been added, but the latest commit still has no confirmed GitHub CI result and no deployed Worker runtime smoke test. The Worker is not deployed, and no staging session secret has been configured. Therefore this authentication slice is committed and its D1 schema is applied, but it is not yet a verified live sign-in service.


### Frontend authentication, R2 image API, and Browser Run PDF slice (2026-11-20)

- The frontend API client now routes login, current-session lookup, registration, and owner registration list/approve/reject/request-edit calls to Worker endpoints. The rest of the API client remains on the Express path until each route family is migrated.
- The Vite app is configured as Worker static assets with SPA fallback; /api/* requests execute the Worker first.
- Wrangler now binds the isolated staging R2 bucket as QUESTION_IMAGES. Worker image routes authenticate the session, derive owner ID from the verified D1 user, validate image MIME/size and question ID, and provide private owner-scoped read/delete. Frontend question-image handlers upload compressed images to R2 and store the returned image ID instead of a Base64 payload; the renderer fetches a private image as an authenticated Blob.
- Wrangler now declares Browser Run binding BROWSER. The Worker PDF route requires an authenticated session, limits payload size and per-user request rate, strips script/embed/form elements and external resource references, and calls Browser Run's pdf Quick Action. The frontend PDF export now targets this Worker endpoint.

Outstanding acceptance items: execute lint/tests/build and Wrangler dry-run; deploy only to isolated staging after review; configure the staging-only SESSION_SECRET; run authenticated registration/login, image upload/read/delete and PDF rendering smoke tests; verify Arabic fonts, RTL, images, page breaks, and A4 layout; migrate existing Base64 images; migrate all remaining Express routes and data; build and verify backup/restore round-trip. No Worker deployment, live login, PDF render, bulk data import, or production cutover has been confirmed.
