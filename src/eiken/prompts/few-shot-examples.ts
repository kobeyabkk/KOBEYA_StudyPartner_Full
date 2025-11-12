/**
 * Few-shot Examples for Question Generation
 * 
 * 目的: GPT-4oに適切な語彙レベルの問題生成を教える
 * - Good examples: A1語彙のみを使用した良い例
 * - Bad examples: B1-B2語彙を含む悪い例
 * - Corrected examples: 悪い例をA1語彙に修正した例
 */

export interface FewShotExample {
  type: 'good' | 'bad' | 'corrected';
  questionText: string;
  choices: string[];
  correctIndex: number;
  explanation: string;
  vocabularyNotes: string;
  grammarPoint?: string;
}

/**
 * Grade 5 (A1レベル) Grammar Examples
 */
export const grade5GrammarExamples: FewShotExample[] = [
  // ✅ GOOD EXAMPLE 1: Present Simple
  {
    type: 'good',
    questionText: "My sister ( ) to school every day.",
    choices: ["go", "goes", "going", "went"],
    correctIndex: 1,
    explanation: "Third person singular present tense requires 's'",
    vocabularyNotes: "✅ All A1 vocabulary: sister, school, every, day",
    grammarPoint: "present simple tense - third person singular"
  },
  
  // ✅ GOOD EXAMPLE 2: Past Simple
  {
    type: 'good',
    questionText: "I ( ) a good book yesterday.",
    choices: ["read", "reads", "reading", "will read"],
    correctIndex: 0,
    explanation: "Past simple tense for completed action",
    vocabularyNotes: "✅ All A1 vocabulary: good, book, yesterday",
    grammarPoint: "past simple tense"
  },
  
  // ✅ GOOD EXAMPLE 3: Can/Can't
  {
    type: 'good',
    questionText: "Tom ( ) swim very well.",
    choices: ["can", "cans", "could", "will"],
    correctIndex: 0,
    explanation: "Modal verb 'can' for present ability",
    vocabularyNotes: "✅ All A1 vocabulary: swim, very, well",
    grammarPoint: "modal verbs - can for ability"
  },
  
  // ❌ BAD EXAMPLE: B1-B2 vocabulary
  {
    type: 'bad',
    questionText: "She was ( ) to receive the promotion at work.",
    choices: ["delighted", "happy", "glad", "pleased"],
    correctIndex: 0,
    explanation: "Tests adjective usage",
    vocabularyNotes: "❌ VIOLATION: 'delighted' (B2), 'receive' (B1), 'promotion' (B1) - Too advanced for A1!",
    grammarPoint: "past simple + adjective"
  },
  
  // ✅ CORRECTED EXAMPLE
  {
    type: 'corrected',
    questionText: "She was ( ) to get the good news.",
    choices: ["happy", "sad", "tired", "hungry"],
    correctIndex: 0,
    explanation: "Tests basic adjective with simple context",
    vocabularyNotes: "✅ FIXED: Replaced with A1 vocabulary: happy, get, good, news",
    grammarPoint: "past simple + adjective"
  },
  
  // ✅ GOOD EXAMPLE 4: There is/are
  {
    type: 'good',
    questionText: "( ) three books on the desk.",
    choices: ["There is", "There are", "They are", "It is"],
    correctIndex: 1,
    explanation: "Plural noun requires 'There are'",
    vocabularyNotes: "✅ All A1 vocabulary: three, books, desk",
    grammarPoint: "there is/are"
  },
  
  // ❌ BAD EXAMPLE 2: Complex vocabulary
  {
    type: 'bad',
    questionText: "The conference will ( ) next month.",
    choices: ["commence", "begin", "start", "open"],
    correctIndex: 0,
    explanation: "Tests future tense verb",
    vocabularyNotes: "❌ VIOLATION: 'conference' (B1), 'commence' (C1) - Too formal and advanced!",
    grammarPoint: "future tense"
  },
  
  // ✅ CORRECTED EXAMPLE 2
  {
    type: 'corrected',
    questionText: "The party will ( ) at seven o'clock.",
    choices: ["start", "end", "come", "go"],
    correctIndex: 0,
    explanation: "Tests future tense with simple context",
    vocabularyNotes: "✅ FIXED: Replaced with A1 vocabulary: party, start, seven, o'clock",
    grammarPoint: "future tense"
  }
];

/**
 * Grade 5 (A1レベル) Vocabulary Examples
 */
