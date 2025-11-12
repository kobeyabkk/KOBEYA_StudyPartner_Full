/**
 * Few-shot Prompt Builder
 * 
 * 目的: 語彙制約とFew-shot examplesを組み合わせて
 *      GPT-4oへの改善されたプロンプトを生成
 */

import { 
  getFewShotExamples, 
  formatFewShotExamples 
} from './few-shot-examples';

import { 
  getVocabularyConstraints, 
  formatVocabularyConstraints 
} from './vocabulary-constraints';

export interface FewShotPromptConfig {
  grade: string;
  section: 'grammar' | 'vocabulary';
  includeVocabularyConstraints: boolean;
  includeFewShotExamples: boolean;
  includeStrict

Warnings: boolean;
}

const DEFAULT_CONFIG: FewShotPromptConfig = {
  grade: '5',
  section: 'grammar',
  includeVocabularyConstraints: true,
  includeFewShotExamples: true,
  includeStrictWarnings: true
};

/**
 * Build complete few-shot prompt section
 */
export function buildFewShotPrompt(
  grade: string,
  section: 'grammar' | 'vocabulary',
  config: Partial<FewShotPromptConfig> = {}
): string {
  
  const finalConfig: FewShotPromptConfig = {
    ...DEFAULT_CONFIG,
    grade,
    section,
    ...config
  };
  
  const sections: string[] = [];
  
  // Header
  sections.push('═══════════════════════════════════════════════════════════');
  sections.push('📚 VOCABULARY CONSTRAINTS & FEW-SHOT EXAMPLES');
  sections.push('═══════════════════════════════════════════════════════════\n');
  
  // Vocabulary Constraints Section
  if (finalConfig.includeVocabularyConstraints) {
    const constraints = getVocabularyConstraints(finalConfig.grade);
    const formattedConstraints = formatVocabularyConstraints(constraints);
    sections.push(formattedConstraints);
    sections.push('\n');
  }
  
  // Few-shot Examples Section
  if (finalConfig.includeFewShotExamples) {
    const examples = getFewShotExamples(finalConfig.grade, finalConfig.section);
    const formattedExamples = formatFewShotExamples(examples);
    sections.push(formattedExamples);
    sections.push('\n');
  }
  
  // Strict Warnings Section
  if (finalConfig.includeStrictWarnings) {
    sections.push('═══════════════════════════════════════════════════════════');
    sections.push('🚨 CRITICAL REQUIREMENTS - READ CAREFULLY:');
    sections.push('═══════════════════════════════════════════════════════════\n');
    sections.push('1. ✅ You MUST use ONLY vocabulary from the allowed list above');
    sections.push('2. ❌ Any word outside the A1 vocabulary will cause AUTOMATIC REJECTION');
    sections.push('3. 📊 Your question will be validated against our 2,518-word A1 database');
    sections.push('4. 🎯 Follow the GOOD EXAMPLES exactly - same vocabulary level');
    sections.push('5. ⚠️ Avoid the patterns shown in BAD EXAMPLES');
    sections.push('6. 💡 If unsure about a word, choose a simpler alternative from the list');
    sections.push('7. 🔍 Every word will be checked: question text AND all 4 choices\n');
    sections.push('REMEMBER: Simple is better. A1 learners are beginners.');
    sections.push('Use everyday words that elementary school students would know.\n');
  }
  
  return sections.join('\n');
}

/**
 * Build enhanced system prompt with few-shot learning
 */
export function buildEnhancedSystemPrompt(
  basePrompt: string,
  grade: string,
  section: 'grammar' | 'vocabulary'
): string {
  
  const fewShotSection = buildFewShotPrompt(grade, section);
  
  return `${basePrompt}

${fewShotSection}

Now, keeping all the above constraints and examples in mind, generate an ORIGINAL question that:
- Uses ONLY A1 vocabulary from the allowed lists
- Follows the pattern of the GOOD EXAMPLES
- Avoids the mistakes in the BAD EXAMPLES
- Is completely unique and does not copy existing test materials`;
}

/**
 * Build compact few-shot prompt (for token efficiency)
 */
export function buildCompactFewShotPrompt(
  grade: string,
  section: 'grammar' | 'vocabulary'
): string {
  
  const constraints = getVocabularyConstraints(grade);
  const examples = getFewShotExamples(grade, section);
  
  // Only include top verbs, nouns, adjectives
  const topVerbs = constraints.allowedVocabulary.verbs.slice(0, 20);
  const topNouns = constraints.allowedVocabulary.nouns.slice(0, 30);
  const topAdj = constraints.allowedVocabulary.adjectives.slice(0, 15);
  
  // Only include 2 good examples and 1 bad→corrected pair
  const goodExamples = examples.filter(e => e.type === 'good').slice(0, 2);
  const badExample = examples.find(e => e.type === 'bad');
  const correctedExample = examples.find(e => e.type === 'corrected');
  
  const sections: string[] = [];
  
  sections.push('📚 VOCABULARY: Use ONLY these A1 words:');
  sections.push(`Verbs: ${topVerbs.join(', ')}`);
  sections.push(`Nouns: ${topNouns.join(', ')}`);
  sections.push(`Adjectives: ${topAdj.join(', ')}\n`);
  
  sections.push('✅ GOOD EXAMPLES:');
  goodExamples.forEach((ex, i) => {
    sections.push(`${i + 1}. ${ex.questionText}`);
    sections.push(`   ${ex.vocabularyNotes}`);
  });
  sections.push('');
  
  if (badExample && correctedExample) {
    sections.push('❌→✅ MISTAKE & FIX:');
    sections.push(`Wrong: ${badExample.questionText}`);
    sections.push(`Issue: ${badExample.vocabularyNotes}`);
    sections.push(`Fixed: ${correctedExample.questionText}`);
    sections.push(`Why: ${correctedExample.vocabularyNotes}\n`);
  }
  
  sections.push('🚨 CRITICAL: Use ONLY A1 vocabulary. Questions are auto-validated.');
  
  return sections.join('\n');
}

/**
 * Get vocabulary violation explanation for rejected questions
 */
export function getViolationExplanation(
  violatedWords: string[],
  grade: string
): string {
  
  const constraints = getVocabularyConstraints(grade);
  
  const explanation: string[] = [];
  explanation.push(`❌ Question rejected due to vocabulary violations:\n`);
  explanation.push(`Violated words: ${violatedWords.join(', ')}\n`);
  explanation.push(`These words are NOT in the ${constraints.level} (${constraints.cefrLevel}) vocabulary list.`);
  explanation.push(`Total allowed vocabulary: ${constraints.totalVocabularyCount} words\n`);
  explanation.push(`💡 Suggestions:`);
  explanation.push(`- Use simpler, everyday words from the allowed list`);
  explanation.push(`- Avoid academic, business, or technical terms`);
  explanation.push(`- Think: "Would an elementary school beginner know this word?"`);
  explanation.push(`- Refer to the GOOD EXAMPLES in the prompt\n`);
  
  return explanation.join('\n');
}

/**
 * Validate if a word is in allowed vocabulary
 */
export function isWordAllowed(word: string, grade: string): boolean {
  const constraints = getVocabularyConstraints(grade);
  const lowerWord = word.toLowerCase();
  
  return (
    constraints.allowedVocabulary.verbs.includes(lowerWord) ||
    constraints.allowedVocabulary.nouns.includes(lowerWord) ||
    constraints.allowedVocabulary.adjectives.includes(lowerWord) ||
    constraints.allowedVocabulary.adverbs.includes(lowerWord) ||
    constraints.allowedVocabulary.other.includes(lowerWord)
  );
}
