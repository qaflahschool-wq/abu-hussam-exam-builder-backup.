import { Request } from 'express';
import { db } from './db.js';
import { AuditCategory, SecuritySeverity, User } from '../src/types/index.js';

export interface ClientMeta {
  ipAddress: string;
  userAgent: string;
}

export function getClientMeta(req: Request): ClientMeta {
  // Express req.ip respects only the proxy chain configured by the server.
  // Reading X-Forwarded-For directly lets clients spoof their IP and evade limits.
  let ip = req.ip || req.socket?.remoteAddress || 'unknown';
  if (ip.startsWith('::ffff:')) {
    ip = ip.slice(7);
  }
  const ua = String(req.headers['user-agent'] || 'unknown').slice(0, 140);
  return { ipAddress: ip, userAgent: ua };
}

// Sliding-window rate limiters & brute-force trackers (in-memory + synced with DB lockouts)
interface WindowBucket {
  timestamps: number[];
  blockedUntil?: number;
}

const rateBuckets = new Map<string, WindowBucket>();
const loginFailureBuckets = new Map<string, WindowBucket>();

export function checkSlidingRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { allowed: boolean; retryAfterSec: number; count: number } {
  const now = Date.now();
  const bucket = rateBuckets.get(key) || { timestamps: [] };
  if (bucket.blockedUntil && bucket.blockedUntil > now) {
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000),
      count: bucket.timestamps.length,
    };
  }
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  if (bucket.timestamps.length >= maxRequests) {
    bucket.blockedUntil = now + Math.min(windowMs, 5 * 60 * 1000);
    rateBuckets.set(key, bucket);
    return {
      allowed: false,
      retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000),
      count: bucket.timestamps.length,
    };
  }
  bucket.timestamps.push(now);
  bucket.blockedUntil = undefined;
  rateBuckets.set(key, bucket);
  return { allowed: true, retryAfterSec: 0, count: bucket.timestamps.length };
}

export function trackLoginFailureWindow(
  key: string,
  windowMs = 10 * 60 * 1000,
  lockThreshold = 5,
  lockDurationMs = 10 * 60 * 1000
): { count: number; locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = loginFailureBuckets.get(key) || { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
  bucket.timestamps.push(now);
  if (bucket.timestamps.length >= lockThreshold) {
    bucket.blockedUntil = now + lockDurationMs;
  }
  loginFailureBuckets.set(key, bucket);
  return {
    count: bucket.timestamps.length,
    locked: Boolean(bucket.blockedUntil && bucket.blockedUntil > now),
    retryAfterSec: bucket.blockedUntil ? Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1000)) : 0,
  };
}

export function isLoginWindowLocked(key: string): { locked: boolean; retryAfterSec: number } {
  const now = Date.now();
  const bucket = loginFailureBuckets.get(key);
  if (bucket?.blockedUntil && bucket.blockedUntil > now) {
    return { locked: true, retryAfterSec: Math.ceil((bucket.blockedUntil - now) / 1000) };
  }
  return { locked: false, retryAfterSec: 0 };
}

export function clearLoginFailureWindow(key: string): void {
  loginFailureBuckets.delete(key);
}

// Pluggable external notification dispatcher hook (disabled unless configured)
export interface ExternalNotificationAdapter {
  channel: 'email' | 'whatsapp';
  isConfigured: () => boolean;
  send: (payload: { title: string; message: string; severity: SecuritySeverity }) => Promise<void>;
}

const registeredExternalAdapters: ExternalNotificationAdapter[] = [];

export function getNotificationChannelsStatus() {
  return {
    inAppOwnerNotifications: true,
    emailWebhookConfigured: registeredExternalAdapters.some((a) => a.channel === 'email' && a.isConfigured()),
    whatsappAdapterConfigured: registeredExternalAdapters.some((a) => a.channel === 'whatsapp' && a.isConfigured()),
  };
}

export function recordSecurityEvent(params: {
  req?: Request;
  actor?: User;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  category: AuditCategory;
  severity: SecuritySeverity;
  details: string;
  result?: 'SUCCESS' | 'BLOCKED' | 'ERROR';
  reason?: string;
  subjectId?: string;
  examId?: string;
  targetUserId?: string;
  notifyOwner?: boolean;
  notifyUser?: { userId: string; title: string; message: string; category?: 'REGISTRATION' | 'AUTH' | 'ADMIN' | 'EXAM' };
  ownerNotificationTitle?: string;
  ownerNotificationMessage?: string;
  ownerNotificationCategory?: 'REGISTRATION' | 'AUTH' | 'SECURITY' | 'ADMIN' | 'EXAM';
}) {
  const meta = params.req ? getClientMeta(params.req) : { ipAddress: 'internal', userAgent: 'system' };
  const actorId = params.actor?.id || params.actorId || 'anonymous';
  const actorName = params.actor?.name || params.actorName || actorId;
  const actorRole = params.actor?.role || params.actorRole || 'Guest';

  const auditEntry = db.addAuditLog(actorId, params.action, params.details, {
    actorName,
    actorRole,
    category: params.category,
    severity: params.severity,
    subjectId: params.subjectId,
    examId: params.examId,
    targetUserId: params.targetUserId,
    ipAddress: meta.ipAddress,
    userAgent: meta.userAgent,
    result: params.result || 'SUCCESS',
    reason: params.reason,
  });

  if (params.notifyOwner) {
    db.addNotification({
      recipientScope: 'OWNER',
      category:
        params.ownerNotificationCategory ||
        (params.category === 'REGISTRATION'
          ? 'REGISTRATION'
          : params.category === 'AUTH'
          ? 'AUTH'
          : params.category === 'SECURITY'
          ? 'SECURITY'
          : params.category === 'EXAM'
          ? 'EXAM'
          : 'ADMIN'),
      severity: params.severity,
      eventType: params.action,
      title: params.ownerNotificationTitle || params.action,
      message: params.ownerNotificationMessage || params.details,
      actorUserId: actorId,
      actorName,
      actorRole,
      targetId: params.targetUserId || params.examId,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent,
      reason: params.reason,
    });
  }

  if (params.notifyUser) {
    db.addNotification({
      recipientScope: 'USER',
      recipientUserId: params.notifyUser.userId,
      category: params.notifyUser.category || 'ADMIN',
      severity: params.severity === 'CRITICAL' || params.severity === 'HIGH' ? 'WARNING' : 'INFO',
      eventType: params.action,
      title: params.notifyUser.title,
      message: params.notifyUser.message,
      actorUserId: actorId,
      actorName,
      actorRole,
      targetId: params.targetUserId || params.examId,
    });
  }

  return auditEntry;
}
