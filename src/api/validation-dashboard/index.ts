/**
 * Phase 5D: Validation Dashboard API Routes
 * 
 * GET /api/validation-dashboard/stats - 統計情報取得
 * GET /api/validation-dashboard/recent-logs - 最近のログ取得
 */

import { getValidationStats, getRecentValidationLogs } from './stats';

export async function handleValidationDashboardRequest(
  request: Request,
  env: { DB: D1Database }
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (request.method !== 'GET') {
    return new Response('Method not allowed', { 
      status: 405,
      headers: corsHeaders 
    });
  }

  try {
    // GET /api/validation-dashboard/stats
    if (path.endsWith('/stats')) {
      const days = parseInt(url.searchParams.get('days') || '7');
      const format = url.searchParams.get('format') || undefined;
      const grade = url.searchParams.get('grade') || undefined;

      const stats = await getValidationStats(env.DB, { days, format, grade });

      return new Response(JSON.stringify(stats), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // GET /api/validation-dashboard/recent-logs
    if (path.endsWith('/recent-logs')) {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const logs = await getRecentValidationLogs(env.DB, limit);

      return new Response(JSON.stringify({ logs }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    return new Response('Not found', { 
      status: 404,
      headers: corsHeaders 
    });

  } catch (error) {
    console.error('[Validation Dashboard API Error]', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        message: (error as Error).message 
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      }
    );
  }
}
