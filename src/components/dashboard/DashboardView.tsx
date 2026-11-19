import React, { useState, useEffect, useRef, useCallback } from 'react';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Exam } from '../../types/index.ts';
import { getGradeLabelAr, sortSubjectsCanonical } from '../../utils/schoolCatalog.ts';
import {
  FileText,
  BookmarkCheck,
  Database,
  Sparkles,
  BookOpen,
  CheckCircle,
  ChevronLeft,
  Activity,
  Printer,
  Edit,
  PlusCircle,
  Layout,
  Lock,
  Layers,
  AlertTriangle,
  RefreshCw,
} from 'lucide-react';

interface DashboardViewProps {
  onNavigate: (view: string, param?: string) => void;
  onSelectExam: (exam: Exam) => void;
  onOpenManualWizard: () => void;
  onStartPracticeExam: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onNavigate,
  onSelectExam,
  onOpenManualWizard,
  onStartPracticeExam,
}) => {
  const { user, hasAIAccess, subjects, schoolIdentity } = useAuth();
  const [statsState, setStatsState] = useState<{ ownerId: string; data: any } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestSeqRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const activeUserIdRef = useRef<string | undefined>(user?.id);
  const mountedRef = useRef(true);

  activeUserIdRef.current = user?.id;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      abortControllerRef.current?.abort();
    };
  }, []);

  const loadData = useCallback(async (targetUserId?: string) => {
    const expectedUserId = targetUserId ?? activeUserIdRef.current;
    abortControllerRef.current?.abort();

    if (!expectedUserId) {
      if (mountedRef.current) {
        setStatsState(null);
        setLoadError(null);
        setLoading(false);
      }
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const reqId = ++requestSeqRef.current;

    if (mountedRef.current) {
      setLoading(true);
      setLoadError(null);
    }

    try {
      const data = await api.getDashboardStats(controller.signal);
      if (
        !mountedRef.current ||
        controller.signal.aborted ||
        reqId !== requestSeqRef.current ||
        activeUserIdRef.current !== expectedUserId
      ) {
        return;
      }
      setStatsState({ ownerId: expectedUserId, data });
      setLoadError(null);
    } catch (e: any) {
      if (
        e?.name === 'AbortError' ||
        controller.signal.aborted ||
        !mountedRef.current ||
        reqId !== requestSeqRef.current ||
        activeUserIdRef.current !== expectedUserId
      ) {
        return;
      }
      console.warn('Dashboard stats unavailable:', e?.message || e);
      setStatsState((prev) => (prev?.ownerId === expectedUserId ? prev : null));
      setLoadError(e?.message || 'تعذر تحميل بيانات لوحة التحكم من الخادم.');
    } finally {
      if (
        mountedRef.current &&
        !controller.signal.aborted &&
        reqId === requestSeqRef.current &&
        activeUserIdRef.current === expectedUserId
      ) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    abortControllerRef.current?.abort();
    requestSeqRef.current += 1;
    setStatsState(null);
    setLoadError(null);
    setLoading(Boolean(user?.id));
    loadData(user?.id);
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [user?.id, loadData]);

  const stats = statsState && statsState.ownerId === user?.id ? statsState.data : null;

  if (loading && !stats) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-[#1B5E3A] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 font-medium text-sm">
            جاري تحميل مساحة العمل الخاصة بك في مدرسة قفلة...
          </p>
        </div>
      </div>
    );
  }

  if (!stats && loadError) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="max-w-lg w-full bg-amber-50 border border-amber-300 rounded-2xl p-6 text-amber-950 space-y-4 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-extrabold">تعذر تحميل بيانات لوحة التحكم</h2>
              <p className="text-xs text-amber-900 leading-relaxed">{loadError}</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => loadData(user?.id)}
              disabled={loading}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-extrabold transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>إعادة المحاولة</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const gradeStats = stats?.gradeStats || {};
  const enabledSubjects = sortSubjectsCanonical(subjects.filter((s) => s.isActive));
  const showEnglishCurricula =
    hasAIAccess ||
    user?.assignedSubjects?.includes('all') ||
    user?.assignedSubjects?.includes('subj-en');

  return (
    <div className="space-y-6 sm:space-y-8 animate-in fade-in duration-300">
      {loadError && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-950">
          <div className="flex items-start gap-2.5 text-xs sm:text-sm font-bold">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <span>{loadError}</span>
          </div>
          <button
            type="button"
            onClick={() => loadData(user?.id)}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-extrabold transition-colors shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>إعادة المحاولة</span>
          </button>
        </div>
      )}
      {/* Official Qaflah School Hero Banner */}
      <div className="bg-[#1B5E3A] rounded-2xl p-4 sm:p-6 lg:p-8 text-white shadow-lg border border-[#144D2E]">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
          <div className="flex items-start gap-4">
            <div className="hidden sm:flex w-16 h-16 rounded-2xl bg-white p-1.5 shadow-md shrink-0 items-center justify-center overflow-hidden">
              <img
                src={schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg'}
                alt="شعار مدرسة قفلة"
                className="w-full h-full object-contain"
              />
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-emerald-100 font-semibold">
                <Lock className="w-3.5 h-3.5 text-emerald-200" />
                <span>
                  {hasAIAccess
                    ? 'لوحة مالك المنصة · أبوحسام · جميع الصلاحيات'
                    : `مساحة العمل الخاصة بك · ${user?.name || 'معلم'}`}
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-tight">
                {schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'}
              </h1>
              <p className="text-xs sm:text-sm text-emerald-50/90 max-w-2xl leading-relaxed">
                {hasAIAccess
                  ? 'منصة إعداد وإدارة الاختبارات المدرسية الشاملة — تدعم التوليد الذكي وتحليل الصور لمادة اللغة الإنجليزية، بالإضافة إلى استوديو التنسيق والطباعة الاحترافي لجميع المواد الدراسية.'
                  : 'استوديو إعداد وتنسيق وطباعة الاختبارات المدرسية بمساحة عمل خاصة ومحمية. صمّم اختباراتك لجميع المواد مع دعم الترويسة الرسمية والطباعة بمقاس A4.'}
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 w-full md:w-auto shrink-0">
            <button
              onClick={onOpenManualWizard}
              className="flex items-center justify-center gap-2 bg-white hover:bg-emerald-50 text-[#1B5E3A] px-5 py-3 rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all touch-target-min"
            >
              <PlusCircle className="w-4 h-4 shrink-0" />
              <span>إنشاء اختبار جديد (الاستوديو)</span>
            </button>

            {hasAIAccess ? (
              <button
                onClick={() => onNavigate('generator')}
                className="flex items-center justify-center gap-2 bg-amber-400 hover:bg-amber-300 text-slate-950 px-5 py-3 rounded-xl font-extrabold text-xs sm:text-sm shadow-md transition-all touch-target-min"
              >
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>توليد ذكي (AI)</span>
              </button>
            ) : (
              <button
                onClick={onStartPracticeExam}
                className="flex items-center justify-center gap-2 bg-[#144D2E] hover:bg-[#0f3c23] border border-emerald-400/30 text-white px-5 py-3 rounded-xl font-bold text-xs sm:text-sm transition-all touch-target-min"
              >
                <BookOpen className="w-4 h-4 shrink-0" />
                <span>تجربة اختبار نموذجي للتدريب</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary KPI Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {hasAIAccess ? 'إجمالي الاختبارات' : 'اختباراتي الخاصة'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-[#1B5E3A] flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-950 tabular-nums">
              {stats?.totalExams || 0}
            </span>
            <span className="text-xs text-slate-500">اختباراً</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center gap-2">
            <span>{stats?.savedExams || 0} معتمد</span>
            <span className="text-slate-300">·</span>
            <span>{stats?.draftExams || 0} مسودة</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">
              {hasAIAccess ? 'بنك الأسئلة المركزي' : 'بنك أسئلتي الخاص'}
            </span>
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Database className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-950 tabular-nums">
              {stats?.totalQuestions || 0}
            </span>
            <span className="text-xs text-slate-500">سؤالاً</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>14 نوعاً في الاستوديو</span>
            <button
              onClick={() => onNavigate('question-bank')}
              className="text-[#1B5E3A] font-bold hover:underline flex items-center gap-0.5"
            >
              <span>فتح</span>
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        </div>

        {hasAIAccess ? (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">محرك Gemini AI</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Sparkles className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-lg font-extrabold text-[#1B5E3A] flex items-center gap-1.5">
                <CheckCircle className="w-5 h-5" />
                <span>مفعل للمالك</span>
              </span>
            </div>
            <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
              <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                {stats?.aiModel || 'gemini-3.8-flash'}
              </span>
              <span className="text-slate-500">{stats?.aiRequestsCount || 0} عملية</span>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500">المواد الدراسية المتاحة</span>
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
            </div>
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-slate-950 tabular-nums">
                {enabledSubjects.length}
              </span>
              <span className="text-xs text-slate-500">مواد معتمدة</span>
            </div>
            <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
              <span>ترويسة موحدة وطباعة A4</span>
              <button
                onClick={onOpenManualWizard}
                className="text-[#1B5E3A] font-bold hover:underline flex items-center gap-0.5"
              >
                <span>ابدأ</span>
                <ChevronLeft className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الأرشيف والمحفوظات</span>
            <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
              <BookmarkCheck className="w-5 h-5" />
            </div>
          </div>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-950 tabular-nums">
              {stats?.archivedExams || 0}
            </span>
            <span className="text-xs text-slate-500">نموذجاً مؤرشفاً</span>
          </div>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>حفظ دائم وآمن</span>
            <button
              onClick={() => onNavigate('archive')}
              className="text-[#1B5E3A] font-bold hover:underline flex items-center gap-0.5"
            >
              <span>عرض</span>
              <ChevronLeft className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Multi-Subject Overview */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base sm:text-lg font-extrabold text-slate-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#1B5E3A]" />
            <span>المواد الدراسية في مدرسة قفلة</span>
          </h2>
          <button
            onClick={onOpenManualWizard}
            className="text-xs font-bold text-[#1B5E3A] hover:underline flex items-center gap-1"
          >
            <span>تصميم اختبار لمادة</span>
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {enabledSubjects.map((subj) => (
            <button
              key={subj.id}
              onClick={() => onNavigate('library')}
              className="bg-white hover:bg-emerald-50/40 rounded-xl p-4 border border-slate-200 hover:border-[#1B5E3A] text-right transition-all shadow-2xs"
            >
              <div className="text-sm font-extrabold text-slate-900">{subj.nameAr}</div>
              <div className="text-[11px] font-english text-slate-500 mt-0.5">{subj.nameEn}</div>
              <div className="text-[10px] text-[#1B5E3A] font-bold mt-2">
                {subj.defaultDirection === 'rtl' ? 'تنسيق عربي RTL' : 'تنسيق إنجليزي LTR'}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* English Curricula Grades Overview (For Owner or English Teachers) */}
      {showEnglishCurricula && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-extrabold text-slate-900">
              مناهج اللغة الإنجليزية (الصفوف 7 – 9)
            </h2>
            <button
              onClick={() => onNavigate('curricula')}
              className="text-xs font-bold text-[#1B5E3A] hover:underline flex items-center gap-1"
            >
              <span>استعراض الوحدات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { grade: 'Grade 7', ar: 'الصف السابع الأساسي', book: 'Crescent English Course 1' },
              { grade: 'Grade 8', ar: 'الصف الثامن الأساسي', book: 'Crescent English Course 2' },
              { grade: 'Grade 9', ar: 'الصف التاسع الأساسي', book: 'Crescent English Course 3' },
            ].map((item) => (
              <div
                key={item.grade}
                className="bg-white rounded-2xl p-5 border border-slate-200 border-t-4 border-t-[#1B5E3A] shadow-xs"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-extrabold text-[#1B5E3A]">{item.grade}</span>
                  <span className="text-xs text-slate-500">{item.ar}</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm mb-3 font-english">{item.book}</h3>
                <div className="space-y-1.5 text-xs text-slate-600 mb-4">
                  <div className="flex justify-between">
                    <span>الوحدات الدراسية:</span>
                    <strong className="text-slate-900">{gradeStats[item.grade]?.unitsCount || 4}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>الأسئلة المتاحة:</span>
                    <strong className="text-slate-900">{gradeStats[item.grade]?.questionsCount || 0}</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>الاختبارات:</span>
                    <strong className="text-slate-900">{gradeStats[item.grade]?.examsCount || 0}</strong>
                  </div>
                </div>
                <button
                  onClick={() => onNavigate('curricula', item.grade)}
                  className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-800 rounded-xl text-xs font-bold transition-colors"
                >
                  استعراض المنهج
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bottom Row: Recent Exams & Studio / AI Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#1B5E3A]" />
              <span>{hasAIAccess ? 'أحدث الاختبارات في المنصة' : 'أحدث اختباراتي'}</span>
            </h2>
            <button
              onClick={() => onNavigate('library')}
              className="text-xs font-bold text-[#1B5E3A] hover:underline flex items-center gap-1"
            >
              <span>كل الاختبارات</span>
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
          </div>

          {stats?.recentExams && stats.recentExams.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {stats.recentExams.map((exam: Exam) => (
                <div
                  key={exam.id}
                  className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 px-2 rounded-xl transition-colors"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold text-slate-900 truncate">
                        {exam.titleAr || exam.title}
                      </span>
                      <span className="text-[10px] font-bold text-[#1B5E3A]">
                        {subjects.find((s) => s.id === exam.subjectId)?.nameAr ||
                          exam.headerConfig?.subject ||
                          'مادة دراسية'}
                      </span>
                      <span className="text-[10px] text-slate-500 font-bold">{getGradeLabelAr(exam.grade)}</span>
                    </div>
                    <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                      <span>الدرجة: {exam.totalMarks} د.</span>
                      <span>الزمن: {exam.timeLimitMinutes} د</span>
                      <span>{exam.status === 'Approved' ? 'معتمد' : 'مسودة'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => {
                        onSelectExam(exam);
                        onNavigate('editor');
                      }}
                      className="p-2 text-slate-600 hover:text-[#1B5E3A] hover:bg-emerald-50 rounded-lg transition-colors"
                      title="فتح في استوديو التنسيق"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        onSelectExam(exam);
                        onNavigate('editor');
                      }}
                      className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors"
                      title="طباعة وتصدير PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 space-y-3">
              <FileText className="w-10 h-10 text-slate-300 mx-auto" />
              <p className="text-xs text-slate-500">لا توجد اختبارات في مساحتك الخاصة بعد.</p>
              <button
                onClick={onOpenManualWizard}
                className="text-xs bg-[#1B5E3A] hover:bg-[#144D2E] text-white font-bold px-4 py-2 rounded-xl transition-colors"
              >
                أنشئ أول اختبار لك الآن
              </button>
            </div>
          )}
        </div>

        {/* Right Side Card: AI Activity strictly for Owner OR Studio Quick Guide for Teachers */}
        {hasAIAccess ? (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-[#1B5E3A]" />
                <h2 className="text-base font-extrabold text-slate-900">نشاط الذكاء الاصطناعي</h2>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">النموذج النشط:</span>
                  <span className="font-mono font-bold text-slate-800">
                    {stats?.aiModel || 'gemini-3.8-flash'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">الصلاحية:</span>
                  <span className="font-bold text-[#1B5E3A]">حصري لمالك المنصة (أبوحسام)</span>
                </div>
              </div>

              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-700">آخر العمليات:</h4>
                {stats?.recentAIOperations && stats.recentAIOperations.length > 0 ? (
                  <div className="space-y-2 text-xs">
                    {stats.recentAIOperations.slice(0, 3).map((op: any) => (
                      <div
                        key={op.id}
                        className="p-2 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-between"
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-slate-800 truncate">{op.operation}</div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {op.promptSnippet?.substring(0, 32)}
                          </div>
                        </div>
                        <span className="text-[10px] font-mono text-[#1B5E3A] shrink-0">
                          {op.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[11px] text-slate-400">جاهز لاستقبال طلبات التوليد.</p>
                )}
              </div>
            </div>

            <button
              onClick={() => onNavigate('ai-settings')}
              className="mt-4 w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-600" />
              <span>فحص وتشخيص Gemini AI</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Layout className="w-5 h-5 text-[#1B5E3A]" />
                <h2 className="text-base font-extrabold text-slate-900">استوديو التنسيق والطباعة</h2>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                أعدّ اختباراتك يدوياً بسهولة تامة مع الترويسة الرسمية لمدرسة قفلة:
              </p>
              <ul className="space-y-2 text-xs text-slate-700">
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1B5E3A] shrink-0" />
                  <span>14 نوعاً من الأسئلة + جداول + صور + رموز علمية</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1B5E3A] shrink-0" />
                  <span>ملاءمة تلقائية لصفحة A4 واحدة دون قص أي سؤال</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1B5E3A] shrink-0" />
                  <span>فصل صارم بين ورقة الطالب ونموذج إجابة المعلم</span>
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1B5E3A] shrink-0" />
                  <span>خصوصية تامة لاختباراتك وأسئلتك</span>
                </li>
              </ul>
            </div>

            <div className="mt-4 space-y-2">
              <button
                onClick={onOpenManualWizard}
                className="w-full py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold transition-colors flex items-center justify-center gap-1.5 touch-target-min"
              >
                <PlusCircle className="w-4 h-4" />
                <span>إنشاء اختبار جديد الآن</span>
              </button>
              <button
                onClick={onStartPracticeExam}
                className="w-full py-2.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 touch-target-min"
              >
                <BookOpen className="w-4 h-4" />
                <span>تجربة اختبار نموذجي للتدريب</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
