/**
 * Phase 3 問題生成 全級テストスクリプト
 * Production環境で各英検級の問題生成をテストし、
 * 語彙バリデーションと著作権チェックが正常に動作するか確認
 */

import { IntegratedQuestionGenerator } from './src/eiken/services/integrated-question-generator';
import type { EikenGrade } from './src/eiken/types';

// テスト対象の全ての英検級
const ALL_GRADES: EikenGrade[] = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];

// テスト結果を格納
interface TestResult {
  grade: EikenGrade;
  success: boolean;
  questionGenerated: boolean;
  vocabularyPassed: boolean;
  vocabularyScore: number;
  copyrightPassed: boolean;
  copyrightScore: number;
  attempts: number;
  error?: string;
  executionTime: number;
}

async function testGrade(
  generator: IntegratedQuestionGenerator,
  grade: EikenGrade
): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🧪 Testing Grade: ${grade}`);
    console.log(`${'='.repeat(60)}`);
    
    const result = await generator.generateQuestion({
      grade,
      format: 'grammar_fill',
      mode: 'practice',
    });
    
    const executionTime = Date.now() - startTime;
    
    console.log(`✅ Question Generated: ${result.question ? 'YES' : 'NO'}`);
    console.log(`📊 Vocabulary Score: ${result.validation.vocabulary_score}%`);
    console.log(`✓ Vocabulary Passed: ${result.validation.vocabulary_passed ? 'YES' : 'NO'}`);
    console.log(`📋 Copyright Score: ${result.validation.copyright_score}/100`);
    console.log(`✓ Copyright Passed: ${result.validation.copyright_passed ? 'YES' : 'NO'}`);
    console.log(`🔄 Attempts: ${result.attempts}`);
    console.log(`⏱️  Execution Time: ${executionTime}ms`);
    
    return {
      grade,
      success: true,
      questionGenerated: !!result.question,
      vocabularyPassed: result.validation.vocabulary_passed,
      vocabularyScore: result.validation.vocabulary_score,
      copyrightPassed: result.validation.copyright_passed,
      copyrightScore: result.validation.copyright_score,
      attempts: result.attempts,
      executionTime,
    };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    console.error(`❌ Error testing grade ${grade}:`, error);
    
    return {
      grade,
      success: false,
      questionGenerated: false,
      vocabularyPassed: false,
      vocabularyScore: 0,
      copyrightPassed: false,
      copyrightScore: 0,
      attempts: 0,
      error: error instanceof Error ? error.message : String(error),
      executionTime,
    };
  }
}

async function runAllTests(db: D1Database, openai: any): Promise<void> {
  console.log('\n🚀 Starting Phase 3 Question Generation Tests');
  console.log(`Testing ${ALL_GRADES.length} grades: ${ALL_GRADES.join(', ')}`);
  console.log(`Environment: Production D1 Database`);
  
  const generator = new IntegratedQuestionGenerator(db, openai);
  const results: TestResult[] = [];
  
  // 各級をテスト
  for (const grade of ALL_GRADES) {
    const result = await testGrade(generator, grade);
    results.push(result);
    
    // 次のテストまで少し待機（レート制限回避）
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // 結果サマリー
  console.log('\n\n');
  console.log('═'.repeat(80));
  console.log('📊 TEST RESULTS SUMMARY');
  console.log('═'.repeat(80));
  
  console.log('\n| Grade | Success | Vocab Pass | Vocab Score | Copyright Pass | Copyright Score | Attempts | Time (ms) |');
  console.log('|-------|---------|------------|-------------|----------------|-----------------|----------|-----------|');
  
  for (const result of results) {
    const successIcon = result.success ? '✅' : '❌';
    const vocabIcon = result.vocabularyPassed ? '✓' : '✗';
    const copyrightIcon = result.copyrightPassed ? '✓' : '✗';
    
    console.log(
      `| ${result.grade.padEnd(5)} | ${successIcon} ${result.success ? 'YES' : 'NO '}  | ` +
      `${vocabIcon} ${result.vocabularyPassed ? 'YES' : 'NO '}     | ` +
      `${result.vocabularyScore.toFixed(1).padStart(6)}%   | ` +
      `${copyrightIcon} ${result.copyrightPassed ? 'YES' : 'NO '}         | ` +
      `${result.copyrightScore.toString().padStart(9)}/100    | ` +
      `${result.attempts.toString().padStart(4)}     | ` +
      `${result.executionTime.toString().padStart(6)}    |`
    );
  }
  
  console.log('\n');
  
  // 統計
  const successCount = results.filter(r => r.success).length;
  const vocabPassCount = results.filter(r => r.vocabularyPassed).length;
  const copyrightPassCount = results.filter(r => r.copyrightPassed).length;
  const avgVocabScore = results.reduce((sum, r) => sum + r.vocabularyScore, 0) / results.length;
  const avgCopyrightScore = results.reduce((sum, r) => sum + r.copyrightScore, 0) / results.length;
  const avgTime = results.reduce((sum, r) => sum + r.executionTime, 0) / results.length;
  
  console.log('📈 Statistics:');
  console.log(`   ✅ Success Rate: ${successCount}/${results.length} (${(successCount / results.length * 100).toFixed(1)}%)`);
  console.log(`   📊 Vocabulary Pass Rate: ${vocabPassCount}/${results.length} (${(vocabPassCount / results.length * 100).toFixed(1)}%)`);
  console.log(`   📋 Copyright Pass Rate: ${copyrightPassCount}/${results.length} (${(copyrightPassCount / results.length * 100).toFixed(1)}%)`);
  console.log(`   📊 Average Vocabulary Score: ${avgVocabScore.toFixed(1)}%`);
  console.log(`   📋 Average Copyright Score: ${avgCopyrightScore.toFixed(1)}/100`);
  console.log(`   ⏱️  Average Execution Time: ${avgTime.toFixed(0)}ms`);
  
  // エラーがあれば表示
  const errors = results.filter(r => r.error);
  if (errors.length > 0) {
    console.log('\n❌ Errors:');
    for (const error of errors) {
      console.log(`   Grade ${error.grade}: ${error.error}`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  console.log('✨ Test Complete!');
  console.log('═'.repeat(80));
}

// このスクリプトが直接実行された場合の処理
if (import.meta.url === `file://${process.argv[1]}`) {
  console.error('❌ This script must be run within a Cloudflare Workers environment');
  console.error('   It requires D1 Database and OpenAI bindings');
  process.exit(1);
}

export { runAllTests, testGrade, type TestResult };
