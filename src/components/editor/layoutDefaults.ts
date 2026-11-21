import {
  ExamLayoutConfig,
  ExamLayoutPreset,
  FontFamilyOption,
  LayoutTemplate,
} from '../../types/index.ts';

export const MM_TO_PX = 96 / 25.4; // ~3.7795275591 px per mm at CSS 96dpi
export const MIN_SAFE_FONT_PT = 9.5;
export const MAX_FONT_PT = 16;

export const DEFAULT_LAYOUT_CONFIG: ExamLayoutConfig = {
  preset: 'AUTO',
  paginationMode: 'auto',
  paperSize: 'A4',
  orientation: 'portrait',
  columns: 1,
  columnGapPx: 18,
  marginTopMm: 12,
  marginBottomMm: 12,
  marginLeftMm: 12,
  marginRightMm: 12,
  borderMode: 'full',
  borderColor: '#1B5E3A',
  borderWidthPx: 2,
  borderStyle: 'solid',
  borderPaddingMm: 4,
  showSafeAreaGuide: true,
  fontFamily: 'cairo',
  fontSizePt: 11,
  headingScale: 1,
  lineHeight: 1.45,
  questionGapPx: 12,
  sectionGapPx: 18,
  globalAlign: 'auto',
  globalDirection: 'auto',
  defaultAnswerSpaceLines: 1,
  marksPlacement: 'inline_end',
  sectionNumbering: 'auto',
  questionNumbering: 'numeric',
  keepQuestionsTogether: true,
  repeatHeaderOnPages: true,
  logoSize: 'md',
  headerCompact: false,
  showPageNumbers: true,
  printColorMode: 'color',
};

export function clampNumber(val: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(val)) return fallback;
  return Math.min(max, Math.max(min, val));
}

export function normalizeLayoutConfig(partial?: Partial<ExamLayoutConfig> | null): ExamLayoutConfig {
  const merged = { ...DEFAULT_LAYOUT_CONFIG, ...(partial || {}) };
  let paginationMode = merged.paginationMode;
  if (!paginationMode) {
    if (merged.preset === 'ONE_PAGE') paginationMode = 'one_page';
    else if (merged.preset === 'TWO_PAGES') paginationMode = 'two_pages';
    else if (merged.preset === 'MULTI_PAGE') paginationMode = 'multi_page';
    else paginationMode = 'auto';
  }

  return {
    ...merged,
    paperSize: 'A4',
    paginationMode,
    orientation: merged.orientation === 'landscape' ? 'landscape' : 'portrait',
    columns: merged.columns === 2 ? 2 : 1,
    columnGapPx: clampNumber(Number(merged.columnGapPx ?? 18), 8, 48, 18),
    marginTopMm: clampNumber(Number(merged.marginTopMm ?? 12), 5, 30, 12),
    marginBottomMm: clampNumber(Number(merged.marginBottomMm ?? 12), 5, 30, 12),
    marginLeftMm: clampNumber(Number(merged.marginLeftMm ?? 12), 5, 30, 12),
    marginRightMm: clampNumber(Number(merged.marginRightMm ?? 12), 5, 30, 12),
    borderMode: merged.borderMode || 'full',
    borderColor: merged.borderColor || '#1B5E3A',
    borderWidthPx: clampNumber(Number(merged.borderWidthPx ?? 2), 1, 8, 2),
    borderStyle: merged.borderStyle || 'solid',
    borderPaddingMm: clampNumber(Number(merged.borderPaddingMm ?? 4), 0, 14, 4),
    showSafeAreaGuide: merged.showSafeAreaGuide !== false,
    fontFamily: merged.fontFamily || 'cairo',
    fontSizePt: clampNumber(Number(merged.fontSizePt ?? 11), MIN_SAFE_FONT_PT, MAX_FONT_PT, 11),
    headingScale: clampNumber(Number(merged.headingScale ?? 1), 0.85, 1.35, 1),
    lineHeight: clampNumber(Number(merged.lineHeight ?? 1.45), 1.15, 2.2, 1.45),
    questionGapPx: clampNumber(Number(merged.questionGapPx ?? 12), 4, 32, 12),
    sectionGapPx: clampNumber(Number(merged.sectionGapPx ?? 18), 6, 40, 18),
    globalAlign: merged.globalAlign || 'auto',
    globalDirection: merged.globalDirection || 'auto',
    defaultAnswerSpaceLines: clampNumber(Number(merged.defaultAnswerSpaceLines ?? 1), 0, 10, 1),
    marksPlacement: merged.marksPlacement === 'below_question' ? 'below_question' : 'inline_end',
    sectionNumbering: merged.sectionNumbering || 'auto',
    questionNumbering: merged.questionNumbering || 'numeric',
    keepQuestionsTogether: merged.keepQuestionsTogether !== false,
    repeatHeaderOnPages: merged.repeatHeaderOnPages !== false,
    logoSize: merged.logoSize || 'md',
    headerCompact: Boolean(merged.headerCompact),
    showPageNumbers: merged.showPageNumbers !== false,
    printColorMode: merged.printColorMode === 'bw' ? 'bw' : 'color',
  };
}

