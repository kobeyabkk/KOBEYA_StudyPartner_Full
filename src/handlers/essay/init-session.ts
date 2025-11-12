/**
 * Essay Coaching - Session Initialization Handler
 */
import type { Context } from 'hono'
import { learningSessions } from '../../utils/session'

// DB save function (will be imported from database service later)
async function saveSessionToDB(db: any, sessionId: string, sessionData: any) {
  try {
    await db.prepare(`
      INSERT OR REPLACE INTO learning_sessions 
      (session_id, session_data, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).bind(
      sessionId,
      JSON.stringify(sessionData),
      sessionData.essaySession?.createdAt || new Date().toISOString(),
      new Date().toISOString()
    ).run()
  } catch (error) {
    console.error('❌ Failed to save session to DB:', error)
    throw error
  }
}

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

}

export { handleEssayInitSession }
