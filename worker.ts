import { D1AuthVersionReader } from './server/cloudflare/d1AuthVersionReader.js';
import { D1UserRepository } from './server/cloudflare/d1UserRepository.js';
import { WorkerAuthService } from './server/cloudflare/workerAuthService.js';
import { authenticateWorkerRequest } from './server/cloudflare/workerAuthGuard.js';
import { QuestionImageStorage, type R2Bucket } from './server/cloudflare/questionImageStorage.js';

interface Env {
  DB: D1Database;
  SESSION_SECRET: string;
  ASSETS?: { fetch(request: Request): Promise<Response> };
  QUESTION_IMAGES?: R2Bucket;
  BROWSER?: { quickAction(action: 'pdf', options: Record<string, unknown>): Promise<Response> };
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

    if (!url.pathname.startsWith('/api/') && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }



    if (url.pathname === '/api/worker/questions' && request.method === 'GET') {
      if (serviceUnavailable(env)) return json({ error: 'Service unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const grade = url.searchParams.get('grade') || '';
        const subjectId = url.searchParams.get('subjectId') || '';
        const unitId = url.searchParams.get('unitId') || '';
        const type = url.searchParams.get('type') || '';
        const difficulty = url.searchParams.get('difficulty') || '';
        const search = (url.searchParams.get('search') || '').trim().toLocaleLowerCase();
        const sourceCode = url.searchParams.get('sourceCode') || '';
        const educationalLevel = url.searchParams.get('educationalLevel') || '';
        const grammarCategory = url.searchParams.get('grammarCategory') || '';
        const result = await env.DB.prepare(
          'SELECT record_json FROM questions WHERE owner_id = ? ORDER BY created_at DESC'
        ).bind(auth.user.id).all<{ record_json: string }>();
        if (!result.success) return json({ error: 'Question bank unavailable' }, 503);
        const assignedGrades = Array.isArray(auth.user.assignedGrades) ? auth.user.assignedGrades.map(String) : [];
        const assignedSubjects = Array.isArray(auth.user.assignedSubjects) ? auth.user.assignedSubjects.map(String) : [];
        const unrestricted = ['PlatformOwner', 'Administrator', 'SchoolAdmin'].includes(String(auth.user.role)) ||
          assignedGrades.includes('all') || assignedSubjects.includes('all');
        const list = (result.results || []).flatMap((row) => {
          let question: Record<string, unknown>;
          try { question = JSON.parse(row.record_json) as Record<string, unknown>; } catch { return []; }
          if (typeof question.id !== 'string' || typeof question.grade !== 'string') return [];
          const qSubject = typeof question.subjectId === 'string' ? question.subjectId : 'subj-en';
          if (!unrestricted && (!assignedGrades.includes(question.grade) || !assignedSubjects.includes(qSubject))) return [];
          if (grade && question.grade !== grade) return [];
          if (subjectId && qSubject !== subjectId) return [];
          if (unitId && question.unitId !== unitId) return [];
          if (type && question.type !== type) return [];
          if (difficulty && question.difficulty !== difficulty) return [];
          if (sourceCode && question.sourceCode !== sourceCode) return [];
          if (educationalLevel && question.educationalLevel !== educationalLevel) return [];
          if (grammarCategory && question.grammarCategory !== grammarCategory) return [];
          if (search && ![question.questionText, question.instructions, question.modelAnswer]
            .some((value) => typeof value === 'string' && value.toLocaleLowerCase().includes(search))) return [];
          return [question];
        });
        return json(list);
      } catch (error) {
        console.error('Worker question bank read failed', error);
        return json({ error: 'Question bank unavailable' }, 500);
      }
    }

    if (url.pathname === '/api/worker/catalog/subjects' && request.method === 'GET') {
      if (!env.DB) return json({ error: 'Catalog unavailable' }, 503);
      try {
        const activeOnly = url.searchParams.get('active') === 'true';
        const result = activeOnly
          ? await env.DB.prepare('SELECT record_json FROM subjects WHERE is_active = 1 ORDER BY sort_order ASC').all<{ record_json: string }>()
          : await env.DB.prepare('SELECT record_json FROM subjects ORDER BY sort_order ASC').all<{ record_json: string }>();
        if (!result.success) return json({ error: 'Catalog unavailable' }, 503);
        const subjects = (result.results || []).map((row) => {
          const value: unknown = JSON.parse(row.record_json);
          if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Malformed subject record');
          return value;
        });
        return json(subjects);
      } catch (error) {
        console.error('Worker subject catalog read failed', error);
        return json({ error: 'Catalog unavailable' }, 500);
      }
    }

    if (url.pathname === '/api/worker/school/identity' && request.method === 'GET') {
      if (!env.DB) return json({ error: 'School identity unavailable' }, 503);
      try {
        const row = await env.DB.prepare('SELECT record_json FROM school_settings WHERE singleton_id = 1')
          .first<{ record_json: string }>();
        const defaults = {
          schoolNameAr: 'مدرسة قفلة للتعليم الأساسي',
          schoolNameEn: 'QAFLAH SCHOOL',
          countryTitleAr: 'الجمهورية اليمنية',
          countryTitleEn: 'Republic of Yemen',
          ministryTitleAr: 'وزارة التربية والتعليم',
          ministryTitleEn: 'Ministry of Education',
          logoUrl: '/assets/aistudio/1793675145730_f04991e4.jpg',
          primaryColor: '#1B5E3A',
          defaultAcademicYear: '2026 / 2027',
          defaultTerm: 'الفصل الدراسي الأول',
          defaultShowTeacherName: true,
          defaultHeaderLanguage: 'ar',
          defaultHeaderCompact: false,
          footerNoteAr: 'مدرسة قفلة للتعليم الأساسي – الجمهورية اليمنية',
          footerNoteEn: 'QAFLAH BASIC EDUCATION SCHOOL - YEMEN',
        };
        if (!row) return json(defaults);
        const stored: unknown = JSON.parse(row.record_json);
        if (!stored || typeof stored !== 'object' || Array.isArray(stored)) throw new Error('Malformed school identity');
        return json({ ...defaults, ...(stored as Record<string, unknown>) });
      } catch (error) {
        console.error('Worker school identity read failed', error);
        return json({ error: 'School identity unavailable' }, 500);
      }
    }

    if (url.pathname === '/api/worker/health' && request.method === 'GET') {
      return json({ status: 'ok', runtime: 'cloudflare-workers', timestamp: new Date().toISOString() });
    }


    const pdfRoute = url.pathname.match(/^\/api\/worker\/exams\/([A-Za-z0-9_-]{1,128})\/export-pdf$/);
    if (pdfRoute && request.method === 'POST') {
      if (serviceUnavailable(env) || !env.BROWSER) return json({ error: 'PDF rendering unavailable' }, 503);
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > 10_000_000) return json({ error: 'PDF source is too large' }, 413);
        const body: unknown = await request.json().catch(() => null);
        if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Invalid PDF request' }, 400);
        const input = body as Record<string, unknown>;
        if (typeof input.htmlDocument !== 'string' || input.htmlDocument.length < 100 || input.htmlDocument.length > 9_500_000) {
          return json({ error: 'Invalid PDF document' }, 400);
        }
        const mode = input.mode === 'TeacherAnswerKey' ? 'TeacherAnswerKey' : 'StudentPaper';
        const html = input.htmlDocument
          .replace(/<\/?(?:script|iframe|object|embed|base|form)\b[^>]*>/gi, '')
          .replace(/<link\b[^>]*>/gi, '')
          .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
          .replace(/@import\s+[^;]+;?/gi, '')
          .replace(/url\(\s*(['"]?)(?:https?:|javascript:|file:|data:text\/html)[^)]*\)/gi, 'none')
          .replace(/\s+(?:src|href)\s*=\s*(['"])https?:[^'"]*\1/gi, '');
        const rate = await env.DB.prepare(
          "INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts, locked_until) VALUES (?, ?, 1, NULL) " +
          "ON CONFLICT(bucket_key) DO UPDATE SET attempts = CASE WHEN window_started_at + 60000 <= ? THEN 1 ELSE attempts + 1 END, " +
          "window_started_at = CASE WHEN window_started_at + 60000 <= ? THEN ? ELSE window_started_at END RETURNING attempts"
        ).bind(`pdf:${auth.user.id}`, Date.now(), Date.now(), Date.now(), Date.now()).first<{ attempts: number }>();
        if (!rate || Number(rate.attempts) > 8) return json({ error: 'PDF export rate limit exceeded' }, 429);

        const pdf = await env.BROWSER.quickAction('pdf', {
          html,
          pdfOptions: { printBackground: true, preferCSSPageSize: true },
          rejectRequestPattern: ['.*'],
        });
        if (!pdf.ok) return json({ error: 'PDF rendering failed' }, 502);
        const filename = typeof input.filename === 'string' && /^[A-Za-z0-9._-]{1,100}\.pdf$/i.test(input.filename)
          ? input.filename
          : `exam-${mode === 'TeacherAnswerKey' ? 'answer-key' : 'student'}.pdf`;
        return new Response(pdf.body, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${filename}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (error) {
        console.error('Worker PDF export failed', error);
        return json({ error: 'PDF export failed' }, 500);
      }
    }

    if (url.pathname.startsWith('/api/worker/question-images')) {
      if (serviceUnavailable(env) || !env.QUESTION_IMAGES) {
        return json({ error: 'Image storage unavailable' }, 503);
      }
      try {
        const users = new D1UserRepository(env.DB);
        const versions = new D1AuthVersionReader(env.DB);
        const auth = await authenticateWorkerRequest(request, env.SESSION_SECRET, versions, users);
        if (!auth.ok) return json({ error: auth.error }, auth.status);
        const storage = new QuestionImageStorage(env.QUESTION_IMAGES, env.DB);
        const ownerId = typeof auth.user.id === 'string' ? auth.user.id : '';
        if (!ownerId) return json({ error: 'Invalid authenticated user' }, 401);

        if (url.pathname === '/api/worker/question-images' && request.method === 'POST') {
          const length = Number(request.headers.get('Content-Length') || 0);
          if (length > 4_100_000) return json({ error: 'Image payload is too large' }, 413);
          const body: unknown = await request.json().catch(() => null);
          if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return json({ error: 'Invalid image payload' }, 400);
          }
          const input = body as Record<string, unknown>;
          const questionId = typeof input.questionId === 'string' ? input.questionId : '';
          const dataUrl = typeof input.imageDataUrl === 'string' ? input.imageDataUrl : '';
          const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
          if (!match || match[2].length > 3_916_020) return json({ error: 'Unsupported or oversized image' }, 400);
          const binary = atob(match[2]);
          const bytes = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
          const metadata = await storage.upload({
            ownerId,
            questionId,
            contentType: match[1],
            bytes,
          });
          return json({ success: true, image: { id: metadata.id, questionId: metadata.questionId, contentType: metadata.contentType, byteSize: metadata.byteSize } }, 201);
        }

        const imageMatch = url.pathname.match(/^\/api\/worker\/question-images\/([A-Za-z0-9_-]{1,128})$/);
        if (imageMatch && request.method === 'GET') {
          const image = await storage.getForOwner(imageMatch[1], ownerId);
          if (!image) return json({ error: 'Image not found' }, 404);
          return new Response(image.bytes, {
            headers: {
              'Content-Type': image.contentType,
              'Content-Length': String(image.byteSize),
              'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff',
            },
          });
        }
        if (imageMatch && request.method === 'DELETE') {
          const deleted = await storage.deleteForOwner(imageMatch[1], ownerId);
          return deleted ? json({ success: true }) : json({ error: 'Image not found' }, 404);
        }
        return json({ error: 'Not found' }, 404);
      } catch (error) {
        console.error('Worker question image request failed', error);
        return json({ error: 'Image request failed' }, 400);
      }
    }

    if (url.pathname.startsWith('/api/worker/auth/') || url.pathname.startsWith('/api/worker/owner/')) {
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

          const match = url.pathname.match(/^\/api\/worker\/owner\/registration-requests\/([^/]+)\/(approve|reject|needs-edit)$/);
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
