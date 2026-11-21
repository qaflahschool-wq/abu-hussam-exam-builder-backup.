export type UserRole = 'PlatformOwner' | 'SchoolAdmin' | 'Teacher' | 'Administrator';

export type AccountStatus =
  | 'ACTIVE'
  | 'PENDING_APPROVAL'
  | 'NEEDS_EDIT'
  | 'REJECTED'
  | 'SUSPENDED';

export type SecuritySeverity = 'INFO' | 'WARNING' | 'HIGH' | 'CRITICAL';

export type AuditCategory =
  | 'AUTH'
  | 'REGISTRATION'
  | 'SECURITY'
  | 'EXAM'
  | 'QUESTION'
  | 'ADMIN'
  | 'AI'
  | 'BACKUP';

export interface SchoolAdminPermissions {
  canManageTeachers: boolean;
  canManageSubjects: boolean;
  canManageIdentity: boolean;
  canManageCurricula: boolean;
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  status?: AccountStatus;
  hasAIAccess: boolean;
  assignedSubjects?: string[]; // Subject IDs or ['all']
  assignedGrades?: string[]; // Grade IDs/names or ['all']
  email?: string;
  phone?: string;
  school: string;
  registrationRequestId?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNotes?: string;
  delegatedPermissions?: SchoolAdminPermissions;
  failedLoginAttempts?: number;
  lockedUntil?: string;
  lastLoginAt?: string;
  lastActivityAt?: string;
  createdAt: string;
}

