import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

/**
 * 英検練習メインページ
 */
import QuestionGenerator from '../../components/eiken/QuestionGenerator';
import QuestionDisplay from '../../components/eiken/QuestionDisplay';
import ResultsDashboard from '../../components/eiken/ResultsDashboard';
import UnifiedAIChat from '../../components/ai-chat/UnifiedAIChat';
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
  
  // AIチャットフローティングウィンドウの状態
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatSize, setChatSize] = useState({ width: 400, height: 600 });
  const [chatPosition, setChatPosition] = useState({ x: window.innerWidth - 420, y: 80 });
  const [isResizing, setIsResizing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  
  // ログイン状態の取得
  const [loginStatus, setLoginStatus] = useState<{
    isLoggedIn: boolean;
    studentName?: string;
  }>({ isLoggedIn: false });

  useEffect(() => {
    try {
      const authData = localStorage.getItem('study_partner_auth');
      if (authData) {
        const parsed = JSON.parse(authData);
        setLoginStatus({
          isLoggedIn: true,
          studentName: parsed.studentName || '生徒',
        });
      }
    } catch (error) {
      console.error('Failed to read login status:', error);
    }
  }, []);

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

  // Study Partnerに戻る際にlocalStorageをクリア
  const handleBackToStudyPartner = () => {
    // 英検練習の状態をすべてクリア
    localStorage.removeItem('eiken_practice_questions');
    localStorage.removeItem('eiken_practice_results');
    localStorage.removeItem('eiken_practice_viewMode');
    localStorage.removeItem('eiken_current_question_index');
    localStorage.removeItem('eiken_user_answers');
    localStorage.removeItem('eiken_submitted_questions');
    localStorage.removeItem('eiken_viewed_explanations');
    console.log('🔄 Cleared all Eiken practice data before returning to Study Partner');
    // ページ遷移
    window.location.href = '/study-partner';
  };

  // AIチャットのドラッグ処理
  const handleChatDragStart = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).classList.contains('chat-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - chatPosition.x,
        y: e.clientY - chatPosition.y
      });
    }
  };

  const handleChatDrag = (e: MouseEvent) => {
    if (isDragging) {
      setChatPosition({
        x: Math.max(0, Math.min(window.innerWidth - chatSize.width, e.clientX - dragOffset.x)),
        y: Math.max(0, Math.min(window.innerHeight - 60, e.clientY - dragOffset.y))
      });
    }
  };

  const handleChatDragEnd = () => {
    setIsDragging(false);
  };

  // AIチャットのリサイズ処理
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
  };

  const handleResize = (e: MouseEvent) => {
    if (isResizing) {
      const newWidth = Math.max(300, Math.min(800, e.clientX - chatPosition.x));
      const newHeight = Math.max(400, Math.min(window.innerHeight - chatPosition.y - 20, e.clientY - chatPosition.y));
      setChatSize({ width: newWidth, height: newHeight });
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // イベントリスナーの登録
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleChatDrag);
      window.addEventListener('mouseup', handleChatDragEnd);
      return () => {
        window.removeEventListener('mousemove', handleChatDrag);
        window.removeEventListener('mouseup', handleChatDragEnd);
      };
    }
  }, [isDragging, dragOffset, chatSize.width]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize);
      window.addEventListener('mouseup', handleResizeEnd);
      return () => {
        window.removeEventListener('mousemove', handleResize);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, chatPosition]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 py-8">
      <div className="container mx-auto px-4">
        {/* フローティングAIチャットボタン */}
        <style>{`
          @keyframes pulse-subtle {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.85; }
          }
          .ai-chat-button {
            animation: pulse-subtle 3s ease-in-out infinite;
          }
          .ai-chat-button:hover {
            animation: none;
          }
          /* スマホでさらに小さく */
          @media (max-width: 640px) {
            .ai-chat-button {
              width: 48px !important;
              height: 48px !important;
              bottom: 1rem !important;
              right: 1rem !important;
            }
            .ai-chat-button svg {
              width: 1.5rem !important;
              height: 1.5rem !important;
            }
          }
        `}</style>
        
        {/* フローティングAIチャットボタン */}
        {!isChatOpen && (
          <button
            onClick={() => setIsChatOpen(true)}
            className="ai-chat-button fixed bottom-6 right-6 z-50 group"
            style={{
              width: '56px',
              height: '56px'
            }}
          >
            <div className="w-full h-full bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center group-hover:scale-110">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
            </div>
            
            <div className="hidden md:block absolute right-full top-1/2 -translate-y-1/2 mr-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
              <div className="bg-gray-900 text-white text-sm font-medium px-3 py-2 rounded-lg whitespace-nowrap shadow-lg">
                AIに質問する
                <div className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-1 w-2 h-2 bg-gray-900 rotate-45"></div>
              </div>
            </div>
          </button>
        )}

        {/* フローティングAIチャットウィンドウ */}
        {isChatOpen && (
          <UnifiedAIChat
            sessionId={`eiken-${loginStatus.studentName || 'guest'}-${Date.now()}`}
            contextType="eiken"
            onClose={() => setIsChatOpen(false)}
            position={chatPosition}
            size={chatSize}
            onDragStart={handleChatDragStart}
            onResizeStart={handleResizeStart}
          />
        )}

        {/* ヘッダー */}
        <header className="text-center mb-8 relative">
          {/* 戻るボタン */}
          <div className="absolute left-0 top-0">
            <button
              onClick={handleBackToStudyPartner}
              className="inline-flex items-center gap-2 px-4 py-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Study Partnerに戻る</span>
            </button>
          </div>

          {/* ログイン状態インジケーター */}
          <div className="absolute right-0 top-0">
            <div
              className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
                loginStatus.isLoggedIn
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-gray-50 text-gray-500 border border-gray-200'
              }`}
              title={
                loginStatus.isLoggedIn
                  ? `${loginStatus.studentName}さんとしてログイン中`
                  : 'ログインしていません'
              }
            >
              <div
                className={`w-2 h-2 rounded-full ${
                  loginStatus.isLoggedIn ? 'bg-green-500' : 'bg-gray-400'
                }`}
              />
              <span className="hidden sm:inline font-medium">
                {loginStatus.isLoggedIn
                  ? loginStatus.studentName
                  : 'ゲスト'}
              </span>
            </div>
          </div>
          
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
