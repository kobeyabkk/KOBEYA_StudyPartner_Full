import { Hono } from 'hono'
import { serveStatic } from 'hono/cloudflare-workers'
import { cors } from 'hono/cors'
// ログシステム用ユーティリティをインポート
import {
  normalize,
  calcMinutes,
  inferTags,
  inferTagsAI,
  mergeWeakTags,
  debugNums,
  safeJsonParse,
  safeJsonStringify,
  generateRequestId
} from './utils/logging'
// Study Partner Simple をインポート
import { studyPartnerSimple } from './study-partner-simple'

// Cloudflare Bindings の型定義
type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const app = new Hono<{ Bindings: Bindings }>()

// 開発モード設定
const USE_MOCK_RESPONSES = false

// 学習セッション管理（インメモリ）
const learningSessions = new Map()

// 教育方針フレームワーク読み込み
let educationalPolicy: any = null

// 教育方針を読み込む関数
async function loadEducationalPolicy() {
  try {
    // 本来は外部ファイルから読み込むが、ここでは埋め込み
    educationalPolicy = {
      "ai_interaction_protocols": {
        "communication_style": {
          "tone_and_manner": {
            "basic_principles": [
              "丁寧で親しみやすい敬語を使用",
              "学習者の年齢に適した語彙と表現",
              "励ましと支援の姿勢を常に保持",
              "多様性を尊重した包括的な言葉遣い"
            ]
          }
        }
      },
      "cross_curricular_competencies": {
        "key_competencies": {
          "language_ability": {
            "ai_guidance": [
              "適切な語彙と文法を用いた明確な説明を心がける",
              "学習者の発達段階に応じた言葉遣いを選択する",
              "多様な表現方法（文字、音声、図表等）を組み合わせる"
            ]
          },
          "problem_solving": {
            "ai_guidance": [
              "段階的な思考プロセスを明示して支援する",
              "複数の解決方法を提示し、比較検討を促す",
              "失敗を学習機会として前向きに捉える姿勢を育成する"
            ]
          }
        }
      },
      "teaching_methodology": {
        "pedagogical_approaches": {
          "individualized_support": {
            "ai_guidance": [
              "学習履歴と理解度を分析して個別最適な支援を提供",
              "多様な学習スタイルに対応した説明方法を選択",
              "適切な難易度の問題や課題を提示"
            ]
          }
        }
      }
    }
    console.log('📚 Educational policy loaded successfully')
  } catch (error) {
    console.error('❌ Failed to load educational policy:', error)
  }
}

// 起動時に教育方針を読み込み
loadEducationalPolicy()

// 生徒情報データベース（必要最小限追加）
interface StudentInfo {
  studentId: string
  name: string
  grade: number
  subjects: string[]
  weakSubjects: string[]
  lastLogin: string
}

const studentDatabase: Record<string, StudentInfo> = {
  'JS2-04': {
    studentId: 'JS2-04',
    name: '田中太郎',
    grade: 2,
    subjects: ['数学', '理科'],
    weakSubjects: ['英語'],
    lastLogin: new Date().toISOString()
  },
  'test123': {
    studentId: 'test123',
    name: 'テスト生徒',
    grade: 1,
    subjects: ['国語'],
    weakSubjects: ['数学'],
    lastLogin: new Date().toISOString()
  }
}

console.log('🚀 Study Partner server starting...')

// CORS設定
app.use('/api/*', (c, next) => {
  c.header('Access-Control-Allow-Origin', '*')
  c.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  c.header('Access-Control-Allow-Headers', '*')
  return next()
})

app.options('/api/*', (c) => {
  return c.text('', 200)
})

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// Health check endpoint
app.get('/api/health', (c) => {
  console.log('🏥 Health check endpoint called')
  
  const response = {
    ok: true,
    status: 'OK',
    mode: USE_MOCK_RESPONSES ? 'development' : 'production',
    timestamp: new Date().toISOString()
  }
  
  console.log('🏥 Health check response:', response)
  return c.json(response, 200)
})

// ログインAPI（最小限追加）
app.post('/api/login', async (c) => {
  try {
    const { appkey, sid } = await c.req.json()
    console.log('🔑 Login attempt:', { appkey, sid })
    
    const validAppKeys = ['KOBEYA2024', '180418']
    if (!validAppKeys.includes(appkey)) {
      return c.json({ success: false, message: 'APP_KEYが正しくありません' }, 401)
    }
    
    const studentInfo = studentDatabase[sid]
    if (!studentInfo) {
      return c.json({ success: false, message: '生徒IDが見つかりません' }, 404)
    }
    
    studentInfo.lastLogin = new Date().toISOString()
    
    return c.json({ 
      success: true, 
      message: 'ログインに成功しました', 
      studentInfo: {
        studentId: studentInfo.studentId,
        name: studentInfo.name,
        grade: studentInfo.grade,
        subjects: studentInfo.subjects,
        weakSubjects: studentInfo.weakSubjects
      }
    })
  } catch (error) {
    console.error('❌ Login error:', error)
    return c.json({ success: false, message: 'ログイン処理でエラーが発生しました' }, 500)
  }
})

