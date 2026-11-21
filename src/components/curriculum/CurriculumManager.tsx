import React, { useState, useEffect } from 'react';
import { api } from '../../services/api.ts';
import { CurriculumUnit, CurriculumLesson, GradeLevel } from '../../types/index.ts';
import { useAuth } from '../../context/AuthContext.tsx';
import {
  BookOpen,
  Plus,
  Trash2,
  Edit,
  RotateCcw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Tag,
  Check,
  Search,
  BookMarked,
  FileText,
} from 'lucide-react';

interface CurriculumManagerProps {
  initialGrade?: string;
  onNavigateToBank: (grade: string, unitId?: string) => void;
}

export const CurriculumManager: React.FC<CurriculumManagerProps> = ({
  initialGrade = 'Grade 7',
  onNavigateToBank,
}) => {
  const { isAdmin } = useAuth();
  const [selectedGrade, setSelectedGrade] = useState<GradeLevel>(
    (initialGrade as GradeLevel) || 'Grade 7'
  );
  const [units, setUnits] = useState<CurriculumUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedUnitId, setExpandedUnitId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Unit Edit / Add Modal
  const [showUnitModal, setShowUnitModal] = useState(false);
  const [editingUnit, setEditingUnit] = useState<Partial<CurriculumUnit> | null>(null);

  // Lesson Edit / Add Modal
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [targetUnitId, setTargetUnitId] = useState<string | null>(null);
  const [editingLesson, setEditingLesson] = useState<Partial<CurriculumLesson> | null>(null);

  const [vocabInput, setVocabInput] = useState('');
  const [grammarInput, setGrammarInput] = useState('');
  const [skillInput, setSkillInput] = useState('');

  const loadCurricula = async () => {
    try {
      setLoading(true);
      const data = await api.getCurricula(selectedGrade);
      setUnits(data);
      if (data.length > 0 && !expandedUnitId) {
        setExpandedUnitId(data[0].id);
      }
    } catch (e) {
      console.error('Failed to load curriculum:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCurricula();
  }, [selectedGrade]);

  const handleResetDefaults = async () => {
    if (
      !confirm(
        'هل أنت متأكد من إعادة ضبط المنهج اليمني إلى المعايير الرسمية المعتمدة لمدرسة قفلة؟'
      )
    ) {
      return;
    }
    try {
      await api.resetCurricula();
      await loadCurricula();
      alert('تمت استعادة المنهج المعتمد بنجاح.');
    } catch (e: any) {
      alert(e.message || 'فشل إعادة الضبط');
    }
  };

  const handleSaveUnit = async () => {
    if (!editingUnit?.title || !editingUnit.titleAr) {
      alert('يرجى ملء عنوان الوحدة بالإنجليزية والعربية');
      return;
    }
    try {
      if (editingUnit.id) {
        await api.updateUnit(editingUnit.id, editingUnit);
      } else {
        await api.addUnit({
          ...editingUnit,
          grade: selectedGrade,
          unitNumber: units.length + 1,
          lessons: [],
        });
      }
      setShowUnitModal(false);
      setEditingUnit(null);
      await loadCurricula();
    } catch (e: any) {
      alert(e.message || 'حدث خطأ أثناء حفظ الوحدة');
    }
  };

  const handleDeleteUnit = async (unitId: string) => {
    if (!confirm('هل أنت متأكد من حذف هذه الوحدة الدراسية؟')) return;
    try {
      await api.deleteUnit(unitId);
      await loadCurricula();
    } catch (e: any) {
      alert(e.message || 'فشل حذف الوحدة');
    }
  };

  const handleSaveLesson = async () => {
    if (!targetUnitId || !editingLesson?.title) {
      alert('يرجى إدخال عنوان الدرس');
      return;
    }

    const unit = units.find((u) => u.id === targetUnitId);
    if (!unit) return;

    const newLessons = [...unit.lessons];
    const vocabArray = vocabInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const grammarArray = grammarInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const skillsArray = skillInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (editingLesson.id) {
      const idx = newLessons.findIndex((l) => l.id === editingLesson.id);
      if (idx >= 0) {
        newLessons[idx] = {
          ...newLessons[idx],
          ...editingLesson,
          vocabulary: vocabArray.length > 0 ? vocabArray : newLessons[idx].vocabulary,
          grammarPoints: grammarArray.length > 0 ? grammarArray : newLessons[idx].grammarPoints,
          skills: skillsArray.length > 0 ? skillsArray : newLessons[idx].skills,
        } as CurriculumLesson;
      }
    } else {
      const newL: CurriculumLesson = {
        id: `les-${Date.now()}`,
        unitId: targetUnitId,
        lessonNumber: newLessons.length + 1,
        title: editingLesson.title,
        titleAr: editingLesson.titleAr || editingLesson.title,
        vocabulary: vocabArray,
        grammarPoints: grammarArray,
        readingTopic: editingLesson.readingTopic,
        skills: skillsArray,
      };
      newLessons.push(newL);
    }

    try {
      await api.updateUnit(targetUnitId, { lessons: newLessons });
      setShowLessonModal(false);
      setEditingLesson(null);
      await loadCurricula();
    } catch (e: any) {
      alert(e.message || 'فشل حفظ الدرس');
    }
  };

  const filteredUnits = units.filter((u) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      u.title.toLowerCase().includes(q) ||
      u.titleAr.toLowerCase().includes(q) ||
      u.lessons.some(
        (l) =>
          l.title.toLowerCase().includes(q) ||
          l.vocabulary.some((v) => v.toLowerCase().includes(q)) ||
          l.grammarPoints.some((g) => g.toLowerCase().includes(q))
      )
    );
  });

  return (
    <div className="space-y-6">
      {/* Header and Grade Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-xl font-extrabold text-[#0f2537] flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-amber-500" />
            <span>إدارة المناهج والصفوف الدراسية – مدرسة قفلة</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            سلسلة مناهج الهلال للغة الإنجليزية بالجمهورية اليمنية (Crescent English Course for Yemen)
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isAdmin && (
            <>
              <button
                onClick={handleResetDefaults}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors"
                title="إعادة ضبط المنهج إلى النسخة المعتمدة الرسمية"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>إعادة ضبط المنهج</span>
              </button>

              <button
                onClick={() => {
                  setEditingUnit({ grade: selectedGrade, title: '', titleAr: '', description: '' });
                  setShowUnitModal(true);
                }}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 shadow-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>إضافة وحدة دراسية</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Grade Selector Tabs */}
      <div className="flex items-center gap-1.5 sm:gap-2 border-b border-slate-200 pb-2 overflow-x-auto">
        {(['Grade 7', 'Grade 8', 'Grade 9'] as GradeLevel[]).map((grade) => {
          const isCurrent = selectedGrade === grade;
          return (
            <button
              key={grade}
              onClick={() => setSelectedGrade(grade)}
              className={`flex-1 sm:flex-initial px-3 sm:px-6 py-2.5 sm:py-3 rounded-xl font-extrabold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 touch-target-min ${
                isCurrent
                  ? 'bg-[#0f2537] text-amber-400 shadow-md shadow-slate-900/20 border-b-2 border-amber-400'
                  : 'bg-white hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              <span>{grade}</span>
              <span className="text-[10px] sm:text-xs opacity-75 hidden xs:inline">
                {grade === 'Grade 7'
                  ? '(سابع)'
                  : grade === 'Grade 8'
                  ? '(ثامن)'
                  : '(تاسع)'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Search Bar */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-3.5" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="ابحث عن وحدة، درس، قاعدة لغوية (Grammar)، أو مفردات (Vocabulary)..."
          className="w-full pl-4 pr-10 py-2.5 bg-white border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-amber-500/50"
        />
      </div>

      {/* Units Accordion */}
      {loading ? (
        <div className="text-center py-12">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-xs text-slate-500 mt-2">جاري استعراض الوحدات المعتمدة...</p>
        </div>
      ) : filteredUnits.length > 0 ? (
        <div className="space-y-4">
          {filteredUnits.map((unit) => {
            const isExpanded = expandedUnitId === unit.id;
            return (
              <div
                key={unit.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:border-slate-300 transition-all"
              >
                {/* Unit Header */}
                <div
                  onClick={() => setExpandedUnitId(isExpanded ? null : unit.id)}
                  className="p-4 sm:p-5 flex items-center justify-between cursor-pointer bg-slate-50/50 hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#0f2537] text-amber-400 font-extrabold flex items-center justify-center shrink-0">
                      U{unit.unitNumber}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="font-bold text-[#0f2537] text-base">{unit.title}</h2>
                        <span className="text-xs text-slate-500 font-arabic">({unit.titleAr})</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{unit.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToBank(selectedGrade, unit.id);
                      }}
                      className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-bold transition-colors"
                      title="عرض أسئلة هذه الوحدة في بنك الأسئلة"
                    >
                      <BookMarked className="w-3.5 h-3.5" />
                      <span>أسئلة الوحدة</span>
                    </button>

                    {isAdmin && (
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => {
                            setEditingUnit(unit);
                            setShowUnitModal(true);
                          }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteUnit(unit.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    <div className="text-slate-400">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Lessons Details */}
                {isExpanded && (
                  <div className="p-5 border-t border-slate-100 space-y-4 bg-white">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-xs font-extrabold text-slate-700 uppercase tracking-wider">
                        قائمة الدروس والموضوعات المعتمدة ({unit.lessons.length} دروس):
                      </h3>
                      {isAdmin && (
                        <button
                          onClick={() => {
                            setTargetUnitId(unit.id);
                            setEditingLesson({ title: '', titleAr: '' });
                            setVocabInput('');
                            setGrammarInput('');
                            setSkillInput('');
                            setShowLessonModal(true);
                          }}
                          className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg flex items-center gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>إضافة درس</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {unit.lessons.map((lesson) => (
                        <div
                          key={lesson.id}
                          className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-3"
                        >
                          <div className="flex items-center justify-between">
                            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                              <span className="w-5 h-5 rounded-md bg-amber-500/20 text-amber-700 text-xs flex items-center justify-center font-mono font-bold">
                                {lesson.lessonNumber}
                              </span>
                              <span>{lesson.title}</span>
                              <span className="text-xs text-slate-500">({lesson.titleAr})</span>
                            </div>

                            {isAdmin && (
                              <button
                                onClick={() => {
                                  setTargetUnitId(unit.id);
                                  setEditingLesson(lesson);
                                  setVocabInput(lesson.vocabulary.join(', '));
                                  setGrammarInput(lesson.grammarPoints.join(', '));
                                  setSkillInput(lesson.skills.join(', '));
                                  setShowLessonModal(true);
                                }}
                                className="text-slate-400 hover:text-amber-600 p-1"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Vocabulary Chips */}
                          <div>
                            <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                              <Tag className="w-3 h-3 text-blue-500" />
                              <span>المفردات اللغوية (Vocabulary):</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5 font-english">
                              {lesson.vocabulary.map((vocab, vIdx) => (
                                <span
                                  key={vIdx}
                                  className="text-[11px] bg-blue-50 text-blue-800 px-2 py-0.5 rounded-md border border-blue-200/60 font-medium"
                                >
                                  {vocab}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Grammar Points */}
                          <div>
                            <div className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-emerald-500" />
                              <span>القواعد والتراكيب (Grammar & Structure):</span>
                            </div>
                            <ul className="list-disc list-inside text-xs text-slate-700 space-y-0.5 font-english">
                              {lesson.grammarPoints.map((gp, gIdx) => (
                                <li key={gIdx} className="text-[11px]">
                                  {gp}
                                </li>
                              ))}
                            </ul>
                          </div>

                          {/* Skills */}
                          {lesson.skills && lesson.skills.length > 0 && (
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-200/60 text-[11px] text-slate-500">
                              <span className="font-semibold">المهارات المستهدفة:</span>
                              <div className="flex gap-1.5">
                                {lesson.skills.map((sk, sIdx) => (
                                  <span key={sIdx} className="bg-slate-200/70 text-slate-700 px-1.5 py-0.2 rounded text-[10px]">
                                    {sk}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12 bg-white rounded-2xl border border-slate-200">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">لا توجد وحدات مطابقة للبحث.</p>
        </div>
      )}

      {/* Unit Modal */}
      {showUnitModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#0f2537]">
              {editingUnit?.id ? 'تعديل الوحدة الدراسية' : 'إضافة وحدة دراسية جديدة'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  عنوان الوحدة بالإنجليزية (Title)
                </label>
                <input
                  type="text"
                  value={editingUnit?.title || ''}
                  onChange={(e) => setEditingUnit({ ...editingUnit, title: e.target.value })}
                  placeholder="e.g. Unit 4: Food & Drink"
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  عنوان الوحدة بالعربية
                </label>
                <input
                  type="text"
                  value={editingUnit?.titleAr || ''}
                  onChange={(e) => setEditingUnit({ ...editingUnit, titleAr: e.target.value })}
                  placeholder="مثال: الوحدة الرابعة: الطعام والشراب"
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">وصف مختصر</label>
                <textarea
                  value={editingUnit?.description || ''}
                  onChange={(e) => setEditingUnit({ ...editingUnit, description: e.target.value })}
                  rows={2}
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowUnitModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveUnit}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl"
              >
                حفظ الوحدة
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lesson Modal */}
      {showLessonModal && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <h3 className="text-base font-bold text-[#0f2537]">
              {editingLesson?.id ? 'تعديل الدرس' : 'إضافة درس جديد إلى المنهج'}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  عنوان الدرس بالإنجليزية (Lesson Title)
                </label>
                <input
                  type="text"
                  value={editingLesson?.title || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, title: e.target.value })}
                  placeholder="e.g. A Visit to Bab Al-Yaman"
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  عنوان الدرس بالعربية
                </label>
                <input
                  type="text"
                  value={editingLesson?.titleAr || ''}
                  onChange={(e) => setEditingLesson({ ...editingLesson, titleAr: e.target.value })}
                  placeholder="مثال: زيارة إلى باب اليمن"
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  المفردات (Vocabulary) - مفصولة بفواصل
                </label>
                <input
                  type="text"
                  value={vocabInput}
                  onChange={(e) => setVocabInput(e.target.value)}
                  placeholder="Ancient, Market, Gate, Wall, Tourists"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-english"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  القواعد والتراكيب (Grammar Points) - مفصولة بفواصل
                </label>
                <input
                  type="text"
                  value={grammarInput}
                  onChange={(e) => setGrammarInput(e.target.value)}
                  placeholder="Past Simple regular verbs, Prepositions of place"
                  className="w-full px-3 py-2 border rounded-xl text-sm font-english"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  المهارات (Skills) - مفصولة بفواصل
                </label>
                <input
                  type="text"
                  value={skillInput}
                  onChange={(e) => setSkillInput(e.target.value)}
                  placeholder="Reading, Writing, Speaking"
                  className="w-full px-3 py-2 border rounded-xl text-sm"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t">
              <button
                onClick={() => setShowLessonModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
              >
                إلغاء
              </button>
              <button
                onClick={handleSaveLesson}
                className="px-4 py-2 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-xl"
              >
                حفظ الدرس
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
