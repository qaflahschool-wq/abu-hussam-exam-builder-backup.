import express, { NextFunction, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from './db.js';
import { geminiService, ExamGenerationRequest } from './gemini.js';
import { exportExamHtmlToPdf, findChromiumExecutable } from './pdfExporter.js';
import {
  AuthenticatedRequest,
  signAuthToken,
  requireAuth,
  requireAIAccess,
  requirePlatformOwner,
  requireSchoolAdminOrOwner,
  isPlatformOwner,
  userHasAIAccess,
  canAccessOwnedRecord,
  canAccessAcademicScope,
} from './auth.js';
import {
  getClientMeta,
  checkSlidingRateLimit,
  trackLoginFailureWindow,
  isLoginWindowLocked,
  clearLoginFailureWindow,
  recordSecurityEvent,
  getNotificationChannelsStatus,
} from './security.js';

export const router = express.Router();

function hasValidExamImagePayload(exam: any): boolean {
  if (!Array.isArray(exam?.sections)) return true;
  let totalBytes = 0;
  for (const section of exam.sections) {
    if (!Array.isArray(section?.questions)) continue;
    for (const question of section.questions) {
      const image = question?.imageDataUrl;
      if (image === undefined || image === null || image === '') continue;
      if (typeof image !== 'string' || !/^data:image\/(?:png|jpeg|webp);base64,/i.test(image)) return false;
      if (image.length > 4_000_000) return false;
      totalBytes += image.length;
      if (totalBytes > 8_500_000) return false;
    }
  }
  return true;
}

function requireAIRateLimit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const userId = req.authUser?.id || 'anonymous';
  const limit = checkSlidingRateLimit(`ai-request:${userId}`, 15, 60 * 1000);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSec));
    res.status(429).json({
      error: 'تم تجاوز الحد المؤقت لطلبات الذكاء الاصطناعي. يرجى الانتظار ثم إعادة المحاولة.',
      code: 'AI_RATE_LIMITED',
      retryAfterSec: limit.retryAfterSec,
    });
    return;
  }
  next();
}

function hasValidTeacherAssignments(subjects: unknown, grades: unknown): boolean {
  const validSubjects = new Set(db.getSubjects().map((subject) => subject.id));
  const validGrades = new Set(Array.from({ length: 9 }, (_, index) => `Grade ${index + 1}`));
  return (
    Array.isArray(subjects) &&
    subjects.length > 0 &&
    !subjects.includes('all') &&
    subjects.every((id) => typeof id === 'string' && validSubjects.has(id)) &&
    Array.isArray(grades) &&
    grades.length > 0 &&
    !grades.includes('all') &&
    grades.every((grade) => typeof grade === 'string' && validGrades.has(grade))
  );
}

// ==================== PUBLIC ROUTES ====================

