/**
 * Phase 5D/5E: Validation Dashboard API Routes
 * 
 * GET /api/validation-dashboard/stats - 統計情報取得
 * GET /api/validation-dashboard/recent-logs - 最近のログ取得
 * GET /api/validation-dashboard/thresholds - すべての閾値取得
 * GET /api/validation-dashboard/threshold?grade=5&format=grammar_fill - 特定の閾値取得
 * POST /api/validation-dashboard/threshold - 閾値更新
 * DELETE /api/validation-dashboard/threshold - 閾値削除
 * GET /api/validation-dashboard/threshold-history - 変更履歴取得
 */

import { getValidationStats, getRecentValidationLogs } from './stats';
import { 
  getAllThresholds, 
  getThreshold, 
  upsertThreshold, 
  deleteThreshold,
  getThresholdHistory 
} from './thresholds';

export async function handleValidationDashboardRequest(
  request: Request,
  env: { DB: D1Database }
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
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

    // GET /api/validation-dashboard/thresholds - すべての閾値取得
    if (path.endsWith('/thresholds') && request.method === 'GET') {
      const thresholds = await getAllThresholds(env.DB);

      return new Response(JSON.stringify({ thresholds }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // GET /api/validation-dashboard/threshold - 特定の閾値取得
    if (path.endsWith('/threshold') && request.method === 'GET') {
      const grade = url.searchParams.get('grade') || 'default';
      const format = url.searchParams.get('format') || 'default';
      
      const threshold = await getThreshold(env.DB, grade, format);

      return new Response(JSON.stringify(threshold), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // POST /api/validation-dashboard/threshold - 閾値更新
    if (path.endsWith('/threshold') && request.method === 'POST') {
      const body = await request.json();
      const changedBy = body.changed_by || 'admin';
      
      const threshold = await upsertThreshold(env.DB, body, changedBy);

      return new Response(JSON.stringify(threshold), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // DELETE /api/validation-dashboard/threshold - 閾値削除
    if (path.endsWith('/threshold') && request.method === 'DELETE') {
      const grade = url.searchParams.get('grade');
      const format = url.searchParams.get('format');
      const changedBy = url.searchParams.get('changed_by') || 'admin';
      
      if (!grade || !format) {
        return new Response(JSON.stringify({ error: 'grade and format required' }), {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
            ...corsHeaders,
          },
        });
      }

      const deleted = await deleteThreshold(env.DB, grade, format, changedBy);

      return new Response(JSON.stringify({ success: deleted }), {
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders,
        },
      });
    }

    // GET /api/validation-dashboard/threshold-history - 変更履歴取得
    if (path.endsWith('/threshold-history') && request.method === 'GET') {
      const limit = parseInt(url.searchParams.get('limit') || '50');
      const history = await getThresholdHistory(env.DB, limit);

      return new Response(JSON.stringify({ history }), {
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
