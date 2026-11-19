/**
 * Minimal, parameterized D1 JSON-record store for the Cloudflare migration.
 *
 * This is an isolated infrastructure layer, not a replacement for server/db.ts.
 * The current Express routes call synchronous methods; do not wire this into
 * those routes until the service layer and route handlers are converted to
 * async and their callers are covered by integration tests.
 */

export interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

const COLLECTION_TABLES = {
  users: 'app_users',
  registrationRequests: 'registration_requests',
  notifications: 'notifications',
  subjects: 'subjects',
  curricula: 'curricula',
  questions: 'questions',
  exams: 'exams',
  archive: 'archived_exams',
  layoutTemplates: 'layout_templates',
  analyzedDocuments: 'analyzed_documents',
  aiUsageLogs: 'ai_usage_logs',
} as const;

export type D1CollectionName = keyof typeof COLLECTION_TABLES;

type StoredRecord = Record<string, unknown> & { id: string };
type ColumnSpec = {
  name: string;
  value: (record: StoredRecord) => unknown;
  required?: boolean;
};

const commonCreatedAt: ColumnSpec = {
  name: 'created_at',
  value: (record) => record.createdAt ?? null,
};

const commonUpdatedAt: ColumnSpec = {
  name: 'updated_at',
  value: (record) => record.updatedAt ?? null,
};

/**
 * These projections mirror the non-null and indexed columns in migration 0001.
 * Keeping this allowlist static prevents record properties from becoming SQL
 * identifiers. The full domain object remains in record_json.
 */
const COLLECTION_COLUMNS: Record<D1CollectionName, ColumnSpec[]> = {
  users: [
    { name: 'username', value: (r) => r.username, required: true },
    { name: 'role', value: (r) => r.role, required: true },
    { name: 'status', value: (r) => r.status, required: true },
    commonCreatedAt,
    commonUpdatedAt,
  ],
  registrationRequests: [
    { name: 'username', value: (r) => r.username, required: true },
    { name: 'status', value: (r) => r.status, required: true },
    commonCreatedAt,
    commonUpdatedAt,
  ],
  notifications: [
    { name: 'user_id', value: (r) => r.userId ?? null },
    commonCreatedAt,
  ],
  subjects: [
    { name: 'is_active', value: (r) => r.isActive === false ? 0 : 1 },
    { name: 'sort_order', value: (r) => r.sortOrder ?? 99 },
  ],
  curricula: [
    { name: 'grade', value: (r) => r.grade ?? null },
    { name: 'subject_id', value: (r) => r.subjectId ?? null },
  ],
  questions: [
    { name: 'owner_id', value: (r) => r.ownerId ?? null },
    { name: 'subject_id', value: (r) => r.subjectId ?? null },
    { name: 'grade', value: (r) => r.grade ?? null },
    { name: 'unit_id', value: (r) => r.unitId ?? null },
    commonCreatedAt,
    commonUpdatedAt,
  ],
  exams: [
    { name: 'owner_id', value: (r) => r.ownerId ?? r.createdBy ?? null },
    { name: 'subject_id', value: (r) => r.subjectId ?? null },
    { name: 'grade', value: (r) => r.grade ?? null },
    { name: 'status', value: (r) => r.status ?? null },
    commonCreatedAt,
    commonUpdatedAt,
  ],
  archive: [
    { name: 'owner_id', value: (r) => r.ownerId ?? r.createdBy ?? null },
    { name: 'subject_id', value: (r) => r.subjectId ?? null },
    { name: 'grade', value: (r) => r.grade ?? null },
    { name: 'status', value: (r) => r.status ?? null },
    { name: 'archived_at', value: (r) => r.archivedAt ?? r.updatedAt ?? r.createdAt ?? null },
  ],
  layoutTemplates: [
    { name: 'owner_id', value: (r) => r.ownerId ?? null },
    commonCreatedAt,
  ],
  analyzedDocuments: [
    { name: 'owner_id', value: (r) => r.ownerId ?? null },
    commonCreatedAt,
  ],
  aiUsageLogs: [
    { name: 'user_id', value: (r) => r.userId ?? null },
    { name: 'created_at', value: (r) => r.createdAt ?? r.timestamp ?? null },
  ],
};

function parseRecord<T>(raw: unknown): T {
  if (typeof raw !== 'string') {
    throw new Error('D1 record_json is missing or is not text');
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error('D1 record_json contains invalid JSON');
  }
}

/**
 * D1 adapter for collections whose staging schema has (id, record_json).
 * Table and column identifiers are selected exclusively from static allowlists;
 * all record values are passed as bound parameters.
 */
export class D1RecordStore {
  constructor(private readonly database: D1Database) {}

  async get<T>(collection: D1CollectionName, id: string): Promise<T | null> {
    if (!id) throw new Error('Record id is required');
    const table = COLLECTION_TABLES[collection];
    const row = await this.database
      .prepare(`SELECT record_json FROM ${table} WHERE id = ? LIMIT 1`)
      .bind(id)
      .first<{ record_json: string }>();
    return row ? parseRecord<T>(row.record_json) : null;
  }

  async list<T>(collection: D1CollectionName): Promise<T[]> {
    const table = COLLECTION_TABLES[collection];
    const result = await this.database
      .prepare(`SELECT record_json FROM ${table} ORDER BY rowid`)
      .all<{ record_json: string }>();
    if (!result.success) throw new Error('D1 list query failed');
    return (result.results || []).map((row) => parseRecord<T>(row.record_json));
  }

  async put<T extends StoredRecord>(collection: D1CollectionName, record: T): Promise<void> {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) {
      throw new Error('A non-empty record id is required');
    }

    const table = COLLECTION_TABLES[collection];
    const specs = COLLECTION_COLUMNS[collection];
    const projected = specs.map((spec) => {
      const value = spec.value(record);
      if (spec.required && (value === undefined || value === null || value === '')) {
        throw new Error(`Required D1 field "${spec.name}" is missing for ${collection}`);
      }
      return value ?? null;
    });
    const columns = ['id', ...specs.map((spec) => spec.name), 'record_json'];
    const values = [record.id, ...projected, JSON.stringify(record)];
    const placeholders = columns.map(() => '?').join(', ');
    const updates = columns
      .filter((column) => column !== 'id')
      .map((column) => `${column} = excluded.${column}`)
      .join(', ');

    const result = await this.database
      .prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ` +
        `ON CONFLICT(id) DO UPDATE SET ${updates}`
      )
      .bind(...values)
      .run();
    if (!result.success) throw new Error('D1 write query failed');
  }

  async remove(collection: D1CollectionName, id: string): Promise<boolean> {
    if (!id) throw new Error('Record id is required');
    const table = COLLECTION_TABLES[collection];
    const result = await this.database
      .prepare(`DELETE FROM ${table} WHERE id = ?`)
      .bind(id)
      .run();
    if (!result.success) throw new Error('D1 delete query failed');
    const changes = Number(result.meta?.changes || 0);
    return changes > 0;
  }
}