router.get('/health', (_req, res: Response): void => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.get('/school/identity', (_req, res: Response): void => {
  res.json(db.getSchoolSettings());
});

router.get('/subjects/public', (_req, res: Response): void => {
  const activeSubjects = db.getSubjects(true).map((s) => ({
    id: s.id,
    code: s.code,
    nameAr: s.nameAr,
    nameEn: s.nameEn,
    defaultDirection: s.defaultDirection,
    sortOrder: s.sortOrder,
    isCore: s.isCore,
    isQuran: s.isQuran,
  }));
  res.json(activeSubjects);
});

router.post('/auth/register', (req, res: Response): void => {
  const meta = getClientMeta(req);
  const rl = checkSlidingRateLimit(`register:${meta.ipAddress}`, 8, 15 * 60 * 1000);
  if (!rl.allowed) {
    recordSecurityEvent({
      req,
      actorId: 'anonymous',
      actorName: req.body?.username || 'زائر',
      actorRole: 'Guest',
      action: 'SECURITY_REGISTER_RATE_LIMITED',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `تجاوز حد محاولات التسجيل المسموحة من العنوان ${meta.ipAddress}`,
      result: 'BLOCKED',
      reason: 'Registration rate limit exceeded',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه: تجاوز حد محاولات التسجيل المتكررة',
    });
    res.status(429).json({
      error: `تم تجاوز الحد المسموح لطلبات التسجيل. يرجى المحاولة بعد ${rl.retryAfterSec} ثانية.`,
    });
    return;
  }

  const {
    fullName,
    username,
    password,
    confirmPassword,
    requestedRole,
    assignedSubjects,
    assignedGrades,
    phone,
    notes,
  } = req.body || {};

  // Strictly block any attempt to register as PlatformOwner or Administrator
  if (requestedRole === 'PlatformOwner' || requestedRole === 'Administrator') {
    recordSecurityEvent({
      req,
      actorId: 'anonymous',
      actorName: String(username || fullName || 'مجهول'),
      actorRole: String(requestedRole),
      action: 'SECURITY_PRIVILEGE_ESCALATION_ATTEMPT',
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: `محاولة تسجيل مرفوضة بدور غير مسموح (${requestedRole}) باسم المستخدم: ${username}`,
      result: 'BLOCKED',
      reason: 'Attempted PlatformOwner signup',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني حرج: محاولة تسجيل بصلاحية مالك المنصة',
    });
    res.status(403).json({
      error: 'غير مسموح بالتسجيل بدور مالك المنصة. الأدوار المتاحة للتسجيل هي: معلم أو إدارة المدرسة فقط.',
    });
    return;
  }

  if (!fullName || String(fullName).trim().length < 3) {
    res.status(400).json({ error: 'يرجى إدخال الاسم الكامل (3 أحرف على الأقل)' });
    return;
  }

  const cleanUsername = String(username || '').trim();
  if (!/^[a-zA-Z0-9._-]{3,32}$/.test(cleanUsername)) {
    res.status(400).json({
      error: 'اسم المستخدم يجب أن يكون بين 3 و32 حرفاً باللغة الإنجليزية والأرقام فقط (أو . _ -)',
    });
    return;
  }

  if (!password || String(password).length < 8) {
    res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
    return;
  }

  if (password !== confirmPassword) {
    res.status(400).json({ error: 'كلمة المرور وتأكيد كلمة المرور غير متطابقتين' });
    return;
  }

  const safeRole: 'Teacher' | 'SchoolAdmin' =
    requestedRole === 'SchoolAdmin' ? 'SchoolAdmin' : 'Teacher';

  const subjectsArr = Array.isArray(assignedSubjects) ? assignedSubjects.map(String) : [];
  const gradesArr = Array.isArray(assignedGrades) ? assignedGrades.map(String) : [];

  if (safeRole === 'Teacher' && !hasValidTeacherAssignments(subjectsArr, gradesArr)) {
    res.status(400).json({ error: 'يجب تحديد مادة وصف دراسي صحيحين من القائمة المسموح بها' });
    return;
  }

  try {
    const reqRecord = db.createRegistrationRequest({
      fullName: String(fullName),
      username: cleanUsername,
      password: String(password),
      requestedRole: safeRole,
      assignedSubjects: safeRole === 'SchoolAdmin' ? ['all'] : subjectsArr,
      assignedGrades: safeRole === 'SchoolAdmin' ? ['all'] : gradesArr,
      phone: phone ? String(phone) : undefined,
      notes: notes ? String(notes) : undefined,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
    });

    recordSecurityEvent({
      req,
      actorId: reqRecord.id,
      actorName: reqRecord.fullName,
      actorRole: reqRecord.requestedRole,
      action: 'REGISTRATION_SUBMITTED',
      category: 'REGISTRATION',
      severity: 'INFO',
      details: `طلب تسجيل جديد من "${reqRecord.fullName}" (@${reqRecord.username}) بصلاحية (${reqRecord.requestedRole === 'SchoolAdmin' ? 'إدارة المدرسة' : 'معلم'}) وبانتظار موافقة مالك المنصة.`,
      targetUserId: reqRecord.id,
      result: 'SUCCESS',
      notifyOwner: true,
      ownerNotificationCategory: 'REGISTRATION',
      ownerNotificationTitle: `طلب تسجيل جديد بانتظار الموافقة: ${reqRecord.fullName}`,
      ownerNotificationMessage: `تقدّم "${reqRecord.fullName}" (@${reqRecord.username}) بطلب انضمام كـ (${reqRecord.requestedRole === 'SchoolAdmin' ? 'إدارة مدرسة' : 'معلم'}). الطلب معلق حتى توافق عليه.`,
    });

    res.status(201).json({
      success: true,
      status: 'PENDING_APPROVAL',
      request: reqRecord,
      message: 'تم إرسال طلب التسجيل بنجاح وهو الآن قيد المراجعة وبانتظار موافقة مالك المنصة أبوحسام.',
    });
  } catch (e: any) {
    res.status(409).json({ error: e.message || 'تعذر تقديم طلب التسجيل' });
  }
});

router.post('/auth/login', (req, res: Response): void => {
  const meta = getClientMeta(req);
  const { username, password } = req.body || {};

  // Check if client tried sending forged identity headers alongside login
  if (req.headers['x-user-id'] || req.headers['x-user-role']) {
    recordSecurityEvent({
      req,
      actorId: String(req.headers['x-user-id'] || 'anonymous'),
      actorName: String(username || 'مجهول'),
      actorRole: String(req.headers['x-user-role'] || 'Guest'),
      action: 'SECURITY_IDENTITY_SPOOF_ATTEMPT',
      category: 'SECURITY',
      severity: 'CRITICAL',
      details: `محاولة تمرير ترويسة هوية مزورة أثناء تسجيل الدخول للمستخدم (${username || '-'})`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة تلاعب بترويسة الدخول',
    });
  }

  if (!username || !password) {
    res.status(400).json({ error: 'يرجى إدخال اسم المستخدم وكلمة المرور' });
    return;
  }

  const cleanUsername = String(username).trim();
  const lockKey = `login:${meta.ipAddress}:${cleanUsername.toLowerCase()}`;
  const ipLockKey = `login-ip:${meta.ipAddress}`;

  const winLock = isLoginWindowLocked(lockKey);
  const ipWinLock = isLoginWindowLocked(ipLockKey);
  if (winLock.locked || ipWinLock.locked) {
    const waitSec = Math.max(winLock.retryAfterSec, ipWinLock.retryAfterSec);
    res.status(429).json({
      error: `تم إيقاف محاولات الدخول مؤقتاً بسبب تكرار كلمات المرور الخاطئة. يرجى المحاولة بعد ${waitSec} ثانية.`,
      code: 'RATE_LIMITED',
      retryAfterSec: waitSec,
    });
    return;
  }

  const unknownIpKey = `unknown:${meta.ipAddress}`;
  const unknownIpLock = isLoginWindowLocked(unknownIpKey);
  if (unknownIpLock.locked) {
    res.status(429).json({
      error: `تم إيقاف محاولات الدخول مؤقتاً من هذا الاتصال. أعد المحاولة بعد ${unknownIpLock.retryAfterSec} ثانية.`,
      code: 'RATE_LIMITED',
      retryAfterSec: unknownIpLock.retryAfterSec,
    });
    return;
  }

  const user = db.findUserByUsername(cleanUsername);
  if (!user) {
    // Check if username belongs to a pending/rejected registration request
    const regReq = db.findRegistrationRequestByUsername(cleanUsername);
    if (regReq) {
      let msg = 'طلب التسجيل قيد المراجعة وبانتظار موافقة مالك المنصة أبوحسام.';
      if (regReq.status === 'NEEDS_EDIT') {
        msg = `طلبك يحتاج إلى استكمال/تعديل البيانات من قِبل الإدارة${regReq.reviewNote ? `: ${regReq.reviewNote}` : '.'}`;
      } else if (regReq.status === 'REJECTED') {
        msg = `تم رفض طلب التسجيل الخاص بهذا الحساب${regReq.reviewNote ? ` (${regReq.reviewNote})` : '.'}`;
      }

      recordSecurityEvent({
        req,
        actorId: regReq.id,
        actorName: regReq.fullName,
        actorRole: regReq.requestedRole,
        action: `LOGIN_BLOCKED_${regReq.status}`,
        category: 'AUTH',
        severity: regReq.status === 'REJECTED' ? 'WARNING' : 'INFO',
        details: `محاولة دخول لحساب حالته (${regReq.status}): @${regReq.username}`,
        result: 'BLOCKED',
        reason: msg,
        notifyOwner: regReq.status === 'REJECTED',
        ownerNotificationTitle: `محاولة دخول لحساب مرفوض: @${regReq.username}`,
      });

      res.status(403).json({ error: msg, accountStatus: regReq.status });
      return;
    }

    const unknownTracker = trackLoginFailureWindow(unknownIpKey, 10 * 60 * 1000, 5, 10 * 60 * 1000);
    recordSecurityEvent({
      req,
      actorId: 'anonymous',
      actorName: cleanUsername,
      actorRole: 'Unknown',
      action: 'LOGIN_UNKNOWN_USER',
      category: unknownTracker.count >= 3 ? 'SECURITY' : 'AUTH',
      severity: unknownTracker.count >= 3 ? 'HIGH' : 'INFO',
      details: `محاولة تسجيل دخول باسم مستخدم غير مسجل (@${cleanUsername}) — المحاولة رقم ${unknownTracker.count}`,
      result: 'BLOCKED',
      reason: 'Username not found',
      notifyOwner: unknownTracker.count >= 3,
      ownerNotificationTitle: 'تنبيه أمني: محاولات دخول متكررة بأسماء مستخدمين غير موجودة',
    });

    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  // Check account lockout timestamp persisted on user
  if (user.lockedUntil && new Date(user.lockedUntil).getTime() > Date.now()) {
    const remainingSec = Math.ceil((new Date(user.lockedUntil).getTime() - Date.now()) / 1000);
    res.status(429).json({
      error: `الحساب مقفل مؤقتاً بسبب محاولات دخول فاشلة متكررة. أعد المحاولة بعد ${remainingSec} ثانية.`,
      code: 'ACCOUNT_TEMP_LOCKED',
      retryAfterSec: remainingSec,
    });
    return;
  }

  // Enforce Account Status BEFORE issuing token
  const accStatus = user.status || 'ACTIVE';
  if (accStatus !== 'ACTIVE') {
    const statusMsg =
      accStatus === 'SUSPENDED'
        ? 'الحساب موقوف مؤقتاً من قِبل مالك المنصة. يرجى مراجعة الإدارة.'
        : accStatus === 'REJECTED'
        ? 'تم رفض طلب تفعيل هذا الحساب.'
        : 'الحساب قيد المراجعة وبانتظار موافقة مالك المنصة.';
    recordSecurityEvent({
      req,
      actor: user,
      action: `LOGIN_BLOCKED_${accStatus}`,
      category: accStatus === 'SUSPENDED' ? 'SECURITY' : 'AUTH',
      severity: accStatus === 'SUSPENDED' ? 'WARNING' : 'INFO',
      details: `محاولة تسجيل دخول مرفوضة لحساب بحالة ${accStatus}: @${user.username}`,
      result: 'BLOCKED',
      reason: statusMsg,
      notifyOwner: accStatus === 'SUSPENDED',
      ownerNotificationTitle: `محاولة دخول لحساب موقوف: @${user.username}`,
    });
    res.status(403).json({ error: statusMsg, accountStatus: accStatus });
    return;
  }

  const valid = bcrypt.compareSync(String(password), user.passwordHash);
  if (!valid) {
    const winFailure = trackLoginFailureWindow(lockKey, 10 * 60 * 1000, 5, 10 * 60 * 1000);
    trackLoginFailureWindow(ipLockKey, 10 * 60 * 1000, 12, 10 * 60 * 1000);
    const dbFail = db.recordUserLoginFailure(user.id, 5, 10 * 60 * 1000);

    // Single failed password is INFO (NOT intrusion). >= 3 attempts triggers HIGH alert & Owner Notification.
    const isBruteForce = winFailure.count >= 3 || dbFail.attempts >= 3;
    const isLocked = winFailure.locked || Boolean(dbFail.lockedUntil);

    recordSecurityEvent({
      req,
      actor: user,
      action: isLocked
        ? 'SECURITY_BRUTE_FORCE_LOCKOUT'
        : isBruteForce
        ? 'SECURITY_REPEATED_FAILED_LOGIN'
        : 'LOGIN_FAILED',
      category: isBruteForce ? 'SECURITY' : 'AUTH',
      severity: isLocked ? 'CRITICAL' : isBruteForce ? 'HIGH' : winFailure.count === 2 ? 'WARNING' : 'INFO',
      details: isBruteForce
        ? `رصد محاولات دخول فاشلة متكررة (${winFailure.count} مرات) للحساب @${user.username}${isLocked ? ' — تم القفل المؤقت' : ''}`
        : `محاولة كلمة مرور خاطئة للحساب @${user.username} (المحاولة ${winFailure.count})`,
      result: 'BLOCKED',
      reason: 'Invalid password',
      notifyOwner: isBruteForce,
      ownerNotificationTitle: isLocked
        ? `تنبيه حرج: قفل مؤقت بسبب محاولة اختراق على @${user.username}`
        : `تنبيه أمني: محاولات كلمة مرور خاطئة متكررة على @${user.username}`,
      ownerNotificationMessage: `تم رصد ${winFailure.count} محاولات دخول فاشلة متتالية للحساب "${user.name}" (@${user.username}) من العنوان ${meta.ipAddress}.`,
    });

    if (isLocked) {
      res.status(429).json({
        error: 'تم تجاوز عدد محاولات الدخول الخاطئة. تم تعليق المحاولات مؤقتاً لحماية الحساب.',
        code: 'ACCOUNT_TEMP_LOCKED',
      });
      return;
    }

    res.status(401).json({ error: 'اسم المستخدم أو كلمة المرور غير صحيحة' });
    return;
  }

  // Successful login
  clearLoginFailureWindow(lockKey);
  clearLoginFailureWindow(unknownIpKey);
  db.recordUserLoginSuccess(user.id);
  const { passwordHash: _, authVersion: _authVersion, ...safeUser } =
    db.findUserByUsername(cleanUsername)! as any;
  const token = signAuthToken(safeUser);

  recordSecurityEvent({
    req,
    actor: safeUser,
    action: 'USER_LOGIN',
    category: 'AUTH',
    severity: 'INFO',
    details: `تسجيل دخول ناجح للمستخدم: ${safeUser.name} (@${safeUser.username} · ${safeUser.role})`,
    result: 'SUCCESS',
  });

  res.json({ success: true, token, user: safeUser });
});

// ==================== ALL ROUTES BELOW REQUIRE AUTHENTICATION ====================
router.use(requireAuth);

router.get('/auth/me', (req: AuthenticatedRequest, res: Response): void => {
  res.json({ user: req.authUser });
});

// Only Platform Owner can fast-switch accounts without re-entering credentials
router.post('/auth/switch-user', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const { userId } = req.body;
  const targetUser = db.findUserById(userId);
  if (!targetUser) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }
  const token = signAuthToken(targetUser);
  recordSecurityEvent({
    req,
    actor: req.authUser!,
    action: 'SWITCH_ACCOUNT',
    category: 'AUTH',
    severity: 'INFO',
    targetUserId: targetUser.id,
    details: `تبديل جلسة مالك المنصة إلى: ${targetUser.name} (${targetUser.role})`,
    result: 'SUCCESS',
  });
  res.json({ success: true, token, user: targetUser });
});

router.post('/auth/reset-password', (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const { userId, newPassword } = req.body;
  if (!userId || !newPassword || String(newPassword).length < 8) {
    res.status(400).json({ error: 'كلمة المرور يجب ألا تقل عن 8 أحرف' });
    return;
  }

  const target = db.findUserById(userId);
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }

  const isSelf = actor.id === userId;
  const isPrivileged = isPlatformOwner(actor) || (actor.role === 'SchoolAdmin' && !isPlatformOwner(target));
  if (!isSelf && !isPrivileged) {
    recordSecurityEvent({
      req,
      actor,
      action: 'SECURITY_PASSWORD_RESET_BLOCKED',
      category: 'SECURITY',
      severity: 'HIGH',
      targetUserId: target.id,
      details: `محاولة غير مصرح بها لتغيير كلمة مرور الحساب @${target.username} من قِبل @${actor.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'محاولة غير مصرح بها لتغيير كلمة مرور حساب',
    });
    res.status(403).json({ error: 'غير مصرح لك بتغيير كلمة مرور هذا الحساب' });
    return;
  }

  db.updateUserPassword(userId, String(newPassword));
  recordSecurityEvent({
    req,
    actor,
    action: 'PASSWORD_RESET',
    category: 'ADMIN',
    severity: 'INFO',
    targetUserId: target.id,
    details: `تم تحديث كلمة المرور للحساب: @${target.username}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `تحديث كلمة مرور بواسطة ${actor.name}`,
  });
  res.json({ success: true, message: 'تم تغيير كلمة المرور بنجاح' });
});

