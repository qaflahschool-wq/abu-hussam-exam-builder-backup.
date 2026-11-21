import React, { useState, useEffect, useRef } from 'react';
import {
  Camera,
  UploadCloud,
  FileText,
  AlertTriangle,
  BookOpen,
  Sparkles,
  Trash2,
  Eye,
  Save,
  RefreshCw,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Layers,
  ArrowRight,
  Database,
  ExternalLink,
  Info,
  CheckCircle2,
  ShieldCheck,
} from 'lucide-react';
import { api } from '../../services/api.ts';
import {
  ExtractedAnalysisResult,
  GradeLevel,
  ContentScope,
  EducationalLevel,
  QuestionType,
  Question,
  AnalyzedDocument,
} from '../../types/index.ts';

interface ImageAnalyzerViewProps {
  onNavigateToGenerator?: (imageContext: string) => void;
  onNavigateToQuestionBank?: () => void;
}

interface SelectedImage {
  id: string;
  name: string;
  dataUrl: string;
  mimeType: string;
  sizeKb: number;
}

export const ImageAnalyzerView: React.FC<ImageAnalyzerViewProps> = ({
  onNavigateToGenerator,
  onNavigateToQuestionBank,
}) => {
  // Images upload state
  const [images, setImages] = useState<SelectedImage[]>([]);
  const [previewModalImage, setPreviewModalImage] = useState<string | null>(null);
  const [gradeHint, setGradeHint] = useState<GradeLevel>('Grade 8');
  const [unitHint, setUnitHint] = useState<string>('');

  // Processing state
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgressStep, setAnalysisProgressStep] = useState<string>('');
  const [analysisResult, setAnalysisResult] = useState<ExtractedAnalysisResult | null>(null);
  const [activeTab, setActiveTab] = useState<'text' | 'grammar' | 'vocab' | 'exercises' | 'quality'>('text');
  const [editedRawText, setEditedRawText] = useState<string>('');
  const [modelUsed, setModelUsed] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedText, setCopiedText] = useState(false);

  // Document saving
  const [documentTitle, setDocumentTitle] = useState<string>('');
  const [isSavingDoc, setIsSavingDoc] = useState(false);
  const [savedDocSuccess, setSavedDocSuccess] = useState(false);
  const [savedDocuments, setSavedDocuments] = useState<AnalyzedDocument[]>([]);
  const [showSavedDocsDrawer, setShowSavedDocsDrawer] = useState(false);

  // Questions generator state
  const [genScope, setGenScope] = useState<ContentScope>('IMAGES_CURRICULUM');
  const [genLevel, setGenLevel] = useState<EducationalLevel>('INTERMEDIATE');
  const [selectedQTypes, setSelectedQTypes] = useState<QuestionType[]>([
    'Multiple Choice',
    'Fill in the Blanks',
    'True or False',
  ]);
  const [qCount, setQCount] = useState<number>(4);
  const [teacherNotes, setTeacherNotes] = useState<string>('');
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [generatedQuestions, setGeneratedQuestions] = useState<Question[]>([]);
  const [saveToBankAfterGen, setSaveToBankAfterGen] = useState(true);
  const [addedToBankCount, setAddedToBankCount] = useState<number | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Load saved documents on mount
  useEffect(() => {
    loadSavedDocs();
  }, []);

  const loadSavedDocs = async () => {
    try {
      const docs = await api.getAnalyzedDocuments();
      setSavedDocuments(docs);
    } catch (e) {
      console.warn('Failed to fetch documents', e);
    }
  };

  // Handle files selection
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setErrorMsg(null);

    const remainingSlots = 8 - images.length;
    if (remainingSlots <= 0) {
      setErrorMsg('الحد الأقصى للصور في الدفعة الواحدة هو 8 صور.');
      return;
    }

    const filesToRead = Array.from(files).slice(0, remainingSlots);

    filesToRead.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        setErrorMsg('يرجى اختيار ملفات صور فقط (PNG, JPG, WebP).');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result) {
          const newImg: SelectedImage = {
            id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            name: file.name,
            dataUrl: result,
            mimeType: file.type || 'image/jpeg',
            sizeKb: Math.round(file.size / 1024),
          };
          setImages((prev) => [...prev, newImg]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Reorder images
  const moveImage = (index: number, direction: 'prev' | 'next') => {
    const newIdx = direction === 'prev' ? index - 1 : index + 1;
    if (newIdx < 0 || newIdx >= images.length) return;
    const copy = [...images];
    const temp = copy[index];
    copy[index] = copy[newIdx];
    copy[newIdx] = temp;
    setImages(copy);
  };

  // Remove image
  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  // Run Vision Analysis
  const handleStartAnalysis = async () => {
    if (images.length === 0) {
      setErrorMsg('يرجى رفع صورة واحدة على الأقل لبدء التحليل.');
      return;
    }

    setIsAnalyzing(true);
    setErrorMsg(null);
    setAnalysisProgressStep('جاري قراءة الصور وضبط تسلسل الصفحات...');

    try {
      setTimeout(() => {
        setAnalysisProgressStep('فحص النصوص والخطوط بالرؤية الحاسوبية Gemini Vision...');
      }, 1500);

      setTimeout(() => {
        setAnalysisProgressStep('استخراج القواعد النحوية ومفردات المنهج اليمني...');
      }, 3500);

      const res = await api.analyzeImages(
        images.map((img) => ({ dataUrl: img.dataUrl, name: img.name, mimeType: img.mimeType })),
        gradeHint,
        unitHint || undefined
      );

      if (res.success && res.result) {
        setAnalysisResult(res.result);
        setEditedRawText(res.result.rawText || '');
        setModelUsed(res.modelUsed || 'Gemini 3.8 Flash');
        setDocumentTitle(res.result.detectedTopic || `مستند لغة إنجليزية - ${gradeHint}`);
        setActiveTab('text');
      } else {
        setErrorMsg('لم نتمكن من استخراج بيانات واضحة من الصور، يرجى التأكد من وضوح الصورة.');
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'حدث خطأ أثناء فحص الصور');
    } finally {
      setIsAnalyzing(false);
      setAnalysisProgressStep('');
    }
  };

  // Copy raw text
  const handleCopyText = () => {
    if (!editedRawText) return;
    navigator.clipboard.writeText(editedRawText);
    setCopiedText(true);
    setTimeout(() => setCopiedText(false), 2000);
  };

  // Save Document to Library
  const handleSaveDocument = async () => {
    if (!analysisResult) return;
    setIsSavingDoc(true);
    try {
      const docToSave: Partial<AnalyzedDocument> = {
        title: documentTitle || 'مستند بدون عنوان',
        grade: analysisResult.suggestedGrade || gradeHint,
        topic: analysisResult.detectedTopic || 'موضوع دراسي',
        uploadedImages: images.map((img) => ({
          id: img.id,
          name: img.name,
          dataUrl: img.dataUrl.length < 500000 ? img.dataUrl : '', // Store thumbnail or omit if too big
          mimeType: img.mimeType,
          sizeKb: img.sizeKb,
        })),
        analysis: {
          ...analysisResult,
          rawText: editedRawText,
        },
        tags: [
          analysisResult.suggestedGrade || gradeHint,
          analysisResult.detectedTopic || 'English',
          'مدرسة قفلة',
        ],
      };

      await api.saveAnalyzedDocument(docToSave);
      setSavedDocSuccess(true);
      await loadSavedDocs();
      setTimeout(() => setSavedDocSuccess(false), 2500);
    } catch (e: any) {
      setErrorMsg(e.message || 'فشل حفظ المستند في المكتبة');
    } finally {
      setIsSavingDoc(false);
    }
  };

  // Load a saved document
  const handleLoadSavedDoc = (doc: AnalyzedDocument) => {
    setAnalysisResult(doc.analysis);
    setEditedRawText(doc.analysis.rawText || '');
    setDocumentTitle(doc.title);
    setGradeHint(doc.grade);
    setShowSavedDocsDrawer(false);
  };

  // Delete saved document
  const handleDeleteSavedDoc = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('هل تريد حذف هذا المستند من مكتبة الوثائق؟')) return;
    try {
      await api.deleteAnalyzedDocument(id);
      await loadSavedDocs();
    } catch (err: any) {
      alert(err.message || 'فشل حذف المستند');
    }
  };

  // Generate Questions from Image Analysis
  const handleGenerateQuestions = async () => {
    if (!analysisResult) return;
    setIsGeneratingQuestions(true);
    setErrorMsg(null);
    setAddedToBankCount(null);

    try {
      const currentAnalysis: ExtractedAnalysisResult = {
        ...analysisResult,
        rawText: editedRawText,
      };

      const res = await api.generateQuestionsFromImages({
        analysis: currentAnalysis,
        grade: analysisResult.suggestedGrade || gradeHint,
        contentScope: genScope,
        educationalLevel: genLevel,
        selectedQuestionTypes: selectedQTypes,
        count: qCount,
        teacherNotes,
        saveToBank: saveToBankAfterGen,
      });

      if (res.success && res.questions) {
        setGeneratedQuestions(res.questions);
        if (saveToBankAfterGen) {
          setAddedToBankCount(res.questions.length);
        }
      }
    } catch (e: any) {
      setErrorMsg(e.message || 'فشل توليد الأسئلة من الصور');
    } finally {
      setIsGeneratingQuestions(false);
    }
  };

  // Send context to Full Exam Generator
  const handleSendToExamGenerator = () => {
    if (!analysisResult) return;
    const contextSnippet = `
=== EXTRACTED FROM TEACHER IMAGE DOCUMENT ===
Topic: ${analysisResult.detectedTopic}
Grade: ${analysisResult.suggestedGrade || gradeHint}
Grammar Points: ${(analysisResult.grammarConcepts || []).map((g) => g.concept + ' (' + g.ruleFormula + ')').join('; ')}
Key Vocabulary: ${(analysisResult.vocabulary || []).map((v) => v.word + ' (' + (v.arabicTranslation || '') + ')').join(', ')}
Text Content:
${editedRawText.substring(0, 1000)}
=============================================
`.trim();

    if (onNavigateToGenerator) {
      onNavigateToGenerator(contextSnippet);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12 animate-fade-in" dir="rtl">
      {/* Header Banner */}
      <div className="bg-gradient-to-l from-[#0f2537] via-[#163854] to-[#0f2537] text-white p-6 rounded-2xl shadow-xl border border-amber-500/20 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500 text-slate-950 flex items-center gap-1.5 shadow-sm">
                <Sparkles className="w-3.5 h-3.5" />
                محرك الرؤية والذكاء الاصطناعي متعدد المصادر
              </span>
              <span className="text-xs text-amber-200/80 font-mono">
                مدرسة قفلة للتعليم الأساسي • اليمن
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
              تحليل الصور والمحتوى التعليمي | AI Image Analyzer
            </h1>
            <p className="text-slate-300 text-sm mt-1 max-w-2xl leading-relaxed">
              ارفع صور صفحات المنهج أو الدفاتر المدرسية أو أوراق العمل. يقوم المحرك بفحص دقة النصوص، واستخلاص القواعد النحوية، والمفردات مع ترجمتها، وتوليد أسئلة اختبارية مطابقة مع تصنيف المصدر والمستوى التعليمي.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-center">
            <button
              onClick={() => setShowSavedDocsDrawer(!showSavedDocsDrawer)}
              className="px-4 py-2 bg-slate-800/80 hover:bg-slate-700 text-amber-300 border border-amber-500/30 rounded-xl text-sm font-semibold flex items-center gap-2 transition-all shadow-sm"
            >
              <Database className="w-4 h-4" />
              مكتبة الوثائق المحللة
              <span className="bg-amber-500/20 text-amber-300 text-xs px-2 py-0.5 rounded-full font-mono">
                {savedDocuments.length}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Error alert */}
      {errorMsg && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-800 text-sm flex items-center gap-3 animate-shake">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 text-red-600" />
          <span>{errorMsg}</span>
          <button
            onClick={() => setErrorMsg(null)}
            className="mr-auto text-xs underline font-semibold text-red-700 hover:text-red-900"
          >
            إغلاق
          </button>
        </div>
      )}

      {/* Grid: Upload & Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Upload & Thumbnails Section */}
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <UploadCloud className="w-5 h-5 text-amber-600" />
              رفع الصور والمستندات التعليمية
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              {images.length} / 8 صور محددة
            </span>
          </div>

          {/* Upload Dropzone & Mobile Camera Buttons */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              handleFiles(e.dataTransfer.files);
            }}
            className="border-2 border-dashed border-slate-300 hover:border-amber-500 bg-slate-50/70 hover:bg-amber-50/20 rounded-2xl p-6 text-center transition-all cursor-pointer group"
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              accept="image/*"
              multiple
              className="hidden"
            />
            <input
              type="file"
              ref={cameraInputRef}
              onChange={(e) => handleFiles(e.target.files)}
              accept="image/*"
              capture="environment"
              className="hidden"
            />

            <div className="flex flex-col items-center justify-center space-y-3">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">
                  اسحب الصور وأفلتها هنا، أو اضغط للاختيار من الجهاز
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  يدعم صور الكتب المدرسية، الدفاتر المكتوبة بخط اليد، السبورة، وأوراق الاختبارات (JPG, PNG, WebP)
                </p>
              </div>

              {/* Mobile Quick Camera Action Button */}
              <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-sm touch-target-min"
                >
                  <Camera className="w-4 h-4 text-amber-400" />
                  تصوير مباشر بالكاميرا
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm touch-target-min"
                >
                  <UploadCloud className="w-4 h-4" />
                  تصفح الملفات
                </button>
              </div>
            </div>
          </div>

          {/* Selected Images Grid & Ordering */}
          {images.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">
                  ترتيب الصور (اضغط الأسهم لضبط تسلسل الصفحات قبل التحليل):
                </span>
                <button
                  type="button"
                  onClick={() => setImages([])}
                  className="text-red-600 hover:text-red-700 font-semibold"
                >
                  حذف الكل
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {images.map((img, idx) => (
                  <div
                    key={img.id}
                    className="relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group shadow-sm flex flex-col"
                  >
                    <div className="relative aspect-video bg-slate-200 overflow-hidden">
                      <img
                        src={img.dataUrl}
                        alt={img.name}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1 right-1 bg-[#0f2537]/80 text-amber-300 text-[10px] font-bold px-1.5 py-0.5 rounded backdrop-blur-xs font-mono">
                        صفحة {idx + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPreviewModalImage(img.dataUrl)}
                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-semibold gap-1"
                      >
                        <Eye className="w-4 h-4" />
                        معاينة
                      </button>
                    </div>

                    <div className="p-2 bg-white flex items-center justify-between border-t border-slate-100 text-[11px]">
                      <span className="truncate max-w-[80px] text-slate-700 font-medium" title={img.name}>
                        {img.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveImage(idx, 'prev')}
                          className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          title="تحريك للأمام"
                        >
                          <ChevronUp className="w-3.5 h-3.5 rotate-90" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === images.length - 1}
                          onClick={() => moveImage(idx, 'next')}
                          className="p-1 text-slate-500 hover:text-slate-800 disabled:opacity-30"
                          title="تحريك للخلف"
                        >
                          <ChevronDown className="w-3.5 h-3.5 rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          className="p-1 text-red-500 hover:text-red-700"
                          title="حذف الصورة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Hints & Analysis Execution Controls */}
        <div className="lg:col-span-5 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 border-b border-slate-100 pb-3">
              <BookOpen className="w-5 h-5 text-amber-600" />
              توجيه المنهج ومعايير التحليل
            </h2>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                الصف الدراسي المتوقع (المنهج اليمني)
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(['Grade 7', 'Grade 8', 'Grade 9'] as GradeLevel[]).map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGradeHint(g)}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition-all ${
                      gradeHint === g
                        ? 'bg-[#0f2537] text-amber-300 border-[#0f2537] shadow-sm'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {g === 'Grade 7' ? 'الصف السابع' : g === 'Grade 8' ? 'الصف الثامن' : 'الصف التاسع'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                الوحدة أو الموضوع الدراسي (اختياري)
              </label>
              <input
                type="text"
                value={unitHint}
                onChange={(e) => setUnitHint(e.target.value)}
                placeholder="مثال: Unit 2: Daily Routines أو قواعد Past Simple"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                يساعد الذكاء الاصطناعي في ربط المصطلحات المستخرجة بالوحدة المقررة بدقة.
              </p>
            </div>

            <div className="p-3.5 bg-amber-50/80 rounded-xl border border-amber-200 text-xs text-amber-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-700" />
                آلية الفحص متعدد الطبقات
              </div>
              <p className="text-[11px] leading-relaxed">
                يقوم محرك الرؤية بفحص وضوح الصورة وتنبيه المعلم بأي أجزاء مقطوعة أو غامضة، ثم يستخلص القواعد مع الشرح النظري وصيغ التراكيب وأخطاء الطلاب الشائعة في مدارس اليمن.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-100">
            <button
              type="button"
              disabled={isAnalyzing || images.length === 0}
              onClick={handleStartAnalysis}
              className={`w-full py-3.5 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition-all touch-target-min ${
                isAnalyzing || images.length === 0
                  ? 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'
                  : 'bg-gradient-to-r from-amber-500 via-amber-600 to-amber-500 text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-amber-900/20 active:scale-98'
              }`}
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>{analysisProgressStep || 'جاري التحليل بالذكاء الاصطناعي...'}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>بدء تحليل الصور واستخراج المحتوى</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Analysis Results Workspace */}
      {analysisResult && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden space-y-0 animate-fade-in">
          {/* Header of Results */}
          <div className="p-6 bg-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800">
            <div>
              <div className="flex items-center gap-2 text-xs text-amber-400 mb-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>تم التحليل بنجاح بواسطة {modelUsed}</span>
                <span>•</span>
                <span className="font-mono">{analysisResult.suggestedGrade}</span>
                {analysisResult.qualityReport && (
                  <>
                    <span>•</span>
                    <span className="font-mono">
                      مستوى الوضوح: {analysisResult.qualityReport.score}%
                    </span>
                  </>
                )}
              </div>
              <input
                type="text"
                value={documentTitle}
                onChange={(e) => setDocumentTitle(e.target.value)}
                className="text-lg font-bold bg-transparent text-white border-b border-slate-700 focus:border-amber-400 focus:outline-hidden w-full md:w-96"
                placeholder="عنوان المستند..."
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDocument}
                disabled={isSavingDoc}
                className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm"
              >
                {savedDocSuccess ? (
                  <>
                    <Check className="w-4 h-4" />
                    تم الحفظ بالمكتبة
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    حفظ المستند في المكتبة
                  </>
                )}
              </button>

              {onNavigateToGenerator && (
                <button
                  type="button"
                  onClick={handleSendToExamGenerator}
                  className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all border border-slate-700"
                >
                  <ArrowRight className="w-4 h-4 text-amber-400" />
                  تضمين في مولّد الاختبارات
                </button>
              )}
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-200 bg-slate-50 px-4 overflow-x-auto">
            <button
              type="button"
              onClick={() => setActiveTab('text')}
              className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'text'
                  ? 'border-amber-500 text-amber-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-4 h-4" />
              النص المستخرج (قابل للتعديل)
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('grammar')}
              className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'grammar'
                  ? 'border-amber-500 text-amber-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <BookOpen className="w-4 h-4" />
              القواعد النحوية المكتشفة ({analysisResult.grammarConcepts?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vocab')}
              className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'vocab'
                  ? 'border-amber-500 text-amber-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              المفردات والترجمة ({analysisResult.vocabulary?.length || 0})
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('exercises')}
              className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'exercises'
                  ? 'border-amber-500 text-amber-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              التمارين ونصوص القراءة
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('quality')}
              className={`py-3.5 px-4 text-xs font-bold border-b-2 whitespace-nowrap transition-all flex items-center gap-2 ${
                activeTab === 'quality'
                  ? 'border-amber-500 text-amber-700 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
              تقرير الجودة وسلامة الخط
            </button>
          </div>

          {/* Tab 1: Extracted Raw Text */}
          {activeTab === 'text' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    النص الكامل المستخرج من الصور (OCR)
                  </h3>
                  <p className="text-xs text-slate-500">
                    يمكن للمعلم تعديل أي كلمة أو تصحيح نص مكتوب بخط يدوي غير واضح قبل توليد الأسئلة.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCopyText}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5"
                >
                  {copiedText ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedText ? 'تم النسخ' : 'نسخ النص'}
                </button>
              </div>

              <textarea
                value={editedRawText}
                onChange={(e) => setEditedRawText(e.target.value)}
                dir="ltr"
                rows={12}
                className="w-full p-4 rounded-xl border border-slate-200 bg-slate-50 font-mono text-sm leading-relaxed focus:bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>
          )}

          {/* Tab 2: Discovered Grammar Concepts */}
          {activeTab === 'grammar' && (
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    القواعد والتراكيب اللغوية المستخرجة والمطابقة للمنهج
                  </h3>
                  <p className="text-xs text-slate-500">
                    تشمل صيغة التركيب، التفسير الأكاديمي، الشرح بالعربية، وأخطاء الطلاب المتوقعة في اليمن.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {(analysisResult.grammarConcepts || []).map((g, idx) => (
                  <div
                    key={idx}
                    className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 hover:border-amber-400 transition-colors shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-sm text-[#0f2537]" dir="ltr">
                        {g.concept}
                      </span>
                      <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                        {g.arabicName}
                      </span>
                    </div>

                    <div className="p-2 bg-white rounded-lg border border-slate-200 text-xs font-mono text-slate-800" dir="ltr">
                      <span className="text-slate-400 font-sans mr-2">Formula:</span>
                      <strong>{g.ruleFormula}</strong>
                    </div>

                    <p className="text-xs text-slate-700 leading-relaxed">
                      {g.explanationAr}
                    </p>

                    {g.examples && g.examples.length > 0 && (
                      <div className="pt-1">
                        <span className="text-[11px] font-bold text-slate-500">أمثلة:</span>
                        <ul className="list-disc list-inside text-xs text-slate-800 space-y-0.5 font-sans mt-0.5" dir="ltr">
                          {g.examples.map((ex, eIdx) => (
                            <li key={eIdx}>{ex}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {g.commonMistakes && g.commonMistakes.length > 0 && (
                      <div className="p-2 bg-amber-50/70 rounded-lg text-[11px] text-amber-900 border border-amber-200/60">
                        <span className="font-bold">أخطاء شائعة للطلاب: </span>
                        {g.commonMistakes.join(' • ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 3: Vocabulary */}
          {activeTab === 'vocab' && (
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">
                المفردات والكلمات المفتاحية المكتشفة مع الترجمة العربية
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {(analysisResult.vocabulary || []).map((v, idx) => (
                  <div
                    key={idx}
                    className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-col justify-between hover:border-amber-400 transition-colors"
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-900 text-sm font-sans" dir="ltr">
                          {v.word}
                        </span>
                        {v.partOfSpeech && (
                          <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-mono">
                            {v.partOfSpeech}
                          </span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-amber-800 mt-1">
                        {v.arabicTranslation}
                      </p>
                      {v.phoneticHint && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5" dir="ltr">
                          {v.phoneticHint}
                        </p>
                      )}
                    </div>
                    {v.exampleSentence && (
                      <p className="text-[11px] text-slate-600 italic bg-white p-2 rounded mt-2 border border-slate-100 font-sans" dir="ltr">
                        "{v.exampleSentence}"
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Tab 4: Exercises & Reading Passages */}
          {activeTab === 'exercises' && (
            <div className="p-6 space-y-6">
              {analysisResult.readingPassages && analysisResult.readingPassages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">
                    نصوص القراءة والفهم المستخرجة (Reading Passages)
                  </h3>
                  {analysisResult.readingPassages.map((p, idx) => (
                    <div
                      key={idx}
                      className="p-4 bg-slate-50 rounded-xl border border-slate-200 font-sans text-sm leading-relaxed text-slate-800"
                      dir="ltr"
                    >
                      {typeof p === 'string' ? p : p.text}
                    </div>
                  ))}
                </div>
              )}

              {analysisResult.discoveredExercises && analysisResult.discoveredExercises.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-800">
                    التمارين والأنشطة المرصودة في الصور
                  </h3>
                  <div className="space-y-3">
                    {analysisResult.discoveredExercises.map((ex, idx) => (
                      <div
                        key={idx}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-xs text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                            {ex.type || ex.exerciseType}
                          </span>
                          <span className="text-xs text-slate-600 font-sans" dir="ltr">
                            {ex.instructions || ex.prompt}
                          </span>
                        </div>
                        <div className="space-y-1.5 pt-1">
                          {ex.items && ex.items.map((item, iIdx) => (
                            <div
                              key={iIdx}
                              className="p-2 bg-white rounded border border-slate-100 flex items-center justify-between text-xs font-sans"
                              dir="ltr"
                            >
                              <span>{item.itemText}</span>
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                                Ans: {item.answer}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tab 5: Quality Report */}
          {activeTab === 'quality' && (
            <div className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-800">
                تقرير جودة المستندات وملاحظات الرؤية الحاسوبية
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-xs text-slate-500 block">درجة الوضوح</span>
                  <span className="text-2xl font-extrabold text-amber-600 font-mono">
                    {analysisResult.qualityReport?.score || 85}%
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-xs text-slate-500 block">تشويش أو ضبابية</span>
                  <span className={`text-sm font-bold ${analysisResult.qualityReport?.blurDetected ? 'text-red-600' : 'text-emerald-600'}`}>
                    {analysisResult.qualityReport?.blurDetected ? 'نعم (تم الرصد)' : 'لا (صورة واضحة)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-xs text-slate-500 block">خط يدوي</span>
                  <span className="text-sm font-bold text-slate-800">
                    {analysisResult.qualityReport?.handwritingDetected ? 'نعم (ملاحظات يدوية)' : 'لا (مطبوع)'}
                  </span>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-center">
                  <span className="text-xs text-slate-500 block">أطراف مقطوعة</span>
                  <span className={`text-sm font-bold ${analysisResult.qualityReport?.cutoffDetected ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {analysisResult.qualityReport?.cutoffDetected ? 'تنبيه: أطراف مقطوعة' : 'مكتمل الأطراف'}
                  </span>
                </div>
              </div>

              {analysisResult.qualityReport?.notes && (
                <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-900">
                  <span className="font-bold">توصيات المحرك للمعلم: </span>
                  {analysisResult.qualityReport.notes}
                </div>
              )}

              {analysisResult.qualityReport?.illegibleSegments && analysisResult.qualityReport.illegibleSegments.length > 0 && (
                <div className="p-3 bg-red-50 rounded-xl border border-red-200 text-xs text-red-900 space-y-1">
                  <span className="font-bold block">فقرات تحتاج مراجعة يدوية من المعلم:</span>
                  <ul className="list-disc list-inside space-y-0.5">
                    {analysisResult.qualityReport.illegibleSegments.map((seg, sIdx) => (
                      <li key={sIdx}>{seg}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Section: Generate Questions Directly from Analysis */}
          <div className="p-6 bg-slate-50 border-t border-slate-200 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-amber-600" />
                  توليد أسئلة اختبارية مباشرة من الصور المحللة
                </h3>
                <p className="text-xs text-slate-500">
                  حدد نطاق المحتوى والمستوى التعليمي وأنواع الأسئلة المطلوبة لإنشاء أسئلة نموذجية مع إجاباتها.
                </p>
              </div>

              {addedToBankCount !== null && (
                <div className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-xs font-bold rounded-xl flex items-center gap-1.5 border border-emerald-300 animate-fade-in">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  تمت إضافة {addedToBankCount} أسئلة إلى بنك الأسئلة المركزي بنجاح
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Content Scope */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  نطاق المحتوى (Content Scope)
                </label>
                <select
                  value={genScope}
                  onChange={(e) => setGenScope(e.target.value as ContentScope)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  <option value="IMAGES_ONLY">من الصور والمستندات فقط</option>
                  <option value="IMAGES_CURRICULUM">الصور + المنهج الدراسي</option>
                  <option value="IMAGES_CURRICULUM_ENRICHMENT">الصور + المنهج + إثراء لغوي</option>
                </select>
              </div>

              {/* Educational Level */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  المستوى التعليمي (Educational Level)
                </label>
                <select
                  value={genLevel}
                  onChange={(e) => setGenLevel(e.target.value as EducationalLevel)}
                  className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white font-semibold focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
                >
                  <option value="FOUNDATION">تأسيسي (Foundation - لمعالجة الضعف)</option>
                  <option value="BASIC">أساسي (Basic - محتوى الكتاب المدرسي)</option>
                  <option value="INTERMEDIATE">متوسط (Intermediate - مستوى الاختبارات العامة)</option>
                  <option value="ADVANCED">متقدم (Advanced - إثراء وتحدي لغوي)</option>
                </select>
              </div>

              {/* Question Count */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  عدد الأسئلة المطلوبة
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={qCount}
                    onChange={(e) => setQCount(Number(e.target.value))}
                    className="flex-1 accent-amber-600"
                  />
                  <span className="w-8 text-center text-xs font-mono font-bold bg-white p-1.5 border rounded-lg">
                    {qCount}
                  </span>
                </div>
              </div>

              {/* Save to Bank Toggle */}
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 p-2 bg-white rounded-xl border border-slate-200 cursor-pointer text-xs font-bold text-slate-700 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={saveToBankAfterGen}
                    onChange={(e) => setSaveToBankAfterGen(e.target.checked)}
                    className="accent-amber-600 rounded"
                  />
                  حفظ تلقائي في بنك الأسئلة المركزي
                </label>
              </div>
            </div>

            {/* Question Types Checkboxes */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                أنماط الأسئلة المقترحة
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  'Multiple Choice',
                  'Fill in the Blanks',
                  'True or False',
                  'Matching',
                  'Grammar',
                  'Vocabulary',
                  'Correct the Mistake',
                  'Rearrange the Words',
                ].map((type) => {
                  const isChecked = selectedQTypes.includes(type as QuestionType);
                  return (
                    <button
                      key={type}
                      type="button"
                      onClick={() => {
                        if (isChecked) {
                          if (selectedQTypes.length > 1) {
                            setSelectedQTypes(selectedQTypes.filter((t) => t !== type));
                          }
                        } else {
                          setSelectedQTypes([...selectedQTypes, type as QuestionType]);
                        }
                      }}
                      className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all ${
                        isChecked
                          ? 'bg-[#0f2537] text-amber-300 border-[#0f2537]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {type}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Notes */}
            <div>
              <input
                type="text"
                value={teacherNotes}
                onChange={(e) => setTeacherNotes(e.target.value)}
                placeholder="توجيهات إضافية للمعلم (مثال: التركيز على قاعدة المفرد الغائب أو أسماء المهن)"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-200 bg-white focus:ring-2 focus:ring-amber-500 focus:outline-hidden"
              />
            </div>

            {/* Generate Action Button */}
            <div>
              <button
                type="button"
                disabled={isGeneratingQuestions}
                onClick={handleGenerateQuestions}
                className={`py-3 px-6 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 shadow-md transition-all touch-target-min ${
                  isGeneratingQuestions
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 hover:from-amber-400 hover:to-amber-500 shadow-amber-900/10'
                }`}
              >
                {isGeneratingQuestions ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>جاري توليد الأسئلة وصياغة الإجابات النموذجية...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    <span>توليد الأسئلة الآن ({qCount} أسئلة)</span>
                  </>
                )}
              </button>
            </div>

            {/* Generated Questions List Preview */}
            {generatedQuestions.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-slate-200">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-slate-800">
                    الأسئلة المولدة من محتوى الصورة ({generatedQuestions.length})
                  </h4>
                  {onNavigateToQuestionBank && (
                    <button
                      type="button"
                      onClick={onNavigateToQuestionBank}
                      className="text-xs text-amber-700 hover:text-amber-800 font-bold flex items-center gap-1"
                    >
                      عرض في بنك الأسئلة
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="space-y-3">
                  {generatedQuestions.map((q, idx) => (
                    <div
                      key={q.id || idx}
                      className="p-4 bg-white rounded-xl border border-slate-200 space-y-2 shadow-xs"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center flex-wrap gap-2">
                          <span className="w-6 h-6 rounded-full bg-slate-900 text-amber-400 text-xs font-mono font-bold flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="text-xs font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                            {q.type}
                          </span>
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded flex items-center gap-1 ${
                              q.sourceCode === 'IMAGE_SOURCE'
                                ? 'bg-purple-100 text-purple-900 border border-purple-200'
                                : q.sourceCode === 'APPLICATION'
                                ? 'bg-amber-100 text-amber-900 border border-amber-200'
                                : q.sourceCode === 'ENRICHMENT'
                                ? 'bg-indigo-100 text-indigo-900 border border-indigo-200'
                                : 'bg-teal-100 text-teal-900 border border-teal-200'
                            }`}
                          >
                            <Camera className="w-3 h-3" />
                            {q.sourceCode === 'IMAGE_SOURCE'
                              ? 'مستند مصور (IMAGE_SOURCE)'
                              : q.sourceCode === 'APPLICATION'
                              ? 'سياق تطبيقي (APPLICATION)'
                              : q.sourceCode === 'ENRICHMENT'
                              ? 'إثرائي إضافي (ENRICHMENT)'
                              : 'تأسيسي (FOUNDATION)'}
                          </span>
                          <span className="text-xs font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded">
                            {q.educationalLevel}
                          </span>
                          {/* Composite Fidelity Score Badge */}
                          <span
                            className={`text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 font-mono ${
                              (q.sourceFidelityScore ?? 100) >= 85
                                ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                                : (q.sourceFidelityScore ?? 100) >= 60
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-rose-100 text-rose-900 border border-rose-300'
                            }`}
                            title="الدرجة الكلية المركبة لمطابقة المصدر والمعنى (Composite Semantic Fidelity)"
                          >
                            <ShieldCheck className="w-3 h-3 text-emerald-700" />
                            المطابقة: {q.sourceFidelityScore ?? 100}%
                          </span>

                          {/* Relationship Accuracy Badge */}
                          {q.relationshipAccuracy !== undefined && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                                q.relationshipAccuracy >= 85
                                  ? 'bg-blue-50 text-blue-900 border border-blue-200'
                                  : 'bg-rose-50 text-rose-900 border border-rose-300'
                              }`}
                              title="دقة ارتباط الشخصية بالفعل والوجهة الموثقة (Relationship Accuracy)"
                            >
                              العلاقات: {q.relationshipAccuracy}%
                            </span>
                          )}

                          {/* Answer Grounding Badge */}
                          {q.answerGroundingScore !== undefined && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md font-mono ${
                                q.answerGroundingScore >= 85
                                  ? 'bg-teal-50 text-teal-900 border border-teal-200'
                                  : 'bg-rose-50 text-rose-900 border border-rose-300'
                              }`}
                              title="مدى صحة الإجابة النموذجية وتطابقها مع حقائق الوثيقة (Answer Grounding)"
                            >
                              الإجابة: {q.answerGroundingScore}%
                            </span>
                          )}

                          {/* Teacher Review Required Tag */}
                          {q.requiresTeacherReview && (
                            <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 font-sans flex items-center gap-1 shadow-xs animate-pulse">
                              <AlertTriangle className="w-3 h-3 text-slate-950" />
                              يتطلب مراجعة المعلم
                            </span>
                          )}
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-500">
                          {q.marks} {q.marks === 1 ? 'درجة' : 'درجات'}
                        </span>
                      </div>

                      {/* Teacher Review Alert Banner if Required */}
                      {q.requiresTeacherReview && q.teacherReviewReason && (
                        <div className="p-3 bg-amber-50 border-2 border-amber-300 rounded-xl text-xs text-amber-950 flex items-start gap-2 shadow-xs">
                          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                          <div className="space-y-0.5">
                            <span className="font-extrabold text-amber-900">تنبيه تدقيق المعلم (العلاقات غير موثقة قطيعاً): </span>
                            <p className="leading-relaxed">{q.teacherReviewReason}</p>
                          </div>
                        </div>
                      )}

                      {/* General Fidelity Warning Alert Banner */}
                      {!q.requiresTeacherReview && q.fidelityWarning && (
                        <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                          <div>
                            <span className="font-bold">ملاحظة التدقيق: </span>
                            <span>{q.fidelityWarning}</span>
                          </div>
                        </div>
                      )}

                      {/* Pre-Reformulation Audit Trail Pill */}
                      {q.originalQuestionText && (
                        <div className="p-2 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 flex items-center gap-1.5 font-sans">
                          <span className="font-bold text-slate-500">سجل التدقيق (النص قبل التأصيل):</span>
                          <span className="line-through text-rose-700/80 font-mono text-[10px]">{q.originalQuestionText}</span>
                        </div>
                      )}

                      {/* Grounded Entities Tags */}
                      {q.groundedEntities && q.groundedEntities.length > 0 && (
                        <div className="flex items-center flex-wrap gap-1 text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-200/60">
                          <span className="font-bold text-slate-500">الكيانات والعلاقات المثبتة:</span>
                          {q.groundedEntities.map((ent, eIdx) => (
                            <span
                              key={eIdx}
                              className="px-1.5 py-0.5 bg-white border border-slate-300 rounded text-slate-800 font-mono text-[10px]"
                            >
                              {ent}
                            </span>
                          ))}
                        </div>
                      )}

                      <p className="text-sm font-bold text-slate-900 font-sans" dir="ltr">
                        {q.questionText}
                      </p>

                      {q.options && (
                        <div className="grid grid-cols-2 gap-2 pt-1 font-sans text-xs" dir="ltr">
                          {q.options.map((opt, oIdx) => (
                            <div
                              key={oIdx}
                              className={`p-2 rounded border ${
                                opt === q.modelAnswer
                                    ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                    : 'bg-slate-50 border-slate-200 text-slate-700'
                              }`}
                            >
                              <span className="font-mono mr-1.5 font-bold">
                                {String.fromCharCode(65 + oIdx)}.
                              </span>
                              {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="p-2.5 bg-emerald-50 rounded-lg border border-emerald-200 text-xs font-sans flex items-start gap-2" dir="ltr">
                        <span className="font-bold text-emerald-800 font-mono">Model Answer:</span>
                        <span className="text-emerald-900 font-semibold">{q.modelAnswer}</span>
                        {q.explanation && (
                          <span className="text-emerald-700 text-[11px] ml-auto font-sans" dir="rtl">
                            (ملاحظة: {q.explanation})
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Drawer: Saved Analyzed Documents Library */}
      {showSavedDocsDrawer && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex justify-end animate-fade-in">
          <div className="w-full max-w-md bg-white h-full shadow-2xl flex flex-col justify-between p-6 overflow-y-auto animate-slide-left">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Database className="w-5 h-5 text-amber-600" />
                  مكتبة الوثائق والمستندات المحللة
                </h3>
                <button
                  type="button"
                  onClick={() => setShowSavedDocsDrawer(false)}
                  className="p-1 rounded-lg hover:bg-slate-100 text-slate-500"
                >
                  ✕
                </button>
              </div>

              {savedDocuments.length === 0 ? (
                <div className="p-8 text-center text-slate-400 space-y-2">
                  <FileText className="w-12 h-12 mx-auto stroke-1 text-slate-300" />
                  <p className="text-xs">لا توجد وثائق محفوظة حالياً في المكتبة.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedDocuments.map((doc) => (
                    <div
                      key={doc.id}
                      onClick={() => handleLoadSavedDoc(doc)}
                      className="p-3.5 bg-slate-50 hover:bg-amber-50/40 rounded-xl border border-slate-200 cursor-pointer transition-colors space-y-2 group"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-amber-800">
                            {doc.title}
                          </h4>
                          <span className="text-[10px] text-slate-500 font-mono">
                            {doc.grade} • {doc.analysis?.detectedTopic}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handleDeleteSavedDoc(doc.id, e)}
                          className="p-1 text-slate-400 hover:text-red-600"
                          title="حذف المستند"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="flex items-center gap-2 text-[10px] text-slate-600">
                        <span className="bg-slate-200 px-1.5 py-0.5 rounded font-mono">
                          {doc.uploadedImages?.length || 0} صور
                        </span>
                        <span className="bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded font-mono">
                          {doc.analysis?.grammarConcepts?.length || 0} قواعد
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-mono">
                          {doc.analysis?.vocabulary?.length || 0} مفردات
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSavedDocsDrawer(false)}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold"
              >
                إغلاق القائمة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Fullscreen Image Preview */}
      {previewModalImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
          onClick={() => setPreviewModalImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] overflow-hidden rounded-2xl bg-slate-900 border border-slate-800">
            <button
              type="button"
              onClick={() => setPreviewModalImage(null)}
              className="absolute top-3 right-3 bg-black/60 text-white p-2 rounded-full hover:bg-black/80 z-10"
            >
              ✕
            </button>
            <img
              src={previewModalImage}
              alt="Preview"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
};
