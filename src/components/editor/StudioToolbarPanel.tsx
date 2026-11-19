import React, { useState } from 'react';
import {
  Exam,
  ExamHeaderConfig,
  ExamLayoutConfig,
  FontFamilyOption,
  LayoutTemplate,
  PageBorderMode,
  PageBorderStyle,
  PaginationMode,
  QuestionType,
} from '../../types/index.ts';
import { BUILT_IN_AS_LAYOUT_TEMPLATES } from './layoutDefaults.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  getAuthorizedGradesForUser,
  getAuthorizedSubjectsForUser,
  getGradeLabelAr,
} from '../../utils/schoolCatalog.ts';
import {
  Layout,
  Sliders,
  Plus,
  Bookmark,
  Database,
  Minimize2,
  Trash2,
  Check,
  Columns,
  Square,
  Save,
} from 'lucide-react';

export interface StudioQuestionTypeOption {
  type: QuestionType;
  labelAr: string;
  labelEn: string;
}

interface StudioToolbarPanelProps {
  exam: Exam;
  headerConfig: ExamHeaderConfig;
  layoutConfig: ExamLayoutConfig;
  targetSectionIdx: number;
  savedTemplates: LayoutTemplate[];
  templatesLoading: boolean;
  questionTypes: StudioQuestionTypeOption[];
  onChangeLayout: (patch: Partial<ExamLayoutConfig>) => void;
  onApplyTemplate: (tpl: LayoutTemplate) => void;
  onSaveTemplate: (nameAr: string, description?: string) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onFitToOnePage: () => void;
  onChangeHeader: (patch: Partial<ExamHeaderConfig>) => void;
  onChangeExamMeta: (patch: Partial<Exam>) => void;
  onSetTargetSection: (idx: number) => void;
  onAddSection: () => void;
  onAddQuestion: (type: QuestionType) => void;
  onOpenBankImport: () => void;
  onApplyDefaultAnswerLinesToAll: (lines: number) => void;
  isReadOnlyPreview: boolean;
}

