/**
 * KOBEYA Study Partner - Session Management
 * セッション管理ユーティリティ
 */

import type { LearningSession } from '../types'

/**
 * インメモリセッションストア
 * 高速アクセスのため、まずメモリをチェック
 */
export const learningSessions = new Map<string, any>()

/**
 * セッションIDを生成する
 * 
 * @returns ユニークなセッションID
 */
export function generateSessionId(): string {
  const timestamp = Date.now()
  const random = Math.random().toString(36).substr(2, 9)
  return `session_${timestamp}_${random}`
}

/**
 * セッションをメモリに保存する
 * 
 * @param sessionId - セッションID
 * @param session - セッションデータ
 */
export function saveSessionToMemory(sessionId: string, session: any): void {
  learningSessions.set(sessionId, session)
  console.log('💾 Session saved to memory:', sessionId)
}

/**
 * セッションをメモリから取得する
 * 
 * @param sessionId - セッションID
 * @returns セッションデータ、または null
 */
export function getSessionFromMemory(sessionId: string): any | null {
  const session = learningSessions.get(sessionId)
  if (session) {
    console.log('📦 Session found in memory:', sessionId)
    return session
  }
  return null
}

/**
 * セッションをメモリから削除する
 * 
 * @param sessionId - セッションID
 * @returns 削除に成功した場合true
 */
export function deleteSessionFromMemory(sessionId: string): boolean {
  const result = learningSessions.delete(sessionId)
  if (result) {
    console.log('🗑️ Session deleted from memory:', sessionId)
  }
  return result
}

/**
 * すべてのセッションIDを取得する（デバッグ用）
 * 
 * @returns セッションIDの配列
 */
export function getAllSessionIds(): string[] {
  return Array.from(learningSessions.keys())
}

/**
 * メモリ内のセッション数を取得する
 * 
 * @returns セッション数
 */
export function getSessionCount(): number {
  return learningSessions.size
}
