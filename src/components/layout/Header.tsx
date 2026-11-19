import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import {
  Sparkles,
  UserCheck,
  ChevronDown,
  PlusCircle,
  ShieldCheck,
  Menu,
  X,
  LogOut,
  Lock,
  Bell,
  CheckCheck,
} from 'lucide-react';

interface HeaderProps {
  onNavigate: (view: string) => void;
  activeView: string;
  isMobileSidebarOpen: boolean;
  onToggleMobileSidebar: () => void;
  onOpenManualWizard: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onNavigate,
  isMobileSidebarOpen,
  onToggleMobileSidebar,
  onOpenManualWizard,
}) => {
  const {
    user,
    isAdmin,
    isPlatformOwner,
    hasAIAccess,
    schoolIdentity,
    switchUser,
    availableUsers,
    notifications,
    unreadNotificationsCount,
    pendingRegistrationsCount,
    markNotificationRead,
    markAllNotificationsRead,
    logout,
  } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifMenu, setShowNotifMenu] = useState(false);
  const [aiStatus, setAiStatus] = useState<'Connected' | 'Checking' | 'Error'>('Checking');

  useEffect(() => {
    if (!hasAIAccess) return;
    let mounted = true;
    const checkAi = async () => {
      try {
        const ping = await api.pingAI();
        if (!mounted) return;
        setAiStatus(ping.success ? 'Connected' : 'Error');
      } catch {
        if (!mounted) return;
        setAiStatus('Error');
      }
    };
    checkAi();
    return () => {
      mounted = false;
    };
  }, [hasAIAccess]);

  const roleLabel =
    user?.role === 'PlatformOwner' || user?.role === 'Administrator'
      ? 'مالك المنصة'
      : user?.role === 'SchoolAdmin'
      ? 'إدارة المدرسة'
      : 'معلم';

  return (
    <header className="no-print bg-[#1B5E3A] text-white border-b border-[#144D2E] sticky top-0 z-40 shadow-sm safe-area-top">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile Menu Toggle & Official School Brand */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 overflow-hidden">
            <button
              onClick={onToggleMobileSidebar}
              className="lg:hidden p-2 rounded-xl text-emerald-100 hover:text-white hover:bg-[#144D2E] transition-colors touch-target-min flex items-center justify-center"
              aria-label="فتح القائمة الرئيسية"
            >
              {isMobileSidebarOpen ? (
                <X className="w-6 h-6 text-amber-300" />
              ) : (
                <Menu className="w-6 h-6" />
              )}
            </button>

            <button
              onClick={() => onNavigate('dashboard')}
              className="flex items-center gap-2 text-right hover:opacity-95 transition-opacity min-w-0 flex-1 overflow-hidden"
            >
              <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-white p-0.5 flex items-center justify-center shadow-sm border border-emerald-200/60 shrink-0 overflow-hidden">
                <img
                  src={schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg'}
                  alt={schoolIdentity?.schoolNameAr || 'شعار مدرسة قفلة'}
                  className="w-full h-full object-contain rounded-lg"
                />
              </div>
              <div className="min-w-0 flex-1 overflow-hidden">
                <div className="font-extrabold text-xs sm:text-base tracking-wide text-white leading-tight truncate">
                  {schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] sm:text-[11px] text-emerald-100/90 min-w-0">
                  <span className="font-semibold font-english truncate block">ABU HUSSAM EXAM BUILDER</span>
                  <span className="hidden sm:inline text-emerald-300/70 shrink-0">·</span>
                  <span className="hidden sm:inline text-emerald-200 shrink-0">
                    {schoolIdentity?.schoolNameEn || 'QAFLAH SCHOOL'}
                  </span>
                </div>
              </div>
            </button>
          </div>

          {/* Actions & User Profile */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {/* AI Status Badge — STRICTLY PLATFORM OWNER ONLY */}
            {hasAIAccess && (
              <button
                onClick={() => onNavigate('ai-settings')}
                title="فحص نماذج Gemini AI"
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  aiStatus === 'Connected'
                    ? 'bg-emerald-950/50 text-emerald-100 border-emerald-400/30 hover:bg-emerald-950/70'
                    : aiStatus === 'Checking'
                    ? 'bg-amber-950/40 text-amber-200 border-amber-400/30'
                    : 'bg-rose-950/50 text-rose-200 border-rose-400/30'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                <span className="hidden lg:inline">Gemini AI:</span>
                <span className="font-bold">
                  {aiStatus === 'Connected' ? 'متصل' : aiStatus === 'Checking' ? 'فحص...' : 'تنبيه'}
                </span>
              </button>
            )}

            {/* Primary Manual Studio CTA (Available to ALL roles) */}
            <button
              onClick={onOpenManualWizard}
              className="flex items-center gap-1.5 bg-white hover:bg-emerald-50 text-[#1B5E3A] px-3 sm:px-4 py-2 rounded-xl font-extrabold text-xs sm:text-sm shadow-sm transition-all touch-target-min"
              title="إنشاء اختبار جديد يدوياً"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span className="hidden sm:inline">اختبار جديد</span>
            </button>

            {/* AI Quick Generator CTA — STRICTLY PLATFORM OWNER ONLY */}
            {hasAIAccess && (
              <button
                onClick={() => onNavigate('generator')}
                className="hidden sm:flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-slate-950 px-3 py-2 rounded-xl font-extrabold text-xs shadow-sm transition-all touch-target-min"
                title="توليد اختبار ذكي بالذكاء الاصطناعي"
              >
                <Sparkles className="w-3.5 h-3.5 shrink-0" />
                <span>توليد AI</span>
              </button>
            )}

            {/* Notification Bell (Role-scoped) */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowNotifMenu(!showNotifMenu);
                  setShowUserMenu(false);
                }}
                aria-label="الإشعارات والتنبيهات"
                className="relative p-2 rounded-xl bg-[#144D2E] hover:bg-[#0f3c23] border border-emerald-400/20 text-white transition-colors touch-target-min flex items-center justify-center"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                {unreadNotificationsCount > 0 && (
                  <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] px-1 rounded-full bg-amber-400 text-slate-950 text-[10px] font-extrabold font-mono flex items-center justify-center tabular-nums shadow-xs">
                    {unreadNotificationsCount > 9 ? '9+' : unreadNotificationsCount}
                  </span>
                )}
              </button>

              {showNotifMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/20"
                    onClick={() => setShowNotifMenu(false)}
                  />
                  <div className="absolute left-0 mt-2 w-80 max-w-[90vw] bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-xl overflow-hidden z-50">
                    <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                      <span className="text-xs font-extrabold text-slate-900">
                        الإشعارات ({unreadNotificationsCount} جديد)
                      </span>
                      {unreadNotificationsCount > 0 && (
                        <button
                          onClick={() => markAllNotificationsRead()}
                          className="text-[11px] font-bold text-[#1B5E3A] hover:underline flex items-center gap-1"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>تعليم الكل كمقروء</span>
                        </button>
                      )}
                    </div>

                    {isPlatformOwner && pendingRegistrationsCount > 0 && (
                      <button
                        onClick={() => {
                          setShowNotifMenu(false);
                          onNavigate('registration-requests');
                        }}
                        className="w-full px-3 py-2 bg-amber-50 hover:bg-amber-100 border-b border-amber-200 text-right text-[11px] font-extrabold text-amber-950 flex items-center justify-between"
                      >
                        <span>طلبات تسجيل جديدة بانتظار موافقتك</span>
                        <span className="font-mono">{pendingRegistrationsCount}</span>
                      </button>
                    )}

                    <div className="max-h-64 overflow-y-auto divide-y divide-slate-100">
                      {notifications.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          لا توجد إشعارات حالياً.
                        </div>
                      ) : (
                        notifications.slice(0, 6).map((n) => {
                          const isRead = user ? n.readBy.includes(user.id) : true;
                          return (
                            <div
                              key={n.id}
                              onClick={() => {
                                if (!isRead) markNotificationRead(n.id);
                                setShowNotifMenu(false);
                                if (isPlatformOwner && n.category === 'REGISTRATION') {
                                  onNavigate('registration-requests');
                                } else if (isPlatformOwner && n.category === 'SECURITY') {
                                  onNavigate('owner-control-center');
                                } else {
                                  onNavigate('notifications');
                                }
                              }}
                              className={`p-3 cursor-pointer hover:bg-slate-50 transition-colors space-y-0.5 ${
                                !isRead ? 'bg-emerald-50/40' : ''
                              }`}
                            >
                              <div className="text-xs font-bold text-slate-900 line-clamp-1">
                                {n.title}
                              </div>
                              <div className="text-[11px] text-slate-600 line-clamp-2">{n.message}</div>
                              <div className="text-[10px] font-mono text-slate-400 tabular-nums">
                                {new Date(n.createdAt).toLocaleString('ar-YE')}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="p-2 border-t border-slate-100 bg-slate-50 text-center">
                      <button
                        onClick={() => {
                          setShowNotifMenu(false);
                          onNavigate('notifications');
                        }}
                        className="w-full py-1.5 text-xs font-extrabold text-[#1B5E3A] hover:underline"
                      >
                        فتح مركز الإشعارات الكامل ←
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* User Profile & Menu */}
            <div className="relative">
              <button
                onClick={() => {
                  setShowUserMenu(!showUserMenu);
                  setShowNotifMenu(false);
                }}
                className="flex items-center gap-2 bg-[#144D2E] hover:bg-[#0f3c23] border border-emerald-400/20 px-2.5 sm:px-3 py-1.5 rounded-xl text-right transition-colors touch-target-min"
              >
                <div className="w-7 h-7 rounded-lg bg-white/15 flex items-center justify-center text-white font-extrabold text-xs shrink-0">
                  {user?.name?.charAt(0) || 'م'}
                </div>
                <div className="hidden md:block text-right">
                  <div className="text-xs font-bold text-white truncate max-w-[110px]">
                    {user?.name || 'المستخدم'}
                  </div>
                  <div className="text-[10px] text-emerald-200 font-medium">{roleLabel}</div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-emerald-200" />
              </button>

              {showUserMenu && (
                <>
                  <div
                    className="fixed inset-0 z-40 bg-black/20"
                    onClick={() => setShowUserMenu(false)}
                  />
                  <div className="absolute left-0 mt-2 w-72 bg-white text-slate-900 border border-slate-200 rounded-2xl shadow-xl p-2 z-50">
                    <div className="px-3 py-2.5 border-b border-slate-100 mb-1">
                      <div className="text-xs font-extrabold text-slate-900">{user?.name}</div>
                      <div className="text-[11px] text-[#1B5E3A] font-bold flex items-center gap-1 mt-0.5">
                        <Lock className="w-3 h-3" />
                        <span>{roleLabel} · مساحة عمل معزولة</span>
                      </div>
                    </div>

                    {/* Owner-only Quick Account Switcher for oversight */}
                    {isPlatformOwner && availableUsers.length > 0 && (
                      <div className="py-1 border-b border-slate-100 mb-1">
                        <p className="px-3 py-1 text-[10px] font-bold text-slate-400">
                          تبديل الحساب (صلاحية مالك المنصة)
                        </p>
                        <div className="space-y-1 max-h-48 overflow-y-auto">
                          {availableUsers.map((u) => (
                            <button
                              key={u.id}
                              onClick={() => {
                                switchUser(u.id);
                                setShowUserMenu(false);
                              }}
                              className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-colors ${
                                user?.id === u.id
                                  ? 'bg-emerald-50 text-[#1B5E3A] font-extrabold border border-emerald-200'
                                  : 'hover:bg-slate-50 text-slate-700'
                              }`}
                            >
                              <div className="text-right">
                                <div className="font-bold">{u.name}</div>
                                <div className="text-[10px] text-slate-500">
                                  @{u.username} · {u.role}
                                </div>
                              </div>
                              {user?.id === u.id && <UserCheck className="w-4 h-4 text-[#1B5E3A] shrink-0" />}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {isPlatformOwner && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onNavigate('owner-control-center');
                        }}
                        className="w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold text-[#1B5E3A] hover:bg-emerald-50 flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#1B5E3A]" />
                        <span>مركز التحكم والمراقبة الأمنية</span>
                      </button>
                    )}

                    {isAdmin && (
                      <button
                        onClick={() => {
                          setShowUserMenu(false);
                          onNavigate('users');
                        }}
                        className="w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 flex items-center gap-2"
                      >
                        <ShieldCheck className="w-4 h-4 text-[#1B5E3A]" />
                        <span>إدارة المعلمين والصلاحيات</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setShowUserMenu(false);
                        logout();
                      }}
                      className="w-full text-right px-3 py-2.5 rounded-xl text-xs font-bold text-rose-700 hover:bg-rose-50 flex items-center gap-2 mt-1"
                    >
                      <LogOut className="w-4 h-4" />
                      <span>تسجيل الخروج</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};
