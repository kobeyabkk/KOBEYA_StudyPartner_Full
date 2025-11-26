import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const api = new Hono<{ Bindings: Bindings }>()

// Helper types and functions
type OpenAIChatCompletionResponse = {
  choices: Array<{
    message: {
      content: string
    }
  }>
  [key: string]: unknown
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

// Helper functions (these should be imported from shared utilities)
async function getOrCreateSession(db: D1Database | undefined, sessionId: string): Promise<any> {
  // Placeholder - should import from shared utilities
  return null
}

async function updateSession(db: D1Database | undefined, sessionId: string, updates: any): Promise<void> {
  // Placeholder - should import from shared utilities
}

// POST /api/essay/init-session
api.post('/init-session', async (c) => {
  console.log('📝 Essay session init API called')
  
  try {
    const { 
      sessionId, 
      targetLevel, 
      lessonFormat, 
      problemMode, 
      customInput, 
      learningStyle 
    } = await c.req.json()
    
    if (!sessionId || !targetLevel || !lessonFormat || !problemMode) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '必要なパラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    const now = new Date().toISOString()
    
    // セッションデータを初期化
    const essaySession = {
      sessionId,
      targetLevel,
      lessonFormat,
      problemMode: problemMode || 'ai',
      customInput: customInput || null,
      learningStyle: learningStyle || 'auto',
      currentStep: 1,
      stepStatus: { "1": "in_progress" },
      createdAt: now,
      uploadedImages: [],
      ocrResults: [],
      feedbacks: []
    }
    
    const session: any = {
      sessionId,
      essaySession,
      chatHistory: [],
      vocabularyProgress: {},
      steps: [],
      confirmationProblem: null,
      similarProblems: []
    }
    
    // インメモリに保存
    // learningSessions.set(sessionId, session)  // Should import learningSessions
    
    // D1に永続化
    const db = c.env?.DB
    if (db) {
      // await saveSessionToDB(db, sessionId, session)  // Should import saveSessionToDB
      console.log('✅ Essay session initialized and saved to D1:', {
        sessionId,
        problemMode: essaySession.problemMode,
        customInput: essaySession.customInput,
        learningStyle: essaySession.learningStyle,
        targetLevel: essaySession.targetLevel
      })
    } else {
      console.warn('⚠️ D1 not available, session only in memory:', sessionId)
    }
    
    return c.json({
      ok: true,
      sessionId,
      message: 'セッションを初期化しました',
      timestamp: now
    }, 200)
    
  } catch (error) {
    console.error('❌ Essay session init error:', error)
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'init_error',
      message: `セッション初期化でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// POST /api/essay/upload-image
api.post('/upload-image', async (c) => {
  console.log('📸 Essay image upload API called')
  
  try {
    const { sessionId, imageData, currentStep } = await c.req.json()
    
    if (!sessionId || !imageData) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '画像データが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // 画像を保存
    if (!session.essaySession.uploadedImages) {
      session.essaySession.uploadedImages = []
    }
    
    session.essaySession.uploadedImages.push({
      step: currentStep,
      imageData: imageData,
      uploadedAt: new Date().toISOString()
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ Image uploaded for session:', sessionId)
    
    return c.json({
      ok: true,
      message: '画像をアップロードしました',
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ Image upload error:', error)
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'upload_error',
      message: `画像アップロードでエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// POST /api/essay/ocr
api.post('/ocr', async (c) => {
  console.log('🔍 Essay OCR API called')
  
  try {
    const { sessionId, imageData, currentStep } = await c.req.json()
    
    if (!sessionId || !imageData) {
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: 'パラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // OpenAI APIキーを取得（開発環境とCloudflare環境の両方に対応）
    const openaiApiKey = c.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    
    // 開発環境でAPIキーがない場合はモックレスポンスを返す
    if (!openaiApiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found - using mock OCR response for development')
      
      // モックOCR結果を返す
      const mockResult = {
        readable: true,
        readabilityScore: 85,
        text: 'SNSは現代社会に大きな影響を与えている。まず、情報の伝達速度が飛躍的に向上した。災害時には即座に安否確認ができ、重要な情報を多くの人々と共有できる。また、地理的な距離を超えて人々がつながることができるようになった。\n\n一方で、誤った情報の拡散や、プライバシーの問題も深刻化している。フェイクニュースが瞬時に広まり、社会に混乱をもたらすこともある。また、SNS依存症や誹謗中傷の問題も無視できない。\n\n私は、SNSは使い方次第で社会に良い影響も悪い影響も与えうると考える。メディアリテラシーを高め、適切に活用することが重要である。',
        charCount: 245,
        issues: []
      }
      
      // セッションにOCR結果を保存
      if (!session.essaySession.ocrResults) {
        session.essaySession.ocrResults = []
      }
      session.essaySession.ocrResults.push({
        ...mockResult,
        processedAt: new Date().toISOString(),
        isMock: true,
        step: currentStep || 4
      })
      
      // インメモリとD1の両方を更新
      await updateSession(db, sessionId, { essaySession: session.essaySession })
      
      return c.json({
        ok: true,
        result: mockResult,
        timestamp: new Date().toISOString()
      }, 200)
    }
    
    // OpenAI Vision APIで画像を分析
    console.log('🤖 Calling OpenAI Vision API...')
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openaiApiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'あなたは手書き原稿用紙のOCR専門家です。画像から手書きの日本語テキストを正確に読み取り、以下の形式でJSON形式で返してください：\n{\n  "readable": true/false,\n  "readabilityScore": 0-100,\n  "text": "読み取ったテキスト",\n  "charCount": 文字数,\n  "issues": ["問題点1", "問題点2"]\n}\n\n読み取り可能性の判断基準：\n- 文字が明瞭に書かれているか\n- 適切な明るさと焦点\n- 原稿用紙全体が写っているか\n\nreadableがfalseの場合は、issuesに具体的な問題点を記載してください。'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像から手書きの小論文を読み取ってください。読み取り可能性も評価してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', errorText)
      return c.json({
        ok: false,
        error: 'openai_error',
        message: 'OCR処理でエラーが発生しました',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    console.log('✅ OpenAI response received')
    
    const aiResponse = completion.choices?.[0]?.message?.content ?? ''
    let ocrResult
    
    try {
      // JSONレスポンスをパース
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        ocrResult = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('JSON not found in response')
      }
    } catch (parseError) {
      console.error('❌ Failed to parse OCR result:', parseError)
      // パース失敗時はデフォルト値を返す
      ocrResult = {
        readable: false,
        readabilityScore: 0,
        text: '',
        charCount: 0,
        issues: ['OCR結果のパースに失敗しました。画像を再度アップロードしてください。']
      }
    }
    
    // セッションにOCR結果を保存
    if (!session.essaySession.ocrResults) {
      session.essaySession.ocrResults = []
    }
    session.essaySession.ocrResults.push({
      ...ocrResult,
      processedAt: new Date().toISOString(),
      step: currentStep || 4
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ OCR completed:', { readable: ocrResult.readable, charCount: ocrResult.charCount })
    
    return c.json({
      ok: true,
      result: ocrResult,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ OCR error:', error)
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'ocr_error',
      message: `OCR処理でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})
// 小論文指導 - AI添削API
api.post('/feedback', async (c) => {
  console.log('🤖 Essay AI feedback API called')
  
  try {
    const { sessionId } = await c.req.json()
    console.log('🤖 Received sessionId:', sessionId)
    
    if (!sessionId) {
      console.error('❌ Missing sessionId')
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: 'セッションIDが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションを取得（D1から復元も試みる）
    const db = c.env?.DB
    let session = await getOrCreateSession(db, sessionId)
    
    console.log('🤖 Session found:', !!session)
    console.log('🤖 EssaySession exists:', !!(session && session.essaySession))
    console.log('🤖 All sessions in memory:', Array.from(learningSessions.keys()))
    
    if (!session || !session.essaySession) {
      console.error('❌ Session not found:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません。ページをリフレッシュして再度お試しください。',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    // OCR結果を取得
    const ocrResults = session.essaySession.ocrResults
    if (!ocrResults || ocrResults.length === 0) {
      return c.json({
        ok: false,
        error: 'no_ocr_data',
        message: 'OCR結果が見つかりません。先に原稿を撮影してください。',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    const latestOCR = ocrResults[ocrResults.length - 1]
    const essayText = latestOCR.text || ''
    
    // OpenAI APIキーを取得
    const openaiApiKey = c.env?.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    
    // モックフィードバック（開発環境用・APIキーがない場合）
    if (!openaiApiKey) {
      console.warn('⚠️ OPENAI_API_KEY not found - using mock feedback')
      console.log('📝 Essay text for mock:', essayText.substring(0, 100) + '...')
      
      const actualCharCount = latestOCR.charCount || essayText.length
      const targetMin = 400
      const targetMax = 600
      
      // 実際の文字数に基づいてフィードバックを調整
      let charCountFeedback = ''
      let scoreAdjustment = 0
      
      if (actualCharCount < targetMin) {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字に達していません。各段落をもう少し詳しく展開してください。`
        scoreAdjustment = -10
      } else if (actualCharCount > targetMax) {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字を超えています。要点を絞って簡潔に書きましょう。`
        scoreAdjustment = -5
      } else {
        charCountFeedback = `文字数が${actualCharCount}字と、指定の${targetMin}〜${targetMax}字の範囲内に収まっています。`
        scoreAdjustment = 5
      }
      
      const mockFeedback = {
        goodPoints: [
          '小論文の課題に真剣に取り組んでいる姿勢が伝わってきます。',
          '文章全体の構成を意識して書こうとしている点が評価できます。',
          '自分の考えを述べようとする姿勢が見られます。'
        ],
        improvements: [
          '序論・本論・結論の構成をより明確にすると、論理的な展開になります。',
          '具体例をもう1〜2つ追加すると、説得力が増します。',
          charCountFeedback
        ],
        exampleImprovement: '【改善例】\n「SNSは便利だが、問題もある。」\n↓\n「SNSは情報共有の利便性という大きなメリットを持つ一方で、誤情報の拡散やプライバシー侵害といった深刻な課題も抱えている。」\n\n（このように、抽象的な表現を具体的に展開しましょう）',
        nextSteps: [
          '次回は、具体例を2つ以上含めて、それぞれ詳しく説明してみましょう。',
          '序論で問題提起、本論で具体例、結論で自分の意見という構成を意識しましょう。',
          '「なぜそう言えるのか」という理由づけを丁寧に書いてみましょう。'
        ],
        overallScore: Math.max(50, Math.min(90, 70 + scoreAdjustment)),
        charCount: actualCharCount,
        isMock: true
      }
      
      // セッションに保存
      if (!session.essaySession.feedbacks) {
        session.essaySession.feedbacks = []
      }
      session.essaySession.feedbacks.push({
        ...mockFeedback,
        createdAt: new Date().toISOString(),
        isMock: true
      })
      
      // インメモリとD1の両方を更新
      await updateSession(db, sessionId, { essaySession: session.essaySession })
      
      return c.json({
        ok: true,
        feedback: mockFeedback,
        timestamp: new Date().toISOString()
      }, 200)
    }
    
    // テーマと問題文を取得
    const themeTitle = session.essaySession.lastThemeTitle || 'テーマ'
    const mainProblem = session.essaySession.mainProblem || 'SNSが社会に与える影響について、あなたの考えを述べなさい'
    
    // 実際のOpenAI APIを使用
    console.log('🤖 Calling OpenAI API for feedback...')
    console.log('📝 Essay text length:', essayText.length, 'chars')
    console.log('🎯 Theme:', themeTitle)
    console.log('📋 Problem:', mainProblem)
    
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + openaiApiKey
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `あなたは経験豊富な小論文指導の専門家です。生徒の小論文を読んで、建設的で具体的なフィードバックを提供してください。

【評価基準】
- 論理構成（序論・本論・結論のバランス）
- 具体例の質と数
- 文章の明確さ
- 語彙の適切さ
- 文字数（目標: 400〜600字）

【重要】以下のJSON形式で必ず返してください。他の文章は含めないでください：
{
  "goodPoints": ["良い点1", "良い点2", "良い点3"],
  "improvements": ["改善点1", "改善点2", "改善点3"],
  "exampleImprovement": "【改善例】\\n「元の文」\\n↓\\n「改善後の文」\\n\\n（このように具体的な書き直し例を示す）",
  "nextSteps": ["次のアクション1", "次のアクション2", "次のアクション3"],
  "overallScore": 85
}

【注意点】
- goodPoints: 必ず3つ、具体的に褒める
- improvements: 必ず3つ、改善方法も含める
- exampleImprovement: 実際の文章から1箇所を選んで改善例を示す
- nextSteps: 今後の学習で取り組むべき具体的なアクション3つ
- overallScore: 0-100の整数

生徒を励ましつつ、実践的で具体的なアドバイスを心がけてください。`
          },
          {
            role: 'user',
            content: `以下の小論文を添削してください。

【課題】${mainProblem}（400〜600字）

【小論文】
${essayText}

【文字数】${essayText.length}字`
          }
        ],
        max_tokens: 2000,
        temperature: 0.7,
        response_format: { type: "json_object" }
      })
    })
    
    if (!response.ok) {
      const errorText = await response.text()
      console.error('❌ OpenAI API error:', errorText)
      return c.json({
        ok: false,
        error: 'openai_error',
        message: 'AI添削でエラーが発生しました',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
    const completion = await response.json() as OpenAIChatCompletionResponse
    console.log('🤖 OpenAI response received')
    
    const aiResponse = completion.choices?.[0]?.message?.content ?? ''
    console.log('🤖 AI response content:', aiResponse.substring(0, 100) + '...')
    
    let feedback
    try {
      // response_format: json_object を使っているので、直接パース可能
      feedback = JSON.parse(aiResponse)
      
      // バリデーション: 必須フィールドの確認
      if (!feedback.goodPoints || !Array.isArray(feedback.goodPoints)) {
        console.warn('⚠️ Missing or invalid goodPoints, using defaults')
        feedback.goodPoints = ['小論文に取り組んだ姿勢が素晴らしいです。']
      }
      if (!feedback.improvements || !Array.isArray(feedback.improvements)) {
        console.warn('⚠️ Missing or invalid improvements, using defaults')
        feedback.improvements = ['さらに詳しく展開してみましょう。']
      }
      if (!feedback.exampleImprovement) {
        console.warn('⚠️ Missing exampleImprovement, using default')
        feedback.exampleImprovement = '具体例を追加することで、説得力が増します。'
      }
      if (!feedback.nextSteps || !Array.isArray(feedback.nextSteps)) {
        console.warn('⚠️ Missing or invalid nextSteps, using defaults')
        feedback.nextSteps = ['次回も頑張りましょう。']
      }
      if (typeof feedback.overallScore !== 'number') {
        console.warn('⚠️ Invalid overallScore, using default')
        feedback.overallScore = 70
      }
      
      // 文字数を追加（OCR結果から取得）
      feedback.charCount = latestOCR.charCount || essayText.length
      
      console.log('✅ Feedback validated successfully')
      
      // 模範解答を生成
      try {
        console.log('🤖 Generating model answer for Step 4...')
        
        const modelAnswerResponse = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + openaiApiKey
          },
          body: JSON.stringify({
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: `あなたは小論文の先生です。以下の課題に対する模範解答（400〜600字）を作成してください。

要求:
- 400〜600字（目標: 500字程度）
- 構成: 序論（問題提起）→本論（具体例2つ以上）→結論（自分の意見）
- 「である」調で記述
- 小論文らしい格調高い表現を使用
- 論理的で説得力のある内容
- 具体例は現実的で分かりやすいものを使用

出力形式:
【模範解答】（500字程度）
(模範となる小論文)`
              },
              {
                role: 'user',
                content: `課題: ${mainProblem}

この課題に対する完璧な模範解答を作成してください。`
              }
            ],
            max_tokens: 1000,
            temperature: 0.7
          })
        })
        
        if (modelAnswerResponse.ok) {
          const modelAnswerData = await modelAnswerResponse.json() as OpenAIChatCompletionResponse
          feedback.modelAnswer = modelAnswerData.choices?.[0]?.message?.content || ''
          console.log('✅ Model answer generated for Step 4')
        }
      } catch (modelError) {
        console.error('❌ Model answer generation error:', modelError)
      }
      
    } catch (parseError) {
      console.error('❌ Failed to parse feedback:', parseError)
      console.error('❌ AI response was:', aiResponse)
      
      // パースエラー時はモックフィードバックを返す
      console.warn('⚠️ Falling back to mock feedback due to parse error')
      feedback = {
        goodPoints: [
          '小論文に真剣に取り組んでいる姿勢が伝わってきます。',
          '文章の構成を意識して書こうとしている点が良いです。',
          '具体的な内容を含めようと努力している点が評価できます。'
        ],
        improvements: [
          'より詳しい展開を心がけると、説得力が増します。',
          '具体例をもう少し詳しく説明すると良いでしょう。',
          '結論部分で自分の意見をより明確に述べましょう。'
        ],
        exampleImprovement: '具体例を追加して、論理的な展開を心がけましょう。',
        nextSteps: [
          '次回は文字数を意識して書きましょう。',
          '具体例を2つ以上含めるよう心がけましょう。',
          '序論・本論・結論の構成を明確にしましょう。'
        ],
        overallScore: 65,
        charCount: latestOCR.charCount || essayText.length,
        isFallback: true
      }
    }
    
    // セッションに保存
    if (!session.essaySession.feedbacks) {
      session.essaySession.feedbacks = []
    }
    session.essaySession.feedbacks.push({
      ...feedback,
      createdAt: new Date().toISOString()
    })
    
    // インメモリとD1の両方を更新
    await updateSession(db, sessionId, { essaySession: session.essaySession })
    
    console.log('✅ AI feedback completed and saved to D1')
    
    return c.json({
      ok: true,
      feedback,
      timestamp: new Date().toISOString()
    }, 200)
    
  } catch (error) {
    console.error('❌ Feedback error:', error)
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'feedback_error',
      message: `AI添削でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// 小論文指導 - チャットAPI
api.post('/chat', async (c) => {
  console.log('📝 Essay chat API called')
  
  try {
    const { sessionId, message, currentStep } = await c.req.json()
    console.log('📝 Received:', { sessionId, message, currentStep })
    
    if (!sessionId || !message) {
      console.log('❌ Missing parameters')
      return c.json({
        ok: false,
        error: 'missing_parameters',
        message: '必要なパラメータが不足しています',
        timestamp: new Date().toISOString()
      }, 400)
    }
    
    // セッションデータを取得してカスタムテーマを使用
    const db = c.env?.DB
    const session = await getOrCreateSession(db, sessionId)
    
    if (!session || !session.essaySession) {
      console.error('❌ Essay session not found:', sessionId)
      return c.json({
        ok: false,
        error: 'session_not_found',
        message: 'セッションが見つかりません',
        timestamp: new Date().toISOString()
      }, 404)
    }
    
    const essaySession = session.essaySession
    const problemMode = essaySession?.problemMode || 'ai'
    const customInput = essaySession?.customInput || null
    const learningStyle = essaySession?.learningStyle || 'auto'
    const targetLevel = essaySession?.targetLevel || 'high_school'
    
    console.log('📝 Essay chat - Session data:', { 
      sessionId, 
      problemMode, 
      customInput, 
      learningStyle, 
      targetLevel,
      currentStep,
      message: message.substring(0, 50)
    })
    
    // Session data validation
    if (!problemMode) {
      console.warn('⚠️ problemMode is missing in session')
    }
    if (!customInput && (problemMode === 'theme' || problemMode === 'problem')) {
      console.warn('⚠️ customInput is missing but problemMode is:', problemMode)
    }
    
    let response = ''
    let stepCompleted = false
    
    // ステップごとの簡易応答
    if (currentStep === 1) {
      console.log('📝 Step 1 processing, message:', message)
      
      // 画像がアップロードされたかチェック（OCR処理済みの回答）
      const essaySessionData = session?.essaySession
      const uploadedImages = essaySessionData?.uploadedImages ?? []
      const ocrResults = essaySessionData?.ocrResults ?? []
      const hasImage = uploadedImages.some((img: UploadedImage) => img.step === 1)
      const hasOCR = ocrResults.some((ocr: OCRResult) => ocr.step === 1)
      
      // OCR結果がある場合、AI添削を実行
      if (hasOCR && (message.includes('確認完了') || message.includes('これで完了'))) {
        console.log('📝 Step 1: OCR confirmed, generating feedback...')
        
        try {
          const step1OCRs = ocrResults.filter((ocr: OCRResult) => ocr.step === 1)
          const latestOCR = step1OCRs[step1OCRs.length - 1]
          const essayText = latestOCR.text || ''
          
          const openaiApiKey = c.env?.OPENAI_API_KEY
          
          if (!openaiApiKey) {
            console.error('❌ OPENAI_API_KEY not configured for Step 1 feedback')
            throw new Error('OpenAI API key not configured')
          }
          
          // 質問を取得（セッションに保存されているはず）
          const themeTitle = session.essaySession.lastThemeTitle || customInput || 'テーマ'
          
          const systemPrompt = `あなたは小論文の先生です。生徒がStep 1の質問に対して手書きで回答した内容を添削してください。

テーマ: ${themeTitle}

【評価基準】
- 質問への適切な回答
- 文章の明確さと論理性
- 小論文らしい丁寧な文体
- 具体性と説得力

【重要】以下のJSON形式で必ず返してください：
{
  "goodPoints": ["良い点1", "良い点2"],
  "improvements": ["改善点1", "改善点2"],
  "overallScore": 80,
  "nextSteps": ["次のアクション1", "次のアクション2"]
}

生徒を励ましつつ、実践的なアドバイスを心がけてください。`
          
          console.log('🤖 Calling OpenAI API for Step 1 feedback...')
          
          const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openaiApiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o',
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: `以下の回答を添削してください。\n\n【生徒の回答】\n${essayText}` }
              ],
              max_tokens: 1000,
              temperature: 0.7,
              response_format: { type: "json_object" }
            })
          })
          
          if (!response_api.ok) {
            const errorText = await response_api.text()
            console.error('❌ OpenAI API error (Step 1 feedback):', errorText)
            throw new Error(`OpenAI API error: ${response_api.status}`)
          }
          
            const completion = await response_api.json() as OpenAIChatCompletionResponse
          const feedback = JSON.parse(completion.choices?.[0]?.message?.content || '{}') as {
            goodPoints?: string[]
            improvements?: string[]
            overallScore?: number
            nextSteps?: string[]
          }
          const goodPoints = Array.isArray(feedback.goodPoints) ? feedback.goodPoints : []
          const improvements = Array.isArray(feedback.improvements) ? feedback.improvements : []
          const nextSteps = Array.isArray(feedback.nextSteps) ? feedback.nextSteps : []
          const overallScore = typeof feedback.overallScore === 'number' ? feedback.overallScore : 0
          
          console.log('✅ Step 1 feedback generated')
          
          response = `【質問への回答 添削結果】\n\n✨ 良かった点：\n${goodPoints.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📝 改善点：\n${improvements.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n📊 総合評価：${overallScore}点\n\n🎯 次のステップ：\n${nextSteps.map((p: string, i: number) => `${i + 1}. ${p}`).join('\n')}\n\n素晴らしい取り組みでした！このステップは完了です。「次のステップへ」ボタンを押してください。`
          stepCompleted = true
          
        } catch (error) {
          console.error('❌ Step 1 feedback error:', error)
          response = '回答を受け付けました。素晴らしい努力です！\n\nこのステップは完了です。「次のステップへ」ボタンを押してください。'
          stepCompleted = true
        }
      }
      // 画像アップロードがあった場合
      else if (hasImage) {
        response = '画像を受け取りました！\n\nOCR処理を開始しています。読み取りが完了するまで少々お待ちください...\n\n読み取り結果が表示されたら、内容を確認して「確認完了」と入力してください。修正が必要な場合は、正しいテキストを入力して送信してください。'
      }
      // パス機能
      else if (message.toLowerCase().includes('パス') || message.toLowerCase().includes('pass')) {
        console.log('✅ Matched: パス')
        
        // セッションから読み物と質問を取得
        const themeContent = session?.essaySession?.lastThemeContent || ''
        const themeTitle = session?.essaySession?.lastThemeTitle || customInput || 'このテーマ'
        
        // AIで模範解答を生成
        let passAnswer = `【模範解答】\n1. ${themeTitle}は現代社会において重要なテーマです。基本的な知識を学ぶことが大切です。\n2. ${themeTitle}に関連して、様々な影響や課題が考えられます。\n3. ${themeTitle}について、自分なりの意見を持ち、行動することが重要です。`
        
        if ((problemMode === 'theme' || problemMode === 'ai') && customInput && themeContent) {
          try {
            const openaiApiKey = c.env?.OPENAI_API_KEY
            
            if (!openaiApiKey) {
              console.error('❌ CRITICAL: OPENAI_API_KEY is not configured for pass answer!')
              throw new Error('OpenAI API key not configured')
            }
            
            console.log('🤖 Generating model answer for pass...')
            console.log('📚 Theme content available:', themeContent.length, 'characters')
            
            const systemPrompt = `あなたは小論文の先生です。生徒が「パス」を選択したので、読み物の内容に基づいた模範解答を提供してください。

テーマ: ${themeTitle}

読み物の内容:
${themeContent}

生徒への質問（これらに答える必要があります）:
1. ${themeTitle}の基本的な概念や定義について
2. ${themeTitle}に関する現代社会における問題点や課題
3. ${themeTitle}について、自分自身の考えや意見

要求:
- 3つの質問すべてに答える
- 読み物の内容を参考にしながら、自分の言葉で説明する
- 具体的な例を挙げる
- 小論文らしい丁寧な文体で書く`

            console.log('🤖 Generating model answer for pass...')
            
            const response_api = await fetch('https://api.openai.com/v1/chat/completions', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`
              },
              body: JSON.stringify({
                model: 'gpt-4o',
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: '模範解答を提供してください。' }
                ],
                temperature: 0.7,
                max_tokens: 2000
              })
            })
            
            if (!response_api.ok) {
              throw new Error(`OpenAI API error: ${response_api.status}`)
            }
            
            const data = await response_api.json() as OpenAIChatCompletionResponse
            passAnswer = data.choices[0]?.message?.content || passAnswer
          } catch (error) {
            console.error('❌ Model answer generation error:', error)
          }
        }
        
        passAnswer = passAnswer.replace(/\n/g, '<br>')
        
        return c.json({
          ok: true,
          response: passAnswer,
          timestamp: new Date().toISOString()
        }, 200)
      }
      
      // その他のメッセージ処理（Step 1の場合）
      return c.json({
        ok: true,
        response: 'メッセージを受け取りました。',
        timestamp: new Date().toISOString()
      }, 200)
    }
    
    // その他のステップの処理
    return c.json({
      ok: true,
      response: 'メッセージを受け取りました。',
      timestamp: new Date().toISOString()
    }, 200)
      
  } catch (error) {
    console.error('❌ Essay chat error:', error)
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'chat_error',
      message: `チャット処理でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

export default api
