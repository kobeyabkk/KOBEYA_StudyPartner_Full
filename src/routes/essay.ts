/**
 * KOBEYA Essay Coaching - Complete Module
 * 小論文指導システム - すべてのAPIエンドポイントとページ
 * 
 * This module contains:
 * - 5 API endpoints (/api/essay/*)
 * - 2 page renderers (/essay-coaching, /essay-coaching/session/:sessionId)
 * 
 * Extracted from index.tsx (lines 822-8038)
 */

import type { Hono } from 'hono'
import { learningSessions } from '../utils/session'
import { getStudyPartnerSession } from '../services/database'
import {
  getProblemForStudent,
  saveProblemToLibrary,
  recordProblemUsage,
  updateProblemScore,
  type ProblemLibraryEntry
} from '../handlers/essay/problem-library'
import { handlePDFGeneration } from '../handlers/essay/pdf-generator'

// ========================================
// Type Definitions
// ========================================

type UploadedImage = {
  step: number
  [key: string]: unknown
}

type OCRResult = {
  step: number
  text?: string
  [key: string]: unknown
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
}

const DEFAULT_ERROR_MESSAGE = '不明なエラー'

function toErrorMessage(error: unknown, fallback = DEFAULT_ERROR_MESSAGE): string {
  if (error instanceof Error) {
    return error.message || fallback
  }
  if (typeof error === 'string') {
    return error || fallback
  }
  return fallback
}

function toErrorDetails(error: unknown): { message: string; stack?: string; name?: string } {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
      name: error.name
    }
  }
  return { message: String(error) }
}

// ========================================
// Helper Functions
// ========================================

