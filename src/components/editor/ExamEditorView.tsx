import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../../services/api.ts';
import { prepareQuestionImage } from '../../utils/questionImage.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  Exam,
  ExamLayoutConfig,
  ExamSection,
  LayoutTemplate,
  Question,
  QuestionFormatting,
  QuestionType,
} from '../../types/index.ts';
import { OfficialSchoolHeader } from '../common/OfficialSchoolHeader.tsx';
import {
  getFontFamilyCss,
  getPaperDimensionsMm,
  MIN_SAFE_FONT_PT,
  normalizeLayoutConfig,
} from './layoutDefaults.ts';
import {
  computeExamPagination,
  getSheetGeometryPx,
  MeasuredHeights,
  PaginationComputationResult,
} from './ExamPaginationEngine.ts';
import {
  DiscreteA4PageSheet,
  getBorderStyles,
  PassageBlockView,
  QuestionCardBlockView,
  SectionHeaderBlockView,
} from './ExamSheetRenderer.tsx';
import { StudioToolbarPanel, StudioQuestionTypeOption } from './StudioToolbarPanel.tsx';
import { QuestionOutlinePanel } from './QuestionOutlinePanel.tsx';
import { EasyExamWorkspace } from './EasyExamWorkspace.tsx';
import {
  applySubjectLanguageToExam,
  buildPracticeSandboxExam,
  cleanSingleLanguageText,
  resolveSubjectPaperProfile,
} from '../../utils/examLanguage.ts';
import {
  clearLocalExamDraft,
  hasRecoverableNewerDraft,
  loadLocalExamDraft,
  LocalExamDraftRecord,
  saveLocalExamDraft,
} from '../../utils/examDraftStorage.ts';
import {
  Printer,
  FileDown,
  Save,
  Eye,
  EyeOff,
  ZoomIn,
  ZoomOut,
  Edit3,
  Share2,
  AlertTriangle,
  CheckCircle,
  X,
  Sliders,
  ListTree,
  ChevronRight,
  ChevronLeft,
  Columns,
  Sparkles,
  RotateCcw,
  WifiOff,
  Cloud,
  BookmarkPlus,
} from 'lucide-react';


