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
        imageDataUrl: 'data:image/png;base64,iVBORw0KGgo=',
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
        htmlDocument: '<!DOCTYPE html><html><head><title>Exam</title></head><body><main><h1>School Examination</h1><div>Exam content for PDF rendering.</div><script>alert(1)</script></main></body></html>',
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


test('Worker creates D1 questions using the authenticated owner and assigned scope', async () => {
  const scopedUser = { ...user, assignedGrades: ['Grade 7'], assignedSubjects: ['subj-en'] };
  const token = await signWorkerAuthToken({ id: scopedUser.id, role: scopedUser.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  let inserted: { sql: string; values: unknown[] } | undefined;
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(scopedUser) } as T;
              return null;
            },
            async all<T>() { return { success: true, results: [] as T[] }; },
            async run() {
              if (sql.startsWith('INSERT INTO questions')) inserted = { sql, values };
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/questions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        ownerId: 'forged-owner',
        grade: 'Grade 7',
        subjectId: 'subj-en',
        unitId: 'unit-1',
        questionText: 'Choose the correct answer.',
        modelAnswer: 'A',
      }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { success: boolean; question: Record<string, unknown> };
  assert.equal(body.success, true);
  assert.equal(body.question.ownerId, scopedUser.id);
  assert.equal(body.question.subjectId, 'subj-en');
  assert.equal(inserted?.values[1], scopedUser.id);
  assert.equal(inserted?.values[2], 'subj-en');
});

test('Worker rejects question creation outside the authenticated academic scope', async () => {
  const scopedUser = { ...user, assignedGrades: ['Grade 7'], assignedSubjects: ['subj-en'] };
  const token = await signWorkerAuthToken({ id: scopedUser.id, role: scopedUser.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  let writes = 0;
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(scopedUser) } as T;
              return null;
            },
            async all<T>() { return { success: true, results: [] as T[] }; },
            async run() { writes++; return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/questions', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ grade: 'Grade 8', subjectId: 'subj-en', questionText: 'Q', modelAnswer: 'A' }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 403);
  assert.equal(writes, 0);
});

test('Worker question bank returns only the authenticated owner and assigned academic scope', async () => {
  const scopedUser = {
    ...user,
    assignedGrades: ['Grade 7'],
    assignedSubjects: ['subj-en'],
  };
  const records = [
    { id: 'q-owned', ownerId: scopedUser.id, grade: 'Grade 7', subjectId: 'subj-en', unitId: 'u1', type: 'Multiple Choice', difficulty: 'Easy', questionText: 'Hello', modelAnswer: 'Hi', createdAt: '2026-11-20T08:00:00.000Z' },
    { id: 'q-other-grade', ownerId: scopedUser.id, grade: 'Grade 8', subjectId: 'subj-en', questionText: 'Hidden grade', modelAnswer: 'x' },
    { id: 'q-other-subject', ownerId: scopedUser.id, grade: 'Grade 7', subjectId: 'subj-ar', questionText: 'Hidden subject', modelAnswer: 'x' },
  ];
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(scopedUser) } as T;
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM questions WHERE owner_id = ?')) {
                assert.equal(values[0], scopedUser.id);
                return { success: true, results: records.map((record) => ({ record_json: JSON.stringify(record) })) as T[] };
              }
              return { success: true, results: [] as T[] };
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  const token = await signWorkerAuthToken({ id: scopedUser.id, role: scopedUser.role }, SECRET, {
    getAuthVersion: async () => 0,
  }, 3600);
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/questions?grade=Grade%207&subjectId=subj-en', {
      headers: { authorization: `Bearer ${token}` },
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const questions = await response.json() as Array<{ id: string }>;
  assert.deepEqual(questions.map((item) => item.id), ['q-owned']);
});


