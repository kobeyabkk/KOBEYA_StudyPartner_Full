/**
 * AI問題生成APIエンドポイント
 * POST /api/eiken/generate
 */

import { Hono } from 'hono';
import type { EikenEnv, EikenGrade, QuestionType } from '../types';
import { generateQuestions } from '../services/question-generator';
import type { QuestionGenerationRequest } from '../services/question-generator';

const generate = new Hono<{ Bindings: EikenEnv }>();

/**
 * POST /api/eiken/generate
 * 
 * AI問題生成（著作権安全チェック付き）
 * 
 * リクエストボディ:
 * {
 *   "grade": "pre1",
 *   "section": "vocabulary",
 *   "questionType": "vocabulary",
 *   "count": 5,
 *   "difficulty": 0.6,
 *   "topicHints": ["business", "technology"],
 *   "basedOnAnalysisId": 123
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "generated": 5,
 *   "rejected": 2,
 *   "totalAttempts": 7,
 *   "questions": [
 *     {
 *       "questionNumber": 1,
 *       "questionText": "The company decided to...",
 *       "choices": ["expand", "contract", "merge", "dissolve"],
 *       "correctAnswerIndex": 0,
 *       "explanation": "...",
 *       "difficulty": 0.6,
 *       "topic": "business",
 *       "copyrightSafe": true,
 *       "copyrightScore": 95
 *     }
 *   ]
 * }
 */
generate.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      grade,
      section,
      questionType,
      count,
      difficulty,
      topicHints,
      basedOnAnalysisId
    } = body;
    
    // バリデーション
    if (!grade || !section || !questionType || !count) {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: grade, section, questionType, count'
      }, 400);
    }
    
    if (count < 1 || count > 20) {
      return c.json({
        success: false,
        error: 'Count must be between 1 and 20'
      }, 400);
    }
    
    // 環境変数チェック
    const openaiApiKey = c.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return c.json({
        success: false,
        error: 'OpenAI API key not configured'
      }, 500);
    }
    
    const db = c.env.DB;
    if (!db) {
      return c.json({
        success: false,
        error: 'Database not configured'
      }, 500);
    }
    
    console.log(`🎯 Generating ${count} questions for Grade ${grade}, Section: ${section}`);
    
    // 問題生成リクエスト準備
    const request: QuestionGenerationRequest = {
      grade: grade as EikenGrade,
      section,
      questionType: questionType as QuestionType,
      count,
      difficulty,
      topicHints,
      basedOnAnalysisId
    };
    
    // AI問題生成実行（著作権チェック統合）
    const result = await generateQuestions(request, c.env);
    
    if (!result.success) {
      return c.json({
        success: false,
        error: 'Question generation failed',
        details: result.errors
      }, 500);
    }
    
    // 生成された問題をデータベースに保存
    const savedCount = await saveGeneratedQuestions(
      db,
      grade,
      section,
      questionType,
      result.generated
    );
    
    console.log(`✅ Generated and saved ${savedCount} questions`);
    
    return c.json({
      success: true,
      generated: result.generated.length,
      rejected: result.rejected,
      totalAttempts: result.totalAttempts,
      saved: savedCount,
      questions: result.generated
    });
    
  } catch (error) {
    console.error('❌ Generation error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * POST /api/eiken/generate/validate
 * 
 * 生成済み問題の著作権検証（テスト用）
 * 
 * リクエストボディ:
 * {
 *   "grade": "pre1",
 *   "section": "vocabulary",
 *   "questionText": "The company decided to...",
 *   "choices": ["expand", "contract", "merge", "dissolve"]
 * }
 * 
 * レスポンス:
 * {
 *   "safe": true,
 *   "overallScore": 95,
 *   "embeddingSimilarity": 0.45,
 *   "ngramSimilarity": 0.08,
 *   "violations": [],
 *   "warnings": [],
 *   "recommendation": "approve"
 * }
 */
generate.post('/validate', async (c) => {
  try {
    const body = await c.req.json();
    const { grade, section, questionText, choices } = body;
    
    if (!grade || !section || !questionText) {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: grade, section, questionText'
      }, 400);
    }
    
    // 著作権検証のみ実行
    const { validateGeneratedQuestion } = await import('../services/copyright-validator');
    
    const validation = await validateGeneratedQuestion(
      {
        generatedQuestion: questionText,
        generatedChoices: choices,
        grade: grade as EikenGrade,
        section
      },
      c.env
    );
    
    return c.json(validation);
    
  } catch (error) {
    console.error('❌ Validation error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * GET /api/eiken/generate/stats
 * 
 * 生成問題統計情報
 */
generate.get('/stats', async (c) => {
  try {
    const db = c.env.DB;
    
    // 総生成数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as total FROM eiken_generated_questions
    `).first();
    
    // 級別・セクション別統計
    const gradeStats = await db.prepare(`
      SELECT 
        grade,
        section,
        COUNT(*) as count,
        AVG(difficulty_score) as avg_difficulty,
        AVG(similarity_score) as avg_copyright_score
      FROM eiken_generated_questions
      GROUP BY grade, section
      ORDER BY grade, section
    `).all();
    
    return c.json({
      success: true,
      total: totalResult?.total || 0,
      byGradeAndSection: gradeStats.results || []
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * 生成問題をデータベースに保存
 */
async function saveGeneratedQuestions(
  db: D1Database,
  grade: EikenGrade,
  section: string,
  questionType: QuestionType,
  questions: any[]
): Promise<number> {
  
  let savedCount = 0;
  
  for (const question of questions) {
    try {
      const result = await db.prepare(`
        INSERT INTO eiken_generated_questions (
          grade,
          section,
          question_type,
          answer_type,
          question_text,
          choices_json,
          correct_answer_index,
          explanation,
          difficulty_score,
          similarity_score,
          review_status,
          generated_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        grade,
        section,
        questionType,
        'mcq',
        question.questionText,
        JSON.stringify(question.choices),
        question.correctAnswerIndex,
        question.explanation,
        question.difficulty,
        1.0 - (question.copyrightScore / 100), // 類似度スコアに変換
        question.copyrightSafe ? 'approved' : 'rejected' // review_status
      ).run();
      
      if (result.success) {
        savedCount++;
      }
      
    } catch (error) {
      console.error(`❌ Failed to save question ${question.questionNumber}:`, error);
    }
  }
  
  return savedCount;
}

export default generate;