async function saveSessionToDB(db: any, sessionId: string, sessionData: any) {
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
    
    console.log('✅ Session loaded from D1:', sessionId, {
      lessonFormat: session.essaySession?.lessonFormat,  // 🔍 DEBUG
      targetLevel: session.essaySession?.targetLevel,
      problemMode: session.essaySession?.problemMode
    })
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

/**
 * Register all essay coaching routes
 * @param app - Hono application instance
 */
export function registerEssayRoutes(app: Hono<any>) {
  console.log('📝 Registering Essay Coaching routes...')

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
        targetLevel: essaySession.targetLevel,
        lessonFormat: essaySession.lessonFormat  // 🔍 DEBUG: lessonFormat確認
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
      message: `セッション初期化でエラーが発生しました: ${toErrorMessage(error)}`,
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
      message: `画像アップロードでエラーが発生しました: ${toErrorMessage(error)}`,
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
    return c.json({
      ok: false,
      error: 'ocr_error',
      message: `OCR処理でエラーが発生しました: ${toErrorMessage(error)}`,
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
      message: `AI添削でエラーが発生しました: ${toErrorMessage(error)}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - PDF生成API
app.post('/api/essay/generate-pdf', async (c) => {
  return handlePDFGeneration(c)
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
    const lessonFormat = essaySession?.lessonFormat || 'full_55min'
    
    console.log('📝 Essay chat - Session data:', { 
      sessionId, 
      problemMode, 
      customInput, 
      learningStyle, 
      targetLevel,
      lessonFormat,
      currentStep,
      message: message.substring(0, 50)
    })
    
    // 🔍 DEBUG: 条件判定をログに追加（Step 1処理前）
    const debugInfo = {
      lessonFormat,
      isVocabularyFocus: lessonFormat === 'vocabulary_focus',
      isShortEssayFocus: lessonFormat === 'short_essay_focus',
      isFocusedFormat: (lessonFormat === 'vocabulary_focus' || lessonFormat === 'short_essay_focus'),
      currentStep,
      messagePreview: message.substring(0, 20)
    }
    console.log('🔍 BEFORE STEP CHECK:', debugInfo)
    
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
    // 授業形式によってステップの内容を変える
    const isVocabularyFocus = lessonFormat === 'vocabulary_focus'
    const isShortEssayFocus = lessonFormat === 'short_essay_focus'
    const isFocusedFormat = isVocabularyFocus || isShortEssayFocus
    
    // 🔍 DEBUG: lessonFormat判定
    console.log('🔍 DEBUG lessonFormat check:', {
      lessonFormat,
      isVocabularyFocus,
      isShortEssayFocus,
      isFocusedFormat,
      currentStep,
      message: message.substring(0, 20)
    })
    
    // Focused formatsの場合、ステップ1は導入ではなく練習問題
    // そのため、full_55minのステップ2処理にジャンプする
    
    // Focused formats: Step 1を練習問題として扱う（Step 2処理へfallthrough）
    // vocabulary_focus: Step 1-3 = 語彙練習①②③
    // short_essay_focus: Step 1-3 = 短文演習①②③
    // 条件式は後のelse ifで統合処理するため、ここでは何もしない
    
    // 🔍 DEBUG: Step 1条件チェック
    console.log('🔍 DEBUG Step 1 condition check:', {
      'currentStep === 1': currentStep === 1,
      '!isFocusedFormat': !isFocusedFormat,
      'will enter Step 1 block': currentStep === 1 && !isFocusedFormat
    })
    
    if (currentStep === 1 && !isFocusedFormat) {
      console.log('📝 Step 1 (intro) processing, message:', message, 'lessonFormat:', lessonFormat)
      
      // 画像がアップロードされたかチェック（OCR処理済みの回答）
      const hasImage = session && session.essaySession && session.essaySession.uploadedImages && 
                       session.essaySession.uploadedImages.some((img: UploadedImage) => img.step === 1)
      const hasOCR = session && session.essaySession && session.essaySession.ocrResults && 
                     session.essaySession.ocrResults.some((ocr: OCRResult) => ocr.step === 1)
      
      // OCR結果がある場合、AI添削を実行
      if (hasOCR && (message.includes('確認完了') || message.includes('これで完了'))) {
        console.log('📝 Step 1: OCR confirmed, generating feedback...')
        
        try {
          const step1OCRs = session.essaySession.ocrResults.filter((ocr: OCRResult) => ocr.step === 1)
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
          const parsedFeedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: unknown
            improvements?: unknown
            overallScore?: unknown
            nextSteps?: unknown
          }
          const goodPoints = Array.isArray(parsedFeedback.goodPoints) ? parsedFeedback.goodPoints : []
          const improvements = Array.isArray(parsedFeedback.improvements) ? parsedFeedback.improvements : []
          const nextSteps = Array.isArray(parsedFeedback.nextSteps) ? parsedFeedback.nextSteps : []
          const overallScore = typeof parsedFeedback.overallScore === 'number' ? parsedFeedback.overallScore : 0
          
          console.log('✅ Step 1 feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
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
            
            const result = await response_api.json() as OpenAIChatCompletionResponse
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
          
          const completion = await response_api.json() as OpenAIChatCompletionResponse
          const parsedFeedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: unknown
            improvements?: unknown
            overallScore?: unknown
            nextSteps?: unknown
          }
          const goodPoints = Array.isArray(parsedFeedback.goodPoints) ? parsedFeedback.goodPoints : []
          const improvements = Array.isArray(parsedFeedback.improvements) ? parsedFeedback.improvements : []
          const nextSteps = Array.isArray(parsedFeedback.nextSteps) ? parsedFeedback.nextSteps : []
          const overallScore = typeof parsedFeedback.overallScore === 'number' ? parsedFeedback.overallScore : 0
          
          console.log('✅ Step 1 text feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
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
        let questions = ''
        
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
            
            const result = await response.json() as OpenAIChatCompletionResponse
            console.log('✅ OpenAI API call successful for questions')
            console.log('📊 API result structure (questions):', Object.keys(result as Record<string, unknown>))
            
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
          console.error('❌ Error details:', toErrorDetails(error))
            // エラー時もカスタムテーマを使ったフォールバック
            questions = `1. ${themeTitle}の基本的な概念や定義について説明してください。\n2. ${themeTitle}に関する現代社会における問題点や課題は何ですか？\n3. ${themeTitle}について、あなた自身の考えや意見を述べてください。`
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
        
        // 標準55分モードの場合のみ読み物を生成
        
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
            console.log('📊 API result structure:', Object.keys(result as Record<string, unknown>))
            
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
              console.error('❌ Error details:', toErrorDetails(error))
              
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
            console.log('📊 API result structure:', Object.keys(result as Record<string, unknown>))
            
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
            console.error('❌ Error details:', toErrorDetails(error))
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
        
        response = `🔍 DEBUG: lessonFormat="${lessonFormat}", isFocusedFormat=${isFocusedFormat}\n\n素晴らしいですね！それでは今日のテーマは「${themeTitle}」です。\n\n【読み物】\n${themeContent}\n\n読み終えたら「読んだ」と入力して送信してください。`
      }
      // 回答が短すぎる（標準55分モードのみ）
      else if (!isFocusedFormat) {
        console.log('⚠️ Answer too short')
        response = '回答が短すぎるようです。もう少し詳しく答えてください。\n\n各質問について、15文字以上で答えてみましょう。\n（わからない場合は「パス」と入力すると解説します）'
      }
      // Focused formatでStep 1の場合、Step 2/3処理に任せるため何もしない（fall through）
    } else if (currentStep === 2 || (isVocabularyFocus && currentStep >= 1 && currentStep <= 3)) {
      // ステップ2: 語彙力強化
      // vocabulary_focusの場合、ステップ1-3をすべて語彙練習として扱う
      const vocabStepLabel = isVocabularyFocus ? 
        (currentStep === 1 ? '①' : currentStep === 2 ? '②' : '③') : ''
      console.log(`📋 Step ${currentStep} - Lesson format: ${lessonFormat} (mapped to vocab training${vocabStepLabel})`)
      
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
        }
        
        // すぐに語彙問題を表示
        const vocabTitle = isVocabularyFocus ? 
          (currentStep === 1 ? '【語彙力強化① - 基礎編】' : 
           currentStep === 2 ? '【語彙力強化② - 応用編】' : 
           '【語彙力強化③ - 実践編】') : 
          '【語彙力強化】'
        const vocabSubtitle = isVocabularyFocus ? 
          (currentStep === 1 ? '口語表現を小論文風に言い換える基礎練習です。' :
           currentStep === 2 ? 'より高度な表現の言い換え練習です。' :
           '実践的な文脈での言い換え練習です。') :
          '口語表現を小論文風に言い換える練習をしましょう。'
        
        response = `${vocabTitle}\n${vocabSubtitle}\n\n以下の口語表現を小論文風の表現に言い換えてください：\n\n${vocabProblems}\n\n（例：${vocabExample}）\n\n━━━━━━━━━━━━━━━━━━\n📝 回答方法\n━━━━━━━━━━━━━━━━━━\n\n＜方法1：直接入力＞\n5つの言い換えをチャットで答えて、送信ボタンを押してください。\n\n＜方法2：手書き提出＞\n1️⃣ ノートに手書きで答える\n2️⃣ 📷カメラボタン または 📁ファイルボタンを押す\n3️⃣ 撮影またはファイル選択\n4️⃣ 画像を確認して送信\n\n※ わからない場合は「パス」と入力すると解答例を見られます`
      }
      // 回答が短すぎる
      else {
        response = '回答が短すぎるようです。\n\n5つの言い換えをすべて答えてください。各10文字以上で答えましょう。\n\n💡 手書きで答えた場合は、📷カメラボタン または 📁ファイルボタンから画像をアップロードしてください。\n\n（わからない場合は「パス」と入力すると解答例を見られます）'
      }
    } else if (currentStep === 3 || (isShortEssayFocus && currentStep >= 1 && currentStep <= 3)) {
      // ステップ3: 短文演習（AI添削付き）
      // short_essay_focusの場合、ステップ1-3をすべて短文演習として扱う
      const essayStepLabel = isShortEssayFocus ? 
        (currentStep === 1 ? '100字' : currentStep === 2 ? '200字' : '300字') : ''
      console.log(`📋 Step ${currentStep} - Lesson format: ${lessonFormat} (mapped to short essay training ${essayStepLabel})`)
      
      // 短文重点モードの字数要件（Step 1: 80字, Step 2: 150字, Step 3: 250字）
      const minCharCount = isShortEssayFocus ?
        (currentStep === 1 ? 80 : currentStep === 2 ? 150 : 250) : 150
      const targetCharCount = isShortEssayFocus ?
        (currentStep === 1 ? 100 : currentStep === 2 ? 200 : 300) : 200
      
      // 長い回答が送られてきた場合 → AI添削実行
      if (message.length >= minCharCount && !message.toLowerCase().includes('ok') && !message.includes('はい')) {
        console.log(`📝 Step ${currentStep}: Received short essay for feedback (${isShortEssayFocus ? targetCharCount + '字' : '200字'}目標)`)
        console.log('📏 Essay length:', message.length, 'characters')
        
        try {
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for short essay!')
            throw new Error('OpenAI API key not configured')
          }
          
          console.log('🤖 Calling OpenAI API for short essay feedback...')
          
          const systemPrompt = `あなたは小論文の先生です。生徒が書いた${targetCharCount}字程度の短文小論文を添削してください。

【評価基準】
- 論理構成（主張→理由→具体例→結論）
- 文章の明確さと説得力
- 語彙の適切さ
- 文字数（目標: ${targetCharCount}字前後）

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
            overallScore?: number
            nextSteps?: string[]
          }
          const goodPoints = Array.isArray(feedback.goodPoints) ? feedback.goodPoints : []
          const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : []
          const nextSteps = Array.isArray(feedback.nextSteps) ? feedback.nextSteps : []
          const overallScore = typeof feedback.overallScore === 'number' ? feedback.overallScore : 0
          
          console.log('✅ Short essay feedback generated')
          
          // フィードバックを整形して表示
          response = `【短文添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p, i) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！次のステップでは、より長い小論文に挑戦します。\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。`
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
        
        // 短文重点モードの場合、ステップに応じて字数を変更
        const charCount = isShortEssayFocus ? 
          (currentStep === 1 ? '100字' : currentStep === 2 ? '200字' : '300字') : '200字'
        const charCountNum = isShortEssayFocus ?
          (currentStep === 1 ? 100 : currentStep === 2 ? 200 : 300) : 200
        
        // カスタムテーマに基づいた短文問題を生成
        let shortProblem = `環境問題について、${charCount}程度で小論文を書いてください。`
        
        if ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle)) {
          shortProblem = `${themeTitle}について、${charCount}程度で小論文を書いてください。`
          console.log('✅ Using theme for short essay:', themeTitle, 'with', charCount)
        } else if (problemMode === 'problem' && customInput) {
          // 問題文がある場合は、そのまま使用
          shortProblem = customInput
          console.log('✅ Using custom problem for short essay')
        } else {
          console.warn('⚠️ Using fallback short essay problem')
        }
        
        const shortEssayTitle = isShortEssayFocus ? 
          `【短文演習${currentStep === 1 ? '①: 100字' : currentStep === 2 ? '②: 200字' : '③: 300字'}】` : 
          '【短文演習】'
        const shortEssaySubtitle = isShortEssayFocus ?
          `${charCount}で短い小論文を書いてみましょう。` :
          '指定字数で短い小論文を書いてみましょう。'
        
        response = `${shortEssayTitle}\n${shortEssaySubtitle}\n\n＜課題＞\n${shortProblem}\n\n＜構成＞\n主張→理由→具体例→結論（200字程度）\n\n＜書き方＞\n1. まず自分の主張を明確に述べる\n2. その理由を説明する\n3. 具体例を1つ挙げる\n4. 最後に結論でまとめる\n\n━━━━━━━━━━━━━━━━━━\n📝 提出方法\n━━━━━━━━━━━━━━━━━━\n\n＜方法1：直接入力＞\n書き終えたら、この入力エリアに入力して送信してください。\n\n＜方法2：手書き提出＞\n1️⃣ 原稿用紙またはノートに手書き\n2️⃣ 📷カメラボタン または 📁ファイルボタンを押す\n3️⃣ 撮影またはファイル選択\n4️⃣ 画像を確認して送信\n\nAIが添削します。`
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
          
          // 🆕 問題ライブラリシステム統合
          const wordCount = targetLevel === 'high_school' ? '400字' : targetLevel === 'vocational' ? '500字' : '600字'
          const wordCountNum = parseInt(wordCount)
          const db = c.env?.DB
          let usedProblemId: number | undefined = undefined
          
          // Step 1: ライブラリから問題を検索
          if (db && studentId) {
            try {
              const libraryResult = await getProblemForStudent(db, {
                studentId: studentId,
                theme: customInput,
                targetLevel: targetLevel as 'high_school' | 'vocational' | 'university',
                targetWordCount: wordCountNum,
                isCurrentEvent: customInput.includes('時事') || customInput.includes('最近') || customInput.includes('現在')
              })
              
              if (libraryResult.source === 'library' && libraryResult.problem) {
                // ライブラリから取得成功
                mainProblem = libraryResult.problem.problem_text
                usedProblemId = libraryResult.problemId
                console.log(`📚 ✅ Using problem from library: ID ${usedProblemId}`)
                console.log(`📚 Problem preview: ${mainProblem.substring(0, 50)}...`)
                charCount = wordCount
              } else {
                console.log('📚 ℹ️ No suitable problem in library, generating new one with AI')
              }
            } catch (error) {
              console.error('❌ Library search error:', error)
              console.log('🔄 Falling back to AI generation')
            }
          }
          
          // Step 2: ライブラリに問題がない場合、AIで生成
          if (!mainProblem || mainProblem === 'SNSが社会に与える影響について、あなたの考えを述べなさい') {
            // テーマから具体的な問題を生成
            try {
              const openaiApiKey = c.env?.OPENAI_API_KEY
              
              if (!openaiApiKey) {
                console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for Step 4 problem!')
                throw new Error('OpenAI API key not configured')
              }
              
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
              
              const result = await response_api.json() as OpenAIChatCompletionResponse
              console.log('✅ OpenAI API call successful for Step 4 problem')
              
              const generatedProblem = result.choices?.[0]?.message?.content || ''
              console.log('📊 AI Generated problem length:', generatedProblem?.length || 0)
              console.log('📝 Generated problem preview:', generatedProblem?.substring(0, 100) || 'EMPTY')
              
              if (generatedProblem && generatedProblem.length > 10) {
                mainProblem = generatedProblem.replace(/^「|」$/g, '').trim()
                console.log('✅ Using OpenAI-generated problem for Step 4')
                
                // Step 3: 新規生成した問題をライブラリに保存
                if (db && mainProblem.length >= 60) {
                  try {
                    usedProblemId = await saveProblemToLibrary(db, {
                      theme: customInput,
                      problem_text: mainProblem,
                      target_level: targetLevel as 'high_school' | 'vocational' | 'university',
                      target_word_count: wordCountNum,
                      category: null,
                      tags: null,
                      is_current_event: customInput.includes('時事') || customInput.includes('最近') || customInput.includes('現在'),
                      quality_score: 50, // デフォルト品質スコア
                      usage_count: 0,
                      is_active: true,
                      is_approved: true, // 自動承認
                      created_by: 'ai'
                    })
                    console.log(`📚 ✅ Saved new problem to library: ID ${usedProblemId}`)
                  } catch (saveError) {
                    console.error('❌ Failed to save problem to library:', saveError)
                    // 保存失敗してもエラーにはしない（問題文は使える）
                  }
                }
              } else {
                mainProblem = `${customInput}の発展により、社会に様々な影響が生じています。あなたはこの${customInput}について、どのような課題があり、どう対応すべきと考えますか。具体例を挙げながら、あなたの考えを述べなさい`
                console.warn('⚠️ AI problem too short, using custom fallback')
              }
              charCount = wordCount
            } catch (error) {
              console.error('❌ Step 4 problem generation error:', error)
              console.error('❌ Error details:', toErrorDetails(error))
              mainProblem = `${customInput}の発展により、社会に様々な影響が生じています。あなたはこの${customInput}について、どのような課題があり、どう対応すべきと考えますか。具体例を挙げながら、あなたの考えを述べなさい`
              console.log('🔄 Using error fallback with custom theme')
            }
          }
          
          // Step 4: 使用履歴を記録
          if (db && studentId && usedProblemId && sessionId) {
            try {
              await recordProblemUsage(db, {
                student_id: studentId,
                problem_id: usedProblemId,
                session_id: parseInt(sessionId)
              })
              console.log(`📚 ✅ Recorded problem usage: Student ${studentId}, Problem ${usedProblemId}`)
              
              // セッションに problemId を保存（後でスコア更新するため）
              if (session && session.essaySession) {
                session.essaySession.currentProblemId = usedProblemId
                await updateSession(db, sessionId, { essaySession: session.essaySession })
              }
            } catch (usageError) {
              console.error('❌ Failed to record problem usage:', usageError)
              // 記録失敗してもエラーにはしない
            }
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
          // カスタムテーマまたはAIモードの場合、Challenge問題をライブラリまたはAI生成
          const themeTitle = session?.essaySession?.lastThemeTitle || customInput || '社会問題'
          const baseTheme = ((problemMode === 'theme' || problemMode === 'ai') && (customInput || themeTitle)) ? themeTitle : '社会問題'
          const wordCount = targetLevel === 'high_school' ? '500字' : targetLevel === 'vocational' ? '600字' : '800字'
          const wordCountNum = parseInt(wordCount)
          const db = c.env?.DB
          let usedChallengeProblemId: number | undefined = undefined
          
          // Step 1: ライブラリから問題を検索（Step 5用）
          if (db && studentId) {
            try {
              const libraryResult = await getProblemForStudent(db, {
                studentId: studentId,
                theme: baseTheme,
                targetLevel: targetLevel as 'high_school' | 'vocational' | 'university',
                targetWordCount: wordCountNum,
                isCurrentEvent: baseTheme.includes('時事') || baseTheme.includes('最近') || baseTheme.includes('現在')
              })
              
              if (libraryResult.source === 'library' && libraryResult.problem) {
                // ライブラリから取得成功
                challengeProblem = libraryResult.problem.problem_text
                usedChallengeProblemId = libraryResult.problemId
                console.log(`📚 ✅ Using challenge problem from library: ID ${usedChallengeProblemId}`)
                console.log(`📚 Challenge problem preview: ${challengeProblem.substring(0, 50)}...`)
                charCount = wordCount
              } else {
                console.log('📚 ℹ️ No suitable challenge problem in library, generating new one with AI')
              }
            } catch (error) {
              console.error('❌ Library search error (challenge):', error)
              console.log('🔄 Falling back to AI generation for challenge')
            }
          }
          
          // Step 2: ライブラリに問題がない場合、AIで生成
          if (!challengeProblem || challengeProblem === '人工知能（AI）の発展が、将来の雇用に与える影響について、あなたの考えを述べなさい') {
            try {
              const openaiApiKey = c.env?.OPENAI_API_KEY
              
              if (!openaiApiKey) {
                console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for challenge problem!')
                throw new Error('OpenAI API key not configured')
              }
              
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
                
                // Step 3: 新規生成した問題をライブラリに保存
                if (db && challengeProblem.length >= 60) {
                  try {
                    usedChallengeProblemId = await saveProblemToLibrary(db, {
                      theme: baseTheme,
                      problem_text: challengeProblem,
                      target_level: targetLevel as 'high_school' | 'vocational' | 'university',
                      target_word_count: wordCountNum,
                      category: null,
                      tags: null,
                      is_current_event: baseTheme.includes('時事') || baseTheme.includes('最近') || baseTheme.includes('現在'),
                      quality_score: 50, // デフォルト品質スコア
                      usage_count: 0,
                      is_active: true,
                      is_approved: true, // 自動承認
                      created_by: 'ai'
                    })
                    console.log(`📚 ✅ Saved new challenge problem to library: ID ${usedChallengeProblemId}`)
                  } catch (saveError) {
                    console.error('❌ Failed to save challenge problem to library:', saveError)
                    // 保存失敗してもエラーにはしない
                  }
                }
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
          
          // Step 4: 使用履歴を記録（Step 5用）
          if (db && studentId && usedChallengeProblemId && sessionId) {
            try {
              await recordProblemUsage(db, {
                student_id: studentId,
                problem_id: usedChallengeProblemId,
                session_id: parseInt(sessionId)
              })
              console.log(`📚 ✅ Recorded challenge problem usage: Student ${studentId}, Problem ${usedChallengeProblemId}`)
              
              // セッションに challengeProblemId を保存（後でスコア更新するため）
              if (session && session.essaySession) {
                session.essaySession.challengeProblemId = usedChallengeProblemId
                await updateSession(db, sessionId, { essaySession: session.essaySession })
              }
            } catch (usageError) {
              console.error('❌ Failed to record challenge problem usage:', usageError)
              // 記録失敗してもエラーにはしない
            }
          }
        }
        
        response = `【チャレンジ問題】\nさらに難しいテーマの小論文に挑戦しましょう。\n\n＜課題＞\n「${challengeProblem}」\n\n＜条件＞\n- 文字数：${charCount}\n- 構成：序論（問題提起）→本論（メリット・デメリット）→結論（自分の意見）\n- 具体例を3つ以上含めること\n- 客観的なデータや事例を引用すること\n\n━━━━━━━━━━━━━━━━━━\n📝 手書き原稿の提出方法\n━━━━━━━━━━━━━━━━━━\n\n1️⃣ 原稿用紙に手書きで小論文を書く\n\n2️⃣ 書き終えたら、下の入力欄の横にある📷カメラボタンを押す\n\n3️⃣ 「撮影する」で原稿を撮影\n\n4️⃣ 必要に応じて「範囲を調整」で読み取り範囲を調整\n\n5️⃣ 「OCR処理を開始」ボタンを押す\n\n6️⃣ 読み取り結果を確認\n\n━━━━━━━━━━━━━━━━━━\n✅ OCR結果が正しい場合\n━━━━━━━━━━━━━━━━━━\n「確認完了」と入力して送信\n→ すぐにAI添削が開始されます\n\n✏️ OCR結果を修正したい場合\n━━━━━━━━━━━━━━━━━━\n正しいテキストを入力して送信\n→ 修正内容が保存され、AI添削が開始されます\n\n※ カメラボタンは入力欄の右側にあります`
      }
      else {
        response = '原稿用紙に小論文を書き終えたら、下の入力欄の横にある📷カメラボタンを押して撮影してください。\n\n📷カメラボタン → 撮影 → 範囲調整（任意） → OCR処理を開始 → 結果確認\n\n✅ 結果が正しい → 「確認完了」と送信\n✏️ 修正が必要 → 正しいテキストを入力して送信\n\nまだ準備中の場合は、書き終えてからアップロードしてください。'
      }
    } else if (currentStep === 6) {
      // Step 6: 学習記録カード生成
      console.log('📊 Step 6: Generating learning card')
      
      if (message === '学習記録カード生成' || message === 'カード生成' || message === '完了') {
        // セッションデータから学習内容を集計
        const feedbacks = session.essaySession?.feedbacks || []
        const ocrResults = session.essaySession?.ocrResults || []
        const vocabularyProgress = session.vocabularyProgress || {}
        
        // 改善点を集計（重複を除く）
        const allImprovements = new Set<string>()
        const allGoodPoints = new Set<string>()
        let totalScore = 0
        let scoreCount = 0
        
        feedbacks.forEach((fb: any) => {
          if (fb.improvements && Array.isArray(fb.improvements)) {
            fb.improvements.forEach((imp: string) => allImprovements.add(imp))
          }
          if (fb.goodPoints && Array.isArray(fb.goodPoints)) {
            fb.goodPoints.forEach((gp: string) => allGoodPoints.add(gp))
          }
          if (typeof fb.overallScore === 'number') {
            totalScore += fb.overallScore
            scoreCount++
          }
        })
        
        const avgScore = scoreCount > 0 ? Math.round(totalScore / scoreCount) : 0
        const improvementList = Array.from(allImprovements).slice(0, 3)
        const goodPointsList = Array.from(allGoodPoints).slice(0, 3)
        
        // 学習した語彙（仮）
        const learnedVocabulary = Object.keys(vocabularyProgress).slice(0, 5)
        
        // 次回への課題
        const nextFocus = [
          improvementList[0] || '文章構成を意識する',
          '具体例を豊富に盛り込む',
          '論理的な展開を心がける'
        ]
        
        // 学習記録カードをD1に保存
        try {
          await db.prepare(`
            INSERT OR REPLACE INTO essay_learning_cards (
              session_id, learned_vocabulary, improvement_points, next_focus,
              total_score, overall_comment, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          `).bind(
            sessionData.essaySession?.sessionId || sessionId,
            JSON.stringify(learnedVocabulary),
            JSON.stringify(improvementList),
            JSON.stringify(nextFocus),
            avgScore,
            `今日は${feedbacks.length}つの小論文に取り組みました。平均スコアは${avgScore}点です。${goodPointsList[0] || '真剣に取り組む姿勢'}が素晴らしかったです。`
          ).run()
          
          console.log('✅ Learning card saved to D1')
        } catch (dbError) {
          console.error('⚠️ Failed to save learning card:', dbError)
        }
        
        // 学習記録カードを表示
        response = `🎉 お疲れさまでした！今日の学習記録カードができました。\n\n━━━━━━━━━━━━━━━━━━\n📊 今日の学習記録\n━━━━━━━━━━━━━━━━━━\n\n【提出した小論文】\n${feedbacks.length}本（Step 3, 4, 5）\n\n【平均スコア】\n${avgScore}点 / 100点\n\n━━━━━━━━━━━━━━━━━━\n✨ 良かった点\n━━━━━━━━━━━━━━━━━━\n${goodPointsList.map((gp, i) => `${i + 1}. ${gp}`).join('\n') || '・真剣に取り組む姿勢が素晴らしかったです'}\n\n━━━━━━━━━━━━━━━━━━\n📝 改善点（次回への課題）\n━━━━━━━━━━━━━━━━━━\n${improvementList.map((imp, i) => `${i + 1}. ${imp}`).join('\n') || '・文章構成を意識しましょう\n・具体例を増やしましょう'}\n\n━━━━━━━━━━━━━━━━━━\n🎯 次回の重点目標\n━━━━━━━━━━━━━━━━━━\n${nextFocus.map((nf, i) => `${i + 1}. ${nf}`).join('\n')}\n\n━━━━━━━━━━━━━━━━━━\n💡 先生からのコメント\n━━━━━━━━━━━━━━━━━━\n今日は${feedbacks.length}つの小論文に挑戦しました。${goodPointsList[0] || '真剣に学習する姿勢'}が印象的でした。次回は${improvementList[0] || '文章構成'}を意識して、さらに良い小論文を書きましょう！\n\n📄 この学習記録カードはPDFとしてダウンロードできます。\n「PDF出力」と入力してください。`
        
        stepCompleted = true
      } else if (message === 'PDF出力' || message === 'PDF') {
        // PDF生成を実行
        response = '📄 学習記録カードのPDFを生成しています...\n\n✅ PDF生成が完了しました！\n\n下のリンクからPDFをダウンロードできます：\n\n🔗 **PDFダウンロード**: `/api/essay/generate-pdf?session=${sessionData.essaySession?.sessionId || sessionId}`\n\n※ ブラウザの新しいタブでPDFが開きます。\n\n「完了」と入力すると、セッションを終了します。'
      } else {
        response = '📊 学習記録カードを生成します。\n\n「カード生成」または「完了」と入力してください。\n\n今日の学習内容をまとめた記録カードをお見せします。'
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
    
    // 🔍 DEBUG: レスポンスにデバッグ情報を含める
    const responseData: any = {
      ok: true,
      response,
      stepCompleted,
      timestamp: new Date().toISOString()
    }
    
    // 開発用デバッグ情報（Step 1の場合のみ）
    if (currentStep === 1) {
      responseData.debug = {
        lessonFormat,
        isVocabularyFocus: lessonFormat === 'vocabulary_focus',
        isShortEssayFocus: lessonFormat === 'short_essay_focus',
        isFocusedFormat: lessonFormat === 'vocabulary_focus' || lessonFormat === 'short_essay_focus',
        enteredStep1Block: response.includes('読み物') || response.includes('テーマ'),
        messageType: message.substring(0, 20)
      }
    }
    
    return c.json(responseData, 200)
    
  } catch (error) {
    console.error('❌ Essay chat error:', error)
    return c.json({
      ok: false,
      error: 'chat_error',
      message: `チャット処理でエラーが発生しました: ${toErrorMessage(error)}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})
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

        </script>
    </body>
    </html>
  `)
})
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
            if (!messagesDiv) {
                console.error('❌ messages div not found');
                return;
            }
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (isTeacher ? 'teacher' : 'student');
            
            const icon = isTeacher ? '👨‍🏫' : '👤';
            // Fix: Replace both actual newlines and escaped newlines
            const formattedText = text.replace(/\\n/g, '<br>').replace(/\n/g, '<br>');
            messageDiv.innerHTML = '<span class="icon">' + icon + '</span><div>' + formattedText + '</div>';
            
            messagesDiv.appendChild(messageDiv);
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
            console.log('✅ Message added:', isTeacher ? 'Teacher' : 'Student', text.substring(0, 50));
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
                const errorMessage = error instanceof Error ? error.message : String(error);
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

        // ========== AIに質問機能 ==========
        function openAIQuestionModal() {
            document.getElementById('aiQuestionModal').style.display = 'flex';
        }

        function closeAIQuestionModal() {
            document.getElementById('aiQuestionModal').style.display = 'none';
            document.getElementById('aiQuestionText').value = '';
            document.getElementById('aiAnswer').innerHTML = 'ここにAIの回答が表示されます';
        }

        async function submitAIQuestion() {
            const questionText = document.getElementById('aiQuestionText').value.trim();
            if (!questionText) {
                alert('質問を入力してください');
                return;
            }

            const answerDiv = document.getElementById('aiAnswer');
            answerDiv.innerHTML = '<div style="text-align:center;padding:2rem;">🤖 AIが回答を生成中...</div>';

            try {
                const response = await fetch('/api/ai-question', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-APP-KEY': 'kobeya-dev-secret-2024'
                    },
                    body: JSON.stringify({
                        question: questionText,
                        studentId: '${sessionId}'
                    })
                });

                if (!response.ok) {
                    throw new Error('AIリクエストに失敗しました');
                }

                const data = await response.json();
                answerDiv.innerHTML = '<div style="white-space:pre-wrap;line-height:1.6;">' + (data.answer || 'エラーが発生しました') + '</div>';
            } catch (error) {
                answerDiv.innerHTML = '<div style="color:#ef4444;">エラー: ' + error.message + '</div>';
            }
        }
        </script>

        <!-- AIに質問フローティングボタン -->
        <button onclick="openAIQuestionModal()" style="position:fixed;bottom:2rem;right:2rem;width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;font-size:24px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.3);z-index:1000;transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">
            💬
        </button>

        <!-- AIに質問モーダル -->
        <div id="aiQuestionModal" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center;">
            <div style="background:white;border-radius:1rem;width:90%;max-width:600px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,0.3);">
                <div style="background:linear-gradient(135deg,#667eea,#764ba2);color:white;padding:1.5rem;display:flex;justify-content:space-between;align-items:center;border-radius:1rem 1rem 0 0;">
                    <h2 style="margin:0;font-size:1.5rem;">💬 AIに質問</h2>
                    <button onclick="closeAIQuestionModal()" style="background:none;border:none;color:white;font-size:2rem;cursor:pointer;line-height:1;">&times;</button>
                </div>
                <div style="padding:1.5rem;">
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;">質問内容</label>
                        <textarea id="aiQuestionText" placeholder="わからない言葉や概念について質問してください..." style="width:100%;min-height:120px;padding:0.75rem;border:2px solid #e5e7eb;border-radius:0.5rem;font-size:1rem;font-family:inherit;resize:vertical;"></textarea>
                    </div>
                    <div style="margin-bottom:1.5rem;">
                        <label style="display:block;margin-bottom:0.5rem;font-weight:600;">🤖 AI回答</label>
                        <div id="aiAnswer" style="min-height:100px;max-height:300px;overflow-y:auto;padding:1rem;background:#f9fafb;border-radius:0.5rem;border:1px solid #e5e7eb;">ここにAIの回答が表示されます</div>
                    </div>
                    <div style="display:flex;gap:0.75rem;">
                        <button onclick="submitAIQuestion()" style="flex:1;padding:0.75rem 1.5rem;background:linear-gradient(135deg,#667eea,#764ba2);color:white;border:none;border-radius:0.5rem;font-size:1rem;font-weight:600;cursor:pointer;">✅ 質問を送信</button>
                        <button onclick="closeAIQuestionModal()" style="padding:0.75rem 1.5rem;background:#e5e7eb;color:#333;border:none;border-radius:0.5rem;font-size:1rem;font-weight:600;cursor:pointer;">キャンセル</button>
                    </div>
                </div>
            </div>
        </div>
    </body>
    </html>
  `)
})

  console.log('✅ Essay Coaching routes registered')
}
