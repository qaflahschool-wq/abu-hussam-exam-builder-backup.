import fs from 'fs';
import path from 'path';
import { authenticatedRequest } from './test-utils/authenticated-request.js';

async function request(endpoint: string, options: any = {}) {
  return authenticatedRequest(endpoint, options);
}

async function runFidelityVerification() {
  console.log('================================================================');
  console.log('   ABU HUSSAM EXAM BUILDER - SOURCE FIDELITY VALIDATION TEST   ');
  console.log('   Unit 2 Lesson 2.2 - "How does he come to school?"            ');
  console.log('================================================================\n');

  const unit2Lesson2Analysis = {
    documentTitle: 'Unit 2, Lesson 2.2: How does he come to school?',
    detectedTopic: 'Unit 2, Lesson 2.2: Transportation to School',
    suggestedGrade: 'Grade 8',
    suggestedUnits: ['Unit 2: Daily Life and Transportation'],
    rawText: `Unit 2, Lesson 2.2: How does he come to school?
The teacher, Saleh, Fuad, Ahmed, Taha.
He drives to school.
He runs to school.
He comes to school by bus.
He comes to school by bicycle.
He walks to school.`,
    extractedEntities: {
      characters: ['The teacher', 'Saleh', 'Fuad', 'Ahmed', 'Taha'],
      locations: ['school'],
      actions: [
        'drives to school',
        'runs to school',
        'comes to school by bus',
        'comes to school by bicycle',
        'walks to school',
      ],
      relations: [
        { subject: 'The teacher', relation: 'travel_mode', object: 'drives to school' },
        { subject: 'Saleh', relation: 'travel_mode', object: 'walks to school' },
        { subject: 'Fuad', relation: 'travel_mode', object: 'runs to school' },
        { subject: 'Ahmed', relation: 'travel_mode', object: 'comes to school by bus' },
        { subject: 'Taha', relation: 'travel_mode', object: 'comes to school by bicycle' },
      ],
    },
    grammarConcepts: [
      {
        concept: 'Present Simple - Means of Transportation',
        arabicName: 'المضارع البسيط ووسائل المواصلات',
        ruleFormula: 'How does + [he/she] + come to school? -> He [walks / runs / drives / comes by bus]',
        explanationEn: 'Use present simple with -s suffix for singular 3rd person to describe school travel routines.',
        explanationAr: 'استخدام صيغة المفرد الغائب للتعبير عن وسيلة الوصول إلى المدرسة.',
        examples: ['Saleh walks to school.', 'Fuad runs to school.', 'He comes to school by bus.'],
      },
    ],
    vocabulary: [
      { word: 'bicycle', arabicTranslation: 'دراجة هوائية' },
      { word: 'bus', arabicTranslation: 'حافلة' },
      { word: 'drive', arabicTranslation: 'يقود سيارة' },
      { word: 'run', arabicTranslation: 'يجري' },
      { word: 'walk', arabicTranslation: 'يمشي' },
      { word: 'school', arabicTranslation: 'مدرسة' },
      { word: 'teacher', arabicTranslation: 'معلم' },
    ],
    readingPassages: [
      'How does he come to school? The teacher drives to school. Saleh walks to school. Fuad runs to school. Ahmed comes to school by bus. Taha comes to school by bicycle.',
    ],
  };

  const results: any[] = [];

  // =========================================================================
  // TEST 1: PRE-FIX vs POST-FIX VALIDATION ON REPORTED DEFECT 1: "Sara lives near the school"
  // =========================================================================
  console.log('--- [TEST 1] Validation on Reported Defect 1: "Sara lives near the school" ---');
  const badQ1 = {
    id: 'test-bad-1',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE', // Claimed as IMAGE_SOURCE prior to fix
    questionText: 'Sara lives near the school and she walks to class every day.',
    modelAnswer: 'Sara',
    instructions: 'Choose the correct name:',
    options: ['Sara', 'Mona', 'Nada', 'Huda'],
    createdAt: new Date().toISOString(),
  };

  const valRes1 = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({
      question: badQ1,
      analysis: unit2Lesson2Analysis,
      contentScope: 'IMAGES_CURRICULUM',
    }),
  });

  const t1Passed =
    valRes1.ok &&
    valRes1.data.foreignEntities.includes('Sara') &&
    valRes1.data.reclassified === true &&
    valRes1.data.validatedQuestion.sourceCode === 'APPLICATION' &&
    valRes1.data.score < 80;

  console.log('Test 1 Result:', {
    originalSourceCode: badQ1.sourceCode,
    validatedSourceCode: valRes1.data?.validatedQuestion?.sourceCode,
    fidelityScore: valRes1.data?.score,
    foreignEntities: valRes1.data?.foreignEntities,
    warning: valRes1.data?.warning,
    reclassified: valRes1.data?.reclassified,
  });

  results.push({
    test: '1. Rejection of ungrounded character "Sara" as IMAGE_SOURCE',
    status: t1Passed ? 'PASS' : 'FAIL',
    evidence: `Detected foreign entity: ${valRes1.data?.foreignEntities?.join(', ')}. Score: ${valRes1.data?.score}%. Reclassified to: ${valRes1.data?.validatedQuestion?.sourceCode}. Warning generated.`,
  });

  // =========================================================================
  // TEST 2: PRE-FIX vs POST-FIX VALIDATION ON REPORTED DEFECT 2: "He drives a bicycle to the market"
  // =========================================================================
  console.log('\n--- [TEST 2] Validation on Reported Defect 2: "He drives a bicycle to the market" ---');
  const badQ2 = {
    id: 'test-bad-2',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'He drives a bicycle to the market every morning.',
    modelAnswer: 'False',
    instructions: 'Is this statement true or false?',
    options: ['True', 'False'],
    createdAt: new Date().toISOString(),
  };

  const valRes2 = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({
      question: badQ2,
      analysis: unit2Lesson2Analysis,
      contentScope: 'IMAGES_CURRICULUM',
    }),
  });

  const t2Passed =
    valRes2.ok &&
    valRes2.data.foreignEntities.some((f: string) => f.includes('market') || f.includes('bicycle')) &&
    valRes2.data.reclassified === true &&
    valRes2.data.validatedQuestion.sourceCode === 'APPLICATION';

  console.log('Test 2 Result:', {
    originalSourceCode: badQ2.sourceCode,
    validatedSourceCode: valRes2.data?.validatedQuestion?.sourceCode,
    fidelityScore: valRes2.data?.score,
    foreignEntities: valRes2.data?.foreignEntities,
    warning: valRes2.data?.warning,
  });

  results.push({
    test: '2. Rejection of ungrounded destination "market" and collocation mismatch as IMAGE_SOURCE',
    status: t2Passed ? 'PASS' : 'FAIL',
    evidence: `Detected foreign entities: ${valRes2.data?.foreignEntities?.join(', ')}. Score: ${valRes2.data?.score}%. Reclassified to APPLICATION.`,
  });

  // =========================================================================
  // TEST 3: STRICT IMAGE_ONLY SCOPE — REFUSE RANDOM REPAIR & FLAG TEACHER REVIEW
  // =========================================================================
  console.log('\n--- [TEST 3] Strict IMAGES_ONLY Scope Non-Random Grounding Gate ---');
  const valRes3 = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({
      question: badQ1,
      analysis: unit2Lesson2Analysis,
      contentScope: 'IMAGES_ONLY',
    }),
  });

  const q3Repaired = valRes3.data?.validatedQuestion;
  const t3Passed =
    valRes3.ok &&
    valRes3.data.passed === false &&
    valRes3.data.requiresTeacherReview === true &&
    q3Repaired?.sourceCode !== 'IMAGE_SOURCE' &&
    valRes3.data.score < 80;

  console.log('Test 3 Result (IMAGES_ONLY non-random gate):', {
    originalText: badQ1.questionText,
    validatedSourceCode: q3Repaired?.sourceCode,
    requiresTeacherReview: valRes3.data?.requiresTeacherReview,
    passed: valRes3.data?.passed,
    score: valRes3.data?.score,
    warning: valRes3.data?.warning,
  });

  results.push({
    test: '3. Strict IMAGES_ONLY Gate Refuses Random Repair & Flags Teacher Review (Multiple Foreign Names)',
    status: t3Passed ? 'PASS' : 'FAIL',
    evidence: `Refused blind replacement; requiresTeacherReview=${valRes3.data?.requiresTeacherReview}, reclassified=${q3Repaired?.sourceCode}, score=${valRes3.data?.score}%.`,
  });

  // =========================================================================
  // TEST 4: VERIFICATION OF GENUINE IMAGE_SOURCE QUESTION (100% FIDELITY)
  // =========================================================================
  console.log('\n--- [TEST 4] Verification of Genuine Grounded Question ---');
  const authenticQ = {
    id: 'test-good-1',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'How does Saleh come to school?',
    modelAnswer: 'He walks to school.',
    instructions: 'Choose the correct answer based on the lesson:',
    options: ['He walks to school.', 'He runs to school.', 'He comes by bus.', 'He drives to school.'],
    createdAt: new Date().toISOString(),
  };

  const valRes4 = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({
      question: authenticQ,
      analysis: unit2Lesson2Analysis,
      contentScope: 'IMAGES_ONLY',
    }),
  });

  const t4Passed =
    valRes4.ok &&
    valRes4.data.score >= 95 &&
    valRes4.data.foreignEntities.length === 0 &&
    valRes4.data.groundedEntities.includes('Saleh') &&
    valRes4.data.groundedEntities.includes('school') &&
    valRes4.data.validatedQuestion.sourceCode === 'IMAGE_SOURCE';

  console.log('Test 4 Result (Authentic Grounded Question):', {
    sourceCode: valRes4.data?.validatedQuestion?.sourceCode,
    fidelityScore: valRes4.data?.score,
    groundedEntities: valRes4.data?.groundedEntities,
    foreignEntities: valRes4.data?.foreignEntities,
    hasWarning: !!valRes4.data?.warning,
  });

  results.push({
    test: '4. Full Confirmation of Authentic Grounded Question (100% Fidelity)',
    status: t4Passed ? 'PASS' : 'FAIL',
    evidence: `Score: ${valRes4.data?.score}%. Grounded entities: ${valRes4.data?.groundedEntities?.join(', ')}. Zero foreign entities.`,
  });

  // =========================================================================
  // TEST 5: END-TO-END QUESTION GENERATION WITH UNIT 2 LESSON 2.2
  // =========================================================================
  console.log('\n--- [TEST 5] End-to-End Generation & Strict Non-Hallucination Audit ---');
  const genRes = await request('/vision/generate-questions', {
    method: 'POST',
    body: JSON.stringify({
      analysis: unit2Lesson2Analysis,
      grade: 'Grade 8',
      contentScope: 'IMAGES_ONLY',
      educationalLevel: 'BASIC',
      selectedQuestionTypes: ['Multiple Choice', 'Fill in the Blanks', 'True or False'],
      count: 4,
      saveToBank: true,
      teacherNotes: 'Focus on Lesson 2.2 characters and transportation verbs',
    }),
  });

  const generatedList: any[] = genRes.data?.questions || [];
  console.log(`Generated ${generatedList.length} questions:`);

  let saraFound = false;
  let marketFound = false;
  let allFidelityPassed = true;

  generatedList.forEach((q, idx) => {
    const fullText = `${q.questionText} ${q.modelAnswer} ${(q.options || []).join(' ')}`;
    const hasSara = /\bSara\b/i.test(fullText);
    const hasMarket = /\bmarket\b/i.test(fullText);
    if (hasSara) saraFound = true;
    if (hasMarket) marketFound = true;

    if (q.sourceCode === 'IMAGE_SOURCE' && (q.sourceFidelityScore || 100) < 85) {
      allFidelityPassed = false;
    }

    console.log(`  [Q${idx + 1}] (${q.sourceCode}) [Fidelity: ${q.sourceFidelityScore}%]: "${q.questionText}"`);
    console.log(`       Answer: "${q.modelAnswer}" | Grounded: [${(q.groundedEntities || []).join(', ')}]`);
    if (q.fidelityWarning) {
      console.log(`       ⚠️ Warning: ${q.fidelityWarning}`);
    }
  });

  const t5Passed =
    genRes.ok &&
    generatedList.length >= 3 &&
    !saraFound &&
    !marketFound &&
    allFidelityPassed;

  results.push({
    test: '5. Real Generation from Unit 2 Lesson 2.2 (Zero "Sara" / Zero "market" in IMAGE_SOURCE)',
    status: t5Passed ? 'PASS' : 'FAIL',
    evidence: `Sara Found: ${saraFound ? 'YES (FAIL)' : 'NO (CLEAN)'}, Market Found: ${marketFound ? 'YES (FAIL)' : 'NO (CLEAN)'}, Min Fidelity: ${Math.min(...generatedList.map((q) => q.sourceFidelityScore || 100))}%.`,
  });

  // =========================================================================
  // SUMMARY TABLE
  // =========================================================================
  console.log('\n================================================================');
  console.log('                 FINAL TEST EXECUTION SUMMARY                    ');
  console.log('================================================================');
  results.forEach((r, i) => {
    const icon = r.status === 'PASS' ? '✅ PASS' : '❌ FAIL';
    console.log(`${icon} | ${r.test}`);
    console.log(`       Evidence: ${r.evidence}`);
  });
  console.log('================================================================\n');

  const allPassed = results.every((r) => r.status === 'PASS');
  if (!allPassed) {
    console.error('CRITICAL: One or more fidelity tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 ALL SOURCE FIDELITY TESTS PASSED WITH 100% SUCCESS RATE!');
    process.exit(0);
  }
}

runFidelityVerification().catch((err) => {
  console.error('Fatal error in test script:', err);
  process.exit(1);
});
