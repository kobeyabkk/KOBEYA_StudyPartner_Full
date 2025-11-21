/**
 * Phase 2B: Topic Selection API Routes
 * 
 * Endpoints:
 * - POST /api/eiken/topics/select - Select a topic
 * - POST /api/eiken/topics/record - Record topic usage
 * - POST /api/eiken/topics/blacklist - Add to blacklist
 * - POST /api/eiken/topics/success - Record successful completion
 * - GET /api/eiken/topics/stats - Get topic statistics
 */

import { Hono } from 'hono';
import { TopicSelector } from '../services/topic-selector';
import type { EikenEnv, TopicSelectionOptions, BlacklistReason } from '../types';

const app = new Hono<{ Bindings: EikenEnv }>();

/**
 * POST /api/eiken/topics/select
 * Select a topic using intelligent selection algorithm
 */
app.post('/select', async (c) => {
  try {
    const body = await c.req.json<TopicSelectionOptions>();

    // Validate required fields
    if (!body.student_id || !body.grade || !body.question_type) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing required fields: student_id, grade, question_type',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    const selector = new TopicSelector(c.env.DB);
    const result = await selector.selectTopic(body);

    return c.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Topic selection error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to select topic',
          code: 'SELECTION_ERROR',
        },
      },
      500
    );
  }
});

/**
 * POST /api/eiken/topics/record
 * Record topic usage for LRU tracking
 */
app.post('/record', async (c) => {
  try {
    const body = await c.req.json<{
      student_id: string;
      grade: string;
      topic_code: string;
      question_type: string;
      session_id?: string;
    }>();

    if (!body.student_id || !body.grade || !body.topic_code || !body.question_type) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing required fields',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    const selector = new TopicSelector(c.env.DB);
    await selector.recordTopicUsage(
      body.student_id,
      body.grade as any,
      body.topic_code,
      body.question_type,
      body.session_id
    );

    return c.json({
      success: true,
      data: {
        message: 'Topic usage recorded successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Record usage error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to record usage',
          code: 'RECORD_ERROR',
        },
      },
      500
    );
  }
});

/**
 * POST /api/eiken/topics/blacklist
 * Add topic to blacklist with dynamic TTL
 */
app.post('/blacklist', async (c) => {
  try {
    const body = await c.req.json<{
      student_id: string;
      grade: string;
      topic_code: string;
      question_type: string;
      reason: BlacklistReason;
    }>();

    if (!body.student_id || !body.grade || !body.topic_code || !body.question_type || !body.reason) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing required fields',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    const selector = new TopicSelector(c.env.DB);
    await selector.addToBlacklist(
      body.student_id,
      body.grade as any,
      body.topic_code,
      body.question_type,
      body.reason
    );

    return c.json({
      success: true,
      data: {
        message: 'Topic added to blacklist successfully',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Blacklist error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to add to blacklist',
          code: 'BLACKLIST_ERROR',
        },
      },
      500
    );
  }
});

/**
 * POST /api/eiken/topics/success
 * Record successful topic completion
 */
app.post('/success', async (c) => {
  try {
    const body = await c.req.json<{
      student_id: string;
      grade: string;
      topic_code: string;
      question_type: string;
      completion_time_ms?: number;
    }>();

    if (!body.student_id || !body.grade || !body.topic_code || !body.question_type) {
      return c.json(
        {
          success: false,
          error: {
            message: 'Missing required fields',
            code: 'VALIDATION_ERROR',
          },
        },
        400
      );
    }

    const selector = new TopicSelector(c.env.DB);
    await selector.recordSuccess(
      body.student_id,
      body.grade as any,
      body.topic_code,
      body.question_type,
      body.completion_time_ms
    );

    return c.json({
      success: true,
      data: {
        message: 'Success recorded',
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Record success error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to record success',
          code: 'SUCCESS_RECORD_ERROR',
        },
      },
      500
    );
  }
});

/**
 * GET /api/eiken/topics/stats
 * Get topic statistics
 */
app.get('/stats', async (c) => {
  try {
    const grade = c.req.query('grade');
    const questionType = c.req.query('question_type');

    const selector = new TopicSelector(c.env.DB);
    const stats = await selector.getTopicStatistics(
      grade as any,
      questionType
    );

    return c.json({
      success: true,
      data: {
        statistics: stats,
        count: stats.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
        filters: {
          grade: grade || 'all',
          question_type: questionType || 'all',
        },
      },
    });
  } catch (error: any) {
    console.error('Get stats error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to get statistics',
          code: 'STATS_ERROR',
        },
      },
      500
    );
  }
});

export default app;
