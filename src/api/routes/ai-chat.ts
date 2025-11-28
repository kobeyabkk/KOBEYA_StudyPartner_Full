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

【最重要: 正確性のルール】
- 数学の問題では、計算ミスは絶対に許されません
- 答えは必ず検算して正確性を確認してください
- 同じ問題には常に同じ正しい答えを返してください

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
6. 最後に必ず答えを検算して確認する

分かりやすく、親しみやすく、そして何より正確に教えてください。`
          },
          {
            role: 'user',
            content: question
          }
        ],
        temperature: 0.1,
        max_tokens: 2000
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

export default router
