/**
 * Phase 4A: Vocabulary Notes System - Type Definitions
 * 
 * Comprehensive type definitions for the vocabulary learning system
 * Based on expert consensus and educational research
 */

// ============================================================================
// Enums
// ============================================================================

export enum CEFRLevel {
  A1 = 'A1',
  A2 = 'A2',
  B1 = 'B1',
  B2 = 'B2',
  C1 = 'C1',
  C2 = 'C2'
}

export enum EikenGrade {
  GRADE_5 = 'grade-5',
  GRADE_4 = 'grade-4',
  GRADE_3 = 'grade-3',
  GRADE_PRE2 = 'grade-pre2',
  GRADE_2 = 'grade-2',
  GRADE_PRE1 = 'grade-pre1',
  GRADE_1 = 'grade-1'
}

export enum PartOfSpeech {
  NOUN = 'noun',
  VERB = 'verb',
  ADJECTIVE = 'adjective',
  ADVERB = 'adverb',
  PRONOUN = 'pronoun',
  PREPOSITION = 'preposition',
  CONJUNCTION = 'conjunction',
  INTERJECTION = 'interjection',
  PHRASE = 'phrase'
}

export enum ContextDependency {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high'
}

export enum ReviewType {
  NEW = 'new',
  DUE = 'due',
  EARLY = 'early'
}

export enum ReviewStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  SKIPPED = 'skipped'
}

export enum LearningStatus {
  LEARNING = 'learning',
  MASTERED = 'mastered',
  ARCHIVED = 'archived'
}

// ============================================================================
// Core Vocabulary Types
// ============================================================================

/**
 * Master vocabulary entry with comprehensive difficulty scoring
 */
export interface VocabularyMaster {
  id: number;
  word: string;
  
  // Basic Information
  pos: PartOfSpeech;
  definitionEn: string;
  definitionJa: string;
  
  // Difficulty Scoring Components
  cefrLevel?: CEFRLevel;
  cefrScore?: number; // 1-6
  frequencyRank?: number;
  zipfScore?: number; // 1.0-7.0
  eikenFrequency?: number;
  eikenGrade?: EikenGrade;
  eikenImportance?: number;
  japaneseLearnerDifficulty: number; // 0-100
  polysemyCount: number;
  contextDependency: ContextDependency;
  
  // Final Computed Score
  finalDifficultyScore: number; // 0-100
  shouldAnnotate: boolean;
  
  // Japanese Learner Specific
  isKatakanaWord: boolean;
  isFalseCognate: boolean;
  falseCognateNote?: string;
  l1InterferenceRisk: boolean;
  l1InterferenceNote?: string;
  
  // Pronunciation
  ipaPronunciation?: string;
  katakanaPronunciation?: string;
  audioUrl?: string;
  
