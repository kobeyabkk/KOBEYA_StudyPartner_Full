import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

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

export default router