// ==================== NOTIFICATIONS (ROLE-SCOPED & ISOLATED) ====================

router.get('/notifications', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const list = db.getNotificationsForUser(user);
  const unreadCount = list.filter((n) => !n.readBy.includes(user.id)).length;
  res.json({ notifications: list, unreadCount });
});

router.post('/notifications/:id/read', (req: AuthenticatedRequest, res: Response): void => {
  const ok = db.markNotificationRead(req.params.id, req.authUser!);
  if (!ok) {
    res.status(404).json({ error: 'الإشعار غير موجود أو غير مصرح بالوصول إليه' });
    return;
  }
  res.json({ success: true });
});

router.post('/notifications/read-all', (req: AuthenticatedRequest, res: Response): void => {
  const count = db.markAllNotificationsRead(req.authUser!);
  res.json({ success: true, updatedCount: count });
});

// ==================== SCHOOL IDENTITY & SUBJECTS ====================

router.put('/school/identity', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  if (
    actor.role === 'SchoolAdmin' &&
    actor.delegatedPermissions &&
    actor.delegatedPermissions.canManageIdentity === false
  ) {
    res.status(403).json({ error: 'صلاحية تعديل الهوية الرسمية غير مفعلة لهذا الحساب الإداري' });
    return;
  }

  const updated = db.updateSchoolSettings(req.body);
  recordSecurityEvent({
    req,
    actor,
    action: 'UPDATE_SCHOOL_IDENTITY',
    category: 'ADMIN',
    severity: 'INFO',
    details: `تحديث الهوية الرسمية وإعدادات الترويسة للمدرسة بواسطة ${actor.name}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `تحديث الهوية الرسمية بواسطة ${actor.name}`,
  });
  res.json({ success: true, settings: updated });
});

router.get('/subjects', (req: AuthenticatedRequest, res: Response): void => {
  const onlyActive = req.query.active === 'true';
  res.json(db.getSubjects(onlyActive));
});

router.post('/subjects', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  if (
    actor.role === 'SchoolAdmin' &&
    actor.delegatedPermissions &&
    actor.delegatedPermissions.canManageSubjects === false
  ) {
    res.status(403).json({ error: 'صلاحية إدارة المواد غير مفعلة لهذا الحساب الإداري' });
    return;
  }

  const { code, nameAr, nameEn, defaultDirection, isActive, description } = req.body;
  if (!nameAr || !nameEn) {
    res.status(400).json({ error: 'يرجى إدخال اسم المادة بالعربية والإنجليزية' });
    return;
  }
  const created = db.addSubject({
    code: (code || nameEn.slice(0, 3)).toUpperCase(),
    nameAr,
    nameEn,
    defaultDirection: defaultDirection === 'ltr' ? 'ltr' : 'rtl',
    isActive: isActive !== false,
    description: description || '',
  });
  recordSecurityEvent({
    req,
    actor,
    action: 'ADD_SUBJECT',
    category: 'ADMIN',
    severity: 'INFO',
    subjectId: created.id,
    details: `إضافة مادة دراسية: ${created.nameAr}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `إضافة مادة جديدة بواسطة ${actor.name}: ${created.nameAr}`,
  });
  res.json({ success: true, subject: created });
});

router.put('/subjects/:id', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const updated = db.updateSubject(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'المادة الدراسية غير موجودة' });
    return;
  }
  recordSecurityEvent({
    req,
    actor,
    action: 'UPDATE_SUBJECT',
    category: 'ADMIN',
    severity: 'INFO',
    subjectId: updated.id,
    details: `تحديث المادة: ${updated.nameAr}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `تحديث مادة (${updated.nameAr}) بواسطة ${actor.name}`,
  });
  res.json({ success: true, subject: updated });
});

router.delete('/subjects/:id', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  // Protect the 6 core official subjects from accidental deletion
  const coreIds = ['subj-quran', 'subj-isl', 'subj-ar', 'subj-sci', 'subj-soc', 'subj-en'];
  if (coreIds.includes(req.params.id)) {
    res.status(400).json({ error: 'لا يمكن حذف المواد الأساسية الستة المعتمدة؛ يمكنك تعطيلها مؤقتاً فقط.' });
    return;
  }
  const ok = db.deleteSubject(req.params.id);
  if (!ok) {
    res.status(404).json({ error: 'المادة غير موجودة' });
    return;
  }
  recordSecurityEvent({
    req,
    actor,
    action: 'DELETE_SUBJECT',
    category: 'ADMIN',
    severity: 'WARNING',
    subjectId: req.params.id,
    details: `حذف المادة: ${req.params.id}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `حذف مادة إضافية بواسطة ${actor.name}`,
  });
  res.json({ success: true });
});

// ==================== DASHBOARD STATS (WORKSPACE SCOPED) ====================

router.get('/system/stats', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const exams = db.getExams(user.id);
  const archive = db.getArchive(user.id);
  const questions = db.getQuestions({ ownerUserId: user.id });
  const curricula = db.getCurricula();
  const subjects = db.getSubjects(true);
  const hasAI = userHasAIAccess(user);

  const allGrades = [
    'Grade 1',
    'Grade 2',
    'Grade 3',
    'Grade 4',
    'Grade 5',
    'Grade 6',
    'Grade 7',
    'Grade 8',
    'Grade 9',
  ];
  const gradeStats = Object.fromEntries(
    allGrades.map((g) => [
      g,
      {
        examsCount: exams.filter((e) => e.grade === g).length,
        questionsCount: questions.filter((q) => q.grade === g).length,
        unitsCount: curricula.filter((c) => c.grade === g).length,
      },
    ])
  );

  const payload: any = {
    totalExams: exams.length,
    savedExams: exams.filter((e) => e.status === 'Approved').length,
    draftExams: exams.filter((e) => e.status === 'Draft' || e.status === 'Validated').length,
    archivedExams: archive.length,
    totalQuestions: questions.length,
    activeSubjectsCount: subjects.length,
    gradeStats,
    recentExams: exams.slice(0, 5),
    hasAIAccess: hasAI,
  };

  if (hasAI) {
    const aiSettings = db.getAISettings();
    const aiLogs = db.getAILogs();
    payload.aiRequestsCount = aiSettings.totalRequests;
    payload.aiStatus = aiSettings.activeStatus;
    payload.aiModel = aiSettings.primaryModel;
    payload.isApiKeyConfigured = aiSettings.apiKeyConfigured;
    payload.recentAIOperations = aiLogs.slice(0, 5);
  }

  res.json(payload);
});

// ==================== CURRICULA ====================

router.get('/curricula', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const grade = req.query.grade as string | undefined;
  const subjectId = req.query.subjectId as string | undefined;
  if ((grade || subjectId) && !canAccessAcademicScope(user, grade, subjectId)) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  res.json(db.getCurricula(grade, subjectId).filter((unit) =>
    canAccessAcademicScope(user, unit.grade, (unit as any).subjectId)
  ));
});

router.post('/curricula/unit', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const unit = req.body;
  if (!unit.title || !unit.grade) {
    res.status(400).json({ error: 'البيانات غير مكتملة' });
    return;
  }
  const created = db.addUnit({
    ...unit,
    id: `unit-${Date.now()}`,
    lessons: unit.lessons || [],
  });
  recordSecurityEvent({
    req,
    actor: req.authUser!,
    action: 'ADD_CURRICULUM_UNIT',
    category: 'ADMIN',
    severity: 'INFO',
    details: `إضافة وحدة: ${created.title}`,
  });
  res.json({ success: true, unit: created });
});

router.put('/curricula/unit/:id', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const updated = db.updateUnit(req.params.id, req.body);
  if (!updated) {
    res.status(404).json({ error: 'الوحدة غير موجودة' });
    return;
  }
  res.json({ success: true, unit: updated });
});

router.delete('/curricula/unit/:id', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const ok = db.deleteUnit(req.params.id);
  res.json({ success: ok });
});

router.post('/curricula/reset', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  db.resetToDefaults();
  recordSecurityEvent({
    req,
    actor: req.authUser!,
    action: 'RESET_DEFAULTS',
    category: 'ADMIN',
    severity: 'WARNING',
    details: 'إعادة ضبط المناهج والأسئلة إلى المعايير اليمنية الأصلية',
  });
  res.json({ success: true, message: 'تمت إعادة ضبط المنهج بنجاح' });
});

// ==================== QUESTION BANK (PRIVATE TEACHER WORKSPACES) ====================

router.get('/questions', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const { grade, subjectId, unitId, type, difficulty, search, sourceCode, educationalLevel, grammarCategory } =
    req.query as Record<string, string>;
  const list = db.getQuestions({
    ownerUserId: user.id,
    grade,
    subjectId,
    unitId,
    type,
    difficulty,
    search,
    sourceCode: sourceCode as any,
    educationalLevel: educationalLevel as any,
    grammarCategory,
  }).filter((question) =>
    canAccessAcademicScope(user, question.grade, question.subjectId || 'subj-en')
  );
  res.json(list);
});

