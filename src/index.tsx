import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { cors } from 'hono/cors'
// ログシステム用ユーティリティをインポート
import {
  normalize,
  calcMinutes,
  inferTags,
  inferTagsAI,
  mergeWeakTags,
  debugNums,
  safeJsonParse,
  safeJsonStringify,
  generateRequestId
} from './utils/logging'
// Study Partner Simple をインポート
import { studyPartnerSimple } from './study-partner-simple'

// Cloudflare Bindings の型定義
type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const app = new Hono<{ Bindings: Bindings }>()

// 開発モード設定
const USE_MOCK_RESPONSES = false

// D1セッション管理ヘルパー関数
async function saveSessionToDB(db: D1Database, sessionId: string, sessionData: any) {
  try {
    const now = new Date().toISOString()
    
    // session_data として JSON 保存
    const sessionDataJson = JSON.stringify({
      uploadedImages: sessionData.essaySession?.uploadedImages || [],
      ocrResults: sessionData.essaySession?.ocrResults || [],
      feedbacks: sessionData.essaySession?.feedbacks || [],
      chatHistory: sessionData.chatHistory || [],
      vocabularyProgress: sessionData.vocabularyProgress || {},
      lastActivity: now
    })
    
    // UPSERT (INSERT OR REPLACE)
    await db.prepare(`
      INSERT INTO essay_sessions (
        session_id, student_id, target_level, lesson_format, problem_mode, 
        custom_input, learning_style, current_step, step_status, 
        last_theme_content, last_theme_title, created_at, updated_at, session_data
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(session_id) DO UPDATE SET
        problem_mode = excluded.problem_mode,
        custom_input = excluded.custom_input,
        learning_style = excluded.learning_style,
        current_step = excluded.current_step,
        step_status = excluded.step_status,
        last_theme_content = excluded.last_theme_content,
        last_theme_title = excluded.last_theme_title,
        updated_at = excluded.updated_at,
        session_data = excluded.session_data
    `).bind(
      sessionId,
      sessionData.studentId || 'anonymous',
      sessionData.essaySession?.targetLevel || 'high_school',
      sessionData.essaySession?.lessonFormat || 'full_55min',
      sessionData.essaySession?.problemMode || 'ai',
      sessionData.essaySession?.customInput || null,
      sessionData.essaySession?.learningStyle || 'auto',
      sessionData.essaySession?.currentStep || 1,
      JSON.stringify(sessionData.essaySession?.stepStatus || {}),
      sessionData.essaySession?.lastThemeContent || null,
      sessionData.essaySession?.lastThemeTitle || null,
      sessionData.essaySession?.createdAt || now,
      now,
      sessionDataJson
    ).run()
    
    console.log('✅ Session saved to D1:', sessionId)
    return true
  } catch (error) {
    console.error('❌ Failed to save session to D1:', error)
    return false
  }
}

async function loadSessionFromDB(db: D1Database, sessionId: string) {
  try {
    const result = await db.prepare(`
      SELECT * FROM essay_sessions WHERE session_id = ? LIMIT 1
    `).bind(sessionId).first()
    
    if (!result) {
      console.log('⚠️ Session not found in D1:', sessionId)
      return null
    }
    
    // D1から読み込んだデータを復元
    const sessionData = result.session_data ? JSON.parse(result.session_data as string) : {}
    
    const session = {
      sessionId: result.session_id,
      studentId: result.student_id,
      essaySession: {
        sessionId: result.session_id,
        targetLevel: result.target_level,
        lessonFormat: result.lesson_format,
        problemMode: result.problem_mode || 'ai',
        customInput: result.custom_input || null,
        learningStyle: result.learning_style || 'auto',
        currentStep: result.current_step,
        stepStatus: JSON.parse(result.step_status as string || '{}'),
        createdAt: result.created_at,
        lastThemeContent: result.last_theme_content || null,
        lastThemeTitle: result.last_theme_title || null,
        uploadedImages: sessionData.uploadedImages || [],
        ocrResults: sessionData.ocrResults || [],
        feedbacks: sessionData.feedbacks || []
      },
      chatHistory: sessionData.chatHistory || [],
      vocabularyProgress: sessionData.vocabularyProgress || {}
    }
    
    console.log('✅ Session loaded from D1:', sessionId)
    return session
  } catch (error) {
    console.error('❌ Failed to load session from D1:', error)
    return null
  }
}

async function getOrCreateSession(db: D1Database | undefined, sessionId: string) {
  // まずインメモリをチェック
  let session = learningSessions.get(sessionId)
  if (session) {
    console.log('📦 Session found in memory:', sessionId)
    return session
  }
  
  // D1から読み込み
  if (db) {
    session = await loadSessionFromDB(db, sessionId)
    if (session) {
      // インメモリに復元
      learningSessions.set(sessionId, session)
      console.log('📦 Session restored from D1 to memory:', sessionId)
      return session
    }
  }
  
  console.log('❌ Session not found:', sessionId)
  return null
}

async function updateSession(db: D1Database | undefined, sessionId: string, updates: any) {
  // インメモリを更新
  let session = learningSessions.get(sessionId)
  if (!session) {
    console.error('❌ Cannot update non-existent session:', sessionId)
    return false
  }
  
  // ディープマージ
  session = { ...session, ...updates }
  if (updates.essaySession) {
    session.essaySession = { ...session.essaySession, ...updates.essaySession }
  }
  
  learningSessions.set(sessionId, session)
  
  // D1に保存
  if (db) {
    await saveSessionToDB(db, sessionId, session)
  }
  
  return true
}

// ========== Study Partner Session Management (D1 Persistence) ==========

// Study Partner セッションをD1に保存
async function saveStudyPartnerSessionToDB(db: any, sessionId: string, session: any) {
  try {
    const stepsJson = JSON.stringify(session.steps || [])
    const confirmationProblemJson = JSON.stringify(session.confirmationProblem || {})
    const similarProblemsJson = JSON.stringify(session.similarProblems || [])
    
    await db.prepare(`
      INSERT OR REPLACE INTO learning_sessions 
      (session_id, appkey, sid, problem_type, analysis, steps, confirmation_problem, 
       similar_problems, current_step, status, original_image_data, original_user_message, 
       created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
              COALESCE((SELECT created_at FROM learning_sessions WHERE session_id = ?), ?),
              ?)
    `).bind(
      sessionId,
      session.appkey,
      session.sid,
      session.problemType,
      session.analysis,
      stepsJson,
      confirmationProblemJson,
      similarProblemsJson,
      session.currentStep || 0,
      session.status || 'learning',
      session.originalImageData || null,
      session.originalUserMessage || '',
      sessionId, // For COALESCE created_at check
      session.createdAt || new Date().toISOString(),
      new Date().toISOString()
    ).run()
    
    console.log('✅ Study Partner session saved to D1:', sessionId)
  } catch (error) {
    console.error('❌ Failed to save Study Partner session to D1:', error)
    // Non-blocking: continue even if D1 save fails
  }
}

// Study Partner セッションをD1から取得
async function getStudyPartnerSessionFromDB(db: any, sessionId: string) {
  try {
    const result = await db.prepare(`
      SELECT * FROM learning_sessions WHERE session_id = ?
    `).bind(sessionId).first()
    
    if (!result) {
      console.log('⚠️ Study Partner session not found in D1:', sessionId)
      return null
    }
    
    console.log('✅ Study Partner session retrieved from D1:', sessionId)
    
    return {
      sessionId: result.session_id,
      appkey: result.appkey,
      sid: result.sid,
      problemType: result.problem_type,
      analysis: result.analysis,
      steps: JSON.parse(result.steps || '[]'),
      confirmationProblem: JSON.parse(result.confirmation_problem || '{}'),
      similarProblems: JSON.parse(result.similar_problems || '[]'),
      currentStep: result.current_step,
      status: result.status,
      originalImageData: result.original_image_data,
      originalUserMessage: result.original_user_message,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    }
  } catch (error) {
    console.error('❌ Failed to retrieve Study Partner session from D1:', error)
    return null
  }
}

// Study Partner セッション取得（インメモリ → D1フォールバック）
async function getStudyPartnerSession(db: any, sessionId: string) {
  // 1. インメモリから取得を試みる
  let session = learningSessions.get(sessionId)
  if (session) {
    console.log('✅ Study Partner session found in memory:', sessionId)
    return session
  }
  
  // 2. D1から取得を試みる
  if (!db) {
    console.warn('⚠️ D1 database not available, cannot retrieve session:', sessionId)
    return null
  }
  
  session = await getStudyPartnerSessionFromDB(db, sessionId)
  
  if (session) {
    // インメモリにもキャッシュ
    learningSessions.set(sessionId, session)
    console.log('✅ Study Partner session cached in memory:', sessionId)
  }
  
  return session
}

// ========== End of Study Partner Session Management ==========

// 教育方針フレームワーク読み込み
let educationalPolicy: any = null

// 教育方針を読み込む関数
async function loadEducationalPolicy() {
  try {
    // 本来は外部ファイルから読み込むが、ここでは埋め込み
    educationalPolicy = {
      "ai_interaction_protocols": {
        "communication_style": {
          "tone_and_manner": {
            "basic_principles": [
              "丁寧で親しみやすい敬語を使用",
              "学習者の年齢に適した語彙と表現",
              "励ましと支援の姿勢を常に保持",
              "多様性を尊重した包括的な言葉遣い"
            ]
          }
        }
      },
      "cross_curricular_competencies": {
        "key_competencies": {
          "language_ability": {
            "ai_guidance": [
              "適切な語彙と文法を用いた明確な説明を心がける",
              "学習者の発達段階に応じた言葉遣いを選択する",
              "多様な表現方法（文字、音声、図表等）を組み合わせる"
            ]
          },
          "problem_solving": {
            "ai_guidance": [
              "段階的な思考プロセスを明示して支援する",
              "複数の解決方法を提示し、比較検討を促す",
              "失敗を学習機会として前向きに捉える姿勢を育成する"
            ]
          }
        }
      },
      "teaching_methodology": {
        "pedagogical_approaches": {
          "individualized_support": {
            "ai_guidance": [
              "学習履歴と理解度を分析して個別最適な支援を提供",
              "多様な学習スタイルに対応した説明方法を選択",
              "適切な難易度の問題や課題を提示"
            ]
          }
        }
      }
    }
    console.log('📚 Educational policy loaded successfully')
  } catch (error) {
    console.error('❌ Failed to load educational policy:', error)
  }
}

// 起動時に教育方針を読み込み
loadEducationalPolicy()

// Import types and config
import type { StudentInfo } from './types'
import { studentDatabase, findStudent, updateStudentLogin } from './config/students'

// Import handlers
import { handleLogin } from './handlers/login'
import { handleAnalyzeAndLearn } from './handlers/analyze'
import { handleStepCheck } from './handlers/step-check'
import { handleConfirmationCheck } from './handlers/confirmation-check'
import { handleSimilarCheck } from './handlers/similar-check'

// Import pages
import { renderStudyPartnerPage } from './pages/study-partner'
import { registerEssayRoutes } from './routes/essay'

// Import utilities
import { learningSessions, generateSessionId, saveSessionToMemory, getSessionFromMemory } from './utils/session'
import { fileToDataUrl, arrayBufferToBase64, MAX_IMAGE_SIZE } from './utils/base64'

console.log('🚀 Study Partner server starting...')

// CORS設定
app.use('/api/*', (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', '*')
  return next()
})

