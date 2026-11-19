-- Migration 0003: Worker authentication lifecycle and durable edge rate limits.
-- This migration is additive and scoped to the isolated staging D1 database.

CREATE UNIQUE INDEX IF NOT EXISTS uq_registration_pending_username
ON registration_requests(username COLLATE NOCASE)
WHERE status IN ('PENDING_APPROVAL', 'NEEDS_EDIT');

CREATE TABLE IF NOT EXISTS auth_rate_limits (
  bucket_key TEXT PRIMARY KEY,
  window_started_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL CHECK (attempts >= 0),
  locked_until INTEGER
);

INSERT OR IGNORE INTO app_migrations (version, applied_at, checksum)
VALUES ('0003_auth_lifecycle', CURRENT_TIMESTAMP, 'auth-lifecycle-v1');
