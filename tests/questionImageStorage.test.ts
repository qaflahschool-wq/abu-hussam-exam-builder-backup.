import assert from 'node:assert/strict';
import test from 'node:test';
import {
  QuestionImageStorage,
  type R2Bucket,
  type R2ObjectBody,
} from '../server/cloudflare/questionImageStorage.js';
import type { D1Database, D1PreparedStatement } from '../server/cloudflare/d1RecordStore.js';

function createImageMocks() {
  const objects = new Map<string, Uint8Array>();
  const calls: { sql: string; values: unknown[] }[] = [];
  let selectedOwner = 'owner-1';
  const bucket: R2Bucket = {
    async put(key, bytes) { objects.set(key, new Uint8Array(bytes)); },
    async get(key): Promise<R2ObjectBody | null> {
      const bytes = objects.get(key);
      if (!bytes) return null;
      return { async arrayBuffer() { return bytes.slice().buffer; } };
    },
    async delete(key) { objects.delete(key); },
  };
  const database: D1Database = {
    prepare(sql): D1PreparedStatement {
      let values: unknown[] = [];
      return {
        bind(...bound) { values = bound; return this; },
        async first<T>() {
          calls.push({ sql, values });
          if (sql.includes('FROM question_images')) {
            if (values[1] !== selectedOwner) return null;
            const id = String(values[0]);
            const row = Array.from(objects.keys()).find((key) => key.includes(id));
            // Upload keys intentionally use a separate random ID, so reads use
            // the captured SQL metadata row below.
            return metadataRows.get(id) as T || null;
          }
          return null;
        },
        async all<T>() { return { success: true, results: [] as T[] }; },
        async run() {
          calls.push({ sql, values });
          if (sql.startsWith('INSERT INTO question_images')) {
            metadataRows.set(String(values[0]), {
              object_key: String(values[3]),
              content_type: String(values[4]),
              byte_size: Number(values[5]),
            });
          }
          return { success: true, meta: { changes: 1 } };
        },
      };
    },
  };
  const metadataRows = new Map<string, { object_key: string; content_type: string; byte_size: number }>();
  return {
    storage: new QuestionImageStorage(bucket, database),
    objects,
    calls,
    setSelectedOwner(value: string) { selectedOwner = value; },
  };
}

test('uploads a supported image to R2 and persists ownership metadata in D1', async () => {
  const mocks = createImageMocks();
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const metadata = await mocks.storage.upload({
    ownerId: 'owner-1',
    questionId: 'question-1',
    contentType: 'image/png',
    bytes,
  });
  assert.equal(metadata.ownerId, 'owner-1');
  assert.equal(metadata.questionId, 'question-1');
  assert.equal(metadata.byteSize, 4);
  assert.match(metadata.checksumSha256, /^[a-f0-9]{64}$/);
  assert.equal(mocks.objects.has(metadata.objectKey), true);
  assert.match(mocks.calls[0].sql, /INSERT INTO question_images/);
  assert.equal(mocks.calls[0].values[1], 'owner-1');
});

test('rejects unsupported formats before writing to R2', async () => {
  const mocks = createImageMocks();
  await assert.rejects(
    () => mocks.storage.upload({
      ownerId: 'owner-1',
      questionId: 'question-1',
      contentType: 'image/svg+xml',
      bytes: new Uint8Array([1]),
    }),
    /Unsupported image type/
  );
  assert.equal(mocks.objects.size, 0);
});

test('rejects oversized image data', async () => {
  const mocks = createImageMocks();
  await assert.rejects(
    () => mocks.storage.upload({
      ownerId: 'owner-1',
      questionId: 'question-1',
      contentType: 'image/jpeg',
      bytes: new Uint8Array(2_936_013),
    }),
    /Image size/
  );
  assert.equal(mocks.objects.size, 0);
});

test('prevents path-like owner and question identifiers', async () => {
  const mocks = createImageMocks();
  await assert.rejects(
    () => mocks.storage.upload({
      ownerId: '../other-user',
      questionId: 'question-1',
      contentType: 'image/jpeg',
      bytes: new Uint8Array([1]),
    }),
    /Invalid owner id/
  );
  assert.equal(mocks.objects.size, 0);
});

test('reads only images owned by the authenticated user', async () => {
  const mocks = createImageMocks();
  const metadata = await mocks.storage.upload({
    ownerId: 'owner-1',
    questionId: 'question-1',
    contentType: 'image/webp',
    bytes: new Uint8Array([7, 8, 9]),
  });
  mocks.setSelectedOwner('another-owner');
  assert.equal(await mocks.storage.getForOwner(metadata.id, 'another-owner'), null);
  mocks.setSelectedOwner('owner-1');
  const loaded = await mocks.storage.getForOwner(metadata.id, 'owner-1');
  assert.ok(loaded);
  assert.equal(loaded.contentType, 'image/webp');
  assert.deepEqual(Array.from(new Uint8Array(loaded.bytes)), [7, 8, 9]);
});
