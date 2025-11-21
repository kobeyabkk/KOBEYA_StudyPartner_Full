/**
 * Phase 2C: Blueprint Generation API Routes
 * 
 * Endpoints:
 * - POST /api/eiken/blueprints/generate - Generate blueprint
 */

import { Hono } from 'hono';
import { BlueprintGenerator } from '../services/blueprint-generator';
import type { EikenEnv, BlueprintGenerationOptions } from '../types';

const app = new Hono<{ Bindings: EikenEnv }>();

/**
 * POST /api/eiken/blueprints/generate
 * Generate a question blueprint
 */
app.post('/generate', async (c) => {
  try {
    const body = await c.req.json<BlueprintGenerationOptions>();

    // Validate required fields
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

    // Validate format
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

    const generator = new BlueprintGenerator(c.env.DB);
    const result = await generator.generateBlueprint(body);

    return c.json({
      success: true,
      data: result,
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Blueprint generation error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to generate blueprint',
          code: 'GENERATION_ERROR',
        },
      },
      500
    );
  }
});

/**
 * GET /api/eiken/blueprints/formats
 * Get available question formats
 */
app.get('/formats', async (c) => {
  try {
    const formats = [
      {
        code: 'grammar_fill',
        name: 'Grammar Fill-in-the-Blank',
        description: 'Complete sentences with appropriate grammar forms',
        time_limit: 2,
      },
      {
        code: 'opinion_speech',
        name: 'Opinion Speech',
        description: 'Express opinion on a given topic with supporting reasons',
        time_limit: 1.5,
      },
      {
        code: 'reading_aloud',
        name: 'Reading Aloud',
        description: 'Read a short passage aloud with correct pronunciation',
        time_limit: 1,
      },
      {
        code: 'long_reading',
        name: 'Long Reading Comprehension',
        description: 'Read passage and answer comprehension questions',
        time_limit: 15,
      },
      {
        code: 'essay',
        name: 'Essay Writing',
        description: 'Write a structured essay on a given topic',
        time_limit: 25,
      },
    ];

    return c.json({
      success: true,
      data: {
        formats,
        count: formats.length,
      },
      meta: {
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Get formats error:', error);
    return c.json(
      {
        success: false,
        error: {
          message: error.message || 'Failed to get formats',
          code: 'FETCH_ERROR',
        },
      },
      500
    );
  }
});

export default app;
