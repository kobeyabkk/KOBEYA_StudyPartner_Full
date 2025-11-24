import { useState, useEffect } from 'react';

/**
 * 英検問題表示・解答コンポーネント
 */
import type { GeneratedQuestion } from '../../hooks/useEikenAPI';
import { AnnotatedText } from '../../utils/vocabulary-annotator';
import VocabularyPopup from './VocabularyPopup';

interface QuestionDisplayProps {
  questions: GeneratedQuestion[];
  onComplete?: (results: AnswerResult[]) => void;
}

interface AnswerResult {
  question: GeneratedQuestion;
  userAnswer: number;
  correct: boolean;
  timeSpent: number;
}

interface PassageTranslation {
  passage: string;
  translation: string;
  loading: boolean;
  error?: string;
}

export default function QuestionDisplay({ questions, onComplete }: QuestionDisplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswers, setUserAnswers] = useState<Map<number, number>>(new Map()); // 各問題の解答を保存
  const [submittedQuestions, setSubmittedQuestions] = useState<Set<number>>(new Set()); // 解答済み問題
  const [viewedExplanations, setViewedExplanations] = useState<Set<number>>(new Set()); // 解説を見た問題
  const [showPassage, setShowPassage] = useState(true); // 長文表示フラグ
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [startTime] = useState(Date.now());
  const [passageTranslations, setPassageTranslations] = useState<Map<string, PassageTranslation>>(new Map());
  const [translationStarted, setTranslationStarted] = useState(false);
  const [prevPassage, setPrevPassage] = useState<string>(''); // 前の長文を記憶
  
  // Phase 4B: Vocabulary annotation state
  const [selectedVocabNote, setSelectedVocabNote] = useState<any | null>(null);

  // 現在の問題の状態を取得
  const selectedAnswer = userAnswers.get(currentIndex) ?? null;
  const isSubmitted = submittedQuestions.has(currentIndex);
  const showExplanation = viewedExplanations.has(currentIndex);
  const canModifyAnswer = !showExplanation; // 解説を見ていなければ修正可能

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const answered = selectedAnswer !== null;

  // 現在の長文を取得
  const currentPassage = (currentQuestion as any).passage || '';
  
  // ユニークな長文のリストを作成し、現在の長文が何番目かを計算
  const uniquePassages = Array.from(new Set(
    questions
      .filter(q => q.topic === 'long_reading' && (q as any).passage)
      .map(q => (q as any).passage)
  ));
  const passageIndex = uniquePassages.indexOf(currentPassage);
  const passageNumber = passageIndex >= 0 ? passageIndex + 1 : 1;
  const totalPassages = uniquePassages.length;
  
  // デバッグログ
  console.log('🔍 Passage Debug:', {
    currentIndex,
    totalPassages,
    passageNumber,
    uniquePassagesCount: uniquePassages.length,
    currentPassageLength: currentPassage.length,
    allPassagesLengths: uniquePassages.map(p => p.length)
  });

  const handleAnswerSelect = (index: number) => {
    if (!canModifyAnswer) return; // 解説を見た後は変更不可
    setUserAnswers(new Map(userAnswers).set(currentIndex, index));
  };

  const handleSubmit = () => {
    if (selectedAnswer === null) return;

    const isCorrect = selectedAnswer === currentQuestion.correctAnswerIndex;
    const timeSpent = Math.round((Date.now() - startTime) / 1000);

    const newResult: AnswerResult = {
      question: currentQuestion,
      userAnswer: selectedAnswer,
      correct: isCorrect,
      timeSpent,
    };

    // resultsを更新（既存の結果を上書き）
    const newResults = [...results];
    const existingIndex = newResults.findIndex(r => r.question === currentQuestion);
    if (existingIndex >= 0) {
      newResults[existingIndex] = newResult;
    } else {
      newResults.push(newResult);
    }
    setResults(newResults);
    
    // 解答済みフラグを立てる（解説は非表示のまま）
    setSubmittedQuestions(new Set(submittedQuestions).add(currentIndex));
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      const nextQuestion = questions[currentIndex + 1];
      const nextPassage = (nextQuestion as any).passage || '';
      // 長文が変わったら自動的に表示
      if (nextPassage !== currentPassage) {
        setShowPassage(true);
      }
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevQuestion = questions[currentIndex - 1];
      const prevPassage = (prevQuestion as any).passage || '';
      // 長文が変わったら自動的に表示
      if (prevPassage !== currentPassage) {
        setShowPassage(true);
      }
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleComplete = () => {
    // 全問題完了 - 翻訳データも一緒に渡す
    if (onComplete) {
      // resultsに翻訳データを追加
      const resultsWithTranslations = results.map(r => {
        const q = r.question as any;
        if (q.passage && passageTranslations.has(q.passage)) {
          const translationData = passageTranslations.get(q.passage);
          return {
            ...r,
            question: {
              ...r.question,
              passageJa: translationData?.translation || '',
            },
          };
        }
        return r;
      });
      onComplete(resultsWithTranslations);
    }
  };
  
  // Phase 4B: Add vocabulary to notebook
  const handleAddToNotebook = async (wordId: number) => {
    try {
      const response = await fetch('/api/vocabulary/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: 'user-123', // TODO: Get from auth context
          word_id: wordId,
          source_context: {
            question_id: currentQuestion.id?.toString(),
            question_type: currentQuestion.topic,
          }
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to add to notebook');
      }
      
      console.log('✅ Word added to vocabulary notebook');
    } catch (error) {
      console.error('❌ Failed to add word to notebook:', error);
      throw error;
    }
  };
  
  // Phase 4B: Render text with vocabulary annotations
  const renderTextWithAnnotations = (text: string, vocabularyNotes?: any[]) => {
    if (!vocabularyNotes || vocabularyNotes.length === 0) {
      return <p className="whitespace-pre-wrap">{text}</p>;
    }
    
    // Split text into words and annotate difficult ones
    const words = text.split(/(\s+|[.,!?;:])/);
    
    return (
      <p className="whitespace-pre-wrap">
        {words.map((word, index) => {
          // Check if this word is in vocabulary notes
          const normalizedWord = word.toLowerCase().replace(/[.,!?;:]/g, '');
          const note = vocabularyNotes.find(n => 
            n.word.toLowerCase() === normalizedWord
          );
          
          if (note) {
            return (
              <span
                key={index}
                onClick={() => setSelectedVocabNote(note)}
                className="inline-flex items-center cursor-pointer underline decoration-dotted decoration-blue-500 hover:decoration-solid hover:bg-blue-50 transition-colors"
                title="クリックして語彙詳細を表示"
              >
                {word}
                <span className="ml-1 text-blue-500">📚</span>
              </span>
            );
          }
          
          return <span key={index}>{word}</span>;
        })}
      </p>
    );
  };

  // 解説の表示/非表示を切り替え
  const toggleExplanation = () => {
    if (viewedExplanations.has(currentIndex)) {
      // 既に見ている場合は非表示に
      const newSet = new Set(viewedExplanations);
      newSet.delete(currentIndex);
      setViewedExplanations(newSet);
    } else {
      // 初めて見る場合は表示し、以降修正不可にする
      setViewedExplanations(new Set(viewedExplanations).add(currentIndex));
    }
  };

  // 長文表示の切り替え
  const togglePassage = () => {
    setShowPassage(!showPassage);
  };

  const getChoiceColor = (index: number) => {
    // 解説を見るボタンを押すまでは色を表示しない
    if (!showExplanation) {
      return selectedAnswer === index 
        ? 'border-blue-500 bg-blue-50' 
        : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50';
    }

    // 解説表示時のみ正解/不正解の色を表示
    if (index === currentQuestion.correctAnswerIndex) {
      return 'border-green-500 bg-green-50'; // 正解
    }
    if (selectedAnswer === index && selectedAnswer !== currentQuestion.correctAnswerIndex) {
      return 'border-red-500 bg-red-50'; // 不正解
    }
    return 'border-gray-300 bg-gray-50';
  };

  const getChoiceIcon = (index: number) => {
    if (!showExplanation) return null;

    if (index === currentQuestion.correctAnswerIndex) {
      return <span className="text-green-600 text-xl">✓</span>;
    }
    if (selectedAnswer === index && selectedAnswer !== currentQuestion.correctAnswerIndex) {
      return <span className="text-red-600 text-xl">✗</span>;
    }
    return null;
  };

  // バックグラウンド翻訳の開始
  useEffect(() => {
    // 最初の問題を開始したら、長文読解の翻訳を開始
    if (currentIndex === 0 && !translationStarted && questions.length > 0) {
      setTranslationStarted(true);
      startBackgroundTranslations();
    }
  }, [currentIndex, translationStarted, questions]);

  const startBackgroundTranslations = async () => {
    // long_reading形式の問題から、ユニークなpassageを抽出
    const uniquePassages = new Map<string, string>();
    questions.forEach((q) => {
      if (q.topic === 'long_reading' && (q as any).passage) {
        const passage = (q as any).passage;
        if (!uniquePassages.has(passage) && !passageTranslations.has(passage)) {
          uniquePassages.set(passage, passage);
        }
      }
    });

    console.log(`🌍 Starting background translation for ${uniquePassages.size} passages...`);

    // 各パッセージを翻訳
    for (const [key, passage] of uniquePassages.entries()) {
      // ローディング状態をセット
      setPassageTranslations(prev => new Map(prev).set(key, {
        passage,
        translation: '',
        loading: true,
      }));

      try {
        // OpenAI APIで翻訳
        const response = await fetch('/api/eiken/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: passage }),
        });

        if (!response.ok) {
          throw new Error('Translation failed');
        }

        const data = await response.json();
        const translation = data.translation || '';

        console.log(`✅ Translation completed for passage (${passage.substring(0, 50)}...)`);

        // 翻訳結果をセット
        setPassageTranslations(prev => new Map(prev).set(key, {
          passage,
          translation,
          loading: false,
        }));
      } catch (error) {
        console.error('❌ Translation error:', error);
        setPassageTranslations(prev => new Map(prev).set(key, {
          passage,
          translation: '',
          loading: false,
          error: '翻訳に失敗しました',
        }));
      }

      // Rate limit対策（次の翻訳まで少し待機）
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log('🌍 All translations completed!');
  };

  const correctCount = results.filter((r: AnswerResult) => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 進捗バー */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-lg font-bold text-gray-900">
            問題 {currentIndex + 1} / {questions.length}
          </span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">
              解答済み: {submittedQuestions.size} / {questions.length}
            </span>
            <span className="text-sm text-gray-600">
              正答率: {accuracy}% ({correctCount}/{results.length})
            </span>
          </div>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${(submittedQuestions.size / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 問題カード */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        {/* 長文表示ボタン（long_reading形式の場合） */}
        {currentQuestion.topic === 'long_reading' && (currentQuestion as any).passage && (
          <div className="mb-6">
            <button
              onClick={togglePassage}
              className="w-full px-4 py-3 rounded-lg font-medium bg-gradient-to-r from-indigo-500 to-purple-500 text-white hover:from-indigo-600 hover:to-purple-600 transition-all flex items-center justify-between"
            >
              <span className="flex items-center gap-2">
                <span className="text-xl">📖</span>
                <span>
                  {showPassage ? '長文を隠す' : '長文を表示'}
                  {totalPassages > 1 ? ` (長文 ${passageNumber}/${totalPassages})` : ''}
                </span>
              </span>
              <span className={`transform transition-transform ${showPassage ? 'rotate-180' : ''}`}>
                ▼
              </span>
            </button>
            
            {/* 長文パッセージ */}
            {showPassage && (
              <div className="mt-4 p-6 bg-gray-50 rounded-lg border-2 border-gray-200">
                <div className="prose prose-sm max-w-none">
                  <div className="text-gray-800 leading-relaxed">
                    {renderTextWithAnnotations(
                      (currentQuestion as any).passage,
                      (currentQuestion as any).vocabulary_notes
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 問題文 */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              Q
            </span>
            <h3 className="text-xl font-medium text-gray-900 leading-relaxed">
              {renderTextWithAnnotations(
                currentQuestion.questionText,
                (currentQuestion as any).vocabulary_notes
              )}
            </h3>
          </div>

          {/* メタデータ */}
          <div className="flex flex-wrap gap-2 mb-6">
            <span className="px-3 py-1 bg-purple-100 text-purple-700 text-xs font-medium rounded-full">
              難易度: {Math.round(currentQuestion.difficulty * 100)}%
            </span>
            <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              {currentQuestion.topic}
            </span>
            <span className="px-3 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
              著作権スコア: {currentQuestion.copyrightScore}
            </span>
          </div>
        </div>

        {/* 選択肢 */}
        <div className="space-y-3 mb-6">
          {currentQuestion.choices.map((choice, index) => (
            <button
              key={index}
              onClick={() => handleAnswerSelect(index)}
              disabled={!canModifyAnswer}
              className={`
                w-full p-4 rounded-lg border-2 text-left transition-all
                flex items-center justify-between
                ${getChoiceColor(index)}
                ${!canModifyAnswer ? 'cursor-default opacity-75' : 'cursor-pointer'}
              `}
            >
              <div className="flex items-center gap-3 flex-1">
                <span className={`
                  flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center font-bold
                  ${selectedAnswer === index && !showExplanation ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}
                  ${showExplanation && index === currentQuestion.correctAnswerIndex ? 'bg-green-500 text-white' : ''}
                  ${showExplanation && selectedAnswer === index && index !== currentQuestion.correctAnswerIndex ? 'bg-red-500 text-white' : ''}
                `}>
                  {index + 1}
                </span>
                <span className="text-gray-900 font-medium">
                  <AnnotatedText 
                    text={choice}
                    config={{
                      enabled: true,
                      minDifficultyScore: 40,
                      displayMode: 'hover',
                      showKatakana: false,
                      userId: 'user-123'
                    }}
                  />
                </span>
              </div>
              {getChoiceIcon(index)}
            </button>
          ))}
        </div>

        {/* 解説表示（アコーディオン） */}
        {isSubmitted && showExplanation && (
          <div className={`p-4 rounded-lg border-2 mt-4 ${
            selectedAnswer === currentQuestion.correctAnswerIndex
              ? 'bg-green-50 border-green-200'
              : 'bg-red-50 border-red-200'
          }`}>
            <div className="flex items-start gap-3 mb-3">
              <span className="text-2xl">
                {selectedAnswer === currentQuestion.correctAnswerIndex ? '🎉' : '📚'}
              </span>
              <div>
                <h4 className={`font-bold ${
                  selectedAnswer === currentQuestion.correctAnswerIndex
                    ? 'text-green-900'
                    : 'text-red-900'
                }`}>
                  {selectedAnswer === currentQuestion.correctAnswerIndex ? '正解です！' : '不正解'}
                </h4>
                <p className="mt-2 text-gray-700 leading-relaxed">
                  {currentQuestion.explanation}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* アクションボタン（下部：前の問題、解答/解説、次の問題） */}
        <div className="space-y-3 mt-6">
          {/* ナビゲーションと解答ボタン */}
          <div className="flex gap-3">
            {/* 前の問題 */}
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                currentIndex === 0
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-600 text-white hover:bg-gray-700 shadow-lg hover:shadow-xl'
              }`}
            >
              ← 前の問題
            </button>
            
            {/* 解答または解説ボタン */}
            {!isSubmitted ? (
              <button
                onClick={handleSubmit}
                disabled={selectedAnswer === null}
                className={`flex-[2] py-3 px-6 rounded-lg font-bold transition-all ${
                  selectedAnswer !== null
                    ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }`}
              >
                解答する
              </button>
            ) : (
              <button
                onClick={toggleExplanation}
                className="flex-[2] py-3 px-6 rounded-lg font-bold bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:from-purple-700 hover:to-pink-700 shadow-lg hover:shadow-xl transition-all"
              >
                {showExplanation ? '解説を隠す' : '結果を見る'}
              </button>
            )}
            
            {/* 次の問題 */}
            <button
              onClick={handleNext}
              disabled={currentIndex === questions.length - 1}
              className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all ${
                currentIndex === questions.length - 1
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-gray-600 text-white hover:bg-gray-700 shadow-lg hover:shadow-xl'
              }`}
            >
              次の問題 →
            </button>
          </div>
          
          {/* 全ての問題を解答済みの場合、結果確認ボタンを表示 */}
          {submittedQuestions.size === questions.length && (
            <button
              onClick={handleComplete}
              className="w-full py-3 px-6 rounded-lg font-bold bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
            >
              全ての結果を見る
            </button>
          )}
        </div>
      </div>
      
      {/* Phase 4B: Vocabulary Popup */}
      {selectedVocabNote && (
        <VocabularyPopup
          note={selectedVocabNote}
          onAddToNotebook={handleAddToNotebook}
          onClose={() => setSelectedVocabNote(null)}
        />
      )}
    </div>
  );
}
