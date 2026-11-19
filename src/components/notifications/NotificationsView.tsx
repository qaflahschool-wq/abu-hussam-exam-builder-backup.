import React, { useState, useMemo } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { NotificationItem } from '../../types/index.ts';
import {
  Bell,
  CheckCheck,
  ShieldAlert,
  UserPlus,
  FileText,
  Lock,
  Check,
  Building2,
} from 'lucide-react';

interface NotificationsViewProps {
  onNavigate?: (view: string) => void;
}

export const NotificationsView: React.FC<NotificationsViewProps> = ({ onNavigate }) => {
  const {
    user,
    notifications,
    unreadNotificationsCount,
    isPlatformOwner,
    markNotificationRead,
    markAllNotificationsRead,
    refreshNotifications,
  } = useAuth();

  const [filterMode, setFilterMode] = useState<'all' | 'unread'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  const filteredList = useMemo(() => {
    return notifications.filter((n) => {
      const isRead = user ? n.readBy.includes(user.id) : false;
      if (filterMode === 'unread' && isRead) return false;
      if (categoryFilter !== 'ALL' && n.category !== categoryFilter) return false;
      return true;
    });
  }, [notifications, filterMode, categoryFilter, user]);

  const getCategoryIcon = (n: NotificationItem) => {
    if (n.category === 'SECURITY') return <ShieldAlert className="w-4 h-4 text-rose-600" />;
    if (n.category === 'REGISTRATION') return <UserPlus className="w-4 h-4 text-[#1B5E3A]" />;
    if (n.category === 'EXAM') return <FileText className="w-4 h-4 text-blue-700" />;
    if (n.category === 'ADMIN') return <Building2 className="w-4 h-4 text-amber-700" />;
    return <Lock className="w-4 h-4 text-slate-600" />;
  };

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Bell className="w-5 h-5 text-[#1B5E3A]" />
            <span>صندوق الإشعارات والتنبيهات</span>
            {unreadNotificationsCount > 0 && (
              <span className="text-xs font-mono font-bold text-[#1B5E3A] tabular-nums">
                ({unreadNotificationsCount} غير مقروء)
              </span>
            )}
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isPlatformOwner
              ? 'إشعارات طلبات التسجيل الجديدة والتنبيهات الأمنية ومتابعة النظام المركزي.'
              : 'إشعارات خاصة بحسابك ومساحة عملك ومشاركات الاختبارات.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => refreshNotifications()}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors"
          >
            تحديث
          </button>
          {unreadNotificationsCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead()}
              className="px-3.5 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors"
            >
              <CheckCheck className="w-4 h-4" />
              <span>تعليم الكل كمقروء</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-3 rounded-2xl border border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              filterMode === 'all'
                ? 'bg-[#1B5E3A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            الكل ({notifications.length})
          </button>
          <button
            onClick={() => setFilterMode('unread')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors ${
              filterMode === 'unread'
                ? 'bg-[#1B5E3A] text-white'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            غير مقروء ({unreadNotificationsCount})
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-bold text-slate-500">التصنيف:</span>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg font-semibold"
          >
            <option value="ALL">جميع التصنيفات</option>
            {isPlatformOwner && <option value="REGISTRATION">طلبات التسجيل</option>}
            {isPlatformOwner && <option value="SECURITY">تنبيهات أمنية</option>}
            <option value="EXAM">مشاركات الاختبارات</option>
            <option value="ADMIN">الإدارة والصلاحيات</option>
          </select>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden divide-y divide-slate-100">
        {filteredList.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <span>لا توجد إشعارات مطابقة للعرض حالياً.</span>
          </div>
        ) : (
          filteredList.map((n) => {
            const isRead = user ? n.readBy.includes(user.id) : false;
            const isCriticalOrHigh = n.severity === 'CRITICAL' || n.severity === 'HIGH';
            return (
              <div
                key={n.id}
                className={`p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 transition-colors ${
                  !isRead ? 'bg-emerald-50/35' : 'bg-white'
                }`}
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
                      isCriticalOrHigh
                        ? 'bg-rose-50 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    {getCategoryIcon(n)}
                  </div>

                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className={`font-extrabold ${isCriticalOrHigh ? 'text-rose-800' : 'text-slate-900'}`}>
                        {n.title}
                      </span>
                      {!isRead && (
                        <span className="text-[10px] font-bold text-[#1B5E3A]">· جديد</span>
                      )}
                      {isCriticalOrHigh && (
                        <span className="text-[10px] font-mono font-bold text-rose-700">
                          · {n.severity}
                        </span>
                      )}
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">{n.message}</p>

                    <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-2 font-mono tabular-nums">
                      <span>{new Date(n.createdAt).toLocaleString('ar-YE')}</span>
                      {n.actorName && (
                        <>
                          <span>·</span>
                          <span className="font-sans text-slate-500">الفاعل: {n.actorName}</span>
                        </>
                      )}
                      {isPlatformOwner && n.ipAddress && (
                        <>
                          <span>·</span>
                          <span>IP: {n.ipAddress}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                  {isPlatformOwner && n.category === 'REGISTRATION' && onNavigate && (
                    <button
                      onClick={() => onNavigate('registration-requests')}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 rounded-lg text-xs font-bold"
                    >
                      مراجعة الطلب
                    </button>
                  )}
                  {isPlatformOwner && n.category === 'SECURITY' && onNavigate && (
                    <button
                      onClick={() => onNavigate('owner-control-center')}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-lg text-xs font-bold"
                    >
                      مركز التحكم
                    </button>
                  )}
                  {!isRead && (
                    <button
                      onClick={() => markNotificationRead(n.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1"
                    >
                      <Check className="w-3.5 h-3.5 text-[#1B5E3A]" />
                      <span>تمت القراءة</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
