const API_BASE = 'http://localhost:3000/api';

async function request(endpoint: string, options: any = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': 'usr-admin',
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  return { status: res.status, ok: res.ok, data };
}

function printQuestionReport(label: string, resData: any) {
  console.log(`\n📌 ${label}`);
  console.log(`   - Question Text         : "${resData.validatedQuestion?.questionText}"`);
  if (resData.validatedQuestion?.originalQuestionText) {
    console.log(`   - Original Text (Audit) : "${resData.validatedQuestion.originalQuestionText}"`);
  }
  console.log(`   - Model Answer          : "${resData.validatedQuestion?.modelAnswer}"`);
  console.log(`   - Source Fidelity Score : ${resData.score}%`);
  console.log(`   - Relationship Accuracy : ${resData.metrics?.relationshipAccuracy}%`);
  console.log(`   - Answer Grounding      : ${resData.metrics?.answerGrounding}%`);
  console.log(`   - Breakdown (E/R/C/A/S) : ${resData.metrics?.entityAccuracy}/${resData.metrics?.relationshipAccuracy}/${resData.metrics?.contextAccuracy}/${resData.metrics?.answerGrounding}/${resData.metrics?.semanticConsistency}`);
  console.log(`   - Final Classification  : ${resData.validatedQuestion?.sourceCode} (reclassified=${resData.reclassified})`);
  console.log(`   - passed                : ${resData.passed}`);
  console.log(`   - requiresTeacherReview : ${resData.requiresTeacherReview}`);
  console.log(`   - acceptanceReason      : ${resData.acceptanceReason}`);
}

