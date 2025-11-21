/**
 * 問題分析サービス
 * OpenAI GPT-4oを使用して英検問題の特徴を分析
 */

import type { EikenGrade, QuestionType, SentenceStructure } from '../types';

export interface QuestionAnalysisRequest {
  grade: EikenGrade;
  section: string;
  questionNumber: number;
  questionText: string;
  choices?: string[];
  contextText?: string;
}

export interface QuestionAnalysisResponse {
  grammar_patterns: string[];
  vocabulary_level: string;
  sentence_structure: SentenceStructure;
  difficulty_score: number;
  distractor_patterns: {
    type: string;
    level: string;
    characteristics: string[];
  };
  topic_category: string;
  key_vocabulary: string[];
  estimated_time_seconds: number;
}

/**
 * OpenAI GPT-4oで問題を分析
 */
export async function analyzeQuestionWithAI(
  question: QuestionAnalysisRequest,
  openaiApiKey: string
): Promise<QuestionAnalysisResponse> {
  
  const systemPrompt = `You are an expert English test analyzer specializing in Eiken (英検) exams.
Analyze the given question and provide detailed insights about its structure, difficulty, and characteristics.

Return a JSON object with the following structure:
{
  "grammar_patterns": ["pattern1", "pattern2"],
  "vocabulary_level": "CEFR level (A1-C2)",
  "sentence_structure": "simple" | "compound" | "complex",
  "difficulty_score": 0.0-1.0,
  "distractor_patterns": {
    "type": "type of distractors",
    "level": "difficulty level",
    "characteristics": ["characteristic1", "characteristic2"]
  },
  "topic_category": "category name",
  "key_vocabulary": ["word1", "word2"],
  "estimated_time_seconds": 30-120
}`;

  const userPrompt = `Analyze this Eiken Grade ${question.grade} question:

Question ${question.questionNumber}:
${question.questionText}

${question.choices ? `Choices:\n${question.choices.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}

${question.contextText ? `Context:\n${question.contextText}` : ''}

Provide detailed analysis in JSON format.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o', // 問題分析は常に高品質モデルを使用（正確な分析結果が重要）
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const analysis = JSON.parse(data.choices[0].message.content);
    
    return analysis;
    
  } catch (error) {
    console.error('Question analysis error:', error);
    throw error;
  }
}

/**
 * バッチ分析（複数問題を一度に分析）
 */
export async function batchAnalyzeQuestions(
  questions: QuestionAnalysisRequest[],
  openaiApiKey: string,
  maxConcurrent: number = 3
): Promise<QuestionAnalysisResponse[]> {
  
  const results: QuestionAnalysisResponse[] = [];
  
  // 並列実行数を制限
  for (let i = 0; i < questions.length; i += maxConcurrent) {
    const batch = questions.slice(i, i + maxConcurrent);
    const batchResults = await Promise.all(
      batch.map(q => analyzeQuestionWithAI(q, openaiApiKey))
    );
    results.push(...batchResults);
    
    // レート制限対策（短い待機時間）
    if (i + maxConcurrent < questions.length) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  return results;
}

/**
 * 分析結果から特徴ベクトルを生成
 */
export function generateFeatureVector(
  analysis: QuestionAnalysisResponse
): number[] {
  // 簡易的な特徴ベクトル生成
  // 実際の実装では embedding APIを使用
  
  return [
    analysis.difficulty_score,
    analysis.vocabulary_level === 'C2' ? 1.0 : 
    analysis.vocabulary_level === 'C1' ? 0.83 : 
    analysis.vocabulary_level === 'B2' ? 0.67 : 0.5,
    analysis.sentence_structure === 'complex' ? 1.0 : 
    analysis.sentence_structure === 'compound' ? 0.67 : 0.33,
    analysis.estimated_time_seconds / 120.0
  ];
}
