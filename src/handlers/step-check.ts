/**
 * KOBEYA Study Partner - Step Check Handler
 * 段階学習ステップ回答チェックハンドラー
 */

import type { Context } from 'hono'
import { getStudyPartnerSession, saveStudyPartnerSessionToDB } from '../services/database'

/**
 * ステップ回答チェック APIハンドラー
 * POST /api/step/check
 */
export async function handleStepCheck(c: Context) {
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
    const currentStep = session.steps.find((step: any) => step.stepNumber === stepNumber)
    if (!currentStep) {
      console.error('❌ Step not found:', { stepNumber, availableSteps: session.steps.map((s: any) => s.stepNumber) })
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
      const currentStepIndex = session.steps.findIndex((step: any) => step.stepNumber === stepNumber)
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
    
  } catch (error: any) {
    console.error('❌ Step check error:', error)
    return c.json({
      ok: false,
      error: 'step_check_error',
      message: error.message || 'ステップチェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
}
