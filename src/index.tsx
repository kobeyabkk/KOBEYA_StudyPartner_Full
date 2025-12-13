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
// Phase 7: generateRoute REMOVED - Use questionRoutes instead
import topicRoutes from './eiken/routes/topic-routes'
import blueprintRoutes from './eiken/routes/blueprint-routes'
import questionRoutes from './eiken/routes/questions'  // Phase 3
import translateRoute from './eiken/routes/translate'  // Translation API
import vocabularyRoute from './eiken/routes/vocabulary'  // Phase 4A: Vocabulary System
import vocabularyApiRoute from './eiken/routes/vocabulary-api'  // CEFR-J Wordlist API
import unifiedAIChatRoute from './api/unified-ai-chat'  // Unified AI Chat System
import dashboardRoute from './routes/dashboard'  // Dashboard Route
import staticRoutes from './routes/static'  // Static files (sitemap, robots, favicon)
import flashcardRoutes from './routes/flashcard'  // Flashcard routes
import essayCoachingRoutes from './routes/essay-coaching'  // Essay Coaching UI routes
import essayAdminRoutes from './routes/essay-admin'  // Essay Admin Dashboard routes
import adminRoutes from './routes/admin'  // Admin UI routes
import aiChatRoutes from './routes/ai-chat'  // AI Chat UI routes
import aiChatV2Routes from './routes/ai-chat-v2'  // AI Chat V2 UI routes
import internationalStudentRoutes from './routes/international-student'  // International Student Chat routes
import flashcardApiRoutes from './api/routes/flashcard'  // Flashcard API routes
import essayApiRoutes from './api/routes/essay'  // Essay Coaching API routes
import adminApiRoutes from './api/routes/admin'  // Admin API routes
import aiChatApiRoutes from './api/routes/ai-chat'  // AI Chat API routes
import vocabularyDemoRoutes from './routes/vocabulary-demo'  // Vocabulary Demo routes

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

// Static routes (sitemap.xml, robots.txt, favicon.ico) moved to src/routes/static.ts

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

// Admin API routes moved to src/api/routes/admin.ts
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

// Essay Coaching API routes moved to src/api/routes/essay.ts


// AI Chat UI routes moved to src/routes/ai-chat.tsx

// Essay Coaching UI routes moved to src/routes/essay-coaching.tsx

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
function extractSubjectFromAnalysis(analysis: string) {
  if (analysis.includes('文節') || analysis.includes('助詞') || analysis.includes('国語')) return '国語'
  if (analysis.includes('数学') || analysis.includes('計算') || analysis.includes('方程式')) return '数学'
  if (analysis.includes('英語') || analysis.includes('English')) return '英語'
  return null
}

// Phase1改善: コンテンツ改善関数（簡易版）
async function improveRegeneratedContent(originalContent: AiAnalysisPayload, issues: string[]) {
  // 実装は次のフェーズで詳細化
  // 現在は問題のあるパターンを検出してフラグを立てるのみ
  console.log('🔧 Content improvement needed for issues:', issues)
  
  if (issues.includes('definition_problem')) {
    console.log('⚠️ Definition problem detected - manual review recommended')
  }
  
  return null // 現在は改善機能なし、警告のみ
}

