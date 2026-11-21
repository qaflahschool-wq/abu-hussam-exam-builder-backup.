import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Question,
  QuestionType,
  DifficultyLevel,
  GradeLevel,
  QuestionSourceCode,
  EducationalLevel,
} from '../../types/index.ts';
import {
  BASIC_GRADE_CATALOG,
  getAuthorizedGradesForUser,
  getAuthorizedSubjectsForUser,
  getGradeLabelAr,
  sortSubjectsCanonical,
} from '../../utils/schoolCatalog.ts';
import {
  Database,
  Plus,
  Sparkles,
  Search,
  Trash2,
  Edit,
  CheckCircle,
  BookOpen,
  FileCheck,
  Camera,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';

const QUESTION_TYPES: QuestionType[] = [
  'Multiple Choice',
  'True or False',
  'Fill in the Blanks',
  'Matching',
  'Short Answer',
  'Essay',
  'Quran Recitation',
  'Quran Verse Completion',
  'Quran Meaning',
  'Quran Tafsir',
  'Reading Comprehension',
  'Translation',
  'Rearrange the Words',
  'Complete the Sentences',
  'Mathematical Problem',
  'Table Diagram',
  'Image Question',
  'Custom',
  'Vocabulary',
  'Grammar',
  'Writing',
];

interface QuestionBankViewProps {
  initialGrade?: string;
  initialUnitId?: string;
}

export const QuestionBankView: React.FC<QuestionBankViewProps> = ({
  initialGrade = '',
}) => {
  const { user, hasAIAccess, subjects } = useAuth();
  const sortedActiveSubjects = sortSubjectsCanonical(subjects.filter((s) => s.isActive));
  const authorizedSubjects = getAuthorizedSubjectsForUser(subjects, user);
  const authorizedGrades = getAuthorizedGradesForUser(user);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [selectedSubject, setSelectedSubject] = useState<string>('');
  const [selectedGrade, setSelectedGrade] = useState<string>(initialGrade);
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('');
  const [selectedSourceCode, setSelectedSourceCode] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAiModal, setShowAiModal] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Partial<Question> | null>(null);

  // AI Quick Gen State (PlatformOwner Only)
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiGrade, setAiGrade] = useState<GradeLevel>('Grade 9');
  const [aiUnit, setAiUnit] = useState('Unit 1: People & Places in Yemen');
  const [aiType, setAiType] = useState<QuestionType>('Multiple Choice');
  const [aiDifficulty, setAiDifficulty] = useState<DifficultyLevel>('Medium');
  const [aiSourceCode, setAiSourceCode] = useState<QuestionSourceCode>('CURRICULUM');
  const [aiEducationalLevel, setAiEducationalLevel] = useState<EducationalLevel>('BASIC');
  const [aiMarks, setAiMarks] = useState(2);
  const [aiFocus, setAiFocus] = useState('');
  const [aiGeneratedQuestion, setAiGeneratedQuestion] = useState<Question | null>(null);
  const [aiModelUsed, setAiModelUsed] = useState<string>('');

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const qList = await api.getQuestions({
        subjectId: selectedSubject || undefined,
        grade: selectedGrade || undefined,
        type: selectedType || undefined,
        difficulty: selectedDifficulty || undefined,
        sourceCode: (selectedSourceCode as QuestionSourceCode) || undefined,
        search: searchQuery || undefined,
      });
      setQuestions(qList);
    } catch (e) {
      console.error('Failed to load questions:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
  }, [user?.id, selectedSubject, selectedGrade, selectedType, selectedDifficulty, selectedSourceCode, searchQuery]);

  const handleDelete = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا السؤال من بنك الأسئلة؟')) return;
    try {
      await api.deleteQuestion(id);
      await loadQuestions();
    } catch (e: any) {
      alert(e.message || 'فشل حذف السؤال');
    }
  };

  const handleSaveQuestion = async () => {
    if (!editingQuestion?.questionText || !editingQuestion?.modelAnswer || !editingQuestion?.grade) {
      alert('يرجى إكمال نص السؤال والصف والإجابة النموذجية');
      return;
    }

    const fallbackSubj = authorizedSubjects[0] || sortedActiveSubjects[0];
    const resolvedSubjId = editingQuestion.subjectId || fallbackSubj?.id || 'subj-quran';
    const subjObj = subjects.find((s) => s.id === resolvedSubjId);

    const isQuranQ =
      resolvedSubjId === 'subj-quran' ||
      String(editingQuestion.type || '').startsWith('Quran');

    try {
      const payload: Partial<Question> = {
        ...editingQuestion,
        subjectId: resolvedSubjId,
        subjectName: subjObj?.nameAr || editingQuestion.subjectName || fallbackSubj?.nameAr || 'القرآن الكريم',
        type: editingQuestion.type || 'Multiple Choice',
        difficulty: editingQuestion.difficulty || 'Medium',
        marks: Number(editingQuestion.marks) || 2,
        preserveDiacritics: isQuranQ ? true : editingQuestion.preserveDiacritics,
        source: editingQuestion.source || 'Teacher Manual',
      };

      if (editingQuestion.id) {
        await api.updateQuestion(editingQuestion.id, payload);
      } else {
        await api.addQuestion(payload as Question);
      }
      setShowAddModal(false);
      setEditingQuestion(null);
      await loadQuestions();
    } catch (e: any) {
      alert(e.message || 'فشل حفظ السؤال');
    }
  };

  const handleRunAiQuickGen = async () => {
    if (!hasAIAccess) return;
    try {
      setAiGenerating(true);
      setAiGeneratedQuestion(null);
      const res = await api.generateQuestionWithAI({
        grade: aiGrade,
        unitTitle: aiUnit,
        type: aiType,
        difficulty: aiDifficulty,
        marks: aiMarks,
        lessonFocus: aiFocus || undefined,
        sourceCode: aiSourceCode,
        educationalLevel: aiEducationalLevel,
      });

      if (res.success && res.question) {
        setAiGeneratedQuestion(res.question);
        setAiModelUsed(res.modelUsed);
      }
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء توليد السؤال بالذكاء الاصطناعي');
    } finally {
      setAiGenerating(false);
    }
  };

  const handleAcceptAiQuestion = async () => {
    if (!aiGeneratedQuestion) return;
    try {
      await api.addQuestion(aiGeneratedQuestion);
      setShowAiModal(false);
      setAiGeneratedQuestion(null);
      await loadQuestions();
      alert('تمت إضافة السؤال بنجاح إلى بنك الأسئلة!');
    } catch (e: any) {
      alert(e.message || 'فشل إضافة السؤال');
    }
  };

  const modalSubjectDir =
    subjects.find((s) => s.id === editingQuestion?.subjectId)?.defaultDirection || 'auto';

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <Database className="w-6 h-6 text-[#1B5E3A]" />
            <span>{hasAIAccess ? 'بنك الأسئلة المركزي – مدرسة قفلة' : 'بنك أسئلتي الخاص'}</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {hasAIAccess
              ? 'إدارة الأسئلة المعتمدة وتصنيفها حسب المادة والصف ومصادر المعرفة'
              : 'مكتبتك الخاصة والمحمية من الأسئلة لاستخدامها وإدراجها في اختباراتك يدوياً'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {hasAIAccess && (
            <button
              onClick={() => setShowAiModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl shadow-xs transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>توليد سؤال بالذكاء الاصطناعي</span>
            </button>
          )}

          <button
            onClick={() => {
              const defaultSubj = authorizedSubjects[0] || sortedActiveSubjects[0];
              const defaultGradeVal =
                authorizedGrades.find((g) => g.value === 'Grade 7')?.value ||
                authorizedGrades[0]?.value ||
                'Grade 1';
              setEditingQuestion({
                subjectId: defaultSubj?.id || 'subj-quran',
                subjectName: defaultSubj?.nameAr || 'القرآن الكريم',
                grade: defaultGradeVal as GradeLevel,
                type: 'Multiple Choice',
                difficulty: 'Medium',
                marks: 2,
                sourceCode: 'CURRICULUM',
                educationalLevel: 'BASIC',
                options: ['', '', '', ''],
                source: 'Teacher Manual',
              });
              setShowAddModal(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white font-bold text-xs rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة سؤال يدوياً</span>
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">المادة الدراسية</label>
            <select
              value={selectedSubject}
              onChange={(e) => setSelectedSubject(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              <option value="">جميع المواد</option>
              {sortedActiveSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nameAr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">الصف الدراسي</label>
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              <option value="">جميع الصفوف</option>
              {BASIC_GRADE_CATALOG.map((g) => (
                <option key={g.value} value={g.value}>
                  {g.labelAr} ({g.labelEn})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">نوع السؤال</label>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              <option value="">جميع الأنواع</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">الصعوبة</label>
            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              <option value="">الكل</option>
              <option value="Easy">Easy (سهل)</option>
              <option value="Medium">Medium (متوسط)</option>
              <option value="Hard">Hard (صعب)</option>
              <option value="Balanced">Balanced (متوازن)</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">مصدر السؤال</label>
            <select
              value={selectedSourceCode}
              onChange={(e) => setSelectedSourceCode(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold"
            >
              <option value="">جميع المصادر</option>
              <option value="CURRICULUM">المنهج المدرسي</option>
              <option value="ENRICHMENT">إثراء</option>
              {hasAIAccess && <option value="IMAGE_SOURCE">مستند مصور</option>}
              <option value="FOUNDATION">تأسيسي</option>
              <option value="APPLICATION">تطبيقي</option>
              <option value="CHALLENGE">تحدي وتفوق</option>
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-500 block mb-1">بحث بالنص</label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-3" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ابحث..."
                className="w-full pl-3 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Questions List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-[#1B5E3A] border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-500 mt-2">جاري تحميل الأسئلة...</p>
        </div>
      ) : questions.length > 0 ? (
        <div className="space-y-3.5">
          <div className="text-xs text-slate-500 font-bold px-1">
            الأسئلة المعروضة: {questions.length}
          </div>

          {questions.map((q, idx) => (
            <div
              key={q.id}
              className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 text-xs">
                <div className="flex flex-wrap items-center gap-2 text-slate-600">
                  <span className="font-mono font-bold text-slate-900">#{idx + 1}</span>
                  <span>·</span>
                  <span className="font-bold text-[#1B5E3A]">
                    {q.subjectName ||
                      subjects.find((s) => s.id === q.subjectId)?.nameAr ||
                      'مادة دراسية'}
                  </span>
                  <span>·</span>
                  <span className="font-semibold">{getGradeLabelAr(q.grade)}</span>
                  <span>·</span>
                  <span>{q.type}</span>
                  <span>·</span>
                  <span className="font-bold text-slate-900 tabular-nums">{q.marks} د.</span>
                  <span>·</span>
                  <span>{q.difficulty}</span>
                  {q.sourceCode === 'IMAGE_SOURCE' && hasAIAccess && (
                    <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1">
                      <Camera className="w-3 h-3" />
                      مستند مصور
                    </span>
                  )}
                  {q.sourceFidelityScore !== undefined && hasAIAccess && (
                    <span className="text-[11px] font-mono text-emerald-700 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      {q.sourceFidelityScore}%
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs">
                  <button
                    onClick={() => {
                      setEditingQuestion(q);
                      setShowAddModal(true);
                    }}
                    className="p-1.5 text-slate-400 hover:text-[#1B5E3A] rounded-lg hover:bg-emerald-50 transition-colors"
                    title="تعديل"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(q.id)}
                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {hasAIAccess && q.requiresTeacherReview && q.teacherReviewReason && (
                <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-950 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <span>{q.teacherReviewReason}</span>
                </div>
              )}

              {q.passage && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs leading-relaxed text-slate-800" dir="auto">
                  <div className="font-bold text-[#1B5E3A] mb-1 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>نص القراءة:</span>
                  </div>
                  {q.passage}
                </div>
              )}

              {(q.surahName || q.ayahRange) && (
                <div className="text-xs font-bold text-[#1B5E3A] flex flex-wrap items-center gap-2">
                  {q.surahName && <span>{q.surahName}</span>}
                  {q.ayahRange && <span className="font-mono">({q.ayahRange})</span>}
                </div>
              )}

              <div
                className="text-slate-900 text-sm font-semibold leading-loose whitespace-pre-wrap"
                dir={q.subjectId === 'subj-quran' ? 'rtl' : 'auto'}
              >
                {q.questionText}
              </div>

              {q.options && q.options.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 pt-1" dir="auto">
                  {q.options.map((opt, oIdx) => (
                    <div
                      key={oIdx}
                      className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-2 ${
                        opt === q.modelAnswer
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                          : 'bg-slate-50 border-slate-200 text-slate-700'
                      }`}
                    >
                      <span className="font-bold">{String.fromCharCode(65 + oIdx)})</span>
                      <span>{opt}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-2.5 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs flex items-start gap-2 text-emerald-950" dir="auto">
                <CheckCircle className="w-4 h-4 text-[#1B5E3A] shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold">الإجابة النموذجية: </span>
                  <span className="font-semibold">{q.modelAnswer}</span>
                  {q.explanation && (
                    <p className="text-[11px] text-slate-600 mt-0.5">{q.explanation}</p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <Database className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">لا توجد أسئلة تطابق البحث الحالي.</p>
        </div>
      )}

      {/* Manual Add / Edit Question Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-2">
              {editingQuestion?.id ? 'تعديل السؤال' : 'إضافة سؤال جديد إلى بنك الأسئلة'}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">المادة الدراسية</label>
                <select
                  value={editingQuestion?.subjectId || authorizedSubjects[0]?.id || 'subj-quran'}
                  onChange={(e) => {
                    const subj = subjects.find((s) => s.id === e.target.value);
                    setEditingQuestion({
                      ...editingQuestion,
                      subjectId: e.target.value,
                      subjectName: subj?.nameAr || '',
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  {authorizedSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الصف الدراسي</label>
                <select
                  value={editingQuestion?.grade || authorizedGrades[0]?.value || 'Grade 1'}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, grade: e.target.value as GradeLevel })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  {authorizedGrades.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.labelArFull} ({g.labelEn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع السؤال</label>
                <select
                  value={editingQuestion?.type || 'Multiple Choice'}
                  onChange={(e) =>
                    setEditingQuestion({ ...editingQuestion, type: e.target.value as QuestionType })
                  }
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  {QUESTION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الصعوبة والدرجة</label>
                <div className="flex gap-1.5">
                  <select
                    value={editingQuestion?.difficulty || 'Medium'}
                    onChange={(e) =>
                      setEditingQuestion({
                        ...editingQuestion,
                        difficulty: e.target.value as DifficultyLevel,
                      })
                    }
                    className="w-1/2 px-2 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="Easy">سهل</option>
                    <option value="Medium">متوسط</option>
                    <option value="Hard">صعب</option>
                  </select>
                  <input
                    type="number"
                    min="0.5"
                    step="0.5"
                    max="30"
                    value={editingQuestion?.marks || 2}
                    onChange={(e) =>
                      setEditingQuestion({ ...editingQuestion, marks: Number(e.target.value) })
                    }
                    className="w-1/2 px-2 py-2 border border-slate-200 rounded-xl text-center"
                  />
                </div>
              </div>
            </div>

            {editingQuestion?.type === 'Reading Comprehension' && (
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">النص القرائي</label>
                <textarea
                  value={editingQuestion?.passage || ''}
                  onChange={(e) => setEditingQuestion({ ...editingQuestion, passage: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                  dir={modalSubjectDir}
                  placeholder="أدخل نص القراءة..."
                />
              </div>
            )}

            {(editingQuestion?.subjectId === 'subj-quran' ||
              String(editingQuestion?.type || '').startsWith('Quran')) && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2.5 text-xs">
                <div className="font-bold text-[#1B5E3A]">
                  وضع القرآن الكريم: يُحفظ النص القرآني والتشكيل (الفتحة، الكسرة، الضمة، الشدة، الرسم القرآني) حرفياً كما تكتبه دون أي تصحيح تلقائي.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">اسم السورة</label>
                    <input
                      type="text"
                      value={editingQuestion?.surahName || ''}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, surahName: e.target.value })}
                      placeholder="مثال: سورة لقمان"
                      spellCheck={false}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                      dir="rtl"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">رقم / نطاق الآيات</label>
                    <input
                      type="text"
                      value={editingQuestion?.ayahRange || ''}
                      onChange={(e) => setEditingQuestion({ ...editingQuestion, ayahRange: e.target.value })}
                      placeholder="مثال: الآيات (12 - 19)"
                      spellCheck={false}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg"
                      dir="rtl"
                    />
                  </div>
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">نص السؤال</label>
              <textarea
                value={editingQuestion?.questionText || ''}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, questionText: e.target.value })}
                rows={3}
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="off"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-medium leading-loose"
                dir={editingQuestion?.subjectId === 'subj-quran' ? 'rtl' : modalSubjectDir}
                placeholder="اكتب نص السؤال..."
              />
            </div>

            {editingQuestion?.type === 'Multiple Choice' && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">الخيارات</label>
                <div className="grid grid-cols-2 gap-2">
                  {[0, 1, 2, 3].map((idx) => (
                    <input
                      key={idx}
                      type="text"
                      value={editingQuestion.options?.[idx] || ''}
                      onChange={(e) => {
                        const newOpts = [...(editingQuestion.options || ['', '', '', ''])];
                        newOpts[idx] = e.target.value;
                        setEditingQuestion({ ...editingQuestion, options: newOpts });
                      }}
                      placeholder={`الخيار ${String.fromCharCode(65 + idx)}`}
                      className="px-3 py-1.5 border border-slate-200 rounded-xl text-xs"
                      dir={modalSubjectDir}
                    />
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">الإجابة النموذجية</label>
              <input
                type="text"
                value={editingQuestion?.modelAnswer || ''}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, modelAnswer: e.target.value })}
                placeholder="الإجابة الصحيحة..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-[#1B5E3A]"
                dir={modalSubjectDir}
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">ملاحظة التصحيح (اختياري)</label>
              <input
                type="text"
                value={editingQuestion?.explanation || ''}
                onChange={(e) => setEditingQuestion({ ...editingQuestion, explanation: e.target.value })}
                placeholder="توضيح أو توزيع درجات..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveQuestion}
                className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl"
              >
                حفظ في بنك الأسئلة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Quick Generator Modal — STRICTLY PLATFORM OWNER ONLY */}
      {hasAIAccess && showAiModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 my-8 border border-amber-300">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-slate-900">توليد سؤال فوري عبر Gemini AI</h3>
              </div>
              <span className="text-[11px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-bold">
                حصري لمالك المنصة
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الصف</label>
                <select
                  value={aiGrade}
                  onChange={(e) => setAiGrade(e.target.value as GradeLevel)}
                  className="w-full p-2 border rounded-xl font-semibold"
                >
                  {BASIC_GRADE_CATALOG.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.labelAr} ({g.labelEn})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع السؤال</label>
                <select
                  value={aiType}
                  onChange={(e) => setAiType(e.target.value as QuestionType)}
                  className="w-full p-2 border rounded-xl font-semibold"
                >
                  {QUESTION_TYPES.filter((t) => !String(t).startsWith('Quran')).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الوحدة / الموضوع</label>
                <input
                  type="text"
                  value={aiUnit}
                  onChange={(e) => setAiUnit(e.target.value)}
                  className="w-full p-2 border rounded-xl text-xs"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الصعوبة والدرجة</label>
                <div className="flex gap-2">
                  <select
                    value={aiDifficulty}
                    onChange={(e) => setAiDifficulty(e.target.value as DifficultyLevel)}
                    className="w-1/2 p-2 border rounded-xl text-xs"
                  >
                    <option value="Easy">Easy</option>
                    <option value="Medium">Medium</option>
                    <option value="Hard">Hard</option>
                  </select>
                  <input
                    type="number"
                    value={aiMarks}
                    onChange={(e) => setAiMarks(Number(e.target.value))}
                    className="w-1/2 p-2 border rounded-xl text-xs text-center"
                    min="1"
                    max="10"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">تصنيف المصدر</label>
                <select
                  value={aiSourceCode}
                  onChange={(e) => setAiSourceCode(e.target.value as QuestionSourceCode)}
                  className="w-full p-2 border rounded-xl bg-white"
                >
                  <option value="CURRICULUM">CURRICULUM</option>
                  <option value="ENRICHMENT">ENRICHMENT</option>
                  <option value="FOUNDATION">FOUNDATION</option>
                  <option value="APPLICATION">APPLICATION</option>
                  <option value="CHALLENGE">CHALLENGE</option>
                </select>
              </div>
              <div>
                <label className="font-bold text-slate-700 block mb-1">المستوى</label>
                <select
                  value={aiEducationalLevel}
                  onChange={(e) => setAiEducationalLevel(e.target.value as EducationalLevel)}
                  className="w-full p-2 border rounded-xl bg-white"
                >
                  <option value="BASIC">BASIC</option>
                  <option value="FOUNDATION">FOUNDATION</option>
                  <option value="INTERMEDIATE">INTERMEDIATE</option>
                  <option value="ADVANCED">ADVANCED</option>
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">تركيز الدرس (اختياري)</label>
              <input
                type="text"
                value={aiFocus}
                onChange={(e) => setAiFocus(e.target.value)}
                className="w-full p-2 border rounded-xl text-xs"
              />
            </div>

            <button
              onClick={handleRunAiQuickGen}
              disabled={aiGenerating}
              className="w-full py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-xl text-xs flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {aiGenerating ? 'جاري التوليد...' : 'توليد السؤال الآن'}
            </button>

            {aiGeneratedQuestion && (
              <div className="p-4 rounded-xl bg-slate-50 border border-amber-300 space-y-2 text-xs">
                <div className="flex justify-between text-slate-500">
                  <span className="font-bold">معاينة السؤال:</span>
                  <span className="font-mono">{aiModelUsed}</span>
                </div>
                <div className="font-english font-semibold text-slate-900">
                  {aiGeneratedQuestion.questionText}
                </div>
                <div className="p-2 bg-emerald-50 rounded font-english text-emerald-900 font-bold">
                  Answer: {aiGeneratedQuestion.modelAnswer}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => {
                  setShowAiModal(false);
                  setAiGeneratedQuestion(null);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إغلاق
              </button>
              {aiGeneratedQuestion && (
                <button
                  onClick={handleAcceptAiQuestion}
                  className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl flex items-center gap-1.5"
                >
                  <FileCheck className="w-4 h-4" />
                  <span>إضافة للبنك</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
