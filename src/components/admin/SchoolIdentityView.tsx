import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { SchoolIdentitySettings } from '../../types/index.ts';
import { OfficialSchoolHeader } from '../common/OfficialSchoolHeader.tsx';
import { Building2, Save, CheckCircle, Eye, RefreshCw } from 'lucide-react';

export const SchoolIdentityView: React.FC = () => {
  const { schoolIdentity, refreshSchoolIdentity } = useAuth();
  const [form, setForm] = useState<SchoolIdentitySettings | null>(schoolIdentity);
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [previewColorMode, setPreviewColorMode] = useState<'color' | 'bw'>('color');

  useEffect(() => {
    if (schoolIdentity) {
      setForm(schoolIdentity);
    }
  }, [schoolIdentity]);

  if (!form) return null;

  const handleSave = async () => {
    try {
      setSaving(true);
      const res = await api.updateSchoolIdentity(form);
      if (res.success) {
        await refreshSchoolIdentity();
        setSavedToast(true);
        setTimeout(() => setSavedToast(false), 3000);
      }
    } catch (e: any) {
      alert(e.message || 'فشل حفظ إعدادات الهوية الرسمية');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl border border-[#1B5E3A]/30 bg-white p-1 shrink-0">
            <img
              src={form.logoUrl}
              alt="شعار مدرسة قفلة"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
              <Building2 className="w-5 h-5 text-[#1B5E3A]" />
              <span>الهوية الرسمية وقوالب ترويسة الاختبارات – مدرسة قفلة</span>
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              إدارة الترويسة الموحدة لجميع اختبارات المدرسة (الشعار الأصلي محفوظ دون تعديل)
            </p>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center justify-center gap-2 shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{savedToast ? 'تم حفظ الهوية الرسمية' : 'حفظ الإعدادات المعتمدة'}</span>
        </button>
      </div>

      {/* Form Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            البيانات الرسمية للمؤسسة
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">اسم المدرسة (عربي)</label>
              <input
                type="text"
                value={form.schoolNameAr}
                onChange={(e) => setForm({ ...form, schoolNameAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">اسم المدرسة (إنجليزي)</label>
              <input
                type="text"
                value={form.schoolNameEn}
                onChange={(e) => setForm({ ...form, schoolNameEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-english font-bold"
                dir="ltr"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">الدولة (عربي)</label>
              <input
                type="text"
                value={form.countryTitleAr}
                onChange={(e) => setForm({ ...form, countryTitleAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">الدولة (إنجليزي)</label>
              <input
                type="text"
                value={form.countryTitleEn}
                onChange={(e) => setForm({ ...form, countryTitleEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-english"
                dir="ltr"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">الجهة / الوزارة (عربي)</label>
              <input
                type="text"
                value={form.ministryTitleAr}
                onChange={(e) => setForm({ ...form, ministryTitleAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">الجهة / الوزارة (إنجليزي)</label>
              <input
                type="text"
                value={form.ministryTitleEn}
                onChange={(e) => setForm({ ...form, ministryTitleEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-english"
                dir="ltr"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
          <h2 className="text-sm font-extrabold text-slate-900 border-b border-slate-100 pb-2">
            قالب الترويسة الافتراضي وإعدادات العرض
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="font-bold text-slate-700 block mb-1">العام الدراسي الافتراضي</label>
              <input
                type="text"
                value={form.defaultAcademicYear}
                onChange={(e) => setForm({ ...form, defaultAcademicYear: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">الفصل الدراسي الافتراضي</label>
              <input
                type="text"
                value={form.defaultTerm}
                onChange={(e) => setForm({ ...form, defaultTerm: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">لغة الترويسة للمواد العربية</label>
              <select
                value={form.defaultHeaderLanguage === 'en' ? 'en' : 'ar'}
                onChange={(e) =>
                  setForm({ ...form, defaultHeaderLanguage: e.target.value as 'ar' | 'en' })
                }
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
              >
                <option value="ar">عربي (RTL) للمواد العربية — واللغة الإنجليزية (LTR) تلقائياً</option>
                <option value="en">إنجليزي (LTR)</option>
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2">
              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.defaultShowTeacherName}
                  onChange={(e) => setForm({ ...form, defaultShowTeacherName: e.target.checked })}
                  className="w-4 h-4 accent-[#1B5E3A]"
                />
                <span>إظهار اسم المعلم/ـة في الترويسة</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={form.defaultHeaderCompact}
                  onChange={(e) => setForm({ ...form, defaultHeaderCompact: e.target.checked })}
                  className="w-4 h-4 accent-[#1B5E3A]"
                />
                <span>تفعيل الترويسة المضغوطة افتراضياً</span>
              </label>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs pt-2 border-t border-slate-100">
            <div>
              <label className="font-bold text-slate-700 block mb-1">تذييل الورقة (عربي)</label>
              <input
                type="text"
                value={form.footerNoteAr}
                onChange={(e) => setForm({ ...form, footerNoteAr: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>
            <div>
              <label className="font-bold text-slate-700 block mb-1">تذييل الورقة (إنجليزي)</label>
              <input
                type="text"
                value={form.footerNoteEn}
                onChange={(e) => setForm({ ...form, footerNoteEn: e.target.value })}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl font-english"
                dir="ltr"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Live Preview of OfficialSchoolHeader */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Eye className="w-4 h-4 text-[#1B5E3A]" />
            <span>معاينة حية للترويسة الرسمية على ورقة A4</span>
          </h2>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={() => setPreviewColorMode('color')}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                previewColorMode === 'color' ? 'bg-[#1B5E3A] text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              طباعة ملونة (أخضر رسمي)
            </button>
            <button
              onClick={() => setPreviewColorMode('bw')}
              className={`px-3 py-1.5 rounded-lg font-bold ${
                previewColorMode === 'bw' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              طباعة أبيض وأسود
            </button>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200">
          <OfficialSchoolHeader
            schoolIdentity={form}
            headerConfig={{
              countryTitle: form.countryTitleAr,
              ministryTitle: form.ministryTitleAr,
              schoolName: form.schoolNameAr,
              schoolNameEn: form.schoolNameEn,
              subject: 'الرياضيات',
              subjectEn: 'Mathematics',
              grade: 'الصف الثامن',
              term: form.defaultTerm,
              academicYear: form.defaultAcademicYear,
              examDate: new Date().toISOString().slice(0, 10),
              examTypeLabel: 'الاختبار الشهري الأول',
              teacherName: 'أ. فاطمة',
              showTeacherName: form.defaultShowTeacherName,
              timeLimit: '45 دقيقة',
              totalMarks: 20,
              showSchoolLogo: true,
              headerLanguage: form.defaultHeaderLanguage === 'en' ? 'en' : 'ar',
              headerCompact: form.defaultHeaderCompact,
              notes: '',
            }}
            examTitle="Monthly Mathematics Exam"
            examTitleAr="الاختبار الشهري لمادة الرياضيات"
            timeLimitMinutes={45}
            totalMarks={20}
            grade="الصف الثامن"
            term={form.defaultTerm}
            teacherName="أ. فاطمة"
            compact={form.defaultHeaderCompact}
            printColorMode={previewColorMode}
          />
        </div>
      </div>

      {savedToast && (
        <div className="fixed bottom-20 left-6 z-50 bg-[#1B5E3A] text-white px-4 py-2.5 rounded-xl shadow-xl text-xs font-bold flex items-center gap-2">
          <CheckCircle className="w-4 h-4" />
          <span>تم تحديث الهوية الرسمية لمدرسة قفلة بنجاح</span>
        </div>
      )}
    </div>
  );
};
