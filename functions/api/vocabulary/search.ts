/**
 * GET /api/vocabulary/search?word=example
 */

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url)
  const word = url.searchParams.get('word')
  
  if (!word) {
    return new Response(JSON.stringify({ error: 'word parameter is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  try {
    const result = await context.env.DB.prepare(
      'SELECT word, pos, cefr_level, cefr_numeric, eiken_grade, zipf_score, frequency_rank, final_difficulty_score, should_annotate, definition_en, definition_ja, example_sentences, collocations FROM vocabulary_master WHERE LOWER(word) = LOWER(?) LIMIT 1'
    ).bind(word).first()

    if (!result) {
      return new Response(JSON.stringify({ error: 'Word not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true, data: result }), {
      headers: { 'Content-Type': 'application/json' }
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
