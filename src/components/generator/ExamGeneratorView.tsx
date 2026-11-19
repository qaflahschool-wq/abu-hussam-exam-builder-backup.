import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  GradeLevel,
  ExamCategory,
  DifficultyLevel,
  QuestionType,
  CurriculumUnit,
  Exam,
  QualityValidationReport,
  ContentScope,
  EducationalLevel,
  AnalyzedDocument,
} from '../../types/index.ts';
import {
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Clock,
  BookOpen,
  Sliders,
  Printer,
  Edit,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  ArrowRight,
  Layers,
  Camera,
  FileText,
} from 'lucide-react';

const QUESTION_TYPES: { type: QuestionType; labelAr: string; desc: string }[] = [
  { type: 'Reading Comprehension', labelAr: 'قطعة الفهم والاستيعاب', desc: 'نص قرائي متبوع بأسئلة مباشرة واستنتاجية' },
  { type: 'Multiple Choice', labelAr: 'اختيار من متعدد (MCQ)', desc: 'أربعة خيارات وإجابة صحيحة واحدة' },
  { type: 'True or False', labelAr: 'صح أو خطأ', desc: 'تحقق من صحة العبارات اللغوية والمفاهيم' },
  { type: 'Complete the Sentences', labelAr: 'إكمال الجمل', desc: 'إكمال الفراغات بكلمة أو عبارة مناسبة' },
  { type: 'Matching', labelAr: 'المزاوجة والتوصيل', desc: 'مزاوجة الكلمات بمرادفاتها أو معانيها' },
  { type: 'Fill in the Blanks', labelAr: 'ملء الفراغات', desc: 'اختيار الكلمة الصحيحة بين قوسين' },
  { type: 'Rearrange the Words', labelAr: 'إعادة ترتيب الكلمات', desc: 'ترتيب كلمات مبعثرة لتكوين جملة صحيحة' },
  { type: 'Vocabulary', labelAr: 'المفردات اللغوية', desc: 'التعرف على معاني الكلمات واستخداماتها' },
  { type: 'Grammar', labelAr: 'القواعد والتراكيب', desc: 'تطبيق القواعد والأزمنة والتحويل اللغوي' },
  { type: 'Translation', labelAr: 'الترجمة', desc: 'ترجمة جمل من الإنجليزية للعربية والعكس' },
  { type: 'Short Answer', labelAr: 'الإجابات القصيرة', desc: 'أسئلة مقالية تتطلب إجابة مباشرة' },
  { type: 'Writing', labelAr: 'التعبير والكتابة', desc: 'كتابة فقرة موجهة أو موضوع قصير' },
];

interface ExamGeneratorViewProps {
  onExamGenerated: (exam: Exam) => void;
  onOpenEditor: (exam: Exam) => void;
  initialImageContext?: string;
}

