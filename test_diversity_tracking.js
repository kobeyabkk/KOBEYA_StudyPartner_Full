/**
 * Test Answer Diversity Tracking
 * 
 * このスクリプトは、正解の多様性トラッカーが正しく動作するかテストします。
 */

const { AnswerDiversityTracker } = require('./dist/_worker.js');

async function testDiversityTracking() {
  console.log('=== Answer Diversity Tracking Test ===\n');

  const tracker = new AnswerDiversityTracker();

  // シナリオ1: 多様性が高い場合（問題なし）
  console.log('📊 Scenario 1: High Diversity (Good)');
  tracker.clear();
  const diverseAnswers = ['can', 'will', 'did', 'are', 'was', 'has', 'do', 'is'];
  diverseAnswers.forEach(answer => {
    tracker.addAnswer(answer, '4');
  });

  let stats = tracker.getRecentAnswerStats('4');
  console.log(`  Answers: ${stats.answers.join(', ')}`);
  console.log(`  Diversity Score: ${(stats.diversityScore * 100).toFixed(0)}%`);
  console.log(`  Most Common: ${stats.mostCommon.join(', ')}`);
  
  let guidance = tracker.getDiversityGuidance('4');
  console.log(`  Guidance: ${guidance ? 'Warning issued' : 'No warning (good!)'}\n`);

  // シナリオ2: 低い多様性（警告が出るべき）
  console.log('⚠️  Scenario 2: Low Diversity (Should Warn)');
  tracker.clear();
  tracker.addAnswer('did', '4');
  tracker.addAnswer('did', '4');
  tracker.addAnswer('did', '4');
  tracker.addAnswer('can', '4');

  stats = tracker.getRecentAnswerStats('4');
  console.log(`  Answers: ${stats.answers.join(', ')}`);
  console.log(`  Diversity Score: ${(stats.diversityScore * 100).toFixed(0)}%`);
  console.log(`  Frequencies:`, stats.frequencies);
  console.log(`  Most Common: ${stats.mostCommon.join(', ')}`);
  
  guidance = tracker.getDiversityGuidance('4');
  if (guidance) {
    console.log('  ✅ Warning issued (expected):');
    console.log(guidance.split('\n').slice(0, 5).join('\n'));
  } else {
    console.log('  ❌ No warning (unexpected!)');
  }
  console.log('');

  // シナリオ3: ユーザーが報告した実際の問題（4問中3問がdid）
  console.log('🔴 Scenario 3: User-Reported Issue (3 out of 4 = "did")');
  tracker.clear();
  tracker.addAnswer('did', '4');
  tracker.addAnswer('did', '4');
  tracker.addAnswer('will', '4');
  tracker.addAnswer('did', '4');

  stats = tracker.getRecentAnswerStats('4');
  console.log(`  Answers: ${stats.answers.join(', ')}`);
  console.log(`  Diversity Score: ${(stats.diversityScore * 100).toFixed(0)}%`);
  console.log(`  Frequencies:`, stats.frequencies);
  console.log(`  Most Common: ${stats.mostCommon.join(', ')}`);
  
  guidance = tracker.getDiversityGuidance('4');
  if (guidance) {
    console.log('  ✅ Warning issued (this will prevent future bias):');
    console.log(guidance.split('\n').slice(0, 8).join('\n'));
  } else {
    console.log('  ❌ No warning (unexpected!)');
  }

  console.log('\n=== Test Complete ===');
}

// Run test
testDiversityTracking().catch(console.error);
