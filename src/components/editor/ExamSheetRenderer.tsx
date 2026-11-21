import React, { useEffect, useState } from 'react';
import { api } from '../../services/api.ts';
import {
  Exam,
  ExamHeaderConfig,
  ExamLayoutConfig,
  ExamSection,
  Question,
  QuestionFormatting,
  SchoolIdentitySettings,
} from '../../types/index.ts';
import { OfficialSchoolHeader } from '../common/OfficialSchoolHeader.tsx';
import {
  formatQuestionBadge,
  formatSectionBadge,
  getFontFamilyCss,
  getPaperDimensionsMm,
  MM_TO_PX,
} from './layoutDefaults.ts';
import {
  cleanSingleLanguageText,
  formatGradeForPaperLanguage,
} from '../../utils/examLanguage.ts';
import {
  PaginatedBlock,
  PaginatedPage,
} from './ExamPaginationEngine.ts';
import {
  CheckCircle,
  GripVertical,
  Sliders,
  MoveUp,
  MoveDown,
  Copy,
  Trash2,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Calculator,
  Image as ImageIcon,
  Table as TableIcon,
  Lock,
  Scissors,
} from 'lucide-react';


const PrivateQuestionImage: React.FC<{
  imageStorageId?: string;
  imageDataUrl?: string;
  alt: string;
  style?: React.CSSProperties;
  className?: string;
}> = ({ imageStorageId, imageDataUrl, alt, style, className }) => {
  const [source, setSource] = useState<string>(imageDataUrl || '');

  useEffect(() => {
    if (!imageStorageId) {
      setSource(imageDataUrl || '');
      return;
    }
    let active = true;
    let objectUrl = '';
    setSource('');
    api.getQuestionImageBlob(imageStorageId).then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    }).catch((error) => {
      console.error('Question image could not be loaded', error);
    });
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [imageStorageId, imageDataUrl]);

  if (!source) return <span className="text-xs text-slate-400">جاري تحميل الصورة...</span>;
  return <img src={source} alt={alt} style={style} className={className} />;
};

export const hasArabicText = (text?: string): boolean => Boolean(text && /[\u0600-\u06FF]/.test(text));

