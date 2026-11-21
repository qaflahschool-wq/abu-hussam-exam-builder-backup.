import type { D1Database } from './d1RecordStore.js';

export interface R2ObjectBody {
  arrayBuffer(): Promise<ArrayBuffer>;
  httpMetadata?: { contentType?: string };
}

export interface R2Bucket {
  put(
    key: string,
    value: Uint8Array,
    options: { httpMetadata: { contentType: string }; customMetadata: Record<string, string> }
  ): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

export interface QuestionImageMetadata {
  id: string;
  ownerId: string;
  questionId: string;
  objectKey: string;
  contentType: 'image/jpeg' | 'image/png' | 'image/webp';
  byteSize: number;
  checksumSha256: string;
  createdAt: string;
}

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_IMAGE_BYTES = 2_936_012; // 2.8 MiB after client-side compression

function hasValidImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === 'image/png') {
    return bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  }
  if (contentType === 'image/jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (contentType === 'image/webp') {
    return bytes.length >= 12 &&
      bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
      bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
  }
  return false;
}

function assertSafeSegment(value: string, label: string): void {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
    throw new Error(`Invalid ${label}`);
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digestInput = new Uint8Array(bytes.byteLength);
  digestInput.set(bytes);
  const digest = await crypto.subtle.digest('SHA-256', digestInput.buffer as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

/**
 * Private question-image storage for a Worker.
 * Call only after the request's session has been authenticated and ownerId has
 * been taken from the verified session, never from an untrusted request body.
 */
export class QuestionImageStorage {
  constructor(private readonly bucket: R2Bucket, private readonly database: D1Database) {}

  async upload(input: {
    ownerId: string;
    questionId: string;
    contentType: string;
    bytes: Uint8Array;
  }): Promise<QuestionImageMetadata> {
    assertSafeSegment(input.ownerId, 'owner id');
    assertSafeSegment(input.questionId, 'question id');
    if (!ALLOWED_TYPES.has(input.contentType)) throw new Error('Unsupported image type');
    if (!(input.bytes instanceof Uint8Array) || input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('Image size is outside the allowed range');
    }
    if (!hasValidImageSignature(input.contentType, input.bytes)) {
      throw new Error('Image content does not match the declared image type');
    }

    const metadata: QuestionImageMetadata = {
      id: crypto.randomUUID(),
      ownerId: input.ownerId,
      questionId: input.questionId,
      objectKey: `question-images/${input.ownerId}/${input.questionId}/${crypto.randomUUID()}`,
      contentType: input.contentType as QuestionImageMetadata['contentType'],
      byteSize: input.bytes.byteLength,
      checksumSha256: await sha256Hex(input.bytes),
      createdAt: new Date().toISOString(),
    };

    await this.bucket.put(metadata.objectKey, input.bytes, {
      httpMetadata: { contentType: metadata.contentType },
      customMetadata: { ownerId: metadata.ownerId, questionId: metadata.questionId, imageId: metadata.id },
    });

    try {
      const record = {
        id: metadata.id,
        ownerId: metadata.ownerId,
        questionId: metadata.questionId,
        objectKey: metadata.objectKey,
        contentType: metadata.contentType,
        byteSize: metadata.byteSize,
        checksumSha256: metadata.checksumSha256,
        createdAt: metadata.createdAt,
      };
      const result = await this.database.prepare(
        'INSERT INTO question_images (id, owner_id, question_id, object_key, content_type, byte_size, checksum_sha256, record_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).bind(
        metadata.id,
        metadata.ownerId,
        metadata.questionId,
        metadata.objectKey,
        metadata.contentType,
        metadata.byteSize,
        metadata.checksumSha256,
        JSON.stringify(record),
        metadata.createdAt
      ).run();
      if (!result.success) throw new Error('Could not save image metadata');
      return metadata;
    } catch (error) {
      // Compensate the R2 write if metadata persistence fails.
      await this.bucket.delete(metadata.objectKey).catch(() => undefined);
      throw error;
    }
  }

  async getForOwner(imageId: string, ownerId: string): Promise<{
    bytes: ArrayBuffer;
    contentType: string;
    byteSize: number;
  } | null> {
    assertSafeSegment(imageId, 'image id');
    assertSafeSegment(ownerId, 'owner id');
    const row = await this.database.prepare(
      'SELECT object_key, content_type, byte_size FROM question_images WHERE id = ? AND owner_id = ? LIMIT 1'
    ).bind(imageId, ownerId).first<{
      object_key: string;
      content_type: string;
      byte_size: number;
    }>();
    if (!row) return null;

    const object = await this.bucket.get(row.object_key);
    if (!object) return null;
    return {
      bytes: await object.arrayBuffer(),
      contentType: row.content_type,
      byteSize: Number(row.byte_size),
    };
  }

  async deleteForOwner(imageId: string, ownerId: string): Promise<boolean> {
    assertSafeSegment(imageId, 'image id');
    assertSafeSegment(ownerId, 'owner id');
    const row = await this.database.prepare(
      'SELECT object_key FROM question_images WHERE id = ? AND owner_id = ? LIMIT 1'
    ).bind(imageId, ownerId).first<{ object_key: string }>();
    if (!row) return false;

    const removed = await this.database.prepare(
      'DELETE FROM question_images WHERE id = ? AND owner_id = ?'
    ).bind(imageId, ownerId).run();
    if (!removed.success || Number(removed.meta?.changes || 0) !== 1) {
      throw new Error('Image metadata could not be removed');
    }
    // Any failed R2 deletion leaves only a private orphan, never an exposed object.
    await this.bucket.delete(row.object_key);
    return true;
  }
}
