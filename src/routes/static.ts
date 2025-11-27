import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// SEO: sitemap.xml endpoint
router.get('/sitemap.xml', async (c) => {
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9 
        http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">

  <!-- Homepage / Top Page -->
  <url>
    <loc>https://kobeyabkk-studypartner.pages.dev/</loc>
    <lastmod>2025-10-29</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>

  <!-- Essay Coaching Section -->
  <url>
    <loc>https://kobeyabkk-studypartner.pages.dev/essay-coaching</loc>
    <lastmod>2025-10-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.9</priority>
  </url>

  <!-- Vocabulary Learning Section -->
  <url>
    <loc>https://kobeyabkk-studypartner.pages.dev/#vocabulary</loc>
    <lastmod>2025-10-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- AI Chat Assistant Section -->
  <url>
    <loc>https://kobeyabkk-studypartner.pages.dev/#ai-chat</loc>
    <lastmod>2025-10-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>

  <!-- Features / About Section -->
  <url>
    <loc>https://kobeyabkk-studypartner.pages.dev/#features</loc>
    <lastmod>2025-10-29</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>

</urlset>`
  
  c.header('Content-Type', 'application/xml')
  return c.body(sitemap)
})

// SEO: robots.txt endpoint
router.get('/robots.txt', async (c) => {
  const robotsTxt = `User-agent: *
Allow: /
Allow: /essay-coaching
Disallow: /essay-coaching/session/
Disallow: /api/
Disallow: /dashboard

Sitemap: https://kobeyabkk-studypartner.pages.dev/sitemap.xml`
  
  c.header('Content-Type', 'text/plain')
  return c.body(robotsTxt)
})

// Favicon endpoint (returns 204 No Content)
router.get('/favicon.ico', (c) => {
  return c.body(null, 204)  // No Content
})

export default router
