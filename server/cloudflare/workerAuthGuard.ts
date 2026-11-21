import type { D1PublicUser } from './d1UserRepository.js';
import type { AuthVersionReader, WorkerTokenPayload } from './workerAuth.js';
import { verifyWorkerAuthToken } from './workerAuth.js';

export interface PublicUserReader {
  findPublicById(userId: string): Promise<D1PublicUser | null>;
}

export type WorkerAuthResult =
  | { ok: true; user: D1PublicUser; token: WorkerTokenPayload }
  | { ok: false; status: 401 | 403; error: 'UNAUTHENTICATED' | 'ACCOUNT_INACTIVE' };

function bearerToken(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header || !header.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 && token.length <= 4096 ? token : null;
}

/**
 * Worker request guard. It trusts only a signed bearer token and a fresh D1
 * user record; client-supplied identity and role headers are never consulted.
 */
export async function authenticateWorkerRequest(
  request: Request,
  secret: string,
  versions: AuthVersionReader,
  users: PublicUserReader,
  nowSeconds = Math.floor(Date.now() / 1000)
): Promise<WorkerAuthResult> {
  const tokenText = bearerToken(request);
  if (!tokenText) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };

  const token = await verifyWorkerAuthToken(tokenText, secret, versions, nowSeconds);
  if (!token) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };

  const user = await users.findPublicById(token.userId);
  if (!user) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };
  if (user.status !== 'ACTIVE') return { ok: false, status: 403, error: 'ACCOUNT_INACTIVE' };
  if (user.role !== token.role) return { ok: false, status: 401, error: 'UNAUTHENTICATED' };

  return { ok: true, user, token };
}
