/**
 * KOBEYA Study Partner - Confirmation Check Handler
 * 確認問題回答チェックハンドラー
 */

import type { Context } from 'hono'
import { getStudyPartnerSession, saveStudyPartnerSessionToDB } from '../services/database'
import { learningSessions } from '../utils/session'

/**
 * 確認問題回答チェック APIハンドラー
 * POST /api/confirmation/check
 */
export async function handleConfirmationCheck(c: Context) {
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
        const { logCompletedSession } = await import('../utils/session-logger')
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
    
  } catch (error: any) {
    console.error('❌ Confirmation check error:', error)
    return c.json({
      ok: false,
      error: 'confirmation_error',
      message: error.message || '確認問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
}
