import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// Type definitions for Essay sessions
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

// 小論文指導ページ
router.get('/', (c) => {
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
          background: #f5f5f5;
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
            console.log('🚀 startLesson called');
            console.log('📊 Current selections:', {
                selectedLevel,
                selectedFormat,
                selectedProblemMode,
                selectedLearningStyle
            });
            
            if (!selectedLevel || !selectedFormat || !selectedProblemMode) {
                alert('すべての項目を選択してください');
                console.log('❌ Validation failed: missing required selections');
                return;
            }
            
            console.log('✅ Validation passed');
            
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
            console.log('📡 Calling API: /api/essay/init-session');
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
                
                console.log('📥 API response status:', response.status);
                const result = await response.json();
                console.log('📦 API result:', result);
                
                if (result.ok) {
                    // 授業ページに遷移
                    console.log('✅ Navigating to session page:', '/essay-coaching/session/' + sessionId);
                    window.location.href = '/essay-coaching/session/' + sessionId;
                } else {
                    console.log('❌ API returned error:', result.message);
                    alert('セッションの初期化に失敗しました: ' + result.message);
                }
            } catch (error) {
                console.error('❌ Session init error:', error);
                alert('エラーが発生しました。もう一度お試しください。');
            }
        }
        

        </script>

        <!-- フローティングAIチャットボタン -->
        <button onclick="openAIChat('essay-ai-help')" style="position: fixed; bottom: 1.5rem; right: 1.5rem; z-index: 50; width: 56px; height: 56px; border: none; padding: 0; cursor: pointer; background: transparent;">
          <div style="width: 100%; height: 100%; background: linear-gradient(135deg, #7c3aed, #8b5cf6); border-radius: 50%; box-shadow: 0 10px 25px rgba(124, 58, 237, 0.5); display: flex; align-items: center; justify-content: center; transition: all 0.3s;"
               onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 15px 35px rgba(124, 58, 237, 0.6)';"
               onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 10px 25px rgba(124, 58, 237, 0.5)';">
            <svg style="width: 28px; height: 28px; color: white;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
            </svg>
          </div>
        </button>
        <script>
        function openAIChat(context) {
          const sessionId = context + '_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          const windowFeatures = 'width=900,height=700,scrollbars=yes,resizable=yes';
          window.open('/international-student/' + sessionId, 'ai-chat-' + context, windowFeatures);
        }
        </script>

        <!-- ログイン状態インジケーター -->
        <div id="login-status-indicator" style="position: fixed; top: 1rem; right: 1rem; z-index: 40;"></div>

        <script>
        (function() {
          function updateLoginStatus() {
            const indicator = document.getElementById('login-status-indicator');
            if (!indicator) return;
            
            try {
              const authData = localStorage.getItem('study_partner_auth');
              const isLoggedIn = !!authData;
              let studentName = 'ゲスト';
              
              if (authData) {
                const parsed = JSON.parse(authData);
                studentName = parsed.studentName || '生徒';
              }
              
              const bgColor = isLoggedIn ? '#f0fdf4' : '#f9fafb';
              const textColor = isLoggedIn ? '#15803d' : '#6b7280';
              const borderColor = isLoggedIn ? '#bbf7d0' : '#e5e7eb';
              const dotColor = isLoggedIn ? '#22c55e' : '#9ca3af';
              const title = isLoggedIn ? studentName + 'さんとしてログイン中' : 'ログインしていません';
              
              indicator.innerHTML = '<div style="display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; background-color: ' + bgColor + '; color: ' + textColor + '; border: 1px solid ' + borderColor + ';" title="' + title + '"><div style="width: 0.5rem; height: 0.5rem; border-radius: 9999px; background-color: ' + dotColor + ';"></div><span style="font-weight: 500;">' + studentName + '</span></div>';
            } catch (error) {
              console.error('Failed to read login status:', error);
            }
          }
          
          updateLoginStatus();
          window.addEventListener('storage', function(e) {
            if (e.key === 'study_partner_auth') {
              updateLoginStatus();
            }
          });
          window.addEventListener('loginStatusChanged', updateLoginStatus);
        })();
        </script>
    </body>
    </html>
  `)
})
// 小論文指導 - 授業セッションページ
router.get('/session/:sessionId', async (c) => {
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
        
        <!-- Forward declarations for inline event handlers -->
        <script>
          // これらの関数は後で定義されますが、HTMLのonclick属性で使用するため先に宣言します
          function quickAction(text) {
            // 実装は後のscriptタグで上書きされます
            console.warn('quickAction called before full initialization');
          }
          function openCamera() {
            console.warn('openCamera called before full initialization');
          }
          function sendMessage() {
            console.warn('sendMessage called before full initialization');
          }
          function handleFileSelect(event) {
            console.warn('handleFileSelect called before full initialization');
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
          background: #f5f5f5;
          min-height: 100vh;
          padding: 1rem;
          color: #333;
        }
        
        .container {
          max-width: 1200px;
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
          background: #d1d5db;
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
          background: #e5e7eb;
          border: 2px solid #9ca3af;
          color: #374151;
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
          min-height: 400px;
          max-height: 70vh;
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
        
        .file-input-btn {
          background: #10b981;
          color: white;
          padding: 0.75rem 1rem;
          min-width: 60px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.25rem;
          position: relative;
        }
        
        .file-input-btn:hover {
          background: #059669;
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(16, 185, 129, 0.3);
        }
        
        .file-input-btn input[type="file"] {
          position: absolute;
          opacity: 0;
          width: 100%;
          height: 100%;
          cursor: pointer;
        }
        
        .camera-input-btn i {
          margin: 0;
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
          background: #e5e7eb;
          border-radius: 0.75rem;
          color: #374151;
          border: 2px solid #d1d5db;
        }
        
        .workflow-step {
          font-size: 0.875rem;
          font-weight: 600;
          padding: 0.5rem 1rem;
          background: #e5e7eb;
          border-radius: 0.5rem;
          color: #374151;
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
          background: #f9fafb;
          border-radius: 1rem;
          padding: 2rem;
          margin: 1.5rem 0;
          color: #374151;
          border: 2px solid #e5e7eb;
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
          background: white;
          border-radius: 0.75rem;
          padding: 1.5rem;
          margin-bottom: 1rem;
          border: 1px solid #e5e7eb;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08);
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
          background: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          line-height: 1.8;
          white-space: pre-wrap;
          color: #374151;
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
        
        /* 開発者用クイックジャンプボタン */
        .dev-quick-jump {
          position: fixed;
          bottom: 80px;
          right: 20px;
          z-index: 9998;
          background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
          color: white;
          border: none;
          border-radius: 50%;
          width: 60px;
          height: 60px;
          font-size: 1.5rem;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
          transition: all 0.3s ease;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .dev-quick-jump:hover {
          transform: scale(1.1);
          box-shadow: 0 6px 20px rgba(245, 158, 11, 0.6);
        }
        
        .dev-quick-jump:active {
          transform: scale(0.95);
        }
        
        .dev-quick-jump-label {
          position: fixed;
          bottom: 85px;
          right: 90px;
          z-index: 9998;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 0.5rem 1rem;
          border-radius: 0.5rem;
          font-size: 0.75rem;
          white-space: nowrap;
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.3s ease;
        }
        
        .dev-quick-jump:hover + .dev-quick-jump-label {
          opacity: 1;
        }
        
        @media (max-width: 768px) {
          .dev-quick-jump {
            width: 50px;
            height: 50px;
            font-size: 1.2rem;
            bottom: 70px;
            right: 15px;
          }
          
          .dev-quick-jump-label {
            bottom: 75px;
            right: 75px;
            font-size: 0.7rem;
            padding: 0.4rem 0.8rem;
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
                        <div class="message teacher" id="initialMessage">
                            <span class="icon">👨‍🏫</span>
                            <div id="initialMessageContent">
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
                    <div class="input-area">
                        <textarea id="userInput" placeholder="ここに回答を入力してください..."></textarea>
                        <button id="cameraInputBtn" onclick="openCamera()" class="camera-input-btn" title="カメラで撮影">
                            <i class="fas fa-camera"></i>
                        </button>
                        <button id="fileInputBtn" class="file-input-btn" title="ファイルから選択（複数可）">
                            <i class="fas fa-image"></i>
                            <input type="file" id="fileInput" accept="image/*" multiple onchange="handleFileSelect(event)" />
                        </button>
                        <button id="sendBtn" onclick="sendMessage()">
                            <i class="fas fa-paper-plane"></i> 送信
                        </button>
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
                    <h2><i class="fas fa-image"></i> 原稿を読み取り</h2>
                    <button class="close-btn" onclick="closeCamera()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <!-- ワークフロー説明 -->
                <div class="workflow-instructions">
                    <div class="workflow-step">1️⃣ 画像を選択</div>
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
                    <h4 style="color: #7c3aed; margin-bottom: 0.5rem;">📝 画像のコツ</h4>
                    <ul style="margin-left: 1.5rem; line-height: 1.8;">
                        <li><strong>カメラ撮影の場合：</strong>原稿用紙全体が画面に入るように撮影してください</li>
                        <li><strong>ファイル選択の場合：</strong>既に撮影済みの画像を選択できます</li>
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
        
        // セッションデータをクライアントサイドに渡す
        const sessionData = {
          lessonFormat: '${essaySession.lessonFormat || 'full_55min'}',
          problemMode: '${essaySession.problemMode}',
          customInput: '${essaySession.customInput || ""}',
          learningStyle: '${essaySession.learningStyle}',
          targetLevel: '${essaySession.targetLevel}'
        };
        
        // セッション設定をコンソールに表示（デバッグ用）
        console.log('🔍 Essay Session Configuration:', {
          sessionId: sessionId,
          ...sessionData,
          timestamp: new Date().toISOString()
        });
        
        // 授業形式に応じてプログレスバーと初期メッセージをカスタマイズ
        (function initializeProgressBar() {
          const lessonFormat = sessionData?.lessonFormat || 'full_55min';
          
          if (lessonFormat === 'vocabulary_focus') {
            // 語彙力重点：4ステップ（語彙×3 + まとめ）- 導入なし
            document.querySelector('#step-1 .step-label').textContent = '語彙①';
            document.querySelector('#step-2 .step-label').textContent = '語彙②';
            document.querySelector('#step-3 .step-label').textContent = '語彙③';
            document.querySelector('#step-4 .step-label').textContent = 'まとめ';
            document.getElementById('step-5').style.display = 'none'; // ステップ5を非表示
            document.getElementById('step-6').style.display = 'none'; // ステップ6を非表示
            
            // 初期メッセージを変更
            document.getElementById('initialMessageContent').innerHTML = 
              'こんにちは！語彙力強化トレーニングを始めましょう。<br>' +
              '口語表現を小論文風に言い換える練習をします。<br>' +
              '準備ができたら「OK」と入力して、送信ボタンを押してください。';
          } else if (lessonFormat === 'short_essay_focus') {
            // 短文重点：4ステップ（短文×3 + まとめ）- 導入なし
            document.querySelector('#step-1 .step-label').textContent = '短文①';
            document.querySelector('#step-2 .step-label').textContent = '短文②';
            document.querySelector('#step-3 .step-label').textContent = '短文③';
            document.querySelector('#step-4 .step-label').textContent = 'まとめ';
            document.getElementById('step-5').style.display = 'none'; // ステップ5を非表示
            document.getElementById('step-6').style.display = 'none'; // ステップ6を非表示
            
            // 初期メッセージを変更
            document.getElementById('initialMessageContent').innerHTML = 
              'こんにちは！短文演習トレーニングを始めましょう。<br>' +
              '段階的に字数を増やして小論文を書く練習をします。<br>' +
              '準備ができたら「OK」と入力して、送信ボタンを押してください。';
          }
          // full_55minの場合はデフォルトのまま（6ステップ）
        })();
        
        function addMessage(text, isTeacher = false) {
            try {
                console.log('🔍 addMessage called:', {
                    textLength: text.length,
                    textPreview: text.substring(0, 100),
                    isTeacher: isTeacher
                });
                
                const messagesDiv = document.getElementById('messages');
                if (!messagesDiv) {
                    console.error('❌ messages div not found!');
                    return;
                }
                
                const messageDiv = document.createElement('div');
                messageDiv.className = 'message ' + (isTeacher ? 'teacher' : 'student');
                
                const icon = isTeacher ? '👨‍🏫' : '👤';
                // Handle literal backslash-n by using String.fromCharCode to avoid escaping issues
                let processedText = text;
                // Replace literal backslash-n with real newlines using character codes
                // 92 = backslash, 110 = 'n'
                const backslashN = String.fromCharCode(92) + 'n';
                while (processedText.indexOf(backslashN) !== -1) {
                    processedText = processedText.replace(backslashN, String.fromCharCode(10));
                }
                // Convert newlines to br tags
                const formattedText = processedText.split(String.fromCharCode(10)).join('<br>');
                console.log('🔍 Formatted text length:', formattedText.length);
                
                messageDiv.innerHTML = '<span class="icon">' + icon + '</span><div>' + formattedText + '</div>';
                
                messagesDiv.appendChild(messageDiv);
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
                
                console.log('✅ Message added successfully');
            } catch (error) {
                console.error('❌ Error in addMessage:', error);
            }
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
                        currentStep,
                        lessonFormat: sessionData?.lessonFormat || 'full_55min'
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
        
        function formatErrorMessage(error, fallback = '不明なエラー') {
            if (error instanceof Error) {
                return error.message || fallback;
            }
            if (typeof error === 'string') {
                return error.trim() || fallback;
            }
            try {
                return JSON.stringify(error);
            } catch (jsonError) {
                console.error('Error stringifying error object:', jsonError);
                return fallback;
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
            
            // 授業形式によって最大ステップ数を変える
            const lessonFormat = sessionData?.lessonFormat || 'full_55min';
            const maxSteps = (lessonFormat === 'vocabulary_focus' || lessonFormat === 'short_essay_focus') ? 4 : 6;
            
            if (currentStep > maxSteps) {
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
            const lessonFormat = sessionData?.lessonFormat || 'full_55min';
            const maxSteps = (lessonFormat === 'vocabulary_focus' || lessonFormat === 'short_essay_focus') ? 4 : 6;
            
            for (let i = 1; i <= maxSteps; i++) {
                const stepDiv = document.getElementById('step-' + i);
                if (!stepDiv) continue;
                
                stepDiv.classList.remove('current', 'completed');
                
                if (i < currentStep) {
                    stepDiv.classList.add('completed');
                } else if (i === currentStep) {
                    stepDiv.classList.add('current');
                }
            }
        }
        
        function getStepIntroMessage(step) {
            // 授業形式に応じたメッセージ
            const lessonFormat = sessionData?.lessonFormat || 'full_55min';
            
            // 授業形式によってステップの内容を変える
            if (lessonFormat === 'vocabulary_focus') {
                // 語彙力重点：語彙練習のみ（4ステップ）- 導入なし
                const messages = {
                    1: '【語彙力強化①】口語表現を小論文風に言い換える練習をしましょう（基礎編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    2: '【語彙力強化②】より高度な表現に挑戦します（応用編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    3: '【語彙力強化③】実践的な使い方を学びましょう（実践編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    4: '【まとめ】今日学んだ語彙を復習しましょう。\\n\\n準備ができたら「OK」と入力して送信してください。'
                };
                return messages[step] || 'ステップを進めましょう。';
            } else if (lessonFormat === 'short_essay_focus') {
                // 短文重点：短文演習のみ（4ステップ）- 導入なし
                const messages = {
                    1: '【短文演習①】100字程度の短文を書いてみましょう（基礎編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    2: '【短文演習②】200字程度の短文に挑戦します（応用編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    3: '【短文演習③】300字程度の短文を書いてみましょう（実践編）。\\n\\n準備ができたら「OK」と入力して送信してください。',
                    4: '【まとめ】今日学んだ書き方のポイントを復習しましょう。\\n\\n準備ができたら「OK」と入力して送信してください。'
                };
                return messages[step] || 'ステップを進めましょう。';
            } else {
                // full_55min（標準）：バランス型（6ステップ）
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
                    body: JSON.stringify({ 
                        sessionId: sessionId,
                        currentStep: currentStep  // ✅ currentStepを送信
                    })
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
        
        // 📄 複数ページサポート
        let multiPageMode = false; // 複数ページモード
        let currentPageNumber = 1; // 現在のページ番号
        let totalPagesPlanned = 1; // 予定ページ数
        let processedPages = []; // 処理済みページ情報 [{pageNumber, text, charCount, processedAt}]
        
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
        
        // ファイル選択処理（複数ファイル対応）
        let selectedFiles = [];
        let currentFileIndex = 0;
        let processedOCRTexts = [];
        
        async function handleFileSelect(event) {
            // ファイル機能もStep 1, 3, 4, 5で使用可能
            if (currentStep !== 1 && currentStep !== 3 && currentStep !== 4 && currentStep !== 5) {
                alert('画像アップロード機能はStep 1（導入）、Step 3（短文）、Step 4（本練習）、Step 5（チャレンジ）で使用できます。');
                event.target.value = ''; // リセット
                return;
            }
            
            const files = Array.from(event.target.files);
            if (files.length === 0) return;
            
            // 画像ファイルかチェック
            const invalidFiles = files.filter(f => !f.type.startsWith('image/'));
            if (invalidFiles.length > 0) {
                alert('画像ファイルのみを選択してください。');
                event.target.value = ''; // リセット
                return;
            }
            
            // 複数ファイルの場合
            if (files.length > 1) {
                selectedFiles = files;
                currentFileIndex = 0;
                processedOCRTexts = [];
                console.log('📚 ' + files.length + '枚の画像が選択されました');
                processNextFile();
            } else {
                // 単一ファイルの場合（既存の処理）
                processSingleFile(files[0]);
            }
        }
        
        // 複数ファイルを順番に処理
        async function processNextFile() {
            if (currentFileIndex >= selectedFiles.length) {
                // すべてのファイルを処理完了
                console.log('✅ すべてのページの処理が完了しました');
                displayMultiPageResult();
                return;
            }
            
            const file = selectedFiles[currentFileIndex];
            const pageNumber = currentFileIndex + 1;
            const totalPages = selectedFiles.length;
            
            console.log('📄 ページ ' + pageNumber + '/' + totalPages + ' を処理中...');
            
            try {
                const imageDataUrl = await readFileAsDataURL(file);
                
                // カメラモーダルを開いて画像を表示
                document.getElementById('cameraModal').classList.add('active');
                updateCameraStatus('ページ ' + pageNumber + '/' + totalPages + ' を読み込んでいます...', 'info');
                
                // 画像を表示
                const capturedImg = document.getElementById('capturedImage');
                const preview = document.getElementById('cameraPreview');
                const cropCanvas = document.getElementById('cropCanvas');
                
                capturedImg.src = imageDataUrl;
                capturedImg.classList.remove('hidden');
                preview.classList.add('hidden');
                cropCanvas.classList.add('hidden');
                
                // ボタンの表示を調整
                document.getElementById('captureBtn').classList.add('hidden');
                document.getElementById('retakeBtn').classList.add('hidden');
                document.getElementById('cropBtn').classList.remove('hidden');
                document.getElementById('uploadBtn').classList.remove('hidden');
                document.getElementById('cropConfirmBtn').classList.add('hidden');
                
                // グローバル変数に保存
                window.currentImageDataUrl = imageDataUrl;
                window.currentPageNumber = pageNumber;
                window.totalPages = totalPages;
                window.isMultiPageMode = true;
                
                updateCameraStatus('ページ ' + pageNumber + '/' + totalPages + ': 範囲を調整するか、そのままOCR処理を開始してください。', 'success');
                
            } catch (error) {
                console.error('File read error:', error);
                alert('ページ ' + pageNumber + ' の読み込みに失敗しました。');
                currentFileIndex++;
                processNextFile();
            }
        }
        
        // ファイルをData URLとして読み込む
        function readFileAsDataURL(file) {
            return new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });
        }
        
        // 単一ファイルの処理（既存の処理）
        async function processSingleFile(file) {
            try {
                const imageDataUrl = await readFileAsDataURL(file);
                
                // カメラモーダルを開いて画像を表示
                document.getElementById('cameraModal').classList.add('active');
                updateCameraStatus('画像を読み込んでいます...', 'info');
                
                // 画像を表示
                const capturedImg = document.getElementById('capturedImage');
                const preview = document.getElementById('cameraPreview');
                const cropCanvas = document.getElementById('cropCanvas');
                
                capturedImg.src = imageDataUrl;
                capturedImg.classList.remove('hidden');
                preview.classList.add('hidden');
                cropCanvas.classList.add('hidden');
                
                // ボタンの表示を調整
                document.getElementById('captureBtn').classList.add('hidden');
                document.getElementById('retakeBtn').classList.add('hidden');
                document.getElementById('cropBtn').classList.remove('hidden');
                document.getElementById('uploadBtn').classList.remove('hidden');
                document.getElementById('cropConfirmBtn').classList.add('hidden');
                
                // グローバル変数に保存
                window.currentImageDataUrl = imageDataUrl;
                window.isMultiPageMode = false;
                
                updateCameraStatus('画像を読み込みました。範囲を調整するか、そのままOCR処理を開始してください。', 'success');
                
            } catch (error) {
                console.error('File select error:', error);
                alert('画像の読み込みに失敗しました。');
            }
        }
        
        // 複数ページの結果を表示
        function displayMultiPageResult() {
            console.log('🔍 displayMultiPageResult called');
            console.log('🔍 processedOCRTexts:', processedOCRTexts);
            console.log('🔍 processedOCRTexts.length:', processedOCRTexts.length);
            
            // Use String.fromCharCode(10) for newline to avoid escaping issues in HTML template literal
            const totalText = processedOCRTexts.join(String.fromCharCode(10));
            const totalChars = totalText.length;
            const pageCount = processedOCRTexts.length;
            
            console.log('📊 全' + pageCount + 'ページ、合計' + totalChars + '文字');
            console.log('🔍 totalText:', totalText);
            
            // モーダルを閉じる
            closeCamera();
            
            // 連結されたテキストをメッセージとして表示（全文を表示）
            const messageParts = [
                '全' + pageCount + 'ページの読み取りが完了しました！ ✅',
                '',
                '合計文字数: ' + totalChars + '文字',
                '',
                '【読み取り内容】',
                totalText,
                '',
                '内容を確認して、「確認完了」と入力してください。',
                '修正が必要な場合は、正しいテキストを入力して送信してください。'
            ];
            // Use String.fromCharCode(10) for newline to avoid escaping issues in HTML template literal
            const resultMessage = messageParts.join(String.fromCharCode(10));
            
            console.log('📝 Result message length:', resultMessage.length);
            console.log('📝 Result message preview:', resultMessage.substring(0, 100));
            
            addMessage(resultMessage, true);
            
            // リセット
            selectedFiles = [];
            currentFileIndex = 0;
            processedOCRTexts = [];
            window.isMultiPageMode = false;
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
            let targetWidth = preview.videoWidth;
            let targetHeight = preview.videoHeight;
            
            // 🔧 OCRに適した解像度に自動調整（文字認識可能な品質を維持）
            // 最大幅: 1920px（Full HD）、アスペクト比維持
            const MAX_WIDTH = 1920;
            const MAX_HEIGHT = 1920;
            
            if (targetWidth > MAX_WIDTH || targetHeight > MAX_HEIGHT) {
                const ratio = Math.min(MAX_WIDTH / targetWidth, MAX_HEIGHT / targetHeight);
                targetWidth = Math.round(targetWidth * ratio);
                targetHeight = Math.round(targetHeight * ratio);
                console.log('📏 Resizing image for OCR:', {
                    original: { width: preview.videoWidth, height: preview.videoHeight },
                    resized: { width: targetWidth, height: targetHeight },
                    ratio: ratio.toFixed(2)
                });
            }
            
            canvas.width = targetWidth;
            canvas.height = targetHeight;
            const ctx = canvas.getContext('2d');
            
            // 高品質リサイズ（imageSmoothingEnabled）
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(preview, 0, 0, targetWidth, targetHeight);
            
            // 品質85%でJPEG変換（OCRに十分、サイズは約50-70%削減）
            capturedImageData = canvas.toDataURL('image/jpeg', 0.85);
            originalImageData = capturedImageData;
            
            const estimatedSizeMB = (capturedImageData.length * 0.75) / (1024 * 1024);
            console.log('📸 Image captured and optimized:', {
                dataLength: capturedImageData.length,
                estimatedSizeMB: estimatedSizeMB.toFixed(2),
                resolution: targetWidth + 'x' + targetHeight,
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
            
            // 🔧 クロップ後も解像度を最適化（OCR品質維持）
            let targetWidth = cropArea.width;
            let targetHeight = cropArea.height;
            const MAX_WIDTH = 1920;
            const MAX_HEIGHT = 1920;
            
            if (targetWidth > MAX_WIDTH || targetHeight > MAX_HEIGHT) {
                const ratio = Math.min(MAX_WIDTH / targetWidth, MAX_HEIGHT / targetHeight);
                targetWidth = Math.round(targetWidth * ratio);
                targetHeight = Math.round(targetHeight * ratio);
                console.log('📏 Resizing cropped image:', {
                    original: { width: cropArea.width, height: cropArea.height },
                    resized: { width: targetWidth, height: targetHeight }
                });
            }
            
            resultCanvas.width = targetWidth;
            resultCanvas.height = targetHeight;
            
            const ctx = resultCanvas.getContext('2d');
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(sourceCanvas,
                cropArea.x, cropArea.y, cropArea.width, cropArea.height,
                0, 0, targetWidth, targetHeight
            );
            
            // 品質85%でJPEG変換
            capturedImageData = resultCanvas.toDataURL('image/jpeg', 0.85);
            
            const estimatedSizeMB = (capturedImageData.length * 0.75) / (1024 * 1024);
            console.log('✂️ Image cropped and optimized:', {
                dataLength: capturedImageData.length,
                estimatedSizeMB: estimatedSizeMB.toFixed(2)
            });
            
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
            // ファイル選択からの画像または撮影した画像を使用
            const imageSource = capturedImageData || window.currentImageDataUrl;
            
            console.log('🔍 Checking image data...', {
                fromCamera: !!capturedImageData,
                fromFile: !!window.currentImageDataUrl,
                exists: !!imageSource,
                type: typeof imageSource,
                length: imageSource ? imageSource.length : 0
            });
            
            if (!imageSource) {
                alert('画像が選択されていません。\\nもう一度カメラで撮影するか、ファイルから選択してください。');
                console.error('❌ No image data available');
                return;
            }
            
            if (imageSource.length < 100) {
                alert('画像データが不正です。\\nもう一度撮影するか、別の画像を選択してください。');
                console.error('❌ Image data is too small:', imageSource.length);
                return;
            }
            
            // closeCamera()を呼ぶ前に画像データをローカル変数に保存
            const imageDataToUpload = imageSource;
            
            console.log('💾 Saved image data to local variable:', {
                length: imageDataToUpload.length,
                prefix: imageDataToUpload.substring(0, 50)
            });
            
            closeCamera();
            
            // ローディングメッセージを表示
            addMessage('📸 画像をアップロード中...', true);
            
            try {
                // 🔧 画像サイズ最適化（8MB制限に自動対応）
                let finalImageData = imageDataToUpload;
                let imageSizeMB = (finalImageData.length * 0.75) / (1024 * 1024);
                
                console.log('📏 Initial image size:', {
                    base64Length: finalImageData.length,
                    estimatedSizeMB: imageSizeMB.toFixed(2)
                });
                
                // サイズが大きい場合は段階的に圧縮（OCR品質を保ちつつ）
                if (imageSizeMB > 6) {
                    console.log('⚙️ Image too large, applying additional compression...');
                    
                    const img = new Image();
                    await new Promise((resolve, reject) => {
                        img.onload = resolve;
                        img.onerror = reject;
                        img.src = finalImageData;
                    });
                    
                    const canvas = document.createElement('canvas');
                    let quality = 0.75; // 品質75%で再圧縮
                    
                    // 解像度も必要に応じてさらに削減
                    let targetWidth = img.width;
                    let targetHeight = img.height;
                    if (imageSizeMB > 8) {
                        const ratio = Math.sqrt(6 / imageSizeMB); // 6MBを目標
                        targetWidth = Math.round(img.width * ratio);
                        targetHeight = Math.round(img.height * ratio);
                        console.log('📐 Further reducing resolution:', {
                            from: img.width + 'x' + img.height,
                            to: targetWidth + 'x' + targetHeight
                        });
                    }
                    
                    canvas.width = targetWidth;
                    canvas.height = targetHeight;
                    const ctx = canvas.getContext('2d');
                    ctx.imageSmoothingEnabled = true;
                    ctx.imageSmoothingQuality = 'high';
                    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);
                    
                    finalImageData = canvas.toDataURL('image/jpeg', quality);
                    imageSizeMB = (finalImageData.length * 0.75) / (1024 * 1024);
                    
                    console.log('✅ Compression complete:', {
                        newSize: imageSizeMB.toFixed(2) + 'MB',
                        reduction: ((1 - finalImageData.length / imageDataToUpload.length) * 100).toFixed(1) + '%'
                    });
                }
                
                console.log('🚀 Starting image upload...', {
                    sessionId: sessionId,
                    imageDataLength: finalImageData.length,
                    estimatedSizeMB: imageSizeMB.toFixed(2),
                    imageDataPrefix: finalImageData.substring(0, 50),
                    currentStep: currentStep
                });
                
                // 画像をアップロード
                const uploadResponse = await fetch('/api/essay/upload-image', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        imageData: finalImageData,
                        currentStep: currentStep
                    })
                });
                
                console.log('📤 Upload response status:', uploadResponse.status);
                
                if (!uploadResponse.ok) {
                    const errorText = await uploadResponse.text();
                    console.error('❌ Upload failed:', {
                        status: uploadResponse.status,
                        statusText: uploadResponse.statusText,
                        error: errorText
                    });
                    
                    let userMessage = 'アップロードに失敗しました';
                    if (uploadResponse.status === 413) {
                        userMessage = '画像サイズが大きすぎます。' + '\\n' + '8MB以下の画像を使用してください。';
                    } else if (uploadResponse.status === 404) {
                        userMessage = 'セッションが見つかりません。' + '\\n' + 'ページをリフレッシュしてやり直してください。';
                    } else if (uploadResponse.status === 500) {
                        userMessage = 'サーバーエラーが発生しました。' + '\\n' + 'しばらく待ってから再度お試しください。';
                    }
                    
                    throw new Error(userMessage + ' (エラーコード: ' + uploadResponse.status + ')');
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
                        imageData: finalImageData,
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
                    // 🔧 Multi-page mode support
                    if (window.isMultiPageMode && window.currentPageNumber && window.totalPages) {
                        const pageNum = window.currentPageNumber;
                        const total = window.totalPages;
                        
                        console.log('✅ ページ ' + pageNum + '/' + total + ' のOCR完了');
                        
                        // OCRテキストを保存
                        const ocrText = ocrResult.result.text || '';
                        console.log('🔍 OCR text length:', ocrText.length);
                        console.log('🔍 OCR text preview:', ocrText.substring(0, 100));
                        processedOCRTexts.push(ocrText);
                        console.log('🔍 processedOCRTexts after push:', processedOCRTexts.length, 'items');
                        
                        // 進捗を表示
                        addMessage('📄 ページ ' + pageNum + '/' + total + ' の処理完了（' + (ocrResult.result.charCount || 0) + '文字）', true);
                        
                        // 次のページへ
                        currentFileIndex++;
                        
                        if (currentFileIndex < selectedFiles.length) {
                            // 次のページを処理
                            addMessage('次のページ（' + (currentFileIndex + 1) + '/' + total + '）を読み込んでいます...', true);
                            setTimeout(() => processNextFile(), 500); // 少し待ってから次へ
                        } else {
                            // すべてのページ完了
                            displayMultiPageResult();
                        }
                    } else {
                        // 単一ページモード（既存の処理）
                        displayOCRResult(ocrResult.result);
                    }
                } else {
                    throw new Error('OCR結果が無効です: ' + JSON.stringify(ocrResult));
                }
                
            } catch (error) {
                console.error('❌ Upload/OCR error:', error);
                const errorMessage = formatErrorMessage(error, 'エラーが発生しました');
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
            window.currentImageDataUrl = null; // ファイル選択からの画像もクリア
            // ファイル入力もリセット
            const fileInput = document.getElementById('fileInput');
            if (fileInput) fileInput.value = '';
        }
        
        // Enterキーで改行可能（送信は送信ボタンのみ）
        // キーイベントリスナーは不要
        
        // 開発者用：Step 4へクイックジャンプ
        function quickJumpToStep4() {
            if (confirm('開発者モード：Step 4（本練習）へジャンプしますか？')) {
                console.log('🚀 Quick jump to Step 4 (Camera step)');
                currentStep = 4;
                
                // 進捗バーを更新
                for (let i = 1; i <= 6; i++) {
                    const stepDiv = document.getElementById('step-' + i);
                    if (stepDiv) {
                        if (i < 4) {
                            stepDiv.classList.add('completed');
                            stepDiv.classList.remove('current');
                        } else if (i === 4) {
                            stepDiv.classList.add('current');
                            stepDiv.classList.remove('completed');
                        } else {
                            stepDiv.classList.remove('completed', 'current');
                        }
                    }
                }
                
                // Step 4のメッセージを表示
                addMessage('【開発者モード】Step 4（本練習）へジャンプしました！\\n\\nこれから800字程度の小論文を書いていただきます。\\n原稿用紙に手書きで書いて、カメラボタン📷で撮影してください。', true);
                addMessage('準備ができたら、下のオレンジ色のカメラボタン📷をタップして原稿を撮影してください。', true);
                
                // カメラボタンを有効化
                document.getElementById('cameraBtn').style.display = 'flex';
                document.getElementById('cameraInputBtn').style.display = 'flex';
            }
        }
        
        // URLパラメータで ?dev=true の場合のみクイックジャンプボタンを表示
        window.addEventListener('DOMContentLoaded', function() {
            const urlParams = new URLSearchParams(window.location.search);
            const isDevMode = urlParams.get('dev') === 'true';
            const isDebugMode = urlParams.get('debug') === 'true';
            
            if (isDevMode) {
                // クイックジャンプボタンを追加
                const jumpBtn = document.createElement('button');
                jumpBtn.className = 'dev-quick-jump';
                jumpBtn.innerHTML = '⚡';
                jumpBtn.onclick = quickJumpToStep4;
                jumpBtn.title = 'Step 4へジャンプ（開発者用）';
                
                const jumpLabel = document.createElement('div');
                jumpLabel.className = 'dev-quick-jump-label';
                jumpLabel.textContent = 'Step 4へジャンプ';
                
                document.body.appendChild(jumpBtn);
                document.body.appendChild(jumpLabel);
                
                console.log('🛠️ Developer mode enabled. Quick jump button added.');
                console.log('💡 Click the ⚡ button to jump to Step 4 (Camera step)');
                
                // 開発者モードの案内メッセージを追加
                addMessage('🛠️ 【開発者モード有効】\\n右下の⚡ボタンでStep 4（カメラ機能）へ直接ジャンプできます。', true);
            }
        });
        </script>
    </body>
    </html>
  `)
})

export default router
