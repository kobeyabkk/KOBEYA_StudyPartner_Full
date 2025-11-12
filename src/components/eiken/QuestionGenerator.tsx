/**
 * 英検問題生成UIコンポーネント
 */

import { useState } from 'react';
import type { EikenGrade, QuestionType } from '../../eiken/types';
import { useEikenGenerate } from '../../hooks/useEikenAPI';
import GradeSelector from './GradeSelector';

interface QuestionGeneratorProps {
  onQuestionsGenerated?: (questions: any[]) => void;
}

const SECTION_OPTIONS = [
  { value: 'vocabulary', label: '語彙問題', icon: '📚' },
  { value: 'grammar', label: '文法問題', icon: '✍️' },
  { value: 'reading', label: '読解問題', icon: '📖' },
];

const TOPIC_SUGGESTIONS = [
  'business', 'technology', 'environment', 'health', 'education',
  'culture', 'science', 'travel', 'sports', 'food'
];

export default function QuestionGenerator({ onQuestionsGenerated }: QuestionGeneratorProps) {
  const [grade, setGrade] = useState<EikenGrade>('pre1');
  const [section, setSection] = useState('vocabulary');
  const [count, setCount] = useState(5);
  const [difficulty, setDifficulty] = useState(0.6);
  const [topicHints, setTopicHints] = useState<string[]>([]);
  const [topicInput, setTopicInput] = useState('');

  const { loading, error, result, generateQuestions } = useEikenGenerate();

  const handleGenerate = async () => {
    console.log('🔴 handleGenerate CALLED!');
    alert('ボタンがクリックされました！');
    
    try {
      console.log('🎯 Generating questions with:', { grade, section, count, difficulty });
      const data = await generateQuestions({
        grade,
        section,
        questionType: section as QuestionType,
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
      alert('エラー: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const addTopicHint = (topic: string) => {
    if (topic && !topicHints.includes(topic)) {
      setTopicHints([...topicHints, topic]);
      setTopicInput('');
    }
  };

  const removeTopicHint = (topic: string) => {
    setTopicHints(topicHints.filter(t => t !== topic));
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
        <GradeSelector value={grade} onChange={setGrade} disabled={loading} />

        {/* セクション選択 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-3">
            問題タイプを選択
          </label>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SECTION_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setSection(option.value)}
                disabled={loading}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${section === option.value
                    ? 'border-green-500 bg-green-50 shadow-md'
                    : 'border-gray-200 bg-white hover:border-green-300'
                  }
                  ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                <div className="text-center">
                  <div className="text-3xl mb-2">{option.icon}</div>
                  <div className={`font-medium ${section === option.value ? 'text-green-700' : 'text-gray-900'}`}>
                    {option.label}
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
              {topicHints.map((topic) => (
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
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              問題を生成中...
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