router.post('/questions', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const q = req.body;
  if (!q.questionText || !q.modelAnswer || !q.grade) {
    res.status(400).json({ error: 'يرجى تقديم نص السؤال والصف والإجابة النموذجية' });
    return;
  }
  if (!canAccessAcademicScope(user, q.grade, q.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  const isQuranQuestion =
    q.subjectId === 'subj-quran' ||
    String(q.type || '').startsWith('Quran');

  const created = db.addQuestion({
    ...q,
    ownerId: user.id,
    subjectId: q.subjectId || 'subj-en',
    preserveDiacritics: isQuranQuestion ? true : q.preserveDiacritics,
    source: userHasAIAccess(user) ? q.source || 'Question Bank' : 'Teacher Manual',
    sourceCode: userHasAIAccess(user)
      ? q.sourceCode || 'CURRICULUM'
      : q.sourceCode === 'IMAGE_SOURCE'
      ? 'TEACHER_MANUAL'
      : q.sourceCode || 'TEACHER_MANUAL',
    educationalLevel: q.educationalLevel || 'BASIC',
    sharedWith: [],
  });
  recordSecurityEvent({
    req,
    actor: user,
    action: 'ADD_QUESTION',
    category: 'QUESTION',
    severity: 'INFO',
    subjectId: created.subjectId,
    details: `إضافة سؤال جديد في ${q.grade} للمادة ${created.subjectId}`,
  });
  res.json({ success: true, question: created });
});

router.put('/questions/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const existing = db.getQuestionById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'السؤال غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(user, existing.grade, existing.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if (!canAccessOwnedRecord(user, existing, 'edit')) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_QUESTION_EDIT',
      category: 'SECURITY',
      severity: 'HIGH',
      subjectId: existing.subjectId,
      details: `محاولة تعديل سؤال خاص يخص معلماً آخر (${req.params.id}) من الحساب @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة تعديل سؤال خاص بمعلم آخر',
    });
    res.status(403).json({ error: 'غير مصرح لك بتعديل هذا السؤال الخاص' });
    return;
  }
  const {
    ownerId: _ignoredOwner,
    createdBy: _ignoredCreator,
    sharedWith: _ignoredShares,
    id: _ignoredId,
    createdAt: _ignoredCreatedAt,
    ...safePatch
  } = req.body || {};
  if (!canAccessAcademicScope(
    user,
    safePatch.grade || existing.grade,
    safePatch.subjectId || existing.subjectId || 'subj-en'
  )) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  const updated = db.updateQuestion(req.params.id, safePatch);
  res.json({ success: true, question: updated });
});

router.delete('/questions/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const existing = db.getQuestionById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'السؤال غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(user, existing.grade, existing.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if ((existing.ownerId || 'usr-admin') !== user.id) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_QUESTION_DELETE',
      category: 'SECURITY',
      severity: 'HIGH',
      subjectId: existing.subjectId,
      details: `محاولة حذف سؤال خاص يخص معلماً آخر (${req.params.id}) من الحساب @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة حذف سؤال خاص بمعلم آخر',
    });
    res.status(403).json({ error: 'غير مصرح لك بحذف سؤال يخص معلماً آخر' });
    return;
  }
  const ok = db.deleteQuestion(req.params.id);
  recordSecurityEvent({
    req,
    actor: user,
    action: 'DELETE_QUESTION',
    category: 'QUESTION',
    severity: 'INFO',
    subjectId: existing.subjectId,
    details: `حذف السؤال ${req.params.id}`,
  });
  res.json({ success: ok });
});

// AI Single Question Generation — Strictly Owner Only (Never alters Quranic text)
router.post('/questions/generate', requireAIAccess, requireAIRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { grade, unitTitle, type, difficulty, marks, lessonFocus, sourceCode, educationalLevel, grammarCategory, subjectId } =
    req.body;

  if (subjectId === 'subj-quran' || String(type || '').startsWith('Quran')) {
    res.status(400).json({
      error: 'ممنوع توليد أو إعادة صياغة الآيات القرآنية تلقائياً بالذكاء الاصطناعي. يرجى إدخال الآيات يدوياً بالرسم والتشكيل الصحيح في استوديو الاختبارات.',
    });
    return;
  }

  try {
    const result = await geminiService.generateSingleQuestion({
      grade: grade || 'Grade 9',
      unitTitle: unitTitle || 'Unit 1: General',
      type: type || 'Multiple Choice',
      difficulty: difficulty || 'Medium',
      marks: Number(marks) || 2,
      lessonFocus,
      sourceCode,
      educationalLevel,
      grammarCategory,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل توليد السؤال بالذكاء الاصطناعي' });
  }
});

// ==================== EXAMS (PRIVATE TEACHER WORKSPACES & OPT-IN SHARING) ====================

router.get('/exams', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  res.json(db.getExams(user.id).filter((exam) =>
    canAccessAcademicScope(user, exam.grade, exam.subjectId || 'subj-en')
  ));
});

router.get('/exams/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(user, exam.grade, exam.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if (!canAccessOwnedRecord(user, exam, 'view')) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_EXAM_VIEW',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: exam.id,
      subjectId: exam.subjectId,
      details: `محاولة وصول غير مصرح بها لاختبار خاص (${exam.code} / ${exam.id}) من الحساب @${user.username}`,
      result: 'BLOCKED',
      reason: 'Cross-teacher workspace isolation violation',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة اطلاع غير مصرح بها على اختبار معلم آخر',
      ownerNotificationMessage: `حاول المستخدم "${user.name}" (@${user.username}) فتح الاختبار الخاص (${exam.code}) بدون إذن مشاركة وتم منعه.`,
    });
    res.status(403).json({ error: 'غير مصرح لك بالاطلاع على اختبار يخص معلماً آخر' });
    return;
  }
  res.json(exam);
});

router.post('/exams', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const exam = req.body;
  if (!hasValidExamImagePayload(exam)) {
    res.status(400).json({ error: 'إحدى صور الاختبار غير صالحة أو تجاوزت الصور الحجم الإجمالي المسموح به (8.5 ميجابايت).' });
    return;
  }
  if (!exam.title || !exam.grade || !exam.sections) {
    res.status(400).json({ error: 'بيانات الاختبار غير مكتملة' });
    return;
  }
  const existingForScope = exam.id ? db.getExamById(exam.id) : undefined;
  if (!canAccessAcademicScope(
    user,
    exam.grade || existingForScope?.grade,
    exam.subjectId || existingForScope?.subjectId || 'subj-en'
  )) {
    res.status(403).json({ error: 'لا تملك صلاحية إنشاء أو تعديل اختبار لهذا الصف أو المادة' });
    return;
  }

  if (exam.id) {
    const existing = db.getExamById(exam.id);
    if (existing && !canAccessOwnedRecord(user, existing, 'edit')) {
      recordSecurityEvent({
        req,
        actor: user,
        action: 'SECURITY_UNAUTHORIZED_EXAM_EDIT',
        category: 'SECURITY',
        severity: 'HIGH',
        examId: existing.id,
        subjectId: existing.subjectId,
        details: `محاولة تعديل اختبار خاص (${existing.code}) من الحساب @${user.username}`,
        result: 'BLOCKED',
        notifyOwner: true,
        ownerNotificationTitle: 'تنبيه أمني: محاولة تعديل اختبار يخص معلماً آخر',
      });
      res.status(403).json({ error: 'غير مصرح لك بتعديل اختبار يخص معلماً آخر' });
      return;
    }
    if (existing) {
      const saved = db.saveExam({
        ...existing,
        ...exam,
        ownerId: existing.ownerId || existing.createdBy,
        createdBy: existing.createdBy,
        createdByName: existing.createdByName,
      });
      recordSecurityEvent({
        req,
        actor: user,
        action: 'SAVE_EXAM',
        category: 'EXAM',
        severity: 'INFO',
        examId: saved.id,
        subjectId: saved.subjectId,
        details: `تحديث اختبار: ${saved.titleAr || saved.title} (${saved.code})`,
      });
      res.json({ success: true, exam: saved });
      return;
    }
  }

  const newExamId = exam.id || `exam-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`;
  const saved = db.saveExam({
    ...exam,
    id: newExamId,
    ownerId: user.id,
    createdBy: user.id,
    createdByName: user.name,
    sharingEnabled: false,
    sharedWith: [],
    createdAt: exam.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  recordSecurityEvent({
    req,
    actor: user,
    action: 'CREATE_EXAM',
    category: 'EXAM',
    severity: 'INFO',
    examId: saved.id,
    subjectId: saved.subjectId,
    details: `إنشاء اختبار جديد: ${saved.titleAr || saved.title} (${saved.code})`,
  });
  res.json({ success: true, exam: saved });
});

router.put('/exams/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const existing = db.getExamById(req.params.id);
  if (!hasValidExamImagePayload(req.body)) {
    res.status(400).json({ error: 'إحدى صور الاختبار غير صالحة أو تجاوزت الصور الحجم الإجمالي المسموح به (8.5 ميجابايت).' });
    return;
  }
  if (!existing) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(
    user,
    req.body?.grade || existing.grade,
    req.body?.subjectId || existing.subjectId || 'subj-en'
  )) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if (!canAccessOwnedRecord(user, existing, 'edit')) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_EXAM_EDIT',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: existing.id,
      subjectId: existing.subjectId,
      details: `محاولة تعديل اختبار خاص (${existing.code}) عبر PUT من الحساب @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة تعديل اختبار خاص بمعلم آخر',
    });
    res.status(403).json({ error: 'غير مصرح لك بتعديل هذا الاختبار الخاص' });
    return;
  }
  const { ownerId: _o, createdBy: _c, id: _i, sharedWith: _s, ...safeBody } = req.body;
  const updated = db.saveExam({
    ...existing,
    ...safeBody,
    id: req.params.id,
    ownerId: existing.ownerId || existing.createdBy,
  });
  recordSecurityEvent({
    req,
    actor: user,
    action: 'SAVE_EXAM',
    category: 'EXAM',
    severity: 'INFO',
    examId: updated.id,
    subjectId: updated.subjectId,
    details: `تعديل اختبار: ${updated.titleAr || updated.title}`,
  });
  res.json({ success: true, exam: updated });
});

router.delete('/exams/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const existing = db.getExamById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if ((existing.ownerId || existing.createdBy) !== user.id) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_EXAM_DELETE',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: existing.id,
      subjectId: existing.subjectId,
      details: `محاولة حذف/أرشفة اختبار خاص (${existing.code}) من غير المالك @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة حذف اختبار معلم آخر',
    });
    res.status(403).json({ error: 'فقط مالك الاختبار يمكنه أرشفته أو حذفه' });
    return;
  }
  if (!canAccessAcademicScope(user, existing.grade, existing.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  const ok = db.deleteExam(req.params.id);
  if (ok) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'ARCHIVE_EXAM',
      category: 'EXAM',
      severity: 'INFO',
      examId: existing.id,
      subjectId: existing.subjectId,
      details: `أرشفة الاختبار: ${existing.titleAr || existing.title} (${existing.code})`,
    });
  }
  res.json({ success: ok });
});