export const ExamGeneratorView: React.FC<ExamGeneratorViewProps> = ({
  onExamGenerated,
  onOpenEditor,
  initialImageContext,
}) => {
  // Wizard steps on mobile
  const [currentStep, setCurrentStep] = useState<number>(1); // 1: Academic, 2: Units, 3: Specs, 4: Question Types

  // Form State
  const [grade, setGrade] = useState<GradeLevel>('Grade 9');
  const [term, setTerm] = useState('First Term (الفصل الدراسي الأول)');
  const [category, setCategory] = useState<ExamCategory>('Midterm');
  const [contentScope, setContentScope] = useState<ContentScope>('CURRICULUM_ENRICHMENT');
  const [educationalLevel, setEducationalLevel] = useState<EducationalLevel>('INTERMEDIATE');
  const [totalQuestions, setTotalQuestions] = useState(8);
  const [totalMarks, setTotalMarks] = useState(20);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(60);
  const [difficulty, setDifficulty] = useState<DifficultyLevel>('Balanced');
  const [instructionsLanguage, setInstructionsLanguage] = useState<'Bilingual' | 'English' | 'Arabic'>('Bilingual');

  const [availableUnits, setAvailableUnits] = useState<CurriculumUnit[]>([]);
  const [selectedUnits, setSelectedUnits] = useState<string[]>([]);
  const [selectedQuestionTypes, setSelectedQuestionTypes] = useState<QuestionType[]>([
    'Reading Comprehension',
    'Multiple Choice',
    'Grammar',
    'Vocabulary',
    'Writing',
  ]);
  const [customInstructions, setCustomInstructions] = useState('');
  const [imageContextSnippet, setImageContextSnippet] = useState<string>(initialImageContext || '');
  const [savedDocuments, setSavedDocuments] = useState<AnalyzedDocument[]>([]);

  // Generation execution & results
  const [generating, setGenerating] = useState(false);
  const [generatedExam, setGeneratedExam] = useState<Exam | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('');
  const [qualityReport, setQualityReport] = useState<QualityValidationReport | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Load units whenever grade changes
  useEffect(() => {
    const fetchUnits = async () => {
      try {
        const units = await api.getCurricula(grade);
        setAvailableUnits(units);
        if (units.length > 0) {
          setSelectedUnits(units.slice(0, 3).map((u) => u.title));
        } else {
          setSelectedUnits([]);
        }
      } catch (e) {
        console.error('Failed to load units for grade:', e);
      }
    };
    fetchUnits();
  }, [grade]);

  // Load analyzed documents for context linking
  useEffect(() => {
    const fetchDocs = async () => {
      try {
        const docs = await api.getAnalyzedDocuments();
        setSavedDocuments(docs);
      } catch (e) {
        console.warn('Could not load analyzed docs', e);
      }
    };
    fetchDocs();
  }, []);

  useEffect(() => {
    if (initialImageContext) {
      setImageContextSnippet(initialImageContext);
      setContentScope('IMAGES_CURRICULUM');
    }
  }, [initialImageContext]);

  const toggleUnit = (title: string) => {
    if (selectedUnits.includes(title)) {
      setSelectedUnits(selectedUnits.filter((u) => u !== title));
    } else {
      setSelectedUnits([...selectedUnits, title]);
    }
  };

  const toggleQuestionType = (type: QuestionType) => {
    if (selectedQuestionTypes.includes(type)) {
      if (selectedQuestionTypes.length > 1) {
        setSelectedQuestionTypes(selectedQuestionTypes.filter((t) => t !== type));
      }
    } else {
      setSelectedQuestionTypes([...selectedQuestionTypes, type]);
    }
  };

  const handleGenerate = async () => {
    if (selectedUnits.length === 0 && contentScope !== 'IMAGES_ONLY') {
      alert('يرجى اختيار وحدة دراسية واحدة على الأقل من المنهج المعتمد.');
      return;
    }
    if (selectedQuestionTypes.length === 0) {
      alert('يرجى اختيار نوع سؤال واحد على الأقل.');
      return;
    }

    try {
      setGenerating(true);
      setErrorMessage(null);
      setGeneratedExam(null);
      setQualityReport(null);

      const res = await api.generateExamWithAI({
        grade,
        term,
        category,
        contentScope,
        educationalLevel,
        selectedUnits: selectedUnits.length > 0 ? selectedUnits : ['General'],
        totalQuestions,
        totalMarks,
        timeLimitMinutes,
        difficulty,
        instructionsLanguage,
        selectedQuestionTypes,
        customInstructions: customInstructions || undefined,
        imageContextSnippet: imageContextSnippet || undefined,
      });

      if (res.success && res.exam) {
        setGeneratedExam(res.exam);
        setModelUsed(res.modelUsed);
        setQualityReport(res.qualityReport);
        onExamGenerated(res.exam);
        // Scroll down to result on mobile
        setTimeout(() => {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }, 100);
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'حدث خطأ أثناء الاتصال بمحرك الذكاء الاصطناعي');
    } finally {
      setGenerating(false);
    }
  };

  const steps = [
    { num: 1, title: 'الصف والتصنيف' },
    { num: 2, title: 'الوحدات المقررة' },
    { num: 3, title: 'المعايير والزمن' },
    { num: 4, title: 'أنواع الأسئلة' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-24 lg:pb-8">
      {/* Title Hero */}
      <div className="bg-gradient-to-r from-[#0f2537] via-[#163653] to-[#1e3a5f] rounded-2xl p-4 sm:p-6 text-white border border-slate-700/80 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-1.5 sm:p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                <Sparkles className="w-5 h-5" />
              </span>
              <h1 className="text-base sm:text-xl font-extrabold">
                محرك إنشاء الاختبارات الذكي (AI Exam Generator)
              </h1>
            </div>
            <p className="text-xs text-slate-300">
              توليد ورقة اختبار نموذجية متكاملة لمدرسة قفلة وفق معايير المنهج اليمني المعتمد.
            </p>
          </div>
          <div className="flex items-center gap-2 text-[11px] sm:text-xs bg-slate-900/60 px-3 py-1.5 rounded-xl border border-slate-700 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span className="font-mono text-emerald-300 font-bold">Free Tier Guard Active</span>
          </div>
        </div>
      </div>

      {/* Mobile Step Progress Bar (< md) */}
      <div className="md:hidden bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between gap-1 mb-2">
          {steps.map((st) => (
            <button
              key={st.num}
              onClick={() => setCurrentStep(st.num)}
              className={`flex-1 py-1 text-center rounded-lg text-xs font-bold transition-all touch-target-min ${
                currentStep === st.num
                  ? 'bg-amber-500 text-slate-950 shadow-xs'
                  : currentStep > st.num
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-slate-50 text-slate-400'
              }`}
            >
              <div className="text-[10px] font-mono leading-none">خطوة {st.num}</div>
              <div className="truncate text-[11px]">{st.title}</div>
            </button>
          ))}
        </div>
        <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
          <div
            className="bg-amber-500 h-full transition-all duration-300"
            style={{ width: `${(currentStep / 4) * 100}%` }}
          />
        </div>
      </div>

      {/* Main Configuration Form */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-6">
        {/* Step 1: Academic Scope (Grade, Term, Category) */}
        <div className={`${currentStep === 1 ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-extrabold text-[#0f2537] flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-amber-500 shrink-0" />
              <span>1. تحديد الصف والفصل الدراسي وتصنيف الاختبار</span>
            </h2>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              خطوة 1 من 4
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">الصف الدراسي</label>
              <select
                value={grade}
                onChange={(e) => setGrade(e.target.value as GradeLevel)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-amber-500 touch-target-min"
              >
                <option value="Grade 7">Grade 7 - الصف السابع الأساسي</option>
                <option value="Grade 8">Grade 8 - الصف الثامن الأساسي</option>
                <option value="Grade 9">Grade 9 - الصف التاسع الأساسي</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">الفصل الدراسي</label>
              <select
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 touch-target-min"
              >
                <option value="First Term (الفصل الدراسي الأول)">الفصل الدراسي الأول</option>
                <option value="Second Term (الفصل الدراسي الثاني)">الفصل الدراسي الثاني</option>
                <option value="Midterm Exam (منتصف الفصل)">اختبار منتصف الفصل</option>
                <option value="Final Term Exam (نهاية الفصل)">اختبار نهاية الفصل</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">تصنيف الاختبار</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as ExamCategory)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 touch-target-min"
              >
                <option value="Midterm">اختبار نصفي (Midterm)</option>
                <option value="Monthly">اختبار شهري (Monthly Exam)</option>
                <option value="Final">اختبار نهائي (Final Exam)</option>
                <option value="Quiz">اختبار قصير (Quiz)</option>
                <option value="Revision">اختبار مراجعة (Revision)</option>
                <option value="Practice">اختبار تدريبي (Practice)</option>
              </select>
            </div>
          </div>

          {/* Multi-Source Knowledge Scope & Educational Level */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-3">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                نطاق مصادر المعرفة (Content Scope)
              </label>
              <select
                value={contentScope}
                onChange={(e) => setContentScope(e.target.value as ContentScope)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 touch-target-min"
              >
                <option value="CURRICULUM_ENRICHMENT">المنهج الحكومي + إثراء لغوي (الموصى به - الافتراضي)</option>
                <option value="CURRICULUM_ONLY">المنهج الحكومي فقط (Crescent English Course)</option>
                <option value="ENRICHMENT_ONLY">إثراء لغوي وقواعد متقدمة (Enrichment Only)</option>
                <option value="IMAGES_ONLY">من الصور والمستندات المرفقة فقط (Teacher Images)</option>
                <option value="IMAGES_CURRICULUM">الصور المرفقة + المنهج الدراسي</option>
                <option value="IMAGES_CURRICULUM_ENRICHMENT">شامل (الصور + المنهج + إثراء لغوي)</option>
                <option value="FOUNDATION_REMEDIAL">تأسيسي وعلاجي لمعالجة الضعف (Remedial)</option>
                <option value="BALANCED_COMPREHENSIVE">متوازن شامل لكافة المستويات (Balanced Mix)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">
                المستوى التعليمي الأساسي (Educational Level)
              </label>
              <select
                value={educationalLevel}
                onChange={(e) => setEducationalLevel(e.target.value as EducationalLevel)}
                className="w-full px-3.5 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:ring-2 focus:ring-amber-500 touch-target-min"
              >
                <option value="INTERMEDIATE">متوسط (Intermediate - المستوى المعتاد للاختبارات)</option>
                <option value="FOUNDATION">تأسيسي (Foundation - لمعالجة الفاقد التعليمي)</option>
                <option value="BASIC">أساسي (Basic - محتوى ومفردات الكتاب المدرسي)</option>
                <option value="ADVANCED">متقدم (Advanced - أسئلة تمييزية وتحدي)</option>
              </select>
            </div>
          </div>

          {/* Optional Attached Image Document Context */}
          <div className="pt-3">
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Camera className="w-3.5 h-3.5 text-amber-600" />
                <span>ربط محتوى من وثيقة محللة أو صور ملتقطة (اختياري)</span>
              </label>
              {savedDocuments.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] text-slate-500">اختر من المكتبة:</span>
                  <select
                    onChange={(e) => {
                      const doc = savedDocuments.find((d) => d.id === e.target.value);
                      if (doc) {
                        const snippet = `[وثيقة محللة: ${doc.title} - ${doc.grade}]\nالموضوع: ${doc.topic}\nالقواعد: ${(doc.analysis.grammarConcepts || []).map(g => g.concept).join(', ')}\nالمفردات: ${(doc.analysis.vocabulary || []).map(v => v.word).join(', ')}\nنص الوثيقة: ${doc.analysis.rawText?.substring(0, 400)}`;
                        setImageContextSnippet(snippet);
                        setContentScope('IMAGES_CURRICULUM');
                      }
                    }}
                    defaultValue=""
                    className="text-xs py-1 px-2 border border-slate-200 rounded-lg bg-slate-50 text-slate-700"
                  >
                    <option value="" disabled>-- حدد وثيقة محفوظة --</option>
                    {savedDocuments.map((d) => (
                      <option key={d.id} value={d.id}>{d.title} ({d.grade})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            {imageContextSnippet && (
              <div className="relative">
                <textarea
                  value={imageContextSnippet}
                  onChange={(e) => setImageContextSnippet(e.target.value)}
                  rows={3}
                  placeholder="مقتطفات من نصوص أو قواعد الصور المستخرجة..."
                  className="w-full text-xs p-2.5 rounded-xl border border-amber-200 bg-amber-50/50 font-mono focus:bg-white focus:outline-hidden"
                />
                <button
                  type="button"
                  onClick={() => setImageContextSnippet('')}
                  className="absolute left-2 bottom-2 text-[10px] text-red-600 hover:underline font-semibold"
                >
                  مسح المرفق
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Step 2: Units Selection from Curriculum */}
        <div className={`md:border-t md:border-slate-100 md:pt-5 ${currentStep === 2 ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-extrabold text-[#0f2537] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-500 shrink-0" />
              <span>2. اختيار الوحدات المقررة من المنهج اليمني ({grade})</span>
            </h2>
            <span className="text-xs text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded">
              {selectedUnits.length} وحدات مختارة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {availableUnits.map((unit) => {
              const isSelected = selectedUnits.includes(unit.title);
              return (
                <div
                  key={unit.id}
                  onClick={() => toggleUnit(unit.title)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 touch-target-min ${
                    isSelected
                      ? 'bg-amber-50 border-amber-400 text-amber-950 font-bold shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    className="mt-1 rounded text-amber-600 focus:ring-amber-500 shrink-0"
                  />
                  <div>
                    <div className="text-xs font-bold leading-tight">{unit.title}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{unit.titleAr}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 3: Exam Parameters (Marks, Questions, Time, Difficulty) */}
        <div className={`md:border-t md:border-slate-100 md:pt-5 ${currentStep === 3 ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-extrabold text-[#0f2537] flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500 shrink-0" />
              <span>3. معايير ومواصفات ورقة الاختبار</span>
            </h2>
            <span className="text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded">
              خطوة 3 من 4
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">الدرجة النهائية</label>
              <div className="relative">
                <input
                  type="number"
                  min="5"
                  max="100"
                  step="5"
                  value={totalMarks}
                  onChange={(e) => setTotalMarks(Number(e.target.value))}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center touch-target-min"
                />
                <span className="absolute left-2.5 top-3 text-[10px] text-slate-400">درجة</span>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">عدد الأسئلة</label>
              <input
                type="number"
                min="3"
                max="25"
                value={totalQuestions}
                onChange={(e) => setTotalQuestions(Number(e.target.value))}
                className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-center touch-target-min"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">زمن الاختبار</label>
              <select
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(Number(e.target.value))}
                className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-center touch-target-min"
              >
                <option value={30}>30 دقيقة</option>
                <option value={45}>45 دقيقة</option>
                <option value={60}>60 دقيقة</option>
                <option value={90}>90 دقيقة</option>
                <option value={120}>120 دقيقة</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">مستوى الصعوبة</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as DifficultyLevel)}
                className="w-full px-2 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold touch-target-min"
              >
                <option value="Balanced">متوازن (Balanced)</option>
                <option value="Easy">ميسر (Easy)</option>
                <option value="Medium">متوسط (Medium)</option>
                <option value="Hard">تمييزي (Hard)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Step 4: Question Types (12 Types) */}
        <div className={`md:border-t md:border-slate-100 md:pt-5 ${currentStep === 4 ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
            <h2 className="text-sm font-extrabold text-[#0f2537] flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-amber-500 shrink-0" />
              <span>4. أنواع الأسئلة المرغوبة (12 نوعاً معتمداً)</span>
            </h2>
            <span className="text-xs text-slate-500">
              {selectedQuestionTypes.length} من 12 نوعاً
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
            {QUESTION_TYPES.map((qt) => {
              const isChecked = selectedQuestionTypes.includes(qt.type);
              return (
                <div
                  key={qt.type}
                  onClick={() => toggleQuestionType(qt.type)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 touch-target-min ${
                    isChecked
                      ? 'bg-blue-50 border-blue-400 text-blue-950 font-bold shadow-xs'
                      : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => {}}
                    className="mt-1 rounded text-blue-600 focus:ring-blue-500 shrink-0"
                  />
                  <div>
                    <div className="text-xs font-bold leading-tight">{qt.type}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{qt.labelAr}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Teacher custom notes */}
          <div className="mt-4 pt-3 border-t border-slate-100">
            <label className="text-xs font-bold text-slate-700 block mb-1">
              ملاحظات وتوجيهات خاصة للمعلم (اختياري)
            </label>
            <textarea
              value={customInstructions}
              onChange={(e) => setCustomInstructions(e.target.value)}
              rows={2}
              placeholder="مثال: التركيز على أسئلة الأفعال الماضية الشاذة، أو تضمين تعبير عن مدينة صنعاء القديمة..."
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-amber-500"
            />
          </div>
        </div>

        {/* Mobile Step Navigation Buttons (< md) */}
        <div className="md:hidden flex items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {currentStep > 1 ? (
            <button
              onClick={() => setCurrentStep(currentStep - 1)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 touch-target-min"
            >
              <ChevronRight className="w-4 h-4" />
              <span>السابق</span>
            </button>
          ) : (
            <div />
          )}

          {currentStep < 4 ? (
            <button
              onClick={() => setCurrentStep(currentStep + 1)}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 touch-target-min"
            >
              <span>التالي</span>
              <ChevronLeft className="w-4 h-4" />
            </button>
          ) : (
            <div className="text-xs font-bold text-emerald-700">مكتمل، جاهز للتوليد!</div>
          )}
        </div>

        {/* Submit Action Button */}
        <div className="pt-2">
          {errorMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-4 bg-gradient-to-r from-amber-500 via-amber-600 to-amber-700 hover:from-amber-600 hover:to-amber-800 text-slate-950 font-extrabold text-sm rounded-xl shadow-lg shadow-amber-900/30 flex items-center justify-center gap-2.5 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 touch-target-min"
          >
            {generating ? (
              <>
                <div className="w-5 h-5 border-3 border-slate-950 border-t-transparent rounded-full animate-spin shrink-0" />
                <span>جاري إعداد الاختبار وفحص الجودة عبر الذكاء الاصطناعي...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 shrink-0" />
                <span>إنشاء وتوليد الاختبار الآن (AI Engine)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Generated Result & Quality Engine Card */}
      {generatedExam && (
        <div className="bg-white rounded-2xl border-2 border-emerald-400 p-4 sm:p-6 shadow-xl space-y-5 animate-in fade-in slide-in-from-bottom-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-lg bg-emerald-100 text-emerald-800">
                  <CheckCircle2 className="w-5 h-5" />
                </span>
                <h2 className="text-base sm:text-lg font-extrabold text-[#0f2537]">
                  تم إنشاء الاختبار بنجاح ({generatedExam.titleAr || generatedExam.title})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono bg-slate-100 px-2 py-0.5 rounded font-bold">
                  {generatedExam.code}
                </span>
                <span>الموديل: {modelUsed}</span>
                <span>الدرجة: {generatedExam.totalMarks} د.</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button
                onClick={() => onOpenEditor(generatedExam)}
                className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-colors touch-target-min"
              >
                <Edit className="w-4 h-4 text-amber-400 shrink-0" />
                <span>تعديل في المحرر</span>
              </button>
              <button
                onClick={() => onOpenEditor(generatedExam)}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-colors touch-target-min"
              >
                <Printer className="w-4 h-4 shrink-0" />
                <span>معاينة وطباعة A4</span>
              </button>
            </div>
          </div>

          {/* Quality Audit Summary */}
          {qualityReport && (
            <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="font-bold text-xs text-slate-800">
                    تقرير التحقق من الجودة (QA Audit):
                  </span>
                </div>
                <span className="text-xs font-extrabold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded-full">
                  نسبة التوافق: {qualityReport.score}%
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                {qualityReport.checks.map((check) => (
                  <div
                    key={check.id}
                    className="p-2 rounded-lg bg-white border border-slate-200 flex items-start gap-2"
                  >
                    <CheckCircle2
                      className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                        check.passed ? 'text-emerald-500' : 'text-amber-500'
                      }`}
                    />
                    <div>
                      <div className="font-bold text-slate-800 text-[11px]">{check.title}</div>
                      <div className="text-[10px] text-slate-500">{check.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
