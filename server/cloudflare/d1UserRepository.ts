import type { D1Database } from './d1RecordStore.js';

export interface D1StoredUser extends Record<string, unknown> {
  id: string;
  username: string;
  role: string;
  status: string;
  passwordHash?: string;
  authVersion?: number;
}

export type D1PublicUser = Omit<D1StoredUser, 'passwordHash' | 'authVersion'>;

function parseStoredUser(raw: unknown): D1StoredUser {
  if (typeof raw !== 'string') throw new Error('Stored user JSON is missing');
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('Stored user JSON is invalid');
  }
  if (
    !value ||
    typeof value !== 'object' ||
    typeof (value as D1StoredUser).id !== 'string' ||
    typeof (value as D1StoredUser).username !== 'string' ||
    typeof (value as D1StoredUser).role !== 'string' ||
    typeof (value as D1StoredUser).status !== 'string'
  ) {
    throw new Error('Stored user record is malformed');
  }
  return value as D1StoredUser;
}

function toPublicUser(user: D1StoredUser): D1PublicUser {
  const { passwordHash: _passwordHash, authVersion: _authVersion, ...safe } = user;
  return safe;
}

/**
 * Async D1 user access for the future Worker authentication flow.
 * This repository is intentionally not wired into Express's synchronous auth.
 */
export class D1UserRepository {
  constructor(private readonly database: D1Database) {}

  async findPublicById(userId: string): Promise<D1PublicUser | null> {
    if (!userId || userId.length > 128) throw new Error('Invalid user id');
    const row = await this.database
      .prepare('SELECT record_json FROM app_users WHERE id = ? LIMIT 1')
      .bind(userId)
      .first<{ record_json: string }>();
    return row ? toPublicUser(parseStoredUser(row.record_json)) : null;
  }

  async findForLoginByUsername(username: string): Promise<D1StoredUser | null> {
    const clean = typeof username === 'string' ? username.trim() : '';
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(clean)) return null;
    const row = await this.database
      .prepare('SELECT record_json FROM app_users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .bind(clean)
      .first<{ record_json: string }>();
    if (!row) return null;
    const user = parseStoredUser(row.record_json);
    if (typeof user.passwordHash !== 'string' || user.passwordHash.length < 20) {
      throw new Error('Stored user credential is malformed');
    }
    return user;
  }

  async touchActivity(userId: string, timestamp = new Date().toISOString()): Promise<boolean> {
    if (!userId || userId.length > 128) throw new Error('Invalid user id');
    const result = await this.database
      .prepare(
        "UPDATE app_users SET record_json = json_set(record_json, '$.lastActivityAt', ?), updated_at = ? WHERE id = ?"
      )
      .bind(timestamp, timestamp, userId)
      .run();
    if (!result.success) throw new Error('Failed to update user activity');
    return Number(result.meta?.changes || 0) > 0;
  }
}
