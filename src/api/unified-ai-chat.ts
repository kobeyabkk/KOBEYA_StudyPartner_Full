/**
 * 統合AIチャットAPI
 * 
 * すべてのAIチャット機能（英検・インター・小論文・フラッシュカードなど）で共通使用
 * 
 * 機能:
 * - 会話履歴の取得・保存
 * - OpenAI API呼び出し（履歴付き）
 * - 画像サポート
 * - コンテキスト別の system prompt
 */

import { Hono } from 'hono'
import type { Context } from 'hono'

interface Env {
  OPENAI_API_KEY: string
  DB: D1Database
}

const app = new Hono<{ Bindings: Env }>()

/**
 * POST /api/unified-ai-chat
 * 
 * 統合AIチャット - メッセージ送信
 */
app.post('/', async (c: Context) => {
  try {
    console.log('🤖 Unified AI Chat API: Received request')
    
    const formData = await c.req.formData()
    const image = formData.get('image') as File | null
    const sessionId = formData.get('sessionId') as string
    const message = formData.get('message') as string
    const contextType = (formData.get('contextType') as string) || 'general'
    
    console.log('📍 Session ID:', sessionId)
    console.log('📂 Context Type:', contextType)
    console.log('💬 Message:', message)
    console.log('🖼️ Image:', image ? `${image.name} (${image.size} bytes)` : 'none')
    
    const openaiApiKey = c.env.OPENAI_API_KEY
    
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not found')
      return c.json({ ok: false, message: 'OpenAI APIキーが設定されていません' })
    }
    
    // セッション作成または更新
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_sessions (session_id, context_type, created_at, updated_at)
        VALUES (?, ?, datetime('now'), datetime('now'))
        ON CONFLICT(session_id) DO UPDATE SET 
          updated_at = datetime('now')
      `).bind(sessionId, contextType).run()
    } catch (dbError) {
      console.warn('⚠️ Session upsert warning:', dbError)
    }
    
    // 過去の会話履歴を取得（最新10件）
    let conversationHistory: any[] = []
    try {
      const historyResult = await c.env.DB.prepare(`
        SELECT role, content, has_image
        FROM ai_chat_conversations
        WHERE session_id = ?
        ORDER BY timestamp ASC
        LIMIT 10
      `).bind(sessionId).all()
      
      conversationHistory = historyResult.results || []
      console.log(`📚 Loaded ${conversationHistory.length} previous messages`)
    } catch (dbError) {
      console.warn('⚠️ History fetch warning:', dbError)
    }
    
    // OpenAI API messages配列を構築
    const messages: any[] = [
      {
        role: 'system',
        content: getSystemPrompt(contextType)
      }
    ]
    
    // 会話履歴を追加
    for (const hist of conversationHistory) {
      if (hist.role === 'user') {
        const userContent: any[] = [{ type: 'text', text: hist.content || '[No text]' }]
        // 画像付きメッセージの場合は画像も含める（ただしBase64データは含めない - コスト削減のため）
        messages.push({
          role: 'user',
          content: hist.has_image ? 
            [...userContent, { type: 'text', text: '[画像が含まれていました]' }] : 
            userContent
        })
      } else if (hist.role === 'assistant') {
        messages.push({
          role: 'assistant',
          content: hist.content
        })
      }
    }
    
    // 現在のユーザーメッセージを構築
    const userContent: any[] = [
      {
        type: 'text',
        text: message || 'Please explain the image content.'
      }
    ]
    
    // 画像を追加
    let imageDataForDB: string | null = null
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
      imageDataForDB = `data:image/jpeg;base64,${base64Image}`
      
      userContent.push({
        type: 'image_url',
        image_url: {
          url: imageDataForDB,
          detail: 'high'
        }
      })
      
      console.log('✅ Image converted to base64')
    }
    
    messages.push({
      role: 'user',
      content: userContent
    })
    
    // ユーザーメッセージをDBに保存
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, image_data, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).bind(
        sessionId, 
        'user', 
        message || '[Image]', 
        image ? 1 : 0,
        imageDataForDB,
        contextType
      ).run()
      console.log('✅ User message saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save user message:', dbError)
    }
    
    // OpenAI API呼び出し
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
    
    // AIレスポンスをDBに保存
    try {
      await c.env.DB.prepare(`
        INSERT INTO ai_chat_conversations (session_id, role, content, has_image, context_type, timestamp)
        VALUES (?, ?, ?, ?, ?, datetime('now'))
      `).bind(sessionId, 'assistant', answer, 0, contextType).run()
      console.log('✅ AI response saved to database')
    } catch (dbError) {
      console.error('❌ Failed to save AI response:', dbError)
    }
    
    return c.json({ ok: true, answer: answer })
    
  } catch (error) {
    console.error('❌ Unified AI Chat API error:', error)
    return c.json({ 
      ok: false, 
      message: 'エラーが発生しました: ' + (error instanceof Error ? error.message : 'Unknown error')
    })
  }
})

/**
 * GET /api/unified-ai-chat/history/:sessionId
 * 
 * 会話履歴取得
 */
app.get('/history/:sessionId', async (c: Context) => {
  try {
    const sessionId = c.req.param('sessionId')
    console.log('📚 Fetching conversation history for session:', sessionId)
    
    const result = await c.env.DB.prepare(`
      SELECT id, role, content, has_image, image_data, timestamp
      FROM ai_chat_conversations
      WHERE session_id = ?
      ORDER BY timestamp ASC
    `).bind(sessionId).all()
    
    const conversations = result.results || []
    console.log(`✅ Retrieved ${conversations.length} messages`)
    
    return c.json({ 
      ok: true, 
      conversations: conversations 
    })
    
  } catch (error) {
    console.error('❌ History fetch error:', error)
    return c.json({ 
      ok: false, 
      message: 'Failed to fetch history',
      conversations: []
    })
  }
})

/**
 * コンテキスト別のsystem prompt取得
 */
function getSystemPrompt(contextType: string): string {
  switch (contextType) {
    case 'international':
      return `You are a bilingual learning support AI for international students. You must provide ALL explanations in BOTH Japanese and English.

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

    case 'eiken':
      return `あなたは英検対策専門の優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜です」「〜ます」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

【英検学習のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説
4. 単語の意味は必ず日本語で説明
5. 覚え方のコツやヒントも付ける

分かりやすく、親しみやすく、そして正確に教えてください。`

    case 'essay':
      return `あなたは小論文指導の専門家です。以下の方針で指導してください：

【指導方針】
- 論理構成を重視した添削
- 具体例と根拠の明確化を促す
- 反論への配慮を指摘
- 表現の適切さを評価

【フィードバック構造】
1. 全体の印象と評価（100-200字）
2. 良い点を3つ具体的に指摘
3. 改善点を3つ優先順位付きで指摘
4. 次回に向けた具体的なアドバイス

建設的で前向きなフィードバックを心がけてください。`

    case 'flashcard':
      return `あなたはフラッシュカード学習のサポートAIです。

【サポート方針】
- 暗記のコツやヒントを提供
- 関連知識や背景情報を補足
- 覚え方の語呂合わせを提案
- 実践的な使用例を示す

【説明スタイル】
- 簡潔で分かりやすく
- 具体例を豊富に
- 視覚的にイメージしやすい説明
- 励ましの言葉を添える

効率的な学習をサポートしてください。`

    default: // 'general'
      return `あなたは中学生向けの優しい学習サポートAIです。以下のルールを必ず守ってください：

【言葉使いのルール】
- 中学生が理解できる易しい言葉で説明する
- 難しい専門用語は使わない（使う場合は必ず解説を付ける）
- 「〜です」「〜ます」など、親しみやすい口調で話す

【改行のルール】
- 各ステップや項目は必ず改行して見やすくする
- 長い文章は2-3行ごとに改行を入れる
- 説明の区切りには空行を入れる

【数式のルール】
- 数式は必ず $$数式$$ の形式で書く（インライン数式は $数式$ を使う）
- 例: $$x^2 + y^2 = r^2$$ や $a = 5$ など

【数学記号のルール】
- 角度は必ず「∠」記号を使う（例: ∠ABC、∠BAF = 90°）
- 三角形は必ず「△」記号を使う（例: △ABC）
- 合同記号は「≡」を使う（例: △ABC ≡ △DEF）
- 平行は「∥」、垂直は「⊥」を使う
- 度数は必ず「°」を付ける（例: 90°、45°）

【解説のルール】
1. まず問題の内容を簡潔に説明
2. 次に解き方のポイントを箇条書き（3-5項目）
3. 最後にステップバイステップで丁寧に解説

分かりやすく、親しみやすく、そして正確に教えてください。`
  }
}

export default app
