import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { AISettingsState, AIUsageLog } from '../../types/index.ts';
import {
  Sparkles,
  Activity,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Clock,
  Key,
  Cpu,
  History,
  Lock,
} from 'lucide-react';

export const AISettingsView: React.FC = () => {
  const [settings, setSettings] = useState<AISettingsState | null>(null);
  const [models, setModels] = useState<any[]>([]);
  const [logs, setLogs] = useState<AIUsageLog[]>([]);
  const [loading, setLoading] = useState(true);

  // Ping Test State
  const [testingPing, setTestingPing] = useState(false);
  const [pingResult, setPingResult] = useState<{
    success: boolean;
    model: string;
    latencyMs: number;
    message: string;
  } | null>(null);

  // Sandbox Question Generator
  const [sandboxGenerating, setSandboxGenerating] = useState(false);
  const [sandboxResult, setSandboxResult] = useState<any>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [s, m, l] = await Promise.all([
        api.getAISettings(),
        api.getAIModels(),
        api.getAILogs(),
      ]);
      setSettings(s);
      setModels(m);
      setLogs(l);
    } catch (e) {
      console.error('Failed to load AI settings data:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handlePingTest = async (modelToTest?: string) => {
    try {
      setTestingPing(true);
      setPingResult(null);
      const res = await api.pingAI(modelToTest || settings?.primaryModel);
      setPingResult(res);
      await loadData();
    } catch (e: any) {
      setPingResult({
        success: false,
        model: settings?.primaryModel || 'gemini-3.8-flash',
        latencyMs: 0,
        message: e.message || 'فشل الاتصال بالخدمة',
      });
    } finally {
      setTestingPing(false);
    }
  };

  const handleUpdatePrimaryModel = async (modelId: string) => {
    try {
      const res = await api.updateAISettings({ primaryModel: modelId });
      if (res.success) {
        setSettings(res.settings);
        alert(`تم اعتماد ${modelId} كنموذج رئيسي لعمليات التوليد.`);
      }
    } catch (e: any) {
      alert(e.message || 'فشل تحديث النموذج');
    }
  };

  const handleRunSandboxTest = async () => {
    try {
      setSandboxGenerating(true);
      setSandboxResult(null);
      const res = await api.generateQuestionWithAI({
        grade: 'Grade 9',
        unitTitle: 'Unit 1: Yemeni Architecture & Heritage',
        type: 'Multiple Choice',
        difficulty: 'Medium',
        marks: 2,
        lessonFocus: 'Historic Old Sanaa and Bab al-Yaman',
      });
      if (res.success) {
        setSandboxResult(res);
        await loadData();
      }
    } catch (e: any) {
      alert(e.message || 'فشل تجربة التوليد');
    } finally {
      setSandboxGenerating(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#0f2537] to-[#1e3a5f] rounded-2xl p-6 text-white border border-slate-700/80 shadow-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <Sparkles className="w-5 h-5" />
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold">
                إعدادات وتشخيص نظام الذكاء الاصطناعي (Gemini Engine)
              </h1>
            </div>
            <p className="text-xs text-slate-300">
              إدارة نماذج Gemini الرسمية، التحقق من جودة الاتصال، ومراقبة استهلاك الخطة المجانية بأمان تام.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-emerald-950/70 border border-emerald-600/60 px-3 py-1.5 rounded-xl text-xs font-semibold text-emerald-300">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>حماية الخطة المجانية مفعّلة (Zero-Cost Guard)</span>
          </div>
        </div>
      </div>

      {/* Grid: API Status & Live Connection Diagnostics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* API Key & Architecture Security Box */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Key className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-extrabold text-[#0f2537]">مفتاح وأمان Google Gemini API</h2>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-semibold">حالة المفتاح بالخادم:</span>
              <span
                className={`font-extrabold px-2.5 py-0.5 rounded-full ${
                  settings?.apiKeyConfigured
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {settings?.apiKeyConfigured ? 'محفوظ ونشط (Configured)' : 'غير محدد'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-semibold">مستوى الحماية:</span>
              <span className="font-bold text-slate-800 flex items-center gap-1">
                <Lock className="w-3.5 h-3.5 text-emerald-600" />
                <span>خادم فقط (Server-Side Proxy)</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-600 font-semibold">كشف المفتاح للمتصفح:</span>
              <span className="font-bold text-emerald-700">ممنوع ومحمى 100%</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500 leading-relaxed">
            وفق توجيهات أمان المنصة، يُحقن مفتاح API تلقائياً عبر متغيرات بيئة الخادم (
            <code className="text-amber-700 font-mono">GEMINI_API_KEY</code>) بدون طلب إدخال المفتاح
            يدوياً في واجهات المستخدم.
          </p>
        </div>

        {/* Real Ping Connection Test */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-600" />
                <h2 className="text-base font-extrabold text-[#0f2537]">فحص الاتصال الحقيقي (Live Ping)</h2>
              </div>
              <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded text-slate-600">
                {settings?.primaryModel || 'gemini-3.8-flash'}
              </span>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              إجراء اختبار استجابة فعلي مباشر مع خوادم Google Gemini لقياس زمن الوصول والتحقق من صلاحية
              الموديل قبل بدء إنشاء الاختبارات.
            </p>

            {pingResult && (
              <div
                className={`p-3 rounded-xl border text-xs space-y-1 animate-in fade-in ${
                  pingResult.success
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {pingResult.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                  )}
                  <span>{pingResult.success ? 'نجح فحص الاتصال!' : 'فشل فحص الاتصال'}</span>
                  {pingResult.success && (
                    <span className="font-mono text-[10px] bg-emerald-200/60 px-1.5 py-0.5 rounded">
                      زمن الاستجابة: {pingResult.latencyMs}ms
                    </span>
                  )}
                </div>
                <div className="text-[11px] opacity-90">{pingResult.message}</div>
              </div>
            )}
          </div>

          <button
            onClick={() => handlePingTest()}
            disabled={testingPing}
            className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
          >
            {testingPing ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>جاري إرسال حزمة الفحص واختبار النموذج...</span>
              </>
            ) : (
              <>
                <Activity className="w-4 h-4 text-emerald-400" />
                <span>بدء فحص الاتصال الآن</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Models Configuration & Preference */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-extrabold text-[#0f2537]">نماذج الذكاء الاصطناعي المتاحة والمعتمدة</h2>
          </div>
          <span className="text-xs text-emerald-700 font-bold bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200">
            فقط النماذج المؤهلة للخطة المجانية (Free Tier Guaranteed)
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {models.map((m) => {
            const isPrimary = settings?.primaryModel === m.id;
            return (
              <div
                key={m.id}
                className={`p-4 rounded-xl border transition-all space-y-3 ${
                  isPrimary
                    ? 'bg-amber-50/70 border-amber-400 shadow-xs'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-extrabold text-sm text-[#0f2537]">{m.name}</h3>
                    <div className="font-mono text-[11px] text-slate-500 mt-0.5">{m.id}</div>
                  </div>
                  {isPrimary ? (
                    <span className="text-[10px] font-bold bg-amber-500 text-slate-950 px-2 py-0.5 rounded-full">
                      النموذج النشط حالياً
                    </span>
                  ) : (
                    <button
                      onClick={() => handleUpdatePrimaryModel(m.id)}
                      className="text-xs text-amber-700 font-bold hover:underline"
                    >
                      تعيين كنموذج أساسي
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-600 leading-relaxed">{m.description}</p>

                <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs text-slate-500">
                  <span>الخطة: مجانية بالكامل</span>
                  <button
                    onClick={() => handlePingTest(m.id)}
                    className="text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1"
                  >
                    <span>اختبار الاستجابة</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sandbox Test Generation */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Play className="w-5 h-5 text-amber-500" />
            <h2 className="text-base font-extrabold text-[#0f2537]">بيئة اختبار وتجربة التوليد (Sandbox Test)</h2>
          </div>
          <button
            onClick={handleRunSandboxTest}
            disabled={sandboxGenerating}
            className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-2 transition-all disabled:opacity-50"
          >
            {sandboxGenerating ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Sparkles className="w-3.5 h-3.5" />
            )}
            <span>توليد سؤال اختباري تجريبي</span>
          </button>
        </div>

        {sandboxResult && (
          <div className="p-4 rounded-xl bg-slate-50 border border-emerald-300 space-y-2 animate-in fade-in">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span className="font-bold text-emerald-800">نتيجة الاختبار التجريبي:</span>
              <span className="font-mono text-[10px] bg-slate-200 px-1.5 py-0.5 rounded">
                الموديل: {sandboxResult.modelUsed}
              </span>
            </div>
            <div className="font-english font-bold text-slate-900 text-xs">
              {sandboxResult.question.questionText}
            </div>
            {sandboxResult.question.options && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-english text-xs">
                {sandboxResult.question.options.map((opt: string, i: number) => (
                  <span key={i} className="p-1.5 bg-white border rounded text-[11px]">
                    ({String.fromCharCode(65 + i)}) {opt}
                  </span>
                ))}
              </div>
            )}
            <div className="p-2 bg-emerald-100/70 rounded text-xs font-english text-emerald-950 font-bold">
              Correct Answer: {sandboxResult.question.modelAnswer}
            </div>
          </div>
        )}
      </div>

      {/* AI Usage Logs History */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-slate-600" />
            <h2 className="text-base font-extrabold text-[#0f2537]">سجل عمليات الذكاء الاصطناعي (AI Audit Logs)</h2>
          </div>
          <span className="text-xs text-slate-500">
            إجمالي العمليات المسجلة: <strong>{logs.length}</strong>
          </span>
        </div>

        {logs.length > 0 ? (
          <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
            {logs.map((log) => (
              <div key={log.id} className="py-2.5 flex items-center justify-between text-xs">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        log.status === 'SUCCESS' ? 'bg-emerald-500' : 'bg-rose-500'
                      }`}
                    />
                    <strong className="text-slate-800">{log.operation}</strong>
                    <span className="font-mono text-[10px] bg-slate-100 px-1.5 py-0.2 rounded text-slate-600">
                      {log.model}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-400">{log.promptSnippet}</div>
                </div>

                <div className="text-right">
                  <div className="font-mono text-[11px] font-bold text-slate-700">
                    {log.durationMs}ms
                  </div>
                  <div className="text-[10px] text-slate-400">
                    {new Date(log.timestamp).toLocaleTimeString('ar-YE')}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400 text-center py-6">لا توجد سجلات بعد.</p>
        )}
      </div>
    </div>
  );
};
