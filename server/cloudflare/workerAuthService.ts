import bcrypt from 'bcryptjs';
import type { D1Database } from './d1RecordStore.js';
import { D1AuthVersionReader } from './d1AuthVersionReader.js';
import { D1UserRepository, type D1StoredUser } from './d1UserRepository.js';
import { signWorkerAuthToken } from './workerAuth.js';

const GRADES = new Set(Array.from({ length: 9 }, (_, i) => `Grade ${i + 1}`));
const USERNAME = /^[a-zA-Z0-9._-]{3,32}$/;
const MAX_PASSWORD_LENGTH = 128;

export type AuthServiceResult =
  | { status: number; body: Record<string, unknown> };

function publicUser(user: D1StoredUser): Record<string, unknown> {
  const { passwordHash: _passwordHash, authVersion: _authVersion, ...safe } = user;
  return safe;
}

function parseRecord(raw: unknown): Record<string, unknown> {
  if (typeof raw !== 'string') throw new Error('Stored record is missing');
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored record is malformed');
  return value as Record<string, unknown>;
}

async function rateKey(scope: string, ip: string, identity: string): Promise<string> {
  const input = new TextEncoder().encode(`${scope}| ${ip.slice(0, 128)} | ${identity.toLowerCase().slice(0, 64)}`);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', input));
  let binary = '';
  for (const byte of digest) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export class WorkerAuthService {
  private readonly users: D1UserRepository;
  private readonly versions: D1AuthVersionReader;

  constructor(private readonly database: D1Database, private readonly secret: string) {
    if (typeof secret !== 'string' || secret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');
    this.users = new D1UserRepository(database);
    this.versions = new D1AuthVersionReader(database);
  }

  private async consumeRateLimit(scope: string, ip: string, identity: string, limit: number, windowMs: number): Promise<number> {
    const key = await rateKey(scope, ip, identity);
    const now = Date.now();
    const row = await this.database.prepare(
      'INSERT INTO auth_rate_limits (bucket_key, window_started_at, attempts, locked_until) VALUES (?, ?, 1, NULL) ' +
      'ON CONFLICT(bucket_key) DO UPDATE SET ' +
      'attempts = CASE WHEN auth_rate_limits.window_started_at + ? <= ? THEN 1 ELSE auth_rate_limits.attempts + 1 END, ' +
      'window_started_at = CASE WHEN auth_rate_limits.window_started_at + ? <= ? THEN ? ELSE auth_rate_limits.window_started_at END ' +
      'RETURNING attempts'
    ).bind(key, now, windowMs, now, windowMs, now, now).first<{ attempts: number }>();
    if (!row) throw new Error('Rate limit state could not be updated');
    return Math.max(0, limit - Number(row.attempts));
  }

  async register(body: unknown, ip: string, userAgent: string): Promise<AuthServiceResult> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: 'بيانات التسجيل غير مكتملة' } };
    }
    const input = body as Record<string, unknown>;
    const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const confirmPassword = typeof input.confirmPassword === 'string' ? input.confirmPassword : '';
    const requestedRole = input.requestedRole === 'SchoolAdmin' ? 'SchoolAdmin' : input.requestedRole === 'Teacher' ? 'Teacher' : null;

    if (input.requestedRole === 'PlatformOwner' || input.requestedRole === 'Administrator') {
      return { status: 403, body: { error: 'غير مسموح بالتسجيل بدور مالك المنصة' } };
    }
    if (fullName.length < 3 || fullName.length > 120 || !USERNAME.test(username)) {
      return { status: 400, body: { error: 'يرجى إدخال الاسم الكامل واسم مستخدم صحيح' } };
    }
    if (!requestedRole) return { status: 400, body: { error: 'الدور المطلوب غير صالح' } };
    if (password.length < 8 || password.length > MAX_PASSWORD_LENGTH) {
      return { status: 400, body: { error: 'كلمة المرور يجب أن تكون بين 8 و128 حرفاً' } };
    }
    if (password !== confirmPassword) return { status: 400, body: { error: 'كلمة المرور وتأكيدها غير متطابقتين' } };

    const remaining = await this.consumeRateLimit('register', ip, username, 8, 15 * 60 * 1000);
    if (remaining < 0) return { status: 429, body: { error: 'تم تجاوز محاولات التسجيل. حاول لاحقاً.' } };

    const subjects = Array.isArray(input.assignedSubjects) ? input.assignedSubjects.filter((v): v is string => typeof v === 'string') : [];
    const grades = Array.isArray(input.assignedGrades) ? input.assignedGrades.filter((v): v is string => typeof v === 'string') : [];
    let assignedSubjects = ['all'];
    let assignedGrades = ['all'];
    if (requestedRole === 'Teacher') {
      const subjectRows = await this.database.prepare('SELECT record_json FROM subjects WHERE is_active = 1').all<{ record_json: string }>();
      if (!subjectRows.success) throw new Error('Could not validate subject assignments');
      const allowed = new Set((subjectRows.results || []).map((row) => String(parseRecord(row.record_json).id)));
      if (!subjects.length || subjects.includes('all') || !subjects.every((id) => allowed.has(id)) ||
          !grades.length || grades.includes('all') || !grades.every((grade) => GRADES.has(grade))) {
        return { status: 400, body: { error: 'يجب تحديد مادة وصف دراسي صحيحين من القائمة المسموح بها' } };
      }
      assignedSubjects = subjects;
      assignedGrades = grades;
    }

    const existingUser = await this.database.prepare('SELECT id FROM app_users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .bind(username).first<{ id: string }>();
    if (existingUser) return { status: 409, body: { error: 'اسم المستخدم مستخدم بالفعل' } };
    const existingRequest = await this.database.prepare(
      "SELECT id FROM registration_requests WHERE username = ? COLLATE NOCASE AND status IN ('PENDING_APPROVAL','NEEDS_EDIT') LIMIT 1"
    ).bind(username).first<{ id: string }>();
    if (existingRequest) return { status: 409, body: { error: 'يوجد طلب تسجيل قائم بهذا الاسم' } };

    const now = new Date().toISOString();
    const id = `reg-${crypto.randomUUID()}`;
    const passwordHash = await bcrypt.hash(password, 10);
    const record = {
      id, fullName, username, passwordHash, requestedRole, assignedSubjects, assignedGrades,
      phone: typeof input.phone === 'string' ? input.phone.trim().slice(0, 40) : undefined,
      notes: typeof input.notes === 'string' ? input.notes.trim().slice(0, 1000) : undefined,
      status: 'PENDING_APPROVAL', ipAddress: ip.slice(0, 128), userAgent: userAgent.slice(0, 300),
      createdAt: now, updatedAt: now,
    };
    const insert = await this.database.prepare(
      'INSERT INTO registration_requests (id, username, status, record_json, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, username, 'PENDING_APPROVAL', JSON.stringify(record), now, now).run();
    if (!insert.success) throw new Error('Registration request could not be saved');

    const { passwordHash: _hash, ...safeRequest } = record;
    return {
      status: 201,
      body: {
        success: true,
        status: 'PENDING_APPROVAL',
        request: safeRequest,
        message: 'تم إرسال طلب التسجيل وهو بانتظار مراجعة مالك المنصة.',
      },
    };
  }

  async login(body: unknown, ip: string): Promise<AuthServiceResult> {
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return { status: 400, body: { error: 'يرجى إدخال اسم المستخدم وكلمة المرور' } };
    }
    const input = body as Record<string, unknown>;
    const username = typeof input.username === 'string' ? input.username.trim() : '';
    const password = typeof input.password === 'string' ? input.password : '';
    if (!USERNAME.test(username) || !password || password.length > MAX_PASSWORD_LENGTH) {
      return { status: 400, body: { error: 'يرجى إدخال اسم المستخدم وكلمة المرور' } };
    }

    const remaining = await this.consumeRateLimit('login-ip', ip, 'all', 20, 10 * 60 * 1000);
    if (remaining < 0) return { status: 429, body: { error: 'تم إيقاف محاولات الدخول مؤقتاً. حاول لاحقاً.', code: 'RATE_LIMITED' } };

    const user = await this.users.findForLoginByUsername(username);
    if (!user) {
      const pending = await this.database.prepare(
        'SELECT record_json FROM registration_requests WHERE username = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 1'
      ).bind(username).first<{ record_json: string }>();
      if (pending) {
        const request = parseRecord(pending.record_json);
        const status = String(request.status || 'PENDING_APPROVAL');
        const message = status === 'NEEDS_EDIT'
          ? 'طلب التسجيل يحتاج إلى استكمال البيانات.'
          : status === 'REJECTED'
          ? 'تم رفض طلب التسجيل.'
          : 'طلب التسجيل قيد المراجعة وبانتظار الموافقة.';
        return { status: 403, body: { error: message, accountStatus: status } };
      }
      return { status: 401, body: { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' } };
    }

    if (user.lockedUntil && new Date(String(user.lockedUntil)).getTime() > Date.now()) {
      const retryAfterSec = Math.ceil((new Date(String(user.lockedUntil)).getTime() - Date.now()) / 1000);
      return { status: 429, body: { error: 'الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة.', code: 'ACCOUNT_TEMP_LOCKED', retryAfterSec } };
    }
    if ((user.status || 'ACTIVE') !== 'ACTIVE') {
      const status = String(user.status || 'ACTIVE');
      return { status: 403, body: { error: status === 'SUSPENDED' ? 'الحساب موقوف مؤقتاً.' : 'الحساب غير مفعل أو بانتظار الموافقة.', accountStatus: status } };
    }

    const valid = await bcrypt.compare(password, String(user.passwordHash));
    if (!valid) {
      const failure = await this.users.recordLoginFailure(user.id, 5, 10 * 60 * 1000);
      return failure.lockedUntil
        ? { status: 429, body: { error: 'تم تعليق محاولات الدخول مؤقتاً لحماية الحساب.', code: 'ACCOUNT_TEMP_LOCKED' } }
        : { status: 401, body: { error: 'اسم المستخدم أو كلمة المرور غير صحيحة' } };
    }

    await this.users.recordLoginSuccess(user.id);
    const token = await signWorkerAuthToken({ id: user.id, role: user.role }, this.secret, this.versions);
    const current = await this.users.findPublicById(user.id);
    if (!current) throw new Error('User disappeared after successful authentication');
    return { status: 200, body: { success: true, token, user: current } };
  }
}
