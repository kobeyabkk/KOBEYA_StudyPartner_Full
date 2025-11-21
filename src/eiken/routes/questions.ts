/**
 * Phase 3: Question Generation API Routes
 * 
 * 統合問題生成エンドポイント
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { QuestionGenerationRequest } from '../types';
import { IntegratedQuestionGenerator } from '../services/integrated-question-generator';

// メインappと同じBindings型を使用
type Bindings = {
  OPENAI_API_KEY: string;
  DB: D1Database;
  WEBHOOK_SECRET: string;
  VERSION: string;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/eiken/questions/generate
 * 
 * Blueprint生成 → LLM呼び出し → 検証 → 保存を一括実行
 */
app.post('/generate', async (c) => {
  try {
    const body = await c.req.json<QuestionGenerationRequest>();

    // バリデーション
    if (!body.student_id || !body.grade || !body.format) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing required fields: student_id, grade, format',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    // 有効な形式かチェック（Phase 4: 全5形式が利用可能）
    const availableFormats = [
      'grammar_fill', 
      'opinion_speech', 
      'reading_aloud',
      'essay',           // Phase 4: 語彙品質改善完了 ✅
      'long_reading'     // Phase 4: 語彙品質改善完了 ✅
    ];
    
    if (!availableFormats.includes(body.format)) {
      return c.json(
        {
          success: false,
          error: {
            message: `Invalid format. Must be one of: ${availableFormats.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }
    
    // Phase 4 デプロイ完了ログ
    if (body.format === 'essay' || body.format === 'long_reading') {
      console.log(`[Phase 4 Production] Generating ${body.format} with vocabulary improvements (target: ${body.format === 'essay' ? '78-81%' : '82-85%'})`);
    }

    // OpenAI API Key チェック
    if (!c.env.OPENAI_API_KEY) {
      return c.json(
        {
          success: false,
          error: {
            message: 'OpenAI API key not configured',
            code: 'CONFIGURATION_ERROR',
          },
        },
        500
      );
    }

    // デバッグ: DB binding チェック
    console.log('[DEBUG] c.env.DB type:', typeof c.env.DB);
    console.log('[DEBUG] c.env.DB exists:', !!c.env.DB);
    console.log('[DEBUG] c.env.DB.prepare exists:', !!(c.env.DB && typeof c.env.DB.prepare === 'function'));
    
    if (!c.env.DB) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Database not configured',
            code: 'CONFIGURATION_ERROR',
          },
        },
        500
      );
    }

    // 問題生成
    const generator = new IntegratedQuestionGenerator(c.env.DB, c.env.OPENAI_API_KEY);
    const result = await generator.generateQuestion(body);

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: {
            message: result.error || 'Question generation failed',
            code: 'GENERATION_ERROR',
          },
          debug: {
            validation: result.validation,
            metadata: result.metadata,
          },
        },
        500
      );
    }

    return c.json({
      success: true,
      data: {
        question: result.question,
        blueprint: result.blueprint,
        topic_selection: result.topic_selection,
        validation: result.validation,
        metadata: result.metadata,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Question Generation Error]', error);
    return c.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
      },
      500
    );
  }
});

/**
 * GET /api/eiken/questions/list
 * 
 * 生徒の問題履歴を取得
 * 
 * NOTE: This route MUST be defined BEFORE /:id route to avoid path conflicts
 */
app.get('/list', async (c) => {
  try {
    const studentId = c.req.query('student_id'); // Note: 現在のスキーマには存在しない（将来的に追加予定）
    const grade = c.req.query('grade');
    const format = c.req.query('format');
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = parseInt(c.req.query('offset') || '0');

    // 注: student_id カラムは現在のスキーマに存在しないため、無視される
    // 将来的にスキーママイグレーションで追加予定
    if (studentId) {
      console.warn(`[LIST] student_id=${studentId} provided but column doesn't exist in schema`);
    }

    // クエリ構築
    let query = 'SELECT * FROM eiken_generated_questions WHERE 1=1';
    const params: any[] = [];

    if (grade) {
      query += ' AND grade = ?';
      params.push(grade);
    }

    if (format) {
      query += ' AND question_type = ?';
      params.push(format);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await c.env.DB
      .prepare(query)
      .bind(...params)
      .all();

    // 既存スキーマから question_data オブジェクトを再構築
    const questions = results.map((q: any) => {
      const choices = q.choices_json ? JSON.parse(q.choices_json) : [];
      const correctAnswer = q.correct_answer_text || 
                            (choices.length > 0 && q.correct_answer_index !== null 
                              ? choices[q.correct_answer_index] 
                              : null);
      
      // essay形式の場合、question_textにJSON全体が保存されている可能性があるためパース
      let questionDataContent: any = {};
      if (q.question_type === 'essay' && q.question_text.startsWith('{')) {
        try {
          questionDataContent = JSON.parse(q.question_text);
        } catch {
          questionDataContent = { question_text: q.question_text };
        }
      } else {
        questionDataContent = {
          question_text: q.question_text,
          passage: q.question_type === 'long_reading' || q.question_type === 'reading_aloud' 
                    ? q.question_text 
                    : undefined,
          choices: choices,
          correct_answer: correctAnswer,
          explanation: q.explanation || '',
          explanation_ja: q.explanation_ja || '',
        };
      }
      
      return {
        id: q.id,
        grade: q.grade,
        section: q.section,
        question_type: q.question_type,
        answer_type: q.answer_type,
        question_data: questionDataContent,
        difficulty_score: q.difficulty_score,
        quality_score: q.quality_score,
        model: q.model,
        created_at: q.created_at,
      };
    });

    return c.json({
      success: true,
      data: {
        questions,
        count: questions.length,
        limit,
        offset,
      },
      meta: {
        timestamp: new Date().toISOString(),
        filters: {
          student_id: studentId,
          grade: grade || 'all',
          format: format || 'all',
        },
      },
    });

  } catch (error) {
    console.error('[Question List Error]', error);
    return c.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
      },
      500
    );
  }
});

/**
 * GET /api/eiken/questions/:id
 * 
 * 保存された問題を取得
 * 
 * NOTE: This route MUST be defined AFTER /list route to avoid matching "/list" as an ID
 */
app.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');

    const question = await c.env.DB
      .prepare('SELECT * FROM eiken_generated_questions WHERE id = ?')
      .bind(id)
      .first();

    if (!question) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Question not found',
            code: 'NOT_FOUND',
          },
        },
        404
      );
    }

    // 既存スキーマから question_data オブジェクトを再構築
    const choices = question.choices_json ? JSON.parse(question.choices_json as string) : [];
    const correctAnswer = question.correct_answer_text || 
                          (choices.length > 0 && question.correct_answer_index !== null 
                            ? choices[question.correct_answer_index] 
                            : null);
    
    // essay形式の場合、question_textにJSON全体が保存されている可能性があるためパース
    let questionData: any;
    if (question.question_type === 'essay' && typeof question.question_text === 'string' && question.question_text.startsWith('{')) {
      try {
        questionData = JSON.parse(question.question_text);
      } catch {
        questionData = {
          question_text: question.question_text,
          explanation: question.explanation || '',
          explanation_ja: question.explanation_ja || '',
        };
      }
    } else {
      questionData = {
        question_text: question.question_text,
        passage: question.question_type === 'long_reading' || question.question_type === 'reading_aloud' 
                  ? question.question_text 
                  : undefined,
        choices: choices,
        correct_answer: correctAnswer,
        explanation: question.explanation || '',
        explanation_ja: question.explanation_ja || '',
      };
    }

    return c.json({
      success: true,
      data: {
        id: question.id,
        grade: question.grade,
        section: question.section,
        question_type: question.question_type,
        answer_type: question.answer_type,
        question_data: questionData,
        difficulty_score: question.difficulty_score,
        quality_score: question.quality_score,
        model: question.model,
        created_at: question.created_at,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('[Question Fetch Error]', error);
    return c.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
      },
      500
    );
  }
});

