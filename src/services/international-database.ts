/**
 * KOBEYA Study Partner - International Student Database Service
 * D1データベース操作サービス（インター生用）
 */

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
  hasImage?: boolean
  imageData?: string
  timestamp?: string
}

export interface InternationalSession {
  sessionId: string
  studentName?: string
  currentTopic?: string
  lastQuestion?: string
  lastProblem?: string
  status: 'active' | 'completed'
  createdAt?: string
  updatedAt?: string
}

/**
 * セッションを取得または作成
 */
export async function getOrCreateInternationalSession(
  db: any,
  sessionId: string
): Promise<InternationalSession> {
  try {
    // 既存セッションを取得
    const existing = await db.prepare(`
      SELECT * FROM international_sessions WHERE session_id = ?
    `).bind(sessionId).first()
    
    if (existing) {
      return {
        sessionId: existing.session_id,
        studentName: existing.student_name,
        currentTopic: existing.current_topic,
        lastQuestion: existing.last_question,
        lastProblem: existing.last_problem,
        status: existing.status,
        createdAt: existing.created_at,
        updatedAt: existing.updated_at
      }
    }
    
    // 新規セッション作成
    await db.prepare(`
      INSERT INTO international_sessions (session_id, status, created_at, updated_at)
      VALUES (?, 'active', datetime('now'), datetime('now'))
    `).bind(sessionId).run()
    
    console.log('✅ Created new international session:', sessionId)
    
    return {
      sessionId,
      status: 'active'
    }
  } catch (error) {
    console.error('❌ Failed to get/create international session:', error)
    throw error
  }
}

/**
 * セッション情報を更新
 */
export async function updateInternationalSession(
  db: any,
  sessionId: string,
  updates: Partial<InternationalSession>
): Promise<void> {
  try {
    const fields: string[] = []
    const values: any[] = []
    
    if (updates.currentTopic !== undefined) {
      fields.push('current_topic = ?')
      values.push(updates.currentTopic)
    }
    if (updates.lastQuestion !== undefined) {
      fields.push('last_question = ?')
      values.push(updates.lastQuestion)
    }
    if (updates.lastProblem !== undefined) {
      fields.push('last_problem = ?')
      values.push(updates.lastProblem)
    }
    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    
    if (fields.length === 0) return
    
    fields.push("updated_at = datetime('now')")
    values.push(sessionId)
    
    await db.prepare(`
      UPDATE international_sessions 
      SET ${fields.join(', ')}
      WHERE session_id = ?
    `).bind(...values).run()
    
    console.log('✅ Updated international session:', sessionId)
  } catch (error) {
    console.error('❌ Failed to update international session:', error)
    throw error
  }
}

/**
 * 会話メッセージを保存
 */
export async function saveConversationMessage(
  db: any,
  sessionId: string,
  message: ConversationMessage
): Promise<void> {
  try {
    await db.prepare(`
      INSERT INTO international_conversations 
      (session_id, role, content, has_image, image_data, timestamp)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).bind(
      sessionId,
      message.role,
      message.content,
      message.hasImage ? 1 : 0,
      message.imageData || null
    ).run()
    
    console.log(`✅ Saved ${message.role} message to conversation:`, sessionId)
  } catch (error) {
    console.error('❌ Failed to save conversation message:', error)
    throw error
  }
}

/**
 * 会話履歴を取得（最新N件）
 */
export async function getConversationHistory(
  db: any,
  sessionId: string,
  limit: number = 10
): Promise<ConversationMessage[]> {
  try {
    const results = await db.prepare(`
      SELECT role, content, has_image, timestamp
      FROM international_conversations
      WHERE session_id = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `).bind(sessionId, limit).all()
    
    if (!results.results || results.results.length === 0) {
      return []
    }
    
    // 時系列順に並び替え（古い順）
    const messages: ConversationMessage[] = results.results.reverse().map((row: any) => ({
      role: row.role,
      content: row.content,
      hasImage: row.has_image === 1,
      timestamp: row.timestamp
    }))
    
    console.log(`✅ Retrieved ${messages.length} messages for session:`, sessionId)
    return messages
  } catch (error) {
    console.error('❌ Failed to get conversation history:', error)
    return []
  }
}

/**
 * セッションの最後の問題を取得
 */
export async function getLastProblemContext(
  db: any,
  sessionId: string
): Promise<string | null> {
  try {
    const session = await db.prepare(`
      SELECT last_problem, last_question FROM international_sessions WHERE session_id = ?
    `).bind(sessionId).first()
    
    if (!session) return null
    
    return session.last_problem || session.last_question || null
  } catch (error) {
    console.error('❌ Failed to get last problem context:', error)
    return null
  }
}

/**
 * 会話履歴をOpenAI APIフォーマットに変換
 */
export function formatHistoryForOpenAI(
  messages: ConversationMessage[],
  systemPrompt: string
): any[] {
  const formattedMessages: any[] = [
    {
      role: 'system',
      content: systemPrompt
    }
  ]
  
  // 会話履歴を追加
  for (const msg of messages) {
    if (msg.hasImage && msg.imageData) {
      // 画像付きメッセージ
      formattedMessages.push({
        role: msg.role,
        content: [
          {
            type: 'text',
            text: msg.content
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/jpeg;base64,${msg.imageData}`
            }
          }
        ]
      })
    } else {
      // テキストのみ
      formattedMessages.push({
        role: msg.role,
        content: msg.content
      })
    }
  }
  
  return formattedMessages
}
