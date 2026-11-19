import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import {
  User,
  UserRole,
  Subject,
  SchoolIdentitySettings,
  CurriculumUnit,
  Question,
  Exam,
  AISettingsState,
  AIUsageLog,
  AnalyzedDocument,
  RegistrationRequest,
  NotificationItem,
  AuditLogEntry,
  AuditCategory,
  SecuritySeverity,
  LayoutTemplate,
} from '../src/types/index.js';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

export type StoredRegistrationRequest = RegistrationRequest & { passwordHash: string };

export interface DatabaseSchema {
  users: (User & { passwordHash: string })[];
  registrationRequests: StoredRegistrationRequest[];
  notifications: NotificationItem[];
  subjects: Subject[];
  schoolSettings: SchoolIdentitySettings;
  curricula: CurriculumUnit[];
  questions: Question[];
  exams: Exam[];
  archive: Exam[];
  layoutTemplates: LayoutTemplate[];
  analyzedDocuments: AnalyzedDocument[];
  aiSettings: AISettingsState;
  aiUsageLogs: AIUsageLog[];
  auditLogs: AuditLogEntry[];
  migrations?: {
    subjectsAndGradesV2?: boolean;
  };
}

export const ALL_BASIC_GRADES: string[] = [
  'Grade 1',
  'Grade 2',
  'Grade 3',
  'Grade 4',
  'Grade 5',
  'Grade 6',
  'Grade 7',
  'Grade 8',
  'Grade 9',
];

export const CORE_SIX_SUBJECT_IDS: string[] = [
  'subj-quran',
  'subj-isl',
  'subj-ar',
  'subj-sci',
  'subj-soc',
  'subj-en',
];

const CORE_SUBJECT_ORDER: Record<string, number> = {
  'subj-quran': 1,
  'subj-isl': 2,
  'subj-ar': 3,
  'subj-sci': 4,
  'subj-soc': 5,
  'subj-en': 6,
  'subj-math': 7,
  'subj-cs': 8,
};

const DEFAULT_SUBJECTS: Subject[] = [
  {
    id: 'subj-quran',
    code: 'QRN',
    nameAr: 'القرآن الكريم',
    nameEn: 'Quran',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 1,
    isCore: true,
    isQuran: true,
    description: 'الحفظ والتسميع والتلاوة وإكمال الآيات ومعاني المفردات والتفسير (مع الحفاظ التام على التشكيل والرسم)',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-isl',
    code: 'ISL',
    nameAr: 'التربية الإسلامية',
    nameEn: 'Islamic Education',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 2,
    isCore: true,
    description: 'الحديث الشريف والفقه والسيرة النبوية والعقيدة والتهذيب',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-ar',
    code: 'ARB',
    nameAr: 'اللغة العربية',
    nameEn: 'Arabic Language',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 3,
    isCore: true,
    description: 'النحو والصرف والقراءة والنصوص والإملاء والتعبير',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-sci',
    code: 'SCI',
    nameAr: 'العلوم',
    nameEn: 'Science',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 4,
    isCore: true,
    description: 'العلوم العامة والفيزياء والكيمياء والأحياء المدرسية',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-soc',
    code: 'SOC',
    nameAr: 'الاجتماعيات',
    nameEn: 'Social Studies',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 5,
    isCore: true,
    description: 'التاريخ والجغرافيا والتربية الوطنية',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-en',
    code: 'ENG',
    nameAr: 'اللغة الإنجليزية',
    nameEn: 'English Language',
    defaultDirection: 'ltr',
    isActive: true,
    sortOrder: 6,
    isCore: true,
    description: 'Crescent English Course for Yemen (Grades 7-9)',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-math',
    code: 'MTH',
    nameAr: 'الرياضيات',
    nameEn: 'Mathematics',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 7,
    isCore: false,
    description: 'الجبر والهندسة والحساب والمعادلات الرياضية',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'subj-cs',
    code: 'CS',
    nameAr: 'الحاسوب',
    nameEn: 'Computer Science',
    defaultDirection: 'rtl',
    isActive: true,
    sortOrder: 8,
    isCore: false,
    description: 'مبادئ الحاسوب وتطبيقاته التقنية',
    createdAt: new Date().toISOString(),
  },
];

