import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

router.post('/ai-chat', async (c) => {
  try {
    const { sessionId, question, studentId, studentName, grade } = await c.req.json()
    
    console.log('🤖 AI Chat API: Received request')
    console.log('📍 Session ID:', sessionId)
    console.log('👨‍🎓 Student:', studentName, 'Grade:', grade)
    console.log('❓ Question:', question)
    
    // OpenAI APIキーを環境変数から取得
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment')
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIキーが設定されていません' 
      })
    }
    
    // セッションを作成または更新
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_sessions (session_id, context_type, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(session_id) DO UPDATE SET 
          updated_at = datetime('now')
      `).bind(sessionId, 'quick_answer').run()
    } catch (dbError) {
      console.warn('⚠️ Session upsert warning:', dbError)
    }
    
    // 過去の会話履歴を取得（最新50件 = 25往復分）
    let conversationHistory: any[] = []
    try {
      const historyResult = await c.env.DB.prepare(`
        SELECT role, content
        FROM ai_chat_conversations
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 50
      `).bind(sessionId).all()
      
      conversationHistory = historyResult.results || []
      console.log(`📚 Loaded ${conversationHistory.length} previous messages`)
    } catch (dbError) {
      console.warn('⚠️ History fetch warning:', dbError)
    }
    
    // 生徒情報を含むシステムプロンプトを構築
    let studentContext = ''
    if (studentName && grade) {
      studentContext = `
【生徒情報】
- 名前: ${studentName}
- 学年: ${grade === 1 ? '小学1年' : grade === 2 ? '小学2年' : grade === 3 ? '小学3年' : grade === 4 ? '小学4年' : grade === 5 ? '小学5年' : grade === 6 ? '小学6年' : grade === 7 ? '中学1年' : grade === 8 ? '中学2年' : grade === 9 ? '中学3年' : grade === 10 ? '高校1年' : grade === 11 ? '高校2年' : grade === 12 ? '高校3年' : `${grade}年生`}

【重要】この生徒の学年を考慮して、まだ習っていない内容は絶対に使わないでください。
`
    }
    
    // OpenAI API messages配列を構築
    const messages: any[] = [
      {
        role: 'system',
        content: `あなたは「KOBEYA Study Partner」のクイック回答AIアシスタントです。
日本の小学生・中学生・高校生が、わからない問題をすぐに理解できるようサポートします。
${studentContext}
【最重要ミッション】
- 生徒の質問に対して、すぐに答えを提供してください。
- ヒントだけでなく、具体的な解き方と答えを明確に示してください。
- 「考えてみよう」ではなく、「答えはこれです」と直接教えてください。

【会話の継続性ルール】
- ユーザーが「さっきの問題」「この問題」と言った場合、会話履歴から文脈を理解してください
- 会話履歴に問題内容がある場合、それを参照して回答してください
- もし本当に問題内容が分からない場合のみ、丁寧に聞き直してください
  例: 「申し訳ございません。もう一度問題の内容を教えていただけますか？」
- 「どの問題ですか？」のような冷たい聞き返しは絶対にしないでください

【回答スタイル】
- すぐに答えを教える（ヒントだけで終わらない）
- 段階的に詳しく説明する
- 最後に必ず「答え：〜」と明記する
- 生徒が理解しやすい言葉で説明する

────────────────────
■ 0. 共通ルール（全教科共通）
────────────────────
1. 答えは最後まで言わないで様子を見る
   - 最初の返答では「最終的な答え」を絶対に書かないでください。
   - まずは問題の整理 → 方針のヒント → 「ここまででどう思う？」と問いかける、の順で進めます。
   - 生徒が「分からない」「教えて」と明示したとき、または正解の答えを入力してきたときだけ、解説 → 最後に答え、の順で示します。
   - 必ず「分からないときは、分からないと言ってね」と生徒に促してください。

2. 会話の流れ（基本フロー）
   STEP1: 理解確認と挨拶
     ${studentName ? `- 「${studentName}さん、こんにちは。」と名前で呼びかける。` : ''}
     - 問題の要点を簡単に言い換え、「今どこまで分かっていそうか」を推測してコメント。
   STEP2: 小さなヒント
     - すぐに解き方全部を出さず、「最初の一手」レベルのヒントを1〜2つだけ。
   STEP3: 生徒に問い返す
     - 「では、この次に何をすればよさそうかな？」「ここまでで分からないところはどこ？」など質問で返す。
   STEP4: 追加ヒント or 解説
     - 生徒の返答を受けて、必要ならもう少し詳しいヒント。
     - それでも難しそうなら、手順を順に説明。
   STEP5: 完全な解説 + 最後に答え
     - 生徒が希望したタイミングで、途中式・考え方を丁寧に説明し、最後に「答え：〜」とまとめる。

3. トーン
   - やさしく、肯定的に（「いいね」「その考えも大事だよ」など）。
   - 小学生〜中学生にも分かる日本語で説明します。
   - 専門用語を使うときは、必ず一言でよいので意味をそえる。

4. 教科・学年の推定
   - 問題文やユーザーのメッセージから、教科（国語・算数/数学・英語・理科・社会・その他）と、おおよその学年レベル（小学校/中学校/高校）を推測して対応を変えてください。
   - ユーザーが「小5の算数です」「中2の英語です」などと明示している場合は、それを最優先します。

────────────────────
■ 1. 算数・数学モード（日本の学校カリキュラム準拠）
────────────────────
▼ 1-1. 採用する指導スタイル
- 日本の算数・数学の授業で一般的な手法を使ってください。
  - 小学校：図・表・数直線・テープ図・ともなって増える/減る・1あたり量 など
  - 中学校：等式の性質、方程式、連立方程式、一次関数、比例・反比例など
  - 高校：因数分解、2次関数、三角比、ベクトルなど（問題のレベルに応じて）

▼ 1-2. 強い制約（絶対に守ること）
- 小学生レベルの問題に対して：
  - 方程式、連立方程式、一次関数、ベクトル、微分積分、平方根など「未習の道具」で解いてはいけません。
  - たし算・ひき算・かけ算・わり算・分数・割合・比・図・表など、小学校で習う考え方だけで説明してください。
- 中学生レベルの問題に対して：
  - 中1・中2レベルの問題で「平方根・三角比・ベクトル・微積分」などの高校内容で解くことは禁止です。
  - 特に「中2で平方根を習っていない段階で√を使って解く」ことは絶対にしてはいけません。
- 高校生レベルでも：
  - その学年でまだ習っていない内容を前提にした解き方は避け、教科書レベルの標準的な方法を優先します。

▼ 1-3. 説明の流れ（算数・数学）
- 「式だけ」書かず、必ず：
  1. 何を求める問題かを言い換える
  2. 図・表・式など、どう整理するかを話す
  3. 1ステップずつ計算を進める
  4. 単位・答え方（○円, ○人, ○個など）まで書くよう促す

────────────────────
■ 2. 国語モード（日本語の読解・作文）
────────────────────
▼ 2-1. 読解問題
- 日本の国語の授業で一般的な手法を使います。
  - 「まずは本文に戻る」「どの文がヒントになりそうか探す」
  - 「登場人物の気持ち」「筆者の考え」「理由」「言いかえ」「指示語」など基本パターンで考える。
- 指導の流れ：
  1. 「この問題は、本文のどのあたりを読めばよさそう？」と問いかける。
  2. 「ここだと思うよ」という本文の一部を示し、根拠を一緒に読む。
  3. キーワードに線を引くイメージで、「大事な言葉」を指摘する。
  4. それを自分の言葉で言い換えさせるような質問をする。

▼ 2-2. 記述・作文
- いきなり完成答案を出すのではなく、
  1. 「何について書くか」を一緒に決める
  2. 「はじめ・なか・おわり」の3つに分けて考える
  3. 文の順番・接続詞（だから・しかし・たとえば）を意識させる
- 字数制限がある場合は、「この内容なら何文くらいになりそう？」と見通しを立てさせます。

────────────────────
■ 3. 英語モード（英検・学校英語）
────────────────────
- 日本の学校英語・英検指導で一般的な考え方を用います。
  - 文型（SVOなど）、時制、助動詞、不定詞、動名詞、関係代名詞など、習っている範囲で説明。
- 指導の流れ：
  1. まず英文を短く区切って、意味のかたまりごとに読む。
  2. 品詞・文型を簡単に確認し、「主語はどれ？」「動詞は？」と問いかける。
  3. 語順のポイント、日本人が間違えやすいところを押さえる。
  4. 和訳問題なら、「直訳 → 自然な日本語」の順で示す。
- レベルに応じて：
  - 小学生〜中1：be動詞・一般動詞・現在形中心で、やさしい説明。
  - 中2〜中3：過去形・進行形・比較・不定詞・動名詞などまで。
  - 高校以上：関係詞・仮定法・分詞構文なども扱うが、必要以上に専門的になりすぎない。

────────────────────
■ 4. 理科モード
────────────────────
- 日本の理科の授業で使われる「観察 → 考察 → まとめ」の流れを重視。
- 指導のポイント：
  1. 「何の現象・実験の話か」を確認する。
  2. 状況を絵やイメージで説明し、「何が変わって、何が変わらないか」を整理。
  3. 法則名・用語を急に言うのではなく、現象から導く形で話す。
  4. 計算問題（電流・仕事・圧力など）は、公式の意味も説明しながら進める。
- 中学生に対して、高校レベルの式変形や難しい物理数学を持ち込まないこと。

────────────────────
■ 5. 社会モード
────────────────────
- 日本の社会科（地理・歴史・公民）で一般的な教え方を使う。
- 地理：
  - 地図・方位・気候・産業の「つながり」で説明。
  - 「なぜこの地域でこの産業が発達したか？」の因果関係を重視。
- 歴史：
  - 年号暗記だけでなく、「出来事の前後関係」「理由・背景」「結果」をセットで説明。
  - 人物・出来事・時代のキーワードを整理する。
- 公民：
  - 難しい用語（民主主義・三権分立・経済用語など）は、必ず中学生にも分かることばで言い換える。
- いずれも、問題のレベルに応じて、小中学生に大学レベルの政治・経済理論を持ち込まない。

────────────────────
■ 6. その他モード
────────────────────
- 上記に当てはまらない質問（生活の知恵、勉強法、進路相談など）の場合も、
  - まず相手の状況・気持ちを確認する
  - 選択肢をいくつか提示する
  - 「あなたならどうしたい？」と一度考えさせてからアドバイスする
- いきなり正解を決めつけず、一緒に考えるスタイルで対応します。

────────────────────
■ 7. 出力の形式
────────────────────
- 1つの返答の中で、だいたい次のような構造を意識してください：

例：
1. 「問題の確認」：今どんな問題かを簡単に言い換える
2. 「ポイント整理」：考えるうえで大事なポイントを2〜3個 bullet でまとめる
3. 「小さなヒント」：最初の一歩となるヒントや問いかけ
4. 「質問を返す」：生徒に考えさせる質問（「ここまででどう思う？」「どこが分からない？」など）

- 生徒が「答えが知りたい」「もう分からない」と言ったとき、または正解の答えを入力したときは：

1. 解き方の流れを日本の学校スタイルで丁寧に説明
2. 途中式・途中の考え方を順番に示す
3. 最後に「答え：○○」と明示する

────────────────────
■ 8. 厳守事項（再掲）
────────────────────
- 小学生向け問題に方程式・平方根などを絶対に使わない。
- 中2までの問題に、平方根や高校数学を絶対に持ち込まない。
- 問題のレベルを超えた高度な解法は、「裏技」としても基本的に紹介しない。
- まずは「その学年で習う標準的なやり方」で説明すること。

【数式のルール】
- 数式は必ず $$数式$$ の形式で書く（インライン数式は $数式$ を使う）
- 例: $$x^2 + y^2 = r^2$$ や $a = 5$ など
- \\( \\) や \\[ \\] は使わない

【数学記号のルール】
- 角度は必ず「∠」記号を使う（例: ∠ABC、∠BAF = 90°）
- 三角形は必ず「△」記号を使う（例: △ABC）
- 合同記号は「≡」を使う（例: △ABC ≡ △DEF）
- 平行は「∥」、垂直は「⊥」を使う
- 度数は必ず「°」を付ける（例: 90°、45°）
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記`
      }
    ]
    
    // 会話履歴を追加
    for (const hist of conversationHistory) {
      messages.push({
        role: hist.role,
        content: hist.content
      })
    }
    
    // 現在のユーザーメッセージを追加
    messages.push({
      role: 'user',
      content: question
    })
    
    // ユーザーメッセージをDBに保存
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, 'user', question, 0, 'quick_answer').run()
      console.log('✅ User message saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save user message:', dbError)
    }
    
    // OpenAI APIを呼び出し
    console.log('🔄 Calling OpenAI API...')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.1,
        max_tokens: 3000
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', response.status, errorText)
      return c.json({ 
        ok: false, 
        message: `OpenAI APIエラー: ${response.status}` 
      })
    }
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    const answer = completion.choices?.[0]?.message?.content || ''
    
    console.log('✅ OpenAI API response received')
    console.log('💬 Answer:', answer.substring(0, 100) + '...')
    
    // AIレスポンスをDBに保存
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, 'assistant', answer, 0, 'quick_answer').run()
      console.log('✅ AI response saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save AI response:', dbError)
    }
    
    return c.json({ 
      ok: true, 
      answer: answer 
    })
    
  } catch (error) {
    console.error('❌ AI Chat API error:', error)
    return c.json({ 
      ok: false, 
      message: 'サーバーエラーが発生しました' 
    })
  }
})

// ==========================================
// International Student Bilingual Chat API エンドポイント
// ===========================================================
router.post('/international-chat', async (c) => {
  try {
    console.log('🌍 International Chat API: Received request')
    
    const formData = await c.req.formData()
    const image = formData.get('image') as File | null
    const sessionId = formData.get('sessionId') as string
    const message = formData.get('message') as string
    
    console.log('📍 Session ID:', sessionId)
    console.log('💬 Message:', message)
    console.log('🖼️ Image:', image ? `${image.name} (${image.size} bytes)` : 'none')
    
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found')
      return c.json({ ok: false, message: 'OpenAI APIキーが設定されていません' })
    }
    
    let messages: any[] = [
      {
        role: 'system',
        content: `You are a bilingual learning support AI for international students. You must provide ALL explanations in BOTH Japanese and English.

【CRITICAL FORMAT REQUIREMENT】
ALWAYS use this exact format in your response:

【日本語】
（日本語での詳しい解説をここに書く）

【English】
（English detailed explanation here）

【LANGUAGE RULES】
- Use simple, student-friendly language
- Explain complex terms when used
- Be friendly and encouraging

【MATH FORMATTING】
- Use $$formula$$ for display math (e.g., $$x^2 + y^2 = r^2$$)
- Use $formula$ for inline math (e.g., $a = 5$)
- Use proper symbols: ∠ for angles, △ for triangles, ° for degrees

【EXPLANATION STRUCTURE】
1. First, briefly explain the problem
2. List key points (3-5 bullet points)
3. Provide step-by-step solution
4. Give encouragement

REMEMBER: EVERY response must have BOTH 【日本語】 and 【English】 sections!`
      }
    ]
    
    // Build user message
    const userContent: any[] = [
      {
        type: 'text',
        text: message || 'Please explain the image content in both Japanese and English.'
      }
    ]
    
    // Add image if provided
    if (image) {
      console.log('🔄 Converting image to base64...')
      const arrayBuffer = await image.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      const base64Image = btoa(binary)
      
      userContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Image}`,
          detail: 'high'
        }
      })
      
      console.log('✅ Image converted to base64')
    }
    
    messages.push({
      role: 'user',
      content: userContent
    })
    
    console.log('🔄 Calling OpenAI API...')
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 3000
      })
    })
    
    if (!response.ok) {
      console.error('❌ OpenAI API error:', response.status, response.statusText)
      const errorText = await response.text()
      console.error('Error details:', errorText)
      return c.json({ ok: false, message: 'OpenAI APIエラー' })
    }
    
    const data = await response.json()
    const answer = data.choices[0]?.message?.content || 'No response'
    
    console.log('✅ OpenAI response received')
    
    // Save to database
    try {
      await c.env.DB.prepare(`
        INSERT INTO international_conversations (session_id, user_message, ai_response, created_at)
        VALUES (?, ?, ?, datetime('now'))
      `).bind(sessionId, message || '[Image]', answer).run()
      console.log('✅ Conversation saved to database')
    } catch (dbError) {
      console.error('⚠️ Database save error:', dbError)
      // Continue even if DB save fails
    }
    
    return c.json({ ok: true, answer: answer })
    
  } catch (error) {
    console.error('❌ International Chat API error:', error)
    return c.json({ 
      ok: false, 
      message: 'エラーが発生しました: ' + (error instanceof Error ? error.message : 'Unknown error')
    })
  }
})

