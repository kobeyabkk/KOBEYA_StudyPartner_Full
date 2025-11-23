/**
 * Phase 4A: Vocabulary Annotation Utility
 * 
 * Parses text and wraps difficult vocabulary with annotation components
 * - Tokenizes English text into words
 * - Checks each word against vocabulary difficulty
 * - Wraps difficult words with VocabularyAnnotation component
 * - Preserves formatting and non-word characters
 */

import React from 'react';
import VocabularyAnnotation from '../components/eiken/VocabularyAnnotation';

export interface AnnotationConfig {
  enabled: boolean;
  minDifficultyScore: number; // Only annotate words >= this difficulty
  displayMode: 'hover' | 'tap';
  showKatakana: boolean;
  userId?: string; // For adding words to notebook
}

export const DEFAULT_ANNOTATION_CONFIG: AnnotationConfig = {
  enabled: true,
  minDifficultyScore: 40, // Annotate medium+ difficulty words
  displayMode: 'hover',
  showKatakana: false
};

/**
 * Tokenize text into words and non-word segments
 * Preserves punctuation and whitespace
 */
function tokenizeText(text: string): Array<{ type: 'word' | 'other'; value: string }> {
  const tokens: Array<{ type: 'word' | 'other'; value: string }> = [];
  
  // Match words (letters + apostrophes for contractions) or non-words
  const regex = /([a-zA-Z]+(?:'[a-zA-Z]+)?)|([^a-zA-Z]+)/g;
  
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match[1]) {
      // Word token
      tokens.push({ type: 'word', value: match[1] });
    } else if (match[2]) {
      // Non-word token (whitespace, punctuation, etc.)
      tokens.push({ type: 'other', value: match[2] });
    }
  }
  
  return tokens;
}

/**
 * Normalize word for dictionary lookup
 * - Converts to lowercase
 * - Removes possessive 's
 * - Basic stemming (optional)
 */
function normalizeWord(word: string): string {
  let normalized = word.toLowerCase();
  
  // Remove possessive 's
  normalized = normalized.replace(/'s$/, '');
  
  return normalized;
}

/**
 * Check if word should be annotated
 * In production, this would query the vocabulary database
 * For now, returns mock data for common difficult words
 */
async function shouldAnnotate(
  word: string,
  config: AnnotationConfig
): Promise<boolean> {
  // For MVP, use a simple word list
  // TODO: Replace with actual API call to /api/vocabulary/check
  
  const difficultWords = new Set([
    'ambiguous', 'ambitious', 'adequate', 'abundant', 'accessible',
    'comprehensive', 'controversial', 'crucial', 'deliberate', 'diverse',
    'elaborate', 'essential', 'evident', 'explicit', 'fundamental',
    'inevitable', 'inherent', 'legitimate', 'meticulous', 'negligible',
    'obscure', 'persistent', 'prominent', 'redundant', 'substantial',
    'subsequent', 'subtle', 'superficial', 'tangible', 'trivial',
    'unprecedented', 'versatile', 'viable', 'vivid', 'vulnerable'
  ]);
  
  const normalized = normalizeWord(word);
  return difficultWords.has(normalized);
}

/**
 * Annotate a single word with VocabularyAnnotation component
 */
function annotateWord(
  word: string,
  index: number,
  config: AnnotationConfig
): React.ReactElement {
  return (
    <VocabularyAnnotation
      key={`word-${index}`}
      word={normalizeWord(word)}
      displayMode={config.displayMode}
      showKatakana={config.showKatakana}
      onAddToNotebook={config.userId ? async (wordData) => {
        // Add word to user's notebook
        try {
          await fetch('/api/vocabulary/add', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              userId: config.userId,
              wordId: wordData.id, // Assuming wordData includes ID
              sourceContext: {
                source: 'eiken_question',
                sentence: word // TODO: Pass full sentence context
              }
            })
          });
        } catch (error) {
          console.error('Failed to add word to notebook:', error);
        }
      } : undefined}
    >
      {word}
    </VocabularyAnnotation>
  );
}

/**
 * Parse text and wrap difficult vocabulary with annotations
 * Returns array of React elements (text + annotated words)
 */
export async function annotateText(
  text: string,
  config: AnnotationConfig = DEFAULT_ANNOTATION_CONFIG
): Promise<React.ReactNode[]> {
  if (!config.enabled) {
    return [text];
  }
  
  const tokens = tokenizeText(text);
  const elements: React.ReactNode[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'word') {
      // Check if word should be annotated
      const shouldAnnotateWord = await shouldAnnotate(token.value, config);
      
      if (shouldAnnotateWord) {
        // Wrap with annotation component
        elements.push(annotateWord(token.value, i, config));
      } else {
        // Regular text
        elements.push(token.value);
      }
    } else {
      // Non-word token (preserve as-is)
      elements.push(token.value);
    }
  }
  
  return elements;
}

/**
 * Synchronous version for client-side rendering
 * Uses pre-loaded vocabulary data
 */
export function annotateTextSync(
  text: string,
  vocabularySet: Set<string>, // Pre-loaded set of words to annotate
  config: AnnotationConfig = DEFAULT_ANNOTATION_CONFIG
): React.ReactNode[] {
  if (!config.enabled) {
    return [text];
  }
  
  const tokens = tokenizeText(text);
  const elements: React.ReactNode[] = [];
  
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    
    if (token.type === 'word') {
      const normalized = normalizeWord(token.value);
      
      if (vocabularySet.has(normalized)) {
        // Wrap with annotation component
        elements.push(annotateWord(token.value, i, config));
      } else {
        // Regular text
        elements.push(token.value);
      }
    } else {
      // Non-word token (preserve as-is)
      elements.push(token.value);
    }
  }
  
  return elements;
}

/**
 * React hook for annotating text with vocabulary
 * Loads vocabulary data and provides annotated text
 */
export function useTextAnnotation(
  text: string,
  config: AnnotationConfig = DEFAULT_ANNOTATION_CONFIG
) {
  const [annotatedText, setAnnotatedText] = React.useState<React.ReactNode[]>([text]);
  const [loading, setLoading] = React.useState(false);
  
  React.useEffect(() => {
    if (!config.enabled || !text) {
      setAnnotatedText([text]);
      return;
    }
    
    setLoading(true);
    
    // Load vocabulary and annotate text
    annotateText(text, config)
      .then(result => setAnnotatedText(result))
      .catch(error => {
        console.error('Failed to annotate text:', error);
        setAnnotatedText([text]);
      })
      .finally(() => setLoading(false));
  }, [text, config.enabled, config.minDifficultyScore]);
  
  return { annotatedText, loading };
}

/**
 * Export a simple component wrapper for annotated text
 */
export interface AnnotatedTextProps {
  text: string;
  config?: Partial<AnnotationConfig>;
  className?: string;
}

export function AnnotatedText({ text, config, className }: AnnotatedTextProps) {
  const fullConfig = { ...DEFAULT_ANNOTATION_CONFIG, ...config };
  const { annotatedText, loading } = useTextAnnotation(text, fullConfig);
  
  if (loading) {
    return <span className={className}>{text}</span>;
  }
  
  return <span className={className}>{annotatedText}</span>;
}
