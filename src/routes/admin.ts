import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

      // 習熟度を計算 (0-5)
      let newMasteryLevel = 0
      if (correctRate >= 0.95 && newReviewCount >= 10) newMasteryLevel = 5
      else if (correctRate >= 0.90 && newReviewCount >= 8) newMasteryLevel = 4
      else if (correctRate >= 0.80 && newReviewCount >= 5) newMasteryLevel = 3
      else if (correctRate >= 0.70 && newReviewCount >= 3) newMasteryLevel = 2
      else if (correctRate >= 0.50) newMasteryLevel = 1

      // 次回復習日を計算 (間隔反復学習)
      const intervals = [1, 3, 7, 14, 30, 90] // 日数
      const nextReviewDays = intervals[Math.min(newMasteryLevel, intervals.length - 1)]
      const nextReviewDate = new Date()
      nextReviewDate.setDate(nextReviewDate.getDate() + nextReviewDays)

      await db.prepare(`
        UPDATE flashcards
        SET review_count = ?, 
            correct_count = ?,
            mastery_level = ?,
            last_reviewed_at = CURRENT_TIMESTAMP,
            next_review_at = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE card_id = ?
      `).bind(
        newReviewCount,
        newCorrectCount,
        newMasteryLevel,
        nextReviewDate.toISOString(),
        cardId
      ).run()
    }

    console.log(`✅ Recorded study for card: ${cardId}, correct: ${isCorrect}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Record study error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ==================== Category & Tag API Routes ====================

// カテゴリ一覧取得
router.post('/api/flashcard/category/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()
    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing credentials' }, 400)
    }

    const userId = `${appkey}_${sid}`

    const categories = await db.prepare(`
      SELECT category_id, name, color, icon, created_at, updated_at
      FROM flashcard_categories
      WHERE user_id = ?
      ORDER BY name ASC
    `).bind(userId).all()

    return c.json({ 
      success: true, 
      categories: categories.results || [] 
    })

  } catch (error) {
    console.error('❌ Category list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ作成
router.post('/api/flashcard/category/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, name, color, icon } = await c.req.json()
    if (!appkey || !sid || !name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`
    const categoryId = `cat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_categories (category_id, user_id, name, color, icon)
      VALUES (?, ?, ?, ?, ?)
    `).bind(
      categoryId,
      userId,
      name,
      color || '#8b5cf6',
      icon || '📚'
    ).run()

    console.log(`✅ Created category: ${name} (${categoryId})`)

    return c.json({ 
      success: true, 
      categoryId,
      category: { category_id: categoryId, name, color: color || '#8b5cf6', icon: icon || '📚' }
    })

  } catch (error) {
    console.error('❌ Category create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ更新
router.post('/api/flashcard/category/update', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, categoryId, name, color, icon } = await c.req.json()
    if (!appkey || !sid || !categoryId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    await db.prepare(`
      UPDATE flashcard_categories
      SET name = COALESCE(?, name),
          color = COALESCE(?, color),
          icon = COALESCE(?, icon),
          updated_at = CURRENT_TIMESTAMP
      WHERE category_id = ? AND user_id = ?
    `).bind(name, color, icon, categoryId, userId).run()

    console.log(`✅ Updated category: ${categoryId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Category update error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カテゴリ削除
router.post('/api/flashcard/category/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, categoryId } = await c.req.json()
    if (!appkey || !sid || !categoryId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    // カテゴリに属するカードのcategory_idをNULLに設定
    await db.prepare(`
      UPDATE flashcards
      SET category_id = NULL
      WHERE category_id = ?
    `).bind(categoryId).run()

    // カテゴリを削除
    await db.prepare(`
      DELETE FROM flashcard_categories
      WHERE category_id = ? AND user_id = ?
    `).bind(categoryId, userId).run()

    console.log(`✅ Deleted category: ${categoryId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Category delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ一覧取得
router.post('/api/flashcard/tag/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()
    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing credentials' }, 400)
    }

    const userId = `${appkey}_${sid}`

    const tags = await db.prepare(`
      SELECT tag_id, name, created_at
      FROM flashcard_tags
      WHERE user_id = ?
      ORDER BY name ASC
    `).bind(userId).all()

    return c.json({ 
      success: true, 
      tags: tags.results || [] 
    })

  } catch (error) {
    console.error('❌ Tag list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ作成
router.post('/api/flashcard/tag/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, name } = await c.req.json()
    if (!appkey || !sid || !name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`
    const tagId = `tag_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_tags (tag_id, user_id, name)
      VALUES (?, ?, ?)
    `).bind(tagId, userId, name).run()

    console.log(`✅ Created tag: ${name} (${tagId})`)

    return c.json({ 
      success: true, 
      tagId,
      tag: { tag_id: tagId, name }
    })

  } catch (error) {
    console.error('❌ Tag create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// タグ削除
router.post('/api/flashcard/tag/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, tagId } = await c.req.json()
    if (!appkey || !sid || !tagId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const userId = `${appkey}_${sid}`

    // カードとタグの関連を削除（外部キー制約でCASCADE）
    await db.prepare(`
      DELETE FROM flashcard_card_tags
      WHERE tag_id = ?
    `).bind(tagId).run()

    // タグを削除
    await db.prepare(`
      DELETE FROM flashcard_tags
      WHERE tag_id = ? AND user_id = ?
    `).bind(tagId, userId).run()

    console.log(`✅ Deleted tag: ${tagId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Tag delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カードへのタグ付与
router.post('/api/flashcard/card/add-tags', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, tagIds } = await c.req.json()
    if (!appkey || !sid || !cardId || !Array.isArray(tagIds)) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    // 既存のタグをすべて削除
    await db.prepare(`
      DELETE FROM flashcard_card_tags WHERE card_id = ?
    `).bind(cardId).run()

    // 新しいタグを追加
    for (const tagId of tagIds) {
      await db.prepare(`
        INSERT OR IGNORE INTO flashcard_card_tags (card_id, tag_id)
        VALUES (?, ?)
      `).bind(cardId, tagId).run()
    }

    console.log(`✅ Added tags to card: ${cardId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Add tags error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// カードのカテゴリ設定
router.post('/api/flashcard/card/set-category', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, categoryId } = await c.req.json()
    if (!appkey || !sid || !cardId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    await db.prepare(`
      UPDATE flashcards
      SET category_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE card_id = ?
    `).bind(categoryId || null, cardId).run()

    console.log(`✅ Set category for card: ${cardId} -> ${categoryId || 'NULL'}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Set category error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// ==================== Eiken API Routes ====================

// 問題分析エンドポイント
app.route('/api/eiken/analyze', analyzeRoute)

// AI問題生成エンドポイント
app.route('/api/eiken/generate', generateRoute)

// International Student Chat Route
app.route('/international-student', internationalStudentRoute)

// Essay Coaching Setup Route
app.route('/essay-coaching', essayCoachingRoute)
app.route('/essay-coaching', essayCoachingSessionRoute)  // Session route

// Phase 2: Topic Management エンドポイント
app.route('/api/eiken/topics', topicRoutes)

// Phase 2C: Blueprint Generation エンドポイント
app.route('/api/eiken/blueprints', blueprintRoutes)

// Phase 3: Integrated Question Generation エンドポイント
app.route('/api/eiken/questions', questionRoutes)

// Translation API エンドポイント
app.route('/api/eiken/translate', translateRoute)

// Unified AI Chat System エンドポイント
app.route('/api/unified-ai-chat', unifiedAIChatRoute)

// 問題報告API
router.post('/api/eiken/report-problem', async (c) => {
  try {
    const { question, questionIndex, reportedAt, userAgent } = await c.req.json()
    console.log('📋 Problem reported:', { questionIndex, reportedAt })
    
    const db = c.env?.DB
    
    if (db) {
      // データベースに問題報告を記録
      await db.prepare(`
        INSERT INTO eiken_problem_reports (question_data, question_index, reported_at, user_agent)
        VALUES (?, ?, ?, ?)
      `).bind(
        JSON.stringify(question),
        questionIndex,
        reportedAt,
        userAgent
      ).run()
    }
    
    return c.json({ 
      success: true, 
      message: '問題を報告しました。ご協力ありがとうございます。' 
    })
  } catch (error) {
    console.error('❌ Failed to record problem report:', error)
    return c.json({ 
      success: false, 
      message: '報告の記録に失敗しました' 
    }, 500)
  }
})

// Phase 4A: Vocabulary System エンドポイント
app.route('/api/vocabulary', vocabularyRoute)

// 404ハンドラー
app.notFound((c) => {
  return c.text('404 Not Found', 404)
})

// Export the app as default
export default app
export default router
