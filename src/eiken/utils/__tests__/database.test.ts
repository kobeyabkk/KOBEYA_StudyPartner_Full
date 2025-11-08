/**
 * 英検対策システム - Databaseユーティリティのテスト
 */

import { describe, it, expect } from 'vitest';
import {
  validateMCQChoices,
  validateCorrectAnswerIndex,
  validateDifficultyScore,
  validateGrade,
  parseJSONArray,
  parseJSONObject
} from '../database';

describe('Database Utilities - Validation', () => {
  describe('validateMCQChoices', () => {
    it('should accept valid 4-choice MCQ', () => {
      const result = validateMCQChoices(['A', 'B', 'C', 'D']);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject less than 2 choices', () => {
      const result = validateMCQChoices(['A']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('at least 2 choices');
    });

    it('should reject more than 4 choices', () => {
      const result = validateMCQChoices(['A', 'B', 'C', 'D', 'E']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Cannot have more than 4 choices');
    });

    it('should reject duplicate choices', () => {
      const result = validateMCQChoices(['A', 'B', 'A', 'D']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('unique');
    });

    it('should reject empty choices', () => {
      const result = validateMCQChoices(['A', '', 'C', 'D']);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('cannot be empty');
    });
  });

  describe('validateCorrectAnswerIndex', () => {
    it('should accept valid index', () => {
      const result = validateCorrectAnswerIndex(2, 4);
      expect(result.valid).toBe(true);
    });

    it('should reject negative index', () => {
      const result = validateCorrectAnswerIndex(-1, 4);
      expect(result.valid).toBe(false);
    });

    it('should reject index out of range', () => {
      const result = validateCorrectAnswerIndex(4, 4);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('out of range');
    });

    it('should reject non-integer index', () => {
      const result = validateCorrectAnswerIndex(2.5, 4);
      expect(result.valid).toBe(false);
    });
  });

  describe('validateDifficultyScore', () => {
    it('should accept valid score', () => {
      expect(validateDifficultyScore(0.5).valid).toBe(true);
      expect(validateDifficultyScore(0.0).valid).toBe(true);
      expect(validateDifficultyScore(1.0).valid).toBe(true);
    });

    it('should reject score out of range', () => {
      expect(validateDifficultyScore(-0.1).valid).toBe(false);
      expect(validateDifficultyScore(1.1).valid).toBe(false);
    });

    it('should reject non-number', () => {
      expect(validateDifficultyScore(NaN).valid).toBe(false);
    });
  });

  describe('validateGrade', () => {
    it('should accept valid grades', () => {
      expect(validateGrade('5')).toBe(true);
      expect(validateGrade('pre2')).toBe(true);
      expect(validateGrade('1')).toBe(true);
    });

    it('should reject invalid grades', () => {
      expect(validateGrade('6')).toBe(false);
      expect(validateGrade('pre3')).toBe(false);
      expect(validateGrade('')).toBe(false);
    });
  });
});

describe('Database Utilities - JSON Parsing', () => {
  describe('parseJSONArray', () => {
    it('should parse valid JSON array', () => {
      const result = parseJSONArray<string>('["A", "B", "C"]');
      expect(result).toEqual(['A', 'B', 'C']);
    });

    it('should return empty array for null', () => {
      const result = parseJSONArray(null);
      expect(result).toEqual([]);
    });

    it('should return empty array for invalid JSON', () => {
      const result = parseJSONArray('not json');
      expect(result).toEqual([]);
    });

    it('should return empty array for non-array JSON', () => {
      const result = parseJSONArray('{"key": "value"}');
      expect(result).toEqual([]);
    });
  });

  describe('parseJSONObject', () => {
    it('should parse valid JSON object', () => {
      const result = parseJSONObject<{ key: string }>('{"key": "value"}');
      expect(result).toEqual({ key: 'value' });
    });

    it('should return null for null', () => {
      const result = parseJSONObject(null);
      expect(result).toBeNull();
    });

    it('should return null for invalid JSON', () => {
      const result = parseJSONObject('not json');
      expect(result).toBeNull();
    });
  });
});
