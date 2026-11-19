import React from 'react';
import { ExamHeaderConfig, SchoolIdentitySettings } from '../../types/index.ts';
import {
  cleanSingleLanguageText,
  formatGradeForPaperLanguage,
  formatTermForPaperLanguage,
} from '../../utils/examLanguage.ts';

interface OfficialSchoolHeaderProps {
  headerConfig: ExamHeaderConfig;
  examTitle: string;
  examTitleAr?: string;
  subjectId?: string;
  examDate?: string;
  schoolIdentity?: SchoolIdentitySettings | null;
  timeLimitMinutes: number;
  totalMarks: number;
  grade: string;
  term: string;
  examPeriod?: string;
  examCategoryLabel?: string;
  teacherName?: string;
  isAnswerKeyView?: boolean;
  logoSize?: 'sm' | 'md' | 'lg';
  compact?: boolean;
  printColorMode?: 'color' | 'bw';
}

export const OfficialSchoolHeader: React.FC<OfficialSchoolHeaderProps> = ({
  headerConfig,
  examTitle,
  examTitleAr,
  subjectId,
  examDate,
  schoolIdentity,
  timeLimitMinutes,
  totalMarks,
  grade,
  term,
  examCategoryLabel,
  teacherName,
  isAnswerKeyView = false,
  logoSize = 'md',
  compact = false,
  printColorMode = 'color',
}) => {
  const logoSrc = schoolIdentity?.logoUrl || '/assets/aistudio/1793675145730_f04991e4.jpg';
  const schoolNameAr = schoolIdentity?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي';
  const schoolNameEn = schoolIdentity?.schoolNameEn || headerConfig.schoolNameEn || 'QAFLAH SCHOOL';
  const countryAr = schoolIdentity?.countryTitleAr || 'الجمهورية اليمنية';
  const ministryAr = schoolIdentity?.ministryTitleAr || 'وزارة التربية والتعليم';
  const countryEn = schoolIdentity?.countryTitleEn || 'Republic of Yemen';
  const ministryEn = schoolIdentity?.ministryTitleEn || 'Ministry of Education';

  // Strict single-language resolution: English ONLY for English subject, Arabic for all Arabic subjects.
  const inferredIsEnglish =
    headerConfig.headerLanguage === 'en' ||
    subjectId === 'subj-en' ||
    (headerConfig.headerLanguage === 'bilingual' &&
      /\benglish\b/i.test(`${headerConfig.subjectEn || ''} ${headerConfig.subject || ''}`));

  const isPureEnglish = inferredIsEnglish;
  const mainDir: 'rtl' | 'ltr' = isPureEnglish ? 'ltr' : 'rtl';
  const langKey = isPureEnglish ? 'en' : 'ar';

  const isCompact = compact || Boolean(headerConfig.headerCompact);
  const isBw = printColorMode === 'bw';

  const showTeacher =
    headerConfig.showTeacherName !== undefined
      ? headerConfig.showTeacherName
      : schoolIdentity?.defaultShowTeacherName ?? true;

  const displayTeacher = headerConfig.teacherName || teacherName || '';

  const logoDimensions =
    logoSize === 'sm' || isCompact
      ? 'w-11 h-11 sm:w-12 sm:h-12'
      : logoSize === 'lg'
      ? 'w-16 h-16 sm:w-20 sm:h-20'
      : 'w-13 h-13 sm:w-16 sm:h-16';

  const borderMain = isBw ? 'border-slate-900' : 'border-[#1B5E3A]';
  const accentText = isBw ? 'text-slate-950' : 'text-[#1B5E3A]';
  const softHeaderBg = isBw ? 'bg-slate-100' : 'bg-[#1B5E3A]/[0.05]';
  const badgeBg = isBw
    ? 'bg-slate-900 text-white'
    : isAnswerKeyView
    ? 'bg-purple-800 text-white'
    : 'bg-[#1B5E3A] text-white';

  const displayTitle = isPureEnglish
    ? cleanSingleLanguageText(examTitle || examTitleAr, 'en') || 'Examination Paper'
    : cleanSingleLanguageText(examTitleAr || examTitle, 'ar') || 'ورقة اختبار';

  const displaySubject = isPureEnglish
    ? cleanSingleLanguageText(headerConfig.subjectEn || headerConfig.subject, 'en') || 'English Language'
    : cleanSingleLanguageText(headerConfig.subject || headerConfig.subjectEn, 'ar') || 'المادة';

  const displayGrade = formatGradeForPaperLanguage(grade, langKey);
  const displayTerm = formatTermForPaperLanguage(term, langKey);
  const displayDate = examDate || headerConfig.examDate || '';
  const displayCategory = isPureEnglish
    ? cleanSingleLanguageText(examCategoryLabel || headerConfig.examTypeLabel, 'en') || 'School Examination'
    : cleanSingleLanguageText(examCategoryLabel || headerConfig.examTypeLabel, 'ar') || 'اختبار مدرسي';

  const displayTime = isPureEnglish
    ? cleanSingleLanguageText(headerConfig.timeLimit, 'en') || `${timeLimitMinutes} Minutes`
    : cleanSingleLanguageText(headerConfig.timeLimit, 'ar') || `${timeLimitMinutes} دقيقة`;

  return (
    <div
      dir={mainDir}
      className={`official-school-header border-2 ${borderMain} rounded-lg bg-white avoid-break-inside overflow-hidden ${
        isCompact ? 'p-2 sm:p-2.5 mb-2.5 space-y-1.5' : 'p-2.5 sm:p-4 mb-4 sm:mb-5 space-y-2.5'
      } ${isBw ? 'grayscale print:grayscale' : ''}`}
    >
      {/* Top Official Identity Banner (Strictly Pure Single Language Matching Subject) */}
      <div
        className={`flex items-center justify-between gap-2 sm:gap-3 pb-2 border-b ${
          isBw ? 'border-slate-400' : 'border-[#1B5E3A]/30'
        }`}
      >
        {/* Start Block: Official Country / Ministry / School */}
        {isPureEnglish ? (
          <div className="text-left space-y-0.5 font-english text-[9px] sm:text-xs min-w-0 flex-1" dir="ltr">
            <div className="font-bold uppercase tracking-wider text-slate-900 leading-tight break-words">
              {countryEn}
            </div>
            <div className="font-semibold text-slate-700 leading-tight">{ministryEn}</div>
            <div className={`font-extrabold ${accentText} leading-tight break-words`}>{schoolNameEn}</div>
          </div>
        ) : (
          <div className="text-right space-y-0.5 font-arabic text-[9px] sm:text-xs min-w-0 flex-1" dir="rtl">
            <div className="font-bold text-slate-900 leading-tight">{countryAr}</div>
            <div className="font-semibold text-slate-700 leading-tight">{ministryAr}</div>
            <div className={`font-extrabold ${accentText} leading-tight`}>{schoolNameAr}</div>
          </div>
        )}

        {/* Center Logo & Exam Title Badge */}
        <div className="px-1 sm:px-3 shrink-0 flex flex-col items-center text-center max-w-[46%]">
          {headerConfig.showSchoolLogo !== false && (
            <div
              className={`${logoDimensions} rounded-xl border ${
                isBw ? 'border-slate-800' : 'border-[#1B5E3A]/30'
              } bg-white overflow-hidden flex items-center justify-center p-0.5 shadow-2xs`}
            >
              <img
                src={logoSrc}
                alt={isPureEnglish ? schoolNameEn : schoolNameAr}
                className="w-full h-full object-contain"
              />
            </div>
          )}
          <div
            className={`mt-1 px-2.5 py-0.5 rounded font-extrabold text-[9px] sm:text-[11px] leading-tight break-words ${badgeBg}`}
          >
            {isAnswerKeyView
              ? isPureEnglish
                ? 'TEACHER MODEL ANSWER KEY'
                : 'نموذج إجابة المعلم'
              : displayTitle}
          </div>
        </div>

        {/* End Block: Academic Metadata Summary (Single Language — No Duplicate Parallel Translation) */}
        {isPureEnglish ? (
          <div className="text-right space-y-0.5 font-english text-[9px] sm:text-xs min-w-0 flex-1" dir="ltr">
            <div className={`font-extrabold ${accentText} leading-tight`}>{displaySubject}</div>
            <div className="font-semibold text-slate-700 leading-tight">{displayCategory}</div>
            <div className="font-bold text-slate-900 leading-tight">
              Year: {headerConfig.academicYear || '2026 / 2027'}
            </div>
          </div>
        ) : (
          <div className="text-left space-y-0.5 font-arabic text-[9px] sm:text-xs min-w-0 flex-1" dir="rtl">
            <div className={`font-extrabold ${accentText} leading-tight`}>{displaySubject}</div>
            <div className="font-semibold text-slate-700 leading-tight">{displayCategory}</div>
            <div className="font-bold text-slate-900 leading-tight">
              العام الدراسي: {headerConfig.academicYear || '2026 / 2027'}
            </div>
          </div>
        )}
      </div>

      {/* Exam Academic Metadata Grid (Balanced, No Section/Seat No) */}
      <div
        className={`grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 rounded px-2.5 py-1.5 border ${
          isBw ? 'border-slate-300' : 'border-[#1B5E3A]/20'
        } ${softHeaderBg} ${isCompact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'}`}
      >
        <div className="min-w-0 break-words leading-snug">
          <span className="font-bold text-slate-600">{isPureEnglish ? 'Subject: ' : 'المادة: '}</span>
          <span className="font-extrabold text-slate-950">{displaySubject}</span>
        </div>

        <div className="min-w-0 break-words leading-snug">
          <span className="font-bold text-slate-600">{isPureEnglish ? 'Grade: ' : 'الصف الدراسي: '}</span>
          <span className="font-extrabold text-slate-950">{displayGrade}</span>
        </div>

        <div className="min-w-0 break-words leading-snug">
          <span className="font-bold text-slate-600">{isPureEnglish ? 'Term: ' : 'الفصل: '}</span>
          <span className="font-bold text-slate-950">{displayTerm}</span>
        </div>

        <div className="min-w-0 break-words leading-snug">
          <span className="font-bold text-slate-600">{isPureEnglish ? 'Time: ' : 'الزمن: '}</span>
          <span className="font-extrabold text-slate-950">{displayTime}</span>
        </div>

        <div className="min-w-0 break-words leading-snug">
          <span className="font-bold text-slate-600">{isPureEnglish ? 'Total Marks: ' : 'الدرجة الكلية: '}</span>
          <span className={`font-extrabold ${accentText} tabular-nums`}>
            {totalMarks} {isPureEnglish ? (totalMarks === 1 ? 'Mark' : 'Marks') : 'درجة'}
          </span>
        </div>

        <div className="min-w-0 break-words leading-snug">
          {showTeacher && displayTeacher ? (
            <>
              <span className="font-bold text-slate-600">{isPureEnglish ? 'Teacher: ' : 'المعلم/ـة: '}</span>
              <span className="font-bold text-slate-950">{displayTeacher}</span>
            </>
          ) : (
            <>
              <span className="font-bold text-slate-600">{isPureEnglish ? 'Date: ' : 'التاريخ: '}</span>
              <span className="font-bold text-slate-950 tabular-nums">
                {displayDate || '____ / ____ / 202_'}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Student Fill-in Information Strip (Balanced 3-field row: Student Name, Grade, Date — NO الشعبة or رقم الجلوس) */}
      <div
        className={`grid grid-cols-1 sm:grid-cols-12 gap-x-3 gap-y-1.5 pt-0.5 font-semibold text-slate-900 ${
          isCompact ? 'text-[9px] sm:text-[10px]' : 'text-[10px] sm:text-xs'
        }`}
      >
        <div className="sm:col-span-6 flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-bold">{isPureEnglish ? 'Student Name:' : 'اسم الطالب/ـة:'}</span>
          <span className="flex-1 border-b border-dotted border-slate-700 h-3.5" />
        </div>
        <div className="sm:col-span-3 flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-bold">{isPureEnglish ? 'Grade:' : 'الصف:'}</span>
          <span className="flex-1 border-b border-dotted border-slate-700 text-center font-bold pb-0.5 leading-tight">
            {displayGrade}
          </span>
        </div>
        <div className="sm:col-span-3 flex items-baseline gap-1.5 min-w-0">
          <span className="shrink-0 font-bold">{isPureEnglish ? 'Date:' : 'التاريخ:'}</span>
          <span className="flex-1 border-b border-dotted border-slate-700 text-center tabular-nums whitespace-nowrap pb-0.5 leading-tight">
            {displayDate || '   /   /   '}
          </span>
        </div>
      </div>
    </div>
  );
};
