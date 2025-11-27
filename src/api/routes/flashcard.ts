import { Hono } from 'hono'

type Bindings = {
  OPENAI_API_KEY: string
  DB: D1Database
  WEBHOOK_SECRET: string
  VERSION: string
}

const router = new Hono<{ Bindings: Bindings }>()

// フラッシュカード作成（写真から）
router.post('/create-from-photo', async (c) => {
  console.log('📸 Flashcard from photo API called')
  
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const formData = await c.req.formData()
    const appkey = formData.get('appkey') as string
    const sid = formData.get('sid') as string
    const imageField = formData.get('image')
    const deckId = formData.get('deckId') as string || null

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    if (!imageField || !(imageField instanceof File)) {
      return c.json({ success: false, error: 'No image provided' }, 400)
    }

    // 画像をBase64に変換
    const arrayBuffer = await imageField.arrayBuffer()
    const imageSizeKB = Math.round(arrayBuffer.byteLength / 1024)
    console.log(`📊 Image size: ${imageSizeKB} KB`)
    
    // 画像サイズ制限チェック（20MB）
    if (arrayBuffer.byteLength > 20 * 1024 * 1024) {
      return c.json({ 
        success: false, 
        error: 'Image too large',
        hint: '画像サイズは20MB以下にしてください',
        size: `${imageSizeKB} KB`
      }, 400)
    }
    
    const base64Image = btoa(
      new Uint8Array(arrayBuffer).reduce((data, byte) => data + String.fromCharCode(byte), '')
    )
    const dataUrl = `data:${imageField.type};base64,${base64Image}`

    // OpenAI Vision APIで画像解析
    const openaiApiKey = c.env?.OPENAI_API_KEY
    if (!openaiApiKey) {
      console.error('❌ OpenAI API key not found in environment')
      return c.json({ 
        success: false, 
        error: 'OpenAI API key not configured',
        hint: 'OPENAI_API_KEYを環境変数に設定してください' 
      }, 500)
    }

    console.log('🔍 Analyzing image with OpenAI Vision API...')
    const visionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
            content: `あなたはフラッシュカード作成のエキスパートです。画像から学習用のフラッシュカードを抽出します。

以下のJSON形式で複数のカードを返してください：
{
  "cards": [
    {
      "front": "質問・単語・問題文",
      "back": "回答・意味・解説",
      "tags": ["カテゴリ", "科目"],
      "confidence": 0.95
    }
  ]
}

例：
- 英単語リスト → 各単語を1枚のカードに
- 数学の公式 → 公式名と公式を分けて
- 歴史年表 → 年号と出来事をペアに
- ノート → 重要用語とその説明をペアに

できるだけ多くのカードを抽出してください。`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この画像から学習用のフラッシュカードを作成してください。'
              },
              {
                type: 'image_url',
                image_url: {
                  url: dataUrl
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.3
      })
    })

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text()
      console.error('❌ OpenAI Vision API error:', errorText)
      return c.json({ 
        success: false, 
        error: 'Failed to analyze image', 
        details: errorText,
        status: visionResponse.status
      }, 500)
    }

    const visionData = await visionResponse.json()
    console.log('✅ OpenAI Vision API response received')
    
    if (!visionData.choices || !visionData.choices[0]) {
      console.error('❌ Invalid OpenAI response structure:', visionData)
      return c.json({ 
        success: false, 
        error: 'Invalid response from OpenAI',
        details: visionData
      }, 500)
    }
    
    const aiResponse = visionData.choices[0].message.content
    console.log('📝 AI Response preview:', aiResponse.substring(0, 200))

    // JSONを抽出
    let cardsData
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        cardsData = JSON.parse(jsonMatch[0])
      } else {
        cardsData = JSON.parse(aiResponse)
      }
    } catch (e) {
      console.error('❌ Failed to parse AI response:', aiResponse)
      return c.json({ 
        success: false, 
        error: 'Failed to parse AI response',
        hint: 'AIの応答が正しいJSON形式ではありませんでした',
        aiResponse: aiResponse.substring(0, 500)
      }, 500)
    }

    if (!cardsData.cards || !Array.isArray(cardsData.cards)) {
      console.error('❌ Invalid cards array:', cardsData)
      return c.json({ 
        success: false, 
        error: 'Invalid response format from AI',
        hint: 'AIが正しいカード形式を返しませんでした',
        received: cardsData
      }, 500)
    }

    console.log(`📇 Creating ${cardsData.cards.length} flashcards...`)
    
    // カードをDBに保存
    const createdCards = []
    for (const card of cardsData.cards) {
      const cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
      
      await db.prepare(`
        INSERT INTO flashcards (
          card_id, deck_id, appkey, sid, front_text, back_text, 
          source_image_data, created_from, ai_confidence, tags
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        cardId,
        deckId,
        appkey,
        sid,
        card.front,
        card.back,
        dataUrl,
        'photo',
        card.confidence || 0.8,
        JSON.stringify(card.tags || [])
      ).run()

      createdCards.push({
        cardId,
        front: card.front,
        back: card.back,
        tags: card.tags,
        confidence: card.confidence
      })
    }

    // デッキのカード数を更新
    if (deckId) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count + ?, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(createdCards.length, deckId).run()
    }

    console.log(`✅ Created ${createdCards.length} flashcards from photo`)

    return c.json({
      success: true,
      cards: createdCards,
      count: createdCards.length
    })

  } catch (error) {
    console.error('❌ Flashcard from photo error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード作成（手動入力）
router.post('/create-manual', async (c) => {
  console.log('✍️ Manual flashcard create API called')
  
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckId, front, back, tags, frontImage, backImage } = await c.req.json()

    if (!appkey || !sid || !front || !back) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcards (
        card_id, deck_id, appkey, sid, front_text, back_text,
        front_image_data, back_image_data, created_from, tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      cardId,
      deckId || null,
      appkey,
      sid,
      front,
      back,
      frontImage || null,
      backImage || null,
      'manual',
      JSON.stringify(tags || [])
    ).run()

    // デッキのカード数を更新
    if (deckId) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count + 1, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(deckId).run()
    }

    console.log(`✅ Created manual flashcard: ${cardId}`)

    return c.json({
      success: true,
      cardId,
      front,
      back
    })

  } catch (error) {
    console.error('❌ Manual flashcard create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード一覧取得
router.post('/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckId, categoryId, tagIds, limit = 50, offset = 0 } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    let query = `
      SELECT f.*,
             c.name as category_name,
             c.color as category_color,
             c.icon as category_icon
      FROM flashcards f
      LEFT JOIN flashcard_categories c ON f.category_id = c.category_id
      WHERE f.appkey = ? AND f.sid = ?
    `
    const params = [appkey, sid]

    if (deckId) {
      query += ` AND f.deck_id = ?`
      params.push(deckId)
    }

    if (categoryId) {
      query += ` AND f.category_id = ?`
      params.push(categoryId)
    }

    // タグフィルタリング（タグIDの配列が指定された場合）
    if (tagIds && Array.isArray(tagIds) && tagIds.length > 0) {
      const placeholders = tagIds.map(() => '?').join(',')
      query += ` AND f.card_id IN (
        SELECT card_id FROM flashcard_card_tags 
        WHERE tag_id IN (${placeholders})
        GROUP BY card_id
        HAVING COUNT(DISTINCT tag_id) = ?
      )`
      params.push(...tagIds, tagIds.length)
    }

    query += ` ORDER BY f.created_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    const result = await db.prepare(query).bind(...params).all()
    const cards = result.results || []

    // 各カードのタグを取得
    const userId = `${appkey}_${sid}`
    for (const card of cards) {
      const cardTags = await db.prepare(`
        SELECT t.tag_id, t.name
        FROM flashcard_tags t
        JOIN flashcard_card_tags ct ON t.tag_id = ct.tag_id
        WHERE ct.card_id = ? AND t.user_id = ?
      `).bind(card.card_id, userId).all()
      
      card.tags = cardTags.results || []
    }

    return c.json({
      success: true,
      cards,
      count: cards.length
    })

  } catch (error) {
    console.error('❌ Flashcard list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード一括削除API
router.post('/delete-batch', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardIds } = await c.req.json()

    if (!appkey || !sid || !cardIds || !Array.isArray(cardIds) || cardIds.length === 0) {
      return c.json({ success: false, error: 'Missing required fields or invalid cardIds' }, 400)
    }

    let deletedCount = 0
    const deckUpdates = new Map()

    // 各カードを削除
    for (const cardId of cardIds) {
      // カードの存在確認とdeck_id取得
      const card = await db.prepare(`
        SELECT deck_id FROM flashcards 
        WHERE card_id = ? AND appkey = ? AND sid = ?
      `).bind(cardId, appkey, sid).first()

      if (card) {
        // カードを削除
        await db.prepare(`
          DELETE FROM flashcards 
          WHERE card_id = ? AND appkey = ? AND sid = ?
        `).bind(cardId, appkey, sid).run()

        deletedCount++

        // デッキカウントを追跡
        if (card.deck_id) {
          deckUpdates.set(card.deck_id, (deckUpdates.get(card.deck_id) || 0) + 1)
        }
      }
    }

    // デッキのカード数を一括更新
    for (const [deckId, count] of deckUpdates) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count - ?, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(count, deckId).run()
    }

    console.log(`✅ Deleted ${deletedCount} flashcards in batch`)

    return c.json({ 
      success: true, 
      deletedCount: deletedCount 
    })

  } catch (error) {
    console.error('❌ Flashcard batch delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード統計情報API
router.post('/stats', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    // 総カード数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ?
    `).bind(appkey, sid).first()

    // 復習待ちのカード数（next_review_at が現在時刻より前のもの）
    const reviewDueResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ? 
      AND next_review_at IS NOT NULL 
      AND next_review_at <= datetime('now')
    `).bind(appkey, sid).first()

    // 習得済みカード数（mastery_level >= 5）
    const masteredResult = await db.prepare(`
      SELECT COUNT(*) as count FROM flashcards 
      WHERE appkey = ? AND sid = ? 
      AND mastery_level >= 5
    `).bind(appkey, sid).first()

    return c.json({
      success: true,
      stats: {
        total: totalResult?.count || 0,
        reviewDue: reviewDueResult?.count || 0,
        mastered: masteredResult?.count || 0
      }
    })

  } catch (error) {
    console.error('❌ Flashcard stats error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// デッキ作成
router.post('/deck/create', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, deckName, description } = await c.req.json()

    if (!appkey || !sid || !deckName) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const deckId = `deck_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    await db.prepare(`
      INSERT INTO flashcard_decks (deck_id, appkey, sid, deck_name, description)
      VALUES (?, ?, ?, ?, ?)
    `).bind(deckId, appkey, sid, deckName, description || '').run()

    console.log(`✅ Created flashcard deck: ${deckId}`)

    return c.json({
      success: true,
      deckId,
      deckName
    })

  } catch (error) {
    console.error('❌ Deck create error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// デッキ一覧取得
router.post('/deck/list', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid } = await c.req.json()

    if (!appkey || !sid) {
      return c.json({ success: false, error: 'Missing appkey or sid' }, 400)
    }

    const result = await db.prepare(`
      SELECT * FROM flashcard_decks 
      WHERE appkey = ? AND sid = ?
      ORDER BY created_at DESC
    `).bind(appkey, sid).all()

    return c.json({
      success: true,
      decks: result.results || [],
      count: result.results?.length || 0
    })

  } catch (error) {
    console.error('❌ Deck list error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// フラッシュカード削除
router.post('/delete', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId } = await c.req.json()

    if (!appkey || !sid || !cardId) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    // カードの存在確認
    const card = await db.prepare(`
      SELECT * FROM flashcards 
      WHERE card_id = ? AND appkey = ? AND sid = ?
    `).bind(cardId, appkey, sid).first()

    if (!card) {
      return c.json({ success: false, error: 'Card not found' }, 404)
    }

    // カードを削除
    await db.prepare(`
      DELETE FROM flashcards 
      WHERE card_id = ? AND appkey = ? AND sid = ?
    `).bind(cardId, appkey, sid).run()

    // デッキのカード数を更新
    if (card.deck_id) {
      await db.prepare(`
        UPDATE flashcard_decks 
        SET card_count = card_count - 1, updated_at = CURRENT_TIMESTAMP
        WHERE deck_id = ?
      `).bind(card.deck_id).run()
    }

    console.log(`✅ Deleted flashcard: ${cardId}`)

    return c.json({ success: true })

  } catch (error) {
    console.error('❌ Flashcard delete error:', error)
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500)
  }
})

// 学習履歴の記録
router.post('/record-study', async (c) => {
  try {
    const db = c.env?.DB
    if (!db) {
      return c.json({ success: false, error: 'Database not available' }, 500)
    }

    const { appkey, sid, cardId, isCorrect, responseTimeMs, difficultyRating } = await c.req.json()

    if (!appkey || !sid || !cardId || isCorrect === undefined) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    const historyId = `history_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

    // 学習履歴を記録
    await db.prepare(`
      INSERT INTO flashcard_study_history (
        history_id, card_id, appkey, sid, is_correct, response_time_ms, difficulty_rating
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      historyId,
      cardId,
      appkey,
      sid,
      isCorrect ? 1 : 0,
      responseTimeMs || null,
      difficultyRating || null
    ).run()

    // カードの統計を更新
    const card = await db.prepare(`
      SELECT review_count, correct_count, mastery_level FROM flashcards
      WHERE card_id = ?
    `).bind(cardId).first()

    if (card) {
      const newReviewCount = (card.review_count || 0) + 1
      const newCorrectCount = (card.correct_count || 0) + (isCorrect ? 1 : 0)
      const correctRate = newCorrectCount / newReviewCount
      
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
router.post('/category/list', async (c) => {
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
router.post('/category/create', async (c) => {
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
router.post('/category/update', async (c) => {
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
router.post('/category/delete', async (c) => {
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
router.post('/tag/list', async (c) => {
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
router.post('/tag/create', async (c) => {
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
router.post('/tag/delete', async (c) => {
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
router.post('/card/add-tags', async (c) => {
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
router.post('/card/set-category', async (c) => {
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

export default router
