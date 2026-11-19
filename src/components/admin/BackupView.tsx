import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import {
  HardDriveDownload,
  Download,
  RotateCcw,
  ShieldCheck,
  FileArchive,
  Clock,
  AlertTriangle,
  Upload,
} from 'lucide-react';

export const BackupView: React.FC = () => {
  const [backups, setBackups] = useState<string[]>([]);
  const [storageStatus, setStorageStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const loadBackups = async () => {
    try {
      setLoading(true);
      const [list, status] = await Promise.all([api.listBackups(), api.getStorageStatus()]);
      setBackups(list);
      setStorageStatus(status);
    } catch (e) {
      console.error('Failed to load backups:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setCreating(true);
      const res = await api.createBackup();
      if (res.success) {
        alert(`تم إنشاء نسخة احتياطية جديدة بنجاح باسم: ${res.filename}`);
        await loadBackups();
      }
    } catch (e: any) {
      alert(e.message || 'فشل إنشاء النسخة الاحتياطية');
    } finally {
      setCreating(false);
    }
  };

  const handleRestoreBackup = async (filename: string) => {
    if (
      !confirm(
        `تحذير: هل أنت متأكد من استعادة بيانات النسخة الاحتياطية (${filename})؟ ستستبدل البيانات الحالية ببيانات النسخة.`
      )
    ) {
      return;
    }
    try {
      setRestoring(true);
      const res = await api.restoreBackup(filename);
      if (res.success) {
        alert('تمت استعادة البيانات بنجاح!');
        window.location.reload();
      }
    } catch (e: any) {
      alert(e.message || 'فشل استرجاع النسخة الاحتياطية');
    } finally {
      setRestoring(false);
    }
  };

  const handleUploadRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!confirm(`استعادة قاعدة البيانات بالكامل من الملف الخارجي (${file.name})؟`)) {
      e.target.value = '';
      return;
    }
    try {
      setRestoring(true);
      const text = await file.text();
      await api.restoreBackupFromUpload(text);
      alert('تمت استعادة النسخة الاحتياطية من الملف بنجاح!');
      window.location.reload();
    } catch (err: any) {
      alert(err.message || 'فشل استعادة النسخة من الملف المرفوع');
    } finally {
      setRestoring(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
            <HardDriveDownload className="w-6 h-6 text-amber-500" />
            <span>النسخ الاحتياطي وأمان البيانات – مدرسة قفلة</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            حفظ وتنزيل واسترجاع قاعدة بيانات النظام بالكامل (الحسابات، طلبات التسجيل، المناهج، الأسئلة، الاختبارات، وسجل التدقيق)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => api.downloadCurrentSnapshot()}
            className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-colors"
          >
            <Download className="w-4 h-4 text-[#1B5E3A]" />
            <span>تنزيل لقطة JSON</span>
          </button>

          <label className="px-3.5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 rounded-xl text-xs font-extrabold flex items-center gap-1.5 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            <span>استعادة من ملف</span>
            <input type="file" accept=".json,application/json" onChange={handleUploadRestore} className="hidden" />
          </label>

          <button
            onClick={handleCreateBackup}
            disabled={creating}
            className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm transition-all disabled:opacity-50"
          >
            {creating ? (
              <div className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            <span>أخذ نسخة احتياطية</span>
          </button>
        </div>
      </div>

      {/* Honest Storage & Cloud Run Status Card */}
      <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl text-xs text-emerald-950 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <strong className="block font-bold">
            حالة التخزين الفعلية: {storageStatus?.engine || 'JSON Atomic Store'}
          </strong>
          <p className="leading-relaxed opacity-90">
            تُحفظ البيانات بكتابة ذرية (Atomic Write) في{' '}
            <code className="bg-emerald-100 px-1 py-0.5 rounded font-mono">/data/database.json</code> وتبقى ثابتة عند تحديث الصفحة وإعادة تشغيل الخادم في نفس الحاوية.
            {storageStatus && (
              <span className="block mt-1 font-mono text-[11px] tabular-nums">
                الحجم الحالي: {storageStatus.sizeKb} KB · الاختبارات: {storageStatus.counts?.exams} · الأسئلة:{' '}
                {storageStatus.counts?.questions} · المستخدمون: {storageStatus.counts?.users} · قيود التدقيق:{' '}
                {storageStatus.counts?.auditLogs}
              </span>
            )}
          </p>
        </div>
      </div>

      {storageStatus?.ephemeralContainerDiskWarning && (
        <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-xs text-amber-950 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block font-bold">
              تنبيه بيئة Cloud Run بدون قاعدة خارجية مفعّلة ({storageStatus.environment?.serviceName})
            </strong>
            <p className="leading-relaxed">
              تعمل الحاوية حالياً على قرص محلي للحاوية دون ربط قاعدة بيانات خارجية (مثل Cloud SQL / Firestore / GCS). يُوصى بتنزيل{' '}
              <strong>لقطة JSON</strong> دورياً للاحتفاظ بنسخة آمنة خارج الحاوية عند إعادة النشر أو تبديل المراجعة.
            </p>
          </div>
        </div>
      )}

      {/* Backups List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">النسخ الاحتياطية المحفوظة:</span>
          <span className="text-xs text-slate-500 tabular-nums">إجمالي النسخ: {backups.length}</span>
        </div>

        {loading ? (
          <div className="text-center py-8">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-slate-400 mt-2">جاري فحص النسخ الاحتياطية...</p>
          </div>
        ) : backups.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {backups.map((filename) => (
              <div key={filename} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
                    <FileArchive className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-xs font-bold text-slate-800 truncate">{filename}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      <span>نسخة كاملة متوافقة مع مدرسة قفلة</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => api.downloadBackupFile(filename)}
                    className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>تنزيل</span>
                  </button>
                  <button
                    onClick={() => handleRestoreBackup(filename)}
                    disabled={restoring}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                    <span>استعادة هذه النسخة</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10 text-xs text-slate-400">
            لم يتم إنشاء أي نسخ احتياطية يدوية بعد. انقر على زر أخذ نسخة احتياطية بالأعلى.
          </div>
        )}
      </div>
    </div>
  );
};
