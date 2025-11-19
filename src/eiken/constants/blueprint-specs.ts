/**
 * Phase 2C: Blueprint Specifications
 * 
 * Defines characteristics for each grade level and question format
 */

import type { EikenGrade, VocabularyLevel, ComplexityLevel } from '../types';

// ====================
// Grade-Level Specifications
// ====================

export interface GradeSpec {
  vocabulary_level: VocabularyLevel;
  typical_grammar: string[];
  sentence_length_range: { min: number; max: number; target: number };
  complexity: ComplexityLevel;
  cefr_level: string;
}

export const GRADE_SPECIFICATIONS: Record<EikenGrade, GradeSpec> = {
  '5': {
    vocabulary_level: 'A1',
    typical_grammar: ['present_simple', 'present_continuous', 'can_could', 'basic_questions'],
    sentence_length_range: { min: 5, max: 10, target: 7 },
    complexity: 'simple',
    cefr_level: 'A1',
  },
  '4': {
    vocabulary_level: 'A1',
    typical_grammar: ['present_simple', 'present_continuous', 'past_simple', 'will_future', 'basic_modals'],
    sentence_length_range: { min: 7, max: 12, target: 10 },
    complexity: 'simple',
    cefr_level: 'A2',
  },
  '3': {
    vocabulary_level: 'A2',
    typical_grammar: ['tenses', 'modals', 'conditionals_type1', 'comparatives', 'passive_voice_simple'],
    sentence_length_range: { min: 10, max: 15, target: 12 },
    complexity: 'moderate',
    cefr_level: 'A2-B1',
  },
  'pre2': {
    vocabulary_level: 'B1',
    typical_grammar: ['all_tenses', 'conditionals', 'passive_voice', 'reported_speech', 'relative_clauses'],
    sentence_length_range: { min: 12, max: 18, target: 15 },
    complexity: 'moderate',
    cefr_level: 'B1',
  },
  '2': {
    vocabulary_level: 'B2',
    typical_grammar: ['complex_tenses', 'advanced_conditionals', 'subjunctive', 'inversion', 'participle_clauses'],
    sentence_length_range: { min: 15, max: 25, target: 20 },
    complexity: 'complex',
    cefr_level: 'B2',
  },
  'pre1': {
    vocabulary_level: 'C1',
    typical_grammar: ['all_grammar', 'formal_structures', 'idiomatic_expressions', 'discourse_markers'],
    sentence_length_range: { min: 18, max: 30, target: 24 },
    complexity: 'complex',
    cefr_level: 'C1',
  },
  '1': {
    vocabulary_level: 'C2',
    typical_grammar: ['advanced_structures', 'academic_style', 'nuanced_expressions', 'sophisticated_grammar'],
    sentence_length_range: { min: 20, max: 35, target: 28 },
    complexity: 'advanced',
    cefr_level: 'C2',
  },
};

// ====================
// Format-Specific Specifications
// ====================

export interface FormatSpec {
  name: string;
  description: string;
  time_limit_minutes: number;
  word_count?: { min: number; max: number; target: number };
  typical_constraints: string[];
}

export const FORMAT_SPECIFICATIONS: Record<string, FormatSpec> = {
  grammar_fill: {
    name: 'Grammar Fill-in-the-Blank',
    description: 'Complete sentences with appropriate grammar forms',
    time_limit_minutes: 2,
    typical_constraints: [
      'One blank per sentence',
      'Context clues provided',
      'Test specific grammar point',
      'Natural, authentic language',
    ],
  },
  
  opinion_speech: {
    name: 'Opinion Speech',
    description: 'Express opinion on a given topic with supporting reasons',
    time_limit_minutes: 1.5,
    word_count: { min: 40, max: 80, target: 60 },
    typical_constraints: [
      'Clear opinion statement',
      'At least 2 supporting reasons',
      'Logical flow',
      'Appropriate conclusion',
    ],
  },
  
  reading_aloud: {
    name: 'Reading Aloud',
    description: 'Read a short passage aloud with correct pronunciation',
    time_limit_minutes: 1,
    word_count: { min: 30, max: 60, target: 45 },
    typical_constraints: [
      'Natural, conversational tone',
      'Clear sentence structure',
      'Appropriate difficulty',
      'Cultural relevance',
    ],
  },
  
  long_reading: {
    name: 'Long Reading Comprehension',
    description: 'Read passage and answer comprehension questions',
    time_limit_minutes: 15,
    word_count: { min: 150, max: 400, target: 250 },
    typical_constraints: [
      'Cohesive narrative or exposition',
      'Multiple main ideas',
      'Supporting details',
      'Logical organization',
    ],
  },
  
  essay: {
    name: 'Essay Writing',
    description: 'Write a structured essay on a given topic',
    time_limit_minutes: 25,
    word_count: { min: 120, max: 200, target: 150 },
    typical_constraints: [
      'Introduction with thesis',
      'Body paragraphs with evidence',
      'Conclusion with summary',
      'Formal academic style',
    ],
  },
};

// ====================
// Evaluation Rubrics by Format
// ====================

export const DEFAULT_RUBRICS: Record<string, Array<{ name: string; weight: number; description: string; max_score: number }>> = {
  grammar_fill: [
    { name: 'Grammar Accuracy', weight: 0.6, description: 'Correct form and usage', max_score: 60 },
    { name: 'Contextual Fit', weight: 0.3, description: 'Appropriate in context', max_score: 30 },
    { name: 'Naturalness', weight: 0.1, description: 'Natural expression', max_score: 10 },
  ],
  
  opinion_speech: [
    { name: 'Content', weight: 0.4, description: 'Clear opinion and reasons', max_score: 40 },
    { name: 'Organization', weight: 0.2, description: 'Logical structure', max_score: 20 },
    { name: 'Language', weight: 0.3, description: 'Vocabulary and grammar', max_score: 30 },
    { name: 'Delivery', weight: 0.1, description: 'Fluency and pronunciation', max_score: 10 },
  ],
  
  reading_aloud: [
    { name: 'Pronunciation', weight: 0.4, description: 'Accurate sounds and stress', max_score: 40 },
    { name: 'Intonation', weight: 0.3, description: 'Natural rhythm and melody', max_score: 30 },
    { name: 'Fluency', weight: 0.2, description: 'Smooth, connected speech', max_score: 20 },
    { name: 'Expression', weight: 0.1, description: 'Appropriate emotion/emphasis', max_score: 10 },
  ],
  
  long_reading: [
    { name: 'Comprehension', weight: 0.5, description: 'Understanding main ideas', max_score: 50 },
    { name: 'Detail Recognition', weight: 0.3, description: 'Identifying specific information', max_score: 30 },
    { name: 'Inference', weight: 0.2, description: 'Drawing conclusions', max_score: 20 },
  ],
  
  essay: [
    { name: 'Task Achievement', weight: 0.3, description: 'Addressing the prompt fully', max_score: 30 },
    { name: 'Coherence & Cohesion', weight: 0.2, description: 'Logical flow and connections', max_score: 20 },
    { name: 'Vocabulary', weight: 0.25, description: 'Range and accuracy', max_score: 25 },
    { name: 'Grammar', weight: 0.25, description: 'Complexity and accuracy', max_score: 25 },
  ],
};