/**
 * GET /api/eiken/questions/test-db/:grade
 * 
 * 直接DBクエリテスト
 */
app.get('/test-db/:grade', async (c) => {
  try {
    const grade = c.req.param('grade');
    const db = c.env.DB;
    
    console.log(`[TEST-DB] Testing grade: ${grade}`);
    
    // Test 1: Count all topics for grade
    const countResult = await db
      .prepare('SELECT COUNT(*) as count FROM eiken_topic_areas WHERE grade = ?')
      .bind(grade)
      .first<{ count: number }>();
    
    console.log(`[TEST-DB] Count result:`, countResult);
    
    // Test 2: Get sample topics
    const sampleResult = await db
      .prepare('SELECT * FROM eiken_topic_areas WHERE grade = ? LIMIT 3')
      .bind(grade)
      .all();
    
    console.log(`[TEST-DB] Sample result:`, sampleResult);
    
    // Test 3: With is_active filter
    const activeResult = await db
      .prepare('SELECT * FROM eiken_topic_areas WHERE grade = ? AND is_active = 1')
      .bind(grade)
      .all();
    
    console.log(`[TEST-DB] Active result:`, activeResult);
    
    // Test 4: Topic Selector
    const { TopicSelector } = await import('../services/topic-selector');
    const selector = new TopicSelector(db);
    
    let selectorResult;
    try {
      selectorResult = await selector.selectTopic({
        student_id: 'test-db',
        grade: grade as any,
        question_type: 'grammar_fill',
      });
    } catch (error) {
      selectorResult = { error: error instanceof Error ? error.message : String(error) };
    }
    
    return c.json({
      success: true,
      grade,
      tests: {
        count: countResult,
        sample_count: sampleResult.results?.length || 0,
        sample: sampleResult.results,
        active_count: activeResult.results?.length || 0,
        active: activeResult.results,
        topic_selector: selectorResult,
      },
    });
    
  } catch (error) {
    console.error(`[TEST-DB] Error:`, error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }, 500);
  }
});