router.post('/exams/:id/clone', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const original = db.getExamById(req.params.id);
  if (!original) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(user, original.grade, original.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if (!canAccessOwnedRecord(user, original, 'view')) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_EXAM_CLONE',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: original.id,
      details: `محاولة استنساخ اختبار خاص (${original.code}) من الحساب @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة استنساخ اختبار بدون صلاحية',
    });
    res.status(403).json({ error: 'غير مصرح لك بنسخ هذا الاختبار الخاص' });
    return;
  }
  const clone = {
    ...JSON.parse(JSON.stringify(original)),
    id: `exam-${Date.now()}`,
    code: `${original.code}-COPY`,
    title: `${original.title} (نسخة جديدة)`,
    titleAr: `${original.titleAr || original.title} (نسخة جديدة)`,
    status: 'Draft',
    ownerId: user.id,
    createdBy: user.id,
    createdByName: user.name,
    sharingEnabled: false,
    sharedWith: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  db.saveExam(clone);
  recordSecurityEvent({
    req,
    actor: user,
    action: 'CLONE_EXAM',
    category: 'EXAM',
    severity: 'INFO',
    examId: clone.id,
    subjectId: clone.subjectId,
    details: `استنساخ الاختبار ${original.code} إلى ${clone.code}`,
  });
  res.json({ success: true, exam: clone });
});

router.post('/exams/:id/approve', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(user, exam.grade, exam.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if (!canAccessOwnedRecord(user, exam, 'edit')) {
    res.status(403).json({ error: 'غير مصرح لك باعتماد هذا الاختبار' });
    return;
  }
  exam.status = 'Approved';
  db.saveExam(exam);
  recordSecurityEvent({
    req,
    actor: user,
    action: 'APPROVE_EXAM',
    category: 'EXAM',
    severity: 'INFO',
    examId: exam.id,
    subjectId: exam.subjectId,
    details: `اعتماد الاختبار: ${exam.titleAr || exam.title} (${exam.code})`,
  });
  res.json({ success: true, exam });
});

router.post('/exams/:id/export-log', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (
    !canAccessAcademicScope(user, exam.grade, exam.subjectId || 'subj-en') ||
    !canAccessOwnedRecord(user, exam, 'view')
  ) {
    res.status(403).json({ error: 'غير مصرح لك بتصدير هذا الاختبار' });
    return;
  }
  const mode = req.body?.mode === 'TeacherAnswerKey' ? 'TeacherAnswerKey' : 'StudentPaper';
  recordSecurityEvent({
    req,
    actor: user,
    action: 'EXPORT_EXAM_PDF',
    category: 'EXAM',
    severity: 'INFO',
    examId: exam.id,
    subjectId: exam.subjectId,
    details: `تصدير/طباعة ${mode === 'TeacherAnswerKey' ? 'نموذج إجابة المعلم' : 'ورقة الطالب'} للاختبار: ${exam.titleAr || exam.title} (${exam.code})`,
  });
  res.json({ success: true });
});

router.post('/exams/:id/export-pdf', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.authUser!;
  const isPracticeSandbox = req.params.id === `practice-sandbox-${user.id}`;
  const exam = isPracticeSandbox
    ? {
        id: req.params.id,
        code: 'PRACTICE-SAMPLE',
        subjectId: 'subj-sci',
        title: 'Practice Sample Exam',
        titleAr: 'اختبار تجريبي نموذجي للتدريب',
        ownerId: user.id,
      }
    : db.getExamById(req.params.id);

  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (
    !isPracticeSandbox &&
    (!canAccessAcademicScope(user, (exam as any).grade, exam.subjectId || 'subj-en') ||
      !canAccessOwnedRecord(user, exam as any, 'view'))
  ) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_PDF_EXPORT',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: exam.id,
      subjectId: exam.subjectId,
      details: `محاولة تصدير PDF غير مصرح بها لاختبار يخص معلماً آخر (${exam.code})`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة تصدير PDF غير مصرح بها',
    });
    res.status(403).json({ error: 'غير مصرح لك بتصدير هذا الاختبار' });
    return;
  }

  const { htmlDocument, mode, orientation, filename } = req.body || {};
  if (!htmlDocument || typeof htmlDocument !== 'string' || htmlDocument.length < 40) {
    res.status(400).json({ error: 'محتوى معاينة PDF غير صالح' });
    return;
  }

  if (!findChromiumExecutable()) {
    res.status(501).json({
      error: 'محرك PDF الخادمي غير متوفر حالياً',
      fallbackClientPrint: true,
    });
    return;
  }

  const safeMode: 'StudentPaper' | 'TeacherAnswerKey' =
    mode === 'TeacherAnswerKey' ? 'TeacherAnswerKey' : 'StudentPaper';
  const safeOrientation: 'portrait' | 'landscape' = orientation === 'landscape' ? 'landscape' : 'portrait';
  const safeFilename = String(filename || `${exam.code || 'exam'}-${safeMode}.pdf`)
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 80);

  try {
    const pdfBuffer = await exportExamHtmlToPdf({
      htmlDocument,
      mode: safeMode,
      orientation: safeOrientation,
      title: exam.titleAr || exam.title,
      serverPort: Number(process.env.PORT) || 3000,
    });

    recordSecurityEvent({
      req,
      actor: user,
      action: 'EXPORT_EXAM_PDF',
      category: 'EXAM',
      severity: 'INFO',
      examId: exam.id,
      subjectId: exam.subjectId,
      details: `تصدير ملف PDF حقيقي (${safeMode === 'TeacherAnswerKey' ? 'نموذج إجابة المعلم' : 'ورقة الطالب'}) للاختبار: ${exam.titleAr || exam.title} (${exam.code})`,
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(pdfBuffer);
  } catch (err: any) {
    if (err?.message === 'CHROMIUM_UNAVAILABLE') {
      res.status(501).json({ error: 'محرك PDF الخادمي غير متوفر', fallbackClientPrint: true });
      return;
    }
    console.error('PDF export error:', err);
    res.status(500).json({
      error: 'تعذر إنشاء ملف PDF الخادمي. يمكنك استخدام طباعة المتصفح كبديل.',
      fallbackClientPrint: true,
    });
  }
});

// ==================== PRIVATE LAYOUT TEMPLATES (STRICT OWNER ISOLATION) ====================

router.get('/layout-templates', (req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getLayoutTemplatesForOwner(req.authUser!.id));
});

router.post('/layout-templates', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const { id, name, nameAr, description, layoutConfig } = req.body || {};
  if ((!name && !nameAr) || !layoutConfig || typeof layoutConfig !== 'object') {
    res.status(400).json({ error: 'يرجى تحديد اسم القالب وإعدادات التخطيط' });
    return;
  }

  if (id) {
    const existing = db.getLayoutTemplateById(String(id));
    if (existing && existing.ownerId !== user.id) {
      recordSecurityEvent({
        req,
        actor: user,
        action: 'SECURITY_UNAUTHORIZED_TEMPLATE_EDIT',
        category: 'SECURITY',
        severity: 'HIGH',
        details: `محاولة تعديل قالب تنسيق خاص بمعلم آخر (${id}) من الحساب @${user.username}`,
        result: 'BLOCKED',
        notifyOwner: true,
        ownerNotificationTitle: 'تنبيه أمني: محاولة الوصول لقالب تنسيق معلم آخر',
      });
      res.status(403).json({ error: 'غير مصرح لك بتعديل قالب تنسيق يخص معلماً آخر' });
      return;
    }
  }

  const saved = db.saveLayoutTemplate({
    id: id ? String(id) : `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ownerId: user.id,
    ownerName: user.name,
    name: String(name || nameAr).trim(),
    nameAr: String(nameAr || name).trim(),
    description: description ? String(description).trim() : undefined,
    isBuiltIn: false,
    layoutConfig: {
      ...layoutConfig,
      fontSizePt: Math.max(9.5, Number(layoutConfig.fontSizePt) || 11),
    },
    createdAt: new Date().toISOString(),
  });

  recordSecurityEvent({
    req,
    actor: user,
    action: 'SAVE_LAYOUT_TEMPLATE',
    category: 'EXAM',
    severity: 'INFO',
    details: `حفظ قالب تنسيق خاص: ${saved.nameAr || saved.name}`,
  });

  res.status(201).json({ success: true, template: saved });
});

router.delete('/layout-templates/:id', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  const outcome = db.deleteLayoutTemplate(req.params.id, user.id);
  if (outcome.forbidden) {
    recordSecurityEvent({
      req,
      actor: user,
      action: 'SECURITY_UNAUTHORIZED_TEMPLATE_DELETE',
      category: 'SECURITY',
      severity: 'HIGH',
      details: `محاولة حذف قالب تنسيق خاص بمعلم آخر (${req.params.id}) من الحساب @${user.username}`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة حذف قالب تنسيق معلم آخر',
    });
    res.status(403).json({ error: 'غير مصرح لك بحذف قالب يخص معلماً آخر' });
    return;
  }
  if (!outcome.deleted) {
    res.status(404).json({ error: 'القالب غير موجود' });
    return;
  }
  recordSecurityEvent({
    req,
    actor: user,
    action: 'DELETE_LAYOUT_TEMPLATE',
    category: 'EXAM',
    severity: 'INFO',
    details: `حذف قالب تنسيق خاص: ${req.params.id}`,
  });
  res.json({ success: true });
});

// Optional Exam Sharing (Disabled by Default, Owner Only, Revocable)
router.post('/exams/:id/share', (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(actor, exam.grade, exam.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى هذا الصف أو المادة الدراسية' });
    return;
  }
  if ((exam.ownerId || exam.createdBy) !== actor.id) {
    res.status(403).json({ error: 'فقط مالك الاختبار يمكنه إدارة المشاركة' });
    return;
  }
  const { targetUserId, permission } = req.body;
  const targetUser = db.findUserById(targetUserId);
  if (!targetUser || targetUser.id === actor.id) {
    res.status(400).json({ error: 'يرجى اختيار معلم آخر صحيح للمشاركة' });
    return;
  }
  const perm: 'view' | 'edit' = permission === 'edit' ? 'edit' : 'view';
  const currentShares = Array.isArray(exam.sharedWith) ? [...exam.sharedWith] : [];
  const existingIdx = currentShares.findIndex((s) => s.userId === targetUser.id);
  const entry = {
    userId: targetUser.id,
    userName: targetUser.name,
    permission: perm,
    grantedBy: actor.id,
    grantedAt: new Date().toISOString(),
  };
  if (existingIdx >= 0) {
    currentShares[existingIdx] = entry;
  } else {
    currentShares.push(entry);
  }
  exam.sharedWith = currentShares;
  exam.sharingEnabled = true;
  db.saveExam(exam);

  recordSecurityEvent({
    req,
    actor,
    action: 'SHARE_EXAM',
    category: 'EXAM',
    severity: 'INFO',
    examId: exam.id,
    subjectId: exam.subjectId,
    targetUserId: targetUser.id,
    details: `مشاركة الاختبار ${exam.code} مع ${targetUser.username} (${perm})`,
    notifyUser: {
      userId: targetUser.id,
      category: 'EXAM',
      title: `تمت مشاركة اختبار معك: ${exam.titleAr || exam.title}`,
      message: `منحك ${actor.name} صلاحية (${perm === 'edit' ? 'عرض وتعديل' : 'عرض فقط'}) للاختبار ${exam.code}.`,
    },
  });
  res.json({ success: true, exam });
});

