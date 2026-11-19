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

import bcrypt from 'bcryptjs';

function authDatabase(storedUser: Record<string, unknown> | null = null) {
  return {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (sql.includes('INSERT INTO auth_rate_limits')) return { attempts: 1 } as T;
          if (sql.includes("json_extract(record_json, '$.authVersion')")) {
            return storedUser ? { auth_version: Number(storedUser.authVersion || 0) } as T : null;
          }
          if (sql.includes('FROM app_users WHERE username =')) {
            return storedUser ? { record_json: JSON.stringify(storedUser) } as T : null;
          }
          if (sql.includes('FROM app_users WHERE id =')) {
            return storedUser ? { record_json: JSON.stringify(storedUser) } as T : null;
          }
          if (sql.includes('FROM app_users WHERE username')) return null;
          if (sql.includes('FROM registration_requests')) return null;
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM subjects')) {
            return {
              success: true,
              results: [{ record_json: JSON.stringify({ id: 'subj-en' }) }] as T[],
            };
          }
          return { success: true, results: [] as T[] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
}

test('Worker registration stores a pending request and never returns its password hash', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.10' },
      body: JSON.stringify({
        fullName: 'Test Teacher',
        username: 'teacher.test',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
        requestedRole: 'Teacher',
        assignedSubjects: ['subj-en'],
        assignedGrades: ['Grade 7'],
      }),
    }),
    { DB: authDatabase() as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 201);
  const body = await response.json() as { status: string; request: Record<string, unknown> };
  assert.equal(body.status, 'PENDING_APPROVAL');
  assert.equal(body.request.username, 'teacher.test');
  assert.equal('passwordHash' in body.request, false);
});

test('Worker login verifies the existing bcrypt password format and issues a signed session', async () => {
  const passwordHash = await bcrypt.hash('correct-horse-battery', 4);
  const stored = {
    id: 'u-login',
    username: 'teacher.login',
    role: 'Teacher',
    status: 'ACTIVE',
    name: 'Teacher Login',
    passwordHash,
    authVersion: 0,
    createdAt: '2026-11-20T00:00:00.000Z',
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.11' },
      body: JSON.stringify({ username: 'teacher.login', password: 'correct-horse-battery' }),
    }),
    { DB: authDatabase(stored) as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { token: string; user: Record<string, unknown> };
  assert.equal(typeof body.token, 'string');
  assert.equal(body.user.id, 'u-login');
  assert.equal('passwordHash' in body.user, false);
});

test('Worker registration review listing is restricted to platform owners', async () => {
  const owner = { id: 'owner-1', username: 'platform.owner', role: 'PlatformOwner', status: 'ACTIVE', name: 'Platform Owner', authVersion: 0 };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/owner/registration-requests', {
      headers: { authorization: `Bearer ${token}` },
    }),
    { DB: authDatabase(owner) as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json() as { requests: unknown[] }).requests, []);

  const teacher = { ...owner, id: 'teacher-2', username: 'teacher.two', role: 'Teacher' };
  const teacherToken = await signWorkerAuthToken({ id: teacher.id, role: teacher.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  const denied = await worker.fetch(
    new Request('https://worker.test/api/worker/owner/registration-requests', {
      headers: { authorization: `Bearer ${teacherToken}` },
    }),
    { DB: authDatabase(teacher) as never, SESSION_SECRET: SECRET },
  );
  assert.equal(denied.status, 403);
});