export function getPaperDimensionsMm(orientation: 'portrait' | 'landscape'): { widthMm: number; heightMm: number } {
  // Slight 0.4mm height buffer ensures headless Chromium PDF matches 1 sheet per page cleanly without trailing blank pages
  return orientation === 'landscape'
    ? { widthMm: 297, heightMm: 209.6 }
    : { widthMm: 210, heightMm: 296.6 };
}

export function getFontFamilyCss(font?: FontFamilyOption): string {
  switch (font) {
    case 'amiri':
      return "'Amiri', 'Cairo', serif";
    case 'inter':
      return "'Inter', 'Cairo', system-ui, sans-serif";
    case 'system':
      return "system-ui, -apple-system, 'Segoe UI', Tahoma, sans-serif";
    case 'cairo':
    default:
      return "'Cairo', 'Inter', system-ui, sans-serif";
  }
}

export function formatSectionBadge(
  sIdx: number,
  mode: ExamLayoutConfig['sectionNumbering'],
  isArabic: boolean
): string {
  if (mode === 'none') return '';
  if (mode === 'numeric') return String(sIdx + 1);
  if (mode === 'alpha') return String.fromCharCode(65 + sIdx);
  if (mode === 'arabic_alpha') {
    const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي'];
    return letters[sIdx] || String(sIdx + 1);
  }
  return isArabic ? String(sIdx + 1) : String.fromCharCode(65 + sIdx);
}

export function formatQuestionBadge(
  qIdx: number,
  mode: ExamLayoutConfig['questionNumbering']
): string {
  if (mode === 'none') return '';
  if (mode === 'arabic_alpha') {
    const letters = ['أ', 'ب', 'ج', 'د', 'هـ', 'و', 'ز', 'ح', 'ط', 'ي', 'ك', 'ل', 'م', 'ن'];
    return `${letters[qIdx] || String(qIdx + 1)}.`;
  }
  return `${qIdx + 1}.`;
}

export interface BuiltInPresetItem {
  id: string;
  preset: ExamLayoutPreset;
  name: string;
  nameAr: string;
  description: string;
  patch: Partial<ExamLayoutConfig>;
}

