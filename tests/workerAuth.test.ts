import assert from 'node:assert/strict';
import test from 'node:test';
import { signWorkerAuthToken, verifyWorkerAuthToken } from '../server/cloudflare/workerAuth.js';

const SECRET = 'test-only-session-secret-with-at-least-32-chars';
const NOW = 1_800_000_000;

function versionReader(version = 3) {
  return { getAuthVersion: async (_userId: string) => version };
}

test('signs and verifies a Worker-compatible HMAC session token', async () => {
  const token = await signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(), 3600, NOW);
  const payload = await verifyWorkerAuthToken(token, SECRET, versionReader(), NOW + 1);
  assert.deepEqual(payload, {
    userId: 'user-1',
    role: 'Teacher',
    iat: NOW,
    exp: NOW + 3600,
    ver: 3,
  });
});

test('rejects a token after auth version changes', async () => {
  const token = await signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(3), 3600, NOW);
  assert.equal(await verifyWorkerAuthToken(token, SECRET, versionReader(4), NOW + 1), null);
});

test('rejects modified signature and malformed tokens', async () => {
  const token = await signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(), 3600, NOW);
  const [body, signature] = token.split('.');
  const replacement = (signature[0] === 'A' ? 'B' : 'A') + signature.slice(1);
  assert.equal(await verifyWorkerAuthToken(body + '.' + replacement, SECRET, versionReader(), NOW + 1), null);
  assert.equal(await verifyWorkerAuthToken('not-a-token', SECRET, versionReader(), NOW + 1), null);
  assert.equal(await verifyWorkerAuthToken('x'.repeat(4097), SECRET, versionReader(), NOW + 1), null);
});

test('rejects expired tokens', async () => {
  const token = await signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(), 60, NOW);
  assert.equal(await verifyWorkerAuthToken(token, SECRET, versionReader(), NOW + 60), null);
});

test('rejects unsafe token lifetime and weak signing secret', async () => {
  await assert.rejects(
    () => signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(), 31 * 24 * 60 * 60, NOW),
    /Invalid token lifetime/
  );
  await assert.rejects(
    () => signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, 'short', versionReader(), 60, NOW),
    /at least 32/
  );
});

test('rejects invalid identity or auth-version values', async () => {
  await assert.rejects(
    () => signWorkerAuthToken({ id: '', role: 'Teacher' }, SECRET, versionReader(), 60, NOW),
    /Invalid user identity/
  );
  await assert.rejects(
    () => signWorkerAuthToken({ id: 'user-1', role: 'Teacher' }, SECRET, versionReader(-1), 60, NOW),
    /Invalid authentication version/
  );
});
