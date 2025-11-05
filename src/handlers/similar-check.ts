/**
 * KOBEYA Study Partner - Similar Problem Check Handler
 * 類似問題回答チェックハンドラー
 */

import type { Context } from 'hono'
import { getStudyPartnerSession, saveStudyPartnerSessionToDB } from '../services/database'
import { learningSessions } from '../utils/session'

/**
 * 類似問題回答チェック APIハンドラー
 * POST /api/similar/check
 */
export async function handleSimilarCheck(c: Context) {
  console.log('🔥 Similar problem check API called')
  
  try {
    const { sessionId, problemNumber, answer } = await c.req.json()
    
    // パラメータ検証
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
      isCorrect = similarProblem.correctAnswers.some((correct: string) => 
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
      similarProblem.attempts = []
    }
    similarProblem.attempts.push({
      answer,
      isCorrect,
      timestamp: new Date().toISOString()
    })
    
    // 全体の進捗をチェック
    if (!session.similarProblems) {
      console.error('❌ No similarProblems in session:', session)
      return c.json({
        ok: false,
        error: 'missing_similar_problems',
        message: '類似問題データが見つかりません',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const completedProblems = session.similarProblems.filter((p: any) => 
      p.attempts && p.attempts.some((attempt: any) => attempt.isCorrect)
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
          const { logCompletedSession } = await import('../utils/session-logger')
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
    
  } catch (error: any) {
    console.error('❌ Similar check error:', error)
    return c.json({
      ok: false,
      error: 'similar_check_error',
      message: error.message || '類似問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
}
