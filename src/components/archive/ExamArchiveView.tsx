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
  FolderArchive,
  Search,
  RotateCcw,
  Eye,
} from 'lucide-react';

interface ExamArchiveViewProps {
  onSelectExam: (exam: Exam) => void;
  onNavigate: (view: string) => void;
}

export const ExamArchiveView: React.FC<ExamArchiveViewProps> = ({
  onSelectExam,
  onNavigate,
}) => {
  const { subjects } = useAuth();
  const [archive, setArchive] = useState<Exam[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedGrade, setSelectedGrade] = useState('');

  const loadArchive = async () => {
    try {
      setLoading(true);
      const list = await api.getArchive();
      setArchive(list);
    } catch (e) {
      console.error('Failed to load archive:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadArchive();
  }, []);

  const handleRestore = async (id: string) => {
    try {
      const res = await api.restoreExam(id);
      if (res.success) {
        alert('تمت استعادة الاختبار بنجاح إلى مكتبة الاختبارات النشطة.');
        await loadArchive();
      }
    } catch (e: any) {
      alert(e.message || 'فشل استرجاع الاختبار');
    }
  };

  const filteredArchive = archive.filter((e) => {
    if (selectedSubject && e.subjectId !== selectedSubject) return false;
    if (selectedGrade && e.grade !== selectedGrade) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const subjLabel = subjects.find((s) => s.id === e.subjectId)?.nameAr || e.headerConfig?.subject || '';
    return (
      e.title.toLowerCase().includes(q) ||
      (e.titleAr && e.titleAr.toLowerCase().includes(q)) ||
      e.code.toLowerCase().includes(q) ||
      e.grade.toLowerCase().includes(q) ||
      getGradeLabelAr(e.grade).toLowerCase().includes(q) ||
      subjLabel.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
            <FolderArchive className="w-6 h-6 text-amber-500" />
            <span>الأرشيف والسجل التاريخي للاختبارات (مدرسة قفلة)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            سجل دائم ومحفوظ لجميع الاختبارات السابقة ونماذج الإجابة لضمان التراكم المعرفي
          </p>
        </div>

        <div className="text-xs text-slate-500 bg-slate-50 px-3 py-2 rounded-xl border">
          إجمالي النماذج المؤرشفة: <strong className="text-slate-900">{archive.length}</strong>
        </div>
      </div>

      {/* Filters & Search Bar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs grid grid-cols-1 sm:grid-cols-3 gap-3">
        <select
          value={selectedSubject}
          onChange={(e) => setSelectedSubject(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="">جميع المواد الدراسية</option>
          {sortSubjectsCanonical(subjects.filter((s) => s.isActive)).map((s) => (
            <option key={s.id} value={s.id}>
              {s.nameAr}
            </option>
          ))}
        </select>

        <select
          value={selectedGrade}
          onChange={(e) => setSelectedGrade(e.target.value)}
          className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold"
        >
          <option value="">جميع الصفوف الدراسية</option>
          {BASIC_GRADE_CATALOG.map((g) => (
            <option key={g.value} value={g.value}>
              {g.labelAr} ({g.labelEn})
            </option>
          ))}
        </select>

        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ابحث في الأرشيف باسم الاختبار أو الصف أو الكود..."
            className="w-full pl-4 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
          />
        </div>
      </div>

      {/* Archive Items */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 mt-2">جاري استرجاع سجل الأرشيف...</p>
        </div>
      ) : filteredArchive.length > 0 ? (
        <div className="space-y-3">
          {filteredArchive.map((exam) => (
            <div
              key={exam.id}
              className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:border-slate-300 transition-colors"
            >
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold bg-slate-100 px-2 py-0.5 rounded text-slate-700">
                    {exam.code}
                  </span>
                  <span className="text-xs font-extrabold text-[#1B5E3A]">
                    {subjects.find((s) => s.id === exam.subjectId)?.nameAr ||
                      exam.headerConfig?.subject ||
                      'مادة دراسية'}
                  </span>
                  <span className="text-xs font-extrabold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-full">
                    {getGradeLabelAr(exam.grade)}
                  </span>
                  <span className="text-xs text-slate-500">{exam.term}</span>
                </div>
                <h3 className="font-bold text-slate-900 text-sm">{exam.titleAr || exam.title}</h3>
                <div className="flex items-center gap-4 text-xs text-slate-500 pt-1">
                  <span>الدرجة: {exam.totalMarks} د.</span>
                  <span>الزمن: {exam.timeLimitMinutes} دقيقة</span>
                  <span>الأسئلة: {exam.sections.flatMap((s) => s.questions).length}</span>
                  <span>تاريخ الأرشفة: {new Date(exam.updatedAt).toLocaleDateString('ar-YE')}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => {
                    onSelectExam(exam);
                    onNavigate('editor');
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>معاينة ورقة الاختبار</span>
                </button>

                <button
                  onClick={() => handleRestore(exam.id)}
                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  title="استرجاع الاختبار إلى المكتبة النشطة"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>استرجاع للمكتبة</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <FolderArchive className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">لا توجد اختبارات في الأرشيف حالياً.</p>
          <p className="text-xs text-slate-400 mt-1">الاختبارات التي يتم أرشفتها أو حذفها من المكتبة ستحفظ هنا دائماً.</p>
        </div>
      )}
    </div>
  );
};
