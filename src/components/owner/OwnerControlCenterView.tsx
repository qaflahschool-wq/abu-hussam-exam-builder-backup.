import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../../services/api.ts';
import { AuditLogEntry, User } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ShieldCheck,
  AlertTriangle,
  Download,
  RefreshCw,
  Search,
  Lock,
  Unlock,
  CheckCircle2,
  UserCheck,
  FileText,
  Activity,
} from 'lucide-react';

interface OwnerControlCenterViewProps {
  onNavigate?: (view: string) => void;
}

export const OwnerControlCenterView: React.FC<OwnerControlCenterViewProps> = ({ onNavigate }) => {
  const { subjects, refreshUsers, refreshNotifications } = useAuth();
  const [data, setData] = useState<any>(null);
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [integrity, setIntegrity] = useState<{
    valid: boolean;
    chainedCount: number;
    legacyCount: number;
    brokenEntryIds?: string[];
  }>({
    valid: true,
    chainedCount: 0,
    legacyCount: 0,
  });
  const [loading, setLoading] = useState(true);

  // Audit Filters
  const [catFilter, setCatFilter] = useState('');
  const [sevFilter, setSevFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const loadAll = useCallback(async () => {
    try {
      setLoading(true);
      const [cc, auditRes] = await Promise.all([
        api.getOwnerControlCenter(),
        api.getOwnerAuditLogs({
          category: catFilter || undefined,
          severity: sevFilter || undefined,
          search: searchQuery || undefined,
          limit: 200,
        }),
      ]);
      setData(cc);
      setLogs(auditRes.logs || []);
      setIntegrity(auditRes.integrity || { valid: true, chainedCount: 0, legacyCount: 0 });
    } catch (e) {
      console.error('Failed to load Owner Control Center:', e);
    } finally {
      setLoading(false);
    }
  }, [catFilter, sevFilter, searchQuery]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleToggleSuspend = async (u: User) => {
    const isSuspended = u.status === 'SUSPENDED';
    if (isSuspended) {
      if (!confirm(`إعادة تفعيل حساب ${u.name} (@${u.username})؟`)) return;
      await api.reactivateUser(u.id);
    } else {
      const reason = prompt(`سبب إيقاف/تعليق الحساب (${u.name}):`, 'تعليق إداري مؤقت من مالك المنصة');
      if (reason === null) return;
      await api.suspendUser(u.id, reason || 'تعليق إداري مؤقت');
    }
    await Promise.all([loadAll(), refreshUsers(), refreshNotifications()]);
  };

  const summary = data?.summary || {};
  const usersOverview: (User & { examsCount?: number })[] = data?.usersOverview || [];
  const securityAlerts: AuditLogEntry[] = data?.recentSecurityAlerts || [];
  const recentExams: any[] = data?.recentExamsActivity || [];

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Header Bar */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-lg sm:text-xl font-extrabold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-6 h-6 text-[#1B5E3A]" />
            <span>مركز التحكم والمراقبة الأمنية (PlatformOwner Only)</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            غرفة القيادة المركزية لمتابعة طلبات الانضمام، نشاط الحسابات، محاولات الاختراق، وسجل التدقيق المحصن بالتجزئة.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {onNavigate && summary.pendingRegistrations > 0 && (
            <button
              onClick={() => onNavigate('registration-requests')}
              className="px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-xl text-xs font-extrabold flex items-center gap-1.5 tabular-nums"
            >
              <UserCheck className="w-4 h-4" />
              <span>مراجعة الطلبات ({summary.pendingRegistrations})</span>
            </button>
          )}
          <button
            onClick={loadAll}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>تحديث مباشر</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">طلبات التسجيل المعلقة</div>
          <div className="text-2xl font-extrabold text-amber-700 tabular-nums">{summary.pendingRegistrations ?? 0}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">تنبيهات غير مقروءة</div>
          <div className="text-2xl font-extrabold text-[#1B5E3A] tabular-nums">{summary.unreadNotifications ?? 0}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">الحسابات النشطة</div>
          <div className="text-2xl font-extrabold text-slate-900 tabular-nums">
            {summary.activeUsers ?? 0}
            <span className="text-xs font-semibold text-slate-400 mr-1">/ {summary.totalUsers ?? 0}</span>
          </div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">حسابات موقوفة</div>
          <div className="text-2xl font-extrabold text-rose-700 tabular-nums">{summary.suspendedUsers ?? 0}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">التنبيهات الأمنية</div>
          <div className="text-2xl font-extrabold text-rose-700 tabular-nums">{summary.securityAlertsCount ?? 0}</div>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-1">
          <div className="text-[11px] font-bold text-slate-500">سلامة سجل التدقيق</div>
          <div
            className={`text-xs font-extrabold flex items-center gap-1 pt-1 ${
              integrity.valid ? 'text-[#1B5E3A]' : 'text-rose-700'
            }`}
          >
            {integrity.valid ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
            <span>{integrity.valid ? 'SHA-256 موثّق' : 'خلل في السلسلة'}</span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 tabular-nums">
            {integrity.chainedCount} موثّق ({integrity.legacyCount} سابق)
          </div>
        </div>
      </div>

      {/* Security Alerts Panel + Recent Exams Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Intrusion & Security Monitor */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>سجل محاولات الاختراق والوصول المرفوض</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">{securityAlerts.length}</span>
          </div>

          {securityAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">لم تُرصد محاولات اختراق أو وصول مرفوضة حتى الآن.</div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
              {securityAlerts.map((ev) => (
                <div key={ev.id} className="p-3.5 text-xs space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-rose-800">{ev.action}</span>
                    <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                      {ev.severity} · {new Date(ev.timestamp).toLocaleString('ar-YE')}
                    </span>
                  </div>
                  <p className="text-slate-700">{ev.details}</p>
                  <div className="text-[10px] font-mono text-slate-400 flex flex-wrap gap-2">
                    <span>الفاعل: {ev.actorName || ev.userId}</span>
                    {ev.ipAddress && <span>IP: {ev.ipAddress}</span>}
                    {ev.result && <span>النتيجة: {ev.result}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Exams Activity */}
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
              <FileText className="w-4 h-4 text-[#1B5E3A]" />
              <span>آخر الاختبارات المنشأة في المدرسة</span>
            </h2>
            <span className="text-[11px] font-mono text-slate-500 tabular-nums">{summary.totalExams ?? 0}</span>
          </div>

          {recentExams.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-400">لا توجد اختبارات منشأة بعد.</div>
          ) : (
            <div className="overflow-x-auto max-h-80 overflow-y-auto">
              <table className="w-full text-xs text-right">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-100">
                  <tr>
                    <th className="py-2.5 px-3 font-bold">الاختبار</th>
                    <th className="py-2.5 px-3 font-bold">المعلم</th>
                    <th className="py-2.5 px-3 font-bold">المادة / الصف</th>
                    <th className="py-2.5 px-3 font-bold">التحديث</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recentExams.map((e) => (
                    <tr key={e.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">
                        <div>{e.title}</div>
                        <div className="text-[10px] font-mono text-slate-400">{e.code}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{e.createdByName}</td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {subjects.find((s) => s.id === e.subjectId)?.nameAr || e.subjectId} · {e.grade}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 tabular-nums">
                        {(() => {
                          if (!e.updatedAt) return '—';
                          const d = new Date(e.updatedAt);
                          return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('ar-YE');
                        })()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Users Lifecycle & Activity Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[#1B5E3A]" />
            <span>حالة الحسابات ونشاط المستخدمين</span>
          </h2>
          <span className="text-xs text-slate-500 tabular-nums">المستخدمون: {usersOverview.length}</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs text-right">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-bold">المستخدم</th>
                <th className="py-2.5 px-3 font-bold">الدور</th>
                <th className="py-2.5 px-3 font-bold">الحالة</th>
                <th className="py-2.5 px-3 font-bold">الاختبارات</th>
                <th className="py-2.5 px-3 font-bold">آخر دخول / نشاط</th>
                <th className="py-2.5 px-3 font-bold">إجراء المالك</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {usersOverview.map((u) => {
                const isOwnerRow = u.role === 'PlatformOwner' || u.role === 'Administrator';
                const status = u.status || 'ACTIVE';
                return (
                  <tr key={u.id}>
                    <td className="py-2.5 px-3">
                      <div className="font-bold text-slate-900">{u.name}</div>
                      <div className="font-mono text-[10px] text-slate-500" dir="ltr">
                        @{u.username}
                      </div>
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-700">
                      {isOwnerRow ? 'PlatformOwner' : u.role}
                    </td>
                    <td className="py-2.5 px-3">
                      <span
                        className={`font-bold ${
                          status === 'ACTIVE'
                            ? 'text-[#1B5E3A]'
                            : status === 'SUSPENDED'
                            ? 'text-rose-700'
                            : 'text-amber-700'
                        }`}
                      >
                        {status === 'ACTIVE' ? 'نشط' : status === 'SUSPENDED' ? 'موقوف' : status}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold tabular-nums">{u.examsCount ?? 0}</td>
                    <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500 tabular-nums">
                      {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString('ar-YE') : 'لم يدخل بعد'}
                    </td>
                    <td className="py-2.5 px-3">
                      {!isOwnerRow && (
                        <button
                          onClick={() => handleToggleSuspend(u)}
                          className={`px-2.5 py-1 rounded-lg font-bold inline-flex items-center gap-1 ${
                            status === 'SUSPENDED'
                              ? 'bg-emerald-50 text-[#1B5E3A] border border-emerald-200 hover:bg-emerald-100'
                              : 'bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100'
                          }`}
                        >
                          {status === 'SUSPENDED' ? (
                            <>
                              <Unlock className="w-3 h-3" />
                              <span>إعادة تفعيل</span>
                            </>
                          ) : (
                            <>
                              <Lock className="w-3 h-3" />
                              <span>إيقاف مؤقت</span>
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Central Tamper-Evident Audit Log */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-extrabold text-slate-900">سجل التدقيق المركزي (Central Audit Log)</h2>
            <p className="text-[11px] text-slate-500">
              مربوط بسلسلة SHA-256 لكشف أي تلاعب مع إخفاء تلقائي لجميع كلمات المرور والمفاتيح.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => api.downloadOwnerAuditLogs('csv')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير CSV</span>
            </button>
            <button
              onClick={() => api.downloadOwnerAuditLogs('json')}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تصدير JSON</span>
            </button>
          </div>
        </div>

        {/* Audit Filters */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالحدث أو المستخدم أو IP..."
              className="w-full pr-8 pl-3 py-1.5 bg-white border border-slate-200 rounded-lg"
            />
          </div>
          <select
            value={catFilter}
            onChange={(e) => setCatFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold"
          >
            <option value="">جميع الفئات</option>
            <option value="AUTH">المصادقة والدخول (AUTH)</option>
            <option value="REGISTRATION">التسجيل والموافقات (REGISTRATION)</option>
            <option value="SECURITY">الحماية والاختراق (SECURITY)</option>
            <option value="EXAM">الاختبارات (EXAM)</option>
            <option value="QUESTION">الأسئلة (QUESTION)</option>
            <option value="ADMIN">الإدارة (ADMIN)</option>
            <option value="AI">الذكاء الاصطناعي (AI)</option>
            <option value="BACKUP">النسخ الاحتياطي (BACKUP)</option>
          </select>
          <select
            value={sevFilter}
            onChange={(e) => setSevFilter(e.target.value)}
            className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-semibold"
          >
            <option value="">جميع درجات الخطورة</option>
            <option value="INFO">INFO</option>
            <option value="WARNING">WARNING</option>
            <option value="HIGH">HIGH</option>
            <option value="CRITICAL">CRITICAL</option>
          </select>
        </div>

        {loading ? (
          <div className="py-10 text-center text-xs text-slate-400">جاري تحميل السجلات...</div>
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-xs text-right">
              <thead className="bg-slate-50 text-slate-600 border-b border-slate-200 sticky top-0">
                <tr>
                  <th className="py-2 px-3 font-bold">الوقت</th>
                  <th className="py-2 px-3 font-bold">الفاعل</th>
                  <th className="py-2 px-3 font-bold">الفئة / الخطورة</th>
                  <th className="py-2 px-3 font-bold">الحدث</th>
                  <th className="py-2 px-3 font-bold">التفاصيل</th>
                  <th className="py-2 px-3 font-bold">IP</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={l.id}>
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(l.timestamp).toLocaleString('ar-YE')}
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-800">{l.actorName || l.userId}</div>
                      <div className="text-[10px] text-slate-400">{l.actorRole || '-'}</div>
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] whitespace-nowrap">
                      <span
                        className={`font-bold ${
                          l.severity === 'CRITICAL' || l.severity === 'HIGH'
                            ? 'text-rose-700'
                            : l.severity === 'WARNING'
                            ? 'text-amber-700'
                            : 'text-slate-600'
                        }`}
                      >
                        {l.category || 'ADMIN'} · {l.severity || 'INFO'}
                      </span>
                    </td>
                    <td className="py-2 px-3 font-mono text-[11px] font-bold text-slate-800 whitespace-nowrap">
                      {l.action}
                    </td>
                    <td className="py-2 px-3 text-slate-700 max-w-md">{l.details}</td>
                    <td className="py-2 px-3 font-mono text-[10px] text-slate-400 whitespace-nowrap tabular-nums">
                      {l.ipAddress || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
