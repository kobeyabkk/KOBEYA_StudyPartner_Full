// src/worker.ts - Cloudflare Pages Worker Entry Point
export default {
  async fetch(req: Request, env: Record<string, unknown>) {
    const url = new URL(req.url);

    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ 
        ok: true,
        message: "KOBEYA Study Partner API is running",
        timestamp: new Date().toISOString(),
        version: "1.0.0"
      }), {
        status: 200,
        headers: { 
          "content-type": "application/json",
          "access-control-allow-origin": "*"
        },
      });
    }

    // 仮のトップページ
    if (url.pathname === "/") {
      return new Response("KOBEYA StudyPartner is alive ✅", {
        status: 200,
        headers: { 
          "content-type": "text/plain; charset=utf-8",
          "access-control-allow-origin": "*"
        },
      });
    }

    // API ヘルスチェック（認証付き）
    if (url.pathname === "/api/health") {
      const appKey = req.headers.get('x-app-key');
      const studentId = req.headers.get('x-student-id');
      
      if (!appKey || appKey !== (env.APP_KEY as string)) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'unauthorized',
          message: 'APP_KEYが一致しません'
        }), {
          status: 401,
          headers: { "content-type": "application/json" }
        });
      }
      
      if (!studentId) {
        return new Response(JSON.stringify({
          ok: false,
          error: 'missing_student_id', 
          message: '学生IDが必要です'
        }), {
          status: 400,
          headers: { "content-type": "application/json" }
        });
      }

      return new Response(JSON.stringify({
        ok: true,
        message: `Study Partner API ready for student: ${studentId}`,
        features: ['explain', 'practice', 'score'],
        timestamp: new Date().toISOString()
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("Not Found", { 
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  },
} satisfies ExportedHandler;