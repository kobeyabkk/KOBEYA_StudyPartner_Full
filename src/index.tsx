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

// 学習セッション管理（インメモリ + D1永続化）
const learningSessions = new Map()

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

// 生徒情報データベース（必要最小限追加）
interface StudentInfo {
  studentId: string
  name: string
  grade: number
  subjects: string[]
  weakSubjects: string[]
  lastLogin: string
}

const studentDatabase: Record<string, StudentInfo> = {
  'JS2-04': {
    studentId: 'JS2-04',
    name: '田中太郎',
    grade: 2,
    subjects: ['数学', '理科'],
    weakSubjects: ['英語'],
    lastLogin: new Date().toISOString()
  },
  'test123': {
    studentId: 'test123',
    name: 'テスト生徒',
    grade: 1,
    subjects: ['国語'],
    weakSubjects: ['数学'],
    lastLogin: new Date().toISOString()
  }
}

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

// ログインAPI（最小限追加）
app.post('/api/login', async (c) => {
  try {
    const { appkey, sid } = await c.req.json()
    console.log('🔑 Login attempt:', { appkey, sid })
    
    const validAppKeys = ['KOBEYA2024', '180418']
    if (!validAppKeys.includes(appkey)) {
      return c.json({ success: false, message: 'APP_KEYが正しくありません' }, 401)
    }
    
    const studentInfo = studentDatabase[sid]
    if (!studentInfo) {
      return c.json({ success: false, message: '生徒IDが見つかりません' }, 404)
    }
    
    studentInfo.lastLogin = new Date().toISOString()
    
    return c.json({ 
      success: true, 
      message: 'ログインに成功しました', 
      studentInfo: {
        studentId: studentInfo.studentId,
        name: studentInfo.name,
        grade: studentInfo.grade,
        subjects: studentInfo.subjects,
        weakSubjects: studentInfo.weakSubjects
      }
    })
  } catch (error) {
    console.error('❌ Login error:', error)
    return c.json({ success: false, message: 'ログイン処理でエラーが発生しました' }, 500)
  }
})

