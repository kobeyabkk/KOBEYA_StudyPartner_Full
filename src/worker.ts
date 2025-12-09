import { handleValidationDashboardRequest } from './api/validation-dashboard';

export default {
  async fetch(request: Request, env: any, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 1) ルート（任意の簡単な稼働確認）
    if (url.pathname === "/") {
      return new Response("KOBEYA StudyPartner is alive ✅", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    // 2) /api/health（任意）
    if (url.pathname === "/api/health") {
      return new Response(JSON.stringify({ ok: true, env: "pages-worker" }), {
        headers: { "content-type": "application/json" },
      });
    }

    // 3) Phase 5D: Validation Dashboard API
    if (url.pathname.startsWith('/api/validation-dashboard')) {
      return handleValidationDashboardRequest(request, env);
    }

    // 4) 他は静的アセットへ（public → dist にコピーされたファイル）
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler;
