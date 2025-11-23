/**
 * Phase 4B: Vocabulary Annotation Popup
 * 
 * Displays vocabulary details with "Add to Notebook" button
 */

import { useState } from 'react';

interface VocabularyNote {
  word: string;
  pos: string;
  definition_ja: string;
  cefr_level?: string;
  difficulty_score: number;
  word_id?: number;
}

interface VocabularyPopupProps {
  note: VocabularyNote;
  onAddToNotebook?: (wordId: number) => Promise<void>;
  onClose: () => void;
}

export default function VocabularyPopup({ note, onAddToNotebook, onClose }: VocabularyPopupProps) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const handleAddToNotebook = async () => {
    if (!note.word_id || !onAddToNotebook) return;
    
    try {
      setAdding(true);
      await onAddToNotebook(note.word_id);
      setAdded(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('Failed to add to notebook:', error);
      alert('語彙ノートへの追加に失敗しました');
    } finally {
      setAdding(false);
    }
  };

  const getDifficultyColor = (score: number): string => {
    if (score >= 75) return 'text-red-600';
    if (score >= 60) return 'text-orange-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getDifficultyLabel = (score: number): string => {
    if (score >= 75) return '難';
    if (score >= 60) return 'やや難';
    if (score >= 40) return '中';
    return '易';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50" onClick={onClose}>
      <div 
        className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 relative animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* Word */}
        <div className="mb-4">
          <h2 className="text-3xl font-bold text-gray-900 mb-2">{note.word}</h2>
          <div className="flex items-center gap-2">
            <span className="px-2 py-1 bg-blue-100 text-blue-700 text-sm font-medium rounded">
              {note.pos}
            </span>
            {note.cefr_level && (
              <span className="px-2 py-1 bg-purple-100 text-purple-700 text-sm font-medium rounded">
                {note.cefr_level}
              </span>
            )}
            <span className={`px-2 py-1 bg-gray-100 text-sm font-medium rounded ${getDifficultyColor(note.difficulty_score)}`}>
              {getDifficultyLabel(note.difficulty_score)}
            </span>
          </div>
        </div>

        {/* Definition */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-600 mb-1">意味</h3>
          <p className="text-lg text-gray-900">{note.definition_ja}</p>
        </div>

        {/* Add to Notebook button */}
        {note.word_id && (
          <button
            onClick={handleAddToNotebook}
            disabled={adding || added}
            className={`w-full py-3 rounded-lg font-medium transition-all ${
              added
                ? 'bg-green-500 text-white'
                : adding
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-blue-500 text-white hover:bg-blue-600 active:scale-95'
            }`}
          >
            {added ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                語彙ノートに追加しました
              </span>
            ) : adding ? (
              '追加中...'
            ) : (
              <span className="flex items-center justify-center gap-2">
                <span className="text-xl">📚</span>
                語彙ノートに追加
              </span>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
