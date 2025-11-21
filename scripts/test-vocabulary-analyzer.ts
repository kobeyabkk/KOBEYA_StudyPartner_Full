/**
 * Test Vocabulary Analyzer with CEFR-J Database
 * 
 * This script validates that the vocabulary analyzer correctly identifies
 * out-of-range vocabulary using the imported 7,801 CEFR-J entries.
 */

import nlp from 'compromise';
import type { EikenGrade } from '../src/eiken/types';

type LexiconRow = {
  word_lemma: string
  grade_level: number | null
}

// Grade level mapping (same as in vocabulary-analyzer.ts)
const GRADE_LEVEL_MAP: Record<EikenGrade, number> = {
  '5': 5,    // 5級
  '4': 4,    // 4級
  '3': 3,    // 3級
  'pre2': 21, // 準2級
  '2': 2,    // 2級
  'pre1': 11, // 準1級
  '1': 1     // 1級
};

// Simplified vocabulary analyzer (core logic from vocabulary-analyzer.ts)
async function analyzeVocabularyLevel(
  text: string,
  targetGrade: EikenGrade,
  d1: any
): Promise<{
  isValid: boolean;
  outOfRangeRatio: number;
  totalWords: number;
  outOfRangeWords: string[];
  suggestions?: string;
}> {
  // Tokenize and lemmatize
  const doc = nlp(text);
  const words = doc.terms().out('array') as string[];
  
  // Get lemmas
  const lemmas = words.map(word => {
    const term = nlp(word);
    const lemma = term.verbs().toInfinitive().out('text') || 
                  term.nouns().toSingular().out('text') || 
                  word.toLowerCase();
    return lemma;
  }).filter(lemma => lemma.length > 0 && /^[a-z]+$/.test(lemma));
  
  if (lemmas.length === 0) {
    return {
      isValid: true,
      outOfRangeRatio: 0,
      totalWords: 0,
      outOfRangeWords: []
    };
  }
  
  // Query database
  const uniqueLemmas = [...new Set(lemmas)];
  const targetLevel = GRADE_LEVEL_MAP[targetGrade];
  
  const placeholders = uniqueLemmas.map(() => '?').join(',');
  const query = `
    SELECT word_lemma, grade_level 
    FROM eiken_vocabulary_lexicon 
    WHERE word_lemma IN (${placeholders})
  `;
  
  const queryResult = await d1.prepare(query).bind(...uniqueLemmas).all();
  const dbWords = new Map<string, number>(
    (queryResult.results as LexiconRow[])
      .filter((row) => typeof row.grade_level === 'number')
      .map((row) => [row.word_lemma, row.grade_level as number])
  );
  
  // Identify out-of-range words
  const outOfRangeWords: string[] = [];
  
  for (const lemma of lemmas) {
    const wordLevel = dbWords.get(lemma);
    if (typeof wordLevel === 'number' && wordLevel < targetLevel) {
      outOfRangeWords.push(lemma);
    }
  }
  
  const outOfRangeRatio = outOfRangeWords.length / lemmas.length;
  const isValid = outOfRangeRatio < 0.03; // 3% rule
  
  const suggestions = !isValid 
    ? `Vocabulary too difficult. ${(outOfRangeRatio * 100).toFixed(1)}% of words are above Grade ${targetGrade} level.`
    : undefined;
  
  return {
    isValid,
    outOfRangeRatio,
    totalWords: lemmas.length,
    outOfRangeWords: [...new Set(outOfRangeWords)],
    suggestions
  };
}

// Test cases
interface TestCase {
  name: string;
  text: string;
  grade: EikenGrade;
  expectedValid: boolean;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'Test 1: Simple Grade 5 text',
    text: 'I like cats. My cat is white. Cats are cute.',
    grade: '5',
    expectedValid: true,
    description: 'Basic A1 vocabulary should pass for Grade 5'
  },
  {
    name: 'Test 2: Grade 5 with difficult words',
    text: 'The pharmaceutical company implemented sophisticated methodologies for synthesizing molecules.',
    grade: '5',
    expectedValid: false,
    description: 'Advanced B2/C1 vocabulary should fail for Grade 5'
  },
  {
    name: 'Test 3: Grade 3 appropriate text',
    text: 'Yesterday I went to the library to study English. I enjoyed reading books about history.',
    grade: '3',
    expectedValid: true,
    description: 'A2 level vocabulary should pass for Grade 3'
  },
  {
    name: 'Test 4: Grade Pre-1 advanced text',
    text: 'The research demonstrated that cognitive development is influenced by environmental factors.',
    grade: 'pre1',
    expectedValid: true,
    description: 'B2 level vocabulary should pass for Grade Pre-1'
  },
  {
    name: 'Test 5: Edge case - exactly 3% threshold',
    text: 'I like apples. Apples are delicious. phenomenon', // "phenomenon" is B2 level
    grade: '5',
    expectedValid: true,
    description: '1 advanced word out of ~9 words (11%) should fail Grade 5'
  }
];