app.options('/api/*', (c) => {
  return c.text('', 200)
})

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// SEO: Sitemap endpoint
app.get('/sitemap.xml', async (c) => {
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
app.get('/robots.txt', async (c) => {
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

// Health check endpoint
app.get('/api/health', (c) => {
  console.log('🏥 Health check endpoint called')
  
  const response = {
    ok: true,
    status: 'OK',
    mode: USE_MOCK_RESPONSES ? 'development' : 'production',
    timestamp: new Date().toISOString()
  }
  
  console.log('🏥 Health check response:', response)
  return c.json(response, 200)
})

// データベースマイグレーションエンドポイント
app.post('/api/admin/migrate-db', async (c) => {
  try {
    console.log('🔧 Database migration requested')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ ok: false, error: 'Database not available' }, 500)
    }
    
    // マイグレーション実行
    const migrations = [
      `ALTER TABLE essay_sessions ADD COLUMN problem_mode TEXT DEFAULT 'ai'`,
      `ALTER TABLE essay_sessions ADD COLUMN custom_input TEXT`,
      `ALTER TABLE essay_sessions ADD COLUMN learning_style TEXT DEFAULT 'auto'`,
      `ALTER TABLE essay_sessions ADD COLUMN last_theme_content TEXT`,
      `ALTER TABLE essay_sessions ADD COLUMN last_theme_title TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_essay_sessions_custom_input ON essay_sessions(custom_input)`,
      `CREATE INDEX IF NOT EXISTS idx_essay_sessions_problem_mode ON essay_sessions(problem_mode)`
    ]
    
    const results = []
    for (const sql of migrations) {
      try {
        await db.prepare(sql).run()
        results.push({ sql, status: 'success' })
        console.log('✅ Migration executed:', sql.substring(0, 50))
      } catch (error: any) {
        // カラムが既に存在する場合はスキップ
        if (error.message?.includes('duplicate column name')) {
          results.push({ sql, status: 'skipped', reason: 'column exists' })
          console.log('⏭️ Migration skipped (already applied):', sql.substring(0, 50))
        } else {
          results.push({ sql, status: 'failed', error: error.message })
          console.error('❌ Migration failed:', sql.substring(0, 50), error)
        }
      }
    }
    
    return c.json({
      ok: true,
      message: 'Database migration completed',
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Migration error:', error)
    return c.json({
      ok: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// ログインAPI
app.post('/api/login', handleLogin)

// 画像解析 + 段階学習開始 endpoint
app.post('/api/analyze-and-learn', handleAnalyzeAndLearn)

// 段階学習 - ステップ回答チェック endpoint
app.post('/api/step/check', handleStepCheck)

// 確認問題 - 回答チェック endpoint
app.post('/api/confirmation/check', handleConfirmationCheck)

// AI質問チャットAPI（画像対応）
app.post('/api/ai/chat', async (c) => {
  console.log('🤖 AI chat API called')
  
  try {
    const { sessionId, question, image } = await c.req.json()
    
    console.log('🤖 AI Chat: Request details:')
    console.log('  - sessionId:', sessionId)
    console.log('  - question:', question || '(empty)')
    console.log('  - image present:', !!image)
    console.log('  - image type:', typeof image)
    if (image) {
      console.log('  - image length:', image.length)
      console.log('  - image starts with:', image.substring(0, 30) + '...')
      
      // Base64画像データの検証とクリーニング
      if (!image.startsWith('data:image/')) {
        console.log('⚠️  Warning: Image does not start with data:image/ prefix')
      }
      
      // 不正な文字をチェック
      const base64Part = image.split(',')[1]
      if (base64Part) {
        console.log('  - base64 part length:', base64Part.length)
        console.log('  - base64 valid chars:', /^[A-Za-z0-9+/=]*$/.test(base64Part))
      }
    }
    
    if (!sessionId || (!question?.trim() && !image)) {
      return c.json({
        ok: false,
        error: 'missing_params',
        message: 'セッションID、質問文、または画像が不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッション情報を取得してコンテキストを作成（オプショナル）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    let contextInfo = '汎用AIチャット（学習セッションなし）'
    
    if (session) {
      // 現在の学習コンテキストを構築
      let phase = '段階学習'
      if (session.status === 'similar_problems') {
        phase = '類似問題'
      } else if (session.status === 'confirmation') {
        phase = '確認問題'
      }
      
      contextInfo = `現在の学習状況：
・学習フェーズ: ${phase}
・問題タイプ: ${session.problemType === 'english_grammar' ? '英語文法' : '数学'}
・現在のステップ: ${session.currentStep + 1}
・学習内容: ${session.analysis.split('\n\n')[0]}`
    }
    
    // 画像データのクリーニング（必要に応じて）
    let cleanedImage = image
    if (image) {
      // Base64データの検証とクリーニング
      if (!image.startsWith('data:image/')) {
        console.log('⚠️ Invalid image format: Missing data:image/ prefix')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データの形式が正しくありません',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // Base64部分の抽出と検証
      const parts = image.split(',')
      if (parts.length !== 2) {
        console.log('⚠️ Invalid image format: Missing comma separator')
        return c.json({
          ok: false,
          error: 'invalid_image_format', 
          message: '画像データの形式が正しくありません（comma separator）',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      const [header, base64Data] = parts
      
      // Base64データの検証
      if (!base64Data || base64Data.length === 0) {
        console.log('⚠️ Invalid image format: Empty base64 data')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データが空です',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // Base64文字の検証
      if (!/^[A-Za-z0-9+/=]*$/.test(base64Data)) {
        console.log('⚠️ Invalid base64 characters detected')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データに不正な文字が含まれています',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // 画像サイズが大きすぎる場合の追加チェック
      const base64Length = base64Data.length
      console.log('📊 Base64 data length:', base64Length)
      
      // Base64サイズが約1MB（約1.4MB in base64）を超える場合は警告
      if (base64Length > 1400000) {
        console.log('⚠️ Large image detected, size:', base64Length)
        return c.json({
          ok: false,
          error: 'image_too_large',
          message: '画像ファイルが大きすぎます。より小さな画像を使用してください。',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      cleanedImage = image
      console.log('✅ Image validation passed, size OK')
    }

    // OpenAI APIキーの確認（型安全）
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    console.log('🔑 API Key check:', apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing')
    console.log('🔑 API Key preview:', apiKey ? apiKey.substring(0, 20) + '...' : 'No key')
    
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'api_key_missing',
        message: 'OPENAI_API_KEY環境変数が設定されていません',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    // OpenAI API送信前の最終確認
    if (cleanedImage) {
      const parts = cleanedImage.split(',')
      if (parts.length === 2) {
        console.log('🔍 Final image data check before OpenAI API:')
        console.log('  - Header:', parts[0])
        console.log('  - Base64 length:', parts[1].length)
        console.log('  - Estimated file size:', Math.round(parts[1].length * 0.75 / 1024) + 'KB')
        console.log('  - First 100 chars of base64:', parts[1].substring(0, 100))
        console.log('  - Last 50 chars of base64:', parts[1].substring(parts[1].length - 50))
        
        // Base64パディングチェック
        const base64 = parts[1]
        const paddingCount = (base64.match(/=/g) || []).length
        console.log('  - Padding count:', paddingCount)
        console.log('  - Length modulo 4:', base64.length % 4)
      }
    }

    // OpenAI APIに送信
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `あなたは「プログラミングのKOBEYA」の優秀な学習サポートAIアシスタントです。

【あなたの役割】
生徒の学習をサポートする頼れるアシスタントとして、質問に親身になって答えてください。通常のChatGPTと同様に、どんな質問にも柔軟に対応してください。

【現在の学習コンテキスト】
${contextInfo}

【回答スタイル】
・自然で親しみやすい文章で回答
・必要に応じて、手順を分けて説明
・具体例を多用
・図式的な説明（記号や矢印使用）
・覚え方のコツやヒント
・問題を作成したり、確認問題を出すことも可能です

【数式の表記方法】
数式を含む回答では、必ず以下のLaTeX形式を使用してください：
・インライン数式：$数式$ （例：$x^2 + y^2 = r^2$）
・独立した数式：$$数式$$ （例：$$\\frac{3x+2y}{8}$$）
・分数：$\\frac{分子}{分母}$ （例：$\\frac{3}{4}$）
・累乗：$x^2$ （例：$a^{n+1}$）
・平方根：$\\sqrt{中身}$ （例：$\\sqrt{2}$）

生徒からの質問に、温かく分かりやすい回答をしてください。`
          },
          {
            role: 'user',
            content: cleanedImage ? [
              {
                type: 'text',
                text: question || '写真について教えてください。わからない部分があれば詳しく解説してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: cleanedImage, // data:image/jpeg;base64,プレフィックス付きで送信
                  detail: 'high'
                }
              }
            ] : question
          }
        ],
        max_tokens: 2000,
        temperature: 0.8
      })
    })
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('❌ OpenAI API error:', openaiResponse.status, errorText)
      
      // 画像データの詳細情報をログ出力
      if (image) {
        console.log('🔍 Detailed image analysis for debugging:')
        console.log('  - Full image prefix (first 100 chars):', image.substring(0, 100))
        console.log('  - Image total length:', image.length)
        console.log('  - Contains data: prefix:', image.includes('data:'))
        console.log('  - Contains base64 separator:', image.includes(','))
        
        if (image.includes(',')) {
          const parts = image.split(',')
          console.log('  - Header part:', parts[0])
          console.log('  - Base64 part length:', parts[1]?.length || 0)
          console.log('  - Base64 sample (first 50 chars):', parts[1]?.substring(0, 50) || 'N/A')
        }
      }
      
      // デバッグ用：詳細なエラー情報を返す
      return c.json({
        ok: false,
        error: 'openai_api_error',
        message: `OpenAI API Error - Status: ${openaiResponse.status}`,
        details: errorText,
        status: openaiResponse.status,
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const aiResult = await openaiResponse.json()
    const aiAnswer = aiResult.choices[0]?.message?.content || 'すみません、回答を生成できませんでした。'
    
    // 質問履歴をセッションに保存（オプション）
    if (session) {
      if (!session.aiQuestions) {
        session.aiQuestions = []
      }
      session.aiQuestions.push({
        question,
        answer: aiAnswer,
        timestamp: new Date().toISOString(),
        phase: session.status,
        currentStep: session.currentStep
      })
    }
    
    console.log('🤖 AI chat response generated successfully')
    
    return c.json({
      ok: true,
      question,
      answer: aiAnswer,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ AI chat error:', error)
    return c.json({
      ok: false,
      error: 'ai_chat_error',
      message: 'AI質問処理でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// =====================================
// Essay Coaching Routes (Extracted)
// =====================================
registerEssayRoutes(app)

// AI質問ウインドウ用ページ
app.get('/ai-chat/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🤖 AI chat window requested for session:', sessionId)
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI学習サポート - KOBEYA</title>
        <!-- KaTeX for math rendering -->
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
        <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <!-- MathJax for math rendering -->
        <script>
        window.MathJax = {
          tex: {
            inlineMath: [['$', '$'], ['\\(', '\\)']],
            displayMath: [['$$', '$$'], ['\\[', '\\]']],
            processEscapes: true
          },
          options: {
            skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre']
          }
        };
        </script>
        <script id="MathJax-script" async src="https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-mml-chtml.js"></script>
        
        <style>
        body { 
          font-family: 'Noto Sans JP', sans-serif;
          margin: 0;
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #333;
        }
        
        .chat-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
          height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
        }
        
        .chat-header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 1.5rem;
          text-align: center;
        }
        
        .chat-messages {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
          background: #f8fafc;
        }
        
        .message {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        
        .user-message {
          background: #e0e7ff;
          margin-left: 2rem;
          border-bottom-right-radius: 0.25rem;
        }
        
        .ai-message {
          background: white;
          margin-right: 2rem;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 0.25rem;
        }
        
        .chat-input {
          padding: 1rem;
          background: white;
          border-top: 1px solid #e2e8f0;
        }
        
        .input-row {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .image-controls {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .image-btn {
          width: 100%;
          padding: 0.875rem 1rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: #475569;
          text-align: center;
        }
        
        .image-btn:hover {
          background: #e2e8f0;
        }
        
        .image-preview {
          max-width: 100%;
          max-height: 200px;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
        }
        
        .crop-container {
          max-height: 300px;
          margin-bottom: 1rem;
        }
        
        #questionInput {
          padding: 0.75rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-family: inherit;
          resize: vertical;
          min-height: 80px;
          width: 100%;
          box-sizing: border-box;
        }
        
        #questionInput:focus {
          outline: none;
          border-color: #7c3aed;
        }
        
        #buttonRow {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
        }
        
        #sendButton, #cancelCropBtn {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          min-height: 60px;
          font-size: 1rem;
          flex: 1;
          max-width: 200px;
        }
        
        #sendButton {
          background: #7c3aed;
          color: white;
        }
        
        #sendButton:hover {
          background: #6d28d9;
        }
        
        #sendButton:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        
        #cancelCropBtn {
          background: #6b7280;
          color: white;
        }
        
        #cancelCropBtn:hover {
          background: #4b5563;
        }
        
        .loading {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
          font-style: italic;
        }
        
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #7c3aed;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .close-window {
          margin-top: 1rem;
          text-align: center;
        }
        
        .close-button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 0.5rem;
          font-weight: 500;
          cursor: pointer;
        }
        
        .close-button:hover {
          background: #dc2626;
        }
        
        .welcome-message {
          text-align: center;
          color: #6b7280;
          padding: 2rem;
          font-style: italic;
        }
        
        /* Cropper.js のハンドルサイズを大きく調整 - メイン画面と同じサイズに */
        .cropper-point {
          width: 12px !important;
          height: 12px !important;
          background-color: #7c3aed !important;
          border-radius: 50% !important;
          opacity: 0.9 !important;
        }
        
        .cropper-point:hover {
          background-color: #5b21b6 !important;
          opacity: 1 !important;
        }
        
        /* 角の四角ハンドル */
        .cropper-point.point-nw,
        .cropper-point.point-ne,
        .cropper-point.point-sw,
        .cropper-point.point-se {
          width: 14px !important;
          height: 14px !important;
          border-radius: 3px !important;
        }
        
        /* 辺の中央ハンドル */
        .cropper-point.point-n,
        .cropper-point.point-s,
        .cropper-point.point-e,
        .cropper-point.point-w {
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
        }
        
        /* クロップボックスのボーダーも見やすく */
        .cropper-crop-box {
          border: 2px solid #7c3aed !important;
        }
        
        .cropper-view-box {
          outline: 1px solid rgba(124, 58, 237, 0.75) !important;
        }
        
        /* 音声入力のパルスアニメーション */
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <div class="chat-header">
                <h1 style="margin: 0; font-size: 1.5rem;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    AI学習サポート
                </h1>
                <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">何でもお聞きください！一緒に学習を進めましょう 📚</p>
            </div>
            
            <div class="chat-messages" id="chatMessages">
                <div class="welcome-message">
                    <i class="fas fa-graduation-cap" style="font-size: 2rem; color: #7c3aed; margin-bottom: 1rem; display: block;"></i>
                    こんにちは！学習でわからないことがあれば、何でも質問してください。<br>
                    丁寧に説明いたします！
                </div>
            </div>
            
            <div class="chat-input">
                <!-- 統合フローサポートインフォメーション -->
                <div id="imageAttachmentIndicator" style="display: none; background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 1rem; color: #0c4a6e; font-weight: 600;">
                    <i class="fas fa-info-circle" style="margin-right: 0.5rem; color: #0ea5e9;"></i>
                    📝 質問を入力して送信ボタンを押すと、画像と一緒に送信されます
                    <button onclick="clearImage()" style="background: #fee2e2; border: 1px solid #dc2626; color: #dc2626; font-size: 0.9rem; margin-left: 1rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                        <i class="fas fa-times"></i> 削除
                    </button>
                </div>
                
                <!-- 画像アップロード機能 -->
                <div class="image-controls">
                    <button class="image-btn" id="cameraBtn">
                        <i class="fas fa-camera"></i> 📷 写真を撮る
                    </button>
                    <button class="image-btn" id="fileBtn">
                        <i class="fas fa-folder-open"></i> 📁 ファイル選択
                    </button>
                    <button class="image-btn" id="voiceInputBtn">
                        <i class="fas fa-microphone"></i> 🎤 音声入力
                    </button>
                    <button class="image-btn" id="clearImageBtn" style="display: none; background: #fee2e2; color: #dc2626;">
                        <i class="fas fa-times"></i> 画像をクリア
                    </button>
                </div>
                
                <!-- 音声入力ステータス -->
                <div id="voiceInputStatus" style="display: none; background: #fef3c7; border: 2px solid #f59e0b; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 1rem; color: #92400e; font-weight: 600;">
                    <i class="fas fa-microphone-alt" style="margin-right: 0.5rem; color: #f59e0b; animation: pulse 1.5s ease-in-out infinite;"></i>
                    🎤 音声を聞き取っています...
                </div>
                
                <!-- 隠し画像入力 -->
                <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;">
                <input type="file" id="fileInput" accept="image/*" style="display: none;">
                
                <!-- 画像プレビューエリア -->
                <div id="imagePreviewArea" style="display: none;">
                    <img id="previewImage" class="image-preview">
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <button class="image-btn" id="startCropBtn" style="background: #7c3aed; color: white;">
                            <i class="fas fa-crop"></i> 範囲を調整
                        </button>
                        <button class="image-btn" id="confirmImageBtn" style="background: #059669; color: white; font-weight: 600;">
                            <i class="fas fa-paper-plane"></i> ✅ この画像で送信
                        </button>
                    </div>
                </div>
                
                <!-- クロップエリア -->
                <div id="cropArea" style="display: none;">
                    <div class="crop-container">
                        <img id="cropImage" style="max-width: 100%; max-height: 280px;">
                    </div>
                    <div style="text-align: center; margin-bottom: 1rem; color: #6b7280; font-size: 0.95rem;">
                        📝 範囲を調整してください。質問を入力後、下のボタンで送信できます。
                    </div>
                </div>
                
                <!-- テキスト入力欄（1段目） -->
                <div style="margin-bottom: 0.75rem;">
                    <textarea id="questionInput" placeholder="質問を入力してください...（画像のみの場合は空白でもOK）" style="width: 100%; min-height: 80px; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 1rem; resize: vertical;"></textarea>
                </div>
                
                <!-- ボタンエリア（2段目） -->
                <div class="input-row" id="buttonRow">
                    <!-- 通常時：送信ボタンのみ（中央配置） -->
                    <button id="sendButton" style="background: #7c3aed; color: white; font-weight: 600; min-width: 120px; flex: 1;">
                        <i class="fas fa-paper-plane"></i><br><span id="sendButtonText">送信</span>
                    </button>
                    
                    <!-- クロップ時：キャンセルボタンが追加表示 -->
                    <button id="cancelCropBtn" style="display: none; background: #6b7280; color: white; font-weight: 600; min-width: 120px; flex: 1;">
                        <i class="fas fa-times"></i><br>キャンセル
                    </button>
                </div>
            </div>
            
            <div class="close-window">
                <button class="close-button" onclick="window.close()">
                    <i class="fas fa-times"></i> ウインドウを閉じる
                </button>
            </div>
        </div>
        
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        <script>
        window.addEventListener('DOMContentLoaded', function() {
            console.log('🤖 AI Chat: DOM loaded, starting script');
            console.log('🤖 AI Chat: Cropper available:', typeof Cropper !== 'undefined');
            
            (function() {
                console.log('🤖 AI Chat: Script loaded');
                console.log('🤖 AI Chat: Cropper check:', typeof Cropper);
            
            const sessionId = ${JSON.stringify(sessionId)};
            let chatMessages, questionInput, sendButton;
            let cameraBtn, fileBtn, clearImageBtn, cameraInput, fileInput;
            let imagePreviewArea, previewImage, startCropBtn, confirmImageBtn;
            let cropArea, cropImage, cancelCropBtn;
            let cropper = null;
            let currentImageData = null;
            
            // ページ読み込み完了を待つ
            window.addEventListener('load', function() {
                console.log('🤖 AI Chat: Window loaded, starting initialization...');
                initializeAIChat();
            });
            
            // DOMが読み込まれた時点でも試す
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', function() {
                    console.log('🤖 AI Chat: DOM ready, starting initialization...');
                    initializeAIChat();
                });
            } else {
                console.log('🤖 AI Chat: DOM already ready, starting initialization immediately...');
                initializeAIChat();
            }
            
            function initializeAIChat() {
                try {
                    console.log('🤖 AI Chat: Initializing...');
            
            // 要素を取得
            chatMessages = document.getElementById('chatMessages');
            questionInput = document.getElementById('questionInput');
            sendButton = document.getElementById('sendButton');
            
            // 画像関連の要素
            cameraBtn = document.getElementById('cameraBtn');
            fileBtn = document.getElementById('fileBtn');
            clearImageBtn = document.getElementById('clearImageBtn');
            cameraInput = document.getElementById('cameraInput');
            fileInput = document.getElementById('fileInput');
            imagePreviewArea = document.getElementById('imagePreviewArea');
            previewImage = document.getElementById('previewImage');
            startCropBtn = document.getElementById('startCropBtn');
            confirmImageBtn = document.getElementById('confirmImageBtn');
            cropArea = document.getElementById('cropArea');
            cropImage = document.getElementById('cropImage');
            cancelCropBtn = document.getElementById('cancelCropBtn');
            
            console.log('🤖 AI Chat: Elements loaded', {
                sendButton: !!sendButton,
                cameraBtn: !!cameraBtn,
                fileBtn: !!fileBtn,
                questionInput: !!questionInput
            });
            
            // エンターキーで送信（Shift+Enterで改行）- 日本語入力中は除外
            if (questionInput) {
                questionInput.addEventListener('keydown', function(e) {
                    // 日本語入力中（IME変換中）は送信しない
                    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                        e.preventDefault();
                        sendQuestion();
                    }
                });
            }
            
            if (sendButton) {
                sendButton.addEventListener('click', sendQuestion);
                console.log('✅ Send button listener attached');
            }
            
            // 画像機能のイベントリスナー
            if (cameraBtn) cameraBtn.addEventListener('click', () => cameraInput.click());
            if (fileBtn) fileBtn.addEventListener('click', () => fileInput.click());
            if (clearImageBtn) clearImageBtn.addEventListener('click', clearImage);
            if (cameraInput) cameraInput.addEventListener('change', handleImageSelect);
            if (fileInput) fileInput.addEventListener('change', handleImageSelect);
            if (startCropBtn) startCropBtn.addEventListener('click', startCrop);
            if (confirmImageBtn) confirmImageBtn.addEventListener('click', confirmImage);
            if (cancelCropBtn) cancelCropBtn.addEventListener('click', cancelCrop);
            
            // 音声入力機能の初期化
            initVoiceInput();
            
            console.log('✅ AI Chat: All event listeners attached');
                } catch (error) {
                    console.error('❌ AI Chat initialization error:', error);
                    alert('AIチャットの初期化に失敗しました。ページを再読み込みしてください。');
                }
            }
        });
        
        // 画像選択処理
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('🖼️ AI Chat: Image selected', file.name);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewImage.onload = function() {
                    console.log('🖼️ AI Chat: Image loaded, showing preview');
                    showImagePreview();
                    
                    // 画像読み込み完了後に自動的にクロップを開始
                    setTimeout(() => {
                        console.log('🖼️ AI Chat: Starting auto crop');
                        startCrop();
                    }, 800);
                };
            };
            reader.readAsDataURL(file);
        }
        
        function showImagePreview() {
            imagePreviewArea.style.display = 'block';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
        }
        
        function startCrop() {
            if (!previewImage.src) {
                console.error('❌ AI Chat: No image source for crop');
                return;
            }
            
            console.log('✂️ AI Chat: Starting crop function');
            
            cropImage.src = previewImage.src;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'block';
            
            // クロップモード用のUI更新
            updateUIForCropMode();
            
            if (cropper) {
                cropper.destroy();
            }
            
            // Cropper.jsの初期化を遅延させる
            setTimeout(() => {
                if (window.Cropper && cropImage) {
                    cropper = new window.Cropper(cropImage, {
                        aspectRatio: NaN, // フリーサイズ
                        viewMode: 1,
                        dragMode: 'move', // メイン画面と同じ設定
                        autoCropArea: 0.95, // ほぼ全体を初期選択（メイン画面と同じ）
                        responsive: true,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        ready: function() {
                            console.log('✂️ AI Chat Cropper initialized with large crop area');
                        }
                    });
                }
            }, 100);
        }
        
        function cancelCrop() {
            console.log('❌ AI Chat: Canceling crop');
            
            cropArea.style.display = 'none';
            showImagePreview();
            
            // 通常モード用のUI更新
            updateUIForNormalMode();
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }
        
        // クロップ確定（画像データを準備、送信は統合送信ボタンで）
        function confirmCrop() {
            console.log('✂️ AI Chat: ConfirmCrop called (UI integrated flow), cropper exists:', !!cropper);
            
            if (!cropper) {
                console.error('❌ AI Chat: No cropper instance available');
                alert('クロップ機能が正しく初期化されていません。再度お試しください。');
                return;
            }
            
            console.log('✂️ AI Chat: Processing crop for integrated UI');
            
            let canvas;
            try {
                canvas = cropper.getCroppedCanvas({
                    maxWidth: 768,
                    maxHeight: 768,
                    imageSmoothingQuality: 'high'
                });
                
                console.log('✂️ AI Chat: Canvas obtained:', !!canvas);
                
                if (!canvas) {
                    console.error('❌ AI Chat: Failed to get cropped canvas');
                    alert('画像の切り取りに失敗しました。再度お試しください。');
                    return;
                }
                
            } catch (error) {
                console.error('❌ AI Chat: Error getting canvas:', error);
                alert('画像の処理中にエラーが発生しました。');
                return;
            }
            
            // 画像データをBase64に変換
            try {
                const croppedImageData = canvas.toDataURL('image/jpeg', 0.95);
                console.log('✂️ AI Chat: Image converted to base64, length:', croppedImageData.length);
                console.log('✂️ AI Chat: Image data starts with:', croppedImageData.substring(0, 50));
                console.log('✂️ AI Chat: Image data format check:', croppedImageData.startsWith('data:image/'));
                
                if (!croppedImageData || croppedImageData.length < 100) {
                    console.error('❌ AI Chat: Image data not properly set');
                    alert('画像データの設定に失敗しました。');
                    return;
                }
                
                if (!croppedImageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image data format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // Base64部分のチェック
                const parts = croppedImageData.split(',');
                if (parts.length === 2) {
                    const base64Part = parts[1];
                    console.log('✂️ AI Chat: Base64 part length:', base64Part.length);
                    console.log('✂️ AI Chat: Base64 valid chars test:', /^[A-Za-z0-9+/=]*$/.test(base64Part));
                    
                    if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                        console.error('❌ AI Chat: Invalid base64 characters');
                        alert('画像データに不正な文字が含まれています。');
                        return;
                    }
                } else {
                    console.error('❌ AI Chat: Invalid data URL format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // グローバル変数に設定
                currentImageData = croppedImageData;
                
            } catch (error) {
                console.error('❌ AI Chat: Error converting to base64:', error);
                alert('画像の変換中にエラーが発生しました。');
                return;
            }
            
            // UIを更新（クロップエリアを隠す）
            console.log('✂️ AI Chat: Updating UI for integrated flow');
            cropArea.style.display = 'none';
            imagePreviewArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
            
            // cropperを破棄
            if (cropper) {
                cropper.destroy();
                cropper = null;
                console.log('✂️ AI Chat: Cropper destroyed');
            }
            
            // 画像モード用のUI更新（この画像で送信、キャンセルボタン非表示）
            updateSendButtonForImageMode();
            
            // 画像添付インジケーターを表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'block';
            }
            
            console.log('✂️ AI Chat: Crop completed, ready for integrated send');
        }
        
        // 画像確定（クロップなし、画像データを準備）
        function confirmImage() {
            console.log('🖼️ AI Chat: Confirm image called (UI integrated flow)');
            
            if (previewImage.src && !currentImageData) {
                // クロップしていない場合は元画像を使用
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    // 768px以下にリサイズ（文字認識のため品質重視）
                    const maxSize = 768;
                    let { width, height } = img;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        } else {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = canvas.toDataURL('image/jpeg', 0.95);
                    
                    console.log('🖼️ AI Chat: Image processed, length:', imageData.length);
                    console.log('🖼️ AI Chat: Image data starts with:', imageData.substring(0, 50));
                    console.log('🖼️ AI Chat: Image data format check:', imageData.startsWith('data:image/'));
                    
                    // 画像データの検証
                    if (!imageData.startsWith('data:image/')) {
                        console.error('❌ AI Chat: Invalid image data format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    const parts = imageData.split(',');
                    if (parts.length === 2) {
                        const base64Part = parts[1];
                        console.log('🖼️ AI Chat: Base64 part length:', base64Part.length);
                        if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                            console.error('❌ AI Chat: Invalid base64 characters in confirmImage');
                            alert('画像データに不正な文字が含まれています。');
                            return;
                        }
                    } else {
                        console.error('❌ AI Chat: Invalid data URL format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    currentImageData = imageData;
                    console.log('🖼️ AI Chat: Image processed and validated, ready for integrated UI');
                    
                    // UI更新
                    imagePreviewArea.style.display = 'none';
                    clearImageBtn.style.display = 'inline-block';
                    
                    // 送信ボタンのテキストを変更
                    updateSendButtonForImageMode();
                    
                    // 画像添付インジケーターを表示
                    const indicator = document.getElementById('imageAttachmentIndicator');
                    if (indicator) {
                        indicator.style.display = 'block';
                    }
                    
                    console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
                };
                
                img.src = previewImage.src;
            } else {
                // 既に画像データがある場合
                console.log('🖼️ AI Chat: Using existing image data');
                
                // UI更新
                imagePreviewArea.style.display = 'none';
                clearImageBtn.style.display = 'inline-block';
                
                // 送信ボタンのテキストを変更
                updateSendButtonForImageMode();
                
                // 画像添付インジケーターを表示
                const indicator = document.getElementById('imageAttachmentIndicator');
                if (indicator) {
                    indicator.style.display = 'block';
                }
                
                console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
            }
        }
        
        function clearImage() {
            console.log('🗑️ AI Chat: clearImage() called, currentImageData before clear:', !!currentImageData);
            currentImageData = null;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'none';
            
            // 画像添付インジケーターを非表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            
            // 送信ボタンをテキストモードに戻す
            updateSendButtonForTextMode();
            
            // 入力要素をリセット
            cameraInput.value = '';
            fileInput.value = '';
            
            console.log('🗑️ AI Chat: Image cleared and indicator hidden, currentImageData after clear:', currentImageData);
        }
        
        // クロップモード時のUI更新
        function updateUIForCropMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この範囲で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'inline-block';
            }
            
            console.log('✂️ AI Chat: UI updated for crop mode - send button: "この範囲で送信", cancel button: visible');
        }
        
        // 送信ボタンのテキストを画像モード用に更新
        function updateSendButtonForImageMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この画像で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('🖼️ AI Chat: UI updated for image mode - send button: "この画像で送信", cancel button: hidden');
        }
        
        // 送信ボタンのテキストをテキストモード用に更新
        function updateSendButtonForTextMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = '送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('📝 AI Chat: UI updated for text mode - send button: "送信", cancel button: hidden');
        }
        
        // 通常モード時のUI更新
        function updateUIForNormalMode() {
            updateSendButtonForTextMode();
            console.log('🔄 AI Chat: UI updated for normal mode');
        }

        // 統合送信関数：画像とメッセージを同時に送信
        async function sendQuestionIntegrated(question, imageData) {
            console.log('📤 AI Chat: ===== INTEGRATED SEND CALLED =====');
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 Has image data:', !!imageData);
            console.log('📤 Image data length:', imageData ? imageData.length : 0);
            
            if (imageData) {
                console.log('📤 Image data starts with:', imageData.substring(0, 50));
                console.log('📤 Image data format valid:', imageData.startsWith('data:image/'));
                
                // 送信前の最終検証
                if (!imageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image format at send time');
                    alert('画像データの形式が正しくありません。再度お試しください。');
                    return;
                }
                
                const parts = imageData.split(',');
                if (parts.length !== 2) {
                    console.error('❌ AI Chat: Invalid data URL structure at send time');
                    alert('画像データの構造が正しくありません。再度お試しください。');
                    return;
                }
                
                const base64Part = parts[1];
                if (!base64Part || !/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                    console.error('❌ AI Chat: Invalid base64 data at send time');
                    alert('画像データが破損しています。再度お試しください。');
                    return;
                }
                
                console.log('✅ AI Chat: Image data validation passed at send time');
            }
            
            if (!question && !imageData) {
                console.error('❌ AI Chat: Both question and image are empty');
                alert('質問を入力するか、画像を選択してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with integrated request');
            
            // ユーザーメッセージを表示
            let displayMessage = question || '📷 画像について質問';
            if (imageData && question) {
                displayMessage = '📷 ' + question;
            }
            addMessage(displayMessage, 'user');
            
            // 画像がある場合は画像も表示
            if (imageData) {
                addImageMessage(imageData, 'user');
            }
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending integrated request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question || '(empty)');
                console.log('  - imageData exists:', !!imageData);
                if (imageData) {
                    console.log('  - imageData length:', imageData.length);
                    console.log('  - imageData preview:', imageData.substring(0, 50) + '...');
                }
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: imageData
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat integrated error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }

        // メイン送信関数（統合フローサポート）
        async function sendQuestion() {
            console.log('📤 AI Chat: ===== SEND QUESTION CALLED =====');
            
            // クロップモード中の場合は、まずクロップを確定してから送信
            if (cropper && cropArea.style.display !== 'none') {
                console.log('✂️ AI Chat: In crop mode, executing confirmCrop first');
                confirmCrop();
                
                // クロップ確定後、少し待ってから送信処理を実行
                setTimeout(() => {
                    console.log('✂️ AI Chat: Auto-executing send after crop confirmation');
                    sendQuestion();
                }, 100);
                return;
            }
            
            const question = questionInput.value.trim();
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 currentImageData exists:', !!currentImageData);
            
            // 画像データがある場合は統合送信を使用
            if (currentImageData) {
                console.log('📤 AI Chat: Using integrated flow (image + text)');
                const imageData = currentImageData;
                clearImage(); // UI クリア
                sendQuestionIntegrated(question, imageData);
                return;
            }
            
            // テキストのみの場合は従来の処理
            console.log('📤 AI Chat: Using text-only flow');
            
            if (!question) {
                console.error('❌ AI Chat: No question provided');
                alert('質問を入力してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with text-only request');
            
            // ユーザーメッセージを表示
            addMessage(question, 'user');
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending text-only request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question);
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: null
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat text-only error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }
        
        function addMessage(text, sender, isLoading = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            if (isLoading) {
                messageDiv.innerHTML = '<div class="loading"><div class="loading-spinner"></div>考えています...</div>';
            } else {
                messageDiv.textContent = text;
                
                // AIメッセージの場合の処理
                if (sender === 'ai') {
                    // テキストをHTMLに変換（改行を<br>に）
                    messageDiv.innerHTML = text.replace(new RegExp('\\n', 'g'), '<br>');
                    
                    // MathJaxでレンダリング
                    if (window.MathJax) {
                        window.MathJax.typesetPromise([messageDiv]).catch((err) => {
                            console.error('MathJax rendering error:', err);
                        });
                    }
                    
                    // 音声読み上げボタンを追加
                    if (text && 'speechSynthesis' in window) {
                        const speakBtn = document.createElement('button');
                        speakBtn.innerHTML = '<i class="fas fa-volume-up"></i> 読み上げ';
                        speakBtn.style.cssText = 'margin-top: 0.5rem; padding: 0.375rem 0.75rem; background: #7c3aed; color: white; border: none; border-radius: 0.375rem; cursor: pointer; font-size: 0.875rem; display: inline-flex; align-items: center; gap: 0.375rem;';
                        speakBtn.onclick = () => speakText(text);
                        messageDiv.appendChild(speakBtn);
                    }
                }
            }
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        function addImageMessage(imageSrc, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.maxWidth = '200px';
            img.style.maxHeight = '150px';
            img.style.borderRadius = '0.5rem';
            img.style.cursor = 'pointer';
            img.onclick = () => {
                // 画像クリックで拡大表示
                const newWindow = window.open('', '_blank', 'width=800,height=600');
                newWindow.document.write('<html><head><title>画像拡大表示</title></head><body style="margin:0; display:flex; justify-content:center; align-items:center; background:#000;"><img src="' + imageSrc + '" style="max-width:100%; max-height:100%; object-fit:contain;"></body></html>');
            };
            
            messageDiv.appendChild(img);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        // 音声入力機能
        let recognition = null;
        let isVoiceInputActive = false;
        
        function initVoiceInput() {
            const voiceInputBtn = document.getElementById('voiceInputBtn');
            if (!voiceInputBtn) {
                console.warn('⚠️ Voice input button not found');
                return;
            }
            
            // Web Speech API (音声認識) の初期化
            if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
                const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                recognition = new SpeechRecognition();
                recognition.lang = 'ja-JP';
                recognition.continuous = false;
                recognition.interimResults = true;
                
                recognition.onstart = () => {
                    console.log('🎤 音声認識開始');
                    isVoiceInputActive = true;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'block';
                    voiceInputBtn.style.background = '#f59e0b';
                    voiceInputBtn.style.color = 'white';
                };
                
                recognition.onresult = (event) => {
                    let interimTranscript = '';
                    let finalTranscript = '';
                    
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const transcript = event.results[i][0].transcript;
                        if (event.results[i].isFinal) {
                            finalTranscript += transcript;
                        } else {
                            interimTranscript += transcript;
                        }
                    }
                    
                    if (finalTranscript && questionInput) {
                        console.log('🎤 音声認識結果（確定）:', finalTranscript);
                        questionInput.value = finalTranscript;
                    }
                };
                
                recognition.onerror = (event) => {
                    console.error('🎤 音声認識エラー:', event.error);
                    isVoiceInputActive = false;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'none';
                    voiceInputBtn.style.background = '';
                    voiceInputBtn.style.color = '';
                    
                    if (event.error !== 'no-speech') {
                        alert('音声認識エラーが発生しました: ' + event.error);
                    }
                };
                
                recognition.onend = () => {
                    console.log('🎤 音声認識終了');
                    isVoiceInputActive = false;
                    const statusEl = document.getElementById('voiceInputStatus');
                    if (statusEl) statusEl.style.display = 'none';
                    voiceInputBtn.style.background = '';
                    voiceInputBtn.style.color = '';
                };
                
                // 音声入力ボタンのイベント
                voiceInputBtn.addEventListener('click', () => {
                    if (!recognition) {
                        alert('お使いのブラウザは音声入力に対応していません。Chrome、Edge、Safariをお使いください。');
                        return;
                    }
                    
                    if (isVoiceInputActive) {
                        recognition.stop();
                    } else {
                        recognition.start();
                    }
                });
                
                console.log('✅ Voice input initialized');
            } else {
                console.warn('⚠️ Speech recognition not supported');
            }
        }
        
        // 音声読み上げ機能（AI の回答を読み上げ）
        function speakText(text) {
            if ('speechSynthesis' in window) {
                // 既存の読み上げを停止
                window.speechSynthesis.cancel();
                
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = 'ja-JP';
                utterance.rate = 1.0;
                utterance.pitch = 1.0;
                utterance.volume = 1.0;
                
                window.speechSynthesis.speak(utterance);
                console.log('🔊 音声読み上げ開始');
            }
        }
        

        
        // 初期フォーカス
        questionInput.focus();
        
            })(); // End of IIFE
        }); // End of DOMContentLoaded
        </script>
    </body>
    </html>
  `)
})

// ==========================================
// AI Chat API エンドポイント
// ==========================================
app.post('/api/ai-chat', async (c) => {
  try {
    const { sessionId, question } = await c.req.json()
    
    console.log('🤖 AI Chat API: Received request')
    console.log('📍 Session ID:', sessionId)
    console.log('❓ Question:', question)
    
    // OpenAI APIキーを環境変数から取得
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment')
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIキーが設定されていません' 
      })
    }
    
    // OpenAI APIを呼び出し
    console.log('🔄 Calling OpenAI API...')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `あなたは中学生向けの優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜である」「〜です」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

【数式のルール】
- 数式は必ず $$数式$$ の形式で書く（インライン数式は $数式$ を使う）
- 例: $$x^2 + y^2 = r^2$$ や $a = 5$ など
- \\( \\) や \\[ \\] は使わない

【数学記号のルール】
- 角度は必ず「∠」記号を使う（例: ∠ABC、∠BAF = 90°）
- 三角形は必ず「△」記号を使う（例: △ABC）
- 合同記号は「≡」を使う（例: △ABC ≡ △DEF）
- 平行は「∥」、垂直は「⊥」を使う
- 度数は必ず「°」を付ける（例: 90°、45°）
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記

【証明・解説のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説
4. 証明は1ステップ1-2行以内で簡潔に
5. 各ステップの間には改行を1つだけ入れる（空行は入れない）

分かりやすく、親しみやすく、そして正確に教えてください。`
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', response.status, errorText)
      return c.json({ 
        ok: false, 
        message: `OpenAI APIエラー: ${response.status}` 
      })
    }
    
    const data = await response.json()
    const answer = data.choices[0].message.content
    
    console.log('✅ OpenAI API response received')
    console.log('💬 Answer:', answer.substring(0, 100) + '...')
    
    return c.json({ 
      ok: true, 
      answer: answer 
    })
    
  } catch (error) {
    console.error('❌ AI Chat API error:', error)
    return c.json({ 
      ok: false, 
      message: 'サーバーエラーが発生しました' 
    })
  }
})

// ==========================================
// AI Chat 画像対応 API エンドポイント
// ==========================================
app.post('/api/ai-chat-image', async (c) => {
  try {
    console.log('📸 AI Chat Image API: Received request')
    
    // FormDataから画像とテキストを取得
    let formData
    try {
      formData = await c.req.formData()
      console.log('✅ FormData parsed successfully')
    } catch (formError) {
      console.error('❌ FormData parsing error:', formError)
      return c.json({ 
        ok: false, 
        message: 'FormDataの解析に失敗しました' 
      })
    }
    
    const image = formData.get('image') as File | null
    const sessionId = formData.get('sessionId') as string
    const message = formData.get('message') as string
    
    console.log('📍 Session ID:', sessionId)
    console.log('💬 Message:', message)
    console.log('🖼️ Image:', image ? `${image.name} (${image.size} bytes)` : 'none')
    
    if (!image) {
      console.error('❌ No image found in FormData')
      return c.json({ 
        ok: false, 
        message: '画像が見つかりません' 
      })
    }
    
    // OpenAI APIキーを環境変数から取得
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment')
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIキーが設定されていません' 
      })
    }
    
    // 画像をBase64に変換（最適化された方法）
    console.log('🔄 Converting image to base64...')
    let base64Image
    try {
      const arrayBuffer = await image.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      // チャンクごとに変換してメモリ効率を改善
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      base64Image = btoa(binary)
      
      console.log('✅ Image converted to base64 (length:', base64Image.length, ')')
    } catch (conversionError) {
      console.error('❌ Image conversion error:', conversionError)
      return c.json({ 
        ok: false, 
        message: '画像の変換に失敗しました' 
      })
    }
    
    console.log('🔄 Calling OpenAI Vision API...')
    
    // OpenAI Vision APIを呼び出し
    let response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `あなたは中学生向けの優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜である」「〜です」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

【数式のルール】
- 数式は必ず $$数式$$ の形式で書く（インライン数式は $数式$ を使う）
- 例: $$x^2 + y^2 = r^2$$ や $a = 5$ など
- \\( \\) や \\[ \\] は使わない

【数学記号のルール】
- 角度は必ず「∠」記号を使う（例: ∠ABC、∠BAF = 90°）
- 三角形は必ず「△」記号を使う（例: △ABC）
- 合同記号は「≡」を使う（例: △ABC ≡ △DEF）
- 平行は「∥」、垂直は「⊥」を使う
- 度数は必ず「°」を付ける（例: 90°、45°）
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記

【証明・解説のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説
4. 証明は1ステップ1-2行以内で簡潔に
5. 各ステップの間には改行を1つだけ入れる（空行は入れない）

分かりやすく、親しみやすく、そして正確に教えてください。`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: message || '画像の内容を説明してください。'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64Image}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
        })
      })
      
      console.log('✅ OpenAI API response status:', response.status)
    } catch (fetchError) {
      console.error('❌ OpenAI API fetch error:', fetchError)
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIへの接続に失敗しました' 
      })
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI Vision API error:', response.status, errorText)
      return c.json({ 
        ok: false, 
        message: `OpenAI APIエラー: ${response.status}` 
      })
    }
    
    const data = await response.json()
    const answer = data.choices[0].message.content
    
    console.log('✅ OpenAI Vision API response received')
    console.log('💬 Answer:', answer.substring(0, 100) + '...')
    
    return c.json({ 
      ok: true, 
      answer: answer 
    })
    
  } catch (error) {
    console.error('❌ AI Chat Image API error:', error)
    console.error('Error details:', error.message, error.stack)
    return c.json({ 
      ok: false, 
      message: `サーバーエラーが発生しました: ${error.message}` 
    })
  }
})

// ==========================================
// 新しいシンプル版AIチャット (v2)
// ==========================================
app.get('/ai-chat-v2/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🤖 AI Chat V2: Simple version requested for session:', sessionId)
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI学習サポート - KOBEYA</title>
    <!-- KaTeX for math rendering -->
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css">
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js"></script>
    <script defer src="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js"></script>
    <!-- Cropper.js for image cropping -->
    <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
    <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
    <!-- Font Awesome for icons -->
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Noto Sans JP', sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 1rem;
        }
        
        .chat-container {
            width: 100%;
            max-width: 800px;
            height: 90vh;
            background: white;
            border-radius: 1rem;
            box-shadow: 0 20px 60px rgba(0,0,0,0.3);
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        
        .chat-header {
            background: linear-gradient(135deg, #7c3aed, #8b5cf6);
            color: white;
            padding: 1.5rem;
            text-align: center;
        }
        
        .chat-header h1 {
            font-size: 1.5rem;
            font-weight: 600;
        }
        
        .chat-messages {
            flex: 1;
            padding: 1.5rem;
            overflow-y: auto;
            background: #f8fafc;
        }
        
        .message {
            margin-bottom: 1rem;
            padding: 1rem;
            border-radius: 1rem;
            max-width: 80%;
            line-height: 1.6;
            animation: slideIn 0.3s ease;
        }
        
        @keyframes slideIn {
            from {
                opacity: 0;
                transform: translateY(10px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        .message.user {
            background: #e0e7ff;
            margin-left: auto;
            text-align: right;
        }
        
        .message.ai {
            background: white;
            border: 1px solid #e5e7eb;
        }
        
        .message.loading {
            background: white;
            border: 1px solid #e5e7eb;
            display: flex;
            align-items: center;
            gap: 0.5rem;
        }
        
        .loading-dots {
            display: flex;
            gap: 4px;
        }
        
        .loading-dots span {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: #7c3aed;
            animation: bounce 1.4s infinite ease-in-out both;
        }
        
        .loading-dots span:nth-child(1) {
            animation-delay: -0.32s;
        }
        
        .loading-dots span:nth-child(2) {
            animation-delay: -0.16s;
        }
        
        @keyframes bounce {
            0%, 80%, 100% {
                transform: scale(0);
            }
            40% {
                transform: scale(1);
            }
        }
        
        .chat-input-area {
            padding: 1rem;
            background: white;
            border-top: 1px solid #e5e7eb;
        }
        
        .input-group {
            display: flex;
            gap: 0.5rem;
        }
        
        #messageInput {
            flex: 1;
            padding: 0.75rem 1rem;
            border: 1px solid #e5e7eb;
            border-radius: 0.5rem;
            font-size: 1rem;
            font-family: inherit;
            resize: none;
            min-height: 44px;
            max-height: 120px;
        }
        
        #messageInput:focus {
            outline: none;
            border-color: #7c3aed;
            box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }
        
        #sendButton {
            padding: 0.75rem 1.5rem;
            background: #7c3aed;
            color: white;
            border: none;
            border-radius: 0.5rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 0.2s;
        }
        
        #sendButton:hover {
            background: #6d28d9;
            transform: translateY(-1px);
        }
        
        #sendButton:active {
            transform: translateY(0);
        }
        
        #sendButton:disabled {
            background: #d1d5db;
            cursor: not-allowed;
            transform: none;
        }
        
        .error-message {
            background: #fee2e2;
            color: #dc2626;
            padding: 1rem;
            border-radius: 0.5rem;
            margin-bottom: 1rem;
        }
        
        /* Camera & Image Styles */
        .camera-buttons {
            display: flex;
            gap: 0.5rem;
            margin-bottom: 0.5rem;
        }
        
        .camera-buttons button {
            flex: 1;
            padding: 0.75rem;
            background: #374151;
            font-size: 0.9rem;
        }
        
        .camera-buttons button:hover:not(:disabled) {
            background: #1f2937;
        }
        
        .image-preview-area, .crop-area {
            background: white;
            border: 2px solid #e5e7eb;
            border-radius: 0.75rem;
            margin-bottom: 1rem;
            overflow: hidden;
            display: none;
        }
        
        .image-preview-area.active, .crop-area.active {
            display: block;
        }
        
        .preview-header, .crop-header {
            background: #f3f4f6;
            padding: 0.75rem 1rem;
            border-bottom: 2px solid #e5e7eb;
            font-weight: 600;
            font-size: 0.9rem;
        }
        
        .preview-content, .crop-content {
            padding: 1rem;
            text-align: center;
        }
        
        .preview-image, .crop-image {
            max-width: 100%;
            max-height: 300px;
            border-radius: 0.5rem;
        }
        
        .preview-actions, .crop-actions {
            padding: 1rem;
            border-top: 1px solid #e5e7eb;
            display: flex;
            gap: 0.5rem;
        }
        
        .preview-actions button, .crop-actions button {
            flex: 1;
            padding: 0.75rem;
            font-size: 0.9rem;
        }
        
        .btn-secondary {
            background: #6b7280 !important;
        }
        
        .btn-secondary:hover:not(:disabled) {
            background: #4b5563 !important;
        }
        
        .btn-success {
            background: #10b981 !important;
        }
        
        .btn-success:hover:not(:disabled) {
            background: #059669 !important;
        }
        
        input[type="file"] {
            display: none;
        }
    </style>
</head>
<body>
    <div class="chat-container">
        <div class="chat-header">
            <h1>🤖 AI学習サポート</h1>
            <p style="font-size: 0.9rem; margin-top: 0.5rem; opacity: 0.9;">何でもお聞きください！</p>
        </div>
        
        <div class="chat-messages" id="chatMessages">
            <div class="message ai">
                こんにちは！学習でわからないことがあれば、何でも質問してください。丁寧に説明いたします！
            </div>
        </div>
        
        <!-- Image Preview Area -->
        <div class="image-preview-area" id="imagePreviewArea">
            <div class="preview-header">📸 選択された画像</div>
            <div class="preview-content">
                <img id="previewImage" class="preview-image" alt="Preview">
            </div>
            <div class="preview-actions">
                <button id="btnClearImage" class="btn-secondary">
                    <i class="fas fa-times"></i> キャンセル
                </button>
                <button id="btnStartCrop" class="btn-success">
                    <i class="fas fa-crop"></i> 範囲を調整
                </button>
                <button id="btnSendDirect" class="btn-success">
                    <i class="fas fa-paper-plane"></i> そのまま送信
                </button>
            </div>
        </div>
        
        <!-- Crop Area -->
        <div class="crop-area" id="cropArea">
            <div class="crop-header">✂️ 範囲を選択してください</div>
            <div class="crop-content">
                <img id="cropImage" class="crop-image" alt="Crop">
            </div>
            <div class="crop-actions">
                <button id="btnCancelCrop" class="btn-secondary">
                    <i class="fas fa-arrow-left"></i> 戻る
                </button>
                <button id="btnConfirmCrop" class="btn-success">
                    <i class="fas fa-check"></i> この範囲で送信
                </button>
            </div>
        </div>
        
        <div class="chat-input-area">
            <!-- Camera Buttons -->
            <div class="camera-buttons">
                <button id="cameraButton">
                    <i class="fas fa-camera"></i> カメラ
                </button>
                <button id="fileButton">
                    <i class="fas fa-folder-open"></i> ファイル
                </button>
            </div>
            <input type="file" id="cameraInput" accept="image/*" capture="environment">
            <input type="file" id="fileInput" accept="image/*">
            
            <div class="input-group">
                <textarea 
                    id="messageInput" 
                    placeholder="質問を入力してください..."
                    rows="1"
                ></textarea>
                <button id="sendButton">送信</button>
            </div>
        </div>
    </div>
    
    <script>
        // セッションID（サーバーから注入）
        const SESSION_ID = ${JSON.stringify(sessionId)};
        
        // DOM要素
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        // Camera elements
        const cameraButton = document.getElementById('cameraButton');
        const fileButton = document.getElementById('fileButton');
        const cameraInput = document.getElementById('cameraInput');
        const fileInput = document.getElementById('fileInput');
        const imagePreviewArea = document.getElementById('imagePreviewArea');
        const previewImage = document.getElementById('previewImage');
        const btnClearImage = document.getElementById('btnClearImage');
        const btnStartCrop = document.getElementById('btnStartCrop');
        const btnSendDirect = document.getElementById('btnSendDirect');
        const cropArea = document.getElementById('cropArea');
        const cropImage = document.getElementById('cropImage');
        const btnCancelCrop = document.getElementById('btnCancelCrop');
        const btnConfirmCrop = document.getElementById('btnConfirmCrop');
        
        let cropper = null;
        let currentImageData = null;
        
        // KaTeX delimiters（エスケープ対応）
        const backslash = String.fromCharCode(92);
        const leftBracket = backslash + '[';
        const rightBracket = backslash + ']';
        const leftParen = backslash + '(';
        const rightParen = backslash + ')';
        
        const mathDelimiters = [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false},
            {left: leftBracket, right: rightBracket, display: true},
            {left: leftParen, right: rightParen, display: false}
        ];
        
        // 初期化ログ
        console.log('✅ AI Chat V2 initialized');
        console.log('📍 Session ID:', SESSION_ID);
        console.log('📷 Camera button element:', cameraButton);
        console.log('📁 File button element:', fileButton);
        console.log('📸 Camera input element:', cameraInput);
        console.log('🗂️ File input element:', fileInput);
        
        // メッセージ追加関数（改行とKaTeX対応）
        function addMessage(text, type = 'user') {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + type;
            
            // AIメッセージの場合、数学記号を自動変換
            let processedText = text;
            if (type === 'ai') {
                // 「角 ABC」→「∠ABC」
                processedText = processedText.replace(/角\s*([A-Z]{2,4})/g, '∠$1');
                // 「三角形 ABC」→「△ABC」
                processedText = processedText.replace(/三角形\s*([A-Z]{3,4})/g, '△$1');
                // 「線分 AB」→「AB」（シンプルに）
                processedText = processedText.replace(/線分\s*([A-Z]{2})/g, '$1');
                // 「辺 AB」→「AB」（シンプルに）
                processedText = processedText.replace(/辺\s*([A-Z]{2})/g, '$1');
            }
            
            // 改行を<br>タグに変換（Viteビルド対応）
            const newlineChar = String.fromCharCode(10);
            const regex = new RegExp(newlineChar, 'g');
            const formattedText = processedText.replace(regex, '<br>');
            messageDiv.innerHTML = formattedText;
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            // AIメッセージの場合、KaTeXで数式をレンダリング
            if (type === 'ai' && typeof renderMathInElement !== 'undefined') {
                setTimeout(() => {
                    renderMathInElement(messageDiv, {
                        delimiters: mathDelimiters,
                        throwOnError: false
                    });
                }, 100);
            }
            
            return messageDiv;
        }
        
        // ローディング表示
        function showLoading() {
            const loadingDiv = document.createElement('div');
            loadingDiv.className = 'message loading';
            loadingDiv.innerHTML = '<span>考えています</span><div class="loading-dots"><span></span><span></span><span></span></div>';
            chatMessages.appendChild(loadingDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            return loadingDiv;
        }
        
        // エラー表示
        function showError(message) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = '❌ ' + message;
            chatMessages.appendChild(errorDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
        }
        
        // メッセージ送信
        async function sendMessage() {
            const message = messageInput.value.trim();
            
            if (!message) {
                return;
            }
            
            console.log('📤 Sending message:', message);
            
            // ユーザーメッセージ表示
            addMessage(message, 'user');
            messageInput.value = '';
            messageInput.style.height = 'auto';
            
            // 送信ボタン無効化
            sendButton.disabled = true;
            
            // ローディング表示
            const loadingDiv = showLoading();
            
            try {
                // API呼び出し
                const response = await fetch('/api/ai-chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: SESSION_ID,
                        question: message
                    })
                });
                
                const data = await response.json();
                
                // ローディング削除
                loadingDiv.remove();
                
                if (data.ok) {
                    console.log('✅ Response received');
                    addMessage(data.answer, 'ai');
                } else {
                    console.error('❌ API error:', data.message);
                    showError(data.message || 'エラーが発生しました');
                }
            } catch (error) {
                console.error('❌ Network error:', error);
                loadingDiv.remove();
                showError('通信エラーが発生しました。もう一度お試しください。');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
            }
        }
        
        // イベントリスナー
        sendButton.addEventListener('click', sendMessage);
        
        messageInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        // テキストエリア自動リサイズ
        messageInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 120) + 'px';
        });
        
        // 初期フォーカス
        messageInput.focus();
        
        console.log('✅ Event listeners attached');
        
        // 初期メッセージの数式もレンダリング
        setTimeout(() => {
            if (typeof renderMathInElement !== 'undefined') {
                renderMathInElement(document.body, {
                    delimiters: mathDelimiters,
                    throwOnError: false
                });
            }
        }, 500);
        
        // ========== Camera & Image Functions ==========
        
        console.log('🔧 Setting up camera event listeners...');
        
        // Camera button click - Trigger camera input
        if (cameraButton) {
            console.log('✅ Camera button found, adding event listener');
            cameraButton.addEventListener('click', () => {
                console.log('📷 Camera button clicked - triggering camera input');
                if (cameraInput) {
                    console.log('📸 Triggering camera input element');
                    cameraInput.click();
                } else {
                    console.error('❌ Camera input not found');
                }
            });
        } else {
            console.error('❌ Camera button not found in DOM');
        }
        
        // File button click
        if (fileButton) {
            console.log('✅ File button found, adding event listener');
            fileButton.addEventListener('click', () => {
                console.log('📁 File button clicked');
                if (fileInput) {
                    console.log('🗂️ Triggering file input');
                    fileInput.click();
                } else {
                    console.error('❌ File input not found');
                }
            });
        } else {
            console.error('❌ File button not found in DOM');
        }
        
        // Handle image selection
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('📸 Image selected:', file.name);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                currentImageData = e.target.result;
                previewImage.src = currentImageData;
                imagePreviewArea.classList.add('active');
                cropArea.classList.remove('active');
            };
            reader.readAsDataURL(file);
        }
        
        if (cameraInput) cameraInput.addEventListener('change', handleImageSelect);
        if (fileInput) fileInput.addEventListener('change', handleImageSelect);
        
        // Clear image
        if (btnClearImage) {
            btnClearImage.addEventListener('click', () => {
                console.log('❌ Clear image');
                imagePreviewArea.classList.remove('active');
                cropArea.classList.remove('active');
                currentImageData = null;
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                cameraInput.value = '';
                fileInput.value = '';
            });
        }
        
        // Start crop
        if (btnStartCrop) {
            btnStartCrop.addEventListener('click', () => {
                console.log('✂️ Start crop');
                cropImage.src = currentImageData;
                imagePreviewArea.classList.remove('active');
                cropArea.classList.add('active');
                
                setTimeout(() => {
                    if (cropper) cropper.destroy();
                    
                    cropper = new Cropper(cropImage, {
                        aspectRatio: NaN,
                        viewMode: 1,
                        dragMode: 'move',
                        autoCropArea: 0.9,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false
                    });
                }, 100);
            });
        }
        
        // Cancel crop
        if (btnCancelCrop) {
            btnCancelCrop.addEventListener('click', () => {
                console.log('⬅️ Cancel crop');
                if (cropper) {
                    cropper.destroy();
                    cropper = null;
                }
                cropArea.classList.remove('active');
                imagePreviewArea.classList.add('active');
            });
        }
        
        // Confirm crop
        if (btnConfirmCrop) {
            btnConfirmCrop.addEventListener('click', () => {
                console.log('✅ Confirm crop');
                
                if (cropper) {
                    const canvas = cropper.getCroppedCanvas({
                        maxWidth: 2000,
                        maxHeight: 2000,
                        fillColor: '#fff',
                        imageSmoothingEnabled: true,
                        imageSmoothingQuality: 'high'
                    });
                    
                    currentImageData = canvas.toDataURL('image/jpeg', 0.8);
                    cropper.destroy();
                    cropper = null;
                }
                
                sendImageMessage(currentImageData);
            });
        }
        
        // Send direct (no crop)
        if (btnSendDirect) {
            btnSendDirect.addEventListener('click', () => {
                console.log('📤 Send direct');
                sendImageMessage(currentImageData);
            });
        }
        
        // Send image message
        async function sendImageMessage(imageData) {
            if (!imageData) return;
            
            const message = messageInput.value.trim() || '画像について教えてください';
            
            console.log('📤 Sending image message');
            
            // Hide image areas
            imagePreviewArea.classList.remove('active');
            cropArea.classList.remove('active');
            
            // Add user message
            addMessage('📷 ' + message, 'user');
            messageInput.value = '';
            
            sendButton.disabled = true;
            const loadingDiv = showLoading();
            
            try {
                // Convert base64 to blob
                const response = await fetch(imageData);
                const blob = await response.blob();
                
                // Create FormData
                const formData = new FormData();
                formData.append('image', blob, 'image.jpg');
                formData.append('sessionId', SESSION_ID);
                formData.append('message', message);
                
                // Send to API
                const apiResponse = await fetch('/api/ai-chat-image', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await apiResponse.json();
                
                loadingDiv.remove();
                
                if (data.ok) {
                    console.log('✅ Image response received');
                    addMessage(data.answer, 'ai');
                } else {
                    console.error('❌ API error:', data.message);
                    showError(data.message || 'エラーが発生しました');
                }
            } catch (error) {
                console.error('❌ Network error:', error);
                loadingDiv.remove();
                showError('通信エラーが発生しました');
            } finally {
                sendButton.disabled = false;
                messageInput.focus();
                currentImageData = null;
                cameraInput.value = '';
                fileInput.value = '';
            }
        }
        
        console.log('✅ Camera functions initialized');
    </script>
</body>
</html>
  `)
})

// 小論文指導ページ

// 小論文指導 - 授業セッションページ
app.get('/essay-coaching/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('📝 Essay session page requested:', sessionId)
  
  // セッション情報を取得（D1から復元も試みる）
  const db = c.env?.DB
  const session = await getOrCreateSession(db, sessionId)
  if (!session || !session.essaySession) {
    return c.html('<h1>セッションが見つかりません</h1><p>セッションIDが無効か、有効期限が切れている可能性があります。</p><a href="/essay-coaching">新しいセッションを開始</a>')
  }
  
  const essaySession = session.essaySession
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>小論文授業 - KOBEYA</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Eruda Mobile Console (for debugging on mobile/tablet) -->
        <script src="https://cdn.jsdelivr.net/npm/eruda"></script>
        <script>
          // URLパラメータで ?debug=true または 画面幅が1024px以下の場合に有効化
          const urlParams = new URLSearchParams(window.location.search);
          const isDebugMode = urlParams.get('debug') === 'true';
          const isMobile = window.innerWidth < 1024;
          
          if (isDebugMode || isMobile) {
            eruda.init();
            console.log('🐛 Eruda mobile console initialized');
          }
        </script>
        
        <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        
        body {
          font-family: 'Noto Sans JP', sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          padding: 1rem;
          color: #333;
        }
        
        .container {
          max-width: 900px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
        }
        
        .header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 1.5rem 2rem;
        }
        
        .header-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
        }
        
        .header h1 {
          font-size: 1.5rem;
        }
        
        .session-info {
          font-size: 0.875rem;
          opacity: 0.9;
        }
        
        /* ステップ進捗バー */
        .progress-bar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0;
          margin-top: 1rem;
        }
        
        .step {
          flex: 1;
          text-align: center;
          position: relative;
        }
        
        .step::before {
          content: '';
          position: absolute;
          top: 15px;
          left: 0;
          right: 0;
          height: 2px;
          background: rgba(255,255,255,0.3);
          z-index: 0;
        }
        
        .step:first-child::before {
          left: 50%;
        }
        
        .step:last-child::before {
          right: 50%;
        }
        
        .step-circle {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(255,255,255,0.3);
          border: 2px solid rgba(255,255,255,0.5);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 600;
          position: relative;
          z-index: 1;
          margin-bottom: 0.5rem;
        }
        
        .step.completed .step-circle {
          background: #10b981;
          border-color: #10b981;
          color: white;
        }
        
        .step.current .step-circle {
          background: white;
          color: #7c3aed;
          border-color: white;
          box-shadow: 0 0 0 4px rgba(255,255,255,0.3);
        }
        
        .step-label {
          font-size: 0.75rem;
          color: rgba(255,255,255,0.8);
        }
        
        .step.current .step-label {
          color: white;
          font-weight: 600;
        }
        
        .content {
          padding: 2rem;
        }
        
        .chat-section {
          background: #f9fafb;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .messages {
          min-height: 300px;
          max-height: 500px;
          overflow-y: auto;
          margin-bottom: 1rem;
        }
        
        .message {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 0.75rem;
        }
        
        .message.teacher {
          background: #ede9fe;
          border-left: 4px solid #7c3aed;
        }
        
        .message.student {
          background: white;
          border: 1px solid #e5e7eb;
        }
        
        .message .icon {
          font-size: 1.5rem;
          flex-shrink: 0;
        }
        
        .input-area {
          display: flex;
          gap: 0.75rem;
        }
        
        textarea {
          flex: 1;
          min-height: 80px;
          padding: 0.75rem;
          border: 2px solid #e5e7eb;
          border-radius: 0.5rem;
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 1rem;
          resize: vertical;
        }
        
        textarea:focus {
          outline: none;
          border-color: #7c3aed;
        }
        
        button {
          padding: 0.75rem 1.5rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        /* カメラ入力ボタン（入力エリア内） */
        .camera-input-btn {
          background: #f59e0b;
          color: white;
          padding: 0.75rem 1rem;
          min-width: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
        }
        
        .camera-input-btn:hover {
          background: #d97706;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(245, 158, 11, 0.3);
        }
        
        .camera-input-btn i {
          margin: 0;
        }
        
        /* Camera and file buttons (vertical stack) */
        .camera-buttons {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          margin-bottom: 0.75rem;
        }
        
        .camera-buttons button {
          width: 100%;
          padding: 0.875rem 1rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.9rem;
          color: #475569;
          text-align: center;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
        }
        
        .camera-buttons button:hover {
          background: #e2e8f0;
          transform: translateY(-1px);
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        
        .camera-buttons button i {
          font-size: 1rem;
        }
        
        #sendBtn {
          background: #7c3aed;
          color: white;
          min-width: 100px;
        }
        
        #sendBtn:hover {
          background: #6d28d9;
        }
        
        #sendBtn:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        
        .action-buttons {
          display: flex;
          gap: 1rem;
          justify-content: space-between;
        }
        
        .btn {
          padding: 0.875rem 1.75rem;
          border: none;
          border-radius: 0.5rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .btn-secondary {
          background: #e5e7eb;
          color: #374151;
        }
        
        .btn-secondary:hover {
          background: #d1d5db;
        }
        
        .btn-primary {
          background: #7c3aed;
          color: white;
        }
        
        .btn-primary:hover {
          background: #6d28d9;
        }
        
        .hidden {
          display: none !important;
        }
        
        .completion-message {
          background: #d1fae5;
          border: 2px solid #10b981;
          border-radius: 0.75rem;
          padding: 1rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          font-weight: 600;
          color: #065f46;
        }
        
        .completion-message i {
          font-size: 1.5rem;
          color: #10b981;
        }
        
        /* カメラボタン（ヘッダー - 非表示） */
        .camera-btn {
          display: none;
        }
        
        /* カメラモーダル */
        .modal {
          display: none;
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.8);
          z-index: 1000;
          align-items: center;
          justify-content: center;
        }
        
        .modal.active {
          display: flex;
        }
        
        .modal-content {
          background: white;
          border-radius: 1rem;
          padding: 2rem;
          max-width: 600px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        @media (max-width: 768px) {
          .modal-content {
            width: 95%;
            padding: 1rem;
            max-height: 95vh;
          }
        }
        
        .modal-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1.5rem;
        }
        
        .modal-header h2 {
          color: #7c3aed;
          font-size: 1.5rem;
        }
        
        .close-btn {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 2rem;
          height: 2rem;
        }
        
        .close-btn:hover {
          color: #374151;
        }
        
        #cameraPreview, #cameraPreviewSP {
          width: 100%;
          max-height: 50vh;
          max-width: 100%;
          height: auto;
          background: #000;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          object-fit: contain;
        }
        
        #capturedImage, #capturedImageSP {
          width: 100%;
          max-height: 50vh;
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          object-fit: contain;
        }
        
        /* Mobile adjustments for camera */
        @media (max-width: 768px) {
          #cameraPreview, #cameraPreviewSP {
            max-height: 40vh;
          }
          
          #capturedImage, #capturedImageSP {
            max-height: 40vh;
          }
        }
        
        .camera-controls {
          display: flex;
          gap: 0.75rem;
          justify-content: center;
          margin-top: 1rem;
        }
        
        .camera-controls button {
          flex: 1;
          max-width: 200px;
        }
        
        .btn-capture {
          background: #7c3aed;
          color: white;
        }
        
        .btn-capture:hover {
          background: #6d28d9;
        }
        
        .btn-retake {
          background: #f59e0b;
          color: white;
        }
        
        .btn-retake:hover {
          background: #d97706;
        }
        
        .btn-crop {
          background: #f59e0b;
          color: white;
        }
        
        .btn-crop:hover {
          background: #d97706;
        }
        
        .btn-crop-confirm {
          background: #3b82f6;
          color: white;
        }
        
        .btn-crop-confirm:hover {
          background: #2563eb;
        }
        
        .btn-upload {
          background: #10b981;
          color: white;
        }
        
        .btn-upload:hover {
          background: #059669;
        }
        
        /* ワークフロー説明 */
        .workflow-instructions {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          margin-bottom: 1.5rem;
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 0.75rem;
          color: white;
        }
        
        .workflow-step {
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.5rem 1rem;
          background: rgba(255, 255, 255, 0.2);
          border-radius: 0.5rem;
          backdrop-filter: blur(10px);
        }
        
        .workflow-arrow {
          font-size: 1.25rem;
          font-weight: bold;
        }
        
        /* カメラステータス */
        .camera-status {
          text-align: center;
          padding: 0.75rem;
          margin: 1rem 0;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          display: none;
        }
        
        .camera-status.active {
          display: block;
        }
        
        .camera-status.info {
          background: #dbeafe;
          color: #1e40af;
          border: 1px solid #3b82f6;
        }
        
        .camera-status.success {
          background: #dcfce7;
          color: #166534;
          border: 1px solid #22c55e;
        }
        
        /* Crop Canvas */
        #cropCanvas {
          width: 100%;
          max-height: 400px;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          cursor: crosshair;
          border: 2px solid #7c3aed;
        }
        
        .camera-container {
          position: relative;
          width: 100%;
          max-height: 60vh;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
          background: #000;
          border-radius: 0.5rem;
        }
        
        .btn-cancel {
          background: #6b7280;
          color: white;
        }
        
        .btn-cancel:hover {
          background: #4b5563;
        }
        
        /* OCR結果表示 */
        .ocr-result {
          background: #f3f4f6;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin: 1rem 0;
        }
        
        .ocr-result h3 {
          color: #7c3aed;
          margin-bottom: 1rem;
          font-size: 1.125rem;
        }
        
        .ocr-text {
          background: white;
          padding: 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          line-height: 1.8;
          white-space: pre-wrap;
          max-height: 300px;
          overflow-y: auto;
        }
        
        .ocr-stats {
          display: flex;
          gap: 1rem;
          margin-top: 1rem;
          font-size: 0.875rem;
        }
        
        .ocr-stat {
          background: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
        }
        
        .ocr-stat strong {
          color: #7c3aed;
        }
        
        .ocr-issues {
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 0.5rem;
          padding: 1rem;
          margin-top: 1rem;
        }
        
        .ocr-issues h4 {
          color: #dc2626;
          margin-bottom: 0.5rem;
          font-size: 0.875rem;
        }
        
        .ocr-issues ul {
          margin-left: 1.5rem;
          color: #991b1b;
          font-size: 0.875rem;
        }
        
        .loading {
          text-align: center;
          padding: 2rem;
          color: #7c3aed;
        }
        
        .loading i {
          font-size: 2rem;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        
        .hidden {
          display: none !important;
        }
        
        /* AI添削結果表示 */
        .ai-feedback {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 1rem;
          padding: 2rem;
          margin: 1.5rem 0;
          color: white;
        }
        
        .ai-feedback h3 {
          font-size: 1.5rem;
          margin-bottom: 1.5rem;
          text-align: center;
        }
        
        .ai-feedback h3 i {
          margin-right: 0.5rem;
        }
        
        .feedback-score {
          text-align: center;
          margin-bottom: 2rem;
        }
        
        .score-circle {
          width: 100px;
          height: 100px;
          border-radius: 50%;
          background: white;
          color: #7c3aed;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 2.5rem;
          font-weight: bold;
          margin: 0 auto 0.5rem;
          box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        .score-label {
          font-size: 1rem;
          opacity: 0.9;
        }
        
        .feedback-section {
          background: rgba(255,255,255,0.15);
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1rem;
          backdrop-filter: blur(10px);
        }
        
        .feedback-section h4 {
          font-size: 1.125rem;
          margin-bottom: 1rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .feedback-section ul {
          margin-left: 1.5rem;
          line-height: 1.8;
        }
        
        .feedback-section ul li {
          margin-bottom: 0.75rem;
        }
        
        .feedback-section.good-points {
          border-left: 4px solid #10b981;
        }
        
        .feedback-section.improvements {
          border-left: 4px solid #f59e0b;
        }
        
        .feedback-section.example {
          border-left: 4px solid #3b82f6;
        }
        
        .feedback-section.next-steps {
          border-left: 4px solid #8b5cf6;
        }
        
        .example-text {
          background: rgba(255,255,255,0.2);
          padding: 1rem;
          border-radius: 0.5rem;
          line-height: 1.8;
          white-space: pre-wrap;
        }
        
        /* クイックアクションボタン */
        .quick-actions {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 0.75rem;
          flex-wrap: wrap;
        }
        
        .quick-action-btn {
          padding: 0.5rem 1rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 0.875rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          box-shadow: 0 2px 4px rgba(124, 58, 237, 0.2);
        }
        
        .quick-action-btn:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.3);
          transform: translateY(-2px);
        }
        
        .quick-action-btn:active {
          transform: translateY(0);
        }
        
        .quick-action-btn.hidden {
          display: none;
        }
        
        /* レスポンシブ対応 */
        @media (max-width: 640px) {
          .input-area {
            gap: 0.5rem;
          }
          
          textarea {
            min-height: 60px;
            font-size: 0.875rem;
          }
          
          .camera-input-btn {
            padding: 0.625rem 0.75rem;
            min-width: 50px;
            font-size: 1.125rem;
          }
          
          #sendBtn {
            padding: 0.625rem 1rem;
            min-width: 80px;
            font-size: 0.875rem;
          }
          
          .quick-actions {
            gap: 0.375rem;
          }
          
          .quick-action-btn {
            padding: 0.375rem 0.75rem;
            font-size: 0.8125rem;
          }
        }
        
        /* 開発者用クイックジャンプボタン */
        .dev-quick-jump {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 9998;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          font-size: 1.5rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .dev-quick-jump:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
        }
        
        .dev-quick-jump:active {
          transform: scale(0.95);
        }
        
        .dev-quick-jump-label {
          position: fixed;
          bottom: 85px;
          right: 90px;
          z-index: 9998;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .dev-quick-jump:hover + .dev-quick-jump-label {
          opacity: 1;
        }
        
        @media (max-width: 768px) {
          .dev-quick-jump {
            width: 50px;
            height: 50px;
            font-size: 1.2rem;
            bottom: 70px;
            right: 15px;
          }
          
          .dev-quick-jump-label {
            bottom: 75px;
            right: 75px;
            font-size: 0.7rem;
            padding: 0.4rem 0.8rem;
          }
        }
        
        /* スピナーアニメーション */
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .fa-spin {
          animation: spin 1s linear infinite;
        }
        
        /* ローディングインジケーター用の追加スタイル */
        .loading-indicator {
          opacity: 0.8;
        }
        
        .loading-indicator .fa-spin {
          display: inline-block;
          margin-right: 0.5rem;
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-top">
                    <h1>📝 小論文指導</h1>
                    <div class="session-info">
                        <button class="camera-btn" id="cameraBtn" onclick="openCamera()">
                            <i class="fas fa-camera"></i>
                            撮影
                        </button>
                    </div>
                </div>
                
                <!-- 進捗バー -->
                <div class="progress-bar">
                    <div class="step current" id="step-1">
                        <div class="step-circle">1</div>
                        <div class="step-label">導入</div>
                    </div>
                    <div class="step" id="step-2">
                        <div class="step-circle">2</div>
                        <div class="step-label">語彙</div>
                    </div>
                    <div class="step" id="step-3">
                        <div class="step-circle">3</div>
                        <div class="step-label">短文</div>
                    </div>
                    <div class="step" id="step-4">
                        <div class="step-circle">4</div>
                        <div class="step-label">本練習</div>
                    </div>
                    <div class="step" id="step-5">
                        <div class="step-circle">5</div>
                        <div class="step-label">チャレンジ</div>
                    </div>
                    <div class="step" id="step-6">
                        <div class="step-circle">6</div>
                        <div class="step-label">まとめ</div>
                    </div>
                </div>
            </div>
            
            <div class="content">
                <!-- チャットエリア -->
                <div class="chat-section">
                    <div class="messages" id="messages">
                        <div class="message teacher">
                            <span class="icon">👨‍🏫</span>
                            <div>
                              こんにちは！小論文指導を始めましょう。<br>
                              まずは今日のテーマについて読み物を読んでいただきます。<br>
                              準備ができたら「OK」と入力して、送信ボタンを押してください。
                            </div>
                        </div>
                    </div>
                    
                    <!-- クイックアクションボタン -->
                    <div class="quick-actions" id="quickActions">
                        <button class="quick-action-btn" id="btnOK" onclick="quickAction('OK')">✓ OK</button>
                        <button class="quick-action-btn hidden" id="btnYonda" onclick="quickAction('読んだ')">📖 読んだ</button>
                        <button class="quick-action-btn hidden" id="btnPass" onclick="quickAction('パス')">⏭️ パス</button>
                        <button class="quick-action-btn hidden" id="btnKanryo" onclick="quickAction('完了')">✅ 完了</button>
                    </div>
                    
                    <!-- 入力エリア -->
                    <div class="input-container">
                        <!-- Camera and File buttons -->
                        <div class="camera-buttons">
                            <button id="cameraButton" type="button">
                                <i class="fas fa-camera"></i> 📷 カメラ
                            </button>
                            <button id="fileButton" type="button">
                                <i class="fas fa-folder-open"></i> 📁 ファイル
                            </button>
                        </div>
                        <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;">
                        <input type="file" id="fileInput" accept="image/*" style="display: none;">
                        
                        <div class="input-area">
                            <textarea id="userInput" placeholder="ここに回答を入力してください..."></textarea>
                            <button id="sendBtn" onclick="sendMessage()">
                                <i class="fas fa-paper-plane"></i> 送信
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- アクションボタン -->
                <div class="action-buttons">
                    <button class="btn btn-secondary" onclick="window.location.href='/essay-coaching'">
                        <i class="fas fa-arrow-left"></i> 戻る
                    </button>
                    <button class="btn btn-primary hidden" id="nextStepBtn" onclick="moveToNextStep()">
                        <i class="fas fa-arrow-right"></i> 次のステップへ
                    </button>
                </div>
            </div>
        </div>
        
        <!-- カメラモーダル -->
        <div class="modal" id="cameraModal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2><i class="fas fa-camera"></i> 原稿を撮影</h2>
                    <button class="close-btn" onclick="closeCamera()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- ワークフロー説明 -->
                <div class="workflow-instructions">
                    <div class="workflow-step">1️⃣ 原稿を撮影</div>
                    <div class="workflow-arrow">→</div>
                    <div class="workflow-step">2️⃣ 範囲を調整</div>
                    <div class="workflow-arrow">→</div>
                    <div class="workflow-step">3️⃣ OCR処理</div>
                </div>
                
                <div class="camera-container">
                    <video id="cameraPreview" autoplay playsinline></video>
                    <canvas id="cropCanvas" class="hidden"></canvas>
                    <img id="capturedImage" class="hidden" alt="撮影した画像">
                </div>
                
                <!-- ステータス表示 -->
                <div id="cameraStatus" class="camera-status"></div>
                
                <div class="camera-controls">
                    <button class="btn btn-capture" id="captureBtn" onclick="capturePhoto()">
                        <i class="fas fa-camera"></i> 撮影する
                    </button>
                    <button class="btn btn-retake hidden" id="retakeBtn" onclick="retakePhoto()">
                        <i class="fas fa-redo"></i> 再撮影
                    </button>
                    <button class="btn btn-crop hidden" id="cropBtn" onclick="showCropInterface()">
                        <i class="fas fa-crop"></i> 範囲を調整
                    </button>
                    <button class="btn btn-crop-confirm hidden" id="cropConfirmBtn" onclick="applyCrop()">
                        <i class="fas fa-check"></i> この範囲でOK
                    </button>
                    <button class="btn btn-upload hidden" id="uploadBtn" onclick="uploadAndProcessImage()">
                        <i class="fas fa-check-circle"></i> OCR処理を開始
                    </button>
                    <button class="btn btn-cancel" onclick="closeCamera()">
                        <i class="fas fa-times"></i> キャンセル
                    </button>
                </div>
                
                <div class="camera-tips" style="margin-top: 1.5rem; padding: 1rem; background: #f3f4f6; border-radius: 0.5rem; font-size: 0.875rem;">
                    <h4 style="color: #7c3aed; margin-bottom: 0.5rem;">📝 撮影のコツ</h4>
                    <ul style="margin-left: 1.5rem; line-height: 1.8;">
                        <li>原稿用紙全体が画面に入るように撮影してください</li>
                        <li>明るい場所で撮影し、影ができないようにしてください</li>
                        <li>文字がはっきり見えるように、ピントを合わせてください</li>
                        <li>原稿用紙を平らに置いて撮影してください</li>
                    </ul>
                </div>
            </div>
        </div>
        
        <script>
        const sessionId = '${sessionId}';
        let currentStep = 1;
        
        // セッション設定をコンソールに表示（デバッグ用）
        console.log('🔍 Essay Session Configuration:', {
          sessionId: sessionId,
          problemMode: '${essaySession.problemMode}',
          customInput: '${essaySession.customInput || '(empty)'}',
          learningStyle: '${essaySession.learningStyle}',
          targetLevel: '${essaySession.targetLevel}',
          timestamp: new Date().toISOString()
        });
        
        function addMessage(text, isTeacher = false) {
            const messagesDiv = document.getElementById('messages');
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isTeacher ? 'teacher' : 'student');
            
            const icon = isTeacher ? '👨‍🏫' : '👤';
            const formattedText = text.split('\\n').join('<br>');
            messageDiv.innerHTML = '<span class="icon">' + icon + '</span><div>' + formattedText + '</div>';
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        // 重複リクエスト防止フラグ
        let isProcessing = false;
        
        async function sendMessage() {
            const input = document.getElementById('userInput');
            const text = input.value.trim();
            
            if (!text) return;
            
            // 重複リクエスト防止
            if (isProcessing) {
                console.warn('⚠️ Already processing a request, please wait...');
                return;
            }
            
            isProcessing = true;
            
            // ユーザーメッセージを表示
            addMessage(text, false);
            input.value = '';
            
            // 送信ボタンを無効化してローディング状態を表示
            const sendBtn = document.getElementById('sendBtn');
            sendBtn.disabled = true;
            sendBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> しばらくお待ちください...';
            sendBtn.style.opacity = '0.6';
            sendBtn.style.cursor = 'not-allowed';
            
            // 入力エリアも無効化
            input.disabled = true;
            input.style.opacity = '0.6';
            
            // ローディングメッセージを追加
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'message teacher loading-indicator';
            loadingMsg.innerHTML = '<span class="icon">⏳</span><div><i class="fas fa-spinner fa-spin"></i> 回答を生成しています...</div>';
            loadingMsg.id = 'loading-indicator';
            document.getElementById('messages').appendChild(loadingMsg);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
            
            try {
                console.log('📤 Sending message:', { sessionId, message: text, currentStep });
                
                // AIに送信
                const response = await fetch('/api/essay/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        message: text,
                        currentStep
                    })
                });
                
                console.log('📥 Response status:', response.status);
                const result = await response.json();
                console.log('📥 Response data:', result);
                
                if (result.ok) {
                    // AI応答を表示
                    addMessage(result.response, true);
                    
                    // クイックアクションボタンを更新
                    updateQuickActions(result.response);
                    
                    // Step 4 または Step 5で「確認完了」「修正完了」または修正テキスト入力の場合、AI添削を実行
                    if ((currentStep === 4 || currentStep === 5) && 
                        (text.includes('確認完了') || text.includes('修正完了') || 
                         (text.length > 10 && !text.includes('OK') && !text.includes('ok') && !text.includes('はい')))) {
                        // OCR結果があることを確認してからAI添削を実行
                        await requestAIFeedback();
                    }
                    
                    // ステップ完了チェック
                    console.log('🔍 Checking step completion:', result.stepCompleted);
                    if (result.stepCompleted) {
                        console.log('✅ Step completed! Showing completion message');
                        showStepCompletion();
                    }
                } else {
                    addMessage('エラーが発生しました: ' + result.message, true);
                }
            } catch (error) {
                console.error('❌ Send message error:', error);
                addMessage('通信エラーが発生しました。もう一度お試しください。', true);
            } finally {
                // ローディングインジケーターを削除
                const loadingIndicator = document.getElementById('loading-indicator');
                if (loadingIndicator) {
                    loadingIndicator.remove();
                }
                
                // 送信ボタンを有効化
                sendBtn.disabled = false;
                sendBtn.innerHTML = '<i class="fas fa-paper-plane"></i> 送信';
                sendBtn.style.opacity = '1';
                sendBtn.style.cursor = 'pointer';
                
                // 入力エリアを有効化
                input.disabled = false;
                input.style.opacity = '1';
                input.focus();
                
                // 重複防止フラグをリセット
                isProcessing = false;
            }
        }
        
        function quickAction(text) {
            const input = document.getElementById('userInput');
            input.value = text;
            sendMessage();
        }
        
        function updateQuickActions(aiResponse) {
            // AIの応答内容に基づいてクイックアクションボタンを表示/非表示
            const btnOK = document.getElementById('btnOK');
            const btnYonda = document.getElementById('btnYonda');
            const btnPass = document.getElementById('btnPass');
            const btnKanryo = document.getElementById('btnKanryo');
            
            // すべてのボタンを非表示にする
            btnOK.classList.add('hidden');
            btnYonda.classList.add('hidden');
            btnPass.classList.add('hidden');
            btnKanryo.classList.add('hidden');
            
            if (!aiResponse) return;
            
            // 応答内容に応じてボタンを表示
            if (aiResponse.includes('「OK」と入力') || aiResponse.includes('準備ができたら')) {
                btnOK.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「読んだ」と入力') || aiResponse.includes('読み終えたら')) {
                btnYonda.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「パス」と入力') || aiResponse.includes('わからない場合は')) {
                btnPass.classList.remove('hidden');
            }
            
            if (aiResponse.includes('「完了」と入力') || aiResponse.includes('書いたつもりで')) {
                btnKanryo.classList.remove('hidden');
            }
        }
        
        function showStepCompletion() {
            console.log('🎯 showStepCompletion called');
            const messagesDiv = document.getElementById('messages');
            
            const completionDiv = document.createElement('div');
            completionDiv.className = 'completion-message';
            completionDiv.innerHTML = '<i class="fas fa-check-circle"></i> このステップが完了しました。次のステップに進みましょう！';
            messagesDiv.appendChild(completionDiv);
            
            // 次へボタンを表示
            const nextBtn = document.getElementById('nextStepBtn');
            nextBtn.classList.remove('hidden');
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }
        
        function moveToNextStep() {
            currentStep++;
            if (currentStep > 6) {
                alert('全てのステップが完了しました！');
                window.location.href = '/essay-coaching';
                return;
            }
            
            // 進捗バーを更新
            updateProgressBar();
            
            // 次へボタンを非表示
            document.getElementById('nextStepBtn').classList.add('hidden');
            
            // 新しいステップのメッセージを表示
            const introMessage = getStepIntroMessage(currentStep);
            addMessage(introMessage, true);
            
            // クイックアクションボタンを更新
            updateQuickActions(introMessage);
        }
        
        function updateProgressBar() {
            for (let i = 1; i <= 6; i++) {
                const stepDiv = document.getElementById('step-' + i);
                stepDiv.classList.remove('current', 'completed');
                
                if (i < currentStep) {
                    stepDiv.classList.add('completed');
                } else if (i === currentStep) {
                    stepDiv.classList.add('current');
                }
            }
        }
        
        function getStepIntroMessage(step) {
            const messages = {
                1: '【導入】まずは今日のテーマについて読み物を読んでいただきます。\\n\\n準備ができたら「OK」と入力して送信してください。',
                2: '【語彙力強化】口語表現を小論文風に言い換える練習をしましょう。\\n\\n準備ができたら「OK」と入力して送信してください。',
                3: '【短文演習】指定字数で短い小論文を書いてみましょう。\\n\\n準備ができたら「OK」と入力して送信してください。',
                4: '【本練習】より長い小論文に挑戦します。\\n\\n準備ができたら「OK」と入力して送信してください。',
                5: '【チャレンジ問題】応用的なテーマに取り組みます。\\n\\n準備ができたら「OK」と入力して送信してください。',
                6: '【まとめ】今日の学習を振り返りましょう。\\n\\n準備ができたら「OK」と入力して送信してください。'
            };
            return messages[step] || 'ステップを進めましょう。';
        }
        
        // AI添削をリクエスト
        async function requestAIFeedback() {
            try {
                console.log('🤖 Requesting AI feedback...', {
                    sessionId: sessionId,
                    currentStep: currentStep
                });
                
                addMessage('AI添削を実行中です。少々お待ちください...', true);
                
                const response = await fetch('/api/essay/feedback', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionId: sessionId })
                });
                
                console.log('🤖 Feedback API response status:', response.status);
                
                const result = await response.json();
                console.log('🤖 Feedback API result:', result);
                
                if (result.ok && result.feedback) {
                    displayFeedback(result.feedback);
                } else {
                    console.error('❌ Feedback API error:', result);
                    addMessage('AI添削でエラーが発生しました: ' + (result.message || result.error || '不明なエラー'), true);
                }
            } catch (error) {
                console.error('❌ AI feedback error:', error);
                addMessage('AI添削の通信エラーが発生しました。', true);
            }
        }
        
        // フィードバックを表示
        function displayFeedback(feedback) {
            const feedbackHtml = '<div class="ai-feedback">' +
                '<h3><i class="fas fa-robot"></i> AI自動添削結果</h3>' +
                '<div class="feedback-score">' +
                '<div class="score-circle">' + (feedback.overallScore || 0) + '</div>' +
                '<div class="score-label">総合評価</div>' +
                '</div>' +
                '<div class="feedback-section good-points">' +
                '<h4><i class="fas fa-thumbs-up"></i> 良い点</h4>' +
                '<ul>' + (feedback.goodPoints || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '<div class="feedback-section improvements">' +
                '<h4><i class="fas fa-wrench"></i> 改善点</h4>' +
                '<ul>' + (feedback.improvements || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '<div class="feedback-section example">' +
                '<h4><i class="fas fa-lightbulb"></i> 改善例文</h4>' +
                '<div class="example-text">' + (feedback.exampleImprovement || '').split('\\n').join('<br>') + '</div>' +
                '</div>' +
                '<div class="feedback-section next-steps">' +
                '<h4><i class="fas fa-flag-checkered"></i> 次のアクション</h4>' +
                '<ul>' + (feedback.nextSteps || []).map(p => '<li>' + p + '</li>').join('') + '</ul>' +
                '</div>' +
                '</div>';
            
            addMessage(feedbackHtml, true);
            addMessage('添削が完了しました！\\n内容を確認して、「完了」と入力してください。', true);
        }
        
        // カメラ関連の変数
        let stream = null;
        let capturedImageData = null;
        let originalImageData = null;
        let cropArea = null;
        let isDragging = false;
        let startX = 0;
        let startY = 0;
        
        // Camera and File button event listeners
        const cameraButton = document.getElementById('cameraButton');
        const fileButton = document.getElementById('fileButton');
        const cameraInput = document.getElementById('cameraInput');
        const fileInput = document.getElementById('fileInput');
        
        if (cameraButton) {
            cameraButton.addEventListener('click', () => {
                console.log('📷 Camera button clicked');
                openCamera();
            });
        }
        
        if (fileButton) {
            fileButton.addEventListener('click', () => {
                console.log('📁 File button clicked');
                if (fileInput) {
                    fileInput.click();
                }
            });
        }
        
        // Handle file selection from camera or file input
        function handleFileSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('📸 File selected:', file.name);
            
            const reader = new FileReader();
            reader.onload = (e) => {
                capturedImageData = e.target.result;
                originalImageData = capturedImageData;
                
                // Open camera modal to show the selected image
                document.getElementById('cameraModal').classList.add('active');
                
                // Show the captured image
                document.getElementById('cameraPreview').classList.add('hidden');
                const img = document.getElementById('capturedImage');
                img.src = capturedImageData;
                img.classList.remove('hidden');
                
                // Show appropriate buttons
                document.getElementById('captureBtn').classList.add('hidden');
                document.getElementById('retakeBtn').classList.remove('hidden');
                document.getElementById('cropBtn').classList.remove('hidden');
                document.getElementById('uploadBtn').classList.remove('hidden');
                
                updateCameraStatus('画像を読み込みました！必要に応じて「範囲を調整」してから「OCR処理を開始」を押してください', 'success');
            };
            reader.readAsDataURL(file);
        }
        
        if (cameraInput) {
            cameraInput.addEventListener('change', handleFileSelect);
        }
        
        if (fileInput) {
            fileInput.addEventListener('change', handleFileSelect);
        }
        
        // カメラモーダルを開く
        function openCamera() {
            // カメラ機能はStep 1, 3, 4, 5で使用可能
            if (currentStep !== 1 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5) {
                alert('カメラ機能はStep 1（導入）、Step 3（短文）、Step 4（本練習）、Step 5（チャレンジ）で使用できます。');
                return;
            }
            
            document.getElementById('cameraModal').classList.add('active');
            updateCameraStatus('カメラを起動しています...', 'info');
            startCamera();
        }
        
        // ステータス更新
        function updateCameraStatus(message, type) {
            const statusDiv = document.getElementById('cameraStatus');
            statusDiv.textContent = message;
            statusDiv.className = 'camera-status active ' + type;
        }
        
        // カメラを起動
        async function startCamera() {
            try {
                const preview = document.getElementById('cameraPreview');
                const cropCanvas = document.getElementById('cropCanvas');
                const capturedImg = document.getElementById('capturedImage');
                
                preview.classList.remove('hidden');
                cropCanvas.classList.add('hidden');
                capturedImg.classList.add('hidden');
                
                document.getElementById('captureBtn').classList.remove('hidden');
                document.getElementById('retakeBtn').classList.add('hidden');
                document.getElementById('cropBtn').classList.add('hidden');
                document.getElementById('cropConfirmBtn').classList.add('hidden');
                document.getElementById('uploadBtn').classList.add('hidden');
                
                stream = await navigator.mediaDevices.getUserMedia({ 
                    video: { 
                        facingMode: 'environment',
                        width: { ideal: 1920 },
                        height: { ideal: 1080 }
                    } 
                });
                preview.srcObject = stream;
                preview.play();
                updateCameraStatus('原稿用紙を画面に収めて「撮影する」を押してください', 'info');
            } catch (error) {
                console.error('Camera error:', error);
                alert('カメラの起動に失敗しました。\\nブラウザの設定でカメラへのアクセスを許可してください。');
                closeCamera();
            }
        }
        
        // 写真を撮影
        function capturePhoto() {
            const preview = document.getElementById('cameraPreview');
            
            // ビデオのサイズを確認
            console.log('📹 Video dimensions:', {
                videoWidth: preview.videoWidth,
                videoHeight: preview.videoHeight,
                readyState: preview.readyState
            });
            
            if (preview.videoWidth === 0 || preview.videoHeight === 0) {
                alert('カメラの準備ができていません。\\nもう一度お試しください。');
                console.error('❌ Video dimensions are 0');
                return;
            }
            
            const canvas = document.createElement('canvas');
            canvas.width = preview.videoWidth;
            canvas.height = preview.videoHeight;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(preview, 0, 0);
            
            capturedImageData = canvas.toDataURL('image/jpeg', 0.9);
            originalImageData = capturedImageData;
            
            console.log('📸 Image captured:', {
                dataLength: capturedImageData.length,
                dataPrefix: capturedImageData.substring(0, 50)
            });
            
            // 画像データが空でないか確認
            if (!capturedImageData || capturedImageData.length < 100) {
                alert('画像の撮影に失敗しました。\\nもう一度お試しください。');
                console.error('❌ Captured image data is empty or too small');
                return;
            }
            
            // プレビューを停止
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            
            // 撮影した画像を表示
            document.getElementById('cameraPreview').classList.add('hidden');
            const img = document.getElementById('capturedImage');
            img.src = capturedImageData;
            img.classList.remove('hidden');
            
            // ボタンを切り替え
            document.getElementById('captureBtn').classList.add('hidden');
            document.getElementById('retakeBtn').classList.remove('hidden');
            document.getElementById('cropBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.remove('hidden');
            
            updateCameraStatus('撮影完了！必要に応じて「範囲を調整」してから「OCR処理を開始」を押してください', 'success');
        }
        
        // クロップインターフェースを表示
        function showCropInterface() {
            const img = document.getElementById('capturedImage');
            const cropCanvas = document.getElementById('cropCanvas');
            
            // キャンバスに画像を描画
            const image = new Image();
            image.onload = function() {
                cropCanvas.width = image.width;
                cropCanvas.height = image.height;
                
                const ctx = cropCanvas.getContext('2d');
                ctx.drawImage(image, 0, 0);
                
                // デフォルトのクロップ領域を設定（画像全体の90%）
                const margin = Math.min(image.width, image.height) * 0.05;
                cropArea = {
                    x: margin,
                    y: margin,
                    width: image.width - margin * 2,
                    height: image.height - margin * 2
                };
                
                drawCropArea();
            };
            image.src = originalImageData;
            
            // UI切り替え
            img.classList.add('hidden');
            cropCanvas.classList.remove('hidden');
            document.getElementById('cropBtn').classList.add('hidden');
            document.getElementById('cropConfirmBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.add('hidden');
            
            updateCameraStatus('マウスでドラッグして範囲を選択してください', 'info');
            
            // イベントリスナーを追加
            setupCropListeners(cropCanvas);
        }
        
        // クロップリスナー設定
        function setupCropListeners(canvas) {
            canvas.onmousedown = function(e) {
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                startX = (e.clientX - rect.left) * scaleX;
                startY = (e.clientY - rect.top) * scaleY;
                isDragging = true;
            };
            
            canvas.onmousemove = function(e) {
                if (!isDragging) return;
                
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (e.clientX - rect.left) * scaleX;
                const currentY = (e.clientY - rect.top) * scaleY;
                
                cropArea = {
                    x: Math.min(startX, currentX),
                    y: Math.min(startY, currentY),
                    width: Math.abs(currentX - startX),
                    height: Math.abs(currentY - startY)
                };
                
                drawCropArea();
            };
            
            canvas.onmouseup = function() {
                isDragging = false;
            };
            
            // タッチイベント対応
            canvas.ontouchstart = function(e) {
                e.preventDefault();
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                startX = (touch.clientX - rect.left) * scaleX;
                startY = (touch.clientY - rect.top) * scaleY;
                isDragging = true;
            };
            
            canvas.ontouchmove = function(e) {
                e.preventDefault();
                if (!isDragging) return;
                
                const touch = e.touches[0];
                const rect = canvas.getBoundingClientRect();
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                
                const currentX = (touch.clientX - rect.left) * scaleX;
                const currentY = (touch.clientY - rect.top) * scaleY;
                
                cropArea = {
                    x: Math.min(startX, currentX),
                    y: Math.min(startY, currentY),
                    width: Math.abs(currentX - startX),
                    height: Math.abs(currentY - startY)
                };
                
                drawCropArea();
            };
            
            canvas.ontouchend = function() {
                isDragging = false;
            };
        }
        
        // クロップ領域を描画
        function drawCropArea() {
            const canvas = document.getElementById('cropCanvas');
            const ctx = canvas.getContext('2d');
            
            // 画像を再描画
            const img = new Image();
            img.onload = function() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0);
                
                // 暗い背景
                ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                
                // クロップ領域をクリア（明るく表示）
                ctx.clearRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
                ctx.drawImage(img, 
                    cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                    cropArea.x, cropArea.y, cropArea.width, cropArea.height
                );
                
                // 枠線
                ctx.strokeStyle = '#7c3aed';
                ctx.lineWidth = 3;
                ctx.strokeRect(cropArea.x, cropArea.y, cropArea.width, cropArea.height);
                
                // コーナーマーカー
                const cornerSize = 20;
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 4;
                
                // 左上
                ctx.beginPath();
                ctx.moveTo(cropArea.x, cropArea.y + cornerSize);
                ctx.lineTo(cropArea.x, cropArea.y);
                ctx.lineTo(cropArea.x + cornerSize, cropArea.y);
                ctx.stroke();
                
                // 右上
                ctx.beginPath();
                ctx.moveTo(cropArea.x + cropArea.width - cornerSize, cropArea.y);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cornerSize);
                ctx.stroke();
                
                // 左下
                ctx.beginPath();
                ctx.moveTo(cropArea.x, cropArea.y + cropArea.height - cornerSize);
                ctx.lineTo(cropArea.x, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cornerSize, cropArea.y + cropArea.height);
                ctx.stroke();
                
                // 右下
                ctx.beginPath();
                ctx.moveTo(cropArea.x + cropArea.width - cornerSize, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cropArea.height);
                ctx.lineTo(cropArea.x + cropArea.width, cropArea.y + cropArea.height - cornerSize);
                ctx.stroke();
            };
            img.src = originalImageData;
        }
        
        // クロップを適用
        function applyCrop() {
            if (!cropArea || cropArea.width < 10 || cropArea.height < 10) {
                alert('クロップ範囲が小さすぎます。もう一度選択してください。');
                return;
            }
            
            const sourceCanvas = document.getElementById('cropCanvas');
            const resultCanvas = document.createElement('canvas');
            resultCanvas.width = cropArea.width;
            resultCanvas.height = cropArea.height;
            
            const ctx = resultCanvas.getContext('2d');
            ctx.drawImage(sourceCanvas,
                cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                0, 0, cropArea.width, cropArea.height
            );
            
            capturedImageData = resultCanvas.toDataURL('image/jpeg', 0.9);
            
            // 結果を表示
            const img = document.getElementById('capturedImage');
            img.src = capturedImageData;
            img.classList.remove('hidden');
            document.getElementById('cropCanvas').classList.add('hidden');
            
            // ボタンを切り替え
            document.getElementById('cropConfirmBtn').classList.add('hidden');
            document.getElementById('cropBtn').classList.remove('hidden');
            document.getElementById('uploadBtn').classList.remove('hidden');
            
            updateCameraStatus('範囲調整完了！「OCR処理を開始」を押してください', 'success');
        }
        
        // 再撮影
        function retakePhoto() {
            capturedImageData = null;
            originalImageData = null;
            cropArea = null;
            document.getElementById('cropCanvas').classList.add('hidden');
            document.getElementById('capturedImage').classList.add('hidden');
            startCamera();
        }
        
        // 画像をアップロードしてOCR処理
        async function uploadAndProcessImage() {
            console.log('🔍 Checking capturedImageData...', {
                exists: !!capturedImageData,
                type: typeof capturedImageData,
                length: capturedImageData ? capturedImageData.length : 0
            });
            
            if (!capturedImageData) {
                alert('画像が撮影されていません。\\nもう一度撮影してください。');
                console.error('❌ capturedImageData is null or undefined');
                return;
            }
            
            if (capturedImageData.length < 100) {
                alert('画像データが不正です。\\nもう一度撮影してください。');
                console.error('❌ capturedImageData is too small:', capturedImageData.length);
                return;
            }
            
            // closeCamera()を呼ぶ前に画像データをローカル変数に保存
            const imageDataToUpload = capturedImageData;
            
            console.log('💾 Saved image data to local variable:', {
                length: imageDataToUpload.length,
                prefix: imageDataToUpload.substring(0, 50)
            });
            
            closeCamera();
            
            // ローディングメッセージを表示
            addMessage('📸 画像をアップロード中...', true);
            
            try {
                console.log('🚀 Starting image upload...', {
                    sessionId: sessionId,
                    imageDataLength: imageDataToUpload.length,
                    imageDataPrefix: imageDataToUpload.substring(0, 50),
                    currentStep: currentStep
                });
                
                // 画像をアップロード
                const uploadResponse = await fetch('/api/essay/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        imageData: imageDataToUpload,
                        currentStep: currentStep
                    })
                });
                
                console.log('📤 Upload response status:', uploadResponse.status);
                
                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    console.error('❌ Upload failed:', errorText);
                    throw new Error('アップロードに失敗しました (ステータス: ' + uploadResponse.status + ')');
                }
                
                const uploadResult = await uploadResponse.json();
                console.log('✅ Upload successful:', uploadResult);
                
                // OCR処理を開始
                addMessage('🔍 OCR処理を開始しています。しばらくお待ちください...', true);
                
                const ocrResponse = await fetch('/api/essay/ocr', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        imageData: imageDataToUpload,
                        currentStep: currentStep
                    })
                });
                
                console.log('🔍 OCR response status:', ocrResponse.status);
                
                if (!ocrResponse.ok) {
                    const errorText = await ocrResponse.text();
                    console.error('❌ OCR failed:', errorText);
                    throw new Error('OCR処理に失敗しました (ステータス: ' + ocrResponse.status + ')');
                }
                
                const ocrResult = await ocrResponse.json();
                console.log('📄 OCR result:', ocrResult);
                
                if (ocrResult.ok && ocrResult.result) {
                    displayOCRResult(ocrResult.result);
                } else {
                    throw new Error('OCR結果が無効です: ' + JSON.stringify(ocrResult));
                }
                
            } catch (error) {
                console.error('❌ Upload/OCR error:', error);
                const errorMessage = error.message || 'エラーが発生しました';
                addMessage('❌ ' + errorMessage + '\\n\\nもう一度お試しください。\\n問題が続く場合は、ブラウザのコンソール（F12キー）でエラー詳細を確認してください。', true);
            }
        }
        
        // OCR結果を表示
        function displayOCRResult(result) {
            const resultHtml = '<div class="ocr-result">' +
                '<h3><i class="fas fa-file-alt"></i> OCR読み取り結果</h3>' +
                '<div class="ocr-text">' + (result.text || '読み取れませんでした') + '</div>' +
                '<div class="ocr-stats">' +
                '<div class="ocr-stat"><strong>文字数:</strong> ' + (result.charCount || 0) + '字</div>' +
                '<div class="ocr-stat"><strong>読取率:</strong> ' + (result.readabilityScore || 0) + '%</div>' +
                '</div>' +
                (result.issues && result.issues.length > 0 ? 
                    '<div class="ocr-issues">' +
                    '<h4><i class="fas fa-exclamation-triangle"></i> 改善点</h4>' +
                    '<ul>' + result.issues.map(issue => '<li>' + issue + '</li>').join('') + '</ul>' +
                    '</div>' : '') +
                '</div>';
            
            addMessage(resultHtml, true);
            
            if (result.readable) {
                const instructionHtml = '<div style="background: #dbeafe; border-left: 4px solid #3b82f6; padding: 1rem; margin: 1rem 0; border-radius: 0.5rem;">' +
                    '<h4 style="color: #1e40af; margin-bottom: 0.5rem;"><i class="fas fa-info-circle"></i> 次のステップ</h4>' +
                    '<p style="margin: 0.5rem 0; line-height: 1.6;">OCR処理が完了しました。上記の読み取り結果を確認してください。</p>' +
                    '<div style="background: white; padding: 0.75rem; margin-top: 0.5rem; border-radius: 0.375rem;">' +
                    '<strong>✅ 内容が正しい場合：</strong><br>' +
                    '下の入力欄に「<strong>確認完了</strong>」と入力して送信ボタンを押してください。<br>' +
                    '<span style="color: #059669; font-size: 0.9em;">→ すぐにAI添削が開始されます</span><br><br>' +
                    '<strong>✏️ 修正が必要な場合：</strong><br>' +
                    '修正後の正しいテキスト全文を入力して送信してください。<br>' +
                    '<span style="color: #059669; font-size: 0.9em;">→ 修正内容が保存され、AI添削が開始されます</span>' +
                    '</div>' +
                    '</div>';
                addMessage(instructionHtml, true);
            } else {
                addMessage('❌ 画像の読み取りに問題があります。\\n上記の改善点を参考に、カメラボタン（📷）を押してもう一度撮影してください。', true);
            }
        }
        
        // カメラを閉じる
        function closeCamera() {
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
                stream = null;
            }
            document.getElementById('cameraModal').classList.remove('active');
            capturedImageData = null;
        }
        
        // Enterキーで改行可能（送信は送信ボタンのみ）
        // キーイベントリスナーは不要
        
        // 開発者用：Step 4へクイックジャンプ
        function quickJumpToStep4() {
            if (confirm('開発者モード：Step 4（本練習）へジャンプしますか？')) {
                console.log('🚀 Quick jump to Step 4 (Camera step)');
                currentStep = 4;
                
                // 進捗バーを更新
                for (let i = 1; i <= 6; i++) {
                    const stepDiv = document.getElementById('step-' + i);
                    if (stepDiv) {
                        if (i < 4) {
                            stepDiv.classList.add('completed');
                            stepDiv.classList.remove('current');
                        } else if (i === 4) {
                            stepDiv.classList.add('current');
                            stepDiv.classList.remove('completed');
                        } else {
                            stepDiv.classList.remove('completed', 'current');
                        }
                    }
                }
                
                // Step 4のメッセージを表示
                addMessage('【開発者モード】Step 4（本練習）へジャンプしました！\\n\\nこれから800字程度の小論文を書いていただきます。\\n原稿用紙に手書きで書いて、カメラボタン📷で撮影してください。', true);
                addMessage('準備ができたら、下のオレンジ色のカメラボタン📷をタップして原稿を撮影してください。', true);
                
                // カメラボタンを有効化
                document.getElementById('cameraBtn').style.display = 'flex';
                document.getElementById('cameraInputBtn').style.display = 'flex';
            }
        }
        
        // URLパラメータで ?dev=true の場合のみクイックジャンプボタンを表示
        window.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const isDevMode = urlParams.get('dev') === 'true';
            const isDebugMode = urlParams.get('debug') === 'true';
            
            if (isDevMode) {
                // クイックジャンプボタンを追加
                const jumpBtn = document.createElement('button');
                jumpBtn.className = 'dev-quick-jump';
                jumpBtn.innerHTML = '⚡';
                jumpBtn.onclick = quickJumpToStep4;
                jumpBtn.title = 'Step 4へジャンプ（開発者用）';
                
                const jumpLabel = document.createElement('div');
                jumpLabel.className = 'dev-quick-jump-label';
                jumpLabel.textContent = 'Step 4へジャンプ';
                
                document.body.appendChild(jumpBtn);
                document.body.appendChild(jumpLabel);
                
                console.log('🛠️ Developer mode enabled. Quick jump button added.');
                console.log('💡 Click the ⚡ button to jump to Step 4 (Camera step)');
                
                // 開発者モードの案内メッセージを追加
                addMessage('🛠️ 【開発者モード有効】\\n右下の⚡ボタンでStep 4（カメラ機能）へ直接ジャンプできます。', true);
            }
            
            // デバッグモードまたはモバイルの場合の案内
            if (isDebugMode || window.innerWidth < 1024) {
                setTimeout(function() {
                    console.log('📱 Eruda console is active. Tap the 🐛 button in the bottom-right corner to open the console.');
                    addMessage('📱 デバッグモード：画面右下の🐛ボタンをタップすると、コンソールログが確認できます。', true);
                }, 1000);
            }
        });
        </script>
    </body>
    </html>
  `)
})

// デバッグ用：セッションデータ確認API（一時的）
app.get('/api/debug/session/:sessionId', async (c) => {
  const sessionId = c.req.param('sessionId')
  const db = c.env?.DB
  const session = await getStudyPartnerSession(db, sessionId)
  
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }
  
  // セッションデータの構造を確認
  return c.json({
    sessionId,
    hasAnalysis: !!session.analysis,
    hasSteps: !!session.steps,
    hasConfirmation: !!session.confirmationProblem,
    hasSimilarProblems: !!session.similarProblems,
    similarProblemsCount: session.similarProblems?.length || 0,
    sessionKeys: Object.keys(session),
    analysisType: typeof session.analysis,
    sessionStructure: {
      sessionId: session.sessionId,
      status: session.status,
      currentStep: session.currentStep,
      stepsLength: session.steps?.length,
      similarProblemsLength: session.similarProblems?.length
    }
  })
})

// 問題再生成API（Step 1: バックエンドのみ実装）
app.post('/api/regenerate-problem', async (c) => {
  console.log('🔄 Problem regeneration API called')
  
  try {
    const { sessionId, regenerationType = 'full' } = await c.req.json()
    
    if (!sessionId) {
      return c.json({
        ok: false,
        error: 'missing_session_id',
        message: 'セッションIDが必要です',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッション取得（インメモリ → D1フォールバック）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    
    if (!session) {
      console.error('❌ Session not found in memory or D1:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    console.log('✅ Session retrieved successfully:', sessionId)
    
    console.log('🔄 Regenerating problem for session:', sessionId, 'type:', regenerationType)
    
    // OpenAI API Key の確認
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'api_key_missing',
        message: 'AI機能が利用できません',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    // 元のセッションから生徒情報を取得
    const studentInfo = studentDatabase[session.sid] || {
      name: 'テスト生徒',
      grade: 2,
      subjects: ['数学'],
      weakSubjects: ['英語']
    }
    
    // 修正2: 元画像を使用した再生成プロンプト作成
    const regenerationPrompt = createRegenerationPrompt(session, studentInfo, regenerationType)
    
    // 修正2: 元画像データがある場合は画像つきで再生成、ない場合はテキストのみ
    let messages
    if (session.originalImageData) {
      console.log('🔄 Using original image for regeneration')
      messages = [
        {
          role: 'system',
          content: regenerationPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: session.originalUserMessage ? 
                `元の質問: ${session.originalUserMessage}\n\n【重要指示】この画像の問題から「教育的青写真」を正確に抽出し、同じ学習価値・同じ難易度を保持したまま、表面的な表現のみを変更した類題を生成してください。定義問題や汎用問題への変更は禁止です。` :
                '【重要指示】この画像の問題の「教育的核心」（学習目標・難易度・問題構造）を完全に保持し、具体的な文章や例のみを親しみやすく変更した問題を生成してください。'
            },
            {
              type: 'image_url',
              image_url: {
                url: session.originalImageData,
                detail: 'high'
              }
            }
          ]
        }
      ]
    } else {
      console.log('🔄 Using text-only regeneration (no original image)')
      messages = [
        {
          role: 'system',
          content: regenerationPrompt
        },
        {
          role: 'user',
          content: '上記の要求に基づいて、新しいバリエーションの学習コンテンツを生成してください。'
        }
      ]
    }
    
    // OpenAI API 呼び出し（再生成）
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 8000,
        temperature: 0.7  // 再生成では少し高めの温度で多様性を確保
      })
    })
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('❌ OpenAI API error during regeneration:', openaiResponse.status, errorText)
      
      // Step 4: エラーハンドリング強化 - OpenAI APIエラーの詳細分類
      let userMessage = 'AI再生成でエラーが発生しました'
      
      if (openaiResponse.status === 429) {
        userMessage = 'AI機能の利用制限に達しています。少し時間をおいてから再度お試しください。'
      } else if (openaiResponse.status === 401) {
        userMessage = 'AI機能の認証に問題があります。管理者にお問い合わせください。'
      } else if (openaiResponse.status === 400) {
        userMessage = 'リクエストの内容に問題があります。別の問題で再度お試しください。'
      } else if (openaiResponse.status >= 500) {
        userMessage = 'AI機能のサーバーに一時的な問題があります。少し時間をおいてから再度お試しください。'
      }
      
      return c.json({
        ok: false,
        error: 'openai_api_error',
        message: userMessage,
        statusCode: openaiResponse.status,
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const aiContent = (await openaiResponse.json())?.choices?.[0]?.message?.content || ''
    console.log('🤖 Regenerated AI content length:', aiContent.length)
    
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    let aiAnalysis
    
    if (jsonMatch) {
      try {
        aiAnalysis = JSON.parse(jsonMatch[0])
        console.log('🔄 Regeneration analysis success:', {
          subject: aiAnalysis.subject,
          problemType: aiAnalysis.problemType,
          difficulty: aiAnalysis.difficulty,
          confidence: aiAnalysis.confidence
        })
        
        // Phase1改善: 品質チェック機能追加
        const qualityCheck = evaluateRegenerationQuality(aiAnalysis, session)
        console.log('📊 Quality evaluation:', qualityCheck)
        
        if (qualityCheck.score < 0.7) {
          console.log('⚠️ Low quality detected, attempting improvement...')
          // 低品質の場合は改善を試行（1回まで）
          const improved = await improveRegeneratedContent(aiAnalysis, qualityCheck.issues)
          if (improved) {
            aiAnalysis = improved
            console.log('✨ Content improved successfully')
          }
        }
        
      } catch (parseError) {
        console.error('❌ Regenerated analysis JSON parsing error:', parseError)
        return c.json({
          ok: false,
          error: 'parse_error',
          message: 'AI再生成結果の解析に失敗しました',
          timestamp: new Date().toISOString()
        }, 500)
      }
    } else {
      console.error('❌ No JSON found in regenerated analysis:', aiContent.substring(0, 200))
      
      // Step 4: エラーハンドリング強化 - AI応答形式エラーの詳細対応
      if (aiContent.includes("I'm sorry") || aiContent.includes("I can't") || aiContent.toLowerCase().includes("sorry")) {
        return c.json({
          ok: false,
          error: 'ai_policy_violation',
          message: 'この内容では問題を再生成できません。別の問題画像をお試しください。',
          timestamp: new Date().toISOString()
        }, 400)
      } else {
        return c.json({
          ok: false,
          error: 'format_error',
          message: 'AI再生成結果の形式が不正です。もう一度お試しください。',
          timestamp: new Date().toISOString()
        }, 500)
      }
    }
    
    // 再生成されたデータでセッションを更新
    updateSessionWithRegeneratedData(session, aiAnalysis)
    
    // D1に更新されたセッションを保存
    if (db) {
      await saveStudyPartnerSessionToDB(db, sessionId, session)
      console.log('✅ Regenerated session saved to D1')
    }
    
    // 更新されたセッション情報を返却
    return c.json({
      ok: true,
      sessionId,
      regenerationType,
      analysis: session.analysis,
      subject: aiAnalysis.subject || session.problemType,
      difficulty: aiAnalysis.difficulty || 'standard',
      steps: session.steps,
      confirmationProblem: session.confirmationProblem,
      similarProblems: session.similarProblems,
      currentStep: session.steps[0], // steps[0]は既に正しい構造を持っている
      totalSteps: session.steps.length,
      status: 'learning',
      message: '問題を再生成しました',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Problem regeneration error:', error)
    return c.json({
      ok: false,
      error: 'regeneration_error',
      message: error.message || '問題再生成でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 修正2: 画像ベース再生成用プロンプト作成関数
function createRegenerationPrompt(session, studentInfo, regenerationType) {
  const basePrompt = `あなたは「プログラミングのKOBEYA」の経験豊富な教師として、バンコク在住の日本人中学生の学習を支援してください。

