-- Migration 0004: encrypted R2 backup metadata for the staging workspace.
CREATE TABLE IF NOT EXISTS backup_metadata (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  object_key TEXT NOT NULL UNIQUE,
  byte_size INTEGER NOT NULL CHECK (byte_size > 0),
  iv_hex TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
);
CREATE INDEX IF NOT EXISTS idx_backup_metadata_created ON backup_metadata(created_at DESC);
INSERT OR IGNORE INTO app_migrations (version, applied_at, checksum)
VALUES ('0004_backup_metadata', CURRENT_TIMESTAMP, 'encrypted-r2-backup-v1');
