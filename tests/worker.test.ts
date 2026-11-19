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

test('Worker registration refuses privileged self-assigned roles', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.12' },
      body: JSON.stringify({
        fullName: 'Attempted Owner',
        username: 'attempt.owner',
        password: 'correct-horse-battery',
        confirmPassword: 'correct-horse-battery',
        requestedRole: 'PlatformOwner',
      }),
    }),
    { DB: authDatabase() as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 403);
});

test('Worker login rejects a wrong bcrypt password without issuing a session', async () => {
  const passwordHash = await bcrypt.hash('correct-horse-battery', 4);
  const stored = {
    id: 'u-wrong-pass',
    username: 'teacher.wrong',
    role: 'Teacher',
    status: 'ACTIVE',
    name: 'Teacher Wrong',
    passwordHash,
    authVersion: 0,
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'CF-Connecting-IP': '192.0.2.13' },
      body: JSON.stringify({ username: 'teacher.wrong', password: 'not-the-password' }),
    }),
    { DB: authDatabase(stored) as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 401);
  const body = await response.json() as Record<string, unknown>;
  assert.equal('token' in body, false);
});

test('Worker owner approval creates an active user through a D1 batch', async () => {
  const owner = { id: 'owner-approval', username: 'platform.owner', role: 'PlatformOwner', status: 'ACTIVE', name: 'Platform Owner', authVersion: 0 };
  const pending = {
    id: 'reg-pending-1',
    fullName: 'New Teacher',
    username: 'new.teacher',
    requestedRole: 'Teacher',
    assignedSubjects: ['subj-en'],
    assignedGrades: ['Grade 7'],
    status: 'PENDING_APPROVAL',
    passwordHash: '$2b$10$abcdefghijklmnopqrstuv123456789012345678901234567890',
    createdAt: '2026-11-20T00:00:00.000Z',
    updatedAt: '2026-11-20T00:00:00.000Z',
  };
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
          if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(owner) } as T;
          if (sql.includes('FROM registration_requests WHERE id =')) return { record_json: JSON.stringify(pending) } as T;
          if (sql.includes('SELECT id FROM app_users WHERE username =')) return null;
          if (sql.includes('FROM school_settings')) return null;
          return null;
        },
        async all<T>() {
          if (sql.includes('FROM subjects')) {
            return { success: true, results: [{ record_json: JSON.stringify({ id: 'subj-en' }) }] as T[] };
          }
          return { success: true, results: [] as T[] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
    async batch(_statements: unknown[]) {
      return [
        { success: true, meta: { changes: 1 } },
        { success: true, meta: { changes: 1 } },
      ];
    },
  };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/owner/registration-requests/reg-pending-1/approve', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ role: 'Teacher', assignedSubjects: ['subj-en'], assignedGrades: ['Grade 7'] }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { user: Record<string, unknown>; request: Record<string, unknown> };
  assert.equal(body.user.username, 'new.teacher');
  assert.equal(body.user.status, 'ACTIVE');
  assert.equal('passwordHash' in body.user, false);
  assert.equal(body.request.status, 'APPROVED');
});

test('Worker delegates non-API requests to the static asset binding', async () => {
  const response = await worker.fetch(
    new Request('https://worker.test/'),
    { ASSETS: { fetch: async (request: Request) => new Response(`asset:${new URL(request.url).pathname}`) } } as never,
  );
  assert.equal(response.status, 200);
  assert.equal(await response.text(), 'asset:/');
});

test('Worker stores question images in private R2 under the authenticated owner, not body identity', async () => {
  const owner = { id: 'owner-image-1', username: 'teacher.image', role: 'Teacher', status: 'ACTIVE', name: 'Image Teacher', authVersion: 0 };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  let storedMetadata: Record<string, string> | undefined;
  const bucket = {
    async put(_key: string, _bytes: Uint8Array, options: { customMetadata: Record<string, string> }) {
      storedMetadata = options.customMetadata;
    },
    async get(_key: string) {
      return { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer };
    },
    async delete(_key: string) {},
  };
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) { return this; },
        async first<T>() {
          if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
          if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(owner) } as T;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/question-images', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerId: 'attacker-controlled-owner',
        questionId: 'question-123',
        imageDataUrl: 'data:image/png;base64,AQID',
      }),
    }),
    { DB: db as never, QUESTION_IMAGES: bucket as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 201);
  assert.equal(storedMetadata?.ownerId, owner.id);
  assert.equal(storedMetadata?.questionId, 'question-123');
  assert.notEqual(storedMetadata?.ownerId, 'attacker-controlled-owner');
});

test('Worker PDF export requires an authenticated session and uses Browser Run', async () => {
  const owner = { id: 'owner-pdf-1', username: 'teacher.pdf', role: 'Teacher', status: 'ACTIVE', name: 'PDF Teacher', authVersion: 0 };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  let captured: Record<string, unknown> | undefined;
  const browser = {
    async quickAction(_action: 'pdf', options: Record<string, unknown>) {
      captured = options;
      return new Response('%PDF-1.4 test-pdf', {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      });
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/exams/exam-123/export-pdf', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        htmlDocument: '<!DOCTYPE html><html><body><div>Exam</div><script>alert(1)</script></body></html>',
        mode: 'StudentPaper',
        filename: 'exam-student.pdf',
      }),
    }),
    { DB: authDatabase(owner) as never, SESSION_SECRET: SECRET, BROWSER: browser },
  );
  assert.equal(response.status, 200);
  assert.match(await response.text(), /^%PDF-/);
  assert.deepEqual(captured?.rejectRequestPattern, ['.*']);
  assert.equal(String(captured?.html).includes('<script>'), false);

  const denied = await worker.fetch(
    new Request('https://worker.test/api/worker/exams/exam-123/export-pdf', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ htmlDocument: '<html><body>Exam</body></html>' }),
    }),
    { DB: authDatabase(owner) as never, SESSION_SECRET: SECRET, BROWSER: browser },
  );
  assert.equal(denied.status, 401);
});