【教育的青写真の保持原則】
元問題の「学習価値」を完全に保持し、「表面的要素」のみを適度に変更することが最重要です。

【既存セッション情報】
問題タイプ: ${session.problemType}
既存の教科: ${session.analysis ? session.analysis.split('。')[0] : '不明'}
生徒情報: ${studentInfo.name} (中学${studentInfo.grade}年) - バンコク在住
再生成タイプ: ${regenerationType}

${getRegenerationTypeInstructions(regenerationType)}

【Phase1改善: 元問題の核心要素を厳密に保持】
🎯 **不変要素（絶対に変更禁止）**：
- 学習目標・習得技能（例：文節の区切り方）
- 認知的レベル・難易度（同等を維持）
- 問題の深い構造（文型・助詞構成・複雑さ）
- 教育的文脈・段階性

✨ **可変要素（適度な変更OK）**：
- 具体的な文章内容（同じ構造の別の文）
- 場面設定・登場人物・状況
- 表現方法・問いかけ方
- バンコク生活に親しみやすい例

【厳格な制約条件】
❌ **絶対禁止**：
- 「〜とは何ですか？」のような定義問題への変更
- 汎用的・抽象的な基礎問題への変更  
- 元問題の具体性・意味のある文脈を失う変更
- 教科の変更（国語→数学等）
- 難易度の大幅変更（±1レベル以上）

