import React, { useState } from 'react';
import {
  Exam,
  ExamCategory,
  ExamHeaderConfig,
  ExamSection,
  Question,
  QuestionType,
  Subject,
} from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getAuthorizedGradesForUser,
  getAuthorizedSubjectsForUser,
  getGradeLabelAr,
} from '../../utils/schoolCatalog.ts';
import {
  CheckCircle2,
  CircleDot,
  ToggleLeft,
  TextCursorInput,
  MessageSquare,
  GitCompare,
  ArrowUpDown,
  BookMarked,
  Image as ImageIcon,
  Table as TableIcon,
  Plus,
  MoveUp,
  MoveDown,
  Copy,
  Trash2,
  Eye,
  Save,
  FileDown,
  ChevronDown,
  ChevronUp,
  Database,
  AlertTriangle,
  Sparkles,
  BookOpenCheck,
  FileText,
} from 'lucide-react';

export interface EasyQuestionCardDef {
  type: QuestionType;
  titleAr: string;
  titleEn: string;
  hintAr: string;
  Icon: React.FC<{ className?: string }>;
}

export const EASY_NINE_QUESTION_TYPES: EasyQuestionCardDef[] = [
  {
    type: 'Multiple Choice',
    titleAr: 'اختيار من متعدد',
    titleEn: 'Multiple Choice',
    hintAr: 'سؤال مع 4 اختيارات يختار الطالب أحدها',
    Icon: CircleDot,
  },
  {
    type: 'True or False',
    titleAr: 'صح أو خطأ',
    titleEn: 'True or False',
    hintAr: 'عبارة يحدد الطالب هل هي صحيحة أم خاطئة',
    Icon: ToggleLeft,
  },
  {
    type: 'Fill in the Blanks',
    titleAr: 'أكمل الفراغ',
    titleEn: 'Fill in the Blanks',
    hintAr: 'جملة ينقصها كلمة أو عبارة يكملها الطالب',
    Icon: TextCursorInput,
  },
  {
    type: 'Short Answer',
    titleAr: 'أجب عن السؤال',
    titleEn: 'Short Answer',
    hintAr: 'سؤال مباشر يكتب الطالب إجابته في أسطر مخصصة',
    Icon: MessageSquare,
  },
  {
    type: 'Matching',
    titleAr: 'صِل بين العمودين',
    titleEn: 'Matching',
    hintAr: 'قائمة (أ) وقائمة (ب) للمزاوجة والتوصيل',
    Icon: GitCompare,
  },
  {
    type: 'Rearrange the Words',
    titleAr: 'رتّب الكلمات أو الجمل',
    titleEn: 'Rearrange',
    hintAr: 'كلمات أو جمل مبعثرة يرتبها الطالب بشكل صحيح',
    Icon: ArrowUpDown,
  },
  {
    type: 'Term Definition',
    titleAr: 'اكتب المصطلح أو التعريف',
    titleEn: 'Term / Definition',
    hintAr: 'اكتب المصطلح العلمي أو عرّف المفهوم المحدد',
    Icon: BookMarked,
  },
  {
    type: 'Image Question',
    titleAr: 'سؤال يحتوي على صورة',
    titleEn: 'Question with Image',
    hintAr: 'أرفق صورة أو شكلاً توضيحياً وضع عليه سؤالاً',
    Icon: ImageIcon,
  },
  {
    type: 'Table Diagram',
    titleAr: 'سؤال يحتوي على جدول',
    titleEn: 'Question with Table',
    hintAr: 'أضف جدولاً مرتباً يقرأه الطالب أو يكمل بياناته',
    Icon: TableIcon,
  },
];

const EXAM_TYPE_LABELS: { id: ExamCategory; labelAr: string }[] = [
  { id: 'Quiz', labelAr: 'اختبار قصير' },
  { id: 'Monthly', labelAr: 'اختبار شهري' },
  { id: 'Midterm', labelAr: 'امتحان فصلي (منتصف الفصل)' },
  { id: 'Final', labelAr: 'امتحان نهائي' },
  { id: 'Practice', labelAr: 'اختبار تجريبي' },
  { id: 'Diagnostic', labelAr: 'اختبار تشخيصي' },
];

