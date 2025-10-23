// 学習セッション自動ログ記録機能

import { generateRequestId } from './logging'

// 学習セッションからログデータを抽出する関数
export function extractLogDataFromSession(session: any, studentInfo?: any) {
  if (!session || !session.sessionId) {
    return null
  }

  // 開始・終了時刻の計算
  const startedAt = session.createdAt || new Date().toISOString()
  const endedAt = new Date().toISOString()

  // 教科の推定（AIの分析結果から）
  let subject = 'その他'
  if (session.analysis && typeof session.analysis === 'string') {
    if (session.analysis.includes('数学') || session.analysis.includes('方程式') || session.analysis.includes('関数')) {
      subject = '数学'
    } else if (session.analysis.includes('英語') || session.analysis.includes('English') || session.analysis.includes('文法')) {
      subject = '英語'
    } else if (session.analysis.includes('国語') || session.analysis.includes('現代文') || session.analysis.includes('古文')) {
      subject = '国語'
    } else if (session.analysis.includes('理科') || session.analysis.includes('物理') || session.analysis.includes('化学')) {
      subject = '理科'
    } else if (session.analysis.includes('社会') || session.analysis.includes('地理') || session.analysis.includes('歴史')) {
      subject = '社会'
    }
  }

  // 学習成果の集計
  const completedSteps = session.steps ? session.steps.filter((step: any) => step.completed).length : 0
  const totalSteps = session.steps ? session.steps.length : 0
  const confirmationCorrect = session.confirmationProblem?.attempts ? 
    session.confirmationProblem.attempts.some((attempt: any) => attempt.isCorrect) : false

  // 類似問題の成績集計
  let similarCorrect = 0
  let similarTotal = 0
  if (session.similarProblems && Array.isArray(session.similarProblems)) {
    similarTotal = session.similarProblems.length
    similarCorrect = session.similarProblems.filter((problem: any) =>
      problem.attempts && problem.attempts.some((attempt: any) => attempt.isCorrect)
    ).length
  }

  // 総合正答数・誤答数
  const totalCorrect = completedSteps + (confirmationCorrect ? 1 : 0) + similarCorrect
  const totalAttempted = totalSteps + 1 + similarTotal
  const totalIncorrect = totalAttempted - totalCorrect

  // 弱点タグの抽出
  const weakTags: string[] = []
  
  // ステップで間違った箇所から推定
  if (session.steps) {
    session.steps.forEach((step: any) => {
      if (step.attempts && step.attempts.some((attempt: any) => !attempt.isCorrect)) {
        // ステップの内容から弱点を推定
        if (step.instruction) {
          if (step.instruction.includes('計算') || step.instruction.includes('式')) {
            weakTags.push('計算')
          }
          if (step.instruction.includes('グラフ') || step.instruction.includes('座標')) {
            weakTags.push('グラフ')
          }
          if (step.instruction.includes('文法') || step.instruction.includes('時制')) {
            weakTags.push('文法')
          }
        }
      }
    })
  }

  // 次のアクション推奨
  let nextAction = '引き続き学習を頑張りましょう'
  const accuracy = totalAttempted > 0 ? (totalCorrect / totalAttempted) * 100 : 0
  
  if (accuracy < 50) {
    nextAction = '基礎的な内容の復習が必要です'
  } else if (accuracy < 70) {
    nextAction = '復習と追加練習をお勧めします'
  } else if (accuracy >= 90) {
    nextAction = '素晴らしい理解度です！さらに発展的な内容にチャレンジしましょう'
  }

  // ログデータの構築
  const logData = {
    student_id: session.sid || 'unknown',
    student_name: studentInfo?.name || '生徒',
    date: new Date().toISOString().split('T')[0], // YYYY-MM-DD 形式
    subject: subject,
    textbook_code: null, // 画像解析のため不明
    page: null, // 画像解析のため不明
    problem_id: session.sessionId,
    error_tags: weakTags,
    tasks_done: `段階学習${completedSteps}/${totalSteps}ステップ完了`,
    problems_attempted: String(totalAttempted),
    correct: String(totalCorrect),
    incorrect: String(totalIncorrect),
    mini_quiz_score: String(Math.round(accuracy)),
    weak_tags: weakTags,
    next_action: nextAction,
    started_at: startedAt,
    ended_at: endedAt,
    flag_teacher_review: accuracy < 50, // 正答率50%未満は先生レビュー推奨
    request_id: generateRequestId()
  }

  return logData
}

// セッション終了時の自動ログ送信関数
export async function sendSessionLog(logData: any, env: any): Promise<boolean> {
  try {
    console.log('📝 Sending session log:', {
      student_id: logData.student_id,
      subject: logData.subject,
      accuracy: logData.mini_quiz_score + '%'
    })

    // 内部API呼び出し（同じサーバー内なので直接関数呼び出しも可能）
    const response = await fetch('http://localhost:3000/api/logs', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Webhook-Secret': env.WEBHOOK_SECRET || 'kobeya-dev-secret-2024'
      },
      body: JSON.stringify(logData)
    })

    if (response.ok) {
      const result = await response.json()
      console.log('✅ Session log sent successfully:', result.request_id)
      return true
    } else {
      console.error('❌ Failed to send session log:', response.status, await response.text())
      return false
    }

  } catch (error) {
    console.error('❌ Error sending session log:', error)
    return false
  }
}

// 学習セッション完了時のログ記録ヘルパー
export async function logCompletedSession(sessionId: string, learningSessions: Map<string, any>, studentDatabase: any, env: any): Promise<void> {
  try {
    const session = learningSessions.get(sessionId)
    if (!session) {
      console.log('⚠️ Session not found for logging:', sessionId)
      return
    }

    // 完了済みでない場合はスキップ
    if (session.status !== 'fully_completed' && session.status !== 'similar_problems') {
      console.log('⚠️ Session not completed, skipping log:', sessionId, session.status)
      return
    }

    const studentInfo = studentDatabase[session.sid]
    const logData = extractLogDataFromSession(session, studentInfo)

    if (logData) {
      const success = await sendSessionLog(logData, env)
      if (success) {
        // セッションにログ記録済みフラグを設定
        session.logged = true
        session.loggedAt = new Date().toISOString()
        console.log('✅ Session logged successfully:', sessionId)
      }
    }

  } catch (error) {
    console.error('❌ Error in logCompletedSession:', error)
  }
}