export const isPredominantlyArabicText = (text?: string): boolean => {
  if (!text) return false;
  const arMatches = text.match(/[\u0600-\u06FF]/g) || [];
  const enMatches = text.match(/[A-Za-z]/g) || [];
  if (arMatches.length === 0) return false;
  return /^[\s"'(«]*[\u0600-\u06FF]/.test(text) || arMatches.length > enMatches.length;
};

export const MATH_SCIENCE_SYMBOLS = [
  '+', '−', '×', '÷', '=', '≠', '≈', '≤', '≥', '√', '∑', 'π', '²', '³', '°', '%', '∠', '⊥', '∥', '∆', '→', '⇌', 'H₂O', 'CO₂', '½', '¾', '∞', '∈'
];

export function getBorderStyles(cfg: ExamLayoutConfig): React.CSSProperties {
  const mode = cfg.borderMode || 'full';
  if (mode === 'none') {
    return { border: 'none', padding: 0 };
  }
  const color = cfg.printColorMode === 'bw' ? '#0f172a' : (cfg.borderColor || '#1B5E3A');
  const width = `${cfg.borderWidthPx ?? 2}px`;
  const style = cfg.borderStyle || 'solid';
  const stroke = `${width} ${style} ${color}`;
  const innerPad = `${cfg.borderPaddingMm ?? 4}mm`;

  if (mode === 'top_bottom') {
    return {
      borderTop: stroke,
      borderBottom: stroke,
      borderLeft: 'none',
      borderRight: 'none',
      padding: innerPad,
    };
  }
  if (mode === 'left_right') {
    return {
      borderLeft: stroke,
      borderRight: stroke,
      borderTop: 'none',
      borderBottom: 'none',
      padding: innerPad,
    };
  }
  return {
    border: stroke,
    padding: innerPad,
  };
}

interface AutoWrapEditableTextProps {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  style?: React.CSSProperties;
  dir?: 'ltr' | 'rtl' | 'auto';
  ariaLabel?: string;
  readOnlyPreview?: boolean;
}

export const AutoWrapEditableText: React.FC<AutoWrapEditableTextProps> = ({
  value,
  onChange,
  className = '',
  style,
  dir = 'auto',
  ariaLabel,
  readOnlyPreview = false,
}) => {
  if (readOnlyPreview) {
    return (
      <div
        dir={dir}
        style={style}
        className={`w-full p-0 m-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere] min-w-0 ${className}`}
      >
        {value}
      </div>
    );
  }

  return (
    <div className="grid w-full min-w-0">
      <div
        aria-hidden="true"
        dir={dir}
        style={style}
        className={`col-start-1 row-start-1 p-0 m-0 border-b border-transparent whitespace-pre-wrap break-words [overflow-wrap:anywhere] invisible print:visible print:text-slate-950 pointer-events-none select-none min-w-0 ${className}`}
      >
        {value ? `${value} ` : ' '}
      </div>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={1}
        dir={dir}
        style={style}
        spellCheck={false}
        autoCorrect="off"
        autoCapitalize="off"
        autoComplete="off"
        aria-label={ariaLabel}
        className={`col-start-1 row-start-1 w-full h-full p-0 m-0 min-w-0 bg-transparent resize-none overflow-visible border-b border-dashed border-transparent hover:border-slate-300 focus:border-[#1B5E3A] focus:outline-none print:hidden ${className}`}
      />
    </div>
  );
};

interface SharedRenderCallbacks {
  onSelectQuestion?: (qId: string) => void;
  onUpdateSectionTitle?: (sIdx: number, val: string) => void;
  onUpdateSectionInstructions?: (sIdx: number, val: string) => void;
  onMoveSection?: (sIdx: number, dir: 'up' | 'down') => void;
  onDeleteSection?: (sIdx: number) => void;
  onUpdateQuestion?: (sIdx: number, qIdx: number, patch: Partial<Question>) => void;
  onMoveQuestion?: (sIdx: number, qIdx: number, dir: 'up' | 'down') => void;
  onMoveQuestionToSection?: (fromSIdx: number, qIdx: number, toSIdx: number) => void;
  onDuplicateQuestion?: (sIdx: number, qIdx: number) => void;
  onDeleteQuestion?: (sIdx: number, qIdx: number) => void;
  onToggleFormat?: (sIdx: number, qIdx: number, key: keyof QuestionFormatting, value: any) => void;
  onInsertSymbol?: (sIdx: number, qIdx: number, symbol: string) => void;
  onUploadImage?: (sIdx: number, qIdx: number, file: File) => void;
  setActiveFormatQId?: (id: string | null) => void;
  setActiveSymbolQId?: (id: string | null) => void;
  onDragStart?: (sIdx: number, qIdx: number) => void;
  onDragOver?: (sIdx: number, qIdx: number) => void;
  onDrop?: (sIdx: number, qIdx: number) => void;
  onDragEnd?: () => void;
}

export interface QuestionBlockRenderProps {
  exam: Exam;
  section: ExamSection;
  sIdx: number;
  q: Question;
  qIdx: number;
  layoutConfig: ExamLayoutConfig;
  isAnswerKeyView: boolean;
  readOnly: boolean;
  hasAIAccess?: boolean;
  activeFormatQId?: string | null;
  activeSymbolQId?: string | null;
  selectedQuestionId?: string | null;
  dragOverItem?: { sIdx: number; qIdx: number } | null;
  pageBadgeNumber?: number;
  callbacks?: SharedRenderCallbacks;
}

export const SectionHeaderBlockView: React.FC<{
  exam: Exam;
  section: ExamSection;
  sIdx: number;
  layoutConfig: ExamLayoutConfig;
  readOnly: boolean;
  callbacks?: SharedRenderCallbacks;
}> = ({ exam, section, sIdx, layoutConfig, readOnly, callbacks }) => {
  const isEnglishExam =
    exam.subjectId === 'subj-en' || exam.headerConfig?.headerLanguage === 'en';
  const secArabic = !isEnglishExam && (isPredominantlyArabicText(section.sectionTitle) || true);
  const badge = formatSectionBadge(sIdx, layoutConfig.sectionNumbering, secArabic);
  const headingScale = layoutConfig.headingScale ?? 1;

  return (
    <div
      dir={secArabic ? 'rtl' : 'ltr'}
      className="exam-section-header-group space-y-1"
      style={{ fontSize: `${headingScale}em` }}
    >
      <div
        className={`flex items-start justify-between gap-2 border-b-2 pb-1 ${
          layoutConfig.printColorMode === 'bw' ? 'border-slate-900' : 'border-[#1B5E3A]'
        }`}
      >
        <div className="flex items-start gap-2 flex-1 min-w-0">
          {badge && (
            <span
              className={`w-5 h-5 sm:w-6 sm:h-6 rounded font-extrabold flex items-center justify-center text-[0.8em] shrink-0 mt-0.5 tabular-nums ${
                layoutConfig.printColorMode === 'bw' ? 'bg-slate-900 text-white' : 'bg-[#1B5E3A] text-white'
              }`}
            >
              {badge}
            </span>
          )}
          <div className="flex-1 min-w-0">
            <AutoWrapEditableText
              value={section.sectionTitle}
              onChange={(val) => callbacks?.onUpdateSectionTitle?.(sIdx, val)}
              readOnlyPreview={readOnly}
              dir={secArabic ? 'rtl' : 'ltr'}
              ariaLabel={`Section ${sIdx + 1} title`}
              className={`font-extrabold text-[1em] text-slate-950 ${
                secArabic ? 'text-right' : 'font-english text-left'
              }`}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="font-extrabold text-[0.8em] text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-300 whitespace-nowrap tabular-nums">
            [{section.marks} {secArabic ? 'درجة' : section.marks === 1 ? 'Mark' : 'Marks'}]
          </span>

          {!readOnly && callbacks && (
            <div className="no-print flex items-center gap-0.5">
              <button
                type="button"
                onClick={() => callbacks.onMoveSection?.(sIdx, 'up')}
                disabled={sIdx === 0}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                title="تحريك القسم للأعلى"
              >
                <MoveUp className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => callbacks.onMoveSection?.(sIdx, 'down')}
                disabled={sIdx === exam.sections.length - 1}
                className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20"
                title="تحريك القسم للأسفل"
              >
                <MoveDown className="w-3.5 h-3.5" />
              </button>
              {exam.sections.length > 1 && (
                <button
                  type="button"
                  onClick={() => callbacks.onDeleteSection?.(sIdx)}
                  className="p-1 text-slate-300 hover:text-rose-600"
                  title="حذف القسم"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {section.instructions !== undefined && (
        <div className="text-[0.86em] text-slate-700 min-w-0">
          <AutoWrapEditableText
            value={section.instructions}
            onChange={(val) => callbacks?.onUpdateSectionInstructions?.(sIdx, val)}
            readOnlyPreview={readOnly}
            dir={isPredominantlyArabicText(section.instructions) ? 'rtl' : 'ltr'}
            ariaLabel={`Section ${sIdx + 1} instructions`}
            className={
              isPredominantlyArabicText(section.instructions)
                ? 'text-right'
                : 'font-english text-left italic'
            }
          />
        </div>
      )}
    </div>
  );
};

export const PassageBlockView: React.FC<{
  passage: string;
  sIdx: number;
  qIdx: number;
  readOnly: boolean;
  onChange?: (val: string) => void;
}> = ({ passage, sIdx, qIdx, readOnly, onChange }) => {
  const isAr = isPredominantlyArabicText(passage);
  return (
    <div
      dir={isAr ? 'rtl' : 'ltr'}
      className={`exam-passage-block p-2.5 sm:p-3 bg-slate-50 border border-slate-300 rounded text-[0.92em] leading-relaxed text-slate-800 ${
        isAr ? 'text-right' : 'font-english text-left'
      }`}
    >
      <strong className="exam-passage-label block mb-1 text-slate-950 font-extrabold">
        {isAr ? 'اقرأ النص التالي ثم أجب:' : 'Read the passage carefully:'}
      </strong>
      <AutoWrapEditableText
        value={passage}
        onChange={(val) => onChange?.(val)}
        readOnlyPreview={readOnly}
        dir={isAr ? 'rtl' : 'ltr'}
        ariaLabel={`Section ${sIdx + 1} Question ${qIdx + 1} passage`}
        className="whitespace-pre-wrap break-words"
      />
    </div>
  );
};

export const QuestionCardBlockView: React.FC<QuestionBlockRenderProps> = ({
  exam,
  section,
  sIdx,
  q,
  qIdx,
  layoutConfig,
  isAnswerKeyView,
  readOnly,
  hasAIAccess,
  activeFormatQId,
  activeSymbolQId,
  selectedQuestionId,
  dragOverItem,
  pageBadgeNumber,
  callbacks,
}) => {
  const fmt = q.formatting || {};
  const isEnglishPaper =
    exam.subjectId === 'subj-en' || exam.headerConfig?.headerLanguage === 'en';
  const globalDir = layoutConfig.globalDirection && layoutConfig.globalDirection !== 'auto' ? layoutConfig.globalDirection : undefined;
  const qDir: 'rtl' | 'ltr' =
    fmt.dir && fmt.dir !== 'auto'
      ? fmt.dir
      : globalDir
      ? globalDir
      : isEnglishPaper
      ? isPredominantlyArabicText(q.questionText)
        ? 'rtl'
        : 'ltr'
      : 'rtl';
  const qIsArabic = qDir === 'rtl';
  const globalAlign =
    layoutConfig.globalAlign && layoutConfig.globalAlign !== 'auto' ? layoutConfig.globalAlign : undefined;

  const isLongCard =
    (q.questionText?.length || 0) > 450 ||
    (q.options?.length || 0) > 6 ||
    (q.matchingPairs?.length || 0) > 6 ||
    Boolean(q.tableData && q.tableData.rows.length > 5);

  const isDragTarget = !readOnly && dragOverItem?.sIdx === sIdx && dragOverItem?.qIdx === qIdx;
  const isSelected = !readOnly && selectedQuestionId === q.id;
  const showFormatBar = !readOnly && activeFormatQId === q.id;

  const qNumBadge = formatQuestionBadge(qIdx, layoutConfig.questionNumbering || 'numeric');
  const marksBelow = layoutConfig.marksPlacement === 'below_question';

  const textStyle: React.CSSProperties = {
    fontWeight: fmt.bold ? 700 : undefined,
    fontStyle: fmt.italic ? 'italic' : undefined,
    textDecoration: fmt.underline ? 'underline' : undefined,
    textAlign: fmt.align || globalAlign || undefined,
    fontSize: fmt.fontSizeScale ? `${fmt.fontSizeScale}em` : undefined,
  };

  const marksNode = (
    <div className="flex items-center gap-0.5 font-bold text-slate-900 text-[0.85em] whitespace-nowrap tabular-nums">
      <span>(</span>
      {readOnly ? (
        <span>{q.marks}</span>
      ) : (
        <>
          <input
            type="number"
            min={0.5}
            max={50}
            step={0.5}
            value={q.marks}
            onChange={(e) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { marks: Number(e.target.value) })}
            aria-label={`Question ${qIdx + 1} marks`}
            className="w-7 text-center bg-transparent border-b border-dashed border-slate-400 focus:outline-none print:hidden"
          />
          <span className="hidden print:inline">{q.marks}</span>
        </>
      )}
      <span>
        {qIsArabic
          ? q.marks === 1
            ? 'درجة'
            : 'درجات'
          : q.marks === 1
          ? 'Mark'
          : 'Marks'}
        )
      </span>
    </div>
  );

  return (
    <div
      id={!readOnly ? `studio-q-${q.id}` : undefined}
      dir={qDir}
      draggable={!readOnly}
      onClick={() => !readOnly && callbacks?.onSelectQuestion?.(q.id)}
      onDragStart={() => !readOnly && callbacks?.onDragStart?.(sIdx, qIdx)}
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        callbacks?.onDragOver?.(sIdx, qIdx);
      }}
      onDrop={() => !readOnly && callbacks?.onDrop?.(sIdx, qIdx)}
      onDragEnd={() => !readOnly && callbacks?.onDragEnd?.()}
      className={`${isLongCard ? 'exam-question-card-long' : 'exam-question-card'} text-[0.95em] text-slate-900 rounded-lg transition-colors ${
        isDragTarget
          ? 'ring-2 ring-[#1B5E3A] bg-emerald-50/30 p-1'
          : isSelected
          ? 'ring-1 ring-[#1B5E3A]/60 bg-emerald-50/20 p-1 -m-1'
          : ''
      }`}
    >
      {/* Page Break Visual Indicator in Edit Mode Only */}
      {!readOnly && q.pageBreakBefore && (
        <div className="no-print mb-1.5 flex items-center gap-2 text-[10px] font-bold text-amber-800">
          <div className="flex-1 border-t border-dashed border-amber-400" />
          <span className="px-2 py-0.5 bg-amber-50 border border-amber-300 rounded">
            فاصل صفحة يدوي قبل هذا السؤال
          </span>
          <div className="flex-1 border-t border-dashed border-amber-400" />
        </div>
      )}

      <div className="flex items-start justify-between gap-2 sm:gap-2.5 min-w-0">
        <div className="flex items-start gap-1.5 flex-1 min-w-0">
          {!readOnly && (
            <span
              className="no-print text-slate-300 hover:text-slate-600 cursor-grab pt-0.5 shrink-0 hidden sm:inline"
              title="اسحب لإعادة الترتيب"
            >
              <GripVertical className="w-3.5 h-3.5" />
            </span>
          )}

          {qNumBadge && (
            <span className="font-extrabold text-slate-950 min-w-[20px] shrink-0 pt-0.5 tabular-nums">
              {qNumBadge}
            </span>
          )}

          <div className="flex-1 min-w-0 space-y-1">
            {/* Edit mode small page & fidelity tag */}
            {!readOnly && (pageBadgeNumber || (hasAIAccess && q.sourceFidelityScore !== undefined)) && (
              <div className="no-print flex items-center gap-1.5 flex-wrap text-[9px]">
                {pageBadgeNumber && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 border border-slate-200 font-mono font-bold tabular-nums">
                    صفحة {pageBadgeNumber}
                  </span>
                )}
                {hasAIAccess && q.sourceFidelityScore !== undefined && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-mono font-bold">
                    مطابقة المصدر: {q.sourceFidelityScore}%
                  </span>
                )}
              </div>
            )}

            {/* Compact Per-Question Formatting Toolbar */}
            {showFormatBar && callbacks && (
              <div
                dir="rtl"
                className="no-print flex flex-wrap items-center gap-1 p-1.5 bg-slate-100 border border-slate-200 rounded-lg text-[11px]"
              >
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'bold', !fmt.bold)}
                  className={`p-1 rounded ${fmt.bold ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="عريض Bold"
                >
                  <Bold className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'italic', !fmt.italic)}
                  className={`p-1 rounded ${fmt.italic ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="مائل Italic"
                >
                  <Italic className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'underline', !fmt.underline)}
                  className={`p-1 rounded ${fmt.underline ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="تسطير Underline"
                >
                  <Underline className="w-3.5 h-3.5" />
                </button>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'align', 'right')}
                  className={`p-1 rounded ${fmt.align === 'right' ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="محاذاة يمين"
                >
                  <AlignRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'align', 'center')}
                  className={`p-1 rounded ${fmt.align === 'center' ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="توسيط"
                >
                  <AlignCenter className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'align', 'left')}
                  className={`p-1 rounded ${fmt.align === 'left' ? 'bg-slate-900 text-white' : 'hover:bg-white'}`}
                  title="محاذاة يسار"
                >
                  <AlignLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onToggleFormat?.(sIdx, qIdx, 'dir', qDir === 'rtl' ? 'ltr' : 'rtl')}
                  className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[10px] font-bold"
                  title="تبديل اتجاه RTL / LTR"
                >
                  {qDir.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onUpdateQuestion?.(sIdx, qIdx, { questionText: `${q.questionText}\n• ` })}
                  className="p-1 rounded hover:bg-white"
                  title="إدراج نقطة"
                >
                  <List className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onUpdateQuestion?.(sIdx, qIdx, { questionText: `${q.questionText}\n1) ` })}
                  className="p-1 rounded hover:bg-white"
                  title="إدراج ترقيم"
                >
                  <ListOrdered className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.setActiveSymbolQId?.(activeSymbolQId === q.id ? null : q.id)}
                  className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold flex items-center gap-1"
                  title="رموز رياضية وعلمية"
                >
                  <Calculator className="w-3 h-3" />
                  <span>رموز</span>
                </button>
                <label className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold flex items-center gap-1 cursor-pointer">
                  <ImageIcon className="w-3 h-3" />
                  <span>صورة</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) callbacks.onUploadImage?.(sIdx, qIdx, f);
                      e.currentTarget.value = '';
                    }}
                  />
                </label>
                <button
                  type="button"
                  onClick={() =>
                    callbacks.onUpdateQuestion?.(sIdx, qIdx, {
                      tableData: q.tableData || {
                        headers: ['العمود 1', 'العمود 2'],
                        rows: [['', ''], ['', '']],
                      },
                    })
                  }
                  className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-bold flex items-center gap-1"
                >
                  <TableIcon className="w-3 h-3" />
                  <span>جدول</span>
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onUpdateQuestion?.(sIdx, qIdx, { pageBreakBefore: !q.pageBreakBefore })}
                  className={`px-1.5 py-0.5 rounded border font-bold flex items-center gap-1 ${
                    q.pageBreakBefore ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-slate-200'
                  }`}
                >
                  <Scissors className="w-3 h-3" />
                  <span>صفحة جديدة</span>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    callbacks.onUpdateQuestion?.(sIdx, qIdx, { keepTogether: q.keepTogether === false })
                  }
                  className={`px-1.5 py-0.5 rounded border font-bold flex items-center gap-1 ${
                    q.keepTogether !== false
                      ? 'bg-emerald-50 text-[#1B5E3A] border-emerald-200'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <Lock className="w-3 h-3" />
                  <span>إبقاء معاً</span>
                </button>
                <div className="flex items-center gap-1 pr-1 border-r border-slate-300">
                  <span className="text-[10px]">أسطر:</span>
                  <input
                    type="number"
                    min={0}
                    max={10}
                    value={q.answerSpaceLines || 0}
                    onChange={(e) =>
                      callbacks.onUpdateQuestion?.(sIdx, qIdx, { answerSpaceLines: Number(e.target.value) })
                    }
                    className="w-10 text-center bg-white border border-slate-200 rounded py-0.5 font-bold"
                  />
                </div>
                {exam.sections.length > 1 && (
                  <select
                    value={sIdx}
                    onChange={(e) => callbacks.onMoveQuestionToSection?.(sIdx, qIdx, Number(e.target.value))}
                    className="px-1.5 py-0.5 bg-white border border-slate-200 rounded text-[10px] font-bold"
                  >
                    {exam.sections.map((sec, idx) => (
                      <option key={sec.id} value={idx}>
                        نقل إلى قسم {idx + 1}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Math / Science Symbol Bar */}
            {!readOnly && activeSymbolQId === q.id && (
              <div className="no-print flex flex-wrap gap-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                {MATH_SCIENCE_SYMBOLS.map((sym) => (
                  <button
                    key={sym}
                    type="button"
                    onClick={() => callbacks?.onInsertSymbol?.(sIdx, qIdx, sym)}
                    className="px-2 py-0.5 bg-white hover:bg-[#1B5E3A] hover:text-white border border-slate-200 rounded text-xs font-mono font-bold"
                  >
                    {sym}
                  </button>
                ))}
              </div>
            )}

            {/* Quran Surah/Ayah Banner */}
            {(exam.subjectId === 'subj-quran' ||
              String(q.type || '').startsWith('Quran') ||
              q.surahName ||
              q.ayahRange) && (
              <div className="flex flex-wrap items-center gap-2 text-[0.85em] font-bold text-[#1B5E3A] pb-0.5">
                {readOnly ? (
                  <>
                    {q.surahName && <span>{q.surahName}</span>}
                    {q.ayahRange && <span className="font-mono">({q.ayahRange})</span>}
                  </>
                ) : (
                  <div className="no-print flex flex-wrap items-center gap-2 w-full">
                    <input
                      type="text"
                      value={q.surahName || ''}
                      onChange={(e) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { surahName: e.target.value })}
                      placeholder="اسم السورة (اختياري)"
                      spellCheck={false}
                      className="px-2 py-0.5 bg-emerald-50/70 border border-emerald-200 rounded text-[11px] font-bold text-[#1B5E3A] w-40"
                      dir="rtl"
                    />
                    <input
                      type="text"
                      value={q.ayahRange || ''}
                      onChange={(e) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { ayahRange: e.target.value })}
                      placeholder="الآيات (مثال: 1 - 7)"
                      spellCheck={false}
                      className="px-2 py-0.5 bg-emerald-50/70 border border-emerald-200 rounded text-[11px] font-bold text-[#1B5E3A] w-36"
                      dir="rtl"
                    />
                    <span className="text-[10px] text-emerald-700 font-semibold">حفظ التشكيل الحرفي مُفعَّل</span>
                  </div>
                )}
              </div>
            )}

            {/* Question Stem */}
            <div onClick={() => !readOnly && callbacks?.setActiveFormatQId?.(q.id)}>
              <AutoWrapEditableText
                value={q.questionText}
                onChange={(val) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { questionText: val })}
                readOnlyPreview={readOnly}
                style={{
                  ...textStyle,
                  lineHeight:
                    exam.subjectId === 'subj-quran' ||
                    String(q.type || '').startsWith('Quran') ||
                    q.preserveDiacritics
                      ? Math.max(layoutConfig.lineHeight || 1.45, 1.85)
                      : textStyle.lineHeight,
                }}
                dir={qDir}
                ariaLabel={`Question ${qIdx + 1} text`}
                className={`font-medium text-slate-950 ${
                  fmt.align
                    ? ''
                    : qIsArabic
                    ? 'text-right'
                    : 'font-english text-left'
                }`}
              />
            </div>

            {/* Math Formula Box */}
            {q.mathFormula !== undefined && (
              <div
                className="p-2 bg-slate-50 border border-slate-200 rounded font-mono text-center text-[1em] font-bold"
                dir="ltr"
              >
                <AutoWrapEditableText
                  value={q.mathFormula}
                  onChange={(val) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { mathFormula: val })}
                  readOnlyPreview={readOnly}
                  dir="ltr"
                  className="text-center font-mono font-bold"
                />
              </div>
            )}

            {/* Attached Image */}
            {(q.imageDataUrl || q.imageStorageId) && (
              <div className="exam-question-image-block avoid-break-inside py-2 flex flex-col items-center gap-1">
                <PrivateQuestionImage
                  imageStorageId={q.imageStorageId}
                  imageDataUrl={q.imageDataUrl}
                  alt={q.imageCaption || 'شكل توضيحي'}
                  style={{ width: `${q.imageWidthPercent || 60}%`, maxWidth: '100%' }}
                  className="exam-question-image rounded border border-slate-300 object-contain max-h-[420px]"
                />
                {q.imageCaption && <span className="text-[0.8em] text-slate-600">{q.imageCaption}</span>}
                {!readOnly && (
                  <div className="no-print flex items-center gap-2 text-[10px] text-slate-500">
                    <span>حجم الصورة:</span>
                    <input
                      type="range"
                      min={25}
                      max={100}
                      value={q.imageWidthPercent || 60}
                      onChange={(e) =>
                        callbacks?.onUpdateQuestion?.(sIdx, qIdx, { imageWidthPercent: Number(e.target.value) })
                      }
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (q.imageStorageId) void api.deleteQuestionImage(q.imageStorageId).catch(console.error);
                        callbacks?.onUpdateQuestion?.(sIdx, qIdx, { imageDataUrl: undefined, imageStorageId: undefined });
                      }}
                      className="text-rose-600 hover:underline font-bold"
                    >
                      إزالة الصورة
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Table Data */}
            {q.tableData && (
              <div className="overflow-x-auto py-1">
                <table className="w-full border-collapse border border-slate-400 text-[0.88em]">
                  <thead>
                    <tr className="bg-slate-100">
                      {q.tableData.headers.map((h, hIdx) => (
                        <th key={hIdx} className="border border-slate-400 p-1.5 font-bold">
                          {readOnly ? (
                            h
                          ) : (
                            <input
                              type="text"
                              value={h}
                              onChange={(e) => {
                                const nextHeaders = [...q.tableData!.headers];
                                nextHeaders[hIdx] = e.target.value;
                                callbacks?.onUpdateQuestion?.(sIdx, qIdx, {
                                  tableData: { ...q.tableData!, headers: nextHeaders },
                                });
                              }}
                              className="w-full bg-transparent text-center font-bold focus:outline-none print:border-none"
                            />
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {q.tableData.rows.map((row, rIdx) => (
                      <tr key={rIdx}>
                        {row.map((cell, cIdx) => (
                          <td key={cIdx} className="border border-slate-400 p-1.5 text-center">
                            {readOnly ? (
                              cell || ' '
                            ) : (
                              <input
                                type="text"
                                value={cell}
                                onChange={(e) => {
                                  const nextRows = q.tableData!.rows.map((r, ri) =>
                                    ri === rIdx ? r.map((cv, ci) => (ci === cIdx ? e.target.value : cv)) : r
                                  );
                                  callbacks?.onUpdateQuestion?.(sIdx, qIdx, {
                                    tableData: { ...q.tableData!, rows: nextRows },
                                  });
                                }}
                                className="w-full bg-transparent text-center focus:outline-none print:border-none"
                              />
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!readOnly && (
                  <div className="no-print flex items-center gap-2 mt-1 text-[10px]">
                    <button
                      type="button"
                      onClick={() =>
                        callbacks?.onUpdateQuestion?.(sIdx, qIdx, {
                          tableData: {
                            ...q.tableData!,
                            rows: [...q.tableData!.rows, Array(q.tableData!.headers.length).fill('')],
                          },
                        })
                      }
                      className="px-2 py-0.5 bg-slate-100 rounded font-bold"
                    >
                      + صف
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        callbacks?.onUpdateQuestion?.(sIdx, qIdx, {
                          tableData: {
                            headers: [...q.tableData!.headers, `عمود ${q.tableData!.headers.length + 1}`],
                            rows: q.tableData!.rows.map((r) => [...r, '']),
                          },
                        })
                      }
                      className="px-2 py-0.5 bg-slate-100 rounded font-bold"
                    >
                      + عمود
                    </button>
                    <button
                      type="button"
                      onClick={() => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { tableData: undefined })}
                      className="text-rose-600 font-bold"
                    >
                      حذف الجدول
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Multiple Choice Options — Horizontal Flexbox (flex-row) with clean spacing & automatic wrap */}
            {q.options && q.options.length > 0 && (
              <div
                dir={qDir}
                className={`flex flex-row flex-wrap items-baseline pt-0.5 ${
                  layoutConfig.columns === 2 ? 'gap-x-4 gap-y-1' : 'gap-x-6 gap-y-1'
                }`}
              >
                {q.options.map((opt, oIdx) => {
                  const optIsArabic = isEnglishPaper
                    ? false
                    : hasArabicText(opt) || !/[A-Za-z]{2,}/.test(opt);
                  const labelChar = optIsArabic
                    ? ['أ', 'ب', 'ج', 'د', 'هـ', 'و'][oIdx] || String(oIdx + 1)
                    : String.fromCharCode(65 + oIdx);
                  const isCorrectOpt = isAnswerKeyView && opt === q.modelAnswer;
                  return (
                    <div
                      key={oIdx}
                      dir={optIsArabic ? 'rtl' : 'ltr'}
                      data-is-correct-answer={isCorrectOpt ? 'true' : undefined}
                      className={`inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded max-w-full min-w-0 break-words [overflow-wrap:anywhere] ${
                        optIsArabic ? 'text-right' : 'font-english text-left'
                      } ${
                        isCorrectOpt
                          ? 'bg-emerald-100 font-bold text-emerald-950 border border-emerald-400'
                          : 'text-slate-800'
                      }`}
                    >
                      <span className="font-bold shrink-0">({labelChar})</span>
                      {readOnly ? (
                        <span className="min-w-0 break-words">{opt}</span>
                      ) : (
                        <div className="inline-grid items-center min-w-[3.25rem] max-w-full">
                          <span
                            aria-hidden="true"
                            className="col-start-1 row-start-1 invisible whitespace-pre px-0.5"
                          >
                            {opt || ' '}
                          </span>
                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const nextOpts = [...(q.options || [])];
                              nextOpts[oIdx] = e.target.value;
                              callbacks?.onUpdateQuestion?.(sIdx, qIdx, { options: nextOpts });
                            }}
                            className="col-start-1 row-start-1 w-full min-w-0 bg-transparent border-b border-dashed border-transparent focus:border-[#1B5E3A] focus:outline-none print:border-none"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Matching Pairs — Two-Column Table (Column A & Column B side-by-side) */}
            {q.matchingPairs && q.matchingPairs.length > 0 && (
              <div className="pt-0.5">
                <table
                  dir={qDir}
                  className="w-full table-fixed border-collapse border border-slate-300 bg-white text-[0.9em] leading-[1.3]"
                >
                  <thead>
                    <tr className="bg-slate-100 text-slate-900">
                      <th className="w-1/2 border border-slate-300 px-2 py-0.5 font-extrabold text-start">
                        {qIsArabic ? 'العمود (أ)' : 'Column A'}
                      </th>
                      <th className="w-1/2 border border-slate-300 px-2 py-0.5 font-extrabold text-start">
                        {qIsArabic ? 'العمود (ب)' : 'Column B'}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.matchingPairs.map((p, pIdx) => (
                      <tr key={pIdx} className="align-top">
                        <td className="border border-slate-300 px-2 py-0.5 min-w-0">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="font-bold shrink-0">{pIdx + 1}.</span>
                            {readOnly ? (
                              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{p.left}</span>
                            ) : (
                              <input
                                type="text"
                                value={p.left}
                                onChange={(e) => {
                                  const nextPairs = q.matchingPairs!.map((mp, mi) =>
                                    mi === pIdx ? { ...mp, left: e.target.value } : mp
                                  );
                                  callbacks?.onUpdateQuestion?.(sIdx, qIdx, { matchingPairs: nextPairs });
                                }}
                                className="flex-1 min-w-0 bg-transparent border-b border-dashed border-transparent focus:border-[#1B5E3A] focus:outline-none print:border-none"
                              />
                            )}
                          </div>
                        </td>
                        <td className="border border-slate-300 px-2 py-0.5 min-w-0">
                          <div className="flex items-start gap-1.5 min-w-0">
                            <span className="font-bold shrink-0">
                              ({qIsArabic ? ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح'][pIdx] || String(pIdx + 1) : String.fromCharCode(65 + pIdx)})
                            </span>
                            {readOnly ? (
                              <span className="min-w-0 break-words [overflow-wrap:anywhere]">{p.right}</span>
                            ) : (
                              <input
                                type="text"
                                value={p.right}
                                onChange={(e) => {
                                  const nextPairs = q.matchingPairs!.map((mp, mi) =>
                                    mi === pIdx ? { ...mp, right: e.target.value } : mp
                                  );
                                  callbacks?.onUpdateQuestion?.(sIdx, qIdx, { matchingPairs: nextPairs });
                                }}
                                className="flex-1 min-w-0 bg-transparent border-b border-dashed border-transparent focus:border-[#1B5E3A] focus:outline-none print:border-none"
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Scrambled Words */}
            {q.scrambledWords && q.scrambledWords.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {q.scrambledWords.map((word, wIdx) => (
                  <span
                    key={wIdx}
                    className="px-2 py-0.5 bg-slate-100 border border-slate-300 rounded text-[0.88em] font-mono"
                  >
                    {word}
                  </span>
                ))}
              </div>
            )}

            {/* Blank Answer Space Lines */}
            {q.answerSpaceLines && q.answerSpaceLines > 0 ? (
              <div className="pt-1 space-y-2.5">
                {Array.from({ length: q.answerSpaceLines }).map((_, lineIdx) => (
                  <div key={lineIdx} className="border-b border-dotted border-slate-500 h-3.5 w-full" />
                ))}
              </div>
            ) : null}

            {/* Marks Below Question option */}
            {marksBelow && <div className="pt-0.5">{marksNode}</div>}

            {/* TEACHER ANSWER KEY BOX (Strictly NEVER rendered when isAnswerKeyView === false!) */}
            {isAnswerKeyView && (
              <div
                data-answer-key="true"
                className="teacher-answer-key-box mt-1.5 p-2 bg-emerald-50 border border-emerald-300 rounded text-[0.88em] text-emerald-950 font-semibold space-y-1"
              >
                <div className="flex items-start gap-1.5 min-w-0">
                  <CheckCircle className="w-3.5 h-3.5 text-[#1B5E3A] shrink-0 mt-0.5" />
                  <span className="shrink-0 font-bold">
                    {isEnglishPaper ? 'Model Answer:' : 'الإجابة النموذجية:'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <AutoWrapEditableText
                      value={q.modelAnswer}
                      onChange={(val) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { modelAnswer: val })}
                      readOnlyPreview={readOnly}
                      dir={isPredominantlyArabicText(q.modelAnswer) ? 'rtl' : 'ltr'}
                      ariaLabel={`Question ${qIdx + 1} model answer`}
                      className="font-bold text-emerald-950"
                    />
                  </div>
                </div>
                {(q.gradingNotes || !readOnly) && (
                  <div className="flex items-start gap-1.5 text-[0.88em] text-emerald-800">
                    <span className="shrink-0 font-bold">
                      {isEnglishPaper ? 'Grading Notes:' : 'ملاحظات التصحيح:'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <AutoWrapEditableText
                        value={q.gradingNotes || q.explanation || ''}
                        onChange={(val) => callbacks?.onUpdateQuestion?.(sIdx, qIdx, { gradingNotes: val })}
                        readOnlyPreview={readOnly}
                        dir={isPredominantlyArabicText(q.gradingNotes || q.explanation) ? 'rtl' : 'ltr'}
                        className="text-emerald-800"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Question Marks (inline end) & Action Buttons */}
        {(!marksBelow || !readOnly) && (
          <div className="flex items-center gap-1 shrink-0 pt-0.5">
            {!marksBelow && marksNode}

            {!readOnly && callbacks && (
              <div className="no-print flex items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => callbacks.setActiveFormatQId?.(activeFormatQId === q.id ? null : q.id)}
                  className={`p-1 rounded transition-colors ${
                    activeFormatQId === q.id
                      ? 'text-[#1B5E3A] bg-emerald-50'
                      : 'text-slate-400 hover:text-slate-700'
                  }`}
                  title="أدوات تنسيق السؤال"
                >
                  <Sliders className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onMoveQuestion?.(sIdx, qIdx, 'up')}
                  disabled={qIdx === 0}
                  className="p-1 text-slate-300 hover:text-slate-700 disabled:opacity-20"
                  title="تحريك للأعلى"
                >
                  <MoveUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onMoveQuestion?.(sIdx, qIdx, 'down')}
                  disabled={qIdx === section.questions.length - 1}
                  className="p-1 text-slate-300 hover:text-slate-700 disabled:opacity-20"
                  title="تحريك للأسفل"
                >
                  <MoveDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onDuplicateQuestion?.(sIdx, qIdx)}
                  className="p-1 text-slate-300 hover:text-[#1B5E3A]"
                  title="نسخ السؤال"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => callbacks.onDeleteQuestion?.(sIdx, qIdx)}
                  className="p-1 text-slate-300 hover:text-rose-600"
                  title="حذف السؤال"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * Renders a single discrete WYSIWYG A4 Sheet used in Multi-Page Preview, Window Print, AND Server Vector PDF Export!
 */
export const DiscreteA4PageSheet: React.FC<{
  page: PaginatedPage;
  totalPages: number;
  exam: Exam;
  headerConfig: ExamHeaderConfig;
  layoutConfig: ExamLayoutConfig;
  schoolIdentity?: SchoolIdentitySettings | null;
  isAnswerKeyView: boolean;
  zoomLevel?: number;
  visibleOnScreen?: boolean;
}> = ({
  page,
  totalPages,
  exam,
  headerConfig,
  layoutConfig,
  schoolIdentity,
  isAnswerKeyView,
  zoomLevel = 100,
  visibleOnScreen = true,
}) => {
  const { widthMm, heightMm } = getPaperDimensionsMm(layoutConfig.orientation);
  const isEnglishPaper =
    exam.subjectId === 'subj-en' || headerConfig.headerLanguage === 'en';
  const paperDir: 'rtl' | 'ltr' = isEnglishPaper ? 'ltr' : 'rtl';
  const fontCss = getFontFamilyCss(layoutConfig.fontFamily);
  const borderStyles = getBorderStyles(layoutConfig);
  const colGapPx = layoutConfig.columnGapPx ?? 18;
  const qGapPx = layoutConfig.questionGapPx ?? 12;
  const sGapPx = layoutConfig.sectionGapPx ?? 18;

  const renderPaginatedBlock = (blk: PaginatedBlock, idxInCol: number, prevBlk?: PaginatedBlock) => {
    const sec = exam.sections[blk.sIdx];
    if (!sec) return null;

    let marginTopPx = 0;
    if (idxInCol > 0) {
      if (blk.kind === 'section-header') marginTopPx = sGapPx;
      else if (prevBlk?.kind === 'section-header' && blk.qIdx === 0) marginTopPx = 8;
      else marginTopPx = qGapPx;
    }

    if (blk.kind === 'section-header') {
      return (
        <div key={blk.measureId} style={{ marginTop: `${marginTopPx}px` }}>
          <SectionHeaderBlockView
            exam={exam}
            section={sec}
            sIdx={blk.sIdx}
            layoutConfig={layoutConfig}
            readOnly={true}
          />
        </div>
      );
    }

    if (blk.kind === 'passage' && blk.qIdx !== undefined) {
      const q = sec.questions[blk.qIdx];
      if (!q || q.passage === undefined) return null;
      return (
        <div key={blk.measureId} style={{ marginTop: `${marginTopPx}px` }}>
          <PassageBlockView
            passage={q.passage}
            sIdx={blk.sIdx}
            qIdx={blk.qIdx}
            readOnly={true}
          />
        </div>
      );
    }

    if (blk.kind === 'question' && blk.qIdx !== undefined) {
      const q = sec.questions[blk.qIdx];
      if (!q) return null;
      return (
        <div key={blk.measureId} style={{ marginTop: `${marginTopPx}px` }}>
          <QuestionCardBlockView
            exam={exam}
            section={sec}
            sIdx={blk.sIdx}
            q={q}
            qIdx={blk.qIdx}
            layoutConfig={layoutConfig}
            isAnswerKeyView={isAnswerKeyView}
            readOnly={true}
          />
        </div>
      );
    }

    return null;
  };

  const usesDefaultMargins =
    layoutConfig.marginTopMm === 12 &&
    layoutConfig.marginRightMm === 12 &&
    layoutConfig.marginBottomMm === 12 &&
    layoutConfig.marginLeftMm === 12;
  const effectiveSheetLineHeight =
    layoutConfig.lineHeight === 1.45 ? 1.32 : layoutConfig.lineHeight;

  return (
    <div
      data-page-number={page.pageIndex + 1}
      dir={paperDir}
      style={{
        width: `${widthMm}mm`,
        height: `${heightMm}mm`,
        ...(usesDefaultMargins
          ? {}
          : {
              paddingTop: `${layoutConfig.marginTopMm}mm`,
              paddingRight: `${layoutConfig.marginRightMm}mm`,
              paddingBottom: `${layoutConfig.marginBottomMm}mm`,
              paddingLeft: `${layoutConfig.marginLeftMm}mm`,
            }),
        fontFamily: fontCss,
        fontSize: `${layoutConfig.fontSizePt}pt`,
        lineHeight: effectiveSheetLineHeight,
        ...(zoomLevel !== 100 ? { zoom: zoomLevel / 100 } : {}),
      }}
      className={`a4-print-sheet p-6 print:p-6 bg-white shadow-xl border border-slate-300 text-slate-950 flex flex-col shrink-0 ${
        visibleOnScreen ? '' : 'hidden print:flex'
      } ${layoutConfig.printColorMode === 'bw' ? 'grayscale print:grayscale' : ''}`}
    >
      {/* Inner Framed Page Border Container */}
      <div
        style={borderStyles}
        className="w-full h-full flex flex-col justify-between box-border"
      >
        <div className="flex-1 flex flex-col min-h-0">
          {/* Page 1 Main Official School Header */}
          {page.hasMainHeader && (
            <div className="shrink-0">
              <OfficialSchoolHeader
                headerConfig={headerConfig}
                examTitle={exam.title}
                examTitleAr={exam.titleAr}
                subjectId={exam.subjectId}
                examDate={exam.examDate || headerConfig.examDate}
                schoolIdentity={schoolIdentity}
                timeLimitMinutes={exam.timeLimitMinutes}
                totalMarks={exam.totalMarks}
                grade={exam.grade}
                term={exam.term}
                examPeriod={exam.examPeriod || headerConfig.examPeriod}
                examCategoryLabel={headerConfig.examTypeLabel}
                teacherName={headerConfig.teacherName || exam.createdByName}
                isAnswerKeyView={isAnswerKeyView}
                logoSize={layoutConfig.logoSize}
                compact={layoutConfig.headerCompact}
                printColorMode={layoutConfig.printColorMode}
              />

              <div
                className={`text-[0.84em] text-slate-700 border-b border-slate-300 flex flex-wrap justify-between items-center gap-2 ${
                  layoutConfig.headerCompact ? 'mb-2 pb-1' : 'mb-3 pb-1.5'
                }`}
              >
                {isEnglishPaper ? (
                  <span className="font-english italic" dir="ltr">
                    * {cleanSingleLanguageText(headerConfig.notes, 'en') || 'Answer all questions clearly and legibly.'}
                  </span>
                ) : (
                  <span className="font-semibold" dir="rtl">
                    * {cleanSingleLanguageText(headerConfig.notes, 'ar') || 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Page 2+ Compact Running Mini-Header */}
          {page.hasRunningHeader && (
            <div
              dir={paperDir}
              className={`shrink-0 mb-2.5 pb-1 border-b ${
                layoutConfig.printColorMode === 'bw' ? 'border-slate-700' : 'border-[#1B5E3A]/40'
              } flex items-center justify-between gap-2 text-[0.8em] text-slate-700 font-bold`}
            >
              <span className="truncate">
                {isEnglishPaper
                  ? `${schoolIdentity?.schoolNameEn || 'QAFLAH SCHOOL'} — ${cleanSingleLanguageText(exam.title || exam.titleAr, 'en')}`
                  : `${schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'} — ${cleanSingleLanguageText(exam.titleAr || exam.title, 'ar')}`}
              </span>
              <span className="shrink-0 font-mono text-[0.9em]">
                {isEnglishPaper
                  ? `${cleanSingleLanguageText(headerConfig.subjectEn || headerConfig.subject, 'en')} · ${formatGradeForPaperLanguage(exam.grade, 'en')}${isAnswerKeyView ? ' · Answer Key' : ''}`
                  : `${cleanSingleLanguageText(headerConfig.subject, 'ar')} · ${formatGradeForPaperLanguage(exam.grade, 'ar')}${isAnswerKeyView ? ' · نموذج إجابة' : ''}`}
              </span>
            </div>
          )}

          {/* Columns Body */}
          <div
            style={{
              display: page.columns.length === 2 ? 'grid' : 'block',
              gridTemplateColumns: page.columns.length === 2 ? '1fr 1fr' : undefined,
              columnGap: page.columns.length === 2 ? `${colGapPx}px` : undefined,
            }}
            className={`flex-1 min-h-0 ${page.columns.length === 2 ? 'leading-[1.3]' : ''}`}
          >
            {page.columns.map((colBlocks, colIdx) => (
              <div
                key={colIdx}
                className={
                  page.columns.length === 2 && colIdx === 0
                    ? 'border-e border-dashed border-slate-200 pe-1.5 min-w-0'
                    : 'min-w-0'
                }
              >
                {colBlocks.map((blk, i) =>
                  renderPaginatedBlock(blk, i, i > 0 ? colBlocks[i - 1] : undefined)
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Bottom Area: Official Closing Signature on Last Page + Page Number Footer */}
        <div className="shrink-0 pt-1.5">
          {page.hasClosingFooter && (
            <div
              className={`pt-1.5 border-t-2 ${
                layoutConfig.printColorMode === 'bw' ? 'border-slate-900' : 'border-[#1B5E3A]'
              } flex flex-wrap justify-between items-center gap-2 text-[0.82em] text-slate-800`}
            >
              <div>
                <span>{isEnglishPaper ? 'Prepared by: ' : 'إعداد: '}</span>
                <strong className="text-slate-950">
                  {headerConfig.showTeacherName !== false
                    ? headerConfig.teacherName || exam.createdByName
                    : isEnglishPaper
                    ? schoolIdentity?.schoolNameEn || 'School Administration'
                    : schoolIdentity?.schoolNameAr || 'إدارة المدرسة'}
                </strong>
              </div>
              <div className="font-bold">
                {isEnglishPaper ? '*** BEST OF LUCK ***' : 'مع تمنياتنا للجميع بالتوفيق والنجاح'}
              </div>
              <div>
                <span>{isEnglishPaper ? 'Principal: ____________' : 'مدير المدرسة: ____________'}</span>
              </div>
            </div>
          )}

          {layoutConfig.showPageNumbers !== false && (
            <div
              className={`mt-1.5 pt-1 border-t border-slate-200 flex items-center justify-between text-[0.74em] text-slate-500 tabular-nums ${
                isEnglishPaper ? 'font-english' : 'font-arabic'
              }`}
              dir={paperDir}
            >
              <span>
                {isEnglishPaper
                  ? `${schoolIdentity?.footerNoteEn || 'QAFLAH SCHOOL'} · ${exam.code}`
                  : `${schoolIdentity?.footerNoteAr || 'مدرسة قفلة للتعليم الأساسي'} · ${exam.code}`}
              </span>
              <span className="font-bold text-slate-700">
                {isEnglishPaper
                  ? `Page ${page.pageIndex + 1} of ${totalPages}`
                  : `صفحة ${page.pageIndex + 1} من ${totalPages}`}
              </span>
              <span>
                {isEnglishPaper
                  ? isAnswerKeyView
                    ? 'Teacher Answer Key'
                    : 'Student Paper'
                  : isAnswerKeyView
                  ? 'نموذج إجابة المعلم'
                  : 'ورقة الطالب'}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
