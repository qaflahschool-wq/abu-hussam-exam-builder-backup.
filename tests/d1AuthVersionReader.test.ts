import assert from 'node:assert/strict';
import test from 'node:test';
import { D1AuthVersionReader } from '../server/cloudflare/d1AuthVersionReader.js';
import type { D1Database, D1PreparedStatement } from '../server/cloudflare/d1RecordStore.js';

function mockDatabase(row: { auth_version: number | null } | null, capture: { values?: unknown[] } = {}): D1Database {
  return {
    prepare(sql: string): D1PreparedStatement {
      assert.match(sql, /json_extract\(record_json, '\$\.authVersion'\)/);
      return {
        bind(...values: unknown[]) {
          capture.values = values;
          return this;
        },
        async first<T>() {
          return row as T | null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { return { success: true }; },
      };
    },
  };
}

test('reads current auth version using a bound user id', async () => {
  const capture: { values?: unknown[] } = {};
  const reader = new D1AuthVersionReader(mockDatabase({ auth_version: 7 }, capture));
  assert.equal(await reader.getAuthVersion('user-7'), 7);
  assert.deepEqual(capture.values, ['user-7']);
});

test('treats legacy user records without authVersion as version zero', async () => {
  const reader = new D1AuthVersionReader(mockDatabase({ auth_version: null }));
  assert.equal(await reader.getAuthVersion('legacy-user'), 0);
});

test('fails closed when user does not exist or stored version is invalid', async () => {
  await assert.rejects(() => new D1AuthVersionReader(mockDatabase(null)).getAuthVersion('missing'), /User not found/);
  await assert.rejects(() => new D1AuthVersionReader(mockDatabase({ auth_version: -1 })).getAuthVersion('bad'), /Invalid stored/);
  await assert.rejects(() => new D1AuthVersionReader(mockDatabase({ auth_version: 1.5 })).getAuthVersion('bad'), /Invalid stored/);
});

test('rejects malformed user ids before querying', async () => {
  await assert.rejects(() => new D1AuthVersionReader(mockDatabase(null)).getAuthVersion(''), /Invalid user id/);
});
