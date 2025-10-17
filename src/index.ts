import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-pages'
import OpenAI from 'openai'

// Cloudflare Bindings
type Bindings = {
  OPENAI_API_KEY: string
  APP_KEY: string
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors({
  origin: ['https://kobeya-homepage2025.pages.dev', 'https://study-partner.pages.dev'],
  allowHeaders: ['Content-Type', 'x-app-key', 'x-student-id'],
  credentials: true
}))

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './public' }))

// 認証ミドルウェア
const authenticate = async (c, next) => {
  const appKey = c.req.header('x-app-key') || c.req.query('key')
  const studentId = c.req.header('x-student-id')
  
  if (!appKey || appKey !== c.env.APP_KEY) {
    return c.json({ 
      ok: false, 
      error: 'unauthorized',
      message: 'APP_KEYが一致しません' 
    }, 401)
  }
  
  if (!studentId) {
    return c.json({ 
      ok: false, 
      error: 'missing_student_id',
      message: '学生IDが必要です' 
    }, 400)
  }
  
  c.set('studentId', studentId)
  await next()
}

// OpenAIクライアント初期化
const getOpenAI = (apiKey: string) => {
  return new OpenAI({
    apiKey: apiKey
  })
}

// モックレスポンス制御
const shouldUseMock = (env: any) => {
  return env.OPENAI_API_KEY === 'sk-test-api-key-for-development'
}

// メインページ
app.get('/', serveStatic({ path: '/index.html' }))

// パブリックヘルスチェック
app.get('/health', (c) => {
  return c.json({
    ok: true,
    message: 'Study Partner API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  })
})

// 認証付きヘルスチェック
app.get('/api/health', authenticate, async (c) => {
  const studentId = c.get('studentId')
  
  // DB接続テスト（オプショナル）
  try {
    if (c.env.DB) {
      await c.env.DB.prepare('SELECT 1 as test').first()
    }
    
    return c.json({
      ok: true,
      message: `Study Partner API ready for student: ${studentId}`,
      features: ['explain', 'practice', 'photo-analyze', 'score'],
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    return c.json({
      ok: false,
      error: 'database_connection_failed',
      message: 'データベース接続エラー'
    }, 500)
  }
})

// Explain API
app.post('/api/explain', authenticate, async (c) => {
  try {
    const { topic } = await c.req.json()
    const studentId = c.get('studentId')
    
    if (!topic) {
      return c.json({
        ok: false,
        error: 'missing_topic',
        message: 'トピックが指定されていません'
      }, 400)
    }

    // モックレスポンス
    if (shouldUseMock(c.env)) {
      return c.json({
        ok: true,
        topic,
        explain_bullets: [
          `${topic}は重要な概念です`,
          '基本的な原理を理解することが大切です',
          '実例を通して学習を深めましょう'
        ],
        steps: [
          '基本概念を確認する',
          '具体例で理解を深める',
          '練習問題に取り組む',
          '応用問題にチャレンジする',
          '知識を定着させる'
        ]
      })
    }

    // OpenAI API呼び出し
    const openai = getOpenAI(c.env.OPENAI_API_KEY)
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'あなたは中学生向けの学習支援AIです。トピックについて分かりやすく説明し、3つの要点と5つの学習ステップを日本語で提供してください。'
        },
        {
          role: 'user',
          content: `「${topic}」について教えてください。`
        }
      ],
      functions: [
        {
          name: 'provide_explanation',
          description: '学習トピックの説明と学習ステップを提供',
          parameters: {
            type: 'object',
            properties: {
              explain_bullets: {
                type: 'array',
                items: { type: 'string' },
                description: '3つの重要ポイント'
              },
              steps: {
                type: 'array',
                items: { type: 'string' },
                description: '5つの学習ステップ'
              }
            },
            required: ['explain_bullets', 'steps']
          }
        }
      ],
      function_call: { name: 'provide_explanation' }
    })

    const result = JSON.parse(completion.choices[0].message.function_call?.arguments || '{}')
    
    // ログ保存
    if (c.env.DB) {
      await c.env.DB.prepare(`
        INSERT INTO study_logs (student_id, action, topic, timestamp, response_data)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        studentId,
        'explain',
        topic,
        new Date().toISOString(),
        JSON.stringify(result)
      ).run()
    }

    return c.json({
      ok: true,
      topic,
      explain_bullets: result.explain_bullets || [],
      steps: result.steps || []
    })

  } catch (error) {
    console.error('Explain API error:', error)
    return c.json({
      ok: false,
      error: 'internal_error',
      message: 'サーバーエラーが発生しました'
    }, 500)
  }
})

// Practice API
app.post('/api/practice', authenticate, async (c) => {
  try {
    const { topic } = await c.req.json()
    const studentId = c.get('studentId')
    
    if (!topic) {
      return c.json({
        ok: false,
        error: 'missing_topic',
        message: 'トピックが指定されていません'
      }, 400)
    }

    // モックレスポンス
    if (shouldUseMock(c.env)) {
      return c.json({
        ok: true,
        topic,
        practice: [
          {
            qtype: 'numeric',
            prompt: `${topic}に関する数値問題：2 + 3 = ?`,
            answer: 5
          },
          {
            qtype: 'choice',
            prompt: `${topic}について正しいものを選んでください`,
            choices: ['選択肢A', '選択肢B', '選択肢C', '選択肢D'],
            answer: 'B'
          },
          {
            qtype: 'check',
            prompt: `${topic}の確認問題：10 × 2 = ?`,
            answer: 20
          }
        ]
      })
    }

    // OpenAI API呼び出し
    const openai = getOpenAI(c.env.OPENAI_API_KEY)
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: '中学生向けの練習問題を3問作成してください。numeric（数値）、choice（選択肢）、check（確認）の3タイプで出題してください。'
        },
        {
          role: 'user',
          content: `「${topic}」の練習問題を作成してください。`
        }
      ],
      functions: [
        {
          name: 'generate_practice',
          description: '練習問題を生成',
          parameters: {
            type: 'object',
            properties: {
              practice: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    qtype: { type: 'string', enum: ['numeric', 'choice', 'check'] },
                    prompt: { type: 'string' },
                    answer: { type: ['string', 'number'] },
                    choices: { type: 'array', items: { type: 'string' } }
                  },
                  required: ['qtype', 'prompt', 'answer']
                }
              }
            },
            required: ['practice']
          }
        }
      ],
      function_call: { name: 'generate_practice' }
    })

    const result = JSON.parse(completion.choices[0].message.function_call?.arguments || '{}')
    
    // ログ保存
    if (c.env.DB) {
      await c.env.DB.prepare(`
        INSERT INTO study_logs (student_id, action, topic, timestamp, response_data)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        studentId,
        'practice',
        topic,
        new Date().toISOString(),
        JSON.stringify(result)
      ).run()
    }

    return c.json({
      ok: true,
      topic,
      practice: result.practice || []
    })

  } catch (error) {
    console.error('Practice API error:', error)
    return c.json({
      ok: false,
      error: 'internal_error',
      message: 'サーバーエラーが発生しました'
    }, 500)
  }
})

