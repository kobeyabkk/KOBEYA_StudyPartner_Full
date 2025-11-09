/**
 * AI問題生成サービス
 * OpenAI GPT-4oを使用して英検問題を生成
 */

import type { EikenGrade, QuestionType } from '../types';
import { validateGeneratedQuestion } from './copyright-validator';
import type { EikenEnv } from '../types';

export interface QuestionGenerationRequest {
  grade: EikenGrade;
  section: string;
  questionType: QuestionType;
  count: number;
  difficulty?: number;        // 0.0-1.0
  topicHints?: string[];
  basedOnAnalysisId?: number; // 分析結果IDを元に生成
}

export interface GeneratedQuestion {
  questionNumber: number;
  questionText: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty: number;
  topic: string;
  copyrightSafe: boolean;
  copyrightScore: number;
}

export interface QuestionGenerationResult {
  success: boolean;
  generated: GeneratedQuestion[];
  rejected: number;
  totalAttempts: number;
  errors: string[];
}

/**
 * 英検問題を生成（著作権チェック付き）
 */
export async function generateQuestions(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<QuestionGenerationResult> {
  
  const generated: GeneratedQuestion[] = [];
  const errors: string[] = [];
  let rejected = 0;
  let totalAttempts = 0;
  
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      generated: [],
      rejected: 0,
      totalAttempts: 0,
      errors: ['OpenAI API key not configured']
    };
  }
  
  console.log(`🎯 Generating ${request.count} questions for Grade ${request.grade}`);
  
  // 分析データを取得（basedOnAnalysisIdが指定されている場合）
  let analysisContext = null;
  if (request.basedOnAnalysisId) {
    analysisContext = await fetchAnalysisContext(env.DB, request.basedOnAnalysisId);
  }
  
  // 最大試行回数（著作権違反で却下される可能性を考慮）
  const maxAttempts = request.count * 3;
  
  while (generated.length < request.count && totalAttempts < maxAttempts) {
    totalAttempts++;
    
    try {
      console.log(`🔄 Attempt ${totalAttempts}: Generating question...`);
      
      // 1. OpenAI APIで問題生成
      const question = await generateSingleQuestion(
        request,
        analysisContext,
        openaiApiKey
      );
      
      // 2. 著作権検証
      console.log('🔍 Validating copyright safety...');
      const validation = await validateGeneratedQuestion(
        {
          generatedQuestion: question.questionText,
          generatedChoices: question.choices,
          grade: request.grade,
          section: request.section
        },
        env
      );
      
      // 3. 検証結果に基づいて承認・却下判定
      if (validation.recommendation === 'approve') {
        console.log(`✅ Question approved (score: ${validation.overallScore})`);
        generated.push({
          ...question,
          questionNumber: generated.length + 1,
          copyrightSafe: true,
          copyrightScore: validation.overallScore
        });
      } else if (validation.recommendation === 'review') {
        console.log(`⚠️ Question needs review (score: ${validation.overallScore})`);
        // スコアが比較的高ければ採用
        if (validation.overallScore >= 70) {
          generated.push({
            ...question,
            questionNumber: generated.length + 1,
            copyrightSafe: true,
            copyrightScore: validation.overallScore
          });
        } else {
          rejected++;
          console.log(`❌ Question rejected (low score)`);
        }
      } else {
        rejected++;
        console.log(`❌ Question rejected (${validation.violations.length} violations)`);
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('❌ Question generation error:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  console.log(`✅ Generation complete: ${generated.length}/${request.count} questions`);
  console.log(`📊 Stats: ${rejected} rejected, ${totalAttempts} total attempts`);
  
  return {
    success: generated.length > 0,
    generated,
    rejected,
    totalAttempts,
    errors
  };
}

/**
 * 単一問題を生成
 */
async function generateSingleQuestion(
  request: QuestionGenerationRequest,
  analysisContext: any,
  openaiApiKey: string
): Promise<Omit<GeneratedQuestion, 'questionNumber' | 'copyrightSafe' | 'copyrightScore'>> {
  
  const systemPrompt = buildSystemPrompt(request, analysisContext);
  const userPrompt = buildUserPrompt(request);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8, // 創造性重視
      max_tokens: 1000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  const generated = JSON.parse(data.choices[0].message.content);
  
  return {
    questionText: generated.question_text,
    choices: generated.choices,
    correctAnswerIndex: generated.correct_answer_index,
    explanation: generated.explanation,
    difficulty: generated.difficulty || request.difficulty || 0.5,
    topic: generated.topic || 'general'
  };
}

/**
 * システムプロンプト構築
 */
function buildSystemPrompt(
  request: QuestionGenerationRequest,
  analysisContext: any
): string {
  
  const gradeLevel = {
    '5': 'Grade 5 (初級)',
    '4': 'Grade 4 (初級-中級)',
    '3': 'Grade 3 (中級)',
    'pre2': 'Pre-2 (中級-上級)',
    '2': 'Grade 2 (上級)',
    'pre1': 'Pre-1 (準1級)',
    '1': 'Grade 1 (1級)'
  }[request.grade] || 'Unknown';
  
  let contextInfo = '';
  if (analysisContext) {
    contextInfo = `
Reference Analysis:
- Grammar patterns: ${analysisContext.grammar_patterns?.join(', ') || 'N/A'}
- Vocabulary level: ${analysisContext.vocabulary_level || 'N/A'}
- Sentence structure: ${analysisContext.sentence_structure || 'N/A'}
- Difficulty: ${analysisContext.difficulty_score || 0.5}
`;
  }
  
  return `You are an expert Eiken (英検) test question creator.
Generate ORIGINAL questions for ${gradeLevel} that are:
1. Completely different from existing past exam questions
2. Appropriate for the target level
3. Educational and realistic
4. Free from copyright issues

${contextInfo}

IMPORTANT: Create questions with ORIGINAL content. Do not copy or closely imitate existing test materials.

Return JSON format:
{
  "question_text": "Complete sentence with ( ) blank",
  "choices": ["option1", "option2", "option3", "option4"],
  "correct_answer_index": 0-3,
  "explanation": "Why this answer is correct",
  "difficulty": 0.0-1.0,
  "topic": "category name"
}`;
}

/**
 * ユーザープロンプト構築
 */
function buildUserPrompt(request: QuestionGenerationRequest): string {
  
  const hints = request.topicHints?.length 
    ? `\nTopic hints: ${request.topicHints.join(', ')}` 
    : '';
  
  const difficultyDesc = request.difficulty 
    ? request.difficulty < 0.3 ? 'easy' :
      request.difficulty < 0.7 ? 'medium' : 'hard'
    : 'medium';
  
  return `Generate a ${request.questionType} question for Eiken Grade ${request.grade}.
Section: ${request.section}
Difficulty: ${difficultyDesc}${hints}

Create an ORIGINAL question that tests the appropriate skills for this level.
Ensure the question is completely unique and does not resemble existing test questions.`;
}

/**
 * 分析コンテキストを取得
 */
async function fetchAnalysisContext(
  db: D1Database,
  analysisId: number
): Promise<any> {
  
  const result = await db.prepare(`
    SELECT 
      grammar_patterns,
      vocabulary_level,
      sentence_structure,
      difficulty_score
    FROM question_analysis
    WHERE id = ?
  `).bind(analysisId).first();
  
  if (!result) {
    return null;
  }
  
  return {
    grammar_patterns: JSON.parse(result.grammar_patterns as string || '[]'),
    vocabulary_level: result.vocabulary_level,
    sentence_structure: result.sentence_structure,
    difficulty_score: result.difficulty_score
  };
}