✅ **推奨される変更**：
- 同じ文法構造で語彙のみ変更
- 同じ助詞・文節数を保持した別文
- バンコクの文化要素を適度に織り込み
- より親しみやすい例文への変更

【バンコク在住生徒への特別配慮】
🌟 海外在住への心理的支援を含める
🌸 「日本でも同じ内容を学習するので安心してね」
🎌 適度な文化的親しみやすさ（ワット・ポー、チャトゥチャック等）
💫 励ましと温かい支援の言葉

【技術仕様（変更不可）】
- 全ステップtype: "choice"（選択肢問題）
- 確認問題type: "choice"
- 類似問題はchoice/inputの混合
- 正解をA-D全体に分散
- JSON形式での応答必須

【最重要指示】
元画像の問題から「教育的価値の核心」を抽出し、その核心を損なわずに、表面的な表現のみを親しみやすく変更してください。「全く新しい問題」ではなく「同じ価値を持つ別バージョン」を作成してください。`

  // 元のシステムプロンプトの教育方針部分を再利用
  const educationalPolicyPrompt = `
【教育方針（文部科学省学習指導要領準拠）】
- 人間中心の学習重視：一人一人の人格を尊重し、個性を生かす指導
- 主体的・対話的で深い学び：段階的思考プロセスの明示支援
- 3つの観点重視：知識・技能、思考・判断・表現、主体的学習態度の育成
- 中学生向けのやさしい敬語で説明（学習者の発達段階に応じた言葉遣い）
- 海外在住への配慮：「日本でも同じ内容を学習するよ」「心配しないで大丈夫」
- 問題解決能力育成：複数解決方法の提示、比較検討の促進
- 温かい励ましと支援姿勢：失敗を学習機会として前向きに捉える
- 個別最適化支援：学習履歴と理解度に応じた説明方法の選択