/**
 * POST /api/eiken/questions/test-all-grades
 * 
 * 全英検級のPhase 3問題生成をテスト
 * 語彙バリデーションと著作権チェックの動作を確認
 */
app.post('/test-all-grades', async (c) => {
  try {
    const grades: Array<'5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1'> = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];
    const results: any[] = [];
    
    console.log('🧪 Starting Phase 3 test for all grades...');
    
    const generator = new IntegratedQuestionGenerator(c.env.DB, c.env.OPENAI_API_KEY);
    
    for (const grade of grades) {
      const startTime = Date.now();
      
      try {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`Testing Grade: ${grade}`);
        console.log(`${'='.repeat(60)}`);
        
        const result = await generator.generateQuestion({
          student_id: 'test-all-grades',
          grade,
          format: 'grammar_fill',
          mode: 'practice',
        });
        
        const executionTime = Date.now() - startTime;
        
        results.push({
          grade,
          success: result.success,
          question_generated: !!result.question,
          vocabulary: {
            passed: result.validation?.vocabulary_passed || false,
            score: result.validation?.vocabulary_score || 0,
          },
          copyright: {
            passed: result.validation?.copyright_passed || false,
            score: result.validation?.copyright_score || 0,
          },
          attempts: result.attempts || 0,
          execution_time_ms: executionTime,
          error: result.error,
        });
        
        console.log(`✅ Grade ${grade} completed`);
        console.log(`   Vocabulary: ${result.validation?.vocabulary_score}% (${result.validation?.vocabulary_passed ? 'PASS' : 'FAIL'})`);
        console.log(`   Copyright: ${result.validation?.copyright_score}/100 (${result.validation?.copyright_passed ? 'PASS' : 'FAIL'})`);
        console.log(`   Attempts: ${result.attempts}`);
        console.log(`   Time: ${executionTime}ms`);
        
      } catch (error) {
        const executionTime = Date.now() - startTime;
        console.error(`❌ Error testing grade ${grade}:`, error);
        
        results.push({
          grade,
          success: false,
          question_generated: false,
          vocabulary: { passed: false, score: 0 },
          copyright: { passed: false, score: 0 },
          attempts: 0,
          execution_time_ms: executionTime,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      
      // 次のテストまで待機（レート制限回避）
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    // 統計計算
    const successCount = results.filter(r => r.success).length;
    const vocabPassCount = results.filter(r => r.vocabulary.passed).length;
    const copyrightPassCount = results.filter(r => r.copyright.passed).length;
    const avgVocabScore = results.reduce((sum, r) => sum + r.vocabulary.score, 0) / results.length;
    const avgCopyrightScore = results.reduce((sum, r) => sum + r.copyright.score, 0) / results.length;
    const avgTime = results.reduce((sum, r) => sum + r.execution_time_ms, 0) / results.length;
    
    return c.json({
      success: true,
      test_completed: new Date().toISOString(),
      results,
      summary: {
        total_grades_tested: results.length,
        success_count: successCount,
        success_rate: `${(successCount / results.length * 100).toFixed(1)}%`,
        vocabulary_pass_rate: `${(vocabPassCount / results.length * 100).toFixed(1)}%`,
        copyright_pass_rate: `${(copyrightPassCount / results.length * 100).toFixed(1)}%`,
        avg_vocabulary_score: `${avgVocabScore.toFixed(1)}%`,
        avg_copyright_score: `${avgCopyrightScore.toFixed(1)}/100`,
        avg_execution_time_ms: Math.round(avgTime),
      },
    });
    
  } catch (error) {
    console.error('[Test All Grades Error]', error);
    return c.json(
      {
        success: false,
        error: {
          message: error instanceof Error ? error.message : 'Unknown error',
          code: 'INTERNAL_ERROR',
        },
      },
      500
    );
  }
});

export default app;
