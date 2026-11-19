import assert from 'node:assert/strict';
import test from 'node:test';
import { authenticateWorkerRequest } from '../server/cloudflare/workerAuthGuard.js';
import { signWorkerAuthToken } from '../server/cloudflare/workerAuth.js';

const SECRET = 'test-only-session-secret-with-at-least-32-chars';
const NOW = 1_800_000_000;
const user = { id: 'user-1', username: 'teacher.one', role: 'Teacher', status: 'ACTIVE' };

function readers(overrides: { version?: number; record?: typeof user | null } = {}) {
  return {
    versions: { getAuthVersion: async () => overrides.version ?? 2 },
    users: { findPublicById: async () => overrides.record === undefined ? user : overrides.record },
  };
}

async function requestFor(role = 'Teacher') {
  const token = await signWorkerAuthToken({ id: 'user-1', role }, SECRET, readers().versions, 3600, NOW);
  return new Request('https://example.test/api/private', {
    headers: { authorization: `Bearer ${token}` },
  });
}

test('authenticates active user using signed token and current D1 identity', async () => {
  const deps = readers();
  const result = await authenticateWorkerRequest(await requestFor(), SECRET, deps.versions, deps.users, NOW + 1);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(result.user.id, 'user-1');
});

test('rejects missing bearer token and ignores spoofed identity headers', async () => {
  const deps = readers();
  const request = new Request('https://example.test/api/private', {
    headers: { 'x-user-id': 'user-1', 'x-user-role': 'PlatformOwner' },
  });
  const result = await authenticateWorkerRequest(request, SECRET, deps.versions, deps.users, NOW + 1);
  assert.deepEqual(result, { ok: false, status: 401, error: 'UNAUTHENTICATED' });
});

test('rejects a stale authentication version', async () => {
  const token = await signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, readers({ version: 2 }).versions, 3600, NOW);
  const deps = readers({ version: 3 });
  const result = await authenticateWorkerRequest(
    new Request('https://example.test', { headers: { authorization: `Bearer ${token}` } }),
    SECRET, deps.versions, deps.users, NOW + 1
  );
  assert.equal(result.ok, false);
});

test('blocks inactive accounts', async () => {
  const deps = readers({ record: { ...user, status: 'SUSPENDED' } });
  const result = await authenticateWorkerRequest(await requestFor(), SECRET, deps.versions, deps.users, NOW + 1);
  assert.deepEqual(result, { ok: false, status: 403, error: 'ACCOUNT_INACTIVE' });
});

test('rejects role mismatch between token and current user', async () => {
  const deps = readers();
  const result = await authenticateWorkerRequest(await requestFor('SchoolAdmin'), SECRET, deps.versions, deps.users, NOW + 1);
  assert.deepEqual(result, { ok: false, status: 401, error: 'UNAUTHENTICATED' });
});

test('rejects missing D1 user records', async () => {
  const deps = readers({ record: null });
  const result = await authenticateWorkerRequest(await requestFor(), SECRET, deps.versions, deps.users, NOW + 1);
  assert.deepEqual(result, { ok: false, status: 401, error: 'UNAUTHENTICATED' });
});