【回答形式】
以下の厳密なJSON形式で回答してください（構造を完全に守ること）：
{
  "subject": "国語",
  "problemType": "custom",
  "difficulty": "basic|intermediate|advanced", 
  "analysis": "【詳細分析】\\n\\n①問題の整理\\n②使う知識\\n③解法のポイント\\n④解答例\\n⑤確認・振り返り",
  "confidence": 0.85,
  "steps": [
    {
      "stepNumber": 0,
      "instruction": "ステップ1の指導内容（問いかけ形式で思考を促す）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "解説文"
    },
    {
      "stepNumber": 1,
      "instruction": "ステップ2の指導内容",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "B",
      "explanation": "解説文"
    }
  ],
  "confirmationProblem": {
    "question": "確認問題の内容",
    "type": "choice",
    "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
    "correctAnswer": "A",
    "explanation": "確認問題解説"
  },
  "similarProblems": [
    {
      "problemNumber": 1,
      "question": "類似問題1",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "類似問題1の詳細解説",
      "difficulty": "easy"
    }
  ]
}

【重要】上記JSON構造を厳密に守り、stepsは必ずオブジェクトの配列にしてください`

  return basePrompt + educationalPolicyPrompt
}

// Phase1改善: 再生成タイプ別指示
function getRegenerationTypeInstructions(regenerationType) {
  switch(regenerationType) {
    case 'similar':
      return `【🔄 同じような問題 - 等質置換】
