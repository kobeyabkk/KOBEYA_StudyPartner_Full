/**
 * ============================================================================
 * Vocabulary Difficulty Score Calculator
 * ============================================================================
 * Purpose: Calculate final_difficulty_score (0-100) for vocabulary words
 * Formula: Based on NGSL/NAWL + Zipf + CEFR-J coefficients (license-safe)
 * ============================================================================
 */

export interface VocabularyWord {
  word: string;
  pos?: string;
  cefr_level: string;
  cefr_numeric: number;
  zipf_score?: number | null;
  source_ngsl: boolean;
  source_nawl: boolean;
}

export interface DifficultyComponents {
  cefr_weight: number;           // 0-35 points
  zipf_penalty: number;          // 0-30 points
  ngsl_weight: number;           // 0-20 points
  japanese_learnability: number; // 0-10 points
  length_bonus: number;          // 0-5 points
  final_score: number;           // 0-100 total
  should_annotate: boolean;      // true if score >= 60
}

/**
 * CEFR-J Difficulty Coefficients (Research-derived, no data storage)
 * These are publicly available research findings from CEFR-J studies
 * We use only the difficulty trend, not the actual CEFR-J word list
 */
const CEFR_J_COEFFICIENTS: Record<string, number> = {
  'A1': 0,
  'A2': 1,
  'B1': 3,
  'B2': 6,
  'C1': 8,
  'C2': 10,
};

/**
 * Calculate CEFR weight component (0-35 points)
 * Higher CEFR level = higher difficulty
 */
function calculateCefrWeight(cefr_numeric: number): number {
  return (cefr_numeric / 6) * 35;
}

/**
 * Calculate Zipf frequency penalty (0-30 points)
 * Lower Zipf score = less common = higher difficulty
 * 
 * Zipf scale:
 *   7.0 = very common (the, be, and)
 *   5.0 = common threshold
 *   3.0 = uncommon
 *   1.0 = very rare
 */
function calculateZipfPenalty(zipf_score: number | null | undefined): number {
  if (zipf_score === null || zipf_score === undefined) {
    // No Zipf data = assume moderately uncommon
    return 15; // Middle value
  }
  
  // Penalty increases as frequency decreases
  const raw_penalty = Math.max(0, (5.0 - zipf_score) * 2.0);
  
  // Normalize to 0-30 range
  return (raw_penalty / 10) * 30;
}

/**
 * Calculate NGSL/NAWL weight (0-20 points)
 * NGSL = most common words (0 points)
 * NAWL = academic words (10 points)
 * Neither = rare/specialized (20 points)
 */
function calculateNgslWeight(source_ngsl: boolean, source_nawl: boolean): number {
  let raw_weight = 0;
  
  if (source_ngsl) {
    raw_weight = 0; // Most common words
  } else if (source_nawl) {
    raw_weight = 2; // Academic words
  } else {
    raw_weight = 4; // Rare or specialized
  }
  
  // Normalize to 0-20 range
  return (raw_weight / 4) * 20;
}

/**
 * Calculate Japanese learner difficulty (0-10 points)
 * Based on CEFR-J research trends (coefficients only, no data)
 * 
 * Note: This uses publicly available research findings about
 * difficulty trends for Japanese learners at each CEFR level.
 * We do NOT store or use CEFR-J word list data.
 */
function calculateJapaneseLearnability(cefr_level: string): number {
  return CEFR_J_COEFFICIENTS[cefr_level] || 0;
}

/**
 * Calculate word length bonus (0-5 points)
 * Longer words are generally more difficult
 */
function calculateLengthBonus(word: string): number {
  return word.length >= 10 ? 5 : 0;
}

/**
 * Main function: Calculate complete difficulty score
 * 
 * Returns all components plus final score (0-100)
 * and annotation recommendation (score >= 60)
 */
export function calculateDifficultyScore(vocab: VocabularyWord): DifficultyComponents {
  // Calculate each component
  const cefr_weight = calculateCefrWeight(vocab.cefr_numeric);
  const zipf_penalty = calculateZipfPenalty(vocab.zipf_score);
  const ngsl_weight = calculateNgslWeight(vocab.source_ngsl, vocab.source_nawl);
  const japanese_learnability = calculateJapaneseLearnability(vocab.cefr_level);
  const length_bonus = calculateLengthBonus(vocab.word);
  
  // Sum all components
  const final_score = Math.round(
    cefr_weight +
    zipf_penalty +
    ngsl_weight +
    japanese_learnability +
    length_bonus
  );
  
  // Ensure score is within 0-100 range
  const clamped_score = Math.max(0, Math.min(100, final_score));
  
  return {
    cefr_weight: Math.round(cefr_weight * 10) / 10,
    zipf_penalty: Math.round(zipf_penalty * 10) / 10,
    ngsl_weight: Math.round(ngsl_weight * 10) / 10,
    japanese_learnability,
    length_bonus,
    final_score: clamped_score,
    should_annotate: clamped_score >= 60,
  };
}

/**
 * Batch calculate difficulty scores for multiple words
 */
export function calculateBatchDifficultyScores(
  words: VocabularyWord[]
): Map<string, DifficultyComponents> {
  const results = new Map<string, DifficultyComponents>();
  
  for (const word of words) {
    const key = word.pos ? `${word.word}:${word.pos}` : word.word;
    results.set(key, calculateDifficultyScore(word));
  }
  
  return results;
}

/**
 * Example usage and test cases
 */
export const EXAMPLE_CALCULATIONS = {
  // Easy word (A1, very common)
  the: {
    word: 'the',
    cefr_level: 'A1',
    cefr_numeric: 1,
    zipf_score: 7.9,
    source_ngsl: true,
    source_nawl: false,
    expected_score: 6, // Very low score = easy
  },
  
  // Moderate word (B1, NAWL)
  essential: {
    word: 'essential',
    cefr_level: 'B1',
    cefr_numeric: 3,
    zipf_score: 4.8,
    source_ngsl: false,
    source_nawl: true,
    expected_score: 32, // Below annotation threshold
  },
  
  // Difficult word (B2, not in NGSL/NAWL)
  accompany: {
    word: 'accompany',
    cefr_level: 'B2',
    cefr_numeric: 4,
    zipf_score: 3.2,
    source_ngsl: false,
    source_nawl: false,
    expected_score: 60, // At annotation threshold!
  },
  
  // Very difficult word (C1, rare, long)
  comprehend: {
    word: 'comprehend',
    cefr_level: 'C1',
    cefr_numeric: 5,
    zipf_score: 2.8,
    source_ngsl: false,
    source_nawl: false,
    expected_score: 75, // Definitely needs annotation
  },
};

/**
 * Verify calculation accuracy with test cases
 */
export function verifyCalculations(): boolean {
  let allPassed = true;
  
  for (const [word, example] of Object.entries(EXAMPLE_CALCULATIONS)) {
    const result = calculateDifficultyScore(example as VocabularyWord);
    const diff = Math.abs(result.final_score - example.expected_score);
    
    if (diff > 2) { // Allow ±2 points tolerance
      console.error(`❌ ${word}: Expected ${example.expected_score}, got ${result.final_score}`);
      allPassed = false;
    } else {
      console.log(`✅ ${word}: Score ${result.final_score} (expected ${example.expected_score})`);
    }
  }
  
  return allPassed;
}
