/**
 * Text Profiler Test Suite
 * 
 * 簡易版CVLA実装のテスト
 */

import type { EikenGrade } from '../src/eiken/services/text-profiler';

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
    name: 'Test 1: Grade 5 simple text',
    text: 'I like cats. My cat is white. Cats are very cute animals.',
    grade: '5',
    expectedValid: true,
    description: 'Simple A1 level text should pass for Grade 5'
  },
  {
    name: 'Test 2: Grade 5 with complex vocabulary',
    text: 'The pharmaceutical company implemented sophisticated methodologies for synthesizing complex molecules. The researchers utilized advanced computational techniques.',
    grade: '5',
    expectedValid: false,
    description: 'Advanced B2/C1 vocabulary should fail for Grade 5'
  },
  {
    name: 'Test 3: Grade 3 appropriate text',
    text: 'Yesterday I went to the library to study English. I enjoyed reading books about history. My friend came with me and we studied together.',
    grade: '3',
    expectedValid: true,
    description: 'A2 level text should pass for Grade 3'
  },
  {
    name: 'Test 4: Grade Pre-1 advanced text',
    text: 'The research demonstrated that cognitive development is significantly influenced by environmental factors. The study examined various aspects of learning processes and their correlation with educational outcomes.',
    grade: 'pre1',
    expectedValid: true,
    description: 'B2 level text should pass for Grade Pre-1'
  },
  {
    name: 'Test 5: Grade 2 moderate text',
    text: 'Global warming is becoming a serious problem. Many scientists believe that human activities are contributing to climate change. We need to take action to protect our environment.',
    grade: '2',
    expectedValid: true,
    description: 'B1 level text should pass for Grade 2'
  }
];

// Main test function
async function runTests() {
  console.log('📋 TEXT PROFILER TEST SUITE\n');
  console.log('Testing simplified CVLA implementation\n');
  console.log('═'.repeat(80) + '\n');
  
  // Setup: Load actual database
  console.log('🔧 Setting up test environment...');
  const dbPath = './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/943a1d9c4a057a4454481f5f82927e9a444649d267bd393befef951a011b8995.sqlite';
  
  const { default: Database } = await import('better-sqlite3');
  const sqliteDB = new Database(dbPath, { readonly: true });
  
  // Verify database has data
  const countResult = sqliteDB.prepare('SELECT COUNT(*) as count FROM eiken_vocabulary_lexicon').get() as { count: number };
  console.log(`✅ Database loaded: ${countResult.count} vocabulary entries found\n`);
  
  if (countResult.count === 0) {
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
            }
          };
        }
      };
    }
  };
  
  // Mock env
  const env = { DB: d1 } as any;
  
  // Import text profiler
  const { analyzeTextProfile } = await import('../src/eiken/services/text-profiler');
  
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
      const result = await analyzeTextProfile(testCase.text, testCase.grade, env);
      
      console.log(`Results:`);
      console.log(`  CEFR-J Level: ${result.cefrjLevel}`);
      console.log(`  Numeric Score: ${result.numericScore.toFixed(2)}`);
      console.log(`  Validation: ${result.isValid ? '✅ PASS' : '❌ FAIL'}`);
      console.log(`  Expected: ${testCase.expectedValid ? 'PASS' : 'FAIL'}`);
      console.log(`  Metrics:`);
      console.log(`    AvrDiff: ${result.metrics.AvrDiff.toFixed(2)}`);
      console.log(`    BperA: ${result.metrics.BperA.toFixed(2)}`);
      console.log(`    ARI: ${result.metrics.ARI.toFixed(2)}`);
      
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
    console.log('🎉 ALL TESTS PASSED! Text profiler is working correctly.\n');
  } else {
    console.log('⚠️  Some tests failed. Review the results above.\n');
  }
  
  sqliteDB.close();
}

// Run tests
runTests().catch(console.error);
