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
      // Query in batches (SQLite limit is ~999 variables, but we need buffer for other params)
      // Each word needs 1 bind variable, plus 2 for minDifficultyScore and maxAnnotations
      const MAX_BATCH_SIZE = 50; // Reduced from 100 to avoid "too many SQL variables" error
      const allResults: VocabularyNote[] = [];
      
      for (let i = 0; i < words.length; i += MAX_BATCH_SIZE) {
        const batch = words.slice(i, i + MAX_BATCH_SIZE);
        const placeholders = batch.map(() => '?').join(',');
        
        // Query eiken_vocabulary_lexicon for word data
        // Phase 1: Uses new schema with definition_ja and final_difficulty_score
        const query = `
          SELECT 
            vm.word_lemma as word,
            vm.pos as pos,
            COALESCE(vm.definition_ja, '定義準備中') as definition_ja,
            vm.cefr_level,
            vm.final_difficulty_score as difficulty_score,
            ROWID as word_id
          FROM eiken_vocabulary_lexicon vm
          WHERE LOWER(vm.word_lemma) IN (${placeholders})
            AND vm.cefr_level_numeric >= 40
          ORDER BY vm.final_difficulty_score DESC
          LIMIT ?
        `;
        
        const result = await this.db.prepare(query)
          .bind(...batch, options.maxAnnotations)
          .all<VocabularyNote>();
        
        console.log(`[VocabularyAnnotator] Batch ${i / MAX_BATCH_SIZE + 1}: ${batch.length} words queried, ${result.results?.length || 0} matches found`);
        
        if (result.results) {
          allResults.push(...result.results);
        }
      }
      
      // Filter out katakana words if requested
      let filteredResults = allResults;
      if (options.excludeKatakana) {
        const beforeKatakanaFilter = allResults.length;
        filteredResults = allResults.filter(note => !this.isKatakanaWord(note.word));
        if (beforeKatakanaFilter !== filteredResults.length) {
          console.log(`[VocabularyAnnotator] Filtered out ${beforeKatakanaFilter - filteredResults.length} katakana words`);
        }
      }
      
      console.log(`[VocabularyAnnotator] Final result: ${filteredResults.length} annotations (from ${words.length} words, threshold: ${options.minDifficultyScore})`);
      if (filteredResults.length > 0) {
        console.log(`[VocabularyAnnotator] Sample annotations:`, filteredResults.slice(0, 3).map(n => `${n.word} (score: ${n.difficulty_score})`));
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
