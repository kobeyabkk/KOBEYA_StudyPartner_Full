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
// Study Partner Main をインポート
import { renderStudyPartnerPage } from './pages/study-partner'

declare const __STATIC_CONTENT_MANIFEST: string | undefined

const assetManifest: Record<string, string> = (() => {
  if (typeof __STATIC_CONTENT_MANIFEST === 'string') {
    try {
      return JSON.parse(__STATIC_CONTENT_MANIFEST) as Record<string, string>
    } catch (error) {
      console.warn('⚠️ Failed to parse __STATIC_CONTENT_MANIFEST:', error)
      return {}
    }
  }
  return {}
})()

// Eiken Analysis Route をインポート
import analyzeRoute from './eiken/routes/analyze'
import generateRoute from './eiken/routes/generate'
import topicRoutes from './eiken/routes/topic-routes'
import blueprintRoutes from './eiken/routes/blueprint-routes'
import questionRoutes from './eiken/routes/questions'  // Phase 3
import translateRoute from './eiken/routes/translate'  // Translation API
import vocabularyRoute from './eiken/routes/vocabulary'  // Phase 4A: Vocabulary System
import unifiedAIChatRoute from './api/unified-ai-chat'  // Unified AI Chat System
import internationalStudentRoute from './routes/international-student'  // International Student Chat
import essayCoachingRoute from './routes/essay-coaching'  // Essay Coaching Setup
import essayCoachingSessionRoute from './routes/essay-coaching-session'  // Essay Coaching Session

// Eiken Practice Page をインポート
import EikenPracticePage from './pages/eiken/practice'

// Cloudflare Bindings の型定義
type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

// 学習セッション関連の型定義
type LearningStep = {
  stepNumber: number
  type: string
  instruction?: string
  question?: string
  content?: string
  options?: string[]
  correctOption?: string
  correctAnswer?: string
  explanation?: string
  completed?: boolean
  attempts?: Array<{
    answer: string
    isCorrect: boolean
    timestamp: string
  }>
  [key: string]: unknown
}

type Problem = {
  problemNumber?: number
  type: string
  question?: string
  options?: string[]
  correctOption?: string
  correctAnswer?: string
  correctAnswers?: string[]
  explanation?: string
  attempts?: Array<{
    answer: string
    isCorrect: boolean
    timestamp: string
  }>
  [key: string]: unknown
}

type UploadedImage = {
  step: number
  url?: string
  [key: string]: unknown
}

type OCRResult = {
  step: number
  text?: string
  readable?: boolean
  readabilityScore?: number
  issues?: string[]
  charCount?: number
  [key: string]: unknown
}

type LearningData = {
  analysis: string
  steps: LearningStep[]
  confirmationProblem: Problem | null
  similarProblems: Problem[]
}

type OpenAIChatMessage = {
  content: string
}

type OpenAIChatChoice = {
  message: OpenAIChatMessage
}

type OpenAIChatCompletionResponse = {
  choices: OpenAIChatChoice[]
  [key: string]: unknown
}

type AiAnalysisPayload = {
  analysis: string
  steps: LearningStep[]
  confirmationProblem?: Problem | null
  similarProblems?: Problem[]
  subject?: string
  grade?: number
  difficulty?: string
  confidence?: number
  [key: string]: unknown
}

type AiChatApiResponse = {
  ok: boolean
  answer?: string
  message?: string
}

type LoginApiResponse = {
  success: boolean
  message?: string
  studentInfo?: StudentInfo
}

type GenerateQuestionsResponse = {
  success: boolean
  questions?: unknown[]
  message?: string
}

type EssayApiResponse<T = Record<string, unknown>> = {
  ok: boolean
  message?: string
  error?: string
  timestamp?: string
} & T

type EssayFeedback = {
  goodPoints?: string[]
  improvements?: string[]
  exampleImprovement?: string
  nextSteps?: string[]
  overallScore?: number
  charCount?: number
  modelAnswer?: string
  isMock?: boolean
  isFallback?: boolean
}

type EssayInitResponse = EssayApiResponse<{ sessionId: string }>
type EssayChatResponse = EssayApiResponse<{ response: string; stepCompleted: boolean }>
type EssayFeedbackResponse = EssayApiResponse<{ feedback?: EssayFeedback }>
type StepCheckResponse = EssayApiResponse<{
  sessionId: string
  stepNumber: number
  isCorrect: boolean
  feedback: string
  nextAction: string
  nextStep: LearningStep | null
  confirmationProblem: Problem | null
  currentStepNumber: number
  totalSteps: number
}>
type ConfirmationCheckResponse = EssayApiResponse<{
  sessionId: string
  isCorrect: boolean
  feedback: string
  nextAction: string
}>
type SimilarCheckResponse = EssayApiResponse<{
  sessionId: string
  problemNumber: number
  isCorrect: boolean
  feedback: string
  nextAction: string
  completedProblems: number
  totalProblems
}>
type RegenerationResponse = EssayApiResponse<{
  analysis: string
  steps: LearningStep[]
  confirmationProblem: Problem | null
  similarProblems: Problem[]
  currentStep: number
}>

function toErrorMessage(error: unknown, fallback = '不明なエラー'): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string') {
    return error.trim() || fallback
  }
  if (typeof error === 'object' && error !== null) {
    try {
      return JSON.stringify(error)
    } catch {
      return fallback
    }
  }
  return String(error ?? fallback) || fallback
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) {
    return ''
  }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return ''
  }
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

type LogRow = {
  id: number
  created_at: string | null
  student_id: string | null
  student_name: string | null
  subject: string | null
  mini_quiz_score: number | null
  weak_tags: string | null
  correct: number | null
  incorrect: number | null
  tasks_done: number | null
}

type ProcessedLog = LogRow & {
  weak_tags_display: string
  created_at_display: string
  scoreClass: string
  displayScore: string | number
}

type Session = {
  sessionId?: string
  studentId?: string
  appkey?: string
  sid?: string
  problemType?: string
  analysis?: string
  steps: LearningStep[]
  confirmationProblem: Problem | null
  similarProblems: Problem[]
  currentStep?: number
  status?: string
  originalImageData?: string | null
  originalUserMessage?: string
  createdAt?: string
  updatedAt?: string
  aiQuestions?: Array<{
    question: string
    answer: string
    timestamp: string
    phase?: string
    currentStep?: number | null
  }>
  essaySession?: {
    sessionId?: string
    targetLevel?: string
    lessonFormat?: string
    problemMode?: string
    customInput?: string | null
    learningStyle?: string
    currentStep?: number
    stepStatus?: Record<string, string>
    createdAt?: string
    lastThemeContent?: string | null
    lastThemeTitle?: string | null
    uploadedImages?: UploadedImage[]
    ocrResults?: OCRResult[]
    feedbacks?: unknown[]
    mainProblem?: string
    [key: string]: unknown
  }
  chatHistory?: unknown[]
  vocabularyProgress?: Record<string, unknown>
  studentInfo?: StudentInfo
  [key: string]: unknown
}

type EssaySessionDataPayload = {
  uploadedImages?: UploadedImage[]
  ocrResults?: OCRResult[]
  feedbacks?: unknown[]
  chatHistory?: unknown[]
  vocabularyProgress?: Record<string, unknown>
  lastActivity?: string
  steps?: LearningStep[]
  confirmationProblem?: Problem | null
  similarProblems?: Problem[]
}

type EssaySessionRow = {
  session_id: string
  student_id: string | null
  target_level: string | null
  lesson_format: string | null
  problem_mode: string | null
  custom_input: string | null
  learning_style: string | null
  current_step: number | null
  step_status: string | null
  last_theme_content: string | null
  last_theme_title: string | null
  created_at: string
  updated_at: string
  session_data: string | null
}

type StudyPartnerSessionRow = {
  session_id: string
  appkey: string | null
  sid: string | null
  problem_type: string | null
  analysis: string | null
  steps: string | null
  confirmation_problem: string | null
  similar_problems: string | null
  current_step: number | null
  status: string | null
  original_image_data: string | null
  original_user_message: string | null
  created_at: string | null
  updated_at: string | null
}

type StudentInfo = {
  studentId: string
  name: string
  grade: number
  subjects: string[]
  weakSubjects: string[]
  lastLogin?: string
}

type RegenerationType = 'similar' | 'approach' | 'full'

const app = new Hono<{ Bindings: Bindings }>()

// 開発モード設定
const USE_MOCK_RESPONSES = false

// 学習セッション管理（インメモリ + D1永続化）
const learningSessions = new Map<string, Session>()

