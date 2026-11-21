import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { RegistrationRequest } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ALL_BASIC_GRADE_VALUES,
  BASIC_GRADE_CATALOG,
  getGradeLabelAr,
  sortSubjectsCanonical,
} from '../../utils/schoolCatalog.ts';
import {
  UserCheck,
  UserX,
  Clock,
  CheckCircle2,
  XCircle,
  Edit3,
  Phone,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

export const RegistrationRequestsView: React.FC = () => {
  const { subjects, refreshUsers, refreshNotifications } = useAuth();
  const [requests, setRequests] = useState<RegistrationRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING_APPROVAL');
  const [loading, setLoading] = useState(true);

  // Approval Modal State
  const [approveTarget, setApproveTarget] = useState<RegistrationRequest | null>(null);
  const [finalRole, setFinalRole] = useState<'Teacher' | 'SchoolAdmin'>('Teacher');
  const [finalSubjects, setFinalSubjects] = useState<string[]>([]);
  const [finalGrades, setFinalGrades] = useState<string[]>([]);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);

  // Reject / Edit Modal State
  const [actionTarget, setActionTarget] = useState<{
    req: RegistrationRequest;
    mode: 'reject' | 'edit';
  } | null>(null);
  const [actionNote, setActionNote] = useState('');

  const loadRequests = async () => {
    try {
      setLoading(true);
      const list = await api.getRegistrationRequests(statusFilter === 'ALL' ? undefined : statusFilter);
      setRequests(list);
    } catch (e) {
      console.error('Failed to load registration requests:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter]);

  const openApproveModal = (req: RegistrationRequest) => {
    setApproveTarget(req);
    setFinalRole(req.requestedRole);
    setFinalSubjects(
      req.requestedRole === 'SchoolAdmin'
        ? subjects.map((s) => s.id)
        : req.assignedSubjects || []
    );
    setFinalGrades(
      req.requestedRole === 'SchoolAdmin' ? ALL_BASIC_GRADE_VALUES : req.assignedGrades || []
    );
    setReviewNote('');
  };

  const handleConfirmApprove = async () => {
    if (!approveTarget) return;
    try {
      setProcessing(true);
      await api.approveRegistrationRequest(approveTarget.id, {
        role: finalRole,
        assignedSubjects: finalRole === 'SchoolAdmin' ? ['all'] : finalSubjects,
        assignedGrades: finalRole === 'SchoolAdmin' ? ['all'] : finalGrades,
        reviewNote: reviewNote.trim() || undefined,
      });
      setApproveTarget(null);
      await Promise.all([loadRequests(), refreshUsers(), refreshNotifications()]);
    } catch (e: any) {
      alert(e.message || 'فشل اعتماد الطلب');
    } finally {
      setProcessing(false);
    }
  };

  const handleConfirmAction = async () => {
    if (!actionTarget) return;
    if (!actionNote.trim()) {
      alert('يرجى كتابة سبب أو ملاحظة واضحة');
      return;
    }
    try {
      setProcessing(true);
      if (actionTarget.mode === 'reject') {
        await api.rejectRegistrationRequest(actionTarget.req.id, actionNote.trim());
      } else {
        await api.requestEditRegistration(actionTarget.req.id, actionNote.trim());
      }
      setActionTarget(null);
      setActionNote('');
      await Promise.all([loadRequests(), refreshNotifications()]);
    } catch (e: any) {
      alert(e.message || 'فشل تنفيذ الإجراء');
    } finally {
      setProcessing(false);
    }
  };

  const toggleItem = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'PENDING_APPROVAL':
        return { text: 'بانتظار الموافقة', cls: 'text-amber-700' };
      case 'NEEDS_EDIT':
        return { text: 'مطلوب استكمال/تعديل', cls: 'text-orange-700' };
      case 'APPROVED':
        return { text: 'معتمد ومفعّل', cls: 'text-[#1B5E3A]' };
      case 'REJECTED':
        return { text: 'مرفوض', cls: 'text-rose-700' };
      default:
        return { text: status, cls: 'text-slate-600' };
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-[#1B5E3A]" />
            <span>بوابة طلبات التسجيل والموافقات (مالك المنصة فقط)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            لا يُفعّل أي حساب جديد للعمل داخل النظام إلا بعد مراجعتك واعتماد الدور والمواد والصفوف المسندة إليه.
          </p>
        </div>

        <button
          onClick={loadRequests}
          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5 self-start sm:self-center"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>تحديث القائمة</span>
        </button>
      </div>

      {/* Policy Notice */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#1B5E3A] shrink-0 mt-0.5" />
        <div>
          <strong>حوكمة الاعتماد:</strong> صلاحية القبول والرفض وتعديل الصلاحيات حصرية لـ PlatformOwner (أبوحسام)، وتُمنح الحسابات الجديدة صلاحية <code className="font-mono font-bold">hasAIAccess = false</code> تلقائياً.
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2 bg-white p-2 rounded-2xl border border-slate-200 text-xs">
        {[
          { id: 'PENDING_APPROVAL', label: 'بانتظار الموافقة' },
          { id: 'NEEDS_EDIT', label: 'طلب تعديل' },
          { id: 'APPROVED', label: 'الطلبات المعتمدة' },
          { id: 'REJECTED', label: 'المرفوضة' },
          { id: 'ALL', label: 'جميع السجلات' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setStatusFilter(t.id)}
            className={`px-3.5 py-2 rounded-xl font-bold transition-colors ${
              statusFilter === t.id
                ? 'bg-[#1B5E3A] text-white'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Requests Table/List */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">جاري تحميل طلبات التسجيل...</div>
        ) : requests.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-400">
            <Clock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <span>لا توجد طلبات في هذا التصنيف حالياً.</span>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {requests.map((req) => {
              const st = statusLabel(req.status);
              const isActionable = req.status === 'PENDING_APPROVAL' || req.status === 'NEEDS_EDIT';
              return (
                <div
                  key={req.id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-sm font-extrabold text-slate-900">{req.fullName}</span>
                      <span className="text-slate-300">·</span>
                      <code className="font-mono font-bold text-slate-700" dir="ltr">
                        @{req.username}
                      </code>
                      <span className="text-slate-300">·</span>
                      <span className="font-bold text-slate-700">
                        {req.requestedRole === 'SchoolAdmin' ? 'إدارة المدرسة' : 'معلم / معلمة'}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className={`font-extrabold ${st.cls}`}>{st.text}</span>
                    </div>

                    <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                      <span>
                        المواد المطلوبة:{' '}
                        <strong>
                          {req.assignedSubjects.includes('all')
                            ? 'جميع المواد'
                            : req.assignedSubjects
                                .map((id) => subjects.find((s) => s.id === id)?.nameAr || id)
                                .join('، ')}
                        </strong>
                      </span>
                      <span>·</span>
                      <span>
                        الصفوف:{' '}
                        <strong className="font-sans">
                          {req.assignedGrades.includes('all')
                            ? 'الكل'
                            : req.assignedGrades.map((g) => getGradeLabelAr(g)).join('، ')}
                        </strong>
                      </span>
                      {req.phone && (
                        <>
                          <span>·</span>
                          <span className="inline-flex items-center gap-1 font-mono" dir="ltr">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {req.phone}
                          </span>
                        </>
                      )}
                    </div>

                    {req.notes && (
                      <div className="text-[11px] text-slate-500">ملاحظة المتقدم: {req.notes}</div>
                    )}

                    {req.reviewNote && (
                      <div className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1 inline-block">
                        ملاحظة المراجعة: {req.reviewNote}
                      </div>
                    )}

                    <div className="text-[10px] text-slate-400 font-mono tabular-nums flex flex-wrap items-center gap-2">
                      <span>التقديم: {new Date(req.createdAt).toLocaleString('ar-YE')}</span>
                      {req.ipAddress && (
                        <>
                          <span>·</span>
                          <span>IP: {req.ipAddress}</span>
                        </>
                      )}
                      {req.reviewedByName && (
                        <>
                          <span>·</span>
                          <span className="font-sans">راجعه: {req.reviewedByName}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {isActionable && (
                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => openApproveModal(req)}
                        className="px-3.5 py-2 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>مراجعة واعتماد</span>
                      </button>
                      <button
                        onClick={() => {
                          setActionTarget({ req, mode: 'edit' });
                          setActionNote('');
                        }}
                        className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-1.5"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>طلب تعديل</span>
                      </button>
                      <button
                        onClick={() => {
                          setActionTarget({ req, mode: 'reject' });
                          setActionNote('');
                        }}
                        className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 rounded-xl text-xs font-bold flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>رفض</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Approve Modal */}
      {approveTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-6 text-xs">
            <h3 className="text-base font-extrabold text-slate-900 border-b border-slate-100 pb-2">
              اعتماد وتفعيل حساب: {approveTarget.fullName}
            </h3>

            <div>
              <label className="font-bold text-slate-700 block mb-1">الدور المعتمد عند التفعيل</label>
              <select
                value={finalRole}
                onChange={(e) => setFinalRole(e.target.value as 'Teacher' | 'SchoolAdmin')}
                className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-white font-bold"
              >
                <option value="Teacher">معلم / معلمة (مساحة عمل معزولة بدون AI)</option>
                <option value="SchoolAdmin">إدارة المدرسة (إدارة تشغيلية محدودة بدون AI)</option>
              </select>
            </div>

            {finalRole === 'Teacher' && (
              <>
                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">المواد المعتمدة للمعلم:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {sortSubjectsCanonical(subjects).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => toggleItem(finalSubjects, s.id, setFinalSubjects)}
                        className={`px-2.5 py-1.5 rounded-lg border font-bold ${
                          finalSubjects.includes(s.id)
                            ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {s.nameAr}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 block mb-1.5">الصفوف المعتمدة:</label>
                  <div className="flex flex-wrap gap-1.5">
                    {BASIC_GRADE_CATALOG.map((g) => (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => toggleItem(finalGrades, g.value, setFinalGrades)}
                        className={`px-2 py-1 rounded-lg border font-bold ${
                          finalGrades.includes(g.value)
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {g.labelAr}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            <div>
              <label className="font-bold text-slate-700 block mb-1">ملاحظة إدارية عند الاعتماد (اختياري)</label>
              <input
                type="text"
                value={reviewNote}
                onChange={(e) => setReviewNote(e.target.value)}
                placeholder="مثال: تم التفعيل بناءً على تكليف إدارة المدرسة"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setApproveTarget(null)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmApprove}
                disabled={processing}
                className="px-4 py-2 font-extrabold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl disabled:opacity-50"
              >
                {processing ? 'جاري التفعيل...' : 'اعتماد وتفعيل الحساب الآن'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reject / Request Edit Modal */}
      {actionTarget && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 text-xs">
            <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
              <UserX className="w-4 h-4 text-rose-600" />
              <span>
                {actionTarget.mode === 'reject'
                  ? `رفض طلب التسجيل: ${actionTarget.req.fullName}`
                  : `طلب استكمال/تعديل بيانات: ${actionTarget.req.fullName}`}
              </span>
            </h3>

            <div>
              <label className="font-bold text-slate-700 block mb-1">
                {actionTarget.mode === 'reject' ? 'سبب الرفض *' : 'التعديلات أو البيانات المطلوبة *'}
              </label>
              <textarea
                rows={3}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="اكتب السبب بوضوح لتوثيقه في سجل المراجعة..."
                className="w-full px-3 py-2 border border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => setActionTarget(null)}
                className="px-4 py-2 font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleConfirmAction}
                disabled={processing}
                className={`px-4 py-2 font-extrabold text-white rounded-xl disabled:opacity-50 ${
                  actionTarget.mode === 'reject' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {processing ? 'جاري الحفظ...' : actionTarget.mode === 'reject' ? 'تأكيد الرفض' : 'إرسال طلب التعديل'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
