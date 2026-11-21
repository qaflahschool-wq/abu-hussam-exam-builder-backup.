import assert from 'node:assert/strict';
import test from 'node:test';
import { D1UserRepository } from '../server/cloudflare/d1UserRepository.js';
import type { D1Database, D1PreparedStatement } from '../server/cloudflare/d1RecordStore.js';

function mockD1(
  row: { record_json: string } | null,
  capture: { sql?: string; values?: unknown[]; runResult?: { success: boolean; meta?: { changes?: number } } } = {}
): D1Database {
  return {
    prepare(sql: string): D1PreparedStatement {
      capture.sql = sql;
      return {
        bind(...values: unknown[]) { capture.values = values; return this; },
        async first<T>() { return row as T | null; },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { return capture.runResult || { success: true, meta: { changes: 1 } }; },
      };
    },
  };
}

const storedUser = {
  id: 'user-1',
  username: 'teacher.one',
  role: 'Teacher',
  status: 'ACTIVE',
  passwordHash: '$2b$10$abcdefghijklmnopqrstuv123456789012345678901234567890',
  authVersion: 4,
  name: 'Teacher One',
};

test('returns public user without password hash or auth version', async () => {
  const repo = new D1UserRepository(mockD1({ record_json: JSON.stringify(storedUser) }));
  const user = await repo.findPublicById('user-1');
  assert.equal(user?.id, 'user-1');
  assert.equal(user?.role, 'Teacher');
  assert.equal('passwordHash' in (user || {}), false);
  assert.equal('authVersion' in (user || {}), false);
});

test('uses a bound case-insensitive username query for login credentials', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const repo = new D1UserRepository(mockD1({ record_json: JSON.stringify(storedUser) }, capture));
  const user = await repo.findForLoginByUsername(' TEACHER.ONE ');
  assert.equal(user?.passwordHash, storedUser.passwordHash);
  assert.match(capture.sql || '', /username = \? COLLATE NOCASE/);
  assert.deepEqual(capture.values, ['TEACHER.ONE']);
});

test('returns null for missing users and invalid usernames', async () => {
  const repo = new D1UserRepository(mockD1(null));
  assert.equal(await repo.findPublicById('missing'), null);
  assert.equal(await repo.findForLoginByUsername('bad username'), null);
});

test('rejects malformed stored records and credentials', async () => {
  await assert.rejects(
    () => new D1UserRepository(mockD1({ record_json: '{"id":"x"}' })).findPublicById('x'),
    /malformed/
  );
  const noHash = { id: 'user-1', username: 'teacher.one', role: 'Teacher', status: 'ACTIVE' };
  await assert.rejects(
    () => new D1UserRepository(mockD1({ record_json: JSON.stringify(noHash) })).findForLoginByUsername('teacher.one'),
    /credential is malformed/
  );
});

test('updates activity using a bound user id and timestamp', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const repo = new D1UserRepository(mockD1(null, capture));
  assert.equal(await repo.touchActivity('user-1', '2026-11-20T12:00:00.000Z'), true);
  assert.match(capture.sql || '', /json_set\(record_json/);
  assert.deepEqual(capture.values, ['2026-11-20T12:00:00.000Z', '2026-11-20T12:00:00.000Z', 'user-1']);
});

test('returns false when activity update affects no row', async () => {
  const repo = new D1UserRepository(mockD1(null, { runResult: { success: true, meta: { changes: 0 } } }));
  assert.equal(await repo.touchActivity('missing', '2026-11-20T12:00:00.000Z'), false);
});

test('rotates password hash and increments auth version in one statement', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const repo = new D1UserRepository(mockD1(null, capture));
  assert.equal(await repo.setPasswordHash('user-1', '$2b$10$abcdefghijklmnopqrstuv123456789012345678901234567890', '2026-11-20T12:00:00.000Z'), true);
  assert.match(capture.sql || '', /authVersion.*COALESCE/);
  assert.deepEqual(capture.values, ['$2b$10$abcdefghijklmnopqrstuv123456789012345678901234567890', '2026-11-20T12:00:00.000Z', 'user-1']);
});

test('records successful login by clearing failures and lockout', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const repo = new D1UserRepository(mockD1(null, capture));
  assert.equal(await repo.recordLoginSuccess('user-1', '2026-11-20T12:00:00.000Z'), true);
  assert.match(capture.sql || '', /failedLoginAttempts/);
  assert.match(capture.sql || '', /lastLoginAt/);
  assert.deepEqual(capture.values, ['2026-11-20T12:00:00.000Z', '2026-11-20T12:00:00.000Z', '2026-11-20T12:00:00.000Z', 'user-1']);
});

test('increments failed login attempts atomically and returns lock state', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const fake = mockD1(null, capture);
  let calls = 0;
  const database: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      calls++;
      const base = fake.prepare(sql);
      if (calls === 2) {
        return {
          bind(...values: unknown[]) { capture.values = values; return this; },
          async first<T>() { return { failed_attempts: 5, locked_until: '2026-11-20T12:15:00.000Z' } as T; },
          async all<T>() { return { success: true, results: [] as T[] }; },
          async run() { return { success: true }; },
        };
      }
      return base;
    },
  };
  const repo = new D1UserRepository(database);
  const result = await repo.recordLoginFailure('user-1', 5, 900000, new Date('2026-11-20T12:00:00.000Z'));
  assert.equal(result.found, true);
  assert.equal(result.failedAttempts, 5);
  assert.equal(result.lockedUntil, '2026-11-20T12:15:00.000Z');
  assert.match(capture.sql || '', /failedLoginAttempts/);
});

test('rejects invalid lockout settings before querying', async () => {
  const capture: { sql?: string; values?: unknown[] } = {};
  const repo = new D1UserRepository(mockD1(null, capture));
  await assert.rejects(() => repo.recordLoginFailure('user-1', 0), /maximum login attempts/);
  await assert.rejects(() => repo.recordLoginFailure('user-1', 5, 0), /lock duration/);
  assert.equal(capture.sql, undefined);
});
