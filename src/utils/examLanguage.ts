import { Exam, ExamHeaderConfig, ExamLayoutConfig, FontFamilyOption, GradeLevel, Subject } from '../types/index.ts';
import { normalizeLayoutConfig } from '../components/editor/layoutDefaults.ts';

export type PaperLanguage = 'ar' | 'en';

export interface SubjectPaperProfile {
  paperLanguage: PaperLanguage;
  dir: 'rtl' | 'ltr';
  instructionsLanguage: 'Arabic' | 'English';
  fontFamily: FontFamilyOption;
  isQuran: boolean;
  isEnglishSubject: boolean;
  subjectNameAr: string;
  subjectNameEn: string;
}

const ARABIC_SUBJECT_IDS = new Set([
  'subj-quran',
  'subj-isl',
  'subj-ar',
  'subj-sci',
  'subj-soc',
  'subj-math',
  'subj-cs',
]);

/**
 * Resolves paper language and direction STRICTLY from the subject — never from UI locale or user profile.
 */
export function resolveSubjectPaperProfile(
  subjectId?: string,
  subjects?: Subject[],
  fallbackSubjectText?: string
): SubjectPaperProfile {
  const matched = subjects?.find((s) => s.id === subjectId);
  const cleanId = String(subjectId || '').trim();
  const textLower = String(fallbackSubjectText || matched?.nameEn || '').toLowerCase();

  const isEnglishSubject =
    cleanId === 'subj-en' ||
    matched?.code === 'ENG' ||
    matched?.defaultDirection === 'ltr' ||
    (!ARABIC_SUBJECT_IDS.has(cleanId) && /\benglish\b/.test(textLower) && !/arabic|عرب/.test(textLower));

  const isQuran =
    cleanId === 'subj-quran' ||
    Boolean(matched?.isQuran) ||
    /quran|القرآن/.test(`${matched?.nameEn || ''} ${matched?.nameAr || ''} ${fallbackSubjectText || ''}`);

  if (isEnglishSubject) {
    return {
      paperLanguage: 'en',
      dir: 'ltr',
      instructionsLanguage: 'English',
      fontFamily: 'inter',
      isQuran: false,
      isEnglishSubject: true,
      subjectNameAr: matched?.nameAr || 'اللغة الإنجليزية',
      subjectNameEn: matched?.nameEn || 'English Language',
    };
  }

  return {
    paperLanguage: 'ar',
    dir: 'rtl',
    instructionsLanguage: 'Arabic',
    fontFamily: isQuran ? 'amiri' : 'cairo',
    isQuran,
    isEnglishSubject: false,
    subjectNameAr: matched?.nameAr || fallbackSubjectText || 'المادة الدراسية',
    subjectNameEn: matched?.nameEn || 'Subject',
  };
}

export function formatGradeForPaperLanguage(grade: GradeLevel, lang: PaperLanguage): string {
  const g = String(grade || '').trim();
  if (lang === 'en') {
    const mapArToEn: Record<string, string> = {
      'الصف الأول': 'Grade 1',
      'الصف الثاني': 'Grade 2',
      'الصف الثالث': 'Grade 3',
      'الصف الرابع': 'Grade 4',
      'الصف الخامس': 'Grade 5',
      'الصف السادس': 'Grade 6',
      'الصف السابع': 'Grade 7',
      'الصف الثامن': 'Grade 8',
      'الصف التاسع': 'Grade 9',
    };
    return mapArToEn[g] || g;
  }

  const mapEnToAr: Record<string, string> = {
    'Grade 1': 'الصف الأول',
    'Grade 2': 'الصف الثاني',
    'Grade 3': 'الصف الثالث',
    'Grade 4': 'الصف الرابع',
    'Grade 5': 'الصف الخامس',
    'Grade 6': 'الصف السادس',
    'Grade 7': 'الصف السابع',
    'Grade 8': 'الصف الثامن',
    'Grade 9': 'الصف التاسع',
  };
  return mapEnToAr[g] || g;
}

