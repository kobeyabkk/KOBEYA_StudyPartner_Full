/**
 * 語彙バリデーションのテストスクリプト
 * 
 * ローカルD1を使って語彙バリデーション機能をテスト
 */

// ====================
// テストケース
// ====================

const testCases = [
  {
    name: '✅ A1レベルの簡単な文章',
    text: 'I go to school every day. My teacher is very kind.',
    expected: 'valid',
    target_level: 'A1',
  },
  {
    name: '❌ B1-B2レベルの難しい単語を含む文章',
    text: 'I was delighted to receive a promotion at work.',
    expected: 'invalid',
    target_level: 'A1',
  },
  {
    name: '✅ 不規則動詞の活用形を含む文章',
    text: 'I went to the park and saw my friend. We ate lunch together.',
    expected: 'valid',
    target_level: 'A1',
  },
  {
    name: '⚠️  A2レベルの単語（許容範囲）',
    text: 'I began to understand the lesson.',
    expected: 'valid',
    target_level: 'A1',
  },
  {
    name: '❌ 複数のB1単語',
    text: 'The confused student felt disappointed and frustrated.',
    expected: 'invalid',
    target_level: 'A1',
  },
];

console.log('🚀 Vocabulary Validation Test\n');
console.log('=' .repeat(60));
console.log('\nTest Cases:\n');

testCases.forEach((testCase, index) => {
  console.log(`${index + 1}. ${testCase.name}`);
  console.log(`   Text: "${testCase.text}"`);
  console.log(`   Target: ${testCase.target_level}`);
  console.log(`   Expected: ${testCase.expected}`);
  console.log();
});

console.log('=' .repeat(60));
console.log('\n📝 Manual Testing Instructions:\n');
console.log('1. Start the development server:');
console.log('   npm run dev\n');
console.log('2. Test each case with curl:\n');

testCases.forEach((testCase, index) => {
  const escapedText = testCase.text.replace(/"/g, '\\"');
  console.log(`# Test ${index + 1}: ${testCase.name}`);
  console.log(`curl -X POST http://localhost:8787/api/eiken/vocabulary/validate \\`);
  console.log(`  -H "Content-Type: application/json" \\`);
  console.log(`  -d '{"text":"${escapedText}","config":{"target_level":"${testCase.target_level}"}}'`);
  console.log();
});

console.log('=' .repeat(60));
console.log('\n🔍 Expected Results:\n');

testCases.forEach((testCase, index) => {
  console.log(`Test ${index + 1}: Should be ${testCase.expected.toUpperCase()}`);
  if (testCase.expected === 'valid') {
    console.log('  - valid: true');
    console.log('  - violation_rate: ≤ 0.05 (5%)');
  } else {
    console.log('  - valid: false');
    console.log('  - violations: [list of problematic words]');
    console.log('  - violation_rate: > 0.05 (5%)');
  }
  console.log();
});

console.log('=' .repeat(60));
console.log('\n✅ Additional API Endpoints to Test:\n');

console.log('1. Word Lookup:');
console.log('   curl http://localhost:8787/api/eiken/vocabulary/lookup/delighted\n');

console.log('2. Vocabulary Stats:');
console.log('   curl http://localhost:8787/api/eiken/vocabulary/stats\n');

console.log('3. Cache Stats:');
console.log('   curl http://localhost:8787/api/eiken/vocabulary/cache/stats\n');

console.log('4. Health Check:');
console.log('   curl http://localhost:8787/api/eiken/vocabulary/health\n');

console.log('5. Batch Validation:');
console.log(`curl -X POST http://localhost:8787/api/eiken/vocabulary/validate/batch \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"texts":["I go to school.","I was delighted."],"config":{"target_level":"A1"}}'`);
console.log();

console.log('=' .repeat(60));
console.log('\n🎯 Integration Test with Question Generation:\n');

console.log('Test generated question vocabulary:');
console.log(`curl -X POST http://localhost:8787/api/eiken/generate \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"grade":"5","section":"vocabulary","difficulty":0.5}' \\`);
console.log(`  | jq -r '.question_text' \\`);
console.log(`  | xargs -I {} curl -X POST http://localhost:8787/api/eiken/vocabulary/validate \\`);
console.log(`    -H "Content-Type: application/json" \\`);
console.log(`    -d '{"text":"{}","config":{"target_level":"A1"}}'`);
console.log();

console.log('=' .repeat(60));
console.log('\n💡 Tips:\n');
console.log('- Use jq to format JSON output: | jq');
console.log('- Check violations details: | jq .violations');
console.log('- Monitor execution time: | jq .metadata.execution_time_ms');
console.log('- Check cache effectiveness: | jq .metadata.cache_hits');
console.log();