interface EasyExamWorkspaceProps {
  exam: Exam;
  headerConfig: ExamHeaderConfig;
  subjects: Subject[];
  targetSectionIdx: number;
  computedMarks: number;
  marksMismatch: boolean;
  isAnswerKeyView: boolean;
  isSaving: boolean;
  isExportingPdf: boolean;
  onSetTargetSection: (idx: number) => void;
  onSwitchSubject: (subjectId: string) => void;
  onUpdateExamMeta: (patch: Partial<Exam>) => void;
  onUpdateHeader: (patch: Partial<ExamHeaderConfig>) => void;
  onAddSection: () => void;
  onUpdateSectionTitle: (sIdx: number, val: string) => void;
  onUpdateSectionInstructions: (sIdx: number, val: string) => void;
  onDeleteSection: (sIdx: number) => void;
  onAddQuestion: (type: QuestionType, secIdx?: number) => void;
  onUpdateQuestion: (sIdx: number, qIdx: number, patch: Partial<Question>) => void;
  onMoveQuestion: (sIdx: number, qIdx: number, dir: 'up' | 'down') => void;
  onMoveQuestionToSection: (fromSIdx: number, qIdx: number, toSIdx: number) => void;
  onDuplicateQuestion: (sIdx: number, qIdx: number) => void;
  onDeleteQuestion: (sIdx: number, qIdx: number) => void;
  onUploadImage: (sIdx: number, qIdx: number, file: File) => void;
  onOpenBankImport: () => void;
  onPreviewPaper: () => void;
  onSaveExam: () => void;
  onExportPdf: () => void;
  onFixTotalMarks: () => void;
}

