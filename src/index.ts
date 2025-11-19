/**
 * KOBEYA StudyPartner - API Router
 * Main entry point for Cloudflare Pages Functions
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import topicRoutes from './eiken/routes/topic-routes';
import type { EikenEnv } from './eiken/types';

const app = new Hono<{ Bindings: EikenEnv }>();

// CORS middleware
app.use('/*', cors());

// Health check
app.get('/', (c) => {
  return c.json({
    service: 'KOBEYA StudyPartner',
    status: 'operational',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/health', (c) => {
  return c.json({
    ok: true,
    env: 'cloudflare-pages',
    database: !!c.env.DB,
    kv: !!c.env.KV,
  });
});

// Phase 2: Topic Management Routes
app.route('/api/eiken/topics', topicRoutes);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      success: false,
      error: {
        message: 'Endpoint not found',
        code: 'NOT_FOUND',
        path: c.req.path,
      },
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Global error handler:', err);
  return c.json(
    {
      success: false,
      error: {
        message: err.message || 'Internal server error',
        code: 'INTERNAL_ERROR',
      },
    },
    500
  );
});

export default app;