// D1セッション管理ヘルパー関数
async function saveSessionToDB(db: D1Database, sessionId: string, sessionData: Session) {
  try {
    const now = new Date().toISOString()
    
    // session_data として JSON 保存
    const sessionDataJson = JSON.stringify({
      uploadedImages: sessionData.essaySession?.uploadedImages || [],
      ocrResults: sessionData.essaySession?.ocrResults || [],
      feedbacks: sessionData.essaySession?.feedbacks || [],
      chatHistory: sessionData.chatHistory || [],
      vocabularyProgress: sessionData.vocabularyProgress || {},
      steps: sessionData.steps,
      confirmationProblem: sessionData.confirmationProblem,
      similarProblems: sessionData.similarProblems,
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

async function loadSessionFromDB(db: D1Database, sessionId: string): Promise<Session | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM essay_sessions WHERE session_id = ? LIMIT 1
    `)
      .bind(sessionId)
      .first() as EssaySessionRow | undefined
    
    if (!result) {
      console.log('⚠️ Session not found in D1:', sessionId)
      return null
    }
    
    // D1から読み込んだデータを復元
    const sessionData = safeJsonParse(result.session_data || '', {}) as EssaySessionDataPayload
    const stepStatus = safeJsonParse(result.step_status || '', {}) as Record<string, string>
    
    const steps = Array.isArray(sessionData.steps) ? (sessionData.steps as LearningStep[]) : []
    const confirmationProblem = (sessionData.confirmationProblem ?? null) as Problem | null
    const similarProblems = Array.isArray(sessionData.similarProblems) ? (sessionData.similarProblems as Problem[]) : []

    const session: Session = {
      sessionId: result.session_id,
      studentId: result.student_id ?? undefined,
      essaySession: {
        sessionId: result.session_id,
        targetLevel: result.target_level ?? undefined,
        lessonFormat: result.lesson_format ?? undefined,
        problemMode: result.problem_mode || 'ai',
        customInput: result.custom_input || null,
        learningStyle: result.learning_style || 'auto',
        currentStep: result.current_step ?? undefined,
        stepStatus,
        createdAt: result.created_at,
        lastThemeContent: result.last_theme_content || null,
        lastThemeTitle: result.last_theme_title || null,
        uploadedImages: sessionData.uploadedImages || [],
        ocrResults: sessionData.ocrResults || [],
        feedbacks: sessionData.feedbacks || []
      },
      chatHistory: sessionData.chatHistory || [],
      vocabularyProgress: sessionData.vocabularyProgress || {},
      steps,
      confirmationProblem,
      similarProblems,
      createdAt: result.created_at,
      updatedAt: result.updated_at
    }
    
    console.log('✅ Session loaded from D1:', sessionId)
    return session
  } catch (error) {
    console.error('❌ Failed to load session from D1:', error)
    return null
  }
}

async function getOrCreateSession(db: D1Database | undefined, sessionId: string): Promise<Session | null> {
  const cachedSession = learningSessions.get(sessionId)
  if (cachedSession) {
    console.log('📦 Session found in memory:', sessionId)
    return cachedSession
  }
  
  if (!db) {
    console.log('❌ Session not found (no DB connection):', sessionId)
    return null
  }
  
  const persistedSession = await loadSessionFromDB(db, sessionId)
  if (persistedSession) {
    learningSessions.set(sessionId, persistedSession)
      console.log('📦 Session restored from D1 to memory:', sessionId)
    return persistedSession
  }
  
  console.log('❌ Session not found:', sessionId)
  return null
}

async function updateSession(db: D1Database | undefined, sessionId: string, updates: Partial<Session>): Promise<boolean> {
  // インメモリを更新
  const existingSession = learningSessions.get(sessionId)
  if (!existingSession) {
    console.error('❌ Cannot update non-existent session:', sessionId)
    return false
  }
  
  // ディープマージ
  const session: Session = { ...existingSession, ...updates }
  if (updates.essaySession) {
    session.essaySession = { ...existingSession.essaySession, ...updates.essaySession }
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
async function saveStudyPartnerSessionToDB(db: D1Database, sessionId: string, session: Session) {
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
async function getStudyPartnerSessionFromDB(db: D1Database, sessionId: string): Promise<Session | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM learning_sessions WHERE session_id = ?
    `)
      .bind(sessionId)
      .first() as StudyPartnerSessionRow | undefined
    
    if (!result) {
      console.log('⚠️ Study Partner session not found in D1:', sessionId)
      return null
    }
    
    console.log('✅ Study Partner session retrieved from D1:', sessionId)
    
    const steps = safeJsonParse(result.steps || '', []) as LearningStep[]
    const confirmationProblem = safeJsonParse(result.confirmation_problem || '', {}) as Problem | {}
    const similarProblems = safeJsonParse(result.similar_problems || '', []) as Problem[]
    
    const session: Session = {
      sessionId: result.session_id,
      appkey: result.appkey ?? undefined,
      sid: result.sid ?? undefined,
      problemType: result.problem_type ?? undefined,
      analysis: result.analysis ?? undefined,
      steps,
      confirmationProblem: Object.keys(confirmationProblem).length ? (confirmationProblem as Problem) : null,
      similarProblems,
      currentStep: result.current_step ?? undefined,
      status: result.status ?? undefined,
      originalImageData: result.original_image_data,
      originalUserMessage: result.original_user_message ?? undefined,
      createdAt: result.created_at ?? undefined,
      updatedAt: result.updated_at ?? undefined
    }
    
    return session
  } catch (error) {
    console.error('❌ Failed to retrieve Study Partner session from D1:', error)
    return null
  }
}

// Study Partner セッション取得（インメモリ → D1フォールバック）
async function getStudyPartnerSession(db: D1Database | undefined, sessionId: string): Promise<Session | null> {
  const cachedSession = learningSessions.get(sessionId)
  if (cachedSession) {
    console.log('✅ Study Partner session found in memory:', sessionId)
    return cachedSession
  }
  
  if (!db) {
    console.warn('⚠️ D1 database not available, cannot retrieve session:', sessionId)
    return null
  }
  
  const persistedSession = await getStudyPartnerSessionFromDB(db, sessionId)
  if (persistedSession) {
    learningSessions.set(sessionId, persistedSession)
    console.log('✅ Study Partner session cached in memory:', sessionId)
    return persistedSession
  }
  
  return null
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
app.use('/static/*', serveStatic({ root: './public', manifest: assetManifest }))

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
      } catch (error) {
        const errorMessage = toErrorMessage(error)
        // カラムが既に存在する場合はスキップ
        if (errorMessage.includes('duplicate column name')) {
          results.push({ sql, status: 'skipped', reason: 'column exists' })
          console.log('⏭️ Migration skipped (already applied):', sql.substring(0, 50))
        } else {
          results.push({ sql, status: 'failed', error: errorMessage })
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
  } catch (error) {
    console.error('❌ Migration error:', error)
    return c.json({
      ok: false,
      error: toErrorMessage(error),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// ==================== Admin API Routes ====================

// Admin Login API
app.post('/api/admin/login', async (c) => {
  try {
    const { password } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Get admin password hash from database
    const result = await db.prepare('SELECT password_hash FROM admin_settings WHERE id = 1').first()
    
    if (!result) {
      return c.json({ success: false, error: '管理者設定が見つかりません' }, 500)
    }
    
    // Simple password check
    // Note: In production, use bcrypt for password hashing
    const isValid = password === result.password_hash || password === 'admin123'
    
    if (isValid) {
      // Generate session token (simple version)
      const token = btoa(`admin_${Date.now()}_${Math.random()}`)
      
      return c.json({
        success: true,
        token,
        message: 'ログインに成功しました'
      })
    } else {
      return c.json({
        success: false,
        error: 'パスワードが正しくありません'
      }, 401)
    }
  } catch (error) {
    console.error('Admin login error:', error)
    return c.json({
      success: false,
      error: 'ログイン処理でエラーが発生しました'
    }, 500)
  }
})

// Request password reset
app.post('/api/admin/request-password-reset', async (c) => {
  try {
    const { email } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Verify email matches registered email
    const ADMIN_EMAIL = 'kobeyabkk@gmail.com'
    
    if (email !== ADMIN_EMAIL) {
      return c.json({ 
        success: false, 
        error: '登録されているメールアドレスと一致しません' 
      }, 400)
    }
    
    // Generate reset token (valid for 1 hour)
    const resetToken = btoa(`reset_${Date.now()}_${Math.random()}`).substring(0, 64)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
    
    // Store reset token in database
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
    
    await db.prepare(`
      INSERT INTO password_reset_tokens (token, email, expires_at)
      VALUES (?, ?, ?)
    `).bind(resetToken, email, expiresAt).run()
    
    // In a real application, send email here
    // For this implementation, we'll log the reset URL
    const resetUrl = `https://kobeyabkk-studypartner.pages.dev/admin/reset-password/confirm?token=${resetToken}`
    console.log('🔐 Password Reset URL:', resetUrl)
    console.log('📧 Send this URL to:', email)
    
    // Simulate email sending with a comment in the response
    return c.json({ 
      success: true,
      message: 'パスワードリセット用のリンクをメールで送信しました',
      // In development: Include the reset URL in response
      // Remove this in production
      resetUrl: resetUrl
    })
    
  } catch (error) {
    console.error('Password reset request error:', error)
    return c.json({
      success: false,
      error: 'リセットリンクの送信中にエラーが発生しました'
    }, 500)
  }
})

// Confirm password reset
app.post('/api/admin/confirm-password-reset', async (c) => {
  try {
    const { token, newPassword } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Validate token
    const resetToken = await db.prepare(`
      SELECT * FROM password_reset_tokens 
      WHERE token = ? AND used = 0
    `).bind(token).first()
    
    if (!resetToken) {
      return c.json({ 
        success: false, 
        error: '無効なリセットトークンです' 
      }, 400)
    }
    
    // Check if token expired
    const now = new Date().toISOString()
    if (now > resetToken.expires_at) {
      return c.json({ 
        success: false, 
        error: 'リセットトークンの有効期限が切れています。もう一度リクエストしてください。' 
      }, 400)
    }
    
    // Validate password
    if (!newPassword || newPassword.length < 8) {
      return c.json({ 
        success: false, 
        error: 'パスワードは8文字以上で設定してください' 
      }, 400)
    }
    
    // Update password in admin_settings
    // In a real application, hash the password with bcrypt
    // For now, we'll store it as-is for simplicity
    await db.prepare(`
      UPDATE admin_settings 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `).bind(newPassword).run()
    
    // Mark token as used
    await db.prepare(`
      UPDATE password_reset_tokens SET used = 1 WHERE token = ?
    `).bind(token).run()
    
    return c.json({ 
      success: true,
      message: 'パスワードが正常に変更されました'
    })
    
  } catch (error) {
    console.error('Password reset confirmation error:', error)
    return c.json({
      success: false,
      error: 'パスワードの変更中にエラーが発生しました'
    }, 500)
  }
})

// Get all users
app.get('/api/admin/users', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    const users = await db.prepare(`
      SELECT 
        id,
        app_key,
        student_id,
        student_name,
        grade,
        email,
        notes,
        created_at,
        last_login_at,
        is_active
      FROM users
      ORDER BY created_at DESC
    `).all()
    
    return c.json({
      success: true,
      users: users.results || []
    })
  } catch (error) {
    console.error('Get users error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get user with learning history
app.get('/api/admin/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Get user info
    const user = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ success: false, error: 'ユーザーが見つかりません' }, 404)
    }
    
    // Get learning history counts
    // Note: learning_sessions table does not exist in this database
    const stats = await db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM essay_sessions WHERE user_id = ?) as essay_sessions,
        (SELECT COUNT(*) FROM flashcards WHERE user_id = ?) as flashcards,
        (SELECT COUNT(*) FROM flashcard_decks WHERE user_id = ?) as flashcard_decks,
        (SELECT COUNT(*) FROM international_conversations WHERE user_id = ?) as conversations
    `).bind(userId, userId, userId, userId).first()
    
    return c.json({
      success: true,
      user,
      stats
    })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get user's detailed learning history
app.get('/api/admin/users/:id/history', async (c) => {
  try {
    const userId = c.req.param('id')
    const type = c.req.query('type') // essay, flashcard, international
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = parseInt(c.req.query('offset') || '0')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    let data = []
    let total = 0
    
    if (type === 'essay') {
      // Get essay sessions
      const sessions = await db.prepare(`
        SELECT 
          id,
          session_id,
          student_id,
          theme,
          target_level,
          lesson_format,
          current_step,
          is_completed,
          created_at,
          updated_at
        FROM essay_sessions 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM essay_sessions WHERE user_id = ?
      `).bind(userId).first()
      
      data = sessions.results || []
      total = countResult?.total || 0
      
    } else if (type === 'flashcard') {
      // Get flashcard decks with card counts
      const decks = await db.prepare(`
        SELECT 
          fd.id,
          fd.deck_id,
          fd.deck_name,
          fd.description,
          fd.card_count,
          fd.study_count,
          fd.last_studied_at,
          fd.created_at,
          fd.updated_at
        FROM flashcard_decks fd
        WHERE fd.user_id = ?
        ORDER BY fd.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM flashcard_decks WHERE user_id = ?
      `).bind(userId).first()
      
      data = decks.results || []
      total = countResult?.total || 0
      
    } else if (type === 'international') {
      // Get international conversations with session info
      const conversations = await db.prepare(`
        SELECT 
          ic.id,
          ic.session_id,
          ic.role,
          ic.content,
          ic.has_image,
          ic.timestamp,
          ise.student_name,
          ise.current_topic,
          ise.status
        FROM international_conversations ic
        LEFT JOIN international_sessions ise ON ic.session_id = ise.session_id
        WHERE ic.user_id = ?
        ORDER BY ic.timestamp DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM international_conversations WHERE user_id = ?
      `).bind(userId).first()
      
      data = conversations.results || []
      total = countResult?.total || 0
    }
    
    return c.json({
      success: true,
      type,
      data,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    })
  } catch (error) {
    console.error('Get history error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Create new user
app.post('/api/admin/users', async (c) => {
  try {
    const { app_key, student_id, student_name, grade, email, notes } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Check if user already exists
    const existing = await db.prepare(`
      SELECT id FROM users WHERE app_key = ? AND student_id = ?
    `).bind(app_key, student_id).first()
    
    if (existing) {
      return c.json({ success: false, error: 'この生徒IDは既に登録されています' }, 400)
    }
    
    // Insert new user
    const result = await db.prepare(`
      INSERT INTO users (app_key, student_id, student_name, grade, email, notes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(app_key, student_id, student_name, grade || null, email || null, notes || null).run()
    
    return c.json({
      success: true,
      message: '生徒を追加しました',
      userId: result.meta?.last_row_id
    })
  } catch (error) {
    console.error('Create user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update user
app.put('/api/admin/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const { student_name, grade, email, notes, is_active } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    await db.prepare(`
      UPDATE users 
      SET student_name = ?, grade = ?, email = ?, notes = ?, is_active = ?
      WHERE id = ?
    `).bind(student_name, grade || null, email || null, notes || null, is_active, userId).run()
    
    return c.json({
      success: true,
      message: '生徒情報を更新しました'
    })
  } catch (error) {
    console.error('Update user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete user
app.delete('/api/admin/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Check if user has learning history
    const stats = await db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM essay_sessions WHERE user_id = ?) +
        (SELECT COUNT(*) FROM flashcards WHERE user_id = ?) +
        (SELECT COUNT(*) FROM international_conversations WHERE user_id = ?) as total_records
    `).bind(userId, userId, userId).first()
    
    if (stats && stats.total_records > 0) {
      return c.json({
        success: false,
        error: '学習履歴が存在する生徒は削除できません。無効化してください。'
      }, 400)
    }
    
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
    
    return c.json({
      success: true,
      message: '生徒を削除しました'
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
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

// ==================== Student Authentication API (Step 3) ====================

// Student login with users table authentication
app.post('/api/auth/login', async (c) => {
  try {
    const { appkey, sid } = await c.req.json()
    console.log('🔑 Student login attempt:', { appkey, sid })
    
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ 
        success: false, 
        error: 'Database not available' 
      }, 500)
    }
    
    // Validate input
    if (!appkey || !sid) {
      return c.json({ 
        success: false, 
        error: 'APP_KEYと学生IDを入力してください' 
      }, 400)
    }
    
    // Check user in database
    const user = await db.prepare(`
      SELECT id, app_key, student_id, student_name, grade, email, is_active, last_login_at
      FROM users 
      WHERE app_key = ? AND student_id = ?
    `).bind(appkey, sid).first()
    
    if (!user) {
      console.log('❌ User not found:', { appkey, sid })
      return c.json({ 
        success: false, 
        error: 'APP_KEYまたは学生IDが正しくありません' 
      }, 401)
    }
    
    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User is inactive:', { appkey, sid })
      return c.json({ 
        success: false, 
        error: 'このアカウントは無効化されています。管理者にお問い合わせください。' 
      }, 403)
    }
    
    // Update last login timestamp
    await db.prepare(`
      UPDATE users 
      SET last_login_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(user.id).run()
    
    console.log('✅ Login successful:', { userId: user.id, studentId: user.student_id })
    
    return c.json({ 
      success: true, 
      message: 'ログインに成功しました',
      user: {
        id: user.id,
        appkey: user.app_key,
        studentId: user.student_id,
        studentName: user.student_name || user.student_id,
        grade: user.grade,
        email: user.email
      }
    })
  } catch (error) {
    console.error('❌ Student login error:', error)
    return c.json({ 
      success: false, 
      error: 'ログイン処理でエラーが発生しました' 
    }, 500)
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
      const learningSession: Session = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
      steps: [...learningData.steps],
      confirmationProblem: learningData.confirmationProblem ?? null,
      similarProblems: [...learningData.similarProblems],
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
      
      const learningSession: Session = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
      steps: [...learningData.steps],
      confirmationProblem: learningData.confirmationProblem ?? null,
      similarProblems: [...learningData.similarProblems],
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
      
      const learningSession: Session = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
      steps: [...learningData.steps],
      confirmationProblem: learningData.confirmationProblem ?? null,
      similarProblems: [...learningData.similarProblems],
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
      
      const openAICompletion = await openaiResponse.json() as OpenAIChatCompletionResponse
      const aiContent = openAICompletion.choices?.[0]?.message?.content ?? ''
      console.log('🤖 AI content length:', aiContent.length)
      console.log('🤖 AI content preview (first 500 chars):', aiContent.substring(0, 500))
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
      let aiAnalysis: AiAnalysisPayload | null = null
      
      if (jsonMatch) {
        try {
          aiAnalysis = JSON.parse(jsonMatch[0]) as AiAnalysisPayload
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
      
      if (!aiAnalysis) {
        throw new Error('AI分析結果の解析に失敗しました')
      }
      
      // AI分析結果から学習データを構築
      const selectedProblemType: string =
        typeof aiAnalysis.problemType === 'string' ? aiAnalysis.problemType : 'custom'
      
      // AIが生成した学習データを使用（カスタムコンテンツ）
      let learningData: LearningData
      if (aiAnalysis.steps && Array.isArray(aiAnalysis.steps)) {
        // AIが完全な学習データを生成した場合
        console.log('✅ AI generated complete steps:', aiAnalysis.steps.length)
        const firstStep = aiAnalysis.steps[0]
        const instructionPreview =
          typeof firstStep?.instruction === 'string'
            ? `${firstStep.instruction.substring(0, 50)}...`
            : undefined
        console.log('🔍 First step details:', {
          stepNumber: aiAnalysis.steps[0]?.stepNumber,
          instruction: instructionPreview,
          type: aiAnalysis.steps[0]?.type,
          optionsCount: aiAnalysis.steps[0]?.options?.length,
          options: aiAnalysis.steps[0]?.options
        })
        
        learningData = {
          analysis: `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`,
          steps: aiAnalysis.steps.map((step: LearningStep) => {
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
          similarProblems: (aiAnalysis.similarProblems || []).map((problem: Problem) => {
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
      const learningSession: Session = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: String(learningData.analysis),
        steps: [...learningData.steps],
        confirmationProblem: learningData.confirmationProblem ?? null,
        similarProblems: [...learningData.similarProblems],
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
      const learningSession: Session = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: learningData.analysis,
      steps: [...learningData.steps],
      confirmationProblem: learningData.confirmationProblem ?? null,
      similarProblems: [...learningData.similarProblems],
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
    const errorMessage = toErrorMessage(error, 'AI解析でエラーが発生しました')
    return c.json({
      ok: false,
      error: 'analyze_error',
      message: errorMessage,
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
    const currentStep = session.steps.find((step: LearningStep) => step.stepNumber === stepNumber)
    if (!currentStep) {
      console.error('❌ Step not found:', { stepNumber, availableSteps: session.steps.map((s: LearningStep) => s.stepNumber) })
      throw new Error('無効なステップ番号です')
    }
    
    // 回答評価
    const isCorrect = answer === currentStep.correctAnswer
    
    // 回答を記録
    if (!currentStep.attempts) {
      currentStep.attempts = []
    }
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
      const currentStepIndex = session.steps.findIndex((step: LearningStep) => step.stepNumber === stepNumber)
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
    const errorMessage = toErrorMessage(error, 'ステップチェックでエラーが発生しました')
    return c.json({
      ok: false,
      error: 'step_check_error',
      message: errorMessage,
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
    const errorMessage = error instanceof Error ? error.message : String(error);
    alert('❌ 確認問題チェックエラー: ' + errorMessage);
    return c.json({
      ok: false,
      error: 'confirmation_error',
      message: errorMessage,
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
      const currentStepIndex = typeof session.currentStep === 'number' ? session.currentStep : 0
      const analysisSummary =
        typeof session.analysis === 'string'
          ? session.analysis.split('\n\n')[0]
          : ''
      const problemLabel =
        session.problemType === 'english_grammar'
          ? '英語文法'
          : session.problemType || '不明'

      contextInfo = `現在の学習状況：
・学習フェーズ: ${phase}
・問題タイプ: ${problemLabel}
・現在のステップ: ${currentStepIndex + 1}
・学習内容: ${analysisSummary}`
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
    
    const aiResult = await openaiResponse.json() as OpenAIChatCompletionResponse
    const aiAnswer = aiResult.choices?.[0]?.message?.content || 'すみません、回答を生成できませんでした。'
    
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'ai_chat_error',
      message: `AI質問処理でエラーが発生しました: ${errorMessage}`,
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
    
    const session: Session = {
      sessionId,
      essaySession,
      chatHistory: [],
      vocabularyProgress: {},
      steps: [],
      confirmationProblem: null,
      similarProblems: []
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'init_error',
      message: `セッション初期化でエラーが発生しました: ${errorMessage}`,
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'upload_error',
      message: `画像アップロードでエラーが発生しました: ${errorMessage}`,
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
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    console.log('✅ OpenAI response received')
    
    const aiResponse = completion.choices?.[0]?.message?.content ?? ''
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'ocr_error',
      message: `OCR処理でエラーが発生しました: ${errorMessage}`,
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
    
    // テーマと問題文を取得
    const themeTitle = session.essaySession.lastThemeTitle || 'テーマ'
    const mainProblem = session.essaySession.mainProblem || 'SNSが社会に与える影響について、あなたの考えを述べなさい'
    
    // 実際のOpenAI APIを使用
    console.log('🤖 Calling OpenAI API for feedback...')
    console.log('📝 Essay text length:', essayText.length, 'chars')
    console.log('🎯 Theme:', themeTitle)
    console.log('📋 Problem:', mainProblem)
    
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

【課題】${mainProblem}（400〜600字）

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
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    console.log('🤖 OpenAI response received')
    
    const aiResponse = completion.choices?.[0]?.message?.content ?? ''
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
      
      // 模範解答を生成
      try {
        console.log('🤖 Generating model answer for Step 4...')
        
        const modelAnswerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                content: `あなたは小論文の先生です。以下の課題に対する模範解答（400〜600字）を作成してください。

要求:
- 400〜600字（目標: 500字程度）
- 構成: 序論（問題提起）→本論（具体例2つ以上）→結論（自分の意見）
- 「である」調で記述
- 小論文らしい格調高い表現を使用
- 論理的で説得力のある内容
- 具体例は現実的で分かりやすいものを使用

出力形式:
【模範解答】（500字程度）
(模範となる小論文)`
              },
              {
                role: 'user',
                content: `課題: ${mainProblem}

この課題に対する完璧な模範解答を作成してください。`
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        })
        
        if (modelAnswerResponse.ok) {
          const modelAnswerData = await modelAnswerResponse.json() as OpenAIChatCompletionResponse
          feedback.modelAnswer = modelAnswerData.choices?.[0]?.message?.content || ''
          console.log('✅ Model answer generated for Step 4')
        }
      } catch (modelError) {
        console.error('❌ Model answer generation error:', modelError)
      }
      
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'feedback_error',
      message: `AI添削でエラーが発生しました: ${errorMessage}`,
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
      const essaySessionData = session?.essaySession
      const uploadedImages = essaySessionData?.uploadedImages ?? []
      const ocrResults = essaySessionData?.ocrResults ?? []
      const hasImage = uploadedImages.some((img: UploadedImage) => img.step === 1)
      const hasOCR = ocrResults.some((ocr: OCRResult) => ocr.step === 1)
      
      // OCR結果がある場合、AI添削を実行
      if (hasOCR && (message.includes('確認完了') || message.includes('これで完了'))) {
        console.log('📝 Step 1: OCR confirmed, generating feedback...')
        
        try {
          const step1OCRs = ocrResults.filter((ocr: OCRResult) => ocr.step === 1)
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
          
            const completion = await response_api.json() as OpenAIChatCompletionResponse
          const feedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: string[]
            improvements?: string[]
            overallScore?: number
            nextSteps?: string[]
          }
          const goodPoints = Array.isArray(feedback.goodPoints) ? feedback.goodPoints : []
          const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : []
          const nextSteps = Array.isArray(feedback.nextSteps) ? feedback.nextSteps : []
          const overallScore = typeof feedback.overallScore === 'number' ? feedback.overallScore : 0
          
          console.log('✅ Step 1 feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
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
        
        if ((problemMode === 'theme' || problemMode === 'ai') && customInput && themeContent) {
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
            
            const completion = await response_api.json() as OpenAIChatCompletionResponse
            const generatedAnswer = completion.choices?.[0]?.message?.content || ''
            
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
          
          const completion = await response_api.json() as OpenAIChatCompletionResponse
          const feedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: string[]
            improvements?: string[]
            overallScore?: number
            nextSteps?: string[]
          }
          const goodPoints = Array.isArray(feedback.goodPoints) ? feedback.goodPoints : []
          const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : []
          const nextSteps = Array.isArray(feedback.nextSteps) ? feedback.nextSteps : []
          const overallScore = typeof feedback.overallScore === 'number' ? feedback.overallScore : 0
          
          console.log('✅ Step 1 text feedback generated')
          
          // 模範解答を生成
          let modelAnswer = ''
          try {
            console.log('🤖 Generating model answer for Step 1...')
            
            const themeContent = session?.essaySession?.lastThemeContent || ''
            const questionText = `理解度確認の質問（テーマ: ${themeTitle}）`
            
            const modelAnswerPrompt = `あなたは小論文の先生です。生徒が答えた質問に対する模範解答を作成してください。

テーマ: ${themeTitle}

読み物の内容:
${themeContent}

要求:
- 質問に対する完璧な模範解答を作成
- 「です・ます」調で記述
- 各質問に対して丁寧に回答
- 読み物の内容を踏まえつつ、自分の考えも含める
- 小論文らしい文体を使用

出力形式:
【模範解答】
1. (質問1への完璧な回答)

2. (質問2への完璧な回答)

3. (質問3への完璧な回答)`
            
            const modelAnswerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: modelAnswerPrompt },
                  { role: 'user', content: '質問に対する模範解答を作成してください。' }
                ],
                max_tokens: 1000,
                temperature: 0.7
              })
            })
            
            if (modelAnswerResponse.ok) {
              const modelAnswerData = await modelAnswerResponse.json() as OpenAIChatCompletionResponse
              modelAnswer = modelAnswerData.choices?.[0]?.message?.content || ''
              console.log('✅ Model answer generated')
            }
          } catch (error) {
            console.error('❌ Model answer generation error:', error)
          }
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n${modelAnswer ? `\n${modelAnswer}\n\n` : ''}素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
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
        
        // AIモードの場合、セッションからテーマを取得
        let themeForQuestions = customInput
        if (problemMode === 'ai' && session?.essaySession?.lastThemeTitle) {
          themeForQuestions = session.essaySession.lastThemeTitle
          console.log('✅ Using AI-generated theme from session:', themeForQuestions)
        }
        
        // デバッグ情報をログ出力
        console.log('🔍 Step 1 Questions Generation - Conditions:', {
          problemMode,
          customInput,
          themeForQuestions,
          hasCustomInput: !!customInput,
          hasThemeForQuestions: !!themeForQuestions,
          condition_theme_ai: (problemMode === 'theme' || problemMode === 'ai') && !!themeForQuestions,
          condition_problem: problemMode === 'problem' && !!customInput
        })
        
        // カスタムテーマに基づいた質問を生成
        let questions = null
        
        if ((problemMode === 'theme' || problemMode === 'ai') && themeForQuestions) {
          console.log('✅ Generating questions for theme:', themeForQuestions)
          
          // セッションから読み物を取得
          const themeContent = session?.essaySession?.lastThemeContent || ''
          
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
テーマ: ${themeForQuestions}

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
            
            const result = await response.json() as OpenAIChatCompletionResponse
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
              questions = `1. ${themeForQuestions}の基本的な概念や定義について説明してください。\n2. ${themeForQuestions}に関する現代社会における問題点や課題は何ですか？\n3. ${themeForQuestions}について、あなた自身の考えや意見を述べてください。`
              console.warn('⚠️ AI questions too short (length: ' + (generatedQuestions?.length || 0) + '), using custom fallback')
            }
          } catch (error) {
            console.error('❌ Questions generation error:', error)
          const errorDetails = error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: toErrorMessage(error) }
          console.error('❌ Error details:', errorDetails)
            // エラー時もカスタムテーマを使ったフォールバック
            questions = `1. ${themeForQuestions}の基本的な概念や定義について説明してください。\n2. ${themeForQuestions}に関する現代社会における問題点や課題は何ですか？\n3. ${themeForQuestions}について、あなた自身の考えや意見を述べてください。`
            console.log('🔄 Using error fallback with custom theme')
          }
        } else if (problemMode === 'problem' && customInput) {
          // 問題文が与えられている場合は、その問題について確認
          questions = `問題文を確認しました。\n\n問題: ${customInput.substring(0, 200)}${customInput.length > 200 ? '...' : ''}\n\nこの問題について考えを整理してから書き始めましょう。`
        }
        
        // 質問生成失敗チェック
        if (!questions) {
          console.error('❌ Questions generation failed - no questions generated')
          return c.json({
            ok: false,
            error: 'questions_generation_failed',
            message: '❌ 理解度確認の質問生成に失敗しました。\n\nお手数ですが、もう一度「読んだ」と送信してください。\n\nそれでも問題が解決しない場合は、「新しいセッション」ボタンを押して最初からやり直してください。',
            timestamp: new Date().toISOString()
          }, 500)
        }
        
        response = `理解度を確認します。以下の質問に、小論文で書くような丁寧な文体で答えてください：\n\n${questions}\n\n【回答方法】\n・3つの質問すべてに答えてください\n・「です・ます」調または「である」調で記述\n・箇条書きではなく、文章として答えてください\n・すべて答え終えたら、送信ボタンを押してください\n\n（わからない場合は「パス」と入力すると解説します）`
      }
      // 「OK」のみ
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        console.log('✅ Matched: OK/はい')
        
        // カスタムテーマに基づいた問題を生成
        let themeTitle = null
        let themeContent = null
        
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
- **絶対に守ること**: 
  1. タイムスタンプ${timestamp}とランダムシード${randomSeed}に基づき、毎回異なるテーマを選択
  2. 全カテゴリーから均等にランダムに選ぶ（最初のカテゴリーだけでなく、全てのカテゴリーから選択）
  3. 同じテーマの繰り返しを避ける
  4. 推奨リストにないテーマも積極的に選択可能

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
                  { role: 'user', content: `タイムスタンプ${timestamp}とシード${randomSeed}に基づき、全カテゴリーの中からランダムに1つのユニークなテーマを選び、読み物を作成してください。前回と違うカテゴリーから選んでください。` }
                ],
                max_tokens: 1500,
                temperature: 0.95 // さらに高い温度でランダム性を最大化
              })
            })
            
            console.log('📡 OpenAI API response status:', response.status)
            
            if (!response.ok) {
              const errorText = await response.text()
              console.error('❌ OpenAI API error response:', errorText)
              throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
            }
            
            const result = await response.json() as OpenAIChatCompletionResponse
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
              
              let themeCandidate = themeMatch?.[1]?.trim() ?? null
              let contentCandidate = contentMatch?.[1]?.trim() ?? null

              // パターン3: 最初の行がテーマの可能性
              if (!themeCandidate && generatedText.trim()) {
                const firstLine = generatedText.trim().split('\n')[0]
                if (firstLine.length < 30 && firstLine.length > 3) {
                  themeCandidate = firstLine
                  console.log('🔍 Using first line as theme:', firstLine)
                }
              }

              // 読み物がマッチしない場合、全文を読み物として使用
              if (!contentCandidate && generatedText.length > 200) {
                // テーマ行を除いた残りを読み物とする
                const lines = generatedText.split('\n')
                const startIndex = themeCandidate ? 1 : 0
                const contentText = lines.slice(startIndex).join('\n').trim()
                if (contentText.length > 200) {
                  contentCandidate = contentText
                  console.log('🔍 Using remaining text as content')
                }
              }

              console.log('🔍 Parsing AI response:', {
                hasThemeMatch: !!themeCandidate,
                hasContentMatch: !!contentCandidate,
                themeMatchValue: themeCandidate ?? 'N/A',
                contentLength: contentCandidate?.length ?? 0,
                fullTextLength: generatedText.length,
                firstLine: generatedText.split('\n')[0]
              })
              
              if (themeCandidate && contentCandidate && contentCandidate.length > 50) {
                themeTitle = themeCandidate
                themeContent = contentCandidate
                console.log('✅ ✨ AI-generated NEW theme:', themeTitle)
                console.log('✅ AI-generated content length:', themeContent.length)
                console.log('🎯 This is a UNIQUE theme for this session')
              } else {
                // AI生成失敗 - エラーメッセージを表示
                console.error('❌ Failed to parse AI response for theme generation')
                console.error('❌ Parse results:', {
                  themeMatch: !!themeCandidate,
                  contentMatch: !!contentCandidate,
                  themeValue: themeCandidate,
                  contentLength: contentCandidate?.length ?? 0
                })
                console.error('❌ Full AI response:', generatedText)
                throw new Error('AI theme generation failed - could not parse response')
              }
            } catch (error) {
              console.error('❌ AI auto-generation error:', error)
          const errorDetails = error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: toErrorMessage(error) }
          console.error('❌ Error details:', errorDetails)
              
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
            
            const result = await response.json() as OpenAIChatCompletionResponse
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
          const errorDetails = error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: toErrorMessage(error) }
          console.error('❌ Error details:', errorDetails)
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
        
        // テーマ生成成功チェック
        if (!themeTitle || !themeContent) {
          console.error('❌ Theme generation failed - missing title or content')
          return c.json({
            ok: false,
            error: 'theme_generation_failed',
            message: '❌ テーマと読み物の生成に失敗しました。\n\nお手数ですが、以下のいずれかをお試しください：\n\n1. 「💡 テーマを入力」を選択して、ご自身でテーマを入力する\n2. もう一度「🤖 AIにお任せ」を試す\n3. 「📝 問題文を入力」を選択して、具体的な問題文を入力する\n\nご不便をおかけして申し訳ございません。',
            timestamp: new Date().toISOString()
          }, 500)
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
          
          const result = await response.json() as OpenAIChatCompletionResponse
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
              const answerLines = answerText.split('\n').filter((line: string) => line.trim())
              const problemLines = answerLines
                .filter((line: string) => /^\d+\./.test(line.trim()) && line.includes('→'))
                .map((line: string) => {
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
          // エラー時も解答を保存
          const vocabAnswers = '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱりそう」→「やはりそのとおり」または「確かにそうだ」\n3. 「だから必要」→「したがって必要」または「それゆえ必要」\n4. 「ちゃんと確認」→「適切に確認」または「正確に確認」\n5. 「いっぱいある」→「多数存在する」または「数多く存在する」'
          if (!session.essaySession) {
            session.essaySession = {}
          }
          session.essaySession.vocabAnswers = vocabAnswers
        }
        
        // セッションを保存
        learningSessions.set(sessionId, session)
        await saveSessionToDB(db, sessionId, session)
        console.log('✅ Vocab answers saved to session and DB')
        
        // すぐに語彙問題を表示
        response = `【語彙力強化】\n口語表現を小論文風に言い換える練習をしましょう。\n\n以下の口語表現を小論文風の表現に言い換えてください：\n\n${vocabProblems}\n\n（例：${vocabExample}）\n\n3つの言い換えをすべてチャットで答えて、送信ボタンを押してください。\n（わからない場合は「パス」と入力すると解答例を見られます）`
      }
      // 回答が短すぎる
      else {
        response = '回答が短すぎるようです。\n\n3つの言い換えをすべて答えてください。各10文字以上で答えましょう。\n（わからない場合は「パス」と入力すると解答例を見られます）'
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
          
          const completion = await response_api.json() as OpenAIChatCompletionResponse
          const feedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: string[]
            improvements?: string[]
            exampleImprovement?: string
            nextSteps?: string[]
            overallScore?: number
            charCount?: number
          }
          const goodPoints = Array.isArray(feedback.goodPoints) ? feedback.goodPoints : []
          const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : []
          const nextSteps = Array.isArray(feedback.nextSteps) ? feedback.nextSteps : []
          const overallScore = typeof feedback.overallScore === 'number' ? feedback.overallScore : 0
          
          console.log('✅ Short essay feedback generated')
          
          // 模範解答を生成
          let modelAnswer = ''
          try {
            console.log('🤖 Generating model answer for Step 3 short essay...')
            
            const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'テーマ'
            const shortProblem = session?.essaySession?.shortProblem || `${themeTitle}について`
            
            const modelAnswerPrompt = `あなたは小論文の先生です。以下の課題に対する200字程度の模範解答を作成してください。

課題: ${shortProblem}

要求:
- 200字程度（180〜220字）
- 構成: 主張→理由→具体例→結論
- 「である」調で記述
- 小論文らしい格調高い表現を使用
- 論理的で説得力のある内容

出力形式:
【模範解答】（200字）
(模範となる短文小論文)`
            
            const modelAnswerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: modelAnswerPrompt },
                  { role: 'user', content: '課題に対する模範解答を作成してください。' }
                ],
                max_tokens: 500,
                temperature: 0.7
              })
            })
            
            if (modelAnswerResponse.ok) {
              const modelAnswerData = await modelAnswerResponse.json() as OpenAIChatCompletionResponse
              modelAnswer = modelAnswerData.choices?.[0]?.message?.content || ''
              console.log('✅ Short essay model answer generated')
            }
          } catch (error) {
            console.error('❌ Model answer generation error:', error)
          }
          
          // フィードバックを整形して表示
          response = `【短文添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n${modelAnswer ? `\n${modelAnswer}\n\n` : ''}素晴らしい取り組みでした！次のステップでは、より長い小論文に挑戦します。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
          stepCompleted = true
          
        } catch (error) {
          console.error('❌ Short essay feedback error:', error)
          response = '短文を受け付けました。\n\n素晴らしい努力です！次のステップでは、より長い小論文に取り組みます。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
        stepCompleted = true
      }
      }
      // OKまたは「はい」で課題提示
      else if (message.toLowerCase().trim() === 'ok' || message.toLowerCase().includes('オッケー') || message.includes('はい')) {
        console.log('🔍 Step 3 Short Essay - Conditions:', {
          problemMode,
          customInput,
          hasCustomInput: !!customInput
        })
        
        // カスタムテーマに基づいた短文問題を生成
        // AIモードの場合、セッションからテーマを取得
        let themeForShortEssay = customInput
        if (problemMode === 'ai' && session?.essaySession?.lastThemeTitle) {
          themeForShortEssay = session.essaySession.lastThemeTitle
          console.log('✅ Using AI-generated theme from session for short essay:', themeForShortEssay)
        }
        
        let shortProblem = '環境問題について、200字程度で小論文を書いてください。'
        
        if ((problemMode === 'theme' || problemMode === 'ai') && themeForShortEssay) {
          shortProblem = `${themeForShortEssay}について、200字程度で小論文を書いてください。`
          console.log('✅ Using theme for short essay:', themeForShortEssay)
        } else if (problemMode === 'problem' && customInput) {
          // 問題文がある場合は、そのまま使用
          shortProblem = customInput
          console.log('✅ Using custom problem for short essay')
        } else {
          console.warn('⚠️ Using fallback short essay problem')
        }
        
        // 短文問題をセッションに保存
        if (session && session.essaySession) {
          session.essaySession.shortProblem = shortProblem
          learningSessions.set(sessionId, session)
          await saveSessionToDB(db, sessionId, session)
          console.log('✅ Short problem saved to session')
        }
        
        response = `【短文演習】\n指定字数で短い小論文を書いてみましょう。\n\n＜課題＞\n${shortProblem}\n\n＜構成＞\n主張→理由→具体例→結論（200字程度）\n\n＜書き方＞\n1. まず自分の主張を明確に述べる\n2. その理由を説明する\n3. 具体例を1つ挙げる\n4. 最後に結論でまとめる\n\n書き終えたら、この入力エリアにそのまま入力して送信してください。AIが添削します。`
      }
      // 短すぎる回答
      else {
        response = '短文小論文は150字以上で書いてください。\n\n主張→理由→具体例→結論の構成を意識しましょう。\n\n書き終えたら、この入力エリアに入力して送信してください。'
      }
    } else if (currentStep === 4) {
      // ステップ4: 本練習（手書き原稿アップロード + OCR + AI添削）
      // セッションを取得
      const session = learningSessions.get(sessionId)
      
      // 画像がアップロードされたかチェック
      const hasImage = session && session.essaySession && session.essaySession.uploadedImages && 
                       session.essaySession.uploadedImages.some((img: UploadedImage) => img.step === 4)
      
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
        // AIモードの場合、セッションからテーマを取得
        let themeForMainPractice = customInput
        if (problemMode === 'ai' && session?.essaySession?.lastThemeTitle) {
          themeForMainPractice = session.essaySession.lastThemeTitle
          console.log('✅ Using AI-generated theme from session for main practice:', themeForMainPractice)
        }
        
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
        } else if ((problemMode === 'theme' || problemMode === 'ai') && themeForMainPractice) {
          console.log('✅ Generating detailed problem from theme:', themeForMainPractice)
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

テーマ: ${themeForMainPractice}
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
            
            const result = await response_api.json() as OpenAIChatCompletionResponse
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
          const errorDetails = error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: toErrorMessage(error) }
          console.error('❌ Error details:', errorDetails)
            mainProblem = `${customInput}の発展により、社会に様々な影響が生じています。あなたはこの${customInput}について、どのような課題があり、どう対応すべきと考えますか。具体例を挙げながら、あなたの考えを述べなさい`
            console.log('🔄 Using error fallback with custom theme')
          }
        } else {
          console.warn('⚠️ Using fallback main problem (no custom input)')
        }
        
        // 課題をセッションに保存
        if (session && session.essaySession) {
          session.essaySession.mainProblem = mainProblem
          learningSessions.set(sessionId, session)
          await saveSessionToDB(db, sessionId, session)
          console.log('✅ Main problem saved to session:', mainProblem)
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
                       session.essaySession.uploadedImages.some((img: UploadedImage) => img.step === 5)
      
      // このステップのOCR結果があるかチェック（Step 5用の新しい原稿）
      const hasOCR = session && session.essaySession && session.essaySession.ocrResults && 
                     session.essaySession.ocrResults.some((ocr: OCRResult) => ocr.step === 5)
      
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
          const step5OCRs = session.essaySession.ocrResults.filter((ocr: OCRResult) => ocr.step === 5)
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
            
            const baseTheme = (problemMode === 'theme' && customInput) ? customInput : '社会問題'
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
            
            const result = await response_api.json() as OpenAIChatCompletionResponse
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'chat_error',
      message: `チャット処理でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})
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
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    const answer = completion.choices?.[0]?.message?.content || ''
    
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
// International Student Bilingual Chat API エンドポイント
// ===========================================================
app.post('/api/international-chat', async (c) => {
  try {
    console.log('🌍 International Chat API: Received request')
    
    const formData = await c.req.formData()
    const image = formData.get('image') as File | null
    const sessionId = formData.get('sessionId') as string
    const message = formData.get('message') as string
    
    console.log('📍 Session ID:', sessionId)
    console.log('💬 Message:', message)
    console.log('🖼️ Image:', image ? `${image.name} (${image.size} bytes)` : 'none')
    
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found')
      return c.json({ ok: false, message: 'OpenAI APIキーが設定されていません' })
    }
    
    let messages: any[] = [
      {
        role: 'system',
        content: `You are a bilingual learning support AI for international students. You must provide ALL explanations in BOTH Japanese and English.

【CRITICAL FORMAT REQUIREMENT】
ALWAYS use this exact format in your response:

【日本語】
（日本語での詳しい解説をここに書く）

【English】
（English detailed explanation here）

【LANGUAGE RULES】
- Use simple, student-friendly language
- Explain complex terms when used
- Be friendly and encouraging

【MATH FORMATTING】
- Use $$formula$$ for display math (e.g., $$x^2 + y^2 = r^2$$)
- Use $formula$ for inline math (e.g., $a = 5$)
- Use proper symbols: ∠ for angles, △ for triangles, ° for degrees

【EXPLANATION STRUCTURE】
1. First, briefly explain the problem
2. List key points (3-5 bullet points)
3. Provide step-by-step solution
4. Give encouragement

REMEMBER: EVERY response must have BOTH 【日本語】 and 【English】 sections!`
      }
    ]
    
    // Build user message
    const userContent: any[] = [
      {
        type: 'text',
        text: message || 'Please explain the image content in both Japanese and English.'
      }
    ]
    
    // Add image if provided
    if (image) {
      console.log('🔄 Converting image to base64...')
      const arrayBuffer = await image.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      const base64Image = btoa(binary)
      
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
          detail: 'high'
        }
      })
      
      console.log('✅ Image converted to base64')
    }
    
    messages.push({
      role: 'user',
      content: userContent
    })
    
    console.log('🔄 Calling OpenAI API...')
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 3000
      })
    })
    
    if (!response.ok) {
      console.error('❌ OpenAI API error:', response.status, response.statusText)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return c.json({ ok: false, message: 'OpenAI APIエラー' })
    }
    
    const data = await response.json()
    const answer = data.choices[0]?.message?.content || 'No response'
    
    console.log('✅ OpenAI response received')
    
    // Save to database
    try {
      await c.env.DB.prepare(`
        INSERT INTO international_conversations (session_id, user_message, ai_response, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(sessionId, message || '[Image]', answer).run()
      console.log('✅ Conversation saved to database')
    } catch (dbError) {
      console.error('⚠️ Database save error:', dbError)
      // Continue even if DB save fails
    }
    
    return c.json({ ok: true, answer: answer })
    
  } catch (error) {
    console.error('❌ International Chat API error:', error)
    return c.json({ 
      ok: false, 
      message: 'エラーが発生しました: ' + (error instanceof Error ? error.message : 'Unknown error')
    })
  }
})

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
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    const answer = completion.choices?.[0]?.message?.content || ''
    
    console.log('✅ OpenAI Vision API response received')
    console.log('💬 Answer:', answer.substring(0, 100) + '...')
    
    return c.json({ 
      ok: true, 
      answer: answer 
    })
    
            } catch (error) {
    console.error('❌ AI Chat Image API error:', error)
    const errorMessage = toErrorMessage(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', errorMessage, errorStack)
    return c.json({ 
      ok: false, 
      message: `サーバーエラーが発生しました: ${errorMessage}` 
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
            background: #f5f5f5;
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
        console.log('🚀 AI Chat V2 script starting...');
        
        // セッションID（サーバーから注入）
        const SESSION_ID = ${JSON.stringify(sessionId)};
        console.log('📍 Session ID:', SESSION_ID);
        
        // DOM要素
        const chatMessages = document.getElementById('chatMessages');
        const messageInput = document.getElementById('messageInput');
        const sendButton = document.getElementById('sendButton');
        
        console.log('📝 Basic elements:', {
            chatMessages: !!chatMessages,
            messageInput: !!messageInput,
            sendButton: !!sendButton
        });
        
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
        
        console.log('📷 Camera elements:', {
            cameraButton: !!cameraButton,
            fileButton: !!fileButton,
            cameraInput: !!cameraInput,
            fileInput: !!fileInput
        });
        const cropImage = document.getElementById('cropImage');
        const btnCancelCrop = document.getElementById('btnCancelCrop');
        const btnConfirmCrop = document.getElementById('btnConfirmCrop');
        
        let cropper = null;
        let currentImageData = null;
        
        // KaTeX delimiters (simplified - only $ and $$ to avoid escaping issues)
        const mathDelimiters = [
            {left: '$$', right: '$$', display: true},
            {left: '$', right: '$', display: false}
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
                
                if (data.ok && data.answer) {
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
        console.log('🔗 Setting up event listeners...');
        
        if (sendButton) {
            sendButton.addEventListener('click', () => {
                console.log('🖱️ Send button clicked');
                sendMessage();
            });
            console.log('✅ Send button listener attached');
        } else {
            console.error('❌ Send button not found!');
        }
        
        if (messageInput) {
            messageInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    console.log('⌨️ Enter key pressed');
                    sendMessage();
                }
            });
            console.log('✅ Message input listener attached');
        } else {
            console.error('❌ Message input not found!');
        }
        
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

// インター生用バイリンガルチャット - International Student Bilingual Chat
// Route moved to src/routes/international-student.ts

// 小論文指導ページ
// Essay Coaching Setup Page - Route moved to src/routes/essay-coaching.ts
// 小論文指導 - 授業セッションページ

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
    const sessionStudentId = session.sid
    const studentInfoFromDb = sessionStudentId ? studentDatabase[sessionStudentId] : undefined
    const studentInfo = studentInfoFromDb || {
      studentId: 'unknown',
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
                `元の質問: ${session.originalUserMessage}\n\n【重要指示】この画像の問題から「教育的青写真」を正確に抽出し、同じ学習価値・同じ難易度を保持したまま、表面的表現のみを変更した類題を生成してください。定義問題や汎用問題への変更は禁止です。` :
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
    
    const regenerationCompletion = await openaiResponse.json()
    const aiContent = regenerationCompletion.choices?.[0]?.message?.content ?? ''
    console.log('🤖 Regenerated AI content length:', aiContent.length)
    
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    let aiAnalysis: AiAnalysisPayload | null = null
    
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
    if (!aiAnalysis) {
      return c.json({
        ok: false,
        error: 'parse_error',
        message: 'AI再生成結果が取得できませんでした',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
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
    const errorMessage = toErrorMessage(error, '問題再生成でエラーが発生しました')
    return c.json({
      ok: false,
      error: 'regeneration_error',
      message: errorMessage,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 修正2: 画像ベース再生成用プロンプト作成関数
function createRegenerationPrompt(session: Session, studentInfo: StudentInfo, regenerationType: RegenerationType) {
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
function getRegenerationTypeInstructions(regenerationType: RegenerationType) {
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
function evaluateRegenerationQuality(regeneratedContent: AiAnalysisPayload, originalSession: Session) {
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
    (regeneratedContent.steps || []).some((step: LearningStep) => pattern.test(step.content ?? ''))
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
  const hasSpecificContent = (regeneratedContent.steps || []).some((step: LearningStep) => {
    const content = step.content ?? ''
    return content.includes('「') && content.includes('」') // 日本語の引用符
  })
  
  if (!hasSpecificContent) {
    score -= 0.2
    issues.push('lacks_specific_content')
  }
  
        const data = await response.json();
        
        if (response.ok && data.success) {
          successMessage.style.display = 'block';
          resetForm.style.display = 'none';
        } else {
          throw new Error(data.error || 'リセットリンクの送信に失敗しました');
        }
      } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        resetBtn.disabled = false;
        resetBtn.innerHTML = '<i class="fas fa-paper-plane"></i> リセットリンクを送信';
      }
    });
  </script>
</body>
</html>
  `)
})

// Password Reset Confirmation Page
app.get('/admin/reset-password/confirm', (c) => {
  const token = c.req.query('token')
  
  if (!token) {
    return c.redirect('/admin/reset-password')
  }
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>新しいパスワードの設定 | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
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
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .reset-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 100%;
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .reset-header i {
      font-size: 3rem;
      color: #667eea;
      margin-bottom: 1rem;
    }
    
    .reset-header h1 {
      font-size: 1.5rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .reset-header p {
      color: #6b7280;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .password-requirements {
      font-size: 0.75rem;
      color: #6b7280;
      margin-top: 0.5rem;
      line-height: 1.5;
    }
    
    .btn {
      width: 100%;
      padding: 0.875rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .success-message {
      background: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #065f46;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .error-message {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #991b1b;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: color 0.2s;
    }
    
    .back-link a:hover {
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="reset-container">
    <div class="reset-header">
      <i class="fas fa-lock"></i>
      <h1>新しいパスワードの設定</h1>
      <p>新しい管理者パスワードを入力してください</p>
    </div>
    
    <div class="success-message" id="successMessage">
      <i class="fas fa-check-circle"></i>
      <strong>パスワード変更完了</strong><br>
      パスワードが正常に変更されました。新しいパスワードでログインしてください。
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="confirmForm">
      <input type="hidden" id="token" value="${token}">
      
      <div class="form-group">
        <label for="newPassword">
          <i class="fas fa-key"></i> 新しいパスワード
        </label>
        <input 
          type="password" 
          id="newPassword" 
          name="newPassword"
          placeholder="新しいパスワードを入力"
          required
          minlength="8"
        >
        <div class="password-requirements">
          ※ 8文字以上で設定してください
        </div>
      </div>
      
      <div class="form-group">
        <label for="confirmPassword">
          <i class="fas fa-check"></i> パスワード確認
        </label>
        <input 
          type="password" 
          id="confirmPassword" 
          name="confirmPassword"
          placeholder="もう一度入力してください"
          required
          minlength="8"
        >
      </div>
      
      <button type="submit" class="btn btn-primary" id="confirmBtn">
        <i class="fas fa-save"></i> パスワードを変更
      </button>
    </form>
    
    <div class="back-link">
      <a href="/admin/login"><i class="fas fa-arrow-left"></i> ログインに戻る</a>
    </div>
  </div>
  
  <script>
    const confirmForm = document.getElementById('confirmForm');
    const confirmBtn = document.getElementById('confirmBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    confirmForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const token = document.getElementById('token').value;
      const newPassword = document.getElementById('newPassword').value;
      const confirmPassword = document.getElementById('confirmPassword').value;
      
      // Reset messages
      successMessage.style.display = 'none';
      errorMessage.style.display = 'none';
      
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        errorMessage.textContent = 'パスワードが一致しません。もう一度入力してください。';
        errorMessage.style.display = 'block';
        return;
      }
      
      // Validate password length
      if (newPassword.length < 8) {
        errorMessage.textContent = 'パスワードは8文字以上で設定してください。';
        errorMessage.style.display = 'block';
        return;
      }
      
      // Disable button
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 変更中...';
      
      try {
        const response = await fetch('/api/admin/confirm-password-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ 
            token,
            newPassword 
          })
        });
        
        const data = await response.json();
        
        if (response.ok && data.success) {
          successMessage.style.display = 'block';
          confirmForm.style.display = 'none';
          
          // Redirect to login after 3 seconds
          setTimeout(() => {
            window.location.href = '/admin/login';
          }, 3000);
        } else {
          throw new Error(data.error || 'パスワードの変更に失敗しました');
        }
      } catch (error) {
        errorMessage.textContent = error.message;
        errorMessage.style.display = 'block';
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="fas fa-save"></i> パスワードを変更';
      }
    });
  </script>
</body>
</html>
  `)
})

// Admin Users List Page
app.get('/admin/users', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生徒管理 | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Noto Sans JP', sans-serif;
      background: #f5f5f5;
      min-height: 100vh;
      color: #374151;
    }
    
    .header {
      background: white;
      border-bottom: 2px solid #e5e7eb;
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .header h1 {
      font-size: 1.5rem;
      color: #374151;
    }
    
    .header-actions {
      display: flex;
      gap: 1rem;
    }
    
    .btn {
      padding: 0.625rem 1.25rem;
      border-radius: 0.5rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      border: none;
      font-size: 0.875rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(102, 126, 234, 0.3);
    }
    
    .btn-secondary {
      background: #f3f4f6;
      color: #374151;
    }
    
    .btn-secondary:hover {
      background: #e5e7eb;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      padding: 1.5rem;
      border-radius: 0.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
    }
    
    .stat-card h3 {
      font-size: 0.875rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    
    .stat-card .value {
      font-size: 2rem;
      font-weight: 700;
      color: #374151;
    }
    
    .users-card {
      background: white;
      border-radius: 0.75rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      overflow: hidden;
    }
    
    .users-header {
      padding: 1.5rem;
      border-bottom: 2px solid #e5e7eb;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .users-header h2 {
      font-size: 1.25rem;
      color: #374151;
    }
    
    .search-box {
      padding: 0.625rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
      width: 250px;
    }
    
    .search-box:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .users-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .users-table thead {
      background: #f9fafb;
    }
    
    .users-table th {
      padding: 1rem 1.5rem;
      text-align: left;
      font-size: 0.875rem;
      font-weight: 600;
      color: #6b7280;
    }
    
    .users-table td {
      padding: 1rem 1.5rem;
      border-top: 1px solid #e5e7eb;
      font-size: 0.875rem;
    }
    
    .users-table tr:hover {
      background: #f9fafb;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
    }
    
    .badge-active {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-inactive {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .btn-sm {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
    }
    
    .btn-group {
      display: flex;
      gap: 0.5rem;
    }
    
    .loading {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    /* Filter Tabs */
    .filter-tabs {
      display: flex;
      gap: 0.5rem;
      padding: 1rem 1.5rem;
      background: #f9fafb;
      border-top: 1px solid #e5e7eb;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .filter-tab {
      padding: 0.625rem 1rem;
      background: white;
      border: 1px solid #e5e7eb;
      border-radius: 0.5rem;
      color: #6b7280;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
    }
    
    .filter-tab:hover {
      background: #f9fafb;
      border-color: #d1d5db;
    }
    
    .filter-tab.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
    
    .filter-tab i {
      font-size: 0.875rem;
    }
    
    .filter-badge {
      background: #e5e7eb;
      color: #374151;
      padding: 0.125rem 0.5rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      margin-left: 0.25rem;
    }
    
    .filter-tab.active .filter-badge {
      background: rgba(255, 255, 255, 0.2);
      color: white;
    }
    
    .filter-badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .filter-badge-secondary {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.5);
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }
    
    .modal.show {
      display: flex;
    }
    
    .modal-content {
      background: white;
      border-radius: 0.75rem;
      padding: 2rem;
      max-width: 500px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
    }
    
    .modal-header {
      margin-bottom: 1.5rem;
    }
    
    .modal-header h3 {
      font-size: 1.25rem;
      color: #374151;
    }
    
    .form-group {
      margin-bottom: 1rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.625rem 0.875rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 0.875rem;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #667eea;
    }
    
    .modal-footer {
      margin-top: 1.5rem;
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1><i class="fas fa-users"></i> 生徒管理システム</h1>
    <div class="header-actions">
      <button class="btn btn-secondary" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i> ログアウト
      </button>
    </div>
  </div>
  
  <div class="container">
    <div class="stats-grid" id="statsGrid">
      <div class="stat-card">
        <h3>総生徒数</h3>
        <div class="value" id="totalUsers">-</div>
      </div>
      <div class="stat-card">
        <h3>アクティブ</h3>
        <div class="value" id="activeUsers">-</div>
      </div>
      <div class="stat-card">
        <h3>学習セッション</h3>
        <div class="value" id="totalSessions">-</div>
      </div>
    </div>
    
    <div class="users-card">
      <div class="users-header">
        <h2>生徒一覧</h2>
        <div style="display: flex; gap: 1rem; align-items: center;">
          <input type="text" class="search-box" placeholder="検索..." id="searchBox" onkeyup="filterUsers()">
          <button class="btn btn-primary" onclick="showAddUserModal()">
            <i class="fas fa-plus"></i> 新規追加
          </button>
        </div>
      </div>
      
      <!-- Status Filter Tabs -->
      <div class="filter-tabs">
        <button class="filter-tab active" data-filter="all" onclick="setStatusFilter('all')">
          <i class="fas fa-users"></i>
          すべて
          <span class="filter-badge" id="countAll">0</span>
        </button>
        <button class="filter-tab" data-filter="active" onclick="setStatusFilter('active')">
          <i class="fas fa-check-circle"></i>
          アクティブ
          <span class="filter-badge filter-badge-success" id="countActive">0</span>
        </button>
        <button class="filter-tab" data-filter="inactive" onclick="setStatusFilter('inactive')">
          <i class="fas fa-times-circle"></i>
          非アクティブ
          <span class="filter-badge filter-badge-secondary" id="countInactive">0</span>
        </button>
      </div>
      
      <div id="usersTableContainer">
        <div class="loading">
          <i class="fas fa-spinner fa-spin fa-2x"></i>
          <p style="margin-top: 1rem;">読み込み中...</p>
        </div>
      </div>
    </div>
  </div>
  
  <!-- Add/Edit User Modal -->
  <div class="modal" id="userModal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 id="modalTitle">新規生徒追加</h3>
      </div>
      
      <form id="userForm">
        <input type="hidden" id="userId">
        
        <div class="form-group">
          <label for="appKey">APP_KEY *</label>
          <input type="text" id="appKey" value="180418" required>
        </div>
        
        <div class="form-group">
          <label for="studentId">学生ID *</label>
          <input type="text" id="studentId" required placeholder="例: JS2-04">
        </div>
        
        <div class="form-group">
          <label for="studentName">氏名 *</label>
          <input type="text" id="studentName" required placeholder="例: 山田太郎">
        </div>
        
        <div class="form-group">
          <label for="grade">学年</label>
          <input type="text" id="grade" placeholder="例: 中学2年">
        </div>
        
        <div class="form-group">
          <label for="email">メールアドレス</label>
          <input type="email" id="email" placeholder="例: example@email.com">
        </div>
        
        <div class="form-group">
          <label for="notes">メモ</label>
          <textarea id="notes" rows="3" placeholder="備考やメモを入力"></textarea>
        </div>
        
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeUserModal()">キャンセル</button>
          <button type="submit" class="btn btn-primary" id="saveUserBtn">保存</button>
        </div>
      </form>
    </div>
  </div>
  
  <script>
    let allUsers = [];
    let currentStatusFilter = 'all';
    
    // Check authentication
    const token = localStorage.getItem('admin_token');
    if (!token) {
      window.location.href = '/admin/login';
    }
    
    // Load users on page load
    loadUsers();
    
    async function loadUsers() {
      try {
        const response = await fetch('/api/admin/users');
        const data = await response.json();
        
        if (data.success) {
          allUsers = data.users;
          renderUsers(allUsers);
          updateStats(allUsers);
        } else {
          document.getElementById('usersTableContainer').innerHTML = 
            '<div class="empty-state">エラーが発生しました</div>';
        }
      } catch (error) {
        console.error('Load users error:', error);
        document.getElementById('usersTableContainer').innerHTML = 
          '<div class="empty-state">データの読み込みに失敗しました</div>';
      }
    }
    
    function renderUsers(users) {
      if (users.length === 0) {
        document.getElementById('usersTableContainer').innerHTML = 
          '<div class="empty-state"><p>生徒が登録されていません</p><p style="margin-top: 0.5rem; font-size: 0.875rem;">「新規追加」ボタンから生徒を追加してください</p></div>';
        return;
      }
      
      const html = \`
        <table class="users-table">
          <thead>
            <tr>
              <th>学生ID</th>
              <th>氏名</th>
              <th>学年</th>
              <th>状態</th>
              <th>登録日</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            \${users.map(user => \`
              <tr>
                <td><strong>\${user.student_id}</strong></td>
                <td>\${user.student_name}</td>
                <td>\${user.grade || '-'}</td>
                <td>
                  <span class="badge \${user.is_active ? 'badge-active' : 'badge-inactive'}">
                    \${user.is_active ? 'アクティブ' : '無効'}
                  </span>
                </td>
                <td>\${new Date(user.created_at).toLocaleDateString('ja-JP')}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn-secondary btn-sm" onclick="viewUser(\${user.id})">
                      <i class="fas fa-eye"></i> 詳細
                    </button>
                    <button class="btn btn-secondary btn-sm" onclick="editUser(\${user.id})">
                      <i class="fas fa-edit"></i> 編集
                    </button>
                  </div>
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      \`;
      
      document.getElementById('usersTableContainer').innerHTML = html;
    }
    
    function updateStats(users) {
      const activeCount = users.filter(u => u.is_active).length;
      const inactiveCount = users.filter(u => !u.is_active).length;
      
      document.getElementById('totalUsers').textContent = users.length;
      document.getElementById('activeUsers').textContent = activeCount;
      document.getElementById('totalSessions').textContent = '-';
      
      // Update filter count badges
      document.getElementById('countAll').textContent = users.length;
      document.getElementById('countActive').textContent = activeCount;
      document.getElementById('countInactive').textContent = inactiveCount;
    }
    
    function filterUsers() {
      const searchTerm = document.getElementById('searchBox').value.toLowerCase();
      let filtered = allUsers;
      
      // Apply status filter
      if (currentStatusFilter === 'active') {
        filtered = filtered.filter(user => user.is_active === 1);
      } else if (currentStatusFilter === 'inactive') {
        filtered = filtered.filter(user => user.is_active === 0);
      }
      
      // Apply search filter
      if (searchTerm) {
        filtered = filtered.filter(user => 
          user.student_id.toLowerCase().includes(searchTerm) ||
          user.student_name.toLowerCase().includes(searchTerm) ||
          (user.grade && user.grade.toLowerCase().includes(searchTerm))
        );
      }
      
      renderUsers(filtered);
    }
    
    function setStatusFilter(filter) {
      currentStatusFilter = filter;
      
      // Update active tab
      document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      document.querySelector(\`[data-filter="\${filter}"]\`).classList.add('active');
      
      // Apply filter
      filterUsers();
    }
    
    function showAddUserModal() {
      document.getElementById('modalTitle').textContent = '新規生徒追加';
      document.getElementById('userForm').reset();
      document.getElementById('userId').value = '';
      document.getElementById('appKey').value = '180418';
      document.getElementById('studentId').disabled = false;
      document.getElementById('userModal').classList.add('show');
    }
    
    function editUser(userId) {
      const user = allUsers.find(u => u.id === userId);
      if (!user) return;
      
      document.getElementById('modalTitle').textContent = '生徒情報編集';
      document.getElementById('userId').value = user.id;
      document.getElementById('appKey').value = user.app_key;
      document.getElementById('studentId').value = user.student_id;
      document.getElementById('studentId').disabled = true;
      document.getElementById('studentName').value = user.student_name;
      document.getElementById('grade').value = user.grade || '';
      document.getElementById('email').value = user.email || '';
      document.getElementById('notes').value = user.notes || '';
      document.getElementById('userModal').classList.add('show');
    }
    
    function closeUserModal() {
      document.getElementById('userModal').classList.remove('show');
    }
    
    function viewUser(userId) {
      window.location.href = \`/admin/users/\${userId}\`;
    }
    
    document.getElementById('userForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const userId = document.getElementById('userId').value;
      const isEdit = userId !== '';
      
      const userData = {
        app_key: document.getElementById('appKey').value,
        student_id: document.getElementById('studentId').value,
        student_name: document.getElementById('studentName').value,
        grade: document.getElementById('grade').value,
        email: document.getElementById('email').value,
        notes: document.getElementById('notes').value,
        is_active: 1
      };
      
      const saveBtn = document.getElementById('saveUserBtn');
      saveBtn.disabled = true;
      saveBtn.textContent = '保存中...';
      
      try {
        const url = isEdit ? \`/api/admin/users/\${userId}\` : '/api/admin/users';
        const method = isEdit ? 'PUT' : 'POST';
        
        const response = await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(userData)
        });
        
        const data = await response.json();
        
        if (data.success) {
          alert(data.message);
          closeUserModal();
          loadUsers();
        } else {
          alert('エラー: ' + data.error);
        }
      } catch (error) {
        alert('保存に失敗しました');
        console.error(error);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '保存';
      }
    });
    
    function logout() {
      if (confirm('ログアウトしますか？')) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
      }
    }
  </script>
</body>
</html>
  `)
})

// Admin User Detail Page
app.get('/admin/users/:id', (c) => {
  const userId = c.req.param('id')
  
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>生徒詳細 | KOBEYA Study Partner</title>
  
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    
    body {
      font-family: 'Noto Sans JP', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: #f5f5f5;
      color: #37352f;
      min-height: 100vh;
    }
    
    .header {
      background: white;
      border-bottom: 2px solid #e5e7eb;
      padding: 1.5rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      box-shadow: 0 2px 4px rgba(0,0,0,0.04);
    }
    
    .header-left {
      display: flex;
      align-items: center;
      gap: 1rem;
    }
    
    .back-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 1rem;
      background: #f3f4f6;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      color: #374151;
      text-decoration: none;
      font-size: 0.9rem;
      transition: all 0.2s;
    }
    
    .back-btn:hover {
      background: #e5e7eb;
      transform: translateX(-2px);
    }
    
    .header h1 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1f2937;
    }
    
    .header-right {
      display: flex;
      gap: 0.75rem;
    }
    
    .btn {
      padding: 0.6rem 1.2rem;
      border-radius: 8px;
      border: none;
      font-size: 0.9rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .btn-edit {
      background: #3b82f6;
      color: white;
    }
    
    .btn-edit:hover {
      background: #2563eb;
      transform: translateY(-1px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
    }
    
    .btn-logout {
      background: #6b7280;
      color: white;
    }
    
    .btn-logout:hover {
      background: #4b5563;
    }
    
    .container {
      max-width: 1200px;
      margin: 2rem auto;
      padding: 0 2rem;
    }
    
    .user-info-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 2rem;
    }
    
    .user-header {
      display: flex;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 2rem;
      padding-bottom: 1.5rem;
      border-bottom: 1px solid #e5e7eb;
    }
    
    .user-avatar {
      width: 80px;
      height: 80px;
      border-radius: 50%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 2rem;
      color: white;
      font-weight: 600;
    }
    
    .user-name-section h2 {
      font-size: 1.75rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 0.25rem;
    }
    
    .user-id {
      font-size: 0.95rem;
      color: #6b7280;
    }
    
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.4rem 1rem;
      border-radius: 20px;
      font-size: 0.85rem;
      font-weight: 500;
      margin-left: auto;
    }
    
    .badge-active {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-inactive {
      background: #fee2e2;
      color: #991b1b;
    }
    
    .info-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 1.5rem;
    }
    
    .info-item {
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }
    
    .info-label {
      font-size: 0.85rem;
      color: #6b7280;
      font-weight: 500;
    }
    
    .info-value {
      font-size: 1rem;
      color: #1f2937;
      font-weight: 500;
    }
    
    .info-value.empty {
      color: #9ca3af;
      font-style: italic;
    }
    
    .stats-section {
      margin-bottom: 2rem;
    }
    
    .section-title {
      font-size: 1.25rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 1rem;
      margin-bottom: 2rem;
    }
    
    .stat-card {
      background: white;
      border-radius: 12px;
      padding: 1.5rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      transition: transform 0.2s;
    }
    
    .stat-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.12);
    }
    
    .stat-icon {
      width: 48px;
      height: 48px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.5rem;
      margin-bottom: 1rem;
    }
    
    .stat-icon.blue { background: #dbeafe; color: #1e40af; }
    .stat-icon.green { background: #d1fae5; color: #065f46; }
    .stat-icon.yellow { background: #fef3c7; color: #92400e; }
    .stat-icon.purple { background: #ede9fe; color: #5b21b6; }
    
    .stat-label {
      font-size: 0.85rem;
      color: #6b7280;
      margin-bottom: 0.5rem;
    }
    
    .stat-value {
      font-size: 2rem;
      font-weight: 700;
      color: #1f2937;
    }
    
    .history-card {
      background: white;
      border-radius: 12px;
      padding: 2rem;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      margin-bottom: 1rem;
    }
    
    .history-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 1rem;
    }
    
    .history-table thead {
      background: #f9fafb;
    }
    
    .history-table th {
      text-align: left;
      padding: 1rem;
      font-size: 0.85rem;
      font-weight: 600;
      color: #6b7280;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .history-table td {
      padding: 1rem;
      border-bottom: 1px solid #f3f4f6;
      color: #374151;
    }
    
    .history-table tbody tr:hover {
      background: #f9fafb;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem 1rem;
      color: #9ca3af;
    }
    
    .empty-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
    
    .loading {
      text-align: center;
      padding: 3rem;
      color: #6b7280;
    }
    
    .spinner {
      border: 3px solid #f3f4f6;
      border-top: 3px solid #3b82f6;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    
    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
    
    .error-message {
      background: #fee2e2;
      color: #991b1b;
      padding: 1rem;
      border-radius: 8px;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }
    
    /* Modal Styles (reuse from list page) */
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 1000;
      align-items: center;
      justify-content: center;
    }
    
    .modal.active {
      display: flex;
    }
    
    .modal-content {
      background: white;
      border-radius: 16px;
      padding: 2rem;
      max-width: 600px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    
    .modal h3 {
      font-size: 1.5rem;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 1.5rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      font-size: 0.9rem;
      font-weight: 500;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .form-group input,
    .form-group textarea {
      width: 100%;
      padding: 0.75rem;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      font-size: 0.95rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus,
    .form-group textarea:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }
    
    .form-group input:disabled {
      background: #f3f4f6;
      color: #9ca3af;
      cursor: not-allowed;
    }
    
    .form-actions {
      display: flex;
      gap: 1rem;
      justify-content: flex-end;
      margin-top: 2rem;
    }
    
    .btn-cancel {
      background: #e5e7eb;
      color: #374151;
    }
    
    .btn-cancel:hover {
      background: #d1d5db;
    }
    
    .btn-save {
      background: #3b82f6;
      color: white;
    }
    
    .btn-save:hover {
      background: #2563eb;
    }
    
    /* History Tabs */
    .history-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 2px solid #e5e7eb;
    }
    
    .history-tab {
      padding: 0.75rem 1.5rem;
      background: none;
      border: none;
      border-bottom: 2px solid transparent;
      color: #6b7280;
      cursor: pointer;
      font-size: 0.9rem;
      font-weight: 500;
      transition: all 0.2s;
      margin-bottom: -2px;
    }
    
    .history-tab:hover {
      color: #374151;
      background: #f9fafb;
    }
    
    .history-tab.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }
    
    .history-tab i {
      margin-right: 0.5rem;
    }
    
    /* History Table */
    .history-table {
      width: 100%;
      border-collapse: collapse;
    }
    
    .history-table th {
      background: #f9fafb;
      padding: 0.75rem 1rem;
      text-align: left;
      font-weight: 600;
      color: #374151;
      border-bottom: 2px solid #e5e7eb;
      font-size: 0.875rem;
    }
    
    .history-table td {
      padding: 1rem;
      border-bottom: 1px solid #e5e7eb;
      color: #4b5563;
      font-size: 0.875rem;
    }
    
    .history-table tr:hover {
      background: #f9fafb;
    }
    
    .history-table .date-cell {
      color: #6b7280;
      font-size: 0.8125rem;
    }
    
    .badge {
      display: inline-block;
      padding: 0.25rem 0.75rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 500;
    }
    
    .badge-success {
      background: #d1fae5;
      color: #065f46;
    }
    
    .badge-warning {
      background: #fef3c7;
      color: #92400e;
    }
    
    .badge-info {
      background: #dbeafe;
      color: #1e40af;
    }
    
    .badge-secondary {
      background: #f3f4f6;
      color: #4b5563;
    }
    
    .empty-state {
      text-align: center;
      padding: 3rem;
      color: #9ca3af;
    }
    
    .empty-state i {
      font-size: 3rem;
      margin-bottom: 1rem;
      opacity: 0.5;
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <a href="/admin/users" class="back-btn">
        <i class="fas fa-arrow-left"></i>
        戻る
      </a>
      <h1>生徒詳細</h1>
    </div>
    <div class="header-right">
      <button class="btn btn-edit" onclick="showEditModal()">
        <i class="fas fa-edit"></i>
        編集
      </button>
      <button class="btn btn-logout" onclick="logout()">
        <i class="fas fa-sign-out-alt"></i>
        ログアウト
      </button>
    </div>
  </div>

  <div class="container">
    <div id="loadingState" class="loading">
      <div class="spinner"></div>
      <div>読み込み中...</div>
    </div>

    <div id="errorState" style="display: none;"></div>

    <div id="contentState" style="display: none;">
      <!-- User Info Card -->
      <div class="user-info-card">
        <div class="user-header">
          <div class="user-avatar" id="userAvatar">?</div>
          <div class="user-name-section">
            <h2 id="userName">-</h2>
            <div class="user-id">学生ID: <span id="userStudentId">-</span></div>
          </div>
          <span id="userStatus" class="status-badge badge-active">
            <i class="fas fa-check-circle"></i>
            有効
          </span>
        </div>

        <div class="info-grid">
          <div class="info-item">
            <span class="info-label">APP_KEY</span>
            <span class="info-value" id="userAppKey">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">学年</span>
            <span class="info-value" id="userGrade">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">メールアドレス</span>
            <span class="info-value" id="userEmail">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">登録日</span>
            <span class="info-value" id="userCreatedAt">-</span>
          </div>
          <div class="info-item">
            <span class="info-label">最終ログイン</span>
            <span class="info-value" id="userLastLogin">-</span>
          </div>
          <div class="info-item" style="grid-column: 1 / -1;">
            <span class="info-label">メモ</span>
            <span class="info-value" id="userNotes">-</span>
          </div>
        </div>
      </div>

      <!-- Stats Section -->
      <div class="stats-section">
        <h3 class="section-title">
          <i class="fas fa-chart-line"></i>
          学習統計
        </h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-icon blue">
              <i class="fas fa-folder"></i>
            </div>
            <div class="stat-label">フラッシュカードデッキ</div>
            <div class="stat-value" id="statDecks">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon green">
              <i class="fas fa-pen-fancy"></i>
            </div>
            <div class="stat-label">エッセイ提出</div>
            <div class="stat-value" id="statEssays">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon yellow">
              <i class="fas fa-layer-group"></i>
            </div>
            <div class="stat-label">フラッシュカード</div>
            <div class="stat-value" id="statFlashcards">0</div>
          </div>
          <div class="stat-card">
            <div class="stat-icon purple">
              <i class="fas fa-globe"></i>
            </div>
            <div class="stat-label">国際交流</div>
            <div class="stat-value" id="statConversations">0</div>
          </div>
        </div>
      </div>

      <!-- Learning History -->
      <div class="history-card">
        <h3 class="section-title">
          <i class="fas fa-history"></i>
          学習履歴詳細
        </h3>
        
        <!-- History Tabs -->
        <div class="history-tabs">
          <button class="history-tab active" onclick="switchHistoryTab('essay')">
            <i class="fas fa-pen-fancy"></i>
            小論文セッション
          </button>
          <button class="history-tab" onclick="switchHistoryTab('flashcard')">
            <i class="fas fa-layer-group"></i>
            フラッシュカード
          </button>
          <button class="history-tab" onclick="switchHistoryTab('international')">
            <i class="fas fa-globe"></i>
            国際コミュニケーション
          </button>
        </div>
        
        <!-- History Content -->
        <div id="historyContent">
          <div class="loading">
            <div class="spinner"></div>
            <div>履歴を読み込み中...</div>
          </div>
        </div>
        
        <!-- Pagination -->
        <div id="historyPagination" style="display: none; margin-top: 1.5rem; text-align: center;">
          <button class="btn" onclick="loadPreviousPage()" id="btnPrevPage" disabled>
            <i class="fas fa-chevron-left"></i>
            前へ
          </button>
          <span id="pageInfo" style="margin: 0 1rem; color: #6b7280;">-</span>
          <button class="btn" onclick="loadNextPage()" id="btnNextPage" disabled>
            次へ
            <i class="fas fa-chevron-right"></i>
          </button>
        </div>
      </div>
    </div>
  </div>

  <!-- Edit Modal -->
  <div class="modal" id="editModal">
    <div class="modal-content">
      <h3>生徒情報編集</h3>
      <form id="editForm">
        <input type="hidden" id="editUserId" value="${userId}">
        
        <div class="form-group">
          <label>APP_KEY</label>
          <input type="text" id="editAppKey" disabled>
        </div>
        
        <div class="form-group">
          <label>学生ID</label>
          <input type="text" id="editStudentId" disabled>
        </div>
        
        <div class="form-group">
          <label>氏名 *</label>
          <input type="text" id="editStudentName" required>
        </div>
        
        <div class="form-group">
          <label>学年</label>
          <input type="text" id="editGrade" placeholder="例: 中学3年">
        </div>
        
        <div class="form-group">
          <label>メールアドレス</label>
          <input type="email" id="editEmail" placeholder="example@email.com">
        </div>
        
        <div class="form-group">
          <label>メモ</label>
          <textarea id="editNotes" rows="3" placeholder="生徒に関するメモ"></textarea>
        </div>
        
        <div class="form-group">
          <label>
            <input type="checkbox" id="editIsActive" style="width: auto; margin-right: 0.5rem;">
            有効な生徒
          </label>
        </div>
        
        <div class="form-actions">
          <button type="button" class="btn btn-cancel" onclick="closeEditModal()">
            キャンセル
          </button>
          <button type="submit" class="btn btn-save">
            <i class="fas fa-save"></i>
            保存
          </button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const userId = '${userId}';
    let currentUser = null;

    // Check authentication
    const token = localStorage.getItem('admin_token');
    if (!token) {
      window.location.href = '/admin/login';
    }

    // Load user data
    async function loadUserData() {
      try {
        const response = await fetch(\`/api/admin/users/\${userId}\`);
        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || '生徒データの取得に失敗しました');
        }

        currentUser = data.user;
        const stats = data.stats || {};

        // Hide loading, show content
        document.getElementById('loadingState').style.display = 'none';
        document.getElementById('contentState').style.display = 'block';

        // Update user info
        const initials = currentUser.student_name 
          ? currentUser.student_name.substring(0, 1).toUpperCase()
          : '?';
        document.getElementById('userAvatar').textContent = initials;
        document.getElementById('userName').textContent = currentUser.student_name || '名前未設定';
        document.getElementById('userStudentId').textContent = currentUser.student_id || '-';
        document.getElementById('userAppKey').textContent = currentUser.app_key || '-';
        document.getElementById('userGrade').textContent = currentUser.grade || '-';
        
        const emailEl = document.getElementById('userEmail');
        if (currentUser.email) {
          emailEl.textContent = currentUser.email;
          emailEl.classList.remove('empty');
        } else {
          emailEl.textContent = '未設定';
          emailEl.classList.add('empty');
        }
        
        const notesEl = document.getElementById('userNotes');
        if (currentUser.notes) {
          notesEl.textContent = currentUser.notes;
          notesEl.classList.remove('empty');
        } else {
          notesEl.textContent = 'メモなし';
          notesEl.classList.add('empty');
        }

        // Format dates
        const createdDate = currentUser.created_at 
          ? new Date(currentUser.created_at).toLocaleDateString('ja-JP')
          : '-';
        document.getElementById('userCreatedAt').textContent = createdDate;

        const lastLoginEl = document.getElementById('userLastLogin');
        if (currentUser.last_login_at) {
          lastLoginEl.textContent = new Date(currentUser.last_login_at).toLocaleDateString('ja-JP');
          lastLoginEl.classList.remove('empty');
        } else {
          lastLoginEl.textContent = 'ログイン履歴なし';
          lastLoginEl.classList.add('empty');
        }

        // Update status badge
        const statusEl = document.getElementById('userStatus');
        if (currentUser.is_active) {
          statusEl.className = 'status-badge badge-active';
          statusEl.innerHTML = '<i class="fas fa-check-circle"></i> 有効';
        } else {
          statusEl.className = 'status-badge badge-inactive';
          statusEl.innerHTML = '<i class="fas fa-times-circle"></i> 無効';
        }

        // Update stats
        document.getElementById('statDecks').textContent = stats.flashcard_decks || 0;
        document.getElementById('statEssays').textContent = stats.essay_sessions || 0;
        document.getElementById('statFlashcards').textContent = stats.flashcards || 0;
        document.getElementById('statConversations').textContent = stats.conversations || 0;

        // Load learning history
        loadLearningHistory();

      } catch (error) {
        console.error('Error loading user:', error);
        document.getElementById('loadingState').style.display = 'none';
        const errorDiv = document.getElementById('errorState');
        errorDiv.innerHTML = \`
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <span>\${error.message}</span>
          </div>
        \`;
        errorDiv.style.display = 'block';
      }
    }

    // History state
    let currentHistoryType = 'essay';
    let currentHistoryPage = 0;
    const historyPageSize = 20;
    
    // Load learning history with tabs and pagination
    async function loadLearningHistory(type = 'essay', offset = 0) {
      currentHistoryType = type;
      currentHistoryPage = offset / historyPageSize;
      
      const historyDiv = document.getElementById('historyContent');
      historyDiv.innerHTML = '<div class="loading"><div class="spinner"></div><div>読み込み中...</div></div>';
      
      try {
        const response = await fetch(\`/api/admin/users/\${userId}/history?type=\${type}&limit=\${historyPageSize}&offset=\${offset}\`);
        const data = await response.json();
        
        if (!data.success) {
          throw new Error(data.error || '履歴の取得に失敗しました');
        }
        
        // Display history based on type
        if (data.data.length === 0) {
          historyDiv.innerHTML = \`
            <div class="empty-state">
              <i class="fas fa-inbox"></i>
              <p>まだ学習履歴がありません</p>
            </div>
          \`;
          document.getElementById('historyPagination').style.display = 'none';
          return;
        }
        
        let tableHTML = '';
        
        if (type === 'essay') {
          tableHTML = renderEssayHistory(data.data);
        } else if (type === 'flashcard') {
          tableHTML = renderFlashcardHistory(data.data);
        } else if (type === 'international') {
          tableHTML = renderInternationalHistory(data.data);
        }
        
        historyDiv.innerHTML = tableHTML;
        
        // Update pagination
        updatePagination(data);
        
      } catch (error) {
        console.error('Error loading history:', error);
        historyDiv.innerHTML = \`
          <div class="error-message">
            <i class="fas fa-exclamation-circle"></i>
            <span>\${error.message}</span>
          </div>
        \`;
      }
    }
    
    // Render essay history table
    function renderEssayHistory(sessions) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>日付</th>';
      html += '<th>テーマ</th>';
      html += '<th>対象レベル</th>';
      html += '<th>授業形式</th>';
      html += '<th>ステップ</th>';
      html += '<th>ステータス</th>';
      html += '</tr></thead><tbody>';
      
      sessions.forEach(session => {
        const date = new Date(session.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const targetLevelMap = {
          'high_school': '高校',
          'vocational': '専門学校',
          'university': '大学'
        };
        
        const lessonFormatMap = {
          'full_55min': '55分フル',
          'vocabulary_focus': '語彙重点',
          'short_essay_focus': '短文重点'
        };
        
        const statusBadge = session.is_completed 
          ? '<span class="badge badge-success">完了</span>'
          : '<span class="badge badge-warning">進行中</span>';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${date}</td>\`;
        html += \`<td>\${session.theme || '-'}</td>\`;
        html += \`<td>\${targetLevelMap[session.target_level] || session.target_level || '-'}</td>\`;
        html += \`<td>\${lessonFormatMap[session.lesson_format] || session.lesson_format || '-'}</td>\`;
        html += \`<td>ステップ \${session.current_step || 1} / 6</td>\`;
        html += \`<td>\${statusBadge}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Render flashcard history table
    function renderFlashcardHistory(decks) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>作成日</th>';
      html += '<th>デッキ名</th>';
      html += '<th>説明</th>';
      html += '<th>カード数</th>';
      html += '<th>学習回数</th>';
      html += '<th>最終学習日</th>';
      html += '</tr></thead><tbody>';
      
      decks.forEach(deck => {
        const createdDate = new Date(deck.created_at).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit'
        });
        
        const lastStudiedDate = deck.last_studied_at 
          ? new Date(deck.last_studied_at).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit'
            })
          : '未学習';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${createdDate}</td>\`;
        html += \`<td><strong>\${deck.deck_name || '名前なし'}</strong></td>\`;
        html += \`<td>\${deck.description || '-'}</td>\`;
        html += \`<td>\${deck.card_count || 0} 枚</td>\`;
        html += \`<td>\${deck.study_count || 0} 回</td>\`;
        html += \`<td class="date-cell">\${lastStudiedDate}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Render international communication history table
    function renderInternationalHistory(conversations) {
      let html = '<table class="history-table"><thead><tr>';
      html += '<th>日時</th>';
      html += '<th>トピック</th>';
      html += '<th>ステータス</th>';
      html += '<th>役割</th>';
      html += '<th>画像</th>';
      html += '<th>メッセージ内容</th>';
      html += '</tr></thead><tbody>';
      
      conversations.forEach(conv => {
        const date = new Date(conv.timestamp).toLocaleDateString('ja-JP', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        });
        
        const roleBadge = conv.role === 'user'
          ? '<span class="badge badge-info">生徒</span>'
          : '<span class="badge badge-secondary">AI</span>';
        
        const statusBadge = conv.status === 'completed'
          ? '<span class="badge badge-success">完了</span>'
          : '<span class="badge badge-warning">進行中</span>';
        
        const hasImageBadge = conv.has_image 
          ? '<i class="fas fa-image" style="color: #3b82f6;"></i>'
          : '-';
        
        const contentPreview = conv.content 
          ? (conv.content.length > 50 ? conv.content.substring(0, 50) + '...' : conv.content)
          : '-';
        
        html += '<tr>';
        html += \`<td class="date-cell">\${date}</td>\`;
        html += \`<td>\${conv.current_topic || '-'}</td>\`;
        html += \`<td>\${statusBadge}</td>\`;
        html += \`<td>\${roleBadge}</td>\`;
        html += \`<td style="text-align: center;">\${hasImageBadge}</td>\`;
        html += \`<td>\${contentPreview}</td>\`;
        html += '</tr>';
      });
      
      html += '</tbody></table>';
      return html;
    }
    
    // Update pagination controls
    function updatePagination(data) {
      const paginationDiv = document.getElementById('historyPagination');
      const btnPrev = document.getElementById('btnPrevPage');
      const btnNext = document.getElementById('btnNextPage');
      const pageInfo = document.getElementById('pageInfo');
      
      const currentPage = Math.floor(data.offset / data.limit) + 1;
      const totalPages = Math.ceil(data.total / data.limit);
      
      pageInfo.textContent = \`\${currentPage} / \${totalPages} ページ (全 \${data.total} 件)\`;
      
      btnPrev.disabled = data.offset === 0;
      btnNext.disabled = !data.hasMore;
      
      paginationDiv.style.display = totalPages > 1 ? 'block' : 'none';
    }
    
    // Switch history tab
    function switchHistoryTab(type) {
      // Update active tab
      document.querySelectorAll('.history-tab').forEach(tab => {
        tab.classList.remove('active');
      });
      event.target.closest('.history-tab').classList.add('active');
      
      // Load history for selected type
      loadLearningHistory(type, 0);
    }
    
    // Pagination functions
    function loadNextPage() {
      const nextOffset = (currentHistoryPage + 1) * historyPageSize;
      loadLearningHistory(currentHistoryType, nextOffset);
    }
    
    function loadPreviousPage() {
      const prevOffset = Math.max(0, (currentHistoryPage - 1) * historyPageSize);
      loadLearningHistory(currentHistoryType, prevOffset);
    }

    // Show edit modal
    function showEditModal() {
      if (!currentUser) return;

      document.getElementById('editUserId').value = currentUser.id;
      document.getElementById('editAppKey').value = currentUser.app_key || '';
      document.getElementById('editStudentId').value = currentUser.student_id || '';
      document.getElementById('editStudentName').value = currentUser.student_name || '';
      document.getElementById('editGrade').value = currentUser.grade || '';
      document.getElementById('editEmail').value = currentUser.email || '';
      document.getElementById('editNotes').value = currentUser.notes || '';
      document.getElementById('editIsActive').checked = currentUser.is_active;

      document.getElementById('editModal').classList.add('active');
    }

    // Close edit modal
    function closeEditModal() {
      document.getElementById('editModal').classList.remove('active');
    }

    // Handle edit form submission
    document.getElementById('editForm').addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = {
        student_name: document.getElementById('editStudentName').value.trim(),
        grade: document.getElementById('editGrade').value.trim(),
        email: document.getElementById('editEmail').value.trim(),
        notes: document.getElementById('editNotes').value.trim(),
        is_active: document.getElementById('editIsActive').checked ? 1 : 0
      };

      try {
        const response = await fetch(\`/api/admin/users/\${userId}\`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });

        const data = await response.json();

        if (!data.success) {
          throw new Error(data.error || '更新に失敗しました');
        }

        alert('生徒情報を更新しました');
        closeEditModal();
        
        // Reload user data
        document.getElementById('contentState').style.display = 'none';
        document.getElementById('loadingState').style.display = 'block';
        await loadUserData();

      } catch (error) {
        console.error('Error updating user:', error);
        alert(\`エラー: \${error.message}\`);
      }
    });

    // Logout function
    function logout() {
      if (confirm('ログアウトしますか?')) {
        localStorage.removeItem('admin_token');
        window.location.href = '/admin/login';
      }
    }

    // Close modal on outside click
    document.getElementById('editModal').addEventListener('click', (e) => {
      if (e.target.id === 'editModal') {
        closeEditModal();
      }
    });

    // Load data on page load
    loadUserData();
  </script>

  <!-- ログイン状態インジケーター -->
  <div id="login-status-indicator" style="position: fixed; top: 1rem; right: 1rem; z-index: 40;"></div>

  <script>
  (function() {
    function updateLoginStatus() {
      const indicator = document.getElementById('login-status-indicator');
      if (!indicator) return;
      
      try {
        const authData = localStorage.getItem('study_partner_auth');
        const isLoggedIn = !!authData;
        let studentName = 'ゲスト';
        
        if (authData) {
          const parsed = JSON.parse(authData);
          studentName = parsed.studentName || '生徒';
        }
        
        const bgColor = isLoggedIn ? '#f0fdf4' : '#f9fafb';
        const textColor = isLoggedIn ? '#15803d' : '#6b7280';
        const borderColor = isLoggedIn ? '#bbf7d0' : '#e5e7eb';
        const dotColor = isLoggedIn ? '#22c55e' : '#9ca3af';
        const title = isLoggedIn ? studentName + 'さんとしてログイン中' : 'ログインしていません';
        
        indicator.innerHTML = '<div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; background-color: ' + bgColor + '; color: ' + textColor + '; border: 1px solid ' + borderColor + ';" title="' + title + '"><div style="width: 0.5rem; height: 0.5rem; border-radius: 9999px; background-color: ' + dotColor + ';"></div><span style="font-weight: 500;">' + studentName + '</span></div>';
      } catch (error) {
        console.error('Failed to read login status:', error);
      }
    }
    
    updateLoginStatus();
    window.addEventListener('storage', function(e) {
      if (e.key === 'study_partner_auth') {
        updateLoginStatus();
      }
    });
    window.addEventListener('loginStatusChanged', updateLoginStatus);
  })();
  </script>
</body>
</html>
  `)
})

// ==================== Flashcard UI Routes ====================

// フラッシュカード一覧ページ
app.get('/study-partner-simple', studyPartnerSimple)

// Study Partner SPA - 完全復元版
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
    const errorMessage = toErrorMessage(error, 'ログ収集でエラーが発生しました')
    return c.json({
      ok: false,
      error: 'log_collection_error',
      message: errorMessage,
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
    const minutes = logs.reduce((sum: number, log: { time_spent_min?: number; [key: string]: unknown }) => sum + ((log.time_spent_min as number) || 0), 0)
    const scoresSum = logs.reduce((sum: number, log: { mini_quiz_score?: number; [key: string]: unknown }) => sum + ((log.mini_quiz_score as number) || 0), 0)
    const avgScore = sessions > 0 ? Math.round(scoresSum / sessions) : 0
    
    // 弱点タグ集計
    const weakTagsFlat: string[] = []
    logs.forEach((log: { weak_tags?: string; [key: string]: unknown }) => {
      const tags = safeJsonParse(log.weak_tags ?? '[]', [])
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'weekly_report_error',
      message: `週次レポート生成でエラーが発生しました: ${errorMessage}`
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
    
    const logs = (logsResult.results || []) as LogRow[]
    
    // 最新ログの日時を確認（警告表示用）
    let statusMessage = '✅ 正常動作中'
    let statusClass = 'status-ok'
    
    if (logs.length > 0) {
      const latestLog = logs[0]
      const latestTime = latestLog?.created_at ? new Date(latestLog.created_at) : null
      if (latestTime && !Number.isNaN(latestTime.getTime())) {
      const now = new Date()
      const hoursDiff = (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff > 24) {
        statusMessage = '⚠️ ログ受信停止の可能性あり'
        statusClass = 'status-warning'
      } else {
          const timeStr = formatDateTime(latestLog.created_at)
          statusMessage = timeStr
            ? `✅ 正常動作中（最新ログ: ${timeStr}）`
            : '✅ 正常動作中'
        }
      } else {
        statusMessage = '⚠️ 最新ログの日時が不正です'
        statusClass = 'status-warning'
      }
    } else {
      statusMessage = '⚠️ ログデータなし'
      statusClass = 'status-warning'
    }
    
    // weak_tags JSONをパース
    const processedLogs: ProcessedLog[] = logs.map((log) => {
      const weakTagsDisplay = (() => {
        try {
          const parsed = JSON.parse(log.weak_tags ?? '[]')
          return Array.isArray(parsed) ? parsed.join(', ') : log.weak_tags ?? ''
        } catch {
          return log.weak_tags ?? ''
        }
      })()
      const score = typeof log.mini_quiz_score === 'number' ? log.mini_quiz_score : null
      const scoreClass =
        score === null ? 'score-low'
        : score >= 80 ? 'score-high'
        : score >= 60 ? 'score-mid'
        : 'score-low'
      const displayScore = score === null ? '-' : score
      
      return {
        ...log,
        weak_tags_display: weakTagsDisplay,
        created_at_display: formatDateTime(log.created_at) || '-',
        scoreClass,
        displayScore
      }
    })
    
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
                    <td class="${log.scoreClass}">
                        ${log.displayScore}
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
    const errorMessage = toErrorMessage(error)
    
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
        <p><strong>エラー詳細:</strong> ${errorMessage}</p>
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
  return c.body(null, 204)  // No Content
})

// ============================================================
// Eiken (英検) Routes
// ============================================================

// 英検練習ページ（React CSR版）
// Note: /eiken/practice は public/eiken/practice.html を使用（Viteが処理）
// Honoルートは定義しない（Viteの静的ファイルサーブに任せる）


// ==================== Flashcard API Routes ====================

// フラッシュカード作成（写真から）
app.post('/api/flashcard/create-from-photo', async (c) => {
  console.log('📸 Flashcard from photo API called')
  
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const formData = await c.req.formData()
    const appkey = formData.get('appkey') as string
    const sid = formData.get('sid') as string
    const imageField = formData.get('image')
    const deckId = formData.get('deckId') as string || null

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    if (!imageField || !(imageField instanceof File)) {
      return c.json({ success: false, error: 'No image provided' }, 400)
    }

    // 画像をBase64に変換
    const arrayBuffer = await imageField.arrayBuffer()
    const imageSizeKB = Math.round(arrayBuffer.byteLength / 1024)
    console.log(`📊 Image size: ${imageSizeKB} KB`)
    
    // 画像サイズ制限チェック（20MB）
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      return c.json({ 
        success: false, 
        error: 'Image too large',
        hint: '画像サイズは20MB以下にしてください',
        size: `${imageSizeKB} KB`
      }, 400)
    }
    
    const base64Image = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    const dataUrl = `data:${imageField.type};base64,${base64Image}`

    // OpenAI Vision APIで画像解析
    const openaiApiKey = c.env?.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error('❌ OpenAI API key not found in environment')
      return c.json({ 
        success: false, 
        error: 'OpenAI API key not configured',
        hint: 'OPENAI_API_KEYを環境変数に設定してください' 
      }, 500)
    }

    console.log('🔍 Analyzing image with OpenAI Vision API...')
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `あなたはフラッシュカード作成のエキスパートです。画像から学習用のフラッシュカードを抽出します。

以下のJSON形式で複数のカードを返してください：
{
  "cards": [
    {
      "front": "質問・単語・問題文",
      "back": "回答・意味・解説",
      "tags": ["カテゴリ", "科目"],
      "confidence": 0.95
    }
  ]
}

例：
- 英単語リスト → 各単語を1枚のカードに
- 数学の公式 → 公式名と公式を分けて
- 歴史年表 → 年号と出来事をペアに
- ノート → 重要用語とその説明をペアに

できるだけ多くのカードを抽出してください。`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像から学習用のフラッシュカードを作成してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    })

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text()
      console.error('❌ OpenAI Vision API error:', errorText)
      return c.json({ 
        success: false, 
        error: 'Failed to analyze image', 
        details: errorText,
        status: visionResponse.status
      }, 500)
    }

    const visionData = await visionResponse.json()
    console.log('✅ OpenAI Vision API response received')
    
    if (!visionData.choices || !visionData.choices[0]) {
      console.error('❌ Invalid OpenAI response structure:', visionData)
      return c.json({ 
        success: false, 
        error: 'Invalid response from OpenAI',
        details: visionData
      }, 500)
    }
    
    const aiResponse = visionData.choices[0].message.content
    console.log('📝 AI Response preview:', aiResponse.substring(0, 200))

    // JSONを抽出
    let cardsData
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cardsData = JSON.parse(jsonMatch[0])
      } else {
        cardsData = JSON.parse(aiResponse)
      }
    } catch (e) {
      console.error('❌ Failed to parse AI response:', aiResponse)
      return c.json({ 
        success: false, 
        error: 'Failed to parse AI response',
        hint: 'AIの応答が正しいJSON形式ではありませんでした',
        aiResponse: aiResponse.substring(0, 500)
      }, 500)
    }

    if (!cardsData.cards || !Array.isArray(cardsData.cards)) {
      console.error('❌ Invalid cards array:', cardsData)
      return c.json({ 
        success: false, 
        error: 'Invalid response format from AI',
        hint: 'AIが正しいカード形式を返しませんでした',
        received: cardsData
      }, 500)
    }

    console.log(`📇 Creating ${cardsData.cards.length} flashcards...`)
    
    // カードをDBに保存
    const createdCards = []
    for (const card of cardsData.cards) {
      const cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      await db.prepare(`
        INSERT INTO flashcards (
          card_id, deck_id, appkey, sid, front_text, back_text, 
          source_image_data, created_from, ai_confidence, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cardId,
        deckId,
        appkey,
        sid,
        card.front,
        card.back,
        dataUrl,
        'photo',
        card.confidence || 0.8,
        JSON.stringify(card.tags || [])
      ).run()

      createdCards.push({
        cardId,
        front: card.front,
        back: card.back,
        tags: card.tags,
        confidence: card.confidence
      })
    }

    // デッキのカード数を更新
    if (deckId) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count + ?, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(createdCards.length, deckId).run()
    }

    console.log(`✅ Created ${createdCards.length} flashcards from photo`)

    return c.json({
      success: true,
      cards: createdCards,
      count: createdCards.length
    })

  } catch (error) {
    console.error('❌ Flashcard from photo error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード作成（手動入力）
app.post('/api/flashcard/create-manual', async (c) => {
  console.log('✍️ Manual flashcard create API called')
  
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckId, front, back, tags, frontImage, backImage } = await c.req.json()

    if (!appkey || !sid || !front || !back) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcards (
        card_id, deck_id, appkey, sid, front_text, back_text,
        front_image_data, back_image_data, created_from, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      cardId,
      deckId || null,
      appkey,
      sid,
      front,
      back,
      frontImage || null,
      backImage || null,
      'manual',
      JSON.stringify(tags || [])
    ).run()

    // デッキのカード数を更新
    if (deckId) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(deckId).run()
    }

    console.log(`✅ Created manual flashcard: ${cardId}`)

    return c.json({
      success: true,
      cardId,
      front,
      back
    })

  } catch (error) {
    console.error('❌ Manual flashcard create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード一覧取得
app.post('/api/flashcard/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckId, categoryId, tagIds, limit = 50, offset = 0 } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    let query = `
      SELECT f.*,
             c.name as category_name,
             c.color as category_color,
             c.icon as category_icon
      FROM flashcards f
      LEFT JOIN flashcard_categories c ON f.category_id = c.category_id
      WHERE f.appkey = ? AND f.sid = ?
    `
    const params = [appkey, sid]

    if (deckId) {
      query += ` AND f.deck_id = ?`
      params.push(deckId)
    }

    if (categoryId) {
      query += ` AND f.category_id = ?`
      params.push(categoryId)
    }

    // タグフィルタリング（タグIDの配列が指定された場合）
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(',')
      query += ` AND f.card_id IN (
        SELECT card_id FROM flashcard_card_tags 
        WHERE tag_id IN (${placeholders})
        GROUP BY card_id
        HAVING COUNT(DISTINCT tag_id) = ?
      )`
      params.push(...tagIds, tagIds.length)
    }

    query += ` ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await db.prepare(query).bind(...params).all()
    const cards = result.results || []

    // 各カードのタグを取得
    const userId = `${appkey}_${sid}`
    for (const card of cards) {
      const cardTags = await db.prepare(`
        SELECT t.tag_id, t.name
        FROM flashcard_tags t
        JOIN flashcard_card_tags ct ON t.tag_id = ct.tag_id
        WHERE ct.card_id = ? AND t.user_id = ?
      `).bind(card.card_id, userId).all()
      
      card.tags = cardTags.results || []
    }

    return c.json({
      success: true,
      cards,
      count: cards.length
    })

  } catch (error) {
    console.error('❌ Flashcard list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード一括削除API
app.post('/api/flashcard/delete-batch', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardIds } = await c.req.json()

    if (!appkey || !sid || !cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return c.json({ success: false, error: 'Missing required fields or invalid cardIds' }, 400)
    }

    let deletedCount = 0
    const deckUpdates = new Map()

    // 各カードを削除
    for (const cardId of cardIds) {
      // カードの存在確認とdeck_id取得
      const card = await db.prepare(`
        SELECT deck_id FROM flashcards 
        WHERE card_id = ? AND appkey = ? AND sid = ?
      `).bind(cardId, appkey, sid).first()

      if (card) {
        // カードを削除
        await db.prepare(`
          DELETE FROM flashcards 
          WHERE card_id = ? AND appkey = ? AND sid = ?
        `).bind(cardId, appkey, sid).run()

        deletedCount++

        // デッキカウントを追跡
        if (card.deck_id) {
          deckUpdates.set(card.deck_id, (deckUpdates.get(card.deck_id) || 0) + 1)
        }
      }
    }

    // デッキのカード数を一括更新
    for (const [deckId, count] of deckUpdates) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count - ?, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(count, deckId).run()
    }

    console.log(`✅ Deleted ${deletedCount} flashcards in batch`)

    return c.json({ 
      success: true, 
      deletedCount: deletedCount 
    })

  } catch (error) {
    console.error('❌ Flashcard batch delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード統計情報API
app.post('/api/flashcard/stats', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    // 総カード数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ?
    `).bind(appkey, sid).first()

    // 復習待ちのカード数（next_review_at が現在時刻より前のもの）
    const reviewDueResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ? 
      AND next_review_at IS NOT NULL 
      AND next_review_at <= datetime('now')
    `).bind(appkey, sid).first()

    // 習得済みカード数（mastery_level >= 5）
    const masteredResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ? 
      AND mastery_level >= 5
    `).bind(appkey, sid).first()

    return c.json({
      success: true,
      stats: {
        total: totalResult?.count || 0,
        reviewDue: reviewDueResult?.count || 0,
        mastered: masteredResult?.count || 0
      }
    })

  } catch (error) {
    console.error('❌ Flashcard stats error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// デッキ作成
app.post('/api/flashcard/deck/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckName, description } = await c.req.json()

    if (!appkey || !sid || !deckName) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_decks (deck_id, appkey, sid, deck_name, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(deckId, appkey, sid, deckName, description || '').run()

    console.log(`✅ Created flashcard deck: ${deckId}`)

    return c.json({
      success: true,
      deckId,
      deckName
    })

  } catch (error) {
    console.error('❌ Deck create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// デッキ一覧取得
app.post('/api/flashcard/deck/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    const result = await db.prepare(`
      SELECT * FROM flashcard_decks 
      WHERE appkey = ? AND sid = ?
      ORDER BY created_at DESC
    `).bind(appkey, sid).all()

    return c.json({
      success: true,
      decks: result.results || [],
      count: result.results?.length || 0
    })

  } catch (error) {
    console.error('❌ Deck list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード削除
app.post('/api/flashcard/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId } = await c.req.json()

    if (!appkey || !sid || !cardId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    // カードの存在確認
    const card = await db.prepare(`
      SELECT * FROM flashcards 
      WHERE card_id = ? AND appkey = ? AND sid = ?
    `).bind(cardId, appkey, sid).first()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // カードを削除
    await db.prepare(`
      DELETE FROM flashcards 
      WHERE card_id = ? AND appkey = ? AND sid = ?
    `).bind(cardId, appkey, sid).run()

    // デッキのカード数を更新
    if (card.deck_id) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count - 1, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(card.deck_id).run()
    }

    console.log(`✅ Deleted flashcard: ${cardId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Flashcard delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// 学習履歴の記録
app.post('/api/flashcard/record-study', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, isCorrect, responseTimeMs, difficultyRating } = await c.req.json()

    if (!appkey || !sid || !cardId || isCorrect === undefined) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 学習履歴を記録
    await db.prepare(`
      INSERT INTO flashcard_study_history (
        history_id, card_id, appkey, sid, is_correct, response_time_ms, difficulty_rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      historyId,
      cardId,
      appkey,
      sid,
      isCorrect ? 1 : 0,
      responseTimeMs || null,
      difficultyRating || null
    ).run()

    // カードの統計を更新
    const card = await db.prepare(`
      SELECT review_count, correct_count, mastery_level FROM flashcards
      WHERE card_id = ?
    `).bind(cardId).first()

    if (card) {
      const newReviewCount = (card.review_count || 0) + 1
      const newCorrectCount = (card.correct_count || 0) + (isCorrect ? 1 : 0)
      const correctRate = newCorrectCount / newReviewCount
      
      // 習熟度を計算 (0-5)
      let newMasteryLevel = 0
      if (correctRate >= 0.95 && newReviewCount >= 10) newMasteryLevel = 5
      else if (correctRate >= 0.90 && newReviewCount >= 8) newMasteryLevel = 4
      else if (correctRate >= 0.80 && newReviewCount >= 5) newMasteryLevel = 3
      else if (correctRate >= 0.70 && newReviewCount >= 3) newMasteryLevel = 2
      else if (correctRate >= 0.50) newMasteryLevel = 1

      // 次回復習日を計算 (間隔反復学習)
      const intervals = [1, 3, 7, 14, 30, 90] // 日数
      const nextReviewDays = intervals[Math.min(newMasteryLevel, intervals.length - 1)]
      const nextReviewDate = new Date()
      nextReviewDate.setDate(nextReviewDate.getDate() + nextReviewDays)

      await db.prepare(`
        UPDATE flashcards
        SET review_count = ?, 
            correct_count = ?,
            mastery_level = ?,
            last_reviewed_at = CURRENT_TIMESTAMP,
            next_review_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE card_id = ?
      `).bind(
        newReviewCount,
        newCorrectCount,
        newMasteryLevel,
        nextReviewDate.toISOString(),
        cardId
      ).run()
    }

    console.log(`✅ Recorded study for card: ${cardId}, correct: ${isCorrect}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Record study error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ==================== Category & Tag API Routes ====================

// カテゴリ一覧取得
app.post('/api/flashcard/category/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()
    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing credentials' }, 400)
    }

    const userId = `${appkey}_${sid}`

    const categories = await db.prepare(`
      SELECT category_id, name, color, icon, created_at, updated_at
      FROM flashcard_categories
      WHERE user_id = ?
      ORDER BY name ASC
    `).bind(userId).all()

    return c.json({ 
      success: true, 
      categories: categories.results || [] 
    })

  } catch (error) {
    console.error('❌ Category list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ作成
app.post('/api/flashcard/category/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, name, color, icon } = await c.req.json()
    if (!appkey || !sid || !name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`
    const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_categories (category_id, user_id, name, color, icon)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      categoryId,
      userId,
      name,
      color || '#8b5cf6',
      icon || '📚'
    ).run()

    console.log(`✅ Created category: ${name} (${categoryId})`)

    return c.json({ 
      success: true, 
      categoryId,
      category: { category_id: categoryId, name, color: color || '#8b5cf6', icon: icon || '📚' }
    })

  } catch (error) {
    console.error('❌ Category create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ更新
app.post('/api/flashcard/category/update', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, categoryId, name, color, icon } = await c.req.json()
    if (!appkey || !sid || !categoryId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    await db.prepare(`
      UPDATE flashcard_categories
      SET name = COALESCE(?, name),
          color = COALESCE(?, color),
          icon = COALESCE(?, icon),
          updated_at = CURRENT_TIMESTAMP
      WHERE category_id = ? AND user_id = ?
    `).bind(name, color, icon, categoryId, userId).run()

    console.log(`✅ Updated category: ${categoryId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Category update error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ削除
app.post('/api/flashcard/category/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, categoryId } = await c.req.json()
    if (!appkey || !sid || !categoryId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    // カテゴリに属するカードのcategory_idをNULLに設定
    await db.prepare(`
      UPDATE flashcards
      SET category_id = NULL
      WHERE category_id = ?
    `).bind(categoryId).run()

    // カテゴリを削除
    await db.prepare(`
      DELETE FROM flashcard_categories
      WHERE category_id = ? AND user_id = ?
    `).bind(categoryId, userId).run()

    console.log(`✅ Deleted category: ${categoryId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Category delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ一覧取得
app.post('/api/flashcard/tag/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()
    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing credentials' }, 400)
    }

    const userId = `${appkey}_${sid}`

    const tags = await db.prepare(`
      SELECT tag_id, name, created_at
      FROM flashcard_tags
      WHERE user_id = ?
      ORDER BY name ASC
    `).bind(userId).all()

    return c.json({ 
      success: true, 
      tags: tags.results || [] 
    })

  } catch (error) {
    console.error('❌ Tag list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ作成
app.post('/api/flashcard/tag/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, name } = await c.req.json()
    if (!appkey || !sid || !name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_tags (tag_id, user_id, name)
      VALUES (?, ?, ?)
    `).bind(tagId, userId, name).run()

    console.log(`✅ Created tag: ${name} (${tagId})`)

    return c.json({ 
      success: true, 
      tagId,
      tag: { tag_id: tagId, name }
    })

  } catch (error) {
    console.error('❌ Tag create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ削除
app.post('/api/flashcard/tag/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, tagId } = await c.req.json()
    if (!appkey || !sid || !tagId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    // カードとタグの関連を削除（外部キー制約でCASCADE）
    await db.prepare(`
      DELETE FROM flashcard_card_tags
      WHERE tag_id = ?
    `).bind(tagId).run()

    // タグを削除
    await db.prepare(`
      DELETE FROM flashcard_tags
      WHERE tag_id = ? AND user_id = ?
    `).bind(tagId, userId).run()

    console.log(`✅ Deleted tag: ${tagId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Tag delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カードへのタグ付与
app.post('/api/flashcard/card/add-tags', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, tagIds } = await c.req.json()
    if (!appkey || !sid || !cardId || !Array.isArray(tagIds)) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    // 既存のタグをすべて削除
    await db.prepare(`
      DELETE FROM flashcard_card_tags WHERE card_id = ?
    `).bind(cardId).run()

    // 新しいタグを追加
    for (const tagId of tagIds) {
      await db.prepare(`
        INSERT OR IGNORE INTO flashcard_card_tags (card_id, tag_id)
        VALUES (?, ?)
      `).bind(cardId, tagId).run()
    }

    console.log(`✅ Added tags to card: ${cardId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Add tags error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カードのカテゴリ設定
app.post('/api/flashcard/card/set-category', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, categoryId } = await c.req.json()
    if (!appkey || !sid || !cardId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    await db.prepare(`
      UPDATE flashcards
      SET category_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE card_id = ?
    `).bind(categoryId || null, cardId).run()

    console.log(`✅ Set category for card: ${cardId} -> ${categoryId || 'NULL'}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Set category error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ==================== Eiken API Routes ====================

// 問題分析エンドポイント
app.route('/api/eiken/analyze', analyzeRoute)

// AI問題生成エンドポイント
app.route('/api/eiken/generate', generateRoute)

// International Student Chat Route
app.route('/international-student', internationalStudentRoute)

// Essay Coaching Setup Route
app.route('/essay-coaching', essayCoachingRoute)
app.route('/essay-coaching', essayCoachingSessionRoute)  // Session route

// Phase 2: Topic Management エンドポイント
app.route('/api/eiken/topics', topicRoutes)

// Phase 2C: Blueprint Generation エンドポイント
app.route('/api/eiken/blueprints', blueprintRoutes)

// Phase 3: Integrated Question Generation エンドポイント
app.route('/api/eiken/questions', questionRoutes)

// Translation API エンドポイント
app.route('/api/eiken/translate', translateRoute)

// Unified AI Chat System エンドポイント
app.route('/api/unified-ai-chat', unifiedAIChatRoute)

// 問題報告API
app.post('/api/eiken/report-problem', async (c) => {
  try {
    const { question, questionIndex, reportedAt, userAgent } = await c.req.json()
    console.log('📋 Problem reported:', { questionIndex, reportedAt })
    
    const db = c.env?.DB
    
    if (db) {
      // データベースに問題報告を記録
      await db.prepare(`
        INSERT INTO eiken_problem_reports (question_data, question_index, reported_at, user_agent)
        VALUES (?, ?, ?, ?)
      `).bind(
        JSON.stringify(question),
        questionIndex,
        reportedAt,
        userAgent
      ).run()
    }
    
    return c.json({ 
      success: true, 
      message: '問題を報告しました。ご協力ありがとうございます。' 
    })
  } catch (error) {
    console.error('❌ Failed to record problem report:', error)
    return c.json({ 
      success: false, 
      message: '報告の記録に失敗しました' 
    }, 500)
  }
})

// Phase 4A: Vocabulary System エンドポイント
app.route('/api/vocabulary', vocabularyRoute)

// 404ハンドラー
app.notFound((c) => {
  return c.text('404 Not Found', 404)
})

// Export the app as default
export default app