export function formatTermForPaperLanguage(term: string, lang: PaperLanguage): string {
  const t = String(term || '').trim();
  if (lang === 'en') {
    if (/أول|الأول|first/i.test(t)) return 'First Term';
    if (/ثاني|الثاني|second/i.test(t)) return 'Second Term';
    if (/منتصف|نصفي|midterm/i.test(t)) return 'Midterm Exam';
    if (/نهائي|نهاية|final/i.test(t)) return 'Final Term Exam';
    // Strip Arabic inside parentheses if present
    return t.replace(/\([^)]*[\u0600-\u06FF]+[^)]*\)/g, '').trim() || 'First Term';
  }
  if (/first/i.test(t) && !/[\u0600-\u06FF]/.test(t)) return 'الفصل الدراسي الأول';
  if (/second/i.test(t) && !/[\u0600-\u06FF]/.test(t)) return 'الفصل الدراسي الثاني';
  return t.replace(/\([^)]*[A-Za-z]+[^)]*\)/g, '').trim() || 'الفصل الدراسي الأول';
}

export function formatCategoryForPaperLanguage(category: string, lang: PaperLanguage): string {
  const c = String(category || '').trim();
  if (lang === 'en') {
    const map: Record<string, string> = {
      Quiz: 'Short Quiz',
      Daily: 'Daily Quiz',
      Weekly: 'Weekly Test',
      Monthly: 'Monthly Exam',
      Midterm: 'Midterm Exam',
      Final: 'Final Exam',
      Diagnostic: 'Diagnostic Test',
      Remedial: 'Remedial Test',
      Practice: 'Practice Exam',
      Revision: 'Revision Exam',
    };
    return map[c] || c;
  }
  const mapAr: Record<string, string> = {
    Quiz: 'اختبار قصير',
    Daily: 'اختبار يومي',
    Weekly: 'اختبار أسبوعي',
    Monthly: 'اختبار شهري',
    Midterm: 'امتحان فصلي',
    Final: 'امتحان نهائي',
    Diagnostic: 'اختبار تشخيصي',
    Remedial: 'اختبار علاجي',
    Practice: 'اختبار تجريبي',
    Revision: 'اختبار مراجعة',
  };
  return mapAr[c] || c;
}

/**
 * Strips parallel bilingual parenthetical clutter like "English Language (اللغة الإنجليزية)"
 * or "60 Minutes (ساعة واحدة)" when rendering a strict single-language paper.
 */
