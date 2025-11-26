import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const api = new Hono<{ Bindings: Bindings }>()


// ログインAPI（最小限追加）
api.post('/login', async (c) => {
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

// ==================== Student Authentication API (Step 3) ====================

// Student login with users table authentication
api.post('/auth/login', async (c) => {
  try {
    const { appkey, sid } = await c.req.json()
    console.log('🔑 Student login attempt:', { appkey, sid })
    
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ 
        success: false, 
        error: 'Database not available' 
      }, 500)
    }
    
    // Validate input
    if (!appkey || !sid) {
      return c.json({ 
        success: false, 
        error: 'APP_KEYと学生IDを入力してください' 
      }, 400)
    }
    
    // Check user in database
    const user = await db.prepare(`
      SELECT id, app_key, student_id, student_name, grade, email, is_active, last_login_at
      FROM users 
      WHERE app_key = ? AND student_id = ?
    `).bind(appkey, sid).first()
    
    if (!user) {
      console.log('❌ User not found:', { appkey, sid })
      return c.json({ 
        success: false, 
        error: 'APP_KEYまたは学生IDが正しくありません' 
      }, 401)
    }
    
    // Check if user is active
    if (!user.is_active) {
      console.log('❌ User is inactive:', { appkey, sid })
      return c.json({ 
        success: false, 
        error: 'このアカウントは無効化されています。管理者にお問い合わせください。' 
      }, 403)
    }
    
    // Update last login timestamp
    await db.prepare(`
      UPDATE users 
      SET last_login_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).bind(user.id).run()
    
    console.log('✅ Login successful:', { userId: user.id, studentId: user.student_id })
    
    return c.json({ 
      success: true, 
      message: 'ログインに成功しました',
      user: {
        id: user.id,
        appkey: user.app_key,
        studentId: user.student_id,
        studentName: user.student_name || user.student_id,
        grade: user.grade,
        email: user.email
      }
    })
  } catch (error) {
    console.error('❌ Student login error:', error)
    return c.json({ 
      success: false, 
      error: 'ログイン処理でエラーが発生しました' 
    }, 500)
  }
})

// 画像解析 + 段階学習開始 endpoint
api.post('/api/analyze-and-learn', async (c) => {
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

export default api
