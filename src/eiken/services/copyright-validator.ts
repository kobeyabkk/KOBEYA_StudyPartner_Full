/**
 * 著作権検証統合サービス
 * 生成問題の著作権安全性を総合的に検証
 */

import type { EikenEnv, EikenGrade } from '../types';
import { EmbeddingCache } from './embedding-cache';
import { checkCopyrightSafety, generateNGrams, jaccardSimilarity } from './copyright-monitor';

export interface CopyrightValidationRequest {
  generatedQuestion: string;
  generatedChoices?: string[];
  grade: EikenGrade;
  section: string;
}

export interface CopyrightValidationResult {
  safe: boolean;
  overallScore: number;        // 0-100 (100 = 完全に安全)
  embeddingSimilarity: number; // 最大類似度
  ngramSimilarity: number;     // n-gram類似度
  violations: ValidationViolation[];
  warnings: string[];
  recommendation: 'approve' | 'review' | 'reject';
}

export interface ValidationViolation {
  type: 'embedding' | 'ngram' | 'pattern' | 'phrase';
  severity: 'critical' | 'high' | 'medium' | 'low';
  message: string;
  details?: string;
}

/**
 * 生成問題の著作権検証を実行
 */
export async function validateGeneratedQuestion(
  request: CopyrightValidationRequest,
  env: EikenEnv
): Promise<CopyrightValidationResult> {
  
  const violations: ValidationViolation[] = [];
  const warnings: string[] = [];
  
  // 統合テキスト（問題文 + 選択肢）
  const fullText = request.generatedChoices 
    ? `${request.generatedQuestion} ${request.generatedChoices.join(' ')}`
    : request.generatedQuestion;
  
  console.log('🔍 Starting copyright validation...');
  console.log(`📝 Text length: ${fullText.length} characters`);
  
  // 1. データベースから既存の過去問を取得
  const existingQuestions = await fetchExistingQuestions(
    env.DB,
    request.grade,
    request.section
  ) || []; // 万が一 undefined の場合は空配列を使用
  
  console.log(`📚 Comparing against ${existingQuestions.length} existing questions`);
  
  // 2. Embedding類似度チェック
  const embeddingCache = new EmbeddingCache();
  const embeddingResult = await checkCopyrightSafety(
    fullText,
    existingQuestions,
    embeddingCache,
    env
  );
  
  // エラーハンドリング：violations と warnings が存在する場合のみ追加
  if (embeddingResult.violations && embeddingResult.violations.length > 0) {
    violations.push(...embeddingResult.violations.map(v => ({
      type: 'embedding' as const,
      severity: 'critical' as const,
      message: v
    })));
  }
  
  if (embeddingResult.warnings && embeddingResult.warnings.length > 0) {
    warnings.push(...embeddingResult.warnings);
  }
  
  // 3. N-gram類似度チェック
  const ngramResults = await checkNGramSimilarity(
    fullText,
    existingQuestions
  );
  
  if (ngramResults.violations && ngramResults.violations.length > 0) {
    violations.push(...ngramResults.violations);
  }
  if (ngramResults.warnings && ngramResults.warnings.length > 0) {
    warnings.push(...ngramResults.warnings);
  }
  
  // 4. 完全フレーズマッチチェック
  const phraseResults = checkExactPhrases(fullText, existingQuestions);
  if (phraseResults.violations && phraseResults.violations.length > 0) {
    violations.push(...phraseResults.violations);
  }
  if (phraseResults.warnings && phraseResults.warnings.length > 0) {
    warnings.push(...phraseResults.warnings);
  }
  
  // 5. 総合スコア計算
  const overallScore = calculateOverallScore(
    embeddingResult.similarity_score || 0,
    ngramResults.maxSimilarity,
    violations
  );
  
  // 6. 推奨アクション決定
  const recommendation = determineRecommendation(overallScore, violations);
  
  console.log(`✅ Validation complete: Score ${overallScore}/100, ${violations.length} violations`);
  
  return {
    safe: violations.filter(v => v.severity === 'critical').length === 0,
    overallScore,
    embeddingSimilarity: embeddingResult.similarity_score || 0,
    ngramSimilarity: ngramResults.maxSimilarity,
    violations,
    warnings,
    recommendation
  };
}

/**
 * データベースから既存問題を取得
 */
