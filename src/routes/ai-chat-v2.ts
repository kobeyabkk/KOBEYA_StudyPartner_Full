import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// 品質チェック関数（再生成コンテンツの品質を評価）
function checkRegeneratedContentQuality(originalSession: any, regeneratedContent: any): {
  score: number
  issues: string[]
  passed: boolean
} {
  let score = 1.0
  const issues: string[] = []
  
  // 1. 基本的な構造チェック
  if (!regeneratedContent.analysis || !regeneratedContent.steps) {
    score -= 0.5
    issues.push('missing_required_fields')
  }
  
  // 2. ステップ数の妥当性チェック
  if (regeneratedContent.steps && regeneratedContent.steps.length < 2) {
    score -= 0.2
    issues.push('insufficient_steps')
  }
  
  // 3. 定義の明確性チェック
  if (regeneratedContent.analysis && regeneratedContent.analysis.length < 50) {
    score -= 0.2
    issues.push('definition_problem')
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
router.post('/api/similar/check', async (c) => {
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
router.get('/', (c) => {
  return c.redirect('/study-partner', 302)
})

// ==================== Admin User Management Routes ====================

// Admin Login Page
router.get('/admin/login', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>管理者ログイン | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
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
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .login-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 100%;
    }
    
    .login-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .login-header h1 {
      font-size: 1.75rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .login-header p {
      color: #6b7280;
      font-size: 0.875rem;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .btn-login {
      width: 100%;
      padding: 0.875rem;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    
    .btn-login:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-login:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .error-message {
      background: #fee2e2;
      color: #dc2626;
      padding: 0.75rem 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1rem;
      font-size: 0.875rem;
      display: none;
    }
    
    .error-message.show {
      display: block;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #667eea;
      text-decoration: none;
      font-size: 0.875rem;
    }
    
    .back-link a:hover {
      text-decoration: underline;
    }
  </style>
</head>
<body>
  <div class="login-container">
    <div class="login-header">
      <h1><i class="fas fa-user-shield"></i> 管理者ログイン</h1>
      <p>生徒管理システムへのアクセス</p>
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="loginForm">
      <div class="form-group">
        <label for="password">
          <i class="fas fa-lock"></i> パスワード
        </label>
        <input 
          type="password" 
          id="password" 
          name="password"
          placeholder="管理者パスワードを入力"
          required
          autocomplete="current-password"
        >
      </div>
      
      <button type="submit" class="btn-login" id="loginBtn">
        <i class="fas fa-sign-in-alt"></i> ログイン
      </button>
    </form>
    
    <div style="text-align: center; margin-top: 1rem;">
      <a href="/admin/reset-password" style="color: #667eea; text-decoration: none; font-size: 0.875rem;">
        <i class="fas fa-key"></i> パスワードを忘れた場合
      </a>
    </div>
    
    <div class="back-link">
      <a href="/"><i class="fas fa-arrow-left"></i> ホームに戻る</a>
    </div>
  </div>
  
  <script>
    const loginForm = document.getElementById('loginForm');
    const loginBtn = document.getElementById('loginBtn');
    const errorMessage = document.getElementById('errorMessage');
    
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const password = document.getElementById('password').value;
      
      loginBtn.disabled = true;
      loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ログイン中...';
      errorMessage.classList.remove('show');
      
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ password })
        });
        
        const data = await response.json();
        
        if (data.success) {
          // セッショントークンを保存
          localStorage.setItem('admin_token', data.token);
          // 管理画面にリダイレクト
          window.location.href = '/admin/users';
        } else {
          errorMessage.textContent = data.error || 'ログインに失敗しました';
          errorMessage.classList.add('show');
        }
      } catch (error) {
        errorMessage.textContent = 'エラーが発生しました。もう一度お試しください。';
        errorMessage.classList.add('show');
      } finally {
        loginBtn.disabled = false;
        loginBtn.innerHTML = '<i class="fas fa-sign-in-alt"></i> ログイン';
      }
    });
  </script>
