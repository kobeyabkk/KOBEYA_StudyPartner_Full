import { jsxRenderer } from 'hono/jsx-renderer'

export const renderer = jsxRenderer(({ children, title = 'AI & プログラミングのKOBEYA - バンコク日本人小中学生向けプログラミング教室' }) => {
  return (
    <html lang="ja">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>{title}</title>
        
        {/* SEO Meta Tags */}
        <meta name="description" content="バンコクの日本人小中学生向けプログラミング教室。Scratch、Roblox、AIコーチングで、楽しく学べる環境を提供。無料体験受付中。" />
        <meta name="keywords" content="プログラミング教室, バンコク, 日本人, 小学生, 中学生, Scratch, Roblox, AI, 体験授業" />
        <meta name="author" content="AI & プログラミングのKOBEYA" />
        
        {/* OGP Tags */}
        <meta property="og:title" content={title} />
        <meta property="og:description" content="バンコクの日本人小中学生向けプログラミング教室。Scratch、Roblox、AIコーチングで、楽しく学べる環境を提供。" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://kobeya-programming.pages.dev/" />
        <meta property="og:image" content="https://kobeya-programming.pages.dev/static/images/og-image.jpg" />
        <meta property="og:locale" content="ja_JP" />
        
        {/* Twitter Card */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content="バンコクの日本人小中学生向けプログラミング教室。無料体験受付中。" />
        <meta name="twitter:image" content="https://kobeya-programming.pages.dev/static/images/og-image.jpg" />
        
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/static/images/favicon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/images/favicon-16x16.png" />
        
        {/* Google Fonts */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        
        {/* Font Awesome */}
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css" />
        
        {/* Styles */}
        <link href="/static/styles.css" rel="stylesheet" />
      </head>
      <body>
        {children}
        
        {/* Scripts */}
        <script src="/static/app.js"></script>
      </body>
    </html>
  )
})
