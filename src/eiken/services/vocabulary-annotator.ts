/**
 * Phase 4B: Vocabulary Annotator Service
 * 
 * Automatically generates vocabulary annotations for passages
 * Extracts difficult words and provides definitions
 */

import type { D1Database } from '@cloudflare/workers-types';

export interface VocabularyNote {
  word: string;
  pos: string;
  definition_ja: string;
  cefr_level?: string;
  difficulty_score: number;
  word_id?: number;
}

export interface AnnotationOptions {
  minDifficultyScore?: number;  // Default: 40
  maxAnnotations?: number;       // Default: 10
  excludeKatakana?: boolean;     // Default: true
}

/**
 * Vocabulary Annotator
 * 
 * Analyzes text passages and generates vocabulary annotations
 * for difficult words based on CEFR-J lexicon data
 */
export class VocabularyAnnotator {
  constructor(private db: D1Database) {}

  /**
   * Generate vocabulary annotations for a text passage
   * 
   * @param text - The passage text to annotate
   * @param options - Annotation options (threshold, max count, etc.)
   * @returns Array of vocabulary notes
   */
  async generateAnnotations(
    text: string,
    options: AnnotationOptions = {}
  ): Promise<VocabularyNote[]> {
    const {
      minDifficultyScore = 40,
      maxAnnotations = 10,
      excludeKatakana = true
    } = options;

    // 1. Extract words from text (basic tokenization)
    const words = this.extractWords(text);
    
    // 2. Normalize words (lowercase, lemmatize)
    const normalizedWords = words.map(w => w.toLowerCase());
    
    // 3. Remove duplicates
    const uniqueWords = [...new Set(normalizedWords)];
    
    // 4. Query vocabulary database
    const vocabularyNotes = await this.lookupWords(uniqueWords, {
      minDifficultyScore,
      maxAnnotations,
      excludeKatakana
    });
    
    return vocabularyNotes;
  }

  /**
   * Extract words from text
   * Simple word extraction using regex
   */
  private extractWords(text: string): string[] {
    // Match words (letters, hyphens, apostrophes)
    const wordPattern = /[a-zA-Z]+(?:[-'][a-zA-Z]+)*/g;
    return text.match(wordPattern) || [];
  }

  /**
   * Lookup words in vocabulary database
   */
  private async lookupWords(
    words: string[],
    options: Required<AnnotationOptions>
  ): Promise<VocabularyNote[]> {
    if (words.length === 0) {
      return [];
    }

    try {
      // Query in batches (max 100 words at a time)
      const MAX_BATCH_SIZE = 100;
      const allResults: VocabularyNote[] = [];
      
      for (let i = 0; i < words.length; i += MAX_BATCH_SIZE) {
        const batch = words.slice(i, i + MAX_BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        
        // Query eiken_vocabulary_lexicon for word data
        const query = `
          SELECT 
            vm.word,
            vm.pos,
            vm.definition_ja,
            vm.cefr_level,
            vm.final_difficulty_score as difficulty_score,
            vm.id as word_id
          FROM eiken_vocabulary_lexicon vm
          WHERE LOWER(vm.word) IN (${placeholders})
            AND vm.final_difficulty_score >= ?
            AND vm.should_annotate = 1
          ORDER BY vm.final_difficulty_score DESC
          LIMIT ?
        `;
        
        const result = await this.db.prepare(query)
          .bind(...batch, options.minDifficultyScore, options.maxAnnotations)
          .all<VocabularyNote>();
        
        if (result.results) {
          allResults.push(...result.results);
        }
      }
      
      // Filter out katakana words if requested
      let filteredResults = allResults;
      if (options.excludeKatakana) {
        filteredResults = allResults.filter(note => !this.isKatakanaWord(note.word));
      }
      
      // Limit to max annotations
      return filteredResults.slice(0, options.maxAnnotations);
      
    } catch (error) {
      console.error('[VocabularyAnnotator] Database query error:', error);
      return [];
    }
  }

  /**
   * Check if word is katakana-based
   * Simple heuristic: contains katakana characters
   */
  private isKatakanaWord(word: string): boolean {
    // Match katakana characters
    const katakanaPattern = /[\u30A0-\u30FF]/;
    return katakanaPattern.test(word);
  }
}
