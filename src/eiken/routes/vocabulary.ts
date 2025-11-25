/**
 * Phase 4B: Vocabulary API Routes
 * 
 * Vocabulary notebook management endpoints
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import { VocabularyDefinitionGenerator } from '../services/vocabulary-definition-generator';

type Bindings = {
  OPENAI_API_KEY: string;
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>();

/**
 * POST /api/vocabulary/add
 * 
 * Add word to user's vocabulary notebook
 */
app.post('/add', async (c) => {
  try {
    const body = await c.req.json();
    const { user_id, word_id, source_context } = body;

    // Validation
    if (!user_id || !word_id) {
      return c.json(
        {
          success: false,
          error: 'Missing required fields: user_id, word_id',
        },
        400
      );
    }

    // Check if database is available
    if (!c.env.DB) {
      return c.json(
        {
          success: false,
          error: 'Database not configured',
        },
        500
      );
    }

    const db = c.env.DB;

    // Check if word already exists in user's notebook
    const existing = await db
      .prepare(
        'SELECT id FROM user_vocabulary_progress WHERE user_id = ? AND word_id = ?'
      )
      .bind(user_id, word_id)
      .first();

    if (existing) {
      return c.json({
        success: true,
        message: 'Word already in vocabulary notebook',
        already_exists: true,
      });
    }

    // Get word details
    // Note: eiken_vocabulary_lexicon uses ROWID as primary key
    const word = await db
      .prepare('SELECT ROWID as id, * FROM eiken_vocabulary_lexicon WHERE ROWID = ?')
      .bind(word_id)
      .first();

    if (!word) {
      return c.json(
        {
          success: false,
          error: 'Word not found',
        },
        404
      );
    }

    // Insert new vocabulary progress entry with SM-2 defaults
    const now = new Date().toISOString();
    const nextReviewDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // Tomorrow

    await db
      .prepare(
        `INSERT INTO user_vocabulary_progress (
          user_id,
          word_id,
          status,
          mastery_level,
          recognition_score,
          recall_score,
          production_score,
          easiness_factor,
          interval_days,
          repetitions,
          next_review_date,
          first_encountered_at,
          total_reviews,
          correct_reviews,
          source_context,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        user_id,
        word_id,
        'learning',
        0, // mastery_level: starting from 0
        0, // recognition_score
        0, // recall_score
        0, // production_score
        2.5, // easiness_factor: SM-2 default
        1, // interval_days: initial interval
        0, // repetitions
        nextReviewDate,
        now, // first_encountered_at
        0, // total_reviews
        0, // correct_reviews
        source_context ? JSON.stringify(source_context) : null,
        now,
        now
      )
      .run();

    // Update statistics
    await db
      .prepare(
        `INSERT INTO vocabulary_learning_stats (
          user_id,
          total_words_encountered,
          total_words_learning,
          last_study_date,
          last_calculated_at,
          updated_at
        ) VALUES (?, 1, 1, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          total_words_encountered = total_words_encountered + 1,
          total_words_learning = total_words_learning + 1,
          last_study_date = ?,
          updated_at = ?`
      )
      .bind(user_id, now, now, now, now, now)
      .run();

    console.log(`✅ Added word ${word_id} to ${user_id}'s vocabulary notebook`);

    return c.json({
      success: true,
      message: 'Word added to vocabulary notebook successfully',
      word_id,
      next_review_date: nextReviewDate,
    });

  } catch (error) {
    console.error('[Vocabulary Add Error]', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: error instanceof Error ? error.stack : undefined,
      },
      500
    );
  }
});

/**
 * GET /api/vocabulary/progress/:user_id
 * 
 * Get user's vocabulary progress
 */
app.get('/progress/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!c.env.DB) {
      return c.json(
        {
          success: false,
          error: 'Database not configured',
        },
        500
      );
    }

    const db = c.env.DB;

    // Get user's vocabulary progress with word details
    // Note: Database uses word_lemma (not headword) and pos (not pos_tags)
    const result = await db
      .prepare(
        `SELECT 
          uvp.*,
          vm.word_lemma as word,
          vm.pos as pos,
          vm.definition_en,
          vm.definition_ja,
          vm.cefr_level,
          vm.final_difficulty_score
        FROM user_vocabulary_progress uvp
        JOIN eiken_vocabulary_lexicon vm ON uvp.word_id = vm.ROWID
        WHERE uvp.user_id = ?
        ORDER BY uvp.created_at DESC`
      )
      .bind(userId)
      .all();

    const items = result.results || [];

    return c.json({
      success: true,
      items: items.map((item: any) => ({
        progress: {
          id: item.id,
          userId: item.user_id,
          wordId: item.word_id,
          easinessFactor: item.easiness_factor,
          intervalDays: item.interval_days,
          repetitions: item.repetitions,
          nextReviewDate: new Date(item.next_review_date),
          masteryLevel: item.mastery_level,
          recognitionScore: item.recognition_score,
          recallScore: item.recall_score,
          productionScore: item.production_score,
          firstEncounteredAt: new Date(item.first_encountered_at),
          lastReviewedAt: item.last_reviewed_at ? new Date(item.last_reviewed_at) : undefined,
          totalReviews: item.total_reviews,
          correctReviews: item.correct_reviews,
          status: item.status,
        },
        word: {
          id: item.word_id,
          word: item.word,
          pos: item.pos,
          definitionEn: item.definition_en,
          definitionJa: item.definition_ja,
          cefrLevel: item.cefr_level,
          finalDifficultyScore: item.final_difficulty_score,
        },
      })),
    });

  } catch (error) {
    console.error('[Vocabulary Progress Error]', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * GET /api/vocabulary/statistics/:user_id
 * 
 * Get user's vocabulary statistics
 */
app.get('/statistics/:user_id', async (c) => {
  try {
    const userId = c.req.param('user_id');

    if (!c.env.DB) {
      return c.json(
        {
          success: false,
          error: 'Database not configured',
        },
        500
      );
    }

    const db = c.env.DB;

    // Get statistics
    const stats = await db
      .prepare('SELECT * FROM vocabulary_learning_stats WHERE user_id = ?')
      .bind(userId)
      .first();

    if (!stats) {
      // Return default empty stats
      return c.json({
        totalWords: 0,
        learningWords: 0,
        masteredWords: 0,
        dueToday: 0,
        avgMasteryLevel: 0,
        overallAccuracy: 0,
        currentStreak: 0,
        longestStreak: 0,
      });
    }

    // Count due reviews
    const dueCount = await db
      .prepare(
        `SELECT COUNT(*) as count 
         FROM user_vocabulary_progress 
         WHERE user_id = ? AND next_review_date <= datetime('now')`
      )
      .bind(userId)
      .first();

    return c.json({
      totalWords: stats.total_words_encountered || 0,
      learningWords: stats.total_words_learning || 0,
      masteredWords: stats.total_words_mastered || 0,
      dueToday: dueCount?.count || 0,
      avgMasteryLevel: 0, // TODO: Calculate from progress data
      overallAccuracy: stats.overall_accuracy || 0,
      currentStreak: stats.current_study_streak_days || 0,
      longestStreak: stats.longest_study_streak_days || 0,
    });

  } catch (error) {
    console.error('[Vocabulary Statistics Error]', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    );
  }
});

/**
 * POST /api/vocabulary/define
 * 
 * Generate or retrieve definition for a word
 */
app.post('/define', async (c) => {
  try {
    const body = await c.req.json();
    const { word, pos, cefr_level } = body;

    // Validation
    if (!word || !pos) {
      return c.json(
        {
          success: false,
          error: 'Missing required fields: word, pos',
        },
        400
      );
    }

    // Check if database and OpenAI API key are available
    if (!c.env.DB || !c.env.OPENAI_API_KEY) {
      return c.json(
        {
          success: false,
          error: 'Service not properly configured',
        },
        500
      );
    }

    const generator = new VocabularyDefinitionGenerator(c.env.DB, c.env.OPENAI_API_KEY);

    // Get or generate definition
    const definition = await generator.getOrGenerateDefinition(
      word,
      pos,
      cefr_level || 'B1'
    );

    console.log(`✅ Definition retrieved/generated for: ${word}`);

    return c.json({
      success: true,
      definition,
    });

  } catch (error) {
    console.error('[Vocabulary Define Error]', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate definition',
        fallback: {
          definition_ja: '定義準備中...',
          definition_en: 'Definition pending...',
        },
      },
      500
    );
  }
});

/**
 * POST /api/vocabulary/define/batch
 * 
 * Generate definitions for multiple words
 */
app.post('/define/batch', async (c) => {
  try {
    const body = await c.req.json();
    const { words } = body;

    // Validation
    if (!words || !Array.isArray(words) || words.length === 0) {
      return c.json(
        {
          success: false,
          error: 'Missing required field: words (array)',
        },
        400
      );
    }

    // Check if database and OpenAI API key are available
    if (!c.env.DB || !c.env.OPENAI_API_KEY) {
      return c.json(
        {
          success: false,
          error: 'Service not properly configured',
        },
        500
      );
    }

    const generator = new VocabularyDefinitionGenerator(c.env.DB, c.env.OPENAI_API_KEY);

    // Process each word
    const results = [];
    for (const wordInfo of words) {
      try {
        const definition = await generator.getOrGenerateDefinition(
          wordInfo.word,
          wordInfo.pos,
          wordInfo.cefr_level || 'B1'
        );
        results.push({
          success: true,
          word: wordInfo.word,
          definition,
        });
      } catch (error) {
        console.error(`Failed to process word ${wordInfo.word}:`, error);
        results.push({
          success: false,
          word: wordInfo.word,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    console.log(`✅ Batch processing completed: ${results.length} words`);

    return c.json({
      success: true,
      results,
      total: words.length,
      succeeded: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
    });

  } catch (error) {
    console.error('[Vocabulary Batch Define Error]', error);
    return c.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to process batch',
      },
      500
    );
  }
});

export default app;
