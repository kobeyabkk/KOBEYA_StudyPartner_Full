// 学習ログシステム用ユーティリティ関数

// 数値正規化ユーティリティ
export const toHalfDigits = (s: any): string => {
  if (s == null) return ''
  const str = String(s)
  return str.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
}

export const firstInt = (v: any, fb = 0): number => {
  const m = String(v ?? '').match(/[+-]?\d+/)
  return m ? parseInt(m[0], 10) : fb
}

export const sumInts = (v: any, fb = 0): number => {
  const ms = String(v ?? '').match(/[+-]?\d+/g)
  return ms ? ms.map(n => parseInt(n, 10)).reduce((a, b) => a + b, 0) : fb
}

export const clamp0_100 = (n: number): number => 
  isFinite(n) ? Math.min(100, Math.max(0, Math.trunc(n))) : 0

// ログデータ正規化関数
export function normalize(body: any) {
  const page = body.page == null || String(body.page).trim() === '' 
    ? null 
    : firstInt(toHalfDigits(body.page), null)
  
  const tasksDone = sumInts(toHalfDigits(body.tasks_done || ''), 0)
  const attempted = firstInt(toHalfDigits(body.problems_attempted || ''), 0)
  const correct = firstInt(toHalfDigits(body.correct || ''), 0)
  const incorrect = firstInt(toHalfDigits(body.incorrect || ''), 0)
  const score = clamp0_100(firstInt(toHalfDigits(body.mini_quiz_score ?? ''), 0))
  const flag = Boolean(body.flag_teacher_review)

  return {
    ...body,
    // 必須フィールドのデフォルト値を明示的に設定
    student_name: body.student_name || '',
    date: body.date || new Date().toISOString().split('T')[0], // YYYY-MM-DD形式
    started_at: body.started_at || null,
    ended_at: body.ended_at || null,
    time_spent_min: body.time_spent_min || 0, // デフォルト値
    subject: body.subject || '',
    problem_id: body.problem_id || null,
    error_tags: body.error_tags || [],
    next_action: body.next_action || null,
    page,
    tasks_done: tasksDone,
    problems_attempted: attempted,
    correct,
    incorrect,
    mini_quiz_score: score,
    flag_teacher_review: flag
  }
}

// 時間計算ユーティリティ
export function calcMinutes(startedAt: string, endedAt: string): number {
  if (!startedAt || !endedAt) return 0
  
  try {
    const start = new Date(startedAt).getTime()
    const end = new Date(endedAt).getTime()
    
    if (isNaN(start) || isNaN(end)) return 0
    
    const diffMs = end - start
    return Math.max(0, Math.ceil(diffMs / (1000 * 60))) // 切り上げで分単位
  } catch (error) {
    console.error('❌ Time calculation error:', error)
    return 0
  }
}

// 【廃止済み】従来の教材データベース依存のタグ推定関数
// AIベースのタグ推論に完全移行済み
export function inferTags(logData: any, masterMaterials?: any[]): { weak_tags: string[] } {
  console.log('⚠️ Legacy inferTags called - redirecting to AI-based inference')
  console.log('📝 masterMaterials parameter is now ignored (AI-based system)')
  
  // 従来のmasterMaterials依存を廃止し、AIベースに統一
  // logDataから利用可能な情報を抽出してAI推論に渡す
  const analysisText = extractAnalysisFromLogData(logData)
  return inferTagsAI(analysisText, logData)
}

