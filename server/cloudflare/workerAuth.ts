/**
 * Worker-compatible session token primitives.
 *
 * This module deliberately has no Express, Node crypto, Buffer, filesystem, or
 * synchronous database dependencies. It is not wired into the current Express
 * middleware; integration must happen only after the Worker user repository is
 * implemented and tested.
 */

export interface WorkerTokenPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
  ver: number;
}

export interface AuthVersionReader {
  getAuthVersion(userId: string): Promise<number>;
}

const encoder = new TextEncoder();
const MAX_TOKEN_LENGTH = 4096;
const MAX_TOKEN_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function fromBase64Url(value: string): Uint8Array {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid base64url');
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function importHmacKey(secret: string): Promise<CryptoKey> {
  if (typeof secret !== 'string' || secret.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters');
  }
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

function isValidPayload(value: unknown, now: number): value is WorkerTokenPayload {
  if (!value || typeof value !== 'object') return false;
  const payload = value as Partial<WorkerTokenPayload>;
  return (
    typeof payload.userId === 'string' &&
    payload.userId.length >= 1 &&
    payload.userId.length <= 128 &&
    typeof payload.role === 'string' &&
    payload.role.length >= 1 &&
    payload.role.length <= 64 &&
    Number.isSafeInteger(payload.iat) &&
    Number.isSafeInteger(payload.exp) &&
    Number.isSafeInteger(payload.ver) &&
    (payload.ver as number) >= 0 &&
    (payload.iat as number) > 0 &&
    (payload.iat as number) <= now + 60 &&
    (payload.exp as number) > now &&
    (payload.exp as number) > (payload.iat as number) &&
    (payload.exp as number) - (payload.iat as number) <= MAX_TOKEN_LIFETIME_SECONDS
  );
}

export async function signWorkerAuthToken(
  user: { id: string; role: string },
  secret: string,
  versions: AuthVersionReader,
  ttlSeconds = 7 * 24 * 60 * 60,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<string> {
  if (!user?.id || user.id.length > 128 || !user.role || user.role.length > 64) {
    throw new Error('Invalid user identity');
  }
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds <= 0 || ttlSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error('Invalid token lifetime');
  }
  const version = await versions.getAuthVersion(user.id);
  if (!Number.isSafeInteger(version) || version < 0) {
    throw new Error('Invalid authentication version');
  }
  const payload: WorkerTokenPayload = {
    userId: user.id,
    role: user.role,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    ver: version,
  };
  const encoded = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(encoded)));
  return encoded + '.' + toBase64Url(signature);
}

export async function verifyWorkerAuthToken(
  token: string,
  secret: string,
  versions: AuthVersionReader,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<WorkerTokenPayload | null> {
  if (typeof token !== 'string' || token.length > MAX_TOKEN_LENGTH) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const key = await importHmacKey(secret);
    const signature = fromBase64Url(parts[1]);
    const validSignature = await crypto.subtle.verify(
      'HMAC',
      key,
      signature,
      encoder.encode(parts[0])
    );
    if (!validSignature) return null;

    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(fromBase64Url(parts[0]));
    const payload: unknown = JSON.parse(decoded);
    if (!isValidPayload(payload, nowSeconds)) return null;

    const currentVersion = await versions.getAuthVersion(payload.userId);
    if (!Number.isSafeInteger(currentVersion) || currentVersion !== payload.ver) return null;
    return payload;
  } catch {
    return null;
  }
}