// Score API
app.post('/api/score', authenticate, async (c) => {
  try {
    const { items } = await c.req.json()
    const studentId = c.get('studentId')
    
    if (!items || !Array.isArray(items)) {
      return c.json({
        ok: false,
        error: 'invalid_items',
        message: '採点データが正しくありません'
      }, 400)
    }

    // 採点処理
    const results = items.map(item => {
      const { qtype, correct, user } = item
      
      if (qtype === 'numeric' || qtype === 'check') {
        return Number(correct) === Number(user)
      } else if (qtype === 'choice') {
        return String(correct).toLowerCase() === String(user).toLowerCase()
      }
      
      return false
    })

    const score = results.filter(Boolean).length
    const total = results.length
    const percentage = Math.round((score / total) * 100)

    // ログ保存
    if (c.env.DB) {
      await c.env.DB.prepare(`
        INSERT INTO study_logs (student_id, action, topic, timestamp, response_data)
        VALUES (?, ?, ?, ?, ?)
      `).bind(
        studentId,
        'score',
        'practice_result',
        new Date().toISOString(),
        JSON.stringify({ score, total, percentage, results })
      ).run()
    }

    return c.json({
      ok: true,
      results,
      score,
      total,
      percentage,
      message: `${total}問中${score}問正解（${percentage}%）`
    })

  } catch (error) {
    console.error('Score API error:', error)
    return c.json({
      ok: false,
      error: 'internal_error',
      message: 'サーバーエラーが発生しました'
    }, 500)
  }
})

export default app