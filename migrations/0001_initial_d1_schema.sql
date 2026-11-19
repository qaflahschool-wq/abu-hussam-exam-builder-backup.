-- Migration 0001: durable D1 record store for Abu Hussam Exam Builder.
-- This is an additive staging schema. It does not import data or alter production.
-- Keep the complete JSON document to preserve the existing TypeScript domain shape
-- while the synchronous filesystem repository is incrementally replaced.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  role TEXT NOT NULL,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_app_users_role_status ON app_users(role, status);

CREATE TABLE IF NOT EXISTS registration_requests (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL COLLATE NOCASE,
  status TEXT NOT NULL,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT NOT NULL,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_registration_username_status
  ON registration_requests(username, status);
CREATE INDEX IF NOT EXISTS idx_registration_created
  ON registration_requests(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS subjects (
  id TEXT PRIMARY KEY,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  sort_order INTEGER NOT NULL DEFAULT 99,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
);
CREATE INDEX IF NOT EXISTS idx_subjects_active_order ON subjects(is_active, sort_order);

CREATE TABLE IF NOT EXISTS school_settings (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS curricula (
  id TEXT PRIMARY KEY,
  grade TEXT,
  subject_id TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
);
CREATE INDEX IF NOT EXISTS idx_curricula_grade_subject ON curricula(grade, subject_id);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  subject_id TEXT,
  grade TEXT,
  unit_id TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_questions_owner ON questions(owner_id);
CREATE INDEX IF NOT EXISTS idx_questions_scope ON questions(subject_id, grade, unit_id);

CREATE TABLE IF NOT EXISTS exams (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  subject_id TEXT,
  grade TEXT,
  status TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT,
  updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_exams_owner ON exams(owner_id);
CREATE INDEX IF NOT EXISTS idx_exams_scope ON exams(subject_id, grade, status);

CREATE TABLE IF NOT EXISTS archived_exams (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  subject_id TEXT,
  grade TEXT,
  status TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  archived_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_archived_exams_owner ON archived_exams(owner_id);

CREATE TABLE IF NOT EXISTS layout_templates (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_layout_templates_owner ON layout_templates(owner_id);

CREATE TABLE IF NOT EXISTS analyzed_documents (
  id TEXT PRIMARY KEY,
  owner_id TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_analyzed_documents_owner ON analyzed_documents(owner_id);

CREATE TABLE IF NOT EXISTS ai_settings (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  record_json TEXT NOT NULL CHECK (json_valid(record_json)),
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  created_at TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user_created ON ai_usage_logs(user_id, created_at);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  timestamp TEXT NOT NULL,
  prev_hash TEXT,
  entry_hash TEXT,
  record_json TEXT NOT NULL CHECK (json_valid(record_json))
);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(user_id, timestamp);