export const EasyExamWorkspace: React.FC<EasyExamWorkspaceProps> = ({
  exam,
  headerConfig,
  subjects,
  targetSectionIdx,
  computedMarks,
  marksMismatch,
  isSaving,
  isExportingPdf,
  onSetTargetSection,
  onSwitchSubject,
  onUpdateExamMeta,
  onUpdateHeader,
  onAddSection,
  onUpdateSectionTitle,
  onUpdateSectionInstructions,
  onDeleteSection,
  onAddQuestion,
  onUpdateQuestion,
  onMoveQuestion,
  onMoveQuestionToSection,
  onDuplicateQuestion,
  onDeleteQuestion,
  onUploadImage,
  onOpenBankImport,
  onPreviewPaper,
  onSaveExam,
  onExportPdf,
  onFixTotalMarks,
}) => {
  const { user } = useAuth();
  const [showMetaDetails, setShowMetaDetails] = useState(true);

  const activeSubjects = getAuthorizedSubjectsForUser(subjects, user);
  const authorizedGrades = getAuthorizedGradesForUser(user);
  const isEnglishPaper = exam.subjectId === 'subj-en' || headerConfig.headerLanguage === 'en';
  const isQuran = exam.subjectId === 'subj-quran';
  const paperDir: 'rtl' | 'ltr' = isEnglishPaper ? 'ltr' : 'rtl';

  const safeSectionIdx = Math.min(Math.max(0, targetSectionIdx), Math.max(0, exam.sections.length - 1));
  const totalQuestionsCount = exam.sections.reduce((sum, s) => sum + s.questions.length, 0);

  const scrollToAddQuestionCards = () => {
    const el = document.getElementById('easy-question-type-picker');
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const renderQuestionTypeSpecificFields = (sIdx: number, qIdx: number, q: Question) => {
    const qDir: 'rtl' | 'ltr' = q.formatting?.dir === 'ltr' || (isEnglishPaper && q.formatting?.dir !== 'rtl') ? 'ltr' : 'rtl';

    return (
      <div className="space-y-3">
        {/* Reading Passage if Reading Comprehension */}
        {(q.type === 'Reading Comprehension' || q.passage !== undefined) && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
            <label className="text-xs font-extrabold text-slate-800 block">
              نص القراءة (اختياري أو أساسي لقطعة الفهم):
            </label>
            <textarea
              dir={qDir}
              rows={3}
              value={q.passage || ''}
              onChange={(e) => onUpdateQuestion(sIdx, qIdx, { passage: e.target.value })}
              placeholder={
                isEnglishPaper
                  ? 'Write or paste the reading passage here...'
                  : 'اكتب أو الصق نص قطعة القراءة هنا ليقرأه الطالب قبل الإجابة...'
              }
              className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:border-[#1B5E3A] focus:outline-none"
            />
          </div>
        )}

        {/* Quran Surah / Ayah */}
        {(isQuran || String(q.type || '').startsWith('Quran')) && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl">
            <div>
              <label className="text-[11px] font-bold text-[#1B5E3A] block mb-1">اسم السورة</label>
              <input
                type="text"
                dir="rtl"
                value={q.surahName || ''}
                onChange={(e) => onUpdateQuestion(sIdx, qIdx, { surahName: e.target.value })}
                placeholder="مثال: سورة الملك"
                className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold min-h-[44px]"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-[#1B5E3A] block mb-1">نطاق الآيات</label>
              <input
                type="text"
                dir="rtl"
                value={q.ayahRange || ''}
                onChange={(e) => onUpdateQuestion(sIdx, qIdx, { ayahRange: e.target.value })}
                placeholder="مثال: الآيات (1 - 5)"
                className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold min-h-[44px]"
              />
            </div>
          </div>
        )}

        {/* Question Stem */}
        <div>
          <label className="text-xs font-extrabold text-slate-800 block mb-1">
            نص السؤال <span className="text-slate-400 font-normal">(اكتب السؤال هنا بوضوح للطالب)</span>
          </label>
          <textarea
            dir={qDir}
            rows={2}
            value={q.questionText}
            onChange={(e) => onUpdateQuestion(sIdx, qIdx, { questionText: e.target.value })}
            placeholder={
              q.type === 'Fill in the Blanks'
                ? isEnglishPaper
                  ? 'Example: Yemen is located in _______ Asia.'
                  : 'اكتب الجملة مع وضع خط _______ مكان الكلمة الناقصة'
                : q.type === 'Term Definition'
                ? isEnglishPaper
                  ? 'Write the scientific term or define: ...'
                  : 'اكتب المصطلح العلمي أو عرّف ما يلي: ...'
                : isEnglishPaper
                ? 'Write the question text here...'
                : 'اكتب السؤال هنا...'
            }
            className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-medium focus:border-[#1B5E3A] focus:ring-2 focus:ring-[#1B5E3A]/15 focus:outline-none min-h-[68px]"
          />
        </div>

        {/* MCQ Options Editor */}
        {q.type === 'Multiple Choice' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-800">
                أضف الاختيارات واضغط على دائرة الاختيار الصحيح (يظهر في نموذج المعلم فقط):
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion(sIdx, qIdx, {
                    options: [
                      ...(q.options || []),
                      isEnglishPaper ? `Option ${(q.options?.length || 0) + 1}` : `خيار ${(q.options?.length || 0) + 1}`,
                    ],
                  })
                }
                className="px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-[#1B5E3A] border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة اختيار</span>
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(q.options || ['', '', '', '']).map((opt, oIdx) => {
                const isModel = opt && q.modelAnswer === opt;
                const badge = isEnglishPaper
                  ? String.fromCharCode(65 + oIdx)
                  : ['أ', 'ب', 'ج', 'د', 'هـ', 'و'][oIdx] || String(oIdx + 1);
                return (
                  <div
                    key={oIdx}
                    className={`flex items-center gap-2 p-2 rounded-xl border bg-white ${
                      isModel ? 'border-[#1B5E3A] ring-1 ring-[#1B5E3A]/30' : 'border-slate-200'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onUpdateQuestion(sIdx, qIdx, { modelAnswer: opt })}
                      title="تحديد كإجابة صحيحة"
                      className={`w-8 h-8 rounded-lg text-xs font-extrabold flex items-center justify-center shrink-0 transition-colors ${
                        isModel
                          ? 'bg-[#1B5E3A] text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-emerald-50'
                      }`}
                    >
                      {badge}
                    </button>
                    <input
                      type="text"
                      dir={qDir}
                      value={opt}
                      onChange={(e) => {
                        const val = e.target.value;
                        const prev = q.options || [];
                        const next = prev.map((v, i) => (i === oIdx ? val : v));
                        onUpdateQuestion(sIdx, qIdx, {
                          options: next,
                          ...(isModel ? { modelAnswer: val } : {}),
                        });
                      }}
                      placeholder={isEnglishPaper ? `Choice ${badge}` : `الاختيار (${badge})`}
                      className="flex-1 min-w-0 text-xs font-semibold bg-transparent focus:outline-none py-1.5"
                    />
                    {(q.options?.length || 0) > 2 && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = (q.options || []).filter((_, i) => i !== oIdx);
                          onUpdateQuestion(sIdx, qIdx, { options: next });
                        }}
                        className="p-1 text-slate-300 hover:text-rose-600"
                        title="حذف الخيار"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* True / False Toggle */}
        {q.type === 'True or False' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold text-slate-800">اختر الإجابة الصحيحة للعبارة (لنموذج المعلم):</span>
            <div className="flex items-center gap-2">
              {(isEnglishPaper ? ['True', 'False'] : ['صح (✓)', 'خطأ (✗)']).map((choice) => {
                const active = q.modelAnswer === choice || q.modelAnswer?.startsWith(choice.split(' ')[0]);
                return (
                  <button
                    key={choice}
                    type="button"
                    onClick={() =>
                      onUpdateQuestion(sIdx, qIdx, {
                        options: isEnglishPaper ? ['True', 'False'] : ['صح (✓)', 'خطأ (✗)'],
                        modelAnswer: choice,
                      })
                    }
                    className={`px-4 py-2 rounded-xl text-xs font-extrabold border min-h-[44px] transition-colors ${
                      active
                        ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                        : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {choice}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Matching Pairs */}
        {q.type === 'Matching' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-extrabold text-slate-800">
                عناصر العمود (أ) وما يقابلها في العمود (ب):
              </span>
              <button
                type="button"
                onClick={() =>
                  onUpdateQuestion(sIdx, qIdx, {
                    matchingPairs: [...(q.matchingPairs || []), { left: '', right: '' }],
                  })
                }
                className="px-2.5 py-1.5 bg-white text-[#1B5E3A] border border-emerald-200 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صف توصيل</span>
              </button>
            </div>
            <div className="space-y-2">
              {(q.matchingPairs || []).map((pair, pIdx) => (
                <div key={pIdx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2 items-center">
                  <input
                    type="text"
                    dir={qDir}
                    value={pair.left}
                    onChange={(e) => {
                      const next = (q.matchingPairs || []).map((p, i) =>
                        i === pIdx ? { ...p, left: e.target.value } : p
                      );
                      onUpdateQuestion(sIdx, qIdx, { matchingPairs: next });
                    }}
                    placeholder={isEnglishPaper ? `Column A #${pIdx + 1}` : `العمود أ (${pIdx + 1})`}
                    className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold min-h-[44px]"
                  />
                  <input
                    type="text"
                    dir={qDir}
                    value={pair.right}
                    onChange={(e) => {
                      const next = (q.matchingPairs || []).map((p, i) =>
                        i === pIdx ? { ...p, right: e.target.value } : p
                      );
                      onUpdateQuestion(sIdx, qIdx, { matchingPairs: next });
                    }}
                    placeholder={isEnglishPaper ? `Column B #${pIdx + 1}` : `المقابل في العمود ب`}
                    className="px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold min-h-[44px]"
                  />
                  {(q.matchingPairs?.length || 0) > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateQuestion(sIdx, qIdx, {
                          matchingPairs: (q.matchingPairs || []).filter((_, i) => i !== pIdx),
                        })
                      }
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg"
                      title="حذف الصف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Rearrange Scrambled Words */}
        {q.type === 'Rearrange the Words' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <label className="text-xs font-extrabold text-slate-800 block">
              الكلمات المبعثرة <span className="font-normal text-slate-500">(افصل بينها بشرطة مائلة / )</span>:
            </label>
            <input
              type="text"
              dir={qDir}
              value={(q.scrambledWords || []).join(' / ')}
              onChange={(e) => {
                const words = e.target.value
                  .split('/')
                  .map((w) => w.trim())
                  .filter(Boolean);
                onUpdateQuestion(sIdx, qIdx, { scrambledWords: words });
              }}
              placeholder={isEnglishPaper ? 'school / to / goes / Ali' : 'المدرسة / إلى / يذهب / علي'}
              className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold min-h-[44px]"
            />
          </div>
        )}

        {/* Image Upload Question */}
        {(q.type === 'Image Question' || q.imageDataUrl) && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-800">صورة السؤال:</span>
              <label className="px-4 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer min-h-[44px]">
                <ImageIcon className="w-4 h-4" />
                <span>{q.imageDataUrl ? 'تغيير الصورة' : 'اختيار صورة من الجهاز'}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) onUploadImage(sIdx, qIdx, file);
                  }}
                />
              </label>
            </div>
            {q.imageDataUrl && (
              <div className="space-y-2 bg-white p-2.5 rounded-xl border border-slate-200">
                <img
                  src={q.imageDataUrl}
                  alt={q.imageCaption || 'صورة السؤال'}
                  style={{ width: `${q.imageWidthPercent || 60}%`, maxWidth: '100%' }}
                  className="mx-auto rounded border border-slate-200 max-h-52 object-contain"
                />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 items-center">
                  <input
                    type="text"
                    dir={qDir}
                    value={q.imageCaption || ''}
                    onChange={(e) => onUpdateQuestion(sIdx, qIdx, { imageCaption: e.target.value })}
                    placeholder="وصف توضيحي أسفل الصورة (اختياري)"
                    className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                  <div className="flex items-center gap-2 text-[11px] text-slate-600">
                    <span>حجم الصورة ({q.imageWidthPercent || 60}%):</span>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      value={q.imageWidthPercent || 60}
                      onChange={(e) => onUpdateQuestion(sIdx, qIdx, { imageWidthPercent: Number(e.target.value) })}
                      className="flex-1 accent-[#1B5E3A]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Table Editor */}
        {(q.type === 'Table Diagram' || q.tableData) && q.tableData && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-800">بيانات الجدول:</span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateQuestion(sIdx, qIdx, {
                      tableData: {
                        ...q.tableData!,
                        rows: [...q.tableData!.rows, Array(q.tableData!.headers.length).fill('')],
                      },
                    })
                  }
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold"
                >
                  + صف
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateQuestion(sIdx, qIdx, {
                      tableData: {
                        headers: [...q.tableData!.headers, `عمود ${q.tableData!.headers.length + 1}`],
                        rows: q.tableData!.rows.map((r) => [...r, '']),
                      },
                    })
                  }
                  className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold"
                >
                  + عمود
                </button>
              </div>
            </div>
            <div className="overflow-x-auto bg-white rounded-xl border border-slate-300">
              <table className="w-full border-collapse text-xs" dir={qDir}>
                <thead>
                  <tr className="bg-slate-100">
                    {q.tableData.headers.map((h, hIdx) => (
                      <th key={hIdx} className="border border-slate-300 p-1.5">
                        <input
                          type="text"
                          value={h}
                          onChange={(e) => {
                            const nextH = [...q.tableData!.headers];
                            nextH[hIdx] = e.target.value;
                            onUpdateQuestion(sIdx, qIdx, { tableData: { ...q.tableData!, headers: nextH } });
                          }}
                          className="w-full text-center font-bold bg-transparent focus:outline-none"
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {q.tableData.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="border border-slate-300 p-1.5">
                          <input
                            type="text"
                            value={cell}
                            onChange={(e) => {
                              const nextRows = q.tableData!.rows.map((r, ri) =>
                                ri === rIdx ? r.map((cv, ci) => (ci === cIdx ? e.target.value : cv)) : r
                              );
                              onUpdateQuestion(sIdx, qIdx, { tableData: { ...q.tableData!, rows: nextRows } });
                            }}
                            className="w-full text-center bg-transparent focus:outline-none"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Answer Space Lines & Model Answer Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
          <div className="sm:col-span-2">
            <label className="text-[11px] font-bold text-slate-600 block mb-1">
              الإجابة النموذجية <span className="font-normal text-slate-400">(تظهر في نموذج إجابة المعلم فقط)</span>
            </label>
            <input
              type="text"
              dir={qDir}
              value={q.modelAnswer}
              onChange={(e) => onUpdateQuestion(sIdx, qIdx, { modelAnswer: e.target.value })}
              placeholder={isEnglishPaper ? 'Model answer (optional)...' : 'اكتب الإجابة النموذجية لتصحيح المعلم...'}
              className="w-full px-3 py-2 bg-emerald-50/40 border border-emerald-200 rounded-xl text-xs font-semibold min-h-[44px]"
            />
          </div>

          <div>
            <label className="text-[11px] font-bold text-slate-600 block mb-1">عدد أسطر الإجابة للطالب</label>
            <select
              value={q.answerSpaceLines || 0}
              onChange={(e) => onUpdateQuestion(sIdx, qIdx, { answerSpaceLines: Number(e.target.value) })}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold min-h-[44px]"
            >
              <option value={0}>بدون أسطر</option>
              <option value={1}>سطر واحد</option>
              <option value={2}>سطران</option>
              <option value={3}>3 أسطر</option>
              <option value={4}>4 أسطر</option>
              <option value={5}>5 أسطر</option>
            </select>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="no-print max-w-4xl mx-auto space-y-5 pb-12" dir="rtl">
      {/* Guided 3-Step Visual Progress Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-3.5 sm:p-4 shadow-2xs">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-[#1B5E3A] font-extrabold">
            <div className="text-[10px] text-emerald-700">الخطوة 1</div>
            <div>بيانات الاختبار</div>
          </div>
          <div className="p-2.5 rounded-xl bg-[#1B5E3A] text-white font-extrabold shadow-xs">
            <div className="text-[10px] text-emerald-100">الخطوة 2 (الآن)</div>
            <div>إضافة الأسئلة والدرجات</div>
          </div>
          <button
            type="button"
            onClick={onPreviewPaper}
            className="p-2.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-800 font-extrabold transition-colors"
          >
            <div className="text-[10px] text-slate-500">الخطوة 3</div>
            <div>معاينة الاختبار وPDF ←</div>
          </button>
        </div>
      </div>

      {/* CARD 1: Basic Exam Data (Subject auto-controls language/RTL-LTR) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
        <button
          type="button"
          onClick={() => setShowMetaDetails((v) => !v)}
          className="w-full px-4 sm:px-5 py-3.5 bg-slate-50/70 border-b border-slate-100 flex items-center justify-between gap-3 text-right min-h-[52px]"
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-[#1B5E3A]/10 text-[#1B5E3A] flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-extrabold text-slate-900">1. بيانات الاختبار الأساسية والترويسة الرسمية</div>
              <div className="text-[11px] text-slate-500 truncate">
                {headerConfig.subject} · {getGradeLabelAr(exam.grade)} · الدرجة الكلية: {exam.totalMarks} · الزمن: {exam.timeLimitMinutes} د · لغة الورقة:{' '}
                <strong className="text-[#1B5E3A]">
                  {isEnglishPaper ? 'English (LTR)' : 'العربية (RTL)'}
                </strong>
              </div>
            </div>
          </div>
          {showMetaDetails ? <ChevronUp className="w-5 h-5 text-slate-400 shrink-0" /> : <ChevronDown className="w-5 h-5 text-slate-400 shrink-0" />}
        </button>

        {showMetaDetails && (
          <div className="p-4 sm:p-5 space-y-4">
            <div className="p-2.5 rounded-xl bg-emerald-50/80 border border-emerald-200 text-[11px] text-emerald-950 font-bold flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[#1B5E3A] shrink-0" />
              <span>
                لغة واتجاه ورقة الاختبار تُضبطان تلقائياً حسب المادة:{' '}
                <strong>{isEnglishPaper ? 'الإنجليزية (من اليسار لليمين LTR)' : 'العربية (من اليمين لليسار RTL)'}</strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">المادة الدراسية</label>
                <select
                  value={exam.subjectId || activeSubjects[0]?.id || 'subj-ar'}
                  onChange={(e) => onSwitchSubject(e.target.value)}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-extrabold text-slate-900 min-h-[44px]"
                >
                  {activeSubjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.nameAr} {s.defaultDirection === 'ltr' ? '(English LTR)' : '(عربي RTL)'}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الصف الدراسي</label>
                <select
                  value={exam.grade}
                  onChange={(e) => {
                    onUpdateExamMeta({ grade: e.target.value });
                    onUpdateHeader({ grade: e.target.value });
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold min-h-[44px]"
                >
                  {!authorizedGrades.some((g) => g.value === exam.grade) && exam.grade && (
                    <option value={exam.grade}>{getGradeLabelAr(exam.grade)}</option>
                  )}
                  {authorizedGrades.map((g) => (
                    <option key={g.value} value={g.value}>
                      {g.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">نوع الاختبار</label>
                <select
                  value={exam.category}
                  onChange={(e) => {
                    const nextCat = e.target.value as ExamCategory;
                    onUpdateExamMeta({ category: nextCat });
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold min-h-[44px]"
                >
                  {EXAM_TYPE_LABELS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.labelAr}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-bold text-slate-700 block mb-1">عنوان الاختبار</label>
                <input
                  type="text"
                  dir={paperDir}
                  value={isEnglishPaper ? exam.title || exam.titleAr : exam.titleAr || exam.title}
                  onChange={(e) =>
                    isEnglishPaper
                      ? onUpdateExamMeta({ title: e.target.value })
                      : onUpdateExamMeta({ titleAr: e.target.value, title: e.target.value })
                  }
                  placeholder={isEnglishPaper ? 'e.g. Monthly English Exam' : 'مثال: الاختبار الشهري لمادة العلوم'}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-bold min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">تاريخ الاختبار</label>
                <input
                  type="date"
                  value={exam.examDate || headerConfig.examDate || ''}
                  onChange={(e) => {
                    onUpdateExamMeta({ examDate: e.target.value });
                    onUpdateHeader({ examDate: e.target.value });
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl font-mono min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">زمن الاختبار (بالدقائق)</label>
                <input
                  type="number"
                  min={5}
                  max={240}
                  value={exam.timeLimitMinutes}
                  onChange={(e) => {
                    const mins = Number(e.target.value) || 45;
                    onUpdateExamMeta({ timeLimitMinutes: mins });
                    onUpdateHeader({ timeLimit: isEnglishPaper ? `${mins} Minutes` : `${mins} دقيقة` });
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-center font-extrabold min-h-[44px]"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الدرجة الكلية للاختبار</label>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={exam.totalMarks}
                  onChange={(e) => {
                    const m = Number(e.target.value) || 20;
                    onUpdateExamMeta({ totalMarks: m });
                    onUpdateHeader({ totalMarks: m });
                  }}
                  className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-center font-extrabold min-h-[44px]"
                />
              </div>

              <div className="flex items-end pb-1">
                <label className="flex items-center gap-2.5 cursor-pointer font-bold text-slate-800 min-h-[44px]">
                  <input
                    type="checkbox"
                    checked={headerConfig.showTeacherName !== false}
                    onChange={(e) => onUpdateHeader({ showTeacherName: e.target.checked })}
                    className="w-5 h-5 accent-[#1B5E3A]"
                  />
                  <span>إظهار اسم المعلم في الورقة</span>
                </label>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Marks Mismatch Alert */}
      {marksMismatch && (
        <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-3.5 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0" />
            <span>
              تنبيه الدرجات: مجموع درجات الأسئلة الحالية (<strong>{computedMarks}</strong>) لا يطابق الدرجة الكلية
              للاختبار (<strong>{exam.totalMarks}</strong>).
            </span>
          </div>
          <button
            type="button"
            onClick={onFixTotalMarks}
            className="px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-extrabold text-xs shrink-0 min-h-[44px]"
          >
            جعل الدرجة الكلية = {computedMarks}
          </button>
        </div>
      )}

      {/* CARD 2: Section Management + Visual 9 Question-Type Picker */}
      <div id="easy-question-type-picker" className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
              2. أقسام الاختبار وإضافة سؤال جديد
            </h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              اختر القسم ثم اضغط على نوع السؤال الذي تريد إضافته مباشرة
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onAddSection}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[44px]"
            >
              <Plus className="w-4 h-4" />
              <span>إضافة قسم جديد</span>
            </button>
            <button
              type="button"
              onClick={onOpenBankImport}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 rounded-xl text-xs font-bold flex items-center gap-1.5 min-h-[44px]"
            >
              <Database className="w-4 h-4" />
              <span>استيراد من بنكي</span>
            </button>
          </div>
        </div>

        {/* Section Tabs */}
        <div className="flex flex-wrap items-center gap-2">
          {exam.sections.map((sec, idx) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => onSetTargetSection(idx)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold border transition-colors min-h-[44px] flex items-center gap-2 ${
                safeSectionIdx === idx
                  ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>القسم {idx + 1}</span>
              <span
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${
                  safeSectionIdx === idx ? 'bg-white/20 text-white' : 'bg-white text-slate-600'
                }`}
              >
                {sec.questions.length} س · {sec.marks} د
              </span>
            </button>
          ))}
        </div>

        {/* Visual Question Type Cards Grid (9 Core Cards + Quran/Reading extras) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {EASY_NINE_QUESTION_TYPES.map((card) => {
            const Icon = card.Icon;
            return (
              <button
                key={card.type}
                type="button"
                onClick={() => onAddQuestion(card.type, safeSectionIdx)}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50 hover:border-[#1B5E3A] text-right transition-all flex items-start gap-3 min-h-[68px] group"
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 group-hover:border-[#1B5E3A] text-[#1B5E3A] flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900">+ {card.titleAr}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">{card.hintAr}</div>
                </div>
              </button>
            );
          })}

          {isQuran && (
            <>
              <button
                type="button"
                onClick={() => onAddQuestion('Quran Recitation', safeSectionIdx)}
                className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-right transition-all flex items-start gap-3 min-h-[68px]"
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-emerald-300 text-[#1B5E3A] flex items-center justify-center shrink-0">
                  <BookOpenCheck className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#1B5E3A]">+ حفظ وتسميع القرآن</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">كتابة الآيات مع حفظ التشكيل الصحيح</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => onAddQuestion('Quran Verse Completion', safeSectionIdx)}
                className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-100/70 text-right transition-all flex items-start gap-3 min-h-[68px]"
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-emerald-300 text-[#1B5E3A] flex items-center justify-center shrink-0">
                  <BookOpenCheck className="w-4.5 h-4.5" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#1B5E3A]">+ إكمال الآيات الكريمة</div>
                  <div className="text-[11px] text-slate-600 mt-0.5">بداية الآية ويكمل الطالب الحفظ</div>
                </div>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => onAddQuestion('Reading Comprehension', safeSectionIdx)}
            className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-emerald-50 hover:border-[#1B5E3A] text-right transition-all flex items-start gap-3 min-h-[68px]"
          >
            <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-[#1B5E3A] flex items-center justify-center shrink-0">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-extrabold text-slate-900">+ نص قراءة وأسئلة</div>
              <div className="text-[11px] text-slate-500 mt-0.5">فقرة قراءة متبوعة بسؤال فهم</div>
            </div>
          </button>
        </div>
      </div>

      {/* CARD 3: Sections & Interactive Question Cards List */}
      <div className="space-y-5">
        {exam.sections.map((sec, sIdx) => (
          <div key={sec.id} className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            {/* Section Header Editor */}
            <div className="p-4 bg-slate-50/90 border-b border-slate-200 space-y-2.5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className="px-2.5 py-1 rounded-lg bg-[#1B5E3A] text-white text-xs font-extrabold shrink-0">
                    قسم {sIdx + 1}
                  </span>
                  <input
                    type="text"
                    dir={paperDir}
                    value={sec.sectionTitle}
                    onChange={(e) => onUpdateSectionTitle(sIdx, e.target.value)}
                    placeholder="عنوان القسم..."
                    className="flex-1 min-w-0 px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm font-extrabold min-h-[44px]"
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-xs font-extrabold text-slate-800 tabular-nums">
                    {sec.marks} درجة
                  </span>
                  {exam.sections.length > 1 && (
                    <button
                      type="button"
                      onClick={() => onDeleteSection(sIdx)}
                      className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold min-h-[44px]"
                    >
                      حذف القسم
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                dir={paperDir}
                value={sec.instructions}
                onChange={(e) => onUpdateSectionInstructions(sIdx, e.target.value)}
                placeholder="تعليمات القسم للطلاب (اختياري)..."
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs text-slate-700 min-h-[40px]"
              />
            </div>

            {/* Section Questions */}
            <div className="p-4 space-y-4">
              {sec.questions.length === 0 ? (
                <div className="p-6 border-2 border-dashed border-slate-200 rounded-2xl text-center space-y-2">
                  <p className="text-xs font-bold text-slate-500">لا توجد أسئلة في هذا القسم بعد.</p>
                  <button
                    type="button"
                    onClick={() => {
                      onSetTargetSection(sIdx);
                      scrollToAddQuestionCards();
                    }}
                    className="px-4 py-2 bg-[#1B5E3A] text-white rounded-xl text-xs font-extrabold min-h-[44px]"
                  >
                    + اختر نوع سؤال لإضافته هنا
                  </button>
                </div>
              ) : (
                sec.questions.map((q, qIdx) => {
                  const typeCard = EASY_NINE_QUESTION_TYPES.find((t) => t.type === q.type);
                  return (
                    <div
                      key={q.id}
                      id={`easy-q-${q.id}`}
                      className="border border-slate-200 rounded-2xl p-4 bg-white shadow-2xs space-y-3 hover:border-[#1B5E3A]/50 transition-colors"
                    >
                      {/* Question Card Top Header + Marks */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 rounded-lg bg-slate-900 text-white text-xs font-extrabold tabular-nums">
                            سؤال {qIdx + 1}
                          </span>
                          <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-[#1B5E3A] border border-emerald-200 text-[11px] font-bold">
                            {typeCard?.titleAr || q.type}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <label className="text-xs font-bold text-slate-600">الدرجة:</label>
                          <input
                            type="number"
                            min={0.5}
                            max={100}
                            step={0.5}
                            value={q.marks}
                            onChange={(e) => onUpdateQuestion(sIdx, qIdx, { marks: Number(e.target.value) || 0 })}
                            aria-label={`درجة السؤال ${qIdx + 1}`}
                            className="w-20 px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-center text-sm font-extrabold tabular-nums min-h-[40px]"
                          />
                        </div>
                      </div>

                      {/* Structured Question Fields */}
                      {renderQuestionTypeSpecificFields(sIdx, qIdx, q)}

                      {/* Question Card Actions */}
                      <div className="pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            disabled={qIdx === 0}
                            onClick={() => onMoveQuestion(sIdx, qIdx, 'up')}
                            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 disabled:opacity-35 min-h-[40px]"
                          >
                            <MoveUp className="w-3.5 h-3.5" />
                            <span>أعلى</span>
                          </button>
                          <button
                            type="button"
                            disabled={qIdx === sec.questions.length - 1}
                            onClick={() => onMoveQuestion(sIdx, qIdx, 'down')}
                            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold flex items-center gap-1 disabled:opacity-35 min-h-[40px]"
                          >
                            <MoveDown className="w-3.5 h-3.5" />
                            <span>أسفل</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onDuplicateQuestion(sIdx, qIdx)}
                            className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-[#1B5E3A] text-xs font-bold flex items-center gap-1 min-h-[40px]"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>تكرار</span>
                          </button>
                          {exam.sections.length > 1 && (
                            <select
                              value={sIdx}
                              onChange={(e) => onMoveQuestionToSection(sIdx, qIdx, Number(e.target.value))}
                              className="px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-slate-700 min-h-[40px]"
                            >
                              {exam.sections.map((otherSec, idx) => (
                                <option key={otherSec.id} value={idx}>
                                  {idx === sIdx ? `في القسم ${idx + 1}` : `نقل إلى القسم ${idx + 1}`}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>

                        <button
                          type="button"
                          onClick={() => onDeleteQuestion(sIdx, qIdx)}
                          className="px-3 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1 min-h-[40px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Guided Next-Steps Bar */}
      <div className="bg-white rounded-2xl border-2 border-[#1B5E3A]/30 p-4 sm:p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="font-extrabold text-slate-900 flex items-center gap-2">
            <CheckCircle2 className="w-4.5 h-4.5 text-[#1B5E3A]" />
            <span>
              إجمالي الأسئلة المضافة: <strong>{totalQuestionsCount}</strong> · مجموع الدرجات:{' '}
              <strong className={marksMismatch ? 'text-amber-700' : 'text-[#1B5E3A]'}>
                {computedMarks} / {exam.totalMarks}
              </strong>
            </span>
          </div>
          <span className="text-[11px] text-slate-500">اضغط على معاينة الاختبار للتأكد من شكل الورقة قبل الطباعة</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            type="button"
            onClick={scrollToAddQuestionCards}
            className="px-4 py-3 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] text-xs font-extrabold flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Plus className="w-4 h-4" />
            <span>اضغط هنا لإضافة سؤال آخر</span>
          </button>

          <button
            type="button"
            onClick={onPreviewPaper}
            className="px-4 py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Eye className="w-4 h-4" />
            <span>شاهد شكل الاختبار قبل الطباعة</span>
          </button>

          <button
            type="button"
            onClick={onSaveExam}
            disabled={isSaving}
            className="px-4 py-3 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-900 text-xs font-extrabold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
          >
            <Save className="w-4 h-4 text-[#1B5E3A]" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ الاختبار'}</span>
          </button>

          <button
            type="button"
            onClick={onExportPdf}
            disabled={isExportingPdf}
            className="px-4 py-3 rounded-xl bg-[#1B5E3A] hover:bg-[#144D2E] text-white text-xs font-extrabold flex items-center justify-center gap-2 min-h-[48px] disabled:opacity-50"
          >
            <FileDown className="w-4 h-4" />
            <span>{isExportingPdf ? 'جاري إنشاء PDF...' : 'تصدير PDF للطباعة'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