function computeAuditEntryHash(prevHash: string, entry: Omit<AuditLogEntry, 'entryHash'>): string {
  const payload = [
    prevHash,
    entry.id,
    entry.timestamp,
    entry.userId,
    entry.action,
    entry.category || 'ADMIN',
    entry.severity || 'INFO',
    entry.details,
    entry.result || 'SUCCESS',
  ].join('|');
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function redactSensitiveText(text: string): string {
  if (!text) return text;
  return text
    .replace(/("?(?:password|passwordHash|token|secret|apiKey|geminiApiKey)"?\s*:\s*)"[^"]*"/gi, '$1"[REDACTED]"')
    .replace(/(Bearer\s+)[A-Za-z0-9\-_.]+/gi, '$1[REDACTED]');
}

const DEFAULT_SCHOOL_SETTINGS: SchoolIdentitySettings = {
  schoolNameAr: 'مدرسة قفلة للتعليم الأساسي',
  schoolNameEn: 'QAFLAH SCHOOL',
  countryTitleAr: 'الجمهورية اليمنية',
  countryTitleEn: 'Republic of Yemen',
  ministryTitleAr: 'وزارة التربية والتعليم',
  ministryTitleEn: 'Ministry of Education',
  logoUrl: '/assets/aistudio/1793675145730_f04991e4.jpg',
  primaryColor: '#1B5E3A',
  defaultAcademicYear: '2026 / 2027',
  defaultTerm: 'الفصل الدراسي الأول',
  defaultShowTeacherName: true,
  defaultHeaderLanguage: 'ar',
  defaultHeaderCompact: false,
  footerNoteAr: 'مدرسة قفلة للتعليم الأساسي – الجمهورية اليمنية',
  footerNoteEn: 'QAFLAH BASIC EDUCATION SCHOOL - YEMEN',
  updatedAt: new Date().toISOString(),
};

// Initial Yemeni Curriculum Dataset
const defaultCurricula: CurriculumUnit[] = [
  // Grade 7
  {
    id: 'g7-u1',
    grade: 'Grade 7',
    unitNumber: 1,
    title: 'Unit 1: Hello & School',
    titleAr: 'الوحدة الأولى: مرحباً والمدرسة',
    description: 'Greetings, the alphabet, classroom objects, numbers 1-20, verb to be.',
    lessons: [
      {
        id: 'g7-u1-l1',
        unitId: 'g7-u1',
        lessonNumber: 1,
        title: 'Greetings & Introductions',
        titleAr: 'التحيات والتعارف',
        vocabulary: ['Hello', 'Good morning', 'Name', 'Teacher', 'Friend'],
        grammarPoints: ['Verb to be (am, is, are)', 'Personal pronouns (I, you, he, she)'],
        skills: ['Speaking', 'Listening'],
      },
      {
        id: 'g7-u1-l2',
        unitId: 'g7-u1',
        lessonNumber: 2,
        title: 'Classroom Objects & Numbers',
        titleAr: 'أدوات الفصل والأرقام',
        vocabulary: ['Book', 'Pen', 'Pencil', 'Desk', 'Board', 'Ruler', 'Bag'],
        grammarPoints: ['Singular and plural nouns (-s)', 'Articles a / an'],
        skills: ['Reading', 'Writing'],
      },
    ],
  },
  {
    id: 'g7-u2',
    grade: 'Grade 7',
    unitNumber: 2,
    title: 'Unit 2: Family and Animals',
    titleAr: 'الوحدة الثانية: العائلة والحيوانات',
    description: 'Family members, pets, farm animals, have got / has got.',
    lessons: [
      {
        id: 'g7-u2-l1',
        unitId: 'g7-u2',
        lessonNumber: 1,
        title: 'My Family',
        titleAr: 'عائلتي',
        vocabulary: ['Father', 'Mother', 'Brother', 'Sister', 'Grandfather', 'Grandmother'],
        grammarPoints: ['Possessive adjectives (my, your, his, her)', "Possessive 's"],
        skills: ['Speaking', 'Reading'],
      },
      {
        id: 'g7-u2-l2',
        unitId: 'g7-u2',
        lessonNumber: 2,
        title: 'Animals in Yemen',
        titleAr: 'الحيوانات في اليمن',
        vocabulary: ['Camel', 'Goat', 'Sheep', 'Horse', 'Cat', 'Dog', 'Bird'],
        grammarPoints: ['Have got / has got (affirmative & negative)', 'Can / cannot for abilities'],
        skills: ['Reading', 'Writing'],
      },
    ],
  },
  {
    id: 'g7-u3',
    grade: 'Grade 7',
    unitNumber: 3,
    title: 'Unit 3: Daily Routine & Time',
    titleAr: 'الوحدة الثالثة: الروتين اليومي والوقت',
    description: 'Telling time, morning and evening habits, present simple tense.',
    lessons: [
      {
        id: 'g7-u3-l1',
        unitId: 'g7-u3',
        lessonNumber: 1,
        title: 'Telling the Time',
        titleAr: 'إخبار الوقت',
        vocabulary: ["O'clock", 'Half past', 'Quarter past', 'Quarter to', 'Morning', 'Evening'],
        grammarPoints: ['Telling the time: What time is it?', 'Prepositions of time: at, in, on'],
        skills: ['Speaking', 'Listening'],
      },
      {
        id: 'g7-u3-l2',
        unitId: 'g7-u3',
        lessonNumber: 2,
        title: 'My Daily Routine',
        titleAr: 'روتيني اليومي',
        vocabulary: ['Wake up', 'Pray', 'Wash', 'Eat breakfast', 'Go to school', 'Do homework'],
        grammarPoints: ['Present Simple with I/we/they/he/she', 'Adverbs of frequency: always, usually, never'],
        skills: ['Reading', 'Writing'],
      },
    ],
  },
  {
    id: 'g7-u4',
    grade: 'Grade 7',
    unitNumber: 4,
    title: 'Unit 4: Food, Drink and Health',
    titleAr: 'الوحدة الرابعة: الطعام والشراب والصحة',
    description: 'Types of food, fruits, vegetables, countable/uncountable, some/any.',
    lessons: [
      {
        id: 'g7-u4-l1',
        unitId: 'g7-u4',
        lessonNumber: 1,
        title: 'Healthy Food in Yemen',
        titleAr: 'الطعام الصحي في اليمن',
        vocabulary: ['Bread', 'Rice', 'Milk', 'Apple', 'Tomato', 'Fish', 'Water', 'Honey'],
        grammarPoints: ['Countable and uncountable nouns', 'Some and any in affirmative/negative/questions'],
        skills: ['Reading', 'Speaking'],
      },
    ],
  },

  // Grade 8
  {
    id: 'g8-u1',
    grade: 'Grade 8',
    unitNumber: 1,
    title: 'Unit 1: Holidays and Travel',
    titleAr: 'الوحدة الأولى: الإجازات والسفر',
    description: 'Holiday trips, transport in Yemen, past simple tense of regular and irregular verbs.',
    lessons: [
      {
        id: 'g8-u1-l1',
        unitId: 'g8-u1',
        lessonNumber: 1,
        title: 'A Visit to Aden & Taiz',
        titleAr: 'زيارة إلى عدن وتعز',
        vocabulary: ['Travel', 'Beach', 'Mountain', 'Hotel', 'Market', 'Souq', 'Journey', 'Ticket'],
        grammarPoints: ['Past Simple regular verbs (-ed)', 'Past time expressions: yesterday, last week, ago'],
        skills: ['Reading', 'Writing'],
      },
      {
        id: 'g8-u1-l2',
        unitId: 'g8-u1',
        lessonNumber: 2,
        title: 'Irregular Past Actions',
        titleAr: 'الأفعال الماضية الشاذة',
        vocabulary: ['Went', 'Saw', 'Ate', 'Bought', 'Took', 'Came', 'Had'],
        grammarPoints: ['Past Simple irregular verbs', 'Did / didn’t for questions and negatives'],
        skills: ['Grammar', 'Speaking'],
      },
    ],
  },
  {
    id: 'g8-u2',
    grade: 'Grade 8',
    unitNumber: 2,
    title: 'Unit 2: Health and First Aid',
    titleAr: 'الوحدة الثانية: الصحة والإسعافات الأولية',
    description: 'Common illnesses, health advice, giving suggestions using should / shouldn’t.',
    lessons: [
      {
        id: 'g8-u2-l1',
        unitId: 'g8-u2',
        lessonNumber: 1,
        title: 'At the Clinic',
        titleAr: 'في العيادة الطبية',
        vocabulary: ['Headache', 'Stomachache', 'Toothache', 'Fever', 'Medicine', 'Doctor', 'Nurse'],
        grammarPoints: ['Giving advice: You should / shouldn’t', 'Have got a headache'],
        skills: ['Dialogue', 'Listening'],
      },
    ],
  },
  {
    id: 'g8-u3',
    grade: 'Grade 8',
    unitNumber: 3,
    title: 'Unit 3: Jobs and Workplaces',
    titleAr: 'الوحدة الثالثة: المهن وأماكن العمل',
    description: 'Occupations, daily responsibilities, present continuous versus present simple.',
    lessons: [
      {
        id: 'g8-u3-l1',
        unitId: 'g8-u3',
        lessonNumber: 1,
        title: 'Jobs in Our Community',
        titleAr: 'الوظائف في مجتمعنا',
        vocabulary: ['Farmer', 'Engineer', 'Carpenter', 'Driver', 'Pilot', 'Hospital', 'Farm', 'Office'],
        grammarPoints: ['Present Continuous (am/is/are + verb-ing)', 'Contrasting routine vs actions now'],
        skills: ['Speaking', 'Reading'],
      },
    ],
  },
  {
    id: 'g8-u5',
    grade: 'Grade 8',
    unitNumber: 5,
    title: 'Unit 5: Town and Country',
    titleAr: 'الوحدة الخامسة: المدينة والريف',
    description: 'Comparing towns and villages, comparatives and superlatives.',
    lessons: [
      {
        id: 'g8-u5-l1',
        unitId: 'g8-u5',
        lessonNumber: 1,
        title: 'Comparing Places in Yemen',
        titleAr: 'مقارنة الأماكن في اليمن',
        vocabulary: ['Modern', 'Ancient', 'Quiet', 'Crowded', 'High', 'Clean', 'Village', 'City'],
        grammarPoints: ['Comparative adjectives (-er than / more ... than)', 'Superlative adjectives (the -est / the most ...)'],
        skills: ['Reading', 'Writing'],
      },
    ],
  },

  // Grade 9
  {
    id: 'g9-u1',
    grade: 'Grade 9',
    unitNumber: 1,
    title: 'Unit 1: People and Places in Yemen',
    titleAr: 'الوحدة الأولى: الناس والأماكن في اليمن',
    description: 'Old Sana’a, Shibam Hadramout, Bab al-Yaman, historical architecture, relative clauses.',
    lessons: [
      {
        id: 'g9-u1-l1',
        unitId: 'g9-u1',
        lessonNumber: 1,
        title: 'Historic Cities of Yemen',
        titleAr: 'مدن اليمن التاريخية',
        vocabulary: ['Architecture', 'Ancient', 'Skyscraper', 'Clay', 'Heritage', 'UNESCO', 'Monument'],
        grammarPoints: ['Relative pronouns: who, which, where', 'Defining relative clauses'],
        skills: ['Reading Comprehension', 'Writing'],
      },
      {
        id: 'g9-u1-l2',
        unitId: 'g9-u1',
        lessonNumber: 2,
        title: 'Describing Yemeni Traditions',
        titleAr: 'وصف التقاليد اليمنية',
        vocabulary: ['Hospitality', 'Coffee', 'Spices', 'Handicrafts', 'Jambiya', 'Silverware'],
        grammarPoints: ['Adjective order', 'Used to + infinitive for past habits'],
        skills: ['Vocabulary', 'Speaking'],
      },
    ],
  },
  {
    id: 'g9-u2',
    grade: 'Grade 9',
    unitNumber: 2,
    title: 'Unit 2: Wildlife and Nature of Yemen',
    titleAr: 'الوحدة الثانية: الحياة البرية والطبيعة في اليمن',
    description: 'Socotra Island, Arabian Leopard, endemic plants, first conditional.',
    lessons: [
      {
        id: 'g9-u2-l1',
        unitId: 'g9-u2',
        lessonNumber: 1,
        title: 'Socotra: The Jewel of Biodiversity',
        titleAr: 'سقطرى: جوهرة التنوع الحيوي',
        vocabulary: ['Dragon Blood Tree', 'Endemic', 'Extinct', 'Protect', 'Island', 'Reserve', 'Species'],
        grammarPoints: ['First Conditional (If + present simple, will + verb)', 'Imperatives for environment conservation'],
        skills: ['Reading Comprehension', 'Critical Thinking'],
      },
    ],
  },
  {
    id: 'g9-u3',
    grade: 'Grade 9',
    unitNumber: 3,
    title: 'Unit 3: Science and Inventions',
    titleAr: 'الوحدة الثالثة: العلوم والاختراعات',
    description: 'Famous Arab & Muslim scientists, technological developments, passive voice.',
    lessons: [
      {
        id: 'g9-u3-l1',
        unitId: 'g9-u3',
        lessonNumber: 1,
        title: 'Great Muslim Scientists',
        titleAr: 'علماء المسلمين العظام',
        vocabulary: ['Optics', 'Algebra', 'Medicine', 'Astronomy', 'Experiment', 'Discovery', 'Invent'],
        grammarPoints: ['Passive Voice in Present and Past Simple (was/were + past participle)'],
        skills: ['Reading', 'Grammar'],
      },
    ],
  },
  {
    id: 'g9-u7',
    grade: 'Grade 9',
    unitNumber: 7,
    title: 'Unit 7: Stories and Life Lessons',
    titleAr: 'الوحدة السابعة: القصص والعِبر',
    description: 'Fables, narrative writing, connecting words, moral of the story.',
    lessons: [
      {
        id: 'g9-u7-l1',
        unitId: 'g9-u7',
        lessonNumber: 1,
        title: 'The Wise Merchant of Aden',
        titleAr: 'تاجر عدن الحكيم',
        vocabulary: ['Honest', 'Merchant', 'Greedy', 'Reward', 'Gold coins', 'Court', 'Judge'],
        grammarPoints: ['Past Continuous vs Past Simple (while / when)', 'Time connectors (First, Then, Finally)'],
        skills: ['Story Writing', 'Comprehension'],
      },
    ],
  },
];

// Curated authentic questions for Yemeni exams
const defaultQuestions: Question[] = [
  // Grade 7 Questions
  {
    id: 'q-g7-1',
    grade: 'Grade 7',
    unitId: 'g7-u1',
    unitTitle: 'Unit 1: Hello & School',
    type: 'Multiple Choice',
    difficulty: 'Easy',
    marks: 2,
    questionText: 'Ali is a new pupil. ______ is twelve years old.',
    options: ['He', 'She', 'It', 'They'],
    modelAnswer: 'He',
    explanation: 'Ali is a singular male noun, so the personal pronoun is "He".',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g7-2',
    grade: 'Grade 7',
    unitId: 'g7-u1',
    unitTitle: 'Unit 1: Hello & School',
    type: 'True or False',
    difficulty: 'Easy',
    marks: 1,
    questionText: 'We use "an" before words that start with a vowel sound like "an apple".',
    modelAnswer: 'True',
    explanation: 'Correct, "an" is used before vowel sounds (a, e, i, o, u).',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g7-3',
    grade: 'Grade 7',
    unitId: 'g7-u1',
    unitTitle: 'Unit 1: Hello & School',
    type: 'Rearrange the Words',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'Re-order the words to form a correct sentence: [is / name / My / Tariq].',
    scrambledWords: ['is', 'name', 'My', 'Tariq'],
    modelAnswer: 'My name is Tariq.',
    explanation: 'Subject: My name + Verb: is + Complement: Tariq.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g7-4',
    grade: 'Grade 7',
    unitId: 'g7-u2',
    unitTitle: 'Unit 2: Family and Animals',
    type: 'Matching',
    difficulty: 'Medium',
    marks: 3,
    questionText: 'Match each family word with its opposite or related pair:',
    matchingPairs: [
      { left: 'Father', right: 'Mother' },
      { left: 'Brother', right: 'Sister' },
      { left: 'Grandfather', right: 'Grandmother' },
    ],
    modelAnswer: 'Father -> Mother, Brother -> Sister, Grandfather -> Grandmother',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g7-5',
    grade: 'Grade 7',
    unitId: 'g7-u3',
    unitTitle: 'Unit 3: Daily Routine & Time',
    type: 'Fill in the Blanks',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'Ahmad always _______ (pray / prays) Fajr in the mosque at 5:00 AM.',
    modelAnswer: 'prays',
    explanation: 'With singular third-person subject (Ahmad), the present simple verb takes -s/-es.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },

  // Grade 8 Questions
  {
    id: 'q-g8-1',
    grade: 'Grade 8',
    unitId: 'g8-u1',
    unitTitle: 'Unit 1: Holidays and Travel',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'Last Friday, our family _______ to the ancient cisterns of Tawila in Aden.',
    options: ['go', 'went', 'goes', 'going'],
    modelAnswer: 'went',
    explanation: '"Last Friday" is a past time marker, so the past simple of "go" is "went".',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g8-2',
    grade: 'Grade 8',
    unitId: 'g8-u2',
    unitTitle: 'Unit 2: Health and First Aid',
    type: 'Complete the Sentences',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'If you have a bad toothache, you should visit the _________.',
    modelAnswer: 'dentist',
    explanation: 'A dentist is the doctor who treats teeth.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g8-3',
    grade: 'Grade 8',
    unitId: 'g8-u5',
    unitTitle: 'Unit 5: Town and Country',
    type: 'Grammar',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'Sana’a is _________ (cold) than Hodeidah in winter.',
    modelAnswer: 'colder',
    explanation: 'Comparative form of short adjective "cold" is "colder".',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },

  // Grade 9 Questions
  {
    id: 'q-g9-1',
    grade: 'Grade 9',
    unitId: 'g9-u1',
    unitTitle: 'Unit 1: People and Places in Yemen',
    type: 'Reading Comprehension',
    difficulty: 'Balanced',
    marks: 5,
    passage:
      'Shibam in Hadramout is often called "the Manhattan of the desert". It is famous for its high-rise mud brick tower houses, some reaching up to eleven storeys high. The city was founded hundreds of years ago and is designated as a UNESCO World Heritage site. The buildings were constructed from sun-dried mud bricks to protect residents from floods and attacks.',
    questionText:
      'Answer the following questions based on the text:\n1. Why is Shibam called "the Manhattan of the desert"?\n2. What material was used to construct the historic buildings?\n3. Mention one reason why the buildings were designed this way.',
    modelAnswer:
      '1. Because of its high-rise tower houses that look like ancient skyscrapers.\n2. Sun-dried mud bricks (clay).\n3. To protect the residents from flash floods and external attacks.',
    explanation: 'Extracted directly from the passage context.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g9-2',
    grade: 'Grade 9',
    unitId: 'g9-u2',
    unitTitle: 'Unit 2: Wildlife and Nature of Yemen',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    questionText: 'The Dragon Blood Tree is an endemic tree found only on the island of ________.',
    options: ['Socotra', 'Kamaran', 'Perim', 'Zukur'],
    modelAnswer: 'Socotra',
    explanation: 'Socotra is famous worldwide for the Dragon Blood Tree (Dracaena cinnabari).',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g9-3',
    grade: 'Grade 9',
    unitId: 'g9-u3',
    unitTitle: 'Unit 3: Science and Inventions',
    type: 'Grammar',
    difficulty: 'Hard',
    marks: 3,
    questionText: 'Change into Passive Voice: "Al-Khwarizmi invented algebra."',
    modelAnswer: 'Algebra was invented by Al-Khwarizmi.',
    explanation: 'Past simple passive: object (Algebra) + was + past participle (invented) + by agent.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g9-4',
    grade: 'Grade 9',
    unitId: 'g9-u1',
    unitTitle: 'Unit 1: People and Places in Yemen',
    type: 'Translation',
    difficulty: 'Medium',
    marks: 3,
    questionText: 'Translate into Arabic: "Yemen has a rich history and unique architecture."',
    modelAnswer: 'تمتلك اليمن تاريخاً عريقاً وعمارة فريدة من نوعها.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'q-g9-5',
    grade: 'Grade 9',
    unitId: 'g9-u7',
    unitTitle: 'Unit 7: Stories and Life Lessons',
    type: 'Writing',
    difficulty: 'Hard',
    marks: 5,
    questionText:
      'Write a short paragraph of 40-50 words about: "A Memorable Day at Qaflah School". Mention: who you were with, what happened, and why you enjoyed it.',
    modelAnswer:
      'Student should write 4-5 well-structured sentences using past simple, correct punctuation, and vocabulary related to school activities and friendship.',
    source: 'Ministry Curriculum',
    createdAt: new Date().toISOString(),
  },
];

// Sample Pre-Built Model Exam for Qaflah School
const defaultExams: Exam[] = [
  {
    id: 'exam-qf-01',
    code: 'QF-ENG-G9-T1',
    title: 'Grade 9 English Midterm Examination',
    titleAr: 'اختبار منتصف الفصل الأول - لغة إنجليزية - الصف التاسع',
    grade: 'Grade 9',
    term: 'First Term (الفصل الدراسي الأول)',
    category: 'Midterm',
    totalMarks: 20,
    timeLimitMinutes: 60,
    difficulty: 'Balanced',
    instructionsLanguage: 'Bilingual',
    headerConfig: {
      countryTitle: 'Republic of Yemen - وزارة التربية والتعليم',
      ministryTitle: 'Ministry of Education',
      schoolName: 'Qaflah Basic Education School - مدرسة قفلة للتعليم الأساسي',
      subject: 'English Language (اللغة الإنجليزية)',
      grade: 'Grade 9',
      term: 'Midterm Examination 2026/2027',
      academicYear: '2026 / 2027',
      timeLimit: '60 Minutes (ساعة واحدة)',
      totalMarks: 20,
      showSchoolLogo: true,
      notes: 'Answer all questions clearly. Write in ink.',
    },
    sections: [
      {
        id: 'sec-1',
        sectionTitle: 'Section 1: Reading Comprehension',
        instructions: 'Read the passage carefully and answer the questions below (5 Marks):',
        questionType: 'Reading Comprehension',
        marks: 5,
        questions: [defaultQuestions.find((q) => q.id === 'q-g9-1')!],
      },
      {
        id: 'sec-2',
        sectionTitle: 'Section 2: Vocabulary & Structure',
        instructions: 'Choose the correct word or change as instructed (7 Marks):',
        questionType: 'Multiple Choice',
        marks: 7,
        questions: [
          defaultQuestions.find((q) => q.id === 'q-g9-2')!,
          defaultQuestions.find((q) => q.id === 'q-g9-3')!,
        ],
      },
      {
        id: 'sec-3',
        sectionTitle: 'Section 3: Translation & Composition',
        instructions: 'Translate the sentence and write a short paragraph (8 Marks):',
        questionType: 'Writing',
        marks: 8,
        questions: [
          defaultQuestions.find((q) => q.id === 'q-g9-4')!,
          defaultQuestions.find((q) => q.id === 'q-g9-5')!,
        ],
      },
    ],
    qualityReport: {
      passed: true,
      score: 100,
      checks: [
        { id: '1', title: 'Answer Keys Provided', passed: true, details: 'All questions contain exact model answers.' },
        { id: '2', title: 'Curriculum Alignment', passed: true, details: 'Aligned with Yemeni Grade 9 Units 1-3.' },
        { id: '3', title: 'Total Marks Balance', passed: true, details: 'Sections sum up to 20 marks exactly.' },
        { id: '4', title: 'Language Clarity', passed: true, details: 'No grammatical ambiguities detected.' },
      ],
      warnings: [],
      suggestions: ['Add 5 minutes review time instructions for students.'],
    },
    status: 'Approved',
    createdBy: 'usr-admin',
    createdByName: 'أبوحسام (مدير النظام)',
    createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    updatedAt: new Date(Date.now() - 86400000).toISOString(),
    notes: 'Approved standard exam for Qaflah School students.',
  },
];

class Database {
  private data: DatabaseSchema;

  constructor() {
    this.ensureDirs();
    this.data = this.loadData();
  }

  private ensureDirs() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true, mode: 0o700 });
    }
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true, mode: 0o700 });
    }
    try {
      fs.chmodSync(DATA_DIR, 0o700);
      fs.chmodSync(BACKUP_DIR, 0o700);
    } catch {
      // Some filesystems do not support POSIX permission modes.
    }
  }

  private loadData(): DatabaseSchema {
    if (fs.existsSync(DB_FILE)) {
      try {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        let modified = false;

        if (!Array.isArray(parsed.analyzedDocuments)) {
          parsed.analyzedDocuments = [];
          modified = true;
        }

        if (!Array.isArray(parsed.registrationRequests)) {
          parsed.registrationRequests = [];
          modified = true;
        }

        if (!Array.isArray(parsed.notifications)) {
          parsed.notifications = [];
          modified = true;
        }

        if (!Array.isArray(parsed.auditLogs)) {
          parsed.auditLogs = [];
          modified = true;
        }

        if (!Array.isArray(parsed.layoutTemplates)) {
          parsed.layoutTemplates = [];
          modified = true;
        }

        if (!Array.isArray(parsed.subjects) || parsed.subjects.length === 0) {
          parsed.subjects = DEFAULT_SUBJECTS;
          modified = true;
        } else {
          // Non-destructive migration: add missing core subjects (like subj-quran) & enforce official sortOrder 1..6
          for (const defSubj of DEFAULT_SUBJECTS) {
            const existing = (parsed.subjects as Subject[]).find(
              (s) => s.id === defSubj.id || s.nameAr.trim() === defSubj.nameAr.trim()
            );
            if (!existing) {
              parsed.subjects.push({ ...defSubj });
              modified = true;
            } else {
              if (existing.sortOrder !== defSubj.sortOrder) {
                existing.sortOrder = defSubj.sortOrder;
                modified = true;
              }
              if (existing.isCore !== defSubj.isCore) {
                existing.isCore = defSubj.isCore;
                modified = true;
              }
              if (defSubj.isQuran && !existing.isQuran) {
                existing.isQuran = true;
                modified = true;
              }
              if (
                existing.id === 'subj-isl' &&
                existing.description?.startsWith('القرآن الكريم')
              ) {
                existing.description = defSubj.description;
                modified = true;
              }
            }
          }
          parsed.subjects.sort(
            (a: Subject, b: Subject) =>
              (a.sortOrder ?? CORE_SUBJECT_ORDER[a.id] ?? 99) -
              (b.sortOrder ?? CORE_SUBJECT_ORDER[b.id] ?? 99)
          );
        }

        if (!parsed.schoolSettings) {
          parsed.schoolSettings = DEFAULT_SCHOOL_SETTINGS;
          modified = true;
        }

        const allSubjectIds = (parsed.subjects as Subject[]).map((s) => s.id);
        const defaultGrades = [...ALL_BASIC_GRADES];
        const needsV2CatalogMigration = !parsed.migrations?.subjectsAndGradesV2;

        if (Array.isArray(parsed.users)) {
          parsed.users.forEach((u: any) => {
            if (!u.status) {
              u.status = 'ACTIVE';
              modified = true;
            }
            if (u.id === 'usr-admin' || u.role === 'Administrator' || u.role === 'PlatformOwner') {
              if (u.role !== 'PlatformOwner') {
                u.role = 'PlatformOwner';
                modified = true;
              }
              if (u.hasAIAccess !== true) {
                u.hasAIAccess = true;
                modified = true;
              }
              if (!Array.isArray(u.assignedSubjects) || !u.assignedSubjects.includes('all')) {
                u.assignedSubjects = ['all'];
                modified = true;
              }
              if (!Array.isArray(u.assignedGrades) || !u.assignedGrades.includes('all')) {
                u.assignedGrades = ['all'];
                modified = true;
              }
            } else if (u.role === 'SchoolAdmin') {
              if (u.hasAIAccess !== false) {
                u.hasAIAccess = false;
                modified = true;
              }
              if (!Array.isArray(u.assignedSubjects) || !u.assignedSubjects.includes('all')) {
                u.assignedSubjects = ['all'];
                modified = true;
              }
              if (!Array.isArray(u.assignedGrades) || !u.assignedGrades.includes('all')) {
                u.assignedGrades = ['all'];
                modified = true;
              }
              if (!u.delegatedPermissions) {
                u.delegatedPermissions = {
                  canManageTeachers: true,
                  canManageSubjects: true,
                  canManageIdentity: true,
                  canManageCurricula: true,
                };
                modified = true;
              }
            } else {
              if (u.role !== 'Teacher') {
                u.role = 'Teacher';
                modified = true;
              }
              if (u.hasAIAccess !== false) {
                u.hasAIAccess = false;
                modified = true;
              }
              if (!Array.isArray(u.assignedSubjects) || u.assignedSubjects.length === 0) {
                u.assignedSubjects = allSubjectIds;
                modified = true;
              } else if (needsV2CatalogMigration && !u.assignedSubjects.includes('all')) {
                const mergedSubjects = Array.from(new Set([...CORE_SIX_SUBJECT_IDS, ...u.assignedSubjects]));
                mergedSubjects.sort(
                  (a, b) => (CORE_SUBJECT_ORDER[a] ?? 99) - (CORE_SUBJECT_ORDER[b] ?? 99)
                );
                if (JSON.stringify(mergedSubjects) !== JSON.stringify(u.assignedSubjects)) {
                  u.assignedSubjects = mergedSubjects;
                  modified = true;
                }
              }
              if (!Array.isArray(u.assignedGrades) || u.assignedGrades.length === 0) {
                u.assignedGrades = defaultGrades;
                modified = true;
              } else if (needsV2CatalogMigration && !u.assignedGrades.includes('all')) {
                const mergedGrades = Array.from(new Set([...ALL_BASIC_GRADES, ...u.assignedGrades]));
                if (JSON.stringify(mergedGrades) !== JSON.stringify(u.assignedGrades)) {
                  u.assignedGrades = mergedGrades;
                  modified = true;
                }
              }
            }
          });

          if (needsV2CatalogMigration) {
            parsed.migrations = { ...(parsed.migrations || {}), subjectsAndGradesV2: true };
            modified = true;
          }

          const salt = bcrypt.genSaltSync(10);
          const isProduction = process.env.NODE_ENV === 'production';
          const bootstrapSchoolAdminPassword =
            process.env.BOOTSTRAP_SCHOOL_ADMIN_PASSWORD || (isProduction ? '' : 'school123');
          const bootstrapTeacherPassword =
            process.env.BOOTSTRAP_TEACHER_PASSWORD || (isProduction ? '' : 'teacher123');
          if (
            isProduction &&
            [bootstrapSchoolAdminPassword, bootstrapTeacherPassword].some((value) => value && value.length < 12)
          ) {
            throw new Error('Production bootstrap passwords must be at least 12 characters.');
          }
          if (
            bootstrapSchoolAdminPassword &&
            !parsed.users.some((u: any) => u.id === 'usr-school-admin' || u.role === 'SchoolAdmin')
          ) {
            parsed.users.push({
              id: 'usr-school-admin',
              username: 'schooladmin',
              name: 'إدارة مدرسة قفلة للتعليم الأساسي',
              role: 'SchoolAdmin',
              hasAIAccess: false,
              assignedSubjects: ['all'],
              assignedGrades: ['all'],
              email: 'admin@qaflah.edu.ye',
              school: 'مدرسة قفلة للتعليم الأساسي',
              createdAt: new Date().toISOString(),
              passwordHash: bcrypt.hashSync(bootstrapSchoolAdminPassword, salt),
            });
            modified = true;
          }

          if (bootstrapTeacherPassword && !parsed.users.some((u: any) => u.id === 'usr-teacher-2')) {
            parsed.users.push({
              id: 'usr-teacher-2',
              username: 'teacher2',
              name: 'أ. فاطمة (معلمة المواد الأساسية)',
              role: 'Teacher',
              hasAIAccess: false,
              assignedSubjects: allSubjectIds,
              assignedGrades: defaultGrades,
              email: 'fatima@qaflah.edu.ye',
              school: 'مدرسة قفلة للتعليم الأساسي',
              createdAt: new Date().toISOString(),
              passwordHash: bcrypt.hashSync(bootstrapTeacherPassword, salt),
            });
            modified = true;
          }
        }

        if (Array.isArray(parsed.questions)) {
          parsed.questions.forEach((q: any) => {
            if (!q.sourceCode) {
              q.sourceCode = q.source === 'Gemini AI' ? 'ENRICHMENT' : 'CURRICULUM';
              modified = true;
            }
            if (!q.educationalLevel) {
              q.educationalLevel = q.difficulty === 'Easy' ? 'BASIC' : q.difficulty === 'Hard' ? 'ADVANCED' : 'INTERMEDIATE';
              modified = true;
            }
            if (!q.ownerId) {
              q.ownerId = 'usr-admin';
              modified = true;
            }
            if (!q.subjectId) {
              q.subjectId = 'subj-en';
              modified = true;
            }
          });
        }

        if (Array.isArray(parsed.exams)) {
          parsed.exams.forEach((ex: any) => {
            if (!ex.ownerId) {
              ex.ownerId = ex.createdBy || 'usr-admin';
              modified = true;
            }
            if (!ex.subjectId) {
              ex.subjectId = 'subj-en';
              modified = true;
            }
          });
        }

        if (Array.isArray(parsed.archive)) {
          parsed.archive.forEach((ex: any) => {
            if (!ex.ownerId) {
              ex.ownerId = ex.createdBy || 'usr-admin';
              modified = true;
            }
            if (!ex.subjectId) {
              ex.subjectId = 'subj-en';
              modified = true;
            }
          });
        }

        if (Array.isArray(parsed.analyzedDocuments)) {
          parsed.analyzedDocuments.forEach((doc: any) => {
            if (!doc.ownerId) {
              doc.ownerId = 'usr-admin';
              modified = true;
            }
          });
        }

        // Rotate or disable legacy demo accounts that still use known default passwords.
        if (process.env.NODE_ENV === 'production' && Array.isArray(parsed.users)) {
          const legacyAccounts = [
            { username: 'admin', password: 'admin123', env: 'BOOTSTRAP_OWNER_PASSWORD', required: true },
            { username: 'schooladmin', password: 'school123', env: 'BOOTSTRAP_SCHOOL_ADMIN_PASSWORD', required: false },
            { username: 'teacher', password: 'teacher123', env: 'BOOTSTRAP_TEACHER_PASSWORD', required: false },
            { username: 'teacher2', password: 'teacher123', env: 'BOOTSTRAP_TEACHER2_PASSWORD', required: false },
          ];

          for (const legacy of legacyAccounts) {
            const account = parsed.users.find(
              (u: any) => String(u.username || '').toLowerCase() === legacy.username
            );
            if (!account?.passwordHash || !bcrypt.compareSync(legacy.password, account.passwordHash)) continue;

            const replacement = process.env[legacy.env];
            if (replacement && replacement.length >= 12) {
              account.passwordHash = bcrypt.hashSync(replacement, 10);
              modified = true;
            } else if (legacy.required) {
              throw new Error('The production owner account still uses a demo password. Configure BOOTSTRAP_OWNER_PASSWORD to rotate it.');
            } else if (account.status !== 'SUSPENDED') {
              account.status = 'SUSPENDED';
              modified = true;
            }
          }
        }

        if (modified) {
          this.saveDataDirect(parsed);
        }

        return parsed;
      } catch (err) {
        console.error('Database load or migration failed:', err);
        if (process.env.NODE_ENV === 'production') {
          const reason = err instanceof Error ? err.message : 'unknown database error';
          throw new Error(`Production database load failed: ${reason}. Refusing to replace existing data with a fresh seed database.`);
        }
      }
    }

    // Production accounts must be bootstrapped with operator-provided secrets.
    // Weak demo credentials are retained only for local development.
    const isProduction = process.env.NODE_ENV === 'production';
    const ownerPassword = process.env.BOOTSTRAP_OWNER_PASSWORD || (isProduction ? '' : 'admin123');
    if (ownerPassword.length < 12 && isProduction) {
      throw new Error('BOOTSTRAP_OWNER_PASSWORD must be configured (at least 12 characters) before first production startup.');
    }
    const schoolAdminPassword =
      process.env.BOOTSTRAP_SCHOOL_ADMIN_PASSWORD || (isProduction ? '' : 'school123');
    const teacherPassword =
      process.env.BOOTSTRAP_TEACHER_PASSWORD || (isProduction ? '' : 'teacher123');
    const teacher2Password =
      process.env.BOOTSTRAP_TEACHER2_PASSWORD || (isProduction ? '' : teacherPassword);
    if (
      isProduction &&
      [schoolAdminPassword, teacherPassword, teacher2Password].some((value) => value && value.length < 12)
    ) {
      throw new Error('Production bootstrap passwords must be at least 12 characters.');
    }
    const salt = bcrypt.genSaltSync(10);
    const adminHash = bcrypt.hashSync(ownerPassword, salt);

    const initialDb: DatabaseSchema = {
      users: [
        {
          id: 'usr-admin',
          username: 'admin',
          name: 'أبوحسام (صاحب النظام والمشرف العام)',
          role: 'PlatformOwner',
          status: 'ACTIVE',
          hasAIAccess: true,
          assignedSubjects: ['all'],
          assignedGrades: ['all'],
          email: 'abuhussam@qaflah.edu.ye',
          school: 'مدرسة قفلة للتعليم الأساسي',
          createdAt: new Date().toISOString(),
          passwordHash: adminHash,
        },
        ...(schoolAdminPassword ? [{
          id: 'usr-school-admin',
          username: 'schooladmin',
          name: 'إدارة مدرسة قفلة للتعليم الأساسي',
          role: 'SchoolAdmin',
          status: 'ACTIVE',
          hasAIAccess: false,
          assignedSubjects: ['all'],
          assignedGrades: ['all'],
          delegatedPermissions: {
            canManageTeachers: true,
            canManageSubjects: true,
            canManageIdentity: true,
            canManageCurricula: true,
          },
          email: 'admin@qaflah.edu.ye',
          school: 'مدرسة قفلة للتعليم الأساسي',
          createdAt: new Date().toISOString(),
          passwordHash: bcrypt.hashSync(schoolAdminPassword, salt),
        }] : []),
        ...(teacherPassword ? [{
          id: 'usr-teacher',
          username: 'teacher',
          name: 'أ. محمد (معلم اللغة الإنجليزية)',
          role: 'Teacher',
          status: 'ACTIVE',
          hasAIAccess: false,
          assignedSubjects: DEFAULT_SUBJECTS.map((s) => s.id),
          assignedGrades: [...ALL_BASIC_GRADES],
          email: 'teacher.english@qaflah.edu.ye',
          school: 'مدرسة قفلة للتعليم الأساسي',
          createdAt: new Date().toISOString(),
          passwordHash: bcrypt.hashSync(teacherPassword, salt),
        }] : []),
        ...(teacher2Password ? [{
          id: 'usr-teacher-2',
          username: 'teacher2',
          name: 'أ. فاطمة (معلمة المواد الأساسية)',
          role: 'Teacher',
          status: 'ACTIVE',
          hasAIAccess: false,
          assignedSubjects: DEFAULT_SUBJECTS.map((s) => s.id),
          assignedGrades: [...ALL_BASIC_GRADES],
          email: 'fatima@qaflah.edu.ye',
          school: 'مدرسة قفلة للتعليم الأساسي',
          createdAt: new Date().toISOString(),
          passwordHash: bcrypt.hashSync(teacher2Password, salt),
        }] : []),
      ],
      registrationRequests: [],
      notifications: [],
      subjects: DEFAULT_SUBJECTS,
      schoolSettings: DEFAULT_SCHOOL_SETTINGS,
      curricula: defaultCurricula,
      questions: defaultQuestions.map((q) => ({ ...q, ownerId: 'usr-admin', subjectId: 'subj-en' })),
      exams: defaultExams.map((e) => ({ ...e, ownerId: e.createdBy || 'usr-admin', subjectId: 'subj-en' })),
      archive: [],
      layoutTemplates: [],
      analyzedDocuments: [],
      aiSettings: {
        apiKeyConfigured: !!process.env.GEMINI_API_KEY,
        primaryModel: 'gemini-3.8-flash',
        fallbackModel: 'gemini-3.1-flash-lite',
        allowPaidModels: false,
        temperature: 0.3,
        totalRequests: 0,
        activeStatus: 'Connected',
      },
      aiUsageLogs: [],
      auditLogs: [
        (() => {
          const entryBase: Omit<AuditLogEntry, 'entryHash'> = {
            id: 'log-init',
            timestamp: new Date().toISOString(),
            userId: 'system',
            actorName: 'النظام',
            actorRole: 'System',
            action: 'DATABASE_INITIALIZATION',
            category: 'ADMIN',
            severity: 'INFO',
            details: 'Abu Hussam Exam Builder database initialized for Qaflah School.',
            result: 'SUCCESS',
            prevHash: 'GENESIS',
          };
          return { ...entryBase, entryHash: computeAuditEntryHash('GENESIS', entryBase) };
        })(),
      ],
    };

    this.saveDataDirect(initialDb);
    return initialDb;
  }

  private saveDataDirect(data: DatabaseSchema) {
    try {
      const tempPath = `${DB_FILE}.tmp`;
      fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), { encoding: 'utf-8', mode: 0o600 });
      try { fs.chmodSync(tempPath, 0o600); } catch { /* ignore unsupported permission changes */ }
      fs.renameSync(tempPath, DB_FILE);
    } catch (err) {
      console.error('Failed to save database atomically:', err);
    }
  }

  public save() {
    this.saveDataDirect(this.data);
  }

  // Users
  public getUsers(): User[] {
    return this.data.users.map(({ passwordHash, ...user }) => user);
  }

  public findUserByUsername(username: string) {
    return this.data.users.find((u) => u.username.toLowerCase() === username.toLowerCase());
  }

  public findUserById(id: string): User | undefined {
    const user = this.data.users.find((u) => u.id === id);
    if (!user) return undefined;
    const { passwordHash, authVersion: _authVersion, ...rest } = user as User & { authVersion?: number };
    return rest;
  }

  public getAuthVersion(userId: string): number {
    const user = this.data.users.find((u) => u.id === userId) as (User & { authVersion?: number }) | undefined;
    return Number.isSafeInteger(user?.authVersion) && (user?.authVersion as number) >= 0
      ? (user?.authVersion as number)
      : 0;
  }

  public isAuthVersionCurrent(userId: string, version: number): boolean {
    return this.getAuthVersion(userId) === version;
  }

  public recordUserLoginSuccess(userId: string) {
    const idx = this.data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return;
    const now = new Date().toISOString();
    this.data.users[idx].failedLoginAttempts = 0;
    this.data.users[idx].lockedUntil = undefined;
    this.data.users[idx].lastLoginAt = now;
    this.data.users[idx].lastActivityAt = now;
    this.save();
  }

  public recordUserLoginFailure(userId: string, lockThreshold = 5, lockDurationMs = 15 * 60 * 1000): {
    attempts: number;
    lockedUntil?: string;
  } {
    const idx = this.data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return { attempts: 0 };
    const nextAttempts = (this.data.users[idx].failedLoginAttempts || 0) + 1;
    this.data.users[idx].failedLoginAttempts = nextAttempts;
    if (nextAttempts >= lockThreshold) {
      this.data.users[idx].lockedUntil = new Date(Date.now() + lockDurationMs).toISOString();
    }
    this.save();
    return {
      attempts: nextAttempts,
      lockedUntil: this.data.users[idx].lockedUntil,
    };
  }

  public touchUserActivity(userId: string) {
    const u = this.data.users.find((x) => x.id === userId);
    if (!u) return;
    const now = Date.now();
    const prev = u.lastActivityAt ? new Date(u.lastActivityAt).getTime() : 0;
    if (now - prev > 60_000) {
      u.lastActivityAt = new Date(now).toISOString();
      this.save();
    }
  }

  public createUser(user: Omit<User, 'id' | 'createdAt'> & { password: string }): User {
    if (this.data.users.some((u) => u.username.toLowerCase() === user.username.toLowerCase())) {
      throw new Error('اسم المستخدم مسجل مسبقاً');
    }
    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(user.password, salt);
    const safeRole: UserRole =
      user.role === 'PlatformOwner' ? 'PlatformOwner' : user.role === 'SchoolAdmin' ? 'SchoolAdmin' : 'Teacher';
    const newUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: user.username,
      name: user.name,
      role: safeRole,
      status: user.status || ('ACTIVE' as const),
      hasAIAccess: safeRole === 'PlatformOwner' ? Boolean(user.hasAIAccess) : false,
      assignedSubjects:
        safeRole === 'Teacher'
          ? (Array.isArray(user.assignedSubjects) ? user.assignedSubjects : [])
          : ['all'],
      assignedGrades:
        safeRole === 'Teacher'
          ? (Array.isArray(user.assignedGrades) ? user.assignedGrades : [])
          : ['all'],
      email: user.email,
      phone: user.phone,
      school: user.school || this.data.schoolSettings?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي',
      registrationRequestId: user.registrationRequestId,
      reviewedBy: user.reviewedBy,
      reviewedByName: user.reviewedByName,
      reviewedAt: user.reviewedAt,
      reviewNotes: user.reviewNotes,
      delegatedPermissions:
        safeRole === 'SchoolAdmin'
          ? user.delegatedPermissions || {
              canManageTeachers: true,
              canManageSubjects: true,
              canManageIdentity: true,
              canManageCurricula: true,
            }
          : undefined,
      createdAt: new Date().toISOString(),
      passwordHash,
    };
    this.data.users.push(newUser);
    this.save();
    const { passwordHash: _, ...rest } = newUser;
    return rest;
  }

  public updateUser(userId: string, patch: Partial<User>): User | null {
    const idx = this.data.users.findIndex((u) => u.id === userId);
    if (idx === -1) return null;
    const current = this.data.users[idx];
    const next = {
      ...current,
      ...patch,
      id: current.id,
      passwordHash: current.passwordHash,
    };
    if (next.role === 'Teacher' || next.role === 'SchoolAdmin') {
      next.hasAIAccess = false;
    }
    this.data.users[idx] = next;
    this.save();
    const { passwordHash: _, ...rest } = next;
    return rest;
  }

  public updateUserPassword(userId: string, newPassword: string): boolean {
    const user = this.data.users.find((u) => u.id === userId);
    if (!user) return false;
    user.passwordHash = bcrypt.hashSync(newPassword, 10);
    const versionedUser = user as User & { authVersion?: number };
    versionedUser.authVersion = (Number.isSafeInteger(versionedUser.authVersion) ? versionedUser.authVersion! : 0) + 1;
    this.save();
    return true;
  }

  // Registration Requests
  public getRegistrationRequests(status?: string): RegistrationRequest[] {
    let list = (this.data.registrationRequests || []).map(({ passwordHash, ...rest }) => rest);
    if (status && status !== 'ALL') {
      list = list.filter((r) => r.status === status);
    }
    return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  public findRawRegistrationRequestById(id: string): StoredRegistrationRequest | undefined {
    return (this.data.registrationRequests || []).find((r) => r.id === id);
  }

  public findRegistrationRequestByUsername(username: string): RegistrationRequest | undefined {
    const found = (this.data.registrationRequests || []).find(
      (r) => r.username.toLowerCase() === username.toLowerCase()
    );
    if (!found) return undefined;
    const { passwordHash, ...rest } = found;
    return rest;
  }

  public createRegistrationRequest(input: {
    fullName: string;
    username: string;
    password: string;
    requestedRole: 'Teacher' | 'SchoolAdmin';
    assignedSubjects: string[];
    assignedGrades: string[];
    phone?: string;
    notes?: string;
    ipAddress?: string;
    userAgent?: string;
  }): RegistrationRequest {
    if (!Array.isArray(this.data.registrationRequests)) {
      this.data.registrationRequests = [];
    }
    const lowerUsername = input.username.trim().toLowerCase();
    if (this.data.users.some((u) => u.username.toLowerCase() === lowerUsername)) {
      throw new Error('اسم المستخدم مستخدم بالفعل في حساب نشط');
    }
    const existingPending = this.data.registrationRequests.find(
      (r) =>
        r.username.toLowerCase() === lowerUsername &&
        (r.status === 'PENDING_APPROVAL' || r.status === 'NEEDS_EDIT')
    );
    if (existingPending) {
      throw new Error('يوجد طلب تسجيل قائم بالفعل بهذا الاسم وبانتظار مراجعة مالك المنصة');
    }

    const salt = bcrypt.genSaltSync(10);
    const now = new Date().toISOString();
    const record: StoredRegistrationRequest = {
      id: `reg-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      fullName: input.fullName.trim(),
      username: input.username.trim(),
      passwordHash: bcrypt.hashSync(input.password, salt),
      requestedRole: input.requestedRole === 'SchoolAdmin' ? 'SchoolAdmin' : 'Teacher',
      assignedSubjects: input.assignedSubjects.length > 0 ? input.assignedSubjects : [...CORE_SIX_SUBJECT_IDS],
      assignedGrades: input.assignedGrades.length > 0 ? input.assignedGrades : [...ALL_BASIC_GRADES],
      phone: input.phone?.trim(),
      notes: input.notes?.trim(),
      status: 'PENDING_APPROVAL',
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
      createdAt: now,
      updatedAt: now,
    };

    this.data.registrationRequests.unshift(record);
    this.save();
    const { passwordHash: _, ...safe } = record;
    return safe;
  }

  public approveRegistrationRequest(
    requestId: string,
    reviewer: User,
    overrides?: {
      role?: 'Teacher' | 'SchoolAdmin';
      assignedSubjects?: string[];
      assignedGrades?: string[];
      reviewNote?: string;
    }
  ): { request: RegistrationRequest; user: User } | null {
    const rawReq = this.findRawRegistrationRequestById(requestId);
    if (!rawReq) return null;

    if (this.data.users.some((u) => u.username.toLowerCase() === rawReq.username.toLowerCase())) {
      throw new Error('اسم المستخدم موجود بالفعل في قائمة الحسابات');
    }

    const finalRole: UserRole =
      overrides?.role === 'SchoolAdmin'
        ? 'SchoolAdmin'
        : overrides?.role === 'Teacher'
        ? 'Teacher'
        : rawReq.requestedRole === 'SchoolAdmin'
        ? 'SchoolAdmin'
        : 'Teacher';

    const finalSubjects =
      finalRole === 'SchoolAdmin'
        ? ['all']
        : overrides?.assignedSubjects && overrides.assignedSubjects.length > 0
        ? overrides.assignedSubjects
        : rawReq.assignedSubjects;

    const finalGrades =
      finalRole === 'SchoolAdmin'
        ? ['all']
        : overrides?.assignedGrades && overrides.assignedGrades.length > 0
        ? overrides.assignedGrades
        : rawReq.assignedGrades;

    const now = new Date().toISOString();
    const createdRawUser = {
      id: `usr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      username: rawReq.username,
      name: rawReq.fullName,
      role: finalRole,
      status: 'ACTIVE' as const,
      hasAIAccess: false,
      assignedSubjects: finalSubjects,
      assignedGrades: finalGrades,
      phone: rawReq.phone,
      school: this.data.schoolSettings?.schoolNameAr || 'مدرسة قفلة للتعليم الأساسي',
      registrationRequestId: rawReq.id,
      reviewedBy: reviewer.id,
      reviewedByName: reviewer.name,
      reviewedAt: now,
      reviewNotes: overrides?.reviewNote || rawReq.reviewNote,
      delegatedPermissions:
        finalRole === 'SchoolAdmin'
          ? {
              canManageTeachers: true,
              canManageSubjects: true,
              canManageIdentity: true,
              canManageCurricula: true,
            }
          : undefined,
      createdAt: now,
      passwordHash: rawReq.passwordHash, // Reuse bcrypt hash already salted at signup
    };

    this.data.users.push(createdRawUser);
    rawReq.status = 'APPROVED';
    rawReq.reviewedBy = reviewer.id;
    rawReq.reviewedByName = reviewer.name;
    rawReq.reviewedAt = now;
    rawReq.reviewNote = overrides?.reviewNote || rawReq.reviewNote;
    rawReq.approvedUserId = createdRawUser.id;
    rawReq.updatedAt = now;

    this.save();
    const { passwordHash: _p1, ...safeUser } = createdRawUser;
    const { passwordHash: _p2, ...safeReq } = rawReq;
    return { request: safeReq, user: safeUser };
  }

  public updateRegistrationRequestStatus(
    requestId: string,
    status: 'REJECTED' | 'NEEDS_EDIT',
    reviewer: User,
    reviewNote: string
  ): RegistrationRequest | null {
    const rawReq = this.findRawRegistrationRequestById(requestId);
    if (!rawReq) return null;
    const now = new Date().toISOString();
    rawReq.status = status;
    rawReq.reviewedBy = reviewer.id;
    rawReq.reviewedByName = reviewer.name;
    rawReq.reviewedAt = now;
    rawReq.reviewNote = reviewNote;
    rawReq.updatedAt = now;
    this.save();
    const { passwordHash: _, ...safeReq } = rawReq;
    return safeReq;
  }

  // Subjects Management (Always sorted: 6 official core subjects first, then extras)
  public getSubjects(onlyActive = false): Subject[] {
    const list = [...(this.data.subjects || DEFAULT_SUBJECTS)].sort(
      (a, b) =>
        (a.sortOrder ?? CORE_SUBJECT_ORDER[a.id] ?? 99) -
        (b.sortOrder ?? CORE_SUBJECT_ORDER[b.id] ?? 99)
    );
    return onlyActive ? list.filter((s) => s.isActive) : list;
  }

  public addSubject(subject: Omit<Subject, 'id' | 'createdAt'>): Subject {
    const created: Subject = {
      ...subject,
      id: `subj-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
      sortOrder: subject.sortOrder ?? 99 + this.data.subjects.length,
      isCore: false,
      createdAt: new Date().toISOString(),
    };
    this.data.subjects.push(created);
    this.save();
    return created;
  }

  public updateSubject(id: string, patch: Partial<Subject>): Subject | null {
    const idx = this.data.subjects.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    this.data.subjects[idx] = { ...this.data.subjects[idx], ...patch, id };
    this.save();
    return this.data.subjects[idx];
  }

  public deleteSubject(id: string): boolean {
    const initLen = this.data.subjects.length;
    this.data.subjects = this.data.subjects.filter((s) => s.id !== id);
    if (this.data.subjects.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }

  // School Identity Settings
  public getSchoolSettings(): SchoolIdentitySettings {
    return this.data.schoolSettings || DEFAULT_SCHOOL_SETTINGS;
  }

  public updateSchoolSettings(patch: Partial<SchoolIdentitySettings>): SchoolIdentitySettings {
    this.data.schoolSettings = {
      ...this.getSchoolSettings(),
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.schoolSettings;
  }

  // Curricula
  public getCurricula(grade?: string, subjectId?: string): CurriculumUnit[] {
    let list = this.data.curricula;
    if (grade) {
      list = list.filter((c) => c.grade === grade);
    }
    if (subjectId) {
      list = list.filter((c) => !c.subjectId || c.subjectId === subjectId);
    }
    return list;
  }

  public addUnit(unit: CurriculumUnit): CurriculumUnit {
    this.data.curricula.push(unit);
    this.save();
    return unit;
  }

  public updateUnit(unitId: string, updated: Partial<CurriculumUnit>): CurriculumUnit | null {
    const idx = this.data.curricula.findIndex((u) => u.id === unitId);
    if (idx === -1) return null;
    this.data.curricula[idx] = { ...this.data.curricula[idx], ...updated };
    this.save();
    return this.data.curricula[idx];
  }

  public deleteUnit(unitId: string): boolean {
    const initLen = this.data.curricula.length;
    this.data.curricula = this.data.curricula.filter((u) => u.id !== unitId);
    if (this.data.curricula.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Question Bank (Private Workspace Scoped)
  public getQuestions(filters?: {
    ownerUserId?: string;
    grade?: string;
    subjectId?: string;
    unitId?: string;
    type?: string;
    difficulty?: string;
    sourceCode?: string;
    educationalLevel?: string;
    grammarCategory?: string;
    search?: string;
  }): Question[] {
    let list = [...this.data.questions];
    if (filters?.ownerUserId) {
      const uid = filters.ownerUserId;
      list = list.filter(
        (q) =>
          q.ownerId === uid ||
          (Array.isArray(q.sharedWith) && q.sharedWith.some((s) => s.userId === uid))
      );
    }
    if (filters) {
      if (filters.grade) {
        list = list.filter((q) => q.grade === filters.grade);
      }
      if (filters.subjectId) {
        list = list.filter((q) => q.subjectId === filters.subjectId);
      }
      if (filters.unitId) {
        list = list.filter((q) => q.unitId === filters.unitId);
      }
      if (filters.type) {
        list = list.filter((q) => q.type === filters.type);
      }
      if (filters.difficulty) {
        list = list.filter((q) => q.difficulty === filters.difficulty);
      }
      if (filters.sourceCode) {
        list = list.filter((q) => q.sourceCode === filters.sourceCode);
      }
      if (filters.educationalLevel) {
        list = list.filter((q) => q.educationalLevel === filters.educationalLevel);
      }
      if (filters.grammarCategory) {
        list = list.filter(
          (q) => q.grammarCategory && q.grammarCategory.toLowerCase().includes(filters.grammarCategory!.toLowerCase())
        );
      }
      if (filters.search) {
        const term = filters.search.toLowerCase();
        list = list.filter(
          (q) =>
            q.questionText.toLowerCase().includes(term) ||
            q.modelAnswer.toLowerCase().includes(term) ||
            (q.unitTitle && q.unitTitle.toLowerCase().includes(term)) ||
            (q.explanation && q.explanation.toLowerCase().includes(term)) ||
            (q.grammarCategory && q.grammarCategory.toLowerCase().includes(term))
        );
      }
    }
    return list;
  }

  public getQuestionById(id: string): Question | undefined {
    return this.data.questions.find((q) => q.id === id);
  }

  public addQuestion(question: Omit<Question, 'id' | 'createdAt'>): Question {
    const newQ: Question = {
      ...question,
      id: `q-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    this.data.questions.unshift(newQ);
    this.save();
    return newQ;
  }

  public updateQuestion(id: string, updated: Partial<Question>): Question | null {
    const idx = this.data.questions.findIndex((q) => q.id === id);
    if (idx === -1) return null;
    this.data.questions[idx] = {
      ...this.data.questions[idx],
      ...updated,
      id: this.data.questions[idx].id,
      ownerId: this.data.questions[idx].ownerId,
      updatedAt: new Date().toISOString(),
    };
    this.save();
    return this.data.questions[idx];
  }

  public deleteQuestion(id: string): boolean {
    const initLen = this.data.questions.length;
    this.data.questions = this.data.questions.filter((q) => q.id !== id);
    if (this.data.questions.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Exams (Private Workspace Scoped)
  public getExams(ownerUserId?: string): Exam[] {
    if (!ownerUserId) return this.data.exams;
    return this.data.exams.filter(
      (e) =>
        (e.ownerId || e.createdBy) === ownerUserId ||
        (Array.isArray(e.sharedWith) && e.sharedWith.some((s) => s.userId === ownerUserId))
    );
  }

  public getExamById(id: string): Exam | undefined {
    return this.data.exams.find((e) => e.id === id) || this.data.archive.find((e) => e.id === id);
  }

  public saveExam(exam: Exam): Exam {
    const idx = this.data.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) {
      this.data.exams[idx] = {
        ...exam,
        ownerId: this.data.exams[idx].ownerId || exam.ownerId || exam.createdBy,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return this.data.exams[idx];
    } else {
      this.data.exams.unshift(exam);
      this.save();
      return exam;
    }
  }

  public deleteExam(id: string): boolean {
    const idx = this.data.exams.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const removed = this.data.exams.splice(idx, 1)[0];
      removed.status = 'Archived';
      this.data.archive.unshift(removed);
      this.save();
      return true;
    }
    return false;
  }

  public archiveExam(id: string): boolean {
    const idx = this.data.exams.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const exam = this.data.exams.splice(idx, 1)[0];
      exam.status = 'Archived';
      this.data.archive.unshift(exam);
      this.save();
      return true;
    }
    return false;
  }

  public restoreExam(id: string): boolean {
    const idx = this.data.archive.findIndex((e) => e.id === id);
    if (idx >= 0) {
      const exam = this.data.archive.splice(idx, 1)[0];
      exam.status = 'Validated';
      this.data.exams.unshift(exam);
      this.save();
      return true;
    }
    return false;
  }

  public getArchive(ownerUserId?: string): Exam[] {
    if (!ownerUserId) return this.data.archive;
    return this.data.archive.filter(
      (e) =>
        (e.ownerId || e.createdBy) === ownerUserId ||
        (Array.isArray(e.sharedWith) && e.sharedWith.some((s) => s.userId === ownerUserId))
    );
  }

  // Reusable Private Layout Templates (Strictly isolated per ownerId)
  public getLayoutTemplatesForOwner(ownerUserId: string): LayoutTemplate[] {
    if (!Array.isArray(this.data.layoutTemplates)) {
      this.data.layoutTemplates = [];
    }
    return this.data.layoutTemplates.filter((t) => t.ownerId === ownerUserId);
  }

  public getLayoutTemplateById(id: string): LayoutTemplate | undefined {
    if (!Array.isArray(this.data.layoutTemplates)) return undefined;
    return this.data.layoutTemplates.find((t) => t.id === id);
  }

  public saveLayoutTemplate(tpl: LayoutTemplate): LayoutTemplate {
    if (!Array.isArray(this.data.layoutTemplates)) {
      this.data.layoutTemplates = [];
    }
    const idx = this.data.layoutTemplates.findIndex((t) => t.id === tpl.id);
    if (idx >= 0) {
      this.data.layoutTemplates[idx] = {
        ...this.data.layoutTemplates[idx],
        ...tpl,
        ownerId: this.data.layoutTemplates[idx].ownerId,
        updatedAt: new Date().toISOString(),
      };
      this.save();
      return this.data.layoutTemplates[idx];
    }
    this.data.layoutTemplates.unshift(tpl);
    this.save();
    return tpl;
  }

  public deleteLayoutTemplate(id: string, ownerUserId: string): { deleted: boolean; forbidden?: boolean } {
    if (!Array.isArray(this.data.layoutTemplates)) return { deleted: false };
    const existing = this.data.layoutTemplates.find((t) => t.id === id);
    if (!existing) return { deleted: false };
    if (existing.ownerId !== ownerUserId) {
      return { deleted: false, forbidden: true };
    }
    this.data.layoutTemplates = this.data.layoutTemplates.filter((t) => t.id !== id);
    this.save();
    return { deleted: true };
  }

  // Analyzed Documents & Vision Sessions
  public getAnalyzedDocuments(): AnalyzedDocument[] {
    return this.data.analyzedDocuments || [];
  }

  public getAnalyzedDocumentById(id: string): AnalyzedDocument | undefined {
    return (this.data.analyzedDocuments || []).find((d) => d.id === id);
  }

  public saveAnalyzedDocument(doc: AnalyzedDocument): AnalyzedDocument {
    if (!this.data.analyzedDocuments) {
      this.data.analyzedDocuments = [];
    }
    const idx = this.data.analyzedDocuments.findIndex((d) => d.id === doc.id);
    if (idx >= 0) {
      this.data.analyzedDocuments[idx] = { ...doc, updatedAt: new Date().toISOString() };
    } else {
      this.data.analyzedDocuments.unshift(doc);
    }
    this.save();
    return doc;
  }

  public deleteAnalyzedDocument(id: string): boolean {
    if (!this.data.analyzedDocuments) return false;
    const initLen = this.data.analyzedDocuments.length;
    this.data.analyzedDocuments = this.data.analyzedDocuments.filter((d) => d.id !== id);
    if (this.data.analyzedDocuments.length !== initLen) {
      this.save();
      return true;
    }
    return false;
  }

  // AI Settings & Logs
  public getAISettings(): AISettingsState {
    this.data.aiSettings.apiKeyConfigured = !!process.env.GEMINI_API_KEY;
    return this.data.aiSettings;
  }

  public updateAISettings(settings: Partial<AISettingsState>): AISettingsState {
    this.data.aiSettings = { ...this.data.aiSettings, ...settings };
    this.save();
    return this.data.aiSettings;
  }

  public logAIUsage(log: Omit<AIUsageLog, 'id' | 'timestamp'>) {
    const newLog: AIUsageLog = {
      ...log,
      id: `ai-log-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
    };
    this.data.aiUsageLogs.unshift(newLog);
    if (this.data.aiUsageLogs.length > 200) {
      this.data.aiUsageLogs.pop();
    }
    this.data.aiSettings.totalRequests += 1;
    this.save();
    return newLog;
  }

  public getAILogs(): AIUsageLog[] {
    return this.data.aiUsageLogs;
  }

  // Tamper-Evident Central Audit Logs (Append-only hash chain + automatic secret redaction)
  public addAuditLog(
    userId: string,
    action: string,
    details: string,
    extra?: {
      actorName?: string;
      actorRole?: string;
      category?: AuditCategory;
      severity?: SecuritySeverity;
      subjectId?: string;
      examId?: string;
      targetUserId?: string;
      ipAddress?: string;
      userAgent?: string;
      result?: 'SUCCESS' | 'BLOCKED' | 'ERROR';
      reason?: string;
    }
  ): AuditLogEntry {
    if (!Array.isArray(this.data.auditLogs)) {
      this.data.auditLogs = [];
    }
    const latest = this.data.auditLogs[0];
    const prevHash = latest?.entryHash || 'GENESIS';
    const actor = userId && userId !== 'system' && userId !== 'anonymous' ? this.findUserById(userId) : undefined;
    const baseEntry: Omit<AuditLogEntry, 'entryHash'> = {
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      userId,
      actorName: extra?.actorName || actor?.name || userId,
      actorRole: extra?.actorRole || actor?.role || 'Unknown',
      action,
      category: extra?.category || (action.startsWith('SECURITY') ? 'SECURITY' : 'ADMIN'),
      severity: extra?.severity || (action.includes('BLOCKED') || action.includes('SPOOF') ? 'HIGH' : 'INFO'),
      details: redactSensitiveText(details),
      subjectId: extra?.subjectId,
      examId: extra?.examId,
      targetUserId: extra?.targetUserId,
      ipAddress: extra?.ipAddress,
      userAgent: extra?.userAgent,
      result: extra?.result || 'SUCCESS',
      reason: extra?.reason ? redactSensitiveText(extra.reason) : undefined,
      prevHash,
    };

    const fullEntry: AuditLogEntry = {
      ...baseEntry,
      entryHash: computeAuditEntryHash(prevHash, baseEntry),
    };

    this.data.auditLogs.unshift(fullEntry);
    // Keep structured retention cap (last 2000 entries)
    if (this.data.auditLogs.length > 2000) {
      this.data.auditLogs.pop();
    }
    this.save();
    return fullEntry;
  }

  public getAuditLogs(filters?: {
    category?: string;
    severity?: string;
    userId?: string;
    search?: string;
    limit?: number;
  }): AuditLogEntry[] {
    let list = [...(this.data.auditLogs || [])];
    if (filters?.category) {
      list = list.filter((l) => l.category === filters.category);
    }
    if (filters?.severity) {
      list = list.filter((l) => l.severity === filters.severity);
    }
    if (filters?.userId) {
      list = list.filter((l) => l.userId === filters.userId || l.targetUserId === filters.userId);
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      list = list.filter(
        (l) =>
          l.action.toLowerCase().includes(q) ||
          l.details.toLowerCase().includes(q) ||
          (l.actorName && l.actorName.toLowerCase().includes(q)) ||
          (l.ipAddress && l.ipAddress.toLowerCase().includes(q))
      );
    }
    if (filters?.limit && filters.limit > 0) {
      return list.slice(0, filters.limit);
    }
    return list;
  }

  public verifyAuditLogIntegrity(): {
    valid: boolean;
    chainedCount: number;
    legacyCount: number;
    brokenEntryIds: string[];
  } {
    const logs = this.data.auditLogs || [];
    const brokenEntryIds: string[] = [];
    let chainedCount = 0;
    let legacyCount = 0;

    for (let i = 0; i < logs.length; i++) {
      const entry = logs[i];
      if (!entry.entryHash) {
        legacyCount++;
        continue;
      }
      chainedCount++;
      const expected = computeAuditEntryHash(entry.prevHash || 'GENESIS', entry);
      if (expected !== entry.entryHash) {
        brokenEntryIds.push(entry.id);
      }
    }

    return {
      valid: brokenEntryIds.length === 0,
      chainedCount,
      legacyCount,
      brokenEntryIds,
    };
  }

  // Notifications (Role-Scoped & Strictly Filtered)
  public addNotification(
    input: Omit<NotificationItem, 'id' | 'readBy' | 'createdAt'>
  ): NotificationItem {
    if (!Array.isArray(this.data.notifications)) {
      this.data.notifications = [];
    }
    const item: NotificationItem = {
      ...input,
      title: redactSensitiveText(input.title),
      message: redactSensitiveText(input.message),
      reason: input.reason ? redactSensitiveText(input.reason) : undefined,
      id: `notif-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      readBy: [],
      createdAt: new Date().toISOString(),
    };
    this.data.notifications.unshift(item);
    if (this.data.notifications.length > 500) {
      this.data.notifications.pop();
    }
    this.save();
    return item;
  }

  public getNotificationsForUser(user: User): NotificationItem[] {
    const list = this.data.notifications || [];
    const isOwner = user.role === 'PlatformOwner' || user.role === 'Administrator';
    const isSchoolAdmin = user.role === 'SchoolAdmin';

    return list.filter((n) => {
      if (isOwner) {
        return n.recipientScope === 'OWNER' || n.recipientUserId === user.id;
      }
      if (isSchoolAdmin) {
        // SchoolAdmin NEVER sees SECURITY or OWNER-only registration alerts
        if (n.category === 'SECURITY') return false;
        return n.recipientScope === 'SCHOOL_ADMIN' || n.recipientUserId === user.id;
      }
      // Teacher strictly sees ONLY their personal workspace/account notifications
      return n.recipientScope === 'USER' && n.recipientUserId === user.id;
    });
  }

  public markNotificationRead(notificationId: string, user: User): boolean {
    const visible = this.getNotificationsForUser(user).find((n) => n.id === notificationId);
    if (!visible) return false;
    if (!visible.readBy.includes(user.id)) {
      visible.readBy.push(user.id);
      this.save();
    }
    return true;
  }

  public markAllNotificationsRead(user: User): number {
    const visible = this.getNotificationsForUser(user);
    let updated = 0;
    for (const n of visible) {
      if (!n.readBy.includes(user.id)) {
        n.readBy.push(user.id);
        updated++;
      }
    }
    if (updated > 0) this.save();
    return updated;
  }

  // Backup, Restore & Storage Status
  public createBackup(): string {
    const filename = `backup-qaflah-${Date.now()}.json`;
    const filepath = path.join(BACKUP_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(this.data, null, 2), { encoding: 'utf-8', mode: 0o600 });
    try { fs.chmodSync(filepath, 0o600); } catch { /* ignore unsupported permission changes */ }
    return filename;
  }

  public listBackups(): string[] {
    if (!fs.existsSync(BACKUP_DIR)) return [];
    return fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.json')).reverse();
  }

  public getBackupContent(filename: string): string | null {
    const safeName = path.basename(filename);
    const filepath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(filepath)) return null;
    return fs.readFileSync(filepath, 'utf-8');
  }

  public getCurrentSnapshotJson(): string {
    return JSON.stringify(this.data, null, 2);
  }

  public restoreBackup(filename: string): boolean {
    const safeName = path.basename(filename);
    const filepath = path.join(BACKUP_DIR, safeName);
    if (!fs.existsSync(filepath)) return false;
    try {
      const content = fs.readFileSync(filepath, 'utf-8');
      return this.restoreFromJsonString(content);
    } catch (e) {
      console.error('Failed to restore backup:', e);
      return false;
    }
  }

  public restoreFromJsonString(jsonContent: string): boolean {
    try {
      const parsed = JSON.parse(jsonContent);
      if (!parsed || !Array.isArray(parsed.users) || !Array.isArray(parsed.exams)) {
        return false;
      }
      if (!Array.isArray(parsed.registrationRequests)) parsed.registrationRequests = [];
      if (!Array.isArray(parsed.notifications)) parsed.notifications = [];
      if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];
      if (!Array.isArray(parsed.layoutTemplates)) parsed.layoutTemplates = [];
      this.data = parsed;
      this.save();
      return true;
    } catch {
      return false;
    }
  }

  public getStorageStatus() {
    const isCloudRun = Boolean(process.env.K_SERVICE || process.env.K_REVISION);
    const hasExternalDb = Boolean(
      process.env.DATABASE_URL || process.env.GCS_BACKUP_BUCKET || process.env.FIRESTORE_PROJECT_ID
    );
    const dbExists = fs.existsSync(DB_FILE);
    const dbSizeBytes = dbExists ? fs.statSync(DB_FILE).size : 0;
    return {
      engine: 'Atomic Local JSON Storage',
      dbPath: DB_FILE,
      backupDir: BACKUP_DIR,
      dbExists,
      dbSizeKb: Math.round(dbSizeBytes / 1024),
      backupsCount: this.listBackups().length,
      isCloudRunEnvironment: isCloudRun,
      kService: process.env.K_SERVICE || null,
      kRevision: process.env.K_REVISION || null,
      hasExternalPersistentStore: hasExternalDb,
      ephemeralContainerDiskWarning: isCloudRun && !hasExternalDb,
      totals: {
        users: this.data.users.length,
        activeUsers: this.data.users.filter((u) => (u.status || 'ACTIVE') === 'ACTIVE').length,
        pendingRequests: (this.data.registrationRequests || []).filter(
          (r) => r.status === 'PENDING_APPROVAL' || r.status === 'NEEDS_EDIT'
        ).length,
        subjects: this.data.subjects.length,
        exams: this.data.exams.length,
        archivedExams: this.data.archive.length,
        questions: this.data.questions.length,
        auditLogs: this.data.auditLogs.length,
        notifications: (this.data.notifications || []).length,
      },
    };
  }

  public resetToDefaults() {
    this.data.curricula = defaultCurricula;
    this.data.questions = defaultQuestions;
    this.data.exams = defaultExams;
    this.save();
  }
}

export const db = new Database();