// 画像解析 + 段階学習開始 endpoint
app.post('/api/analyze-and-learn', async (c) => {
  console.log('📸 Analyze and learn endpoint called')
  
  try {
    const formData = await c.req.formData()
    const appkey = formData.get('appkey')?.toString() || '180418'
    const sid = formData.get('sid')?.toString() || 'JS2-04'
    const imageField = formData.get('image')
    const userMessage = formData.get('message')?.toString() || ''
    
    console.log('📸 Image analysis request:', { appkey, sid, hasImage: !!imageField, hasMessage: !!userMessage })
    
    if (!imageField || !(imageField instanceof File)) {
      throw new Error('画像ファイルが必要です')
    }
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 生徒情報の取得
    const studentInfo = studentDatabase[sid]
    console.log('👨‍🎓 Student info:', studentInfo ? `${studentInfo.name} (中学${studentInfo.grade}年)` : 'Not found')
    
    // OpenAI API Key の確認
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    console.log('🔑 API Key check:', apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing')
    
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found - using fallback')
      // フォールバック: ダミーデータを使用
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ AI接続でエラーが発生しました。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      // 学習セッションを保存（フォールバック）
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: フォールバック時も構造の一貫性を保持
        originalImageData: null,
        originalUserMessage: ''
      }
      learningSessions.set(sessionId, learningSession)
      
      // D1に保存（非同期、エラーが発生してもレスポンスは返す）
      const db = c.env?.DB
      if (db) {
        await saveStudyPartnerSessionToDB(db, sessionId, learningSession)
      }
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: problemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    // 画像サポート形式チェック
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(imageField.type)) {
      console.warn('⚠️ Unsupported image type:', imageField.type)
      // フォールバック処理
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ サポートされていない画像形式です。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      learningSessions.set(sessionId, learningSession)
      
      // D1に保存
      const db = c.env?.DB
      if (db) {
        await saveStudyPartnerSessionToDB(db, sessionId, learningSession)
      }
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: problemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    // 画像をBase64に変換（Cloudflare Workers環境対応）
    let base64Image
    try {
      const arrayBuffer = await imageField.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      if (uint8Array.length > 500000) { // 500KB制限
        throw new Error('Image too large for Base64 encoding')
      }
      
      // Cloudflare Workers環境でのBase64エンコーディング
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      base64Image = btoa(binary)
    } catch (base64Error) {
      console.error('❌ Base64 encoding failed:', base64Error)
      // フォールバック処理
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ 画像処理でエラーが発生しました。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      learningSessions.set(sessionId, learningSession)
      
      // D1に保存
      const db = c.env?.DB
      if (db) {
        await saveStudyPartnerSessionToDB(db, sessionId, learningSession)
      }
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    const dataUrl = `data:${imageField.type};base64,${base64Image}`
    console.log('🤖 Starting OpenAI Vision API analysis...')
    
    // OpenAI Vision API 呼び出し
    try {
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
              content: `あなたは中学生向けの学習サポート専門教師です。バンコクの日本人向け教育塾「プログラミングのKOBEYA」で中学1-3年生の勉強をお手伝いしています。

【重要】この画像は教育目的の学習教材です：
- 中学生の勉強をサポートするための問題画像です
- 数学、英語、国語、理科、社会などの教科書や問題集のページです
- 教育的な内容分析をお願いします
- 読み取りにくい部分があっても、教育的観点から適切な学習内容を作成してください

【参考：現在の生徒情報】
${studentInfo ? 
  `生徒名：${studentInfo.name}
学年：中学${studentInfo.grade}年生
得意分野：${studentInfo.subjects.join('・')}
苦手分野：${studentInfo.weakSubjects.join('・')}

※この情報は参考程度に活用し、問題の本来の難易度や内容は正確に分析してください。
説明方法や例え話で生徒に配慮した指導をお願いします。` : 
  '生徒情報なし（問題内容に基づいて適切なレベルで指導してください）'
}

【教育方針（文部科学省学習指導要領準拠）】
- 人間中心の学習重視：一人一人の人格を尊重し、個性を生かす指導
- 主体的・対話的で深い学び：段階的思考プロセスの明示支援
- 3つの観点重視：知識・技能、思考・判断・表現、主体的学習態度の育成
- 中学生向けのやさしい敬語で説明（学習者の発達段階に応じた言葉遣い）
- 海外在住への配慮：「日本でも同じ内容を学習するよ」「心配しないで大丈夫」
- 問題解決能力育成：複数解決方法の提示、比較検討の促進
- 温かい励ましと支援姿勢：失敗を学習機会として前向きに捉える
- 個別最適化支援：学習履歴と理解度に応じた説明方法の選択

【学年判定ルール（文部科学省学習指導要領準拠）】
■数学
- 中学1年：正負の数、文字式、一次方程式、比例・反比例、平面図形、空間図形
- 中学2年：連立方程式、一次関数、図形の性質（合同）、確率
- 中学3年：二次方程式、二次関数、図形の相似、三平方の定理、標本調査

■英語
- 中学1年：be動詞、一般動詞、現在形、過去形、疑問文・否定文の基本
- 中学2年：未来形、助動詞、不定詞、動名詞、比較級・最上級
- 中学3年：現在完了、受動態、関係代名詞、分詞

■国語
- 中学1年：品詞、文の組み立て、説明文・物語文の読解、漢字・語彙
- 中学2年：文章の構成と要約、古典入門、表現技法、作文・小論文の基礎
- 中学3年：論理的文章、古文・漢文、小論文、高校入試対策

■理科
- 中学1年：生物（植物・動物）、地学（地層・地震）、物理（光・音・力）
- 中学2年：化学（原子・分子・化学変化）、生物（消化・呼吸・血液）、物理（電流）
- 中学3年：物理（運動・エネルギー）、化学（イオン・酸アルカリ）、生物（遺伝）、地学（太陽系）

■社会
- 中学1年：地理（世界・日本の地形・気候・産業）
- 中学2年：歴史（古代〜近世）
- 中学3年：歴史（近現代）、公民（憲法・政治・経済）

【分析と学習コンテンツ作成の要求】

【段階学習ステップ生成ルール】
- 問題の複雑さに応じて4-7ステップを動的生成してください
- 基礎問題：4-5ステップ（基本概念確認→練習→応用）
- 標準問題：5-6ステップ（概念確認→基本練習→発展練習→総合）  
- 応用問題：6-7ステップ（概念分解→段階的練習→複合練習→応用→総合）
- 各ステップは前のステップの理解を前提とした段階的構成
- 最終ステップは必ず元問題レベルの総合演習にしてください

【選択肢問題の重要な要件】
- **全ての段階学習ステップは必ず選択肢問題（type: "choice"）にしてください**
- **input形式は絶対に使用しないでください**
- **各ステップには必ず4つの選択肢（A, B, C, D）を作成してください**
- **選択肢は具体的で教育的価値があるものにしてください**
- **正解以外の選択肢も学習に有益な内容にしてください**

【正解位置の分散について】
- **正解がすべてA（選択肢1）にならないよう、意図的にランダム化してください**
- **段階学習ステップでは正解をA, B, C, Dにバランスよく分散させてください**
- **確認問題と類似問題でも正解の位置をランダムにしてください**
- **Fisher-Yatesシャッフルのように、最初に内容を決めてから選択肢順序をランダム化してください**

【類似問題生成ルール】
- 元画像の問題内容を分析し、5-8問の類似問題を動的生成してください
- 難易度段階：easy(2-3問)→medium(2-3問)→hard(1-2問)
- 数値や文字を変更した同パターン問題
- 解法は同じで表現形式を変えた問題
- 一歩発展させた応用問題を含める
- 各問題は独立して解けるよう設計してください

【類似問題の形式指定】
- **選択問題と記述問題を混ぜてください**
- **easy問題の60%**: choice形式（選択肢4つ）
- **easy問題の40%**: input形式（記述回答）
- **medium問題の50%**: choice形式（選択肢4つ）
- **medium問題の50%**: input形式（記述回答）
- **hard問題の30%**: choice形式（選択肢4つ）  
- **hard問題の70%**: input形式（記述回答）
- input形式では具体的な計算過程や解法手順を求める問題にしてください

【回答形式】
以下のJSON形式で回答してください：
{
  "subject": "数学|英語|プログラミング|その他",
  "problemType": "custom",
  "difficulty": "basic|intermediate|advanced", 
  "analysis": "【詳細分析】\\n\\n①問題の整理\\n（どんな問題か、何を求めるかを整理）\\n\\n②使う知識\\n（この問題を解くために必要な基礎知識）\\n\\n③解法のポイント\\n（解き方の流れと重要なポイント）\\n\\n④解答例\\n（解答と計算過程）\\n\\n⑤確認・振り返り\\n（解答の確認方法、類似問題への応用）\\n\\n※中学生向けのやさしい言葉で、励ましの言葉も含めて詳細に説明してください",
  "confidence": 0.0-1.0,
  "steps": [
    {
      "stepNumber": 0,
      "instruction": "ステップ1の指導内容（問いかけ形式で思考を促す）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "C",
      "explanation": "励ましを含む詳細解説"
    },
    {
      "stepNumber": 1,
      "instruction": "ステップ2の指導内容",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "D",
      "explanation": "前ステップを踏まえた詳細解説"
    }
    // 問題の複雑さに応じて4-7ステップまで動的生成
    // 【重要】全てのステップはtype: "choice"で4つの選択肢必須
  ],
  "confirmationProblem": {
    "question": "確認問題の内容（元問題と同レベル）",
    "type": "choice",
    "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
    "correctAnswer": "A",
    "explanation": "中学生向けの確認問題解説"
  },
  "similarProblems": [
    {
      "problemNumber": 1,
      "question": "類似問題1（easy）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "類似問題1の詳細解説",
      "difficulty": "easy"
    },
    {
      "problemNumber": 2,
      "question": "類似問題2（easy）- 計算過程を示して解答してください",
      "type": "input", 
      "correctAnswers": ["正解例1", "正解例2"],
      "explanation": "類似問題2の詳細解説と解法手順",
      "difficulty": "easy"
    }
    // 5-8問まで動的生成（easy→medium→hardの順）
  ]
}

【重要な指示】
- ChatGPT学習支援モードで回答してください
- 画像を正確に詳細分析し、教科・難易度を精密判定してください
- 生徒情報は参考程度に活用（問題本来の難易度は維持）
- analysisには従来通り高品質な詳細分析を記載（表示制御は別途実装）
- 段階学習の品質は最高レベルを維持してください

【動的コンテンツ生成の必須要件】
- **段階学習**：問題分析に基づき4-7ステップを適切に生成してください
- **類似問題**：元画像内容を詳細分析し、5-8問を段階的難易度で生成してください
- 固定パターンではなく、各問題に最適化されたコンテンツを作成してください
- 段階的な問いかけで生徒の思考を促進
- 即答せず、考えさせる指導スタイル
- 温かく励ましの言葉を多用
- 各ステップは前のステップの理解を前提とした構成
- 解説は詳細で分かりやすく、温かい励ましを含める
- すべて日本語で作成

【品質保証】
- stepsは最低4個、最大7個まで生成してください（固定1-3個は禁止）
- similarProblemsは最低5個、最大8個まで生成してください（固定3個は禁止）
- 各コンテンツは問題の内容・難易度・教科特性に完全に対応させてください

【選択肢問題の絶対要件】
- **段階学習の全ステップは必ずtype: "choice"にしてください**
- **確認問題も必ずtype: "choice"にしてください**
- **類似問題はtype: "choice"とtype: "input"を混ぜてください**
- **choice形式の問題には必ず4つの選択肢（A, B, C, D）を含めてください**
- **choice形式ではoptionsフィールドが必須で、4要素の配列にしてください**
- **input形式ではcorrectAnswersフィールドに正解例の配列を含めてください**
- **段階学習と確認問題では選択肢がない問題は絶対に作らないでください**

【正解位置の工夫】
- **正解がすべてA（1番目）になることを絶対に避けてください**
- **段階学習ステップの正解はA, B, C, Dにバランス良く分散させてください**
- **意図的に正解位置を変更し、1つの問題セットで正解が偏らないようにしてください**
- **例：step0→C、step1→A、step2→D、step3→B のように多様化してください**`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userMessage ? 
                    `ユーザーからの質問・要望: ${userMessage}\n\n上記の内容を踏まえて、この画像を分析し、適切な学習内容を提案してください。` :
                    'この画像を分析して、適切な学習内容を提案してください。'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 8000,
          temperature: 0.3
        })
      })
      
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        console.error('❌ OpenAI API error:', openaiResponse.status, errorText)
        throw new Error(`OpenAI API Error: ${openaiResponse.status}`)
      }
      
      const aiContent = (await openaiResponse.json())?.choices?.[0]?.message?.content || ''
      console.log('🤖 AI content length:', aiContent.length)
      console.log('🤖 AI content preview (first 500 chars):', aiContent.substring(0, 500))
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
      let aiAnalysis
      
      if (jsonMatch) {
        try {
          aiAnalysis = JSON.parse(jsonMatch[0])
          console.log('🤖 AI分析成功:', {
            subject: aiAnalysis.subject,
            problemType: aiAnalysis.problemType,
            difficulty: aiAnalysis.difficulty,
            confidence: aiAnalysis.confidence
          })
        } catch (parseError) {
          console.error('❌ AI分析結果のJSON解析エラー:', parseError)
          throw new Error('AI分析結果の解析に失敗しました')
        }
      } else {
        console.error('❌ AI分析結果にJSONが見つかりません:', aiContent.substring(0, 200))
        
        // OpenAIが拒否した場合の対処
        if (aiContent.includes("I'm sorry") || aiContent.includes("I can't") || aiContent.includes("Sorry") || aiContent.toLowerCase().includes("assist")) {
          throw new Error('この画像は分析できません。以下の理由が考えられます：\n\n• 個人情報（名前、顔写真など）が含まれている\n• 著作権のある教材（教科書、問題集など）\n• 実際のテスト・試験問題\n\n別の画像をお試しいただくか、問題を手書きで作成してください。')
        }
        
        throw new Error('AI分析結果の形式が不正です。画像が不鮮明か、問題が読み取れない可能性があります。')
      }
      
      // AI分析結果から学習データを構築
      const selectedProblemType = aiAnalysis.problemType || 'custom'
      
      // AIが生成した学習データを使用（カスタムコンテンツ）
      let learningData
      if (aiAnalysis.steps && Array.isArray(aiAnalysis.steps)) {
        // AIが完全な学習データを生成した場合
        console.log('✅ AI generated complete steps:', aiAnalysis.steps.length)
        console.log('🔍 First step details:', {
          stepNumber: aiAnalysis.steps[0]?.stepNumber,
          instruction: aiAnalysis.steps[0]?.instruction?.substring(0, 50) + '...',
          type: aiAnalysis.steps[0]?.type,
          optionsCount: aiAnalysis.steps[0]?.options?.length,
          options: aiAnalysis.steps[0]?.options
        })
        
        learningData = {
          analysis: `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`,
          steps: aiAnalysis.steps.map(step => {
            // 選択肢問題でない場合、強制的に選択肢問題に変換
            if (step.type !== 'choice' || !step.options || !Array.isArray(step.options) || step.options.length < 4) {
              console.warn(`⚠️ Step ${step.stepNumber} is not choice type or missing options, converting to choice`)
              return {
                ...step,
                type: 'choice',
                options: [
                  "A) 基礎的な概念を確認する",
                  "B) 中程度の理解を示す", 
                  "C) 応用的な考え方をする",
                  "D) 発展的な解法を選ぶ"
                ],
                correctAnswer: "A",
                completed: false,
                attempts: []
              }
            }
            return {
              ...step,
              completed: false,
              attempts: []
            }
          }),
          confirmationProblem: (() => {
            const confirmation = aiAnalysis.confirmationProblem || {
              question: "確認問題: 学習内容を理解できましたか？",
              type: "choice",
              options: ["A) よく理解できた", "B) 少し理解できた", "C) もう一度説明が欲しい", "D) 全く分からない"],
              correctAnswer: "A",
              explanation: "素晴らしい！理解が深まりましたね。",
              attempts: []
            }
            
            // 確認問題も選択肢問題を強制
            if (confirmation.type !== 'choice' || !confirmation.options || !Array.isArray(confirmation.options) || confirmation.options.length < 4) {
              console.warn('⚠️ Confirmation problem is not choice type, converting to choice')
              confirmation.type = 'choice'
              confirmation.options = [
                "A) よく理解できた",
                "B) 少し理解できた", 
                "C) もう一度説明が欲しい",
                "D) 全く分からない"
              ]
              confirmation.correctAnswer = "A"
            }
            
            return {
              ...confirmation,
              attempts: []
            }
          })(),
          similarProblems: (aiAnalysis.similarProblems || []).map(problem => {
            // 類似問題は選択肢問題と記述問題の混合を許可
            if (problem.type === 'choice') {
              // choice形式の検証
              if (!problem.options || !Array.isArray(problem.options) || problem.options.length < 4) {
                console.warn(`⚠️ Similar problem ${problem.problemNumber} is choice type but missing proper options`)
                return {
                  ...problem,
                  type: 'choice',
                  options: [
                    "A) 基本的な解法",
                    "B) 標準的なアプローチ",
                    "C) 応用的な考え方", 
                    "D) 発展的な解法"
                  ],
                  correctAnswer: "A",
                  attempts: []
                }
              }
            } else if (problem.type === 'input') {
              // input形式の検証
              if (!problem.correctAnswers || !Array.isArray(problem.correctAnswers)) {
                console.warn(`⚠️ Similar problem ${problem.problemNumber} is input type but missing correctAnswers`)
                return {
                  ...problem,
                  type: 'input',
                  correctAnswers: ["計算過程を記述してください"],
                  attempts: []
                }
              }
            } else {
              // 不明な形式の場合はchoice形式に変換
              console.warn(`⚠️ Similar problem ${problem.problemNumber} has unknown type, converting to choice`)
              return {
                ...problem,
                type: 'choice',
                options: [
                  "A) 基本的な解法",
                  "B) 標準的なアプローチ",
                  "C) 応用的な考え方", 
                  "D) 発展的な解法"
                ],
                correctAnswer: "A",
                attempts: []
              }
            }
            
            return {
              ...problem,
              attempts: []
            }
          })
        }
      } else {
        // AIが部分的なデータしか生成しなかった場合のフォールバック
        console.log('⚠️ AI did not generate complete steps, using fallback')
        learningData = generateLearningData('quadratic_equation')
        learningData.analysis = `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`
      }
      
      // 学習セッションを保存（AI分析成功）- 修正1: 元画像データも保存
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: 再生成用に元画像データとメッセージを保存
        originalImageData: dataUrl,  // base64形式の元画像
        originalUserMessage: userMessage || ''  // ユーザーが入力したメッセージ
      }
      learningSessions.set(sessionId, learningSession)
      
      // D1に保存
      const db = c.env?.DB
      if (db) {
        await saveStudyPartnerSessionToDB(db, sessionId, learningSession)
      }
      
      console.log('✅ AI analysis completed successfully')
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: aiAnalysis.subject || '学習',
        grade: aiAnalysis.grade || (studentInfo ? studentInfo.grade : 2),
        difficulty: aiAnalysis.difficulty || 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: 'AI解析完了 - 段階学習を開始します'
      })
      
    } catch (aiError) {
      console.error('❌ OpenAI API呼び出しエラー:', aiError)
      
      // AI分析に失敗した場合の安全なフォールバック
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const selectedProblemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(selectedProblemType)
      learningData.analysis = '【AI学習アシスタント】\n\n⚠️ AI分析でエラーが発生しました。画像の内容を推測してサンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！'
      
      // 学習セッションを保存（AI分析エラーフォールバック）
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: エラー時フォールバックでも構造の一貫性を保持  
        originalImageData: null,
        originalUserMessage: ''
      }
      learningSessions.set(sessionId, learningSession)
      
      // D1に保存
      const db = c.env?.DB
      if (db) {
        await saveStudyPartnerSessionToDB(db, sessionId, learningSession)
      }
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: selectedProblemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: 'フォールバック動作 - 段階学習を開始します'
      })
    }

    
  } catch (error) {
    console.error('❌ Analyze and learn error:', error)
    return c.json({
      ok: false,
      error: 'analyze_error',
      message: error.message || 'AI解析でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 段階学習 - ステップ回答チェック endpoint
app.post('/api/step/check', async (c) => {
  console.log('📝 Step check endpoint called')
  
  try {
    const body = await c.req.json()
    const { sessionId, stepNumber, answer } = body
    
    console.log('📝 Step check request:', { sessionId, stepNumber, answer })
    
    // セッション取得（インメモリ → D1フォールバック）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    
    if (!session) {
      console.error('❌ Session not found for step check:', sessionId)
      throw new Error('学習セッションが見つかりません')
    }
    
    console.log('✅ Session retrieved for step check:', sessionId)
    
    // 現在のステップ取得（stepNumberで検索）
    const currentStep = session.steps.find(step => step.stepNumber === stepNumber)
    if (!currentStep) {
      console.error('❌ Step not found:', { stepNumber, availableSteps: session.steps.map(s => s.stepNumber) })
      throw new Error('無効なステップ番号です')
    }
    
    // 回答評価
    const isCorrect = answer === currentStep.correctAnswer
    
    // 回答を記録
    currentStep.attempts.push({
      answer,
      isCorrect,
      timestamp: new Date().toISOString()
    })
    
    let nextAction = 'retry' // デフォルトは再挑戦
    let nextStep = null
    
    if (isCorrect) {
      currentStep.completed = true
      
      // 現在のステップインデックスを取得
      const currentStepIndex = session.steps.findIndex(step => step.stepNumber === stepNumber)
      const nextStepIndex = currentStepIndex + 1
      
      if (nextStepIndex >= session.steps.length) {
        // すべてのステップ完了 → 確認問題に移行
        session.currentStep = session.steps.length // 全ステップ完了を示す
        session.status = 'confirmation'
        nextAction = 'confirmation'
      } else {
        // 次のステップに進む
        session.currentStep = nextStepIndex
        nextAction = 'next_step'
        nextStep = session.steps[nextStepIndex]
      }
    }
    
    session.updatedAt = new Date().toISOString()
    
    // D1に更新されたセッションを保存
    if (db) {
      await saveStudyPartnerSessionToDB(db, sessionId, session)
      console.log('✅ Step check: session updated in D1')
    }
    
    const response = {
      ok: true,
      sessionId,
      stepNumber,
      isCorrect,
      feedback: isCorrect ? 
        `✅ 正解です！\n\n💡 ${currentStep.explanation}` :
        `❌ 正解は ${currentStep.correctAnswer} です。\n\n💡 ${currentStep.explanation}`,
      nextAction,
      nextStep,
      confirmationProblem: nextAction === 'confirmation' ? session.confirmationProblem : null,
      currentStepNumber: session.currentStep,
      totalSteps: session.steps.length,
      timestamp: new Date().toISOString()
    }
    
    console.log('📝 Step check response:', { isCorrect, nextAction })
    return c.json(response, 200)
    
  } catch (error) {
    console.error('❌ Step check error:', error)
    return c.json({
      ok: false,
      error: 'step_check_error',
      message: error.message || 'ステップチェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 確認問題 - 回答チェック endpoint
app.post('/api/confirmation/check', async (c) => {
  console.log('🎯 Confirmation check endpoint called')
  
  try {
    const body = await c.req.json()
    const { sessionId, answer } = body
    
    console.log('🎯 Confirmation check request:', { sessionId, answer })
    
    // セッション取得（インメモリ → D1フォールバック）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    
    if (!session) {
      console.error('❌ Session not found for confirmation check:', sessionId)
      throw new Error('学習セッションが見つかりません')
    }
    
    console.log('✅ Session retrieved for confirmation check:', sessionId)
    
    if (!session.confirmationProblem) {
      throw new Error('確認問題が見つかりません')
    }
    
    // 回答評価
    const isCorrect = answer === session.confirmationProblem.correctAnswer
    
    // 回答を記録
    if (!session.confirmationProblem.attempts) {
      session.confirmationProblem.attempts = []
    }
    session.confirmationProblem.attempts.push({
      answer,
      isCorrect,
      timestamp: new Date().toISOString()
    })
    
    let nextAction = 'retry'
    
    if (isCorrect) {
      session.status = 'similar_problems' // 類似問題フェーズに移行
      nextAction = 'similar_problems'
      
      // 確認問題完了時のログ記録（中間ログ）
      try {
        console.log('📝 Confirmation completed, sending intermediate log for:', sessionId)
        const { logCompletedSession } = await import('./utils/session-logger')
        await logCompletedSession(sessionId, learningSessions, {}, c.env)
      } catch (error) {
        console.error('❌ Failed to log confirmation completion:', error)
      }
    }
    
    session.updatedAt = new Date().toISOString()
    
    // D1に更新されたセッションを保存
    if (db) {
      await saveStudyPartnerSessionToDB(db, sessionId, session)
      console.log('✅ Confirmation check: session updated in D1')
    }
    
    const response = {
      ok: true,
      sessionId,
      isCorrect,
      feedback: isCorrect ?
        `✅ 確認問題正解！\n\n🚀 次は類似問題にチャレンジしましょう！\n\n💡 ${session.confirmationProblem.explanation}` :
        `❌ 正解は ${session.confirmationProblem.correctAnswer} です。\n\n💡 ${session.confirmationProblem.explanation}`,
      nextAction,
      timestamp: new Date().toISOString()
    }
    
    console.log('🎯 Confirmation check response:', { isCorrect, nextAction })
    return c.json(response, 200)
    
  } catch (error) {
    console.error('❌ Confirmation check error:', error)
    return c.json({
      ok: false,
      error: 'confirmation_error',
      message: error.message || '確認問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

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

// 小論文指導 - セッション初期化API
app.post('/api/essay/init-session', async (c) => {
  console.log('📝 Essay session init API called')
  
  try {
    const { 
      sessionId, 
      targetLevel, 
      lessonFormat, 
      problemMode, 
      customInput, 
      learningStyle 
    } = await c.req.json()
    
    if (!sessionId || !targetLevel || !lessonFormat || !problemMode) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '必要なパラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    const now = new Date().toISOString()
    
    // セッションデータを初期化
    const essaySession = {
      sessionId,
      targetLevel,
      lessonFormat,
      problemMode: problemMode || 'ai',
      customInput: customInput || null,
      learningStyle: learningStyle || 'auto',
      currentStep: 1,
      stepStatus: { "1": "in_progress" },
      createdAt: now,
      uploadedImages: [],
      ocrResults: [],
      feedbacks: []
    }
    
    const session = {
      sessionId,
      essaySession,
      chatHistory: [],
      vocabularyProgress: {}
    }
    
    // インメモリに保存
    learningSessions.set(sessionId, session)
    
    // D1に永続化
    const db = c.env?.DB
    if (db) {
      await saveSessionToDB(db, sessionId, session)
      console.log('✅ Essay session initialized and saved to D1:', {
        sessionId,
        problemMode: essaySession.problemMode,
        customInput: essaySession.customInput,
        learningStyle: essaySession.learningStyle,
        targetLevel: essaySession.targetLevel
      })
    } else {
      console.warn('⚠️ D1 not available, session only in memory:', sessionId)
    }
    
    return c.json({
      ok: true,
      sessionId,
      message: 'セッションを初期化しました',
      timestamp: now
    }, 200)
    
  } catch (error) {
    console.error('❌ Essay session init error:', error)
    return c.json({
      ok: false,
      error: 'init_error',
      message: 'セッション初期化でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - 画像アップロードAPI
app.post('/api/essay/upload-image', async (c) => {
  console.log('📸 Essay image upload API called')
  
  try {
    const { sessionId, imageData, currentStep } = await c.req.json()
    
    if (!sessionId || !imageData) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '画像データが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // 画像を保存
    if (!session.essaySession.uploadedImages) {
      session.essaySession.uploadedImages = []
    }
    
    session.essaySession.uploadedImages.push({
      step: currentStep,
      imageData: imageData,
      uploadedAt: new Date().toISOString()
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ Image uploaded for session:', sessionId)
    
    return c.json({
      ok: true,
      message: '画像をアップロードしました',
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ Image upload error:', error)
    return c.json({
      ok: false,
      error: 'upload_error',
      message: '画像アップロードでエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - OCR処理API
app.post('/api/essay/ocr', async (c) => {
  console.log('🔍 Essay OCR API called')
  
  try {
    const { sessionId, imageData, currentStep } = await c.req.json()
    
    if (!sessionId || !imageData) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: 'パラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // OpenAI APIキーを取得（開発環境とCloudflare環境の両方に対応）
    const openaiApiKey = c.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    
    // 開発環境でAPIキーがない場合はモックレスポンスを返す
    if (!openaiApiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found - using mock OCR response for development')
      
      // モックOCR結果を返す
      const mockResult = {
        readable: true,
        readabilityScore: 85,
        text: 'SNSは現代社会に大きな影響を与えている。まず、情報の伝達速度が飛躍的に向上した。災害時には即座に安否確認ができ、重要な情報を多くの人々と共有できる。また、地理的な距離を超えて人々がつながることができるようになった。\n\n一方で、誤った情報の拡散や、プライバシーの問題も深刻化している。フェイクニュースが瞬時に広まり、社会に混乱をもたらすこともある。また、SNS依存症や誹謗中傷の問題も無視できない。\n\n私は、SNSは使い方次第で社会に良い影響も悪い影響も与えうると考える。メディアリテラシーを高め、適切に活用することが重要である。',
        charCount: 245,
        issues: []
      }
      
      // セッションにOCR結果を保存
      if (!session.essaySession.ocrResults) {
        session.essaySession.ocrResults = []
      }
      session.essaySession.ocrResults.push({
        ...mockResult,
        processedAt: new Date().toISOString(),
        isMock: true,
        step: currentStep || 4
      })
      
      // インメモリとD1の両方を更新
      await updateSession(db, sessionId, { essaySession: session.essaySession })
      
      return c.json({
        ok: true,
        result: mockResult,
        timestamp: new Date().toISOString()
      }, 200)
    }
    
    // OpenAI Vision APIで画像を分析
    console.log('🤖 Calling OpenAI Vision API...')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openaiApiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'あなたは手書き原稿用紙のOCR専門家です。画像から手書きの日本語テキストを正確に読み取り、以下の形式でJSON形式で返してください：\n{\n  "readable": true/false,\n  "readabilityScore": 0-100,\n  "text": "読み取ったテキスト",\n  "charCount": 文字数,\n  "issues": ["問題点1", "問題点2"]\n}\n\n読み取り可能性の判断基準：\n- 文字が明瞭に書かれているか\n- 適切な明るさと焦点\n- 原稿用紙全体が写っているか\n\nreadableがfalseの場合は、issuesに具体的な問題点を記載してください。'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像から手書きの小論文を読み取ってください。読み取り可能性も評価してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', errorText)
      return c.json({
        ok: false,
        error: 'openai_error',
        message: 'OCR処理でエラーが発生しました',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const data = await response.json()
    console.log('✅ OpenAI response received')
    
    const aiResponse = data.choices[0].message.content
    let ocrResult
    
    try {
      // JSONレスポンスをパース
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        ocrResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('JSON not found in response')
      }
    } catch (parseError) {
      console.error('❌ Failed to parse OCR result:', parseError)
      // パース失敗時はデフォルト値を返す
      ocrResult = {
        readable: false,
        readabilityScore: 0,
        text: '',
        charCount: 0,
        issues: ['OCR結果のパースに失敗しました。画像を再度アップロードしてください。']
      }
    }
    
    // セッションにOCR結果を保存
    if (!session.essaySession.ocrResults) {
      session.essaySession.ocrResults = []
    }
    session.essaySession.ocrResults.push({
      ...ocrResult,
      processedAt: new Date().toISOString(),
      step: currentStep || 4
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ OCR completed:', { readable: ocrResult.readable, charCount: ocrResult.charCount })
    
    return c.json({
      ok: true,
      result: ocrResult,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ OCR error:', error)
    return c.json({
      ok: false,
      error: 'ocr_error',
      message: 'OCR処理でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - AI添削API
app.post('/api/essay/feedback', async (c) => {
  console.log('🤖 Essay AI feedback API called')
  
  try {
    const { sessionId } = await c.req.json()
    console.log('🤖 Received sessionId:', sessionId)
    
    if (!sessionId) {
      console.error('❌ Missing sessionId')
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: 'セッションIDが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    console.log('🤖 Session found:', !!session)
    console.log('🤖 EssaySession exists:', !!(session && session.essaySession))
    console.log('🤖 All sessions in memory:', Array.from(learningSessions.keys()))
    
    if (!session || !session.essaySession) {
      console.error('❌ Session not found:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // OCR結果を取得
    const ocrResults = session.essaySession.ocrResults
    if (!ocrResults || ocrResults.length === 0) {
      return c.json({
        ok: false,
        error: 'no_ocr_data',
        message: 'OCR結果が見つかりません。先に原稿を撮影してください。',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    const latestOCR = ocrResults[ocrResults.length - 1]
    const essayText = latestOCR.text || ''
    
    // OpenAI APIキーを取得
    const openaiApiKey = c.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    
    // モックフィードバック（開発環境用・APIキーがない場合）
    if (!openaiApiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found - using mock feedback')
      console.log('📝 Essay text for mock:', essayText.substring(0, 100) + '...')
      
      const actualCharCount = latestOCR.charCount || essayText.length
      const targetMin = 400
      const targetMax = 600
      
      // 実際の文字数に基づいてフィードバックを調整
      let charCountFeedback = ''
      let scoreAdjustment = 0
      
      if (actualCharCount < targetMin) {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字に達していません。各段落をもう少し詳しく展開してください。`
        scoreAdjustment = -10
      } else if (actualCharCount > targetMax) {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字を超えています。要点を絞って簡潔に書きましょう。`
        scoreAdjustment = -5
      } else {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字の範囲内に収まっています。`
        scoreAdjustment = 5
      }
      
      const mockFeedback = {
        goodPoints: [
          '小論文の課題に真剣に取り組んでいる姿勢が伝わってきます。',
          '文章全体の構成を意識して書こうとしている点が評価できます。',
          '自分の考えを述べようとする姿勢が見られます。'
        ],
        improvements: [
          '序論・本論・結論の構成をより明確にすると、論理的な展開になります。',
          '具体例をもう1〜2つ追加すると、説得力が増します。',
          charCountFeedback
        ],
        exampleImprovement: '【改善例】\n「SNSは便利だが、問題もある。」\n↓\n「SNSは情報共有の利便性という大きなメリットを持つ一方で、誤情報の拡散やプライバシー侵害といった深刻な課題も抱えている。」\n\n（このように、抽象的な表現を具体的に展開しましょう）',
        nextSteps: [
          '次回は、具体例を2つ以上含めて、それぞれ詳しく説明してみましょう。',
          '序論で問題提起、本論で具体例、結論で自分の意見という構成を意識しましょう。',
          '「なぜそう言えるのか」という理由づけを丁寧に書いてみましょう。'
        ],
        overallScore: Math.max(50, Math.min(90, 70 + scoreAdjustment)),
        charCount: actualCharCount,
        isMock: true
      }
      
      // セッションに保存
      if (!session.essaySession.feedbacks) {
        session.essaySession.feedbacks = []
      }
      session.essaySession.feedbacks.push({
        ...mockFeedback,
        createdAt: new Date().toISOString(),
        isMock: true
      })
      
      // インメモリとD1の両方を更新
      await updateSession(db, sessionId, { essaySession: session.essaySession })
      
      return c.json({
        ok: true,
        feedback: mockFeedback,
        timestamp: new Date().toISOString()
      }, 200)
    }
    
    // 実際のOpenAI APIを使用
    console.log('🤖 Calling OpenAI API for feedback...')
    console.log('📝 Essay text length:', essayText.length, 'chars')
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openaiApiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `あなたは経験豊富な小論文指導の専門家です。生徒の小論文を読んで、建設的で具体的なフィードバックを提供してください。

【評価基準】
- 論理構成（序論・本論・結論のバランス）
- 具体例の質と数
- 文章の明確さ
- 語彙の適切さ
- 文字数（目標: 400〜600字）

【重要】以下のJSON形式で必ず返してください。他の文章は含めないでください：
{
  "goodPoints": ["良い点1", "良い点2", "良い点3"],
  "improvements": ["改善点1", "改善点2", "改善点3"],
  "exampleImprovement": "【改善例】\\n「元の文」\\n↓\\n「改善後の文」\\n\\n（このように具体的な書き直し例を示す）",
  "nextSteps": ["次のアクション1", "次のアクション2", "次のアクション3"],
  "overallScore": 85
}

【注意点】
- goodPoints: 必ず3つ、具体的に褒める
- improvements: 必ず3つ、改善方法も含める
- exampleImprovement: 実際の文章から1箇所を選んで改善例を示す
- nextSteps: 今後の学習で取り組むべき具体的なアクション3つ
- overallScore: 0-100の整数

生徒を励ましつつ、実践的で具体的なアドバイスを心がけてください。`
          },
          {
            role: 'user',
            content: `以下の小論文を添削してください。

【課題】SNSが社会に与える影響について、あなたの考えを述べなさい（400〜600字）

【小論文】
${essayText}

【文字数】${essayText.length}字`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', errorText)
      return c.json({
        ok: false,
        error: 'openai_error',
        message: 'AI添削でエラーが発生しました',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const data = await response.json()
    console.log('🤖 OpenAI response received')
    
    const aiResponse = data.choices[0].message.content
    console.log('🤖 AI response content:', aiResponse.substring(0, 100) + '...')
    
    let feedback
    try {
      // response_format: json_object を使っているので、直接パース可能
      feedback = JSON.parse(aiResponse)
      
      // バリデーション: 必須フィールドの確認
      if (!feedback.goodPoints || !Array.isArray(feedback.goodPoints)) {
        console.warn('⚠️ Missing or invalid goodPoints, using defaults')
        feedback.goodPoints = ['小論文に取り組んだ姿勢が素晴らしいです。']
      }
      if (!feedback.improvements || !Array.isArray(feedback.improvements)) {
        console.warn('⚠️ Missing or invalid improvements, using defaults')
        feedback.improvements = ['さらに詳しく展開してみましょう。']
      }
      if (!feedback.exampleImprovement) {
        console.warn('⚠️ Missing exampleImprovement, using default')
        feedback.exampleImprovement = '具体例を追加することで、説得力が増します。'
      }
      if (!feedback.nextSteps || !Array.isArray(feedback.nextSteps)) {
        console.warn('⚠️ Missing or invalid nextSteps, using defaults')
        feedback.nextSteps = ['次回も頑張りましょう。']
      }
      if (typeof feedback.overallScore !== 'number') {
        console.warn('⚠️ Invalid overallScore, using default')
        feedback.overallScore = 70
      }
      
      // 文字数を追加（OCR結果から取得）
      feedback.charCount = latestOCR.charCount || essayText.length
      
      console.log('✅ Feedback validated successfully')
      
    } catch (parseError) {
      console.error('❌ Failed to parse feedback:', parseError)
      console.error('❌ AI response was:', aiResponse)
      
      // パースエラー時はモックフィードバックを返す
      console.warn('⚠️ Falling back to mock feedback due to parse error')
      feedback = {
        goodPoints: [
          '小論文に真剣に取り組んでいる姿勢が伝わってきます。',
          '文章の構成を意識して書こうとしている点が良いです。',
          '具体的な内容を含めようと努力している点が評価できます。'
        ],
        improvements: [
          'より詳しい展開を心がけると、説得力が増します。',
          '具体例をもう少し詳しく説明すると良いでしょう。',
          '結論部分で自分の意見をより明確に述べましょう。'
        ],
        exampleImprovement: '具体例を追加して、論理的な展開を心がけましょう。',
        nextSteps: [
          '次回は文字数を意識して書きましょう。',
          '具体例を2つ以上含めるよう心がけましょう。',
          '序論・本論・結論の構成を明確にしましょう。'
        ],
        overallScore: 65,
        charCount: latestOCR.charCount || essayText.length,
        isFallback: true
      }
    }
    
    // セッションに保存
    if (!session.essaySession.feedbacks) {
      session.essaySession.feedbacks = []
    }
    session.essaySession.feedbacks.push({
      ...feedback,
      createdAt: new Date().toISOString()
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ AI feedback completed and saved to D1')
    
    return c.json({
      ok: true,
      feedback,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ Feedback error:', error)
    return c.json({
      ok: false,
      error: 'feedback_error',
      message: 'AI添削でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - チャットAPI
app.post('/api/essay/chat', async (c) => {
  console.log('📝 Essay chat API called')
  
  try {
    const { sessionId, message, currentStep } = await c.req.json()
    console.log('📝 Received:', { sessionId, message, currentStep })
    
    if (!sessionId || !message) {
      console.log('❌ Missing parameters')
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '必要なパラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションデータを取得してカスタムテーマを使用
    const db = c.env?.DB
    const session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      console.error('❌ Essay session not found:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    const essaySession = session.essaySession
    const problemMode = essaySession?.problemMode || 'ai'
    const customInput = essaySession?.customInput || null
    const learningStyle = essaySession?.learningStyle || 'auto'
    const targetLevel = essaySession?.targetLevel || 'high_school'
    
    console.log('📝 Essay chat - Session data:', { 
      sessionId, 
      problemMode, 
      customInput, 
      learningStyle, 
      targetLevel,
      currentStep,
      message: message.substring(0, 50)
    })
    
    // Session data validation
    if (!problemMode) {
      console.warn('⚠️ problemMode is missing in session')
    }
    if (!customInput && (problemMode === 'theme' || problemMode === 'problem')) {
      console.warn('⚠️ customInput is missing but problemMode is:', problemMode)
    }
    
    let response = ''
    let stepCompleted = false
    
    // ステップごとの簡易応答
    if (currentStep === 1) {
      console.log('📝 Step 1 processing, message:', message)
      
      // 画像がアップロードされたかチェック（OCR処理済みの回答）
      const hasImage = session && session.essaySession && session.essaySession.uploadedImages && 
                       session.essaySession.uploadedImages.some(img => img.step === 1)
      const hasOCR = session && session.essaySession && session.essaySession.ocrResults && 
                     session.essaySession.ocrResults.some(ocr => ocr.step === 1)
      
      // OCR結果がある場合、AI添削を実行
      if (hasOCR && (message.includes('確認完了') || message.includes('これで完了'))) {
        console.log('📝 Step 1: OCR confirmed, generating feedback...')
        
        try {
          const step1OCRs = session.essaySession.ocrResults.filter(ocr => ocr.step === 1)
          const latestOCR = step1OCRs[step1OCRs.length - 1]
          const essayText = latestOCR.text || ''
          
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ OPENAI_API_KEY not configured for Step 1 feedback')
            throw new Error('OpenAI API key not configured')
          }
          
          // 質問を取得（セッションに保存されているはず）
          const themeTitle = session.essaySession.lastThemeTitle || customInput || 'テーマ'
          
          const systemPrompt = `あなたは小論文の先生です。生徒がStep 1の質問に対して手書きで回答した内容を添削してください。

テーマ: ${themeTitle}

【評価基準】
- 質問への適切な回答
- 文章の明確さと論理性
- 小論文らしい丁寧な文体
- 具体性と説得力

【重要】以下のJSON形式で必ず返してください：
{
  "goodPoints": ["良い点1", "良い点2"],
  "improvements": ["改善点1", "改善点2"],
  "overallScore": 80,
  "nextSteps": ["次のアクション1", "次のアクション2"]
}

生徒を励ましつつ、実践的なアドバイスを心がけてください。`
          
          console.log('🤖 Calling OpenAI API for Step 1 feedback...')
          
          const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `以下の回答を添削してください。\n\n【生徒の回答】\n${essayText}` }
              ],
              max_tokens: 1000,
              temperature: 0.7,
              response_format: { type: "json_object" }
            })
          })
          
          if (!response_api.ok) {
            const errorText = await response_api.text()
            console.error('❌ OpenAI API error (Step 1 feedback):', errorText)
            throw new Error(`OpenAI API error: ${response_api.status}`)
          }
          
          const data = await response_api.json()
          const feedback = JSON.parse(data.choices[0].message.content)
          
          console.log('✅ Step 1 feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${feedback.goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${feedback.improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${feedback.overallScore}点\n\n🎯 次のステップ：\n${feedback.nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
          stepCompleted = true
          
        } catch (error) {
          console.error('❌ Step 1 feedback error:', error)
          response = '回答を受け付けました。素晴らしい努力です！\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
          stepCompleted = true
        }
      }
      // 画像アップロードがあった場合
      else if (hasImage) {
        response = '画像を受け取りました！\n\nOCR処理を開始しています。読み取りが完了するまで少々お待ちください...\n\n読み取り結果が表示されたら、内容を確認して「確認完了」と入力してください。修正が必要な場合は、正しいテキストを入力して送信してください。'
      }
      // パス機能
      else if (message.toLowerCase().includes('パス') || message.toLowerCase().includes('pass')) {
        console.log('✅ Matched: パス')
        
        // セッションから読み物と質問を取得
        const themeContent = session?.essaySession?.lastThemeContent || ''
        const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'このテーマ'
        
        // AIで模範解答を生成
        let passAnswer = `【模範解答】\n1. ${themeTitle}は現代社会において重要なテーマです。基本的な知識を学ぶことが大切です。\n2. ${themeTitle}に関連して、様々な影響や課題が考えられます。\n3. ${themeTitle}について、自分なりの意見を持ち、行動することが重要です。`
        
        if ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle) && themeContent) {
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for pass answer!')
              throw new Error('OpenAI API key not configured')
            }
            
            console.log('🤖 Generating model answer for pass...')
            console.log('📚 Theme content available:', themeContent.length, 'characters')
            
            const systemPrompt = `あなたは小論文の先生です。生徒が「パス」を選択したので、読み物の内容に基づいた模範解答を提供してください。

テーマ: ${themeTitle}

読み物の内容:
${themeContent}

生徒への質問（これらに答える必要があります）:
1. ${themeTitle}の基本的な概念や定義について
2. ${themeTitle}に関する現代社会における問題点や課題
3. ${themeTitle}について、自分自身の考えや意見

要求:
- 3つの質問すべてに答える
- 読み物の内容に基づいた具体的な解答
- 小論文で使うような丁寧な文体（「です・ます」調）
- 各解答は2-3文程度
- 番号付きリストで出力
- 解答のみで説明は不要

出力形式：
【模範解答】
1. （1つ目の質問への解答：読み物に書かれている基本概念や定義）
2. （2つ目の質問への解答：読み物に書かれている問題点や課題）
3. （3つ目の質問への解答：テーマについての意見や考察）`
            
            const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: '模範解答を生成してください。' }
                ],
                max_tokens: 800,
                temperature: 0.7
              })
            })
            
            console.log('📡 OpenAI API response status (pass answer):', response_api.status)
            
            if (!response_api.ok) {
              const errorText = await response_api.text()
              console.error('❌ OpenAI API error (pass answer):', errorText)
              throw new Error(`OpenAI API error: ${response_api.status}`)
            }
            
            const result = await response_api.json()
            const generatedAnswer = result.choices?.[0]?.message?.content || ''
            
            console.log('📝 Generated pass answer length:', generatedAnswer.length)
            
            if (generatedAnswer && generatedAnswer.length > 50) {
              passAnswer = generatedAnswer
              console.log('✅ Using AI-generated model answer')
            } else {
              console.warn('⚠️ AI answer too short, using fallback')
            }
            
          } catch (error) {
            console.error('❌ Pass answer generation error:', error)
            console.log('🔄 Using fallback pass answer')
          }
        }
        
        response = `わかりました。解説しますね。\n\n${passAnswer}\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
        stepCompleted = true
      }
      // 長い回答（100文字以上、かつ「ok」を含まない）→ AI添削
      else if (message.length > 100 && !message.toLowerCase().includes('ok') && !message.includes('はい')) {
        console.log('✅ Matched: Long answer - generating feedback')
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ OPENAI_API_KEY not configured for Step 1 text feedback')
            throw new Error('OpenAI API key not configured')
          }
          
          const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'テーマ'
          
          const systemPrompt = `あなたは小論文の先生です。生徒がStep 1の質問に対してテキストで回答した内容を添削してください。

テーマ: ${themeTitle}

【評価基準】
- 質問への適切な回答
- 文章の明確さと論理性
- 小論文らしい丁寧な文体
- 具体性と説得力

【重要】以下のJSON形式で必ず返してください：
{
  "goodPoints": ["良い点1", "良い点2"],
  "improvements": ["改善点1", "改善点2"],
  "overallScore": 80,
  "nextSteps": ["次のアクション1", "次のアクション2"]
}

生徒を励ましつつ、実践的なアドバイスを心がけてください。`
          
          console.log('🤖 Calling OpenAI API for Step 1 text feedback...')
          
          const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `以下の回答を添削してください。\n\n【生徒の回答】\n${message}` }
              ],
              max_tokens: 1000,
              temperature: 0.7,
              response_format: { type: "json_object" }
            })
          })
          
          if (!response_api.ok) {
            const errorText = await response_api.text()
            console.error('❌ OpenAI API error (Step 1 text feedback):', errorText)
            throw new Error(`OpenAI API error: ${response_api.status}`)
          }
          
          const data = await response_api.json()
          const feedback = JSON.parse(data.choices[0].message.content)
          
          console.log('✅ Step 1 text feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${feedback.goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${feedback.improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${feedback.overallScore}点\n\n🎯 次のステップ：\n${feedback.nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
          stepCompleted = true
          
        } catch (error) {
          console.error('❌ Step 1 text feedback error:', error)
          response = '素晴らしい回答ですね！よく理解されています。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
          stepCompleted = true
        }
      }
      // 「読んだ」
      else if (message.includes('読んだ') || message.includes('読みました')) {
        console.log('✅ Matched: 読んだ')
        
        // デバッグ情報をログ出力
        const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'テーマ'
        const themeContent = session?.essaySession?.lastThemeContent || ''
        
        console.log('🔍 Step 1 Questions Generation - Conditions:', {
          problemMode,
          customInput,
          themeTitle,
          hasThemeTitle: !!themeTitle,
          hasThemeContent: !!themeContent,
          condition_theme_ai: (problemMode === 'theme' || problemMode === 'ai') && (!!customInput || !!themeTitle),
          condition_problem: problemMode === 'problem' && !!customInput
        })
        
        // カスタムテーマに基づいた質問を生成
        let questions = '1. 地球温暖化の主な原因は何ですか？\n2. 温暖化によってどのような問題が起きていますか？\n3. あなた自身ができる環境保護の取り組みを1つ挙げてください。'
        
        if ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle)) {
          console.log('✅ Generating questions for theme:', themeTitle)
          
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for questions!')
              throw new Error('OpenAI API key not configured')
            }
            
            console.log('🔑 OpenAI API Key status (questions):', openaiApiKey ? 'Present' : 'Missing')
            
            // 学習スタイルに応じた質問形式の調整
            let questionStyleInstruction = ''
            if (learningStyle === 'example') {
              questionStyleInstruction = '\n- 質問1と2では具体例を挙げて答えやすい形式にする\n- 「〜の例を挙げて説明してください」のような形式を含める'
            } else if (learningStyle === 'explanation') {
              questionStyleInstruction = '\n- 理論的な理解を問う質問を重視\n- 「なぜ〜なのか説明してください」「〜の背景について論じてください」のような形式を含める'
            } else {
              questionStyleInstruction = '\n- 理解度確認と意見表明のバランスを取る'
            }
            
            const systemPrompt = `あなたは小論文の先生です。生徒に以下の読み物を読んでもらいました。その理解度を確認するための質問を3つ作成してください。

テーマ: ${themeTitle}

読み物の内容:
${themeContent}

対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
学習スタイル: ${learningStyle === 'example' ? '例文・事例重視' : learningStyle === 'explanation' ? '解説重視' : 'バランス型'}

要求:
- 読み物の内容に直接関連した質問を3つ作成
- 質問1: 読み物で説明されている基本的な概念や定義を問う（読み物に書かれている内容から答えられる）
- 質問2: 読み物で述べられている問題点や影響、背景を問う（読み物に書かれている内容から答えられる）
- 質問3: テーマについての自分自身の考えや意見を問う（読み物を踏まえた上での自分の意見）${questionStyleInstruction}
- 番号付きリスト形式で出力（1. 2. 3.）
- 質問のみで説明は不要
- 読み物を読めば答えられる質問にすること（質問1と2は特に重要）`
            
            console.log('🤖 Calling OpenAI API for questions generation...')
            console.log('📋 System prompt length (questions):', systemPrompt.length)
            console.log('📄 Theme content length:', themeContent?.length || 0)
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: '質問を3つ生成してください。' }
                ],
                max_tokens: 500,
                temperature: 0.7
              })
            })
            
            console.log('📡 OpenAI API response status (questions):', response.status)
            
            if (!response.ok) {
              const errorText = await response.text()
              console.error('❌ OpenAI API error response (questions):', errorText)
              throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
            }
            
            const result = await response.json()
            console.log('✅ OpenAI API call successful for questions')
            console.log('📊 API result structure (questions):', Object.keys(result))
            
            const generatedQuestions = result.choices?.[0]?.message?.content || ''
            console.log('📊 AI Generated questions length:', generatedQuestions?.length || 0)
            console.log('📚 Learning style applied to questions:', learningStyle)
            console.log('📝 Generated questions preview:', generatedQuestions?.substring(0, 200) || 'EMPTY')
            
            if (generatedQuestions && generatedQuestions.length > 20) {
              questions = generatedQuestions
              console.log('✅ Using AI-generated questions with learning style')
            } else {
              // AI応答が短すぎる場合もカスタムテーマを使ったフォールバック
              questions = `1. ${themeTitle}の基本的な概念や定義について説明してください。\n2. ${themeTitle}に関する現代社会における問題点や課題は何ですか？\n3. ${themeTitle}について、あなた自身の考えや意見を述べてください。`
              console.warn('⚠️ AI questions too short (length: ' + (generatedQuestions?.length || 0) + '), using custom fallback')
            }
          } catch (error) {
            console.error('❌ Questions generation error:', error)
            console.error('❌ Error details:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            })
            // エラー時もカスタムテーマを使ったフォールバック
            questions = `1. ${themeTitle}の基本的な概念や定義について説明してください。\n2. ${themeTitle}に関する現代社会における問題点や課題は何ですか？\n3. ${themeTitle}について、あなた自身の考えや意見を述べてください。`
            console.log('🔄 Using error fallback with custom theme')
          }
        } else if (problemMode === 'problem' && customInput) {
          // 問題文が与えられている場合は、その問題について確認
          questions = `問題文を確認しました。\n\n問題: ${customInput.substring(0, 200)}${customInput.length > 200 ? '...' : ''}\n\nこの問題について考えを整理してから書き始めましょう。`
        }
        
        response = `理解度を確認します。以下の質問に、小論文で書くような丁寧な文体で答えてください：\n\n${questions}\n\n【回答方法】\n・3つの質問すべてに答えてください\n・「です・ます」調または「である」調で記述\n・箇条書きではなく、文章として答えてください\n・すべて答え終えたら、送信ボタンを押してください\n\n（わからない場合は「パス」と入力すると解説します）`
      }
      // 「OK」のみ
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        console.log('✅ Matched: OK/はい')
        
        // カスタムテーマに基づいた問題を生成
        let themeTitle = '環境問題'
        let themeContent = '地球温暖化は現代社会が直面する最も深刻な問題の一つです。産業革命以降、人類は化石燃料を大量に消費し、大気中の二酸化炭素濃度を急激に増加させてきました。その結果、平均気温が上昇し、異常気象や海面上昇などの問題が顕在化しています。'
        
        // デバッグ情報をログ出力
        console.log('🔍 Step 1 Theme Generation - Conditions:', {
          problemMode,
          customInput,
          hasCustomInput: !!customInput,
          condition_theme: problemMode === 'theme' && !!customInput,
          condition_problem: problemMode === 'problem' && !!customInput
        })
        
        // セッションデータが不正な場合の警告
        if ((problemMode === 'theme' || problemMode === 'problem') && !customInput) {
          console.error('❌ CRITICAL: customInput is missing! Session may be from before fixes.')
          response = `⚠️ セッションデータに問題があります。\n\nこのセッションは古いデータの可能性があります。\n「新しいセッション」ボタンを押して、もう一度最初からやり直してください。\n\n（デバッグ情報: problemMode=${problemMode}, customInput=${customInput ? 'exists' : 'missing'}）`
          return c.json({ ok: true, response, stepCompleted: false })
        }
        
        if (problemMode === 'ai') {
          // AIにお任せモード：レベルに応じた最適なテーマを自動選択
          console.log('✅ AI auto-generation mode activated')
          
          // セッションに既にテーマがある場合はそれを使用（再生成しない）
          if (session?.essaySession?.lastThemeTitle && session?.essaySession?.lastThemeContent) {
            themeTitle = session.essaySession.lastThemeTitle
            themeContent = session.essaySession.lastThemeContent
            console.log('♻️ Reusing existing theme from session:', themeTitle)
            console.log('📚 Theme content length:', themeContent.length)
          } else {
            // 新規生成
            console.log('🆕 Generating new theme for AI mode')
            
            try {
              const openaiApiKey = c.env?.OPENAI_API_KEY
              
              if (!openaiApiKey) {
                console.error('❌ CRITICAL: OPENAI_API_KEY is not configured!')
                throw new Error('OpenAI API key not configured')
              }
              
              console.log('🔑 OpenAI API Key status:', openaiApiKey ? 'Present' : 'Missing')
              
              // タイムスタンプ + ランダム値でランダム性を強化
              const timestamp = Date.now()
              const randomSeed = Math.random().toString(36).substring(2, 15)
              console.log('🎲 Timestamp for randomization:', timestamp)
              console.log('🎲 Random seed:', randomSeed)
            
            // 学習スタイルに応じた指示を追加
            let styleInstruction = ''
            if (learningStyle === 'example') {
              styleInstruction = '\n- 具体的な事例を多く含める（歴史的事例、現代の事例など）\n- 解説は簡潔に、事例を中心に構成'
            } else if (learningStyle === 'explanation') {
              styleInstruction = '\n- 理論的な説明を詳しく含める\n- 概念の定義や背景を丁寧に説明\n- 因果関係や論理展開を明確に'
            } else {
              styleInstruction = '\n- 事例と解説をバランスよく含める\n- 理解しやすさを重視'
            }
            
              const systemPrompt = `あなたは小論文の先生です。対象レベルに応じた最適なテーマを選択し、そのテーマについての読み物を作成してください。

対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
学習スタイル: ${learningStyle === 'example' ? '例文・事例重視' : learningStyle === 'explanation' ? '解説重視' : 'バランス型'}
タイムスタンプ: ${timestamp}
ランダムシード: ${randomSeed}

【テーマ選択の基準】
- ${targetLevel === 'high_school' ? '高校生が理解しやすい身近な社会問題' : targetLevel === 'vocational' ? '専門学校生の興味関心に合った実践的テーマ' : '大学受験で頻出する本格的なテーマ'}
- 小論文の題材として適切で、議論の余地があるテーマ
- **重要**: 毎回異なるテーマを選ぶこと（タイムスタンプとランダムシードを参考に、推奨テーマ例からランダムに1つ選ぶ）
- 推奨テーマ例はあくまで参考であり、それ以外のテーマも選択可能

【推奨テーマ例】
${targetLevel === 'high_school' ? `
社会・テクノロジー:
- SNSと人間関係
- AI技術の発展と社会
- 情報化社会とプライバシー
- スマートフォン依存
- ゲームと教育
- ネットいじめと対策
- デジタルデバイド

環境・エネルギー:
- 環境問題と私たちの生活
- 地球温暖化と気候変動
- プラスチック問題
- 再生可能エネルギー
- 食品ロスと持続可能性
- 生物多様性の保護

社会問題:
- 少子高齢化と地域社会
- ジェンダー平等
- 働き方改革
- 外国人労働者の受け入れ
- 格差社会
- いじめ問題
- 若者の政治参加

文化・教育:
- グローバル化と文化
- 読書の意義
- 部活動の在り方
- 英語教育の必要性
- オンライン教育
- 伝統文化の継承

健康・ライフスタイル:
- 健康寿命と医療
- ストレス社会
- 食の安全
- スポーツと社会` 
: targetLevel === 'vocational' ? `
医療・福祉:
- 医療技術の進歩と倫理
- 高齢者介護の課題
- 福祉社会の実現
- メンタルヘルスケア
- 地域医療の充実

ビジネス・産業:
- デジタル化と働き方改革
- 観光業の発展と地域活性化
- 中小企業の経営課題
- キャッシュレス決済
- リモートワークの普及

食・サービス:
- 食の安全と持続可能性
- 地産地消の推進
- フードテック
- 外食産業の変化
- 食文化のグローバル化

技術・デザイン:
- IoTと生活の変化
- VR/AR技術の応用
- ユニバーサルデザイン
- 3Dプリンティング
- eスポーツの発展

社会・環境:
- SDGsと企業責任
- 循環型社会
- ダイバーシティ推進
- ワークライフバランス
- 地方創生` 
: `
科学技術・倫理:
- 科学技術と倫理の問題
- 遺伝子工学と生命倫理
- AI倫理と責任
- 宇宙開発の意義
- 原子力エネルギー

社会・経済:
- グローバリゼーションと格差
- 経済成長と環境保護
- 資本主義の未来
- ベーシックインカム
- 金融システムと格差

政治・民主主義:
- 民主主義と市民参加
- 投票率の低下
- 政治とメディア
- 憲法改正論議
- 地方自治の在り方

国際問題:
- 難民問題
- 核兵器廃絶
- 国際協力と援助
- 領土問題
- 多文化共生社会

環境・持続可能性:
- 持続可能な開発目標（SDGs）
- エネルギー政策
- 都市化と環境
- 水資源の管理
- 海洋プラスチック汚染

情報・メディア:
- 情報社会とプライバシー
- フェイクニュース対策
- メディアリテラシー
- 表現の自由と規制
- デジタル監視社会

教育・文化:
- 大学教育の在り方
- 芸術と社会
- 言語の多様性
- 歴史認識問題
- 知的財産権`}

要求:
- まず1つのテーマを選択（テーマ名は10文字以内で簡潔に）
- そのテーマについて500〜800文字程度の読み物を作成
- テーマの基本的な概念・定義を含める
- 歴史的背景や現状を説明
- 関連する問題点や課題を提示
- 社会的な意義や影響を説明${styleInstruction}
- 専門用語は必要に応じて使用し、わかりやすく説明
- 問いかけは含めず、情報提供に徹する
- この読み物を読めば、後の質問に答えられる知識が得られる内容にする

出力形式（この形式を厳守）：
【テーマ】テーマ名

【読み物】
（500〜800文字の読み物本文）`
            
            console.log('🤖 Calling OpenAI API for AI auto-generation...')
            console.log('📋 System prompt length:', systemPrompt.length)
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: 'レベルに応じた最適なテーマを選択し、読み物を作成してください。' }
                ],
                max_tokens: 1500,
                temperature: 0.9 // 高めの温度でランダム性を確保
              })
            })
            
            console.log('📡 OpenAI API response status:', response.status)
            
            if (!response.ok) {
              const errorText = await response.text()
              console.error('❌ OpenAI API error response:', errorText)
              throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
            }
            
            const result = await response.json()
            console.log('✅ OpenAI API call successful for AI mode')
            console.log('📊 API result structure:', Object.keys(result))
            
            const generatedText = result.choices?.[0]?.message?.content || ''
            console.log('📊 AI Generated text length:', generatedText?.length || 0)
            console.log('📝 Generated text preview:', generatedText?.substring(0, 200) || 'EMPTY')
            
              // テーマと読み物を抽出（複数パターンに対応）
              // パターン1: 【テーマ】テーマ名 【読み物】本文
              let themeMatch = generatedText.match(/【テーマ】\s*(.+?)(?=\n|【)/)
              let contentMatch = generatedText.match(/【読み物】\s*([\s\S]+)/)
              
              // パターン2: テーマ: テーマ名
              if (!themeMatch) {
                themeMatch = generatedText.match(/テーマ[：:]\s*(.+?)(?=\n|$)/)
              }
              
              // パターン3: 最初の行がテーマの可能性
              if (!themeMatch && generatedText.trim()) {
                const firstLine = generatedText.trim().split('\n')[0]
                if (firstLine.length < 30 && firstLine.length > 3) {
                  themeMatch = [null, firstLine]
                  console.log('🔍 Using first line as theme:', firstLine)
                }
              }
              
              // 読み物がマッチしない場合、全文を読み物として使用
              if (!contentMatch && generatedText.length > 200) {
                // テーマ行を除いた残りを読み物とする
                const lines = generatedText.split('\n')
                const contentText = lines.slice(themeMatch ? 1 : 0).join('\n').trim()
                if (contentText.length > 200) {
                  contentMatch = [null, contentText]
                  console.log('🔍 Using remaining text as content')
                }
              }
              
              console.log('🔍 Parsing AI response:', {
                hasThemeMatch: !!themeMatch,
                hasContentMatch: !!contentMatch,
                themeMatchValue: themeMatch ? themeMatch[1] : 'N/A',
                contentLength: contentMatch ? contentMatch[1]?.length : 0,
                fullTextLength: generatedText.length,
                firstLine: generatedText.split('\n')[0]
              })
              
              if (themeMatch && contentMatch && contentMatch[1].length > 50) {
                themeTitle = themeMatch[1].trim()
                themeContent = contentMatch[1].trim()
                console.log('✅ ✨ AI-generated NEW theme:', themeTitle)
                console.log('✅ AI-generated content length:', themeContent.length)
                console.log('🎯 This is a UNIQUE theme for this session')
              } else {
                // AI生成失敗 - エラーメッセージを表示
                console.error('❌ Failed to parse AI response for theme generation')
                console.error('❌ Parse results:', {
                  themeMatch: !!themeMatch,
                  contentMatch: !!contentMatch,
                  themeValue: themeMatch ? themeMatch[1] : null,
                  contentLength: contentMatch ? contentMatch[1]?.length : 0
                })
                console.error('❌ Full AI response:', generatedText)
                throw new Error('AI theme generation failed - could not parse response')
              }
            } catch (error) {
              console.error('❌ AI auto-generation error:', error)
              console.error('❌ Error details:', {
                message: error.message,
                stack: error.stack,
                name: error.name
              })
              
              // エラーメッセージを返す
              return c.json({
                ok: false,
                error: 'ai_generation_failed',
                message: '❌ AIによるテーマ生成に失敗しました。\n\nお手数ですが、以下のいずれかをお試しください：\n\n1. 「💡 テーマを入力」を選択して、ご自身でテーマを入力する\n2. もう一度「🤖 AIにお任せ」を試す\n3. 「📝 問題文を入力」を選択して、具体的な問題文を入力する\n\nご不便をおかけして申し訳ございません。',
                timestamp: new Date().toISOString()
              }, 500)
            }
          }
        } else if (problemMode === 'theme' && customInput) {
          // ユーザーが入力したテーマを使用
          themeTitle = customInput
          console.log('✅ Generating theme content for:', customInput)
          
          // AIでテーマに関する読み物を生成
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured!')
              throw new Error('OpenAI API key not configured')
            }
            
            console.log('🔑 OpenAI API Key status:', openaiApiKey ? 'Present' : 'Missing')
            
            // 学習スタイルに応じた指示を追加
            let styleInstruction = ''
            if (learningStyle === 'example') {
              styleInstruction = '\n- 具体的な事例を多く含める（歴史的事例、現代の事例など）\n- 解説は簡潔に、事例を中心に構成'
            } else if (learningStyle === 'explanation') {
              styleInstruction = '\n- 理論的な説明を詳しく含める\n- 概念の定義や背景を丁寧に説明\n- 因果関係や論理展開を明確に'
            } else {
              styleInstruction = '\n- 事例と解説をバランスよく含める\n- 理解しやすさを重視'
            }
            
            const systemPrompt = `あなたは小論文の先生です。以下のテーマについて、生徒が小論文を書くための基礎知識となる読み物を作成してください。

テーマ: ${customInput}
対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
学習スタイル: ${learningStyle === 'example' ? '例文・事例重視' : learningStyle === 'explanation' ? '解説重視' : 'バランス型'}

要求:
- 500〜800文字程度の読み物
- テーマの基本的な概念・定義を含める
- 歴史的背景や現状を説明
- 関連する問題点や課題を提示
- 社会的な意義や影響を説明${styleInstruction}
- 専門用語は必要に応じて使用し、わかりやすく説明
- 問いかけは含めず、情報提供に徹する
- この読み物を読めば、後の質問に答えられる知識が得られる内容にする

生徒はこの読み物を読んだ後、以下のような質問に答えることになります：
1. ${customInput}の基本的な概念や定義について
2. ${customInput}に関する現代社会における問題点や課題
3. ${customInput}について、自分自身の考えや意見

これらの質問に答えるための十分な情報を含めてください。`
            
            console.log('🤖 Calling OpenAI API for theme content generation...')
            console.log('📋 System prompt length:', systemPrompt.length)
            
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: '読み物を作成してください。' }
                ],
                max_tokens: 1500,
                temperature: 0.7
              })
            })
            
            console.log('📡 OpenAI API response status:', response.status)
            
            if (!response.ok) {
              const errorText = await response.text()
              console.error('❌ OpenAI API error response:', errorText)
              throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
            }
            
            const result = await response.json()
            console.log('✅ OpenAI API call successful')
            console.log('📊 API result structure:', Object.keys(result))
            
            const generatedText = result.choices?.[0]?.message?.content || ''
            console.log('📊 AI Generated text length:', generatedText?.length || 0)
            console.log('📚 Learning style applied:', learningStyle)
            console.log('📝 Generated text preview:', generatedText?.substring(0, 200) || 'EMPTY')
            
            // 生成されたテキストが50文字以上あれば使用（200文字の条件を緩和）
            if (generatedText && generatedText.length > 50) {
              themeContent = generatedText
              console.log('✅ Using AI-generated theme content with learning style')
            } else {
              // AIが短すぎる場合でもカスタムテーマを使ったフォールバック
              themeContent = `${customInput}は、現代社会において重要なテーマの一つです。このテーマについて、様々な視点から考察し、自分の意見を論理的に述べることが求められています。まずは、${customInput}の背景や現状について理解を深めましょう。`
              console.warn('⚠️ AI text too short (length: ' + (generatedText?.length || 0) + '), using custom fallback')
            }
          } catch (error) {
            console.error('❌ Theme generation error:', error)
            console.error('❌ Error details:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            })
            // エラー時もカスタムテーマを使ったフォールバック
            themeContent = `${customInput}は、現代社会において重要なテーマの一つです。このテーマについて、様々な視点から考察し、自分の意見を論理的に述べることが求められています。まずは、${customInput}の背景や現状について理解を深めましょう。`
            console.log('🔄 Using error fallback with custom theme')
          }
        } else if (problemMode === 'problem' && customInput) {
          // ユーザーが問題文を入力した場合、その問題からテーマを抽出
          const match = customInput.match(/(.{1,20}?)について/)
          if (match) {
            themeTitle = match[1]
          }
          themeContent = `今回取り組む問題:\n${customInput.substring(0, 150)}${customInput.length > 150 ? '...' : ''}`
        }
        
        // 読み物をセッションに保存
        if (session && session.essaySession) {
          session.essaySession.lastThemeContent = themeContent
          session.essaySession.lastThemeTitle = themeTitle
          learningSessions.set(sessionId, session)
          await saveSessionToDB(db, sessionId, session)
          console.log('✅ Theme content saved to session')
        }
        
        response = `素晴らしいですね！それでは今日のテーマは「${themeTitle}」です。\n\n【読み物】\n${themeContent}\n\n読み終えたら「読んだ」と入力して送信してください。`
      }
      // 回答が短すぎる
      else {
        console.log('⚠️ Answer too short')
        response = '回答が短すぎるようです。もう少し詳しく答えてください。\n\n各質問について、15文字以上で答えてみましょう。\n（わからない場合は「パス」と入力すると解説します）'
      }
    } else if (currentStep === 2) {
      // ステップ2: 語彙力強化
      // 保存された模範解答を取得（デフォルト値を設定）
      const savedAnswers = session?.essaySession?.vocabAnswers || '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱり」→「やはり」または「結局」\n3. 「だから」→「したがって」または「それゆえ」\n4. 「ちゃんと」→「適切に」または「正確に」\n5. 「いっぱい」→「多数」または「数多く」'
      
      // パス機能
      if (message.toLowerCase().includes('パス') || message.toLowerCase().includes('pass')) {
        response = `わかりました。解答例をお見せしますね。\n\n${savedAnswers}\n\n小論文では、話し言葉ではなく書き言葉を使うことが大切です。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
        stepCompleted = true
      }
      // 答えを入力した場合（10文字以上、かつ「ok」「はい」を含まない）
      else if (message.length > 10 && !message.toLowerCase().includes('ok') && !message.includes('はい')) {
        response = `素晴らしい言い換えですね！\n\n${savedAnswers}\n\n小論文では、話し言葉ではなく書き言葉を使うことが大切です。\n\n語彙力が向上しています。このステップは完了です。「次のステップへ」ボタンを押してください。`
        stepCompleted = true
      }
      // 「OK」または「はい」で演習開始
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        console.log('🔍 Step 2 Vocab Generation - Starting')
        
        // 毎回違う語彙力強化問題を生成
        let vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱり」→ ?\n3. 「だから」→ ?\n4. 「ちゃんと」→ ?\n5. 「いっぱい」→ ?'
        let vocabExample = '「すごく大事」→「極めて重要」'
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for vocab!')
            throw new Error('OpenAI API key not configured')
          }
          
          const timestamp = Date.now() // 毎回違う問題を生成
          console.log('✅ Generating vocab problems with timestamp:', timestamp)
          console.log('🔑 OpenAI API Key status (vocab):', openaiApiKey ? 'Present' : 'Missing')
          
          const systemPrompt = `あなたは小論文の先生です。口語表現を小論文風の表現に言い換える練習問題を5つ作成してください。

対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
タイムスタンプ: ${timestamp}

重要：まず完全な解答ペアを作成し、そこから問題を抽出してください。

要求:
- よく使う口語表現を含むフレーズを5つ選ぶ（例：「すごく大事」「やっぱりそう」「だから必要」など）
- 毎回異なる表現を出題すること
- 口語表現は単独ではなく、フレーズとして出題すること

出力形式（この形式を厳守）：
【模範解答】
1. 「口語表現を含むフレーズ1」→「小論文風の表現1」または「別の表現1」
2. 「口語表現を含むフレーズ2」→「小論文風の表現2」または「別の表現2」
3. 「口語表現を含むフレーズ3」→「小論文風の表現3」または「別の表現3」
4. 「口語表現を含むフレーズ4」→「小論文風の表現4」または「別の表現4」
5. 「口語表現を含むフレーズ5」→「小論文風の表現5」または「別の表現5」

例：「すごく大事なこと」→「極めて重要な事柄」または「非常に大切なこと」`
          
          console.log('🤖 Calling OpenAI API for vocab problems...')
          
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: '語彙力強化の問題を5つ生成してください。' }
              ],
              max_tokens: 500,
              temperature: 0.8
            })
          })
          
          console.log('📡 OpenAI API response status (vocab):', response.status)
          
          if (!response.ok) {
            const errorText = await response.text()
            console.error('❌ OpenAI API error response (vocab):', errorText)
            throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
          }
          
          const result = await response.json()
          console.log('✅ OpenAI API call successful for vocab problems')
          
          const generated = result.choices?.[0]?.message?.content || ''
          console.log('📊 AI Generated vocab length:', generated?.length || 0)
          console.log('📝 Generated vocab preview:', generated?.substring(0, 200) || 'EMPTY')
          
          let vocabAnswers = '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱりそう」→「やはりそのとおり」または「確かにそうだ」\n3. 「だから必要」→「したがって必要」または「それゆえ必要」\n4. 「ちゃんと確認」→「適切に確認」または「正確に確認」\n5. 「いっぱいある」→「多数存在する」または「数多く存在する」'
          
          if (generated && generated.length > 20) {
            // 模範解答を抽出
            const answerMatch = generated.match(/【模範解答】([\s\S]*)/)
            
            if (answerMatch) {
              const answerText = answerMatch[1].trim()
              vocabAnswers = '【模範解答】\n' + answerText
              
              // 例を抽出
              const exampleMatch = answerText.match(/例[：:]\s*(.+)/)
              if (exampleMatch) {
                vocabExample = exampleMatch[1].trim()
              }
              
              // 解答から問題を生成（左側のフレーズを抽出して「→ ?」に置き換え）
              const answerLines = answerText.split('\n').filter(line => line.trim())
              const problemLines = answerLines
                .filter(line => /^\d+\./.test(line.trim()) && line.includes('→'))
                .map(line => {
                  // 「フレーズ」→「解答」の形式から「フレーズ」→ ? を生成
                  const match = line.match(/^(\d+\.\s*「[^」]+」)\s*→/)
                  return match ? `${match[1]} → ?` : null
                })
                .filter(Boolean)
              
              if (problemLines.length >= 3) {
                vocabProblems = problemLines.join('\n')
                console.log('✅ Generated problems from answers:', vocabProblems)
              }
            }
            
            // セッションに解答を保存
            if (!session.essaySession) {
              session.essaySession = {}
            }
            session.essaySession.vocabAnswers = vocabAnswers
            
            console.log('✅ Using AI-generated vocab problems and answers')
            console.log('📝 Vocab answers saved:', vocabAnswers.substring(0, 100))
          } else {
            console.warn('⚠️ AI vocab too short, using fallback')
            // フォールバックの問題を生成
            vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱりそう」→ ?\n3. 「だから必要」→ ?\n4. 「ちゃんと確認」→ ?\n5. 「いっぱいある」→ ?'
            // フォールバックの解答も保存
            if (!session.essaySession) {
              session.essaySession = {}
            }
            session.essaySession.vocabAnswers = vocabAnswers
          }
        } catch (error) {
          console.error('❌ Vocab problems generation error:', error)
          console.log('🔄 Using fallback vocab problems')
        }
        
        // すぐに語彙問題を表示
        response = `【語彙力強化】\n口語表現を小論文風に言い換える練習をしましょう。\n\n以下の口語表現を小論文風の表現に言い換えてください：\n\n${vocabProblems}\n\n（例：${vocabExample}）\n\n━━━━━━━━━━━━━━━━━━\n📝 回答方法\n━━━━━━━━━━━━━━━━━━\n\n＜方法1：直接入力＞\n5つの言い換えをチャットで答えて、送信ボタンを押してください。\n\n＜方法2：手書き提出＞\n1️⃣ ノートに手書きで答える\n2️⃣ 📷カメラボタン または 📁ファイルボタンを押す\n3️⃣ 撮影またはファイル選択\n4️⃣ 画像を確認して送信\n\n※ わからない場合は「パス」と入力すると解答例を見られます`
      }
      // 回答が短すぎる
      else {
        response = '回答が短すぎるようです。\n\n5つの言い換えをすべて答えてください。各10文字以上で答えましょう。\n\n💡 手書きで答えた場合は、📷カメラボタン または 📁ファイルボタンから画像をアップロードしてください。\n\n（わからない場合は「パス」と入力すると解答例を見られます）'
      }
    } else if (currentStep === 3) {
      // ステップ3: 短文演習（AI添削付き）
      
      // 長い回答（200字以上）が送られてきた場合 → AI添削実行
      if (message.length >= 150 && !message.toLowerCase().includes('ok') && !message.includes('はい')) {
        console.log('📝 Step 3: Received short essay for feedback')
        console.log('📏 Essay length:', message.length, 'characters')
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for short essay!')
            throw new Error('OpenAI API key not configured')
          }
          
          console.log('🤖 Calling OpenAI API for short essay feedback...')
          
          const systemPrompt = `あなたは小論文の先生です。生徒が書いた200字程度の短文小論文を添削してください。

【評価基準】
- 論理構成（主張→理由→具体例→結論）
- 文章の明確さと説得力
- 語彙の適切さ
- 文字数（目標: 200字前後）

【重要】以下のJSON形式で必ず返してください：
{
  "goodPoints": ["良い点1", "良い点2"],
  "improvements": ["改善点1", "改善点2"],
  "overallScore": 75,
  "nextSteps": ["次のアクション1", "次のアクション2"]
}

生徒を励ましつつ、実践的なアドバイスを心がけてください。`
          
          const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `以下の短文小論文を添削してください。\n\n【小論文】\n${message}\n\n【文字数】${message.length}字` }
              ],
              max_tokens: 1000,
              temperature: 0.7,
              response_format: { type: "json_object" }
            })
          })
          
          if (!response_api.ok) {
            const errorText = await response_api.text()
            console.error('❌ OpenAI API error (short essay):', errorText)
            throw new Error(`OpenAI API error: ${response_api.status}`)
          }
          
          const data = await response_api.json()
          const feedback = JSON.parse(data.choices[0].message.content)
          
          console.log('✅ Short essay feedback generated')
          
          // フィードバックを整形して表示
          response = `【短文添削結果】\n\n✨ 良かった点：\n${feedback.goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${feedback.improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${feedback.overallScore}点\n\n🎯 次のステップ：\n${feedback.nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！次のステップでは、より長い小論文に挑戦します。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
          stepCompleted = true
          
        } catch (error) {
          console.error('❌ Short essay feedback error:', error)
          response = '短文を受け付けました。\n\n素晴らしい努力です！次のステップでは、より長い小論文に取り組みます。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
          stepCompleted = true
        }
      }
      // OKまたは「はい」で課題提示
      else if (message.toLowerCase().trim() === 'ok' || message.toLowerCase().includes('オッケー') || message.includes('はい')) {
        const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'テーマ'
        
        console.log('🔍 Step 3 Short Essay - Conditions:', {
          problemMode,
          customInput,
          themeTitle,
          hasThemeTitle: !!themeTitle
        })
        
        // カスタムテーマに基づいた短文問題を生成
        let shortProblem = '環境問題について、200字程度で小論文を書いてください。'
        
        if ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle)) {
          shortProblem = `${themeTitle}について、200字程度で小論文を書いてください。`
          console.log('✅ Using theme for short essay:', themeTitle)
        } else if (problemMode === 'problem' && customInput) {
          // 問題文がある場合は、そのまま使用
          shortProblem = customInput
          console.log('✅ Using custom problem for short essay')
        } else {
          console.warn('⚠️ Using fallback short essay problem')
        }
        
        response = `【短文演習】\n指定字数で短い小論文を書いてみましょう。\n\n＜課題＞\n${shortProblem}\n\n＜構成＞\n主張→理由→具体例→結論（200字程度）\n\n＜書き方＞\n1. まず自分の主張を明確に述べる\n2. その理由を説明する\n3. 具体例を1つ挙げる\n4. 最後に結論でまとめる\n\n━━━━━━━━━━━━━━━━━━\n📝 提出方法\n━━━━━━━━━━━━━━━━━━\n\n＜方法1：直接入力＞\n書き終えたら、この入力エリアに入力して送信してください。\n\n＜方法2：手書き提出＞\n1️⃣ 原稿用紙またはノートに手書き\n2️⃣ 📷カメラボタン または 📁ファイルボタンを押す\n3️⃣ 撮影またはファイル選択\n4️⃣ 画像を確認して送信\n\nAIが添削します。`
      }
      // 短すぎる回答
      else {
        response = '短文小論文は150字以上で書いてください。\n\n主張→理由→具体例→結論の構成を意識しましょう。\n\n━━━━━━━━━━━━━━━━━━\n📝 提出方法\n━━━━━━━━━━━━━━━━━━\n\n＜直接入力＞\n書き終えたら、この入力エリアに入力して送信\n\n＜手書き提出＞\n📷カメラボタン または 📁ファイルボタンから画像をアップロード'
      }
    } else if (currentStep === 4) {
      // ステップ4: 本練習（手書き原稿アップロード + OCR + AI添削）
      // セッションを取得
      const session = learningSessions.get(sessionId)
      
      // 画像がアップロードされたかチェック
      const hasImage = session && session.essaySession && session.essaySession.uploadedImages && 
                       session.essaySession.uploadedImages.some(img => img.step === 4)
      
      // OCR結果があるかチェック
      const hasOCR = session && session.essaySession && session.essaySession.ocrResults && 
                     session.essaySession.ocrResults.length > 0
      
      // 添削完了フラグをチェック
      const hasFeedback = session && session.essaySession && session.essaySession.feedbacks && 
                          session.essaySession.feedbacks.length > 0
      
      if (message.includes('次へ') || message.includes('完了')) {
        // 添削完了後、次のステップへ
        response = '本練習のステップを完了しました！\n\nAI添削のフィードバックを確認していただきました。\n次のステップでは、さらに難しいテーマのチャレンジ問題に取り組みます。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
        stepCompleted = true
      }
      else if (message.includes('確認完了') || message.includes('これで完了')) {
        // OCR確認完了 → すぐにAI添削を実行
        if (!hasOCR) {
          response = 'OCR結果が見つかりません。先に原稿を撮影してください。'
        } else {
          response = 'OCR内容を確認しました。\n\nAI添削を実行中です。少々お待ちください...'
          // クライアント側でAI添削APIを呼び出すフラグを返す
        }
      }
      else if (message.includes('修正完了') || (!message.includes('確認完了') && !message.includes('OK') && !message.includes('ok') && !message.includes('はい') && hasOCR && message.length > 10)) {
        // ユーザーが修正したテキストを入力した場合
        // OCR結果を修正版で上書き
        if (session && session.essaySession && session.essaySession.ocrResults) {
          const latestOCR = session.essaySession.ocrResults[session.essaySession.ocrResults.length - 1]
          
          // 修正後のテキストを保存
          session.essaySession.ocrResults.push({
            ...latestOCR,
            text: message,
            charCount: message.length,
            processedAt: new Date().toISOString(),
            isCorrected: true
          })
          
          // インメモリとD1の両方を更新
          const db = c.env?.DB
          await updateSession(db, sessionId, { essaySession: session.essaySession })
          console.log('✏️ OCR text corrected by user and saved to D1:', message.substring(0, 50) + '...')
          
          response = '修正内容を保存しました。\n\nAI添削を実行中です。少々お待ちください...'
        } else {
          response = 'OCR結果が見つかりません。先に原稿を撮影してください。'
        }
      }
      else if (hasImage) {
        response = '画像を受け取りました！\n\nOCR処理を開始しています。読み取りが完了するまで少々お待ちください...\n\n（画像が表示され、読み取り結果が自動で表示されます）'
      }
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        console.log('🔍 Step 4 Main Practice - Conditions:', {
          problemMode,
          customInput,
          hasCustomInput: !!customInput
        })
        
        // カスタムテーマに基づいた本練習問題を生成
        let mainProblem = 'SNSが社会に与える影響について、あなたの考えを述べなさい'
        let charCount = '400〜600字'
        
        if (problemMode === 'problem' && customInput) {
          // ユーザーが問題文を入力した場合、そのまま使用
          mainProblem = customInput
          console.log('✅ Using custom problem text directly')
          // 文字数を抽出
          const charMatch = customInput.match(/(\d+).*?字/)
          if (charMatch) {
            charCount = charMatch[0]
          }
        } else if ((problemMode === 'theme' || problemMode === 'ai') && customInput) {
          console.log('✅ Generating detailed problem from theme:', customInput)
          // テーマから具体的な問題を生成
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for Step 4 problem!')
              throw new Error('OpenAI API key not configured')
            }
            
            const wordCount = targetLevel === 'high_school' ? '400字' : targetLevel === 'vocational' ? '500字' : '600字'
            
            console.log('🚀 Generating Step 4 main problem with OpenAI')
            console.log('🔑 OpenAI API Key status (Step 4):', openaiApiKey ? 'Present' : 'Missing')
            
            const systemPrompt = `あなたは小論文の先生です。以下のテーマについて、本格的で具体的な小論文問題を作成してください。

テーマ: ${customInput}
対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
文字数: ${wordCount}

要求:
- 問題文は具体的な状況や論点を含める
- 単に「〇〇について」ではなく、「〇〇において□□は△△だが、あなたは...」のような具体性
- 賛否が分かれるテーマ、または多面的な思考が必要な問題
- 「あなたの考えを述べなさい」で締める
- 問題文のみ（条件や説明は不要）
- 60文字以上150文字以内`
            
            console.log('🤖 Calling OpenAI API for Step 4 main problem...')
            
            const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: '本格的な小論文問題を1つ作成してください。' }
                ],
                max_tokens: 300,
                temperature: 0.8
              })
            })
            
            console.log('📡 OpenAI API response status (Step 4):', response_api.status)
            
            if (!response_api.ok) {
              const errorText = await response_api.text()
              console.error('❌ OpenAI API error response (Step 4):', errorText)
              throw new Error(`OpenAI API error: ${response_api.status} - ${errorText}`)
            }
            
            const result = await response_api.json()
            console.log('✅ OpenAI API call successful for Step 4 problem')
            
            const generatedProblem = result.choices?.[0]?.message?.content || ''
            console.log('📊 AI Generated problem length:', generatedProblem?.length || 0)
            console.log('📝 Generated problem preview:', generatedProblem?.substring(0, 100) || 'EMPTY')
            
            if (generatedProblem && generatedProblem.length > 10) {
              mainProblem = generatedProblem.replace(/^「|」$/g, '').trim()
              console.log('✅ Using OpenAI-generated problem for Step 4')
            } else {
              mainProblem = `${customInput}の発展により、社会に様々な影響が生じています。あなたはこの${customInput}について、どのような課題があり、どう対応すべきと考えますか。具体例を挙げながら、あなたの考えを述べなさい`
              console.warn('⚠️ AI problem too short, using custom fallback')
            }
            charCount = wordCount
          } catch (error) {
            console.error('❌ Step 4 problem generation error:', error)
            console.error('❌ Error details:', {
              message: error.message,
              stack: error.stack,
              name: error.name
            })
            mainProblem = `${customInput}の発展により、社会に様々な影響が生じています。あなたはこの${customInput}について、どのような課題があり、どう対応すべきと考えますか。具体例を挙げながら、あなたの考えを述べなさい`
            console.log('🔄 Using error fallback with custom theme')
          }
        } else {
          console.warn('⚠️ Using fallback main problem (no custom input)')
        }
        
        response = `【本練習】\nより長い小論文に挑戦しましょう。\n\n＜課題＞\n「${mainProblem}」\n\n＜条件＞\n- 文字数：${charCount}\n- 構成：序論（問題提起）→本論（賛成意見・反対意見）→結論（自分の意見）\n- 具体例を2つ以上含めること\n\n━━━━━━━━━━━━━━━━━━\n📝 手書き原稿の提出方法\n━━━━━━━━━━━━━━━━━━\n\n1️⃣ 原稿用紙に手書きで小論文を書く\n\n2️⃣ 書き終えたら、下の入力欄の横にある📷カメラボタンを押す\n\n3️⃣ 「撮影する」で原稿を撮影\n\n4️⃣ 必要に応じて「範囲を調整」で読み取り範囲を調整\n\n5️⃣ 「OCR処理を開始」ボタンを押す\n\n6️⃣ 読み取り結果を確認\n\n━━━━━━━━━━━━━━━━━━\n✅ OCR結果が正しい場合\n━━━━━━━━━━━━━━━━━━\n「確認完了」と入力して送信\n→ すぐにAI添削が開始されます\n\n✏️ OCR結果を修正したい場合\n━━━━━━━━━━━━━━━━━━\n正しいテキストを入力して送信\n→ 修正内容が保存され、AI添削が開始されます\n\n※ カメラボタンは入力欄の右側にあります\n※ OCR処理は自動的に文字を読み取ります`
      }
      else {
        response = '原稿用紙に小論文を書き終えたら、下の入力欄の横にある📷カメラボタンを押して撮影してください。\n\n📷カメラボタン → 撮影 → 範囲調整（任意） → OCR処理を開始 → 結果確認\n\n✅ 結果が正しい → 「確認完了」と送信\n✏️ 修正が必要 → 正しいテキストを入力して送信\n\nまだ準備中の場合は、書き終えてからアップロードしてください。'
      }
    } else if (currentStep === 5) {
      // ステップ5: チャレンジ問題（新しいテーマの小論文）
      const session = learningSessions.get(sessionId)
      
      // 画像がアップロードされたかチェック
      const hasImage = session && session.essaySession && session.essaySession.uploadedImages && 
                       session.essaySession.uploadedImages.some(img => img.step === 5)
      
      // このステップのOCR結果があるかチェック（Step 5用の新しい原稿）
      const hasOCR = session && session.essaySession && session.essaySession.ocrResults && 
                     session.essaySession.ocrResults.some(ocr => ocr.step === 5)
      
      if (message.includes('次へ') || message.includes('完了')) {
        response = 'チャレンジ問題を完了しました！\n\nより難しいテーマの小論文に挑戦し、AI添削を受けることができました。\n次のステップでは、今日の学習をまとめます。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
        stepCompleted = true
      }
      else if (message.includes('確認完了') || message.includes('これで完了')) {
        // OCR確認完了 → AI添削を実行
        if (!hasOCR) {
          response = 'OCR結果が見つかりません。先に原稿を撮影してください。'
        } else {
          response = 'OCR内容を確認しました。\n\nAI添削を実行中です。少々お待ちください...'
        }
      }
      else if (message.includes('修正完了') || (!message.includes('確認完了') && !message.includes('OK') && !message.includes('ok') && !message.includes('はい') && hasOCR && message.length > 10)) {
        // ユーザーが修正したテキストを入力した場合
        if (session && session.essaySession && session.essaySession.ocrResults) {
          const step5OCRs = session.essaySession.ocrResults.filter(ocr => ocr.step === 5)
          if (step5OCRs.length > 0) {
            const latestOCR = step5OCRs[step5OCRs.length - 1]
            
            // 修正後のテキストを保存
            session.essaySession.ocrResults.push({
              ...latestOCR,
              text: message,
              charCount: message.length,
              processedAt: new Date().toISOString(),
              isCorrected: true,
              step: 5
            })
            
            // インメモリとD1の両方を更新
            const db = c.env?.DB
            await updateSession(db, sessionId, { essaySession: session.essaySession })
            console.log('✏️ Step 5 OCR text corrected by user and saved to D1:', message.substring(0, 50) + '...')
            
            response = '修正内容を保存しました。\n\nAI添削を実行中です。少々お待ちください...'
          } else {
            response = 'OCR結果が見つかりません。先に原稿を撮影してください。'
          }
        } else {
          response = 'OCR結果が見つかりません。先に原稿を撮影してください。'
        }
      }
      else if (hasImage) {
        response = '画像を受け取りました！\n\nOCR処理を開始しています。読み取りが完了するまで少々お待ちください...\n\n（画像が表示され、読み取り結果が自動で表示されます）'
      }
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        // チャレンジ問題は毎回違う問題を生成（customInputに関連するが、より難易度の高い問題）
        let challengeProblem = '人工知能（AI）の発展が、将来の雇用に与える影響について、あなたの考えを述べなさい'
        let charCount = '500〜800字'
        
        if (problemMode === 'problem' && customInput) {
          // ユーザーが問題文を入力した場合、そのまま使用
          challengeProblem = customInput
          const charMatch = customInput.match(/(\d+).*?字/)
          if (charMatch) {
            charCount = charMatch[0]
          }
        } else {
          // カスタムテーマまたはAIモードの場合、毎回違う高難度問題を生成
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for challenge problem!')
              throw new Error('OpenAI API key not configured')
            }
            
            const themeTitle = session?.essaySession?.lastThemeTitle || customInput || '社会問題'
            const baseTheme = ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle)) ? themeTitle : '社会問題'
            const wordCount = targetLevel === 'high_school' ? '500字' : targetLevel === 'vocational' ? '600字' : '800字'
            const timestamp = Date.now() // 毎回違う問題を生成するため
            
            console.log('🚀 Generating challenge problem for:', baseTheme)
            console.log('🔑 OpenAI API Key status (challenge):', openaiApiKey ? 'Present' : 'Missing')
            
            const systemPrompt = `あなたは小論文の先生です。以下のテーマに関連した、より難易度の高いチャレンジ問題を作成してください。

ベーステーマ: ${baseTheme}
対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
文字数: ${wordCount}
タイムスタンプ: ${timestamp}

要求:
- ベーステーマに関連するが、より深い思考を要する問題
- 多角的な視点が必要な問題（メリット・デメリット、賛成・反対など）
- 現代社会の課題に関連する問題
- 問題文は1〜2文で簡潔に
- 「〜について、あなたの考えを述べなさい」という形式で終わる
- 賛否両論があるテーマを選ぶ
- 毎回異なる問題になるよう、具体的な論点を変える
- 問題文のみを出力（説明や条件は含めない）

出力例：
「人工知能（AI）の発展が、将来の雇用に与える影響について、あなたの考えを述べなさい」`
            
            console.log('🤖 Calling OpenAI API for challenge problem...')
            
            const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: 'チャレンジ問題を1つ生成してください。' }
                ],
                max_tokens: 200,
                temperature: 0.9
              })
            })
            
            console.log('📡 OpenAI API response status (challenge):', response_api.status)
            
            if (!response_api.ok) {
              const errorText = await response_api.text()
              console.error('❌ OpenAI API error (challenge):', errorText)
              throw new Error(`OpenAI API error: ${response_api.status}`)
            }
            
            const result = await response_api.json()
            const generatedProblem = result.choices?.[0]?.message?.content || ''
            
            console.log('📝 Generated challenge problem:', generatedProblem)
            
            if (generatedProblem && generatedProblem.length > 10) {
              challengeProblem = generatedProblem.replace(/^「|」$/g, '').trim()
              console.log('✅ Using AI-generated challenge problem')
            } else {
              console.warn('⚠️ AI challenge problem too short, using fallback')
            }
            charCount = wordCount
          } catch (error) {
            console.error('❌ Challenge problem generation error:', error)
            if (problemMode === 'theme' && customInput) {
              challengeProblem = `${customInput}の将来的な課題と解決策について、あなたの考えを述べなさい`
            }
          }
        }
        
        response = `【チャレンジ問題】\nさらに難しいテーマの小論文に挑戦しましょう。\n\n＜課題＞\n「${challengeProblem}」\n\n＜条件＞\n- 文字数：${charCount}\n- 構成：序論（問題提起）→本論（メリット・デメリット）→結論（自分の意見）\n- 具体例を3つ以上含めること\n- 客観的なデータや事例を引用すること\n\n━━━━━━━━━━━━━━━━━━\n📝 手書き原稿の提出方法\n━━━━━━━━━━━━━━━━━━\n\n1️⃣ 原稿用紙に手書きで小論文を書く\n\n2️⃣ 書き終えたら、下の入力欄の横にある📷カメラボタンを押す\n\n3️⃣ 「撮影する」で原稿を撮影\n\n4️⃣ 必要に応じて「範囲を調整」で読み取り範囲を調整\n\n5️⃣ 「OCR処理を開始」ボタンを押す\n\n6️⃣ 読み取り結果を確認\n\n━━━━━━━━━━━━━━━━━━\n✅ OCR結果が正しい場合\n━━━━━━━━━━━━━━━━━━\n「確認完了」と入力して送信\n→ すぐにAI添削が開始されます\n\n✏️ OCR結果を修正したい場合\n━━━━━━━━━━━━━━━━━━\n正しいテキストを入力して送信\n→ 修正内容が保存され、AI添削が開始されます\n\n※ カメラボタンは入力欄の右側にあります`
      }
      else {
        response = '原稿用紙に小論文を書き終えたら、下の入力欄の横にある📷カメラボタンを押して撮影してください。\n\n📷カメラボタン → 撮影 → 範囲調整（任意） → OCR処理を開始 → 結果確認\n\n✅ 結果が正しい → 「確認完了」と送信\n✏️ 修正が必要 → 正しいテキストを入力して送信\n\nまだ準備中の場合は、書き終えてからアップロードしてください。'
      }
    } else {
      response = 'ステップ' + currentStep + 'の内容は準備中です。「完了」と入力して次に進んでください。'
      if (message.includes('完了')) {
        stepCompleted = true
      }
    }
    
    // ステップ完了時にセッションを更新
    if (stepCompleted && session && session.essaySession) {
      session.essaySession.stepStatus = session.essaySession.stepStatus || {}
      session.essaySession.stepStatus[currentStep] = 'completed'
      session.essaySession.currentStep = currentStep
      
      // インメモリとD1の両方を更新
      learningSessions.set(sessionId, session)
      await saveSessionToDB(db, sessionId, session)
      console.log('✅ Session updated for step completion:', currentStep)
    } else if (session && session.essaySession) {
      // ステップ完了していなくても、currentStepを更新
      session.essaySession.currentStep = currentStep
      learningSessions.set(sessionId, session)
      await saveSessionToDB(db, sessionId, session)
      console.log('📝 Session currentStep updated:', currentStep)
    }
    
    console.log('📝 Essay chat response for step ' + currentStep)
    console.log('📤 Sending response:', { response: response.substring(0, 50) + '...', stepCompleted })
    
    return c.json({
      ok: true,
      response,
      stepCompleted,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ Essay chat error:', error)
    return c.json({
      ok: false,
      error: 'chat_error',
      message: 'チャット処理でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

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
app.get('/essay-coaching', (c) => {
  console.log('📝 Essay Coaching page requested')
  
  // セッションID生成
  const sessionId = `essay-${Date.now()}-${Math.random().toString(36).substring(7)}`
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>小論文指導 - KOBEYA</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
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
          padding: 2rem;
          text-align: center;
        }
        
        .header h1 {
          font-size: 1.75rem;
          margin-bottom: 0.5rem;
        }
        
        .header p {
          opacity: 0.9;
          font-size: 1rem;
        }
        
        .content {
          padding: 2rem;
        }
        
        .setup-section {
          background: #f8fafc;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1.5rem;
        }
        
        .setup-section h2 {
          font-size: 1.25rem;
          margin-bottom: 1rem;
          color: #374151;
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }
        
        .setup-section h2 .step-number {
          background: #7c3aed;
          color: white;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-size: 0.875rem;
          font-weight: 600;
        }
        
        .button-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
          gap: 1rem;
        }
        
        .choice-button {
          padding: 1.25rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.75rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
          text-align: left;
        }
        
        .choice-button:hover {
          border-color: #7c3aed;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.15);
        }
        
        .choice-button.selected {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .choice-button .title {
          font-weight: 600;
          font-size: 1.125rem;
          margin-bottom: 0.5rem;
          color: #1f2937;
        }
        
        .choice-button .description {
          font-size: 0.875rem;
          color: #6b7280;
          line-height: 1.5;
        }
        
        .choice-button .icon {
          font-size: 1.5rem;
          margin-bottom: 0.5rem;
          display: block;
        }
        
        .start-button {
          width: 100%;
          padding: 1rem 2rem;
          background: #7c3aed;
          color: white;
          border: none;
          border-radius: 0.75rem;
          font-size: 1.125rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 1.5rem;
          display: none;
        }
        
        .start-button:hover {
          background: #6d28d9;
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(124, 58, 237, 0.3);
        }
        
        .start-button.visible {
          display: block;
        }
        
        .dev-start-button {
          width: 100%;
          padding: 1rem 2rem;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border: 2px dashed rgba(255, 255, 255, 0.3);
          border-radius: 0.75rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
          margin-top: 1rem;
          display: block;
          opacity: 0.9;
        }
        
        .dev-start-button:hover {
          background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          opacity: 1;
        }
        
        .dev-start-button i {
          margin-right: 0.5rem;
        }
        
        .back-button {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.75rem 1.5rem;
          background: #f3f4f6;
          color: #374151;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          margin-bottom: 1.5rem;
        }
        
        .back-button:hover {
          background: #e5e7eb;
        }
        
        .hidden {
          display: none !important;
        }
        
        /* カスタム問題設定用スタイル */
        .radio-group {
          display: flex;
          flex-direction: column;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }
        
        .radio-option {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
          padding: 1rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.75rem;
          background: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .radio-option:hover {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .radio-option.selected {
          border-color: #7c3aed;
          background: #f5f3ff;
        }
        
        .radio-option input[type="radio"] {
          margin-top: 0.25rem;
        }
        
        .radio-label {
          flex: 1;
        }
        
        .radio-title {
          font-weight: 600;
          font-size: 1rem;
          margin-bottom: 0.25rem;
          color: #1f2937;
        }
        
        .radio-description {
          font-size: 0.875rem;
          color: #6b7280;
        }
        
        .input-area {
          margin-top: 1rem;
          padding: 1rem;
          background: #f8fafc;
          border-radius: 0.5rem;
          border: 1px solid #e2e8f0;
        }
        
        .input-area textarea {
          width: 100%;
          padding: 0.75rem;
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          font-family: 'Noto Sans JP', sans-serif;
          font-size: 0.875rem;
          resize: vertical;
          min-height: 60px;
        }
        
        .input-area textarea:focus {
          outline: none;
          border-color: #7c3aed;
          box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.1);
        }
        
        .char-count {
          text-align: right;
          font-size: 0.75rem;
          color: #6b7280;
          margin-top: 0.5rem;
        }
        
        .learning-style-section {
          margin-top: 1.5rem;
          padding-top: 1.5rem;
          border-top: 2px solid #e2e8f0;
        }
        
        .learning-style-section h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-bottom: 1rem;
          color: #374151;
        }
        
        .input-ok-button {
          display: block;
          width: 100%;
          padding: 0.75rem 1.5rem;
          margin-top: 1rem;
          background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.3s;
          box-shadow: 0 4px 6px rgba(124, 58, 237, 0.2);
        }
        
        .input-ok-button:hover {
          background: linear-gradient(135deg, #6d28d9 0%, #5b21b6 100%);
          box-shadow: 0 6px 8px rgba(124, 58, 237, 0.3);
          transform: translateY(-2px);
        }
        
        .input-ok-button:active {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(124, 58, 237, 0.2);
        }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1><i class="fas fa-pen-fancy"></i> 小論文指導</h1>
                <p>丁寧な指導で、あなたの小論文力を伸ばします</p>
            </div>
            
            <div class="content">
                <button class="back-button" onclick="window.location.href='/study-partner'">
                    <i class="fas fa-arrow-left"></i> メインページに戻る
                </button>
                
                <!-- Step 1: 対象レベル選択 -->
                <div class="setup-section" id="levelSelection">
                    <h2>
                        <span class="step-number">1</span>
                        対象レベルを選択してください
                    </h2>
                    <div class="button-grid">
                        <button class="choice-button" onclick="selectLevel('high_school', event)">
                            <span class="icon">🎓</span>
                            <div class="title">高校入試対策</div>
                            <div class="description">字数: 200-300字<br>基本構成の習得を重視</div>
                        </button>
                        <button class="choice-button" onclick="selectLevel('vocational', event)">
                            <span class="icon">💼</span>
                            <div class="title">専門学校入試</div>
                            <div class="description">字数: 300-400字<br>実践性を重視</div>
                        </button>
                        <button class="choice-button" onclick="selectLevel('university', event)">
                            <span class="icon">🏛️</span>
                            <div class="title">大学入試対策</div>
                            <div class="description">字数: 400-600字<br>論理の深さを重視</div>
                        </button>
                    </div>
                </div>
                
                <!-- Step 2: 問題設定 -->
                <div class="setup-section hidden" id="problemSetup">
                    <h2>
                        <span class="step-number">2</span>
                        問題設定
                    </h2>
                    
                    <div class="radio-group">
                        <label class="radio-option" onclick="selectProblemMode('ai', event)">
                            <input type="radio" name="problemMode" value="ai">
                            <div class="radio-label">
                                <div class="radio-title">🤖 AIにお任せ</div>
                                <div class="radio-description">レベルに応じた最適なテーマをAIが自動選択します</div>
                            </div>
                        </label>
                        
                        <label class="radio-option" onclick="selectProblemMode('theme', event)">
                            <input type="radio" name="problemMode" value="theme">
                            <div class="radio-label">
                                <div class="radio-title">💡 テーマを入力</div>
                                <div class="radio-description">学習したいテーマ（環境問題、AI技術など）を入力してください</div>
                            </div>
                        </label>
                        
                        <label class="radio-option" onclick="selectProblemMode('problem', event)">
                            <input type="radio" name="problemMode" value="problem">
                            <div class="radio-label">
                                <div class="radio-title">📝 問題文を入力</div>
                                <div class="radio-description">過去問など、具体的な問題文を入力してください</div>
                            </div>
                        </label>
                    </div>
                    
                    <!-- テーマ入力エリア -->
                    <div class="input-area hidden" id="themeInput">
                        <label>
                            <strong>テーマを入力してください</strong>
                            <textarea id="themeText" maxlength="100" placeholder="例: 医療技術の発展と倫理、少子高齢化社会の課題、グローバル化と文化"></textarea>
                            <div class="char-count"><span id="themeCharCount">0</span>/100文字</div>
                        </label>
                        <button class="input-ok-button" onclick="confirmThemeInput()">✓ OK</button>
                    </div>
                    
                    <!-- 問題文入力エリア -->
                    <div class="input-area hidden" id="problemInput">
                        <label>
                            <strong>問題文を入力してください</strong>
                            <textarea id="problemText" maxlength="5000" placeholder="例: あなたは将来医療従事者を目指していますが、高齢化が進む日本社会において、医療・看護の専門家にはどのような役割が求められると考えますか。具体的な課題を挙げながら、あなたの考えを400字以内で述べなさい。"></textarea>
                            <div class="char-count"><span id="problemCharCount">0</span>/5000文字</div>
                        </label>
                        <button class="input-ok-button" onclick="confirmProblemInput()">✓ OK</button>
                    </div>
                    
                    <!-- 学習スタイル選択 -->
                    <div class="learning-style-section hidden" id="learningStyleSection">
                        <h3>📚 学習スタイルを選んでください</h3>
                        <div class="button-grid">
                            <button class="choice-button" onclick="selectLearningStyle('explanation', event)">
                                <span class="icon">📖</span>
                                <div class="title">テーマの解説</div>
                                <div class="description">基礎から理解したい</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('example', event)">
                                <span class="icon">✨</span>
                                <div class="title">参考例を見る</div>
                                <div class="description">良い書き方を真似したい</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('points', event)">
                                <span class="icon">📋</span>
                                <div class="title">論点整理</div>
                                <div class="description">何を書けばいいか迷う</div>
                            </button>
                            <button class="choice-button" onclick="selectLearningStyle('auto', event)">
                                <span class="icon">🤖</span>
                                <div class="title">AIにお任せ</div>
                                <div class="description">自動で最適なものを選ぶ</div>
                            </button>
                        </div>
                    </div>
                </div>
                
                <!-- Step 3: 授業形式選択 -->
                <div class="setup-section hidden" id="formatSelection">
                    <h2>
                        <span class="step-number">3</span>
                        授業形式を選択してください
                    </h2>
                    <div class="button-grid">
                        <button class="choice-button" onclick="selectFormat('full_55min', event)">
                            <span class="icon">📚</span>
                            <div class="title">55分フル授業</div>
                            <div class="description">導入→語彙→短文→本練習→チャレンジ→まとめ<br>総合的な学習</div>
                        </button>
                        <button class="choice-button" onclick="selectFormat('vocabulary_focus', event)">
                            <span class="icon">✍️</span>
                            <div class="title">語彙力強化中心</div>
                            <div class="description">25分構成<br>多くの語彙を反復練習</div>
                        </button>
                        <button class="choice-button" onclick="selectFormat('short_essay_focus', event)">
                            <span class="icon">📝</span>
                            <div class="title">短文演習中心</div>
                            <div class="description">30分構成<br>構成力強化を重視</div>
                        </button>
                    </div>
                </div>
                
                <!-- 授業開始ボタン -->
                <button class="start-button" id="startButton" onclick="startLesson()">
                    <i class="fas fa-play-circle"></i> 授業を開始
                </button>
                
                <!-- 開発者モードボタン -->
                <button class="dev-start-button" id="devStartButton" onclick="startDevLesson()">
                    <i class="fas fa-code"></i> 🛠️ 開発モードで開始（Step 4へ直接ジャンプ）
                </button>
            </div>
        </div>
        
        <script>
        const sessionId = '${sessionId}';
        let selectedLevel = null;
        let selectedProblemMode = null;
        let customInput = null;
        let selectedLearningStyle = null;
        let selectedFormat = null;
        
        // 文字数カウント機能
        const themeTextarea = document.getElementById('themeText');
        const problemTextarea = document.getElementById('problemText');
        
        if (themeTextarea) {
            themeTextarea.addEventListener('input', function() {
                document.getElementById('themeCharCount').textContent = this.value.length;
            });
        }
        
        if (problemTextarea) {
            problemTextarea.addEventListener('input', function() {
                document.getElementById('problemCharCount').textContent = this.value.length;
            });
        }
        
        function selectLevel(level, event) {
            selectedLevel = level;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#levelSelection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            // 次のステップ（問題設定）を表示
            document.getElementById('problemSetup').classList.remove('hidden');
            
            console.log('Selected level:', level);
        }
        
        function selectProblemMode(mode, event) {
            selectedProblemMode = mode;
            
            // ラジオボタンの選択状態を更新
            document.querySelectorAll('.radio-option').forEach(opt => {
                opt.classList.remove('selected');
            });
            event.target.closest('.radio-option').classList.add('selected');
            
            // 対応する入力エリアを表示/非表示
            document.getElementById('themeInput').classList.add('hidden');
            document.getElementById('problemInput').classList.add('hidden');
            document.getElementById('learningStyleSection').classList.add('hidden');
            document.getElementById('formatSelection').classList.add('hidden');
            
            if (mode === 'theme') {
                document.getElementById('themeInput').classList.remove('hidden');
                // 学習スタイルとフォーマット選択はOKボタン後に表示
            } else if (mode === 'problem') {
                document.getElementById('problemInput').classList.remove('hidden');
                // 学習スタイルとフォーマット選択はOKボタン後に表示
            } else if (mode === 'ai') {
                // AIにお任せの場合はすぐに次のステップへ
                document.getElementById('learningStyleSection').classList.remove('hidden');
                document.getElementById('formatSelection').classList.remove('hidden');
            }
            
            console.log('Selected problem mode:', mode);
        }
        
        function confirmThemeInput() {
            const themeText = document.getElementById('themeText').value.trim();
            if (!themeText) {
                alert('テーマを入力してください');
                return;
            }
            // 学習スタイルとフォーマット選択を表示
            document.getElementById('learningStyleSection').classList.remove('hidden');
            document.getElementById('formatSelection').classList.remove('hidden');
            console.log('Theme confirmed:', themeText);
        }
        
        function confirmProblemInput() {
            const problemText = document.getElementById('problemText').value.trim();
            if (!problemText) {
                alert('問題文を入力してください');
                return;
            }
            // 学習スタイルとフォーマット選択を表示
            document.getElementById('learningStyleSection').classList.remove('hidden');
            document.getElementById('formatSelection').classList.remove('hidden');
            console.log('Problem confirmed:', problemText);
        }
        
        function selectLearningStyle(style, event) {
            selectedLearningStyle = style;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#learningStyleSection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            console.log('Selected learning style:', style);
        }
        
        function selectFormat(format, event) {
            selectedFormat = format;
            
            // ボタンの選択状態を更新
            document.querySelectorAll('#formatSelection .choice-button').forEach(btn => {
                btn.classList.remove('selected');
            });
            event.target.closest('.choice-button').classList.add('selected');
            
            // 開始ボタンを表示
            document.getElementById('startButton').classList.add('visible');
            
            console.log('Selected format:', format);
        }
        
        async function startLesson() {
            if (!selectedLevel || !selectedFormat || !selectedProblemMode) {
                alert('すべての項目を選択してください');
                return;
            }
            
            // テーマまたは問題文の取得
            if (selectedProblemMode === 'theme') {
                customInput = document.getElementById('themeText').value.trim();
                if (!customInput) {
                    alert('テーマを入力してください');
                    return;
                }
            } else if (selectedProblemMode === 'problem') {
                customInput = document.getElementById('problemText').value.trim();
                if (!customInput) {
                    alert('問題文を入力してください');
                    return;
                }
            }
            
            // 学習スタイルが選択されているか確認（AIにお任せ以外の場合）
            if (selectedProblemMode !== 'ai' && !selectedLearningStyle) {
                alert('学習スタイルを選択してください');
                return;
            }
            
            console.log('Starting lesson:', { 
                sessionId, 
                selectedLevel, 
                selectedProblemMode, 
                customInput,
                selectedLearningStyle,
                selectedFormat 
            });
            
            // セッション初期化API呼び出し
            try {
                const response = await fetch('/api/essay/init-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        targetLevel: selectedLevel,
                        lessonFormat: selectedFormat,
                        problemMode: selectedProblemMode,
                        customInput: customInput || null,
                        learningStyle: selectedLearningStyle || 'auto'
                    })
                });
                
                const result = await response.json();
                
                if (result.ok) {
                    // 授業ページに遷移
                    window.location.href = '/essay-coaching/session/' + sessionId;
                } else {
                    alert('セッションの初期化に失敗しました: ' + result.message);
                }
            } catch (error) {
                console.error('Session init error:', error);
                alert('エラーが発生しました。もう一度お試しください。');
            }
        }
        
        async function startDevLesson() {
            // 開発者モード：レベル・形式選択なしで開始
            const defaultLevel = 'high_school';
            const defaultFormat = 'individual';
            
            console.log('🛠️ Starting in DEVELOPER MODE:', { sessionId, defaultLevel, defaultFormat });
            
            // セッション初期化API呼び出し
            try {
                const response = await fetch('/api/essay/init-session', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId,
                        targetLevel: defaultLevel,
                        lessonFormat: defaultFormat
                    })
                });
                
                const result = await response.json();
                
                if (result.ok) {
                    // 授業ページに開発者モードパラメータ付きで遷移
                    window.location.href = '/essay-coaching/session/' + sessionId + '?dev=true&debug=true';
                } else {
                    alert('セッションの初期化に失敗しました: ' + result.message);
                }
            } catch (error) {
                console.error('Session init error:', error);
                alert('エラーが発生しました。もう一度お試しください。');
            }
        }
        </script>
    </body>
    </html>
  `)
})

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
app.post('/api/similar/check', async (c) => {
  console.log('🔥 Similar problem check API called')
  
  try {
    const { sessionId, problemNumber, answer } = await c.req.json()
    
    if (!sessionId || problemNumber === undefined || answer === undefined) {
      return c.json({
        ok: false,
        error: 'missing_params',
        message: 'セッションID、問題番号、または回答が不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッション取得（インメモリ → D1フォールバック）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    
    if (!session) {
      console.error('❌ Session not found for similar check:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    console.log('✅ Session retrieved for similar check:', sessionId)
    
    console.log('🔍 Similar check - session keys:', Object.keys(session))
    console.log('🔍 Similar check - has similarProblems:', !!session.similarProblems)
    console.log('🔍 Similar check - similarProblems type:', typeof session.similarProblems)
    console.log('🔍 Similar check - similarProblems count:', session.similarProblems?.length || 0)
    
    // 類似問題データの取得と検証
    if (!Array.isArray(session.similarProblems)) {
      console.error('❌ similarProblems is not an array:', typeof session.similarProblems)
      return c.json({
        ok: false,
        error: 'invalid_similar_problems',
        message: '類似問題データの形式が不正です',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const problemIndex = problemNumber - 1
    if (problemIndex < 0 || problemIndex >= session.similarProblems.length) {
      console.error('❌ Invalid problemNumber:', { problemNumber, arrayLength: session.similarProblems.length })
      return c.json({
        ok: false,
        error: 'problem_not_found',
        message: `指定された類似問題が見つかりません（問題番号: ${problemNumber}）`,
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    const similarProblem = session.similarProblems[problemIndex]
    
    if (!similarProblem || typeof similarProblem !== 'object') {
      console.error('❌ Invalid similarProblem at index:', { problemIndex, similarProblem })
      return c.json({
        ok: false,
        error: 'invalid_problem_data',
        message: '類似問題データが不正です',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    // 回答チェック
    let isCorrect = false
    
    if (similarProblem.type === 'choice') {
      // 選択肢問題の場合
      isCorrect = answer === similarProblem.correctAnswer
    } else if (similarProblem.type === 'input') {
      // 記述問題の場合 - 複数の正解パターンをチェック
      const normalizedAnswer = answer.trim()
      isCorrect = similarProblem.correctAnswers.some(correct => 
        normalizedAnswer === correct.trim()
      )
    }
    
    console.log('🎯 Similar problem check:', {
      problemNumber,
      type: similarProblem.type,
      userAnswer: answer,
      expected: similarProblem.type === 'choice' ? similarProblem.correctAnswer : similarProblem.correctAnswers,
      isCorrect
    })
    
    // 回答履歴を記録（attemptsが未定義の場合は初期化）
    if (!similarProblem.attempts) {
      similarProblem.attempts = [];
    }
    similarProblem.attempts.push({
      answer,
      isCorrect,
      timestamp: new Date().toISOString()
    })
    
    // 全体の進捗をチェック
    if (!session.similarProblems) {
      console.error('❌ No similarProblems in session:', session);
      return c.json({
        ok: false,
        error: 'missing_similar_problems',
        message: '類似問題データが見つかりません',
        timestamp: new Date().toISOString()
      }, 500);
    }
    
    const completedProblems = session.similarProblems.filter(p => 
      p.attempts && p.attempts.some(attempt => attempt.isCorrect)
    ).length
    
    let nextAction = 'continue'
    let feedback = ''
    
    if (isCorrect) {
      feedback = `✅ 類似問題${problemNumber}正解！\n\n💡 ${similarProblem.explanation}`
      
      if (completedProblems === session.similarProblems.length) {
        session.status = 'fully_completed'
        nextAction = 'all_completed'
        feedback += '\n\n🎉 すべての類似問題が完了しました！お疲れ様でした！'
        
        // 学習完了時のログ記録
        try {
          console.log('📝 Session completed, sending log for:', sessionId)
          const { logCompletedSession } = await import('./utils/session-logger')
          await logCompletedSession(sessionId, learningSessions, {}, c.env)
        } catch (error) {
          console.error('❌ Failed to log completed session:', error)
        }
      } else {
        nextAction = 'next_problem'
      }
    } else {
      if (similarProblem.type === 'choice') {
        feedback = `❌ 正解は ${similarProblem.correctAnswer} です。\n\n💡 ${similarProblem.explanation}`
      } else {
        feedback = `❌ 正解例: ${similarProblem.correctAnswers[0]}\n\n💡 ${similarProblem.explanation}`
      }
      nextAction = 'retry'
    }
    
    session.updatedAt = new Date().toISOString()
    
    // D1に更新されたセッションを保存
    if (db) {
      await saveStudyPartnerSessionToDB(db, sessionId, session)
      console.log('✅ Similar check: session updated in D1')
    }
    
    const response = {
      ok: true,
      sessionId,
      problemNumber,
      isCorrect,
      feedback,
      nextAction,
      completedProblems,
      totalProblems: session.similarProblems.length,
      timestamp: new Date().toISOString()
    }
    
    console.log('🎯 Similar check response:', { isCorrect, nextAction, completedProblems })
    return c.json(response, 200)
    
  } catch (error) {
    console.error('❌ Similar check error:', error)
    return c.json({
      ok: false,
      error: 'similar_check_error',
      message: error.message || '類似問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 段階学習データ生成関数（フォールバック用 - 動的生成失敗時のみ使用）
function generateLearningData(problemType) {
  console.log('❌ AI分析失敗 - フォールバック呼び出し禁止')
  console.log(`問題タイプ: ${problemType}`)
  
  // ダミーデータの代わりに詳細なエラー情報を提供
  throw new Error(`AI分析に失敗しました。問題タイプ「${problemType}」のダミーデータは使用しません。先生にお知らせください。`)
}

// ルートパスハンドラー
app.get('/', (c) => {
  return c.redirect('/study-partner', 302)
})

// Study Partner Simple - ログイン修正版
app.get('/study-partner-simple', studyPartnerSimple)

// Study Partner SPA - 完全復元版
app.get('/study-partner', (c) => {
  console.log('📱 Study Partner SPA requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <style>
        /* Notion-Inspired Modern Design */
        
        /* Clean White Base with Subtle Gradient */
        body { 
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans JP', sans-serif; 
          margin: 0;
          padding: 0;
          background: linear-gradient(180deg, #fafafa 0%, #f5f5f5 100%);
          min-height: 100vh;
          color: #37352f;
        }
        
        /* Centered Modern Container - A Plan */
        .container { 
          max-width: 900px; 
          margin: 0 auto; 
          padding: 3rem 2rem;
        }
        
        @media (max-width: 960px) {
          .container { 
            max-width: 95%; 
            padding: 2rem 1.5rem;
          }
        }
        
        @media (max-width: 768px) {
          .container { 
            padding: 1.5rem 1rem; 
          }
        }
        
        /* Modern Input Styling - Clean Box Model */
        input { 
          padding: 0.875rem 1rem; 
          margin: 0; 
          width: 100%; 
          border-radius: 0.375rem;
          border: 1px solid #e0e0e0;
          font-size: 15px;
          background: white;
          color: #37352f;
          transition: all 0.15s ease;
          font-family: inherit;
          box-sizing: border-box;
        }
        
        input:focus {
          outline: none;
          border-color: #2383e2;
          box-shadow: 0 0 0 3px rgba(35, 131, 226, 0.1);
        }
        
        input::placeholder {
          color: rgba(55, 53, 47, 0.4);
        }
        
        label {
          display: block;
          color: #37352f;
          font-weight: 600;
          margin-bottom: 0.375rem;
          font-size: 0.875rem;
        }
        
        /* Card-Style Button Base */
        button { 
          padding: 0;
          margin: 0;
          width: 100%; 
          border-radius: 0.5rem;
          border: 1px solid rgba(0, 0, 0, 0.08);
          font-size: 15px;
          background: white;
          color: #37352f;
          cursor: pointer;
          font-weight: 500;
          transition: all 0.2s ease;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
          min-height: 48px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: inherit;
        }
        
        button:hover {
          background: #fafafa;
          border-color: rgba(0, 0, 0, 0.12);
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.12);
          transform: translateY(-1px);
        }
        
        button:active {
          transform: translateY(0);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
        }
        
        button:disabled {
          opacity: 0.4;
          cursor: not-allowed;
          transform: none !important;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08) !important;
        }
        
        /* Notion-style Color Accents */
        button.secondary {
          background: #f7f6f3;
          color: #64645f;
        }
        
        button.secondary:hover {
          background: #efeeeb;
        }
        
        button.contrast {
          background: #2383e2;
          color: white;
          border-color: #2383e2;
        }
        
        button.contrast:hover {
          background: #1a6ec7;
          border-color: #1a6ec7;
        }
        
        button.success {
          background: #0f7b6c;
          color: white;
          border-color: #0f7b6c;
        }
        
        button.success:hover {
          background: #0c6b5f;
          border-color: #0c6b5f;
        }
        
        button.ai-question {
          background: #2383e2;
          position: fixed;
          bottom: 30px;
          right: 30px;
          border-radius: 50px;
          padding: 0.875rem 1.75rem;
          box-shadow: 0 8px 24px rgba(35, 131, 226, 0.35);
          z-index: 1000;
          font-weight: 600;
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          min-height: auto;
          width: auto;
        }
        
        button.ai-question:hover {
          background: #1a6ec7;
          transform: translateY(-2px);
          box-shadow: 0 12px 32px rgba(35, 131, 226, 0.45);
        }
        
        @media (max-width: 768px) {
          button.ai-question {
            bottom: 20px;
            right: 20px;
            padding: 0.75rem 1.25rem;
            font-size: 0.875rem;
          }
        }
        
        /* Clean Code Blocks */
        pre { 
          background: #f7f6f3; 
          padding: 1.25rem; 
          border-radius: 0.5rem; 
          overflow: auto;
          font-size: 0.875rem;
          border: 1px solid rgba(0, 0, 0, 0.06);
          color: #37352f;
        }
        
        /* Unified Grid Layout for All Elements */
        .grid {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 640px) {
          .grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          .grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        /* Clean Image Preview */
        #imagePreviewArea {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 0.5rem;
          background: white;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 1rem;
        }
        
        #previewImage {
          max-width: 100%;
          max-height: 400px;
          border-radius: 0.375rem;
          object-fit: contain;
        }
        
        /* Minimal Loading Spinner */
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-top: 2px solid #2383e2;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        /* Font Awesome spinner animation (fallback) */
        .fa-spin, .fa-spinner {
          animation: fa-spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fa-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Clean Crop Area */
        #cropArea {
          border: 1px solid rgba(0, 0, 0, 0.08);
          border-radius: 0.5rem;
          background: white;
          overflow: hidden;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          padding: 1rem;
        }
        
        #cropperContainer {
          max-height: 450px;
          overflow: hidden;
          border-radius: 0.375rem;
        }
        
        /* Notion-style Cropper.js */
        .cropper-point {
          width: 14px !important;
          height: 14px !important;
          background-color: #2383e2 !important;
          border: 2px solid white !important;
          border-radius: 50% !important;
          box-shadow: 0 2px 6px rgba(0,0,0,0.2) !important;
        }
        
        .cropper-line {
          background-color: #2383e2 !important;
          height: 2px !important;
        }
        
        .cropper-line.cropper-line-v {
          width: 2px !important;
          height: auto !important;
        }
        
        .cropper-view-box {
          outline: 2px solid #2383e2 !important;
          outline-color: rgba(35, 131, 226, 0.75) !important;
        }
        
        .cropper-crop-box {
          border: 2px solid #2383e2 !important;
        }
        
        /* Mobile optimization */
        @media (max-width: 768px) {
          .cropper-point {
            width: 18px !important;
            height: 18px !important;
            background-color: #2383e2 !important;
            border: 3px solid white !important;
            border-radius: 50% !important;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25) !important;
          }
          
          .cropper-line {
            background-color: #2383e2 !important;
            height: 3px !important;
          }
          
          .cropper-line.cropper-line-v {
            width: 3px !important;
            height: auto !important;
          }
          
          .cropper-crop-box {
            border: 3px solid #2383e2 !important;
          }
        }
        
        /* Clean Section Cards */
        section {
          background: white !important;
          border: 1px solid rgba(0, 0, 0, 0.08) !important;
          border-radius: 0.75rem !important;
          padding: 2rem !important;
          margin-bottom: 1.5rem !important;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04) !important;
          transition: box-shadow 0.2s ease !important;
        }
        
        section:hover {
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08) !important;
        }
        
        /* Typography */
        h1 {
          color: #37352f;
          font-weight: 700;
          margin: 0;
          font-size: 2rem;
        }
        
        h2 {
          color: #37352f;
          font-weight: 600;
          font-size: 1.5rem;
        }
        
        h3 {
          color: #37352f;
          font-weight: 600;
          font-size: 1.25rem;
        }
        
        p {
          color: rgba(55, 53, 47, 0.8);
          line-height: 1.6;
        }
        
        /* Notion-style Icon Styling */
        .fas, .fa {
          opacity: 0.6;
        }
        
        /* Override Inline Styles for Notion Look - Centered Header */
        section[style*="gradient"] {
          background: white !important;
          color: #37352f !important;
          text-align: center !important;
          padding: 3rem 2rem 2.5rem 2rem !important;
          border-bottom: 1px solid rgba(0, 0, 0, 0.08) !important;
          margin-bottom: 2rem !important;
        }
        
        section[style*="gradient"] h1 {
          color: #37352f !important;
          font-size: 2.25rem !important;
          margin-bottom: 0.5rem !important;
          font-weight: 700 !important;
        }
        
        section[style*="gradient"] p {
          color: rgba(55, 53, 47, 0.65) !important;
          opacity: 1 !important;
          font-size: 1rem !important;
          margin-bottom: 1.25rem !important;
        }
        
        section[style*="gradient"] div {
          background: #f7f6f3 !important;
          border-radius: 0.5rem !important;
          padding: 0.875rem 1.25rem !important;
          border: 1px solid rgba(0, 0, 0, 0.06) !important;
          max-width: 600px !important;
          margin: 0 auto !important;
        }
        
        section[style*="gradient"] div p {
          color: rgba(55, 53, 47, 0.7) !important;
          font-size: 0.875rem !important;
          margin: 0 !important;
        }
        
        /* Main Section Grid - Unified 3-Column Layout */
        section:nth-of-type(2) {
          display: grid;
          gap: 1rem;
          grid-template-columns: 1fr;
        }
        
        @media (min-width: 640px) {
          section:nth-of-type(2) {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        
        @media (min-width: 768px) {
          section:nth-of-type(2) {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        
        /* Remove individual div spacing in main section */
        section:nth-of-type(2) > div {
          margin-bottom: 0 !important;
        }
        
        /* Feature Card Buttons - Taller & More Spacious */
        button[id*="Button"],
        button[id*="Taisaku"],
        button[id*="flashcard"],
        button[id*="Sei"],
        button#cameraButton,
        button#fileButton {
          min-height: 140px !important;
          padding: 1.75rem 1.5rem !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-start !important;
          justify-content: center !important;
          text-align: left !important;
          gap: 0.75rem !important;
          border-radius: 0.75rem !important;
        }
        
        /* Button icons larger */
        button[id*="Button"] i,
        button[id*="Taisaku"] i,
        button[id*="flashcard"] i,
        button[id*="Sei"] i,
        button#cameraButton i,
        button#fileButton i {
          font-size: 1.25rem;
          opacity: 0.8;
        }
        
        button[id*="Button"]:not(:disabled),
        button[id*="Taisaku"]:not(:disabled),
        button[id*="flashcard"]:not(:disabled),
        button[id*="Sei"]:not(:disabled) {
          background: white !important;
          color: #37352f !important;
        }
        
        /* AI Question Button - Blue Accent */
        button#aiQuestionMainButton {
          background: #2383e2 !important;
          color: white !important;
          border-color: #2383e2 !important;
        }
        
        button#aiQuestionMainButton:hover {
          background: #1a6ec7 !important;
        }
        
        /* Login Button - Span Full Width on Desktop */
        button#btnLogin {
          min-height: 56px !important;
          padding: 1rem 1.5rem !important;
        }
        
        @media (min-width: 768px) {
          section:nth-of-type(2) > div:first-child {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: 1fr 1fr 1fr;
            gap: 1rem;
          }
          
          section:nth-of-type(2) > div:first-child > div {
            margin-bottom: 0 !important;
          }
        }
        
        /* Fix input field container styling */
        .grid > div {
          display: flex;
          flex-direction: column;
        }
        
        /* Remove extra margins from grid items */
        section:nth-of-type(2) .grid {
          margin-bottom: 0 !important;
        }
        
        /* Camera and File Buttons - Card Style */
        button#cameraButton,
        button#fileButton {
          background: white !important;
          color: #37352f !important;
          border: 1px solid rgba(0, 0, 0, 0.12) !important;
        }
        
        button#cameraButton:not(:disabled):hover,
        button#fileButton:not(:disabled):hover {
          background: #fafafa !important;
          border-color: rgba(0, 0, 0, 0.16) !important;
        }
        
        /* Photo upload section wrapper - Horizontal 2 columns */
        section:nth-of-type(2) > div:has(#cameraButton) {
          display: grid !important;
          grid-template-columns: 1fr 1fr !important;
          gap: 1rem !important;
          grid-column: 1 / -1 !important;
        }
        
        section:nth-of-type(2) > div:has(#cameraButton) > div {
          margin-bottom: 0 !important;
        }
        
        /* Disabled Button State */
        button:disabled {
          background: #f7f6f3 !important;
          color: rgba(55, 53, 47, 0.3) !important;
          border-color: rgba(0, 0, 0, 0.06) !important;
        }

        /* Image sections responsive layout */
        /* For tablets and PC: horizontal cards with limited width */
        @media (min-width: 768px) {
          /* Limit section width to create horizontal card appearance */
          #imagePreviewArea,
          #cropArea,
          #analysisResult,
          #uploadingIndicator {
            max-width: 95% !important;
            margin-left: auto !important;
            margin-right: auto !important;
          }
          
          /* Image preview - make content more compact horizontally */
          #imagePreviewArea .image-content-wrapper {
            display: flex !important;
            flex-direction: row !important;
            gap: 1rem !important;
          }
          
          /* Reduce image preview height on larger screens */
          #imagePreviewArea img#previewImage {
            max-height: 250px !important;
          }
          
          #cropArea img#cropImage {
            max-height: 250px !important;
          }
        }
        
        /* For mobile: keep full-width vertical layout */
        @media (max-width: 767px) {
          #imagePreviewArea,
          #cropArea,
          #analysisResult,
          #uploadingIndicator {
            width: 100% !important;
          }
          
          /* Taller images on mobile for better viewing */
          #imagePreviewArea img#previewImage {
            max-height: 350px !important;
          }
          
          #cropArea img#cropImage {
            max-height: 350px !important;
          }
        }


        </style>
    </head>
    <body>
        <main class="container">
            <section style="text-align: center; margin-bottom: 1rem; padding: 2rem 1.5rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 1rem; color: white;">
                <h1 style="margin-bottom: 1rem; color: white;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    KOBEYA Study Partner
                </h1>
                <p style="font-size: 1rem; margin-bottom: 1.5rem; opacity: 0.9;">
                    AI学習パートナーで効果的な個別学習を体験してください
                </p>
                <div style="background-color: rgba(255,255,255,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                    <p style="margin: 0; font-size: 0.875rem;">
                        <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                        APP_KEY と 生徒IDを入力してログインしてください
                    </p>
                </div>
            </section>

            <section style="margin-bottom: 2.5rem;">
                <!-- 入力欄 -->
                <div class="grid" style="margin-bottom: 1rem;">
                    <div>
                        <label for="appkey">APP_KEY</label>
                        <input id="appkey" value="180418">
                    </div>
                    <div>
                        <label for="sid">学生ID</label>
                        <input id="sid" value="JS2-04">
                    </div>
                </div>

                <!-- ログインボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="btnLogin" class="contrast" style="width: 100%; margin: 0;">
                        <i class="fas fa-key" style="margin-right: 0.5rem;"></i>
                        ログイン/認証して開始
                    </button>
                </div>

                <!-- AIに質問ボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="aiQuestionMainButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #7c3aed; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                        <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                        🤖 AIに質問
                    </button>
                </div>

                <!-- 新機能プレースホルダーボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="eikenTaisaku" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-graduation-cap" style="margin-right: 0.5rem;"></i>
                        📚 英検対策（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="shoronbunTaisaku" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #7c3aed; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px; transition: all 0.2s;">
                        <i class="fas fa-pen-fancy" style="margin-right: 0.5rem;"></i>
                        📝 小論文対策
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="flashcard" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-clone" style="margin-right: 0.5rem;"></i>
                        🃏 フラッシュカード（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="interSeiYou" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-globe" style="margin-right: 0.5rem;"></i>
                        🌍 インター生用（実装予定）
                    </button>
                </div>

                <!-- 写真アップロード -->
                <div style="margin-bottom: 2.5rem;">
                    <!-- カメラ撮影ボタン -->
                    <div style="margin-bottom: 1rem;">
                        <button type="button" id="cameraButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #374151; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-camera" style="margin-right: 0.5rem;"></i>
                            📷 カメラで撮影
                        </button>
                        <input id="cameraInput" type="file" accept="image/*" capture="environment" style="display: none;">
                    </div>
                    
                    <!-- ファイル選択ボタン -->
                    <div>
                        <button type="button" id="fileButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #6b7280; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-folder-open" style="margin-right: 0.5rem;"></i>
                            📁 ファイルから選択
                        </button>
                        <input id="fileInput" type="file" accept="image/*" style="display: none;">
                    </div>
                </div>

                <!-- Vertical container for image preview/crop/analysis sections -->
                <div style="display: flex; flex-direction: column; gap: 1rem; margin-bottom: 2.5rem; align-items: center;">
                    <!-- 画像プレビューエリア (1段目) -->
                    <div id="imagePreviewArea" style="display: none; width: 100%; max-width: 800px; box-sizing: border-box; border: 1px solid #d1d5db; border-radius: 0.5rem; background: white; overflow: hidden;">
                        <div style="padding: 1rem; background: #f9fafb;">
                            <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                                📸 選択された画像
                            </p>
                        </div>
                        
                        <div style="padding: 1rem; text-align: center; max-height: 400px; overflow: hidden; border-top: 1px solid #e5e7eb; border-bottom: 1px solid #e5e7eb;">
                            <img id="previewImage" style="max-width: 100%; max-height: 350px; border-radius: 0.25rem; object-fit: contain;">
                        </div>
                        
                        <!-- 画像付きメッセージ入力エリア -->
                        <div style="padding: 1rem;">
                            <div style="margin-bottom: 1rem;">
                                <label for="imageMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                    💬 この画像について質問や説明を入力してください（任意）
                                </label>
                                <textarea id="imageMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                    style="width: 100%; padding: 0.75rem; border: 2px solid #d1d5db; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                            </div>
                            
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button id="btnStartCrop" class="secondary" style="flex: 1; min-width: 150px; margin: 0;">
                                    <i class="fas fa-crop" style="margin-right: 0.5rem;"></i>
                                    🔲 範囲を調整して送信
                                </button>
                                <button id="btnSendDirect" class="contrast" style="flex: 1; min-width: 150px; margin: 0;">
                                    <i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>
                                    📤 この画像で送信
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- クロップエリア (2段目) -->
                    <div id="cropArea" style="display: none; width: 100%; max-width: 800px; box-sizing: border-box; border: 1px solid #7c3aed; border-radius: 0.5rem; background: white; overflow: hidden;">
                        <div style="padding: 1rem; background: #f3f4f6;">
                            <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                                ✂️ 解析範囲を選択してください
                            </p>
                        </div>
                        
                        <div style="padding: 1rem; text-align: center; border-top: 1px solid #e9d5ff; border-bottom: 1px solid #e9d5ff;">
                            <div id="cropperContainer">
                                <img id="cropImage" style="max-width: 100%; max-height: 350px;">
                            </div>
                        </div>
                        
                        <div style="padding: 1rem;">
                            <div style="margin-bottom: 1rem;">
                                <label for="cropMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                    💬 この画像について質問や説明を入力してください（任意）
                                </label>
                                <textarea id="cropMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                    style="width: 100%; padding: 0.75rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                            </div>
                            
                            <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                                <button id="btnCancelCrop" class="secondary" style="flex: 1; min-width: 120px; margin: 0;">
                                    <i class="fas fa-times" style="margin-right: 0.5rem;"></i>
                                    キャンセル
                                </button>
                                <button id="btnConfirmCrop" class="contrast" style="flex: 2; min-width: 150px; margin: 0;">
                                    <i class="fas fa-check" style="margin-right: 0.5rem;"></i>
                                    ✅ この範囲で送信
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- アップロード中インジケーター -->
                    <div id="uploadingIndicator" style="display: none; width: 100%; max-width: 800px; box-sizing: border-box; text-align: center; padding: 1.5rem; background: #f3f4f6; border-radius: 0.5rem; border: 1px solid #7c3aed;">
                        <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 0.5rem;">
                            <div class="loading-spinner"></div>
                            <span style="font-weight: 500;">写真を解析中...</span>
                        </div>
                        <div style="font-size: 0.875rem; opacity: 0.8;">
                            大きな画像の場合、しばらく時間がかかることがあります
                        </div>
                    </div>

                    <!-- 解析結果表示エリア (3段目) -->
                    <div id="analysisResult" style="display: none; width: 100%; max-width: 800px; box-sizing: border-box; padding: 1rem; border: 1px solid #059669; border-radius: 0.5rem; background: #ecfdf5;">
                        <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
                            <i class="fas fa-check-circle" style="color: #059669; margin-right: 0.5rem;"></i>
                            <span style="font-weight: 500;">解析完了</span>
                        </div>
                        <div id="analysisContent" style="font-size: 0.875rem; line-height: 1.6;">
                            <!-- 解析結果がここに表示されます -->
                        </div>
                    </div>
                </div>

                <!-- API応答の表示先 -->
                <div id="out" style="background: #f5f5f5; padding: 1rem; margin-top: 1rem; border-radius: 0.5rem; min-height: 160px; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: hidden; word-wrap: break-word; font-family: inherit;"></div>
            </section>
            
            <!-- フローティングAI質問ボタン -->
            <button id="aiQuestionButton" class="ai-question" onclick="openAIChat()" style="display: none;">
                <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                🤔 AIに質問する
            </button>
        </main>

        <!-- Scripts -->
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        
        <script>
        console.log('📱 Study Partner JavaScript loading...');
        
        // DOM要素の取得
        let cameraInput, fileInput, previewImage, imagePreviewArea, cropArea, cropImage;
        let cropper = null;
        let authenticated = false;
        
        // 初期化
        document.addEventListener('DOMContentLoaded', function() {
          console.log('📱 Study Partner initialized');
          
          // DOM要素を取得
          cameraInput = document.getElementById('cameraInput');
          fileInput = document.getElementById('fileInput');
          previewImage = document.getElementById('previewImage');
          imagePreviewArea = document.getElementById('imagePreviewArea');
          cropArea = document.getElementById('cropArea');
          cropImage = document.getElementById('cropImage');
          
          // イベントリスナーを設定
          setupEventListeners();
        });
        
        function setupEventListeners() {
          // カメラ入力
          if (cameraInput) {
            cameraInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ファイル入力
          if (fileInput) {
            fileInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ログインボタン
          const btnLogin = document.getElementById('btnLogin');
          if (btnLogin) {
            btnLogin.addEventListener('click', handleLogin);
          }
          
          // メインのAIに質問ボタン
          const aiQuestionMainButton = document.getElementById('aiQuestionMainButton');
          if (aiQuestionMainButton) {
            aiQuestionMainButton.addEventListener('click', function() {
              console.log('🤖 Main AI question button clicked');
              openAIChatDirect();
            });
          }
          
          // 小論文対策ボタン
          const shoronbunButton = document.getElementById('shoronbunTaisaku');
          if (shoronbunButton) {
            shoronbunButton.addEventListener('click', function() {
              console.log('📝 Essay coaching button clicked');
              window.location.href = '/essay-coaching';
            });
          }
          
          // カメラボタン - Trigger camera input (mobile: camera, desktop: file picker)
          const cameraButton = document.getElementById('cameraButton');
          if (cameraButton && cameraInput) {
            cameraButton.addEventListener('click', function() {
              console.log('📷 Camera button clicked - triggering camera input');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              cameraInput.click(); // Mobile: opens camera, Desktop: opens file picker
            });
          }
          
          // ファイル選択ボタン
          const fileButton = document.getElementById('fileButton');
          if (fileButton) {
            fileButton.addEventListener('click', function() {
              console.log('📁 File button clicked');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              if (fileInput) {
                fileInput.click();
              }
            });
          }
          
          // クロップボタン
          const btnStartCrop = document.getElementById('btnStartCrop');
          if (btnStartCrop) {
            btnStartCrop.addEventListener('click', startCrop);
          }
          
          const btnConfirmCrop = document.getElementById('btnConfirmCrop');
          if (btnConfirmCrop) {
            btnConfirmCrop.addEventListener('click', confirmCrop);
          }
          
          const btnCancelCrop = document.getElementById('btnCancelCrop');
          if (btnCancelCrop) {
            btnCancelCrop.addEventListener('click', cancelCrop);
          }
          
          // 送信ボタン
          const btnSendDirect = document.getElementById('btnSendDirect');
          if (btnSendDirect) {
            btnSendDirect.addEventListener('click', sendDirectly);
          }
        }
        
        // 写真選択処理
        function handlePhotoSelect(event) {
          const file = event.target.files[0];
          if (!file) return;
          
          console.log('📸 Photo selected:', file.name, file.type);
          
          // 画像プレビュー表示
          const reader = new FileReader();
          reader.onload = function(e) {
            if (previewImage) {
              previewImage.src = e.target.result;
              showImagePreview();
              
              // 短時間待ってから自動的にクロップ画面に移行
              setTimeout(() => {
                console.log('🔲 Auto starting crop after photo selection');
                startCrop();
              }, 800); // 0.8秒後に自動移行（画像表示確認のため）
            }
          };
          reader.readAsDataURL(file);
        }
        
        // 画像プレビュー表示
        function showImagePreview() {
          if (imagePreviewArea) {
            imagePreviewArea.style.display = 'block';
            
            // 自動移行メッセージを表示
            const btnStartCrop = document.getElementById('btnStartCrop');
            const btnSendDirect = document.getElementById('btnSendDirect');
            
            if (btnStartCrop) {
              btnStartCrop.innerHTML = '<i class="fas fa-hourglass-half" style="margin-right: 0.5rem;"></i>🔲 クロップ画面に移行中...';
              btnStartCrop.disabled = true;
              btnStartCrop.style.opacity = '0.7';
            }
            
            if (btnSendDirect) {
              btnSendDirect.style.display = 'none'; // 自動移行中は非表示
            }
          }
          hideArea(cropArea);
        }
        
        // クロップ開始
        function startCrop() {
          if (!previewImage || !previewImage.src) return;
          
          console.log('✂️ Starting crop');
          
          // プレビュー画像をクロップエリアにコピー
          if (cropImage) {
            cropImage.src = previewImage.src;
          }
          
          // メッセージもコピー
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            cropMessageInput.value = imageMessageInput.value;
          }
          
          showArea(cropArea);
          hideArea(imagePreviewArea);
          
          // Cropper.js初期化
          if (window.Cropper && cropImage) {
            if (cropper) {
              cropper.destroy();
            }
            
            cropper = new Cropper(cropImage, {
              aspectRatio: NaN, // フリーサイズ
              viewMode: 1,
              dragMode: 'move',
              autoCropArea: 0.95, // ほぼ全体を初期選択（0.8 → 0.95）
              restore: false,
              guides: true,
              center: true,
              highlight: false,
              cropBoxMovable: true,
              cropBoxResizable: true,
              toggleDragModeOnDblclick: false,
              ready: function() {
                console.log('✂️ Cropper initialized with almost full area selection');
              }
            });
          }
        }
        
        // クロップ確定
        function confirmCrop() {
          console.log('✅ Confirming crop');
          
          let croppedImageData = null;
          
          if (cropper) {
            // Cropper.js を使用してクロップ
            const canvas = cropper.getCroppedCanvas({
              maxWidth: 2000,
              maxHeight: 2000,
              fillColor: '#fff',
              imageSmoothingEnabled: true,
              imageSmoothingQuality: 'high',
            });
            
            croppedImageData = canvas.toDataURL('image/jpeg', 0.8);
          } else {
            // Cropper.js が利用できない場合は元画像を使用
            croppedImageData = previewImage.src;
          }
          
          // メッセージ入力欄から値を取得
          const messageInput = document.getElementById('cropMessageInput');
          const userMessage = messageInput ? messageInput.value.trim() : '';
          
          // 画像を送信
          sendAnalysisRequest(croppedImageData, true, userMessage);
        }
        
        // クロップキャンセル
        function cancelCrop() {
          console.log('❌ Canceling crop');
          
          if (cropper) {
            cropper.destroy();
            cropper = null;
          }
          
          hideArea(cropArea);
          
          // プレビューボタンを元の状態に戻す
          const btnStartCrop = document.getElementById('btnStartCrop');
          const btnSendDirect = document.getElementById('btnSendDirect');
          
          if (btnStartCrop) {
            btnStartCrop.innerHTML = '<i class="fas fa-crop" style="margin-right: 0.5rem;"></i>🔲 この範囲で解析';
            btnStartCrop.disabled = false;
            btnStartCrop.style.opacity = '1';
          }
          
          if (btnSendDirect) {
            btnSendDirect.innerHTML = '<i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>📤 そのまま送信';
            btnSendDirect.style.display = 'flex'; // 再表示
          }
          
          // メッセージも戻す
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            imageMessageInput.value = cropMessageInput.value;
          }
          
          showImagePreview();
        }
        
        // エリア表示/非表示ヘルパー
        function showArea(element) {
          if (element) {
            element.style.display = 'block';
          }
        }
        
        function hideArea(element) {
          if (element) {
            element.style.display = 'none';
          }
        }
        
        // 直接送信
        function sendDirectly() {
          console.log('📤 Sending directly');
          
          if (previewImage && previewImage.src) {
            // メッセージ入力欄から値を取得
            const messageInput = document.getElementById('imageMessageInput');
            const userMessage = messageInput ? messageInput.value.trim() : '';
            
            sendAnalysisRequest(previewImage.src, false, userMessage);
          }
        }
        
        // ログイン処理
        async function handleLogin() {
          console.log('🔑 Login attempt started');
          
          try {
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            console.log('🔍 Credentials:', { appkey, sid });
            
            // Validate input fields
            if (!appkey || !sid) {
              throw new Error('APP_KEY と Student ID を両方入力してください');
            }
            
            // Call the actual login API
            const response = await fetch('/api/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                appkey: appkey,
                sid: sid
              })
            });
            
            console.log('📡 Login response:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('📋 Login data:', data);
            
            if (response.ok && data.success) {
              authenticated = true;
              alert('✅ ログイン成功!' + String.fromCharCode(10) + 
                    'APP_KEY: ' + appkey + String.fromCharCode(10) + 
                    'Student ID: ' + sid);
            } else {
              authenticated = false;
              throw new Error(data.message || 'ログインに失敗しました');
            }
          } catch (error) {
            console.error('❌ Login error:', error);
            authenticated = false;
            alert('❌ ログインエラー: ' + error.message);
          }
        }
        
        // 解析リクエスト送信（段階学習システム対応版）
        async function sendAnalysisRequest(imageData, cropped, userMessage = '') {
          console.log('📤 Sending analysis request, cropped:', cropped, 'message:', userMessage);
          
          if (!authenticated) {
            alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
            return;
          }
          
          showUploadingIndicator(true);
          
          try {
            // DataURLから実際のファイルデータを取得
            const response = await fetch(imageData);
            const blob = await response.blob();
            
            // FormDataを作成
            const formData = new FormData();
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            formData.append('image', blob, 'image.jpg');
            formData.append('appkey', appkey);
            formData.append('sid', sid);
            if (userMessage) {
              formData.append('message', userMessage);
            }
            
            console.log('📤 Sending to /api/analyze-and-learn with FormData');
            
            // 段階学習APIエンドポイントに送信
            const apiResponse = await fetch('/api/analyze-and-learn', {
              method: 'POST',
              body: formData,
              headers: {
                'Accept': 'application/json'
              }
            });
            
            console.log('📡 API Response:', apiResponse.status, apiResponse.statusText);
            
            if (!apiResponse.ok) {
              throw new Error('HTTP ' + apiResponse.status + ': ' + apiResponse.statusText);
            }
            
            const result = await apiResponse.json();
            console.log('📋 Analysis result:', result);
            
            if (result.ok) {
              // 段階学習システムを開始
              startLearningSystem(result);
            } else {
              throw new Error(result.message || 'API解析でエラーが発生しました');
            }
            
            showUploadingIndicator(false);
            
          } catch (error) {
            console.error('❌ Analysis error:', error);
            alert('❌ 解析エラー: ' + error.message);
            showUploadingIndicator(false);
          }
        }
        
        // 解析結果表示（生徒向け簡潔表示）
        function displayAnalysisResult(result) {
          const analysisResult = document.getElementById('analysisResult');
          const analysisContent = document.getElementById('analysisContent');
          
          if (analysisContent) {
            // 生徒向けの簡潔で励ましのメッセージのみ表示
            const studentMessage = 
              '<div style="font-size: 0.9rem; color: #374151;">' +
                '<strong>📋 問題を分析しました！</strong><br>' +
                (result.subject || '学習') + 'の問題ですね。<br>' +
                '段階的に一緒に解いていきましょう！' +
              '</div>' +
              // Phase1改善: 再生成タイプ選択UI
              '<div style="margin-top: 1rem; padding: 1rem; background: rgba(245,158,11,0.1); border-radius: 0.75rem; border: 1px solid #f59e0b;">' +
                '<div style="text-align: center; margin-bottom: 0.75rem;">' +
                  '<h4 style="margin: 0; color: #f59e0b; font-size: 0.9rem;">🎯 どのような問題に挑戦したいですか？</h4>' +
                  '<p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: #666;">バンコクで頑張っているあなたを応援します ✨</p>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">' +
                  '<button onclick="regenerateProblem(\\'similar\\')" ' +
                  'style="background: #10b981; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🔄 同じような問題' +
                  '</button>' +
                  '<button onclick="regenerateProblem(\\'approach\\')" ' +
                  'style="background: #3b82f6; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🎯 違うアプローチ' +
                  '</button>' +
                '</div>' +
                '<div style="text-align: center;">' +
                  '<button onclick="regenerateProblem(\\'full\\')" id="regenerateButton" ' +
                  'style="background: #f59e0b; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; font-weight: 500;">' +
                  '<i class="fas fa-sync-alt" style="margin-right: 0.5rem;"></i>完全に新しいパターン' +
                  '</button>' +
                '</div>' +
              '</div>';
            analysisContent.innerHTML = studentMessage;
            
            if (analysisResult) {
              analysisResult.style.display = 'block';
            }
          }
          
          // 詳細分析は内部ログのみ（生徒には非表示）
          if (result.analysis) {
            console.log('🔍 詳細分析結果（内部用）:', result.analysis);
          }
        }
        
        // アップロード中インジケーター
        function showUploadingIndicator(show) {
          const indicator = document.getElementById('uploadingIndicator');
          if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
          }
        }
        
        // === 段階学習システム ===
        
        let currentSession = null;
        
        // 段階学習システム開始
        function startLearningSystem(result) {
          console.log('📚 Starting learning system with session:', result.sessionId);
          
          currentSession = result;
          
          // 解析結果を表示
          displayAnalysisResult(result);
          
          // 最初のステップを表示
          displayLearningStep(result);
          
          // AI質問ボタンを表示
          showAIQuestionButton();
        }
        
        // 段階学習ステップ表示
        function displayLearningStep(result) {
          console.log('📚 Displaying learning step:', result.currentStep.stepNumber);
          console.log('🔍 Step details:', {
            stepNumber: result.currentStep.stepNumber,
            instruction: result.currentStep.instruction,
            type: result.currentStep.type,
            options: result.currentStep.options,
            optionsLength: result.currentStep.options ? result.currentStep.options.length : 'undefined'
          });
          
          const out = document.getElementById('out');
          if (!out) return;
          
          const step = result.currentStep;
          
          let stepHtml = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f0f9ff, #ffffff); border: 2px solid #0369a1; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          stepHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          stepHtml += '<div style="background: #0369a1; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + (step.stepNumber + 1) + '</div>';
          stepHtml += '<h3 style="margin: 0; color: #0369a1;">📚 Step ' + (step.stepNumber + 1) + ' / ' + result.totalSteps + '</h3>';
          stepHtml += '</div>';
          
          stepHtml += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + step.instruction + '</p>';
          
          if (step.type === 'choice') {
            // 選択肢が存在しない場合のフォールバック処理
            if (!step.options || !Array.isArray(step.options) || step.options.length === 0) {
              console.error('❌ No options found for choice step, creating fallback options');
              step.options = [
                "A) 選択肢が読み込めませんでした",
                "B) もう一度お試しください", 
                "C) システムエラーが発生しています",
                "D) 管理者にお知らせください"
              ];
              step.correctAnswer = "A";
            }
            
            stepHtml += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < step.options.length; i++) {
              stepHtml += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              stepHtml += '<input type="radio" name="stepChoice" value="' + step.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              stepHtml += '<span style="display: inline; font-weight: 500;">' + step.options[i] + '</span>';
              stepHtml += '</label>';
            }
            stepHtml += '</div>';
            
            stepHtml += '<button onclick="submitStepAnswer()" ';
            stepHtml += 'style="background: #0369a1; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            stepHtml += '📝 回答する</button>';
          }
          
          stepHtml += '</div>';
          
          out.innerHTML = stepHtml;
        }
        
        // ステップ回答送信
        async function submitStepAnswer() {
          const selectedOption = document.querySelector('input[name="stepChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          const currentStep = currentSession.currentStep;
          
          console.log('📝 Step answer submitted:', answer, 'stepNumber:', currentStep.stepNumber);
          
          try {
            // ステップ回答チェックAPIを呼び出し
            const response = await fetch('/api/step/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                stepNumber: currentStep.stepNumber,
                answer: answer
              })
            });
            
            console.log('📡 Step check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Step check result:', result);
            
            if (result.ok) {
              // 回答結果に応じて次のアクションを決定
              if (result.isCorrect) {
                displayStepResult(true, result.feedback, answer);
                
                // 次のアクションに応じて処理を分岐
                if (result.nextAction === 'next_step') {
                  // 次のステップがある場合
                  setTimeout(() => {
                    currentSession.currentStep = result.nextStep;
                    displayLearningStep(currentSession);
                  }, 3000);
                } else if (result.nextAction === 'confirmation') {
                  // 確認問題に進む場合
                  setTimeout(() => {
                    currentSession.confirmationProblem = result.confirmationProblem;
                    startConfirmationProblem();
                  }, 3000);
                }
              } else {
                // 不正解の場合
                displayStepResult(false, result.feedback, answer);
              }
            } else {
              throw new Error(result.message || 'ステップチェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Step check error:', error);
            alert('❌ ステップチェックエラー: ' + error.message);
          }
        }
        
        // ステップ結果表示
        function displayStepResult(isCorrect, explanation, userAnswer) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let resultHtml = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            resultHtml += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #16a34a; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✓</div>';
            resultHtml += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 正解です！よくできました！</h4>';
            resultHtml += '</div>';
          } else {
            resultHtml += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #dc2626; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✗</div>';
            resultHtml += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📖 もう一度考えてみましょう</h4>';
            resultHtml += '</div>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.currentStep.correctAnswer + '</p>';
          }
          
          resultHtml += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          resultHtml += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          resultHtml += '</div>';
          
          if (isCorrect) {
            // 正解時は既にsubmitStepAnswerでAPIからの指示に従って自動処理されている
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<div style="display: inline-flex; align-items: center; gap: 0.5rem; color: #16a34a; font-weight: 500;">';
            resultHtml += '<div class="loading-spinner" style="width: 16px; height: 16px;"></div>';
            resultHtml += '<span>次のステップを準備しています...</span>';
            resultHtml += '</div>';
            resultHtml += '</div>';
          } else {
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<button onclick="retryCurrentStep()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            resultHtml += '</div>';
          }
          
          resultHtml += '</div>';
          out.innerHTML = resultHtml;
        }
        
        // 次のステップに進む（APIレスポンスから自動的に処理される）
        function goToNextStep() {
          console.log('📚 Moving to next step - handled by API response');
          // この関数はAPIレスポンスで自動的に処理されるため、
          // 特別な処理は不要（既にsubmitStepAnswerで処理済み）
        }
        
        // 現在のステップを再試行
        function retryCurrentStep() {
          console.log('🔄 Retrying current step');
          displayLearningStep(currentSession);
        }
        
        // 確認問題開始
        function startConfirmationProblem() {
          console.log('🎯 Starting confirmation problem');
          displayConfirmationProblem();
        }
        
        // 確認問題表示
        function displayConfirmationProblem() {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problem = currentSession.confirmationProblem;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #ffffff); border: 2px solid #d97706; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #d97706; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">?</div>';
          html += '<h3 style="margin: 0; color: #d97706; font-size: 1.25rem;">🎯 確認問題</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #fefce8; border: 2px solid #fde68a; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="confirmChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitConfirmationAnswer()" ';
            html += 'style="background: #d97706; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '🎯 確認問題を解く</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // 確認問題回答送信
        async function submitConfirmationAnswer() {
          const selectedOption = document.querySelector('input[name="confirmChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          
          console.log('🎯 Confirmation answer submitted:', answer);
          
          try {
            // 確認問題回答チェックAPIを呼び出し
            const response = await fetch('/api/confirmation/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                answer: answer
              })
            });
            
            console.log('📡 Confirmation check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Confirmation check result:', result);
            
            if (result.ok) {
              displayConfirmationResult(result.isCorrect, result.feedback, answer, result.nextAction);
            } else {
              throw new Error(result.message || '確認問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Confirmation check error:', error);
            alert('❌ 確認問題チェックエラー: ' + error.message);
          }
        }
        
        // 確認問題結果表示
        function displayConfirmationResult(isCorrect, explanation, userAnswer, nextAction) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">🎉</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🏆 確認問題正解！素晴らしいです！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 確認問題：もう少し復習しましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.confirmationProblem.correctAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'similar_problems') {
              // 類似問題フェーズに移行
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🚀 次は類似問題にチャレンジしましょう！</p>';
              html += '<button onclick="startSimilarProblems()" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">📚 類似問題を始める</button>';
              html += '</div>';
            } else {
              // 従来の完了メッセージ
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🎊 学習完了！お疲れさまでした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displayConfirmationProblem()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // === 類似問題システム ===
        
        let currentSimilarProblem = 0;
        
        // 類似問題開始
        async function startSimilarProblems() {
          console.log('🔥 Starting similar problems');
          console.log('📋 Current session:', currentSession);
          
          if (!currentSession) {
            console.error('❌ No current session found');
            alert('❌ セッションが見つかりません。最初からやり直してください。');
            return;
          }
          
          // デバッグ用：サーバーからセッションデータを確認
          try {
            const debugResponse = await fetch('/api/debug/session/' + currentSession.sessionId);
            const debugData = await debugResponse.json();
            console.log('🔍 Server session debug:', debugData);
          } catch (error) {
            console.error('❌ Debug fetch error:', error);
          }
          
          // セッションデータの構造をチェック
          console.log('📋 Session keys:', Object.keys(currentSession));
          console.log('📋 Has similarProblems:', !!currentSession.similarProblems);
          console.log('📋 similarProblems type:', typeof currentSession.similarProblems);
          console.log('📋 similarProblems value:', currentSession.similarProblems);
          
          if (!currentSession.analysis) {
            console.error('❌ No analysis data found');
            alert('❌ 学習データが見つかりません。最初からやり直してください。');
            return;
          }
          
          if (!currentSession.similarProblems) {
            console.error('❌ No similar problems found');
            console.log('📋 Session structure:', currentSession);
            alert('❌ 類似問題データが見つかりません。最初からやり直してください。');
            return;
          }
          
          console.log('📚 Similar problems found:', currentSession.similarProblems.length);
          currentSimilarProblem = 0;
          displaySimilarProblem(1);
        }
        
        // 類似問題表示
        function displaySimilarProblem(problemNumber) {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problems = currentSession.similarProblems;
          const problem = problems[problemNumber - 1];
          
          if (!problem) {
            console.error('❌ Similar problem not found:', problemNumber);
            return;
          }
          
          currentSimilarProblem = problemNumber;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f3e8ff, #ffffff); border: 2px solid #7c3aed; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #7c3aed; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + problemNumber + '</div>';
          html += '<h3 style="margin: 0; color: #7c3aed; font-size: 1.25rem;">📚 類似問題 ' + problemNumber + '/' + problems.length + '</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem; white-space: pre-wrap;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            // 選択肢問題
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #faf5ff; border: 2px solid #e9d5ff; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="similarChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
            
          } else if (problem.type === 'input') {
            // 記述問題
            html += '<div style="margin-bottom: 1.5rem;">';
            html += '<textarea id="similarInput" placeholder="ここに答えを入力してください..." ';
            html += 'style="width: 100%; padding: 1rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>';
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // 類似問題回答送信
        async function submitSimilarAnswer() {
          const problems = currentSession.similarProblems;
          const problem = problems[currentSimilarProblem - 1];
          let answer = '';
          
          if (problem.type === 'choice') {
            const selectedOption = document.querySelector('input[name="similarChoice"]:checked');
            if (!selectedOption) {
              alert('❌ 選択肢を選んでください');
              return;
            }
            answer = selectedOption.value;
          } else if (problem.type === 'input') {
            const inputElement = document.getElementById('similarInput');
            if (!inputElement || !inputElement.value.trim()) {
              alert('❌ 答えを入力してください');
              return;
            }
            answer = inputElement.value.trim();
          }
          
          console.log('📚 Similar answer submitted:', { problemNumber: currentSimilarProblem, answer });
          
          try {
            // 類似問題回答チェックAPIを呼び出し
            const response = await fetch('/api/similar/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                problemNumber: currentSimilarProblem,
                answer: answer
              })
            });
            
            console.log('📡 Similar check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Similar check result:', result);
            
            if (result.ok) {
              displaySimilarResult(result.isCorrect, result.feedback, answer, result.nextAction, result.completedProblems, result.totalProblems);
            } else {
              throw new Error(result.message || '類似問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Similar check error:', error);
            alert('❌ 類似問題チェックエラー: ' + error.message);
          }
        }
        
        // 類似問題結果表示
        function displaySimilarResult(isCorrect, explanation, userAnswer, nextAction, completedProblems, totalProblems) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">✅</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 類似問題' + currentSimilarProblem + '正解！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 類似問題' + currentSimilarProblem + '：もう一度考えてみましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6; white-space: pre-wrap;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          // 進捗表示
          html += '<div style="background: rgba(124,58,237,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; font-weight: 500; color: #7c3aed;">📊 進捗: ' + completedProblems + '/' + totalProblems + '問正解</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'next_problem') {
              // 次の類似問題に進む
              html += '<div style="text-align: center;">';
              html += '<button onclick="displaySimilarProblem(' + (currentSimilarProblem + 1) + ')" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">➡️ 次の類似問題へ</button>';
              html += '</div>';
            } else if (nextAction === 'all_completed') {
              // すべての類似問題完了
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a; font-weight: 600; font-size: 1.1rem;">🎊 すべての類似問題が完了しました！お疲れ様でした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displaySimilarProblem(' + currentSimilarProblem + ')" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }

        // === AI質問システム ===
        
        // AI質問ボタンの表示制御
        function showAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton && currentSession) {
            aiButton.style.display = 'block';
          }
        }
        
        function hideAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton) {
            aiButton.style.display = 'none';
          }
        }
        
        // AI質問ウインドウを開く
        function openAIChat() {
          console.log('🤖 Opening AI chat window (direct mode) - V2 Simple Version');
          
          // 汎用的なセッションIDを生成
          const directSessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          
          // 新しいウインドウでAIチャットを開く（V2版：シンプルで安定した実装）
          const windowFeatures = 'width=800,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat-v2/' + directSessionId, 'ai-chat-v2', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }
        
        // 学習セッション無しでAIチャットを開く（メインボタン用）
        function openAIChatDirect() {
          console.log('🤖 Opening direct AI chat window - V2 Simple Version');
          
          // 汎用的なセッションIDを生成
          const directSessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          
          // 新しいウインドウでAIチャットを開く（V2版：シンプルで安定した実装）
          const windowFeatures = 'width=800,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat-v2/' + directSessionId, 'ai-chat-v2', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ブラウザの設定でポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }

        // === 問題再生成機能（Step 2: フロントエンド実装） ===
        
        // 問題再生成関数
        async function regenerateProblem(regenerationType = 'full') {
          console.log('🔄 Regenerate problem called, type:', regenerationType);
          
          if (!authenticated) {
            alert('❌ ログインが必要です');
            return;
          }
          
          if (!currentSession) {
            alert('❌ 学習セッションが見つかりません');
            return;
          }
          
          // 全ての再生成ボタンを無効化してローディング表示
          const buttons = document.querySelectorAll('[onclick*="regenerateProblem"]');
          const originalButtonStates = [];
          
          buttons.forEach((button, index) => {
            originalButtonStates[index] = {
              innerHTML: button.innerHTML,
              disabled: button.disabled
            };
            button.disabled = true;
            
            // ボタンタイプに応じたローディング表示
            if (button.innerHTML.includes('同じような問題')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else if (button.innerHTML.includes('違うアプローチ')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.5rem; width: 16px; height: 16px;"></div>再生成中...';
            }
          });
          
          try {
            console.log('🔄 Sending regeneration request for session:', currentSession.sessionId);
            
            const response = await fetch('/api/regenerate-problem', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                regenerationType: regenerationType
              })
            });
            
            console.log('📡 Regeneration response status:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Regeneration result:', result);
            
            if (result.ok) {
              // セッション情報を更新
              currentSession.analysis = result.analysis;
              currentSession.steps = result.steps;
              currentSession.confirmationProblem = result.confirmationProblem;
              currentSession.similarProblems = result.similarProblems;
              currentSession.currentStep = result.currentStep;
              
              // 成功時はボタンを元の状態に戻す
              buttons.forEach((button, index) => {
                if (originalButtonStates[index]) {
                  button.innerHTML = originalButtonStates[index].innerHTML;
                  button.disabled = originalButtonStates[index].disabled;
                }
              });
              
              // 学習システムを新しいデータで再開
              alert('✅ 新しいパターンの問題を生成しました！');
              displayLearningStep(result);
              
              return; // 成功時はreturnして、finallyブロックの実行を回避
            } else {
              throw new Error(result.message || '再生成に失敗しました');
            }
            
          } catch (error) {
            console.error('❌ Regeneration error:', error);
            
            // Step 4: エラーハンドリング強化 - より詳細で分かりやすいエラーメッセージ
            let errorMessage = '❌ 問題の再生成に失敗しました';
            
            if (error.message.includes('HTTP 500')) {
              errorMessage = '❌ AI機能に問題が発生しています。少し時間をおいてから再度お試しください。';
            } else if (error.message.includes('HTTP 404')) {
              errorMessage = '❌ 学習セッションが見つかりません。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('HTTP 400')) {
              errorMessage = '❌ リクエストに問題があります。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
              errorMessage = '❌ ネットワーク接続に問題があります。インターネット接続を確認してください。';
            } else if (error.message.includes('timeout')) {
              errorMessage = '❌ 処理に時間がかかりすぎています。もう一度お試しください。';
            } else {
              errorMessage = '❌ 問題の再生成に失敗しました。もう一度お試しいただくか、ページを更新してください。';
            }
            
            alert(errorMessage + String.fromCharCode(10) + String.fromCharCode(10) + '（エラー詳細: ' + error.message + '）');
          } finally {
            // 全てのボタンを元の状態に戻す
            buttons.forEach((button, index) => {
              if (originalButtonStates[index]) {
                button.innerHTML = originalButtonStates[index].innerHTML;
                button.disabled = originalButtonStates[index].disabled;
                button.style.display = 'inline-block'; // エラー時もボタンを再表示
              }
            });
          }
        }

        // === Study Partner Camera Functions ===
        let streamSP = null;
        let capturedImageDataSP = '';
        let cropperSP = null;
        
        async function startCamera() {
          try {
            console.log('📷 Starting Study Partner camera...');
            const preview = document.getElementById('cameraPreviewSP');
            if (!preview) {
              console.error('❌ Camera preview element not found');
              return;
            }
            
            streamSP = await navigator.mediaDevices.getUserMedia({ 
              video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } } 
            });
            preview.srcObject = streamSP;
            preview.play();
            
            document.getElementById('captureBtnSP').classList.remove('hidden');
            console.log('✅ Camera started successfully');
          } catch (error) {
            console.error('❌ Camera error:', error);
            alert('カメラの起動に失敗しました。\\nブラウザの設定でカメラへのアクセスを許可してください。');
            closeCameraSP();
          }
        }
        
        function capturePhotoSP() {
          const preview = document.getElementById('cameraPreviewSP');
          if (preview.videoWidth === 0) {
            alert('カメラの準備ができていません。');
            return;
          }
          
          const canvas = document.createElement('canvas');
          canvas.width = preview.videoWidth;
          canvas.height = preview.videoHeight;
          canvas.getContext('2d').drawImage(preview, 0, 0);
          capturedImageDataSP = canvas.toDataURL('image/jpeg', 0.9);
          
          if (streamSP) {
            streamSP.getTracks().forEach(track => track.stop());
            streamSP = null;
          }
          
          document.getElementById('cameraPreviewSP').classList.add('hidden');
          const img = document.getElementById('capturedImageSP');
          img.src = capturedImageDataSP;
          img.classList.remove('hidden');
          
          document.getElementById('captureBtnSP').classList.add('hidden');
          document.getElementById('retakeBtnSP').classList.remove('hidden');
          document.getElementById('cropBtnSP').classList.remove('hidden');
          document.getElementById('uploadBtnSP').classList.remove('hidden');
        }
        
        function retakePhotoSP() {
          document.getElementById('capturedImageSP').classList.add('hidden');
          document.getElementById('retakeBtnSP').classList.add('hidden');
          document.getElementById('cropBtnSP').classList.add('hidden');
          document.getElementById('uploadBtnSP').classList.add('hidden');
          startCamera();
        }
        
        function showCropInterfaceSP() {
          alert('クロップ機能は開発中です。現在の画像をそのまま使用します。');
        }
        
        function applyCropSP() {
          // クロップ適用（今は何もしない）
        }
        
        async function uploadAndProcessImageSP() {
          if (!capturedImageDataSP) {
            alert('画像がありません');
            return;
          }
          
          closeCameraSP();
          
          // 画像をプレビューエリアに表示
          if (previewImage) {
            previewImage.src = capturedImageDataSP;
            showImagePreview();
          }
          
          alert('画像を選択しました。「送信」ボタンを押してOCR処理を開始してください。');
        }
        
        function closeCameraSP() {
          if (streamSP) {
            streamSP.getTracks().forEach(track => track.stop());
            streamSP = null;
          }
          
          const modal = document.getElementById('cameraModal');
          if (modal) {
            modal.style.display = 'none';
          }
          
          // Reset UI
          document.getElementById('cameraPreviewSP').classList.remove('hidden');
          document.getElementById('capturedImageSP').classList.add('hidden');
          document.getElementById('captureBtnSP').classList.remove('hidden');
          document.getElementById('retakeBtnSP').classList.add('hidden');
          document.getElementById('cropBtnSP').classList.add('hidden');
          document.getElementById('uploadBtnSP').classList.add('hidden');
        }

        console.log('✅ Study Partner JavaScript loaded successfully');
        </script>
    </body>
    </html>
  `)
})

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
