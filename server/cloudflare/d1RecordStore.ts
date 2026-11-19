/**
 * Minimal, parameterized D1 JSON-record store for the Cloudflare migration.
 *
 * This is an isolated infrastructure layer, not a replacement for server/db.ts.
 * The current Express routes call synchronous methods; D1 is asynchronous. Do not
 * wire this into those routes until the service layer and route handlers are
 * converted to async and their callers are covered by integration tests.
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
 * Table identifiers are selected exclusively from the fixed allowlist above;
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

  async put<T extends { id: string }>(collection: D1CollectionName, record: T): Promise<void> {
    if (!record || typeof record.id !== 'string' || !record.id.trim()) {
      throw new Error('A non-empty record id is required');
    }
    const table = COLLECTION_TABLES[collection];
    const result = await this.database
      .prepare(
        `INSERT INTO ${table} (id, record_json) VALUES (?, ?) ` +
        'ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json'
      )
      .bind(record.id, JSON.stringify(record))
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