// ログデータからAI解析用のテキストを抽出
function extractAnalysisFromLogData(logData: any): string {
  const parts: string[] = []
  
  if (logData.subject) {
    parts.push(`教科: ${logData.subject}`)
  }
  
  if (logData.page) {
    parts.push(`ページ: ${logData.page}`)
  }
  
  if (logData.problem_id) {
    parts.push(`問題: ${logData.problem_id}`)
  }
  
  // 正誤情報から学習状況を推測
  if (logData.correct > 0 && logData.incorrect > 0) {
    const accuracy = (logData.correct / (logData.correct + logData.incorrect)) * 100
    if (accuracy < 50) {
      parts.push('理解に課題あり')
    } else if (accuracy < 80) {
      parts.push('部分的な理解')
    }
  } else if (logData.incorrect > 0) {
    parts.push('間違いが発生')
  }
  
  // ミニクイズスコアから弱点を推測
  if (logData.mini_quiz_score < 60) {
    parts.push('基礎理解が不足')
  }
  
  return parts.join(', ')
}

// 【メイン機能】AIベースのタグ推定関数（教材データベース不要）
export function inferTagsAI(analysisText: string, sessionData?: any): { weak_tags: string[] } {
  console.log('🤖 Using AI-based tag inference (main function)')
  
  // 直接実装版のAIタグ推定（import問題を回避）
  const weakTags: string[] = []
  
  // ログデータから解析テキストを生成
  const analysisFromSession = extractAnalysisFromLogData(sessionData || {})
  const combinedText = (analysisText + ' ' + analysisFromSession).toLowerCase()
  
  // 基本的な教科判定
  if (combinedText.includes('数学') || combinedText.includes('方程式') || combinedText.includes('計算')) {
    weakTags.push('数学')
    if (combinedText.includes('二次方程式')) weakTags.push('二次方程式')
    if (combinedText.includes('因数分解')) weakTags.push('因数分解')
    if (combinedText.includes('一次関数')) weakTags.push('一次関数')
    if (combinedText.includes('グラフ')) weakTags.push('グラフ')
  }
  
  if (combinedText.includes('英語') || combinedText.includes('english') || combinedText.includes('文法')) {
    weakTags.push('英語')
    if (combinedText.includes('現在完了')) weakTags.push('現在完了')
    if (combinedText.includes('受動態')) weakTags.push('受動態')
    if (combinedText.includes('不定詞')) weakTags.push('不定詞')
    if (combinedText.includes('文法')) weakTags.push('文法')
  }
  
  // 学習成果から弱点推定
  if (sessionData) {
    const { correct = 0, incorrect = 0, mini_quiz_score = 0 } = sessionData
    
    if (incorrect > correct) {
      weakTags.push('基礎理解')
    }
    
    if (mini_quiz_score < 60) {
      weakTags.push('基礎不足')
    }
    
    if (incorrect > 0) {
      if (combinedText.includes('計算')) weakTags.push('計算ミス')
      if (combinedText.includes('符号')) weakTags.push('符号')
      if (combinedText.includes('文法')) weakTags.push('文法ミス')
    }
  }
  
  const uniqueTags = [...new Set(weakTags)]
  console.log('🤖 AI-based tags:', uniqueTags)
  
  return { weak_tags: uniqueTags }
}

// 弱点タグマージ関数
export const mergeWeakTags = (existingTags: any[] = [], inferred: { weak_tags: any[] }) =>
  Array.from(new Set([...(existingTags || []), ...(inferred?.weak_tags || [])]))

// デバッグ用数値表示
export function debugNums(data: any) {
  return {
    tasks_done: data.tasks_done,
    problems_attempted: data.problems_attempted,
    correct: data.correct,
    incorrect: data.incorrect,
    mini_quiz_score: data.mini_quiz_score,
    time_spent_min: data.time_spent_min
  }
}

// JSON安全パース
export function safeJsonParse(jsonString: string, fallback: any = []) {
  if (!jsonString) return fallback
  try {
    return JSON.parse(jsonString)
  } catch {
    return fallback
  }
}

// JSON安全文字列化
export function safeJsonStringify(obj: any): string {
  if (obj == null) return '[]'
  try {
    return JSON.stringify(obj)
  } catch {
    return '[]'
  }
}

// リクエストID生成（基本的な重複回避）
export function generateRequestId(): string {
  return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}