import { describe, it, expect } from 'vitest';
import { generateNGrams, jaccardSimilarity } from '../copyright-monitor';

describe('Copyright Monitor', () => {
  describe('generateNGrams', () => {
    it('should generate bigrams', () => {
      const text = 'the cat sat on the mat';
      const bigrams = generateNGrams(text, 2);
      
      expect(bigrams.has('the cat')).toBe(true);
      expect(bigrams.has('cat sat')).toBe(true);
      expect(bigrams.has('sat on')).toBe(true);
    });

    it('should generate trigrams', () => {
      const text = 'the cat sat on the mat';
      const trigrams = generateNGrams(text, 3);
      
      expect(trigrams.has('the cat sat')).toBe(true);
      expect(trigrams.has('cat sat on')).toBe(true);
    });
  });

  describe('jaccardSimilarity', () => {
    it('should return 1.0 for identical sets', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['a', 'b', 'c']);
      
      expect(jaccardSimilarity(set1, set2)).toBe(1.0);
    });

    it('should return 0.0 for disjoint sets', () => {
      const set1 = new Set(['a', 'b']);
      const set2 = new Set(['c', 'd']);
      
      expect(jaccardSimilarity(set1, set2)).toBe(0.0);
    });

    it('should calculate partial overlap', () => {
      const set1 = new Set(['a', 'b', 'c']);
      const set2 = new Set(['b', 'c', 'd']);
      
      const similarity = jaccardSimilarity(set1, set2);
      expect(similarity).toBeCloseTo(0.5, 1);
    });
  });
});
