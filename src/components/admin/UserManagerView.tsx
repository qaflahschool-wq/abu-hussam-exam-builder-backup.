import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { User, UserRole } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  ALL_BASIC_GRADE_VALUES,
  BASIC_GRADE_CATALOG,
  CORE_SIX_SUBJECT_IDS,
  sortSubjectsCanonical,
} from '../../utils/schoolCatalog.ts';
import {
  Users,
  UserPlus,
  KeyRound,
  Edit,
  ShieldCheck,
  Sparkles,
  BookOpen,
  Lock,
  Unlock,
} from 'lucide-react';

export const UserManagerView: React.FC = () => {
  const { user: currentUser, isPlatformOwner, subjects, availableUsers, refreshUsers } = useAuth();
  const [users, setUsers] = useState<User[]>(availableUsers);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [targetUser, setTargetUser] = useState<User | null>(null);

  // New User Form
  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<UserRole>('Teacher');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [assignedSubjects, setAssignedSubjects] = useState<string[]>(CORE_SIX_SUBJECT_IDS);
  const [assignedGrades, setAssignedGrades] = useState<string[]>(ALL_BASIC_GRADE_VALUES);

  // Password reset form
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    setUsers(availableUsers);
  }, [availableUsers]);

  const toggleSubjectSelection = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const handleCreateUser = async () => {
    if (!username || !password || !name) {
      alert('يرجى ملء جميع الحقول المطلوبة');
      return;
    }
    try {
      const res = await api.createUser({
        username,
        name,
        role,
        email,
        password,
        assignedSubjects: role === 'Teacher' ? assignedSubjects : ['all'],
        assignedGrades: role === 'Teacher' ? assignedGrades : ['all'],
        hasAIAccess: false,
      });
      if (res.success) {
        setShowAddModal(false);
        setUsername('');
        setName('');
        setPassword('');
        setEmail('');
        await refreshUsers();
      }
    } catch (e: any) {
      alert(e.message || 'فشل إنشاء المستخدم');
    }
  };

  const handleUpdateUserPermissions = async () => {
    if (!targetUser) return;
    try {
      const res = await api.updateUser(targetUser.id, {
        name: targetUser.name,
        role: targetUser.role,
        assignedSubjects: targetUser.assignedSubjects,
        assignedGrades: targetUser.assignedGrades,
      });
      if (res.success) {
        setShowEditModal(false);
        setTargetUser(null);
        await refreshUsers();
      }
    } catch (e: any) {
      alert(e.message || 'فشل تحديث صلاحيات الحساب');
    }
  };

  const handleResetPassword = async () => {
    if (!targetUser || !newPassword || newPassword.length < 4) {
      alert('كلمة المرور يجب ألا تقل عن 4 أحرف');
      return;
    }
    try {
      const res = await api.resetPassword(targetUser.id, newPassword);
      if (res.success) {
        setShowPasswordModal(false);
        setNewPassword('');
        setTargetUser(null);
      }
    } catch (e: any) {
      alert(e.message || 'فشل تغيير كلمة المرور');
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
            <Users className="w-6 h-6 text-[#1B5E3A]" />
            <span>إدارة المعلمين والحسابات وتوزيع المواد – مدرسة قفلة</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            تحكم مركزي في حسابات المعلمين وتوزيع المواد والصفوف · الذكاء الاصطناعي حصري لصاحب النظام أبوحسام
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl text-xs font-extrabold flex items-center gap-2 transition-colors shadow-sm"
        >
          <UserPlus className="w-4 h-4" />
          <span>إضافة معلم / حساب جديد</span>
        </button>
      </div>

      {/* RBAC Policy Note */}
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 text-xs text-emerald-950 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 text-[#1B5E3A] shrink-0 mt-0.5" />
        <div>
          <strong>سياسة العزل والصلاحيات:</strong> يمتلك كل معلم مساحة عمل خاصة ومعزولة لا يطلع فيها على اختبارات زملائه، ويستخدم أدوات التحرير والتنسيق اليدوي فقط دون وصول لنماذج الذكاء الاصطناعي.
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-700">قائمة الحسابات المعتمدة بالمدرسة</span>
          <span className="text-xs text-slate-500 tabular-nums">إجمالي الحسابات: {users.length}</span>
        </div>

        <div className="divide-y divide-slate-100">
          {users.map((u) => {
            const isOwnerRow = u.role === 'PlatformOwner' || u.role === 'Administrator';
            return (
              <div key={u.id} className="p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-extrabold text-slate-900 text-sm">{u.name}</span>
                    <span className="text-xs text-slate-500">·</span>
                    <span className="text-xs font-semibold text-[#1B5E3A]">
                      {isOwnerRow ? 'صاحب النظام (Platform Owner)' : u.role === 'SchoolAdmin' ? 'إدارة المدرسة' : 'معلم / معلمة'}
                    </span>
                    {u.hasAIAccess && (
                      <>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs font-bold text-amber-700 inline-flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          صلاحية AI
                        </span>
                      </>
                    )}
                    {u.status === 'SUSPENDED' && (
                      <>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs font-bold text-rose-700">موقوف مؤقتاً</span>
                      </>
                    )}
                    {currentUser?.id === u.id && (
                      <>
                        <span className="text-xs text-slate-300">·</span>
                        <span className="text-xs font-bold text-emerald-700">الجلسة النشطة</span>
                      </>
                    )}
                  </div>

                  <div className="text-xs text-slate-500 flex flex-wrap items-center gap-3">
                    <span>
                      اسم الدخول: <code className="font-mono font-bold text-slate-700">{u.username}</code>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <BookOpen className="w-3 h-3 text-slate-400" />
                      <span>
                        المواد:{' '}
                        {u.assignedSubjects?.includes('all')
                          ? 'جميع المواد'
                          : (u.assignedSubjects || [])
                              .map((sid) => subjects.find((s) => s.id === sid)?.nameAr || sid)
                              .join('، ') || 'غير محدد'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {(!isOwnerRow || isPlatformOwner) && (
                    <button
                      onClick={() => {
                        setTargetUser({
                          ...u,
                          assignedSubjects: u.assignedSubjects || sortSubjectsCanonical(subjects).map((s) => s.id),
                          assignedGrades: u.assignedGrades || [...ALL_BASIC_GRADE_VALUES],
                        });
                        setShowEditModal(true);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5 text-[#1B5E3A]" />
                      <span>توزيع المواد</span>
                    </button>
                  )}

                  {(!isOwnerRow || isPlatformOwner) && (
                    <button
                      onClick={() => {
                        setTargetUser(u);
                        setShowPasswordModal(true);
                      }}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
                    >
                      <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                      <span>كلمة المرور</span>
                    </button>
                  )}

                  {isPlatformOwner && !isOwnerRow && (
                    <button
                      onClick={async () => {
                        if (u.status === 'SUSPENDED') {
                          await api.reactivateUser(u.id);
                        } else {
                          const reason = prompt(`سبب إيقاف حساب ${u.name}:`, 'تعليق إداري مؤقت');
                          if (reason === null) return;
                          await api.suspendUser(u.id, reason || 'تعليق إداري مؤقت');
                        }
                        await refreshUsers();
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors ${
                        u.status === 'SUSPENDED'
                          ? 'bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A]'
                          : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                      }`}
                    >
                      {u.status === 'SUSPENDED' ? (
                        <>
                          <Unlock className="w-3.5 h-3.5" />
                          <span>تفعيل</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3.5 h-3.5" />
                          <span>إيقاف</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Add User Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-extrabold text-[#0f2537]">إضافة حساب جديد لمدرسة قفلة</h3>
            <div className="space-y-3 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">اسم الدخول (Username)</label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="e.g. teacher.ali"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    dir="ltr"
                  />
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الاسم الكامل</label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="أ. علي قائد"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="font-bold text-slate-700 block mb-1">الدور الوظيفي</label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as UserRole)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl font-semibold bg-white"
                  >
                    <option value="Teacher">معلم / معلمة (إنشاء وتنسيق يدوي بدون AI)</option>
                    <option value="SchoolAdmin">إدارة المدرسة (إدارة المعلمين والمواد بدون AI)</option>
                  </select>
                </div>
                <div>
                  <label className="font-bold text-slate-700 block mb-1">كلمة المرور</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                    dir="ltr"
                  />
                </div>
              </div>

              {role === 'Teacher' && (
                <>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1.5">المواد المسندة للمعلم:</label>
                    <div className="flex flex-wrap gap-2">
                      {sortSubjectsCanonical(subjects).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => toggleSubjectSelection(assignedSubjects, s.id, setAssignedSubjects)}
                          className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                            assignedSubjects.includes(s.id)
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
                    <label className="font-bold text-slate-700 block mb-1.5">الصفوف المسندة:</label>
                    <div className="flex flex-wrap gap-1.5">
                      {BASIC_GRADE_CATALOG.map((g) => (
                        <button
                          key={g.value}
                          type="button"
                          onClick={() => toggleSubjectSelection(assignedGrades, g.value, setAssignedGrades)}
                          className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                            assignedGrades.includes(g.value)
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
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleCreateUser}
                className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl"
              >
                إنشاء الحساب
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Subject/Grade Assignment Modal */}
      {showEditModal && targetUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 my-8">
            <h3 className="text-base font-extrabold text-[#0f2537]">
              توزيع المواد والصفوف لـ {targetUser.name}
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-slate-700 block mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  value={targetUser.name}
                  onChange={(e) => setTargetUser({ ...targetUser, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">المواد المسموحة:</label>
                <div className="flex flex-wrap gap-2">
                  {sortSubjectsCanonical(subjects).map((s) => {
                    const list = targetUser.assignedSubjects || [];
                    const selected = list.includes('all') || list.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          const base = list.includes('all') ? subjects.map((x) => x.id) : list;
                          const next = base.includes(s.id) ? base.filter((x) => x !== s.id) : [...base, s.id];
                          setTargetUser({ ...targetUser, assignedSubjects: next });
                        }}
                        className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-colors ${
                          selected
                            ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {s.nameAr}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="font-bold text-slate-700 block mb-1.5">الصفوف المسموحة:</label>
                <div className="flex flex-wrap gap-1.5">
                  {BASIC_GRADE_CATALOG.map((g) => {
                    const list = targetUser.assignedGrades || [];
                    const selected = list.includes('all') || list.includes(g.value);
                    return (
                      <button
                        key={g.value}
                        type="button"
                        onClick={() => {
                          const base = list.includes('all') ? ALL_BASIC_GRADE_VALUES : list;
                          const next = base.includes(g.value) ? base.filter((x) => x !== g.value) : [...base, g.value];
                          setTargetUser({ ...targetUser, assignedGrades: next });
                        }}
                        className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                          selected
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-slate-50 text-slate-700 border-slate-200'
                        }`}
                      >
                        {g.labelAr}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowEditModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleUpdateUserPermissions}
                className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl"
              >
                حفظ الصلاحيات
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {showPasswordModal && targetUser && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#0f2537]">
              تحديث كلمة المرور لـ {targetUser.name}
            </h3>
            <div>
              <label className="text-xs font-bold text-slate-700 block mb-1">كلمة المرور الجديدة</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs"
                dir="ltr"
              />
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowPasswordModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleResetPassword}
                className="px-4 py-2 text-xs font-bold bg-[#1B5E3A] hover:bg-[#144D2E] text-white rounded-xl"
              >
                تحديث
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
