import React from 'react';
import { Exam, Question } from '../../types/index.ts';
import {
  MoveUp,
  MoveDown,
  CornerDownRight,
  Lock,
  Unlock,
  FilePlus,
  ArrowRight,
  ArrowLeft,
  Scissors,
} from 'lucide-react';

interface QuestionOutlinePanelProps {
  exam: Exam;
  questionPageMap: Record<string, number>;
  sectionPageMap: Record<string, number>;
  totalPages: number;
  selectedQuestionId: string | null;
  isReadOnlyPreview: boolean;
  onSelectQuestion: (qId: string, pageNum?: number) => void;
  onMoveQuestion: (sIdx: number, qIdx: number, dir: 'up' | 'down') => void;
  onMoveQuestionToSection: (fromSIdx: number, qIdx: number, toSIdx: number) => void;
  onMoveQuestionToPage: (sIdx: number, qIdx: number, targetPage: number) => void;
  onToggleQuestionFlag: (
    sIdx: number,
    qIdx: number,
    field: 'pageBreakBefore' | 'pageBreakAfter' | 'keepTogether',
    value: boolean
  ) => void;
  onToggleSectionFlag: (
    sIdx: number,
    field: 'startOnNewPage' | 'pageBreakAfter',
    value: boolean
  ) => void;
}