</body>
</html>
  `)
})

// Password Reset Request Page
router.get('/admin/reset-password', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>パスワードリセット | KOBEYA Study Partner</title>
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;600;700&display=swap" rel="stylesheet">
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
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 2rem;
    }
    
    .reset-container {
      background: white;
      border-radius: 1rem;
      padding: 3rem;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
      max-width: 450px;
      width: 100%;
    }
    
    .reset-header {
      text-align: center;
      margin-bottom: 2rem;
    }
    
    .reset-header i {
      font-size: 3rem;
      color: #667eea;
      margin-bottom: 1rem;
    }
    
    .reset-header h1 {
      font-size: 1.5rem;
      color: #374151;
      margin-bottom: 0.5rem;
    }
    
    .reset-header p {
      color: #6b7280;
      font-size: 0.875rem;
      line-height: 1.5;
    }
    
    .info-box {
      background: #dbeafe;
      border-left: 4px solid #3b82f6;
      padding: 1rem;
      border-radius: 0.5rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
      color: #1e40af;
    }
    
    .form-group {
      margin-bottom: 1.5rem;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 0.5rem;
      color: #374151;
      font-weight: 500;
      font-size: 0.875rem;
    }
    
    .form-group input {
      width: 100%;
      padding: 0.75rem 1rem;
      border: 2px solid #e5e7eb;
      border-radius: 0.5rem;
      font-size: 1rem;
      transition: all 0.2s;
    }
    
    .form-group input:focus {
      outline: none;
      border-color: #667eea;
      box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
    }
    
    .btn {
      width: 100%;
      padding: 0.875rem;
      border: none;
      border-radius: 0.5rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
    }
    
    .btn-primary {
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    
    .btn-primary:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 20px rgba(102, 126, 234, 0.3);
    }
    
    .btn-primary:disabled {
      opacity: 0.6;
      cursor: not-allowed;
      transform: none;
    }
    
    .back-link {
      text-align: center;
      margin-top: 1.5rem;
    }
    
    .back-link a {
      color: #6b7280;
      text-decoration: none;
      font-size: 0.875rem;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      transition: color 0.2s;
    }
    
    .back-link a:hover {
      color: #374151;
    }
    
    .success-message {
      background: #d1fae5;
      border-left: 4px solid #10b981;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #065f46;
      margin-bottom: 1.5rem;
      display: none;
    }
    
    .error-message {
      background: #fee2e2;
      border-left: 4px solid #ef4444;
      padding: 1rem;
      border-radius: 0.5rem;
      color: #991b1b;
      margin-bottom: 1.5rem;
      display: none;
    }
  </style>
</head>
<body>
  <div class="reset-container">
    <div class="reset-header">
      <i class="fas fa-key"></i>
      <h1>パスワードリセット</h1>
      <p>登録されているメールアドレスにリセット用のリンクを送信します</p>
    </div>
    
    <div class="info-box">
      <i class="fas fa-info-circle"></i> 
      リセット用のリンクは <strong>kobeyabkk@gmail.com</strong> に送信されます。<br>
      メールが届かない場合は、迷惑メールフォルダもご確認ください。
    </div>
    
    <div class="success-message" id="successMessage">
      <i class="fas fa-check-circle"></i>
      <strong>送信完了</strong><br>
      パスワードリセット用のリンクをメールで送信しました。メールをご確認ください。
    </div>
    
    <div class="error-message" id="errorMessage"></div>
    
    <form id="resetForm">
      <div class="form-group">
        <label for="email">
          <i class="fas fa-envelope"></i> 確認用メールアドレス
        </label>
        <input 
          type="email" 
          id="email" 
          name="email"
          placeholder="kobeyabkk@gmail.com"
          required
        >
        <small style="color: #6b7280; font-size: 0.75rem; margin-top: 0.25rem; display: block;">
          セキュリティのため、登録メールアドレスを入力してください
        </small>
      </div>
      
      <button type="submit" class="btn btn-primary" id="resetBtn">
        <i class="fas fa-paper-plane"></i> リセットリンクを送信
      </button>
    </form>
    
    <div class="back-link">
      <a href="/admin/login"><i class="fas fa-arrow-left"></i> ログインに戻る</a>
    </div>
  </div>
  
  <script>
    const resetForm = document.getElementById('resetForm');
    const resetBtn = document.getElementById('resetBtn');
    const successMessage = document.getElementById('successMessage');
    const errorMessage = document.getElementById('errorMessage');
    
    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const email = document.getElementById('email').value;
      
      // Reset messages
      successMessage.style.display = 'none';
      errorMessage.style.display = 'none';
      
      // Disable button
      resetBtn.disabled = true;
      resetBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 送信中...';
      
      try {
        const response = await fetch('/api/admin/request-password-reset', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ email })
        });
        

export default router
