/**
 * KOBEYA Study Partner - Login Handler
 * ログイン処理
 */

import type { Context } from 'hono'
import { studentDatabase } from '../config/students'

/**
 * 有効なAPP_KEYのリスト
 */
const VALID_APP_KEYS = ['KOBEYA2024', '180418']

/**
 * ログインAPIハンドラー
 * POST /api/login
 */
export async function handleLogin(c: Context) {
  try {
    const { appkey, sid } = await c.req.json()
    console.log('🔑 Login attempt:', { appkey, sid })
    
    // APP_KEYの検証
    if (!VALID_APP_KEYS.includes(appkey)) {
      return c.json({ 
        success: false, 
        message: 'APP_KEYが正しくありません' 
      }, 401)
    }
    
    // 生徒情報の取得
    const studentInfo = studentDatabase[sid]
    if (!studentInfo) {
      return c.json({ 
        success: false, 
        message: '生徒IDが見つかりません' 
      }, 404)
    }
    
    // ログイン時刻を更新
    studentInfo.lastLogin = new Date().toISOString()
    
    // 成功レスポンス
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
    return c.json({ 
      success: false, 
      message: 'ログイン処理でエラーが発生しました' 
    }, 500)
  }
}
