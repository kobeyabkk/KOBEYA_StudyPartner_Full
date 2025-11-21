/**
 * Phase 4 Vocabulary Improvements Test Script
 * 
 * Essay と Long Reading の語彙スコア改善をテスト
 */

const TEST_CONFIG = {
  // ローカル開発サーバー
  baseUrl: 'http://localhost:8787',
  
  // テスト設定
  essayTests: 5,      // essay形式のテスト回数
  longReadingTests: 5, // long_reading形式のテスト回数
  
  // テストデータ
  studentId: 'test_student_phase4',
  grade: 'pre2',
  mode: 'test_vocab_improvements', // Phase 4テストモード
};

// 結果格納
const results = {
  essay: [],
  long_reading: [],
};

/**
 * 問題生成APIを呼び出し
 */
async function generateQuestion(format, attemptNumber) {
  const requestBody = {
    student_id: TEST_CONFIG.studentId,
    grade: TEST_CONFIG.grade,
    format: format,
    mode: TEST_CONFIG.mode,
  };

  console.log(`\n[${format.toUpperCase()} - Test ${attemptNumber}] リクエスト送信中...`);
  
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${TEST_CONFIG.baseUrl}/api/eiken/questions/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      console.error(`❌ エラー (${response.status}):`, data.error?.message || 'Unknown error');
      return {
        success: false,
        error: data.error,
        responseTime,
      };
    }

    // 語彙スコアを取得
    const vocabScore = data.validation?.vocabulary_score;
    const threshold = data.metadata?.threshold || 95;
    const attempts = data.metadata?.attempts || 1;
    const wordCount = getWordCount(data.question?.question_data);

    console.log(`✅ 成功 (${responseTime}ms)`);
    console.log(`   語彙スコア: ${vocabScore?.toFixed(1)}% (閾値: ${threshold}%)`);
    console.log(`   単語数: ${wordCount}語`);
    console.log(`   試行回数: ${attempts}回`);
    console.log(`   判定: ${vocabScore >= threshold ? '✅ PASS' : '⚠️ BELOW THRESHOLD'}`);

    return {
      success: true,
      vocabScore,
      threshold,
      attempts,
      wordCount,
      responseTime,
      passed: vocabScore >= threshold,
      data,
    };

  } catch (error) {
    const responseTime = Date.now() - startTime;
    console.error(`❌ リクエストエラー:`, error.message);
    return {
      success: false,
      error: error.message,
      responseTime,
    };
  }
}

/**
 * 単語数カウント
 */
function getWordCount(questionData) {
  if (!questionData) return 0;
  
  const text = questionData.sample_essay 
               || questionData.passage 
               || questionData.question_text 
               || '';
  
  return text.split(/\s+/).filter(w => w.length > 0).length;
}

/**
 * 結果集計
 */
