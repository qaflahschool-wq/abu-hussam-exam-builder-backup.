/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { LoginView } from './components/auth/LoginView.tsx';
import { Header } from './components/layout/Header.tsx';
import { Sidebar } from './components/layout/Sidebar.tsx';
import { MobileBottomNav } from './components/layout/MobileBottomNav.tsx';
import { DashboardView } from './components/dashboard/DashboardView.tsx';
import { ExamGeneratorView } from './components/generator/ExamGeneratorView.tsx';
import { QuestionBankView } from './components/questions/QuestionBankView.tsx';
import { CurriculumManager } from './components/curriculum/CurriculumManager.tsx';
import { ExamLibraryView } from './components/library/ExamLibraryView.tsx';
import { ExamEditorView } from './components/editor/ExamEditorView.tsx';
import { ExamArchiveView } from './components/archive/ExamArchiveView.tsx';
import { AISettingsView } from './components/ai-settings/AISettingsView.tsx';
import { UserManagerView } from './components/admin/UserManagerView.tsx';
import { SubjectsManagerView } from './components/admin/SubjectsManagerView.tsx';
import { SchoolIdentityView } from './components/admin/SchoolIdentityView.tsx';
import { BackupView } from './components/admin/BackupView.tsx';
import { NotificationsView } from './components/notifications/NotificationsView.tsx';
import { RegistrationRequestsView } from './components/admin/RegistrationRequestsView.tsx';
import { OwnerControlCenterView } from './components/owner/OwnerControlCenterView.tsx';
import { ImageAnalyzerView } from './components/vision/ImageAnalyzerView.tsx';
import { ManualExamWizardModal } from './components/studio/ManualExamWizardModal.tsx';
import { Exam } from './types/index.ts';
import { buildPracticeSandboxExam } from './utils/examLanguage.ts';
import { Layout, PlusCircle, Library, BookOpen } from 'lucide-react';