export const BUILT_IN_LAYOUT_PRESETS: BuiltInPresetItem[] = [
  {
    id: 'builtin-auto',
    preset: 'AUTO',
    name: 'Smart Auto Pagination',
    nameAr: 'توزيع تلقائي ذكي',
    description: 'صفحة واحدة إن اتسع المحتوى بوضوح، وإلا ينساب إلى صفحتين أو أكثر تلقائياً',
    patch: {
      preset: 'AUTO',
      paginationMode: 'auto',
      orientation: 'portrait',
      columns: 1,
      fontSizePt: 11,
      lineHeight: 1.42,
      questionGapPx: 12,
      sectionGapPx: 16,
      marginTopMm: 12,
      marginBottomMm: 12,
      marginLeftMm: 12,
      marginRightMm: 12,
      logoSize: 'md',
      headerCompact: false,
    },
  },
  {
    id: 'builtin-one-page',
    preset: 'ONE_PAGE',
    name: 'Single Page Exam',
    nameAr: 'اختبار صفحة واحدة',
    description: 'هوامش وتباعد مضغوطان لاحتواء الاختبار القصير في ورقة A4 واحدة',
    patch: {
      preset: 'ONE_PAGE',
      paginationMode: 'one_page',
      orientation: 'portrait',
      columns: 1,
      fontSizePt: 10,
      lineHeight: 1.28,
      questionGapPx: 7,
      sectionGapPx: 11,
      marginTopMm: 8,
      marginBottomMm: 8,
      marginLeftMm: 10,
      marginRightMm: 10,
      logoSize: 'sm',
      headerCompact: true,
    },
  },
  {
    id: 'builtin-two-pages',
    preset: 'TWO_PAGES',
    name: 'Two Pages Exam',
    nameAr: 'اختبار من صفحتين',
    description: 'تنسيق مريح ومتوازن للاختبارات الشهرية ونصف الفصلية على صفحتين',
    patch: {
      preset: 'TWO_PAGES',
      paginationMode: 'two_pages',
      orientation: 'portrait',
      columns: 1,
      fontSizePt: 11,
      lineHeight: 1.42,
      questionGapPx: 12,
      sectionGapPx: 18,
      marginTopMm: 12,
      marginBottomMm: 12,
      marginLeftMm: 13,
      marginRightMm: 13,
      logoSize: 'md',
      headerCompact: false,
    },
  },
  {
    id: 'builtin-multi-page',
    preset: 'MULTI_PAGE',
    name: 'Multi-Page Final Exam',
    nameAr: 'امتحان متعدد الصفحات',
    description: 'هوامش رسمية وترويسة مكررة في الصفحات التالية للامتحانات الشاملة',
    patch: {
      preset: 'MULTI_PAGE',
      paginationMode: 'multi_page',
      orientation: 'portrait',
      columns: 1,
      fontSizePt: 11.5,
      lineHeight: 1.5,
      questionGapPx: 14,
      sectionGapPx: 20,
      marginTopMm: 13,
      marginBottomMm: 13,
      marginLeftMm: 14,
      marginRightMm: 14,
      repeatHeaderOnPages: true,
      logoSize: 'md',
      headerCompact: false,
    },
  },
  {
    id: 'builtin-two-cols',
    preset: 'CUSTOM',
    name: 'Two-Column Compact',
    nameAr: 'اختبار بعمودين',
    description: 'توزيع الأسئلة في عمودين متوازيين لاستغلال عرض الورقة بفاعلية',
    patch: {
      preset: 'CUSTOM',
      paginationMode: 'auto',
      orientation: 'portrait',
      columns: 2,
      columnGapPx: 18,
      fontSizePt: 10,
      lineHeight: 1.32,
      questionGapPx: 10,
      sectionGapPx: 14,
      marginTopMm: 10,
      marginBottomMm: 10,
      marginLeftMm: 10,
      marginRightMm: 10,
      logoSize: 'sm',
      headerCompact: true,
    },
  },
  {
    id: 'builtin-full-border',
    preset: 'CUSTOM',
    name: 'Full Border Framed',
    nameAr: 'اختبار بإطار كامل',
    description: 'إطار رسمي مزدوج محيط بالصفحة مع مسافة داخلية أنيقة',
    patch: {
      borderMode: 'full',
      borderStyle: 'double',
      borderWidthPx: 3,
      borderColor: '#1B5E3A',
      borderPaddingMm: 5,
    },
  },
  {
    id: 'builtin-no-border',
    preset: 'CUSTOM',
    name: 'Borderless Clean Paper',
    nameAr: 'اختبار دون إطار',
    description: 'صفحة مفتوحة بدون إطار خارجي لتركيز كامل على النصوص والأسئلة',
    patch: {
      borderMode: 'none',
      borderPaddingMm: 1,
    },
  },
  {
    id: 'builtin-landscape',
    preset: 'A4_LANDSCAPE',
    name: 'A4 Landscape 2-Column',
    nameAr: 'صفحة أفقية بعمودين',
    description: 'ورقة A4 بالعرض مع عمودين للامتحانات ذات الجداول أو المقارنات',
    patch: {
      preset: 'A4_LANDSCAPE',
      paginationMode: 'multi_page',
      orientation: 'landscape',
      columns: 2,
      columnGapPx: 20,
      fontSizePt: 10.5,
      lineHeight: 1.38,
      marginTopMm: 10,
      marginBottomMm: 10,
      marginLeftMm: 12,
      marginRightMm: 12,
      logoSize: 'sm',
      headerCompact: true,
    },
  },
];

export const BUILT_IN_AS_LAYOUT_TEMPLATES: LayoutTemplate[] = BUILT_IN_LAYOUT_PRESETS.map((b) => ({
  id: b.id,
  ownerId: 'system',
  name: b.name,
  nameAr: b.nameAr,
  description: b.description,
  isBuiltIn: true,
  layoutConfig: normalizeLayoutConfig(b.patch),
  createdAt: '2026-01-01T00:00:00.000Z',
}));
