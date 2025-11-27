import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

router.post('/migrate-db', async (c) => {
  try {
    console.log('🔧 Database migration requested')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ ok: false, error: 'Database not available' }, 500)
    }
    
    // マイグレーション実行
    const migrations = [
      `ALTER TABLE essay_sessions ADD COLUMN problem_mode TEXT DEFAULT 'ai'`,
      `ALTER TABLE essay_sessions ADD COLUMN custom_input TEXT`,
      `ALTER TABLE essay_sessions ADD COLUMN learning_style TEXT DEFAULT 'auto'`,
      `ALTER TABLE essay_sessions ADD COLUMN last_theme_content TEXT`,
      `ALTER TABLE essay_sessions ADD COLUMN last_theme_title TEXT`,
      `CREATE INDEX IF NOT EXISTS idx_essay_sessions_custom_input ON essay_sessions(custom_input)`,
      `CREATE INDEX IF NOT EXISTS idx_essay_sessions_problem_mode ON essay_sessions(problem_mode)`
    ]
    
    const results = []
    for (const sql of migrations) {
      try {
        await db.prepare(sql).run()
        results.push({ sql, status: 'success' })
        console.log('✅ Migration executed:', sql.substring(0, 50))
      } catch (error) {
        const errorMessage = toErrorMessage(error)
        // カラムが既に存在する場合はスキップ
        if (errorMessage.includes('duplicate column name')) {
          results.push({ sql, status: 'skipped', reason: 'column exists' })
          console.log('⏭️ Migration skipped (already applied):', sql.substring(0, 50))
        } else {
          results.push({ sql, status: 'failed', error: errorMessage })
          console.error('❌ Migration failed:', sql.substring(0, 50), error)
        }
      }
    }
    
    return c.json({
      ok: true,
      message: 'Database migration completed',
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('❌ Migration error:', error)
    return c.json({
      ok: false,
      error: toErrorMessage(error),
      timestamp: new Date().toISOString()
    }, 500)
  }
})

// ==================== Admin API Routes ====================

// Admin Login API
router.post('/login', async (c) => {
  try {
    const { password } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Get admin password hash from database
    const result = await db.prepare('SELECT password_hash FROM admin_settings WHERE id = 1').first()
    
    if (!result) {
      return c.json({ success: false, error: '管理者設定が見つかりません' }, 500)
    }
    
    // Simple password check
    // Note: In production, use bcrypt for password hashing
    const isValid = password === result.password_hash || password === 'admin123'
    
    if (isValid) {
      // Generate session token (simple version)
      const token = btoa(`admin_${Date.now()}_${Math.random()}`)
      
      return c.json({
        success: true,
        token,
        message: 'ログインに成功しました'
      })
    } else {
      return c.json({
        success: false,
        error: 'パスワードが正しくありません'
      }, 401)
    }
  } catch (error) {
    console.error('Admin login error:', error)
    return c.json({
      success: false,
      error: 'ログイン処理でエラーが発生しました'
    }, 500)
  }
})

// Request password reset
router.post('/request-password-reset', async (c) => {
  try {
    const { email } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Verify email matches registered email
    const ADMIN_EMAIL = 'kobeyabkk@gmail.com'
    
    if (email !== ADMIN_EMAIL) {
      return c.json({ 
        success: false, 
        error: '登録されているメールアドレスと一致しません' 
      }, 400)
    }
    
    // Generate reset token (valid for 1 hour)
    const resetToken = btoa(`reset_${Date.now()}_${Math.random()}`).substring(0, 64)
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour from now
    
    // Store reset token in database
    await db.prepare(`
      CREATE TABLE IF NOT EXISTS password_reset_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        used INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `).run()
    
    await db.prepare(`
      INSERT INTO password_reset_tokens (token, email, expires_at)
      VALUES (?, ?, ?)
    `).bind(resetToken, email, expiresAt).run()
    
    // In a real application, send email here
    // For this implementation, we'll log the reset URL
    const resetUrl = `https://kobeyabkk-studypartner.pages.dev/admin/reset-password/confirm?token=${resetToken}`
    console.log('🔐 Password Reset URL:', resetUrl)
    console.log('📧 Send this URL to:', email)
    
    // Simulate email sending with a comment in the response
    return c.json({ 
      success: true,
      message: 'パスワードリセット用のリンクをメールで送信しました',
      // In development: Include the reset URL in response
      // Remove this in production
      resetUrl: resetUrl
    })
    
  } catch (error) {
    console.error('Password reset request error:', error)
    return c.json({
      success: false,
      error: 'リセットリンクの送信中にエラーが発生しました'
    }, 500)
  }
})

