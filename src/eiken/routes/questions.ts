/**
 * Phase 3: Question Generation API Routes
 * 
 * 統合問題生成エンドポイント
 */

import { Hono } from 'hono';
import type { EikenEnv, QuestionGenerationRequest } from '../types';
import { IntegratedQuestionGenerator } from '../services/integrated-question-generator';

const app = new Hono<{ Bindings: EikenEnv }>();

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

    // 有効な形式かチェック
    const validFormats = ['grammar_fill', 'opinion_speech', 'reading_aloud', 'long_reading', 'essay'];
    if (!validFormats.includes(body.format)) {
      return c.json(
        {
          success: false,
          error: {
            message: `Invalid format. Must be one of: ${validFormats.join(', ')}`,
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
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
 * GET /api/eiken/questions/:id
 * 
 * 保存された問題を取得
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

    // question_dataをパース
    const questionData = {
      ...question,
      question_data: JSON.parse(question.question_data as string),
    };

    return c.json({
      success: true,
      data: questionData,
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
 * GET /api/eiken/questions/list
 * 
 * 生徒の問題履歴を取得
 */
app.get('/list', async (c) => {
  try {
    const studentId = c.req.query('student_id');
    const grade = c.req.query('grade');
    const format = c.req.query('format');
    const limit = parseInt(c.req.query('limit') || '10');
    const offset = parseInt(c.req.query('offset') || '0');

    if (!studentId) {
      return c.json(
        {
          success: false,
          error: {
            message: 'student_id is required',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    // クエリ構築
    let query = 'SELECT * FROM eiken_generated_questions WHERE student_id = ?';
    const params: any[] = [studentId];

    if (grade) {
      query += ' AND grade = ?';
      params.push(grade);
    }

    if (format) {
      query += ' AND format = ?';
      params.push(format);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const { results } = await c.env.DB
      .prepare(query)
      .bind(...params)
      .all();

    // question_dataをパース
    const questions = results.map((q: any) => ({
      ...q,
      question_data: JSON.parse(q.question_data),
    }));

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

export default app;
