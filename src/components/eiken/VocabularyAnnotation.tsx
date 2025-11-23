/**
 * Phase 4A: Vocabulary Annotation Component
 * 
 * Interactive vocabulary annotation with hover/tap display
 * Based on expert consensus: minimize cognitive load, progressive disclosure
 */

import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { VocabularyMaster } from '../../eiken/types/vocabulary';
import { VocabularyDifficultyScorer } from '../../eiken/services/vocabulary-difficulty';

interface VocabularyAnnotationProps {
  word: VocabularyMaster;
  displayMode?: 'hover' | 'tap';
  showKatakana?: boolean;
  onAddToNotebook?: (wordId: number) => void;
  onPlayAudio?: (audioUrl: string) => void;
}

export const VocabularyAnnotation: React.FC<VocabularyAnnotationProps> = ({
  word,
  displayMode = 'hover',
  showKatakana = false,
  onAddToNotebook,
  onPlayAudio
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const wordRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  
  // Get difficulty styling
  const difficultyColor = VocabularyDifficultyScorer.getDifficultyColor(word.finalDifficultyScore);
  const difficultyBgColor = VocabularyDifficultyScorer.getDifficultyBgColor(word.finalDifficultyScore);
  const difficultyLabel = VocabularyDifficultyScorer.getDifficultyLabel(word.finalDifficultyScore);
  
  // Calculate tooltip position
  useEffect(() => {
    if (isOpen && wordRef.current && tooltipRef.current) {
      const wordRect = wordRef.current.getBoundingClientRect();
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      let x = wordRect.left;
      let y = wordRect.bottom + 8;
      
      // Adjust if overflowing right edge
      if (x + tooltipRect.width > viewportWidth - 16) {
        x = Math.max(16, viewportWidth - tooltipRect.width - 16);
      }
      
      // Adjust if overflowing bottom edge
      if (y + tooltipRect.height > viewportHeight - 16) {
        y = wordRect.top - tooltipRect.height - 8;
      }
      
      // Ensure not above viewport
      if (y < 16) {
        y = 16;
      }
      
      setPosition({ x, y });
    }
  }, [isOpen]);
  
  // Handle interactions
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (displayMode === 'tap') {
      setIsOpen(!isOpen);
    }
  };
  
  const handleMouseEnter = () => {
    if (displayMode === 'hover') {
      setIsOpen(true);
    }
  };
  
  const handleMouseLeave = () => {
    if (displayMode === 'hover') {
      setIsOpen(false);
    }
  };
  
  const handleAddToNotebook = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToNotebook?.(word.id);
  };
  
  const handlePlayAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (word.audioUrl) {
      onPlayAudio?.(word.audioUrl);
    }
  };
  
  return (
    <>
      {/* Annotated Word */}
      <span
        ref={wordRef}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className={`
          inline-block
          cursor-pointer
          underline decoration-dotted decoration-2
          ${difficultyColor}
          hover:bg-yellow-50
          transition-all duration-200
          relative
          px-0.5
          rounded
        `}
        style={{ textUnderlineOffset: '3px' }}
      >
        {word.word}
        <sup className="text-xs ml-0.5 opacity-70">📝</sup>
      </span>
      
      {/* Tooltip Popup */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop for mobile tap mode */}
            {displayMode === 'tap' && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setIsOpen(false)}
                className="fixed inset-0 bg-black/20 z-40 md:hidden"
              />
            )}
            
            {/* Tooltip Content */}
            <motion.div
              ref={tooltipRef}
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              style={{
                position: 'fixed',
                left: position.x,
                top: position.y,
                zIndex: 50
              }}
              className="bg-white rounded-xl shadow-2xl border border-gray-200 overflow-hidden max-w-sm w-[calc(100vw-2rem)] md:w-96"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="px-4 pt-4 pb-3 bg-gradient-to-br from-blue-50 to-white border-b border-gray-100">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    {/* Word */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-2xl font-bold text-gray-900 break-words">
                        {word.word}
                      </span>
                      
                      {/* Part of Speech */}
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 shrink-0">
                        {word.pos}
                      </span>
                      
                      {/* Difficulty Badge */}
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${difficultyBgColor} ${difficultyColor} shrink-0`}>
                        {word.cefrLevel || 'B1'} {difficultyLabel}
                      </span>
                    </div>
                    
                    {/* Pronunciation */}
                    <div className="flex items-center gap-2 text-sm text-gray-600 flex-wrap">
                      {word.ipaPronunciation && (
                        <span className="font-mono text-xs">
                          /{word.ipaPronunciation}/
                        </span>
                      )}
                      {word.audioUrl && (
                        <button
                          onClick={handlePlayAudio}
                          className="inline-flex items-center justify-center w-6 h-6 rounded-full hover:bg-gray-100 transition-colors"
                          title="発音を聞く"
                        >
                          <span className="text-sm">🔊</span>
                        </button>
                      )}
                    </div>
                    
                    {/* Katakana Pronunciation (optional) */}
                    {showKatakana && word.katakanaPronunciation && (
                      <div className="text-xs text-gray-500 mt-1">
                        参考: {word.katakanaPronunciation}
                      </div>
                    )}
                  </div>
                  
                  {/* Close Button (tap mode only) */}
                  {displayMode === 'tap' && (
                    <button
                      onClick={() => setIsOpen(false)}
                      className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      aria-label="閉じる"
                    >
                      <svg className="w-5 h-5" fill="none" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" stroke="currentColor">
                        <path d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
              
              {/* Body */}
              <div className="px-4 py-3">
                {/* Japanese Definition */}
                <div className="mb-3">
                  <div className="text-lg font-medium text-gray-900">
                    {word.definitionJa}
                  </div>
                </div>
                
                {/* English Definition */}
                {word.definitionEn && (
                  <div className="mb-3 text-sm text-gray-600">
                    {word.definitionEn}
                  </div>
                )}
                
                {/* Example Sentence */}
                {word.exampleSentences && word.exampleSentences.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">例文:</div>
                    <div className="p-2 bg-gray-50 rounded-lg text-sm space-y-1">
                      <div className="text-gray-700">{word.exampleSentences[0].en}</div>
                      <div className="text-gray-600">{word.exampleSentences[0].ja}</div>
                    </div>
                  </div>
                )}
                
                {/* False Cognate Warning */}
                {word.isFalseCognate && word.falseCognateNote && (
                  <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-amber-600 text-lg shrink-0">⚠️</span>
                      <div className="text-sm text-amber-900">
                        <div className="font-medium mb-1">注意（和製英語）</div>
                        <div>{word.falseCognateNote}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* L1 Interference Note */}
                {word.l1InterferenceRisk && word.l1InterferenceNote && (
                  <div className="mb-3 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex items-start gap-2">
                      <span className="text-blue-600 text-lg shrink-0">💡</span>
                      <div className="text-sm text-blue-900">
                        <div className="font-medium mb-1">ヒント</div>
                        <div>{word.l1InterferenceNote}</div>
                      </div>
                    </div>
                  </div>
                )}
                
                {/* Collocations */}
                {word.collocations && word.collocations.length > 0 && (
                  <div className="mb-3">
                    <div className="text-xs font-medium text-gray-500 mb-1">よく使われる組み合わせ:</div>
                    <div className="flex flex-wrap gap-1">
                      {word.collocations.map((collocation, idx) => (
                        <span key={idx} className="px-2 py-1 bg-gray-100 rounded text-xs text-gray-700">
                          {collocation}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              {/* Footer Actions */}
              <div className="px-4 py-3 bg-gray-50 border-t border-gray-100">
                <button
                  onClick={handleAddToNotebook}
                  className="w-full px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  <span>📝</span>
                  <span>単語帳に追加</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default VocabularyAnnotation;
