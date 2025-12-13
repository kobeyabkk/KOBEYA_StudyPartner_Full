import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// Type definitions
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

type StudentInfo = {
  studentId: string
  name: string
  grade: number
  subjects: string[]
  weakSubjects: string[]
  lastLogin?: string
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

// Database row types
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

// In-memory session storage
const learningSessions = new Map<string, Session>()

// Helper function to safely parse JSON
function safeJsonParse<T = unknown>(jsonStr: string, fallback: T): T {
  try {
    return JSON.parse(jsonStr) as T
  } catch {
    return fallback
  }
}

// Load session from D1 database
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

// Get or create session (check memory, then D1)
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

// D1 session management helper function
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

// Utility function
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

router.post('/init-session', async (c) => {
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
router.post('/upload-image', async (c) => {
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
router.post('/ocr', async (c) => {
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
router.post('/feedback', async (c) => {
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
    
    // 🆕 問題ライブラリのスコアを更新（Step 4 & Step 5用）
    const problemIdToUpdate = session.essaySession.challengeProblemId || session.essaySession.currentProblemId
    if (problemIdToUpdate && feedback.overallScore && studentId) {
      try {
        const { updateProblemScore } = await import('../../handlers/essay/problem-library')
        await updateProblemScore(db, problemIdToUpdate, studentId, feedback.overallScore)
        console.log(`📚 ✅ Updated problem library score: Problem ${problemIdToUpdate}, Score: ${feedback.overallScore}`)
      } catch (scoreError) {
        console.error('❌ Failed to update problem score:', scoreError)
        // スコア更新失敗してもエラーにはしない
      }
    }
    
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
router.post('/chat', async (c) => {
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
    const lessonFormat = essaySession?.lessonFormat || 'full_55min'
    
    // 🔍 Check focused format
    const isVocabularyFocus = lessonFormat === 'vocabulary_focus'
    const isShortEssayFocus = lessonFormat === 'short_essay_focus'
    const isFocusedFormat = isVocabularyFocus || isShortEssayFocus
    
    console.log('📝 Essay chat - Session data:', { 
      sessionId, 
      problemMode, 
      customInput, 
      learningStyle, 
      targetLevel,
      lessonFormat,
      isVocabularyFocus,
      isShortEssayFocus,
      isFocusedFormat,
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
      // 「OK」のみ（標準55分モードのみ、focused formatは除外）
      else if (!isFocusedFormat && (message.toLowerCase().trim() === 'ok' || message.includes('はい'))) {
        console.log('✅ Matched: OK/はい (standard 55min mode)')
        console.log('🔍 Lesson format:', lessonFormat)
        
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
          
          // 常に新しいテーマを生成（多様性を確保）
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
      // vocabulary_focus の場合は Step 2 の語彙問題を生成
      else if (isVocabularyFocus && (message.toLowerCase().trim() === 'ok' || message.includes('はい'))) {
        console.log('✅ Step 1 - Vocabulary focus: Generating vocab problems')
        
        // Step 2の語彙問題生成ロジックを実行
        let vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱり」→ ?\n3. 「だから」→ ?\n4. 「ちゃんと」→ ?\n5. 「いっぱい」→ ?'
        let vocabExample = '「すごく大事」→「極めて重要」'
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for vocab!')
            throw new Error('OpenAI API key not configured')
          }
          
          const timestamp = Date.now()
          console.log('✅ Generating vocab problems with timestamp:', timestamp)
          
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
          
          const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
          
          console.log('📡 OpenAI API response status (vocab):', apiResponse.status)
          
          if (!apiResponse.ok) {
            const errorText = await apiResponse.text()
            console.error('❌ OpenAI API error response (vocab):', errorText)
            throw new Error(`OpenAI API error: ${apiResponse.status} - ${errorText}`)
          }
          
          const result = await apiResponse.json() as OpenAIChatCompletionResponse
          console.log('✅ OpenAI API call successful for vocab problems')
          
          const generated = result.choices?.[0]?.message?.content || ''
          console.log('📊 AI Generated vocab length:', generated?.length || 0)
          
          let vocabAnswers = '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱりそう」→「やはりそのとおり」または「確かにそうだ」\n3. 「だから必要」→「したがって必要」または「それゆえ必要」\n4. 「ちゃんと確認」→「適切に確認」または「正確に確認」\n5. 「いっぱいある」→「多数存在する」または「数多く存在する」'
          
          if (generated && generated.length > 20) {
            const answerMatch = generated.match(/【模範解答】([\s\S]*)/)
            
            if (answerMatch) {
              const answerText = answerMatch[1].trim()
              vocabAnswers = '【模範解答】\n' + answerText
              
              const exampleMatch = answerText.match(/例[：:]\s*(.+)/)
              if (exampleMatch) {
                vocabExample = exampleMatch[1].trim()
              }
              
              const answerLines = answerText.split('\n').filter((line: string) => line.trim())
              const problemLines = answerLines
                .filter((line: string) => /^\d+\./.test(line.trim()) && line.includes('→'))
                .map((line: string) => {
                  const match = line.match(/^(\d+\.\s*「[^」]+」)\s*→/)
                  return match ? `${match[1]} → ?` : null
                })
                .filter(Boolean)
              
              if (problemLines.length >= 3) {
                vocabProblems = problemLines.join('\n')
                console.log('✅ Generated problems from answers:', vocabProblems)
              }
            }
            
            if (!session.essaySession) {
              session.essaySession = {}
            }
            session.essaySession.vocabAnswers = vocabAnswers
            
            console.log('✅ Using AI-generated vocab problems and answers')
          } else {
            console.warn('⚠️ AI vocab too short, using fallback')
            vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱりそう」→ ?\n3. 「だから必要」→ ?\n4. 「ちゃんと確認」→ ?\n5. 「いっぱいある」→ ?'
            if (!session.essaySession) {
              session.essaySession = {}
            }
            session.essaySession.vocabAnswers = vocabAnswers
          }
        } catch (error) {
          console.error('❌ Vocab problems generation error:', error)
          const errorDetails = error instanceof Error
            ? { message: error.message, stack: error.stack, name: error.name }
            : { message: toErrorMessage(error) }
          console.error('❌ Error details:', errorDetails)
          vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱりそう」→ ?\n3. 「だから必要」→ ?\n4. 「ちゃんと確認」→ ?\n5. 「いっぱいある」→ ?'
        }
        
        // 語彙問題を表示
        const vocabTitle = '【語彙力強化① - 基礎編】'
        const vocabSubtitle = '口語表現を小論文風に言い換える練習をしましょう。'
        
        response = `${vocabTitle}\n${vocabSubtitle}\n\n以下の口語表現を小論文風の表現に言い換えてください：\n\n${vocabProblems}\n\n（例：${vocabExample}）\n\n5つすべてをチャットで答えて、送信ボタンを押してください。\n（わからない場合は「パス」と入力すると解答例を見られます）`
        
        // セッション更新
        learningSessions.set(sessionId, session)
        if (db) {
          await saveSessionToDB(db, sessionId, session)
        }
      }
      // 回答が短すぎる（標準55分モードのみ）
      else if (!isFocusedFormat) {
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
    } else if (currentStep === 3 && !isVocabularyFocus) {
      // ステップ3: 短文演習（AI添削付き）（vocabulary_focus以外）
      
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
    } else if (currentStep === 3 && isVocabularyFocus) {
      // ステップ3: 語彙力強化③（vocabulary_focusのみ）
      const savedAnswers = session?.essaySession?.vocabAnswers || '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱり」→「やはり」または「結局」\n3. 「だから」→「したがって」または「それゆえ」\n4. 「ちゃんと」→「適切に」または「正確に」\n5. 「いっぱい」→「多数」または「数多く」'
      
      // パス機能
      if (message.toLowerCase().includes('パス') || message.toLowerCase().includes('pass')) {
        response = `わかりました。解答例をお見せしますね。\n\n${savedAnswers}\n\n小論文では、話し言葉ではなく書き言葉を使うことが大切です。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
        stepCompleted = true
      }
      // 答えを入力した場合
      else if (message.length > 10 && !message.toLowerCase().includes('ok') && !message.includes('はい')) {
        response = `素晴らしい言い換えですね！\n\n${savedAnswers}\n\n小論文では、話し言葉ではなく書き言葉を使うことが大切です。\n\n語彙力が向上しています。このステップは完了です。「次のステップへ」ボタンを押してください。`
        stepCompleted = true
      }
      // 「OK」で語彙問題③を生成
      else if (message.toLowerCase().trim() === 'ok' || message.includes('はい')) {
        console.log('🔍 Step 3 - Vocabulary focus: Generating vocab problems ③')
        
        // 語彙問題を生成（Step 1と同じロジック）
        let vocabProblems = '1. 「すごく大事」→ ?\n2. 「やっぱり」→ ?\n3. 「だから」→ ?\n4. 「ちゃんと」→ ?\n5. 「いっぱい」→ ?'
        let vocabExample = '「すごく大事」→「極めて重要」'
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ CRITICAL: OPENAI_API_KEY is not configured!')
            throw new Error('OpenAI API key not configured')
          }
          
          const timestamp = Date.now()
          console.log('✅ Generating vocab problems ③ with timestamp:', timestamp)
          
          const systemPrompt = `あなたは小論文の先生です。口語表現を小論文風の表現に言い換える練習問題を5つ作成してください。

対象レベル: ${targetLevel === 'high_school' ? '高校生' : targetLevel === 'vocational' ? '専門学校生' : '大学受験生'}
タイムスタンプ: ${timestamp}
難易度: 実践レベル（やや難しめ）

重要：まず完全な解答ペアを作成し、そこから問題を抽出してください。

要求:
- よく使う口語表現を含むフレーズを5つ選ぶ
- 毎回異なる表現を出題すること
- Step 1、Step 2とは違う表現を選ぶこと
- 口語表現は単独ではなく、フレーズとして出題すること

出力形式（この形式を厳守）：
【模範解答】
1. 「口語表現を含むフレーズ1」→「小論文風の表現1」または「別の表現1」
2. 「口語表現を含むフレーズ2」→「小論文風の表現2」または「別の表現2」
3. 「口語表現を含むフレーズ3」→「小論文風の表現3」または「別の表現3」
4. 「口語表現を含むフレーズ4」→「小論文風の表現4」または「別の表現4」
5. 「口語表現を含むフレーズ5」→「小論文風の表現5」または「別の表現5」

例：「すごく大事なこと」→「極めて重要な事柄」または「非常に大切なこと」`
          
          const apiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: '語彙力強化の問題を5つ生成してください（Step 3用）。' }
              ],
              max_tokens: 500,
              temperature: 0.95  // より高い温度で多様性を確保
            })
          })
          
          if (!apiResponse.ok) {
            throw new Error(`OpenAI API error: ${apiResponse.status}`)
          }
          
          const result = await apiResponse.json() as OpenAIChatCompletionResponse
          const generated = result.choices?.[0]?.message?.content || ''
          
          let vocabAnswers = '【模範解答】\n1. 「すごく大事」→「極めて重要」または「非常に重要」\n2. 「やっぱり」→「やはり」または「結局」\n3. 「だから」→「したがって」または「それゆえ」\n4. 「ちゃんと」→「適切に」または「正確に」\n5. 「いっぱい」→「多数」または「数多く」'
          
          if (generated && generated.length > 20) {
            const answerMatch = generated.match(/【模範解答】([\s\S]*)/)
            
            if (answerMatch) {
              const answerText = answerMatch[1].trim()
              vocabAnswers = '【模範解答】\n' + answerText
              
              const exampleMatch = answerText.match(/例[：:]\s*(.+)/)
              if (exampleMatch) {
                vocabExample = exampleMatch[1].trim()
              }
              
              const answerLines = answerText.split('\n').filter((line: string) => line.trim())
              const problemLines = answerLines
                .filter((line: string) => /^\d+\./.test(line.trim()) && line.includes('→'))
                .map((line: string) => {
                  const match = line.match(/^(\d+\.\s*「[^」]+」)\s*→/)
                  return match ? `${match[1]} → ?` : null
                })
                .filter(Boolean)
              
              if (problemLines.length >= 3) {
                vocabProblems = problemLines.join('\n')
              }
            }
            
            if (!session.essaySession) {
              session.essaySession = {}
            }
            session.essaySession.vocabAnswers = vocabAnswers
          }
        } catch (error) {
          console.error('❌ Vocab problems generation error (Step 3):', error)
          vocabProblems = '1. 「本当にすごい」→ ?\n2. 「絶対に正しい」→ ?\n3. 「とても大切」→ ?\n4. 「かなり難しい」→ ?\n5. 「ちゃんと理解する」→ ?'
        }
        
        response = `【語彙力強化③ - 実践編】\n実践的な表現に挑戦しましょう。\n\n以下の口語表現を小論文風の表現に言い換えてください：\n\n${vocabProblems}\n\n（例：${vocabExample}）\n\n5つすべてをチャットで答えて、送信ボタンを押してください。\n（わからない場合は「パス」と入力すると解答例を見られます）`
        
        learningSessions.set(sessionId, session)
        if (db) {
          await saveSessionToDB(db, sessionId, session)
        }
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

export default router
