/**
 * Vocabulary API - Cloudflare Pages Functions
 * 
 * Endpoints:
 * - GET /api/vocabulary/search?word=example
 * - POST /api/vocabulary/generate-definition
 * - POST /api/vocabulary/annotate-text
 * - GET /api/vocabulary/stats
 */

interface Env {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const path = url.pathname.replace('/api/vocabulary', '')
  
  // GET /api/vocabulary/search?word=example
  if (path === '/search' && context.request.method === 'GET') {
    const word = url.searchParams.get('word')
    
    if (!word) {
      return new Response(JSON.stringify({ error: 'word parameter is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    try {
      const result = await context.env.DB.prepare(
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
        return new Response(JSON.stringify({ error: 'Word not found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      return new Response(JSON.stringify({
        success: true,
        data: result
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Vocabulary search error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // GET /api/vocabulary/stats
  if (path === '/stats' && context.request.method === 'GET') {
    try {
      const totalQuery = await context.env.DB.prepare(
        'SELECT COUNT(*) as total FROM vocabulary_master'
      ).first()

      const withDefinitionQuery = await context.env.DB.prepare(
        `SELECT COUNT(*) as count FROM vocabulary_master 
         WHERE definition_ja IS NOT NULL AND definition_ja != ''`
      ).first()

      const annotationCandidatesQuery = await context.env.DB.prepare(
        'SELECT COUNT(*) as count FROM vocabulary_master WHERE should_annotate = 1'
      ).first()

      const cefrDistribution = await context.env.DB.prepare(
        `SELECT cefr_level, COUNT(*) as count 
         FROM vocabulary_master 
         GROUP BY cefr_level 
         ORDER BY cefr_numeric`
      ).all()

      return new Response(JSON.stringify({
        success: true,
        stats: {
          totalWords: totalQuery?.total || 0,
          withDefinition: withDefinitionQuery?.count || 0,
          needsDefinition: (totalQuery?.total || 0) - (withDefinitionQuery?.count || 0),
          annotationCandidates: annotationCandidatesQuery?.count || 0,
          cefrDistribution: cefrDistribution.results
        }
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Stats error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // POST /api/vocabulary/generate-definition
  if (path === '/generate-definition' && context.request.method === 'POST') {
    try {
      const body = await context.request.json()
      const { word, cefr_level } = body

      if (!word) {
        return new Response(JSON.stringify({ error: 'word is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

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
          'Authorization': `Bearer ${context.env.OPENAI_API_KEY}`
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

      await context.env.DB.prepare(
        `UPDATE vocabulary_master 
         SET definition_ja = ?, 
             definition_cached_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE LOWER(word) = LOWER(?)`
      ).bind(definition_ja, word).run()

      return new Response(JSON.stringify({
        success: true,
        word,
        definition_ja
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Definition generation error:', error)
      return new Response(JSON.stringify({ 
        error: 'Failed to generate definition',
        details: error instanceof Error ? error.message : 'Unknown error'
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  // POST /api/vocabulary/annotate-text
  if (path === '/annotate-text' && context.request.method === 'POST') {
    try {
      const body = await context.request.json()
      const { text, difficulty_threshold = 60 } = body

      if (!text) {
        return new Response(JSON.stringify({ error: 'text is required' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' }
        })
      }

      const words = text.toLowerCase().match(/\b[a-z]+\b/g) || []
      const uniqueWords = [...new Set(words)]

      const placeholders = uniqueWords.map(() => '?').join(',')
      const query = `
        SELECT word, cefr_level, final_difficulty_score, definition_ja
        FROM vocabulary_master
        WHERE LOWER(word) IN (${placeholders})
        AND final_difficulty_score >= ?
      `

      const result = await context.env.DB.prepare(query)
        .bind(...uniqueWords, difficulty_threshold)
        .all()

      const annotations = result.results || []
      const needsGeneration = annotations.filter((a: any) => !a.definition_ja)

      return new Response(JSON.stringify({
        success: true,
        annotationCount: annotations.length,
        annotations,
        needsGeneration: needsGeneration.map((a: any) => a.word)
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    } catch (error) {
      console.error('Text annotation error:', error)
      return new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      })
    }
  }

  return new Response(JSON.stringify({ error: 'Not Found' }), {
    status: 404,
    headers: { 'Content-Type': 'application/json' }
  })
}
