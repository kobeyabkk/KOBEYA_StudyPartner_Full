/**
 * KOBEYA Study Partner - Analyze Handler
 * 画像解析 + 段階学習開始ハンドラー
 */

import type { Context } from 'hono'
import { studentDatabase } from '../config/students'
import { generateSessionId, saveSessionToMemory } from '../utils/session'
import { fileToDataUrl, MAX_IMAGE_SIZE } from '../utils/base64'
import { analyzeImageWithOpenAI } from '../services/openai'
import { buildLearningDataFromAI } from '../utils/learning-builder'

// サポートされる画像形式
const SUPPORTED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

/**
 * 画像解析 + 段階学習開始 APIハンドラー
 * POST /api/analyze-and-learn
 */
export async function handleAnalyzeAndLearn(c: Context) {
  console.log('📸 Analyze and learn endpoint called')
  
  try {
    // フォームデータの取得
    const formData = await c.req.formData()
    const appkey = formData.get('appkey')?.toString() || '180418'
    const sid = formData.get('sid')?.toString() || 'JS2-04'
    const imageField = formData.get('image')
    const userMessage = formData.get('message')?.toString() || ''
    
    console.log('📸 Image analysis request:', { 
      appkey, 
      sid, 
      hasImage: !!imageField, 
      hasMessage: !!userMessage 
    })
    
    // 画像ファイルの検証
    if (!imageField || !(imageField instanceof File)) {
      throw new Error('画像ファイルが必要です')
    }
    
    // 画像形式のチェック
    if (!SUPPORTED_IMAGE_TYPES.includes(imageField.type)) {
      console.warn('⚠️ Unsupported image type:', imageField.type)
      return c.json({
        ok: false,
        error: 'unsupported_image_type',
        message: `サポートされていない画像形式です: ${imageField.type}。JPEG、PNG、WebP形式の画像をご使用ください。`
      }, 400)
    }
    
    // セッションIDの生成
    const sessionId = generateSessionId()
    
    // 生徒情報の取得
    const studentInfo = studentDatabase[sid]
    console.log('👨‍🎓 Student info:', studentInfo ? `${studentInfo.name} (中学${studentInfo.grade}年)` : 'Not found')
    
    // OpenAI API Key の確認
    const apiKey = c.env?.OPENAI_API_KEY ? String(c.env.OPENAI_API_KEY).trim() : null
    console.log('🔑 API Key check:', apiKey ? 'Present (length: ' + apiKey.length + ')' : 'Missing')
    
    if (!apiKey) {
      console.error('❌ OPENAI_API_KEY not found')
      return c.json({
        ok: false,
        error: 'api_key_missing',
        message: 'OpenAI API Keyが設定されていません。管理者にお問い合わせください。'
      }, 500)
    }
    
    // 画像をBase64に変換
    let dataUrl: string
    try {
      const arrayBuffer = await imageField.arrayBuffer()
      const uint8Array = new Uint8Array(arrayBuffer)
      
      // サイズチェック
      if (uint8Array.length > MAX_IMAGE_SIZE) {
        console.error('❌ Image too large:', uint8Array.length, 'bytes')
        return c.json({
          ok: false,
          error: 'image_too_large',
          message: `画像サイズが大きすぎます。${MAX_IMAGE_SIZE / 1000000}MB以下の画像をご使用ください。`
        }, 400)
      }
      
      // Base64変換
      let binary = ''
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i])
      }
      const base64Image = btoa(binary)
      dataUrl = `data:${imageField.type};base64,${base64Image}`
      
      console.log('✅ Image converted to base64, size:', base64Image.length, 'chars')
    } catch (base64Error) {
      console.error('❌ Base64 encoding failed:', base64Error)
      return c.json({
        ok: false,
        error: 'base64_encoding_failed',
        message: '画像の処理に失敗しました。別の画像をお試しください。'
      }, 500)
    }
    
    // OpenAI Vision APIで画像を分析
    try {
      const aiAnalysis = await analyzeImageWithOpenAI(
        apiKey,
        dataUrl,
        userMessage,
        studentInfo
      )
      
      // AI分析結果から学習データを構築
      const learningData = buildLearningDataFromAI(aiAnalysis)
      
      // 学習セッションを作成
      const learningSession = {
        sessionId,
        appkey,
        sid,
        problemType: aiAnalysis.problemType || 'custom',
        analysis: learningData.analysis,
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: 0,
        status: 'learning',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        originalImageData: dataUrl,
        originalUserMessage: userMessage || ''
      }
      
      // メモリに保存
      saveSessionToMemory(sessionId, learningSession)
      
      // D1に保存（非同期、エラーは無視）
      const db = c.env?.DB
      if (db) {
        try {
          // D1保存関数は index.tsx に残っているため、ここでは呼び出せない
          // 後で services/database.ts に移動する予定
          console.log('⏭️ D1 save skipped in handler (will be implemented in database service)')
        } catch (dbError) {
          console.error('⚠️ D1 save error (non-critical):', dbError)
        }
      }
      
      console.log('✅ AI analysis completed successfully')
      
      // 成功レスポンス
      return c.json({
        ok: true,
        sessionId,
        analysis: learningData.analysis,
        subject: aiAnalysis.subject || '学習',
        grade: aiAnalysis.grade || (studentInfo ? studentInfo.grade : 2),
        difficulty: aiAnalysis.difficulty || 'standard',
        steps: learningData.steps,
        confirmationProblem: learningData.confirmationProblem,
        similarProblems: learningData.similarProblems,
        currentStep: learningSession.steps[0],
        totalSteps: learningSession.steps.length,
        status: 'learning',
        message: 'AI解析完了 - 段階学習を開始します'
      })
      
    } catch (aiError: any) {
      console.error('❌ OpenAI API呼び出しエラー:', aiError)
      
      // エラーメッセージを返す（フォールバックは使用しない）
      return c.json({
        ok: false,
        error: 'ai_analysis_failed',
        message: aiError.message || 'AI分析でエラーが発生しました。画像を確認して再度お試しください。',
        timestamp: new Date().toISOString()
      }, 500)
    }
    
  } catch (error: any) {
    console.error('❌ Analyze and learn error:', error)
    return c.json({
      ok: false,
      error: 'analyze_error',
      message: error.message || 'AI解析でエラーが発生しました',
      timestamp: new Date().toISOString()
    }, 500)
  }
}