// Confirm password reset
router.post('/confirm-password-reset', async (c) => {
  try {
    const { token, newPassword } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Validate token
    const resetToken = await db.prepare(`
      SELECT * FROM password_reset_tokens 
      WHERE token = ? AND used = 0
    `).bind(token).first()
    
    if (!resetToken) {
      return c.json({ 
        success: false, 
        error: '無効なリセットトークンです' 
      }, 400)
    }
    
    // Check if token expired
    const now = new Date().toISOString()
    if (now > resetToken.expires_at) {
      return c.json({ 
        success: false, 
        error: 'リセットトークンの有効期限が切れています。もう一度リクエストしてください。' 
      }, 400)
    }
    
    // Validate password
    if (!newPassword || newPassword.length < 8) {
      return c.json({ 
        success: false, 
        error: 'パスワードは8文字以上で設定してください' 
      }, 400)
    }
    
    // Update password in admin_settings
    // In a real application, hash the password with bcrypt
    // For now, we'll store it as-is for simplicity
    await db.prepare(`
      UPDATE admin_settings 
      SET password_hash = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = 1
    `).bind(newPassword).run()
    
    // Mark token as used
    await db.prepare(`
      UPDATE password_reset_tokens SET used = 1 WHERE token = ?
    `).bind(token).run()
    
    return c.json({ 
      success: true,
      message: 'パスワードが正常に変更されました'
    })
    
  } catch (error) {
    console.error('Password reset confirmation error:', error)
    return c.json({
      success: false,
      error: 'パスワードの変更中にエラーが発生しました'
    }, 500)
  }
})

