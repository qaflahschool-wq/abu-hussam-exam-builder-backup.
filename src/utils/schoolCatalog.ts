import { Subject, User } from '../types/index.ts';

export interface GradeCatalogEntry {
  value: string;
  order: number;
  labelAr: string;
  labelArFull: string;
  labelEn: string;
}

export const BASIC_GRADE_CATALOG: GradeCatalogEntry[] = [
  { value: 'Grade 1', order: 1, labelAr: 'الصف الأول', labelArFull: 'الصف الأول الأساسي', labelEn: 'Grade 1' },
  { value: 'Grade 2', order: 2, labelAr: 'الصف الثاني', labelArFull: 'الصف الثاني الأساسي', labelEn: 'Grade 2' },
  { value: 'Grade 3', order: 3, labelAr: 'الصف الثالث', labelArFull: 'الصف الثالث الأساسي', labelEn: 'Grade 3' },
  { value: 'Grade 4', order: 4, labelAr: 'الصف الرابع', labelArFull: 'الصف الرابع الأساسي', labelEn: 'Grade 4' },
  { value: 'Grade 5', order: 5, labelAr: 'الصف الخامس', labelArFull: 'الصف الخامس الأساسي', labelEn: 'Grade 5' },
  { value: 'Grade 6', order: 6, labelAr: 'الصف السادس', labelArFull: 'الصف السادس الأساسي', labelEn: 'Grade 6' },
  { value: 'Grade 7', order: 7, labelAr: 'الصف السابع', labelArFull: 'الصف السابع الأساسي', labelEn: 'Grade 7' },
  { value: 'Grade 8', order: 8, labelAr: 'الصف الثامن', labelArFull: 'الصف الثامن الأساسي', labelEn: 'Grade 8' },
  { value: 'Grade 9', order: 9, labelAr: 'الصف التاسع', labelArFull: 'الصف التاسع الأساسي', labelEn: 'Grade 9' },
];

export const ALL_BASIC_GRADE_VALUES: string[] = BASIC_GRADE_CATALOG.map((g) => g.value);

export const CORE_SUBJECT_ORDER: Record<string, number> = {
  'subj-quran': 1,
  'subj-isl': 2,
  'subj-ar': 3,
  'subj-sci': 4,
  'subj-soc': 5,
  'subj-en': 6,
  'subj-math': 7,
  'subj-cs': 8,
};

export const CORE_SIX_SUBJECT_IDS: string[] = [
  'subj-quran',
  'subj-isl',
  'subj-ar',
  'subj-sci',
  'subj-soc',
  'subj-en',
];

export function sortSubjectsCanonical(subjects: Subject[]): Subject[] {
  return [...subjects].sort((a, b) => {
    const orderA = CORE_SUBJECT_ORDER[a.id] ?? a.sortOrder ?? 99;
    const orderB = CORE_SUBJECT_ORDER[b.id] ?? b.sortOrder ?? 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.nameAr.localeCompare(b.nameAr, 'ar');
  });
}

export function getAuthorizedSubjectsForUser(subjects: Subject[], user: User | null | undefined): Subject[] {
  const activeSorted = sortSubjectsCanonical(subjects.filter((s) => s.isActive));
  if (!user) return activeSorted;

  const isUnrestrictedRole =
    user.role === 'PlatformOwner' ||
    user.role === 'Administrator' ||
    user.role === 'SchoolAdmin';

  if (
    isUnrestrictedRole ||
    !Array.isArray(user.assignedSubjects) ||
    user.assignedSubjects.length === 0 ||
    user.assignedSubjects.includes('all')
  ) {
    return activeSorted;
  }

  const allowed = activeSorted.filter((s) => user.assignedSubjects!.includes(s.id));
  return allowed.length > 0 ? allowed : activeSorted;
}

export function getAuthorizedGradesForUser(user: User | null | undefined): GradeCatalogEntry[] {
  if (!user) return BASIC_GRADE_CATALOG;

  const isUnrestrictedRole =
    user.role === 'PlatformOwner' ||
    user.role === 'Administrator' ||
    user.role === 'SchoolAdmin';

  if (
    isUnrestrictedRole ||
    !Array.isArray(user.assignedGrades) ||
    user.assignedGrades.length === 0 ||
    user.assignedGrades.includes('all')
  ) {
    return BASIC_GRADE_CATALOG;
  }

  const filtered = BASIC_GRADE_CATALOG.filter((g) => user.assignedGrades!.includes(g.value));
  return filtered.length > 0 ? filtered : BASIC_GRADE_CATALOG;
}

export function getGradeLabelAr(gradeValue?: string): string {
  const clean = String(gradeValue || '').trim();
  const matched = BASIC_GRADE_CATALOG.find(
    (g) => g.value === clean || g.labelAr === clean || g.labelArFull === clean
  );
  return matched ? matched.labelAr : clean;
}