export const QuestionOutlinePanel: React.FC<QuestionOutlinePanelProps> = ({
  exam,
  questionPageMap,
  sectionPageMap,
  totalPages,
  selectedQuestionId,
  isReadOnlyPreview,
  onSelectQuestion,
  onMoveQuestion,
  onMoveQuestionToSection,
  onMoveQuestionToPage,
  onToggleQuestionFlag,
  onToggleSectionFlag,
}) => {
  const totalQuestionsCount = exam.sections.reduce((acc, s) => acc + s.questions.length, 0);

  return (
    <div
      className="no-print bg-white border border-slate-200 rounded-2xl shadow-xs flex flex-col overflow-hidden text-xs"
      dir="rtl"
    >
      <div className="px-3.5 py-2.5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between gap-2">
        <span className="font-extrabold text-slate-900">قائمة الأسئلة والمخطط</span>
        <span className="text-[11px] font-mono font-bold text-[#1B5E3A] tabular-nums">
          {totalQuestionsCount} س · {totalPages} ص
        </span>
      </div>

      <div className="p-2.5 space-y-3 overflow-y-auto max-h-[calc(100vh-200px)]">
        {exam.sections.map((sec, sIdx) => {
          const secPage = sectionPageMap[sec.id] || 1;
          return (
            <div key={sec.id} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
              {/* Section Row */}
              <div className="px-2.5 py-2 bg-slate-100/80 border-b border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between gap-1.5">
                  <span className="font-extrabold text-slate-900 truncate">
                    {sIdx + 1}. {sec.sectionTitle}
                  </span>
                  <span className="text-[10px] font-mono font-bold text-slate-600 shrink-0 tabular-nums">
                    ص {secPage} · {sec.marks}د
                  </span>
                </div>

                {!isReadOnlyPreview && (
                  <div className="flex flex-wrap items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onToggleSectionFlag(sIdx, 'startOnNewPage', !sec.startOnNewPage)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                        sec.startOnNewPage
                          ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="بدء هذا القسم من صفحة جديدة"
                    >
                      <FilePlus className="w-3 h-3" />
                      <span>بداية بصفحة جديدة</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onToggleSectionFlag(sIdx, 'pageBreakAfter', !sec.pageBreakAfter)}
                      className={`px-1.5 py-0.5 rounded text-[10px] font-bold border flex items-center gap-1 ${
                        sec.pageBreakAfter
                          ? 'bg-amber-600 text-white border-amber-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                      title="فاصل صفحة بعد انتهاء القسم"
                    >
                      <Scissors className="w-3 h-3" />
                      <span>فاصل بعد القسم</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Section Questions */}
              <div className="divide-y divide-slate-100">
                {sec.questions.length === 0 ? (
                  <div className="px-2.5 py-2 text-[11px] text-slate-400 text-center">قسم فارغ</div>
                ) : (
                  sec.questions.map((q: Question, qIdx: number) => {
                    const qPage = questionPageMap[q.id] || secPage;
                    const isSelected = selectedQuestionId === q.id;
                    const keepTogether = q.keepTogether !== false;

                    return (
                      <div
                        key={q.id}
                        className={`p-2 transition-colors space-y-1.5 ${
                          isSelected ? 'bg-emerald-50/70' : 'bg-white hover:bg-slate-50/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onSelectQuestion(q.id, qPage)}
                          className="w-full text-right flex items-start justify-between gap-2"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-mono font-extrabold text-slate-900 tabular-nums">
                                {qIdx + 1}.
                              </span>
                              <span className="text-[11px] font-semibold text-slate-800 truncate">
                                {q.questionText || q.type}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                              <span>{q.type}</span>
                              <span>·</span>
                              <span className="tabular-nums">{q.marks} د.</span>
                            </div>
                          </div>

                          <span
                            className={`px-1.5 py-0.5 rounded font-mono text-[10px] font-bold shrink-0 tabular-nums border ${
                              isSelected
                                ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            ص {qPage}
                          </span>
                        </button>

                        {/* Quick Actions */}
                        {!isReadOnlyPreview && (
                          <div className="flex flex-wrap items-center justify-between gap-1 pt-0.5">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                disabled={qIdx === 0}
                                onClick={() => onMoveQuestion(sIdx, qIdx, 'up')}
                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30"
                                title="تحريك للأعلى"
                              >
                                <MoveUp className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                disabled={qIdx === sec.questions.length - 1}
                                onClick={() => onMoveQuestion(sIdx, qIdx, 'down')}
                                className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 disabled:opacity-30"
                                title="تحريك للأسفل"
                              >
                                <MoveDown className="w-3 h-3" />
                              </button>

                              {/* Move Across Pages */}
                              <button
                                type="button"
                                disabled={qPage <= 1}
                                onClick={() => onMoveQuestionToPage(sIdx, qIdx, qPage - 1)}
                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-0.5 disabled:opacity-30"
                                title="نقل إلى الصفحة السابقة"
                              >
                                <ArrowRight className="w-2.5 h-2.5" />
                                <span>ص{Math.max(1, qPage - 1)}</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => onMoveQuestionToPage(sIdx, qIdx, qPage + 1)}
                                className="px-1.5 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center gap-0.5"
                                title="نقل إلى الصفحة التالية"
                              >
                                <span>ص{qPage + 1}</span>
                                <ArrowLeft className="w-2.5 h-2.5" />
                              </button>
                            </div>

                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  onToggleQuestionFlag(sIdx, qIdx, 'pageBreakBefore', !q.pageBreakBefore)
                                }
                                className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${
                                  q.pageBreakBefore
                                    ? 'bg-amber-600 text-white border-amber-600'
                                    : 'bg-white text-slate-600 border-slate-200'
                                }`}
                                title="فرض بدء هذا السؤال في صفحة جديدة"
                              >
                                فاصل قبل
                              </button>
                              <button
                                type="button"
                                onClick={() => onToggleQuestionFlag(sIdx, qIdx, 'keepTogether', !keepTogether)}
                                className={`p-1 rounded border ${
                                  keepTogether
                                    ? 'bg-emerald-50 text-[#1B5E3A] border-emerald-200'
                                    : 'bg-white text-slate-400 border-slate-200'
                                }`}
                                title={keepTogether ? 'السؤال وخياراته ملتصقان معاً' : 'السماح بالفصل'}
                              >
                                {keepTogether ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                              </button>
                            </div>

                            {exam.sections.length > 1 && (
                              <div className="w-full flex items-center gap-1 pt-0.5">
                                <CornerDownRight className="w-3 h-3 text-slate-400 shrink-0" />
                                <select
                                  value={sIdx}
                                  onChange={(e) => onMoveQuestionToSection(sIdx, qIdx, Number(e.target.value))}
                                  className="flex-1 px-1.5 py-0.5 bg-slate-50 border border-slate-200 rounded text-[10px] font-bold text-slate-700"
                                >
                                  {exam.sections.map((targetS, tsIdx) => (
                                    <option key={targetS.id} value={tsIdx}>
                                      قسم {tsIdx + 1}: {targetS.sectionTitle.slice(0, 20)}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