export function cleanSingleLanguageText(text: string | undefined, lang: PaperLanguage): string {
  if (!text) return '';
  if (lang === 'en') {
    return text
      .replace(/\s*\([^)]*[\u0600-\u06FF]+[^)]*\)/g, '')
      .replace(/\s*[-–—]\s*[\u0600-\u06FF\s]+$/g, '')
      .trim();
  }
  return text
    .replace(/\s*\([^)]*[A-Za-z]{2,}[^)]*\)/g, '')
    .replace(/^[A-Za-z0-9\s,&.'-]+\s*[-–—]\s*(?=[\u0600-\u06FF])/g, '')
    .trim();
}

/**
 * Returns default paper header + layout synced strictly to the chosen subject language.
 */
export function applySubjectLanguageToExam(
  exam: Exam,
  nextSubjectId: string,
  subjects: Subject[],
  resetGenericTitles = false
): Exam {
  const profile = resolveSubjectPaperProfile(nextSubjectId, subjects, exam.headerConfig?.subject);
  const lang = profile.paperLanguage;
  const catLabel = formatCategoryForPaperLanguage(exam.category, lang);

  const prevHeader: ExamHeaderConfig = exam.headerConfig || ({} as ExamHeaderConfig);
  const nextTitleAr =
    lang === 'ar'
      ? resetGenericTitles || !exam.titleAr
        ? `${catLabel} - مادة ${profile.subjectNameAr}`
        : exam.titleAr
      : exam.titleAr;

  const nextTitleEn =
    lang === 'en'
      ? resetGenericTitles || !exam.title || /^[\u0600-\u06FF\s-]+$/.test(exam.title)
        ? `${formatGradeForPaperLanguage(exam.grade, 'en')} ${profile.subjectNameEn} ${catLabel}`
        : exam.title
      : exam.title;

  const nextNotes =
    lang === 'en'
      ? !prevHeader.notes || /[\u0600-\u06FF]/.test(prevHeader.notes)
        ? 'Answer all questions clearly and legibly.'
        : prevHeader.notes
      : !prevHeader.notes || !/[\u0600-\u06FF]/.test(prevHeader.notes)
      ? 'أجب عن جميع الأسئلة بوضوح وخط مقروء.'
      : prevHeader.notes;

  const nextHeader: ExamHeaderConfig = {
    ...prevHeader,
    subject: profile.subjectNameAr,
    subjectEn: profile.subjectNameEn,
    grade: exam.grade,
    term: formatTermForPaperLanguage(exam.term, lang),
    examTypeLabel: catLabel,
    timeLimit: lang === 'en' ? `${exam.timeLimitMinutes} Minutes` : `${exam.timeLimitMinutes} دقيقة`,
    totalMarks: exam.totalMarks,
    headerLanguage: lang,
    notes: nextNotes,
  };
  delete nextHeader.sectionClass;

  const nextLayout: ExamLayoutConfig = normalizeLayoutConfig({
    ...exam.layoutConfig,
    fontFamily: profile.fontFamily,
    globalDirection: profile.dir,
    globalAlign: lang === 'en' ? 'left' : 'right',
    sectionNumbering: lang === 'en' ? 'alpha' : 'numeric',
    lineHeight: profile.isQuran ? Math.max(exam.layoutConfig?.lineHeight || 1.45, 1.85) : exam.layoutConfig?.lineHeight || 1.45,
  });

  const nextExam: Exam = {
    ...exam,
    subjectId: nextSubjectId,
    title: nextTitleEn || profile.subjectNameEn,
    titleAr: nextTitleAr || profile.subjectNameAr,
    instructionsLanguage: profile.instructionsLanguage,
    headerConfig: nextHeader,
    layoutConfig: nextLayout,
    notes: nextNotes,
  };
  delete nextExam.sectionClass;
  return nextExam;
}

/**
 * Generates an isolated, zero-risk interactive Practice Sandbox Exam for beginners to learn with.
 */
export function buildPracticeSandboxExam(
  teacherName: string,
  userId: string,
  subjectId: string,
  subjects: Subject[]
): Exam {
  const profile = resolveSubjectPaperProfile(subjectId, subjects);
  const isEn = profile.paperLanguage === 'en';
  const today = new Date().toISOString().slice(0, 10);

  return {
    id: `practice-sandbox-${userId}`,
    ownerId: userId,
    subjectId: subjectId || (isEn ? 'subj-en' : 'subj-sci'),
    code: 'PRACTICE-SAMPLE',
    title: isEn ? 'Practice Sample Exam (Training Mode)' : 'نموذج تدريبي - للتعلّم والتجربة',
    titleAr: isEn ? 'Practice Sample Exam (Training Mode)' : 'اختبار تجريبي نموذجي للتدريب',
    grade: 'Grade 7',
    term: isEn ? 'First Term' : 'الفصل الدراسي الأول',
    examDate: today,
    category: 'Practice',
    totalMarks: 10,
    timeLimitMinutes: 30,
    difficulty: 'Easy',
    instructionsLanguage: profile.instructionsLanguage,
    headerConfig: {
      countryTitle: isEn ? 'Republic of Yemen' : 'الجمهورية اليمنية',
      ministryTitle: isEn ? 'Ministry of Education' : 'وزارة التربية والتعليم',
      schoolName: isEn ? 'QAFLAH SCHOOL' : 'مدرسة قفلة للتعليم الأساسي',
      schoolNameEn: 'QAFLAH SCHOOL',
      subject: profile.subjectNameAr,
      subjectEn: profile.subjectNameEn,
      grade: 'Grade 7',
      term: isEn ? 'First Term' : 'الفصل الدراسي الأول',
      academicYear: '2026 / 2027',
      examDate: today,
      examTypeLabel: isEn ? 'Practice Exam' : 'اختبار تدريبي',
      teacherName,
      showTeacherName: true,
      timeLimit: isEn ? '30 Minutes' : '30 دقيقة',
      totalMarks: 10,
      showSchoolLogo: true,
      headerLanguage: profile.paperLanguage,
      notes: isEn
        ? 'This is a practice paper. Feel free to edit, reorder, or preview!'
        : 'هذا نموذج تدريبي آمن — جرّب تعديل الأسئلة والدرجات ومعاينة الطباعة بحرية.',
    },
    layoutConfig: normalizeLayoutConfig({
      fontFamily: profile.fontFamily,
      globalDirection: profile.dir,
      globalAlign: isEn ? 'left' : 'right',
    }),
    sections: [
      {
        id: 'practice-sec-1',
        sectionTitle: isEn ? 'Section A: Sample Questions' : 'القسم الأول: أسئلة تدريبية متنوعة',
        instructions: isEn ? 'Try editing questions, changing marks, or adding new ones:' : 'جرّب تعديل السؤال أو تغيير درجته أو إضافة سؤال جديد:',
        questionType: 'Multiple Choice',
        marks: 10,
        questions: [
          {
            id: 'practice-q-1',
            grade: 'Grade 7',
            unitId: 'practice',
            type: 'Multiple Choice',
            difficulty: 'Easy',
            marks: 3,
            questionText: isEn
              ? 'Which planet is known as the Red Planet?'
              : 'ما هي عاصمة الجمهورية اليمنية؟',
            options: isEn
              ? ['Earth', 'Mars', 'Venus', 'Jupiter']
              : ['صنعاء', 'عدن', 'تعز', 'إب'],
            modelAnswer: isEn ? 'Mars' : 'صنعاء',
            source: 'Teacher Manual',
            sourceCode: 'TEACHER_MANUAL',
            formatting: { dir: profile.dir, align: isEn ? 'left' : 'right' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'practice-q-2',
            grade: 'Grade 7',
            unitId: 'practice',
            type: 'True or False',
            difficulty: 'Easy',
            marks: 2,
            questionText: isEn
              ? 'Water boils at 100 degrees Celsius.'
              : 'تدور الأرض حول الشمس مرة واحدة كل سنة تقريباً.',
            options: isEn ? ['True', 'False'] : ['صح', 'خطأ'],
            modelAnswer: isEn ? 'True' : 'صح',
            source: 'Teacher Manual',
            sourceCode: 'TEACHER_MANUAL',
            formatting: { dir: profile.dir, align: isEn ? 'left' : 'right' },
            createdAt: new Date().toISOString(),
          },
          {
            id: 'practice-q-3',
            grade: 'Grade 7',
            unitId: 'practice',
            type: 'Short Answer',
            difficulty: 'Easy',
            marks: 5,
            questionText: isEn
              ? 'Write two benefits of reading every day.'
              : 'اذكر فائدتين من فوائد القراءة والالتزام بالدراسة:',
            answerSpaceLines: 2,
            modelAnswer: isEn
              ? 'Improves knowledge and builds vocabulary.'
              : 'توسيع المعرفة وتنمية مهارات التفكير والتعبير.',
            source: 'Teacher Manual',
            sourceCode: 'TEACHER_MANUAL',
            formatting: { dir: profile.dir, align: isEn ? 'left' : 'right' },
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    status: 'Draft',
    createdBy: userId,
    createdByName: teacherName,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