async function fetchExistingQuestions(
  db: D1Database,
  grade: EikenGrade,
  section: string,
  limit: number = 100
): Promise<string[]> {
  
  // question_analysisテーブルは問題文を保存していないため、
  // 実際の実装では分析結果のキーワード・パターンのみを使用
  
  // プレースホルダー実装
  // 実運用では、過去問のハッシュや特徴ベクトルのみを保存・比較
  
  try {
    const result = await db.prepare(`
      SELECT grammar_patterns, vocabulary_level 
      FROM eiken_question_analysis 
      WHERE grade = ? AND section = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).bind(grade, section, limit).all();
    
    // 実際は問題文ではなく、特徴データから構築した比較用テキスト
    return result.results.map((row: any) => {
      // 文法パターンと語彙レベルから仮想比較テキストを生成
      const patterns = JSON.parse(row.grammar_patterns || '[]');
      return `${patterns.join(' ')} ${row.vocabulary_level}`;
    });
  } catch (error) {
    // テーブルが存在しない場合は空配列を返す
    console.warn('eiken_question_analysis table not found, skipping database check');
    return [];
  }
}

/**
 * N-gram類似度チェック
 */
async function checkNGramSimilarity(
  generatedText: string,
  existingTexts: string[]
): Promise<{
  maxSimilarity: number;
  violations: ValidationViolation[];
  warnings: string[];
}> {
  
  const violations: ValidationViolation[] = [];
  const warnings: string[] = [];
  let maxSimilarity = 0;
  
  // 既存テキストが空の場合は早期リターン
  if (!existingTexts || existingTexts.length === 0) {
    return { maxSimilarity, violations, warnings };
  }
  
  const genTrigrams = generateNGrams(generatedText, 3);
  const genBigrams = generateNGrams(generatedText, 2);
  
  for (const existingText of existingTexts) {
    const existTrigrams = generateNGrams(existingText, 3);
    const existBigrams = generateNGrams(existingText, 2);
    
    const trigramSim = jaccardSimilarity(genTrigrams, existTrigrams);
    const bigramSim = jaccardSimilarity(genBigrams, existBigrams);
    
    const avgSimilarity = (trigramSim + bigramSim) / 2;
    
    if (avgSimilarity > maxSimilarity) {
      maxSimilarity = avgSimilarity;
    }
    
    // 動的閾値（文章長に応じて）
    const wordCount = generatedText.split(/\s+/).length;
    const threshold = wordCount < 12 ? 0.10 : 
                     wordCount < 30 ? 0.12 : 0.15;
    
    if (trigramSim > threshold) {
      violations.push({
        type: 'ngram',
        severity: trigramSim > threshold * 1.5 ? 'critical' : 'high',
        message: `High trigram similarity: ${(trigramSim * 100).toFixed(1)}%`,
        details: `Threshold: ${(threshold * 100).toFixed(1)}%`
      });
    } else if (trigramSim > threshold * 0.7) {
      warnings.push(`Moderate trigram similarity: ${(trigramSim * 100).toFixed(1)}%`);
    }
  }
  
  return { maxSimilarity, violations, warnings };
}

/**
 * 完全フレーズマッチチェック
 */
function checkExactPhrases(
  generatedText: string,
  existingTexts: string[]
): {
  violations: ValidationViolation[];
  warnings: string[];
} {
  
  const violations: ValidationViolation[] = [];
  const warnings: string[] = [];
  
  // 既存テキストが空の場合は早期リターン
  if (!existingTexts || existingTexts.length === 0) {
    return { violations, warnings };
  }
  
  // 5語以上の連続一致を検出
  const genWords = generatedText.toLowerCase().split(/\s+/);
  
  for (const existingText of existingTexts) {
    const existWords = existingText.toLowerCase().split(/\s+/);
    
    // スライディングウィンドウで5-gram以上の一致を検索
    for (let windowSize = 5; windowSize <= Math.min(10, genWords.length); windowSize++) {
      for (let i = 0; i <= genWords.length - windowSize; i++) {
        const phrase = genWords.slice(i, i + windowSize).join(' ');
        
        if (existingText.toLowerCase().includes(phrase)) {
          violations.push({
            type: 'phrase',
            severity: windowSize >= 8 ? 'critical' : 'high',
            message: `Exact phrase match detected: ${windowSize} words`,
            details: phrase.substring(0, 50) + '...'
          });
        }
      }
    }
  }
  
  return { violations, warnings };
}

/**
 * 総合スコア計算
 */
function calculateOverallScore(
  embeddingSim: number,
  ngramSim: number,
  violations: ValidationViolation[]
): number {
  
  // ベーススコア（100から減点）
  let score = 100;
  
  // Embedding類似度による減点
  if (embeddingSim > 0.85) {
    score -= 50; // Critical
  } else if (embeddingSim > 0.75) {
    score -= 30; // High
  } else if (embeddingSim > 0.65) {
    score -= 15; // Medium
  }
  
  // N-gram類似度による減点
  if (ngramSim > 0.15) {
    score -= 30;
  } else if (ngramSim > 0.12) {
    score -= 20;
  } else if (ngramSim > 0.10) {
    score -= 10;
  }
  
  // 違反による減点
  for (const violation of violations) {
    switch (violation.severity) {
      case 'critical':
        score -= 25;
        break;
      case 'high':
        score -= 15;
        break;
      case 'medium':
        score -= 8;
        break;
      case 'low':
        score -= 3;
        break;
    }
  }
  
  return Math.max(0, score);
}

/**
 * 推奨アクション決定
 */
function determineRecommendation(
  score: number,
  violations: ValidationViolation[]
): 'approve' | 'review' | 'reject' {
  
  // Critical違反がある場合は即却下
  if (violations.some(v => v.severity === 'critical')) {
    return 'reject';
  }
  
  // スコアベースの判定
  if (score >= 80) {
    return 'approve';
  } else if (score >= 60) {
    return 'review';
  } else {
    return 'reject';
  }
}