async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`;
}

async function inlineCssAssetUrls(css: string, stylesheetUrl: string): Promise<string> {
  // Match CSS url(...) tokens, including Google Fonts .woff2 resources.
  const matches = Array.from(css.matchAll(/url\\((['"]?)([^'")]+)\\1\\)/g));
  let output = css;
  for (const match of matches) {
    const original = match[0];
    const rawUrl = match[2]?.trim();
    if (!rawUrl || /^(?:data:|blob:|#)/i.test(rawUrl)) continue;
    try {
      const resolved = new URL(rawUrl, stylesheetUrl);
      const sameOrigin = resolved.origin === window.location.origin;
      const response = await fetch(resolved.href, {
        mode: 'cors',
        credentials: sameOrigin ? 'same-origin' : 'omit',
      });
      if (!response.ok) continue;
      const blob = await response.blob();
      if (!blob.size) continue;
      const dataUrl = await blobToDataUrl(blob);
      output = output.replaceAll(original, `url("${dataUrl}")`);
    } catch {
      // Retain the declared font stack's local fallbacks if an asset disallows CORS.
    }
  }
  return output;
}
/**
 * Remove print-only rules copied from the application shell before rendering
 * the isolated, already-paginated exam sheets. Those rules target the full app
 * print flow and must not leak into the dedicated PDF document, which defines
 * its own single page-transition rule.
 */
function stripPrintMediaRules(css: string): string {
  const mediaPrint = /@media\s+(?:only\s+)?print\b[^{}]*\{/gi;
  let output = '';
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = mediaPrint.exec(css)) !== null) {
    const openBrace = mediaPrint.lastIndex - 1;
    let depth = 1;
    let quote = '';
    let inComment = false;
    let closeBrace = -1;

    for (let index = openBrace + 1; index < css.length; index += 1) {
      const char = css[index];
      const next = css[index + 1];

      if (inComment) {
        if (char === '*' && next === '/') {
          inComment = false;
          index += 1;
        }
        continue;
      }
      if (quote) {
        if (char === '\\') {
          index += 1;
        } else if (char === quote) {
          quote = '';
        }
        continue;
      }
      if (char === '/' && next === '*') {
        inComment = true;
        index += 1;
        continue;
      }
      if (char === '"' || char === "'") {
        quote = char;
        continue;
      }
      if (char === '{') depth += 1;
      if (char === '}') {
        depth -= 1;
        if (depth === 0) {
          closeBrace = index;
          break;
        }
      }
    }

    // Leave malformed CSS untouched rather than truncating the remaining file.
    if (closeBrace === -1) {
      mediaPrint.lastIndex = css.length;
      break;
    }

    output += css.slice(cursor, match.index);
    cursor = closeBrace + 1;
    mediaPrint.lastIndex = cursor;
  }

  return output + css.slice(cursor);
}

async function buildPdfHeadStyles(): Promise<string> {
  const nodes = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'));
  const rendered = await Promise.all(nodes.map(async (node) => {
    const media = node.getAttribute('media') || '';
    if (media && /(?:^|,)\\s*(?:only\\s+)?print\\b/i.test(media)) return '';

    if (node.tagName.toLowerCase() !== 'link') {
      const style = node as HTMLStyleElement;
      const css = stripPrintMediaRules(style.textContent || '');
      return '<style>' + css.replace(/<\\/style/gi, '<\\\\/style') + '</style>';
    }

    const href = (node as HTMLLinkElement).href;
    try {
      const url = new URL(href, window.location.href);
      // Embed CORS-enabled remote stylesheets (notably Google Fonts), because
      // the isolated Cloudflare PDF browser cannot fetch network resources.
      const response = await fetch(url.href, {
        mode: 'cors',
        credentials: url.origin === window.location.origin ? 'same-origin' : 'omit',
      });
      if (!response.ok) return '';
      const sourceCss = await response.text();
      const css = stripPrintMediaRules(await inlineCssAssetUrls(sourceCss, url.href));
      return '<style>' + css.replace(/<\\/style/gi, '<\\\\/style') + '</style>';
    } catch {
      // Keep system fallbacks if an optional stylesheet blocks cross-origin access.
      return '';
    }
  }));
  return rendered.filter(Boolean).join('\\n');
}
async function buildPdfSheetsHtml(root: HTMLElement): Promise<string> {
  if (document.fonts?.ready) await document.fonts.ready.catch(() => undefined);
  const clone = root.cloneNode(true) as HTMLElement;
  // Export only the actual paginated sheets. Preview/edit visibility classes must
  // never hide a sheet or introduce a leading blank page in the PDF renderer.
  clone.classList.remove('hidden');
  clone.style.display = 'block';
  const exportSheets = Array.from(clone.querySelectorAll<HTMLElement>('.a4-print-sheet'));
  if (exportSheets.length === 0) {
    throw new Error('لم يتم العثور على صفحات الاختبار الجاهزة للتصدير.');
  }
  exportSheets.forEach((sheet) => {
    sheet.classList.remove('hidden');
    sheet.style.display = 'flex';
    sheet.style.visibility = 'visible';
    sheet.style.position = 'relative';
    sheet.style.breakBefore = 'auto';
    sheet.style.pageBreakBefore = 'auto';
    sheet.style.breakAfter = 'auto';
    sheet.style.pageBreakAfter = 'auto';
  });
  const sourceImages = Array.from(root.querySelectorAll('img'));
  const clonedImages = Array.from(clone.querySelectorAll('img'));

  // The server-side PDF renderer deliberately blocks every network request.
  // Inline every image before sending the document so the school logo and
  // question images survive export instead of disappearing in the saved PDF.
  await Promise.all(sourceImages.map(async (image, index) => {
    const target = clonedImages[index];
    if (!target) throw new Error('تعذر تجهيز صورة داخل ورقة الاختبار للتصدير.');

    await image.decode?.().catch(() => undefined);
    const source = image.currentSrc || image.src || image.getAttribute('src') || '';
    if (!source) {
      throw new Error(`تعذر تحميل الصورة: ${image.alt || 'صورة غير معروفة'}`);
    }

    if (/^data:image\//i.test(source)) {
      target.src = source;
    } else {
      try {
        const resolved = new URL(source, window.location.href);
        const sameOrigin = resolved.origin === window.location.origin;
        const response = await fetch(resolved.href, {
          mode: 'cors',
          credentials: sameOrigin ? 'same-origin' : 'omit',
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const blob = await response.blob();
        if (!blob.type.toLowerCase().startsWith('image/')) {
          throw new Error('المورد المسترجع ليس ملف صورة صالحاً.');
        }
        target.src = await blobToDataUrl(blob);
      } catch (error) {
        // Never silently create a PDF with a missing school logo or question image.
        throw new Error(
          `تعذر تضمين الصورة "${image.alt || 'داخل الاختبار'}" في ملف PDF. تحقق من رابط الصورة وإمكانية الوصول إليها ثم أعد التصدير.`
        );
      }
    }

    target.removeAttribute('srcset');
    target.removeAttribute('sizes');
    target.loading = 'eager';
    await target.decode?.().catch(() => {
      throw new Error(`تعذر فك ترميز الصورة "${image.alt || 'داخل الاختبار'}" قبل إنشاء PDF.`);
    });
  }));

  return clone.outerHTML;
}

interface ExamEditorViewProps {
  exam: Exam;
  initialStudioMode?: 'edit' | 'preview';
  onBack: () => void;
  onExamSaved?: (exam: Exam) => void;
}

const STUDIO_QUESTION_TYPES: StudioQuestionTypeOption[] = [
  { type: 'Multiple Choice', labelAr: 'اختيار من متعدد', labelEn: 'Multiple Choice' },
  { type: 'True or False', labelAr: 'صح أو خطأ', labelEn: 'True / False' },
  { type: 'Fill in the Blanks', labelAr: 'أكمل الفراغ', labelEn: 'Fill in Blanks' },
  { type: 'Matching', labelAr: 'المزاوجة / صل', labelEn: 'Matching' },
  { type: 'Short Answer', labelAr: 'إجابة قصيرة', labelEn: 'Short Answer' },
  { type: 'Term Definition', labelAr: 'المصطلح أو التعريف', labelEn: 'Term / Definition' },
  { type: 'Essay', labelAr: 'سؤال مقالي', labelEn: 'Essay' },
  { type: 'Quran Recitation', labelAr: 'حفظ وتسميع القرآن', labelEn: 'Quran Recitation' },
  { type: 'Quran Verse Completion', labelAr: 'إكمال الآيات الكريمة', labelEn: 'Verse Completion' },
  { type: 'Quran Meaning', labelAr: 'معاني المفردات القرآنية', labelEn: 'Quran Meanings' },
  { type: 'Quran Tafsir', labelAr: 'التفسير وفهم الآيات', labelEn: 'Quran Tafsir' },
  { type: 'Reading Comprehension', labelAr: 'نص وفهم المقروء', labelEn: 'Comprehension' },
  { type: 'Translation', labelAr: 'ترجمة', labelEn: 'Translation' },
  { type: 'Rearrange the Words', labelAr: 'ترتيب الكلمات/الجمل', labelEn: 'Rearrange' },
  { type: 'Complete the Sentences', labelAr: 'إكمال الجمل', labelEn: 'Complete Sentences' },
  { type: 'Mathematical Problem', labelAr: 'مسائل ومعادلات', labelEn: 'Math Problems' },
  { type: 'Table Diagram', labelAr: 'جداول ورسوم', labelEn: 'Tables & Diagrams' },
  { type: 'Image Question', labelAr: 'سؤال بصورة', labelEn: 'With Image' },
  { type: 'Custom', labelAr: 'سؤال حر / مخصص', labelEn: 'Custom' },
];

function computeExamFingerprint(
  exam: Exam,
  headerConfig: Exam['headerConfig'],
  layoutConfig: ExamLayoutConfig
): string {
  return JSON.stringify({
    subjectId: exam.subjectId,
    title: exam.title,
    titleAr: exam.titleAr,
    grade: exam.grade,
    term: exam.term,
    examDate: exam.examDate,
    category: exam.category,
    timeLimitMinutes: exam.timeLimitMinutes,
    totalMarks: exam.totalMarks,
    notes: exam.notes,
    sections: exam.sections,
    headerConfig,
    layoutConfig,
  });
}

export const ExamEditorView: React.FC<ExamEditorViewProps> = ({
  exam: initialExam,
  initialStudioMode = 'edit',
  onBack,
  onExamSaved,
}) => {
  const { user, schoolIdentity, hasAIAccess, subjects } = useAuth();
  const measurerRef = useRef<HTMLDivElement>(null);
  const printPagesRootRef = useRef<HTMLDivElement>(null);
  const centerColumnRef = useRef<HTMLElement>(null);

  const normalizeExamForEditor = useCallback(
    (raw: Exam): Exam => {
      const cloned: Exam = JSON.parse(JSON.stringify(raw));
      const profile = resolveSubjectPaperProfile(cloned.subjectId, subjects, cloned.headerConfig?.subject);
      const today = new Date().toISOString().slice(0, 10);
      const examDate = cloned.examDate || cloned.headerConfig?.examDate || today;
      const synced = applySubjectLanguageToExam(cloned, cloned.subjectId || (profile.isEnglishSubject ? 'subj-en' : 'subj-ar'), subjects, false);
      return {
        ...synced,
        examDate,
        headerConfig: {
          ...synced.headerConfig,
          examDate,
        },
      };
    },
    [subjects]
  );

  const [exam, setExam] = useState<Exam>(() => normalizeExamForEditor(initialExam));
  const [headerConfig, setHeaderConfig] = useState(() => normalizeExamForEditor(initialExam).headerConfig);
  const [layoutConfig, setLayoutConfig] = useState<ExamLayoutConfig>(() =>
    normalizeLayoutConfig(normalizeExamForEditor(initialExam).layoutConfig)
  );

  const [studioExperienceMode, setStudioExperienceMode] = useState<'easy' | 'advanced'>('easy');
  const [studioMode, setStudioMode] = useState<'edit' | 'preview'>(initialStudioMode);
  const [isAnswerKeyView, setIsAnswerKeyView] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'local_offline' | 'error'>('saved');
  const [pendingRecoveryDraft, setPendingRecoveryDraft] = useState<LocalExamDraftRecord | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(95);
  const [autoFitZoom, setAutoFitZoom] = useState<boolean>(true);
  const [centerContainerWidthPx, setCenterContainerWidthPx] = useState<number>(560);

  // Page preview navigation
  const [previewFilterMode, setPreviewFilterMode] = useState<'all' | 'single'>('all');
  const [currentPageNum, setCurrentPageNum] = useState<number>(1);

  // Mobile/Tablet collapsible panel drawers + desktop panel toggles
  const [mobileDrawer, setMobileDrawer] = useState<'none' | 'toolbar' | 'outline'>('none');
  const [showLeftPanel, setShowLeftPanel] = useState(true);
  const [showRightPanel, setShowRightPanel] = useState(true);

  const [targetSectionIdx, setTargetSectionIdx] = useState<number>(0);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [activeFormatQId, setActiveFormatQId] = useState<string | null>(null);
  const [activeSymbolQId, setActiveSymbolQId] = useState<string | null>(null);
  const [draggedItem, setDraggedItem] = useState<{ sIdx: number; qIdx: number } | null>(null);
  const [dragOverItem, setDragOverItem] = useState<{ sIdx: number; qIdx: number } | null>(null);

  // Private Saved Layout Templates
  const [savedTemplates, setSavedTemplates] = useState<LayoutTemplate[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);

  // Smart-fit notice
  const [fitFeedback, setFitFeedback] = useState<{
    status: 'idle' | 'fit' | 'overflow';
    message: string;
  }>({ status: 'idle', message: '' });

  // Measured Pagination Result
  const [measuredHeights, setMeasuredHeights] = useState<MeasuredHeights>({
    mainHeaderHeightPx: 195,
    runningHeaderHeightPx: 32,
    closingFooterHeightPx: 54,
    pageNumberBarHeightPx: 26,
    blocks: {},
  });

  // Bank import & sharing modals
  const [showBankModal, setShowBankModal] = useState(false);
  const [bankQuestions, setBankQuestions] = useState<Question[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [colleagues, setColleagues] = useState<{ id: string; name: string; username: string }[]>([]);
  const [shareUserId, setShareUserId] = useState('');
  const [sharePermission, setSharePermission] = useState<'view' | 'edit'>('view');

  const isPracticeSandbox =
    exam.id.startsWith('practice-sandbox-') || exam.code === 'PRACTICE-SAMPLE';

  const lastSavedFingerprintRef = useRef<string>(
    computeExamFingerprint(
      normalizeExamForEditor(initialExam),
      normalizeExamForEditor(initialExam).headerConfig,
      normalizeLayoutConfig(normalizeExamForEditor(initialExam).layoutConfig)
    )
  );
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const localDraftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextAutosaveRef = useRef<boolean>(true);

  // Sync when switching exams from list
  useEffect(() => {
    const normalized = normalizeExamForEditor(initialExam);
    const normLayout = normalizeLayoutConfig(normalized.layoutConfig);
    skipNextAutosaveRef.current = true;
    setExam(normalized);
    setHeaderConfig(normalized.headerConfig);
    setLayoutConfig(normLayout);
    setStudioMode(initialStudioMode);
    setTargetSectionIdx(0);
    setCurrentPageNum(1);
    setSelectedQuestionId(null);
    setFitFeedback({ status: 'idle', message: '' });
    setSaveStatus('saved');
    lastSavedFingerprintRef.current = computeExamFingerprint(normalized, normalized.headerConfig, normLayout);

    if (user?.id) {
      const localDraft = loadLocalExamDraft(user.id, normalized.id);
      if (hasRecoverableNewerDraft(localDraft, normalized.updatedAt)) {
        setPendingRecoveryDraft(localDraft);
      } else {
        setPendingRecoveryDraft(null);
      }
    }
  }, [initialExam.id, initialStudioMode, user?.id, normalizeExamForEditor]);

  // Load user's private saved layout templates
  const loadSavedTemplates = useCallback(async () => {
    setTemplatesLoading(true);
    try {
      const list = await api.getLayoutTemplates();
      setSavedTemplates(list);
    } catch {
      // ignore fetch issue quietly
    } finally {
      setTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSavedTemplates();
  }, [loadSavedTemplates]);

  const isReadOnlyPreview = studioMode === 'preview';

  // Compute total marks from actual questions
  const computedMarks = exam.sections
    .flatMap((s) => s.questions)
    .reduce((acc, q) => acc + (Number(q.marks) || 0), 0);
  const marksMismatch = computedMarks !== (Number(exam.totalMarks) || 0);

  const recalcSectionMarks = (sections: ExamSection[]): ExamSection[] =>
    sections.map((sec) => ({
      ...sec,
      marks: sec.questions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0),
    }));

  // Exact Printable Geometry for current paper/margins/border/columns
  const geometry = useMemo(() => getSheetGeometryPx(layoutConfig), [layoutConfig]);

  // Measure DOM elements at exact printable width whenever content/layout changes
  const measureDomBlocks = useCallback(() => {
    const root = measurerRef.current;
    if (!root) return;

    const getElHeight = (selector: string, fallback: number): number => {
      const el = root.querySelector(selector) as HTMLElement | null;
      if (!el) return fallback;
      const rect = el.getBoundingClientRect();
      return Math.ceil(rect.height || el.scrollHeight || fallback);
    };

    const mainHeaderHeightPx = getElHeight('[data-measure-role="main-header"]', 195);
    const runningHeaderHeightPx = getElHeight('[data-measure-role="running-header"]', 32);
    const closingFooterHeightPx = getElHeight('[data-measure-role="closing-footer"]', 54);
    const pageNumberBarHeightPx = getElHeight('[data-measure-role="page-num-bar"]', 26);

    const blocks: Record<string, number> = {};
    root.querySelectorAll('[data-measure-block-id]').forEach((node) => {
      const id = node.getAttribute('data-measure-block-id');
      if (id) {
        const rect = (node as HTMLElement).getBoundingClientRect();
        blocks[id] = Math.ceil(rect.height || (node as HTMLElement).scrollHeight || 48);
      }
    });

    setMeasuredHeights((prev) => {
      // Avoid redundant re-renders if identical
      const prevKeys = Object.keys(prev.blocks);
      const nextKeys = Object.keys(blocks);
      if (
        prev.mainHeaderHeightPx === mainHeaderHeightPx &&
        prev.runningHeaderHeightPx === runningHeaderHeightPx &&
        prev.closingFooterHeightPx === closingFooterHeightPx &&
        prev.pageNumberBarHeightPx === pageNumberBarHeightPx &&
        prevKeys.length === nextKeys.length &&
        nextKeys.every((k) => prev.blocks[k] === blocks[k])
      ) {
        return prev;
      }
      return {
        mainHeaderHeightPx,
        runningHeaderHeightPx,
        closingFooterHeightPx,
        pageNumberBarHeightPx,
        blocks,
      };
    });
  }, []);

  useLayoutEffect(() => {
    measureDomBlocks();
    const rafId = requestAnimationFrame(measureDomBlocks);
    const timer = setTimeout(measureDomBlocks, 160);
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(() => measureDomBlocks()).catch(() => {});
    }
    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [exam, headerConfig, layoutConfig, isAnswerKeyView, schoolIdentity, measureDomBlocks]);

  // Measure center column width so A4 Preview fits cleanly inside the 3-panel Studio without horizontal cropping
  useEffect(() => {
    const el = centerColumnRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = el.clientWidth;
      if (w > 100) setCenterContainerWidthPx(w);
    };
    updateWidth();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => updateWidth());
      ro.observe(el);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, [showLeftPanel, showRightPanel, studioMode]);

  // Compute deterministic paginated pages
  const pagination: PaginationComputationResult = useMemo(
    () => computeExamPagination(exam, layoutConfig, measuredHeights),
    [exam, layoutConfig, measuredHeights]
  );

  // Clamp current page when totalPages shrinks
  useEffect(() => {
    if (currentPageNum > pagination.totalPages) {
      setCurrentPageNum(Math.max(1, pagination.totalPages));
    }
  }, [pagination.totalPages, currentPageNum]);

  const updateLayoutConfig = (patch: Partial<ExamLayoutConfig>) => {
    setFitFeedback({ status: 'idle', message: '' });
    setLayoutConfig((prev) => normalizeLayoutConfig({ ...prev, ...patch }));
  };

  // Smart Fit to One Page: tries compact legible spacing & 2 columns without EVER going below 9.5pt
  const handleFitToOnePage = () => {
    const candidate1 = normalizeLayoutConfig({
      ...layoutConfig,
      preset: 'ONE_PAGE',
      paginationMode: 'one_page',
      orientation: 'portrait',
      marginTopMm: 7,
      marginBottomMm: 7,
      marginLeftMm: 9,
      marginRightMm: 9,
      borderPaddingMm: Math.min(layoutConfig.borderPaddingMm ?? 4, 2),
      fontSizePt: Math.max(MIN_SAFE_FONT_PT, Math.min(layoutConfig.fontSizePt, 10)),
      lineHeight: 1.24,
      questionGapPx: 6,
      sectionGapPx: 10,
      logoSize: 'sm',
      headerCompact: true,
    });
    setLayoutConfig(candidate1);
    setHeaderConfig((prev) => ({ ...prev, headerCompact: true }));

    setTimeout(() => {
      const check1 = computeExamPagination(exam, candidate1, measuredHeights);
      if (check1.totalPages === 1) {
        setFitFeedback({
          status: 'fit',
          message: `تم توفيق الاختبار بالكامل في صفحة A4 واحدة بخط واضح (${candidate1.fontSizePt}pt).`,
        });
        return;
      }

      // Try 2-column compact at safe minimum font 9.5pt
      const candidate2 = normalizeLayoutConfig({
        ...candidate1,
        columns: 2,
        columnGapPx: 14,
        fontSizePt: MIN_SAFE_FONT_PT,
        lineHeight: 1.2,
        questionGapPx: 5,
        sectionGapPx: 8,
      });
      setLayoutConfig(candidate2);

      setTimeout(() => {
        measureDomBlocks();
        setTimeout(() => {
          const check2 = computeExamPagination(exam, candidate2, measuredHeights);
          if (check2.totalPages === 1) {
            setFitFeedback({
              status: 'fit',
              message: `تم توفيق الاختبار في صفحة A4 واحدة بنظام العمودين وبحد الخط الآمن (${MIN_SAFE_FONT_PT}pt).`,
            });
          } else {
            setFitFeedback({
              status: 'overflow',
              message: `المحتوى يتجاوز سعة صفحة واحدة (${check2.totalPages} صفحات مطلوبة). حفاظاً على وضوح الخط وعدم قص الأسئلة، يُنصح بالتبديل إلى التوزيع التلقائي أو صفحتين.`,
            });
          }
        }, 90);
      }, 90);
    }, 100);
  };

  const handleApplyTemplate = (tpl: LayoutTemplate) => {
    const next = normalizeLayoutConfig(tpl.layoutConfig);
    setLayoutConfig(next);
    setHeaderConfig((prev) => ({ ...prev, headerCompact: next.headerCompact }));
    setFitFeedback({ status: 'idle', message: '' });
  };

  const handleSavePrivateTemplate = async (nameAr: string, description?: string) => {
    const res = await api.saveLayoutTemplate({
      name: nameAr,
      nameAr,
      description,
      layoutConfig,
    });
    if (res.success && res.template) {
      setSavedTemplates((prev) => [res.template, ...prev]);
    }
  };

  const handleDeletePrivateTemplate = async (id: string) => {
    if (!confirm('حذف قالب التنسيق الخاص هذا؟')) return;
    await api.deleteLayoutTemplate(id);
    setSavedTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handlePrint = () => {
    if (exam.id && !isPracticeSandbox) {
      api
        .logExamExport(exam.id, isAnswerKeyView ? 'TeacherAnswerKey' : 'StudentPaper')
        .catch(() => {});
    }
    window.print();
  };

  const handleExportPdf = async () => {
    if (!printPagesRootRef.current) return;
    setIsExportingPdf(true);
    setExportNotice(null);

    try {
      const sheetsHtml = await buildPdfSheetsHtml(printPagesRootRef.current);
      const headNodes = await buildPdfHeadStyles();

      const { widthMm, heightMm } = getPaperDimensionsMm(layoutConfig.orientation);
      const exportProfile = resolveSubjectPaperProfile(exam.subjectId, subjects, headerConfig.subject);
      const htmlDocument = `<!DOCTYPE html>
