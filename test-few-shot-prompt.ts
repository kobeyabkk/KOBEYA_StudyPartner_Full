/**
 * Test script for Few-shot Prompt Generation
 * 
 * Usage: npx tsx test-few-shot-prompt.ts
 */

import { buildFewShotPrompt, buildCompactFewShotPrompt } from './src/eiken/prompts/few-shot-builder';
import { getFewShotExamples } from './src/eiken/prompts/few-shot-examples';
import { getVocabularyConstraints } from './src/eiken/prompts/vocabulary-constraints';

console.log('🧪 Testing Few-shot Prompt Generation\n');
console.log('═'.repeat(80));

// Test 1: Full prompt for Grade 5 Grammar
console.log('\n📝 Test 1: Full Few-shot Prompt (Grade 5 Grammar)');
console.log('═'.repeat(80));
const fullPrompt = buildFewShotPrompt('5', 'grammar');
console.log(fullPrompt);
console.log(`\nPrompt length: ${fullPrompt.length} characters`);

// Test 2: Compact prompt for Grade 5 Grammar
console.log('\n\n📝 Test 2: Compact Few-shot Prompt (Grade 5 Grammar)');
console.log('═'.repeat(80));
const compactPrompt = buildCompactFewShotPrompt('5', 'grammar');
console.log(compactPrompt);
console.log(`\nPrompt length: ${compactPrompt.length} characters`);

// Test 3: Examples count
console.log('\n\n📊 Test 3: Examples Statistics');
console.log('═'.repeat(80));
const grammarExamples = getFewShotExamples('5', 'grammar');
const vocabularyExamples = getFewShotExamples('5', 'vocabulary');
console.log(`Grammar examples: ${grammarExamples.length}`);
console.log(`  - Good: ${grammarExamples.filter(e => e.type === 'good').length}`);
console.log(`  - Bad: ${grammarExamples.filter(e => e.type === 'bad').length}`);
console.log(`  - Corrected: ${grammarExamples.filter(e => e.type === 'corrected').length}`);
console.log(`\nVocabulary examples: ${vocabularyExamples.length}`);
console.log(`  - Good: ${vocabularyExamples.filter(e => e.type === 'good').length}`);
console.log(`  - Bad: ${vocabularyExamples.filter(e => e.type === 'bad').length}`);
console.log(`  - Corrected: ${vocabularyExamples.filter(e => e.type === 'corrected').length}`);

// Test 4: Vocabulary constraints
console.log('\n\n📚 Test 4: Vocabulary Constraints');
console.log('═'.repeat(80));
const constraints = getVocabularyConstraints('5');
console.log(`Level: ${constraints.level}`);
console.log(`CEFR Level: ${constraints.cefrLevel}`);
console.log(`Total vocabulary count: ${constraints.totalVocabularyCount}`);
console.log(`Verbs: ${constraints.allowedVocabulary.verbs.length}`);
console.log(`Nouns: ${constraints.allowedVocabulary.nouns.length}`);
console.log(`Adjectives: ${constraints.allowedVocabulary.adjectives.length}`);
console.log(`Adverbs: ${constraints.allowedVocabulary.adverbs.length}`);
console.log(`Other: ${constraints.allowedVocabulary.other.length}`);
console.log(`\nSample verbs: ${constraints.allowedVocabulary.verbs.slice(0, 10).join(', ')}`);
console.log(`Sample nouns: ${constraints.allowedVocabulary.nouns.slice(0, 10).join(', ')}`);
console.log(`Sample adjectives: ${constraints.allowedVocabulary.adjectives.slice(0, 10).join(', ')}`);

// Test 5: Token efficiency comparison
console.log('\n\n⚡ Test 5: Token Efficiency');
console.log('═'.repeat(80));
const fullTokens = Math.ceil(fullPrompt.length / 4); // Rough estimate
const compactTokens = Math.ceil(compactPrompt.length / 4);
console.log(`Full prompt: ~${fullTokens} tokens`);
console.log(`Compact prompt: ~${compactTokens} tokens`);
console.log(`Savings: ~${fullTokens - compactTokens} tokens (${Math.round((1 - compactTokens/fullTokens) * 100)}%)`);

console.log('\n\n✅ All tests completed successfully!\n');
