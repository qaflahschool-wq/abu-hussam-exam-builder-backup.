import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { db } from './db.js';
import { recordSecurityEvent, trackLoginFailureWindow } from './security.js';
import { User, ExamShareEntry } from '../src/types/index.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const SECRET_FILE = path.join(DATA_DIR, 'session.secret');

function getSessionSecret(): string {
  if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) {
    return process.env.SESSION_SECRET;
  }
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(SECRET_FILE)) {
    const existing = fs.readFileSync(SECRET_FILE, 'utf-8').trim();
    if (existing.length >= 32) return existing;
  }
  const generated = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, generated, { encoding: 'utf-8', mode: 0o600 });
  return generated;
}

const SESSION_SECRET = getSessionSecret();

export interface TokenPayload {
  userId: string;
  role: string;
  iat: number;
  exp: number;
}

export function signAuthToken(user: User, ttlHours = 24 * 7): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    userId: user.id,
    role: user.role,
    iat: now,
    exp: now + ttlHours * 3600,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  if (!token || typeof token !== 'string' || !token.includes('.')) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  const expectedSig = crypto.createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');

  try {
    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf-8')) as TokenPayload;
    if (!payload.userId || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export interface AuthenticatedRequest extends Request {
  authUser?: User;
}

/**
 * Strictly authenticates requests via signed Bearer token.
 * Actively detects and blocks forged headers such as x-user-id / x-user-role or tampered tokens.
 */
export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const spoofedUserId = req.headers['x-user-id'] ? String(req.headers['x-user-id']) : undefined;
  const spoofedRole = req.headers['x-user-role']
    ? String(req.headers['x-user-role'])
    : req.headers['x-role']
    ? String(req.headers['x-role'])
    : undefined;

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (spoofedUserId || spoofedRole) {
      recordSecurityEvent({
        req,
        actorId: spoofedUserId || 'anonymous',
        actorName: spoofedUserId || 'مجهول',
        actorRole: spoofedRole || 'Guest',
        action: 'SECURITY_IDENTITY_SPOOF_ATTEMPT',
        category: 'SECURITY',
        severity: 'CRITICAL',
        details: `محاولة وصول بدون توكن موثّق مع ترويسة مزورة (${spoofedUserId ? `x-user-id=${spoofedUserId}` : ''} ${spoofedRole ? `x-role=${spoofedRole}` : ''}) إلى ${req.method} ${req.originalUrl}`,
        result: 'BLOCKED',
        reason: 'Missing Bearer token with forged identity header',
        notifyOwner: true,
        ownerNotificationTitle: 'تنبيه أمني حرج: محاولة انتحال هوية',
      });
    }
    res.status(401).json({ error: 'مطلوب تسجيل الدخول للوصول إلى هذا المورد' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  const payload = verifyAuthToken(token);
  if (!payload) {
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const badTracker = trackLoginFailureWindow(`bad-token:${ip}`, 10 * 60 * 1000, 3, 5 * 60 * 1000);
    recordSecurityEvent({
      req,
      actorId: spoofedUserId || 'anonymous',
      actorName: 'توكن غير صالح',
      actorRole: 'Unknown',
      action: 'SECURITY_INVALID_TOKEN',
      category: 'SECURITY',
      severity: badTracker.count >= 2 ? 'HIGH' : 'WARNING',
      details: `استخدام رمز جلسة غير صالح أو منتهي الصلاحية عند طلب ${req.method} ${req.originalUrl}`,
      result: 'BLOCKED',
      reason: 'Invalid or tampered Bearer token',
      notifyOwner: badTracker.count >= 2,
      ownerNotificationTitle: 'تنبيه أمني: محاولة استخدام توكن جلسة غير صالح',
    });
    res.status(401).json({ error: 'جلسة الدخول منتهية أو غير صالحة، يرجى تسجيل الدخول مجدداً' });
    return;
  }

  const user = db.findUserById(payload.userId);
  if (!user) {
    res.status(401).json({ error: 'الحساب غير موجود' });
    return;
  }

  // Detect active header spoofing even with a valid session token
  if (
    (spoofedUserId && spoofedUserId !== user.id) ||
    (spoofedRole && spoofedRole !== user.role)
  ) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_IDENTITY_SPOOF_ATTEMPT',
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: `اكتشاف تلاعب بترويسة الهوية من الحساب ${user.username} (${user.role}): حاول تمرير (${spoofedUserId || '-'} / ${spoofedRole || '-'}) على ${req.method} ${req.originalUrl}`,
      result: 'BLOCKED',
      reason: 'Forged x-user-id / x-role header mismatch against signed JWT',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني حرج: محاولة تلاعب بالصلاحيات والهوية',
    });
    res.status(403).json({
      error: 'تم رفض الطلب: اكتشاف محاولة تلاعب بمعرّف المستخدم أو الصلاحيات.',
      code: 'IDENTITY_SPOOF_DETECTED',
    });
    return;
  }

  const status = user.status || 'ACTIVE';
  if (status !== 'ACTIVE') {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_INACTIVE_ACCOUNT_ACCESS',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `رفض جلسة لحساب حالته (${status}): ${user.username} على ${req.originalUrl}`,
      result: 'BLOCKED',
      reason: `Account status is ${status}`,
      notifyOwner: true,
      ownerNotificationTitle: 'محاولة وصول من حساب موقوف أو غير مفعل',
    });
    res.status(403).json({
      error:
        status === 'SUSPENDED'
          ? 'حسابك موقوف مؤقتاً من قِبل مالك المنصة.'
          : 'حسابك غير مفعل وبانتظار موافقة مالك المنصة.',
    });
    return;
  }

  db.touchUserActivity(user.id);
  req.authUser = user;
  next();
}