function summarizeResults(format, testResults) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📊 ${format.toUpperCase()} 形式 - 結果サマリー`);
  console.log(`${'='.repeat(70)}`);

  const successful = testResults.filter(r => r.success);
  const failed = testResults.filter(r => !r.success);
  const passed = successful.filter(r => r.passed);

  if (successful.length === 0) {
    console.log('❌ すべてのテストが失敗しました');
    return;
  }

  // 語彙スコア統計
  const scores = successful.map(r => r.vocabScore);
  const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);

  // 単語数統計
  const wordCounts = successful.map(r => r.wordCount);
  const avgWordCount = wordCounts.reduce((a, b) => a + b, 0) / wordCounts.length;

  // 試行回数統計
  const attemptsArray = successful.map(r => r.attempts);
  const avgAttempts = attemptsArray.reduce((a, b) => a + b, 0) / attemptsArray.length;

  // レスポンス時間統計
  const times = successful.map(r => r.responseTime);
  const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

  console.log(`\n【成功率】`);
  console.log(`  総テスト数: ${testResults.length}`);
  console.log(`  成功: ${successful.length} (${(successful.length / testResults.length * 100).toFixed(1)}%)`);
  console.log(`  失敗: ${failed.length}`);
  console.log(`  閾値クリア: ${passed.length}/${successful.length} (${(passed.length / successful.length * 100).toFixed(1)}%)`);

  console.log(`\n【語彙スコア】`);
  console.log(`  平均: ${avgScore.toFixed(1)}%`);
  console.log(`  最小: ${minScore.toFixed(1)}%`);
  console.log(`  最大: ${maxScore.toFixed(1)}%`);
  console.log(`  標準偏差: ${calculateStdDev(scores).toFixed(1)}%`);

  console.log(`\n【単語数】`);
  console.log(`  平均: ${avgWordCount.toFixed(0)}語`);

  console.log(`\n【試行回数】`);
  console.log(`  平均: ${avgAttempts.toFixed(1)}回`);

  console.log(`\n【レスポンス時間】`);
  console.log(`  平均: ${(avgTime / 1000).toFixed(1)}秒`);

  // 目標達成判定
  console.log(`\n【Phase 4 目標達成判定】`);
  
  const targetScore = format === 'essay' ? 78 : 82;
  const targetSuccessRate = format === 'essay' ? 70 : 80;
  const actualSuccessRate = (passed.length / successful.length) * 100;
  
  console.log(`  目標語彙スコア: ${targetScore}%`);
  console.log(`  実際の平均: ${avgScore.toFixed(1)}% ${avgScore >= targetScore ? '✅ 達成' : '❌ 未達'}`);
  console.log(`  目標成功率: ${targetSuccessRate}%`);
  console.log(`  実際の成功率: ${actualSuccessRate.toFixed(1)}% ${actualSuccessRate >= targetSuccessRate ? '✅ 達成' : '❌ 未達'}`);

  return {
    avgScore,
    minScore,
    maxScore,
    successRate: actualSuccessRate,
    avgAttempts,
    avgTime: avgTime / 1000,
    targetAchieved: avgScore >= targetScore && actualSuccessRate >= targetSuccessRate,
  };
}

/**
 * 標準偏差計算
 */
function calculateStdDev(values) {
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - avg, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff);
}

/**
 * メインテスト実行
 */
async function runTests() {
  console.log('🚀 Phase 4 語彙品質改善テスト開始\n');
  console.log(`テスト設定:`);
  console.log(`  ベースURL: ${TEST_CONFIG.baseUrl}`);
  console.log(`  Essay テスト: ${TEST_CONFIG.essayTests}回`);
  console.log(`  Long Reading テスト: ${TEST_CONFIG.longReadingTests}回`);
  console.log(`  級: ${TEST_CONFIG.grade}`);

  // Essay形式テスト
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 Essay 形式テスト開始`);
  console.log(`${'='.repeat(70)}`);

  for (let i = 1; i <= TEST_CONFIG.essayTests; i++) {
    const result = await generateQuestion('essay', i);
    results.essay.push(result);
    
    // 連続リクエスト対策で少し待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const essaySummary = summarizeResults('essay', results.essay);

  // Long Reading形式テスト
  console.log(`\n${'='.repeat(70)}`);
  console.log(`📚 Long Reading 形式テスト開始`);
  console.log(`${'='.repeat(70)}`);

  for (let i = 1; i <= TEST_CONFIG.longReadingTests; i++) {
    const result = await generateQuestion('long_reading', i);
    results.long_reading.push(result);
    
    // 連続リクエスト対策で少し待機
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const longReadingSummary = summarizeResults('long_reading', results.long_reading);

  // 総合結果
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🎯 Phase 4 総合評価`);
  console.log(`${'='.repeat(70)}`);

  console.log(`\n【改善前 vs 改善後】`);
  console.log(`\nEssay形式:`);
  console.log(`  改善前: 64.0%`);
  console.log(`  改善後: ${essaySummary?.avgScore.toFixed(1)}%`);
  console.log(`  改善幅: ${essaySummary ? '+' + (essaySummary.avgScore - 64).toFixed(1) : 'N/A'}%`);
  console.log(`  目標: +14-17% (78-81%)`);

  console.log(`\nLong Reading形式:`);
  console.log(`  改善前: 69.0%`);
  console.log(`  改善後: ${longReadingSummary?.avgScore.toFixed(1)}%`);
  console.log(`  改善幅: ${longReadingSummary ? '+' + (longReadingSummary.avgScore - 69).toFixed(1) : 'N/A'}%`);
  console.log(`  目標: +13-16% (82-85%)`);

  console.log(`\n【Phase 4 実装の評価】`);
  const essayAchieved = essaySummary?.targetAchieved;
  const longReadingAchieved = longReadingSummary?.targetAchieved;

  if (essayAchieved && longReadingAchieved) {
    console.log(`✅ Phase 4 目標達成！両形式とも目標スコア・成功率をクリア`);
  } else if (essayAchieved || longReadingAchieved) {
    console.log(`⚠️ 部分的成功: ${essayAchieved ? 'Essay' : 'Long Reading'}のみ目標達成`);
  } else {
    console.log(`❌ 目標未達: さらなる調整が必要`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`テスト完了`);
  console.log(`${'='.repeat(70)}\n`);
}

// テスト実行
runTests().catch(error => {
  console.error('\n❌ テスト実行エラー:', error);
  process.exit(1);
});