// 画像解析 + 段階学習開始 endpoint
app.post('/api/analyze-and-learn', async (c) => {
  console.log('📸 Analyze and learn endpoint called')
  
  try {
    const formData = await c.req.formData()
    const appkey = formData.get('appkey')?.toString() || '180418'
    const sid = formData.get('sid')?.toString() || 'JS2-04'
    const imageField = formData.get('image')
    const userMessage = formData.get('message')?.toString() || ''
    
    console.log('📸 Image analysis request:', { appkey, sid, hasImage: !!imageField, hasMessage: !!userMessage })
    
    if (!imageField || !(imageField instanceof File)) {
      throw new Error('画像ファイルが必要です')
    }
    
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 生徒情報の取得
    const studentInfo = studentDatabase[sid]
    console.log('👨‍🎓 Student info:', studentInfo ? `${studentInfo.name} (中学${studentInfo.grade}年)` : 'Not found')
    
    // OpenAI API Key の確認
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    console.log('🔑 API Key check:', apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing')
    
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found - using fallback')
      // フォールバック: ダミーデータを使用
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ AI接続でエラーが発生しました。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      // 学習セッションを保存（フォールバック）
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: フォールバック時も構造の一貫性を保持
        originalImageData: null,
        originalUserMessage: ''
      }
      learningSessions.set(sessionId, learningSession)
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: problemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    // 画像サポート形式チェック
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(imageField.type)) {
      console.warn('⚠️ Unsupported image type:', imageField.type)
      // フォールバック処理
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ サポートされていない画像形式です。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      learningSessions.set(sessionId, learningSession)
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: problemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    // 画像をBase64に変換（Cloudflare Workers環境対応）
    let base64Image
    try {
      const arrayBuffer = await imageField.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      if (uint8Array.length > 500000) { // 500KB制限
        throw new Error('Image too large for Base64 encoding')
      }
      
      // Cloudflare Workers環境でのBase64エンコーディング
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      base64Image = btoa(binary)
    } catch (base64Error) {
      console.error('❌ Base64 encoding failed:', base64Error)
      // フォールバック処理
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const problemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(problemType)
      learningData.analysis = `【AI学習アシスタント】\n\n⚠️ 画像処理でエラーが発生しました。サンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！`
      
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
      learningSessions.set(sessionId, learningSession)
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: '段階学習を開始します'
      })
    }
    
    const dataUrl = `data:${imageField.type};base64,${base64Image}`
    console.log('🤖 Starting OpenAI Vision API analysis...')
    
    // OpenAI Vision API 呼び出し
    try {
      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: `あなたは中学生向けの学習サポート専門教師です。バンコクの日本人向け教育塾「プログラミングのKOBEYA」で中学1-3年生の勉強をお手伝いしています。

【重要】この画像は教育目的の学習教材です：
- 中学生の勉強をサポートするための問題画像です
- 数学、英語、国語、理科、社会などの教科書や問題集のページです
- 教育的な内容分析をお願いします
- 読み取りにくい部分があっても、教育的観点から適切な学習内容を作成してください

【参考：現在の生徒情報】
${studentInfo ? 
  `生徒名：${studentInfo.name}
学年：中学${studentInfo.grade}年生
得意分野：${studentInfo.subjects.join('・')}
苦手分野：${studentInfo.weakSubjects.join('・')}

※この情報は参考程度に活用し、問題の本来の難易度や内容は正確に分析してください。
説明方法や例え話で生徒に配慮した指導をお願いします。` : 
  '生徒情報なし（問題内容に基づいて適切なレベルで指導してください）'
}

【教育方針（文部科学省学習指導要領準拠）】
- 人間中心の学習重視：一人一人の人格を尊重し、個性を生かす指導
- 主体的・対話的で深い学び：段階的思考プロセスの明示支援
- 3つの観点重視：知識・技能、思考・判断・表現、主体的学習態度の育成
- 中学生向けのやさしい敬語で説明（学習者の発達段階に応じた言葉遣い）
- 海外在住への配慮：「日本でも同じ内容を学習するよ」「心配しないで大丈夫」
- 問題解決能力育成：複数解決方法の提示、比較検討の促進
- 温かい励ましと支援姿勢：失敗を学習機会として前向きに捉える
- 個別最適化支援：学習履歴と理解度に応じた説明方法の選択

【学年判定ルール（文部科学省学習指導要領準拠）】
■数学
- 中学1年：正負の数、文字式、一次方程式、比例・反比例、平面図形、空間図形
- 中学2年：連立方程式、一次関数、図形の性質（合同）、確率
- 中学3年：二次方程式、二次関数、図形の相似、三平方の定理、標本調査

■英語
- 中学1年：be動詞、一般動詞、現在形、過去形、疑問文・否定文の基本
- 中学2年：未来形、助動詞、不定詞、動名詞、比較級・最上級
- 中学3年：現在完了、受動態、関係代名詞、分詞

■国語
- 中学1年：品詞、文の組み立て、説明文・物語文の読解、漢字・語彙
- 中学2年：文章の構成と要約、古典入門、表現技法、作文・小論文の基礎
- 中学3年：論理的文章、古文・漢文、小論文、高校入試対策

■理科
- 中学1年：生物（植物・動物）、地学（地層・地震）、物理（光・音・力）
- 中学2年：化学（原子・分子・化学変化）、生物（消化・呼吸・血液）、物理（電流）
- 中学3年：物理（運動・エネルギー）、化学（イオン・酸アルカリ）、生物（遺伝）、地学（太陽系）

■社会
- 中学1年：地理（世界・日本の地形・気候・産業）
- 中学2年：歴史（古代〜近世）
- 中学3年：歴史（近現代）、公民（憲法・政治・経済）

【分析と学習コンテンツ作成の要求】

【段階学習ステップ生成ルール】
- 問題の複雑さに応じて4-7ステップを動的生成してください
- 基礎問題：4-5ステップ（基本概念確認→練習→応用）
- 標準問題：5-6ステップ（概念確認→基本練習→発展練習→総合）  
- 応用問題：6-7ステップ（概念分解→段階的練習→複合練習→応用→総合）
- 各ステップは前のステップの理解を前提とした段階的構成
- 最終ステップは必ず元問題レベルの総合演習にしてください

【選択肢問題の重要な要件】
- **全ての段階学習ステップは必ず選択肢問題（type: "choice"）にしてください**
- **input形式は絶対に使用しないでください**
- **各ステップには必ず4つの選択肢（A, B, C, D）を作成してください**
- **選択肢は具体的で教育的価値があるものにしてください**
- **正解以外の選択肢も学習に有益な内容にしてください**

【正解位置の分散について】
- **正解がすべてA（選択肢1）にならないよう、意図的にランダム化してください**
- **段階学習ステップでは正解をA, B, C, Dにバランスよく分散させてください**
- **確認問題と類似問題でも正解の位置をランダムにしてください**
- **Fisher-Yatesシャッフルのように、最初に内容を決めてから選択肢順序をランダム化してください**

【類似問題生成ルール】
- 元画像の問題内容を分析し、5-8問の類似問題を動的生成してください
- 難易度段階：easy(2-3問)→medium(2-3問)→hard(1-2問)
- 数値や文字を変更した同パターン問題
- 解法は同じで表現形式を変えた問題
- 一歩発展させた応用問題を含める
- 各問題は独立して解けるよう設計してください

【類似問題の形式指定】
- **選択問題と記述問題を混ぜてください**
- **easy問題の60%**: choice形式（選択肢4つ）
- **easy問題の40%**: input形式（記述回答）
- **medium問題の50%**: choice形式（選択肢4つ）
- **medium問題の50%**: input形式（記述回答）
- **hard問題の30%**: choice形式（選択肢4つ）  
- **hard問題の70%**: input形式（記述回答）
- input形式では具体的な計算過程や解法手順を求める問題にしてください

【回答形式】
以下のJSON形式で回答してください：
{
  "subject": "数学|英語|プログラミング|その他",
  "problemType": "custom",
  "difficulty": "basic|intermediate|advanced", 
  "analysis": "【詳細分析】\\n\\n①問題の整理\\n（どんな問題か、何を求めるかを整理）\\n\\n②使う知識\\n（この問題を解くために必要な基礎知識）\\n\\n③解法のポイント\\n（解き方の流れと重要なポイント）\\n\\n④解答例\\n（解答と計算過程）\\n\\n⑤確認・振り返り\\n（解答の確認方法、類似問題への応用）\\n\\n※中学生向けのやさしい言葉で、励ましの言葉も含めて詳細に説明してください",
  "confidence": 0.0-1.0,
  "steps": [
    {
      "stepNumber": 0,
      "instruction": "ステップ1の指導内容（問いかけ形式で思考を促す）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "C",
      "explanation": "励ましを含む詳細解説"
    },
    {
      "stepNumber": 1,
      "instruction": "ステップ2の指導内容",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "D",
      "explanation": "前ステップを踏まえた詳細解説"
    }
    // 問題の複雑さに応じて4-7ステップまで動的生成
    // 【重要】全てのステップはtype: "choice"で4つの選択肢必須
  ],
  "confirmationProblem": {
    "question": "確認問題の内容（元問題と同レベル）",
    "type": "choice",
    "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
    "correctAnswer": "A",
    "explanation": "中学生向けの確認問題解説"
  },
  "similarProblems": [
    {
      "problemNumber": 1,
      "question": "類似問題1（easy）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "類似問題1の詳細解説",
      "difficulty": "easy"
    },
    {
      "problemNumber": 2,
      "question": "類似問題2（easy）- 計算過程を示して解答してください",
      "type": "input", 
      "correctAnswers": ["正解例1", "正解例2"],
      "explanation": "類似問題2の詳細解説と解法手順",
      "difficulty": "easy"
    }
    // 5-8問まで動的生成（easy→medium→hardの順）
  ]
}

【重要な指示】
- ChatGPT学習支援モードで回答してください
- 画像を正確に詳細分析し、教科・難易度を精密判定してください
- 生徒情報は参考程度に活用（問題本来の難易度は維持）
- analysisには従来通り高品質な詳細分析を記載（表示制御は別途実装）
- 段階学習の品質は最高レベルを維持してください

【動的コンテンツ生成の必須要件】
- **段階学習**：問題分析に基づき4-7ステップを適切に生成してください
- **類似問題**：元画像内容を詳細分析し、5-8問を段階的難易度で生成してください
- 固定パターンではなく、各問題に最適化されたコンテンツを作成してください
- 段階的な問いかけで生徒の思考を促進
- 即答せず、考えさせる指導スタイル
- 温かく励ましの言葉を多用
- 各ステップは前のステップの理解を前提とした構成
- 解説は詳細で分かりやすく、温かい励ましを含める
- すべて日本語で作成

【品質保証】
- stepsは最低4個、最大7個まで生成してください（固定1-3個は禁止）
- similarProblemsは最低5個、最大8個まで生成してください（固定3個は禁止）
- 各コンテンツは問題の内容・難易度・教科特性に完全に対応させてください

【選択肢問題の絶対要件】
- **段階学習の全ステップは必ずtype: "choice"にしてください**
- **確認問題も必ずtype: "choice"にしてください**
- **類似問題はtype: "choice"とtype: "input"を混ぜてください**
- **choice形式の問題には必ず4つの選択肢（A, B, C, D）を含めてください**
- **choice形式ではoptionsフィールドが必須で、4要素の配列にしてください**
- **input形式ではcorrectAnswersフィールドに正解例の配列を含めてください**
- **段階学習と確認問題では選択肢がない問題は絶対に作らないでください**

【正解位置の工夫】
- **正解がすべてA（1番目）になることを絶対に避けてください**
- **段階学習ステップの正解はA, B, C, Dにバランス良く分散させてください**
- **意図的に正解位置を変更し、1つの問題セットで正解が偏らないようにしてください**
- **例：step0→C、step1→A、step2→D、step3→B のように多様化してください**`
            },
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: userMessage ? 
                    `ユーザーからの質問・要望: ${userMessage}\n\n上記の内容を踏まえて、この画像を分析し、適切な学習内容を提案してください。` :
                    'この画像を分析して、適切な学習内容を提案してください。'
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: dataUrl,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 8000,
          temperature: 0.3
        })
      })
      
      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text()
        console.error('❌ OpenAI API error:', openaiResponse.status, errorText)
        throw new Error(`OpenAI API Error: ${openaiResponse.status}`)
      }
      
      const aiContent = (await openaiResponse.json())?.choices?.[0]?.message?.content || ''
      console.log('🤖 AI content length:', aiContent.length)
      console.log('🤖 AI content preview (first 500 chars):', aiContent.substring(0, 500))
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
      let aiAnalysis
      
      if (jsonMatch) {
        try {
          aiAnalysis = JSON.parse(jsonMatch[0])
          console.log('🤖 AI分析成功:', {
            subject: aiAnalysis.subject,
            problemType: aiAnalysis.problemType,
            difficulty: aiAnalysis.difficulty,
            confidence: aiAnalysis.confidence
          })
        } catch (parseError) {
          console.error('❌ AI分析結果のJSON解析エラー:', parseError)
          throw new Error('AI分析結果の解析に失敗しました')
        }
      } else {
        console.error('❌ AI分析結果にJSONが見つかりません:', aiContent.substring(0, 200))
        
        // OpenAIが拒否した場合の対処
        if (aiContent.includes("I'm sorry") || aiContent.includes("I can't") || aiContent.includes("Sorry") || aiContent.toLowerCase().includes("assist")) {
          throw new Error('この画像は分析できません。以下の理由が考えられます：\n\n• 個人情報（名前、顔写真など）が含まれている\n• 著作権のある教材（教科書、問題集など）\n• 実際のテスト・試験問題\n\n別の画像をお試しいただくか、問題を手書きで作成してください。')
        }
        
        throw new Error('AI分析結果の形式が不正です。画像が不鮮明か、問題が読み取れない可能性があります。')
      }
      
      // AI分析結果から学習データを構築
      const selectedProblemType = aiAnalysis.problemType || 'custom'
      
      // AIが生成した学習データを使用（カスタムコンテンツ）
      let learningData
      if (aiAnalysis.steps && Array.isArray(aiAnalysis.steps)) {
        // AIが完全な学習データを生成した場合
        console.log('✅ AI generated complete steps:', aiAnalysis.steps.length)
        console.log('🔍 First step details:', {
          stepNumber: aiAnalysis.steps[0]?.stepNumber,
          instruction: aiAnalysis.steps[0]?.instruction?.substring(0, 50) + '...',
          type: aiAnalysis.steps[0]?.type,
          optionsCount: aiAnalysis.steps[0]?.options?.length,
          options: aiAnalysis.steps[0]?.options
        })
        
        learningData = {
          analysis: `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`,
          steps: aiAnalysis.steps.map(step => {
            // 選択肢問題でない場合、強制的に選択肢問題に変換
            if (step.type !== 'choice' || !step.options || !Array.isArray(step.options) || step.options.length < 4) {
              console.warn(`⚠️ Step ${step.stepNumber} is not choice type or missing options, converting to choice`)
              return {
                ...step,
                type: 'choice',
                options: [
                  "A) 基礎的な概念を確認する",
                  "B) 中程度の理解を示す", 
                  "C) 応用的な考え方をする",
                  "D) 発展的な解法を選ぶ"
                ],
                correctAnswer: "A",
                completed: false,
                attempts: []
              }
            }
            return {
              ...step,
              completed: false,
              attempts: []
            }
          }),
          confirmationProblem: (() => {
            const confirmation = aiAnalysis.confirmationProblem || {
              question: "確認問題: 学習内容を理解できましたか？",
              type: "choice",
              options: ["A) よく理解できた", "B) 少し理解できた", "C) もう一度説明が欲しい", "D) 全く分からない"],
              correctAnswer: "A",
              explanation: "素晴らしい！理解が深まりましたね。",
              attempts: []
            }
            
            // 確認問題も選択肢問題を強制
            if (confirmation.type !== 'choice' || !confirmation.options || !Array.isArray(confirmation.options) || confirmation.options.length < 4) {
              console.warn('⚠️ Confirmation problem is not choice type, converting to choice')
              confirmation.type = 'choice'
              confirmation.options = [
                "A) よく理解できた",
                "B) 少し理解できた", 
                "C) もう一度説明が欲しい",
                "D) 全く分からない"
              ]
              confirmation.correctAnswer = "A"
            }
            
            return {
              ...confirmation,
              attempts: []
            }
          })(),
          similarProblems: (aiAnalysis.similarProblems || []).map(problem => {
            // 類似問題は選択肢問題と記述問題の混合を許可
            if (problem.type === 'choice') {
              // choice形式の検証
              if (!problem.options || !Array.isArray(problem.options) || problem.options.length < 4) {
                console.warn(`⚠️ Similar problem ${problem.problemNumber} is choice type but missing proper options`)
                return {
                  ...problem,
                  type: 'choice',
                  options: [
                    "A) 基本的な解法",
                    "B) 標準的なアプローチ",
                    "C) 応用的な考え方", 
                    "D) 発展的な解法"
                  ],
                  correctAnswer: "A",
                  attempts: []
                }
              }
            } else if (problem.type === 'input') {
              // input形式の検証
              if (!problem.correctAnswers || !Array.isArray(problem.correctAnswers)) {
                console.warn(`⚠️ Similar problem ${problem.problemNumber} is input type but missing correctAnswers`)
                return {
                  ...problem,
                  type: 'input',
                  correctAnswers: ["計算過程を記述してください"],
                  attempts: []
                }
              }
            } else {
              // 不明な形式の場合はchoice形式に変換
              console.warn(`⚠️ Similar problem ${problem.problemNumber} has unknown type, converting to choice`)
              return {
                ...problem,
                type: 'choice',
                options: [
                  "A) 基本的な解法",
                  "B) 標準的なアプローチ",
                  "C) 応用的な考え方", 
                  "D) 発展的な解法"
                ],
                correctAnswer: "A",
                attempts: []
              }
            }
            
            return {
              ...problem,
              attempts: []
            }
          })
        }
      } else {
        // AIが部分的なデータしか生成しなかった場合のフォールバック
        console.log('⚠️ AI did not generate complete steps, using fallback')
        learningData = generateLearningData('quadratic_equation')
        learningData.analysis = `【AI学習アシスタント分析結果】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🎯 **段階的学習を開始します**<br>一緒に問題を解いていきましょう。<br>各ステップで丁寧に説明しながら進めます！`
      }
      
      // 学習セッションを保存（AI分析成功）- 修正1: 元画像データも保存
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: 再生成用に元画像データとメッセージを保存
        originalImageData: dataUrl,  // base64形式の元画像
        originalUserMessage: userMessage || ''  // ユーザーが入力したメッセージ
      }
      learningSessions.set(sessionId, learningSession)
      
      console.log('✅ AI analysis completed successfully')
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: aiAnalysis.subject || '学習',
        grade: aiAnalysis.grade || (studentInfo ? studentInfo.grade : 2),
        difficulty: aiAnalysis.difficulty || 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: 'AI解析完了 - 段階学習を開始します'
      })
      
    } catch (aiError) {
      console.error('❌ OpenAI API呼び出しエラー:', aiError)
      
      // AI分析に失敗した場合の安全なフォールバック
      const problemTypes = ['quadratic_equation', 'english_grammar']
      const selectedProblemType = problemTypes[Math.floor(Math.random() * problemTypes.length)]
      let learningData = generateLearningData(selectedProblemType)
      learningData.analysis = '【AI学習アシスタント】\n\n⚠️ AI分析でエラーが発生しました。画像の内容を推測してサンプル問題で学習を開始します。\n\n🎯 **段階的学習を開始します**\n一緒に問題を解いていきましょう。各ステップで丁寧に説明しながら進めます！'
      
      // 学習セッションを保存（AI分析エラーフォールバック）
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType: selectedProblemType,
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // 修正1: エラー時フォールバックでも構造の一貫性を保持  
        originalImageData: null,
        originalUserMessage: ''
      }
      learningSessions.set(sessionId, learningSession)
      
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: selectedProblemType === 'quadratic_equation' ? '数学' : '英語',
        grade: studentInfo ? studentInfo.grade : 2,
        difficulty: 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: 'フォールバック動作 - 段階学習を開始します'
      })
    }

    
  } catch (error) {
    console.error('❌ Analyze and learn error:', error)
    return c.json({
      ok: false,
      error: 'analyze_error',
      message: error.message || 'AI解析でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 段階学習 - ステップ回答チェック endpoint
app.post('/api/step/check', async (c) => {
  console.log('📝 Step check endpoint called')
  
  try {
    const body = await c.req.json()
    const { sessionId, stepNumber, answer } = body
    
    console.log('📝 Step check request:', { sessionId, stepNumber, answer })
    
    // セッション取得
    const session = learningSessions.get(sessionId)
    if (!session) {
      throw new Error('学習セッションが見つかりません')
    }
    
    // 現在のステップ取得（stepNumberで検索）
    const currentStep = session.steps.find(step => step.stepNumber === stepNumber)
    if (!currentStep) {
      console.error('❌ Step not found:', { stepNumber, availableSteps: session.steps.map(s => s.stepNumber) })
      throw new Error('無効なステップ番号です')
    }
    
    // 回答評価
    const isCorrect = answer === currentStep.correctAnswer
    
    // 回答を記録
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
      const currentStepIndex = session.steps.findIndex(step => step.stepNumber === stepNumber)
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
    
  } catch (error) {
    console.error('❌ Step check error:', error)
    return c.json({
      ok: false,
      error: 'step_check_error',
      message: error.message || 'ステップチェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 確認問題 - 回答チェック endpoint
app.post('/api/confirmation/check', async (c) => {
  console.log('🎯 Confirmation check endpoint called')
  
  try {
    const body = await c.req.json()
    const { sessionId, answer } = body
    
    console.log('🎯 Confirmation check request:', { sessionId, answer })
    
    // セッション取得
    const session = learningSessions.get(sessionId)
    if (!session) {
      throw new Error('学習セッションが見つかりません')
    }
    
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
        const { logCompletedSession } = await import('./utils/session-logger')
        await logCompletedSession(sessionId, learningSessions, {}, c.env)
      } catch (error) {
        console.error('❌ Failed to log confirmation completion:', error)
      }
    }
    
    session.updatedAt = new Date().toISOString()
    
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
    
  } catch (error) {
    console.error('❌ Confirmation check error:', error)
    return c.json({
      ok: false,
      error: 'confirmation_error',
      message: error.message || '確認問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// AI質問チャットAPI（画像対応）
app.post('/api/ai/chat', async (c) => {
  console.log('🤖 AI chat API called')
  
  try {
    const { sessionId, question, image } = await c.req.json()
    
    console.log('🤖 AI Chat: Request details:')
    console.log('  - sessionId:', sessionId)
    console.log('  - question:', question || '(empty)')
    console.log('  - image present:', !!image)
    console.log('  - image type:', typeof image)
    if (image) {
      console.log('  - image length:', image.length)
      console.log('  - image starts with:', image.substring(0, 30) + '...')
      
      // Base64画像データの検証とクリーニング
      if (!image.startsWith('data:image/')) {
        console.log('⚠️  Warning: Image does not start with data:image/ prefix')
      }
      
      // 不正な文字をチェック
      const base64Part = image.split(',')[1]
      if (base64Part) {
        console.log('  - base64 part length:', base64Part.length)
        console.log('  - base64 valid chars:', /^[A-Za-z0-9+/=]*$/.test(base64Part))
      }
    }
    
    if (!sessionId || (!question?.trim() && !image)) {
      return c.json({
        ok: false,
        error: 'missing_params',
        message: 'セッションID、質問文、または画像が不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッション情報を取得してコンテキストを作成
    const session = learningSessions.get(sessionId)
    let contextInfo = '学習セッションが見つかりません'
    
    if (session) {
      // 現在の学習コンテキストを構築
      let phase = '段階学習'
      if (session.status === 'similar_problems') {
        phase = '類似問題'
      } else if (session.status === 'confirmation') {
        phase = '確認問題'
      }
      
      contextInfo = `現在の学習状況：
・学習フェーズ: ${phase}
・問題タイプ: ${session.problemType === 'english_grammar' ? '英語文法' : '数学'}
・現在のステップ: ${session.currentStep + 1}
・学習内容: ${session.analysis.split('\n\n')[0]}`
    }
    
    // 画像データのクリーニング（必要に応じて）
    let cleanedImage = image
    if (image) {
      // Base64データの検証とクリーニング
      if (!image.startsWith('data:image/')) {
        console.log('⚠️ Invalid image format: Missing data:image/ prefix')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データの形式が正しくありません',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // Base64部分の抽出と検証
      const parts = image.split(',')
      if (parts.length !== 2) {
        console.log('⚠️ Invalid image format: Missing comma separator')
        return c.json({
          ok: false,
          error: 'invalid_image_format', 
          message: '画像データの形式が正しくありません（comma separator）',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      const [header, base64Data] = parts
      
      // Base64データの検証
      if (!base64Data || base64Data.length === 0) {
        console.log('⚠️ Invalid image format: Empty base64 data')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データが空です',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // Base64文字の検証
      if (!/^[A-Za-z0-9+/=]*$/.test(base64Data)) {
        console.log('⚠️ Invalid base64 characters detected')
        return c.json({
          ok: false,
          error: 'invalid_image_format',
          message: '画像データに不正な文字が含まれています',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      // 画像サイズが大きすぎる場合の追加チェック
      const base64Length = base64Data.length
      console.log('📊 Base64 data length:', base64Length)
      
      // Base64サイズが約1MB（約1.4MB in base64）を超える場合は警告
      if (base64Length > 1400000) {
        console.log('⚠️ Large image detected, size:', base64Length)
        return c.json({
          ok: false,
          error: 'image_too_large',
          message: '画像ファイルが大きすぎます。より小さな画像を使用してください。',
          timestamp: new Date().toISOString()
        }, 400)
      }
      
      cleanedImage = image
      console.log('✅ Image validation passed, size OK')
    }

    // OpenAI APIキーの確認（型安全）
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    console.log('🔑 API Key check:', apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing')
    console.log('🔑 API Key preview:', apiKey ? apiKey.substring(0, 20) + '...' : 'No key')
    
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'api_key_missing',
        message: 'OPENAI_API_KEY環境変数が設定されていません',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    // OpenAI API送信前の最終確認
    if (cleanedImage) {
      const parts = cleanedImage.split(',')
      if (parts.length === 2) {
        console.log('🔍 Final image data check before OpenAI API:')
        console.log('  - Header:', parts[0])
        console.log('  - Base64 length:', parts[1].length)
        console.log('  - Estimated file size:', Math.round(parts[1].length * 0.75 / 1024) + 'KB')
        console.log('  - First 100 chars of base64:', parts[1].substring(0, 100))
        console.log('  - Last 50 chars of base64:', parts[1].substring(parts[1].length - 50))
        
        // Base64パディングチェック
        const base64 = parts[1]
        const paddingCount = (base64.match(/=/g) || []).length
        console.log('  - Padding count:', paddingCount)
        console.log('  - Length modulo 4:', base64.length % 4)
      }
    }

    // OpenAI APIに送信
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `あなたは「プログラミングのKOBEYA」の優秀な学習サポートAIアシスタントです。生徒の質問に親身になって答える学習サポート専門AIです。

【重要】このチャット機能では確認問題や類似問題の生成は行いません。通常のChatGPTの学習サポートモードで質問に答えてください。

【あなたの役割（文部科学省学習指導要領準拠）】
・生徒の学習をサポートする頼れる先生（人間中心の学習重視）
・主体的・対話的で深い学び：段階的思考プロセスの明示支援
・個別最適化：生徒の理解度に応じた説明方法の選択
・言語能力育成：適切な語彙と文法を用いた明確な説明
・問題解決能力育成：複数の解決方法提示、比較検討促進
・励ましと支援姿勢：失敗を学習機会として前向きに捉える指導
・多様な表現方法：文字、図表等を組み合わせた理解促進

【現在の学習コンテキスト】
${contextInfo}

【回答方針（教育方針準拠）】
✅ 実行すべきこと：
・知識・技能習得支援：質問内容を正確に理解し、段階的に説明
・思考・判断・表現力育成：ソクラテス式問答で気付きを促す質問投げかけ
・主体的学習態度育成：学習への関心・意欲向上、粘り強い取組支援
・個別最適化：多様な学習スタイルに対応した説明方法選択
・言語能力重視：学習者の発達段階に応じた適切な語彙選択
・励ましと支援姿勢：「一緒に頑張りましょう！」で自信を損なわない指導

❌ 実行してはいけないこと：
・確認問題や類似問題の生成
・JSON形式でのレスポンス
・「steps」や「similarProblems」の作成
・問題作成や出題機能

【回答スタイル】
通常のChatGPTのように自然で親しみやすい文章で回答してください。生徒が理解しやすいよう、必要に応じて：
・手順を分けて説明
・具体例を多用  
・図式的な説明（記号や矢印使用）
・覚え方のコツやヒント

生徒からの質問に、学習サポートに特化した温かく分かりやすい回答をしてください。`
          },
          {
            role: 'user',
            content: cleanedImage ? [
              {
                type: 'text',
                text: question || '写真について教えてください。わからない部分があれば詳しく解説してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: cleanedImage, // data:image/jpeg;base64,プレフィックス付きで送信
                  detail: 'high'
                }
              }
            ] : question
          }
        ],
        max_tokens: 2000,
        temperature: 0.8
      })
    })
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('❌ OpenAI API error:', openaiResponse.status, errorText)
      
      // 画像データの詳細情報をログ出力
      if (image) {
        console.log('🔍 Detailed image analysis for debugging:')
        console.log('  - Full image prefix (first 100 chars):', image.substring(0, 100))
        console.log('  - Image total length:', image.length)
        console.log('  - Contains data: prefix:', image.includes('data:'))
        console.log('  - Contains base64 separator:', image.includes(','))
        
        if (image.includes(',')) {
          const parts = image.split(',')
          console.log('  - Header part:', parts[0])
          console.log('  - Base64 part length:', parts[1]?.length || 0)
          console.log('  - Base64 sample (first 50 chars):', parts[1]?.substring(0, 50) || 'N/A')
        }
      }
      
      // デバッグ用：詳細なエラー情報を返す
      return c.json({
        ok: false,
        error: 'openai_api_error',
        message: `OpenAI API Error - Status: ${openaiResponse.status}`,
        details: errorText,
        status: openaiResponse.status,
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const aiResult = await openaiResponse.json()
    const aiAnswer = aiResult.choices[0]?.message?.content || 'すみません、回答を生成できませんでした。'
    
    // 質問履歴をセッションに保存（オプション）
    if (session) {
      if (!session.aiQuestions) {
        session.aiQuestions = []
      }
      session.aiQuestions.push({
        question,
        answer: aiAnswer,
        timestamp: new Date().toISOString(),
        phase: session.status,
        currentStep: session.currentStep
      })
    }
    
    console.log('🤖 AI chat response generated successfully')
    
    return c.json({
      ok: true,
      question,
      answer: aiAnswer,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ AI chat error:', error)
    return c.json({
      ok: false,
      error: 'ai_chat_error',
      message: 'AI質問処理でエラーが発生しました: ' + (error.message || '不明なエラー'),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// AI質問ウインドウ用ページ
app.get('/ai-chat/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  console.log('🤖 AI chat window requested for session:', sessionId)
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>AI学習サポート - KOBEYA</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <style>
        body { 
          font-family: 'Noto Sans JP', sans-serif;
          margin: 0;
          padding: 1rem;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          color: #333;
        }
        
        .chat-container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          border-radius: 1rem;
          box-shadow: 0 10px 30px rgba(0,0,0,0.2);
          overflow: hidden;
          height: calc(100vh - 2rem);
          display: flex;
          flex-direction: column;
        }
        
        .chat-header {
          background: linear-gradient(135deg, #7c3aed, #8b5cf6);
          color: white;
          padding: 1.5rem;
          text-align: center;
        }
        
        .chat-messages {
          flex: 1;
          padding: 1rem;
          overflow-y: auto;
          background: #f8fafc;
        }
        
        .message {
          margin-bottom: 1rem;
          padding: 1rem;
          border-radius: 1rem;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        
        .user-message {
          background: #e0e7ff;
          margin-left: 2rem;
          border-bottom-right-radius: 0.25rem;
        }
        
        .ai-message {
          background: white;
          margin-right: 2rem;
          border: 1px solid #e2e8f0;
          border-bottom-left-radius: 0.25rem;
        }
        
        .chat-input {
          padding: 1rem;
          background: white;
          border-top: 1px solid #e2e8f0;
        }
        
        .input-row {
          display: flex;
          gap: 0.75rem;
          margin-bottom: 1rem;
        }
        
        .image-controls {
          display: flex;
          gap: 0.5rem;
          margin-bottom: 1rem;
        }
        
        .image-btn {
          padding: 0.5rem 1rem;
          background: #f1f5f9;
          border: 1px solid #cbd5e1;
          border-radius: 0.5rem;
          cursor: pointer;
          font-size: 0.875rem;
          color: #475569;
        }
        
        .image-btn:hover {
          background: #e2e8f0;
        }
        
        .image-preview {
          max-width: 100%;
          max-height: 200px;
          border-radius: 0.5rem;
          margin-bottom: 1rem;
          border: 1px solid #e2e8f0;
        }
        
        .crop-container {
          max-height: 300px;
          margin-bottom: 1rem;
        }
        
        #questionInput {
          flex: 1;
          padding: 0.75rem;
          border: 2px solid #e2e8f0;
          border-radius: 0.5rem;
          font-size: 1rem;
          font-family: inherit;
          resize: none;
          min-height: 60px;
          max-height: 120px;
        }
        
        #questionInput:focus {
          outline: none;
          border-color: #7c3aed;
        }
        
        #sendButton {
          padding: 0.75rem 1.5rem;
          background: #7c3aed;
          color: white;
          border: none;
          border-radius: 0.5rem;
          font-weight: 500;
          cursor: pointer;
          align-self: flex-end;
          min-height: 60px;
        }
        
        #sendButton:hover {
          background: #6d28d9;
        }
        
        #sendButton:disabled {
          background: #9ca3af;
          cursor: not-allowed;
        }
        
        .loading {
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          color: #6b7280;
          font-style: italic;
        }
        
        .loading-spinner {
          width: 16px;
          height: 16px;
          border: 2px solid #e5e7eb;
          border-top: 2px solid #7c3aed;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .close-window {
          margin-top: 1rem;
          text-align: center;
        }
        
        .close-button {
          background: #ef4444;
          color: white;
          border: none;
          padding: 0.75rem 2rem;
          border-radius: 0.5rem;
          font-weight: 500;
          cursor: pointer;
        }
        
        .close-button:hover {
          background: #dc2626;
        }
        
        .welcome-message {
          text-align: center;
          color: #6b7280;
          padding: 2rem;
          font-style: italic;
        }
        
        /* Cropper.js のハンドルサイズを大きく調整 - メイン画面と同じサイズに */
        .cropper-point {
          width: 12px !important;
          height: 12px !important;
          background-color: #7c3aed !important;
          border-radius: 50% !important;
          opacity: 0.9 !important;
        }
        
        .cropper-point:hover {
          background-color: #5b21b6 !important;
          opacity: 1 !important;
        }
        
        /* 角の四角ハンドル */
        .cropper-point.point-nw,
        .cropper-point.point-ne,
        .cropper-point.point-sw,
        .cropper-point.point-se {
          width: 14px !important;
          height: 14px !important;
          border-radius: 3px !important;
        }
        
        /* 辺の中央ハンドル */
        .cropper-point.point-n,
        .cropper-point.point-s,
        .cropper-point.point-e,
        .cropper-point.point-w {
          width: 12px !important;
          height: 12px !important;
          border-radius: 50% !important;
        }
        
        /* クロップボックスのボーダーも見やすく */
        .cropper-crop-box {
          border: 2px solid #7c3aed !important;
        }
        
        .cropper-view-box {
          outline: 1px solid rgba(124, 58, 237, 0.75) !important;
        }
        </style>
    </head>
    <body>
        <div class="chat-container">
            <div class="chat-header">
                <h1 style="margin: 0; font-size: 1.5rem;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    AI学習サポート
                </h1>
                <p style="margin: 0.5rem 0 0 0; opacity: 0.9;">何でもお聞きください！一緒に学習を進めましょう 📚</p>
            </div>
            
            <div class="chat-messages" id="chatMessages">
                <div class="welcome-message">
                    <i class="fas fa-graduation-cap" style="font-size: 2rem; color: #7c3aed; margin-bottom: 1rem; display: block;"></i>
                    こんにちは！学習でわからないことがあれば、何でも質問してください。<br>
                    丁寧に説明いたします！
                </div>
            </div>
            
            <div class="chat-input">
                <!-- 統合フローサポートインフォメーション -->
                <div id="imageAttachmentIndicator" style="display: none; background: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 0.5rem; padding: 0.75rem; margin-bottom: 0.75rem; font-size: 1rem; color: #0c4a6e; font-weight: 600;">
                    <i class="fas fa-info-circle" style="margin-right: 0.5rem; color: #0ea5e9;"></i>
                    📝 質問を入力して送信ボタンを押すと、画像と一緒に送信されます
                    <button onclick="clearImage()" style="background: #fee2e2; border: 1px solid #dc2626; color: #dc2626; font-size: 0.9rem; margin-left: 1rem; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                        <i class="fas fa-times"></i> 削除
                    </button>
                </div>
                
                <!-- 画像アップロード機能 -->
                <div class="image-controls">
                    <button class="image-btn" id="cameraBtn">
                        <i class="fas fa-camera"></i> 📷 写真を撮る
                    </button>
                    <button class="image-btn" id="fileBtn">
                        <i class="fas fa-folder-open"></i> 📁 ファイル選択
                    </button>
                    <button class="image-btn" id="clearImageBtn" style="display: none; background: #fee2e2; color: #dc2626;">
                        <i class="fas fa-times"></i> 画像をクリア
                    </button>
                </div>
                
                <!-- 隠し画像入力 -->
                <input type="file" id="cameraInput" accept="image/*" capture="environment" style="display: none;">
                <input type="file" id="fileInput" accept="image/*" style="display: none;">
                
                <!-- 画像プレビューエリア -->
                <div id="imagePreviewArea" style="display: none;">
                    <img id="previewImage" class="image-preview">
                    <div style="text-align: center; margin-bottom: 1rem;">
                        <button class="image-btn" id="startCropBtn" style="background: #7c3aed; color: white;">
                            <i class="fas fa-crop"></i> 範囲を調整
                        </button>
                        <button class="image-btn" id="confirmImageBtn" style="background: #059669; color: white; font-weight: 600;">
                            <i class="fas fa-paper-plane"></i> ✅ この画像で送信
                        </button>
                    </div>
                </div>
                
                <!-- クロップエリア -->
                <div id="cropArea" style="display: none;">
                    <div class="crop-container">
                        <img id="cropImage" style="max-width: 100%; max-height: 280px;">
                    </div>
                    <div style="text-align: center; margin-bottom: 1rem; color: #6b7280; font-size: 0.95rem;">
                        📝 範囲を調整してください。質問を入力後、下のボタンで送信できます。
                    </div>
                </div>
                
                <!-- メインページと同じレイアウト：テキスト入力 + 動的ボタン -->
                <div class="input-row">
                    <textarea id="questionInput" placeholder="質問を入力してください...（画像のみの場合は空白でもOK）"></textarea>
                    
                    <!-- 通常時：送信ボタンのみ -->
                    <button id="sendButton" style="background: #7c3aed; color: white; font-weight: 600; min-width: 120px;">
                        <i class="fas fa-paper-plane"></i><br><span id="sendButtonText">送信</span>
                    </button>
                    
                    <!-- クロップ時：キャンセルボタンが追加表示 -->
                    <button id="cancelCropBtn" style="display: none; background: #6b7280; color: white; font-weight: 600; min-width: 120px; margin-left: 0.5rem;">
                        <i class="fas fa-times"></i><br>キャンセル
                    </button>
                </div>
            </div>
            
            <div class="close-window">
                <button class="close-button" onclick="window.close()">
                    <i class="fas fa-times"></i> ウインドウを閉じる
                </button>
            </div>
        </div>
        
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        <script>
        const sessionId = '${sessionId}';
        const chatMessages = document.getElementById('chatMessages');
        const questionInput = document.getElementById('questionInput');
        const sendButton = document.getElementById('sendButton');
        
        // 画像関連の要素
        const cameraBtn = document.getElementById('cameraBtn');
        const fileBtn = document.getElementById('fileBtn');
        const clearImageBtn = document.getElementById('clearImageBtn');
        const cameraInput = document.getElementById('cameraInput');
        const fileInput = document.getElementById('fileInput');
        const imagePreviewArea = document.getElementById('imagePreviewArea');
        const previewImage = document.getElementById('previewImage');
        const startCropBtn = document.getElementById('startCropBtn');
        const confirmImageBtn = document.getElementById('confirmImageBtn');
        const cropArea = document.getElementById('cropArea');
        const cropImage = document.getElementById('cropImage');
        const cancelCropBtn = document.getElementById('cancelCropBtn');
        
        let cropper = null;
        let currentImageData = null;
        
        // エンターキーで送信（Shift+Enterで改行）- 日本語入力中は除外
        questionInput.addEventListener('keydown', function(e) {
            // 日本語入力中（IME変換中）は送信しない
            if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
                e.preventDefault();
                sendQuestion();
            }
        });
        
        sendButton.addEventListener('click', sendQuestion);
        
        // 画像機能のイベントリスナー（AI質問チャット内では認証済みと仮定）
        cameraBtn.addEventListener('click', () => cameraInput.click());
        fileBtn.addEventListener('click', () => fileInput.click());
        clearImageBtn.addEventListener('click', clearImage);
        cameraInput.addEventListener('change', handleImageSelect);
        fileInput.addEventListener('change', handleImageSelect);
        startCropBtn.addEventListener('click', startCrop);
        confirmImageBtn.addEventListener('click', confirmImage);
        cancelCropBtn.addEventListener('click', cancelCrop);
        
        // 画像選択処理
        function handleImageSelect(event) {
            const file = event.target.files[0];
            if (!file) return;
            
            console.log('🖼️ AI Chat: Image selected', file.name);
            
            const reader = new FileReader();
            reader.onload = function(e) {
                previewImage.src = e.target.result;
                previewImage.onload = function() {
                    console.log('🖼️ AI Chat: Image loaded, showing preview');
                    showImagePreview();
                    
                    // 画像読み込み完了後に自動的にクロップを開始
                    setTimeout(() => {
                        console.log('🖼️ AI Chat: Starting auto crop');
                        startCrop();
                    }, 800);
                };
            };
            reader.readAsDataURL(file);
        }
        
        function showImagePreview() {
            imagePreviewArea.style.display = 'block';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
        }
        
        function startCrop() {
            if (!previewImage.src) {
                console.error('❌ AI Chat: No image source for crop');
                return;
            }
            
            console.log('✂️ AI Chat: Starting crop function');
            
            cropImage.src = previewImage.src;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'block';
            
            // クロップモード用のUI更新
            updateUIForCropMode();
            
            if (cropper) {
                cropper.destroy();
            }
            
            // Cropper.jsの初期化を遅延させる
            setTimeout(() => {
                if (window.Cropper && cropImage) {
                    cropper = new window.Cropper(cropImage, {
                        aspectRatio: NaN, // フリーサイズ
                        viewMode: 1,
                        dragMode: 'move', // メイン画面と同じ設定
                        autoCropArea: 0.95, // ほぼ全体を初期選択（メイン画面と同じ）
                        responsive: true,
                        restore: false,
                        guides: true,
                        center: true,
                        highlight: false,
                        cropBoxMovable: true,
                        cropBoxResizable: true,
                        toggleDragModeOnDblclick: false,
                        ready: function() {
                            console.log('✂️ AI Chat Cropper initialized with large crop area');
                        }
                    });
                }
            }, 100);
        }
        
        function cancelCrop() {
            console.log('❌ AI Chat: Canceling crop');
            
            cropArea.style.display = 'none';
            showImagePreview();
            
            // 通常モード用のUI更新
            updateUIForNormalMode();
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
        }
        
        // クロップ確定（画像データを準備、送信は統合送信ボタンで）
        function confirmCrop() {
            console.log('✂️ AI Chat: ConfirmCrop called (UI integrated flow), cropper exists:', !!cropper);
            
            if (!cropper) {
                console.error('❌ AI Chat: No cropper instance available');
                alert('クロップ機能が正しく初期化されていません。再度お試しください。');
                return;
            }
            
            console.log('✂️ AI Chat: Processing crop for integrated UI');
            
            let canvas;
            try {
                canvas = cropper.getCroppedCanvas({
                    maxWidth: 768,
                    maxHeight: 768,
                    imageSmoothingQuality: 'high'
                });
                
                console.log('✂️ AI Chat: Canvas obtained:', !!canvas);
                
                if (!canvas) {
                    console.error('❌ AI Chat: Failed to get cropped canvas');
                    alert('画像の切り取りに失敗しました。再度お試しください。');
                    return;
                }
                
            } catch (error) {
                console.error('❌ AI Chat: Error getting canvas:', error);
                alert('画像の処理中にエラーが発生しました。');
                return;
            }
            
            // 画像データをBase64に変換
            try {
                const croppedImageData = canvas.toDataURL('image/jpeg', 0.95);
                console.log('✂️ AI Chat: Image converted to base64, length:', croppedImageData.length);
                console.log('✂️ AI Chat: Image data starts with:', croppedImageData.substring(0, 50));
                console.log('✂️ AI Chat: Image data format check:', croppedImageData.startsWith('data:image/'));
                
                if (!croppedImageData || croppedImageData.length < 100) {
                    console.error('❌ AI Chat: Image data not properly set');
                    alert('画像データの設定に失敗しました。');
                    return;
                }
                
                if (!croppedImageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image data format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // Base64部分のチェック
                const parts = croppedImageData.split(',');
                if (parts.length === 2) {
                    const base64Part = parts[1];
                    console.log('✂️ AI Chat: Base64 part length:', base64Part.length);
                    console.log('✂️ AI Chat: Base64 valid chars test:', /^[A-Za-z0-9+/=]*$/.test(base64Part));
                    
                    if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                        console.error('❌ AI Chat: Invalid base64 characters');
                        alert('画像データに不正な文字が含まれています。');
                        return;
                    }
                } else {
                    console.error('❌ AI Chat: Invalid data URL format');
                    alert('画像データの形式が正しくありません。');
                    return;
                }
                
                // グローバル変数に設定
                currentImageData = croppedImageData;
                
            } catch (error) {
                console.error('❌ AI Chat: Error converting to base64:', error);
                alert('画像の変換中にエラーが発生しました。');
                return;
            }
            
            // UIを更新（クロップエリアを隠す）
            console.log('✂️ AI Chat: Updating UI for integrated flow');
            cropArea.style.display = 'none';
            imagePreviewArea.style.display = 'none';
            clearImageBtn.style.display = 'inline-block';
            
            // cropperを破棄
            if (cropper) {
                cropper.destroy();
                cropper = null;
                console.log('✂️ AI Chat: Cropper destroyed');
            }
            
            // 画像モード用のUI更新（この画像で送信、キャンセルボタン非表示）
            updateSendButtonForImageMode();
            
            // 画像添付インジケーターを表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'block';
            }
            
            console.log('✂️ AI Chat: Crop completed, ready for integrated send');
        }
        
        // 画像確定（クロップなし、画像データを準備）
        function confirmImage() {
            console.log('🖼️ AI Chat: Confirm image called (UI integrated flow)');
            
            if (previewImage.src && !currentImageData) {
                // クロップしていない場合は元画像を使用
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const img = new Image();
                
                img.onload = function() {
                    // 768px以下にリサイズ（文字認識のため品質重視）
                    const maxSize = 768;
                    let { width, height } = img;
                    
                    if (width > maxSize || height > maxSize) {
                        if (width > height) {
                            height = (height * maxSize) / width;
                            width = maxSize;
                        } else {
                            width = (width * maxSize) / height;
                            height = maxSize;
                        }
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    ctx.drawImage(img, 0, 0, width, height);
                    const imageData = canvas.toDataURL('image/jpeg', 0.95);
                    
                    console.log('🖼️ AI Chat: Image processed, length:', imageData.length);
                    console.log('🖼️ AI Chat: Image data starts with:', imageData.substring(0, 50));
                    console.log('🖼️ AI Chat: Image data format check:', imageData.startsWith('data:image/'));
                    
                    // 画像データの検証
                    if (!imageData.startsWith('data:image/')) {
                        console.error('❌ AI Chat: Invalid image data format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    const parts = imageData.split(',');
                    if (parts.length === 2) {
                        const base64Part = parts[1];
                        console.log('🖼️ AI Chat: Base64 part length:', base64Part.length);
                        if (!/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                            console.error('❌ AI Chat: Invalid base64 characters in confirmImage');
                            alert('画像データに不正な文字が含まれています。');
                            return;
                        }
                    } else {
                        console.error('❌ AI Chat: Invalid data URL format in confirmImage');
                        alert('画像データの形式が正しくありません。');
                        return;
                    }
                    
                    currentImageData = imageData;
                    console.log('🖼️ AI Chat: Image processed and validated, ready for integrated UI');
                    
                    // UI更新
                    imagePreviewArea.style.display = 'none';
                    clearImageBtn.style.display = 'inline-block';
                    
                    // 送信ボタンのテキストを変更
                    updateSendButtonForImageMode();
                    
                    // 画像添付インジケーターを表示
                    const indicator = document.getElementById('imageAttachmentIndicator');
                    if (indicator) {
                        indicator.style.display = 'block';
                    }
                    
                    console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
                };
                
                img.src = previewImage.src;
            } else {
                // 既に画像データがある場合
                console.log('🖼️ AI Chat: Using existing image data');
                
                // UI更新
                imagePreviewArea.style.display = 'none';
                clearImageBtn.style.display = 'inline-block';
                
                // 送信ボタンのテキストを変更
                updateSendButtonForImageMode();
                
                // 画像添付インジケーターを表示
                const indicator = document.getElementById('imageAttachmentIndicator');
                if (indicator) {
                    indicator.style.display = 'block';
                }
                
                console.log('🖼️ AI Chat: Image confirmed, ready for integrated send');
            }
        }
        
        function clearImage() {
            console.log('🗑️ AI Chat: clearImage() called, currentImageData before clear:', !!currentImageData);
            currentImageData = null;
            imagePreviewArea.style.display = 'none';
            cropArea.style.display = 'none';
            clearImageBtn.style.display = 'none';
            
            // 画像添付インジケーターを非表示
            const indicator = document.getElementById('imageAttachmentIndicator');
            if (indicator) {
                indicator.style.display = 'none';
            }
            
            if (cropper) {
                cropper.destroy();
                cropper = null;
            }
            
            // 送信ボタンをテキストモードに戻す
            updateSendButtonForTextMode();
            
            // 入力要素をリセット
            cameraInput.value = '';
            fileInput.value = '';
            
            console.log('🗑️ AI Chat: Image cleared and indicator hidden, currentImageData after clear:', currentImageData);
        }
        
        // クロップモード時のUI更新
        function updateUIForCropMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この範囲で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'inline-block';
            }
            
            console.log('✂️ AI Chat: UI updated for crop mode - send button: "この範囲で送信", cancel button: visible');
        }
        
        // 送信ボタンのテキストを画像モード用に更新
        function updateSendButtonForImageMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = 'この画像で送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('🖼️ AI Chat: UI updated for image mode - send button: "この画像で送信", cancel button: hidden');
        }
        
        // 送信ボタンのテキストをテキストモード用に更新
        function updateSendButtonForTextMode() {
            const sendButtonText = document.getElementById('sendButtonText');
            const cancelButton = document.getElementById('cancelCropBtn');
            
            if (sendButtonText) {
                sendButtonText.textContent = '送信';
            }
            if (cancelButton) {
                cancelButton.style.display = 'none';
            }
            
            console.log('📝 AI Chat: UI updated for text mode - send button: "送信", cancel button: hidden');
        }
        
        // 通常モード時のUI更新
        function updateUIForNormalMode() {
            updateSendButtonForTextMode();
            console.log('🔄 AI Chat: UI updated for normal mode');
        }

        // 統合送信関数：画像とメッセージを同時に送信
        async function sendQuestionIntegrated(question, imageData) {
            console.log('📤 AI Chat: ===== INTEGRATED SEND CALLED =====');
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 Has image data:', !!imageData);
            console.log('📤 Image data length:', imageData ? imageData.length : 0);
            
            if (imageData) {
                console.log('📤 Image data starts with:', imageData.substring(0, 50));
                console.log('📤 Image data format valid:', imageData.startsWith('data:image/'));
                
                // 送信前の最終検証
                if (!imageData.startsWith('data:image/')) {
                    console.error('❌ AI Chat: Invalid image format at send time');
                    alert('画像データの形式が正しくありません。再度お試しください。');
                    return;
                }
                
                const parts = imageData.split(',');
                if (parts.length !== 2) {
                    console.error('❌ AI Chat: Invalid data URL structure at send time');
                    alert('画像データの構造が正しくありません。再度お試しください。');
                    return;
                }
                
                const base64Part = parts[1];
                if (!base64Part || !/^[A-Za-z0-9+/=]*$/.test(base64Part)) {
                    console.error('❌ AI Chat: Invalid base64 data at send time');
                    alert('画像データが破損しています。再度お試しください。');
                    return;
                }
                
                console.log('✅ AI Chat: Image data validation passed at send time');
            }
            
            if (!question && !imageData) {
                console.error('❌ AI Chat: Both question and image are empty');
                alert('質問を入力するか、画像を選択してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with integrated request');
            
            // ユーザーメッセージを表示
            let displayMessage = question || '📷 画像について質問';
            if (imageData && question) {
                displayMessage = '📷 ' + question;
            }
            addMessage(displayMessage, 'user');
            
            // 画像がある場合は画像も表示
            if (imageData) {
                addImageMessage(imageData, 'user');
            }
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending integrated request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question || '(empty)');
                console.log('  - imageData exists:', !!imageData);
                if (imageData) {
                    console.log('  - imageData length:', imageData.length);
                    console.log('  - imageData preview:', imageData.substring(0, 50) + '...');
                }
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: imageData
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat integrated error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }

        // メイン送信関数（統合フローサポート）
        async function sendQuestion() {
            console.log('📤 AI Chat: ===== SEND QUESTION CALLED =====');
            
            // クロップモード中の場合は、まずクロップを確定してから送信
            if (cropper && cropArea.style.display !== 'none') {
                console.log('✂️ AI Chat: In crop mode, executing confirmCrop first');
                confirmCrop();
                
                // クロップ確定後、少し待ってから送信処理を実行
                setTimeout(() => {
                    console.log('✂️ AI Chat: Auto-executing send after crop confirmation');
                    sendQuestion();
                }, 100);
                return;
            }
            
            const question = questionInput.value.trim();
            console.log('📤 Question text:', question || '(empty)');
            console.log('📤 currentImageData exists:', !!currentImageData);
            
            // 画像データがある場合は統合送信を使用
            if (currentImageData) {
                console.log('📤 AI Chat: Using integrated flow (image + text)');
                const imageData = currentImageData;
                clearImage(); // UI クリア
                sendQuestionIntegrated(question, imageData);
                return;
            }
            
            // テキストのみの場合は従来の処理
            console.log('📤 AI Chat: Using text-only flow');
            
            if (!question) {
                console.error('❌ AI Chat: No question provided');
                alert('質問を入力してください');
                return;
            }
            
            console.log('📤 AI Chat: Validation passed, proceeding with text-only request');
            
            // ユーザーメッセージを表示
            addMessage(question, 'user');
            
            // 入力欄をクリア
            questionInput.value = '';
            
            // 送信ボタンを無効化
            sendButton.disabled = true;
            
            // AI思考中メッセージを表示
            const thinkingMessage = addMessage('', 'ai', true);
            
            try {
                console.log('📤 AI Chat: Sending text-only request to server:');
                console.log('  - sessionId:', sessionId);
                console.log('  - question:', question);
                
                const response = await fetch('/api/ai/chat', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        sessionId: sessionId,
                        question: question,
                        image: null
                    })
                });
                
                const result = await response.json();
                
                // 思考中メッセージを削除
                thinkingMessage.remove();
                
                if (result.ok) {
                    addMessage(result.answer, 'ai');
                } else {
                    addMessage('申し訳ございません。エラーが発生しました: ' + result.message, 'ai');
                }
                
            } catch (error) {
                console.error('AI Chat text-only error:', error);
                thinkingMessage.remove();
                addMessage('申し訳ございません。通信エラーが発生しました。', 'ai');
            }
            
            // 送信ボタンを有効化
            sendButton.disabled = false;
            questionInput.focus();
        }
        
        function addMessage(text, sender, isLoading = false) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            if (isLoading) {
                messageDiv.innerHTML = '<div class="loading"><div class="loading-spinner"></div>考えています...</div>';
            } else {
                messageDiv.textContent = text;
            }
            
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        function addImageMessage(imageSrc, sender) {
            const messageDiv = document.createElement('div');
            messageDiv.className = 'message ' + (sender === 'user' ? 'user-message' : 'ai-message');
            
            const img = document.createElement('img');
            img.src = imageSrc;
            img.style.maxWidth = '200px';
            img.style.maxHeight = '150px';
            img.style.borderRadius = '0.5rem';
            img.style.cursor = 'pointer';
            img.onclick = () => {
                // 画像クリックで拡大表示
                const newWindow = window.open('', '_blank', 'width=800,height=600');
                newWindow.document.write('<html><head><title>画像拡大表示</title></head><body style="margin:0; display:flex; justify-content:center; align-items:center; background:#000;"><img src="' + imageSrc + '" style="max-width:100%; max-height:100%; object-fit:contain;"></body></html>');
            };
            
            messageDiv.appendChild(img);
            chatMessages.appendChild(messageDiv);
            chatMessages.scrollTop = chatMessages.scrollHeight;
            
            return messageDiv;
        }
        
        // 初期フォーカス
        questionInput.focus();
        </script>
    </body>
    </html>
  `)
})

// デバッグ用：セッションデータ確認API（一時的）
app.get('/api/debug/session/:sessionId', (c) => {
  const sessionId = c.req.param('sessionId')
  const session = learningSessions.get(sessionId)
  
  if (!session) {
    return c.json({ error: 'Session not found' }, 404)
  }
  
  // セッションデータの構造を確認
  return c.json({
    sessionId,
    hasAnalysis: !!session.analysis,
    hasSteps: !!session.steps,
    hasConfirmation: !!session.confirmationProblem,
    hasSimilarProblems: !!session.similarProblems,
    similarProblemsCount: session.similarProblems?.length || 0,
    sessionKeys: Object.keys(session),
    analysisType: typeof session.analysis,
    sessionStructure: {
      sessionId: session.sessionId,
      status: session.status,
      currentStep: session.currentStep,
      stepsLength: session.steps?.length,
      similarProblemsLength: session.similarProblems?.length
    }
  })
})

// 問題再生成API（Step 1: バックエンドのみ実装）
app.post('/api/regenerate-problem', async (c) => {
  console.log('🔄 Problem regeneration API called')
  
  try {
    const { sessionId, regenerationType = 'full' } = await c.req.json()
    
    if (!sessionId) {
      return c.json({
        ok: false,
        error: 'missing_session_id',
        message: 'セッションIDが必要です',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッション取得
    const session = learningSessions.get(sessionId)
    if (!session) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    console.log('🔄 Regenerating problem for session:', sessionId, 'type:', regenerationType)
    
    // OpenAI API Key の確認
    const apiKey = c.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
      return c.json({
        ok: false,
        error: 'api_key_missing',
        message: 'AI機能が利用できません',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    // 元のセッションから生徒情報を取得
    const studentInfo = studentDatabase[session.sid] || {
      name: 'テスト生徒',
      grade: 2,
      subjects: ['数学'],
      weakSubjects: ['英語']
    }
    
    // 修正2: 元画像を使用した再生成プロンプト作成
    const regenerationPrompt = createRegenerationPrompt(session, studentInfo, regenerationType)
    
    // 修正2: 元画像データがある場合は画像つきで再生成、ない場合はテキストのみ
    let messages
    if (session.originalImageData) {
      console.log('🔄 Using original image for regeneration')
      messages = [
        {
          role: 'system',
          content: regenerationPrompt
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: session.originalUserMessage ? 
                `元の質問: ${session.originalUserMessage}\n\n【重要指示】この画像の問題から「教育的青写真」を正確に抽出し、同じ学習価値・同じ難易度を保持したまま、表面的な表現のみを変更した類題を生成してください。定義問題や汎用問題への変更は禁止です。` :
                '【重要指示】この画像の問題の「教育的核心」（学習目標・難易度・問題構造）を完全に保持し、具体的な文章や例のみを親しみやすく変更した問題を生成してください。'
            },
            {
              type: 'image_url',
              image_url: {
                url: session.originalImageData,
                detail: 'high'
              }
            }
          ]
        }
      ]
    } else {
      console.log('🔄 Using text-only regeneration (no original image)')
      messages = [
        {
          role: 'system',
          content: regenerationPrompt
        },
        {
          role: 'user',
          content: '上記の要求に基づいて、新しいバリエーションの学習コンテンツを生成してください。'
        }
      ]
    }
    
    // OpenAI API 呼び出し（再生成）
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 8000,
        temperature: 0.7  // 再生成では少し高めの温度で多様性を確保
      })
    })
    
    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text()
      console.error('❌ OpenAI API error during regeneration:', openaiResponse.status, errorText)
      
      // Step 4: エラーハンドリング強化 - OpenAI APIエラーの詳細分類
      let userMessage = 'AI再生成でエラーが発生しました'
      
      if (openaiResponse.status === 429) {
        userMessage = 'AI機能の利用制限に達しています。少し時間をおいてから再度お試しください。'
      } else if (openaiResponse.status === 401) {
        userMessage = 'AI機能の認証に問題があります。管理者にお問い合わせください。'
      } else if (openaiResponse.status === 400) {
        userMessage = 'リクエストの内容に問題があります。別の問題で再度お試しください。'
      } else if (openaiResponse.status >= 500) {
        userMessage = 'AI機能のサーバーに一時的な問題があります。少し時間をおいてから再度お試しください。'
      }
      
      return c.json({
        ok: false,
        error: 'openai_api_error',
        message: userMessage,
        statusCode: openaiResponse.status,
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const aiContent = (await openaiResponse.json())?.choices?.[0]?.message?.content || ''
    console.log('🤖 Regenerated AI content length:', aiContent.length)
    
    const jsonMatch = aiContent.match(/\{[\s\S]*\}/)
    let aiAnalysis
    
    if (jsonMatch) {
      try {
        aiAnalysis = JSON.parse(jsonMatch[0])
        console.log('🔄 Regeneration analysis success:', {
          subject: aiAnalysis.subject,
          problemType: aiAnalysis.problemType,
          difficulty: aiAnalysis.difficulty,
          confidence: aiAnalysis.confidence
        })
        
        // Phase1改善: 品質チェック機能追加
        const qualityCheck = evaluateRegenerationQuality(aiAnalysis, session)
        console.log('📊 Quality evaluation:', qualityCheck)
        
        if (qualityCheck.score < 0.7) {
          console.log('⚠️ Low quality detected, attempting improvement...')
          // 低品質の場合は改善を試行（1回まで）
          const improved = await improveRegeneratedContent(aiAnalysis, qualityCheck.issues)
          if (improved) {
            aiAnalysis = improved
            console.log('✨ Content improved successfully')
          }
        }
        
      } catch (parseError) {
        console.error('❌ Regenerated analysis JSON parsing error:', parseError)
        return c.json({
          ok: false,
          error: 'parse_error',
          message: 'AI再生成結果の解析に失敗しました',
          timestamp: new Date().toISOString()
        }, 500)
      }
    } else {
      console.error('❌ No JSON found in regenerated analysis:', aiContent.substring(0, 200))
      
      // Step 4: エラーハンドリング強化 - AI応答形式エラーの詳細対応
      if (aiContent.includes("I'm sorry") || aiContent.includes("I can't") || aiContent.toLowerCase().includes("sorry")) {
        return c.json({
          ok: false,
          error: 'ai_policy_violation',
          message: 'この内容では問題を再生成できません。別の問題画像をお試しください。',
          timestamp: new Date().toISOString()
        }, 400)
      } else {
        return c.json({
          ok: false,
          error: 'format_error',
          message: 'AI再生成結果の形式が不正です。もう一度お試しください。',
          timestamp: new Date().toISOString()
        }, 500)
      }
    }
    
    // 再生成されたデータでセッションを更新
    updateSessionWithRegeneratedData(session, aiAnalysis)
    
    // 更新されたセッション情報を返却
    return c.json({
      ok: true,
      sessionId,
      regenerationType,
      analysis: session.analysis,
      subject: aiAnalysis.subject || session.problemType,
      difficulty: aiAnalysis.difficulty || 'standard',
      steps: session.steps,
      confirmationProblem: session.confirmationProblem,
      similarProblems: session.similarProblems,
      currentStep: session.steps[0], // steps[0]は既に正しい構造を持っている
      totalSteps: session.steps.length,
      status: 'learning',
      message: '問題を再生成しました',
      timestamp: new Date().toISOString()
    })
    
  } catch (error) {
    console.error('❌ Problem regeneration error:', error)
    return c.json({
      ok: false,
      error: 'regeneration_error',
      message: error.message || '問題再生成でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 修正2: 画像ベース再生成用プロンプト作成関数
function createRegenerationPrompt(session, studentInfo, regenerationType) {
  const basePrompt = `あなたは「プログラミングのKOBEYA」の経験豊富な教師として、バンコク在住の日本人中学生の学習を支援してください。

【教育的青写真の保持原則】
元問題の「学習価値」を完全に保持し、「表面的要素」のみを適度に変更することが最重要です。

【既存セッション情報】
問題タイプ: ${session.problemType}
既存の教科: ${session.analysis ? session.analysis.split('。')[0] : '不明'}
生徒情報: ${studentInfo.name} (中学${studentInfo.grade}年) - バンコク在住
再生成タイプ: ${regenerationType}

${getRegenerationTypeInstructions(regenerationType)}

【Phase1改善: 元問題の核心要素を厳密に保持】
🎯 **不変要素（絶対に変更禁止）**：
- 学習目標・習得技能（例：文節の区切り方）
- 認知的レベル・難易度（同等を維持）
- 問題の深い構造（文型・助詞構成・複雑さ）
- 教育的文脈・段階性

✨ **可変要素（適度な変更OK）**：
- 具体的な文章内容（同じ構造の別の文）
- 場面設定・登場人物・状況
- 表現方法・問いかけ方
- バンコク生活に親しみやすい例

【厳格な制約条件】
❌ **絶対禁止**：
- 「〜とは何ですか？」のような定義問題への変更
- 汎用的・抽象的な基礎問題への変更  
- 元問題の具体性・意味のある文脈を失う変更
- 教科の変更（国語→数学等）
- 難易度の大幅変更（±1レベル以上）

✅ **推奨される変更**：
- 同じ文法構造で語彙のみ変更
- 同じ助詞・文節数を保持した別文
- バンコクの文化要素を適度に織り込み
- より親しみやすい例文への変更

【バンコク在住生徒への特別配慮】
🌟 海外在住への心理的支援を含める
🌸 「日本でも同じ内容を学習するので安心してね」
🎌 適度な文化的親しみやすさ（ワット・ポー、チャトゥチャック等）
💫 励ましと温かい支援の言葉

【技術仕様（変更不可）】
- 全ステップtype: "choice"（選択肢問題）
- 確認問題type: "choice"
- 類似問題はchoice/inputの混合
- 正解をA-D全体に分散
- JSON形式での応答必須

【最重要指示】
元画像の問題から「教育的価値の核心」を抽出し、その核心を損なわずに、表面的な表現のみを親しみやすく変更してください。「全く新しい問題」ではなく「同じ価値を持つ別バージョン」を作成してください。`

  // 元のシステムプロンプトの教育方針部分を再利用
  const educationalPolicyPrompt = `
【教育方針（文部科学省学習指導要領準拠）】
- 人間中心の学習重視：一人一人の人格を尊重し、個性を生かす指導
- 主体的・対話的で深い学び：段階的思考プロセスの明示支援
- 3つの観点重視：知識・技能、思考・判断・表現、主体的学習態度の育成
- 中学生向けのやさしい敬語で説明（学習者の発達段階に応じた言葉遣い）
- 海外在住への配慮：「日本でも同じ内容を学習するよ」「心配しないで大丈夫」
- 問題解決能力育成：複数解決方法の提示、比較検討の促進
- 温かい励ましと支援姿勢：失敗を学習機会として前向きに捉える
- 個別最適化支援：学習履歴と理解度に応じた説明方法の選択

【回答形式】
以下の厳密なJSON形式で回答してください（構造を完全に守ること）：
{
  "subject": "国語",
  "problemType": "custom",
  "difficulty": "basic|intermediate|advanced", 
  "analysis": "【詳細分析】\\n\\n①問題の整理\\n②使う知識\\n③解法のポイント\\n④解答例\\n⑤確認・振り返り",
  "confidence": 0.85,
  "steps": [
    {
      "stepNumber": 0,
      "instruction": "ステップ1の指導内容（問いかけ形式で思考を促す）",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "解説文"
    },
    {
      "stepNumber": 1,
      "instruction": "ステップ2の指導内容",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "B",
      "explanation": "解説文"
    }
  ],
  "confirmationProblem": {
    "question": "確認問題の内容",
    "type": "choice",
    "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
    "correctAnswer": "A",
    "explanation": "確認問題解説"
  },
  "similarProblems": [
    {
      "problemNumber": 1,
      "question": "類似問題1",
      "type": "choice",
      "options": ["A) 選択肢1", "B) 選択肢2", "C) 選択肢3", "D) 選択肢4"],
      "correctAnswer": "A",
      "explanation": "類似問題1の詳細解説",
      "difficulty": "easy"
    }
  ]
}

【重要】上記JSON構造を厳密に守り、stepsは必ずオブジェクトの配列にしてください`

  return basePrompt + educationalPolicyPrompt
}

// Phase1改善: 再生成タイプ別指示
function getRegenerationTypeInstructions(regenerationType) {
  switch(regenerationType) {
    case 'similar':
      return `【🔄 同じような問題 - 等質置換】
- 元問題と同じ構造・難易度・助詞構成を厳密に保持
- 語彙・登場人物・状況のみを変更（文節数±1以内）
- 同じ学習目標で親しみやすい例に変更
- 例：「君が言うことは〜」→「彼女が書く手紙は〜」`
      
    case 'approach':
      return `【🎯 違うアプローチ - 視点変更】
- 同じ学習技能を別の問題形式で問う
- 選択→記述、分析→構成など形式を変更
- 学習目標・難易度は完全に同一維持
- より理解が深まる別角度からのアプローチ`
      
    case 'full':
    default:
      return `【⚡ 完全に新しいパターン - 慎重な変更】
- 同じ教科・同じ単元で別のトピックを選択
- 学習価値の核心は絶対に保持
- 具体性を失わず、定義問題化を厳禁
- より教育効果の高い内容への改良`
  }
}

// Phase1改善: 再生成品質評価関数
function evaluateRegenerationQuality(regeneratedContent, originalSession) {
  let score = 1.0
  const issues = []
  
  // 1. 定義問題検出（最重要）
  const definitionPatterns = [
    /とは何ですか/,
    /について説明/,
    /の定義/,
    /基本的な概念/,
    /とはどのような/
  ]
  
  const hasDefinitionProblem = definitionPatterns.some(pattern => 
    pattern.test(regeneratedContent.analysis || '') ||
    (regeneratedContent.steps || []).some(step => pattern.test(step.content || ''))
  )
  
  if (hasDefinitionProblem) {
    score -= 0.4
    issues.push('definition_problem')
  }
  
  // 2. 汎用化検出
  const genericPatterns = [
    /一般的に/,
    /基本的には/,
    /通常は/,
    /文節とは/,
    /助詞とは/
  ]
  
  const isGeneric = genericPatterns.some(pattern => 
    pattern.test(regeneratedContent.analysis || '')
  )
  
  if (isGeneric) {
    score -= 0.2
    issues.push('too_generic')
  }
  
  // 3. 具体的な問題文の存在確認
  const hasSpecificContent = (regeneratedContent.steps || []).some(step => {
    const content = step.content || ''
    return content.includes('「') && content.includes('」') // 日本語の引用符
  })
  
  if (!hasSpecificContent) {
    score -= 0.2
    issues.push('lacks_specific_content')
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
function extractSubjectFromAnalysis(analysis) {
  if (analysis.includes('文節') || analysis.includes('助詞') || analysis.includes('国語')) return '国語'
  if (analysis.includes('数学') || analysis.includes('計算') || analysis.includes('方程式')) return '数学'
  if (analysis.includes('英語') || analysis.includes('English')) return '英語'
  return null
}

// Phase1改善: コンテンツ改善関数（簡易版）
async function improveRegeneratedContent(originalContent, issues) {
  // 実装は次のフェーズで詳細化
  // 現在は問題のあるパターンを検出してフラグを立てるのみ
  console.log('🔧 Content improvement needed for issues:', issues)
  
  if (issues.includes('definition_problem')) {
    console.log('⚠️ Definition problem detected - manual review recommended')
  }
  
  return null // 現在は改善機能なし、警告のみ
}

// セッション更新関数
function updateSessionWithRegeneratedData(session, aiAnalysis) {
  // 新しい分析内容で更新
  session.analysis = `【AI学習アシスタント再生成】<br><br>${aiAnalysis.analysis.replace(/。/g, '。<br>').replace(/！/g, '！<br>').replace(/<br><br>+/g, '<br><br>')}<br><br>🔄 **新しいパターンで学習を始めましょう**<br>別のアプローチで問題に取り組みます！`
  
  // 段階学習ステップを更新
  if (aiAnalysis.steps && Array.isArray(aiAnalysis.steps)) {
    session.steps = aiAnalysis.steps.map((step, index) => ({
      ...step,
      stepNumber: step.stepNumber !== undefined ? step.stepNumber : index, // stepNumberがない場合はインデックスを使用
      completed: false,
      attempts: []
    }))
    
    console.log('🔄 Updated session steps after regeneration:', {
      stepsCount: session.steps.length,
      firstStepStructure: {
        stepNumber: session.steps[0]?.stepNumber,
        instruction: session.steps[0]?.instruction?.substring(0, 50) + '...',
        type: session.steps[0]?.type,
        hasOptions: !!session.steps[0]?.options
      }
    })
  }
  
  // 確認問題を更新
  if (aiAnalysis.confirmationProblem) {
    session.confirmationProblem = {
      ...aiAnalysis.confirmationProblem,
      attempts: []
    }
  }
  
  // 類似問題を更新
  if (aiAnalysis.similarProblems) {
    session.similarProblems = aiAnalysis.similarProblems.map(problem => ({
      ...problem,
      attempts: []
    }))
  }
  
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
app.post('/api/similar/check', async (c) => {
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
    
    const session = learningSessions.get(sessionId)
    if (!session) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    console.log('🔍 Similar check - session keys:', Object.keys(session))
    console.log('🔍 Similar check - has similarProblems:', !!session.similarProblems)
    console.log('🔍 Similar check - similarProblems type:', typeof session.similarProblems)
    console.log('🔍 Similar check - similarProblems count:', session.similarProblems?.length || 0)
    
    // 類似問題データの取得
    const problemIndex = problemNumber - 1
    const similarProblem = session.similarProblems[problemIndex]
    
    if (!similarProblem) {
      return c.json({
        ok: false,
        error: 'problem_not_found',
        message: '指定された類似問題が見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // 回答チェック
    let isCorrect = false
    
    if (similarProblem.type === 'choice') {
      // 選択肢問題の場合
      isCorrect = answer === similarProblem.correctAnswer
    } else if (similarProblem.type === 'input') {
      // 記述問題の場合 - 複数の正解パターンをチェック
      const normalizedAnswer = answer.trim()
      isCorrect = similarProblem.correctAnswers.some(correct => 
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
      similarProblem.attempts = [];
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
    
    const completedProblems = session.similarProblems.filter(p => 
      p.attempts && p.attempts.some(attempt => attempt.isCorrect)
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
        feedback = `❌ 正解例: ${similarProblem.correctAnswers[0]}\n\n💡 ${similarProblem.explanation}`
      }
      nextAction = 'retry'
    }
    
    session.updatedAt = new Date().toISOString()
    
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
    return c.json({
      ok: false,
      error: 'similar_check_error',
      message: error.message || '類似問題チェックでエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 段階学習データ生成関数（フォールバック用 - 動的生成失敗時のみ使用）
function generateLearningData(problemType) {
  console.log('❌ AI分析失敗 - フォールバック呼び出し禁止')
  console.log(`問題タイプ: ${problemType}`)
  
  // ダミーデータの代わりに詳細なエラー情報を提供
  throw new Error(`AI分析に失敗しました。問題タイプ「${problemType}」のダミーデータは使用しません。先生にお知らせください。`)
}

// ルートパスハンドラー
app.get('/', (c) => {
  return c.redirect('/study-partner', 302)
})

// Study Partner Simple - ログイン修正版
app.get('/study-partner-simple', studyPartnerSimple)

// Study Partner SPA - 完全復元版
app.get('/study-partner', (c) => {
  console.log('📱 Study Partner SPA requested')
  
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>KOBEYA Study Partner</title>
        
        <!-- Google Fonts -->
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        
        <!-- Font Awesome -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
        
        <!-- Cropper.js CSS -->
        <link rel="stylesheet" href="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.css">
        
        <style>
        /* Study Partner Styles */
        body { 
          font-family: 'Noto Sans JP', sans-serif; 
          margin: 0;
          padding: 0;
        }
        
        .container { 
          max-width: 680px; 
          margin: 0 auto; 
          padding: 1rem;
        }
        
        input, button { 
          padding: 0.75rem; 
          margin: 0.5rem 0; 
          width: 100%; 
          border-radius: 0.5rem;
          border: 1px solid #ccc;
          font-size: 16px;
        }
        
        button {
          background: #374151;
          color: white;
          cursor: pointer;
          font-weight: 500;
        }
        
        button:hover {
          background: #4b5563;
        }
        
        button.secondary {
          background: #6b7280;
        }
        
        button.contrast {
          background: #7c3aed;
        }
        
        button.success {
          background: #059669;
        }
        
        button.ai-question {
          background: #7c3aed;
          position: fixed;
          bottom: 20px;
          right: 20px;
          border-radius: 50px;
          padding: 1rem 1.5rem;
          box-shadow: 0 4px 15px rgba(124, 58, 237, 0.3);
          z-index: 1000;
          font-weight: 600;
          border: none;
          color: white;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        button.ai-question:hover {
          background: #6d28d9;
          transform: translateY(-2px);
          box-shadow: 0 6px 20px rgba(124, 58, 237, 0.4);
        }
        
        @media (max-width: 768px) {
          button.ai-question {
            bottom: 15px;
            right: 15px;
            padding: 0.75rem 1rem;
            font-size: 0.875rem;
          }
        }
        
        pre { 
          background: #f5f5f5; 
          padding: 1rem; 
          border-radius: 4px; 
          overflow: auto;
          font-size: 0.875rem;
        }
        
        .grid {
          display: grid;
          gap: 1rem;
        }
        
        @media (min-width: 768px) {
          .grid {
            grid-template-columns: 1fr 1fr;
          }
        }
        
        /* Image preview styles */
        #imagePreviewArea {
          border: 1px solid #d1d5db;
          border-radius: 0.5rem;
          background: #f9fafb;
          overflow: hidden;
        }
        
        #previewImage {
          max-width: 100%;
          max-height: 350px;
          border-radius: 0.25rem;
          object-fit: contain;
        }
        
        /* Loading spinner */
        .loading-spinner {
          width: 20px;
          height: 20px;
          border: 2px solid #d1d5db;
          border-top: 2px solid #7c3aed;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }
        
        /* Font Awesome spinner animation (fallback) */
        .fa-spin, .fa-spinner {
          animation: fa-spin 1s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        @keyframes fa-spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        /* Crop area styles */
        #cropArea {
          border: 1px solid #7c3aed;
          border-radius: 0.5rem;
          background: #f3f4f6;
          overflow: hidden;
        }
        
        #cropperContainer {
          max-height: 400px;
          overflow: hidden;
        }
        
        /* Cropper.js customization */
        .cropper-point {
          width: 16px !important;
          height: 16px !important;
          background-color: #7c3aed !important;
          border: 3px solid white !important;
          border-radius: 3px !important;
          box-shadow: 0 0 6px rgba(0,0,0,0.3) !important;
        }
        
        .cropper-line {
          background-color: #7c3aed !important;
          height: 2px !important;
        }
        
        .cropper-line.cropper-line-v {
          width: 2px !important;
          height: auto !important;
        }
        
        .cropper-view-box {
          outline: 2px solid #7c3aed !important;
          outline-color: rgba(124, 58, 237, 0.8) !important;
        }
        
        .cropper-crop-box {
          border: 2px solid #7c3aed !important;
        }
        
        /* Mobile optimization */
        @media (max-width: 768px) {
          .cropper-point {
            width: 20px !important;
            height: 20px !important;
            background-color: #7c3aed !important;
            border: 4px solid white !important;
            border-radius: 4px !important;
            box-shadow: 0 0 10px rgba(0,0,0,0.4) !important;
          }
          
          .cropper-line {
            background-color: #7c3aed !important;
            height: 3px !important;
          }
          
          .cropper-line.cropper-line-v {
            width: 3px !important;
            height: auto !important;
          }
          
          .cropper-crop-box {
            border: 3px solid #7c3aed !important;
          }
        }


        </style>
    </head>
    <body>
        <main class="container">
            <section style="text-align: center; margin-bottom: 1rem; padding: 2rem 1.5rem; background: linear-gradient(135deg, #8b5cf6, #7c3aed); border-radius: 1rem; color: white;">
                <h1 style="margin-bottom: 1rem; color: white;">
                    <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                    KOBEYA Study Partner
                </h1>
                <p style="font-size: 1rem; margin-bottom: 1.5rem; opacity: 0.9;">
                    AI学習パートナーで効果的な個別学習を体験してください
                </p>
                <div style="background-color: rgba(255,255,255,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">
                    <p style="margin: 0; font-size: 0.875rem;">
                        <i class="fas fa-info-circle" style="margin-right: 0.5rem;"></i>
                        APP_KEY と 生徒IDを入力してログインしてください
                    </p>
                </div>
            </section>

            <section style="margin-bottom: 2.5rem;">
                <!-- 入力欄 -->
                <div class="grid" style="margin-bottom: 1rem;">
                    <div>
                        <label for="appkey">APP_KEY</label>
                        <input id="appkey" value="180418">
                    </div>
                    <div>
                        <label for="sid">学生ID</label>
                        <input id="sid" value="JS2-04">
                    </div>
                </div>

                <!-- ログインボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="btnLogin" class="contrast" style="width: 100%; margin: 0;">
                        <i class="fas fa-key" style="margin-right: 0.5rem;"></i>
                        ログイン/認証して開始
                    </button>
                </div>

                <!-- AIに質問ボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="aiQuestionMainButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #7c3aed; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                        <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                        🤖 AIに質問
                    </button>
                </div>

                <!-- 新機能プレースホルダーボタン -->
                <div style="margin-bottom: 1rem;">
                    <button id="eikenTaisaku" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-graduation-cap" style="margin-right: 0.5rem;"></i>
                        📚 英検対策（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="shoronbunTaisaku" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-pen-fancy" style="margin-right: 0.5rem;"></i>
                        📝 小論文対策（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="flashcard" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-clone" style="margin-right: 0.5rem;"></i>
                        🃏 フラッシュカード（実装予定）
                    </button>
                </div>

                <div style="margin-bottom: 1rem;">
                    <button id="interSeiYou" disabled style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #9ca3af; color: white; font-weight: 500; border: none; cursor: not-allowed; min-height: 56px; font-size: 16px; opacity: 0.7;">
                        <i class="fas fa-globe" style="margin-right: 0.5rem;"></i>
                        🌍 インター生用（実装予定）
                    </button>
                </div>

                <!-- 写真アップロード -->
                <div style="margin-bottom: 2.5rem;">
                    <!-- カメラ撮影ボタン -->
                    <div style="margin-bottom: 1rem;">
                        <button type="button" id="cameraButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #374151; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-camera" style="margin-right: 0.5rem;"></i>
                            📷 カメラで撮影
                        </button>
                        <input id="cameraInput" type="file" accept="image/*" capture="environment" style="display: none;">
                    </div>
                    
                    <!-- ファイル選択ボタン -->
                    <div>
                        <button type="button" id="fileButton" style="width: 100%; border-radius: 0.5rem; padding: 1rem; background-color: #6b7280; color: white; font-weight: 500; border: none; cursor: pointer; min-height: 56px; font-size: 16px;">
                            <i class="fas fa-folder-open" style="margin-right: 0.5rem;"></i>
                            📁 ファイルから選択
                        </button>
                        <input id="fileInput" type="file" accept="image/*" style="display: none;">
                    </div>
                </div>

                <!-- 画像プレビューエリア -->
                <div id="imagePreviewArea" style="display: none; margin-bottom: 1rem;">
                    <div style="padding: 1rem; border-bottom: 1px solid #d1d5db; background: #f9fafb;">
                        <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                            📸 選択された画像
                        </p>
                    </div>
                    
                    <div style="padding: 1rem; text-align: center; max-height: 400px; overflow: hidden;">
                        <img id="previewImage" style="max-width: 100%; max-height: 350px; border-radius: 0.25rem; object-fit: contain;">
                    </div>
                    
                    <!-- 画像付きメッセージ入力エリア -->
                    <div style="padding: 1rem; border-top: 1px solid #d1d5db;">
                        <div style="margin-bottom: 1rem;">
                            <label for="imageMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                💬 この画像について質問や説明を入力してください（任意）
                            </label>
                            <textarea id="imageMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                style="width: 100%; padding: 0.75rem; border: 2px solid #d1d5db; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                        </div>
                        
                        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <button id="btnStartCrop" class="secondary" style="flex: 1; min-width: 150px; margin: 0;">
                                <i class="fas fa-crop" style="margin-right: 0.5rem;"></i>
                                🔲 範囲を調整して送信
                            </button>
                            <button id="btnSendDirect" class="contrast" style="flex: 1; min-width: 150px; margin: 0;">
                                <i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>
                                📤 この画像で送信
                            </button>
                        </div>
                    </div>
                </div>

                <!-- クロップエリア -->
                <div id="cropArea" style="display: none; margin-bottom: 1rem;">
                    <div style="padding: 1rem; border-bottom: 1px solid #7c3aed; background: #f3f4f6;">
                        <p style="margin: 0; font-size: 0.875rem; font-weight: 500;">
                            ✂️ 解析範囲を選択してください
                        </p>
                    </div>
                    
                    <div style="padding: 1rem; text-align: center;">
                        <div id="cropperContainer">
                            <img id="cropImage" style="max-width: 100%; max-height: 350px;">
                        </div>
                    </div>
                    
                    <div style="padding: 1rem; border-top: 1px solid #7c3aed;">
                        <div style="margin-bottom: 1rem;">
                            <label for="cropMessageInput" style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem; font-weight: 500; color: #374151;">
                                💬 この画像について質問や説明を入力してください（任意）
                            </label>
                            <textarea id="cropMessageInput" placeholder="例: この問題の解き方を教えてください。特に○○の部分が分からないので詳しく説明してください。" 
                                style="width: 100%; padding: 0.75rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box; font-family: inherit;"></textarea>
                        </div>
                        
                        <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">
                            <button id="btnCancelCrop" class="secondary" style="flex: 1; min-width: 120px; margin: 0;">
                                <i class="fas fa-times" style="margin-right: 0.5rem;"></i>
                                キャンセル
                            </button>
                            <button id="btnConfirmCrop" class="contrast" style="flex: 2; min-width: 150px; margin: 0;">
                                <i class="fas fa-check" style="margin-right: 0.5rem;"></i>
                                ✅ この範囲で送信
                            </button>
                        </div>
                    </div>
                </div>

                <!-- アップロード中インジケーター -->
                <div id="uploadingIndicator" style="display: none; text-align: center; padding: 1.5rem; background: #f3f4f6; border-radius: 0.5rem; margin-bottom: 1rem; border: 1px solid #7c3aed;">
                    <div style="display: flex; align-items: center; justify-content: center; gap: 1rem; margin-bottom: 0.5rem;">
                        <div class="loading-spinner"></div>
                        <span style="font-weight: 500;">写真を解析中...</span>
                    </div>
                    <div style="font-size: 0.875rem; opacity: 0.8;">
                        大きな画像の場合、しばらく時間がかかることがあります
                    </div>
                </div>

                <!-- 解析結果表示エリア -->
                <div id="analysisResult" style="display: none; margin-bottom: 1rem; padding: 1rem; border: 1px solid #059669; border-radius: 0.5rem; background: #ecfdf5;">
                    <div style="display: flex; align-items: center; margin-bottom: 0.75rem;">
                        <i class="fas fa-check-circle" style="color: #059669; margin-right: 0.5rem;"></i>
                        <span style="font-weight: 500;">解析完了</span>
                    </div>
                    <div id="analysisContent" style="font-size: 0.875rem; line-height: 1.6;">
                        <!-- 解析結果がここに表示されます -->
                    </div>
                </div>

                <!-- API応答の表示先 -->
                <div id="out" style="background: #f5f5f5; padding: 1rem; margin-top: 1rem; border-radius: 0.5rem; min-height: 160px; width: 100%; max-width: 100%; box-sizing: border-box; overflow-x: hidden; word-wrap: break-word; font-family: inherit;"></div>
            </section>
            
            <!-- フローティングAI質問ボタン -->
            <button id="aiQuestionButton" class="ai-question" onclick="openAIChat()" style="display: none;">
                <i class="fas fa-robot" style="margin-right: 0.5rem;"></i>
                🤔 AIに質問する
            </button>
        </main>

        <!-- Scripts -->
        <script src="https://unpkg.com/cropperjs@1.6.1/dist/cropper.min.js"></script>
        
        <script>
        console.log('📱 Study Partner JavaScript loading...');
        
        // DOM要素の取得
        let cameraInput, fileInput, previewImage, imagePreviewArea, cropArea, cropImage;
        let cropper = null;
        let authenticated = false;
        
        // 初期化
        document.addEventListener('DOMContentLoaded', function() {
          console.log('📱 Study Partner initialized');
          
          // DOM要素を取得
          cameraInput = document.getElementById('cameraInput');
          fileInput = document.getElementById('fileInput');
          previewImage = document.getElementById('previewImage');
          imagePreviewArea = document.getElementById('imagePreviewArea');
          cropArea = document.getElementById('cropArea');
          cropImage = document.getElementById('cropImage');
          
          // イベントリスナーを設定
          setupEventListeners();
        });
        
        function setupEventListeners() {
          // カメラ入力
          if (cameraInput) {
            cameraInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ファイル入力
          if (fileInput) {
            fileInput.addEventListener('change', handlePhotoSelect);
          }
          
          // ログインボタン
          const btnLogin = document.getElementById('btnLogin');
          if (btnLogin) {
            btnLogin.addEventListener('click', handleLogin);
          }
          
          // メインのAIに質問ボタン
          const aiQuestionMainButton = document.getElementById('aiQuestionMainButton');
          if (aiQuestionMainButton) {
            aiQuestionMainButton.addEventListener('click', function() {
              console.log('🤖 Main AI question button clicked');
              openAIChatDirect();
            });
          }
          
          // カメラボタン
          const cameraButton = document.getElementById('cameraButton');
          if (cameraButton) {
            cameraButton.addEventListener('click', function() {
              console.log('📷 Camera button clicked');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              if (cameraInput) {
                cameraInput.click();
              }
            });
          }
          
          // ファイル選択ボタン
          const fileButton = document.getElementById('fileButton');
          if (fileButton) {
            fileButton.addEventListener('click', function() {
              console.log('📁 File button clicked');
              if (!authenticated) {
                alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
                return;
              }
              if (fileInput) {
                fileInput.click();
              }
            });
          }
          
          // クロップボタン
          const btnStartCrop = document.getElementById('btnStartCrop');
          if (btnStartCrop) {
            btnStartCrop.addEventListener('click', startCrop);
          }
          
          const btnConfirmCrop = document.getElementById('btnConfirmCrop');
          if (btnConfirmCrop) {
            btnConfirmCrop.addEventListener('click', confirmCrop);
          }
          
          const btnCancelCrop = document.getElementById('btnCancelCrop');
          if (btnCancelCrop) {
            btnCancelCrop.addEventListener('click', cancelCrop);
          }
          
          // 送信ボタン
          const btnSendDirect = document.getElementById('btnSendDirect');
          if (btnSendDirect) {
            btnSendDirect.addEventListener('click', sendDirectly);
          }
        }
        
        // 写真選択処理
        function handlePhotoSelect(event) {
          const file = event.target.files[0];
          if (!file) return;
          
          console.log('📸 Photo selected:', file.name, file.type);
          
          // 画像プレビュー表示
          const reader = new FileReader();
          reader.onload = function(e) {
            if (previewImage) {
              previewImage.src = e.target.result;
              showImagePreview();
              
              // 短時間待ってから自動的にクロップ画面に移行
              setTimeout(() => {
                console.log('🔲 Auto starting crop after photo selection');
                startCrop();
              }, 800); // 0.8秒後に自動移行（画像表示確認のため）
            }
          };
          reader.readAsDataURL(file);
        }
        
        // 画像プレビュー表示
        function showImagePreview() {
          if (imagePreviewArea) {
            imagePreviewArea.style.display = 'block';
            
            // 自動移行メッセージを表示
            const btnStartCrop = document.getElementById('btnStartCrop');
            const btnSendDirect = document.getElementById('btnSendDirect');
            
            if (btnStartCrop) {
              btnStartCrop.innerHTML = '<i class="fas fa-hourglass-half" style="margin-right: 0.5rem;"></i>🔲 クロップ画面に移行中...';
              btnStartCrop.disabled = true;
              btnStartCrop.style.opacity = '0.7';
            }
            
            if (btnSendDirect) {
              btnSendDirect.style.display = 'none'; // 自動移行中は非表示
            }
          }
          hideArea(cropArea);
        }
        
        // クロップ開始
        function startCrop() {
          if (!previewImage || !previewImage.src) return;
          
          console.log('✂️ Starting crop');
          
          // プレビュー画像をクロップエリアにコピー
          if (cropImage) {
            cropImage.src = previewImage.src;
          }
          
          // メッセージもコピー
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            cropMessageInput.value = imageMessageInput.value;
          }
          
          showArea(cropArea);
          hideArea(imagePreviewArea);
          
          // Cropper.js初期化
          if (window.Cropper && cropImage) {
            if (cropper) {
              cropper.destroy();
            }
            
            cropper = new Cropper(cropImage, {
              aspectRatio: NaN, // フリーサイズ
              viewMode: 1,
              dragMode: 'move',
              autoCropArea: 0.95, // ほぼ全体を初期選択（0.8 → 0.95）
              restore: false,
              guides: true,
              center: true,
              highlight: false,
              cropBoxMovable: true,
              cropBoxResizable: true,
              toggleDragModeOnDblclick: false,
              ready: function() {
                console.log('✂️ Cropper initialized with almost full area selection');
              }
            });
          }
        }
        
        // クロップ確定
        function confirmCrop() {
          console.log('✅ Confirming crop');
          
          let croppedImageData = null;
          
          if (cropper) {
            // Cropper.js を使用してクロップ
            const canvas = cropper.getCroppedCanvas({
              maxWidth: 2000,
              maxHeight: 2000,
              fillColor: '#fff',
              imageSmoothingEnabled: true,
              imageSmoothingQuality: 'high',
            });
            
            croppedImageData = canvas.toDataURL('image/jpeg', 0.8);
          } else {
            // Cropper.js が利用できない場合は元画像を使用
            croppedImageData = previewImage.src;
          }
          
          // メッセージ入力欄から値を取得
          const messageInput = document.getElementById('cropMessageInput');
          const userMessage = messageInput ? messageInput.value.trim() : '';
          
          // 画像を送信
          sendAnalysisRequest(croppedImageData, true, userMessage);
        }
        
        // クロップキャンセル
        function cancelCrop() {
          console.log('❌ Canceling crop');
          
          if (cropper) {
            cropper.destroy();
            cropper = null;
          }
          
          hideArea(cropArea);
          
          // プレビューボタンを元の状態に戻す
          const btnStartCrop = document.getElementById('btnStartCrop');
          const btnSendDirect = document.getElementById('btnSendDirect');
          
          if (btnStartCrop) {
            btnStartCrop.innerHTML = '<i class="fas fa-crop" style="margin-right: 0.5rem;"></i>🔲 この範囲で解析';
            btnStartCrop.disabled = false;
            btnStartCrop.style.opacity = '1';
          }
          
          if (btnSendDirect) {
            btnSendDirect.innerHTML = '<i class="fas fa-paper-plane" style="margin-right: 0.5rem;"></i>📤 そのまま送信';
            btnSendDirect.style.display = 'flex'; // 再表示
          }
          
          // メッセージも戻す
          const imageMessageInput = document.getElementById('imageMessageInput');
          const cropMessageInput = document.getElementById('cropMessageInput');
          if (imageMessageInput && cropMessageInput) {
            imageMessageInput.value = cropMessageInput.value;
          }
          
          showImagePreview();
        }
        
        // エリア表示/非表示ヘルパー
        function showArea(element) {
          if (element) {
            element.style.display = 'block';
          }
        }
        
        function hideArea(element) {
          if (element) {
            element.style.display = 'none';
          }
        }
        
        // 直接送信
        function sendDirectly() {
          console.log('📤 Sending directly');
          
          if (previewImage && previewImage.src) {
            // メッセージ入力欄から値を取得
            const messageInput = document.getElementById('imageMessageInput');
            const userMessage = messageInput ? messageInput.value.trim() : '';
            
            sendAnalysisRequest(previewImage.src, false, userMessage);
          }
        }
        
        // ログイン処理
        async function handleLogin() {
          console.log('🔑 Login attempt started');
          
          try {
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            console.log('🔍 Credentials:', { appkey, sid });
            
            // Validate input fields
            if (!appkey || !sid) {
              throw new Error('APP_KEY と Student ID を両方入力してください');
            }
            
            // Call the actual login API
            const response = await fetch('/api/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                appkey: appkey,
                sid: sid
              })
            });
            
            console.log('📡 Login response:', response.status, response.statusText);
            
            const data = await response.json();
            console.log('📋 Login data:', data);
            
            if (response.ok && data.success) {
              authenticated = true;
              alert('✅ ログイン成功!' + String.fromCharCode(10) + 
                    'APP_KEY: ' + appkey + String.fromCharCode(10) + 
                    'Student ID: ' + sid);
            } else {
              authenticated = false;
              throw new Error(data.message || 'ログインに失敗しました');
            }
          } catch (error) {
            console.error('❌ Login error:', error);
            authenticated = false;
            alert('❌ ログインエラー: ' + error.message);
          }
        }
        
        // 解析リクエスト送信（段階学習システム対応版）
        async function sendAnalysisRequest(imageData, cropped, userMessage = '') {
          console.log('📤 Sending analysis request, cropped:', cropped, 'message:', userMessage);
          
          if (!authenticated) {
            alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
            return;
          }
          
          showUploadingIndicator(true);
          
          try {
            // DataURLから実際のファイルデータを取得
            const response = await fetch(imageData);
            const blob = await response.blob();
            
            // FormDataを作成
            const formData = new FormData();
            const appkey = document.getElementById('appkey')?.value || '180418';
            const sid = document.getElementById('sid')?.value || 'JS2-04';
            
            formData.append('image', blob, 'image.jpg');
            formData.append('appkey', appkey);
            formData.append('sid', sid);
            if (userMessage) {
              formData.append('message', userMessage);
            }
            
            console.log('📤 Sending to /api/analyze-and-learn with FormData');
            
            // 段階学習APIエンドポイントに送信
            const apiResponse = await fetch('/api/analyze-and-learn', {
              method: 'POST',
              body: formData,
              headers: {
                'Accept': 'application/json'
              }
            });
            
            console.log('📡 API Response:', apiResponse.status, apiResponse.statusText);
            
            if (!apiResponse.ok) {
              throw new Error('HTTP ' + apiResponse.status + ': ' + apiResponse.statusText);
            }
            
            const result = await apiResponse.json();
            console.log('📋 Analysis result:', result);
            
            if (result.ok) {
              // 段階学習システムを開始
              startLearningSystem(result);
            } else {
              throw new Error(result.message || 'API解析でエラーが発生しました');
            }
            
            showUploadingIndicator(false);
            
          } catch (error) {
            console.error('❌ Analysis error:', error);
            alert('❌ 解析エラー: ' + error.message);
            showUploadingIndicator(false);
          }
        }
        
        // 解析結果表示（生徒向け簡潔表示）
        function displayAnalysisResult(result) {
          const analysisResult = document.getElementById('analysisResult');
          const analysisContent = document.getElementById('analysisContent');
          
          if (analysisContent) {
            // 生徒向けの簡潔で励ましのメッセージのみ表示
            const studentMessage = 
              '<div style="font-size: 0.9rem; color: #374151;">' +
                '<strong>📋 問題を分析しました！</strong><br>' +
                (result.subject || '学習') + 'の問題ですね。<br>' +
                '段階的に一緒に解いていきましょう！' +
              '</div>' +
              // Phase1改善: 再生成タイプ選択UI
              '<div style="margin-top: 1rem; padding: 1rem; background: rgba(245,158,11,0.1); border-radius: 0.75rem; border: 1px solid #f59e0b;">' +
                '<div style="text-align: center; margin-bottom: 0.75rem;">' +
                  '<h4 style="margin: 0; color: #f59e0b; font-size: 0.9rem;">🎯 どのような問題に挑戦したいですか？</h4>' +
                  '<p style="margin: 0.25rem 0 0 0; font-size: 0.75rem; color: #666;">バンコクで頑張っているあなたを応援します ✨</p>' +
                '</div>' +
                '<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; margin-bottom: 0.75rem;">' +
                  '<button onclick="regenerateProblem(\\'similar\\')" ' +
                  'style="background: #10b981; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🔄 同じような問題' +
                  '</button>' +
                  '<button onclick="regenerateProblem(\\'approach\\')" ' +
                  'style="background: #3b82f6; color: white; border: none; padding: 0.5rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; text-align: center;">' +
                  '🎯 違うアプローチ' +
                  '</button>' +
                '</div>' +
                '<div style="text-align: center;">' +
                  '<button onclick="regenerateProblem(\\'full\\')" id="regenerateButton" ' +
                  'style="background: #f59e0b; color: white; border: none; padding: 0.5rem 1rem; border-radius: 0.5rem; cursor: pointer; font-size: 0.75rem; font-weight: 500;">' +
                  '<i class="fas fa-sync-alt" style="margin-right: 0.5rem;"></i>完全に新しいパターン' +
                  '</button>' +
                '</div>' +
              '</div>';
            analysisContent.innerHTML = studentMessage;
            
            if (analysisResult) {
              analysisResult.style.display = 'block';
            }
          }
          
          // 詳細分析は内部ログのみ（生徒には非表示）
          if (result.analysis) {
            console.log('🔍 詳細分析結果（内部用）:', result.analysis);
          }
        }
        
        // アップロード中インジケーター
        function showUploadingIndicator(show) {
          const indicator = document.getElementById('uploadingIndicator');
          if (indicator) {
            indicator.style.display = show ? 'block' : 'none';
          }
        }
        
        // === 段階学習システム ===
        
        let currentSession = null;
        
        // 段階学習システム開始
        function startLearningSystem(result) {
          console.log('📚 Starting learning system with session:', result.sessionId);
          
          currentSession = result;
          
          // 解析結果を表示
          displayAnalysisResult(result);
          
          // 最初のステップを表示
          displayLearningStep(result);
          
          // AI質問ボタンを表示
          showAIQuestionButton();
        }
        
        // 段階学習ステップ表示
        function displayLearningStep(result) {
          console.log('📚 Displaying learning step:', result.currentStep.stepNumber);
          console.log('🔍 Step details:', {
            stepNumber: result.currentStep.stepNumber,
            instruction: result.currentStep.instruction,
            type: result.currentStep.type,
            options: result.currentStep.options,
            optionsLength: result.currentStep.options ? result.currentStep.options.length : 'undefined'
          });
          
          const out = document.getElementById('out');
          if (!out) return;
          
          const step = result.currentStep;
          
          let stepHtml = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f0f9ff, #ffffff); border: 2px solid #0369a1; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          stepHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          stepHtml += '<div style="background: #0369a1; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + (step.stepNumber + 1) + '</div>';
          stepHtml += '<h3 style="margin: 0; color: #0369a1;">📚 Step ' + (step.stepNumber + 1) + ' / ' + result.totalSteps + '</h3>';
          stepHtml += '</div>';
          
          stepHtml += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + step.instruction + '</p>';
          
          if (step.type === 'choice') {
            // 選択肢が存在しない場合のフォールバック処理
            if (!step.options || !Array.isArray(step.options) || step.options.length === 0) {
              console.error('❌ No options found for choice step, creating fallback options');
              step.options = [
                "A) 選択肢が読み込めませんでした",
                "B) もう一度お試しください", 
                "C) システムエラーが発生しています",
                "D) 管理者にお知らせください"
              ];
              step.correctAnswer = "A";
            }
            
            stepHtml += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < step.options.length; i++) {
              stepHtml += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #f8fafc; border: 2px solid #e2e8f0; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              stepHtml += '<input type="radio" name="stepChoice" value="' + step.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              stepHtml += '<span style="display: inline; font-weight: 500;">' + step.options[i] + '</span>';
              stepHtml += '</label>';
            }
            stepHtml += '</div>';
            
            stepHtml += '<button onclick="submitStepAnswer()" ';
            stepHtml += 'style="background: #0369a1; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            stepHtml += '📝 回答する</button>';
          }
          
          stepHtml += '</div>';
          
          out.innerHTML = stepHtml;
        }
        
        // ステップ回答送信
        async function submitStepAnswer() {
          const selectedOption = document.querySelector('input[name="stepChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          const currentStep = currentSession.currentStep;
          
          console.log('📝 Step answer submitted:', answer, 'stepNumber:', currentStep.stepNumber);
          
          try {
            // ステップ回答チェックAPIを呼び出し
            const response = await fetch('/api/step/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                stepNumber: currentStep.stepNumber,
                answer: answer
              })
            });
            
            console.log('📡 Step check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Step check result:', result);
            
            if (result.ok) {
              // 回答結果に応じて次のアクションを決定
              if (result.isCorrect) {
                displayStepResult(true, result.feedback, answer);
                
                // 次のアクションに応じて処理を分岐
                if (result.nextAction === 'next_step') {
                  // 次のステップがある場合
                  setTimeout(() => {
                    currentSession.currentStep = result.nextStep;
                    displayLearningStep(currentSession);
                  }, 3000);
                } else if (result.nextAction === 'confirmation') {
                  // 確認問題に進む場合
                  setTimeout(() => {
                    currentSession.confirmationProblem = result.confirmationProblem;
                    startConfirmationProblem();
                  }, 3000);
                }
              } else {
                // 不正解の場合
                displayStepResult(false, result.feedback, answer);
              }
            } else {
              throw new Error(result.message || 'ステップチェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Step check error:', error);
            alert('❌ ステップチェックエラー: ' + error.message);
          }
        }
        
        // ステップ結果表示
        function displayStepResult(isCorrect, explanation, userAnswer) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let resultHtml = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            resultHtml += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #16a34a; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✓</div>';
            resultHtml += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 正解です！よくできました！</h4>';
            resultHtml += '</div>';
          } else {
            resultHtml += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            resultHtml += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            resultHtml += '<div style="background: #dc2626; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">✗</div>';
            resultHtml += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📖 もう一度考えてみましょう</h4>';
            resultHtml += '</div>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            resultHtml += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.currentStep.correctAnswer + '</p>';
          }
          
          resultHtml += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          resultHtml += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          resultHtml += '</div>';
          
          if (isCorrect) {
            // 正解時は既にsubmitStepAnswerでAPIからの指示に従って自動処理されている
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<div style="display: inline-flex; align-items: center; gap: 0.5rem; color: #16a34a; font-weight: 500;">';
            resultHtml += '<div class="loading-spinner" style="width: 16px; height: 16px;"></div>';
            resultHtml += '<span>次のステップを準備しています...</span>';
            resultHtml += '</div>';
            resultHtml += '</div>';
          } else {
            resultHtml += '<div style="text-align: center;">';
            resultHtml += '<button onclick="retryCurrentStep()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            resultHtml += '</div>';
          }
          
          resultHtml += '</div>';
          out.innerHTML = resultHtml;
        }
        
        // 次のステップに進む（APIレスポンスから自動的に処理される）
        function goToNextStep() {
          console.log('📚 Moving to next step - handled by API response');
          // この関数はAPIレスポンスで自動的に処理されるため、
          // 特別な処理は不要（既にsubmitStepAnswerで処理済み）
        }
        
        // 現在のステップを再試行
        function retryCurrentStep() {
          console.log('🔄 Retrying current step');
          displayLearningStep(currentSession);
        }
        
        // 確認問題開始
        function startConfirmationProblem() {
          console.log('🎯 Starting confirmation problem');
          displayConfirmationProblem();
        }
        
        // 確認問題表示
        function displayConfirmationProblem() {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problem = currentSession.confirmationProblem;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #fef3c7, #ffffff); border: 2px solid #d97706; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #d97706; color: white; width: 2rem; height: 2rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">?</div>';
          html += '<h3 style="margin: 0; color: #d97706; font-size: 1.25rem;">🎯 確認問題</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #fefce8; border: 2px solid #fde68a; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="confirmChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitConfirmationAnswer()" ';
            html += 'style="background: #d97706; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '🎯 確認問題を解く</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // 確認問題回答送信
        async function submitConfirmationAnswer() {
          const selectedOption = document.querySelector('input[name="confirmChoice"]:checked');
          if (!selectedOption) {
            alert('❌ 選択肢を選んでください');
            return;
          }
          
          const answer = selectedOption.value;
          
          console.log('🎯 Confirmation answer submitted:', answer);
          
          try {
            // 確認問題回答チェックAPIを呼び出し
            const response = await fetch('/api/confirmation/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                answer: answer
              })
            });
            
            console.log('📡 Confirmation check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Confirmation check result:', result);
            
            if (result.ok) {
              displayConfirmationResult(result.isCorrect, result.feedback, answer, result.nextAction);
            } else {
              throw new Error(result.message || '確認問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Confirmation check error:', error);
            alert('❌ 確認問題チェックエラー: ' + error.message);
          }
        }
        
        // 確認問題結果表示
        function displayConfirmationResult(isCorrect, explanation, userAnswer, nextAction) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">🎉</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🏆 確認問題正解！素晴らしいです！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 確認問題：もう少し復習しましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">正解: ' + currentSession.confirmationProblem.correctAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'similar_problems') {
              // 類似問題フェーズに移行
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🚀 次は類似問題にチャレンジしましょう！</p>';
              html += '<button onclick="startSimilarProblems()" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">📚 類似問題を始める</button>';
              html += '</div>';
            } else {
              // 従来の完了メッセージ
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a;">🎊 学習完了！お疲れさまでした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displayConfirmationProblem()" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // === 類似問題システム ===
        
        let currentSimilarProblem = 0;
        
        // 類似問題開始
        async function startSimilarProblems() {
          console.log('🔥 Starting similar problems');
          console.log('📋 Current session:', currentSession);
          
          if (!currentSession) {
            console.error('❌ No current session found');
            alert('❌ セッションが見つかりません。最初からやり直してください。');
            return;
          }
          
          // デバッグ用：サーバーからセッションデータを確認
          try {
            const debugResponse = await fetch('/api/debug/session/' + currentSession.sessionId);
            const debugData = await debugResponse.json();
            console.log('🔍 Server session debug:', debugData);
          } catch (error) {
            console.error('❌ Debug fetch error:', error);
          }
          
          // セッションデータの構造をチェック
          console.log('📋 Session keys:', Object.keys(currentSession));
          console.log('📋 Has similarProblems:', !!currentSession.similarProblems);
          console.log('📋 similarProblems type:', typeof currentSession.similarProblems);
          console.log('📋 similarProblems value:', currentSession.similarProblems);
          
          if (!currentSession.analysis) {
            console.error('❌ No analysis data found');
            alert('❌ 学習データが見つかりません。最初からやり直してください。');
            return;
          }
          
          if (!currentSession.similarProblems) {
            console.error('❌ No similar problems found');
            console.log('📋 Session structure:', currentSession);
            alert('❌ 類似問題データが見つかりません。最初からやり直してください。');
            return;
          }
          
          console.log('📚 Similar problems found:', currentSession.similarProblems.length);
          currentSimilarProblem = 0;
          displaySimilarProblem(1);
        }
        
        // 類似問題表示
        function displaySimilarProblem(problemNumber) {
          const out = document.getElementById('out');
          if (!out) return;
          
          const problems = currentSession.similarProblems;
          const problem = problems[problemNumber - 1];
          
          if (!problem) {
            console.error('❌ Similar problem not found:', problemNumber);
            return;
          }
          
          currentSimilarProblem = problemNumber;
          
          let html = '<div style="padding: 1.5rem; background: linear-gradient(135deg, #f3e8ff, #ffffff); border: 2px solid #7c3aed; border-radius: 0.75rem; margin-bottom: 1.5rem;">';
          html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
          html += '<div style="background: #7c3aed; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; margin-right: 0.75rem;">' + problemNumber + '</div>';
          html += '<h3 style="margin: 0; color: #7c3aed; font-size: 1.25rem;">📚 類似問題 ' + problemNumber + '/' + problems.length + '</h3>';
          html += '</div>';
          
          html += '<p style="margin: 0 0 1.5rem 0; line-height: 1.6; font-size: 1rem; white-space: pre-wrap;">' + problem.question + '</p>';
          
          if (problem.type === 'choice') {
            // 選択肢問題
            html += '<div style="margin-bottom: 1.5rem;">';
            for (let i = 0; i < problem.options.length; i++) {
              html += '<label style="display: block; margin-bottom: 0.75rem; padding: 0.75rem; background: #faf5ff; border: 2px solid #e9d5ff; border-radius: 0.5rem; cursor: pointer; transition: all 0.2s; line-height: 1.5; word-wrap: break-word;">';
              html += '<input type="radio" name="similarChoice" value="' + problem.options[i].charAt(0) + '" style="margin-right: 0.5rem; vertical-align: top;">';
              html += '<span style="display: inline; font-weight: 500;">' + problem.options[i] + '</span>';
              html += '</label>';
            }
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
            
          } else if (problem.type === 'input') {
            // 記述問題
            html += '<div style="margin-bottom: 1.5rem;">';
            html += '<textarea id="similarInput" placeholder="ここに答えを入力してください..." ';
            html += 'style="width: 100%; padding: 1rem; border: 2px solid #e9d5ff; border-radius: 0.5rem; font-size: 1rem; line-height: 1.5; min-height: 80px; resize: vertical; box-sizing: border-box;"></textarea>';
            html += '</div>';
            
            html += '<button onclick="submitSimilarAnswer()" ';
            html += 'style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500; font-size: 1rem;">';
            html += '📝 答えを送信</button>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }
        
        // 類似問題回答送信
        async function submitSimilarAnswer() {
          const problems = currentSession.similarProblems;
          const problem = problems[currentSimilarProblem - 1];
          let answer = '';
          
          if (problem.type === 'choice') {
            const selectedOption = document.querySelector('input[name="similarChoice"]:checked');
            if (!selectedOption) {
              alert('❌ 選択肢を選んでください');
              return;
            }
            answer = selectedOption.value;
          } else if (problem.type === 'input') {
            const inputElement = document.getElementById('similarInput');
            if (!inputElement || !inputElement.value.trim()) {
              alert('❌ 答えを入力してください');
              return;
            }
            answer = inputElement.value.trim();
          }
          
          console.log('📚 Similar answer submitted:', { problemNumber: currentSimilarProblem, answer });
          
          try {
            // 類似問題回答チェックAPIを呼び出し
            const response = await fetch('/api/similar/check', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                problemNumber: currentSimilarProblem,
                answer: answer
              })
            });
            
            console.log('📡 Similar check response:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Similar check result:', result);
            
            if (result.ok) {
              displaySimilarResult(result.isCorrect, result.feedback, answer, result.nextAction, result.completedProblems, result.totalProblems);
            } else {
              throw new Error(result.message || '類似問題チェックでエラーが発生しました');
            }
            
          } catch (error) {
            console.error('❌ Similar check error:', error);
            alert('❌ 類似問題チェックエラー: ' + error.message);
          }
        }
        
        // 類似問題結果表示
        function displaySimilarResult(isCorrect, explanation, userAnswer, nextAction, completedProblems, totalProblems) {
          const out = document.getElementById('out');
          if (!out) return;
          
          let html = '<div style="padding: 1.5rem; border-radius: 0.75rem; margin-bottom: 1.5rem; border: 2px solid ';
          
          if (isCorrect) {
            html += '#16a34a; background: linear-gradient(135deg, #dcfce7, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #16a34a; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem; font-size: 1.25rem;">✅</div>';
            html += '<h4 style="margin: 0; color: #16a34a; font-size: 1.25rem;">🎉 類似問題' + currentSimilarProblem + '正解！</h4>';
            html += '</div>';
          } else {
            html += '#dc2626; background: linear-gradient(135deg, #fee2e2, #ffffff);">';
            html += '<div style="display: flex; align-items: center; margin-bottom: 1rem;">';
            html += '<div style="background: #dc2626; color: white; width: 2.5rem; height: 2.5rem; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 0.75rem;">❌</div>';
            html += '<h4 style="margin: 0; color: #dc2626; font-size: 1.25rem;">📚 類似問題' + currentSimilarProblem + '：もう一度考えてみましょう</h4>';
            html += '</div>';
            html += '<p style="margin: 0 0 1rem 0; color: #dc2626; font-weight: 500;">あなたの答え: ' + userAnswer + '</p>';
          }
          
          html += '<div style="background: rgba(255,255,255,0.8); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; line-height: 1.6; white-space: pre-wrap;"><strong>💡 解説:</strong><br>' + explanation + '</p>';
          html += '</div>';
          
          // 進捗表示
          html += '<div style="background: rgba(124,58,237,0.1); padding: 1rem; border-radius: 0.5rem; margin-bottom: 1rem;">';
          html += '<p style="margin: 0; font-weight: 500; color: #7c3aed;">📊 進捗: ' + completedProblems + '/' + totalProblems + '問正解</p>';
          html += '</div>';
          
          if (isCorrect) {
            if (nextAction === 'next_problem') {
              // 次の類似問題に進む
              html += '<div style="text-align: center;">';
              html += '<button onclick="displaySimilarProblem(' + (currentSimilarProblem + 1) + ')" style="background: #7c3aed; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">➡️ 次の類似問題へ</button>';
              html += '</div>';
            } else if (nextAction === 'all_completed') {
              // すべての類似問題完了
              html += '<div style="text-align: center;">';
              html += '<p style="margin-bottom: 1rem; color: #16a34a; font-weight: 600; font-size: 1.1rem;">🎊 すべての類似問題が完了しました！お疲れ様でした！</p>';
              html += '<div style="display: flex; gap: 1rem; justify-content: center; flex-wrap: wrap;">';
              html += '<button onclick="location.reload()" style="background: #16a34a; color: white; padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 新しい問題に挑戦</button>';
              html += '</div>';
              html += '</div>';
            }
          } else {
            html += '<div style="text-align: center;">';
            html += '<button onclick="displaySimilarProblem(' + currentSimilarProblem + ')" style="background: #dc2626; color: white; padding: 0.75rem 2rem; border: none; border-radius: 0.5rem; cursor: pointer; font-weight: 500;">🔄 もう一度挑戦</button>';
            html += '</div>';
          }
          
          html += '</div>';
          out.innerHTML = html;
        }

        // === AI質問システム ===
        
        // AI質問ボタンの表示制御
        function showAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton && currentSession) {
            aiButton.style.display = 'block';
          }
        }
        
        function hideAIQuestionButton() {
          const aiButton = document.getElementById('aiQuestionButton');
          if (aiButton) {
            aiButton.style.display = 'none';
          }
        }
        
        // AI質問ウインドウを開く
        function openAIChat() {
          if (!authenticated) {
            alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
            return;
          }
          
          if (!currentSession) {
            alert('❌ 学習セッションが見つかりません');
            return;
          }
          
          console.log('🤖 Opening AI chat window for session:', currentSession.sessionId);
          
          // 新しいウインドウでAIチャットを開く
          const windowFeatures = 'width=600,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat/' + currentSession.sessionId, 'ai-chat', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }
        
        // 学習セッション無しでAIチャットを開く（メインボタン用）
        function openAIChatDirect() {
          if (!authenticated) {
            alert('❌ ログインが必要です。最初にログインボタンをクリックしてください。');
            return;
          }
          
          console.log('🤖 Opening direct AI chat window');
          
          // 汎用的なセッションIDを生成
          const directSessionId = 'direct_' + Date.now() + '_' + Math.random().toString(36).substring(7);
          
          // 新しいウインドウでAIチャットを開く
          const windowFeatures = 'width=600,height=700,scrollbars=yes,resizable=yes,status=no,location=no,toolbar=no,menubar=no';
          const aiWindow = window.open('/ai-chat/' + directSessionId, 'ai-chat', windowFeatures);
          
          if (!aiWindow) {
            alert('❌ ポップアップがブロックされました。ポップアップを許可してください。');
          } else {
            // ウインドウにフォーカスを移す
            aiWindow.focus();
          }
        }

        // === 問題再生成機能（Step 2: フロントエンド実装） ===
        
        // 問題再生成関数
        async function regenerateProblem(regenerationType = 'full') {
          console.log('🔄 Regenerate problem called, type:', regenerationType);
          
          if (!authenticated) {
            alert('❌ ログインが必要です');
            return;
          }
          
          if (!currentSession) {
            alert('❌ 学習セッションが見つかりません');
            return;
          }
          
          // 全ての再生成ボタンを無効化してローディング表示
          const buttons = document.querySelectorAll('[onclick*="regenerateProblem"]');
          const originalButtonStates = [];
          
          buttons.forEach((button, index) => {
            originalButtonStates[index] = {
              innerHTML: button.innerHTML,
              disabled: button.disabled
            };
            button.disabled = true;
            
            // ボタンタイプに応じたローディング表示
            if (button.innerHTML.includes('同じような問題')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else if (button.innerHTML.includes('違うアプローチ')) {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.25rem; width: 16px; height: 16px;"></div>生成中...';
            } else {
              button.innerHTML = '<div class="loading-spinner" style="display: inline-block; margin-right: 0.5rem; width: 16px; height: 16px;"></div>再生成中...';
            }
          });
          
          try {
            console.log('🔄 Sending regeneration request for session:', currentSession.sessionId);
            
            const response = await fetch('/api/regenerate-problem', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              body: JSON.stringify({
                sessionId: currentSession.sessionId,
                regenerationType: regenerationType
              })
            });
            
            console.log('📡 Regeneration response status:', response.status);
            
            if (!response.ok) {
              throw new Error('HTTP ' + response.status + ': ' + response.statusText);
            }
            
            const result = await response.json();
            console.log('📋 Regeneration result:', result);
            
            if (result.ok) {
              // セッション情報を更新
              currentSession.analysis = result.analysis;
              currentSession.steps = result.steps;
              currentSession.confirmationProblem = result.confirmationProblem;
              currentSession.similarProblems = result.similarProblems;
              currentSession.currentStep = result.currentStep;
              
              // 成功時はボタンを元の状態に戻す
              buttons.forEach((button, index) => {
                if (originalButtonStates[index]) {
                  button.innerHTML = originalButtonStates[index].innerHTML;
                  button.disabled = originalButtonStates[index].disabled;
                }
              });
              
              // 学習システムを新しいデータで再開
              alert('✅ 新しいパターンの問題を生成しました！');
              displayLearningStep(result);
              
              return; // 成功時はreturnして、finallyブロックの実行を回避
            } else {
              throw new Error(result.message || '再生成に失敗しました');
            }
            
          } catch (error) {
            console.error('❌ Regeneration error:', error);
            
            // Step 4: エラーハンドリング強化 - より詳細で分かりやすいエラーメッセージ
            let errorMessage = '❌ 問題の再生成に失敗しました';
            
            if (error.message.includes('HTTP 500')) {
              errorMessage = '❌ AI機能に問題が発生しています。少し時間をおいてから再度お試しください。';
            } else if (error.message.includes('HTTP 404')) {
              errorMessage = '❌ 学習セッションが見つかりません。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('HTTP 400')) {
              errorMessage = '❌ リクエストに問題があります。ページを更新してもう一度お試しください。';
            } else if (error.message.includes('network') || error.message.includes('fetch')) {
              errorMessage = '❌ ネットワーク接続に問題があります。インターネット接続を確認してください。';
            } else if (error.message.includes('timeout')) {
              errorMessage = '❌ 処理に時間がかかりすぎています。もう一度お試しください。';
            } else {
              errorMessage = '❌ 問題の再生成に失敗しました。もう一度お試しいただくか、ページを更新してください。';
            }
            
            alert(errorMessage + String.fromCharCode(10) + String.fromCharCode(10) + '（エラー詳細: ' + error.message + '）');
          } finally {
            // 全てのボタンを元の状態に戻す
            buttons.forEach((button, index) => {
              if (originalButtonStates[index]) {
                button.innerHTML = originalButtonStates[index].innerHTML;
                button.disabled = originalButtonStates[index].disabled;
                button.style.display = 'inline-block'; // エラー時もボタンを再表示
              }
            });
          }
        }

        console.log('✅ Study Partner JavaScript loaded successfully');
        </script>
    </body>
    </html>
  `)
})

// =====================================
// 学習ログシステム API エンドポイント
// =====================================

// Webhook Secret認証ミドルウェア
const requireSecret = async (c: any, next: any) => {
  const providedSecret = c.req.header('X-Webhook-Secret')
  const requiredSecret = c.env.WEBHOOK_SECRET
  
  if (!providedSecret || !requiredSecret || providedSecret !== requiredSecret) {
    console.log('❌ Unauthorized webhook request - invalid secret')
    return c.json({ ok: false, code: 'unauthorized' }, 401)
  }
  
  return next()
}

// ヘルスチェックAPI
app.get('/api/logs/health', (c) => {
  return c.json({ 
    ok: true, 
    version: c.env.VERSION || '1.0.0',
    service: 'kobeya-logging-system',
    timestamp: new Date().toISOString()
  })
})

// 【廃止済み】マスターデータ取得関数（AIベースのタグ推論に移行済み）
async function fetchMasterMaterials(c: any): Promise<any[]> {
  console.log('⚠️ fetchMasterMaterials called but deprecated - using AI-based inference')
  
  // AIベースのシステムではマスターデータは不要なので空配列を返す
  return []
}

// 重複チェック関数
async function isDuplicate(c: any, requestId: string): Promise<boolean> {
  try {
    const db = c.env.DB
    const result = await db.prepare(`
      SELECT id FROM logs WHERE request_id = ?
    `).bind(requestId).first()
    
    return !!result
  } catch (error) {
    console.error('❌ Error checking duplicate:', error)
    return false
  }
}

// ログ挿入関数
async function insertLog(c: any, logData: any): Promise<number | null> {
  try {
    const db = c.env.DB
    
    // デバッグ用：ログデータを確認
    console.log('📝 Insert log data (all fields):', {
      request_id: logData.request_id,
      student_id: logData.student_id,
      student_name: logData.student_name,
      date: logData.date,
      started_at: logData.started_at,
      ended_at: logData.ended_at,
      time_spent_min: logData.time_spent_min,
      subject: logData.subject,
      page: logData.page,
      problem_id: logData.problem_id,
      error_tags: logData.error_tags,
      tasks_done: logData.tasks_done,
      problems_attempted: logData.problems_attempted,
      correct: logData.correct,
      incorrect: logData.incorrect,
      mini_quiz_score: logData.mini_quiz_score,
      weak_tags: logData.weak_tags,
      next_action: logData.next_action,
      flag_teacher_review: logData.flag_teacher_review
    })
    
    // 各パラメータの詳細ログ
    const bindParams = [
      logData.request_id,
      logData.student_id, 
      logData.student_name,
      logData.date,
      logData.started_at,
      logData.ended_at,
      logData.time_spent_min,
      logData.subject,
      logData.page,
      logData.problem_id,
      safeJsonStringify(logData.error_tags || []),
      logData.tasks_done,
      logData.problems_attempted,
      logData.correct,
      logData.incorrect,
      logData.mini_quiz_score,
      safeJsonStringify(logData.weak_tags || []),
      logData.next_action,
      logData.flag_teacher_review ? 1 : 0
    ]
    
    console.log('🔍 Bind parameters check:')
    bindParams.forEach((param, index) => {
      const fieldNames = [
        'request_id', 'student_id', 'student_name', 'date', 'started_at', 'ended_at',
        'time_spent_min', 'subject', 'page', 'problem_id', 'error_tags', 'tasks_done',
        'problems_attempted', 'correct', 'incorrect', 'mini_quiz_score', 'weak_tags',
        'next_action', 'flag_teacher_review'
      ]
      if (param === undefined) {
        console.log(`❌ Parameter ${index} (${fieldNames[index]}) is undefined`)
      } else {
        console.log(`✅ Parameter ${index} (${fieldNames[index]}): ${typeof param} = ${param}`)
      }
    })

    const result = await db.prepare(`
      INSERT INTO logs (
        request_id, student_id, student_name, date, started_at, ended_at,
        time_spent_min, subject, page, problem_id,
        error_tags, tasks_done, problems_attempted, correct, incorrect,
        mini_quiz_score, weak_tags, next_action, flag_teacher_review
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(...bindParams).run()
    
    return result.meta?.last_row_id || null
  } catch (error) {
    console.error('❌ Error inserting log:', error)
    throw error
  }
}

// ログ収集API
app.post('/api/logs', requireSecret, async (c) => {
  console.log('📝 Log collection API called')
  
  try {
    const rawBody = await c.req.json()
    console.log('📝 Raw log data received:', {
      student_id: rawBody.student_id,
      subject: rawBody.subject,
      date: rawBody.date
    })
    
    // データ正規化
    const normalizedData = normalize(rawBody)
    
    // 【新機能】AIベースのタグ推定（教材データベース不要）
    const inferredTags = inferTagsAI('', normalizedData)
    normalizedData.weak_tags = mergeWeakTags(normalizedData.weak_tags, inferredTags)
    
    console.log('🤖 AI-based tag inference result:', inferredTags)
    
    // 時間計算
    normalizedData.time_spent_min = calcMinutes(normalizedData.started_at, normalizedData.ended_at)
    
    // request_idがない場合は生成
    if (!normalizedData.request_id) {
      normalizedData.request_id = generateRequestId()
    }
    
    // 重複チェック
    const isDup = await isDuplicate(c, normalizedData.request_id)
    if (isDup) {
      console.log('⚠️ Duplicate request detected:', normalizedData.request_id)
      return c.json({ ok: false, code: 'duplicate' }, 409)
    }
    
    // ログ挿入
    const insertedId = await insertLog(c, normalizedData)
    
    console.log('✅ Log inserted successfully:', { 
      id: insertedId, 
      student_id: normalizedData.student_id,
      request_id: normalizedData.request_id
    })
    
    return c.json({
      ok: true,
      version: c.env.VERSION || '1.0.0',
      lastRow: insertedId,
      request_id: normalizedData.request_id,
      debugNumbers: debugNums(normalizedData)
    })
    
  } catch (error) {
    console.error('❌ Log collection error:', error)
    return c.json({
      ok: false,
      error: 'log_collection_error',
      message: error.message || 'ログ収集でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 週次レポート生成用のヘルパー関数
async function makeWeeklyReport(c: any, options: { student_id: string, start: string, end: string, store: boolean }) {
  try {
    const db = c.env.DB
    const { student_id, start, end, store } = options
    
    console.log('📊 Generating weekly report:', { student_id, start, end, store })
    
    // 期間内のログデータを取得
    const logsResult = await db.prepare(`
      SELECT * FROM logs 
      WHERE student_id = ? AND date >= ? AND date <= ?
      ORDER BY date DESC, created_at DESC
    `).bind(student_id, start, end).all()
    
    const logs = logsResult.results || []
    
    if (logs.length === 0) {
      return {
        ok: true,
        student_id,
        period: { start, end },
        summary: {
          sessions: 0,
          minutes: 0,
          avg_score: 0,
          weak_tags_top3: []
        },
        message: '該当期間にログデータがありません'
      }
    }
    
    // サマリ計算
    const sessions = logs.length
    const minutes = logs.reduce((sum, log) => sum + (log.time_spent_min || 0), 0)
    const scoresSum = logs.reduce((sum, log) => sum + (log.mini_quiz_score || 0), 0)
    const avgScore = sessions > 0 ? Math.round(scoresSum / sessions) : 0
    
    // 弱点タグ集計
    const weakTagsFlat: string[] = []
    logs.forEach(log => {
      const tags = safeJsonParse(log.weak_tags, [])
      weakTagsFlat.push(...tags)
    })
    
    const tagCounts = weakTagsFlat.reduce((acc, tag) => {
      acc[tag] = (acc[tag] || 0) + 1
      return acc
    }, {} as Record<string, number>)
    
    const weakTagsTop3 = Object.entries(tagCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([tag]) => tag)
    
    // 最新の生徒情報取得
    const latestLog = logs[0]
    const studentName = latestLog.student_name || student_id
    const nextAction = latestLog.next_action || '継続して学習を進めてください'
    
    const summary = {
      sessions,
      minutes,
      avg_score: avgScore,
      weak_tags_top3: weakTagsTop3,
      student_name: studentName,
      next_action: nextAction
    }
    
    // 必要に応じてレポートをDBに保存（今回は省略）
    
    console.log('✅ Weekly report generated:', summary)
    
    return {
      ok: true,
      student_id,
      period: { start, end },
      summary,
      logs_count: sessions
    }
    
  } catch (error) {
    console.error('❌ Weekly report generation error:', error)
    throw error
  }
}

// 週次レポート生成API
app.post('/api/reports/weekly', requireSecret, async (c) => {
  console.log('📊 Weekly report API called')
  
  try {
    const body = await c.req.json()
    const { student_id, start, end, store = true } = body
    
    if (!student_id || !start || !end) {
      return c.json({
        ok: false,
        error: 'missing_params',
        message: 'student_id, start, end パラメータが必要です'
      }, 400)
    }
    
    const result = await makeWeeklyReport(c, { student_id, start, end, store })
    
    return c.json(result)
    
  } catch (error) {
    console.error('❌ Weekly report error:', error)
    return c.json({
      ok: false,
      error: 'weekly_report_error',
      message: error.message || '週次レポート生成でエラーが発生しました'
    }, 500)
  }
})

// =====================================
// ログダッシュボード
// =====================================

// ダッシュボード表示（教室スタッフ専用）
app.get('/dashboard', async (c) => {
  try {
    const db = c.env.DB
    const url = new URL(c.req.url)
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 200) // 最大200件まで
    
    console.log(`📊 Dashboard access - limit: ${limit}`)
    
    // 最新ログを取得
    const logsResult = await db.prepare(`
      SELECT 
        id, created_at, student_id, student_name, subject, 
        mini_quiz_score, weak_tags, correct, incorrect, tasks_done
      FROM logs 
      ORDER BY id DESC 
      LIMIT ?
    `).bind(limit).all()
    
    const logs = logsResult.results || []
    
    // 最新ログの日時を確認（警告表示用）
    let statusMessage = '✅ 正常動作中'
    let statusClass = 'status-ok'
    
    if (logs.length > 0) {
      const latestLog = logs[0]
      const latestTime = new Date(latestLog.created_at)
      const now = new Date()
      const hoursDiff = (now.getTime() - latestTime.getTime()) / (1000 * 60 * 60)
      
      if (hoursDiff > 24) {
        statusMessage = '⚠️ ログ受信停止の可能性あり'
        statusClass = 'status-warning'
      } else {
        const timeStr = latestTime.toLocaleString('ja-JP', {
          year: 'numeric',
          month: '2-digit', 
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        })
        statusMessage = `✅ 正常動作中（最新ログ: ${timeStr}）`
      }
    } else {
      statusMessage = '⚠️ ログデータなし'
      statusClass = 'status-warning'
    }
    
    // weak_tags JSONをパース
    const processedLogs = logs.map(log => ({
      ...log,
      weak_tags_display: (() => {
        try {
          const tags = JSON.parse(log.weak_tags || '[]')
          return Array.isArray(tags) ? tags.join(', ') : log.weak_tags || ''
        } catch {
          return log.weak_tags || ''
        }
      })(),
      created_at_display: new Date(log.created_at).toLocaleString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit', 
        hour: '2-digit',
        minute: '2-digit'
      })
    }))
    
    // HTMLダッシュボードを生成
    const html = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KOBEYA Logs Dashboard</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            margin: 0;
            padding: 20px;
            background-color: #f8f9fa;
            color: #333;
        }
        .container {
            max-width: 1400px;
            margin: 0 auto;
        }
        .header {
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            color: #2c3e50;
        }
        .header p {
            margin: 0;
            color: #7f8c8d;
        }
        .controls {
            margin: 20px 0;
        }
        .controls select {
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            background: white;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 8px;
            overflow: hidden;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        th {
            background-color: #34495e;
            color: white;
            padding: 12px 8px;
            text-align: left;
            font-weight: 500;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        td {
            padding: 10px 8px;
            border-bottom: 1px solid #ecf0f1;
        }
        tbody tr:nth-child(even) {
            background-color: #f8f9fa;
        }
        tbody tr:hover {
            background-color: #e8f4f8;
        }
        .status {
            background: white;
            padding: 15px 20px;
            margin-top: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            font-weight: 500;
        }
        .status-ok {
            color: #27ae60;
            border-left: 4px solid #27ae60;
        }
        .status-warning {
            color: #e67e22;
            border-left: 4px solid #e67e22;
        }
        .score-high { color: #27ae60; font-weight: bold; }
        .score-mid { color: #f39c12; }
        .score-low { color: #e74c3c; font-weight: bold; }
        .tags {
            font-size: 0.9em;
            color: #7f8c8d;
        }
        .student-id {
            font-family: 'Courier New', monospace;
            font-weight: bold;
        }
        .no-data {
            text-align: center;
            padding: 40px;
            color: #7f8c8d;
            font-style: italic;
        }
        @media (max-width: 768px) {
            .container { padding: 10px; }
            table { font-size: 0.9em; }
            th, td { padding: 8px 4px; }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>📊 KOBEYA Logs Dashboard</h1>
            <p>最新${limit}件のログを表示 | 教室スタッフ専用</p>
        </div>
        
        <div class="controls">
            <label for="limitSelect">表示件数：</label>
            <select id="limitSelect" onchange="changeLimit()">
                <option value="25" ${limit === 25 ? 'selected' : ''}>25件</option>
                <option value="50" ${limit === 50 ? 'selected' : ''}>50件</option>
                <option value="100" ${limit === 100 ? 'selected' : ''}>100件</option>
                <option value="200" ${limit === 200 ? 'selected' : ''}>200件</option>
            </select>
            <button onclick="location.reload()" style="margin-left: 10px; padding: 8px 12px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">
                🔄 更新
            </button>
        </div>
        
        ${logs.length > 0 ? `
        <table>
            <thead>
                <tr>
                    <th>ID</th>
                    <th>受信日時</th>
                    <th>生徒ID</th>
                    <th>生徒名</th>
                    <th>教科</th>
                    <th>スコア</th>
                    <th>正答</th>
                    <th>誤答</th>
                    <th>課題数</th>
                    <th>弱点タグ</th>
                </tr>
            </thead>
            <tbody>
                ${processedLogs.map(log => `
                <tr>
                    <td>${log.id}</td>
                    <td>${log.created_at_display}</td>
                    <td class="student-id">${log.student_id || '-'}</td>
                    <td>${log.student_name || '-'}</td>
                    <td>${log.subject || '-'}</td>
                    <td class="${log.mini_quiz_score >= 80 ? 'score-high' : log.mini_quiz_score >= 60 ? 'score-mid' : 'score-low'}">
                        ${log.mini_quiz_score || '-'}
                    </td>
                    <td>${log.correct || 0}</td>
                    <td>${log.incorrect || 0}</td>
                    <td>${log.tasks_done || 0}</td>
                    <td class="tags">${log.weak_tags_display || '-'}</td>
                </tr>
                `).join('')}
            </tbody>
        </table>
        ` : `
        <div class="no-data">
            📝 ログデータがありません
        </div>
        `}
        
        <div class="status ${statusClass}">
            ${statusMessage} | 総件数: ${logs.length}件
        </div>
    </div>
    
    <script>
        function changeLimit() {
            const select = document.getElementById('limitSelect');
            const newLimit = select.value;
            window.location.href = '/dashboard?limit=' + newLimit;
        }
    </script>
</body>
</html>`
    
    return c.html(html)
    
  } catch (error) {
    console.error('❌ Dashboard error:', error)
    
    const errorHtml = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>KOBEYA Logs Dashboard - Error</title>
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f8f9fa; }
        .error { background: #fff3cd; border: 1px solid #ffeaa7; padding: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="error">
        <h1>⚠️ DB接続エラー</h1>
        <p>ダッシュボードのデータを取得できませんでした。</p>
        <p><strong>エラー詳細:</strong> ${error.message}</p>
        <button onclick="location.reload()">🔄 再試行</button>
    </div>
</body>
</html>`
    
    return c.html(errorHtml, 500)
  }
})

// =====================================
// 既存システム継続
// =====================================

// Favicon ハンドラー
app.get('/favicon.ico', (c) => {
  return c.text('', 204)  // No Content
})

// 404ハンドラー
app.notFound((c) => {
  return c.text('404 Not Found', 404)
})

export default app