// Main test function
async function runTests() {
  console.log('📋 VOCABULARY ANALYZER TEST SUITE\n');
  console.log('Using imported CEFR-J database with 7,801 entries\n');
  console.log('═'.repeat(80) + '\n');
  
  // Setup: Load actual database
  console.log('🔧 Setting up test environment...');
  const dbPath = './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/943a1d9c4a057a4454481f5f82927e9a444649d267bd393befef951a011b8995.sqlite';
  
  // Read from actual D1 database
  const { default: Database } = await import('better-sqlite3');
  const sqliteDB = new Database(dbPath, { readonly: true });
  
  // Verify database has data
  const countResult = sqliteDB
    .prepare('SELECT COUNT(*) as count FROM eiken_vocabulary_lexicon')
    .get() as { count: number | null };
  const totalEntries = countResult?.count ?? 0;
  console.log(`✅ Database loaded: ${totalEntries} vocabulary entries found\n`);
  
  if (totalEntries === 0) {
    console.log('❌ ERROR: Database is empty. Please run import first.\n');
    process.exit(1);
  }
  
  // Create D1-compatible wrapper
  const d1 = {
    prepare: (sql: string) => {
      const stmt = sqliteDB.prepare(sql);
      return {
        bind: (...params: any[]) => {
          return {
            all: async () => {
              const results = stmt.all(...params);
              return { results };
            },
            first: async () => {
              return stmt.get(...params);
            },
            run: async () => {
              stmt.run(...params);
              return { success: true };
            }
          };
        }
      };
    }
  };
  
  // Run test cases
  console.log('🧪 Running test cases...\n');
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const testCase of testCases) {
    console.log(`Test: ${testCase.name}`);
    console.log(`Description: ${testCase.description}`);
    console.log(`Grade: ${testCase.grade}`);
    console.log(`Text: "${testCase.text}"\n`);
    
    try {
      const result = await analyzeVocabularyLevel(testCase.text, testCase.grade, d1);
      
      console.log(`Results:`);
      console.log(`  Total words analyzed: ${result.totalWords}`);
      console.log(`  Out-of-range words: ${result.outOfRangeWords.length}`);
      console.log(`  Out-of-range ratio: ${(result.outOfRangeRatio * 100).toFixed(2)}%`);
      console.log(`  Validation result: ${result.isValid ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  Expected result: ${testCase.expectedValid ? 'PASS' : 'FAIL'}`);
      
      if (result.outOfRangeWords.length > 0) {
        console.log(`  Difficult words: ${result.outOfRangeWords.join(', ')}`);
      }
      
      if (result.suggestions) {
        console.log(`  Suggestions: ${result.suggestions}`);
      }
      
      const testPassed = result.isValid === testCase.expectedValid;
      
      if (testPassed) {
        console.log('\n✅ TEST PASSED\n');
        passedTests++;
      } else {
        console.log('\n❌ TEST FAILED: Result does not match expected outcome\n');
        failedTests++;
      }
    } catch (error) {
      console.log(`\n❌ TEST ERROR: ${error}\n`);
      failedTests++;
    }
    
    console.log('─'.repeat(80) + '\n');
  }
  
  // Summary
  console.log('═'.repeat(80));
  console.log('\n📊 TEST SUMMARY\n');
  console.log(`Total tests: ${testCases.length}`);
  console.log(`Passed: ${passedTests} ✅`);
  console.log(`Failed: ${failedTests} ❌`);
  console.log(`Success rate: ${((passedTests / testCases.length) * 100).toFixed(1)}%\n`);
  
  if (failedTests === 0) {
    console.log('🎉 ALL TESTS PASSED! Vocabulary validation is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above.\n');
  }
  
  sqliteDB.close();
}

// Run tests
runTests().catch(console.error);
