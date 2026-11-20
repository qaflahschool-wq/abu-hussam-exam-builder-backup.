import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import { api } from '../../services/api.ts';
import { Subject } from '../../types/index.ts';
import {
  ALL_BASIC_GRADE_VALUES,
  BASIC_GRADE_CATALOG,
  CORE_SIX_SUBJECT_IDS,
  sortSubjectsCanonical,
} from '../../utils/schoolCatalog.ts';
import {
  Lock,
  User as UserIcon,
  ArrowLeft,
  UserPlus,
  CheckCircle2,
  Phone,
  Clock,
} from 'lucide-react';

export const LoginView: React.FC = () => {
  const { login, schoolIdentity } = useAuth();
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');

  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showOwnerRecovery, setShowOwnerRecovery] = useState(false);
  const [recoveryToken, setRecoveryToken] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryConfirm, setRecoveryConfirm] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoverySuccess, setRecoverySuccess] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);

  // Registration State
  const [publicSubjects, setPublicSubjects] = useState<Subject[]>([]);
  const [regFullName, setRegFullName] = useState('');
  const [regUsername, setRegUsername] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [regRole, setRegRole] = useState<'Teacher' | 'SchoolAdmin'>('Teacher');
  const [regSubjects, setRegSubjects] = useState<string[]>(CORE_SIX_SUBJECT_IDS);
  const [regGrades, setRegGrades] = useState<string[]>(ALL_BASIC_GRADE_VALUES);
  const [regPhone, setRegPhone] = useState('');
  const [regNotes, setRegNotes] = useState('');
  const [regError, setRegError] = useState('');
  const [regSuccessMessage, setRegSuccessMessage] = useState('');
  const [regSubmitting, setRegSubmitting] = useState(false);

  useEffect(() => {
    api
      .getPublicSubjects()
      .then((list) => setPublicSubjects(sortSubjectsCanonical(list)))
      .catch(() => setPublicSubjects([]));
  }, []);

  const logoSrc = schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('يرجى إدخال اسم المستخدم وكلمة المرور');
      return;
    }
    try {
      setSubmitting(true);
      await login(username.trim(), password);
    } catch (err: any) {
      setError(err.message || 'تعذر تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  const handleOwnerRecovery = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    setRecoverySuccess('');
    if (recoveryToken.length < 32) {
      setRecoveryError('أدخل رمز الاستعادة الذي أعددته في إعدادات Cloudflare.');
      return;
    }
    if (recoveryPassword.length < 12 || recoveryPassword.length > 128) {
      setRecoveryError('كلمة المرور الجديدة يجب أن تكون بين 12 و128 حرفاً.');
      return;
    }
    if (recoveryPassword !== recoveryConfirm) {
      setRecoveryError('كلمتا المرور غير متطابقتين.');
      return;
    }
    try {
      setRecoverySubmitting(true);
      const result = await api.recoverOwner(recoveryToken, recoveryPassword);
      setRecoverySuccess(result.message || 'تم تحديث كلمة المرور. يمكنك تسجيل الدخول.');
      setRecoveryToken('');
      setRecoveryPassword('');
      setRecoveryConfirm('');
    } catch (err: any) {
      setRecoveryError(err.message || 'تعذرت استعادة حساب المالك.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegError('');
    setRegSuccessMessage('');

    if (regFullName.trim().length < 3) {
      setRegError('يرجى إدخال الاسم الكامل (3 أحرف على الأقل)');
      return;
    }
    if (!/^[a-zA-Z0-9._-]{3,32}$/.test(regUsername.trim())) {
      setRegError('اسم الدخول يجب أن يكون بالإنجليزية والأرقام فقط (3 إلى 32 حرفاً)');
      return;
    }
    if (regPassword.length < 8) {
      setRegError('كلمة المرور يجب ألا تقل عن 8 أحرف');
      return;
    }
    if (regPassword !== regConfirmPassword) {
      setRegError('كلمة المرور وتأكيد كلمة المرور غير متطابقتين');
      return;
    }
    if (regRole === 'Teacher' && regSubjects.length === 0) {
      setRegError('يرجى اختيار مادة دراسية واحدة على الأقل');
      return;
    }
    if (regRole === 'Teacher' && regGrades.length === 0) {
      setRegError('يرجى اختيار صف دراسي واحد على الأقل');
      return;
    }

    try {
      setRegSubmitting(true);
      const res = await api.registerAccount({
        fullName: regFullName.trim(),
        username: regUsername.trim(),
        password: regPassword,
        confirmPassword: regConfirmPassword,
        requestedRole: regRole,
        assignedSubjects: regRole === 'SchoolAdmin' ? ['all'] : regSubjects,
        assignedGrades: regRole === 'SchoolAdmin' ? ['all'] : regGrades,
        phone: regPhone.trim() || undefined,
        notes: regNotes.trim() || undefined,
      });
      setRegSuccessMessage(
        res.message ||
          'تم إرسال طلب التسجيل بنجاح وهو الآن بانتظار مراجعة وموافقة مالك المنصة أبوحسام.'
      );
      setRegFullName('');
      setRegUsername('');
      setRegPassword('');
      setRegConfirmPassword('');
      setRegPhone('');
      setRegNotes('');
    } catch (err: any) {
      setRegError(err.message || 'تعذر إرسال طلب التسجيل');
    } finally {
      setRegSubmitting(false);
    }
  };

  const toggleItem = (list: string[], id: string, setter: (val: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-8 px-4 sm:px-6 lg:px-8" dir="rtl">
      <div className="max-w-5xl w-full mx-auto grid grid-cols-1 lg:grid-cols-12 bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
        {/* School Identity Panel */}
        <div className="lg:col-span-5 bg-[#123d26] text-white p-6 sm:p-8 flex flex-col justify-between space-y-6">
          <div className="space-y-4">
            <div className="w-24 h-24 rounded-2xl bg-white p-1.5 shadow-lg mx-auto lg:mx-0">
              <img
                src={logoSrc}
                alt="شعار مدرسة قفلة للتعليم الأساسي"
                className="w-full h-full object-contain rounded-xl"
              />
            </div>

            <div className="space-y-1 text-center lg:text-right">
              <p className="text-xs text-emerald-200 font-semibold">
                {schoolIdentity?.countryTitleAr || 'الجمهورية اليمنية'} ·{' '}
                {schoolIdentity?.ministryTitleAr || 'وزارة التربية والتعليم'}
              </p>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-snug">
                {schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي'}
              </h1>
              <p className="text-xs font-english font-bold tracking-wider text-emerald-300" dir="ltr">
                {schoolIdentity?.schoolNameEn || 'QAFLAH SCHOOL'}
              </p>
            </div>

            <p className="text-xs text-emerald-100/90 leading-relaxed pt-2 border-t border-emerald-700/60">
              منصة <strong className="text-white">ABU HUSSAM EXAM BUILDER</strong> الموحدة لإعداد وتنسيق وطباعة الاختبارات المدرسية لجميع المواد الدراسية بما فيها القرآن الكريم مع عزل كامل لمساحات المعلمين.
            </p>
          </div>

          <div className="space-y-2 text-[11px] text-emerald-200/90 border-t border-emerald-800/80 pt-4">
            <div>• استوديو تنسيق وطباعة A4 يدوي لجميع المعلمين</div>
            <div>• بوابة تسجيل جديدة تخضع لموافقة مالك المنصة قبل التفعيل</div>
            <div>• خصوصية مستقلة لكل معلم ومادة وصف دراسي</div>
            <div>• محرك الذكاء الاصطناعي حصري لصاحب النظام أبوحسام</div>
          </div>
        </div>

        {/* Auth Panel (Login / Register Tabs) */}
        <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center space-y-5">
          {/* Switch Tabs */}
          <div className="flex rounded-xl bg-slate-100 p-1 border border-slate-200">
            <button
              type="button"
              onClick={() => {
                setAuthTab('login');
                setError('');
              }}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2 ${
                authTab === 'login'
                  ? 'bg-white text-[#1B5E3A] shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Lock className="w-4 h-4" />
              <span>تسجيل الدخول</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthTab('register');
                setRegError('');
              }}
              className={`flex-1 py-2.5 text-xs sm:text-sm font-extrabold rounded-lg transition-all flex items-center justify-center gap-2 ${
                authTab === 'register'
                  ? 'bg-white text-[#1B5E3A] shadow-xs border border-slate-200'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>طلب حساب جديد</span>
            </button>
          </div>

          {authTab === 'login' ? (
            <>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">تسجيل الدخول إلى البوابة المدرسية</h2>
                <p className="text-xs text-slate-500 mt-1">
                  أدخل بيانات حسابك المعتمد للوصول إلى مساحة العمل الخاصة بك
                </p>
              </div>

              {error && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold leading-relaxed">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">اسم المستخدم</label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="أدخل اسم المستخدم"
                      className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">كلمة المرور</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pr-10 pl-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                      dir="ltr"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-3 bg-[#1B5E3A] hover:bg-[#144D2E] text-white font-extrabold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <span>{submitting ? 'جاري التحقق...' : 'دخول إلى النظام'}</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>
              </form>

              <div className="pt-1 text-center">
                <button
                  type="button"
                  onClick={() => { setShowOwnerRecovery(!showOwnerRecovery); setRecoveryError(''); setRecoverySuccess(''); }}
                  className="text-xs font-bold text-[#1B5E3A] hover:underline"
                >
                  {showOwnerRecovery ? 'العودة لتسجيل الدخول' : 'استعادة حساب المالك'}
                </button>
              </div>

              {showOwnerRecovery && (
                <form onSubmit={handleOwnerRecovery} className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-900">استعادة حساب المالك</h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-600">هذه العملية لمرة واحدة فقط. أدخل رمز OWNER_RECOVERY_TOKEN الذي ستضيفه إلى أسرار Worker في Cloudflare، ثم عيّن كلمة مرور جديدة.</p>
                  </div>
                  {recoveryError && <div className="rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs font-bold text-rose-800">{recoveryError}</div>}
                  {recoverySuccess && <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-2.5 text-xs font-bold text-emerald-800">{recoverySuccess}</div>}
                  <label className="block text-xs font-bold text-slate-700">رمز الاستعادة (من Cloudflare)</label>
                  <input type="password" autoComplete="off" value={recoveryToken} onChange={(e) => setRecoveryToken(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" dir="ltr" />
                  <label className="block text-xs font-bold text-slate-700">كلمة المرور الجديدة</label>
                  <input type="password" autoComplete="new-password" value={recoveryPassword} onChange={(e) => setRecoveryPassword(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" dir="ltr" />
                  <label className="block text-xs font-bold text-slate-700">تأكيد كلمة المرور الجديدة</label>
                  <input type="password" autoComplete="new-password" value={recoveryConfirm} onChange={(e) => setRecoveryConfirm(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" dir="ltr" />
                  <button type="submit" disabled={recoverySubmitting} className="w-full rounded-xl bg-amber-700 py-2.5 text-sm font-extrabold text-white disabled:opacity-50">
                    {recoverySubmitting ? 'جارٍ تحديث كلمة المرور...' : 'تحديث كلمة مرور المالك'}
                  </button>
                </form>
              )}

            </>
          ) : (
            <div className="space-y-4">
              <div>
                <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">تقديم طلب حساب جديد</h2>
                <p className="text-xs text-slate-500 mt-1">
                  يبقى الحساب معلقاً (PENDING_APPROVAL) ولا يُفعَّل إلا بعد مراجعة وموافقة مالك المنصة أبوحسام.
                </p>
              </div>

              {regSuccessMessage ? (
                <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 space-y-3 text-emerald-950">
                  <div className="flex items-center gap-2 font-extrabold text-sm">
                    <CheckCircle2 className="w-5 h-5 text-[#1B5E3A]" />
                    <span>تم استلام طلب التسجيل بنجاح</span>
                  </div>
                  <p className="text-xs leading-relaxed">{regSuccessMessage}</p>
                  <div className="flex items-center gap-2 text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                    <Clock className="w-4 h-4 shrink-0" />
                    <span>حالة الطلب الحالية: بانتظار موافقة مالك المنصة (PENDING_APPROVAL)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRegSuccessMessage('');
                      setAuthTab('login');
                    }}
                    className="px-4 py-2 bg-[#1B5E3A] text-white text-xs font-bold rounded-xl"
                  >
                    العودة إلى صفحة الدخول
                  </button>
                </div>
              ) : (
                <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
                  {regError && (
                    <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 font-bold">
                      {regError}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">الاسم الكامل *</label>
                      <input
                        type="text"
                        value={regFullName}
                        onChange={(e) => setRegFullName(e.target.value)}
                        placeholder="أ. عبد الله محمد القفلي"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">اسم المستخدم (إنجليزي) *</label>
                      <input
                        type="text"
                        value={regUsername}
                        onChange={(e) => setRegUsername(e.target.value)}
                        placeholder="abdullah.q"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">كلمة المرور *</label>
                      <input
                        type="password"
                        value={regPassword}
                        onChange={(e) => setRegPassword(e.target.value)}
                        placeholder="6 أحرف على الأقل"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                        dir="ltr"
                      />
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">تأكيد كلمة المرور *</label>
                      <input
                        type="password"
                        value={regConfirmPassword}
                        onChange={(e) => setRegConfirmPassword(e.target.value)}
                        placeholder="أعد كتابة كلمة المرور"
                        className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">الدور المطلوب *</label>
                      <select
                        value={regRole}
                        onChange={(e) => setRegRole(e.target.value as 'Teacher' | 'SchoolAdmin')}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold"
                      >
                        <option value="Teacher">معلم / معلمة مادة (Teacher)</option>
                        <option value="SchoolAdmin">إدارة المدرسة (SchoolAdmin)</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-bold text-slate-700 block mb-1">رقم الهاتف (اختياري)</label>
                      <div className="relative">
                        <Phone className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-2.5" />
                        <input
                          type="text"
                          value={regPhone}
                          onChange={(e) => setRegPhone(e.target.value)}
                          placeholder="77xxxxxxx"
                          className="w-full pr-9 pl-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                          dir="ltr"
                        />
                      </div>
                    </div>
                  </div>

                  {regRole === 'Teacher' && (
                    <>
                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">المواد التي تدرسها *</label>
                        <div className="flex flex-wrap gap-1.5">
                          {publicSubjects.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={() => toggleItem(regSubjects, s.id, setRegSubjects)}
                              className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-bold transition-colors ${
                                regSubjects.includes(s.id)
                                  ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {s.nameAr}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <label className="font-bold text-slate-700 block mb-1.5">الصفوف الدراسية *</label>
                        <div className="flex flex-wrap gap-1.5">
                          {BASIC_GRADE_CATALOG.map((g) => (
                            <button
                              key={g.value}
                              type="button"
                              onClick={() => toggleItem(regGrades, g.value, setRegGrades)}
                              className={`px-2 py-1 rounded-lg border text-[11px] font-bold transition-colors ${
                                regGrades.includes(g.value)
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
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
                    <label className="font-bold text-slate-700 block mb-1">ملاحظات إضافية لإدارة المدرسة (اختياري)</label>
                    <input
                      type="text"
                      value={regNotes}
                      onChange={(e) => setRegNotes(e.target.value)}
                      placeholder="مثال: معلم القرآن الكريم والتربية الإسلامية للصفين السابع والثامن"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={regSubmitting}
                    className="w-full py-3 bg-[#1B5E3A] hover:bg-[#144D2E] text-white font-extrabold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <UserPlus className="w-4 h-4" />
                    <span>{regSubmitting ? 'جاري إرسال الطلب...' : 'إرسال طلب الحساب للموافقة'}</span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