- 元問題と同じ構造・難易度・助詞構成を厳密に保持
- 語彙・登場人物・状況のみを変更（文節数±1以内）
- 同じ学習目標で親しみやすい例に変更
- 例：「君が言うことは〜」→「彼女が書く手紙は〜」`
      
    case 'approach':
      return `【🎯 違うアプローチ - 視点変更】
- 同じ学習技能を別の問題形式で問う
- 選択→記述、分析→構成など形式を変更
- 学習目標・難易度は完全に同一維持
- より理解が深まる別角度からのアプローチ`
      
    case 'full':
    default:
      return `【⚡ 完全に新しいパターン - 慎重な変更】
- 同じ教科・同じ単元で別のトピックを選択
- 学習価値の核心は絶対に保持
- 具体性を失わず、定義問題化を厳禁
- より教育効果の高い内容への改良`
  }
}

// Phase1改善: 再生成品質評価関数
function evaluateRegenerationQuality(regeneratedContent, originalSession) {
  let score = 1.0
  const issues = []
  
  // 1. 定義問題検出（最重要）
  const definitionPatterns = [
    /とは何ですか/,
    /について説明/,
    /の定義/,
    /基本的な概念/,
    /とはどのような/
  ]
  
  const hasDefinitionProblem = definitionPatterns.some(pattern => 
    pattern.test(regeneratedContent.analysis || '') ||
    (regeneratedContent.steps || []).some(step => pattern.test(step.content || ''))
  )
  
  if (hasDefinitionProblem) {
    score -= 0.4
    issues.push('definition_problem')
  }
  
  // 2. 汎用化検出
  const genericPatterns = [
    /一般的に/,
    /基本的には/,
    /通常は/,
    /文節とは/,
    /助詞とは/
  ]
  
  const isGeneric = genericPatterns.some(pattern => 
    pattern.test(regeneratedContent.analysis || '')
  )
  
  if (isGeneric) {
    score -= 0.2
    issues.push('too_generic')
  }
  
  // 3. 具体的な問題文の存在確認
  const hasSpecificContent = (regeneratedContent.steps || []).some(step => {
    const content = step.content || ''
    return content.includes('「') && content.includes('」') // 日本語の引用符
  })
  
  if (!hasSpecificContent) {
    score -= 0.2
    issues.push('lacks_specific_content')
  }
  
  // 4. 教科一致性チェック
  if (originalSession.analysis && regeneratedContent.subject) {
    const originalSubject = extractSubjectFromAnalysis(originalSession.analysis)
    if (originalSubject && originalSubject !== regeneratedContent.subject) {
      score -= 0.3
      issues.push('subject_mismatch')
    }
  }
  
  return {
    score: Math.max(0, score),
    issues,
    passed: score >= 0.7
  }
}

// 簡単な教科抽出関数
function extractSubjectFromAnalysis(analysis) {
  if (analysis.includes('文節') || analysis.includes('助詞') || analysis.includes('国語')) return '国語'
  if (analysis.includes('数学') || analysis.includes('計算') || analysis.includes('方程式')) return '数学'
  if (analysis.includes('英語') || analysis.includes('English')) return '英語'
  return null
}

// Phase1改善: コンテンツ改善関数（簡易版）
async function improveRegeneratedContent(originalContent, issues) {
  // 実装は次のフェーズで詳細化
  // 現在は問題のあるパターンを検出してフラグを立てるのみ
  console.log('🔧 Content improvement needed for issues:', issues)
  
  if (issues.includes('definition_problem')) {
    console.log('⚠️ Definition problem detected - manual review recommended')
  }
  
  return null // 現在は改善機能なし、警告のみ
}

// セッション更新関数
function updateSessionWithRegeneratedData(session, aiAnalysis) {
  // 新しい分析内容で更新
  session.analysis = `【AI学習アシスタント再生成】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🔄 **新しいパターンで学習を始めましょう**<br>別のアプローチで問題に取り組みます！`
  
  // 段階学習ステップを更新
  if (aiAnalysis.steps && Array.isArray(aiAnalysis.steps)) {
    session.steps = aiAnalysis.steps.map((step, index) => ({
      ...step,
      stepNumber: step.stepNumber !== undefined ? step.stepNumber : index, // stepNumberがない場合はインデックスを使用
      completed: false,
      attempts: []
    }))
    
    console.log('🔄 Updated session steps after regeneration:', {
      stepsCount: session.steps.length,
      firstStepStructure: {
        stepNumber: session.steps[0]?.stepNumber,
        instruction: session.steps[0]?.instruction?.substring(0, 50) + '...',
        type: session.steps[0]?.type,
        hasOptions: !!session.steps[0]?.options
      }
    })
  }
  
  // 確認問題を更新
  if (aiAnalysis.confirmationProblem) {
    session.confirmationProblem = {
      ...aiAnalysis.confirmationProblem,
      attempts: []
    }
  }
  
  // 類似問題を更新
  if (aiAnalysis.similarProblems) {
    session.similarProblems = aiAnalysis.similarProblems.map(problem => ({
      ...problem,
      attempts: []
    }))
  }
  
  // セッション状態をリセット
  session.currentStep = 0
  session.status = 'learning'
  session.updatedAt = new Date().toISOString()
  
  console.log('🔄 Session updated with regenerated data:', {
    stepsCount: session.steps.length,
    similarProblemsCount: session.similarProblems.length
  })
}

// 類似問題チェックAPI
app.post('/api/similar/check', handleSimilarCheck)
app.get('/', (c) => {
  return c.redirect('/study-partner', 302)
})

// Study Partner Simple - ログイン修正版
app.get('/study-partner-simple', studyPartnerSimple)

// Study Partner SPA
app.get('/study-partner', renderStudyPartnerPage)

// =====================================
// 学習ログシステム API エンドポイント
// =====================================

// Webhook Secret認証ミドルウェア
const requireSecret = async (c: any, next: any) => {
  const providedSecret = c.req.header('X-Webhook-Secret')
  const requiredSecret = c.env.WEBHOOK_SECRET
  
  if (!providedSecret || !requiredSecret || providedSecret !== requiredSecret) {
    console.log('❌ Unauthorized webhook request - invalid secret')
    return c.json({ ok: false, code: 'unauthorized' }, 401)
  }
  
  return next()
}

// ヘルスチェックAPI
app.get('/api/logs/health', (c) => {
  return c.json({ 
    ok: true, 
    version: c.env.VERSION || '1.0.0',
    service: 'kobeya-logging-system',
    timestamp: new Date().toISOString()
  })
})

// 【廃止済み】マスターデータ取得関数（AIベースのタグ推論に移行済み）
async function fetchMasterMaterials(c: any): Promise<any[]> {
  console.log('⚠️ fetchMasterMaterials called but deprecated - using AI-based inference')
  
  // AIベースのシステムではマスターデータは不要なので空配列を返す
  return []
}

// 重複チェック関数
async function isDuplicate(c: any, requestId: string): Promise<boolean> {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT id FROM logs WHERE request_id = ?
    `).bind(requestId).first()
    
    return !!result
  } catch (error) {
    console.error('❌ Error checking duplicate:', error)
    return false
  }
}

