import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Sparkles,
  Database,
  BookOpen,
  FolderArchive,
  Library,
  Sliders,
  Users,
  HardDriveDownload,
  CheckCircle2,
  X,
  Camera,
  Layout,
  Palette,
  BookMarked,
  Bell,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';

interface SidebarProps {
  activeView: string;
  onNavigate: (view: string) => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onNavigate,
  isMobileOpen,
  onCloseMobile,
}) => {
  const {
    user,
    isAdmin,
    isPlatformOwner,
    hasAIAccess,
    schoolIdentity,
    unreadNotificationsCount,
    pendingRegistrationsCount,
  } = useAuth();

  const canSeeEnglishCurricula =
    hasAIAccess ||
    user?.assignedSubjects?.includes('all') ||
    user?.assignedSubjects?.includes('subj-en');

  const navItems: {
    id: string;
    label: string;
    sub: string;
    icon: any;
    highlight?: boolean;
    badge?: number;
  }[] = [
    {
      id: 'dashboard',
      label: 'لوحة التحكم',
      sub: 'نظرة عامة ومساحة العمل',
      icon: LayoutDashboard,
    },
    {
      id: 'studio',
      label: 'استوديو تنسيق الاختبارات',
      sub: 'تحرير يدوي • معاينة • طباعة A4',
      icon: Layout,
      highlight: !hasAIAccess,
    },
    {
      id: 'library',
      label: hasAIAccess ? 'مكتبة الاختبارات' : 'مكتبتي الخاصة للاختبارات',
      sub: 'قصيرة • شهرية • فصلية • نهائية',
      icon: Library,
    },
    {
      id: 'question-bank',
      label: hasAIAccess ? 'بنك الأسئلة المركزي' : 'بنك أسئلتي الخاص',
      sub: 'إدارة وتصنيف أسئلتك حسب المادة',
      icon: Database,
    },
    {
      id: 'archive',
      label: 'الأرشيف والسجل التاريخي',
      sub: 'استعراض واسترجاع النماذج السابقة',
      icon: FolderArchive,
    },
    {
      id: 'notifications',
      label: 'الإشعارات والتنبيهات',
      sub: 'إشعارات الحساب والمشاركات',
      icon: Bell,
      badge: unreadNotificationsCount > 0 ? unreadNotificationsCount : undefined,
    },
    ...(canSeeEnglishCurricula
      ? [
          {
            id: 'curricula',
            label: 'مناهج اللغة الإنجليزية',
            sub: 'الصفوف السابع • الثامن • التاسع',
            icon: BookOpen,
          },
        ]
      : []),
    ...(hasAIAccess
      ? [
          {
            id: 'generator',
            label: 'مولد الاختبارات بالذكاء الاصطناعي',
            sub: 'ميزة حصرية لمالك المنصة (أبوحسام)',
            icon: Sparkles,
            highlight: true,
          },
          {
            id: 'vision',
            label: 'تحليل الصور والمحتوى (OCR)',
            sub: 'استخراج القواعد والأسئلة من الصور',
            icon: Camera,
            highlight: true,
          },
          {
            id: 'ai-settings',
            label: 'إعدادات وتشخيص الذكاء الاصطناعي',
            sub: 'نماذج Gemini • فحص الاتصال',
            icon: Sliders,
          },
        ]
      : []),
    ...(isPlatformOwner
      ? [
          {
            id: 'owner-control-center',
            label: 'مركز التحكم والمراقبة',
            sub: 'سجل التدقيق • الأمان • النشاط',
            icon: ShieldCheck,
            highlight: true,
          },
          {
            id: 'registration-requests',
            label: 'طلبات التسجيل والموافقات',
            sub: 'اعتماد ورفض الحسابات الجديدة',
            icon: UserCheck,
            badge: pendingRegistrationsCount > 0 ? pendingRegistrationsCount : undefined,
          },
        ]
      : []),
    ...(isAdmin
      ? [
          {
            id: 'users',
            label: 'إدارة المعلمين والصلاحيات',
            sub: 'الحسابات وتوزيع المواد والصفوف',
            icon: Users,
          },
          {
            id: 'subjects',
            label: 'إدارة المواد الدراسية',
            sub: 'إضافة وتعديل وتفعيل المواد',
            icon: BookMarked,
          },
          {
            id: 'school-identity',
            label: 'الهوية الرسمية والترويسة',
            sub: 'شعار المدرسة وقوالب الطباعة',
            icon: Palette,
          },
        ]
      : []),
    ...(isPlatformOwner
      ? [
          {
            id: 'backup',
            label: 'النسخ الاحتياطي والأمان',
            sub: 'حفظ واسترجاع قاعدة البيانات',
            icon: HardDriveDownload,
          },
        ]
      : []),
  ];

  const handleItemClick = (id: string) => {
    onNavigate(id);
    onCloseMobile();
  };

  const navContent = (
    <div className="flex flex-col justify-between h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Mobile Drawer Header */}
        <div className="lg:hidden flex items-center justify-between pb-3 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <img
              src={schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg'}
              alt="شعار المدرسة"
              className="w-8 h-8 rounded-lg object-contain border border-emerald-200"
            />
            <span className="text-sm font-extrabold text-[#1B5E3A]">
              {schoolIdentity?.schoolNameAr || 'مدرسة قفلة'}
            </span>
          </div>
          <button
            onClick={onCloseMobile}
            className="p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 touch-target-min"
            aria-label="إغلاق القائمة"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* School Identity Card */}
        <div className="bg-emerald-50/70 border border-emerald-200 rounded-xl p-3">
          <div className="text-xs font-extrabold text-[#1B5E3A] mb-0.5">
            {schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'}
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            {hasAIAccess
              ? 'وضع مالك المنصة: وصول كامل لجميع المواد وأدوات الذكاء الاصطناعي ومركز التحكم.'
              : 'مساحة عمل خاصة ومحمية لإعداد الاختبارات وتنسيقها وطباعتها.'}
          </p>
        </div>

        {/* Navigation Links */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              activeView === item.id || (item.id === 'studio' && activeView === 'editor');
            return (
              <button
                key={item.id}
                onClick={() => handleItemClick(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-right transition-all group touch-target-min ${
                  isActive
                    ? 'bg-[#1B5E3A] text-white font-bold shadow-sm'
                    : item.highlight
                    ? 'bg-emerald-50/80 text-[#1B5E3A] border border-emerald-200 hover:bg-emerald-100/70'
                    : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    isActive
                      ? 'bg-white/15 text-white'
                      : item.highlight
                      ? 'bg-[#1B5E3A]/10 text-[#1B5E3A]'
                      : 'bg-slate-100 text-slate-500 group-hover:text-[#1B5E3A]'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-xs sm:text-sm font-bold leading-tight truncate">{item.label}</span>
                    {item.badge !== undefined && (
                      <span
                        className={`text-[10px] font-mono font-extrabold px-1.5 py-0.5 rounded-full tabular-nums ${
                          isActive ? 'bg-amber-400 text-slate-950' : 'bg-[#1B5E3A] text-white'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <div
                    className={`text-[10px] truncate mt-0.5 ${
                      isActive ? 'text-emerald-100' : 'text-slate-500'
                    }`}
                  >
                    {item.sub}
                  </div>
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Signature */}
      <div className="p-4 border-t border-slate-200 bg-slate-50 text-center safe-area-bottom">
        <div className="flex items-center justify-center gap-1.5 text-xs text-[#1B5E3A] font-extrabold mb-1">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>نظام أبوحسام للاختبارات</span>
        </div>
        <p className="text-[11px] text-slate-600">
          {schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'} – اليمن
        </p>
      </div>
    </div>
  );

  return (
    <>
      <aside className="no-print hidden lg:flex w-72 bg-white text-slate-800 border-l border-slate-200 flex-col shrink-0 h-[calc(100vh-4rem)] sticky top-16 overflow-y-auto">
        {navContent}
      </aside>

      {isMobileOpen && (
        <div className="no-print lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <div className="relative w-80 max-w-[85vw] bg-white text-slate-800 shadow-2xl h-full z-50 flex flex-col">
            {navContent}
          </div>
        </div>
      )}
    </>
  );
};