export interface RegistrationRequest {
  id: string;
  fullName: string;
  username: string;
  requestedRole: 'Teacher' | 'SchoolAdmin';
  assignedSubjects: string[];
  assignedGrades: string[];
  phone?: string;
  notes?: string;
  status: 'PENDING_APPROVAL' | 'NEEDS_EDIT' | 'APPROVED' | 'REJECTED';
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
  approvedUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationItem {
  id: string;
  recipientScope: 'OWNER' | 'SCHOOL_ADMIN' | 'USER';
  recipientUserId?: string;
  category: 'REGISTRATION' | 'AUTH' | 'SECURITY' | 'ADMIN' | 'EXAM';
  severity: SecuritySeverity;
  eventType: string;
  title: string;
  message: string;
  actorUserId?: string;
  actorName?: string;
  actorRole?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  reason?: string;
  readBy: string[];
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userId: string;
  actorName?: string;
  actorRole?: string;
  action: string;
  category?: AuditCategory;
  severity?: SecuritySeverity;
  details: string;
  subjectId?: string;
  examId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  result?: 'SUCCESS' | 'BLOCKED' | 'ERROR';
  reason?: string;
  prevHash?: string;
  entryHash?: string;
}

export interface Subject {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  defaultDirection: 'rtl' | 'ltr';
  isActive: boolean;
  sortOrder?: number;
  isCore?: boolean;
  isQuran?: boolean;
  description?: string;
  createdAt: string;
}

export interface SchoolIdentitySettings {
  schoolNameAr: string;
  schoolNameEn: string;
  countryTitleAr: string;
  countryTitleEn: string;
  ministryTitleAr: string;
  ministryTitleEn: string;
  logoUrl: string;
  primaryColor: string;
  defaultAcademicYear: string;
  defaultTerm: string;
  defaultShowTeacherName: boolean;
  defaultHeaderLanguage: 'ar' | 'en' | 'bilingual';
  defaultHeaderCompact: boolean;
  footerNoteAr: string;
  footerNoteEn: string;
  updatedAt?: string;
}

export type GradeLevel =
  | 'Grade 1'
  | 'Grade 2'
  | 'Grade 3'
  | 'Grade 4'
  | 'Grade 5'
  | 'Grade 6'
  | 'Grade 7'
  | 'Grade 8'
  | 'Grade 9'
  | string;

export interface CurriculumLesson {
  id: string;
  unitId: string;
  lessonNumber: number;
  title: string;
  titleAr: string;
  vocabulary: string[];
  grammarPoints: string[];
  readingTopic?: string;
  skills: string[];
}

export interface CurriculumUnit {
  id: string;
  grade: GradeLevel;
  subjectId?: string;
  unitNumber: number;
  title: string;
  titleAr: string;
  description: string;
  lessons: CurriculumLesson[];
}

export type QuestionType =
  | 'Multiple Choice'
  | 'True or False'
  | 'Complete the Sentences'
  | 'Matching'
  | 'Fill in the Blanks'
  | 'Rearrange the Words'
  | 'Reading Comprehension'
  | 'Vocabulary'
  | 'Grammar'
  | 'Translation'
  | 'Short Answer'
  | 'Writing'
  | 'Essay'
  | 'Term Definition'
  | 'Mathematical Problem'
  | 'Table Diagram'
  | 'Image Question'
  | 'Quran Recitation'
  | 'Quran Verse Completion'
  | 'Quran Meaning'
  | 'Quran Tafsir'
  | 'Custom';

export type DifficultyLevel = 'Easy' | 'Medium' | 'Hard' | 'Balanced';

export type QuestionSourceCode =
  | 'CURRICULUM' // المنهج المدرسي: مرتبط مباشرة بالكتاب
  | 'ENRICHMENT' // إثرائي: مستمد من معرفة أو مراجع إضافية
  | 'FOUNDATION' // تأسيسي: لمعالجة ضعف الطلاب
  | 'APPLICATION' // تطبيقي: يقيس استخدام المعرفة في سياقات واقعية
  | 'CHALLENGE' // تحدٍّ: يقيس الفهم المتقدم والتفكير الناقد
  | 'IMAGE_SOURCE' // مستخرج من صورة (لصاحب المنصة فقط)
  | 'TEACHER_MANUAL'; // إعداد المعلم اليدوي

export type EducationalLevel =
  | 'FOUNDATION'
  | 'BASIC'
  | 'INTERMEDIATE'
  | 'ADVANCED';

export type ContentScope =
  | 'CURRICULUM_ONLY'
  | 'CURRICULUM_ENRICHMENT'
  | 'ENRICHMENT_ONLY'
  | 'IMAGE_ONLY'
  | 'IMAGES_ONLY'
  | 'IMAGE_CURRICULUM'
  | 'IMAGES_CURRICULUM'
  | 'IMAGE_CURRICULUM_ENRICHMENT'
  | 'IMAGES_CURRICULUM_ENRICHMENT'
  | 'FOUNDATION_REMEDIAL'
  | 'BALANCED_COMPREHENSIVE';

export type ExamCategory =
  | 'Quiz' // الاختبار القصير
  | 'Daily' // الاختبار اليومي
  | 'Weekly' // الاختبار الأسبوعي
  | 'Monthly' // الاختبار الشهري
  | 'Midterm' // اختبار منتصف الفصل
  | 'Final' // امتحان نهاية الفصل
  | 'Diagnostic' // الاختبار التشخيصي
  | 'Remedial' // الاختبار العلاجي
  | 'Practice' // الاختبار التجريبي
  | 'Revision'; // المراجعة

export interface QuestionFormatting {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  align?: 'left' | 'right' | 'center' | 'justify';
  dir?: 'rtl' | 'ltr' | 'auto';
  fontSizeScale?: number; // e.g., 0.9, 1, 1.1, 1.25
  listStyle?: 'none' | 'bullet' | 'number';
}

export interface QuestionTableData {
  headers: string[];
  rows: string[][];
  caption?: string;
}

export interface ExamShareEntry {
  userId: string;
  userName?: string;
  permission: 'view' | 'edit';
  grantedBy: string;
  grantedAt: string;
}

export interface Question {
  id: string;
  ownerId?: string;
  subjectId?: string;
  subjectName?: string;
  grade: GradeLevel;
  unitId: string;
  unitTitle?: string;
  lessonId?: string;
  lessonTitle?: string;
  type: QuestionType;
  difficulty: DifficultyLevel;
  marks: number;
  questionText: string;
  instructions?: string;
  options?: string[]; // For Multiple Choice / True-False
  matchingPairs?: { left: string; right: string }[]; // For Matching
  passage?: string; // For Reading Comprehension
  scrambledWords?: string[]; // For Rearrange
  mathFormula?: string; // For Mathematical Problems / Scientific notations
  tableData?: QuestionTableData; // For Tables & Diagrams
  imageDataUrl?: string; // Legacy/local image data URL during migration
  imageStorageId?: string; // Private Cloudflare R2 object reference
  imageCaption?: string;
  imageWidthPercent?: number;
  answerSpaceLines?: number; // 0..10 lines for student answer space
  pageBreakBefore?: boolean; // Force this question to start on a new page
  pageBreakAfter?: boolean; // Force a page break after this question
  keepTogether?: boolean; // Keep stem + options + table + image together on the same page
  surahName?: string; // For Quran subject: Surah name (preserved verbatim)
  ayahRange?: string; // For Quran subject: Ayah numbers
  preserveDiacritics?: boolean; // Never auto-alter tashkeel / Uthmani script
  formatting?: QuestionFormatting;
  modelAnswer: string;
  gradingNotes?: string; // Teacher grading rubric / notes (Teacher Answer Key only)
  explanation?: string;
  source: 'Ministry Curriculum' | 'Question Bank' | 'Gemini AI' | 'Teacher Manual' | string;
  sourceCode?: QuestionSourceCode;
  educationalLevel?: EducationalLevel;
  grammarCategory?: string;
  skillsTargeted?: string[];
  imageReferenceId?: string;
  sourceFidelityScore?: number;
  relationshipAccuracy?: number;
  answerGroundingScore?: number;
  contextAccuracy?: number;
  semanticConsistencyScore?: number;
  requiresTeacherReview?: boolean;
  teacherReviewReason?: string;
  originalQuestionText?: string;
  fidelityBreakdown?: {
    entityAccuracy: number;
    relationshipAccuracy: number;
    contextAccuracy: number;
    answerGrounding: number;
    semanticConsistency: number;
  };
  groundedEntities?: string[];
  fidelityWarning?: string;
  isVerifiedByTeacher?: boolean;
  sharedWith?: ExamShareEntry[];
  createdAt: string;
  updatedAt?: string;
}

export interface SemanticFidelityReport {
  score: number;
  passed: boolean;
  reclassified: boolean;
  requiresTeacherReview: boolean;
  teacherReviewReason?: string;
  warning?: string;
  acceptanceReason: string;
  groundedEntities: string[];
  foreignEntities: string[];
  relationalPairsFound: { subject: string; action: string; verified: boolean; expectedAction?: string }[];
  metrics: {
    entityAccuracy: number;
    relationshipAccuracy: number;
    contextAccuracy: number;
    answerGrounding: number;
    semanticConsistency: number;
  };
  originalQuestion?: Question;
  validatedQuestion: Question;
}

export interface ExamSection {
  id: string;
  sectionTitle: string;
  instructions: string;
  questionType: QuestionType;
  marks: number;
  startOnNewPage?: boolean;
  pageBreakAfter?: boolean;
  questions: Question[];
}

export interface ExamHeaderConfig {
  countryTitle: string;
  ministryTitle: string;
  schoolName: string;
  schoolNameEn?: string;
  subject: string;
  subjectEn?: string;
  grade: GradeLevel;
  sectionClass?: string; // الشعبة: أ، ب، ج
  term: string;
  academicYear: string;
  examDate?: string; // تاريخ الاختبار
  examPeriod?: string; // الشهر أو الفترة الامتحانية
  examTypeLabel?: string; // نوع الاختبار
  teacherName?: string;
  showTeacherName?: boolean;
  timeLimit: string;
  totalMarks: number;
  showSchoolLogo: boolean;
  headerLanguage?: 'ar' | 'en' | 'bilingual';
  headerCompact?: boolean;
  notes: string;
}

export type ExamLayoutPreset =
  | 'AUTO'
  | 'A4_PORTRAIT'
  | 'A4_LANDSCAPE'
  | 'ONE_PAGE'
  | 'TWO_PAGES'
  | 'MULTI_PAGE'
  | 'CUSTOM';

export type PageBorderMode = 'none' | 'full' | 'top_bottom' | 'left_right';
export type PageBorderStyle = 'solid' | 'double' | 'dashed';
export type PaginationMode = 'auto' | 'one_page' | 'two_pages' | 'multi_page';
export type FontFamilyOption = 'cairo' | 'amiri' | 'inter' | 'system';

export interface ExamLayoutConfig {
  preset: ExamLayoutPreset;
  paginationMode?: PaginationMode;
  paperSize?: 'A4';
  orientation: 'portrait' | 'landscape';
  columns: 1 | 2;
  columnGapPx?: number;
  marginTopMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  marginRightMm: number;
  borderMode?: PageBorderMode;
  borderColor?: string;
  borderWidthPx?: number;
  borderStyle?: PageBorderStyle;
  borderPaddingMm?: number;
  showSafeAreaGuide?: boolean;
  fontFamily?: FontFamilyOption;
  fontSizePt: number; // enforced >= 9.5pt for legibility
  headingScale?: number; // 0.85 .. 1.3
  lineHeight: number;
  questionGapPx: number;
  sectionGapPx: number;
  globalAlign?: 'auto' | 'right' | 'left' | 'center' | 'justify';
  globalDirection?: 'auto' | 'rtl' | 'ltr';
  defaultAnswerSpaceLines?: number;
  marksPlacement?: 'inline_end' | 'below_question';
  sectionNumbering?: 'auto' | 'numeric' | 'alpha' | 'arabic_alpha' | 'none';
  questionNumbering?: 'numeric' | 'arabic_alpha' | 'none';
  keepQuestionsTogether?: boolean;
  repeatHeaderOnPages?: boolean;
  logoSize: 'sm' | 'md' | 'lg';
  headerCompact: boolean;
  showPageNumbers: boolean;
  printColorMode: 'color' | 'bw';
}

export interface LayoutTemplate {
  id: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  nameAr: string;
  description?: string;
  isBuiltIn?: boolean;
  layoutConfig: ExamLayoutConfig;
  createdAt: string;
  updatedAt?: string;
}

export interface QualityValidationReport {
  passed: boolean;
  score: number;
  checks: {
    id: string;
    title: string;
    passed: boolean;
    details: string;
  }[];
  warnings: string[];
  suggestions: string[];
}

export interface Exam {
  id: string;
  ownerId?: string;
  subjectId?: string;
  code: string;
  title: string;
  titleAr: string;
  grade: GradeLevel;
  sectionClass?: string;
  term: string;
  examDate?: string;
  examPeriod?: string;
  category: ExamCategory;
  totalMarks: number;
  timeLimitMinutes: number;
  difficulty: DifficultyLevel;
  contentScope?: ContentScope;
  instructionsLanguage: 'Arabic' | 'English' | 'Bilingual';
  headerConfig: ExamHeaderConfig;
  layoutConfig?: ExamLayoutConfig;
  sections: ExamSection[];
  qualityReport?: QualityValidationReport;
  sharedWith?: ExamShareEntry[];
  sharingEnabled?: boolean;
  status: 'Draft' | 'Validated' | 'Approved' | 'Archived';
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export interface AISettingsState {
  apiKeyConfigured: boolean;
  primaryModel: string;
  fallbackModel: string;
  allowPaidModels: boolean;
  temperature: number;
  totalRequests: number;
  lastTestSuccess?: boolean;
  lastTestedAt?: string;
  activeStatus: 'Connected' | 'Error' | 'Standby';
}

export interface AIUsageLog {
  id: string;
  timestamp: string;
  operation: string;
  model: string;
  status: 'SUCCESS' | 'ERROR';
  tokensUsed?: number;
  promptSnippet: string;
  errorMessage?: string;
  durationMs: number;
}

// ==================== IMAGE ANALYZER & MULTIMODAL TYPES ====================

export interface UploadedImageItem {
  id: string;
  dataUrl: string;
  name: string;
  size?: number;
  sizeKb?: number;
  mimeType: string;
  order?: number;
  thumbnailUrl?: string;
}

export interface GrammarConceptExtracted {
  title?: string;
  concept?: string;
  arabicName?: string;
  explanation?: string;
  explanationEn?: string;
  explanationAr?: string;
  ruleFormula?: string;
  ruleType?: string;
  examples: string[];
  commonMistakes?: string[];
}

export interface VocabularyItemExtracted {
  word: string;
  meaningAr?: string;
  arabicTranslation?: string;
  partOfSpeech?: string;
  exampleSentence?: string;
  phoneticHint?: string;
}

export interface DiscoveredExerciseExtracted {
  exerciseType?: string;
  type?: string;
  prompt?: string;
  instructions?: string;
  rawItems?: string[];
  items?: { itemText: string; answer: string }[];
  suggestedAnswers?: string[];
}

export interface ImageQualityReport {
  legible?: boolean;
  score?: number;
  lightingStatus?: 'Good' | 'Dim' | 'Shadowed' | 'Overexposed';
  handwritingDetected: boolean;
  blurDetected?: boolean;
  cutoffDetected?: boolean;
  unreadableNotes?: string[];
  illegibleSegments?: string[];
  warnings?: string[];
  notes?: string;
}

export interface ExtractedAnalysisResult {
  documentTitle?: string;
  detectedTopic?: string;
  suggestedGrade: GradeLevel;
  suggestedUnitTitle?: string;
  suggestedUnits?: string[];
  rawExtractedText?: string;
  rawText?: string;
  grammarConcepts: GrammarConceptExtracted[];
  vocabularyItems?: VocabularyItemExtracted[];
  vocabulary?: VocabularyItemExtracted[];
  discoveredExercises?: DiscoveredExerciseExtracted[];
  readingPassages?: ({ title: string; text: string } | string)[];
  extractedEntities?: {
    characters?: string[];
    locations?: string[];
    actions?: string[];
    relations?: { subject: string; relation: string; object: string }[];
  };
  imageQualityReport?: ImageQualityReport;
  qualityReport?: ImageQualityReport;
  analyzedAt?: string;
  modelUsed?: string;
}

export interface AnalyzedDocument {
  id: string;
  ownerId?: string;
  title: string;
  grade: GradeLevel;
  unitTitle?: string;
  topic?: string;
  lessonFocus?: string;
  images?: UploadedImageItem[];
  uploadedImages?: UploadedImageItem[];
  analysis: ExtractedAnalysisResult;
  teacherNotes?: string;
  tags?: string[];
  generatedQuestions?: Question[];
  status?: 'ANALYZED' | 'REVIEWED' | 'CONVERTED_TO_EXAM';
  createdAt: string;
  updatedAt: string;
}
