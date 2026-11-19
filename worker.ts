import { D1AuthVersionReader } from './server/cloudflare/d1AuthVersionReader.js';
import { D1UserRepository } from './server/cloudflare/d1UserRepository.js';
import { WorkerAuthService } from './server/cloudflare/workerAuthService.js';
import { authenticateWorkerRequest } from './server/cloudflare/workerAuthGuard.js';

interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
}

interface D1Result<T = unknown> {
  success: boolean;
  results?: T[];
  meta?: Record<string, unknown>;
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
}

const json = (body: unknown, status = 200): Response =>
  Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });

function corsHeaders(request: Request): Headers {
  const headers = new Headers();
  const origin = request.headers.get('Origin');
  // Same-origin is the intended deployment. Cross-origin access remains denied
  // until an explicit production origin allowlist is configured.
  if (origin) headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  headers.set('Access-Control-Max-Age', '600');
  return headers;
}

function clientIp(request: Request): string {
  const value = request.headers.get('CF-Connecting-IP') || '';
  return value.slice(0, 128) || 'unknown';
}

function serviceUnavailable(env: Env): boolean {
  return !env.DB || typeof env.SESSION_SECRET !== 'string' || env.SESSION_SECRET.length < 32;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }

    if (url.pathname === '/api/worker/health' && request.method === 'GET') {
      return json({ status: 'ok', runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
    }

    if (url.pathname.startsWith('/api/worker/auth/')) {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const authService = new WorkerAuthService(env.DB, env.SESSION_SECRET);

        if (url.pathname === '/api/worker/auth/register' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => null);
          const result = await authService.register(
            body,
            clientIp(request),
            request.headers.get('User-Agent') || '',
          );
          return json(result.body, result.status);
        }

        if (url.pathname === '/api/worker/auth/login' && request.method === 'POST') {
          const body: unknown = await request.json().catch(() => null);
          const result = await authService.login(body, clientIp(request));
          return json(result.body, result.status);
        }

        if (url.pathname === '/api/worker/auth/me' && request.method === 'GET') {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          return json({ user: auth.user });
        }

        if (url.pathname.startsWith('/api/worker/owner/registration-requests')) {
          const users = new D1UserRepository(env.DB);
          const versions = new D1AuthVersionReader(env.DB);
          const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
          if (!auth.ok) return json({ error: auth.error }, auth.status);
          if (!['PlatformOwner', 'Administrator'].includes(String(auth.user.role))) {
            return json({ error: 'FORBIDDEN' }, 403);
          }

          if (url.pathname === '/api/worker/owner/registration-requests' && request.method === 'GET') {
            const status = url.searchParams.get('status') || undefined;
            return json({ requests: await authService.listRegistrationRequests(status) });
          }

          const match = url.pathname.match(/^\\/api\\/worker\\/owner\\/registration-requests\\/([^/]+)\\/(approve|reject|needs-edit)$/);
          if (match && request.method === 'POST') {
            const requestId = decodeURIComponent(match[1]);
            const body: unknown = await request.json().catch(() => ({}));
            const input = body && typeof body === 'object' ? body as Record<string, unknown> : {};
            if (match[2] === 'approve') {
              const outcome = await authService.approveRegistrationRequest(requestId, auth.user, {
                role: typeof input.role === 'string' ? input.role : undefined,
                assignedSubjects: input.assignedSubjects,
                assignedGrades: input.assignedGrades,
                reviewNote: typeof input.reviewNote === 'string' ? input.reviewNote : undefined,
              });
              return outcome
                ? json({ success: true, ...outcome })
                : json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
            }

            const reviewNote = typeof input.reviewNote === 'string'
              ? input.reviewNote
              : typeof input.reason === 'string' ? input.reason : 'لم تستوفِ البيانات الشروط المطلوبة';
            const status = match[2] === 'reject' ? 'REJECTED' : 'NEEDS_EDIT';
            const updated = await authService.reviewRegistrationRequest(requestId, auth.user, status, reviewNote);
            return updated
              ? json({ success: true, request: updated })
              : json({ error: 'REGISTRATION_NOT_FOUND' }, 404);
          }
        }
      } catch (error) {
        console.error('Worker authentication request failed', error);
        return json({ error: 'Internal server error' }, 500);
      }
    }

    return json({ error: 'Not found' }, 404);
  },
};
