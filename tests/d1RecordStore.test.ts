import assert from 'node:assert/strict';
import test from 'node:test';
import { D1RecordStore, type D1Database, type D1PreparedStatement } from '../server/cloudflare/d1RecordStore.js';

type Row = { id: string; record_json: string; [key: string]: unknown };

function createMockD1(seed: Record<string, Row[]> = {}) {
  const calls: { sql: string; values: unknown[] }[] = [];
  const tables = structuredClone(seed);
  const database: D1Database = {
    prepare(sql: string): D1PreparedStatement {
      let values: unknown[] = [];
      return {
        bind(...bound: unknown[]) {
          values = bound;
          return this;
        },
        async first<T>() {
          calls.push({ sql, values });
          const table = sql.match(/FROM ([a-z_]+)/)?.[1] || '';
          const id = String(values[0] || '');
          const row = (tables[table] || []).find((item) => item.id === id);
          return (row || null) as T | null;
        },
        async all<T>() {
          calls.push({ sql, values });
          const table = sql.match(/FROM ([a-z_]+)/)?.[1] || '';
          return { success: true, results: (tables[table] || []).map(({ record_json }) => ({ record_json })) as T[] };
        },
        async run() {
          calls.push({ sql, values });
          const insertMatch = sql.match(/^INSERT INTO ([a-z_]+) \(([^)]+)\)/);
          const table = insertMatch?.[1] || sql.match(/FROM ([a-z_]+)/)?.[1] || '';
          if (insertMatch) {
            const columns = insertMatch[2].split(',').map((column) => column.trim());
            const row = Object.fromEntries(columns.map((column, index) => [column, values[index]])) as Row;
            tables[table] ||= [];
            const index = tables[table].findIndex((item) => item.id === row.id);
            if (index >= 0) tables[table][index] = { ...tables[table][index], ...row };
            else tables[table].push(row);
            return { success: true, meta: { changes: 1 } };
          }
          const id = String(values[0] || '');
          const before = tables[table] || [];
          tables[table] = before.filter((item) => item.id !== id);
          return { success: true, meta: { changes: before.length - tables[table].length } };
        },
      };
    },
  };
  return { database, calls, tables };
}

test('reads and parses a record using a bound id', async () => {
  const { database, calls } = createMockD1({
    app_users: [{ id: 'u-1', record_json: JSON.stringify({ id: 'u-1', username: 'teacher' }) }],
  });
  const store = new D1RecordStore(database);
  assert.deepEqual(await store.get('users', 'u-1'), { id: 'u-1', username: 'teacher' });
  assert.deepEqual(calls[0].values, ['u-1']);
  assert.match(calls[0].sql, /WHERE id = \?/);
});

test('returns null for a missing record', async () => {
  const { database } = createMockD1();
  assert.equal(await new D1RecordStore(database).get('questions', 'missing'), null);
});

test('lists records as parsed JSON', async () => {
  const { database } = createMockD1({
    questions: [{ id: 'q-1', record_json: JSON.stringify({ id: 'q-1', questionText: 'Test' }) }],
  });
  assert.deepEqual(await new D1RecordStore(database).list('questions'), [{ id: 'q-1', questionText: 'Test' }]);
});

test('upserts an exam and keeps indexed owner/scope columns in sync', async () => {
  const { database, calls, tables } = createMockD1();
  const record = {
    id: 'e-1',
    title: 'Exam',
    ownerId: 'owner-1',
    subjectId: 'subject-1',
    grade: 'Grade 7',
    status: 'Draft',
    createdAt: '2026-11-20T10:00:00.000Z',
  };
  await new D1RecordStore(database).put('exams', record);
  const row = tables.exams[0];
  assert.equal(row.owner_id, 'owner-1');
  assert.equal(row.subject_id, 'subject-1');
  assert.equal(row.grade, 'Grade 7');
  assert.equal(row.status, 'Draft');
  assert.deepEqual(JSON.parse(String(row.record_json)), record);
  assert.match(calls[0].sql, /owner_id/);
  assert.ok(calls[0].values.includes(JSON.stringify(record)));
});

test('populates required app_users columns for a valid user record', async () => {
  const { database, calls, tables } = createMockD1();
  const record = {
    id: 'u-1',
    username: 'teacher.one',
    role: 'Teacher',
    status: 'ACTIVE',
    createdAt: '2026-11-20T10:00:00.000Z',
  };
  await new D1RecordStore(database).put('users', record);
  assert.equal(tables.app_users[0].username, 'teacher.one');
  assert.equal(tables.app_users[0].role, 'Teacher');
  assert.equal(tables.app_users[0].status, 'ACTIVE');
  assert.equal(tables.app_users[0].created_at, record.createdAt);
  assert.match(calls[0].sql, /username, role, status, created_at/);
});

test('rejects user records missing schema-required fields before querying', async () => {
  const { database, calls } = createMockD1();
  await assert.rejects(
    () => new D1RecordStore(database).put('users', { id: 'u-2', role: 'Teacher', status: 'ACTIVE' }),
    /Required D1 field "username" is missing/
  );
  assert.equal(calls.length, 0);
});

test('upserts a registration request with required indexed columns', async () => {
  const { database, tables } = createMockD1();
  await new D1RecordStore(database).put('registrationRequests', {
    id: 'r-1',
    username: 'new.teacher',
    status: 'PENDING_APPROVAL',
    createdAt: '2026-11-20T10:00:00.000Z',
  });
  assert.equal(tables.registration_requests[0].username, 'new.teacher');
  assert.equal(tables.registration_requests[0].status, 'PENDING_APPROVAL');
});

test('rejects empty ids before querying', async () => {
  const { database, calls } = createMockD1();
  await assert.rejects(() => new D1RecordStore(database).get('users', ''), /id is required/);
  assert.equal(calls.length, 0);
});

test('rejects malformed stored JSON', async () => {
  const { database } = createMockD1({
    questions: [{ id: 'q-2', record_json: '{bad' }],
  });
  await assert.rejects(() => new D1RecordStore(database).get('questions', 'q-2'), /invalid JSON/);
});

test('removes only a matching record', async () => {
  const { database } = createMockD1({ exams: [{ id: 'e-1', record_json: '{}' }] });
  const store = new D1RecordStore(database);
  assert.equal(await store.remove('exams', 'e-1'), true);
  assert.equal(await store.remove('exams', 'e-1'), false);
});
