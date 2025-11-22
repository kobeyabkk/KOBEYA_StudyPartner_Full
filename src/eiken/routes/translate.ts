/**
 * 翻訳APIエンドポイント
 * POST /api/eiken/translate
 */

import { Hono } from 'hono';
import type { EikenEnv } from '../types';

const translate = new Hono<{ Bindings: EikenEnv }>();

/**
 * POST /api/eiken/translate
 * 
 * 英文を日本語に翻訳
 * 
 * リクエストボディ:
 * {
 *   "text": "English text to translate..."
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "translation": "翻訳されたテキスト..."
 * }
 */
translate.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const { text } = body;
    
    // バリデーション
    if (!text || typeof text !== 'string') {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: text (string)'
      }, 400);
    }

    const openaiApiKey = c.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY is not set');
      return c.json({
        success: false,
        error: 'OpenAI API key is not configured'
      }, 500);
    }

    console.log(`🌍 Translating text (${text.length} characters)...`);

    // OpenAI APIで翻訳
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a professional translator. Translate the given English text to natural Japanese. Preserve the original meaning and tone. Output ONLY the Japanese translation, without any explanations or additional text.'
          },
          {
            role: 'user',
            content: text
          }
        ],
        temperature: 0.3,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ OpenAI API error:', response.status, errorText);
      return c.json({
        success: false,
        error: 'Translation failed'
      }, 500);
    }

    const data = await response.json();
    const translation = data.choices?.[0]?.message?.content?.trim() || '';

    console.log(`✅ Translation completed (${translation.length} characters)`);

    return c.json({
      success: true,
      translation,
    });

  } catch (error) {
    console.error('💥 Translation error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default translate;
