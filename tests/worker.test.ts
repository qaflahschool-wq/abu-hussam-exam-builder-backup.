import assert from 'node:assert/strict';
import test from 'node:test';
import worker from '../worker.js';
import { signWorkerAuthToken } from '../server/cloudflare/workerAuth.js';

const SECRET = 'worker-test-secret-with-at-least-32-characters';
const NOW = Math.floor(Date.now() / 1000);
const user = { id: 'u1', username: 'teacher.one', role: 'Teacher', status: 'ACTIVE', name: 'Teacher' };

function database(record: typeof user | null, version = 0) {
  return {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes('json_extract(record_json, \'$.authVersion\')')) {
                return record ? { auth_version: version } as T : null;
              }
              if (sql.includes('SELECT record_json FROM app_users')) {
                return record ? { record_json: JSON.stringify(record) } as T : null;
              }
              return null;
            },
            async all<T>() { return { success: true, results: [] as T[] }; },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
}

test('Worker health endpoint is available without database credentials', async () => {
  const response = await worker.fetch(new Request('https://worker.test/api/worker/health'), {} as never);
  assert.equal(response.status, 200);
  assert.equal((await response.json() as { runtime: string }).runtime, 'cloudflare-workers');
});

test('Worker auth/me returns a redacted current user for a valid token', async () => {
  const db = database(user);
  const token = await signWorkerAuthToken({ id: user.id, role: user.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/me', { headers: { authorization: `Bearer ${token}` } }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { user: Record<string, unknown> };
  assert.equal(body.user.id, 'u1');
  assert.equal('passwordHash' in body.user, false);
  assert.equal('authVersion' in body.user, false);
});

test('Worker auth/me rejects missing token', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/me'),
    { DB: database(user) as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 401);
});

test('Worker auth/me fails closed when secret is not configured', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/me'),
    { DB: database(user) as never, SESSION_SECRET: 'short' },
  );
  assert.equal(response.status, 503);
});