  // Examples & Context
  exampleSentences?: ExampleSentence[];
  collocations?: string[];
  etymology?: string;
  relatedWords?: string[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Example sentence with English and Japanese
 */
export interface ExampleSentence {
  en: string;
  ja: string;
}

/**
 * User's learning progress for a specific vocabulary word
 * Implements SM-2 spaced repetition parameters
 */
export interface UserVocabularyProgress {
  id: number;
  userId: string;
  wordId: number;
  
  // SM-2 Parameters
  easinessFactor: number; // 1.3-2.5
  intervalDays: number;
  repetitions: number;
  nextReviewDate: Date;
  
  // Mastery Levels (0-10)
  masteryLevel: number;
  recognitionScore: number; // 0-100
  recallScore: number; // 0-100
  productionScore: number; // 0-100
  
  // Learning History
  firstEncounteredAt: Date;
  lastReviewedAt?: Date;
  totalReviews: number;
  correctReviews: number;
  
  // Performance Metrics
  avgResponseTimeMs?: number;
  fastestResponseTimeMs?: number;
  slowestResponseTimeMs?: number;
  
  // Retention Tracking
  retention7days?: number; // 0-1
  retention30days?: number; // 0-1
  retention60days?: number; // 0-1
  
  // Context
  sourceContext?: LearningSourceContext;
  sourceType?: string;
  
  // User Personalization
  userNote?: string;
  mnemonic?: string;
  
  // Status
  status: LearningStatus;
  archivedAt?: Date;
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Context where user first encountered the word (episodic memory)
 */
export interface LearningSourceContext {
  passageId?: string;
  sentence?: string;
  questionId?: string;
  questionType?: string;
}

/**
 * Review schedule entry
 */
export interface ReviewSchedule {
  id: number;
  userId: string;
  wordId: number;
  scheduledDate: Date;
  
  reviewType: ReviewType;
  priority: number; // 0-10
  
  status: ReviewStatus;
  completedAt?: Date;
  
  // Results (after completion)
  responseQuality?: number; // 0-5
  responseTimeMs?: number;
  wasCorrect?: boolean;
  
  createdAt: Date;
}

/**
 * Pre-computed vocabulary annotation for a passage
 */
export interface VocabularyAnnotation {
  id: number;
  passageId: string;
  wordId: number;
  
  wordInContext: string;
  sentence: string;
  sentenceIndex?: number;
  wordIndex?: number;
  
  contextualMeaning?: string;
  shouldAnnotate: boolean;
  annotationReason?: string;
  
  displayData?: AnnotationDisplayData;
  
  createdAt: Date;
}

/**
 * Pre-rendered annotation display data
 */
export interface AnnotationDisplayData {
  word: string;
  pos: string;
  definitionJa: string;
  cefrLevel?: string;
  difficultyLabel: string;
  difficultyColor: string;
  ipaPronunciation?: string;
  katakanaPronunciation?: string;
  audioUrl?: string;
  exampleSentence?: string;
}

/**
 * Aggregated learning statistics per user
 */
export interface VocabularyLearningStats {
  id: number;
  userId: string;
  
  // Overall Progress
  totalWordsEncountered: number;
  totalWordsLearning: number;
  totalWordsMastered: number;
  
  // Mastery Distribution
  level0Count: number; // Unknown
  level1_3Count: number; // Beginner
  level4_6Count: number; // Intermediate
  level7_9Count: number; // Advanced
  level10Count: number; // Native-like
  
  // Review Stats
  totalReviewsCompleted: number;
  avgReviewsPerWord?: number;
  totalStudyTimeMinutes: number;
  
  // Performance
  overallAccuracy: number; // 0-1
  avgResponseTimeMs?: number;
  
  // Streaks
  currentStudyStreakDays: number;
  longestStudyStreakDays: number;
  lastStudyDate?: Date;
  
  // CEFR Progress
  cefrA1Mastered: number;
  cefrA2Mastered: number;
  cefrB1Mastered: number;
  cefrB2Mastered: number;
  cefrC1Mastered: number;
  cefrC2Mastered: number;
  
  // Eiken Progress
  eiken5Mastered: number;
  eiken4Mastered: number;
  eiken3Mastered: number;
  eikenPre2Mastered: number;
  eiken2Mastered: number;
  eikenPre1Mastered: number;
  eiken1Mastered: number;
  
  lastCalculatedAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Algorithm Input/Output Types
// ============================================================================

/**
 * Input for vocabulary difficulty calculation
 */
export interface VocabularyDifficultyInput {
  word: string;
  cefrLevel?: CEFRLevel;
  frequencyRank?: number;
  eikenFrequency?: number;
  eikenGrade?: EikenGrade;
  polysemyCount?: number;
  isKatakanaWord?: boolean;
  isFalseCognate?: boolean;
  l1InterferenceRisk?: boolean;
}

/**
 * Output of vocabulary difficulty calculation
 */
export interface VocabularyDifficultyScore {
  word: string;
  cefrScore: number; // 0-100
  frequencyScore: number; // 0-100
  eikenScore: number; // 0-100
  japaneseLearnerScore: number; // 0-100
  polysemyScore: number; // 0-100
  finalScore: number; // 0-100 (weighted average)
  shouldAnnotate: boolean;
}

/**
 * SM-2 review input
 */
export interface SM2Review {
  quality: number; // 0-5 (0=forgot, 5=perfect)
  responseTimeMs?: number;
}

/**
 * SM-2 card state
 */
export interface SM2Card {
  easinessFactor: number; // 1.3-2.5
  intervalDays: number;
  repetitions: number;
  nextReviewDate: Date;
}

// ============================================================================
// UI Component Props Types
// ============================================================================

/**
 * Props for VocabularyAnnotation component
 */
export interface VocabularyAnnotationProps {
  word: VocabularyMaster;
  displayMode: 'hover' | 'tap';
  showKatakana?: boolean;
  onAddToNotebook?: (wordId: number) => void;
  onPlayAudio?: (audioUrl: string) => void;
}

/**
 * Props for vocabulary review interface
 */
export interface VocabularyReviewProps {
  words: UserVocabularyProgress[];
  onReviewComplete: (wordId: number, review: SM2Review) => void;
  showProgress?: boolean;
}

/**
 * Today's review summary
 */
export interface TodayReviewSummary {
  userId: string;
  date: Date;
  totalDue: number;
  totalNew: number;
  totalCompleted: number;
  avgAccuracy: number;
  avgResponseTimeMs: number;
  studyTimeMinutes: number;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request to add word to user's notebook
 */
export interface AddVocabularyRequest {
  userId: string;
  wordId: number;
  sourceContext?: LearningSourceContext;
}

/**
 * Request to submit review result
 */
export interface SubmitReviewRequest {
  userId: string;
  wordId: number;
  quality: number; // 0-5
  responseTimeMs?: number;
}

/**
 * Response for today's review schedule
 */
export interface TodayReviewResponse {
  summary: TodayReviewSummary;
  dueWords: Array<VocabularyMaster & { progress: UserVocabularyProgress }>;
  newWords: VocabularyMaster[];
}

/**
 * Response for vocabulary search
 */
export interface VocabularySearchResponse {
  results: VocabularyMaster[];
  total: number;
  page: number;
  pageSize: number;
}

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Vocabulary system configuration
 */
export interface VocabularyConfig {
  // Difficulty scoring weights (must sum to 1.0)
  weights: {
    cefr: number; // 0.30
    eiken: number; // 0.30
    japaneseLearner: number; // 0.25
    polysemy: number; // 0.15
  };
  
  // SM-2 algorithm parameters
  sm2: {
    defaultEasinessFactor: number; // 2.5
    minEasinessFactor: number; // 1.3
    initialInterval: number; // 1.0 day
  };
  
  // Age-based interval multipliers
  ageMultipliers: {
    elementary: number; // 0.6 (ages ≤12)
    juniorHigh: number; // 0.8 (ages 13-15)
    highSchoolAndUp: number; // 1.0 (ages ≥16)
  };
  
  // Annotation thresholds
  annotation: {
    difficultyThreshold: number; // 40 (annotate if finalScore ≥ 40)
    excludeKatakana: boolean; // true
  };
  
  // Review scheduling
  scheduling: {
    maxNewWordsPerDay: number; // 20
    maxReviewsPerDay: number; // 100
    examModeThresholdDays: number; // 30
    examModeDailyNewLimit: number; // 10
  };
}

/**
 * Default configuration (expert consensus)
 */
export const DEFAULT_VOCABULARY_CONFIG: VocabularyConfig = {
  weights: {
    cefr: 0.30,
    eiken: 0.30,
    japaneseLearner: 0.25,
    polysemy: 0.15
  },
  sm2: {
    defaultEasinessFactor: 2.5,
    minEasinessFactor: 1.3,
    initialInterval: 1.0
  },
  ageMultipliers: {
    elementary: 0.6,
    juniorHigh: 0.8,
    highSchoolAndUp: 1.0
  },
  annotation: {
    difficultyThreshold: 40,
    excludeKatakana: true
  },
  scheduling: {
    maxNewWordsPerDay: 20,
    maxReviewsPerDay: 100,
    examModeThresholdDays: 30,
    examModeDailyNewLimit: 10
  }
};