export const StudioToolbarPanel: React.FC<StudioToolbarPanelProps> = ({
  exam,
  headerConfig,
  layoutConfig,
  targetSectionIdx,
  savedTemplates,
  templatesLoading,
  questionTypes,
  onChangeLayout,
  onApplyTemplate,
  onSaveTemplate,
  onDeleteTemplate,
  onFitToOnePage,
  onChangeHeader,
  onChangeExamMeta,
  onSetTargetSection,
  onAddSection,
  onAddQuestion,
  onOpenBankImport,
  onApplyDefaultAnswerLinesToAll,
  isReadOnlyPreview,
}) => {
  const { user, subjects } = useAuth();
  const authorizedSubjects = getAuthorizedSubjectsForUser(subjects, user);
  const authorizedGrades = getAuthorizedGradesForUser(user);

  const [activeTab, setActiveTab] = useState<'page' | 'typography' | 'questions' | 'templates'>('page');
  const [newTplName, setNewTplName] = useState('');
  const [newTplDesc, setNewTplDesc] = useState('');
  const [savingTpl, setSavingTpl] = useState(false);

  const handleSaveNewTpl = async () => {
    if (!newTplName.trim()) return;
    setSavingTpl(true);
    try {
      await onSaveTemplate(newTplName.trim(), newTplDesc.trim() || undefined);
      setNewTplName('');
      setNewTplDesc('');
    } finally {
      setSavingTpl(false);
    }
  };

  const tabBtn = (id: 'page' | 'typography' | 'questions' | 'templates', label: string, Icon: React.FC<{ className?: string }>) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-bold transition-colors border ${
        activeTab === id
          ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
      }`}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );

  return (
    <div className="no-print bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col overflow-hidden text-xs" dir="rtl">
      <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
        <span className="font-extrabold text-slate-900">لوحة الأدوات والتنسيق</span>
        <span className="text-[11px] font-mono text-slate-500">A4 WYSIWYG</span>
      </div>

      {/* 4 Tool Categories */}
      <div className="grid grid-cols-2 gap-1.5 p-2.5 border-b border-slate-100">
        {tabBtn('page', 'الصفحة والحدود', Square)}
        {tabBtn('typography', 'التوزيع والخطوط', Columns)}
        {tabBtn('questions', 'الأسئلة والأقسام', Plus)}
        {tabBtn('templates', 'القوالب والترويسة', Bookmark)}
      </div>

      <div className="p-3.5 space-y-4 overflow-y-auto max-h-[calc(100vh-220px)]">
        {/* ==================== TAB 1: PAGE SETUP & BORDERS ==================== */}
        {activeTab === 'page' && (
          <div className="space-y-4">
            {/* Paper & Orientation */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-slate-800">إعدادات الورق (Page Setup)</span>
                <span className="text-[11px] font-mono font-bold text-slate-500">
                  A4 ({layoutConfig.orientation === 'landscape' ? '297×210' : '210×297'} mm)
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => onChangeLayout({ orientation: 'portrait', preset: 'CUSTOM' })}
                  className={`py-2 px-3 rounded-xl font-bold border transition-colors ${
                    layoutConfig.orientation === 'portrait'
                      ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  عمودي Portrait
                </button>
                <button
                  type="button"
                  onClick={() => onChangeLayout({ orientation: 'landscape', preset: 'A4_LANDSCAPE' })}
                  className={`py-2 px-3 rounded-xl font-bold border transition-colors ${
                    layoutConfig.orientation === 'landscape'
                      ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  أفقي Landscape
                </button>
              </div>
            </div>

            {/* Numeric Margins */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">الهوامش الرقمية (mm)</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">أعلى (Top)</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={layoutConfig.marginTopMm}
                    onChange={(e) => onChangeLayout({ marginTopMm: Number(e.target.value), preset: 'CUSTOM' })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">أسفل (Bottom)</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={layoutConfig.marginBottomMm}
                    onChange={(e) => onChangeLayout({ marginBottomMm: Number(e.target.value), preset: 'CUSTOM' })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">يمين (Right)</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={layoutConfig.marginRightMm}
                    onChange={(e) => onChangeLayout({ marginRightMm: Number(e.target.value), preset: 'CUSTOM' })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">يسار (Left)</label>
                  <input
                    type="number"
                    min={5}
                    max={30}
                    value={layoutConfig.marginLeftMm}
                    onChange={(e) => onChangeLayout({ marginLeftMm: Number(e.target.value), preset: 'CUSTOM' })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 pt-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutConfig.showSafeAreaGuide !== false}
                  onChange={(e) => onChangeLayout({ showSafeAreaGuide: e.target.checked })}
                  className="accent-[#1B5E3A]"
                />
                <span>إظهار دليل حدود الطباعة الآمنة أثناء التحرير</span>
              </label>
            </div>

            {/* Page Border Controls */}
            <div className="space-y-2.5 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">إطار وحدود الصفحة</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'none', label: 'بدون إطار' },
                    { id: 'full', label: 'إطار كامل' },
                    { id: 'top_bottom', label: 'أعلى وأسفل فقط' },
                    { id: 'left_right', label: 'يمين ويسار فقط' },
                  ] as { id: PageBorderMode; label: string }[]
                ).map((bm) => (
                  <button
                    key={bm.id}
                    type="button"
                    onClick={() => onChangeLayout({ borderMode: bm.id })}
                    className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border ${
                      (layoutConfig.borderMode || 'full') === bm.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {bm.label}
                  </button>
                ))}
              </div>

              {(layoutConfig.borderMode || 'full') !== 'none' && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">نمط الإطار</label>
                    <select
                      value={layoutConfig.borderStyle || 'solid'}
                      onChange={(e) => onChangeLayout({ borderStyle: e.target.value as PageBorderStyle })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                    >
                      <option value="solid">متصل (Solid)</option>
                      <option value="double">مزدوج (Double)</option>
                      <option value="dashed">متقطع (Dashed)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">سُمك الإطار (px)</label>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={layoutConfig.borderWidthPx ?? 2}
                      onChange={(e) => onChangeLayout({ borderWidthPx: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">مسافة داخلية (mm)</label>
                    <input
                      type="number"
                      min={0}
                      max={14}
                      value={layoutConfig.borderPaddingMm ?? 4}
                      onChange={(e) => onChangeLayout({ borderPaddingMm: Number(e.target.value) })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-1">لون الإطار</label>
                    <div className="flex items-center gap-1.5">
                      {[
                        { c: '#1B5E3A', t: 'أخضر رسمي' },
                        { c: '#0f172a', t: 'أسود' },
                        { c: '#475569', t: 'رمادي' },
                      ].map((swatch) => (
                        <button
                          key={swatch.c}
                          type="button"
                          onClick={() => onChangeLayout({ borderColor: swatch.c })}
                          title={swatch.t}
                          style={{ backgroundColor: swatch.c }}
                          className={`w-6 h-6 rounded border-2 ${
                            (layoutConfig.borderColor || '#1B5E3A') === swatch.c
                              ? 'border-amber-400 scale-110'
                              : 'border-white shadow-xs'
                          }`}
                        />
                      ))}
                      <input
                        type="color"
                        value={layoutConfig.borderColor || '#1B5E3A'}
                        onChange={(e) => onChangeLayout({ borderColor: e.target.value })}
                        className="w-7 h-6 p-0 border border-slate-200 rounded cursor-pointer"
                        title="لون مخصص"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Header / Footer / Color Settings */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">خيارات الورقة والرأس</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">حجم الشعار</label>
                  <select
                    value={layoutConfig.logoSize}
                    onChange={(e) => onChangeLayout({ logoSize: e.target.value as 'sm' | 'md' | 'lg' })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="sm">صغير مضغوط</option>
                    <option value="md">متوسط قياسي</option>
                    <option value="lg">كبير رسمي</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">ألوان الطباعة</label>
                  <select
                    value={layoutConfig.printColorMode}
                    onChange={(e) => onChangeLayout({ printColorMode: e.target.value as 'color' | 'bw' })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="color">ألوان المدرسة</option>
                    <option value="bw">أبيض وأسود</option>
                  </select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutConfig.headerCompact}
                  onChange={(e) => {
                    onChangeLayout({ headerCompact: e.target.checked });
                    onChangeHeader({ headerCompact: e.target.checked });
                  }}
                  className="accent-[#1B5E3A]"
                />
                <span>ترويسة مضغوطة في الصفحة الأولى</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutConfig.repeatHeaderOnPages !== false}
                  onChange={(e) => onChangeLayout({ repeatHeaderOnPages: e.target.checked })}
                  className="accent-[#1B5E3A]"
                />
                <span>شريط تعريف مصغّر في الصفحة الثانية وما بعدها</span>
              </label>
              <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutConfig.showPageNumbers !== false}
                  onChange={(e) => onChangeLayout({ showPageNumbers: e.target.checked })}
                  className="accent-[#1B5E3A]"
                />
                <span>إظهار ترقيم الصفحات (صفحة X من Y)</span>
              </label>
            </div>
          </div>
        )}

        {/* ==================== TAB 2: DISTRIBUTION & TYPOGRAPHY ==================== */}
        {activeTab === 'typography' && (
          <div className="space-y-4">
            {/* Pagination Mode */}
            <div className="space-y-2">
              <span className="font-extrabold text-slate-800 block">توزيع المحتوى على الصفحات</span>
              <div className="grid grid-cols-2 gap-1.5">
                {(
                  [
                    { id: 'auto', label: 'تلقائي ذكي (Auto)' },
                    { id: 'one_page', label: 'صفحة واحدة' },
                    { id: 'two_pages', label: 'صفحتان' },
                    { id: 'multi_page', label: 'عدة صفحات' },
                  ] as { id: PaginationMode; label: string }[]
                ).map((pm) => (
                  <button
                    key={pm.id}
                    type="button"
                    onClick={() =>
                      onChangeLayout({
                        paginationMode: pm.id,
                        preset:
                          pm.id === 'one_page'
                            ? 'ONE_PAGE'
                            : pm.id === 'two_pages'
                            ? 'TWO_PAGES'
                            : pm.id === 'multi_page'
                            ? 'MULTI_PAGE'
                            : 'AUTO',
                      })
                    }
                    className={`py-2 px-2.5 rounded-xl font-bold border text-[11px] transition-colors ${
                      (layoutConfig.paginationMode || 'auto') === pm.id
                        ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {pm.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={onFitToOnePage}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5"
              >
                <Minimize2 className="w-3.5 h-3.5 text-emerald-400" />
                <span>توفيق ذكي في صفحة واحدة (≥ 9.5pt)</span>
              </button>
            </div>

            {/* Columns */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">الأعمدة والتباعد</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">عدد الأعمدة</label>
                  <select
                    value={layoutConfig.columns}
                    onChange={(e) => onChangeLayout({ columns: Number(e.target.value) as 1 | 2 })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value={1}>عمود واحد</option>
                    <option value={2}>عمودان (2 Columns)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">فجوة العمودين (px)</label>
                  <input
                    type="number"
                    min={8}
                    max={48}
                    disabled={layoutConfig.columns !== 2}
                    value={layoutConfig.columnGapPx ?? 18}
                    onChange={(e) => onChangeLayout({ columnGapPx: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center disabled:opacity-40"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">بين الأسئلة (px)</label>
                  <input
                    type="number"
                    min={4}
                    max={32}
                    value={layoutConfig.questionGapPx}
                    onChange={(e) => onChangeLayout({ questionGapPx: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">بين الأقسام (px)</label>
                  <input
                    type="number"
                    min={6}
                    max={40}
                    value={layoutConfig.sectionGapPx}
                    onChange={(e) => onChangeLayout({ sectionGapPx: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center"
                  />
                </div>
              </div>
            </div>

            {/* Typography */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">الخطوط والمحاذاة</span>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">نوع الخط</label>
                  <select
                    value={layoutConfig.fontFamily || 'cairo'}
                    onChange={(e) => onChangeLayout({ fontFamily: e.target.value as FontFamilyOption })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="cairo">Cairo — خط عربي حديث واضح</option>
                    <option value="amiri">Amiri — خط تقليدي مطبعي للقرآن والعربية</option>
                    <option value="inter">Inter — خط إنجليزي وعلمي دقيق</option>
                    <option value="system">خط النظام الافتراضي</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">حجم الخط (pt ≥ 9.5)</label>
                  <input
                    type="number"
                    min={9.5}
                    max={16}
                    step={0.5}
                    value={layoutConfig.fontSizePt}
                    onChange={(e) => onChangeLayout({ fontSizePt: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">تباعد الأسطر</label>
                  <input
                    type="number"
                    min={1.15}
                    max={2.2}
                    step={0.05}
                    value={layoutConfig.lineHeight}
                    onChange={(e) => onChangeLayout({ lineHeight: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono font-bold text-center"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">حجم العناوين</label>
                  <select
                    value={String(layoutConfig.headingScale ?? 1)}
                    onChange={(e) => onChangeLayout({ headingScale: Number(e.target.value) })}
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="0.9">صغير (0.9×)</option>
                    <option value="1">قياسي (1.0×)</option>
                    <option value="1.15">بارز (1.15×)</option>
                    <option value="1.25">كبير (1.25×)</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">اتجاه الأسئلة العام</label>
                  <select
                    value={layoutConfig.globalDirection || 'auto'}
                    onChange={(e) =>
                      onChangeLayout({ globalDirection: e.target.value as 'auto' | 'rtl' | 'ltr' })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="auto">تلقائي حسب النص</option>
                    <option value="rtl">من اليمين لليسار (RTL)</option>
                    <option value="ltr">من اليسار لليمين (LTR)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Numbering, Marks & Answer Space */}
            <div className="space-y-2 pt-2 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">الترقيم والدرجات ومساحة الإجابة</span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">ترقيم الأقسام</label>
                  <select
                    value={layoutConfig.sectionNumbering || 'auto'}
                    onChange={(e) =>
                      onChangeLayout({
                        sectionNumbering: e.target.value as ExamLayoutConfig['sectionNumbering'],
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="auto">تلقائي</option>
                    <option value="numeric">رقمي (1، 2، 3)</option>
                    <option value="arabic_alpha">حروف عربية (أ، ب، ج)</option>
                    <option value="alpha">إنجليزي (A, B, C)</option>
                    <option value="none">بدون شارة</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">ترقيم الأسئلة</label>
                  <select
                    value={layoutConfig.questionNumbering || 'numeric'}
                    onChange={(e) =>
                      onChangeLayout({
                        questionNumbering: e.target.value as ExamLayoutConfig['questionNumbering'],
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="numeric">رقمي (1. 2. 3.)</option>
                    <option value="arabic_alpha">أبجدي (أ. ب. ج.)</option>
                    <option value="none">بدون رقم</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="text-[11px] font-semibold text-slate-600 block mb-1">موضع الدرجة</label>
                  <select
                    value={layoutConfig.marksPlacement || 'inline_end'}
                    onChange={(e) =>
                      onChangeLayout({
                        marksPlacement: e.target.value as 'inline_end' | 'below_question',
                      })
                    }
                    className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="inline_end">في طرف السطر بجانب السؤال</option>
                    <option value="below_question">أسفل نص السؤال</option>
                  </select>
                </div>
              </div>

              {!isReadOnlyPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-slate-700">تعيين أسطر الإجابة للكل:</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={layoutConfig.defaultAnswerSpaceLines ?? 1}
                      onChange={(e) =>
                        onChangeLayout({ defaultAnswerSpaceLines: Number(e.target.value) })
                      }
                      className="w-14 px-2 py-1 border border-slate-200 rounded-lg bg-white text-center font-mono font-bold"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => onApplyDefaultAnswerLinesToAll(layoutConfig.defaultAnswerSpaceLines ?? 1)}
                    className="w-full py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-[11px] font-bold text-slate-800"
                  >
                    تطبيق {layoutConfig.defaultAnswerSpaceLines ?? 1} سطر على جميع الأسئلة
                  </button>
                </div>
              )}

              <label className="flex items-center gap-2 pt-1 text-[11px] font-bold text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={layoutConfig.keepQuestionsTogether !== false}
                  onChange={(e) => onChangeLayout({ keepQuestionsTogether: e.target.checked })}
                  className="accent-[#1B5E3A]"
                />
                <span>إبقاء كل سؤال مع خياراته وجداوله وصورته معاً</span>
              </label>
            </div>
          </div>
        )}

        {/* ==================== TAB 3: QUESTIONS & SECTIONS ==================== */}
        {activeTab === 'questions' && (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-bold text-slate-700 block mb-1">القسم المستهدف للإضافة:</label>
              <select
                value={targetSectionIdx}
                onChange={(e) => onSetTargetSection(Number(e.target.value))}
                className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                {exam.sections.map((sec, idx) => (
                  <option key={sec.id} value={idx}>
                    {idx + 1}. {sec.sectionTitle.slice(0, 36)}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={onAddSection}
                disabled={isReadOnlyPreview}
                className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة قسم جديد للاختبار</span>
              </button>
              <button
                type="button"
                onClick={onOpenBankImport}
                disabled={isReadOnlyPreview}
                className="w-full py-2 px-3 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 rounded-xl font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
              >
                <Database className="w-3.5 h-3.5" />
                <span>استيراد من بنك أسئلتي الخاص</span>
              </button>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <span className="text-[11px] font-extrabold text-slate-800 block mb-2">
                إدراج سؤال يدوي مباشر ({questionTypes.length} نوع):
              </span>
              <div className="grid grid-cols-2 gap-1.5">
                {questionTypes.map((qt) => (
                  <button
                    key={qt.type}
                    type="button"
                    disabled={isReadOnlyPreview}
                    onClick={() => onAddQuestion(qt.type)}
                    className="p-2 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-[#1B5E3A]/10 hover:border-[#1B5E3A] text-right transition-colors flex flex-col gap-0.5 disabled:opacity-40"
                  >
                    <span className="text-[11px] font-extrabold text-slate-900 leading-tight">
                      + {qt.labelAr}
                    </span>
                    <span className="text-[9px] font-english text-slate-500 truncate">{qt.labelEn}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: TEMPLATES & HEADER META ==================== */}
        {activeTab === 'templates' && (
          <div className="space-y-4">
            {/* Built-in Layout Presets */}
            <div className="space-y-2">
              <span className="font-extrabold text-slate-800 block">قوالب التنسيق الجاهزة</span>
              <div className="space-y-1.5">
                {BUILT_IN_AS_LAYOUT_TEMPLATES.map((tpl) => {
                  const isActive =
                    (tpl.layoutConfig.preset !== 'CUSTOM' && layoutConfig.preset === tpl.layoutConfig.preset) ||
                    (tpl.id === 'builtin-no-border' && layoutConfig.borderMode === 'none') ||
                    (tpl.id === 'builtin-full-border' && layoutConfig.borderMode === 'full' && layoutConfig.borderStyle === 'double') ||
                    (tpl.id === 'builtin-two-cols' && layoutConfig.columns === 2 && layoutConfig.orientation === 'portrait');
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onApplyTemplate(tpl)}
                      className={`w-full text-right p-2.5 rounded-xl border transition-colors flex items-start justify-between gap-2 ${
                        isActive
                          ? 'bg-emerald-50/80 border-[#1B5E3A] text-slate-950'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-extrabold text-xs">{tpl.nameAr}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 leading-snug">{tpl.description}</div>
                      </div>
                      {isActive && <Check className="w-4 h-4 text-[#1B5E3A] shrink-0 mt-0.5" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Save Current As Private Reusable Template */}
            <div className="space-y-2 pt-3 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">قوالبي الخاصة المحفوظة</span>
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-2">
                <input
                  type="text"
                  value={newTplName}
                  onChange={(e) => setNewTplName(e.target.value)}
                  placeholder="اسم القالب الخاص (مثال: اختبار شهري عمودين)"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-xs"
                />
                <input
                  type="text"
                  value={newTplDesc}
                  onChange={(e) => setNewTplDesc(e.target.value)}
                  placeholder="وصف مختصر (اختياري)"
                  className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white text-[11px]"
                />
                <button
                  type="button"
                  disabled={!newTplName.trim() || savingTpl}
                  onClick={handleSaveNewTpl}
                  className="w-full py-1.5 px-3 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-lg text-[11px] font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savingTpl ? 'جاري الحفظ...' : 'حفظ التنسيق الحالي كقالب خاص'}</span>
                </button>
              </div>

              {templatesLoading ? (
                <div className="text-center py-3 text-[11px] text-slate-400">جاري تحميل القوالب...</div>
              ) : savedTemplates.length === 0 ? (
                <div className="text-center py-3 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-xl">
                  لا توجد قوالب خاصة محفوظة لديك بعد.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {savedTemplates.map((tpl) => (
                    <div
                      key={tpl.id}
                      className="p-2.5 rounded-xl border border-slate-200 bg-white flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 truncate">{tpl.nameAr}</div>
                        {tpl.description && (
                          <div className="text-[10px] text-slate-500 truncate">{tpl.description}</div>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => onApplyTemplate(tpl)}
                          className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-[10px] font-bold"
                        >
                          تطبيق
                        </button>
                        <button
                          type="button"
                          onClick={() => onDeleteTemplate(tpl.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="حذف القالب"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Header Metadata */}
            <div className="space-y-2.5 pt-3 border-t border-slate-100">
              <span className="font-extrabold text-slate-800 block">بيانات الترويسة والاختبار</span>
              <div className="space-y-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">المادة الدراسية (تضبط اللغة والاتجاه تلقائياً)</label>
                  <select
                    value={exam.subjectId || authorizedSubjects[0]?.id || 'subj-ar'}
                    onChange={(e) => onChangeExamMeta({ subjectId: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    {authorizedSubjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.nameAr} {s.defaultDirection === 'ltr' ? '(English LTR)' : '(عربي RTL)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">لغة واتجاه ورقة الاختبار</label>
                  <select
                    value={headerConfig.headerLanguage === 'en' ? 'en' : 'ar'}
                    onChange={(e) =>
                      onChangeHeader({ headerLanguage: e.target.value as 'ar' | 'en' })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
                  >
                    <option value="ar">العربية (RTL) — للمواد العربية</option>
                    <option value="en">الإنجليزية (LTR) — لمادة اللغة الإنجليزية</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                    {headerConfig.headerLanguage === 'en' ? 'عنوان الاختبار (بالعربية أو الإنجليزية)' : 'عنوان الاختبار'}
                  </label>
                  <input
                    type="text"
                    value={headerConfig.headerLanguage === 'en' ? (exam.title || exam.titleAr) : (exam.titleAr || exam.title)}
                    onChange={(e) =>
                      headerConfig.headerLanguage === 'en'
                        ? onChangeExamMeta({ title: e.target.value })
                        : onChangeExamMeta({ titleAr: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">اسم المادة الظاهر في الترويسة</label>
                  <input
                    type="text"
                    value={headerConfig.headerLanguage === 'en' ? (headerConfig.subjectEn || headerConfig.subject) : headerConfig.subject}
                    onChange={(e) =>
                      headerConfig.headerLanguage === 'en'
                        ? onChangeHeader({ subjectEn: e.target.value })
                        : onChangeHeader({ subject: e.target.value })
                    }
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">الصف</label>
                    <select
                      value={exam.grade}
                      onChange={(e) => {
                        onChangeExamMeta({ grade: e.target.value });
                        onChangeHeader({ grade: e.target.value });
                      }}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg bg-white font-bold"
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
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">تاريخ الاختبار</label>
                    <input
                      type="date"
                      value={exam.examDate || headerConfig.examDate || ''}
                      onChange={(e) => {
                        onChangeExamMeta({ examDate: e.target.value });
                        onChangeHeader({ examDate: e.target.value });
                      }}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono text-[11px]"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">الزمن (دقيقة)</label>
                    <input
                      type="number"
                      min={5}
                      value={exam.timeLimitMinutes}
                      onChange={(e) => {
                        const mins = Number(e.target.value);
                        onChangeExamMeta({ timeLimitMinutes: mins });
                        onChangeHeader({
                          timeLimit: headerConfig.headerLanguage === 'en' ? `${mins} Minutes` : `${mins} دقيقة`,
                        });
                      }}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg font-mono text-center"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">العام الدراسي</label>
                    <input
                      type="text"
                      value={headerConfig.academicYear}
                      onChange={(e) => onChangeHeader({ academicYear: e.target.value })}
                      className="w-full px-2 py-1.5 border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">اسم المعلم</label>
                  <input
                    type="text"
                    value={headerConfig.teacherName ?? exam.createdByName}
                    onChange={(e) => onChangeHeader({ teacherName: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={headerConfig.showTeacherName !== false}
                    onChange={(e) => onChangeHeader({ showTeacherName: e.target.checked })}
                    className="accent-[#1B5E3A]"
                  />
                  <span>إظهار اسم المعلم في الترويسة</span>
                </label>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">تعليمات الاختبار</label>
                  <input
                    type="text"
                    value={headerConfig.notes || ''}
                    onChange={(e) => onChangeHeader({ notes: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