test('Worker lists archived exams only for the authenticated owner', async () => {
  const owner = { id: 'archive-owner', username: 'archive.owner', role: 'Teacher', status: 'ACTIVE', name: 'Archive Owner', authVersion: 0 };
  const archived = { id: 'exam-archived-1', ownerId: owner.id, grade: 'Grade 7', subjectId: 'subj-en', status: 'Archived', title: 'Archived test' };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, { getAuthVersion: async () => 0 }, 3600);
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(owner) } as T;
              return null;
            },
            async all<T>() {
              if (sql.includes('FROM archived_exams WHERE owner_id = ?')) {
                assert.equal(values[0], owner.id);
                return { success: true, results: [{ record_json: JSON.stringify(archived) }] as T[] };
              }
              return { success: true, results: [] as T[] };
            },
            async run() { return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/archive', { headers: { authorization: `Bearer ${token}` } }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), [archived]);
});

test('Worker restores an archived exam to the authenticated owner workspace', async () => {
  const owner = { id: 'restore-owner', username: 'restore.owner', role: 'Teacher', status: 'ACTIVE', name: 'Restore Owner', authVersion: 0 };
  const archived = { id: 'exam-restore-1', ownerId: owner.id, grade: 'Grade 7', subjectId: 'subj-en', status: 'Archived', title: 'Restore test', createdAt: '2026-11-20T00:00:00.000Z' };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, { getAuthVersion: async () => 0 }, 3600);
  const writes: string[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(..._values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(owner) } as T;
              if (sql.includes('FROM archived_exams WHERE id=')) return { record_json: JSON.stringify(archived) } as T;
              return null;
            },
            async all<T>() { return { success: true, results: [] as T[] }; },
            async run() { writes.push(sql); return { success: true, meta: { changes: 1 } }; },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/archive/exam-restore-1/restore', {
      method: 'POST', headers: { authorization: `Bearer ${token}` },
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { success: true });
  assert.equal(writes.some(sql => sql.startsWith('INSERT INTO exams')), true);
  assert.equal(writes.some(sql => sql.startsWith('DELETE FROM archived_exams')), true);
});

test('Worker exam sharing is owner-only and stores explicit permission', async () => {
  const owner = { id: 'share-owner', username: 'share.owner', role: 'Teacher', status: 'ACTIVE', name: 'Share Owner', authVersion: 0 };
  const target = { id: 'share-target', username: 'share.target', role: 'Teacher', status: 'ACTIVE', name: 'Share Target', assignedGrades: ['Grade 7'], assignedSubjects: ['subj-en'], authVersion: 0 };
  const exam = { id: 'exam-share-1', ownerId: owner.id, grade: 'Grade 7', subjectId: 'subj-en', status: 'Draft', sharedWith: [] };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, { getAuthVersion: async () => 0 }, 3600);
  let updatedRecord = '';
  const db = {
    prepare(sql: string) {
      return {
        bind(...values: unknown[]) {
          return {
            async first<T>() {
              if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
              if (sql.includes('FROM app_users WHERE id =')) {
                const id = values[0];
                const userRecord = id === target.id ? target : owner;
                return { record_json: JSON.stringify(userRecord) } as T;
              }
              if (sql.includes('FROM exams WHERE id=? AND owner_id=?')) {
                return { record_json: JSON.stringify(exam) } as T;
              }
              return null;
            },
            async all<T>() { return { success: true, results: [] as T[] }; },
            async run() {
              if (sql.startsWith('UPDATE exams SET record_json')) updatedRecord = String(values[0]);
              return { success: true, meta: { changes: 1 } };
            },
          };
        },
      };
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/exams/exam-share-1/share', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ targetUserId: target.id, permission: 'view' }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET },
  );
  assert.equal(response.status, 200);
  const body = await response.json() as { exam: { sharedWith: Array<{ userId: string; permission: string }> } };
  assert.equal(body.exam.sharedWith[0].userId, target.id);
  assert.equal(body.exam.sharedWith[0].permission, 'view');
  assert.equal(JSON.parse(updatedRecord).sharingEnabled, true);
});



