import { useState } from 'react';

/**
 * 英検練習メインページ
 */
import QuestionGenerator from '../../components/eiken/QuestionGenerator';
import QuestionDisplay from '../../components/eiken/QuestionDisplay';
import ResultsDashboard from '../../components/eiken/ResultsDashboard';
import type { GeneratedQuestion } from '../../hooks/useEikenAPI';

type ViewMode = 'generator' | 'practice' | 'results';

interface AnswerResult {
  question: GeneratedQuestion;
  userAnswer: number;
  correct: boolean;
  timeSpent: number;
}

export default function EikenPracticePage() {
  const [viewMode, setViewMode] = useState<ViewMode>('generator');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [results, setResults] = useState<AnswerResult[]>([]);

  const handleQuestionsGenerated = (generatedQuestions: GeneratedQuestion[]) => {
    setQuestions(generatedQuestions);
    setViewMode('practice');
  };

  const handlePracticeComplete = (practiceResults: AnswerResult[]) => {
    setResults(practiceResults);
    setViewMode('results');
  };

  const handleReset = () => {
    setQuestions([]);
    setResults([]);
    setViewMode('generator');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-8">
      <div className="container mx-auto px-4">
        {/* ヘッダー */}
        <header className="text-center mb-8">
          <h1 className="text-5xl font-bold text-gray-900 mb-3 flex items-center justify-center gap-3">
            <span className="text-6xl">🎓</span>
            英検AI練習システム
          </h1>
          <p className="text-xl text-gray-600">
            AIが生成するオリジナル問題で英検対策
          </p>
        </header>

        {/* ナビゲーションタブ */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex rounded-lg border border-gray-300 bg-white p-1 shadow-sm">
            <button
              onClick={() => setViewMode('generator')}
              disabled={viewMode === 'practice'}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                viewMode === 'generator'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              } ${viewMode === 'practice' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              📝 問題生成
            </button>
            <button
              onClick={() => questions.length > 0 && setViewMode('practice')}
              disabled={questions.length === 0 || viewMode === 'practice'}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                viewMode === 'practice'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              } ${questions.length === 0 || viewMode === 'practice' ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              ✏️ 練習
            </button>
            <button
              onClick={() => results.length > 0 && setViewMode('results')}
              disabled={results.length === 0}
              className={`px-6 py-2 rounded-md font-medium transition-all ${
                viewMode === 'results'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-gray-600 hover:text-gray-900'
              } ${results.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              📊 結果
            </button>
          </div>
        </div>

        {/* メインコンテンツ */}
        <main>
          {viewMode === 'generator' && (
            <QuestionGenerator onQuestionsGenerated={handleQuestionsGenerated} />
          )}

          {viewMode === 'practice' && questions.length > 0 && (
            <QuestionDisplay 
              questions={questions} 
              onComplete={handlePracticeComplete}
            />
          )}

          {viewMode === 'results' && results.length > 0 && (
            <ResultsDashboard 
              results={results} 
              onReset={handleReset}
            />
          )}
        </main>

        {/* フッター */}
        <footer className="mt-16 text-center text-gray-600">
          <div className="mb-4">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white rounded-full shadow-sm">
              <span className="text-green-500">●</span>
              <span className="text-sm font-medium">著作権安全チェック付き</span>
            </div>
          </div>
          <p className="text-sm">
            © 2025 KOBEYA Study Partner - AI-Powered Learning Platform
          </p>
        </footer>
      </div>
    </div>
  );
}
