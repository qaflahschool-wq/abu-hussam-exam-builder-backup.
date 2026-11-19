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
