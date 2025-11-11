/**
 * AI問題生成APIエンドポイント (Phase 1: Passage-based generation)
 * POST /api/eiken/generate
 */

import { Hono } from 'hono';
import type { EikenEnv, EikenGrade } from '../types';
import { analyzeVocabularyLevel } from '../services/vocabulary-analyzer';
import { analyzeTextProfile } from '../services/text-profiler';

const generate = new Hono<{ Bindings: EikenEnv }>();

interface PassageGenerationRequest {
  grade: EikenGrade;
  passage: string;
  question_count: number;
}

/**
 * POST /api/eiken/generate
 * 
 * Passage-based問題生成（Phase 1実装）
 * 
 * リクエストボディ:
 * {
 *   "grade": "5",
 *   "passage": "Tom is a student. He goes to school every day.",
 *   "question_count": 1
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "questions": [
 *     {
 *       "question": "What does Tom do every day?",
 *       "options": {
 *         "A": "He plays soccer.",
 *         "B": "He goes to school.",
 *         "C": "He reads books.",
 *         "D": "He watches TV."
 *       },
 *       "correct_answer": "B"
 *     }
 *   ],
 *   "metadata": {
 *     "generated_count": 1,
 *     "rejected_count": 0,
 *     "text_profile": {
 *       "cefrj_level": "A1.1",
 *       "numeric_score": 1.23
 *     }
 *   }
 * }
 */
generate.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      grade,
      passage,
      question_count
    } = body as PassageGenerationRequest;
    
    // バリデーション
    if (!grade || !passage || !question_count) {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: grade, passage, question_count'
      }, 400);
    }
    
    if (question_count < 1 || question_count > 10) {
      return c.json({
        success: false,
        error: 'question_count must be between 1 and 10'
      }, 400);
    }
    
    // 環境変数チェック
    const openaiApiKey = c.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      return c.json({
        success: false,
        error: 'OpenAI API key not configured'
      }, 500);
    }
    
    const db = c.env.DB;
    if (!db) {
      return c.json({
        success: false,
        error: 'Database not configured'
      }, 500);
    }
    
    console.log(`🎯 Generating ${question_count} questions for Grade ${grade}`);
    console.log(`📄 Passage length: ${passage.length} characters`);
    
    // Phase 1 Validation: Vocabulary Level Check
    console.log('📚 Step 1: Checking vocabulary level...');
    const vocabResult = await analyzeVocabularyLevel(passage, grade, c.env);
    
    if (!vocabResult.isValid) {
      return c.json({
        success: false,
        error: 'Passage contains vocabulary that is too advanced for the target grade',
        details: {
          vocabulary_check: vocabResult,
          suggestions: vocabResult.suggestions
        }
      }, 400);
    }
    
    console.log(`✅ Vocabulary check passed: ${vocabResult.validPercentage.toFixed(1)}% appropriate`);
    
    // Phase 1 Validation: Text Profile Check (CVLA3)
    console.log('📊 Step 2: Analyzing text profile (simplified CVLA)...');
    const textProfile = await analyzeTextProfile(passage, grade, c.env);
    
    if (!textProfile.isValid) {
      return c.json({
        success: false,
        error: 'Text complexity is too high for the target grade',
        details: {
          text_profile: textProfile,
          suggestions: textProfile.suggestions
        }
      }, 400);
    }
    
    console.log(`✅ Text profile check passed: CEFR-J ${textProfile.cefrjLevel} (score: ${textProfile.numericScore.toFixed(2)})`);
    
    // Step 3: Generate questions using OpenAI
    console.log('🤖 Step 3: Generating questions with OpenAI GPT-4...');
    const questions = await generateQuestionsWithOpenAI(
      passage,
      grade,
      question_count,
      openaiApiKey
    );
    
    console.log(`✅ Generated ${questions.length} questions successfully`);
    
    return c.json({
      success: true,
      questions,
      metadata: {
        generated_count: questions.length,
        rejected_count: 0,
        vocabulary_check: {
          valid_percentage: vocabResult.validPercentage,
          total_words: vocabResult.totalWords,
          valid_words: vocabResult.validWords
        },
        text_profile: {
          cefrj_level: textProfile.cefrjLevel,
          numeric_score: textProfile.numericScore,
          metrics: textProfile.metrics
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Generation error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

/**
 * OpenAI GPT-4を使って問題を生成
 */
async function generateQuestionsWithOpenAI(
  passage: string,
  grade: EikenGrade,
  count: number,
  apiKey: string
): Promise<any[]> {
  
  const prompt = `You are an expert English test creator for Japanese students preparing for the EIKEN (英検) test.

Generate ${count} multiple-choice reading comprehension question(s) based on the following passage.

Target Grade: ${grade}
Passage:
"""
${passage}
"""

Requirements:
1. Questions should be appropriate for EIKEN Grade ${grade} level
2. Each question must have 4 options (A, B, C, D)
3. Questions should test comprehension, not just vocabulary
4. Use simple, clear language appropriate for the grade level
5. Provide the correct answer

Output format (JSON):
{
  "questions": [
    {
      "question": "Question text here?",
      "options": {
        "A": "First option",
        "B": "Second option",
        "C": "Third option",
        "D": "Fourth option"
      },
      "correct_answer": "B"
    }
  ]
}

Generate exactly ${count} question(s). Return only valid JSON, no additional text.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: 'You are an expert English test creator. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  let content = data.choices[0].message.content;
  
  // Remove markdown code blocks if present
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  
  // JSONをパース
  const parsed = JSON.parse(content);
  
  return parsed.questions || [];
}

/**
 * GET /api/eiken/generate/health
 * 
 * Health check endpoint
 */
generate.get('/health', async (c) => {
  try {
    const db = c.env.DB;
    
    // Check if vocabulary table exists and has data
    const vocabCount = await db.prepare(`
      SELECT COUNT(*) as count FROM eiken_vocabulary_lexicon
    `).first();
    
    return c.json({
      success: true,
      status: 'healthy',
      database: 'connected',
      vocabulary_entries: vocabCount?.count || 0,
      features: {
        vocabulary_validation: true,
        text_profiling: true,
        cvla3_simplified: true
      }
    });
    
  } catch (error) {
    return c.json({
      success: false,
      status: 'unhealthy',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

export default generate;
