import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { prepareQuestionImage } from '../../utils/questionImage.ts';
import {
  Exam,
  ExamCategory,
  ExamLayoutConfig,
  ExamLayoutPreset,
  Question,
  QuestionType,
} from '../../types/index.ts';
import { DEFAULT_LAYOUT_CONFIG, normalizeLayoutConfig } from '../editor/layoutDefaults.ts';
import { EASY_NINE_QUESTION_TYPES } from '../editor/EasyExamWorkspace.tsx';
import {
  formatCategoryForPaperLanguage,
  formatGradeForPaperLanguage,
  formatTermForPaperLanguage,
  resolveSubjectPaperProfile,
} from '../../utils/examLanguage.ts';
import {
  getAuthorizedGradesForUser,
  getAuthorizedSubjectsForUser,
} from '../../utils/schoolCatalog.ts';
import {
  X,
  FilePlus2,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Trash2,
  Eye,
  AlertTriangle,
  Plus,
  Image as ImageIcon,
} from 'lucide-react';

export { DEFAULT_LAYOUT_CONFIG };

interface ManualExamWizardModalProps {
  onClose: () => void;
  onCreated: (exam: Exam, initialMode?: 'edit' | 'preview') => void;
}

const PRIMARY_EXAM_TYPES: { id: ExamCategory; labelAr: string; labelEn: string }[] = [
  { id: 'Quiz', labelAr: 'اختبار قصير', labelEn: 'Short Quiz' },
  { id: 'Monthly', labelAr: 'اختبار شهري', labelEn: 'Monthly Exam' },
  { id: 'Midterm', labelAr: 'امتحان فصلي', labelEn: 'Midterm Exam' },
  { id: 'Final', labelAr: 'امتحان نهائي', labelEn: 'Final Exam' },
];

const ALL_EXAM_TYPES: { id: ExamCategory; labelAr: string; labelEn: string }[] = [
  ...PRIMARY_EXAM_TYPES,
  { id: 'Daily', labelAr: 'اختبار يومي', labelEn: 'Daily Quiz' },
  { id: 'Weekly', labelAr: 'اختبار أسبوعي', labelEn: 'Weekly Test' },
  { id: 'Diagnostic', labelAr: 'اختبار تشخيصي', labelEn: 'Diagnostic Test' },
  { id: 'Remedial', labelAr: 'اختبار علاجي', labelEn: 'Remedial Test' },
  { id: 'Practice', labelAr: 'اختبار تجريبي', labelEn: 'Practice Exam' },
];