<html lang="${exportProfile.paperLanguage}" dir="${exportProfile.dir}">
<head>
  <meta charset="utf-8" />
  <title>${(exportProfile.paperLanguage === 'en' ? cleanSingleLanguageText(exam.title || exam.titleAr, 'en') : cleanSingleLanguageText(exam.titleAr || exam.title, 'ar') || 'Exam').replace(/</g, '&lt;')}</title>
  ${headNodes}
  <style>
    @page {
      size: A4 ${layoutConfig.orientation};
      margin: 0 !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #ffffff !important;
      width: ${widthMm}mm !important;
      height: auto !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .no-print { display: none !important; }
    .a4-print-pages-root {
      display: block !important;
      width: ${widthMm}mm !important;
      margin: 0 !important;
      padding: 0 !important;
      gap: 0 !important;
    }
    .a4-print-pages-root > .a4-print-sheet {
      display: flex !important;
      visibility: visible !important;
      width: ${widthMm}mm !important;
      height: ${heightMm}mm !important;
      min-height: ${heightMm}mm !important;
      margin: 0 !important;
      /* Keep each sheet's inline, configured margins from the pagination renderer. */
      box-sizing: border-box !important;
      box-shadow: none !important;
      border: none !important;
      zoom: 1 !important;
      transform: none !important;
      overflow: hidden !important;
      page-break-before: auto !important;
      break-before: auto !important;
      page-break-after: auto !important;
      break-after: auto !important;
      page-break-inside: avoid !important;
      break-inside: avoid-page !important;
    }
    /* Use exactly one page transition: before each sheet except the first. */
    .a4-print-pages-root > .a4-print-sheet ~ .a4-print-sheet {
      page-break-before: always !important;
      break-before: page !important;
    }
    .a4-print-pages-root > .a4-print-sheet:first-child {
      page-break-before: auto !important;
      break-before: auto !important;
    }
    .a4-print-pages-root > .a4-print-sheet:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
  </style>
</head>
<body>
  ${sheetsHtml}
</body>
</html>`;

      const mode: 'StudentPaper' | 'TeacherAnswerKey' = isAnswerKeyView
        ? 'TeacherAnswerKey'
        : 'StudentPaper';
      const filename = `${exam.code || 'qaflah-exam'}-${mode === 'TeacherAnswerKey' ? 'answer-key' : 'student'}.pdf`;

      const res = await api.exportExamPdf(exam.id, {
        htmlDocument,
        mode,
        orientation: layoutConfig.orientation,
        filename,
      });

      if (res.fallbackClientPrint) {
        setExportNotice('تم فتح طباعة المتصفح لأن محرك PDF الخادمي غير مفعل — اختر Save as PDF.');
        window.print();
      } else {
        setExportNotice(
          `تم تصدير ملف PDF بنجاح (${pagination.totalPages} ${pagination.totalPages === 1 ? 'صفحة' : 'صفحات'} · ${
            mode === 'TeacherAnswerKey' ? 'نموذج إجابة المعلم' : 'ورقة الطالب'
          }).`
        );
        setTimeout(() => setExportNotice(null), 4500);
      }
    } catch (err: any) {
      setExportNotice(err?.message || 'تعذر تصدير PDF');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const persistExamNow = useCallback(
    async (isManual = false): Promise<boolean> => {
      const mergedExam: Exam = {
        ...exam,
        examDate: exam.examDate || headerConfig.examDate,
        headerConfig: {
          ...headerConfig,
          examDate: exam.examDate || headerConfig.examDate,
          totalMarks: exam.totalMarks,
        },
        layoutConfig,
        updatedAt: new Date().toISOString(),
      };

      if (isPracticeSandbox) {
        if (user?.id) {
          saveLocalExamDraft({
            userId: user.id,
            examId: mergedExam.id,
            exam: mergedExam,
            headerConfig: mergedExam.headerConfig,
            layoutConfig,
            savedAt: new Date().toISOString(),
            pendingSync: false,
          });
        }
        lastSavedFingerprintRef.current = computeExamFingerprint(mergedExam, mergedExam.headerConfig, layoutConfig);
        setSaveStatus('saved');
        if (isManual) {
          setSaveSuccess(true);
          setTimeout(() => setSaveSuccess(false), 2500);
        }
        return true;
      }

      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        if (user?.id) {
          saveLocalExamDraft({
            userId: user.id,
            examId: mergedExam.id,
            exam: mergedExam,
            headerConfig: mergedExam.headerConfig,
            layoutConfig,
            savedAt: new Date().toISOString(),
            serverUpdatedAt: exam.updatedAt,
            pendingSync: true,
          });
        }
        setSaveStatus('local_offline');
        if (isManual) {
          setExportNotice('لا يوجد اتصال حالياً — تم حفظ التعديلات محلياً وستتم المزامنة فور عودة الاتصال.');
        }
        return false;
      }

      try {
        setIsSaving(true);
        setSaveStatus('saving');
        const res = await api.saveExam(mergedExam);
        if (res.success && res.exam) {
          const savedFp = computeExamFingerprint(
            res.exam,
            res.exam.headerConfig,
            normalizeLayoutConfig(res.exam.layoutConfig)
          );
          lastSavedFingerprintRef.current = savedFp;
          if (user?.id) clearLocalExamDraft(user.id, res.exam.id);
          setSaveStatus('saved');
          if (isManual) {
            skipNextAutosaveRef.current = true;
            setExam(res.exam);
            setHeaderConfig(res.exam.headerConfig);
            setSaveSuccess(true);
            setTimeout(() => setSaveSuccess(false), 3000);
            if (onExamSaved) onExamSaved(res.exam);
          }
          return true;
        }
        setSaveStatus('error');
        return false;
      } catch (e: any) {
        if (user?.id) {
          saveLocalExamDraft({
            userId: user.id,
            examId: mergedExam.id,
            exam: mergedExam,
            headerConfig: mergedExam.headerConfig,
            layoutConfig,
            savedAt: new Date().toISOString(),
            serverUpdatedAt: exam.updatedAt,
            pendingSync: true,
          });
        }
        setSaveStatus('local_offline');
        if (isManual) {
          setExportNotice(e.message || 'تعذر المزامنة مع الخادم — تم حفظ نسخة محلية بأمان.');
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [exam, headerConfig, layoutConfig, isPracticeSandbox, user?.id, onExamSaved]
  );

  const handleSave = () => persistExamNow(true);

  const handleSwitchSubject = (nextSubjectId: string) => {
    const prevProfile = resolveSubjectPaperProfile(exam.subjectId, subjects, headerConfig.subject);
    const profile = resolveSubjectPaperProfile(nextSubjectId, subjects);
    const curIsEn = headerConfig.headerLanguage === 'en';
    const nextIsEn = profile.paperLanguage === 'en';
    const isAutoSubjectTitle =
      (exam.titleAr || '').includes(`- مادة ${prevProfile.subjectNameAr}`) ||
      (exam.title || '').includes(prevProfile.subjectNameEn);
    const titleNeedsSwap =
      curIsEn !== nextIsEn ||
      isAutoSubjectTitle ||
      (nextIsEn ? /^[\u0600-\u06FF\s-]+$/.test(exam.title || '') : !/[\u0600-\u06FF]/.test(exam.titleAr || ''));

    const updated = applySubjectLanguageToExam(
      { ...exam, headerConfig, layoutConfig },
      nextSubjectId,
      subjects,
      titleNeedsSwap
    );

    // Align section default placeholders & question directions cleanly when crossing ar<->en
    const updatedSections = updated.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => ({
        ...q,
        subjectId: nextSubjectId,
        formatting: {
          ...q.formatting,
          dir: curIsEn !== nextIsEn ? profile.dir : q.formatting?.dir || profile.dir,
          align: curIsEn !== nextIsEn ? (nextIsEn ? 'left' : 'right') : q.formatting?.align || (nextIsEn ? 'left' : 'right'),
        },
      })),
    }));

    setExam({ ...updated, sections: updatedSections });
    setHeaderConfig(updated.headerConfig);
    setLayoutConfig(updated.layoutConfig!);
  };

  const handleResetPracticeSandbox = () => {
    if (!user) return;
    if (!confirm('إعادة النموذج التدريبي إلى حالته الأصلية؟')) return;
    const fresh = buildPracticeSandboxExam(user.name, user.id, exam.subjectId || 'subj-sci', subjects);
    clearLocalExamDraft(user.id, exam.id);
    setExam(fresh);
    setHeaderConfig(fresh.headerConfig);
    setLayoutConfig(normalizeLayoutConfig(fresh.layoutConfig));
  };

  const handlePromotePracticeToRealExam = async () => {
    try {
      setIsSaving(true);
      const profile = resolveSubjectPaperProfile(exam.subjectId, subjects);
      const newPayload: Partial<Exam> = {
        ...exam,
        id: undefined,
        code: `${profile.isEnglishSubject ? 'ENG' : 'EXM'}-${Date.now().toString().slice(-4)}`,
        title: exam.title.replace(/\s*\(Training Mode\)/i, ''),
        titleAr: exam.titleAr === 'اختبار تجريبي نموذجي للتدريب' ? `اختبار ${profile.subjectNameAr}` : exam.titleAr,
        headerConfig: { ...headerConfig, totalMarks: exam.totalMarks },
        layoutConfig,
        status: 'Draft',
      };
      const res = await api.saveExam(newPayload);
      if (res.success && res.exam) {
        if (user?.id) clearLocalExamDraft(user.id, exam.id);
        setExam(res.exam);
        setHeaderConfig(res.exam.headerConfig);
        setLayoutConfig(normalizeLayoutConfig(res.exam.layoutConfig));
        if (onExamSaved) onExamSaved(res.exam);
        setExportNotice('تم حفظ الاختبار كاختبار حقيقي في مكتبتك الخاصة بنجاح ✓');
      }
    } catch (e: any) {
      setExportNotice(e.message || 'تعذر حفظ الاختبار في المكتبة');
    } finally {
      setIsSaving(false);
    }
  };

  // Smart Debounced Autosave + Local Draft Persistence
  useEffect(() => {
    if (skipNextAutosaveRef.current) {
      skipNextAutosaveRef.current = false;
      return;
    }
    if (pendingRecoveryDraft) return; // Don't overwrite recoverable draft until user decides

    const currentFp = computeExamFingerprint(exam, headerConfig, layoutConfig);
    if (currentFp === lastSavedFingerprintRef.current) return;

    if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    localDraftTimerRef.current = setTimeout(() => {
      if (user?.id) {
        saveLocalExamDraft({
          userId: user.id,
          examId: exam.id,
          exam: { ...exam, headerConfig, layoutConfig },
          headerConfig,
          layoutConfig,
          savedAt: new Date().toISOString(),
          serverUpdatedAt: exam.updatedAt,
          pendingSync: !isPracticeSandbox,
        });
      }
    }, 300);

    autosaveTimerRef.current = setTimeout(() => {
      persistExamNow(false);
    }, 1400);

    return () => {
      if (localDraftTimerRef.current) clearTimeout(localDraftTimerRef.current);
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [exam, headerConfig, layoutConfig, user?.id, isPracticeSandbox, pendingRecoveryDraft, persistExamNow]);

  // Auto-sync queued local draft immediately when connection comes back online
  useEffect(() => {
    const handleOnline = () => {
      if (saveStatus === 'local_offline' && !isPracticeSandbox) {
        persistExamNow(false);
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [saveStatus, isPracticeSandbox, persistExamNow]);

  // Unsaved edits protection on browser close/reload
  useEffect(() => {
    const hasUnsaved =
      !isPracticeSandbox &&
      computeExamFingerprint(exam, headerConfig, layoutConfig) !== lastSavedFingerprintRef.current;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!hasUnsaved) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [exam, headerConfig, layoutConfig, isPracticeSandbox]);

  const handleSafeBack = async () => {
    const hasUnsaved =
      !isPracticeSandbox &&
      computeExamFingerprint(exam, headerConfig, layoutConfig) !== lastSavedFingerprintRef.current;

    if (hasUnsaved) {
      const ok = await persistExamNow(false);
      if (!ok) {
        if (!confirm('تعديلك محفوظ محلياً ولم يزامن مع الخادم بعد. هل تريد الرجوع للمكتبة الآن؟')) {
          return;
        }
      }
    }
    onBack();
  };

  // ==================== SECTION & QUESTION MUTATIONS ====================

  const addSection = () => {
    const isEn = headerConfig.headerLanguage === 'en';
    const nextIdx = exam.sections.length + 1;
    const newSec: ExamSection = {
      id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      sectionTitle: isEn
        ? `Section ${String.fromCharCode(64 + nextIdx)}: New Section`
        : `القسم ${nextIdx}: أسئلة جديدة`,
      instructions: isEn ? 'Answer the following questions:' : 'أجب عن الأسئلة التالية:',
      questionType: 'Multiple Choice',
      marks: 0,
      questions: [],
    };
    const nextSections = [...exam.sections, newSec];
    setExam({ ...exam, sections: nextSections });
    setTargetSectionIdx(nextSections.length - 1);
  };

  const deleteSection = (sIdx: number) => {
    if (exam.sections.length <= 1) {
      setExportNotice('يجب أن يحتوي الاختبار على قسم واحد على الأقل.');
      return;
    }
    if (!confirm('حذف هذا القسم وجميع أسئلته؟')) return;
    const next = exam.sections.filter((_, idx) => idx !== sIdx);
    setExam({ ...exam, sections: recalcSectionMarks(next) });
    setTargetSectionIdx(0);
  };

  const moveSection = (idx: number, dir: 'up' | 'down') => {
    const newSecs = [...exam.sections];
    const targetIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= newSecs.length) return;
    [newSecs[idx], newSecs[targetIdx]] = [newSecs[targetIdx], newSecs[idx]];
    setExam({ ...exam, sections: newSecs });
  };

  const updateSectionTitle = (idx: number, newTitle: string) => {
    const newSecs = [...exam.sections];
    newSecs[idx] = { ...newSecs[idx], sectionTitle: newTitle };
    setExam({ ...exam, sections: newSecs });
  };

  const updateSectionInstructions = (idx: number, newInst: string) => {
    const newSecs = [...exam.sections];
    newSecs[idx] = { ...newSecs[idx], instructions: newInst };
    setExam({ ...exam, sections: newSecs });
  };

  const toggleSectionFlag = (sIdx: number, field: 'startOnNewPage' | 'pageBreakAfter', value: boolean) => {
    const newSecs = [...exam.sections];
    newSecs[sIdx] = { ...newSecs[sIdx], [field]: value };
    setExam({ ...exam, sections: newSecs });
  };

  const createTemplateQuestion = (type: QuestionType): Question => {
    const subjectProfile = resolveSubjectPaperProfile(exam.subjectId, subjects, headerConfig.subject);
    const isLtrSubject = subjectProfile.paperLanguage === 'en';
    const defaultDir: 'rtl' | 'ltr' = subjectProfile.dir;
    const base: Question = {
      id: `q-man-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      ownerId: user?.id,
      subjectId: exam.subjectId || 'subj-ar',
      grade: exam.grade,
      unitId: 'manual',
      type,
      difficulty: 'Medium',
      marks: 2,
      questionText: '',
      modelAnswer: '',
      keepTogether: true,
      source: 'Teacher Manual',
      sourceCode: 'TEACHER_MANUAL',
      formatting: { dir: defaultDir, align: isLtrSubject ? 'left' : 'right' },
      createdAt: new Date().toISOString(),
    };

    switch (type) {
      case 'Multiple Choice':
        base.questionText = isLtrSubject ? 'Choose the correct answer: ______' : 'اختر الإجابة الصحيحة مما يلي:';
        base.options = isLtrSubject
          ? ['Option A', 'Option B', 'Option C', 'Option D']
          : ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث', 'الخيار الرابع'];
        base.modelAnswer = base.options[0];
        break;
      case 'True or False':
        base.questionText = isLtrSubject ? 'Put (True) or (False) for the statement:' : 'ضع علامة (صح) أو (خطأ) أمام العبارة التالية:';
        base.options = isLtrSubject ? ['True', 'False'] : ['صح (✓)', 'خطأ (✗)'];
        base.modelAnswer = base.options[0];
        break;
      case 'Fill in the Blanks':
        base.questionText = isLtrSubject ? 'Complete the blank with the suitable word: ____________' : 'أكمل الفراغ بالكلمة المناسبة: ____________';
        base.modelAnswer = isLtrSubject ? 'Sample word' : 'الكلمة الصحيحة';
        break;
      case 'Matching':
        base.questionText = isLtrSubject ? 'Match Column (A) with Column (B):' : 'صل بين العمود (أ) وما يناسبه في العمود (ب):';
        base.matchingPairs = [
          { left: isLtrSubject ? 'Item 1' : 'العنصر 1', right: isLtrSubject ? 'Match 1' : 'المقابل 1' },
          { left: isLtrSubject ? 'Item 2' : 'العنصر 2', right: isLtrSubject ? 'Match 2' : 'المقابل 2' },
        ];
        base.modelAnswer = '1 -> A, 2 -> B';
        break;
      case 'Term Definition':
        base.questionText = isLtrSubject
          ? 'Write the scientific term / definition for the following:'
          : 'اكتب المصطلح العلمي (أو التعريف) الدال على العبارة التالية:';
        base.answerSpaceLines = 1;
        base.modelAnswer = isLtrSubject ? 'Defined term' : 'المصطلح الصحيح';
        break;
      case 'Reading Comprehension':
        base.passage = isLtrSubject ? 'Write or paste the reading passage here...' : 'اكتب أو الصق نص القراءة والاستيعاب هنا...';
        base.questionText = isLtrSubject ? 'Answer the following comprehension questions:' : 'اقرأ النص السابق ثم أجب عن الأسئلة التالية:';
        base.answerSpaceLines = 3;
        base.marks = 4;
        base.modelAnswer = isLtrSubject ? 'Model answer from passage' : 'الإجابة النموذجية من النص';
        break;
      case 'Rearrange the Words':
        base.questionText = isLtrSubject ? 'Rearrange the words to make a sentence:' : 'رتب الكلمات التالية لتكوين جملة صحيحة:';
        base.scrambledWords = isLtrSubject ? ['school', 'to', 'goes', 'Ali'] : ['المدرسة', 'إلى', 'يذهب', 'علي'];
        base.answerSpaceLines = 1;
        base.modelAnswer = isLtrSubject ? 'Ali goes to school.' : 'يذهب علي إلى المدرسة.';
        break;
      case 'Mathematical Problem':
        base.questionText = isLtrSubject ? 'Solve the following mathematical problem:' : 'أوجد ناتج المسألة الرياضية التالية:';
        base.mathFormula = '2x + 5 = 15  ⟹  x = ?';
        base.answerSpaceLines = 3;
        base.marks = 3;
        base.modelAnswer = 'x = 5';
        break;
      case 'Table Diagram':
        base.questionText = isLtrSubject ? 'Complete the table below:' : 'ادرس الجدول التالي ثم أكمل البيانات الناقصة:';
        base.tableData = {
          headers: isLtrSubject ? ['Concept', 'Definition', 'Example'] : ['المفهوم', 'التعريف', 'المثال'],
          rows: [['', '', ''], ['', '', '']],
        };
        base.modelAnswer = isLtrSubject ? 'Completed table values' : 'بيانات الجدول المكتملة';
        break;
      case 'Image Question':
        base.questionText = isLtrSubject ? 'Look at the picture and answer:' : 'تأمل الشكل المرفق ثم أجب عن السؤال:';
        base.imageCaption = isLtrSubject ? 'Figure (1)' : 'شكل توضيحي (1)';
        base.imageWidthPercent = 60;
        base.answerSpaceLines = 2;
        base.modelAnswer = isLtrSubject ? 'Answer based on image' : 'الإجابة المعتمدة على الشكل';
        break;
      case 'Quran Recitation':
        base.surahName = 'سورة ...';
        base.ayahRange = 'من الآية (...) إلى الآية (...)';
        base.preserveDiacritics = true;
        base.formatting = { dir: 'rtl', align: 'right' };
        base.questionText = 'اكتب من حفظك الآيات الكريمة الآتية مع الضبط بالشكل الصحيح:';
        base.answerSpaceLines = 5;
        base.marks = 5;
        base.modelAnswer = 'النص القرآني المعتمد من المصحف الشريف حسب المقرر.';
        break;
      case 'Quran Verse Completion':
        base.surahName = 'سورة ...';
        base.ayahRange = 'الآيات (...)';
        base.preserveDiacritics = true;
        base.formatting = { dir: 'rtl', align: 'right' };
        base.questionText = 'أكمل الآيات الكريمة التالية واضبطها بالشكل الصحيح:\nبِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ ۝ ...';
        base.answerSpaceLines = 4;
        base.marks = 4;
        base.modelAnswer = 'الآيات الكريمة كاملة بالتشكيل الصحيح.';
        break;
      case 'Quran Meaning':
        base.surahName = 'سورة ...';
        base.preserveDiacritics = true;
        base.formatting = { dir: 'rtl', align: 'right' };
        base.questionText = 'بيّن معاني الكلمات القرآنية الآتية:\n1) ...\n2) ...';
        base.answerSpaceLines = 3;
        base.marks = 3;
        base.modelAnswer = 'المعاني الصحيحة.';
        break;
      case 'Quran Tafsir':
        base.surahName = 'سورة ...';
        base.preserveDiacritics = true;
        base.formatting = { dir: 'rtl', align: 'right' };
        base.questionText = 'اشرح المعنى الإجمالي للآية الكريمة التالية:';
        base.answerSpaceLines = 3;
        base.marks = 3;
        base.modelAnswer = 'التفسير الإجمالي الصحيح.';
        break;
      case 'Essay':
        base.questionText = isLtrSubject ? 'Write a short essay about:' : 'اكتب مقالاً / موضوعاً مفصلاً حول:';
        base.answerSpaceLines = 5;
        base.marks = 5;
        base.modelAnswer = isLtrSubject ? 'Key essay points' : 'عناصر الإجابة المقالية';
        break;
      default:
        base.questionText = isLtrSubject ? `Answer the following (${type}):` : 'اكتب نص السؤال هنا:';
        base.answerSpaceLines = type === 'Short Answer' || type === 'Translation' ? 2 : 1;
        base.modelAnswer = isLtrSubject ? 'Model Answer' : 'الإجابة النموذجية';
        break;
    }

    return base;
  };

  const addQuestionToSection = (type: QuestionType, secIdx = targetSectionIdx) => {
    const newSecs = [...exam.sections];
    const validIdx = Math.min(Math.max(0, secIdx), newSecs.length - 1);
    const newQ = createTemplateQuestion(type);
    newSecs[validIdx].questions.push(newQ);
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
    setSelectedQuestionId(newQ.id);
    setActiveFormatQId(newQ.id);
    setStudioMode('edit');
  };

  const updateQuestion = (sIdx: number, qIdx: number, patch: Partial<Question>) => {
    const newSecs = [...exam.sections];
    newSecs[sIdx].questions[qIdx] = { ...newSecs[sIdx].questions[qIdx], ...patch };
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
  };

  const duplicateQuestion = (sIdx: number, qIdx: number) => {
    const newSecs = [...exam.sections];
    const copy: Question = {
      ...JSON.parse(JSON.stringify(newSecs[sIdx].questions[qIdx])),
      id: `q-copy-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
    };
    newSecs[sIdx].questions.splice(qIdx + 1, 0, copy);
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
  };

  const moveQuestion = (sIdx: number, qIdx: number, dir: 'up' | 'down') => {
    const newSecs = [...exam.sections];
    const targetIdx = dir === 'up' ? qIdx - 1 : qIdx + 1;
    if (targetIdx < 0 || targetIdx >= newSecs[sIdx].questions.length) return;
    const qs = [...newSecs[sIdx].questions];
    [qs[qIdx], qs[targetIdx]] = [qs[targetIdx], qs[qIdx]];
    newSecs[sIdx].questions = qs;
    setExam({ ...exam, sections: newSecs });
  };

  const moveQuestionToSection = (fromSIdx: number, qIdx: number, toSIdx: number) => {
    if (fromSIdx === toSIdx) return;
    const newSecs = [...exam.sections];
    const [moved] = newSecs[fromSIdx].questions.splice(qIdx, 1);
    newSecs[toSIdx].questions.push(moved);
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
  };

  // Moves question across pages cleanly (push forward with pageBreakBefore or pull backward across boundary)
  const handleMoveQuestionToPage = (sIdx: number, qIdx: number, targetPage: number) => {
    const q = exam.sections[sIdx]?.questions[qIdx];
    if (!q) return;
    const currentPage = pagination.questionPageMap[q.id] || 1;
    const newSecs: ExamSection[] = JSON.parse(JSON.stringify(exam.sections));

    if (targetPage > currentPage) {
      newSecs[sIdx].questions[qIdx].pageBreakBefore = true;
      setExam({ ...exam, sections: newSecs });
      return;
    }

    if (targetPage < currentPage) {
      // Clear pageBreakBefore if set on this question or section
      if (newSecs[sIdx].questions[qIdx].pageBreakBefore) {
        newSecs[sIdx].questions[qIdx].pageBreakBefore = false;
        setExam({ ...exam, sections: newSecs });
        return;
      }
      if (qIdx === 0 && newSecs[sIdx].startOnNewPage) {
        newSecs[sIdx].startOnNewPage = false;
        setExam({ ...exam, sections: newSecs });
        return;
      }
      // Clear pageBreakAfter on immediate predecessor if present
      if (qIdx > 0 && newSecs[sIdx].questions[qIdx - 1].pageBreakAfter) {
        newSecs[sIdx].questions[qIdx - 1].pageBreakAfter = false;
        setExam({ ...exam, sections: newSecs });
        return;
      }
      if (qIdx === 0 && sIdx > 0 && newSecs[sIdx - 1].pageBreakAfter) {
        newSecs[sIdx - 1].pageBreakAfter = false;
        setExam({ ...exam, sections: newSecs });
        return;
      }
      // Otherwise reorder upward inside section or previous section so it moves toward earlier page
      if (qIdx > 0) {
        const qs = newSecs[sIdx].questions;
        [qs[qIdx], qs[qIdx - 1]] = [qs[qIdx - 1], qs[qIdx]];
        setExam({ ...exam, sections: newSecs });
      } else if (sIdx > 0) {
        const [moved] = newSecs[sIdx].questions.splice(qIdx, 1);
        newSecs[sIdx - 1].questions.push(moved);
        setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
      }
    }
  };

  const handleDropQuestion = (toSIdx: number, toQIdx: number) => {
    if (!draggedItem) return;
    const { sIdx: fromSIdx, qIdx: fromQIdx } = draggedItem;
    if (fromSIdx === toSIdx && fromQIdx === toQIdx) {
      setDraggedItem(null);
      setDragOverItem(null);
      return;
    }
    const newSecs = [...exam.sections];
    const [moved] = newSecs[fromSIdx].questions.splice(fromQIdx, 1);
    newSecs[toSIdx].questions.splice(toQIdx, 0, moved);
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
    setDraggedItem(null);
    setDragOverItem(null);
  };

  const deleteQuestion = (sIdx: number, qIdx: number) => {
    if (!confirm('حذف هذا السؤال من ورقة الاختبار؟')) return;
    const newSecs = [...exam.sections];
    newSecs[sIdx].questions.splice(qIdx, 1);
    setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
  };

  const handleUploadQuestionImage = async (sIdx: number, qIdx: number, file: File) => {
    try {
      const question = exam.sections[sIdx]?.questions[qIdx];
      if (!question || !user?.id) throw new Error('تعذر تحديد السؤال أو المستخدم الحالي.');
      const imageDataUrl = await prepareQuestionImage(file);
      const uploaded = await api.uploadQuestionImage(question.id, imageDataUrl);
      if (question.imageStorageId) {
        await api.deleteQuestionImage(question.imageStorageId).catch(() => undefined);
      }
      updateQuestion(sIdx, qIdx, {
        imageDataUrl: undefined,
        imageStorageId: uploaded.image.id,
        imageWidthPercent: question.imageWidthPercent || 60,
        keepTogether: true,
      });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'تعذر رفع الصورة إلى التخزين الآمن.');
    }
  };

  const handleApplyDefaultAnswerLinesToAll = (lines: number) => {
    const clamped = Math.max(0, Math.min(10, lines));
    const newSecs = exam.sections.map((sec) => ({
      ...sec,
      questions: sec.questions.map((q) => ({ ...q, answerSpaceLines: clamped })),
    }));
    setExam({ ...exam, sections: newSecs });
  };

  const openBankImport = async () => {
    setShowBankModal(true);
    setBankLoading(true);
    try {
      const list = await api.getQuestions({ subjectId: exam.subjectId });
      setBankQuestions(list);
    } catch (e) {
      console.error(e);
    } finally {
      setBankLoading(false);
    }
  };

  const openShareModal = async () => {
    setShowShareModal(true);
    try {
      const list = await api.getColleagues();
      setColleagues(list);
      if (list.length > 0 && !shareUserId) setShareUserId(list[0].id);
    } catch (e) {
      console.error(e);
    }
  };

  const handleGrantShare = async () => {
    if (!shareUserId) return;
    try {
      const res = await api.shareExam(exam.id, shareUserId, sharePermission);
      if (res.success && res.exam) setExam(res.exam);
    } catch (e: any) {
      setExportNotice(e.message || 'تعذر مشاركة الاختبار');
    }
  };

  const handleRevokeShare = async (targetUserId: string) => {
    try {
      const res = await api.revokeExamShare(exam.id, targetUserId);
      if (res.success && res.exam) setExam(res.exam);
    } catch (e: any) {
      setExportNotice(e.message || 'تعذر إلغاء المشاركة');
    }
  };

  const toggleFormat = (sIdx: number, qIdx: number, key: keyof QuestionFormatting, value: any) => {
    const q = exam.sections[sIdx].questions[qIdx];
    const current = q.formatting || {};
    updateQuestion(sIdx, qIdx, { formatting: { ...current, [key]: value } });
  };

  const insertSymbolToQuestion = (sIdx: number, qIdx: number, symbol: string) => {
    const q = exam.sections[sIdx].questions[qIdx];
    updateQuestion(sIdx, qIdx, { questionText: `${q.questionText}${symbol}` });
  };

  const handleOutlineSelectQuestion = (qId: string, pageNum?: number) => {
    setSelectedQuestionId(qId);
    setMobileDrawer('none');
    if (studioMode === 'preview' && pageNum) {
      setCurrentPageNum(pageNum);
      setTimeout(() => {
        const sheetEl = document.querySelector(`[data-page-number="${pageNum}"]`);
        sheetEl?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 60);
    } else {
      const el = document.getElementById(`studio-q-${qId}`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  };

  const { widthMm } = getPaperDimensionsMm(layoutConfig.orientation);
  const paperWidthPx = widthMm * 3.7795275591;
  const fitZoomPct = Math.max(
    30,
    Math.min(100, Math.floor(((centerContainerWidthPx - 20) / paperWidthPx) * 100))
  );
  const effectivePreviewZoom = studioMode === 'preview' && autoFitZoom ? fitZoomPct : zoomLevel;
  const paperProfile = resolveSubjectPaperProfile(exam.subjectId, subjects, headerConfig.subject);
  const isEnglishPaper = paperProfile.paperLanguage === 'en';
  const paperDir: 'rtl' | 'ltr' = paperProfile.dir;
  const fontCss = getFontFamilyCss(layoutConfig.fontFamily);
  const editBorderStyles = getBorderStyles(layoutConfig);

  const sharedCallbacks = {
    onSelectQuestion: (qId: string) => setSelectedQuestionId(qId),
    onUpdateSectionTitle: updateSectionTitle,
    onUpdateSectionInstructions: updateSectionInstructions,
    onMoveSection: moveSection,
    onDeleteSection: deleteSection,
    onUpdateQuestion: updateQuestion,
    onMoveQuestion: moveQuestion,
    onMoveQuestionToSection: moveQuestionToSection,
    onDuplicateQuestion: duplicateQuestion,
    onDeleteQuestion: deleteQuestion,
    onToggleFormat: toggleFormat,
    onInsertSymbol: insertSymbolToQuestion,
    onUploadImage: handleUploadQuestionImage,
    setActiveFormatQId,
    setActiveSymbolQId,
    onDragStart: (sIdx: number, qIdx: number) => setDraggedItem({ sIdx, qIdx }),
    onDragOver: (sIdx: number, qIdx: number) => setDragOverItem({ sIdx, qIdx }),
    onDrop: handleDropQuestion,
    onDragEnd: () => {
      setDraggedItem(null);
      setDragOverItem(null);
    },
  };

  return (
    <div className="space-y-3 pb-10 lg:pb-6 print:space-y-0 print:pb-0">
      {/* Dynamic @page Size & Zero-Margin Print Rules (Sheets carry their exact padding/borders) */}
      <style>{`
        @media print {
          @page {
            size: A4 ${layoutConfig.orientation};
            margin: 0 !important;
          }
        }
      `}</style>

      {/* ========================================================
          OFF-SCREEN DOM MEASURER (Exact width, font, spacing as A4 sheet)
      ======================================================== */}
      <div
        ref={measurerRef}
        aria-hidden="true"
        dir={paperDir}
        style={{
          position: 'fixed',
          left: '-99999px',
          top: 0,
          visibility: 'hidden',
          pointerEvents: 'none',
          width: `${geometry.innerWidthPx}px`,
          fontFamily: fontCss,
          fontSize: `${layoutConfig.fontSizePt}pt`,
          lineHeight: layoutConfig.lineHeight === 1.45 ? 1.32 : layoutConfig.lineHeight,
        }}
      >
        <div data-measure-role="main-header">
          <OfficialSchoolHeader
            headerConfig={headerConfig}
            subjectId={exam.subjectId}
            examTitle={exam.title}
            examTitleAr={exam.titleAr}
            schoolIdentity={schoolIdentity}
            timeLimitMinutes={exam.timeLimitMinutes}
            totalMarks={exam.totalMarks}
            grade={exam.grade}
            examDate={exam.examDate || headerConfig.examDate}
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
            className={`text-[0.84em] border-b ${
              layoutConfig.headerCompact ? 'mb-2 pb-1' : 'mb-3 pb-1.5'
            }`}
          >
            *{' '}
            {isEnglishPaper
              ? headerConfig.notes || 'Answer all questions clearly and legibly.'
              : headerConfig.notes || 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'}
          </div>
        </div>

        <div
          data-measure-role="running-header"
          className="mb-2.5 pb-1 border-b text-[0.8em] font-bold"
        >
          {isEnglishPaper
            ? `${schoolIdentity?.schoolNameEn || 'QAFLAH SCHOOL'} — ${cleanSingleLanguageText(exam.title || exam.titleAr, 'en')}`
            : `${schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'} — ${cleanSingleLanguageText(exam.titleAr || exam.title, 'ar')}`}
        </div>

        <div
          data-measure-role="closing-footer"
          className="pt-1.5 border-t-2 text-[0.82em] flex justify-between"
        >
          {isEnglishPaper ? (
            <>
              <span>Prepared by: {headerConfig.teacherName || exam.createdByName}</span>
              <span>Good Luck</span>
              <span>School Principal</span>
            </>
          ) : (
            <>
              <span>إعداد: {headerConfig.teacherName || exam.createdByName}</span>
              <span>بالتوفيق والنجاح</span>
              <span>مدير المدرسة</span>
            </>
          )}
        </div>

        <div
          data-measure-role="page-num-bar"
          className="mt-1.5 pt-1 border-t text-[0.74em]"
        >
          {isEnglishPaper ? 'Page 1 of 1' : 'صفحة 1 من 1'}
        </div>

        <div style={{ width: `${geometry.columnWidthPx}px` }}>
          {exam.sections.map((sec, sIdx) => (
            <div key={sec.id}>
              <div data-measure-block-id={`measure-sec-head-${sIdx}`}>
                <SectionHeaderBlockView
                  exam={exam}
                  section={sec}
                  sIdx={sIdx}
                  layoutConfig={layoutConfig}
                  readOnly={true}
                />
              </div>
              {sec.questions.map((q, qIdx) => (
                <React.Fragment key={q.id}>
                  {q.passage !== undefined && (
                    <div data-measure-block-id={`measure-passage-${sIdx}-${qIdx}`}>
                      <PassageBlockView
                        passage={q.passage}
                        sIdx={sIdx}
                        qIdx={qIdx}
                        readOnly={true}
                      />
                    </div>
                  )}
                  <div data-measure-block-id={`measure-q-${sIdx}-${qIdx}`}>
                    <QuestionCardBlockView
                      exam={exam}
                      section={sec}
                      sIdx={sIdx}
                      q={q}
                      qIdx={qIdx}
                      layoutConfig={layoutConfig}
                      isAnswerKeyView={isAnswerKeyView}
                      readOnly={true}
                    />
                  </div>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================
          STUDIO TOP COMMAND BAR (Hidden in Print)
      ======================================================== */}
      <div className="no-print bg-white p-3 sm:p-3.5 rounded-2xl border border-slate-200 shadow-xs lg:sticky lg:top-16 z-20 space-y-2.5">
        {/* Practice Sample Sandbox Banner */}
        {isPracticeSandbox && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-emerald-950">
              <Sparkles className="w-4 h-4 text-[#1B5E3A] shrink-0" />
              <span>
                <strong>وضع التدريب الآمن:</strong> هذا نموذج تدريبي لتجربة التحرير والطباعة دون التأثير على مكتبة اختباراتك الحقيقية.
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleResetPracticeSandbox}
                className="px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg font-bold flex items-center gap-1"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط</span>
              </button>
              <button
                type="button"
                onClick={handlePromotePracticeToRealExam}
                className="px-3 py-1.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-lg font-extrabold flex items-center gap-1"
              >
                <BookmarkPlus className="w-3.5 h-3.5" />
                <span>حفظ كاختبار حقيقي في مكتبتي</span>
              </button>
            </div>
          </div>
        )}

        {/* Local Draft Recovery Banner */}
        {pendingRecoveryDraft && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-amber-950">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                توجد مسودة محلية غير متزامنة أحدث محفوظة على هذا الجهاز بتاريخ{' '}
                <strong className="font-mono">{new Date(pendingRecoveryDraft.savedAt).toLocaleString('ar-YE')}</strong>. هل تريد استرجاعها؟
              </span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const recovered = normalizeExamForEditor(pendingRecoveryDraft.exam);
                  setExam(recovered);
                  setHeaderConfig(pendingRecoveryDraft.headerConfig || recovered.headerConfig);
                  setLayoutConfig(normalizeLayoutConfig(pendingRecoveryDraft.layoutConfig || recovered.layoutConfig));
                  setPendingRecoveryDraft(null);
                  setSaveStatus('local_offline');
                  setExportNotice('تم استرجاع المسودة المحلية بنجاح.');
                }}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold"
              >
                استرجاع المسودة
              </button>
              <button
                type="button"
                onClick={() => {
                  if (user?.id) clearLocalExamDraft(user.id, exam.id);
                  setPendingRecoveryDraft(null);
                }}
                className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold"
              >
                تجاهل
              </button>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={handleSafeBack}
              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors shrink-0 touch-target-min"
            >
              ← رجوع
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-sm font-extrabold text-slate-900 truncate max-w-[210px] sm:max-w-md">
                  {isEnglishPaper
                    ? cleanSingleLanguageText(exam.title || exam.titleAr, 'en')
                    : cleanSingleLanguageText(exam.titleAr || exam.title, 'ar')}
                </h1>
                {/* Live Autosave Status Badge */}
                <span
                  data-testid="autosave-status"
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                    saveStatus === 'saving'
                      ? 'bg-blue-50 text-blue-700 border-blue-200'
                      : saveStatus === 'local_offline'
                      ? 'bg-amber-50 text-amber-800 border-amber-300'
                      : saveStatus === 'error'
                      ? 'bg-rose-50 text-rose-700 border-rose-200'
                      : 'bg-emerald-50 text-[#1B5E3A] border-emerald-200'
                  }`}
                >
                  {saveStatus === 'local_offline' ? (
                    <>
                      <WifiOff className="w-3 h-3" />
                      <span>محفوظ محلياً — ستتم المزامنة</span>
                    </>
                  ) : saveStatus === 'saving' ? (
                    <>
                      <Cloud className="w-3 h-3 animate-pulse" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : saveStatus === 'error' ? (
                    <span>تعذر الحفظ</span>
                  ) : (
                    <>
                      <CheckCircle className="w-3 h-3" />
                      <span>تم الحفظ تلقائياً</span>
                    </>
                  )}
                </span>
              </div>
              <div className="text-[11px] text-slate-600 flex flex-wrap items-center gap-2 mt-0.5 tabular-nums">
                <span>
                  المادة: <strong>{paperProfile.subjectNameAr}</strong> ({isEnglishPaper ? 'English LTR' : 'عربي RTL'})
                </span>
                <span>·</span>
                <span>
                  الدرجات:{' '}
                  <strong className={marksMismatch ? 'text-rose-700' : 'text-[#1B5E3A]'}>
                    {computedMarks} / {exam.totalMarks}
                  </strong>
                </span>
                <span>·</span>
                <span>
                  الصفحات: <strong className="text-slate-900">{pagination.totalPages} A4</strong>
                </span>
              </div>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            {/* Student Paper vs Teacher Answer Key */}
            <button
              type="button"
              onClick={() => setIsAnswerKeyView(!isAnswerKeyView)}
              className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors touch-target-min border ${
                isAnswerKeyView
                  ? 'bg-purple-50 text-purple-950 border-purple-300'
                  : 'bg-emerald-50 text-[#1B5E3A] border-emerald-200'
              }`}
            >
              {isAnswerKeyView ? (
                <>
                  <Eye className="w-4 h-4 shrink-0" />
                  <span>نموذج إجابة المعلم</span>
                </>
              ) : (
                <>
                  <EyeOff className="w-4 h-4 shrink-0" />
                  <span>ورقة الطالب</span>
                </>
              )}
            </button>

            {!isPracticeSandbox && (
              <button
                type="button"
                onClick={openShareModal}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 touch-target-min"
                title="مشاركة اختيارية"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">مشاركة</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors disabled:opacity-50 touch-target-min"
            >
              <Save className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>{isSaving ? 'حفظ...' : saveSuccess ? 'تم الحفظ!' : 'حفظ'}</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-900 border border-slate-300 rounded-xl text-xs font-bold flex items-center gap-1.5 touch-target-min"
            >
              <Printer className="w-4 h-4 shrink-0" />
              <span>طباعة</span>
            </button>

            <button
              type="button"
              onClick={handleExportPdf}
              disabled={isExportingPdf}
              className="px-4 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5 shadow-sm transition-colors disabled:opacity-60 touch-target-min"
            >
              <FileDown className="w-4 h-4 shrink-0" />
              <span>{isExportingPdf ? 'جاري إنشاء PDF...' : 'تصدير PDF'}</span>
            </button>
          </div>
        </div>

        {/* Sub-Bar: Easy/Advanced Switcher + Edit/Preview + Drawers + Zoom */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            {/* Easy vs Advanced Studio Mode Toggle */}
            <div className="flex items-center gap-1 p-1 bg-emerald-50 border border-emerald-200 rounded-xl">
              <button
                type="button"
                onClick={() => {
                  setStudioExperienceMode('easy');
                  setStudioMode('edit');
                }}
                className={`px-3 py-1.5 rounded-lg font-extrabold text-xs transition-colors ${
                  studioExperienceMode === 'easy'
                    ? 'bg-[#1B5E3A] text-white shadow-2xs'
                    : 'text-[#1B5E3A] hover:bg-emerald-100/70'
                }`}
              >
                الوضع السهل (للمبتدئين)
              </button>
              <button
                type="button"
                onClick={() => setStudioExperienceMode('advanced')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs transition-colors ${
                  studioExperienceMode === 'advanced'
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'text-slate-700 hover:bg-white'
                }`}
              >
                الوضع المتقدم (التنسيق الكامل)
              </button>
            </div>

            {/* Edit vs Preview Mode */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl">
              <button
                type="button"
                onClick={() => setStudioMode('edit')}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${
                  studioMode === 'edit' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>تحرير</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setStudioMode('preview');
                  setPreviewFilterMode('all');
                }}
                className={`px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1.5 transition-colors ${
                  studioMode === 'preview' ? 'bg-white text-slate-950 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                <span>معاينة الصفحات ({pagination.totalPages})</span>
              </button>
            </div>

            {/* Mobile/Tablet Drawer Triggers (< xl) — only in Advanced Mode */}
            {studioExperienceMode === 'advanced' && (
              <div className="flex xl:hidden items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMobileDrawer(mobileDrawer === 'toolbar' ? 'none' : 'toolbar')}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 flex items-center gap-1 touch-target-min"
                >
                  <Sliders className="w-3.5 h-3.5 text-[#1B5E3A]" />
                  <span>الأدوات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMobileDrawer(mobileDrawer === 'outline' ? 'none' : 'outline')}
                  className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-bold text-slate-800 flex items-center gap-1 touch-target-min"
                >
                  <ListTree className="w-3.5 h-3.5 text-[#1B5E3A]" />
                  <span>الأسئلة</span>
                </button>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Preview Page Filter when in preview mode */}
            {studioMode === 'preview' && pagination.totalPages > 1 && (
              <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewFilterMode(previewFilterMode === 'all' ? 'single' : 'all')
                  }
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 font-bold text-[11px]"
                >
                  {previewFilterMode === 'all' ? 'عرض الكل' : `صفحة ${currentPageNum}`}
                </button>
                <button
                  type="button"
                  disabled={currentPageNum <= 1}
                  onClick={() => {
                    setPreviewFilterMode('single');
                    setCurrentPageNum((p) => Math.max(1, p - 1));
                  }}
                  className="p-1 rounded hover:bg-white disabled:opacity-30"
                  title="الصفحة السابقة"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-[11px] tabular-nums px-1">
                  {currentPageNum} / {pagination.totalPages}
                </span>
                <button
                  type="button"
                  disabled={currentPageNum >= pagination.totalPages}
                  onClick={() => {
                    setPreviewFilterMode('single');
                    setCurrentPageNum((p) => Math.min(pagination.totalPages, p + 1));
                  }}
                  className="p-1 rounded hover:bg-white disabled:opacity-30"
                  title="الصفحة التالية"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Desktop Panel Visibility Toggles (Advanced mode) */}
            {studioExperienceMode === 'advanced' && (
              <div className="hidden xl:flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowLeftPanel((v) => !v)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                    showLeftPanel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <Columns className="w-3 h-3" />
                  <span>لوحة الأدوات</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowRightPanel((v) => !v)}
                  className={`px-2 py-1 rounded-lg border text-[11px] font-bold flex items-center gap-1 ${
                    showRightPanel ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                  }`}
                >
                  <ListTree className="w-3 h-3" />
                  <span>قائمة الأسئلة</span>
                </button>
              </div>
            )}

            {/* Zoom */}
            <div className="hidden sm:flex items-center gap-1 pr-2 border-r border-slate-200">
              <button
                type="button"
                onClick={() => {
                  const base = studioMode === 'preview' && autoFitZoom ? fitZoomPct : zoomLevel;
                  setAutoFitZoom(false);
                  setZoomLevel(Math.max(40, base - 10));
                }}
                className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"
                title="تصغير العرض"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setAutoFitZoom(true);
                }}
                className={`font-mono font-bold text-[11px] px-2 py-1 rounded text-center tabular-nums transition-colors ${
                  studioMode === 'preview' && autoFitZoom
                    ? 'bg-emerald-50 text-[#1B5E3A] border border-emerald-200'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
                title="ملائمة تلقائية لعرض الشاشة"
              >
                {effectivePreviewZoom}%{studioMode === 'preview' && autoFitZoom ? ' تلقائي' : ''}
              </button>
              <button
                type="button"
                onClick={() => {
                  const base = studioMode === 'preview' && autoFitZoom ? fitZoomPct : zoomLevel;
                  setAutoFitZoom(false);
                  setZoomLevel(Math.min(130, base + 10));
                }}
                className="p-1.5 rounded bg-slate-100 hover:bg-slate-200"
                title="تكبير العرض"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Alerts: Marks Mismatch, Smart Fit, PDF Notice */}
        {marksMismatch && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-2 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                مجموع درجات الأسئلة (<strong>{computedMarks}</strong>) يختلف عن الدرجة الكلية (
                <strong>{exam.totalMarks}</strong>).
              </span>
            </div>
            <button
              type="button"
              onClick={() => setExam({ ...exam, totalMarks: computedMarks })}
              className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold"
            >
              تحديث الدرجة الكلية إلى {computedMarks}
            </button>
          </div>
        )}

        {(fitFeedback.status !== 'idle' || pagination.overflowDetected) && (
          <div
            className={`rounded-xl p-2 text-xs flex flex-wrap items-center justify-between gap-2 border ${
              pagination.overflowDetected || fitFeedback.status === 'overflow'
                ? 'bg-rose-50 border-rose-300 text-rose-950'
                : 'bg-emerald-50 border-emerald-300 text-emerald-950'
            }`}
          >
            <div className="flex items-center gap-2">
              {pagination.overflowDetected || fitFeedback.status === 'overflow' ? (
                <AlertTriangle className="w-4 h-4 text-rose-700 shrink-0" />
              ) : (
                <CheckCircle className="w-4 h-4 text-[#1B5E3A] shrink-0" />
              )}
              <span>{fitFeedback.message || pagination.diagnosticMessage}</span>
            </div>
            {pagination.overflowDetected && (
              <button
                type="button"
                onClick={() => updateLayoutConfig({ paginationMode: 'auto', preset: 'AUTO' })}
                className="px-3 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[11px] font-bold"
              >
                تحويل إلى التوزيع التلقائي الذكي
              </button>
            )}
          </div>
        )}

        {exportNotice && (
          <div className="bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-xl p-2 text-xs flex items-center justify-between gap-2">
            <span>{exportNotice}</span>
            <button type="button" onClick={() => setExportNotice(null)} className="text-slate-500 hover:text-slate-800">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          WORKSPACE: EASY MODE OR 3-PANEL ADVANCED STUDIO
      ======================================================== */}
      <div
        className={`grid grid-cols-1 gap-4 items-start ${
          studioExperienceMode === 'easy' && studioMode === 'edit'
            ? ''
            : showLeftPanel && showRightPanel
            ? 'xl:grid-cols-[295px_minmax(0,1fr)_270px]'
            : showLeftPanel
            ? 'xl:grid-cols-[295px_minmax(0,1fr)]'
            : showRightPanel
            ? 'xl:grid-cols-[minmax(0,1fr)_270px]'
            : 'xl:grid-cols-[minmax(0,1fr)]'
        }`}
      >
        {/* PANEL 1 (Desktop Advanced): Toolbar & Page Setup */}
        {!(studioExperienceMode === 'easy' && studioMode === 'edit') && showLeftPanel && (
          <aside className="no-print hidden xl:block xl:sticky xl:top-44">
            <StudioToolbarPanel
              exam={exam}
              headerConfig={headerConfig}
              layoutConfig={layoutConfig}
              targetSectionIdx={targetSectionIdx}
              savedTemplates={savedTemplates}
              templatesLoading={templatesLoading}
              questionTypes={STUDIO_QUESTION_TYPES}
              onChangeLayout={updateLayoutConfig}
              onApplyTemplate={handleApplyTemplate}
              onSaveTemplate={handleSavePrivateTemplate}
              onDeleteTemplate={handleDeletePrivateTemplate}
              onFitToOnePage={handleFitToOnePage}
              onChangeHeader={(patch) => setHeaderConfig((prev) => ({ ...prev, ...patch }))}
              onChangeExamMeta={(patch) => {
                if (patch.subjectId && patch.subjectId !== exam.subjectId) {
                  handleSwitchSubject(patch.subjectId);
                } else {
                  setExam((prev) => ({ ...prev, ...patch }));
                }
              }}
              onSetTargetSection={setTargetSectionIdx}
              onAddSection={addSection}
              onAddQuestion={(qt) => addQuestionToSection(qt)}
              onOpenBankImport={openBankImport}
              onApplyDefaultAnswerLinesToAll={handleApplyDefaultAnswerLinesToAll}
              isReadOnlyPreview={isReadOnlyPreview}
            />
          </aside>
        )}

        {/* PANEL 2: EASY MODE WORKSPACE OR ADVANCED INTERACTIVE CANVAS / A4 PREVIEW */}
        <main ref={centerColumnRef} className="min-w-0">
          {studioMode === 'edit' && studioExperienceMode === 'easy' && (
            <div className="no-print">
              <EasyExamWorkspace
                exam={exam}
                headerConfig={headerConfig}
                subjects={subjects}
                targetSectionIdx={targetSectionIdx}
                computedMarks={computedMarks}
                marksMismatch={marksMismatch}
                isAnswerKeyView={isAnswerKeyView}
                isSaving={isSaving}
                isExportingPdf={isExportingPdf}
                onSetTargetSection={setTargetSectionIdx}
                onSwitchSubject={handleSwitchSubject}
                onUpdateExamMeta={(patch) => setExam((prev) => ({ ...prev, ...patch }))}
                onUpdateHeader={(patch) => setHeaderConfig((prev) => ({ ...prev, ...patch }))}
                onAddSection={addSection}
                onUpdateSectionTitle={updateSectionTitle}
                onUpdateSectionInstructions={updateSectionInstructions}
                onDeleteSection={deleteSection}
                onAddQuestion={addQuestionToSection}
                onUpdateQuestion={updateQuestion}
                onMoveQuestion={moveQuestion}
                onMoveQuestionToSection={moveQuestionToSection}
                onDuplicateQuestion={duplicateQuestion}
                onDeleteQuestion={deleteQuestion}
                onUploadImage={handleUploadQuestionImage}
                onOpenBankImport={openBankImport}
                onPreviewPaper={() => {
                  setStudioMode('preview');
                  setPreviewFilterMode('all');
                }}
                onSaveExam={handleSave}
                onExportPdf={handleExportPdf}
                onFixTotalMarks={() => setExam((prev) => ({ ...prev, totalMarks: computedMarks }))}
              />
            </div>
          )}

          {/* Interactive Advanced Edit Mode Sheet (Hidden when Printing or in Preview/Easy Mode) */}
          {studioMode === 'edit' && studioExperienceMode === 'advanced' && (
            <div className="no-print a4-viewport-wrapper">
              <div
                dir={paperDir}
                style={{
                  maxWidth: `${widthMm}mm`,
                  paddingTop: `${layoutConfig.marginTopMm}mm`,
                  paddingRight: `${layoutConfig.marginRightMm}mm`,
                  paddingBottom: `${layoutConfig.marginBottomMm}mm`,
                  paddingLeft: `${layoutConfig.marginLeftMm}mm`,
                  fontFamily: fontCss,
                  fontSize: `${layoutConfig.fontSizePt}pt`,
                  lineHeight: layoutConfig.lineHeight,
                  ...(zoomLevel !== 100 ? { zoom: zoomLevel / 100 } : {}),
                }}
                className={`exam-page-container w-full mx-auto bg-white border border-slate-300 shadow-xl text-slate-950 ${
                  layoutConfig.printColorMode === 'bw' ? 'grayscale' : ''
                }`}
              >
                <div
                  style={editBorderStyles}
                  className={`relative ${
                    layoutConfig.showSafeAreaGuide !== false
                      ? 'outline-1 outline-dashed outline-[#1B5E3A]/35 outline-offset-2'
                      : ''
                  }`}
                >
                  {layoutConfig.showSafeAreaGuide !== false && (
                    <div className="mb-1.5 flex items-center justify-between text-[10px] font-mono text-slate-400 select-none">
                      <span>
                        منطقة الطباعة الآمنة · A4 {layoutConfig.orientation === 'landscape' ? 'Landscape' : 'Portrait'} · هوامش {layoutConfig.marginTopMm}/{layoutConfig.marginRightMm}/{layoutConfig.marginBottomMm}/{layoutConfig.marginLeftMm}mm
                      </span>
                      <span>التقدير الحي: {pagination.totalPages} صفحة</span>
                    </div>
                  )}

                  <OfficialSchoolHeader
                    headerConfig={headerConfig}
                    subjectId={exam.subjectId}
                    examTitle={exam.title}
                    examTitleAr={exam.titleAr}
                    schoolIdentity={schoolIdentity}
                    timeLimitMinutes={exam.timeLimitMinutes}
                    totalMarks={exam.totalMarks}
                    grade={exam.grade}
                    examDate={exam.examDate || headerConfig.examDate}
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
                      layoutConfig.headerCompact ? 'mb-2.5 pb-1' : 'mb-4 pb-1.5'
                    }`}
                  >
                    {isEnglishPaper ? (
                      <span className="font-english italic" dir="ltr">
                        * {headerConfig.notes || 'Answer all questions clearly and legibly.'}
                      </span>
                    ) : (
                      <span className="font-semibold" dir="rtl">
                        * {headerConfig.notes || 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'}
                      </span>
                    )}
                  </div>

                  {/* Sections Editing Canvas */}
                  <div
                    style={{
                      columnCount: layoutConfig.columns,
                      columnGap: layoutConfig.columns === 2 ? `${layoutConfig.columnGapPx ?? 18}px` : undefined,
                      display: layoutConfig.columns === 1 ? 'flex' : 'block',
                      flexDirection: 'column',
                      gap: layoutConfig.columns === 1 ? `${layoutConfig.sectionGapPx}px` : undefined,
                    }}
                  >
                    {exam.sections.map((section, sIdx) => (
                      <section
                        key={section.id}
                        style={{
                          marginBottom: layoutConfig.columns === 2 ? `${layoutConfig.sectionGapPx}px` : undefined,
                        }}
                        className="exam-section-block space-y-2"
                      >
                        {section.startOnNewPage && (
                          <div className="mb-1 text-[10px] font-bold text-[#1B5E3A] bg-emerald-50 border border-dashed border-emerald-300 rounded px-2 py-0.5 text-center">
                            يبدأ هذا القسم من صفحة جديدة عند الطباعة / PDF
                          </div>
                        )}

                        <SectionHeaderBlockView
                          exam={exam}
                          section={section}
                          sIdx={sIdx}
                          layoutConfig={layoutConfig}
                          readOnly={false}
                          callbacks={sharedCallbacks}
                        />

                        <div
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: `${layoutConfig.questionGapPx}px`,
                          }}
                        >
                          {section.questions.length === 0 && (
                            <div className="p-4 border border-dashed border-slate-300 rounded-xl text-center text-xs text-slate-500">
                              لا توجد أسئلة في هذا القسم — أضف سؤالاً من لوحة الأدوات (قسم الأسئلة والأقسام).
                            </div>
                          )}

                          {section.questions.map((q, qIdx) => (
                            <div key={q.id} className="space-y-1.5">
                              {q.passage !== undefined && (
                                <PassageBlockView
                                  passage={q.passage}
                                  sIdx={sIdx}
                                  qIdx={qIdx}
                                  readOnly={false}
                                  onChange={(val) => updateQuestion(sIdx, qIdx, { passage: val })}
                                />
                              )}

                              <QuestionCardBlockView
                                exam={exam}
                                section={section}
                                sIdx={sIdx}
                                q={q}
                                qIdx={qIdx}
                                layoutConfig={layoutConfig}
                                isAnswerKeyView={isAnswerKeyView}
                                readOnly={false}
                                hasAIAccess={hasAIAccess}
                                activeFormatQId={activeFormatQId}
                                activeSymbolQId={activeSymbolQId}
                                selectedQuestionId={selectedQuestionId}
                                dragOverItem={dragOverItem}
                                pageBadgeNumber={pagination.questionPageMap[q.id]}
                                callbacks={sharedCallbacks}
                              />
                            </div>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DISCRETE PAGINATED A4 SHEETS (Visible on screen in 'preview' mode; ALWAYS rendered for Print & PDF Capture!) */}
          <div className={studioMode === 'preview' ? 'a4-viewport-wrapper' : 'hidden print:block'}>
            {studioMode === 'preview' && pagination.totalPages > 1 && (
              <div className="no-print flex flex-wrap items-center justify-center gap-1.5 mb-3">
                <button
                  type="button"
                  onClick={() => setPreviewFilterMode('all')}
                  className={`px-3 py-1 rounded-lg text-xs font-bold border ${
                    previewFilterMode === 'all'
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  جميع الصفحات ({pagination.totalPages})
                </button>
                {pagination.pages.map((p) => (
                  <button
                    key={p.pageIndex}
                    type="button"
                    onClick={() => {
                      setPreviewFilterMode('single');
                      setCurrentPageNum(p.pageIndex + 1);
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold border tabular-nums ${
                      previewFilterMode === 'single' && currentPageNum === p.pageIndex + 1
                        ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {p.pageIndex + 1}
                  </button>
                ))}
              </div>
            )}

            <div ref={printPagesRootRef} className="a4-print-pages-root">
              {pagination.pages.map((page) => {
                const isVisibleOnScreen =
                  studioMode === 'preview' &&
                  (previewFilterMode === 'all' || currentPageNum === page.pageIndex + 1);

                return (
                  <DiscreteA4PageSheet
                    key={`${page.pageIndex}-${pagination.totalPages}`}
                    page={page}
                    totalPages={pagination.totalPages}
                    exam={exam}
                    headerConfig={headerConfig}
                    layoutConfig={layoutConfig}
                    schoolIdentity={schoolIdentity}
                    isAnswerKeyView={isAnswerKeyView}
                    zoomLevel={studioMode === 'preview' ? effectivePreviewZoom : 100}
                    visibleOnScreen={isVisibleOnScreen}
                  />
                );
              })}
            </div>
          </div>
        </main>

        {/* PANEL 3 (Desktop Advanced): Question Outline Panel */}
        {!(studioExperienceMode === 'easy' && studioMode === 'edit') && showRightPanel && (
          <aside className="no-print hidden xl:block xl:sticky xl:top-44">
            <QuestionOutlinePanel
              exam={exam}
              questionPageMap={pagination.questionPageMap}
              sectionPageMap={pagination.sectionPageMap}
              totalPages={pagination.totalPages}
              selectedQuestionId={selectedQuestionId}
              isReadOnlyPreview={isReadOnlyPreview}
              onSelectQuestion={handleOutlineSelectQuestion}
              onMoveQuestion={moveQuestion}
              onMoveQuestionToSection={moveQuestionToSection}
              onMoveQuestionToPage={handleMoveQuestionToPage}
              onToggleQuestionFlag={(sIdx, qIdx, field, val) =>
                updateQuestion(sIdx, qIdx, { [field]: val })
              }
              onToggleSectionFlag={toggleSectionFlag}
            />
          </aside>
        )}
      </div>

      {/* ========================================================
          MOBILE / TABLET DRAWERS FOR PANELS (< xl screens)
      ======================================================== */}
      {mobileDrawer !== 'none' && (
        <div className="no-print fixed inset-0 bg-slate-950/50 backdrop-blur-xs z-50 flex justify-end xl:hidden">
          <div className="w-full max-w-sm bg-slate-50 h-full overflow-y-auto p-3 space-y-3 shadow-2xl" dir="rtl">
            <div className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200">
              <span className="font-extrabold text-xs text-slate-900">
                {mobileDrawer === 'toolbar' ? 'لوحة الأدوات والتنسيق' : 'قائمة الأسئلة والمخطط'}
              </span>
              <button
                type="button"
                onClick={() => setMobileDrawer('none')}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {mobileDrawer === 'toolbar' ? (
              <StudioToolbarPanel
                exam={exam}
                headerConfig={headerConfig}
                layoutConfig={layoutConfig}
                targetSectionIdx={targetSectionIdx}
                savedTemplates={savedTemplates}
                templatesLoading={templatesLoading}
                questionTypes={STUDIO_QUESTION_TYPES}
                onChangeLayout={updateLayoutConfig}
                onApplyTemplate={handleApplyTemplate}
                onSaveTemplate={handleSavePrivateTemplate}
                onDeleteTemplate={handleDeletePrivateTemplate}
                onFitToOnePage={handleFitToOnePage}
                onChangeHeader={(patch) => setHeaderConfig((prev) => ({ ...prev, ...patch }))}
                onChangeExamMeta={(patch) => {
                  if (patch.subjectId && patch.subjectId !== exam.subjectId) {
                    handleSwitchSubject(patch.subjectId);
                  } else {
                    setExam((prev) => ({ ...prev, ...patch }));
                  }
                }}
                onSetTargetSection={setTargetSectionIdx}
                onAddSection={addSection}
                onAddQuestion={(qt) => {
                  addQuestionToSection(qt);
                  setMobileDrawer('none');
                }}
                onOpenBankImport={() => {
                  setMobileDrawer('none');
                  openBankImport();
                }}
                onApplyDefaultAnswerLinesToAll={handleApplyDefaultAnswerLinesToAll}
                isReadOnlyPreview={isReadOnlyPreview}
              />
            ) : (
              <QuestionOutlinePanel
                exam={exam}
                questionPageMap={pagination.questionPageMap}
                sectionPageMap={pagination.sectionPageMap}
                totalPages={pagination.totalPages}
                selectedQuestionId={selectedQuestionId}
                isReadOnlyPreview={isReadOnlyPreview}
                onSelectQuestion={handleOutlineSelectQuestion}
                onMoveQuestion={moveQuestion}
                onMoveQuestionToSection={moveQuestionToSection}
                onMoveQuestionToPage={handleMoveQuestionToPage}
                onToggleQuestionFlag={(sIdx, qIdx, field, val) =>
                  updateQuestion(sIdx, qIdx, { [field]: val })
                }
                onToggleSectionFlag={toggleSectionFlag}
              />
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          IMPORT FROM PRIVATE QUESTION BANK MODAL (NO AI)
      ======================================================== */}
      {showBankModal && (
        <div className="no-print fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full p-5 shadow-2xl space-y-4 my-6" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-900">
                استيراد من بنك الأسئلة الخاص بك ({bankQuestions.length})
              </h3>
              <button onClick={() => setShowBankModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            {bankLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">جاري تحميل أسئلتك الخاصة...</div>
            ) : bankQuestions.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                لا توجد أسئلة محفوظة في بنك أسئلتك الخاص لهذه المادة بعد. يمكنك كتابة الأسئلة مباشرة في الاستوديو.
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto space-y-2.5">
                {bankQuestions.map((bq) => (
                  <div
                    key={bq.id}
                    className="p-3 rounded-xl border border-slate-200 flex items-center justify-between gap-3 hover:bg-slate-50"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <div className="text-[11px] font-bold text-[#1B5E3A]">
                        {bq.type} · {bq.grade} · {bq.marks} د.
                      </div>
                      <div className="text-xs font-semibold text-slate-900 truncate">{bq.questionText}</div>
                    </div>
                    <button
                      onClick={() => {
                        const newSecs = [...exam.sections];
                        const clonedQ: Question = {
                          ...JSON.parse(JSON.stringify(bq)),
                          id: `q-imp-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
                        };
                        newSecs[targetSectionIdx]?.questions.push(clonedQ);
                        setExam({ ...exam, sections: recalcSectionMarks(newSecs) });
                        setShowBankModal(false);
                      }}
                      className="px-3 py-1.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-lg text-xs font-bold shrink-0"
                    >
                      إدراج
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          OPTIONAL SHARING MODAL
      ======================================================== */}
      {showShareModal && (
        <div className="no-print fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl space-y-4" dir="rtl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-extrabold text-slate-900">مشاركة الاختبار الاختيارية</h3>
              <button onClick={() => setShowShareModal(false)} className="p-1 text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-xs text-slate-600">
              الاختبارات خاصة بك افتراضياً. يمكنك منح صلاحية عرض أو تعديل اختيارية وقابلة للإلغاء لزميل في المدرسة:
            </p>

            <div className="space-y-2 text-xs">
              <div className="flex gap-2">
                <select
                  value={shareUserId}
                  onChange={(e) => setShareUserId(e.target.value)}
                  className="flex-1 px-2.5 py-2 border border-slate-200 rounded-xl bg-white"
                >
                  {colleagues.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.username})
                    </option>
                  ))}
                </select>
                <select
                  value={sharePermission}
                  onChange={(e) => setSharePermission(e.target.value as 'view' | 'edit')}
                  className="px-2.5 py-2 border border-slate-200 rounded-xl bg-white font-bold"
                >
                  <option value="view">عرض فقط</option>
                  <option value="edit">عرض وتعديل</option>
                </select>
              </div>
              <button
                onClick={handleGrantShare}
                className="w-full py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl font-bold"
              >
                منح صلاحية المشاركة
              </button>
            </div>

            {exam.sharedWith && exam.sharedWith.length > 0 && (
              <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                <div className="font-bold text-slate-700">المشاركون حالياً:</div>
                {exam.sharedWith.map((s) => (
                  <div
                    key={s.userId}
                    className="flex items-center justify-between bg-slate-50 px-3 py-2 rounded-lg border border-slate-200"
                  >
                    <span>
                      {s.userName || s.userId} ({s.permission === 'edit' ? 'تعديل' : 'عرض'})
                    </span>
                    <button
                      onClick={() => handleRevokeShare(s.userId)}
                      className="text-rose-600 font-bold hover:underline"
                    >
                      إلغاء
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