async function runSemanticFidelityTests() {
  console.log('========================================================================');
  console.log('   ABU HUSSAM EXAM BUILDER — SEMANTIC FIDELITY & RELATIONSHIP AUDIT     ');
  console.log('========================================================================');

  // Standard Unit 2 Lesson 2.2 analysis (plus one character "Nasser" mentioned without proven action for Case 1b)
  const unit2Lesson2Analysis = {
    documentTitle: 'Unit 2, Lesson 2.2: How does he come to school?',
    detectedTopic: 'Unit 2, Lesson 2.2: Transportation to School',
    suggestedGrade: 'Grade 8',
    suggestedUnits: ['Unit 2: Daily Life and Transportation'],
    rawText: `Unit 2, Lesson 2.2: How does he come to school?
Characters: The teacher, Saleh, Fuad, Ahmed, Taha, Nasser.
The teacher drives to school.
Saleh walks to school.
Fuad runs to school.
Ahmed comes to school by bus.
Taha comes to school by bicycle.`,
    extractedEntities: {
      characters: ['The teacher', 'Saleh', 'Fuad', 'Ahmed', 'Taha', 'Nasser'],
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
    vocabulary: [
      { word: 'bicycle', arabicTranslation: 'دراجة' },
      { word: 'bus', arabicTranslation: 'حافلة' },
      { word: 'drive', arabicTranslation: 'يقود' },
      { word: 'run', arabicTranslation: 'يجري' },
      { word: 'walk', arabicTranslation: 'يمشي' },
      { word: 'school', arabicTranslation: 'مدرسة' },
    ],
  };

  const assertions: { name: string; pass: boolean; detail: string }[] = [];

  // =========================================================================
  // POSITIVE CONTROL: Genuine MCQ with distractors (must score 100%, no false penalty on distractors)
  // =========================================================================
  const authenticMcq = {
    id: 'ctrl-1',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'How does Saleh come to school?',
    modelAnswer: 'He walks to school.',
    options: ['He walks to school.', 'He runs to school.', 'He drives to school.', 'He comes by bus.'],
    createdAt: new Date().toISOString(),
  };
  const ctrlRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: authenticMcq, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CONTROL (Authentic MCQ with Valid Distractors)', ctrlRes.data);
  assertions.push({
    name: 'Control: Authentic MCQ with valid distractors scores 100%',
    pass:
      ctrlRes.ok &&
      ctrlRes.data.score === 100 &&
      ctrlRes.data.metrics.relationshipAccuracy === 100 &&
      ctrlRes.data.metrics.answerGrounding === 100 &&
      ctrlRes.data.requiresTeacherReview === false &&
      ctrlRes.data.validatedQuestion.sourceCode === 'IMAGE_SOURCE',
    detail: `score=${ctrlRes.data.score}%, rel=${ctrlRes.data.metrics?.relationshipAccuracy}%`,
  });

  // =========================================================================
  // CASE 1: Existing character with an action NOT proven for them
  // 1a) Saleh (proven: walks) claimed to drive; 1b) Nasser (in characters list, no action proven) claimed to walk
  // =========================================================================
  const case1aQ = {
    id: 'case-1a',
    grade: 'Grade 8',
    type: 'True or False',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Saleh drives to school every morning.',
    modelAnswer: 'True',
    options: ['True', 'False'],
    createdAt: new Date().toISOString(),
  };
  const case1aRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case1aQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_CURRICULUM' }),
  });
  printQuestionReport('CASE 1a (Existing character + contradicting action)', case1aRes.data);

  const case1bQ = {
    id: 'case-1b',
    grade: 'Grade 8',
    type: 'Complete the Sentences',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Nasser walks to school.',
    modelAnswer: 'walks',
    createdAt: new Date().toISOString(),
  };
  const case1bRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case1bQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 1b (Existing character "Nasser" + unproven action "walks")', case1bRes.data);

  assertions.push({
    name: 'Case 1: Existing character with unproven/contradicting action rejected & flagged',
    pass:
      case1aRes.ok &&
      case1aRes.data.score < 80 &&
      case1aRes.data.metrics.relationshipAccuracy < 50 &&
      case1aRes.data.passed === false &&
      case1aRes.data.requiresTeacherReview === true &&
      case1aRes.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE' &&
      case1bRes.ok &&
      case1bRes.data.score <= 85 &&
      case1bRes.data.metrics.relationshipAccuracy <= 30 &&
      case1bRes.data.passed === false &&
      case1bRes.data.requiresTeacherReview === true &&
      case1bRes.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE',
    detail: `1a(score=${case1aRes.data.score}%, rel=${case1aRes.data.metrics?.relationshipAccuracy}%, review=${case1aRes.data.requiresTeacherReview}), 1b(score=${case1bRes.data.score}%, rel=${case1bRes.data.metrics?.relationshipAccuracy}%, review=${case1bRes.data.requiresTeacherReview})`,
  });

  // =========================================================================
  // CASE 2: Non-existent character with an action existing in source
  // 2a) IMAGES_CURRICULUM: "Khalid runs to school." -> Reclassified to APPLICATION, never IMAGE_SOURCE
  // 2b) IMAGES_ONLY (unique relation): "Sara walks to school." -> Safe reformulation to Saleh with originalQuestionText preserved
  // 2c) IMAGES_ONLY (ambiguous multi-match): "Tariq goes to school." -> Wait, use ambiguous shared action across 2 chars in a 2-walker source -> must NOT randomly pick!
  // =========================================================================
  const case2aQ = {
    id: 'case-2a',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Khalid runs to school.',
    modelAnswer: 'runs',
    options: ['runs', 'walks', 'drives', 'swims'],
    createdAt: new Date().toISOString(),
  };
  const case2aRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case2aQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_CURRICULUM' }),
  });
  printQuestionReport('CASE 2a (Non-existent character "Khalid" + source action under IMAGES_CURRICULUM)', case2aRes.data);

  const case2bQ = {
    id: 'case-2b',
    grade: 'Grade 8',
    type: 'Complete the Sentences',
    difficulty: 'Easy',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Sara walks to school.',
    modelAnswer: 'Sara',
    createdAt: new Date().toISOString(),
  };
  const case2bRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case2bQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 2b (Non-existent character "Sara" + unique action -> Audited Reformulation under IMAGES_ONLY)', case2bRes.data);

  // Case 2c: Source has TWO characters who walk -> repairing "Rami walks to school" cannot know which one, so must NOT randomly replace!
  const twoWalkersAnalysis = {
    documentTitle: 'Two walkers',
    rawText: 'Saleh walks to school. Bilal walks to school.',
  };
  const case2cQ = {
    id: 'case-2c',
    grade: 'Grade 8',
    type: 'Complete the Sentences',
    difficulty: 'Easy',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Rami walks to school.',
    modelAnswer: 'walks',
    createdAt: new Date().toISOString(),
  };
  const case2cRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case2cQ, analysis: twoWalkersAnalysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 2c (Non-existent "Rami" when 2 walkers exist -> Must NOT randomly guess!)', case2cRes.data);

  assertions.push({
    name: 'Case 2: Non-existent character rejected as IMAGE_SOURCE; non-random repair only when unique',
    pass:
      case2aRes.ok &&
      case2aRes.data.validatedQuestion.sourceCode === 'APPLICATION' &&
      case2aRes.data.foreignEntities.includes('Khalid') &&
      case2bRes.ok &&
      case2bRes.data.validatedQuestion.questionText === 'Saleh walks to school.' &&
      case2bRes.data.validatedQuestion.originalQuestionText === 'Sara walks to school.' &&
      case2cRes.ok &&
      case2cRes.data.passed === false &&
      case2cRes.data.requiresTeacherReview === true &&
      case2cRes.data.validatedQuestion.questionText === 'Rami walks to school.' &&
      case2cRes.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE',
    detail: `2a(code=${case2aRes.data.validatedQuestion?.sourceCode}), 2b(repaired="${case2bRes.data.validatedQuestion?.questionText}", orig="${case2bRes.data.validatedQuestion?.originalQuestionText}"), 2c(passed=${case2cRes.data.passed}, review=${case2cRes.data.requiresTeacherReview})`,
  });

  // =========================================================================
  // CASE 3: Correct location ("school") with wrong relationship
  // =========================================================================
  const case3Q = {
    id: 'case-3',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'How does Ahmed come to school?',
    modelAnswer: 'He walks to school.',
    options: ['He walks to school.', 'He comes to school by bus.', 'He runs to school.', 'He drives to school.'],
    createdAt: new Date().toISOString(),
  };
  const case3Res = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case3Q, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 3 (Correct location "school" + wrong character-transport relationship for Ahmed)', case3Res.data);

  assertions.push({
    name: 'Case 3: Correct location ("school") with wrong relationship fails relationshipAccuracy & answerGrounding',
    pass:
      case3Res.ok &&
      case3Res.data.metrics.contextAccuracy === 100 &&
      case3Res.data.metrics.relationshipAccuracy <= 30 &&
      case3Res.data.metrics.answerGrounding <= 20 &&
      case3Res.data.score <= 85 &&
      case3Res.data.passed === false &&
      case3Res.data.requiresTeacherReview === true &&
      case3Res.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE',
    detail: `context=${case3Res.data.metrics?.contextAccuracy}%, rel=${case3Res.data.metrics?.relationshipAccuracy}%, ans=${case3Res.data.metrics?.answerGrounding}%, score=${case3Res.data.score}%`,
  });

  // =========================================================================
  // CASE 4: Valid source words, but wrong modelAnswer
  // 4a) "Who runs to school?" with modelAnswer: "Saleh" (Saleh walks, Fuad runs!)
  // 4b) "Saleh walks to school." (T/F) with modelAnswer: "False" (all words 100% in source, wrong answer!)
  // =========================================================================
  const case4aQ = {
    id: 'case-4a',
    grade: 'Grade 8',
    type: 'Short Answer',
    difficulty: 'Medium',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Who runs to school?',
    modelAnswer: 'Saleh',
    createdAt: new Date().toISOString(),
  };
  const case4aRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case4aQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 4a (All words valid in source, wrong modelAnswer "Saleh" for "Who runs to school?")', case4aRes.data);

  const case4bQ = {
    id: 'case-4b',
    grade: 'Grade 8',
    type: 'True or False',
    difficulty: 'Easy',
    marks: 1,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Saleh walks to school.',
    modelAnswer: 'False',
    options: ['True', 'False'],
    createdAt: new Date().toISOString(),
  };
  const case4bRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case4bQ, analysis: unit2Lesson2Analysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 4b (True statement "Saleh walks to school." with wrong modelAnswer "False")', case4bRes.data);

  assertions.push({
    name: 'Case 4: Valid source words with wrong modelAnswer fails answerGrounding & requires teacher review',
    pass:
      case4aRes.ok &&
      case4aRes.data.metrics.entityAccuracy === 100 &&
      case4aRes.data.metrics.answerGrounding <= 20 &&
      case4aRes.data.score <= 85 &&
      case4aRes.data.passed === false &&
      case4aRes.data.requiresTeacherReview === true &&
      case4bRes.ok &&
      case4bRes.data.metrics.entityAccuracy === 100 &&
      case4bRes.data.metrics.answerGrounding <= 20 &&
      case4bRes.data.score <= 85 &&
      case4bRes.data.passed === false &&
      case4bRes.data.requiresTeacherReview === true,
    detail: `4a(ans=${case4aRes.data.metrics?.answerGrounding}%, score=${case4aRes.data.score}%), 4b(ans=${case4bRes.data.metrics?.answerGrounding}%, score=${case4bRes.data.score}%)`,
  });

  // =========================================================================
  // CASE 5: Multi-character transportation table (generalized table parsing, NOT Unit 2 characters!)
  // =========================================================================
  const tableAnalysis = {
    documentTitle: 'Travel Survey Table',
    detectedTopic: 'How People Travel',
    suggestedGrade: 'Grade 8',
    rawText: `Look at the table and answer the questions:
| Character | Means of Transport | Destination |
| --- | --- | --- |
| Sami | by train | town |
| Mona | by boat | harbour |
| Bilal | on foot | mosque |
| Yasser | by bicycle | library |`,
    vocabulary: [
      { word: 'train', arabicTranslation: 'قطار' },
      { word: 'boat', arabicTranslation: 'قارب' },
      { word: 'harbour', arabicTranslation: 'ميناء' },
      { word: 'mosque', arabicTranslation: 'مسجد' },
    ],
  };

  // 5a: Valid Matching question directly matching all 4 table rows
  const case5ValidMatching = {
    id: 'case-5a',
    grade: 'Grade 8',
    type: 'Matching',
    difficulty: 'Medium',
    marks: 4,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Match each person in Column A with their means of transport in Column B.',
    matchingPairs: [
      { left: 'Sami', right: 'by train' },
      { left: 'Mona', right: 'by boat' },
      { left: 'Bilal', right: 'walks' },
      { left: 'Yasser', right: 'by bicycle' },
    ],
    modelAnswer: 'Sami -> by train, Mona -> by boat, Bilal -> walks, Yasser -> by bicycle',
    createdAt: new Date().toISOString(),
  };
  const case5aRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case5ValidMatching, analysis: tableAnalysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 5a (Multi-character Table -> Valid Matching Question)', case5aRes.data);

  // 5b: Swapped Matching pair ("Sami -> by boat", "Mona -> by train") - every word exists in table, relations swapped!
  const case5SwappedMatching = {
    id: 'case-5b',
    grade: 'Grade 8',
    type: 'Matching',
    difficulty: 'Medium',
    marks: 4,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Match each person in Column A with their means of transport in Column B.',
    matchingPairs: [
      { left: 'Sami', right: 'by boat' },
      { left: 'Mona', right: 'by train' },
    ],
    modelAnswer: 'Sami -> by boat, Mona -> by train',
    createdAt: new Date().toISOString(),
  };
  const case5bRes = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case5SwappedMatching, analysis: tableAnalysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 5b (Multi-character Table -> Swapped Pairs Rejection)', case5bRes.data);

  assertions.push({
    name: 'Case 5: Multi-character markdown table parsing verifies valid pairs (100%) and rejects swapped pairs',
    pass:
      case5aRes.ok &&
      case5aRes.data.score === 100 &&
      case5aRes.data.metrics.relationshipAccuracy === 100 &&
      case5aRes.data.passed === true &&
      case5bRes.ok &&
      case5bRes.data.score <= 85 &&
      case5bRes.data.metrics.relationshipAccuracy <= 30 &&
      case5bRes.data.passed === false &&
      case5bRes.data.requiresTeacherReview === true &&
      case5bRes.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE',
    detail: `5a(score=${case5aRes.data.score}%, rel=${case5aRes.data.metrics?.relationshipAccuracy}%), 5b(score=${case5bRes.data.score}%, rel=${case5bRes.data.metrics?.relationshipAccuracy}%, review=${case5bRes.data.requiresTeacherReview})`,
  });

  // =========================================================================
  // CASE 6: Ambiguous / blurry image where character-action relationships cannot be determined
  // =========================================================================
  const ambiguousAnalysis = {
    documentTitle: 'Blurry Worksheet Page',
    detectedTopic: 'Transportation',
    suggestedGrade: 'Grade 8',
    rawText: `[AMBIGUOUS_RELATIONS]
Names visible: Saleh, Fuad, Ahmed.
Phrases visible: walks to school, runs to school, comes to school by bus.`,
    extractedEntities: {
      characters: ['Saleh', 'Fuad', 'Ahmed'],
      locations: ['school'],
      actions: ['walks to school', 'runs to school', 'comes to school by bus'],
      relations: [], // Cannot tell who does what!
    },
    imageQualityReport: {
      score: 48,
      legible: false,
      illegibleSegments: ['Arrows connecting character illustrations to transportation labels are blurry and unreadable'],
    },
  };

  const case6Q = {
    id: 'case-6',
    grade: 'Grade 8',
    type: 'Multiple Choice',
    difficulty: 'Easy',
    marks: 2,
    sourceCode: 'IMAGE_SOURCE',
    questionText: 'Saleh walks to school.',
    modelAnswer: 'walks',
    createdAt: new Date().toISOString(),
  };
  const case6Res = await request('/vision/validate-fidelity', {
    method: 'POST',
    body: JSON.stringify({ question: case6Q, analysis: ambiguousAnalysis, contentScope: 'IMAGES_ONLY' }),
  });
  printQuestionReport('CASE 6 (Ambiguous/Blurry Image with Unclear Relations)', case6Res.data);

  assertions.push({
    name: 'Case 6: Ambiguous image never reaches 100%, penalizes relationshipAccuracy, flags teacher review',
    pass:
      case6Res.ok &&
      case6Res.data.score < 100 &&
      case6Res.data.score <= 65 &&
      case6Res.data.metrics.relationshipAccuracy <= 50 &&
      case6Res.data.passed === false &&
      case6Res.data.requiresTeacherReview === true &&
      case6Res.data.validatedQuestion.sourceCode !== 'IMAGE_SOURCE',
    detail: `score=${case6Res.data.score}%, rel=${case6Res.data.metrics?.relationshipAccuracy}%, review=${case6Res.data.requiresTeacherReview}, code=${case6Res.data.validatedQuestion?.sourceCode}`,
  });

  // =========================================================================
  // LIVE END-TO-END GENERATION CHECK ON MULTI-CHARACTER TABLE
  // =========================================================================
  console.log('\n--- [LIVE GENERATION CHECK] Generating from Multi-Character Table via /api/vision/generate-questions ---');
  const genRes = await request('/vision/generate-questions', {
    method: 'POST',
    body: JSON.stringify({
      analysis: tableAnalysis,
      grade: 'Grade 8',
      contentScope: 'IMAGES_ONLY',
      educationalLevel: 'BASIC',
      selectedQuestionTypes: ['Multiple Choice', 'True or False'],
      count: 3,
      saveToBank: false,
      teacherNotes: 'Preserve exact character-transport pairs from the table.',
    }),
  });
  const genQuestions: any[] = genRes.data?.questions || [];
  genQuestions.forEach((q, idx) => {
    console.log(`  [Gen Q${idx + 1}] (${q.sourceCode}) score=${q.sourceFidelityScore}%, rel=${q.relationshipAccuracy}%, ans=${q.answerGroundingScore}%, review=${q.requiresTeacherReview}`);
    console.log(`            Q: "${q.questionText}" | A: "${q.modelAnswer}"`);
  });
  const no100WithLowRel = genQuestions.every((q) => !((q.relationshipAccuracy ?? 100) < 100 && (q.sourceFidelityScore ?? 0) === 100));
  assertions.push({
    name: 'Live Generation: No question receives 100% when relationshipAccuracy < 100',
    pass: genRes.ok && genQuestions.length > 0 && no100WithLowRel,
    detail: `generated=${genQuestions.length}, invariantHeld=${no100WithLowRel}`,
  });

  // =========================================================================
  // SUMMARY
  // =========================================================================
  console.log('\n========================================================================');
  console.log('                 SEMANTIC FIDELITY VERIFICATION SUMMARY                  ');
  console.log('========================================================================');
  let allOk = true;
  assertions.forEach((a) => {
    if (!a.pass) allOk = false;
    console.log(`${a.pass ? '✅ PASS' : '❌ FAIL'} | ${a.name}`);
    console.log(`         ${a.detail}`);
  });
  console.log('========================================================================\n');

  if (!allOk) {
    process.exit(1);
  }
  process.exit(0);
}

runSemanticFidelityTests().catch((err) => {
  console.error('Fatal error running semantic fidelity tests:', err);
  process.exit(1);
});
