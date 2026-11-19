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