router.delete('/exams/:id/share/:targetUserId', (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار غير موجود' });
    return;
  }
  if ((exam.ownerId || exam.createdBy) !== actor.id) {
    res.status(403).json({ error: 'فقط مالك الاختبار يمكنه إلغاء المشاركة' });
    return;
  }
  exam.sharedWith = (exam.sharedWith || []).filter((s) => s.userId !== req.params.targetUserId);
  exam.sharingEnabled = exam.sharedWith.length > 0;
  db.saveExam(exam);
  recordSecurityEvent({
    req,
    actor,
    action: 'REVOKE_EXAM_SHARE',
    category: 'EXAM',
    severity: 'INFO',
    examId: exam.id,
    targetUserId: req.params.targetUserId,
    details: `إلغاء مشاركة الاختبار ${exam.code} عن ${req.params.targetUserId}`,
    notifyUser: {
      userId: req.params.targetUserId,
      category: 'EXAM',
      title: `تم إلغاء مشاركة اختبار: ${exam.code}`,
      message: `قام ${actor.name} بإلغاء صلاحية مشاركة الاختبار ${exam.code}.`,
    },
  });
  res.json({ success: true, exam });
});

// Full AI Exam Generation — Strictly Owner Only
router.post('/exams/generate-ai', requireAIAccess, requireAIRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const user = req.authUser!;
  const requestData: ExamGenerationRequest = req.body;

  if (!requestData.grade || !requestData.selectedUnits || requestData.selectedUnits.length === 0) {
    res.status(400).json({ error: 'يرجى تحديد الصف الدراسي والوحدات المطلوبة للاختبار' });
    return;
  }

  try {
    const result = await geminiService.generateFullExam(requestData, user.name);
    result.exam.ownerId = user.id;
    result.exam.createdBy = user.id;
    result.exam.subjectId = 'subj-en';
    recordSecurityEvent({
      req,
      actor: user,
      action: 'AI_GENERATE_EXAM',
      category: 'AI',
      severity: 'INFO',
      examId: result.exam.id,
      subjectId: 'subj-en',
      details: `توليد اختبار ذكي via ${result.modelUsed}: ${result.exam.code}`,
    });
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'حدث خطأ أثناء إعداد الاختبار بالذكاء الاصطناعي' });
  }
});

// Local deterministic structural check (non-AI)
router.post('/exams/validate', (req: AuthenticatedRequest, res: Response): void => {
  const { sections, totalMarks, grade } = req.body;
  const report = geminiService.runQualityAudit(sections || [], Number(totalMarks) || 20, grade || 'Grade 9');
  res.json(report);
});

// ==================== AI VISION & IMAGE ANALYZER (OWNER ONLY) ====================

router.post('/vision/analyze', requireAIAccess, requireAIRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { images, gradeHint, unitHint } = req.body;
  if (!Array.isArray(images) || images.length === 0) {
    res.status(400).json({ error: 'يرجى تقديم صورة واحدة على الأقل للتحليل' });
    return;
  }
  if (images.length > 8) {
    res.status(413).json({ error: 'الحد الأقصى المسموح به هو 8 صور في الطلب الواحد' });
    return;
  }
  let totalImagePayload = 0;
  const validImages = images.every((image: any) => {
    if (!image || typeof image.dataUrl !== 'string') return false;
    totalImagePayload += image.dataUrl.length;
    return (
      /^data:image\/(?:png|jpeg|webp);base64,/i.test(image.dataUrl) &&
      image.dataUrl.length <= 5_500_000
    );
  });
  if (!validImages || totalImagePayload > 9_500_000) {
    res.status(400).json({ error: 'بيانات الصور غير صالحة أو يتجاوز حجمها الحد المسموح به' });
    return;
  }
  try {
    const result = await geminiService.analyzeImagesWithVision(images, gradeHint, unitHint);
    res.json({ success: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'حدث خطأ أثناء تحليل الصور بالرؤية الحاسوبية' });
  }
});

router.post(
  '/vision/generate-questions',
  requireAIAccess,
  requireAIRateLimit,
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const user = req.authUser!;
    const { analysis, grade, contentScope, educationalLevel, selectedQuestionTypes, count, teacherNotes, saveToBank } =
      req.body;
    if (!analysis) {
      res.status(400).json({ error: 'بيانات التحليل مطلوبة لتوليد الأسئلة' });
      return;
    }
    try {
      const result = await geminiService.generateQuestionsFromImageAnalysis({
        analysis,
        grade: grade || 'Grade 9',
        contentScope: contentScope || 'IMAGES_ONLY',
        educationalLevel: educationalLevel || 'BASIC',
        selectedQuestionTypes: selectedQuestionTypes || ['Multiple Choice', 'Fill in the Blanks', 'True or False'],
        count: Number(count) || 4,
        teacherNotes,
      });

      if (saveToBank && result.questions.length > 0) {
        for (const q of result.questions) {
          db.addQuestion({ ...q, ownerId: user.id, subjectId: 'subj-en' });
        }
      }

      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'فشل توليد الأسئلة من الصور' });
    }
  }
);

router.post('/vision/validate-fidelity', requireAIAccess, requireAIRateLimit, (req: AuthenticatedRequest, res: Response): void => {
  const { question, analysis, contentScope } = req.body;
  if (!question || !analysis) {
    res.status(400).json({ error: 'السؤال وبيانات التحليل مطلوبة لإجراء التحقق من مطابقة المصدر' });
    return;
  }
  try {
    const validation = geminiService.validateQuestionSourceFidelity(question, analysis, contentScope);
    res.json({ success: true, ...validation });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'فشل التحقق من مطابقة المصدر' });
  }
});

// ==================== ANALYZED DOCUMENTS LIBRARY (AI OWNER ONLY) ====================

router.get('/documents', requireAIAccess, (req: AuthenticatedRequest, res: Response): void => {
  const uid = req.authUser!.id;
  res.json(db.getAnalyzedDocuments().filter((d) => d.ownerId === uid));
});

router.get('/documents/:id', requireAIAccess, (req: AuthenticatedRequest, res: Response): void => {
  const doc = db.getAnalyzedDocumentById(req.params.id);
  if (!doc || doc.ownerId !== req.authUser!.id) {
    res.status(404).json({ error: 'المستند غير موجود' });
    return;
  }
  res.json(doc);
});

router.post('/documents', requireAIAccess, (req: AuthenticatedRequest, res: Response): void => {
  const doc = req.body && typeof req.body === 'object' ? req.body : {};
  if (!doc.title || !doc.analysis) {
    res.status(400).json({ error: 'بيانات المستند غير مكتملة' });
    return;
  }
  if (doc.id) {
    const existing = db.getAnalyzedDocumentById(String(doc.id));
    if (existing && existing.ownerId !== req.authUser!.id) {
      res.status(403).json({ error: 'لا تملك صلاحية تعديل هذا المستند' });
      return;
    }
  }
  const { ownerId: _ignoredOwner, ...safeDocument } = doc;
  const saved = db.saveAnalyzedDocument({ ...safeDocument, ownerId: req.authUser!.id });
  res.json({ success: true, document: saved });
});

router.delete('/documents/:id', requireAIAccess, (req: AuthenticatedRequest, res: Response): void => {
  const doc = db.getAnalyzedDocumentById(req.params.id);
  if (doc && doc.ownerId !== req.authUser!.id) {
    res.status(403).json({ error: 'غير مصرح بحذف هذا المستند' });
    return;
  }
  const ok = db.deleteAnalyzedDocument(req.params.id);
  res.json({ success: ok });
});

// ==================== ARCHIVE (PRIVATE WORKSPACE SCOPED) ====================

router.get('/archive', (req: AuthenticatedRequest, res: Response): void => {
  const user = req.authUser!;
  res.json(db.getArchive(user.id).filter((exam) =>
    canAccessAcademicScope(user, exam.grade, exam.subjectId || 'subj-en')
  ));
});

router.post('/archive/:id/restore', (req: AuthenticatedRequest, res: Response): void => {
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    res.status(404).json({ error: 'الاختبار المؤرشف غير موجود' });
    return;
  }
  if (!canAccessAcademicScope(req.authUser!, exam.grade, exam.subjectId || 'subj-en')) {
    res.status(403).json({ error: 'لا تملك صلاحية استرجاع اختبار لهذا الصف أو المادة' });
    return;
  }
  if ((exam.ownerId || exam.createdBy) !== req.authUser!.id) {
    recordSecurityEvent({
      req,
      actor: req.authUser!,
      action: 'SECURITY_UNAUTHORIZED_ARCHIVE_RESTORE',
      category: 'SECURITY',
      severity: 'HIGH',
      examId: exam.id,
      details: `محاولة استرجاع اختبار مؤرشف يخص معلماً آخر (${exam.code})`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه أمني: محاولة استرجاع اختبار من أرشيف معلم آخر',
    });
    res.status(403).json({ error: 'غير مصرح لك باسترجاع اختبار يخص معلماً آخر' });
    return;
  }
  const ok = db.restoreExam(req.params.id);
  if (ok) {
    recordSecurityEvent({
      req,
      actor: req.authUser!,
      action: 'RESTORE_EXAM',
      category: 'EXAM',
      severity: 'INFO',
      examId: exam.id,
      details: `استعادة الاختبار من الأرشيف: ${exam.code}`,
    });
  }
  res.json({ success: ok });
});

// ==================== AI SETTINGS & DIAGNOSTICS (STRICTLY OWNER ONLY) ====================

router.get('/ai/settings', requireAIAccess, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getAISettings());
});

router.post('/ai/settings', requireAIAccess, (req: AuthenticatedRequest, res: Response): void => {
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const patch: any = {};
  const availableModelIds = new Set(geminiService.getAvailableModels().map((model) => model.id));

  if (Object.prototype.hasOwnProperty.call(body, 'primaryModel')) {
    if (typeof body.primaryModel !== 'string' || !availableModelIds.has(body.primaryModel)) {
      res.status(400).json({ error: 'اسم النموذج الأساسي غير صالح' });
      return;
    }
    patch.primaryModel = body.primaryModel;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'fallbackModel')) {
    if (typeof body.fallbackModel !== 'string' || !availableModelIds.has(body.fallbackModel)) {
      res.status(400).json({ error: 'اسم النموذج الاحتياطي غير صالح' });
      return;
    }
    patch.fallbackModel = body.fallbackModel;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'allowPaidModels')) {
    if (typeof body.allowPaidModels !== 'boolean') {
      res.status(400).json({ error: 'قيمة السماح بالنماذج المدفوعة غير صالحة' });
      return;
    }
    patch.allowPaidModels = body.allowPaidModels;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'temperature')) {
    const temperature = Number(body.temperature);
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      res.status(400).json({ error: 'درجة حرارة النموذج يجب أن تكون بين 0 و2' });
      return;
    }
    patch.temperature = temperature;
  }

  const updated = db.updateAISettings(patch);
  res.json({ success: true, settings: updated });
});