export const grade5VocabularyExamples: FewShotExample[] = [
  // ✅ GOOD EXAMPLE 1: Daily activities
  {
    type: 'good',
    questionText: "I ( ) breakfast at 7 o'clock every morning.",
    choices: ["eat", "make", "drink", "cook"],
    correctIndex: 0,
    explanation: "Tests common verb for eating meals",
    vocabularyNotes: "✅ All A1 vocabulary: breakfast, o'clock, every, morning",
    grammarPoint: "present simple - daily routine"
  },
  
  // ✅ GOOD EXAMPLE 2: Family
  {
    type: 'good',
    questionText: "My ( ) is a teacher at a school.",
    choices: ["mother", "sister", "daughter", "aunt"],
    correctIndex: 0,
    explanation: "Tests family vocabulary",
    vocabularyNotes: "✅ All A1 vocabulary: mother, teacher, school",
    grammarPoint: "possessive + be + occupation"
  },
  
  // ❌ BAD EXAMPLE: Academic vocabulary
  {
    type: 'bad',
    questionText: "The scientist will ( ) the experiment tomorrow.",
    choices: ["conduct", "do", "make", "perform"],
    correctIndex: 0,
    explanation: "Tests academic verb usage",
    vocabularyNotes: "❌ VIOLATION: 'scientist' (B1), 'conduct' (B2), 'experiment' (B1) - Too academic!",
    grammarPoint: "future tense"
  },
  
  // ✅ CORRECTED EXAMPLE
  {
    type: 'corrected',
    questionText: "My friend will ( ) his homework tomorrow.",
    choices: ["do", "make", "write", "read"],
    correctIndex: 0,
    explanation: "Tests common verb with daily activity",
    vocabularyNotes: "✅ FIXED: Replaced with A1 vocabulary: friend, homework, tomorrow",
    grammarPoint: "future tense"
  }
];

/**
 * Grade 4 (A2レベル) Examples
 * TODO: Implement when A2 vocabulary data is available
 */
export const grade4Examples = {
  grammar: [] as FewShotExample[],
  vocabulary: [] as FewShotExample[]
};

/**
 * Get few-shot examples for specific grade and section
 */
export function getFewShotExamples(
  grade: string,
  section: 'grammar' | 'vocabulary'
): FewShotExample[] {
  
  if (grade === '5') {
    return section === 'grammar' 
      ? grade5GrammarExamples 
      : grade5VocabularyExamples;
  }
  
  if (grade === '4') {
    return section === 'grammar'
      ? grade4Examples.grammar
      : grade4Examples.vocabulary;
  }
  
  // Default to Grade 5 examples for other grades (for now)
  return section === 'grammar'
    ? grade5GrammarExamples
    : grade5VocabularyExamples;
}

/**
 * Format few-shot examples for prompt
 */
export function formatFewShotExamples(examples: FewShotExample[]): string {
  const sections: string[] = [];
  
  // Group by type
  const goodExamples = examples.filter(e => e.type === 'good');
  const badExamples = examples.filter(e => e.type === 'bad');
  const correctedExamples = examples.filter(e => e.type === 'corrected');
  
  // Format good examples
  if (goodExamples.length > 0) {
    sections.push('## ✅ GOOD EXAMPLES (Follow these patterns):\n');
    goodExamples.forEach((ex, i) => {
      sections.push(`Example ${i + 1}:`);
      sections.push(`Question: ${ex.questionText}`);
      sections.push(`Choices: ${ex.choices.map((c, idx) => `${idx + 1}. ${c}`).join(', ')}`);
      sections.push(`Correct: ${ex.choices[ex.correctIndex]}`);
      sections.push(`Grammar: ${ex.grammarPoint || 'N/A'}`);
      sections.push(`Vocabulary: ${ex.vocabularyNotes}`);
      sections.push('');
    });
  }
  
  // Format bad examples with corrections
  if (badExamples.length > 0 && correctedExamples.length > 0) {
    sections.push('## ❌ BAD EXAMPLES → ✅ CORRECTED (Learn from these mistakes):\n');
    
    for (let i = 0; i < badExamples.length; i++) {
      const bad = badExamples[i];
      const corrected = correctedExamples[i];
      
      if (!corrected) continue;
      
      sections.push(`Mistake ${i + 1}:`);
      sections.push(`❌ WRONG: ${bad.questionText}`);
      sections.push(`   Problem: ${bad.vocabularyNotes}`);
      sections.push(`✅ CORRECT: ${corrected.questionText}`);
      sections.push(`   Why: ${corrected.vocabularyNotes}`);
      sections.push('');
    }
  }
  
  return sections.join('\n');
}