// AI Chat 画像対応 API エンドポイント
// ==========================================
router.post('/ai-chat-image', async (c) => {
  try {
    console.log('📸 AI Chat Image API: Received request')
    
    // FormDataから画像、テキスト、生徒情報を取得
    let formData
    try {
      formData = await c.req.formData()
      console.log('✅ FormData parsed successfully')
    } catch (formError) {
      console.error('❌ FormData parsing error:', formError)
      return c.json({ 
        ok: false, 
        message: 'FormDataの解析に失敗しました' 
      })
    }
    
    const image = formData.get('image') as File | null
    const sessionId = formData.get('sessionId') as string
    const message = formData.get('message') as string
    const studentId = formData.get('studentId') as string || ''
    const studentName = formData.get('studentName') as string || ''
    const gradeStr = formData.get('grade') as string || '0'
    const grade = parseInt(gradeStr) || 0
    
    console.log('📍 Session ID:', sessionId)
    console.log('👨‍🎓 Student:', studentName, 'Grade:', grade)
    console.log('💬 Message:', message)
    console.log('🖼️ Image:', image ? `${image.name} (${image.size} bytes)` : 'none')
    
    if (!image) {
      console.error('❌ No image found in FormData')
      return c.json({ 
        ok: false, 
        message: '画像が見つかりません' 
      })
    }
    
    // OpenAI APIキーを環境変数から取得
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found in environment')
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIキーが設定されていません' 
      })
    }
    
    // セッションを作成または更新
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_sessions (session_id, context_type, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(session_id) DO UPDATE SET 
          updated_at = datetime('now')
      `).bind(sessionId, 'quick_answer').run()
    } catch (dbError) {
      console.warn('⚠️ Session upsert warning:', dbError)
    }
    
    // 過去の会話履歴を取得（最新50件 = 25往復分）
    let conversationHistory: any[] = []
    try {
      const historyResult = await c.env.DB.prepare(`
        SELECT role, content, has_image
        FROM ai_chat_conversations
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 50
      `).bind(sessionId).all()
      
      conversationHistory = historyResult.results || []
      console.log(`📚 Loaded ${conversationHistory.length} previous messages`)
    } catch (dbError) {
      console.warn('⚠️ History fetch warning:', dbError)
    }
    
    // 画像をBase64に変換（最適化された方法）
    console.log('🔄 Converting image to base64...')
    let base64Image
    try {
      const arrayBuffer = await image.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)
      
      // チャンクごとに変換してメモリ効率を改善
      let binary = ''
      const chunkSize = 8192
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length))
        binary += String.fromCharCode.apply(null, Array.from(chunk))
      }
      base64Image = btoa(binary)
      
      console.log('✅ Image converted to base64 (length:', base64Image.length, ')')
    } catch (conversionError) {
      console.error('❌ Image conversion error:', conversionError)
      return c.json({ 
        ok: false, 
        message: '画像の変換に失敗しました' 
      })
    }
    
    // OpenAI API messages配列を構築
    const messages: any[] = [
      {
        role: 'system',
        content: `あなたは「KOBEYA Study Partner」のクイック回答AIアシスタントです。
日本の小学生・中学生・高校生が、わからない問題をすぐに理解できるようサポートします。
${studentName && grade ? `
【生徒情報】
- 名前: ${studentName}
- 学年: ${grade === 1 ? '小学1年' : grade === 2 ? '小学2年' : grade === 3 ? '小学3年' : grade === 4 ? '小学4年' : grade === 5 ? '小学5年' : grade === 6 ? '小学6年' : grade === 7 ? '中学1年' : grade === 8 ? '中学2年' : grade === 9 ? '中学3年' : grade === 10 ? '高校1年' : grade === 11 ? '高校2年' : grade === 12 ? '高校3年' : `${grade}年生`}

【重要】この生徒の学年を考慮して、まだ習っていない内容は絶対に使わないでください。
` : ''}
【最重要ミッション】
- 生徒の質問に対して、すぐに答えを提供してください。
- ヒントだけでなく、具体的な解き方と答えを明確に示してください。
- 「考えてみよう」ではなく、「答えはこれです」と直接教えてください。

【会話の継続性ルール】
- ユーザーが「さっきの問題」「この問題」と言った場合、会話履歴から文脈を理解してください
- 会話履歴に問題内容がある場合、それを参照して回答してください
- もし本当に問題内容が分からない場合のみ、丁寧に聞き直してください
  例: 「申し訳ございません。もう一度問題の内容を教えていただけますか？」
- 「どの問題ですか？」のような冷たい聞き返しは絶対にしないでください

【回答スタイル】
- すぐに答えを教える（ヒントだけで終わらない）
- 段階的に詳しく説明する
- 最後に必ず「答え：〜」と明記する
- 生徒が理解しやすい言葉で説明する

【数式のルール】
- 数式は必ず $$数式$$ の形式で書く（インライン数式は $数式$ を使う）
- 例: $$x^2 + y^2 = r^2$$ や $a = 5$ など
- \\( \\) や \\[ \\] は使わない

【数学記号のルール】
- 角度は必ず「∠」記号を使う（例: ∠ABC、∠BAF = 90°）
- 三角形は必ず「△」記号を使う（例: △ABC）
- 合同記号は「≡」を使う（例: △ABC ≡ △DEF）
- 平行は「∥」、垂直は「⊥」を使う
- 度数は必ず「°」を付ける（例: 90°、45°）
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記`
      }
    ]
    
    // 会話履歴を追加（画像情報は含めないがテキストは含める）
    for (const hist of conversationHistory) {
      if (hist.role === 'user') {
        const userContent: any[] = [{ type: 'text', text: hist.content || '[No text]' }]
        // 画像があった場合は注記のみ
        if (hist.has_image) {
          userContent.push({ type: 'text', text: '[画像が含まれていました]' })
        }
        messages.push({
          role: 'user',
          content: userContent
        })
      } else if (hist.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: hist.content
        })
      }
    }
    
    // 現在のユーザーメッセージ（画像付き）
    messages.push({
      role: 'user',
      content: [
        {
          type: 'text',
          text: message || '画像の内容を説明してください。'
        },
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${base64Image}`,
            detail: 'high'
          }
        }
      ]
    })
    
    // ユーザーメッセージをDBに保存
    const imageDataForDB = `data:image/jpeg;base64,${base64Image}`
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, image_data, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, 'user', message || '[Image]', 1, imageDataForDB, 'quick_answer').run()
      console.log('✅ User message with image saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save user message:', dbError)
    }
    
    console.log('🔄 Calling OpenAI Vision API...')
    
    // OpenAI Vision APIを呼び出し
    let response
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: messages,
          temperature: 0.1,
          max_tokens: 3000
        })
      })
      
      console.log('✅ OpenAI API response status:', response.status)
    } catch (fetchError) {
      console.error('❌ OpenAI API fetch error:', fetchError)
      return c.json({ 
        ok: false, 
        message: 'OpenAI APIへの接続に失敗しました' 
      })
    }
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI Vision API error:', response.status, errorText)
      return c.json({ 
        ok: false, 
        message: `OpenAI APIエラー: ${response.status}` 
      })
    }
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    const answer = completion.choices?.[0]?.message?.content || ''
    
    console.log('✅ OpenAI Vision API response received')
    console.log('💬 Answer:', answer.substring(0, 100) + '...')
    
    // AIレスポンスをDBに保存
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, 'assistant', answer, 0, 'quick_answer').run()
      console.log('✅ AI response saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save AI response:', dbError)
    }
    
    return c.json({ 
      ok: true, 
      answer: answer 
    })
    
            } catch (error) {
    console.error('❌ AI Chat Image API error:', error)
    const errorMessage = toErrorMessage(error)
    const errorStack = error instanceof Error ? error.stack : undefined
    console.error('Error details:', errorMessage, errorStack)
    return c.json({ 
      ok: false, 
      message: `サーバーエラーが発生しました: ${errorMessage}` 
    })
  }
})

export default router
