import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Exam } from '../../types/index.ts';
import {
  BASIC_GRADE_CATALOG,
  getGradeLabelAr,
  sortSubjectsCanonical,
} from '../../utils/schoolCatalog.ts';
import {
  Library,
  Search,
  Copy,
  Edit,
  Printer,
  Archive,
  CheckCircle,
  Sparkles,
  FileText,
  PlusCircle,
  Share2,
} from 'lucide-react';

interface ExamLibraryViewProps {
  onSelectExam: (exam: Exam) => void;
  onNavigate: (view: string) => void;
  onOpenManualWizard: () => void;
}

const CATEGORIES = [
  { id: '', label: 'جميع الأنواع' },
  { id: 'Quiz', label: 'اختبار قصير' },
  { id: 'Daily', label: 'يومي' },
  { id: 'Weekly', label: 'أسبوعي' },
  { id: 'Monthly', label: 'شهري' },
  { id: 'Midterm', label: 'منتصف الفصل' },
  { id: 'Final', label: 'نهائي' },
  { id: 'Diagnostic', label: 'تشخيصي' },
  { id: 'Remedial', label: 'علاجي' },
  { id: 'Practice', label: 'تدريبي' },
  { id: 'Revision', label: 'مراجعة' },
];

export const ExamLibraryView: React.FC<ExamLibraryViewProps> = ({
  onSelectExam,
  onNavigate,
  onOpenManualWizard,
}) => {
  const { user, hasAIAccess, subjects } = useAuth();
  const [exams, setExams] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadExams = async () => {
    try {
      setLoading(true);
      const list = await api.getExams();
      setExams(list);
    } catch (e) {
      console.error('Failed to load exams:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadExams();
  }, [user?.id]);

  const handleClone = async (examId: string) => {
    try {
      const res = await api.cloneExam(examId);
      if (res.success && res.exam) {
        await loadExams();
        onSelectExam(res.exam);
        onNavigate('editor');
      }
    } catch (e: any) {
      alert(e.message || 'فشل نسخ الاختبار');
    }
  };

  const handleArchive = async (examId: string) => {
    if (!confirm('هل تريد نقل هذا الاختبار إلى الأرشيف التاريخي؟')) return;
    try {
      await api.deleteExam(examId);
      await loadExams();
    } catch (e: any) {
      alert(e.message || 'فشل نقل الاختبار للأرشيف');
    }
  };

  const handleApprove = async (examId: string) => {
    try {
      await api.approveExam(examId);
      await loadExams();
    } catch (e: any) {
      alert(e.message || 'فشل اعتماد الاختبار');
    }
  };

  const filteredExams = exams.filter((e) => {
    if (selectedCategory && e.category !== selectedCategory) return false;
    if (selectedSubject && (e.subjectId || 'subj-en') !== selectedSubject) return false;
    if (selectedGrade && e.grade !== selectedGrade) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const subjLabel =
        subjects.find((s) => s.id === e.subjectId)?.nameAr || e.headerConfig?.subject || '';
      return (
        e.title.toLowerCase().includes(q) ||
        (e.titleAr && e.titleAr.toLowerCase().includes(q)) ||
        e.code.toLowerCase().includes(q) ||
        subjLabel.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Library className="w-6 h-6 text-[#1B5E3A]" />
            <span>
              {hasAIAccess ? 'مكتبة الاختبارات المدرسية – مدرسة قفلة' : 'مكتبتي الخاصة للاختبارات'}
            </span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {hasAIAccess
              ? 'إدارة جميع النماذج، النسخ، الاعتماد، والتصدير للطلاب والمعلمين'
              : 'مكتبتك المعزولة لاختباراتك الخاصة والاختبارات المشاركة معك'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenManualWizard}
            className="px-4 py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-2 touch-target-min"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إنشاء اختبار جديد يدوياً</span>
          </button>

          {hasAIAccess && (
            <button
              onClick={() => onNavigate('generator')}
              className="px-4 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-extrabold rounded-xl shadow-sm transition-all flex items-center gap-2 touch-target-min"
            >
              <Sparkles className="w-4 h-4" />
              <span>توليد بالذكاء الاصطناعي</span>
            </button>
          )}
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                selectedCategory === cat.id
                  ? 'bg-[#1B5E3A] text-white shadow-xs'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <select
            value={selectedSubject}
            onChange={(e) => setSelectedSubject(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
          >
            <option value="">جميع المواد الدراسية</option>
            {sortSubjectsCanonical(subjects.filter((s) => s.isActive)).map((s) => (
              <option key={s.id} value={s.id}>
                {s.nameAr} ({s.nameEn})
              </option>
            ))}
          </select>

          <select
            value={selectedGrade}
            onChange={(e) => setSelectedGrade(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
          >
            <option value="">جميع الصفوف الدراسية</option>
            {BASIC_GRADE_CATALOG.map((g) => (
              <option key={g.value} value={g.value}>
                {g.labelAr} ({g.labelEn})
              </option>
            ))}
          </select>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ابحث بالرمز أو العنوان أو المادة..."
              className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
          </div>
        </div>
      </div>

      {/* Exams Grid */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-[#1B5E3A] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-2">جاري استعراض الاختبارات...</p>
        </div>
      ) : filteredExams.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredExams.map((exam) => {
            const isSharedWithMe =
              (exam.ownerId || exam.createdBy) !== user?.id &&
              exam.sharedWith?.some((s) => s.userId === user?.id);
            return (
              <div
                key={exam.id}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:border-[#1B5E3A]/60 transition-all space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-600">{exam.code}</span>
                      <span className="text-slate-300">·</span>
                      <span className="font-extrabold text-[#1B5E3A]">
                        {subjects.find((s) => s.id === exam.subjectId)?.nameAr ||
                          exam.headerConfig?.subject ||
                          'مادة دراسية'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {isSharedWithMe && (
                        <span className="text-[10px] font-bold text-blue-700 flex items-center gap-1">
                          <Share2 className="w-3 h-3" />
                          <span>مشارك معك</span>
                        </span>
                      )}
                      <span className="text-xs font-bold text-slate-700">{getGradeLabelAr(exam.grade)}</span>
                      <span
                        className={`text-[11px] font-bold ${
                          exam.status === 'Approved' ? 'text-emerald-700' : 'text-amber-700'
                        }`}
                      >
                        {exam.status === 'Approved' ? 'معتمد' : 'مسودة'}
                      </span>
                    </div>
                  </div>

                  <h3 className="font-extrabold text-slate-900 text-base leading-snug">
                    {exam.titleAr || exam.title}
                  </h3>
                  {exam.title && exam.titleAr !== exam.title && (
                    <p className="text-xs text-slate-500 font-english italic">{exam.title}</p>
                  )}

                  <div className="grid grid-cols-3 gap-2 py-2 bg-slate-50 rounded-xl text-center text-xs text-slate-700">
                    <div>
                      <span className="text-[10px] text-slate-400 block">الدرجة الكلية</span>
                      <strong className="font-bold text-slate-900 tabular-nums">{exam.totalMarks} د.</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">الزمن</span>
                      <strong className="font-bold text-slate-900 tabular-nums">{exam.timeLimitMinutes} د</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">الأقسام</span>
                      <strong className="font-bold text-slate-900 tabular-nums">{exam.sections.length}</strong>
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => {
                        onSelectExam(exam);
                        onNavigate('editor');
                      }}
                      className="px-3 py-1.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      <span>فتح في الاستوديو</span>
                    </button>

                    <button
                      onClick={() => {
                        onSelectExam(exam);
                        onNavigate('editor');
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Printer className="w-3.5 h-3.5" />
                      <span>طباعة</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleClone(exam.id)}
                      className="p-1.5 text-slate-500 hover:text-[#1B5E3A] rounded-lg hover:bg-emerald-50 transition-colors"
                      title="استنساخ الاختبار"
                    >
                      <Copy className="w-4 h-4" />
                    </button>

                    {exam.status !== 'Approved' && (
                      <button
                        onClick={() => handleApprove(exam.id)}
                        className="p-1.5 text-emerald-600 hover:text-emerald-700 rounded-lg hover:bg-emerald-50 transition-colors"
                        title="اعتماد الاختبار"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                    )}

                    <button
                      onClick={() => handleArchive(exam.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                      title="نقل إلى الأرشيف"
                    >
                      <Archive className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 space-y-3">
          <FileText className="w-10 h-10 text-slate-300 mx-auto" />
          <p className="text-sm font-semibold text-slate-600">لا توجد اختبارات تطابق الفلاتر الحالية.</p>
          <button
            onClick={onOpenManualWizard}
            className="px-4 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white text-xs font-bold rounded-xl"
          >
            + إنشاء اختبار جديد
          </button>
        </div>
      )}
    </div>
  );
};