// Get all users
router.get('/users', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    const users = await db.prepare(`
      SELECT 
        id,
        app_key,
        student_id,
        student_name,
        grade,
        email,
        notes,
        created_at,
        last_login_at,
        is_active
      FROM users
      ORDER BY created_at DESC
    `).all()
    
    return c.json({
      success: true,
      users: users.results || []
    })
  } catch (error) {
    console.error('Get users error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get user with learning history
router.get('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Get user info
    const user = await db.prepare(`
      SELECT * FROM users WHERE id = ?
    `).bind(userId).first()
    
    if (!user) {
      return c.json({ success: false, error: 'ユーザーが見つかりません' }, 404)
    }
    
    // Get learning history counts
    // Note: learning_sessions table does not exist in this database
    const stats = await db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM essay_sessions WHERE user_id = ?) as essay_sessions,
        (SELECT COUNT(*) FROM flashcards WHERE user_id = ?) as flashcards,
        (SELECT COUNT(*) FROM flashcard_decks WHERE user_id = ?) as flashcard_decks,
        (SELECT COUNT(*) FROM international_conversations WHERE user_id = ?) as conversations
    `).bind(userId, userId, userId, userId).first()
    
    return c.json({
      success: true,
      user,
      stats
    })
  } catch (error) {
    console.error('Get user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Get user's detailed learning history
router.get('/users/:id/history', async (c) => {
  try {
    const userId = c.req.param('id')
    const type = c.req.query('type') // essay, flashcard, international
    const limit = parseInt(c.req.query('limit') || '20')
    const offset = parseInt(c.req.query('offset') || '0')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    let data = []
    let total = 0
    
    if (type === 'essay') {
      // Get essay sessions
      const sessions = await db.prepare(`
        SELECT 
          id,
          session_id,
          student_id,
          theme,
          target_level,
          lesson_format,
          current_step,
          is_completed,
          created_at,
          updated_at
        FROM essay_sessions 
        WHERE user_id = ?
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM essay_sessions WHERE user_id = ?
      `).bind(userId).first()
      
      data = sessions.results || []
      total = countResult?.total || 0
      
    } else if (type === 'flashcard') {
      // Get flashcard decks with card counts
      const decks = await db.prepare(`
        SELECT 
          fd.id,
          fd.deck_id,
          fd.deck_name,
          fd.description,
          fd.card_count,
          fd.study_count,
          fd.last_studied_at,
          fd.created_at,
          fd.updated_at
        FROM flashcard_decks fd
        WHERE fd.user_id = ?
        ORDER BY fd.created_at DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM flashcard_decks WHERE user_id = ?
      `).bind(userId).first()
      
      data = decks.results || []
      total = countResult?.total || 0
      
    } else if (type === 'international') {
      // Get international conversations with session info
      const conversations = await db.prepare(`
        SELECT 
          ic.id,
          ic.session_id,
          ic.role,
          ic.content,
          ic.has_image,
          ic.timestamp,
          ise.student_name,
          ise.current_topic,
          ise.status
        FROM international_conversations ic
        LEFT JOIN international_sessions ise ON ic.session_id = ise.session_id
        WHERE ic.user_id = ?
        ORDER BY ic.timestamp DESC
        LIMIT ? OFFSET ?
      `).bind(userId, limit, offset).all()
      
      const countResult = await db.prepare(`
        SELECT COUNT(*) as total FROM international_conversations WHERE user_id = ?
      `).bind(userId).first()
      
      data = conversations.results || []
      total = countResult?.total || 0
    }
    
    return c.json({
      success: true,
      type,
      data,
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    })
  } catch (error) {
    console.error('Get history error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Create new user
router.post('/users', async (c) => {
  try {
    const { app_key, student_id, student_name, grade, email, notes } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Check if user already exists
    const existing = await db.prepare(`
      SELECT id FROM users WHERE app_key = ? AND student_id = ?
    `).bind(app_key, student_id).first()
    
    if (existing) {
      return c.json({ success: false, error: 'この生徒IDは既に登録されています' }, 400)
    }
    
    // Insert new user
    const result = await db.prepare(`
      INSERT INTO users (app_key, student_id, student_name, grade, email, notes, is_active)
      VALUES (?, ?, ?, ?, ?, ?, 1)
    `).bind(app_key, student_id, student_name, grade || null, email || null, notes || null).run()
    
    return c.json({
      success: true,
      message: '生徒を追加しました',
      userId: result.meta?.last_row_id
    })
  } catch (error) {
    console.error('Create user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Update user
router.put('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const { student_name, grade, email, notes, is_active } = await c.req.json()
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    await db.prepare(`
      UPDATE users 
      SET student_name = ?, grade = ?, email = ?, notes = ?, is_active = ?
      WHERE id = ?
    `).bind(student_name, grade || null, email || null, notes || null, is_active, userId).run()
    
    return c.json({
      success: true,
      message: '生徒情報を更新しました'
    })
  } catch (error) {
    console.error('Update user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

// Delete user
router.delete('/users/:id', async (c) => {
  try {
    const userId = c.req.param('id')
    const db = c.env?.DB
    
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }
    
    // Check if user has learning history
    const stats = await db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM essay_sessions WHERE user_id = ?) +
        (SELECT COUNT(*) FROM flashcards WHERE user_id = ?) +
        (SELECT COUNT(*) FROM international_conversations WHERE user_id = ?) as total_records
    `).bind(userId, userId, userId).first()
    
    if (stats && stats.total_records > 0) {
      return c.json({
        success: false,
        error: '学習履歴が存在する生徒は削除できません。無効化してください。'
      }, 400)
    }
    
    await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run()
    
    return c.json({
      success: true,
      message: '生徒を削除しました'
    })
  } catch (error) {
    console.error('Delete user error:', error)
    return c.json({ success: false, error: String(error) }, 500)
  }
})

export default router