// セッション更新関数
function updateSessionWithRegeneratedData(session: Session, aiAnalysis: AiAnalysisPayload) {
  // 新しい分析内容で更新
  session.analysis = `【AI学習アシスタント再生成】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🔄 **新しいパターンで学習を始めましょう**<br>別のアプローチで問題に取り組みます！`
  
  // 段階学習ステップを更新
  const regeneratedSteps = Array.isArray(aiAnalysis.steps) ? aiAnalysis.steps : []
  session.steps = regeneratedSteps.map((step: LearningStep, index: number) => ({
      ...step,
    stepNumber: step.stepNumber !== undefined ? step.stepNumber : index,
      completed: false,
      attempts: []
    }))
    
    const regeneratedFirstStep = session.steps[0]
    const regeneratedInstructionPreview =
      typeof regeneratedFirstStep?.instruction === 'string'
        ? `${regeneratedFirstStep.instruction.substring(0, 50)}...`
        : undefined
    console.log('🔄 Updated session steps after regeneration:', {
      stepsCount: session.steps.length,
      firstStepStructure: regeneratedFirstStep
        ? {
            stepNumber: regeneratedFirstStep?.stepNumber,
            instruction: regeneratedInstructionPreview,
            type: regeneratedFirstStep?.type,
            hasOptions: !!regeneratedFirstStep?.options
          }
        : null
    })
  
  // 確認問題を更新
  session.confirmationProblem = aiAnalysis.confirmationProblem
    ? { ...aiAnalysis.confirmationProblem, attempts: [] }
    : null
  
  // 類似問題を更新
  const regeneratedSimilarProblems = Array.isArray(aiAnalysis.similarProblems) ? aiAnalysis.similarProblems : []
  session.similarProblems = regeneratedSimilarProblems.map((problem: Problem) => ({
      ...problem,
      attempts: []
    }))
  
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
    const correctAnswers = Array.isArray(similarProblem.correctAnswers) ? similarProblem.correctAnswers : []
    
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
      isCorrect = correctAnswers.some((correct: string) => 
        normalizedAnswer === correct.trim()
      )
    }
    
    console.log('🎯 Similar problem check:', {
      problemNumber,
      type: similarProblem.type,
      userAnswer: answer,
      expected: similarProblem.type === 'choice' ? similarProblem.correctAnswer : correctAnswers,
      isCorrect
    })
    
    // 回答履歴を記録（attemptsが未定義の場合は初期化）
    if (!similarProblem.attempts) {
      similarProblem.attempts = [];
    }
    if (!similarProblem.attempts) {
      similarProblem.attempts = []
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
    
    const completedProblems = session.similarProblems.filter((p: Problem) => 
      p.attempts && p.attempts.some((attempt: { isCorrect: boolean; [key: string]: unknown }) => attempt.isCorrect)
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
        const firstAnswer = correctAnswers[0] || '模範解答を参考にしてください。'
        feedback = `❌ 正解例: ${firstAnswer}\n\n💡 ${similarProblem.explanation}`
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
    const errorMessage = toErrorMessage(error, '類似問題チェックでエラーが発生しました')
    return c.json({
      ok: false,
      error: 'similar_check_error',
      message: errorMessage,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 段階学習データ生成関数（フォールバック用 - 動的生成失敗時のみ使用）
function generateLearningData(problemType: string): LearningData {
  console.warn('⚠️ generateLearningData fallback invoked. Problem type:', problemType)

  const placeholderStep: LearningStep = {
    stepNumber: 1,
    type: 'choice',
    question: 'サンプル問題：次の中で正しい説明を選びましょう。',
    options: ['A. 例1', 'B. 例2', 'C. 例3', 'D. 例4'],
    correctOption: 'A',
    explanation: '正しい選択肢はAです。ここではプレースホルダーの説明を表示します。'
  }

  const confirmationProblem: Problem = {
    problemNumber: 1,
    type: 'choice',
    question: '確認問題：次のうち正しいものを選びましょう。',
    options: ['A. 選択肢1', 'B. 選択肢2', 'C. 選択肢3', 'D. 選択肢4'],
    correctOption: 'A',
    explanation: 'サンプルの確認問題です。正答はAとしています。'
  }

  return {
    analysis: `【AI学習アシスタント】\n\nAI分析結果の取得に失敗しました。問題タイプ「${problemType}」に応じたサンプル問題で学習を継続します。\n\n1. サンプル問題を解いて理解を確認しましょう。\n2. 分からない場合は解説を確認しながら復習しましょう。\n3. 類題にもチャレンジして理解を定着させましょう。`,
    steps: [placeholderStep],
    confirmationProblem,
    similarProblems: [
      {
        problemNumber: 2,
        type: 'choice',
        question: '類題：次の中から最も適切なものを選びましょう。',
        options: ['A. 類題1', 'B. 類題2', 'C. 類題3', 'D. 類題4'],
        correctOption: 'B',
        explanation: 'サンプル類題です。正答はBとしています。'
      }
    ]
  }
}

// ルートパスハンドラー
app.get('/', (c) => {
  return c.redirect('/study-partner', 302)
})

// Admin UI routes moved to src/routes/admin.tsx
// Study Partner Simple - ログイン修正版
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
// Dashboard route moved to src/routes/dashboard.ts

// =====================================
// 既存システム継続
// =====================================

// Favicon handler moved to src/routes/static.ts

// ============================================================
// Eiken (英検) Routes
// ============================================================

// 英検練習ページ（React CSR版）
// Note: /eiken/practice は public/eiken/practice.html を使用（Viteが処理）
// Honoルートは定義しない（Viteの静的ファイルサーブに任せる）


// Flashcard API routes moved to src/api/routes/flashcard.ts

// ==================== Eiken API Routes ====================

// 問題分析エンドポイント
app.route('/api/eiken/analyze', analyzeRoute)

// Phase 7: Legacy API REMOVED
// Old: app.route('/api/eiken/generate', generateRoute)
// Active API: /api/eiken/questions/generate (mounted via questionRoutes below)

// Phase 2: Topic Management エンドポイント
app.route('/api/eiken/topics', topicRoutes)

// Phase 2C: Blueprint Generation エンドポイント
app.route('/api/eiken/blueprints', blueprintRoutes)

// Phase 3: Integrated Question Generation エンドポイント
app.route('/api/eiken/questions', questionRoutes)

// Translation API エンドポイント
app.route('/api/eiken/translate', translateRoute)

// Vocabulary Notebook API エンドポイント (Phase 4A)
app.route('/api/vocabulary', vocabularyRoute)

// Vocabulary Wordlist API エンドポイント (CEFR-J検索)
app.route('/api/eiken/vocabulary', vocabularyApiRoute)

// Dashboard Route
app.route('/dashboard', dashboardRoute)

// Static Routes (sitemap, robots.txt, favicon)
app.route('/', staticRoutes)

// Flashcard Routes
app.route('/flashcard', flashcardRoutes)

// Essay Coaching UI Routes
app.route('/essay-coaching', essayCoachingRoutes)
app.route('/essay-admin', essayAdminRoutes)

// Admin UI Routes
app.route('/admin', adminRoutes)

// AI Chat UI Routes
app.route('/ai-chat', aiChatRoutes)
app.route('/ai-chat-v2', aiChatV2Routes)
app.route('/international-student', internationalStudentRoutes)

// Flashcard API Routes
app.route('/api/flashcard', flashcardApiRoutes)

// Essay Coaching API Routes
app.route('/api/essay', essayApiRoutes)

// Admin API Routes
app.route('/api/admin', adminApiRoutes)

// AI Chat API Routes
app.route('/api', aiChatApiRoutes)

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