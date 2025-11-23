import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { 
  VocabularyMaster, 
  UserVocabularyProgress,
  SM2Review,
  SM2Quality 
} from '../../eiken/types/vocabulary';

// Quality rating definitions matching SM-2 algorithm
const QUALITY_RATINGS = [
  { 
    value: 0 as SM2Quality, 
    label: '完全に忘れた', 
    labelEn: 'Complete Blackout',
    description: '全く思い出せなかった',
    color: 'bg-red-500 hover:bg-red-600',
    icon: '😰'
  },
  { 
    value: 1 as SM2Quality, 
    label: '間違えた', 
    labelEn: 'Incorrect',
    description: '間違った答えだった',
    color: 'bg-orange-500 hover:bg-orange-600',
    icon: '😕'
  },
  { 
    value: 2 as SM2Quality, 
    label: '難しかった', 
    labelEn: 'Difficult',
    description: '正解だが、とても難しかった',
    color: 'bg-yellow-500 hover:bg-yellow-600',
    icon: '😐'
  },
  { 
    value: 3 as SM2Quality, 
    label: '少し迷った', 
    labelEn: 'Hesitant',
    description: '正解だが、少し迷った',
    color: 'bg-lime-500 hover:bg-lime-600',
    icon: '🙂'
  },
  { 
    value: 4 as SM2Quality, 
    label: 'すぐ思い出せた', 
    labelEn: 'Easy',
    description: '正解、すぐに思い出せた',
    color: 'bg-green-500 hover:bg-green-600',
    icon: '😊'
  },
  { 
    value: 5 as SM2Quality, 
    label: '即答', 
    labelEn: 'Perfect',
    description: '完璧、即答できた',
    color: 'bg-emerald-500 hover:bg-emerald-600',
    icon: '🤩'
  }
];

export interface ReviewItem {
  word: VocabularyMaster;
  progress: UserVocabularyProgress;
}

export interface VocabularyReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: ReviewItem[];
  userId: string;
  onReviewComplete: () => void;
}

