import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

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
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<ViewMode>('generator');
  const [questions, setQuestions] = useState<GeneratedQuestion[]>([]);
  const [results, setResults] = useState<AnswerResult[]>([]);

  // Load saved state from localStorage on mount
  useEffect(() => {
    try {
      const savedQuestions = localStorage.getItem('eiken_practice_questions');
      const savedResults = localStorage.getItem('eiken_practice_results');
      const savedViewMode = localStorage.getItem('eiken_practice_viewMode');
      
      let questionsRestored = false;
      
      if (savedQuestions) {
        const parsed = JSON.parse(savedQuestions);
        if (parsed && parsed.length > 0) {
          setQuestions(parsed);
          questionsRestored = true;
          console.log('📂 Restored questions from localStorage:', parsed.length);
        }
      }
      
      if (savedResults) {
        const parsed = JSON.parse(savedResults);
        setResults(parsed);
        console.log('📂 Restored results from localStorage:', parsed.length);
      }
      
      // Only restore viewMode if we have questions (except for 'generator' mode)
      if (savedViewMode && (savedViewMode === 'generator' || savedViewMode === 'practice' || savedViewMode === 'results')) {
        if (savedViewMode === 'generator' || questionsRestored) {
          setViewMode(savedViewMode as ViewMode);
          console.log('📂 Restored viewMode from localStorage:', savedViewMode);
        } else {
          // If viewMode is practice/results but no questions, reset to generator
          console.log('⚠️ ViewMode was', savedViewMode, 'but no questions found, resetting to generator');
          setViewMode('generator');
          // Clear invalid state
          localStorage.removeItem('eiken_practice_viewMode');
        }
      }
    } catch (error) {
      console.error('Failed to restore state from localStorage:', error);
      // On error, ensure we're in generator mode
      setViewMode('generator');
    }
  }, []);

  // Restore viewMode from URL parameter when returning from vocabulary notebook
  useEffect(() => {
    const mode = searchParams.get('mode') as ViewMode;
    if (mode && (mode === 'generator' || mode === 'practice' || mode === 'results')) {
      setViewMode(mode);
      console.log('🔗 Restored viewMode from URL:', mode);
      // Clear the parameter after reading it
      searchParams.delete('mode');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (questions.length > 0) {
        localStorage.setItem('eiken_practice_questions', JSON.stringify(questions));
        console.log('💾 Saved questions to localStorage:', questions.length);
      }
      
      if (results.length > 0) {
        localStorage.setItem('eiken_practice_results', JSON.stringify(results));
        console.log('💾 Saved results to localStorage:', results.length);
      }
      
      localStorage.setItem('eiken_practice_viewMode', viewMode);
      console.log('💾 Saved viewMode to localStorage:', viewMode);
    } catch (error) {
      console.error('Failed to save state to localStorage:', error);
    }
  }, [questions, results, viewMode]);

  // デバッグ: 状態変化を監視
  console.log('🔄 Component render - viewMode:', viewMode, 'questions:', questions.length);

  const handleQuestionsGenerated = (generatedQuestions: GeneratedQuestion[]) => {
    console.log('📥 handleQuestionsGenerated called with:', generatedQuestions);
    console.log('📊 Questions count:', generatedQuestions.length);
    console.log('📝 First question:', generatedQuestions[0]);
    
    // Clear previous question display progress when new questions are generated
    localStorage.removeItem('eiken_current_question_index');
    localStorage.removeItem('eiken_user_answers');
    localStorage.removeItem('eiken_submitted_questions');
    localStorage.removeItem('eiken_viewed_explanations');
    console.log('🗑️ Cleared previous question progress');
    
    setQuestions(generatedQuestions);
    setViewMode('practice');
    console.log('🎬 View mode changed to: practice');
  };

  const handlePracticeComplete = (practiceResults: AnswerResult[]) => {
    setResults(practiceResults);
    setViewMode('results');
  };

  const handleReset = () => {
    setQuestions([]);
    setResults([]);
    setViewMode('generator');
    // Clear localStorage - including question display progress
    localStorage.removeItem('eiken_practice_questions');
    localStorage.removeItem('eiken_practice_results');
    localStorage.removeItem('eiken_practice_viewMode');
    localStorage.removeItem('eiken_current_question_index');
    localStorage.removeItem('eiken_user_answers');
    localStorage.removeItem('eiken_submitted_questions');
    localStorage.removeItem('eiken_viewed_explanations');
    console.log('🗑️ Cleared practice state from localStorage');
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
            <Link
              to={`/vocabulary/notebook?returnTo=${viewMode}`}
              className="px-6 py-2 rounded-md font-medium transition-all text-gray-600 hover:text-gray-900 hover:bg-gray-50"
            >
              📚 語彙ノート
            </Link>
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
