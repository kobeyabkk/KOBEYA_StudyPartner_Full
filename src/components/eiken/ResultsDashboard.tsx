/**
 * 英検練習結果ダッシュボード
 */

interface AnswerResult {
  question: {
    questionText: string;
    choices: string[];
    correctAnswerIndex: number;
    explanation: string;
    difficulty: number;
    topic: string;
  };
  userAnswer: number;
  correct: boolean;
  timeSpent: number;
}

interface ResultsDashboardProps {
  results: AnswerResult[];
  onReset: () => void;
}

export default function ResultsDashboard({ results, onReset }: ResultsDashboardProps) {
  const totalQuestions = results.length;
  const correctAnswers = results.filter(r => r.correct).length;
  const accuracy = Math.round((correctAnswers / totalQuestions) * 100);
  const totalTime = results.reduce((sum, r) => sum + r.timeSpent, 0);
  const avgTime = Math.round(totalTime / totalQuestions);

  // 難易度別の正答率
  const difficultyBuckets = {
    easy: results.filter(r => r.question.difficulty < 0.5),
    medium: results.filter(r => r.question.difficulty >= 0.5 && r.question.difficulty < 0.7),
    hard: results.filter(r => r.question.difficulty >= 0.7),
  };

  const difficultyStats = {
    easy: difficultyBuckets.easy.length > 0
      ? Math.round((difficultyBuckets.easy.filter(r => r.correct).length / difficultyBuckets.easy.length) * 100)
      : 0,
    medium: difficultyBuckets.medium.length > 0
      ? Math.round((difficultyBuckets.medium.filter(r => r.correct).length / difficultyBuckets.medium.length) * 100)
      : 0,
    hard: difficultyBuckets.hard.length > 0
      ? Math.round((difficultyBuckets.hard.filter(r => r.correct).length / difficultyBuckets.hard.length) * 100)
      : 0,
  };

  // トピック別の統計
  const topicMap = new Map<string, { correct: number; total: number }>();
  results.forEach(r => {
    const topic = r.question.topic;
    const stats = topicMap.get(topic) || { correct: 0, total: 0 };
    stats.total++;
    if (r.correct) stats.correct++;
    topicMap.set(topic, stats);
  });

  const getGrade = (accuracy: number) => {
    if (accuracy >= 90) return { grade: 'S', color: 'text-yellow-600', bg: 'bg-yellow-50', emoji: '🏆' };
    if (accuracy >= 80) return { grade: 'A', color: 'text-green-600', bg: 'bg-green-50', emoji: '🎉' };
    if (accuracy >= 70) return { grade: 'B', color: 'text-blue-600', bg: 'bg-blue-50', emoji: '👍' };
    if (accuracy >= 60) return { grade: 'C', color: 'text-purple-600', bg: 'bg-purple-50', emoji: '💪' };
    return { grade: 'D', color: 'text-gray-600', bg: 'bg-gray-50', emoji: '📚' };
  };

  const gradeInfo = getGrade(accuracy);

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* ヘッダー */}
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">練習結果</h1>
        <p className="text-gray-600">お疲れさまでした！結果を確認しましょう</p>
      </div>

      {/* 総合スコアカード */}
      <div className={`${gradeInfo.bg} rounded-xl shadow-lg p-8 border-2 border-gray-200`}>
        <div className="text-center">
          <div className="text-6xl mb-4">{gradeInfo.emoji}</div>
          <div className={`text-6xl font-bold ${gradeInfo.color} mb-2`}>
            {gradeInfo.grade}
          </div>
          <div className="text-3xl font-bold text-gray-900 mb-2">
            {accuracy}%
          </div>
          <div className="text-gray-600">
            {correctAnswers} / {totalQuestions} 問正解
          </div>
        </div>
      </div>

      {/* 統計カード */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">⏱️</span>
            <h3 className="font-bold text-gray-900">平均解答時間</h3>
          </div>
          <div className="text-3xl font-bold text-blue-600">{avgTime}秒</div>
          <div className="text-sm text-gray-600 mt-1">総時間: {totalTime}秒</div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">✅</span>
            <h3 className="font-bold text-gray-900">正答数</h3>
          </div>
          <div className="text-3xl font-bold text-green-600">{correctAnswers}問</div>
          <div className="text-sm text-gray-600 mt-1">全{totalQuestions}問中</div>
        </div>

        <div className="bg-white rounded-xl shadow-lg p-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-3xl">❌</span>
            <h3 className="font-bold text-gray-900">誤答数</h3>
          </div>
          <div className="text-3xl font-bold text-red-600">{totalQuestions - correctAnswers}問</div>
          <div className="text-sm text-gray-600 mt-1">復習が必要</div>
        </div>
      </div>

      {/* 難易度別の正答率 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>📊</span>
          難易度別の正答率
        </h3>
        <div className="space-y-4">
          {[
            { key: 'easy', label: '易しい', count: difficultyBuckets.easy.length, accuracy: difficultyStats.easy, color: 'green' },
            { key: 'medium', label: '普通', count: difficultyBuckets.medium.length, accuracy: difficultyStats.medium, color: 'yellow' },
            { key: 'hard', label: '難しい', count: difficultyBuckets.hard.length, accuracy: difficultyStats.hard, color: 'red' },
          ].map(({ key, label, count, accuracy, color }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  {label} ({count}問)
                </span>
                <span className={`text-sm font-bold text-${color}-600`}>
                  {accuracy}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`bg-${color}-500 h-3 rounded-full transition-all`}
                  style={{ width: `${accuracy}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* トピック別の正答率 */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>📚</span>
          トピック別の正答率
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from(topicMap.entries()).map(([topic, stats]) => {
            const topicAccuracy = Math.round((stats.correct / stats.total) * 100);
            return (
              <div key={topic} className="p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900 capitalize">{topic}</span>
                  <span className="text-sm font-bold text-blue-600">{topicAccuracy}%</span>
                </div>
                <div className="text-xs text-gray-600">
                  {stats.correct} / {stats.total} 問正解
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2 mt-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full"
                    style={{ width: `${topicAccuracy}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* 問題詳細レビュー */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <h3 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
          <span>📝</span>
          問題レビュー
        </h3>
        <div className="space-y-4">
          {results.map((result, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border-2 ${
                result.correct ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex items-start gap-3">
                <span className="flex-shrink-0 text-2xl">
                  {result.correct ? '✅' : '❌'}
                </span>
                <div className="flex-1">
                  <div className="font-medium text-gray-900 mb-2">
                    Q{index + 1}: {result.question.questionText}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">あなたの解答: </span>
                      <span className={result.correct ? 'text-green-700 font-medium' : 'text-red-700 font-medium'}>
                        {result.question.choices[result.userAnswer]}
                      </span>
                    </div>
                    {!result.correct && (
                      <div>
                        <span className="text-gray-600">正解: </span>
                        <span className="text-green-700 font-medium">
                          {result.question.choices[result.question.correctAnswerIndex]}
                        </span>
                      </div>
                    )}
                  </div>
                  {!result.correct && (
                    <div className="mt-2 p-3 bg-white rounded border border-gray-200">
                      <div className="text-sm text-gray-700">
                        <span className="font-medium">解説: </span>
                        {result.question.explanation}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* アクションボタン */}
      <div className="flex gap-4">
        <button
          onClick={onReset}
          className="flex-1 py-4 px-6 rounded-lg font-bold text-lg bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl transition-all"
        >
          新しい問題に挑戦
        </button>
      </div>
    </div>
  );
}