function MainAppContent() {
  const { user, loading, hasAIAccess, isAdmin, isPlatformOwner, schoolIdentity, subjects } = useAuth();
  const [activeView, setActiveView] = useState<string>('dashboard');
  const [viewParam, setViewParam] = useState<string | undefined>(undefined);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [initialStudioMode, setInitialStudioMode] = useState<'edit' | 'preview'>('edit');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [showManualWizard, setShowManualWizard] = useState(false);
  const [imageSnippetForGenerator, setImageSnippetForGenerator] = useState<string | undefined>(undefined);

  const prevUserIdRef = useRef<string | undefined>(user?.id);

  // Reset navigation & editor state whenever user logs out, logs in, or switches identity
  useEffect(() => {
    if (prevUserIdRef.current !== user?.id) {
      prevUserIdRef.current = user?.id;
      setActiveView('dashboard');
      setViewParam(undefined);
      setSelectedExam(null);
      setInitialStudioMode('edit');
      setIsMobileSidebarOpen(false);
      setShowManualWizard(false);
      setImageSnippetForGenerator(undefined);
    }
  }, [user?.id]);

  // Enforce role-based view guards if permissions change without identity switch
  useEffect(() => {
    if (!hasAIAccess && ['generator', 'vision', 'ai-settings'].includes(activeView)) {
      setActiveView('dashboard');
    }
    if (!isAdmin && ['users', 'subjects', 'school-identity'].includes(activeView)) {
      setActiveView('dashboard');
    }
    if (!isPlatformOwner && ['backup', 'registration-requests', 'owner-control-center'].includes(activeView)) {
      setActiveView('dashboard');
    }
  }, [hasAIAccess, isAdmin, isPlatformOwner, activeView]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
        <img
          src={schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg'}
          alt="شعار مدرسة قفلة"
          className="w-16 h-16 rounded-2xl object-contain mb-3 shadow-sm bg-white p-1"
        />
        <div className="w-8 h-8 border-3 border-[#1B5E3A] border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-xs font-bold text-slate-600">جاري التحقق من الجلسة...</p>
      </div>
    );
  }

  if (!user) {
    return <LoginView />;
  }

  const handleNavigate = (view: string, param?: string) => {
    // Enforce frontend view guards matching server middleware
    if (!hasAIAccess && ['generator', 'vision', 'ai-settings'].includes(view)) {
      setActiveView('dashboard');
      return;
    }
    if (!isAdmin && ['users', 'subjects', 'school-identity'].includes(view)) {
      setActiveView('dashboard');
      return;
    }
    if (!isPlatformOwner && ['backup', 'registration-requests', 'owner-control-center'].includes(view)) {
      setActiveView('dashboard');
      return;
    }

    setActiveView(view);
    setViewParam(param);
    setIsMobileSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSelectExam = (exam: Exam) => {
    setInitialStudioMode('edit');
    setSelectedExam(exam);
  };

  const handleStartPracticeExam = () => {
    if (!user) return;
    const defaultSubj =
      subjects.find(
        (s) =>
          s.isActive &&
          (!user.assignedSubjects || user.assignedSubjects.includes('all') || user.assignedSubjects.includes(s.id))
      )?.id || 'subj-sci';
    const sampleExam = buildPracticeSandboxExam(user.name, user.id, defaultSubj, subjects);
    setInitialStudioMode('edit');
    setSelectedExam(sampleExam);
    handleNavigate('editor');
  };

  return (
    <div
      className="app-shell-root min-h-screen bg-slate-50 flex flex-col font-sans overflow-x-clip print:block print:overflow-visible print:h-auto print:min-h-0 print:bg-white"
      dir="rtl"
    >
      <Header
        onNavigate={handleNavigate}
        activeView={activeView}
        isMobileSidebarOpen={isMobileSidebarOpen}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
        onOpenManualWizard={() => setShowManualWizard(true)}
      />

      <div className="app-shell-body flex-1 flex relative min-w-0 print:block print:overflow-visible print:h-auto">
        <Sidebar
          activeView={activeView}
          onNavigate={handleNavigate}
          isMobileOpen={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
        />

        <main className="app-shell-main flex-1 min-w-0 p-3 sm:p-5 lg:p-8 pb-28 lg:pb-8 max-w-full print:p-0 print:m-0 print:overflow-visible print:h-auto print:block">
          {activeView === 'dashboard' && (
            <DashboardView
              onNavigate={handleNavigate}
              onSelectExam={(e) => {
                handleSelectExam(e);
                handleNavigate('editor');
              }}
              onOpenManualWizard={() => setShowManualWizard(true)}
              onStartPracticeExam={handleStartPracticeExam}
            />
          )}

          {hasAIAccess && activeView === 'generator' && (
            <ExamGeneratorView
              initialImageContext={imageSnippetForGenerator}
              onExamGenerated={(exam) => {
                handleSelectExam(exam);
              }}
              onOpenEditor={(exam) => {
                handleSelectExam(exam);
                handleNavigate('editor');
              }}
            />
          )}

          {hasAIAccess && activeView === 'vision' && (
            <ImageAnalyzerView
              onNavigateToGenerator={(snippet) => {
                setImageSnippetForGenerator(snippet);
                handleNavigate('generator');
              }}
              onNavigateToQuestionBank={() => handleNavigate('question-bank')}
            />
          )}

          {activeView === 'question-bank' && (
            <QuestionBankView initialGrade={viewParam} initialUnitId={viewParam} />
          )}

          {activeView === 'curricula' && (
            <CurriculumManager
              initialGrade={viewParam || 'Grade 7'}
              onNavigateToBank={(grade) => {
                handleNavigate('question-bank', grade);
              }}
            />
          )}

          {activeView === 'library' && (
            <ExamLibraryView
              onSelectExam={handleSelectExam}
              onNavigate={handleNavigate}
              onOpenManualWizard={() => setShowManualWizard(true)}
            />
          )}

          {(activeView === 'editor' || activeView === 'studio') && selectedExam && (
            <ExamEditorView
              exam={selectedExam}
              initialStudioMode={initialStudioMode}
              onBack={() => handleNavigate('library')}
              onExamSaved={(updated) => setSelectedExam(updated)}
            />
          )}

          {(activeView === 'editor' || activeView === 'studio') && !selectedExam && (
            <div className="max-w-xl mx-auto bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-5 shadow-xs mt-6">
              <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-[#1B5E3A] flex items-center justify-center mx-auto">
                <Layout className="w-7 h-7" />
              </div>
              <div className="space-y-1.5">
                <h2 className="text-lg font-extrabold text-slate-900">
                  استوديو تنسيق الاختبارات والامتحانات
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  أنشئ اختباراً جديداً بسهولة تامة، أو جرّب النموذج التدريبي لتتعرّف على الاستوديو دون التأثير على اختباراتك المحفوظة، أو افتح أحد اختباراتك من المكتبة.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3">
                <button
                  onClick={() => setShowManualWizard(true)}
                  className="w-full sm:w-auto px-5 py-2.5 bg-[#1B5E3A] hover:bg-[#144D2E] text-white text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 touch-target-min"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>إنشاء اختبار جديد يدوياً</span>
                </button>
                <button
                  onClick={handleStartPracticeExam}
                  className="w-full sm:w-auto px-5 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-[#1B5E3A] border border-emerald-200 text-xs font-extrabold rounded-xl flex items-center justify-center gap-2 touch-target-min"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>تجربة اختبار نموذجي للتدريب</span>
                </button>
                <button
                  onClick={() => handleNavigate('library')}
                  className="w-full sm:w-auto px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl flex items-center justify-center gap-2 touch-target-min"
                >
                  <Library className="w-4 h-4" />
                  <span>اختيار اختبار من المكتبة</span>
                </button>
              </div>
            </div>
          )}

          {activeView === 'archive' && (
            <ExamArchiveView
              onSelectExam={(e) => {
                handleSelectExam(e);
                handleNavigate('editor');
              }}
              onNavigate={handleNavigate}
            />
          )}

          {hasAIAccess && activeView === 'ai-settings' && <AISettingsView />}
          {activeView === 'notifications' && <NotificationsView onNavigate={handleNavigate} />}
          {isAdmin && activeView === 'users' && <UserManagerView />}
          {isAdmin && activeView === 'subjects' && <SubjectsManagerView />}
          {isAdmin && activeView === 'school-identity' && <SchoolIdentityView />}
          {isPlatformOwner && activeView === 'registration-requests' && <RegistrationRequestsView />}
          {isPlatformOwner && activeView === 'owner-control-center' && (
            <OwnerControlCenterView onNavigate={handleNavigate} />
          )}
          {isPlatformOwner && activeView === 'backup' && <BackupView />}
        </main>
      </div>

      <MobileBottomNav
        activeView={activeView}
        onNavigate={handleNavigate}
        onOpenMenu={() => setIsMobileSidebarOpen(true)}
        onOpenManualWizard={() => setShowManualWizard(true)}
      />

      {showManualWizard && (
        <ManualExamWizardModal
          onClose={() => setShowManualWizard(false)}
          onCreated={(createdExam, openMode = 'edit') => {
            setShowManualWizard(false);
            setInitialStudioMode(openMode);
            setSelectedExam(createdExam);
            handleNavigate('editor');
          }}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainAppContent />
    </AuthProvider>
  );
}
