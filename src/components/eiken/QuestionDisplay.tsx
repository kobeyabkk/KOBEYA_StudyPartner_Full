/**
 * 英検問題表示・解答コンポーネント
 */

import { useState } from 'react';
import type { GeneratedQuestion } from '../../hooks/useEikenAPI';

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

export default function QuestionDisplay({ questions, onComplete }: QuestionDisplayProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [results, setResults] = useState<AnswerResult[]>([]);
  const [startTime] = useState(Date.now());

  const currentQuestion = questions[currentIndex];
  const isLastQuestion = currentIndex === questions.length - 1;
  const answered = selectedAnswer !== null;

  const handleAnswerSelect = (index: number) => {
    if (showExplanation) return; // 既に解答済みの場合は変更不可
    setSelectedAnswer(index);
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

    setResults([...results, newResult]);
    setShowExplanation(true);
  };

  const handleNext = () => {
    if (isLastQuestion) {
      // 全問題完了
      if (onComplete) {
        onComplete([...results]);
      }
    } else {
      // 次の問題へ
      setCurrentIndex(currentIndex + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    }
  };

  const getChoiceColor = (index: number) => {
    if (!showExplanation) {
      return selectedAnswer === index 
        ? 'border-blue-500 bg-blue-50' 
        : 'border-gray-300 hover:border-blue-300 hover:bg-gray-50';
    }

    // 解答表示時
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

  const correctCount = results.filter(r => r.correct).length;
  const accuracy = results.length > 0 ? Math.round((correctCount / results.length) * 100) : 0;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* プログレスバー */}
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">
            問題 {currentIndex + 1} / {questions.length}
          </span>
          <span className="text-sm text-gray-600">
            正答率: {accuracy}% ({correctCount}/{results.length})
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-3">
          <div
            className="bg-gradient-to-r from-blue-500 to-purple-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      {/* 問題カード */}
      <div className="bg-white rounded-xl shadow-lg p-8">
        {/* 問題文 */}
        <div className="mb-6">
          <div className="flex items-start gap-3 mb-4">
            <span className="flex-shrink-0 w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center font-bold">
              Q
            </span>
            <h3 className="text-xl font-medium text-gray-900 leading-relaxed">
              {currentQuestion.questionText}
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
              disabled={showExplanation}
              className={`
                w-full p-4 rounded-lg border-2 text-left transition-all
                flex items-center justify-between
                ${getChoiceColor(index)}
                ${showExplanation ? 'cursor-default' : 'cursor-pointer'}
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
                <span className="text-gray-900 font-medium">{choice}</span>
              </div>
              {getChoiceIcon(index)}
            </button>
          ))}
        </div>

        {/* 解説表示 */}
        {showExplanation && (
          <div className={`p-4 rounded-lg border-2 ${
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

        {/* アクションボタン */}
        <div className="flex gap-3 mt-6">
          {!showExplanation ? (
            <button
              onClick={handleSubmit}
              disabled={!answered}
              className={`
                flex-1 py-3 px-6 rounded-lg font-bold transition-all
                ${answered
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-lg hover:shadow-xl'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                }
              `}
            >
              解答する
            </button>
          ) : (
            <button
              onClick={handleNext}
              className="flex-1 py-3 px-6 rounded-lg font-bold bg-gradient-to-r from-green-600 to-blue-600 text-white hover:from-green-700 hover:to-blue-700 shadow-lg hover:shadow-xl transition-all"
            >
              {isLastQuestion ? '結果を見る' : '次の問題へ'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
