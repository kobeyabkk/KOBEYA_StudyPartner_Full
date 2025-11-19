/**
 * LLM Model Selection Logic
 * 
 * ハイブリッドモデル戦略:
 * - 本番（保存）: GPT-4o（高品質・長文一貫性）
 * - 練習: GPT-4o-mini（高速・低コスト）
 */

import type { EikenGrade, LLMModel, GenerationMode, QuestionFormat } from '../types';

/**
 * モデル選択ルール
 */
export function selectModel(options: {
  grade: EikenGrade;
  format: QuestionFormat;
  mode: GenerationMode;
}): LLMModel {
  const { grade, format, mode } = options;

  // 練習モードは常に gpt-4o-mini
  if (mode === 'practice') {
    return 'gpt-4o-mini';
  }

  // 本番モード（production）の場合、級と形式で判断
  
  // 2級以上：常に gpt-4o（高度な論理性と一貫性が必要）
  if (grade === '2' || grade === 'pre1' || grade === '1') {
    return 'gpt-4o';
  }

  // 準2級〜3級：形式による判断
  if (grade === 'pre2' || grade === '3') {
    // 長文問題・エッセイ・意見スピーチは gpt-4o
    if (format === 'long_reading' || format === 'essay' || format === 'opinion_speech') {
      return 'gpt-4o';
    }
    // 文法・音読は gpt-4o-mini で十分
    return 'gpt-4o-mini';
  }

  // 5級・4級：常に gpt-4o-mini（基礎レベル）
  return 'gpt-4o-mini';
}

/**
 * モデルの特性情報を取得
 */
export function getModelInfo(model: LLMModel): {
  name: string;
  costPerMTokenInput: number;
  costPerMTokenOutput: number;
  speedRating: 'fast' | 'very-fast';
  qualityRating: 'excellent' | 'good';
} {
  const modelInfo = {
    'gpt-4o': {
      name: 'GPT-4o',
      costPerMTokenInput: 2.50,
      costPerMTokenOutput: 10.00,
      speedRating: 'fast' as const,
      qualityRating: 'excellent' as const,
    },
    'gpt-4o-mini': {
      name: 'GPT-4o-mini',
      costPerMTokenInput: 0.15,
      costPerMTokenOutput: 0.60,
      speedRating: 'very-fast' as const,
      qualityRating: 'good' as const,
    },
  };

  return modelInfo[model];
}

/**
 * モデル選択の理由を取得（ログ・デバッグ用）
 */
export function getModelSelectionReason(options: {
  grade: EikenGrade;
  format: QuestionFormat;
  mode: GenerationMode;
}): string {
  const { grade, format, mode } = options;
  const selectedModel = selectModel(options);

  if (mode === 'practice') {
    return `練習モードのため gpt-4o-mini を使用（高速・低コスト）`;
  }

  if (selectedModel === 'gpt-4o') {
    if (['2', 'pre1', '1'].includes(grade)) {
      return `${grade}級は高度な論理性が必要なため gpt-4o を使用`;
    }
    if (format === 'long_reading' || format === 'essay' || format === 'opinion_speech') {
      return `${format}は長文一貫性が重要なため gpt-4o を使用`;
    }
  }

  return `${grade}級の${format}は gpt-4o-mini で十分な品質を提供`;
}

/**
 * コスト見積もり
 */
export function estimateCost(options: {
  model: LLMModel;
  inputTokens: number;
  outputTokens: number;
}): number {
  const { model, inputTokens, outputTokens } = options;
  const info = getModelInfo(model);

  const inputCost = (inputTokens / 1_000_000) * info.costPerMTokenInput;
  const outputCost = (outputTokens / 1_000_000) * info.costPerMTokenOutput;

  return inputCost + outputCost;
}
