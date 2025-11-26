import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

type OpenAIChatCompletionResponse = {
  choices: Array<{
    message: {
      content: string
    }
  }>
  [key: string]: unknown
}

// Helper function for error messages
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

const api = new Hono<{ Bindings: Bindings }>()

// Helper function to get study partner session
// Note: This is a simplified version - the full implementation may need to be imported
async function getStudyPartnerSession(db: D1Database | undefined, sessionId: string): Promise<any> {
  if (!db) return null
  try {
    const result = await db.prepare('SELECT * FROM sessions WHERE session_id = ?').bind(sessionId).first()
    return result ? JSON.parse(result.session_data as string) : null
  } catch {
    return null
  }
}

// POST /api/ai/chat
api.post('/chat', async (c) => {
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
    
    // セッション情報を取得してコンテキストを作成（オプショナル）
    const db = c.env?.DB
    const session = await getStudyPartnerSession(db, sessionId)
    let contextInfo = '汎用AIチャット（学習セッションなし）'
    
    if (session) {
      // 現在の学習コンテキストを構築
      let phase = '段階学習'
      if (session.status === 'similar_problems') {
        phase = '類似問題'
      } else if (session.status === 'confirmation') {
        phase = '確認問題'
      }
      const currentStepIndex = typeof session.currentStep === 'number' ? session.currentStep : 0
      const analysisSummary =
        typeof session.analysis === 'string'
          ? session.analysis.split('\n\n')[0]
          : ''
      const problemLabel =
        session.problemType === 'english_grammar'
          ? '英語文法'
          : session.problemType || '不明'

      contextInfo = `現在の学習状況：
・学習フェーズ: ${phase}
・問題タイプ: ${problemLabel}
・現在のステップ: ${currentStepIndex + 1}
・学習内容: ${analysisSummary}`
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
            content: `あなたは「プログラミングのKOBEYA」の優秀な学習サポートAIアシスタントです。

【あなたの役割】
生徒の学習をサポートする頼れるアシスタントとして、質問に親身になって答えてください。通常のChatGPTと同様に、どんな質問にも柔軟に対応してください。

【現在の学習コンテキスト】
${contextInfo}

【回答スタイル】
・自然で親しみやすい文章で回答
・必要に応じて、手順を分けて説明
・具体例を多用
・図式的な説明（記号や矢印使用）
・覚え方のコツやヒント
・問題を作成したり、確認問題を出すことも可能です

【数式の表記方法】
数式を含む回答では、必ず以下のLaTeX形式を使用してください：
・インライン数式：$数式$ （例：$x^2 + y^2 = r^2$）
・独立した数式：$$数式$$ （例：$$\\frac{3x+2y}{8}$$）
・分数：$\\frac{分子}{分母}$ （例：$\\frac{3}{4}$）
・累乗：$x^2$ （例：$a^{n+1}$）
・平方根：$\\sqrt{中身}$ （例：$\\sqrt{2}$）

生徒からの質問に、温かく分かりやすい回答をしてください。`
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
    
    const aiResult = await openaiResponse.json() as OpenAIChatCompletionResponse
    const aiAnswer = aiResult.choices?.[0]?.message?.content || 'すみません、回答を生成できませんでした。'
    
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
    const errorMessage = toErrorMessage(error)
    return c.json({
      ok: false,
      error: 'ai_chat_error',
      message: `AI質問処理でエラーが発生しました: ${errorMessage}`,
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// POST /api/ai-chat (registered under /api)
api.post('/ai-chat', async (c) => {
  try {
    const { sessionId, question } = await c.req.json()
    
    console.log('🤖 AI Chat API: Received request')
    console.log('📍 Session ID:', sessionId)
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
        messages: [
          {
            role: 'system',
            content: `あなたは中学生向けの優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜である」「〜です」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

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
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記

【証明・解説のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説
4. 証明は1ステップ1-2行以内で簡潔に
5. 各ステップの間には改行を1つだけ入れる（空行は入れない）

分かりやすく、親しみやすく、そして正確に教えてください。`
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.7,
        max_tokens: 1000
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

// POST /api/ai-chat-image (registered under /api)
api.post('/ai-chat-image', async (c) => {
  try {
    console.log('📸 AI Chat Image API: Received request')
    
    // FormDataから画像とテキストを取得
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
    
    console.log('📍 Session ID:', sessionId)
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
          messages: [
            {
              role: 'system',
              content: `あなたは中学生向けの優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜である」「〜です」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

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
- 「角」や「三角形」などの漢字表記は使わず、必ず記号で表記

【証明・解説のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説
4. 証明は1ステップ1-2行以内で簡潔に
5. 各ステップの間には改行を1つだけ入れる（空行は入れない）

分かりやすく、親しみやすく、そして正確に教えてください。`
            },
            {
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
            }
          ],
          temperature: 0.7,
          max_tokens: 2000
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

export default api