export function isPlatformOwner(user?: User): boolean {
  return Boolean(user && (user.role === 'PlatformOwner' || user.role === 'Administrator'));
}

export function isSchoolAdminOrOwner(user?: User): boolean {
  return Boolean(user && (isPlatformOwner(user) || user.role === 'SchoolAdmin'));
}

export function userHasAIAccess(user?: User): boolean {
  return Boolean(user && isPlatformOwner(user) && user.hasAIAccess === true);
}

/**
 * Enforces academic assignment scope on the server.
 * Administrative roles are unrestricted; teachers must have explicit matching
 * grade and subject assignments. Missing assignments fail closed.
 */
export function canAccessAcademicScope(
  user: User,
  grade?: unknown,
  subjectId?: unknown
): boolean {
  if (isSchoolAdminOrOwner(user)) return true;

  const grades = user.assignedGrades;
  const subjects = user.assignedSubjects;
  if (!Array.isArray(grades) || grades.length === 0) return false;
  if (!Array.isArray(subjects) || subjects.length === 0) return false;

  const normalizedGrade = typeof grade === 'string' ? grade.trim() : '';
  const normalizedSubject = typeof subjectId === 'string' ? subjectId.trim() : '';

  if (
    normalizedGrade &&
    !grades.includes('all') &&
    !grades.includes(normalizedGrade)
  ) return false;

  if (
    normalizedSubject &&
    !subjects.includes('all') &&
    !subjects.includes(normalizedSubject)
  ) return false;

  return true;
}

/**
 * Enforces strict server-side exclusion of Teacher & non-authorized accounts from ALL Gemini/AI endpoints.
 */
export function requireAIAccess(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ error: 'غير مصرح' });
    return;
  }

  if (!userHasAIAccess(user)) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_AI_ACCESS_BLOCKED',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `تم رفض محاولة وصول غير مصرح بها إلى الذكاء الاصطناعي (${req.method} ${req.originalUrl}) من الحساب: ${user.username} (${user.role})`,
      result: 'BLOCKED',
      reason: 'AI features are strictly restricted to PlatformOwner (Abu Hussam)',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة وصول غير مصرح بها للذكاء الاصطناعي',
      ownerNotificationMessage: `حاول المستخدم "${user.name}" (@${user.username} · ${user.role}) الوصول إلى مسار الذكاء الاصطناعي (${req.originalUrl}) وتم حظره.`,
    });
    res.status(403).json({
      error: 'ممنوع: وظائف الذكاء الاصطناعي محصورة بحساب صاحب النظام (أبوحسام) فقط، ولا تتاح لحسابات المعلمين أو الإدارة.',
      code: 'AI_ACCESS_DENIED',
    });
    return;
  }
  next();
}

export function requirePlatformOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.authUser;
  if (!isPlatformOwner(user)) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_OWNER_ONLY_BLOCKED',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `محاولة وصول غير مصرح بها لصلاحيات مالك المنصة (${req.method} ${req.originalUrl}) من الحساب: ${user?.username || 'unknown'} (${user?.role || 'unknown'})`,
      result: 'BLOCKED',
      reason: 'PlatformOwner-exclusive endpoint',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة وصول للوحة/صلاحية حصرية للمالك',
      ownerNotificationMessage: `حاول "${user?.name || 'مستخدم'}" (@${user?.username || '-'} · ${user?.role || '-'}) الوصول إلى (${req.originalUrl}) وتم حظر الطلب.`,
    });
    res.status(403).json({ error: 'هذه الصلاحية محصورة بصاحب المنصة (أبوحسام) فقط' });
    return;
  }
  next();
}

export function requireSchoolAdminOrOwner(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const user = req.authUser;
  if (!isSchoolAdminOrOwner(user)) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_ADMIN_BLOCKED',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `محاولة وصول غير مصرح بها لصلاحيات الإدارة (${req.method} ${req.originalUrl}) من الحساب: ${user?.username || 'unknown'}`,
      result: 'BLOCKED',
      reason: 'SchoolAdmin or PlatformOwner privilege required',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة وصول لصلاحيات الإدارة',
    });
    res.status(403).json({ error: 'هذه العملية تتطلب صلاحية إدارة المدرسة أو صاحب النظام' });
    return;
  }
  next();
}

/**
 * Strict Private Workspace Isolation:
 * A record belongs to its ownerId (or legacy createdBy).
 * Other users can ONLY view or edit if explicitly listed in sharedWith (opt-in, disabled by default).
 */
export function canAccessOwnedRecord(
  user: User,
  record: { ownerId?: string; createdBy?: string; sharedWith?: ExamShareEntry[] },
  mode: 'view' | 'edit'
): boolean {
  const ownerId = record.ownerId || record.createdBy;
  if (ownerId === user.id) return true;

  if (Array.isArray(record.sharedWith) && record.sharedWith.length > 0) {
    const share = record.sharedWith.find((s) => s.userId === user.id);
    if (share) {
      if (mode === 'view') return share.permission === 'view' || share.permission === 'edit';
      if (mode === 'edit') return share.permission === 'edit';
    }
  }
  return false;
}