export const VocabularyReviewModal: React.FC<VocabularyReviewModalProps> = ({
  isOpen,
  onClose,
  items,
  userId,
  onReviewComplete
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [reviewResults, setReviewResults] = useState<{
    wordId: number;
    quality: SM2Quality;
    responseTime: number;
  }[]>([]);

  const currentItem = items[currentIndex];
  const progress = Math.round(((currentIndex + (isFlipped ? 0.5 : 0)) / items.length) * 100);

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentIndex(0);
      setIsFlipped(false);
      setStartTime(Date.now());
      setReviewResults([]);
      setShowSuccess(false);
    }
  }, [isOpen]);

  // Reset timer when moving to next card
  useEffect(() => {
    setStartTime(Date.now());
  }, [currentIndex]);

  const handleFlip = useCallback(() => {
    setIsFlipped(true);
  }, []);

  const handleQualityRating = async (quality: SM2Quality) => {
    if (!currentItem || isSubmitting) return;

    const responseTime = Math.round((Date.now() - startTime) / 1000); // seconds

    setIsSubmitting(true);

    try {
      // Submit review to API
      const review: SM2Review = {
        quality,
        reviewDate: new Date(),
        responseTime
      };

      const response = await fetch('/api/vocabulary/review/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          wordId: currentItem.word.id,
          review
        })
      });

      if (!response.ok) {
        throw new Error('Failed to submit review');
      }

      // Store result
      setReviewResults(prev => [...prev, {
        wordId: currentItem.word.id,
        quality,
        responseTime
      }]);

      // Move to next card or finish
      if (currentIndex < items.length - 1) {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
      } else {
        // All reviews complete
        setShowSuccess(true);
        setTimeout(() => {
          onReviewComplete();
          onClose();
        }, 2000);
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      alert('レビューの送信に失敗しました。もう一度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = () => {
    if (currentIndex < items.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setIsFlipped(false);
    } else {
      onClose();
    }
  };

  const handleClose = () => {
    if (reviewResults.length > 0) {
      const confirmClose = window.confirm(
        `${reviewResults.length}件のレビューを完了しました。終了してもよろしいですか？`
      );
      if (confirmClose) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  if (!isOpen || !currentItem) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 z-10">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl font-bold text-gray-900">
                  単語復習
                </h2>
                <button
                  onClick={handleClose}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Progress bar */}
              <div className="space-y-2">
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{currentIndex + 1} / {items.length}</span>
                  <span>{progress}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <motion.div
                    className="bg-blue-500 h-2 rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            </div>

            {/* Success message */}
            <AnimatePresence>
              {showSuccess && (
                <motion.div
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-95 z-20"
                >
                  <div className="text-center">
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ type: 'spring', duration: 0.5 }}
                      className="text-6xl mb-4"
                    >
                      🎉
                    </motion.div>
                    <h3 className="text-2xl font-bold text-gray-900 mb-2">
                      お疲れ様でした！
                    </h3>
                    <p className="text-gray-600">
                      {items.length}件の単語を復習しました
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Card content */}
            <div className="p-6 md:p-8">
              {/* Front side - Word */}
              {!isFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  <div className="text-center py-12">
                    <div className="inline-flex items-center gap-2 mb-4">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${
                        currentItem.word.finalDifficultyScore >= 70 ? 'bg-red-100 text-red-700' :
                        currentItem.word.finalDifficultyScore >= 40 ? 'bg-yellow-100 text-yellow-700' :
                        'bg-green-100 text-green-700'
                      }`}>
                        {currentItem.word.pos}
                      </span>
                      {currentItem.word.isFalseCognate && (
                        <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 text-orange-700">
                          ⚠️ 偽友語
                        </span>
                      )}
                    </div>
                    <h3 className="text-5xl md:text-6xl font-bold text-gray-900 mb-6">
                      {currentItem.word.word}
                    </h3>
                    {currentItem.word.phonetic && (
                      <p className="text-lg text-gray-500 mb-2">
                        {currentItem.word.phonetic}
                      </p>
                    )}
                    <p className="text-sm text-gray-400">
                      この単語の意味を思い出してください
                    </p>
                  </div>

                  <div className="flex justify-center">
                    <button
                      onClick={handleFlip}
                      className="px-8 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors shadow-lg hover:shadow-xl"
                    >
                      答えを見る
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Back side - Definition and rating */}
              {isFlipped && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-6"
                >
                  {/* Word (small) */}
                  <div className="text-center">
                    <h3 className="text-3xl font-bold text-gray-900 mb-2">
                      {currentItem.word.word}
                    </h3>
                    {currentItem.word.phonetic && (
                      <p className="text-sm text-gray-500">
                        {currentItem.word.phonetic}
                      </p>
                    )}
                  </div>

                  {/* Definition */}
                  <div className="bg-gray-50 rounded-lg p-6 space-y-3">
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">意味</span>
                      <p className="text-lg text-gray-900 mt-1">
                        {currentItem.word.definitionJa}
                      </p>
                    </div>
                    <div>
                      <span className="text-xs font-medium text-gray-500 uppercase">English</span>
                      <p className="text-base text-gray-700 mt-1">
                        {currentItem.word.definitionEn}
                      </p>
                    </div>
                  </div>

                  {/* Example sentences */}
                  {currentItem.word.exampleSentences && currentItem.word.exampleSentences.length > 0 && (
                    <div className="bg-blue-50 rounded-lg p-4">
                      <span className="text-xs font-medium text-blue-700 uppercase">例文</span>
                      <ul className="mt-2 space-y-2">
                        {currentItem.word.exampleSentences.slice(0, 2).map((sentence, idx) => (
                          <li key={idx} className="text-sm text-gray-700">
                            • {sentence.en}
                            <br />
                            <span className="text-gray-500">{sentence.ja}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* False cognate warning */}
                  {currentItem.word.isFalseCognate && currentItem.word.falseCognateNote && (
                    <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                      <div className="flex items-start gap-2">
                        <span className="text-orange-500 text-lg">⚠️</span>
                        <div>
                          <p className="text-sm font-medium text-orange-800">偽友語に注意</p>
                          <p className="text-sm text-orange-700 mt-1">
                            {currentItem.word.falseCognateNote}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quality rating buttons */}
                  <div className="space-y-3">
                    <p className="text-center text-sm font-medium text-gray-700">
                      どのくらい思い出せましたか？
                    </p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                      {QUALITY_RATINGS.map((rating) => (
                        <button
                          key={rating.value}
                          onClick={() => handleQualityRating(rating.value)}
                          disabled={isSubmitting}
                          className={`${rating.color} text-white rounded-lg p-3 transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed shadow-md hover:shadow-lg`}
                          title={rating.description}
                        >
                          <div className="text-2xl mb-1">{rating.icon}</div>
                          <div className="text-xs font-medium">{rating.label}</div>
                        </button>
                      ))}
                    </div>
                    <p className="text-center text-xs text-gray-500">
                      評価は次回の復習タイミングに影響します
                    </p>
                  </div>

                  {/* Skip button */}
                  <div className="text-center">
                    <button
                      onClick={handleSkip}
                      disabled={isSubmitting}
                      className="text-sm text-gray-500 hover:text-gray-700 underline disabled:opacity-50"
                    >
                      スキップ
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Footer info */}
            <div className="border-t border-gray-200 p-4 bg-gray-50">
              <div className="flex items-center justify-between text-xs text-gray-500">
                <div className="flex items-center gap-4">
                  <span>復習回数: {currentItem.progress.repetitions}</span>
                  <span>習熟度: {currentItem.progress.masteryLevel}/10</span>
                </div>
                <div>
                  <span>難易度: {Math.round(currentItem.word.finalDifficultyScore)}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default VocabularyReviewModal;
