/**
 * KOBEYA Study Partner - Database Service
 * D1データベース操作サービス
 */

import { learningSessions } from '../utils/session'

/**
 * Study Partner セッションをD1から取得する
 * 
 * @param db - D1 Database
 * @param sessionId - セッションID
 * @returns セッションデータ、または null
 */
export async function getStudyPartnerSessionFromDB(db: any, sessionId: string): Promise<any | null> {
  try {
    const result = await db.prepare(`
      SELECT * FROM learning_sessions WHERE session_id = ?
    `).bind(sessionId).first()
    
    if (!result) {
      console.log('⚠️ Study Partner session not found in D1:', sessionId)
      return null
    }
    
    console.log('✅ Study Partner session retrieved from D1:', sessionId)
    
    // D1データをオブジェクトに復元
    return {
      sessionId: result.session_id,
      appkey: result.appkey,
      sid: result.sid,
      problemType: result.problem_type,
      analysis: result.analysis,
      steps: JSON.parse(result.steps as string),
      confirmationProblem: JSON.parse(result.confirmation_problem as string),
      similarProblems: JSON.parse(result.similar_problems as string),
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

/**
 * Study Partner セッションをD1に保存する
 * 
 * @param db - D1 Database
 * @param sessionId - セッションID
 * @param session - セッションデータ
 */
export async function saveStudyPartnerSessionToDB(db: any, sessionId: string, session: any): Promise<void> {
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
    throw error
  }
}

/**
 * セッションを取得する（インメモリ → D1フォールバック）
 * 
 * @param db - D1 Database (optional)
 * @param sessionId - セッションID
 * @returns セッションデータ、または null
 */
export async function getStudyPartnerSession(db: any, sessionId: string): Promise<any | null> {
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
