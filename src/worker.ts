export default {
  async fetch(request: Request, env: Record<string, unknown>) {
    const url = new URL(request.url);

    // /health: ヘルスチェック
    if (url.pathname === "/health") {
      return new Response(
        JSON.stringify({ ok: true, message: "KOBEYA Study Partner API is running" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // /api/health: 簡易認証つき
    if (url.pathname === "/api/health") {
      const key = request.headers.get("x-app-key");
      if (key !== "kobeya-secret-2024-study-partner") {
        return new Response("unauthorized", { status: 401 });
      }
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "content-type": "application/json" },
      });
    }

    // ルート
    if (url.pathname === "/") {
      return new Response("KOBEYA StudyPartner is alive ✅", {
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};