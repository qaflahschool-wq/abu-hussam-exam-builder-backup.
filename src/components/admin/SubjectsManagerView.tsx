import React, { useState } from 'react';
import { api } from '../../services/api.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import { Subject } from '../../types/index.ts';
import { sortSubjectsCanonical } from '../../utils/schoolCatalog.ts';
import { BookOpen, Plus, Edit, Trash2, CheckCircle, Power } from 'lucide-react';

export const SubjectsManagerView: React.FC = () => {
  const { subjects, refreshSubjects, isAdmin } = useAuth();
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Partial<Subject> | null>(null);

  const handleSave = async () => {
    if (!editing?.nameAr || !editing?.nameEn) {
      alert('يرجى إدخال اسم المادة بالعربية والإنجليزية');
      return;
    }
    try {
      if (editing.id) {
        await api.updateSubject(editing.id, editing);
      } else {
        await api.createSubject(editing);
      }
      setShowModal(false);
      setEditing(null);
      await refreshSubjects();
    } catch (e: any) {
      alert(e.message || 'تعذر حفظ المادة الدراسية');
    }
  };

  const handleToggleActive = async (sub: Subject) => {
    try {
      await api.updateSubject(sub.id, { isActive: !sub.isActive });
      await refreshSubjects();
    } catch (e: any) {
      alert(e.message || 'تعذر تحديث حالة المادة');
    }
  };

  const handleDelete = async (sub: Subject) => {
    if (!confirm(`هل تريد حذف مادة "${sub.nameAr}" من قائمة المواد؟`)) return;
    try {
      await api.deleteSubject(sub.id);
      await refreshSubjects();
    } catch (e: any) {
      alert(e.message || 'تعذر حذف المادة');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-[#1B5E3A]" />
            <span>إدارة المواد الدراسية – مدرسة قفلة للتعليم الأساسي</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            إضافة وتعديل وتفعيل/تعطيل جميع المواد الدراسية المدعومة في استوديو الاختبارات
          </p>
        </div>

        {isAdmin && (
          <button
            onClick={() => {
              setEditing({
                code: '',
                nameAr: '',
                nameEn: '',
                defaultDirection: 'rtl',
                isActive: true,
                description: '',
              });
              setShowModal(true);
            }}
            className="px-4 py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center gap-2 shadow-sm"
          >
            <Plus className="w-4 h-4" />
            <span>إضافة مادة دراسية جديدة</span>
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sortSubjectsCanonical(subjects).map((sub) => (
          <div
            key={sub.id}
            className={`bg-white rounded-2xl p-5 border shadow-sm flex flex-col justify-between space-y-4 ${
              sub.isActive ? 'border-slate-200' : 'border-slate-200 opacity-65 bg-slate-50'
            }`}
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs font-bold text-[#1B5E3A]">
                  {sub.sortOrder ? `#${sub.sortOrder} · ` : ''}
                  {sub.code}
                </span>
                <span
                  className={`text-[11px] font-bold flex items-center gap-1 ${
                    sub.isActive ? 'text-emerald-700' : 'text-slate-500'
                  }`}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{sub.isActive ? 'مفعّلة' : 'معطّلة'}</span>
                </span>
              </div>

              <div>
                <h3 className="text-base font-extrabold text-slate-900">{sub.nameAr}</h3>
                <p className="text-xs font-english font-semibold text-slate-500" dir="ltr">
                  {sub.nameEn}
                </p>
              </div>

              {sub.description && <p className="text-xs text-slate-600 leading-relaxed">{sub.description}</p>}

              <div className="text-[11px] text-slate-500 pt-1">
                الاتجاه الافتراضي:{' '}
                <strong className="text-slate-800">
                  {sub.defaultDirection === 'ltr' ? 'من اليسار لليمين (LTR)' : 'من اليمين لليسار (RTL)'}
                </strong>
              </div>
            </div>

            {isAdmin && (
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <button
                  onClick={() => handleToggleActive(sub)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                    sub.isActive
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                      : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800'
                  }`}
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>{sub.isActive ? 'تعطيل' : 'تفعيل'}</span>
                </button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => {
                      setEditing(sub);
                      setShowModal(true);
                    }}
                    className="p-1.5 text-slate-500 hover:text-[#1B5E3A] rounded-lg hover:bg-slate-100"
                    title="تعديل المادة"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  {!sub.isCore && (
                    <button
                      onClick={() => handleDelete(sub)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50"
                      title="حذف المادة"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {showModal && editing && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-extrabold text-slate-900">
              {editing.id ? 'تعديل بيانات المادة الدراسية' : 'إضافة مادة دراسية جديدة'}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم المادة (عربي)</label>
                <input
                  type="text"
                  value={editing.nameAr || ''}
                  onChange={(e) => setEditing({ ...editing, nameAr: e.target.value })}
                  placeholder="مثال: الكيمياء"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">اسم المادة (إنجليزي)</label>
                <input
                  type="text"
                  value={editing.nameEn || ''}
                  onChange={(e) => setEditing({ ...editing, nameEn: e.target.value })}
                  placeholder="e.g. Chemistry"
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl font-english"
                  dir="ltr"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الرمز المختصر</label>
                  <input
                    type="text"
                    value={editing.code || ''}
                    onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })}
                    placeholder="CHM"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-mono"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اتجاه الورقة الافتراضي</label>
                  <select
                    value={editing.defaultDirection || 'rtl'}
                    onChange={(e) => setEditing({ ...editing, defaultDirection: e.target.value as 'rtl' | 'ltr' })}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white"
                  >
                    <option value="rtl">عربي / يمين لليسار (RTL)</option>
                    <option value="ltr">إنجليزي / يسار لليمين (LTR)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1">الوصف والمحتوى (اختياري)</label>
                <input
                  type="text"
                  value={editing.description || ''}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSave}
                className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl"
              >
                حفظ المادة
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
