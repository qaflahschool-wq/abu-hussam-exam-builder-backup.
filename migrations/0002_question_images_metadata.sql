-- Migration 0002: private R2 question-image metadata.
-- Image bytes remain in a private R2 bucket; D1 stores only ownership and object metadata.

CREATE TABLE IF NOT EXISTS question_images (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 2936012),
  checksum_sha256 TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_question_images_owner_question
  ON question_images(owner_id, question_id);
CREATE INDEX IF NOT EXISTS idx_question_images_question
  ON question_images(question_id);

INSERT OR IGNORE INTO app_migrations (version, applied_at, checksum)
VALUES ('0002_question_images_metadata', CURRENT_TIMESTAMP, 'question-images-v1');
