/**
 * Phase 4A: Vocabulary API Routes
 * 
 * RESTful API endpoints for vocabulary learning system
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Context } from 'hono';
import { VocabularyService } from '../services/vocabulary-service';
import { UserProgressService } from '../services/user-progress-service';
import { ReviewScheduleService } from '../services/review-schedule-service';
import { SM2Algorithm } from '../services/sm2-algorithm';
import type {
  AddVocabularyRequest,
  SubmitReviewRequest,
  TodayReviewResponse,
  EikenGrade
} from '../types/vocabulary';

interface Env {
  DB: D1Database;
  KV: KVNamespace;
}

const app = new Hono<{ Bindings: Env }>();

// CORS middleware
app.use('*', cors());

// ============================================================================
// GET /api/vocabulary/word/:wordId
// Get vocabulary word details by ID
// ============================================================================
app.get('/word/:wordId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const wordId = parseInt(c.req.param('wordId'));
    
    if (isNaN(wordId)) {
      return c.json({ error: 'Invalid word ID' }, 400);
    }
    
    const vocabularyService = new VocabularyService(c.env.DB);
    const word = await vocabularyService.getById(wordId);
    
    if (!word) {
      return c.json({ error: 'Word not found' }, 404);
    }
    
    return c.json({ word });
  } catch (error) {
    console.error('Error getting word:', error);
    return c.json({ error: 'Failed to get word' }, 500);
  }
});

// ============================================================================
// GET /api/vocabulary/search
// Search vocabulary words
// Query params: q, cefrLevel, eikenGrade, minDifficulty, maxDifficulty, page, pageSize
// ============================================================================
app.get('/search', async (c: Context<{ Bindings: Env }>) => {
  try {
    const query = c.req.query('q') || '';
    const cefrLevel = c.req.query('cefrLevel');
    const eikenGrade = c.req.query('eikenGrade');
    const minDifficulty = c.req.query('minDifficulty');
    const maxDifficulty = c.req.query('maxDifficulty');
    const page = parseInt(c.req.query('page') || '1');
    const pageSize = parseInt(c.req.query('pageSize') || '20');
    
    const vocabularyService = new VocabularyService(c.env.DB);
    const results = await vocabularyService.search(
      query,
      {
        cefrLevel: cefrLevel as any,
        eikenGrade: eikenGrade as any,
        minDifficulty: minDifficulty ? parseFloat(minDifficulty) : undefined,
        maxDifficulty: maxDifficulty ? parseFloat(maxDifficulty) : undefined
      },
      page,
      pageSize
    );
    
    return c.json(results);
  } catch (error) {
    console.error('Error searching vocabulary:', error);
    return c.json({ error: 'Failed to search vocabulary' }, 500);
  }
});

// ============================================================================
// POST /api/vocabulary/add
// Add word to user's vocabulary notebook
// Body: { userId, wordId, sourceContext? }
// ============================================================================
app.post('/add', async (c: Context<{ Bindings: Env }>) => {
  try {
    const body = await c.req.json<AddVocabularyRequest>();
    
    if (!body.userId || !body.wordId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const progressService = new UserProgressService(c.env.DB);
    const progressId = await progressService.addWord(
      body.userId,
      body.wordId,
      body.sourceContext
    );
    
    // Get the created progress
    const progress = await progressService.getProgress(body.userId, body.wordId);
    
    return c.json({ 
      success: true, 
      progressId,
      progress 
    });
  } catch (error) {
    console.error('Error adding vocabulary:', error);
    return c.json({ error: 'Failed to add vocabulary' }, 500);
  }
});

// ============================================================================
// GET /api/vocabulary/progress/:userId
// Get user's vocabulary progress
// Query params: status, minMasteryLevel, maxMasteryLevel
// ============================================================================
app.get('/progress/:userId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    const status = c.req.query('status');
    const minMasteryLevel = c.req.query('minMasteryLevel');
    const maxMasteryLevel = c.req.query('maxMasteryLevel');
    
    const progressService = new UserProgressService(c.env.DB);
    const progress = await progressService.getAllProgress(userId, {
      status: status as any,
      minMasteryLevel: minMasteryLevel ? parseInt(minMasteryLevel) : undefined,
      maxMasteryLevel: maxMasteryLevel ? parseInt(maxMasteryLevel) : undefined
    });
    
    // Get word details for each progress entry
    const vocabularyService = new VocabularyService(c.env.DB);
    const wordIds = progress.map(p => p.wordId);
    const words = await vocabularyService.getByIds(wordIds);
    
    // Create a map for quick lookup
    const wordMap = new Map(words.map(w => [w.id, w]));
    
    // Combine progress with word details
    const combined = progress.map(p => ({
      progress: p,
      word: wordMap.get(p.wordId)
    }));
    
    return c.json({ items: combined });
  } catch (error) {
    console.error('Error getting progress:', error);
    return c.json({ error: 'Failed to get progress' }, 500);
  }
});

// ============================================================================
// GET /api/vocabulary/review/today/:userId
// Get today's review schedule
// ============================================================================
app.get('/review/today/:userId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    
    const progressService = new UserProgressService(c.env.DB);
    const reviewScheduleService = new ReviewScheduleService(c.env.DB);
    const vocabularyService = new VocabularyService(c.env.DB);
    
    // Get due words
    const dueProgress = await progressService.getDueWords(userId);
    
    // Get word details
    const wordIds = dueProgress.map(p => p.wordId);
    const words = await vocabularyService.getByIds(wordIds);
    const wordMap = new Map(words.map(w => [w.id, w]));
    
    // Combine
    const dueWords = dueProgress.map(p => ({
      word: wordMap.get(p.wordId)!,
      progress: p
    }));
    
    // Get summary
    const summary = await reviewScheduleService.getTodaySummary(userId);
    
    const response: TodayReviewResponse = {
      summary,
      dueWords,
      newWords: [] // TODO: Implement new word recommendations
    };
    
    return c.json(response);
  } catch (error) {
    console.error('Error getting today review:', error);
    return c.json({ error: 'Failed to get today review' }, 500);
  }
});

// ============================================================================
// POST /api/vocabulary/review/submit
// Submit review result
// Body: { userId, wordId, quality, responseTimeMs? }
// ============================================================================
app.post('/review/submit', async (c: Context<{ Bindings: Env }>) => {
  try {
    const body = await c.req.json<SubmitReviewRequest>();
    
    if (!body.userId || !body.wordId || body.quality === undefined) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    if (body.quality < 0 || body.quality > 5) {
      return c.json({ error: 'Quality must be between 0 and 5' }, 400);
    }
    
    // Get user's age/grade for age multiplier
    // TODO: Get from user profile
    const ageMultiplier = SM2Algorithm.getAgeMultiplier(undefined, 'grade-3' as EikenGrade);
    
    // Get exam date for exam multiplier
    // TODO: Get from user profile
    const examMultiplier = SM2Algorithm.getExamDrivenMultiplier(undefined);
    
    const progressService = new UserProgressService(c.env.DB);
    const updatedProgress = await progressService.submitReview(
      body.userId,
      body.wordId,
      {
        quality: body.quality,
        responseTimeMs: body.responseTimeMs
      },
      ageMultiplier,
      examMultiplier
    );
    
    return c.json({
      success: true,
      progress: updatedProgress
    });
  } catch (error) {
    console.error('Error submitting review:', error);
    return c.json({ error: 'Failed to submit review' }, 500);
  }
});

// ============================================================================
// GET /api/vocabulary/statistics/:userId
// Get learning statistics
// ============================================================================
app.get('/statistics/:userId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    
    const progressService = new UserProgressService(c.env.DB);
    const reviewScheduleService = new ReviewScheduleService(c.env.DB);
    
    const stats = await progressService.getStatistics(userId);
    const streakData = await reviewScheduleService.getStreakData(userId);
    
    return c.json({
      ...stats,
      ...streakData
    });
  } catch (error) {
    console.error('Error getting statistics:', error);
    return c.json({ error: 'Failed to get statistics' }, 500);
  }
});

// ============================================================================
// PUT /api/vocabulary/note/:userId/:wordId
// Update user note for a word
// Body: { note }
// ============================================================================
app.put('/note/:userId/:wordId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    const wordId = parseInt(c.req.param('wordId'));
    const body = await c.req.json<{ note: string }>();
    
    if (isNaN(wordId)) {
      return c.json({ error: 'Invalid word ID' }, 400);
    }
    
    const progressService = new UserProgressService(c.env.DB);
    await progressService.updateNote(userId, wordId, body.note);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating note:', error);
    return c.json({ error: 'Failed to update note' }, 500);
  }
});

// ============================================================================
// PUT /api/vocabulary/mnemonic/:userId/:wordId
// Update mnemonic for a word
// Body: { mnemonic }
// ============================================================================
app.put('/mnemonic/:userId/:wordId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    const wordId = parseInt(c.req.param('wordId'));
    const body = await c.req.json<{ mnemonic: string }>();
    
    if (isNaN(wordId)) {
      return c.json({ error: 'Invalid word ID' }, 400);
    }
    
    const progressService = new UserProgressService(c.env.DB);
    await progressService.updateMnemonic(userId, wordId, body.mnemonic);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error updating mnemonic:', error);
    return c.json({ error: 'Failed to update mnemonic' }, 500);
  }
});

// ============================================================================
// POST /api/vocabulary/archive/:userId/:wordId
// Archive a word
// ============================================================================
app.post('/archive/:userId/:wordId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    const wordId = parseInt(c.req.param('wordId'));
    
    if (isNaN(wordId)) {
      return c.json({ error: 'Invalid word ID' }, 400);
    }
    
    const progressService = new UserProgressService(c.env.DB);
    await progressService.archiveWord(userId, wordId);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error archiving word:', error);
    return c.json({ error: 'Failed to archive word' }, 500);
  }
});

// ============================================================================
// POST /api/vocabulary/unarchive/:userId/:wordId
// Unarchive a word
// ============================================================================
app.post('/unarchive/:userId/:wordId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    const wordId = parseInt(c.req.param('wordId'));
    
    if (isNaN(wordId)) {
      return c.json({ error: 'Invalid word ID' }, 400);
    }
    
    const progressService = new UserProgressService(c.env.DB);
    await progressService.unarchiveWord(userId, wordId);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('Error unarchiving word:', error);
    return c.json({ error: 'Failed to unarchive word' }, 500);
  }
});

// ============================================================================
// GET /api/vocabulary/mastered/:userId
// Get mastered words
// ============================================================================
app.get('/mastered/:userId', async (c: Context<{ Bindings: Env }>) => {
  try {
    const userId = c.req.param('userId');
    
    const progressService = new UserProgressService(c.env.DB);
    const vocabularyService = new VocabularyService(c.env.DB);
    
    const masteredProgress = await progressService.getMasteredWords(userId);
    
    // Get word details
    const wordIds = masteredProgress.map(p => p.wordId);
    const words = await vocabularyService.getByIds(wordIds);
    const wordMap = new Map(words.map(w => [w.id, w]));
    
    const items = masteredProgress.map(p => ({
      progress: p,
      word: wordMap.get(p.wordId)
    }));
    
    return c.json({ items });
  } catch (error) {
    console.error('Error getting mastered words:', error);
    return c.json({ error: 'Failed to get mastered words' }, 500);
  }
});

export default app;