function buildQuickQuestion(
  type: QuestionType,
  isEnglish: boolean,
  subjectId: string,
  grade: string,
  ownerId?: string
): Question {
  const dir: 'rtl' | 'ltr' = isEnglish ? 'ltr' : 'rtl';
  const base: Question = {
    id: `q-wiz-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    ownerId,
    subjectId,
    grade,
    unitId: 'manual',
    type,
    difficulty: 'Medium',
    marks: 2,
    questionText: '',
    modelAnswer: '',
    keepTogether: true,
    source: 'Teacher Manual',
    sourceCode: 'TEACHER_MANUAL',
    formatting: { dir, align: isEnglish ? 'left' : 'right' },
    createdAt: new Date().toISOString(),
  };

  switch (type) {
    case 'Multiple Choice':
      base.questionText = isEnglish ? 'Choose the correct answer:' : 'اختر الإجابة الصحيحة مما يلي:';
      base.options = isEnglish
        ? ['Option A', 'Option B', 'Option C', 'Option D']
        : ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث', 'الخيار الرابع'];
      base.modelAnswer = base.options[0];
      break;
    case 'True or False':
      base.questionText = isEnglish ? 'Mark True or False:' : 'ضع علامة (صح) أو (خطأ) أمام العبارة التالية:';
      base.options = isEnglish ? ['True', 'False'] : ['صح', 'خطأ'];
      base.modelAnswer = base.options[0];
      break;
    case 'Fill in the Blanks':
      base.questionText = isEnglish ? 'Complete the sentence with the correct word: __________' : 'أكمل الفراغ التالي بالكلمة المناسبة: __________';
      base.modelAnswer = isEnglish ? 'Answer' : 'الإجابة الصحيحة';
      break;
    case 'Short Answer':
      base.questionText = isEnglish ? 'Answer the following question concisely:' : 'أجب عن السؤال التالي بإيجاز:';
      base.answerSpaceLines = 2;
      base.modelAnswer = isEnglish ? 'Expected short answer' : 'الإجابة النموذجية المختصرة';
      break;
    case 'Matching':
      base.questionText = isEnglish ? 'Match Column (A) with Column (B):' : 'صل بين العمود (أ) وما يناسبه في العمود (ب):';
      base.matchingPairs = [
        { left: isEnglish ? 'Item 1' : 'العنصر 1', right: isEnglish ? 'Match 1' : 'المقابل 1' },
        { left: isEnglish ? 'Item 2' : 'العنصر 2', right: isEnglish ? 'Match 2' : 'المقابل 2' },
      ];
      base.modelAnswer = '1 -> 1, 2 -> 2';
      break;
    case 'Rearrange the Words':
      base.questionText = isEnglish ? 'Rearrange the following words to make a correct sentence:' : 'رتّب الكلمات التالية لتكوين جملة صحيحة:';
      base.scrambledWords = isEnglish ? ['school', 'every', 'goes', 'Ali', 'to', 'day'] : ['المدرسة', 'إلى', 'علي', 'يذهب'];
      base.answerSpaceLines = 1;
      base.modelAnswer = isEnglish ? 'Ali goes to school every day.' : 'يذهب علي إلى المدرسة.';
      break;
    case 'Term Definition':
      base.questionText = isEnglish ? 'Write the scientific term / definition for:' : 'اكتب المصطلح العلمي (أو التعريف) الدال على العبارة التالية:';
      base.answerSpaceLines = 1;
      base.modelAnswer = isEnglish ? 'Defined term' : 'المصطلح الصحيح';
      break;
    case 'Image Question':
      base.questionText = isEnglish ? 'Look at the picture below and answer the question:' : 'تأمل الصورة المرفقة ثم أجب عن السؤال:';
      base.imageCaption = isEnglish ? 'Figure (1)' : 'شكل توضيحي (1)';
      base.imageWidthPercent = 60;
      base.answerSpaceLines = 2;
      base.modelAnswer = isEnglish ? 'Answer based on figure' : 'الإجابة المعتمدة على الشكل';
      break;
    case 'Table Diagram':
      base.questionText = isEnglish ? 'Study the table below and fill in the missing entries:' : 'ادرس الجدول التالي ثم أكمل البيانات المطلوبة:';
      base.tableData = {
        headers: isEnglish ? ['Item', 'Description'] : ['البند', 'الوصف'],
        rows: [
          ['', ''],
          ['', ''],
        ],
      };
      base.modelAnswer = isEnglish ? 'Table completion' : 'البيانات المكتملة';
      break;
    default:
      base.questionText = isEnglish ? 'Write your question here:' : 'اكتب نص السؤال هنا:';
      base.answerSpaceLines = 2;
      break;
  }
  return base;
}

export const ManualExamWizardModal: React.FC<ManualExamWizardModalProps> = ({ onClose, onCreated }) => {
  const { user, subjects, schoolIdentity } = useAuth();

  const effectiveSubjects = getAuthorizedSubjectsForUser(subjects, user);
  const authorizedGrades = getAuthorizedGradesForUser(user);

  const defaultSubject = effectiveSubjects[0] || {
    id: 'subj-quran',
    code: 'QRN',
    nameAr: 'القرآن الكريم',
    nameEn: 'Quran',
    defaultDirection: 'rtl' as const,
  };

  const defaultGrade =
    authorizedGrades.find((g) => g.value === 'Grade 7')?.value ||
    authorizedGrades[0]?.value ||
    'Grade 1';

  const initialProfile = resolveSubjectPaperProfile(defaultSubject.id, effectiveSubjects);
  const todayStr = new Date().toISOString().slice(0, 10);

  const [step, setStep] = useState<1 | 2>(1);
  const [subjectId, setSubjectId] = useState(defaultSubject.id);
  const [category, setCategory] = useState<ExamCategory>('Monthly');
  const [grade, setGrade] = useState(defaultGrade);
  const [examTitle, setExamTitle] = useState(() =>
    initialProfile.paperLanguage === 'en'
      ? `${formatGradeForPaperLanguage(defaultGrade, 'en')} ${initialProfile.subjectNameEn} Monthly Exam`
      : `اختبار شهري - مادة ${initialProfile.subjectNameAr}`
  );
  const [titleManuallyEdited, setTitleManuallyEdited] = useState(false);
  const [examDate, setExamDate] = useState(todayStr);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(45);
  const [totalMarks, setTotalMarks] = useState(20);
  const [showTeacherName, setShowTeacherName] = useState(schoolIdentity?.defaultShowTeacherName ?? true);
  const [notes, setNotes] = useState(
    initialProfile.paperLanguage === 'en'
      ? 'Answer all questions clearly and legibly.'
      : 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'
  );
  const [layoutPreset, setLayoutPreset] = useState<ExamLayoutPreset>('AUTO');
  const [step2Questions, setStep2Questions] = useState<Question[]>([]);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSubject = effectiveSubjects.find((s) => s.id === subjectId) || defaultSubject;
  const profile = resolveSubjectPaperProfile(selectedSubject.id, effectiveSubjects);
  const isEnglishPaper = profile.paperLanguage === 'en';
  const paperDir = profile.dir;

  const suggestTitle = (subjId: string, nextCat: ExamCategory, nextGrade: string) => {
    const p = resolveSubjectPaperProfile(subjId, effectiveSubjects);
    const catLabel = formatCategoryForPaperLanguage(nextCat, p.paperLanguage);
    if (p.paperLanguage === 'en') {
      return `${formatGradeForPaperLanguage(nextGrade, 'en')} ${p.subjectNameEn} ${catLabel}`;
    }
    return `${catLabel} - مادة ${p.subjectNameAr}`;
  };

  const handleSelectSubject = (nextId: string) => {
    setSubjectId(nextId);
    const nextProfile = resolveSubjectPaperProfile(nextId, effectiveSubjects);
    const nextIsEn = nextProfile.paperLanguage === 'en';
    if (!titleManuallyEdited) {
      setExamTitle(suggestTitle(nextId, category, grade));
    } else if (nextIsEn && /^[\u0600-\u06FF\s-]+$/.test(examTitle)) {
      setExamTitle(suggestTitle(nextId, category, grade));
      setTitleManuallyEdited(false);
    } else if (!nextIsEn && !/[\u0600-\u06FF]/.test(examTitle)) {
      setExamTitle(suggestTitle(nextId, category, grade));
      setTitleManuallyEdited(false);
    }
    setNotes(
      nextIsEn
        ? 'Answer all questions clearly and legibly.'
        : nextProfile.isQuran
        ? 'اكتب الآيات الكريمة بالرسم والتشكيل الصحيح وبخط واضح.'
        : 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'
    );
    // Keep step2Questions formatting aligned with new subject direction if empty-edited
    setStep2Questions((prev) =>
      prev.map((q) => ({
        ...q,
        subjectId: nextId,
        formatting: {
          ...q.formatting,
          dir: nextProfile.dir,
          align: nextIsEn ? 'left' : 'right',
        },
      }))
    );
  };

  const handleSelectCategory = (nextCat: ExamCategory) => {
    setCategory(nextCat);
    if (!titleManuallyEdited) {
      setExamTitle(suggestTitle(subjectId, nextCat, grade));
    }
  };

  const handleSelectGrade = (nextGrade: string) => {
    setGrade(nextGrade);
    if (!titleManuallyEdited) {
      setExamTitle(suggestTitle(subjectId, category, nextGrade));
    }
  };

  const addQuestionInWizard = (type: QuestionType) => {
    const q = buildQuickQuestion(type, isEnglishPaper, selectedSubject.id, grade, user?.id);
    setStep2Questions((prev) => [...prev, q]);
  };

  const updateWizardQuestion = (qId: string, patch: Partial<Question>) => {
    setStep2Questions((prev) => prev.map((q) => (q.id === qId ? { ...q, ...patch } : q)));
  };

  const removeWizardQuestion = (qId: string) => {
    setStep2Questions((prev) => prev.filter((q) => q.id !== qId));
  };

  const handleWizardImageUpload = async (qId: string, file: File) => {
    try {
      const imageDataUrl = await prepareQuestionImage(file);
      updateWizardQuestion(qId, { imageDataUrl, imageWidthPercent: 60, keepTogether: true });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر رفع الصورة.');
    }
  };

  const step2MarksSum = step2Questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
  const hasMarksDiff = step2Questions.length > 0 && step2MarksSum !== (Number(totalMarks) || 0);

  const handleCreate = async (openMode: 'edit' | 'preview' = 'edit') => {
    const trimmedTitle = examTitle.trim();
    if (!trimmedTitle) {
      setErrorMsg('يرجى إدخال عنوان الاختبار قبل المتابعة');
      setStep(1);
      return;
    }

    setErrorMsg(null);
    const catLabel = formatCategoryForPaperLanguage(category, profile.paperLanguage);
    const defaultTerm = formatTermForPaperLanguage(
      schoolIdentity?.defaultTerm || 'الفصل الدراسي الأول',
      profile.paperLanguage
    );

    const layoutConfig: ExamLayoutConfig = normalizeLayoutConfig({
      ...DEFAULT_LAYOUT_CONFIG,
      preset: layoutPreset,
      paginationMode:
        layoutPreset === 'ONE_PAGE'
          ? 'one_page'
          : layoutPreset === 'TWO_PAGES'
          ? 'two_pages'
          : layoutPreset === 'MULTI_PAGE'
          ? 'multi_page'
          : 'auto',
      orientation: layoutPreset === 'A4_LANDSCAPE' ? 'landscape' : 'portrait',
      fontFamily: profile.fontFamily,
      globalDirection: profile.dir,
      globalAlign: isEnglishPaper ? 'left' : 'right',
      sectionNumbering: isEnglishPaper ? 'alpha' : 'numeric',
      headerCompact: layoutPreset === 'ONE_PAGE',
      marginTopMm: layoutPreset === 'ONE_PAGE' ? 8 : 12,
      marginBottomMm: layoutPreset === 'ONE_PAGE' ? 8 : 12,
      marginLeftMm: layoutPreset === 'ONE_PAGE' ? 10 : 12,
      marginRightMm: layoutPreset === 'ONE_PAGE' ? 10 : 12,
      fontSizePt: layoutPreset === 'ONE_PAGE' ? 10 : profile.isQuran ? 12 : 11,
      lineHeight: layoutPreset === 'ONE_PAGE' ? 1.3 : profile.isQuran ? 1.85 : 1.45,
      questionGapPx: layoutPreset === 'ONE_PAGE' ? 8 : 12,
      sectionGapPx: layoutPreset === 'ONE_PAGE' ? 12 : 18,
      logoSize: layoutPreset === 'ONE_PAGE' ? 'sm' : 'md',
    });

    const newExam: Partial<Exam> = {
      subjectId: selectedSubject.id,
      code: `${selectedSubject.code}-${Date.now().toString().slice(-4)}`,
      title: isEnglishPaper ? trimmedTitle : `${profile.subjectNameEn} ${formatCategoryForPaperLanguage(category, 'en')}`,
      titleAr: trimmedTitle,
      grade,
      term: defaultTerm,
      examDate,
      category,
      totalMarks: Number(totalMarks) || 20,
      timeLimitMinutes: Number(timeLimitMinutes) || 45,
      difficulty: 'Balanced',
      instructionsLanguage: profile.instructionsLanguage,
      headerConfig: {
        countryTitle: isEnglishPaper ? 'Republic of Yemen' : schoolIdentity?.countryTitleAr || 'الجمهورية اليمنية',
        ministryTitle: isEnglishPaper ? 'Ministry of Education' : schoolIdentity?.ministryTitleAr || 'وزارة التربية والتعليم',
        schoolName: isEnglishPaper ? 'QAFLAH SCHOOL' : schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي',
        schoolNameEn: schoolIdentity?.schoolNameEn || 'QAFLAH SCHOOL',
        subject: profile.subjectNameAr,
        subjectEn: profile.subjectNameEn,
        grade,
        term: defaultTerm,
        academicYear: schoolIdentity?.defaultAcademicYear || '2026 / 2027',
        examDate,
        examTypeLabel: catLabel,
        teacherName: user?.name || '',
        showTeacherName,
        timeLimit: isEnglishPaper ? `${timeLimitMinutes} Minutes` : `${timeLimitMinutes} دقيقة`,
        totalMarks: Number(totalMarks) || 20,
        showSchoolLogo: true,
        headerLanguage: profile.paperLanguage,
        headerCompact: layoutPreset === 'ONE_PAGE',
        notes,
      },
      layoutConfig,
      sections: [
        {
          id: `sec-${Date.now()}`,
          sectionTitle: isEnglishPaper
            ? 'Section A: Exam Questions'
            : profile.isQuran
            ? 'السؤال الأول: الحفظ والتسميع وإكمال الآيات الكريمة'
            : 'السؤال الأول: أجب عن الأسئلة التالية',
          instructions: isEnglishPaper
            ? 'Answer all questions clearly:'
            : profile.isQuran
            ? 'أكمل الآيات الكريمة التالية واضبطها بالشكل الصحيح:'
            : 'أجب عن الأسئلة التالية بوضوح:',
          questionType: step2Questions[0]?.type || (profile.isQuran ? 'Quran Verse Completion' : 'Multiple Choice'),
          marks: step2MarksSum,
          questions: step2Questions,
        },
      ],
      status: 'Draft',
      notes,
    };

    try {
      setCreating(true);
      const res = await api.saveExam(newExam);
      if (res.success && res.exam) {
        onCreated(res.exam, openMode);
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'تعذر إنشاء الاختبار الجديد');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-2.5 sm:p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-3xl w-full p-4 sm:p-6 shadow-2xl space-y-4 my-4 max-h-[94vh] overflow-y-auto" dir="rtl">
        {/* Header & Guided Progress Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#1B5E3A] text-white flex items-center justify-center shrink-0">
              <FilePlus2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">إنشاء اختبار جديد بسهولة</h2>
              <p className="text-[11px] text-slate-500">
                اختر المادة والصف لتُضبط لغة الورقة والترويسة تلقائياً، ثم أضف أسئلتك في خطوات واضحة
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 rounded-xl touch-target-min"
            aria-label="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 3-Step Visual Journey */}
        <div className="grid grid-cols-3 gap-2 text-xs">
          <button
            type="button"
            onClick={() => setStep(1)}
            className={`px-3 py-2.5 rounded-xl border font-bold text-center transition-all ${
              step === 1
                ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                : 'bg-emerald-50 text-[#1B5E3A] border-emerald-200'
            }`}
          >
            1. بيانات الاختبار
          </button>
          <button
            type="button"
            onClick={() => setStep(2)}
            className={`px-3 py-2.5 rounded-xl border font-bold text-center transition-all ${
              step === 2
                ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            2. إضافة الأسئلة ({step2Questions.length})
          </button>
          <div className="px-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 font-bold text-center">
            3. معاينة وحفظ / PDF
          </div>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-800 font-bold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* ==================== STEP 1: EXAM BASICS ==================== */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Subject Cards (Auto Language & Direction) */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 block">
                1) اختر المادة الدراسية <span className="text-[11px] font-normal text-slate-500">(تُضبط لغة الاختبار والاتجاه تلقائياً)</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {effectiveSubjects.map((s) => {
                  const p = resolveSubjectPaperProfile(s.id, effectiveSubjects);
                  const isSelected = s.id === subjectId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => handleSelectSubject(s.id)}
                      className={`p-3 rounded-xl border text-right transition-all touch-target-min ${
                        isSelected
                          ? 'bg-emerald-50 border-[#1B5E3A] ring-2 ring-[#1B5E3A]/20'
                          : 'bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="text-xs font-extrabold text-slate-900">{s.nameAr}</div>
                      <div className="text-[10px] text-[#1B5E3A] font-bold mt-1">
                        {p.paperLanguage === 'en' ? 'ورقة إنجليزية (LTR)' : 'ورقة عربية (RTL)'}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Primary Exam Type Chips */}
            <div className="space-y-1.5">
              <label className="text-xs font-extrabold text-slate-800 block">2) نوع الاختبار</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {PRIMARY_EXAM_TYPES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handleSelectCategory(t.id)}
                    className={`py-2.5 px-3 rounded-xl border text-xs font-bold transition-all touch-target-min ${
                      category === t.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {t.labelAr}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2 pt-1 text-xs">
                <span className="text-slate-500">أو اختر نوعاً آخر:</span>
                <select
                  value={category}
                  onChange={(e) => handleSelectCategory(e.target.value as ExamCategory)}
                  className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold text-slate-800"
                >
                  {ALL_EXAM_TYPES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.labelAr}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Single Clean Title Field + Grade + Date + Time + Marks */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="sm:col-span-2">
                <label className="font-extrabold text-slate-800 block mb-1">
                  3) عنوان الاختبار ({isEnglishPaper ? 'يكتب بالإنجليزية تلقائياً لمادة اللغة الإنجليزية' : 'يكتب بالعربية'})
                </label>
                <input
                  type="text"
                  dir={paperDir}
                  value={examTitle}
                  onChange={(e) => {
                    setExamTitle(e.target.value);
                    setTitleManuallyEdited(true);
                  }}
                  placeholder={isEnglishPaper ? 'e.g. Grade 7 English Monthly Exam' : 'مثال: اختبار شهري - مادة العلوم'}
                  className={`w-full px-3 py-2.5 border border-slate-300 rounded-xl font-bold text-sm focus:border-[#1B5E3A] outline-none ${
                    isEnglishPaper ? 'font-english text-left' : ''
                  }`}
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-800 block mb-1">الصف الدراسي</label>
                <select
                  value={grade}
                  onChange={(e) => handleSelectGrade(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl bg-white font-bold"
                >
                  {authorizedGrades.map((g) => (
                    <option key={g.value} value={g.value}>
                      {isEnglishPaper ? `${g.labelEn} (${g.labelAr})` : g.labelArFull}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-extrabold text-slate-800 block mb-1">تاريخ الاختبار</label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => setExamDate(e.target.value)}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl font-mono font-bold"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-800 block mb-1">الزمن (بالدقائق)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={timeLimitMinutes}
                  onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-center font-extrabold"
                />
              </div>

              <div>
                <label className="font-extrabold text-slate-800 block mb-1">الدرجة الكلية للاختبار</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(Number(e.target.value))}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-xl text-center font-extrabold"
                />
              </div>

              <div className="sm:col-span-2 flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={showTeacherName}
                    onChange={(e) => setShowTeacherName(e.target.checked)}
                    className="w-4 h-4 accent-[#1B5E3A]"
                  />
                  <span>إظهار اسم المعلم/ـة في أسفل الورقة ({user?.name})</span>
                </label>

                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-bold">تخطيط الورقة:</span>
                  <select
                    value={layoutPreset}
                    onChange={(e) => setLayoutPreset(e.target.value as ExamLayoutPreset)}
                    className="px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="AUTO">توزيع تلقائي ذكي</option>
                    <option value="ONE_PAGE">صفحة واحدة A4</option>
                    <option value="TWO_PAGES">صفحتان A4</option>
                    <option value="A4_PORTRAIT">عمودي قياسي</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => handleCreate('edit')}
                disabled={creating}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl touch-target-min"
              >
                فتح الاستوديو مباشرة (الوضع السهل)
              </button>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl touch-target-min"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2.5 text-xs sm:text-sm font-extrabold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl flex items-center gap-2 shadow-sm touch-target-min"
                >
                  <span>التالي: إضافة الأسئلة</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ==================== STEP 2: VISUAL QUESTION CARDS & QUICK EDIT ==================== */}
        {step === 2 && (
          <div className="space-y-4">
            {/* Running Summary Bar */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-extrabold text-slate-900">{examTitle}</span>
                <span className="text-slate-400">·</span>
                <span className="font-bold text-[#1B5E3A]">{selectedSubject.nameAr}</span>
                <span className="text-slate-400">·</span>
                <span>{isEnglishPaper ? 'لغة إنجليزية (LTR)' : 'لغة عربية (RTL)'}</span>
              </div>
              <div className="flex items-center gap-2 tabular-nums">
                <span>
                  الأسئلة: <strong>{step2Questions.length}</strong>
                </span>
                <span>·</span>
                <span className={hasMarksDiff ? 'text-amber-700 font-extrabold' : 'text-[#1B5E3A] font-extrabold'}>
                  مجموع الدرجات: {step2MarksSum} / {totalMarks}
                </span>
                {hasMarksDiff && (
                  <button
                    type="button"
                    onClick={() => setTotalMarks(step2MarksSum)}
                    className="px-2 py-1 bg-amber-600 text-white rounded-lg text-[11px] font-bold"
                  >
                    ضبط الكلية إلى {step2MarksSum}
                  </button>
                )}
              </div>
            </div>

            {/* 9 Beginner Visual Question Cards */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-slate-900">
                اختر نوع السؤال لإضافته فوراً إلى اختبارك:
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {EASY_NINE_QUESTION_TYPES.map((item) => {
                  const Icon = item.Icon;
                  return (
                    <button
                      key={item.type}
                      type="button"
                      onClick={() => addQuestionInWizard(item.type)}
                      className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-emerald-50/60 hover:border-[#1B5E3A] text-right transition-all flex items-start gap-2.5 touch-target-min"
                    >
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 text-[#1B5E3A] flex items-center justify-center shrink-0">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 flex items-center gap-1">
                          <Plus className="w-3 h-3 text-[#1B5E3A] shrink-0" />
                          <span className="truncate">{item.titleAr}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 leading-snug mt-0.5">{item.hintAr}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Added Questions Quick Inline List */}
            {step2Questions.length > 0 && (
              <div className="space-y-2.5">
                <div className="text-xs font-extrabold text-slate-800">
                  الأسئلة المضافة ({step2Questions.length}) — عدّل النصوص والدرجات أو أكمل داخل الاستوديو:
                </div>
                {step2Questions.map((q, idx) => (
                  <div
                    key={q.id}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-[#1B5E3A]">
                        سؤال {idx + 1} · {EASY_NINE_QUESTION_TYPES.find((t) => t.type === q.type)?.titleAr || q.type}
                      </span>
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                          <span>الدرجة:</span>
                          <input
                            type="number"
                            min={0.5}
                            step={0.5}
                            value={q.marks}
                            onChange={(e) => updateWizardQuestion(q.id, { marks: Number(e.target.value) || 0 })}
                            className="w-16 px-2 py-1 border border-slate-200 rounded-lg text-center font-extrabold"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => removeWizardQuestion(q.id)}
                          className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg"
                          title="حذف السؤال"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={2}
                      dir={paperDir}
                      value={q.questionText}
                      onChange={(e) => updateWizardQuestion(q.id, { questionText: e.target.value })}
                      placeholder={isEnglishPaper ? 'Write the question text here...' : 'اكتب نص السؤال هنا...'}
                      className={`w-full px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold ${
                        isEnglishPaper ? 'font-english text-left' : ''
                      }`}
                    />

                    {/* Quick Options for MCQ */}
                    {q.type === 'Multiple Choice' && q.options && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5" dir={paperDir}>
                        {q.options.map((opt, oIdx) => (
                          <div key={oIdx} className="flex items-center gap-1.5">
                            <input
                              type="radio"
                              name={`wiz-ans-${q.id}`}
                              checked={q.modelAnswer === opt}
                              onChange={() => updateWizardQuestion(q.id, { modelAnswer: opt })}
                              title="تحديد كإجابة صحيحة"
                              className="accent-[#1B5E3A]"
                            />
                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const nextOpts = [...(q.options || [])];
                                const wasCorrect = q.modelAnswer === nextOpts[oIdx];
                                nextOpts[oIdx] = e.target.value;
                                updateWizardQuestion(q.id, {
                                  options: nextOpts,
                                  ...(wasCorrect ? { modelAnswer: e.target.value } : {}),
                                });
                              }}
                              className="flex-1 px-2 py-1.5 border border-slate-200 rounded-lg text-xs"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Optional image attachment for every question type */}
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5 touch-target-min">
                        <ImageIcon className="w-3.5 h-3.5 text-[#1B5E3A]" />
                        <span>{q.imageDataUrl ? 'تغيير صورة السؤال' : 'إرفاق صورة بالسؤال'}</span>
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleWizardImageUpload(q.id, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                      {q.imageDataUrl && (
                        <>
                          <span className="text-[11px] text-[#1B5E3A] font-bold">تم إرفاق الصورة ✓</span>
                          <button type="button" onClick={() => updateWizardQuestion(q.id, { imageDataUrl: undefined })} className="text-[11px] text-rose-600 font-bold">إزالة الصورة</button>
                        </>
                      )}
                    </div>
                    {q.imageDataUrl && (
                      <img src={q.imageDataUrl} alt={q.imageCaption || 'معاينة صورة السؤال'} className="mx-auto max-h-40 max-w-full rounded-lg border border-slate-200 object-contain" />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Step 2 Footer Actions */}
            <div className="flex flex-col sm:flex-row justify-between gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl flex items-center justify-center gap-1.5 touch-target-min"
              >
                <ArrowRight className="w-4 h-4" />
                <span>السابق: بيانات الاختبار</span>
              </button>
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {step2Questions.length > 0 && (
                  <button
                    type="button"
                    onClick={() => handleCreate('preview')}
                    disabled={creating}
                    className="px-4 py-2.5 text-xs font-extrabold border border-[#1B5E3A] text-[#1B5E3A] hover:bg-emerald-50 rounded-xl flex items-center justify-center gap-1.5 touch-target-min disabled:opacity-50"
                  >
                    <Eye className="w-4 h-4" />
                    <span>حفظ ومعاينة الورقة / PDF</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => handleCreate('edit')}
                  disabled={creating}
                  className="px-5 py-2.5 text-xs sm:text-sm font-extrabold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 touch-target-min"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{creating ? 'جاري الإنشاء...' : 'حفظ وفتح في المحرر السهل'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
