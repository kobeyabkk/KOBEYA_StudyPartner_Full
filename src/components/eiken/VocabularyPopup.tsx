/**
 * Phase 4B: Vocabulary Annotation Popup
 * 
 * Displays vocabulary details with "Add to Notebook" button
 * Now with automatic definition generation
 */

import { useState, useEffect } from 'react';

interface VocabularyNote {
  word: string;
  pos: string;
  definition_ja: string;
  definition_en?: string;
  cefr_level?: string;
  difficulty_score: number;
  word_id?: number;
  example_sentence_en?: string;
  example_sentence_ja?: string;
}

interface VocabularyPopupProps {
  note: VocabularyNote;
  onAddToNotebook?: (wordId: number) => Promise<void>;
  onClose: () => void;
}

interface GeneratedDefinition {
  definition_en: string;
  definition_ja: string;
  example_sentence_en?: string;
  example_sentence_ja?: string;
}

export default function VocabularyPopup({ note, onAddToNotebook, onClose }: VocabularyPopupProps) {
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);
  const [loadingDefinition, setLoadingDefinition] = useState(false);
  const [generatedDef, setGeneratedDef] = useState<GeneratedDefinition | null>(null);
  const [definitionError, setDefinitionError] = useState<string | null>(null);

  // Fetch or generate definition when popup opens
  useEffect(() => {
    const fetchDefinition = async () => {
      // Skip if we already have both definitions
      if (note.definition_en && note.definition_ja) {
        setGeneratedDef({
          definition_en: note.definition_en,
          definition_ja: note.definition_ja,
          example_sentence_en: note.example_sentence_en,
          example_sentence_ja: note.example_sentence_ja,
        });
        return;
      }

      setLoadingDefinition(true);
      setDefinitionError(null);

      try {
        const response = await fetch('/api/vocabulary/define', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            word: note.word,
            pos: note.pos,
            cefr_level: note.cefr_level || 'B1',
          }),
        });

        const data = await response.json();

        if (data.success && data.definition) {
          setGeneratedDef({
            definition_en: data.definition.definition_en,
            definition_ja: data.definition.definition_ja,
            example_sentence_en: data.definition.example_sentence_en,
            example_sentence_ja: data.definition.example_sentence_ja,
          });
        } else {
          // Use fallback from error response or default
          setDefinitionError('定義の生成に失敗しました');
          setGeneratedDef({
            definition_en: data.fallback?.definition_en || 'Definition pending...',
            definition_ja: data.fallback?.definition_ja || note.definition_ja || '定義準備中...',
          });
        }
      } catch (error) {
        console.error('Failed to fetch definition:', error);
        setDefinitionError('定義の取得に失敗しました');
        setGeneratedDef({
          definition_en: 'Definition unavailable',
          definition_ja: note.definition_ja || '定義を取得できませんでした',
        });
      } finally {
        setLoadingDefinition(false);
      }
    };

    fetchDefinition();
  }, [note.word, note.pos, note.cefr_level, note.definition_en, note.definition_ja, note.example_sentence_en, note.example_sentence_ja]);

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
        <div className="mb-6 space-y-4">
          {/* Loading State */}
          {loadingDefinition && (
            <div className="flex items-center gap-2 text-blue-600">
              <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
              <span className="text-sm">定義を生成中...</span>
            </div>
          )}

          {/* Error State */}
          {definitionError && (
            <div className="text-sm text-orange-600 bg-orange-50 px-3 py-2 rounded">
              ⚠️ {definitionError}
            </div>
          )}

          {/* Japanese Definition */}
          <div>
            <h3 className="text-sm font-medium text-gray-600 mb-1">日本語の意味</h3>
            <p className="text-lg text-gray-900">
              {generatedDef?.definition_ja || note.definition_ja || '定義準備中...'}
            </p>
          </div>

          {/* English Definition */}
          {generatedDef?.definition_en && (
            <div>
              <h3 className="text-sm font-medium text-gray-600 mb-1">English Definition</h3>
              <p className="text-base text-gray-700 italic">
                {generatedDef.definition_en}
              </p>
            </div>
          )}

          {/* Example Sentences */}
          {(generatedDef?.example_sentence_en || generatedDef?.example_sentence_ja) && (
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-medium text-gray-600 mb-2">例文</h3>
              {generatedDef.example_sentence_en && (
                <p className="text-base text-gray-700 mb-2 italic">
                  "{generatedDef.example_sentence_en}"
                </p>
              )}
              {generatedDef.example_sentence_ja && (
                <p className="text-sm text-gray-600">
                  {generatedDef.example_sentence_ja}
                </p>
              )}
            </div>
          )}
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
