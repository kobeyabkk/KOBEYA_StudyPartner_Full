import { Hono } from 'hono'
import { VocabularyService } from '../../handlers/vocabulary/vocabulary-service'
import { SM2Algorithm } from '../../handlers/vocabulary/sm2-algorithm'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()
const vocabularyService = new VocabularyService()

/**
 * GET /api/vocabulary/search?word=example
 * 指定された単語の語彙情報を取得
 */
router.get('/search', async (c) => {
  const word = c.req.query('word')
  
  if (!word) {
    return c.json({ error: 'word parameter is required' }, 400)
  }

  try {
    const result = await c.env.DB.prepare(
      `SELECT 
        word, pos, cefr_level, cefr_numeric, eiken_grade,
        zipf_score, frequency_rank, final_difficulty_score,
        should_annotate, definition_en, definition_ja,
        example_sentences, collocations
       FROM vocabulary_master 
       WHERE LOWER(word) = LOWER(?)
       LIMIT 1`
    ).bind(word).first()

    if (!result) {
      return c.json({ error: 'Word not found' }, 404)
    }

    return c.json({
      success: true,
      data: result
    })
  } catch (error) {
    console.error('Vocabulary search error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * POST /api/vocabulary/generate-definition
 * LLMを使って日本語定義を生成
 */
router.post('/generate-definition', async (c) => {
  const { word, cefr_level } = await c.req.json()

  if (!word) {
    return c.json({ error: 'word is required' }, 400)
  }

  try {
    // OpenAI API を使って日本語定義を生成
    const prompt = `日本人英語学習者（${cefr_level || 'B1'}レベル）向けに、以下の英単語の簡潔な日本語定義を生成してください。

要件:
- 15文字以内
- 最も一般的な意味のみ
- 専門用語は避ける
- 例: "environment" → "環境"

英単語: ${word}

日本語定義:`

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${c.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: '日本人英語学習者向けの簡潔な語彙定義を生成するアシスタントです。' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 50
      })
    })

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`)
    }

    const data = await response.json()
    const definition_ja = data.choices[0].message.content.trim()

    // DBに保存
    await c.env.DB.prepare(
      `UPDATE vocabulary_master 
       SET definition_ja = ?, 
           definition_cached_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE LOWER(word) = LOWER(?)`
    ).bind(definition_ja, word).run()

    return c.json({
      success: true,
      word,
      definition_ja
    })
  } catch (error) {
    console.error('Definition generation error:', error)
    return c.json({ 
      error: 'Failed to generate definition',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * POST /api/vocabulary/annotate-text
 * テキスト中の難易度の高い単語に語注を付ける
 */
router.post('/annotate-text', async (c) => {
  const { text, difficulty_threshold = 60 } = await c.req.json()

  if (!text) {
    return c.json({ error: 'text is required' }, 400)
  }

  try {
    // 単語を抽出（簡易版：正規表現）
    const words = text.toLowerCase().match(/\b[a-z]+\b/g) || []
    const uniqueWords = [...new Set(words)]

    // 語注が必要な単語を取得
    const placeholders = uniqueWords.map(() => '?').join(',')
    const query = `
      SELECT word, cefr_level, final_difficulty_score, definition_ja
      FROM vocabulary_master
      WHERE LOWER(word) IN (${placeholders})
      AND final_difficulty_score >= ?
    `

    const result = await c.env.DB.prepare(query)
      .bind(...uniqueWords, difficulty_threshold)
      .all()

    const annotations = result.results || []

    // 定義が無い語注候補をリストアップ
    const needsGeneration = annotations.filter(a => !a.definition_ja)

    return c.json({
      success: true,
      annotationCount: annotations.length,
      annotations,
      needsGeneration: needsGeneration.map(a => a.word)
    })
  } catch (error) {
    console.error('Text annotation error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * GET /api/vocabulary/stats
 * 語彙データベースの統計情報
 */
router.get('/stats', async (c) => {
  try {
    const totalQuery = await c.env.DB.prepare(
      'SELECT COUNT(*) as total FROM vocabulary_master'
    ).first()

    const withDefinitionQuery = await c.env.DB.prepare(
      `SELECT COUNT(*) as count FROM vocabulary_master 
       WHERE definition_ja IS NOT NULL AND definition_ja != ''`
    ).first()

    const annotationCandidatesQuery = await c.env.DB.prepare(
      'SELECT COUNT(*) as count FROM vocabulary_master WHERE should_annotate = 1'
    ).first()

    const cefrDistribution = await c.env.DB.prepare(
      `SELECT cefr_level, COUNT(*) as count 
       FROM vocabulary_master 
       GROUP BY cefr_level 
       ORDER BY cefr_numeric`
    ).all()

    return c.json({
      success: true,
      stats: {
        totalWords: totalQuery?.total || 0,
        withDefinition: withDefinitionQuery?.count || 0,
        needsDefinition: (totalQuery?.total || 0) - (withDefinitionQuery?.count || 0),
        annotationCandidates: annotationCandidatesQuery?.count || 0,
        cefrDistribution: cefrDistribution.results
      }
    })
  } catch (error) {
    console.error('Stats error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// ========================================
// 語彙ノート (Phase 4A) API
// ========================================

/**
 * POST /api/vocabulary/notebook/add
 * 語彙ノートに単語を追加
 */
router.post('/notebook/add', async (c) => {
  try {
    const { user_id, word_id, source_context, source_passage_id } = await c.req.json()

    if (!user_id || !word_id) {
      return c.json({ error: 'user_id and word_id are required' }, 400)
    }

    const progress = await vocabularyService.addWordToUserProgress(
      c.env.DB,
      user_id,
      word_id,
      source_context,
      source_passage_id
    )

    return c.json({
      success: true,
      message: '語彙ノートに追加しました',
      data: progress
    })
  } catch (error) {
    console.error('Add to notebook error:', error)
    return c.json({ 
      error: 'Failed to add to notebook',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * POST /api/vocabulary/notebook/review
 * 語彙の復習結果を記録
 */
router.post('/notebook/review', async (c) => {
  try {
    const { 
      user_id, 
      word_id, 
      quality, 
      response_time_ms,
      eiken_grade,
      days_until_exam
    } = await c.req.json()

    if (!user_id || !word_id || quality === undefined) {
      return c.json({ 
        error: 'user_id, word_id, and quality are required' 
      }, 400)
    }

    if (quality < 0 || quality > 5) {
      return c.json({ error: 'quality must be between 0 and 5' }, 400)
    }

    const progress = await vocabularyService.recordReview(
      c.env.DB,
      user_id,
      word_id,
      quality,
      response_time_ms,
      eiken_grade,
      days_until_exam
    )

    return c.json({
      success: true,
      message: '復習結果を記録しました',
      data: progress
    })
  } catch (error) {
    console.error('Review recording error:', error)
    return c.json({ 
      error: 'Failed to record review',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

/**
 * GET /api/vocabulary/notebook/due
 * 今日復習すべき単語を取得
 */
router.get('/notebook/due', async (c) => {
  try {
    const user_id = c.req.query('user_id')
    const limit = parseInt(c.req.query('limit') || '20', 10)

    if (!user_id) {
      return c.json({ error: 'user_id parameter is required' }, 400)
    }

    const dueWords = await vocabularyService.getDueWordsForToday(
      c.env.DB,
      user_id,
      limit
    )

    return c.json({
      success: true,
      count: dueWords.length,
      data: dueWords
    })
  } catch (error) {
    console.error('Get due words error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * GET /api/vocabulary/notebook/stats
 * ユーザーの語彙学習統計
 */
router.get('/notebook/stats', async (c) => {
  try {
    const user_id = c.req.query('user_id')

    if (!user_id) {
      return c.json({ error: 'user_id parameter is required' }, 400)
    }

    const stats = await vocabularyService.getUserVocabularyStats(
      c.env.DB,
      user_id
    )

    return c.json({
      success: true,
      data: stats
    })
  } catch (error) {
    console.error('Get user stats error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * GET /api/vocabulary/notebook/entries
 * ユーザーの語彙ノート一覧
 */
router.get('/notebook/entries', async (c) => {
  try {
    const user_id = c.req.query('user_id')
    const limit = parseInt(c.req.query('limit') || '100', 10)
    const offset = parseInt(c.req.query('offset') || '0', 10)

    if (!user_id) {
      return c.json({ error: 'user_id parameter is required' }, 400)
    }

    const results = await c.env.DB.prepare(`
      SELECT 
        vne.*,
        vm.word, vm.pos, vm.definition_ja, vm.definition_en,
        vm.cefr_level, vm.eiken_grade, vm.final_difficulty_score,
        vm.example_sentences, vm.collocations
      FROM vocabulary_notebook_entries vne
      JOIN vocabulary_master vm ON vne.word_id = vm.id
      WHERE vne.user_id = ?
      ORDER BY vne.added_at DESC
      LIMIT ? OFFSET ?
    `).bind(user_id, limit, offset).all()

    return c.json({
      success: true,
      count: results.results?.length || 0,
      data: results.results
    })
  } catch (error) {
    console.error('Get notebook entries error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

/**
 * GET /api/vocabulary/notebook/review-history
 * ユーザーの復習履歴
 */
router.get('/notebook/review-history', async (c) => {
  try {
    const user_id = c.req.query('user_id')
    const word_id = c.req.query('word_id')
    const limit = parseInt(c.req.query('limit') || '50', 10)

    if (!user_id) {
      return c.json({ error: 'user_id parameter is required' }, 400)
    }

    let query = `
      SELECT 
        vrh.*,
        vm.word, vm.definition_ja
      FROM vocabulary_review_history vrh
      JOIN vocabulary_master vm ON vrh.word_id = vm.id
      WHERE vrh.user_id = ?
    `
    const params: any[] = [user_id]

    if (word_id) {
      query += ' AND vrh.word_id = ?'
      params.push(parseInt(word_id, 10))
    }

    query += ' ORDER BY vrh.reviewed_at DESC LIMIT ?'
    params.push(limit)

    const results = await c.env.DB.prepare(query).bind(...params).all()

    return c.json({
      success: true,
      count: results.results?.length || 0,
      data: results.results
    })
  } catch (error) {
    console.error('Get review history error:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

export default router