router.get('/ai/models', requireAIAccess, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(geminiService.getAvailableModels());
});

router.post('/ai/ping', requireAIAccess, requireAIRateLimit, async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { model } = req.body || {};
  const availableModels = geminiService.getAvailableModels();
  if (model && !availableModels.some((item: any) => item.id === model || item.name === model)) {
    res.status(400).json({ error: 'النموذج المحدد غير موجود ضمن النماذج المتاحة' });
    return;
  }
  try {
    const result = await geminiService.pingTest(model);
    res.json(result);
  } catch {
    res.status(502).json({ error: 'تعذر الاتصال بخدمة الذكاء الاصطناعي حالياً' });
  }
});

router.get('/ai/logs', requireAIAccess, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getAILogs());
});

// ==================== OWNER REGISTRATION REQUESTS & ACCOUNT LIFECYCLE (OWNER ONLY) ====================

router.get('/owner/registration-requests', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const status = req.query.status as string | undefined;
  res.json(db.getRegistrationRequests(status));
});

router.post(
  '/owner/registration-requests/:id/approve',
  requirePlatformOwner,
  (req: AuthenticatedRequest, res: Response): void => {
    const reviewer = req.authUser!;
    const { role, assignedSubjects, assignedGrades, reviewNote } = req.body || {};
    try {
      const outcome = db.approveRegistrationRequest(req.params.id, reviewer, {
        role: role === 'SchoolAdmin' ? 'SchoolAdmin' : role === 'Teacher' ? 'Teacher' : undefined,
        assignedSubjects: Array.isArray(assignedSubjects) ? assignedSubjects : undefined,
        assignedGrades: Array.isArray(assignedGrades) ? assignedGrades : undefined,
        reviewNote,
      });
      if (!outcome) {
        res.status(404).json({ error: 'طلب التسجيل غير موجود' });
        return;
      }

      recordSecurityEvent({
        req,
        actor: reviewer,
        action: 'APPROVE_REGISTRATION',
        category: 'REGISTRATION',
        severity: 'INFO',
        targetUserId: outcome.user.id,
        details: `موافقة مالك المنصة على طلب التسجيل لـ "${outcome.user.name}" (@${outcome.user.username}) بصلاحية (${outcome.user.role})`,
        notifyOwner: true,
        ownerNotificationCategory: 'REGISTRATION',
        ownerNotificationTitle: `تمت الموافقة وتفعيل الحساب: ${outcome.user.name}`,
        notifyUser: {
          userId: outcome.user.id,
          category: 'REGISTRATION',
          title: 'مرحباً بك! تم اعتماد وتفعيل حسابك',
          message: `وافق مالك المنصة (${reviewer.name}) على طلب انضمامك بصلاحية (${outcome.user.role === 'SchoolAdmin' ? 'إدارة المدرسة' : 'معلم'}). يمكنك الآن إنشاء اختباراتك في مساحتك الخاصة.`,
        },
      });

      res.json({ success: true, request: outcome.request, user: outcome.user });
    } catch (e: any) {
      res.status(400).json({ error: e.message || 'تعذر اعتماد طلب التسجيل' });
    }
  }
);

router.post(
  '/owner/registration-requests/:id/reject',
  requirePlatformOwner,
  (req: AuthenticatedRequest, res: Response): void => {
    const reviewer = req.authUser!;
    const reason = String(req.body?.reviewNote || req.body?.reason || 'لم تستوفِ البيانات الشروط المطلوبة').trim();
    const updated = db.updateRegistrationRequestStatus(req.params.id, 'REJECTED', reviewer, reason);
    if (!updated) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود' });
      return;
    }

    recordSecurityEvent({
      req,
      actor: reviewer,
      action: 'REJECT_REGISTRATION',
      category: 'REGISTRATION',
      severity: 'INFO',
      targetUserId: updated.id,
      details: `رفض طلب التسجيل لـ "${updated.fullName}" (@${updated.username}) — السبب: ${reason}`,
      reason,
      notifyOwner: true,
      ownerNotificationCategory: 'REGISTRATION',
      ownerNotificationTitle: `تم رفض طلب التسجيل: ${updated.fullName}`,
    });

    res.json({ success: true, request: updated });
  }
);

router.post(
  '/owner/registration-requests/:id/request-edit',
  requirePlatformOwner,
  (req: AuthenticatedRequest, res: Response): void => {
    const reviewer = req.authUser!;
    const note = String(req.body?.reviewNote || 'يرجى استكمال أو تصحيح بيانات التسجيل ومراجعة الإدارة').trim();
    const updated = db.updateRegistrationRequestStatus(req.params.id, 'NEEDS_EDIT', reviewer, note);
    if (!updated) {
      res.status(404).json({ error: 'طلب التسجيل غير موجود' });
      return;
    }

    recordSecurityEvent({
      req,
      actor: reviewer,
      action: 'REQUEST_EDIT_REGISTRATION',
      category: 'REGISTRATION',
      severity: 'INFO',
      targetUserId: updated.id,
      details: `طلب استكمال/تعديل بيانات لطلب التسجيل (@${updated.username}): ${note}`,
      reason: note,
    });

    res.json({ success: true, request: updated });
  }
);

router.post(
  '/owner/users/:id/suspend',
  requirePlatformOwner,
  (req: AuthenticatedRequest, res: Response): void => {
    const reviewer = req.authUser!;
    const target = db.findUserById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'الحساب غير موجود' });
      return;
    }
    if (isPlatformOwner(target)) {
      res.status(400).json({ error: 'لا يمكن تعليق حساب مالك المنصة' });
      return;
    }
    const reason = String(req.body?.reason || 'تعليق إداري مؤقت').trim();
    const updated = db.updateUser(target.id, { status: 'SUSPENDED', reviewNotes: reason });
    recordSecurityEvent({
      req,
      actor: reviewer,
      action: 'SUSPEND_USER',
      category: 'ADMIN',
      severity: 'WARNING',
      targetUserId: target.id,
      details: `إيقاف/تعليق الحساب: @${target.username} — السبب: ${reason}`,
      reason,
      notifyOwner: true,
      ownerNotificationTitle: `تم تعليق حساب المستخدم: ${target.name}`,
    });
    res.json({ success: true, user: updated });
  }
);

router.post(
  '/owner/users/:id/reactivate',
  requirePlatformOwner,
  (req: AuthenticatedRequest, res: Response): void => {
    const reviewer = req.authUser!;
    const target = db.findUserById(req.params.id);
    if (!target) {
      res.status(404).json({ error: 'الحساب غير موجود' });
      return;
    }
    const updated = db.updateUser(target.id, { status: 'ACTIVE', failedLoginAttempts: 0, lockedUntil: undefined });
    recordSecurityEvent({
      req,
      actor: reviewer,
      action: 'REACTIVATE_USER',
      category: 'ADMIN',
      severity: 'INFO',
      targetUserId: target.id,
      details: `إعادة تفعيل الحساب: @${target.username}`,
      notifyUser: {
        userId: target.id,
        category: 'ADMIN',
        title: 'تمت إعادة تفعيل حسابك',
        message: 'أعاد مالك المنصة تفعيل حسابك ويمكنك الآن تسجيل الدخول.',
      },
    });
    res.json({ success: true, user: updated });
  }
);

// ==================== OWNER CONTROL CENTER & TAMPER-EVIDENT AUDIT LOG ====================

router.get('/owner/control-center', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const users = db.getUsers();
  const requests = db.getRegistrationRequests();
  const allExams = db.getExams();
  const archive = db.getArchive();
  const notifications = db.getNotificationsForUser(req.authUser!);
  const auditLogs = db.getAuditLogs({ limit: 150 });
  const securityEvents = auditLogs.filter((l) => l.category === 'SECURITY' || l.severity === 'HIGH' || l.severity === 'CRITICAL');
  const integrity = db.verifyAuditLogIntegrity();
  const storageStatus = db.getStorageStatus();

  res.json({
    summary: {
      pendingRegistrations: requests.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'NEEDS_EDIT').length,
      unreadNotifications: notifications.filter((n) => !n.readBy.includes(req.authUser!.id)).length,
      totalUsers: users.length,
      activeUsers: users.filter((u) => (u.status || 'ACTIVE') === 'ACTIVE').length,
      suspendedUsers: users.filter((u) => u.status === 'SUSPENDED').length,
      teachersCount: users.filter((u) => u.role === 'Teacher').length,
      schoolAdminsCount: users.filter((u) => u.role === 'SchoolAdmin').length,
      totalExams: allExams.length,
      archivedExams: archive.length,
      securityAlertsCount: securityEvents.length,
      criticalAlertsCount: auditLogs.filter((l) => l.severity === 'CRITICAL').length,
    },
    pendingRequestsList: requests.filter((r) => r.status === 'PENDING_APPROVAL' || r.status === 'NEEDS_EDIT'),
    usersOverview: users.map((u) => ({
      ...u,
      examsCount: allExams.filter((e) => (e.ownerId || e.createdBy) === u.id).length,
    })),
    recentSecurityAlerts: securityEvents.slice(0, 25),
    recentExamsActivity: allExams.slice(0, 15).map((e) => ({
      id: e.id,
      code: e.code,
      title: e.titleAr || e.title,
      subjectId: e.subjectId,
      grade: e.grade,
      createdByName: e.createdByName,
      status: e.status,
      updatedAt: e.updatedAt || e.createdAt || '',
    })),
    auditIntegrity: integrity,
    storageStatus,
    notificationChannels: getNotificationChannelsStatus(),
  });
});

router.get('/owner/audit-logs', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const { category, severity, userId, search, limit } = req.query as Record<string, string>;
  const logs = db.getAuditLogs({
    category,
    severity,
    userId,
    search,
    limit: limit ? Number(limit) : undefined,
  });
  res.json({
    logs,
    integrity: db.verifyAuditLogIntegrity(),
  });
});

