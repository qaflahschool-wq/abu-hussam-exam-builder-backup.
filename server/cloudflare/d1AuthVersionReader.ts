import type { AuthVersionReader } from './workerAuth.js';
import type { D1Database } from './d1RecordStore.js';

/**
 * Reads the authVersion from the private app_users JSON record.
 * Missing users fail closed; legacy records without authVersion resolve to 0,
 * matching the existing filesystem repository's compatibility behavior.
 */
export class D1AuthVersionReader implements AuthVersionReader {
  constructor(private readonly database: D1Database) {}

  async getAuthVersion(userId: string): Promise<number> {
    if (!userId || userId.length > 128) throw new Error('Invalid user id');
    const row = await this.database
      .prepare(
        "SELECT json_extract(record_json, '$.authVersion') AS auth_version " +
        'FROM app_users WHERE id = ? LIMIT 1'
      )
      .bind(userId)
      .first<{ auth_version: number | null }>();

    if (!row) throw new Error('User not found');
    if (row.auth_version === null) return 0;
    if (!Number.isSafeInteger(row.auth_version) || row.auth_version < 0) {
      throw new Error('Invalid stored authentication version');
    }
    return row.auth_version;
  }
}
