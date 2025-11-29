/**
 * Vocabulary API - Cloudflare Pages Functions
 * 
 * Endpoints:
 * - GET /api/vocabulary/search?word=example
 * - POST /api/vocabulary/generate-definition
 * - POST /api/vocabulary/annotate-text
 * - GET /api/vocabulary/stats
 */

import vocabularyRouter from '../../../src/api/routes/vocabulary'

export const onRequest: PagesFunction = async (context) => {
  return vocabularyRouter.fetch(context.request, context.env, context)
}