router.get('/owner/audit-logs/export', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const logs = db.getAuditLogs();
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  if (format === 'csv') {
    const header = 'id,timestamp,userId,actorName,actorRole,category,severity,action,result,ipAddress,details\n';
    const rows = logs
      .map((l) =>
        [
          l.id,
          l.timestamp,
          l.userId,
          l.actorName || '',
          l.actorRole || '',
          l.category || '',
          l.severity || '',
          l.action,
          l.result || '',
          l.ipAddress || '',
          `"${(l.details || '').replace(/"/g, '""')}"`,
        ].join(',')
      )
      .join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="qaflah-audit-log.csv"');
    res.send('\uFEFF' + header + rows);
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="qaflah-audit-log.json"');
  res.send(JSON.stringify({ exportedAt: new Date().toISOString(), integrity: db.verifyAuditLogIntegrity(), logs }, null, 2));
});

// ==================== SYSTEM & USERS & RBAC ====================

router.get('/system/colleagues', (req: AuthenticatedRequest, res: Response): void => {
  const selfId = req.authUser!.id;
  const list = db
    .getUsers()
    .filter((u) => u.id !== selfId && (u.status || 'ACTIVE') === 'ACTIVE')
    .map((u) => ({ id: u.id, name: u.name, username: u.username, role: u.role }));
  res.json(list);
});

router.get('/system/users', requireSchoolAdminOrOwner, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getUsers());
});

router.post('/system/users', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const { username, name, role, email, phone, password, assignedSubjects, assignedGrades, hasAIAccess } = req.body;
  if (!username || !password || !name) {
    res.status(400).json({ error: 'يرجى إكمال بيانات المستخدم' });
    return;
  }
  if (typeof password !== 'string' || password.length < 8) {
    res.status(400).json({ error: 'كلمة مرور الحساب يجب ألا تقل عن 8 أحرف' });
    return;
  }

  if (role === 'PlatformOwner' || role === 'Administrator') {
    if (!isPlatformOwner(actor)) {
      recordSecurityEvent({
        req,
        actor,
        action: 'SECURITY_PRIVILEGE_ESCALATION_ATTEMPT',
        category: 'SECURITY',
        severity: 'CRITICAL',
        details: `حاول حساب الإدارة @${actor.username} إنشاء حساب مالك منصة وتم حظر الطلب`,
        result: 'BLOCKED',
        notifyOwner: true,
        ownerNotificationTitle: 'تنبيه حرج: محاولة تصعيد صلاحية إلى مالك منصة',
      });
      res.status(403).json({ error: 'فقط صاحب المنصة يمكنه إنشاء حساب مالك منصة' });
      return;
    }
  }

  const resolvedRole =
    role === 'PlatformOwner' ? 'PlatformOwner' : role === 'SchoolAdmin' ? 'SchoolAdmin' : 'Teacher';
  if (resolvedRole === 'SchoolAdmin' && !isPlatformOwner(actor)) {
    res.status(403).json({ error: 'إنشاء حسابات إدارة المدرسة محصور بصاحب المنصة' });
    return;
  }
  const resolvedAI = isPlatformOwner(actor) && resolvedRole === 'PlatformOwner' ? Boolean(hasAIAccess) : false;
  if (resolvedRole === 'Teacher' && !hasValidTeacherAssignments(assignedSubjects, assignedGrades)) {
    res.status(400).json({ error: 'يجب تحديد مادة وصف دراسي صحيحين للمعلم' });
    return;
  }

  try {
    const newUser = db.createUser({
      username,
      name,
      role: resolvedRole,
      status: 'ACTIVE',
      hasAIAccess: resolvedAI,
      assignedSubjects,
      assignedGrades,
      email,
      phone,
      school: db.getSchoolSettings().schoolNameAr,
      reviewedBy: actor.id,
      reviewedByName: actor.name,
      reviewedAt: new Date().toISOString(),
      password,
    });
    recordSecurityEvent({
      req,
      actor,
      action: 'CREATE_USER',
      category: 'ADMIN',
      severity: 'INFO',
      targetUserId: newUser.id,
      details: `إنشاء حساب ${newUser.username} بصلاحية ${newUser.role}`,
      notifyOwner: !isPlatformOwner(actor),
      ownerNotificationTitle: `إنشاء حساب جديد بواسطة ${actor.name}: ${newUser.name}`,
    });
    res.json({ success: true, user: newUser });
  } catch (e: any) {
    res.status(400).json({ error: e.message || 'فشل إنشاء المستخدم' });
  }
});

router.put('/system/users/:id', requireSchoolAdminOrOwner, (req: AuthenticatedRequest, res: Response): void => {
  const actor = req.authUser!;
  const target = db.findUserById(req.params.id);
  if (!target) {
    res.status(404).json({ error: 'المستخدم غير موجود' });
    return;
  }

  if (isPlatformOwner(target) && !isPlatformOwner(actor)) {
    recordSecurityEvent({
      req,
      actor,
      action: 'SECURITY_OWNER_TAMPER_BLOCKED',
      category: 'SECURITY',
      severity: 'CRITICAL',
      targetUserId: target.id,
      details: `حاول حساب الإدارة @${actor.username} تعديل حساب مالك المنصة وتم حظر الطلب`,
      result: 'BLOCKED',
      notifyOwner: true,
      ownerNotificationTitle: 'تنبيه حرج: محاولة تعديل حساب مالك المنصة',
    });
    res.status(403).json({ error: 'لا يمكن تعديل حساب صاحب المنصة' });
    return;
  }

  // Explicit allowlist prevents mass assignment and accidental plaintext credential storage.
  const body = req.body && typeof req.body === 'object' ? req.body : {};
  const allowedUserFields = [
    'name', 'role', 'status', 'hasAIAccess', 'assignedSubjects', 'assignedGrades',
    'email', 'phone', 'school', 'reviewNotes', 'delegatedPermissions',
  ];
  const patch: any = {};
  for (const field of allowedUserFields) {
    if (Object.prototype.hasOwnProperty.call(body, field)) {
      patch[field] = body[field];
    }
  }

  if (!isPlatformOwner(actor)) {
    delete patch.hasAIAccess;
    delete patch.delegatedPermissions;
    delete patch.status;
    if (patch.role === 'PlatformOwner' || patch.role === 'Administrator') {
      res.status(403).json({ error: 'غير مصرح بالترقية إلى مالك المنصة' });
      return;
    }
    if (patch.role === 'SchoolAdmin' && target.role !== 'SchoolAdmin') {
      res.status(403).json({ error: 'ترقية الحساب إلى إدارة المدرسة محصورة بصاحب المنصة' });
      return;
    }
  }
  if (patch.role === 'Teacher' || patch.role === 'SchoolAdmin') {
    patch.hasAIAccess = false;
  }
  const nextRole = patch.role || target.role;
  if (
    nextRole === 'Teacher' &&
    !hasValidTeacherAssignments(
      patch.assignedSubjects ?? target.assignedSubjects,
      patch.assignedGrades ?? target.assignedGrades
    )
  ) {
    res.status(400).json({ error: 'يجب تحديد مادة وصف دراسي صحيحين للمعلم' });
    return;
  }

  const updated = db.updateUser(req.params.id, patch);
  recordSecurityEvent({
    req,
    actor,
    action: 'UPDATE_USER',
    category: 'ADMIN',
    severity: 'INFO',
    targetUserId: target.id,
    details: `تحديث بيانات/صلاحيات الحساب: ${target.username}`,
    notifyOwner: !isPlatformOwner(actor),
    ownerNotificationTitle: `تعديل صلاحيات حساب بواسطة ${actor.name}: @${target.username}`,
  });
  res.json({ success: true, user: updated });
});

router.get('/system/audit-logs', requirePlatformOwner, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getAuditLogs());
});

router.get('/system/storage-status', requirePlatformOwner, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.getStorageStatus());
});

router.post('/system/backup', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const filename = db.createBackup();
  recordSecurityEvent({
    req,
    actor: req.authUser!,
    action: 'CREATE_BACKUP',
    category: 'BACKUP',
    severity: 'INFO',
    details: `إنشاء نسخة احتياطية: ${filename}`,
  });
  res.json({ success: true, filename });
});

router.get('/system/backups', requirePlatformOwner, (_req: AuthenticatedRequest, res: Response): void => {
  res.json(db.listBackups());
});

router.get('/system/backup/download', requirePlatformOwner, (_req: AuthenticatedRequest, res: Response): void => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="qaflah-snapshot-${Date.now()}.json"`);
  res.send(db.getCurrentSnapshotJson());
});

router.get('/system/backups/:filename/download', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const content = db.getBackupContent(req.params.filename);
  if (!content) {
    res.status(404).json({ error: 'ملف النسخة الاحتياطية غير موجود' });
    return;
  }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.filename}"`);
  res.send(content);
});

router.post('/system/restore', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const { filename } = req.body;
  if (!filename) {
    res.status(400).json({ error: 'يرجى تحديد اسم ملف النسخة الاحتياطية' });
    return;
  }
  const ok = db.restoreBackup(filename);
  if (ok) {
    recordSecurityEvent({
      req,
      actor: req.authUser!,
      action: 'RESTORE_BACKUP',
      category: 'BACKUP',
      severity: 'WARNING',
      details: `استعادة نسخة احتياطية: ${filename}`,
      notifyOwner: true,
      ownerNotificationTitle: `تمت استعادة النسخة الاحتياطية: ${filename}`,
    });
  }
  res.json({ success: ok });
});

router.post('/system/restore-upload', requirePlatformOwner, (req: AuthenticatedRequest, res: Response): void => {
  const { content } = req.body || {};
  if (!content || typeof content !== 'string') {
    res.status(400).json({ error: 'يرجى إرسال محتوى ملف النسخة الاحتياطية JSON' });
    return;
  }
  const ok = db.restoreFromJsonString(content);
  if (!ok) {
    res.status(400).json({ error: 'ملف النسخة الاحتياطية غير صالح أو تالف' });
    return;
  }
  recordSecurityEvent({
    req,
    actor: req.authUser!,
    action: 'RESTORE_UPLOAD_BACKUP',
    category: 'BACKUP',
    severity: 'WARNING',
    details: 'استعادة قاعدة البيانات من ملف JSON مرفوع خارجياً',
    notifyOwner: true,
    ownerNotificationTitle: 'تمت استعادة قاعدة البيانات من ملف خارجي',
  });
  res.json({ success: true });
});
