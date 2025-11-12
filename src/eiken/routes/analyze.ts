/**
 * 問題分析APIエンドポイント
 * POST /api/eiken/analyze
 */

import { Hono } from 'hono';
import type { EikenEnv, EikenGrade, QuestionAnalysis } from '../types';
import { analyzeQuestionWithAI, batchAnalyzeQuestions } from '../services/question-analyzer';
import type { QuestionAnalysisRequest } from '../services/question-analyzer';

const analyze = new Hono<{ Bindings: EikenEnv }>();

/**
 * POST /api/eiken/analyze
 * 
 * 英検過去問を分析してDBに保存
 * 
 * リクエストボディ:
 * {
 *   "grade": "pre1",
 *   "year": 2025,
 *   "session": "第1回",
 *   "questions": [
 *     {
 *       "questionNumber": 1,
 *       "section": "vocabulary",
 *       "questionText": "Emergency services were...",
 *       "choices": ["infected", "recited", "galloped", "diverted"]
 *     }
 *   ]
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "analyzed": 18,
 *   "saved": 18,
 *   "results": [...]
 * }
 */
analyze.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { grade, year, session, questions } = body;
    
    // バリデーション
    if (!grade || !year || !session || !Array.isArray(questions)) {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: grade, year, session, questions[]'
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
    
    console.log(`📊 Analyzing ${questions.length} questions for Grade ${grade}`);
    
    // 分析リクエストを準備
    const analysisRequests: QuestionAnalysisRequest[] = questions.map((q: any) => ({
      grade,
      section: q.section || 'vocabulary',
      questionNumber: q.questionNumber,
      questionText: q.questionText,
      choices: q.choices,
      contextText: q.contextText
    }));
    
    // バッチ分析実行
    console.log('🤖 Starting AI analysis...');
    const analysisResults = await batchAnalyzeQuestions(
      analysisRequests,
      openaiApiKey,
      3 // 最大3並列
    );
    
    console.log(`✅ Analysis complete: ${analysisResults.length} questions analyzed`);
    
    // データベースに保存
    const savedCount = await saveAnalysisResults(
      db,
      grade,
      year,
      session,
      questions,
      analysisResults
    );
    
    console.log(`💾 Saved ${savedCount} analysis records to database`);
    
    return c.json({
      success: true,
      analyzed: analysisResults.length,
      saved: savedCount,
      results: analysisResults.map((result, i) => ({
        questionNumber: questions[i].questionNumber,
        difficulty: result.difficulty_score,
        vocabularyLevel: result.vocabulary_level,
        topic: result.topic_category
      }))
    });
    
  } catch (error) {
    console.error('❌ Analysis error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * 分析結果をデータベースに保存
 */
async function saveAnalysisResults(
  db: D1Database,
  grade: EikenGrade,
  year: number,
  session: string,
  questions: any[],
  analysisResults: any[]
): Promise<number> {
  
  let savedCount = 0;
  
  for (let i = 0; i < questions.length; i++) {
    const question = questions[i];
    const analysis = analysisResults[i];
    
    try {
      // eiken_question_analysis テーブルに挿入
      const result = await db.prepare(`
        INSERT INTO eiken_question_analysis (
          grade,
          section,
          question_number,
          question_type,
          grammar_patterns,
          vocabulary_level,
          sentence_structure,
          difficulty_score,
          distractor_patterns,
          source_year,
          source_session,
          analysis_date,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        grade,
        question.section || 'vocabulary',
        question.questionNumber,
        'vocabulary', // デフォルト
        JSON.stringify(analysis.grammar_patterns || []),
        analysis.vocabulary_level || 'B2',
        analysis.sentence_structure || 'simple',
        analysis.difficulty_score || 0.5,
        JSON.stringify(analysis.distractor_patterns || {}),
        year,
        session
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

/**
 * GET /api/eiken/analyze/stats
 * 
 * 分析統計情報を取得
 */
analyze.get('/stats', async (c) => {
  try {
    const db = c.env.DB;
    
    // 総分析数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as total FROM eiken_question_analysis
    `).first();
    
    // 級別の統計
    const gradeStats = await db.prepare(`
      SELECT 
        grade,
        COUNT(*) as count,
        AVG(difficulty_score) as avg_difficulty
      FROM eiken_question_analysis
      GROUP BY grade
      ORDER BY grade
    `).all();
    
    return c.json({
      success: true,
      total: totalResult?.total || 0,
      byGrade: gradeStats.results || []
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default analyze;