// ログ挿入関数
async function insertLog(c: any, logData: any): Promise<number | null> {
  try {
    const db = c.env.DB
    
    // デバッグ用：ログデータを確認
    console.log('📝 Insert log data (all fields):', {
      request_id: logData.request_id,
      student_id: logData.student_id,
      student_name: logData.student_name,
      date: logData.date,
      started_at: logData.started_at,
      ended_at: logData.ended_at,
      time_spent_min: logData.time_spent_min,
      subject: logData.subject,
      page: logData.page,
      problem_id: logData.problem_id,
      error_tags: logData.error_tags,
      tasks_done: logData.tasks_done,
      problems_attempted: logData.problems_attempted,
      correct: logData.correct,
      incorrect: logData.incorrect,
      mini_quiz_score: logData.mini_quiz_score,
      weak_tags: logData.weak_tags,
      next_action: logData.next_action,
      flag_teacher_review: logData.flag_teacher_review
    })
    
    // 各パラメータの詳細ログ
    const bindParams = [
      logData.request_id,
      logData.student_id, 
      logData.student_name,
      logData.date,
      logData.started_at,
      logData.ended_at,
      logData.time_spent_min,
      logData.subject,
      logData.page,
      logData.problem_id,
      safeJsonStringify(logData.error_tags || []),
      logData.tasks_done,
      logData.problems_attempted,
      logData.correct,
      logData.incorrect,
      logData.mini_quiz_score,
      safeJsonStringify(logData.weak_tags || []),
      logData.next_action,
      logData.flag_teacher_review ? 1 : 0
    ]
    
    console.log('🔍 Bind parameters check:')
    bindParams.forEach((param, index) => {
      const fieldNames = [
        'request_id', 'student_id', 'student_name', 'date', 'started_at', 'ended_at',
        'time_spent_min', 'subject', 'page', 'problem_id', 'error_tags', 'tasks_done',
        'problems_attempted', 'correct', 'incorrect', 'mini_quiz_score', 'weak_tags',
        'next_action', 'flag_teacher_review'
      ]
      if (param === undefined) {
        console.log(`❌ Parameter ${index} (${fieldNames[index]}) is undefined`)
      } else {
        console.log(`✅ Parameter ${index} (${fieldNames[index]}): ${typeof param} = ${param}`)
      }
    })

    const result = await db.prepare(`
      INSERT INTO logs (
        request_id, student_id, student_name, date, started_at, ended_at,
        time_spent_min, subject, page, problem_id,
        error_tags, tasks_done, problems_attempted, correct, incorrect,
        mini_quiz_score, weak_tags, next_action, flag_teacher_review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...bindParams).run()
    
    return result.meta?.last_row_id || null
  } catch (error) {
    console.error('❌ Error inserting log:', error)
    throw error
  }
}

// ログ収集API
app.post('/api/logs', requireSecret, async (c) => {
  console.log('📝 Log collection API called')
  
  try {
    const rawBody = await c.req.json()
    console.log('📝 Raw log data received:', {
      student_id: rawBody.student_id,
      subject: rawBody.subject,
      date: rawBody.date
    })
    
    // データ正規化
    const normalizedData = normalize(rawBody)
    
    // 【新機能】AIベースのタグ推定（教材データベース不要）
    const inferredTags = inferTagsAI('', normalizedData)
    normalizedData.weak_tags = mergeWeakTags(normalizedData.weak_tags, inferredTags)
    
    console.log('🤖 AI-based tag inference result:', inferredTags)
    
    // 時間計算
    normalizedData.time_spent_min = calcMinutes(normalizedData.started_at, normalizedData.ended_at)
    
    // request_idがない場合は生成
    if (!normalizedData.request_id) {
      normalizedData.request_id = generateRequestId()
    }
    
    // 重複チェック
    const isDup = await isDuplicate(c, normalizedData.request_id)
    if (isDup) {
      console.log('⚠️ Duplicate request detected:', normalizedData.request_id)
      return c.json({ ok: false, code: 'duplicate' }, 409)
    }
    
    // ログ挿入
    const insertedId = await insertLog(c, normalizedData)
    
    console.log('✅ Log inserted successfully:', { 
      id: insertedId, 
      student_id: normalizedData.student_id,
      request_id: normalizedData.request_id
    })
    
    return c.json({
      ok: true,
      version: c.env.VERSION || '1.0.0',
      lastRow: insertedId,
      request_id: normalizedData.request_id,
      debugNumbers: debugNums(normalizedData)
    })
    
  } catch (error) {
    console.error('❌ Log collection error:', error)
    return c.json({
      ok: false,
      error: 'log_collection_error',
      message: error.message || 'ログ収集でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 週次レポート生成用のヘルパー関数
async function makeWeeklyReport(c: any, options: { student_id: string, start: string, end: string, store: boolean }) {
  try {
    const db = c.env.DB
    const { student_id, start, end, store } = options
    
    console.log('📊 Generating weekly report:', { student_id, start, end, store })
    
    // 期間内のログデータを取得
    const logsResult = await db.prepare(`
      SELECT * FROM logs 
      WHERE student_id = ? AND date >= ? AND date <= ?
      ORDER BY date DESC, created_at DESC
    `).bind(student_id, start, end).all()
    
    const logs = logsResult.results || []
    
    if (logs.length === 0) {
      return {
        ok: true,
        student_id,
        period: { start, end },
        summary: {
          sessions: 0,
          minutes: 0,
          avg_score: 0,
          weak_tags_top3: []
        },
        message: '該当期間にログデータがありません'
      }
    }
    
    // サマリ計算
    const sessions = logs.length
    const minutes = logs.reduce((sum, log) => sum + (log.time_spent_min || 0), 0)
    const scoresSum = logs.reduce((sum, log) => sum + (log.mini_quiz_score || 0), 0)
    const avgScore = sessions > 0 ? Math.round(scoresSum / sessions) : 0
    
    // 弱点タグ集計
    const weakTagsFlat: string[] = []
    logs.forEach(log => {
      const tags = safeJsonParse(log.weak_tags, [])
      weakTagsFlat.push(...tags)
    })
    
    const tagCounts = weakTagsFlat.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const weakTagsTop3 = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([tag]) => tag)
    
    // 最新の生徒情報取得
    const latestLog = logs[0]
    const studentName = latestLog.student_name || student_id
    const nextAction = latestLog.next_action || '継続して学習を進めてください'
    
    const summary = {
      sessions,
      minutes,
      avg_score: avgScore,
      weak_tags_top3: weakTagsTop3,
      student_name: studentName,
      next_action: nextAction
    }
    
    // 必要に応じてレポートをDBに保存（今回は省略）
    
    console.log('✅ Weekly report generated:', summary)
    
    return {
      ok: true,
      student_id,
      period: { start, end },
      summary,
      logs_count: sessions
    }
    
  } catch (error) {
    console.error('❌ Weekly report generation error:', error)
    throw error
  }
}

// 週次レポート生成API
app.post('/api/reports/weekly', requireSecret, async (c) => {
  console.log('📊 Weekly report API called')
  
  try {
    const body = await c.req.json()
    const { student_id, start, end, store = true } = body
    
    if (!student_id || !start || !end) {
      return c.json({
        ok: false,
        error: 'missing_params',
        message: 'student_id, start, end パラメータが必要です'
      }, 400)
    }
    
    const result = await makeWeeklyReport(c, { student_id, start, end, store })
    
    return c.json(result)
    
  } catch (error) {
    console.error('❌ Weekly report error:', error)
    return c.json({
      ok: false,
      error: 'weekly_report_error',
      message: error.message || '週次レポート生成でエラーが発生しました'
    }, 500)
  }
})

// =====================================
// ログダッシュボード
// =====================================

// ダッシュボード表示（教室スタッフ専用）
app.get('/dashboard', async (c) => {
  try {
    const db = c.env.DB
    const url = new URL(c.req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200) // 最大200件まで
    
    console.log(`📊 Dashboard access - limit: ${limit}`)
    
    // 最新ログを取得
    const logsResult = await db.prepare(`
      SELECT 
        id, created_at, student_id, student_name, subject, 
        mini_quiz_score, weak_tags, correct, incorrect, tasks_done
      FROM logs 
      ORDER BY id DESC 
      LIMIT ?
    `).bind(limit).all()
    
    const logs = logsResult.results || []
    
    // 最新ログの日時を確認（警告表示用）
    let statusMessage = '✅ 正常動作中'
    let statusClass = 'status-ok'
    
    if (logs.length > 0) {
      const latestLog = logs[0]
      const latestTime = new Date(latestLog.created_at)
      const now = new Date()
      const hoursDiff = (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff > 24) {
        statusMessage = '⚠️ ログ受信停止の可能性あり'
        statusClass = 'status-warning'
      } else {
        const timeStr = latestTime.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
        statusMessage = `✅ 正常動作中（最新ログ: ${timeStr}）`
      }
    } else {
      statusMessage = '⚠️ ログデータなし'
      statusClass = 'status-warning'
    }
    
    // weak_tags JSONをパース
    const processedLogs = logs.map(log => ({
      ...log,
      weak_tags_display: (() => {
        try {
          const tags = JSON.parse(log.weak_tags || '[]')
          return Array.isArray(tags) ? tags.join(', ') : log.weak_tags || ''
        } catch {
          return log.weak_tags || ''
        }
      })(),
      created_at_display: new Date(log.created_at).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      })
    }))
    
    // HTMLダッシュボードを生成
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOBEYA Logs Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .header p {
            margin: 0;
            color: #7f8c8d;
        }
        .controls {
            margin: 20px 0;
        }
        .controls select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background-color: #34495e;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 500;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td {
            padding: 10px 8px;
            border-bottom: 1px solid #ecf0f1;
        }
        tbody tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tbody tr:hover {
            background-color: #e8f4f8;
        }
        .status {
            background: white;
            padding: 15px 20px;
            margin-top: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-weight: 500;
        }
        .status-ok {
            color: #27ae60;
            border-left: 4px solid #27ae60;
        }
        .status-warning {
            color: #e67e22;
            border-left: 4px solid #e67e22;
        }
        .score-high { color: #27ae60; font-weight: bold; }
        .score-mid { color: #f39c12; }
        .score-low { color: #e74c3c; font-weight: bold; }
        .tags {
            font-size: 0.9em;
            color: #7f8c8d;
        }
        .student-id {
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #7f8c8d;
            font-style: italic;
        }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            table { font-size: 0.9em; }
            th, td { padding: 8px 4px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 KOBEYA Logs Dashboard</h1>
            <p>最新${limit}件のログを表示 | 教室スタッフ専用</p>
        </div>
        
        <div class="controls">
            <label for="limitSelect">表示件数：</label>
            <select id="limitSelect" onchange="changeLimit()">
                <option value="25" ${limit === 25 ? 'selected' : ''}>25件</option>
                <option value="50" ${limit === 50 ? 'selected' : ''}>50件</option>
                <option value="100" ${limit === 100 ? 'selected' : ''}>100件</option>
                <option value="200" ${limit === 200 ? 'selected' : ''}>200件</option>
            </select>
            <button onclick="location.reload()" style="margin-left: 10px; padding: 8px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                🔄 更新
            </button>
        </div>
        
        ${logs.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>受信日時</th>
                    <th>生徒ID</th>
                    <th>生徒名</th>
                    <th>教科</th>
                    <th>スコア</th>
                    <th>正答</th>
                    <th>誤答</th>
                    <th>課題数</th>
                    <th>弱点タグ</th>
                </tr>
            </thead>
            <tbody>
                ${processedLogs.map(log => `
                <tr>
                    <td>${log.id}</td>
                    <td>${log.created_at_display}</td>
                    <td class="student-id">${log.student_id || '-'}</td>
                    <td>${log.student_name || '-'}</td>
                    <td>${log.subject || '-'}</td>
                    <td class="${log.mini_quiz_score >= 80 ? 'score-high' : log.mini_quiz_score >= 60 ? 'score-mid' : 'score-low'}">
                        ${log.mini_quiz_score || '-'}
                    </td>
                    <td>${log.correct || 0}</td>
                    <td>${log.incorrect || 0}</td>
                    <td>${log.tasks_done || 0}</td>
                    <td class="tags">${log.weak_tags_display || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : `
        <div class="no-data">
            📝 ログデータがありません
        </div>
        `}
        
        <div class="status ${statusClass}">
            ${statusMessage} | 総件数: ${logs.length}件
        </div>
    </div>
    
    <script>
        function changeLimit() {
            const select = document.getElementById('limitSelect');
            const newLimit = select.value;
            window.location.href = '/dashboard?limit=' + newLimit;
        }
    </script>
</body>
</html>`
    
    return c.html(html)
    
  } catch (error) {
    console.error('❌ Dashboard error:', error)
    
    const errorHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>KOBEYA Logs Dashboard - Error</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f8f9fa; }
        .error { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠️ DB接続エラー</h1>
        <p>ダッシュボードのデータを取得できませんでした。</p>
        <p><strong>エラー詳細:</strong> ${error.message}</p>
        <button onclick="location.reload()">🔄 再試行</button>
    </div>
</body>
</html>`
    
    return c.html(errorHtml, 500)
  }
})

// =====================================
// 既存システム継続
// =====================================

// Favicon ハンドラー
app.get('/favicon.ico', (c) => {
  return c.text('', 204)  // No Content
})

// 404ハンドラー
app.notFound((c) => {
  return c.text('404 Not Found', 404)
})

// Export the app as default
export default app
