import { useState } from 'react';

/**
 * 英検問題生成UIコンポーネント
 */
import type { EikenGrade, QuestionType } from '../../eiken/types';
import { useEikenGenerate } from '../../hooks/useEikenAPI';
import GradeSelector from './GradeSelector';

interface QuestionGeneratorProps {
  onQuestionsGenerated?: (questions: any[]) => void;
}

// Phase 3 API対応: 英検の正式な問題形式
// 注: essayは3級以上でのみ利用可能（実際の英検に準拠）
const FORMAT_OPTIONS = [
  { value: 'grammar_fill', label: '短文の語句空所補充', icon: '📚', description: '語彙・文法問題', minGrade: '5' },
  { value: 'long_reading', label: '長文読解', icon: '📖', description: '内容一致選択', minGrade: '5' },
  { value: 'essay', label: 'ライティング (意見論述)', icon: '✍️', description: 'エッセイ形式', minGrade: '3' },
];

const TOPIC_SUGGESTIONS = [
  'business', 'technology', 'environment', 'health', 'education',
  'culture', 'science', 'travel', 'sports', 'food'
];

export default function QuestionGenerator({ onQuestionsGenerated }: QuestionGeneratorProps) {
  const [grade, setGrade] = useState<EikenGrade>('pre1');
  const [format, setFormat] = useState('grammar_fill');  // Phase 3: format instead of section
  // 長文読解はデフォルト3パッセージ、他は5問
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState(0.6);
  
  // format変更時にcountを適切な値にリセット
  const handleFormatChange = (newFormat: string) => {
    setFormat(newFormat);
    if (newFormat === 'long_reading') {
      setCount(Math.min(count, 3)); // 長文は最大3パッセージに制限
    }
  };
  const [topicHints, setTopicHints] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');

  const { loading, error, result, generateQuestions } = useEikenGenerate();
  const [progressMessage, setProgressMessage] = useState('');
  const [estimatedTime, setEstimatedTime] = useState(0);

  const handleGenerate = async () => {
    console.log('🔴 handleGenerate CALLED!');
    
    // 推定時間を計算
    const timePerQuestion = format === 'long_reading' ? 12 : format === 'essay' ? 8 : 4;
    const estimated = Math.ceil(count * timePerQuestion);
    setEstimatedTime(estimated);
    setProgressMessage(`問題を生成中... (推定時間: 約${estimated}秒)`)
    
    try {
      console.log('🎯 Generating questions with:', { grade, format, count, difficulty });
      const data = await generateQuestions({
        grade,
        format,  // Phase 3: use format instead of section
        count,
        difficulty,
        topicHints: topicHints.length > 0 ? topicHints : undefined,
      });

      console.log('✅ API Response:', data);
      console.log('📊 Generated questions:', data.generated);
      console.log('🔗 onQuestionsGenerated callback exists?', !!onQuestionsGenerated);

      if (data.success && onQuestionsGenerated) {
        console.log('🚀 Calling onQuestionsGenerated with', data.generated.length, 'questions');
        onQuestionsGenerated(data.generated);
      } else {
        console.warn('⚠️ Conditions not met:', { success: data.success, hasCallback: !!onQuestionsGenerated });
      }
    } catch (err) {
      console.error('❌ Failed to generate questions:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      
      // ユーザーフレンドリーなエラーメッセージ
      let userMessage = errorMessage;
      if (errorMessage.includes('Failed to generate valid question')) {
        userMessage = '問題の生成に失敗しました。\n\n' +
          '原因：語彙レベルや著作権の検証に通らなかった可能性があります。\n' +
          '対処：もう一度「問題を生成する」ボタンを押してください。\n' +
          '（2回目以降は成功する可能性が高いです）';
      }
      
      alert('エラー: ' + userMessage);
    }
  };

  const addTopicHint = (topic: string) => {
    if (topic && !topicHints.includes(topic)) {
      setTopicHints([...topicHints, topic]);
      setTopicInput('');
    }
  };

  const removeTopicHint = (topic: string) => {
    setTopicHints(topicHints.filter((t: string) => t !== topic));
  };

  // gradeに応じて利用可能なフォーマットをフィルタリング
  const getAvailableFormats = () => {
    const gradeOrder = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
    const currentGradeIndex = gradeOrder.indexOf(grade);
    
    return FORMAT_OPTIONS.filter(option => {
      const minGradeIndex = gradeOrder.indexOf(option.minGrade || '5');
      return currentGradeIndex >= minGradeIndex;
    });
  };

  // gradeが変更されたときに、選択中のformatが利用可能かチェック
  const handleGradeChange = (newGrade: EikenGrade) => {
    setGrade(newGrade);
    
    // 新しいgradeで利用可能なフォーマットを取得
    const gradeOrder = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
    const newGradeIndex = gradeOrder.indexOf(newGrade);
    
    // 現在選択中のformatが利用不可の場合、grammar_fillにリセット
    const currentFormat = FORMAT_OPTIONS.find(opt => opt.value === format);
    if (currentFormat) {
      const minGradeIndex = gradeOrder.indexOf(currentFormat.minGrade || '5');
      if (newGradeIndex < minGradeIndex) {
        setFormat('grammar_fill');
      }
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 bg-white rounded-xl shadow-lg">
      <div className="mb-6">
        <h2 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
          <span className="text-4xl">🎯</span>
          英検問題生成
        </h2>
        <p className="mt-2 text-gray-600">
          AIが過去問を分析して、オリジナルの練習問題を生成します
        </p>
      </div>

      <div className="space-y-6">
        {/* グレード選択 */}
        <GradeSelector value={grade} onChange={handleGradeChange} disabled={loading} />

        {/* 問題フォーマット選択 (Phase 3対応) */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            問題タイプを選択 <span className="text-xs text-purple-600 ml-2">✨ Phase 3 API - 英検一次試験対応</span>
          </label>
          {['5', '4'].includes(grade) && (
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                <span className="font-semibold">💡 5級・4級の方へ:</span> 実際の英検5級・4級にはライティング問題はありません。
                文法問題と長文読解で練習しましょう。
              </p>
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {getAvailableFormats().map((option) => (
              <button
                key={option.value}
                onClick={() => setFormat(option.value)}
                disabled={loading}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${format === option.value
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-green-300'
                  }
                  ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="text-center">
                  <div className="text-3xl mb-2">{option.icon}</div>
                  <div className={`font-medium text-sm ${format === option.value ? 'text-green-700' : 'text-gray-900'}`}>
                    {option.label}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {option.description}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* 問題数スライダー */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            生成する問題数: <span className="text-blue-600 font-bold">{count}問</span>
          </label>
          {format === 'long_reading' && (
            <p className="text-xs text-gray-500 mb-2">
              💡 長文読解：約{Math.ceil(count / 3.5)}パッセージを生成します（各パッセージに3-4問）
            </p>
          )}
          <input
            type="range"
            min="1"
            max="20"
            value={count}
            onChange={(e) => setCount(Number(e.target.value))}
            disabled={loading}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>1問</span>
            <span>20問</span>
          </div>
        </div>

        {/* 難易度スライダー */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            難易度: <span className="text-purple-600 font-bold">{Math.round(difficulty * 100)}%</span>
          </label>
          <input
            type="range"
            min="0.3"
            max="0.9"
            step="0.1"
            value={difficulty}
            onChange={(e) => setDifficulty(Number(e.target.value))}
            disabled={loading}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>易しい</span>
            <span>難しい</span>
          </div>
        </div>

        {/* トピックヒント */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            トピックヒント（任意）
          </label>
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && addTopicHint(topicInput)}
              placeholder="例: business, technology"
              disabled={loading}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              onClick={() => addTopicHint(topicInput)}
              disabled={loading || !topicInput}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              追加
            </button>
          </div>

          {/* トピック候補 */}
          <div className="flex flex-wrap gap-2 mb-3">
            {TOPIC_SUGGESTIONS.map((topic) => (
              <button
                key={topic}
                onClick={() => addTopicHint(topic)}
                disabled={loading || topicHints.includes(topic)}
                className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-full hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {topic}
              </button>
            ))}
          </div>

          {/* 選択されたトピック */}
          {topicHints.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {topicHints.map((topic: string) => (
                <span
                  key={topic}
                  className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full"
                >
                  {topic}
                  <button
                    onClick={() => removeTopicHint(topic)}
                    disabled={loading}
                    className="ml-1 hover:text-blue-900"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* 生成ボタン */}
        <button
          onClick={handleGenerate}
          disabled={loading}
          className={`
            w-full py-4 px-6 rounded-lg font-bold text-lg transition-all
            ${loading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700 shadow-lg hover:shadow-xl'
            }
          `}
        >
          {loading ? (
            <span className="flex flex-col items-center justify-center gap-3">
              <div className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                問題を生成中...
              </div>
              {estimatedTime > 0 && (
                <span className="text-sm opacity-90">
                  推定時間: 約{estimatedTime}秒 | {count}問生成中
                </span>
              )}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <span>🚀</span>
              問題を生成する
            </span>
          )}
        </button>

        {/* エラー表示 */}
        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-2xl">⚠️</span>
              <div>
                <h4 className="font-medium text-red-900">エラーが発生しました</h4>
                <p className="mt-1 text-sm text-red-700">{error}</p>
              </div>
            </div>
          </div>
        )}

        {/* 生成結果サマリー */}
        {result && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
            <div className="flex items-start gap-3">
              <span className="text-2xl">✅</span>
              <div className="flex-1">
                <h4 className="font-medium text-green-900">生成完了！</h4>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <span className="text-gray-600">生成数:</span>
                    <span className="ml-2 font-bold text-green-700">{result.generated.length}問</span>
                  </div>
                  <div>
                    <span className="text-gray-600">却下数:</span>
                    <span className="ml-2 font-bold text-red-600">{result.rejected}問</span>
                  </div>
                  <div>
                    <span className="text-gray-600">試行回数:</span>
                    <span className="ml-2 font-bold text-blue-600">{result.totalAttempts}回</span>
                  </div>
                  <div>
                    <span className="text-gray-600">承認率:</span>
                    <span className="ml-2 font-bold text-purple-600">
                      {Math.round((result.generated.length / result.totalAttempts) * 100)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
