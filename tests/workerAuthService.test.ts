import assert from 'node:assert/strict';
import test from 'node:test';
import { WorkerAuthService } from '../server/cloudflare/workerAuthService.js';

function rateLimitDatabase(options: { subject?: boolean } = {}) {
  const attempts = new Map<string, number>();
  return {
    attempts,
    prepare(sql: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...input: unknown[]) { values = input; return statement; },
        async first<T>() {
          if (sql.includes('INSERT INTO auth_rate_limits')) {
            const key = String(values[0]);
            const next = (attempts.get(key) || 0) + 1;
            attempts.set(key, next);
            return { attempts: next } as T;
          }
          return null;
        },
        async all<T>() {
          if (options.subject && sql.includes('FROM subjects')) {
            return { success: true, results: [{ record_json: JSON.stringify({ id: 'subject-1' }) }] as T[] };
          }
          return { success: true, results: [] as T[] };
        },
        async run() { return { success: true, meta: { changes: 1 } }; },
      };
      return statement;
    },
  };
}

test('Worker login rate limit blocks attempts beyond the configured limit', async () => {
  const db = rateLimitDatabase();
  const service = new WorkerAuthService(db as never, 'worker-auth-rate-limit-test-secret-32chars');
  const results = [];
  for (let i = 0; i < 21; i++) {
    results.push(await service.login({ username: 'missing.user', password: 'not-a-real-password' }, '192.0.2.10'));
  }
  assert.equal(results.slice(0, 20).every((result) => result.status === 401), true);
  assert.equal(results[20].status, 429);
});

test('Worker registration rate limit blocks attempts beyond the configured limit', async () => {
  const db = rateLimitDatabase({ subject: true });
  const service = new WorkerAuthService(db as never, 'worker-auth-rate-limit-test-secret-32chars');
  const payload = {
    fullName: 'Example Teacher',
    username: 'example.teacher',
    password: 'valid-password-123',
    confirmPassword: 'valid-password-123',
    requestedRole: 'Teacher',
    assignedSubjects: ['subject-1'],
    assignedGrades: ['Grade 7'],
  };
  const results = [];
  for (let i = 0; i < 9; i++) {
    results.push(await service.register(payload, '192.0.2.11', 'test-agent'));
  }
  assert.equal(results.slice(0, 8).every((result) => result.status === 201), true);
  assert.equal(results[8].status, 429);
});