test('Worker bootstrap creates the first platform owner exactly once', async () => {
  let userCount = 0;
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...input: unknown[]) { values = input; return statement; },
        async first<T>() {
          if (sql.includes('SELECT COUNT(*) AS total FROM app_users')) return { total: userCount } as T;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { userCount += 1; return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  const response = await worker.fetch(
    new Request('https://worker.test/api/worker/bootstrap', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bootstrap-token-with-at-least-32-characters', fullName: 'Platform Owner', username: 'abu.hussam', password: 'a-very-strong-initial-password' }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET, BOOTSTRAP_TOKEN: 'bootstrap-token-with-at-least-32-characters' },
  );
  assert.equal(response.status, 201);
  const body = await response.json() as { user: Record<string, unknown> };
  assert.equal(body.user.role, 'PlatformOwner');
  assert.equal('passwordHash' in body.user, false);
  const second = await worker.fetch(
    new Request('https://worker.test/api/worker/bootstrap', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: 'bootstrap-token-with-at-least-32-characters', fullName: 'Another Owner', username: 'another.owner', password: 'another-very-strong-password' }),
    }),
    { DB: db as never, SESSION_SECRET: SECRET, BOOTSTRAP_TOKEN: 'bootstrap-token-with-at-least-32-characters' },
  );
  assert.equal(second.status, 409);
});

test('Worker creates and decrypts a private encrypted D1 backup in R2', async () => {
  const owner = { id: 'backup-owner', username: 'backup.owner', role: 'PlatformOwner', status: 'ACTIVE', name: 'Backup Owner', authVersion: 0 };
  const token = await signWorkerAuthToken({ id: owner.id, role: owner.role }, SECRET, { getAuthVersion: async () => 0 }, 3600);
  let storedBytes: Uint8Array | undefined;
  let backupRow: Record<string, unknown> | undefined;
  const db = {
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...input: unknown[]) { values = input; return statement; },
        async first<T>() {
          if (sql.includes("json_extract(record_json, '$.authVersion')")) return { auth_version: 0 } as T;
          if (sql.includes('FROM app_users WHERE id =')) return { record_json: JSON.stringify(owner) } as T;
          if (sql.includes('FROM backup_metadata ORDER BY created_at DESC LIMIT 1')) return backupRow as T || null;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() {
          if (sql.includes('INSERT INTO backup_metadata')) {
            backupRow = { id: values[0], filename: values[1], object_key: values[2], byte_size: values[3], iv_hex: values[4], created_by: values[5], created_at: values[6], record_json: values[7] };
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
      return statement;
    },
  };
  const bucket = {
    async put(_key: string, bytes: Uint8Array) { storedBytes = new Uint8Array(bytes); },
    async get(_key: string) {
      if (!storedBytes) return null;
      const copy = new Uint8Array(storedBytes);
      return { arrayBuffer: async () => copy.buffer as ArrayBuffer };
    },
    async delete(_key: string) {},
  };
  const create = await worker.fetch(
    new Request('https://worker.test/api/worker/system/backup', { method: 'POST', headers: { authorization: `Bearer ${token}` } }),
    { DB: db as never, QUESTION_IMAGES: bucket as never, SESSION_SECRET: SECRET },
  );
  assert.equal(create.status, 200);
  assert.ok(storedBytes && storedBytes.length > 0);
  const download = await worker.fetch(
    new Request('https://worker.test/api/worker/system/backup/download', { headers: { authorization: `Bearer ${token}` } }),
    { DB: db as never, QUESTION_IMAGES: bucket as never, SESSION_SECRET: SECRET },
  );
  assert.equal(download.status, 200);
  const snapshot = await download.json() as { format: string; tables: Record<string, unknown[]> };
  assert.equal(snapshot.format, 'ABU_HUSSAM_D1_BACKUP_V1');
  assert.ok(Array.isArray(snapshot.tables.app_users));
});



test('Worker scheduled bootstrap provisions one owner when D1 is empty', async () => {
  let users = 0;
  const db = {
    prepare(sql: string) {
      const statement = {
        bind(..._values: unknown[]) { return statement; },
        async first<T>() {
          if (sql.includes('SELECT COUNT(*) AS total FROM app_users')) return { total: users } as T;
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() { users += 1; return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
  await worker.scheduled?.({} as never, { DB: db as never, INITIAL_OWNER_PASSWORD: 'a-long-random-temporary-password' } as never);
  assert.equal(users, 1);
});
