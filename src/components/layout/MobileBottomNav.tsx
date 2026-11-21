import React from 'react';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  LayoutDashboard,
  Sparkles,
  Database,
  Library,
  Layout,
  Menu,
} from 'lucide-react';

interface MobileBottomNavProps {
  activeView: string;
  onNavigate: (view: string) => void;
  onOpenMenu: () => void;
  onOpenManualWizard: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onNavigate,
  onOpenMenu,
  onOpenManualWizard,
}) => {
  const { hasAIAccess } = useAuth();

  const tabs = hasAIAccess
    ? [
        { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
        { id: 'generator', label: 'توليد AI', icon: Sparkles, highlight: true },
        { id: 'studio', label: 'الاستوديو', icon: Layout },
        { id: 'question-bank', label: 'بنك الأسئلة', icon: Database },
      ]
    : [
        { id: 'dashboard', label: 'الرئيسية', icon: LayoutDashboard },
        { id: 'new-manual', label: 'اختبار جديد', icon: Layout, highlight: true },
        { id: 'library', label: 'مكتبتي', icon: Library },
        { id: 'question-bank', label: 'بنك الأسئلة', icon: Database },
      ];

  return (
    <nav className="no-print lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-slate-200 z-30 safe-area-bottom shadow-lg">
      <div className="grid grid-cols-5 h-16 items-center px-1">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive =
            activeView === tab.id || (tab.id === 'studio' && activeView === 'editor');
          return (
            <button
              key={tab.id}
              onClick={() => {
                if (tab.id === 'new-manual') {
                  onOpenManualWizard();
                } else {
                  onNavigate(tab.id);
                }
              }}
              className={`flex flex-col items-center justify-center h-full transition-colors touch-target-min relative ${
                isActive
                  ? 'text-[#1B5E3A] font-extrabold'
                  : tab.highlight
                  ? 'text-[#1B5E3A] font-bold'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {tab.highlight ? (
                <div className="w-10 h-10 -mt-4 rounded-full bg-[#1B5E3A] text-white flex items-center justify-center shadow-md border-2 border-white">
                  <Icon className="w-5 h-5" />
                </div>
              ) : (
                <Icon className="w-5 h-5 mb-0.5" />
              )}
              <span className="text-[10px] leading-none mt-0.5">{tab.label}</span>
            </button>
          );
        })}

        <button
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center h-full text-slate-500 hover:text-slate-900 transition-colors touch-target-min"
          aria-label="المزيد من القوائم"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] leading-none mt-0.5">المزيد</span>
        </button>
      </div>
    </nav>
  );
};
