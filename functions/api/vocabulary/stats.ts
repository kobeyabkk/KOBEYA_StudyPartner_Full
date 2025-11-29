/**
 * GET /api/vocabulary/stats
 * Database statistics
 */

interface Env {
  DB: D1Database
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
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
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      details: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
