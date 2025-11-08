/**
 * 英検対策システム - 著作権安全モニター
 * V3設計: 多層防御システム
 */

import type { EikenEnv } from '../types';
import { EmbeddingCache, cosineSimilarity } from './embedding-cache';

/**
 * V3設計: 動的閾値（文章長に応じて調整）
 */
const THRESHOLDS = {
  trigram: {
    short: 0.10,   // < 12 tokens
    medium: 0.12,  // 12-30 tokens
    long: 0.15     // > 30 tokens
  },
  embedding: 0.85,
  dangerous: 0.20
};

/**
 * 禁止パターン（英検特有）
 */
const FORBIDDEN_PATTERNS = [
  { pattern: /(英検|実用英語技能検定|EIKEN)/i, severity: 'critical' },
  { pattern: /(第[一二三]回|20\d{2}年度)/i, severity: 'high' },
  { pattern: /(大問[１-３]|問題[１-９])/i, severity: 'medium' },
  { pattern: /(As an AI|I cannot provide)/i, severity: 'high' }
];

interface ValidationResult {
  safe: boolean;
  similarity_score?: number;
  violations: string[];
  warnings: string[];
}

/**
 * AI生成テキストの著作権安全性をチェック
 */
export async function checkCopyrightSafety(
  generatedText: string,
  originalTexts: string[],
  embeddingCache: EmbeddingCache,
  env: EikenEnv
): Promise<ValidationResult> {
  const violations: string[] = [];
  const warnings: string[] = [];

  // 1. 禁止パターンチェック
  for (const { pattern, severity } of FORBIDDEN_PATTERNS) {
    if (pattern.test(generatedText)) {
      const msg = `Forbidden pattern detected: ${pattern.source}`;
      if (severity === 'critical') {
        violations.push(msg);
      } else {
        warnings.push(msg);
      }
    }
  }

  // 2. Embedding類似度チェック
  const genEmbedding = await embeddingCache.getEmbedding(generatedText, env);
  let maxSimilarity = 0;

  for (const originalText of originalTexts) {
    const origEmbedding = await embeddingCache.getEmbedding(originalText, env);
    const similarity = cosineSimilarity(genEmbedding, origEmbedding);
    
    if (similarity > maxSimilarity) {
      maxSimilarity = similarity;
    }

    if (similarity > THRESHOLDS.embedding) {
      violations.push(`High similarity detected: ${similarity.toFixed(3)}`);
    } else if (similarity > 0.75) {
      warnings.push(`Moderate similarity: ${similarity.toFixed(3)}`);
    }
  }

  return {
    safe: violations.length === 0,
    similarity_score: maxSimilarity,
    violations,
    warnings
  };
}

/**
 * n-gramを生成
 */
export function generateNGrams(text: string, n: number): Set<string> {
  const words = text.toLowerCase().split(/\s+/).filter(w => w.length > 0);
  const ngrams = new Set<string>();
  
  for (let i = 0; i <= words.length - n; i++) {
    ngrams.add(words.slice(i, i + n).join(' '));
  }
  
  return ngrams;
}

/**
 * Jaccard係数を計算
 */
export function jaccardSimilarity(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return union.size === 0 ? 0 : intersection.size / union.size;
}
