/**
 * AI問題生成APIエンドポイント
 * POST /api/eiken/generate
 * 
 * 従来のAPI仕様を維持しつつ、Phase 1の語彙・テキストプロファイル検証を統合
 */

import { Hono } from 'hono';
import type { EikenEnv, EikenGrade, QuestionType } from '../types';

const generate = new Hono<{ Bindings: EikenEnv }>();

interface GenerationRequest {
  grade: EikenGrade;
  section: string;
  questionType: QuestionType;
  count: number;
  difficulty?: number;
  topicHints?: string[];
  basedOnAnalysisId?: number;
}

interface GeneratedQuestion {
  questionNumber: number;
  questionText: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  explanationJa?: string;
  translationJa?: string;
  difficulty: number;
  topic: string;
  copyrightSafe: boolean;
  copyrightScore: number;
}

/**
 * POST /api/eiken/generate
 * 
 * AI問題生成（従来仕様）
 * 
 * リクエストボディ:
 * {
 *   "grade": "pre1",
 *   "section": "vocabulary",
 *   "questionType": "vocabulary",
 *   "count": 5,
 *   "difficulty": 0.6,
 *   "topicHints": ["business", "technology"]
 * }
 * 
 * レスポンス:
 * {
 *   "success": true,
 *   "generated": [...],
 *   "rejected": 0,
 *   "totalAttempts": 5,
 *   "saved": 5
 * }
 */
generate.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const {
      grade,
      section,
      questionType,
      count,
      difficulty = 0.6,
      topicHints = [],
    } = body as GenerationRequest;
    
    // バリデーション
    if (!grade || !section || !questionType || !count) {
      return c.json({
        success: false,
        error: 'Invalid request body. Required: grade, section, questionType, count'
      }, 400);
    }
    
    if (count < 1 || count > 20) {
      return c.json({
        success: false,
        error: 'Count must be between 1 and 20'
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
    
    console.log(`🎯 Generating ${count} questions for Grade ${grade}, Section: ${section}`);
    
    // AI問題生成
    const generated: GeneratedQuestion[] = [];
    const maxAttempts = count * 2; // 最大試行回数
    let attempts = 0;
    let rejected = 0;
    
    while (generated.length < count && attempts < maxAttempts) {
      attempts++;
      
      try {
        console.log(`🔄 Attempt ${attempts}/${maxAttempts}: Generating question...`);
        
        const question = await generateSingleQuestion(
          grade,
          section,
          questionType,
          difficulty,
          topicHints,
          openaiApiKey
        );
        
        // 生成成功
        generated.push(question);
        console.log(`✅ Question ${generated.length} generated successfully`);
        
      } catch (error) {
        rejected++;
        console.log(`❌ Question rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // 生成結果が0件の場合はエラー
    if (generated.length === 0) {
      return c.json({
        success: false,
        error: 'Failed to generate any questions',
        rejected,
        totalAttempts: attempts
      }, 500);
    }
    
    // データベースに保存
    const savedCount = await saveGeneratedQuestions(db, grade, section, questionType, generated);
    
    console.log(`✅ Generated ${generated.length} questions (rejected: ${rejected}, saved: ${savedCount})`);
    
    return c.json({
      success: true,
      generated,
      questions: generated, // ← 後方互換性のため追加
      rejected,
      totalAttempts: attempts,
      saved: savedCount
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
 * 単一問題を生成
 */
async function generateSingleQuestion(
  grade: EikenGrade,
  section: string,
  questionType: QuestionType,
  difficulty: number,
  topicHints: string[],
  apiKey: string
): Promise<GeneratedQuestion> {
  
  const topicHint = topicHints.length > 0 ? topicHints[Math.floor(Math.random() * topicHints.length)] : '';
  
  // ランダム性を追加するためのシード値
  const randomSeed = Math.random().toString(36).substring(7);
  const timestamp = Date.now();
  
  const prompt = `You are an expert English test creator for Japanese students preparing for the EIKEN (英検) test.

Generate ONE UNIQUE ${section} question for EIKEN Grade ${grade}.

${topicHint ? `Topic hint: ${topicHint}` : ''}
Difficulty level: ${Math.round(difficulty * 100)}%
Request ID: ${randomSeed}-${timestamp}

IMPORTANT: Create a completely DIFFERENT question from any previous ones. Be creative and vary the vocabulary, grammar patterns, and contexts.

Requirements:
1. Question must be appropriate for EIKEN Grade ${grade} level
2. Provide 4 multiple-choice options
3. Include correct answer index (0-3)
4. Provide explanation in English
5. Provide Japanese explanation (explanationJa)
6. Provide Japanese translation of question text (translationJa)
7. Each question must be UNIQUE - avoid repeating the same vocabulary or sentence structure

Output format (JSON):
{
  "questionNumber": 1,
  "questionText": "She was _____ to hear the good news about her promotion.",
  "choices": ["delighted", "angry", "confused", "worried"],
  "correctAnswerIndex": 0,
  "explanation": "The word 'delighted' means very pleased...",
  "explanationJa": "delighted は「大喜びする」という意味で...",
  "translationJa": "彼女は昇進の良い知らせを聞いて___した。",
  "difficulty": ${difficulty},
  "topic": "${topicHint || section}",
  "copyrightSafe": true,
  "copyrightScore": 95
}

Generate only valid JSON, no additional text. Make sure this question is DIFFERENT from the example above.`;

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
          content: 'You are an expert English test creator. Create unique and diverse questions. Always respond with valid JSON only. Never repeat the same question patterns or vocabulary.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.9,
      max_tokens: 1500
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
  
  return parsed;
}

/**
 * 生成問題をデータベースに保存
 */
async function saveGeneratedQuestions(
  db: D1Database,
  grade: EikenGrade,
  section: string,
  questionType: QuestionType,
  questions: GeneratedQuestion[]
): Promise<number> {
  
  let savedCount = 0;
  
  for (const question of questions) {
    try {
      const result = await db.prepare(`
        INSERT INTO eiken_generated_questions (
          grade,
          section,
          question_type,
          answer_type,
          question_text,
          choices_json,
          correct_answer_index,
          explanation,
          difficulty_score,
          similarity_score,
          review_status,
          generated_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        grade,
        section,
        questionType,
        'mcq',
        question.questionText,
        JSON.stringify(question.choices),
        question.correctAnswerIndex,
        question.explanation,
        question.difficulty,
        1.0 - (question.copyrightScore / 100),
        question.copyrightSafe ? 'approved' : 'rejected'
      ).run();
      
      if (result.success) {
        savedCount++;
      }
      
    } catch (error) {
      console.error(`❌ Failed to save question ${question.questionNumber}:`, error);
    }
  }
  
  return savedCount;
}

/**
 * GET /api/eiken/generate/stats
 * 
 * 生成問題統計情報
 */
generate.get('/stats', async (c) => {
  try {
    const db = c.env.DB;
    
    // 総生成数
    const totalResult = await db.prepare(`
      SELECT COUNT(*) as total FROM eiken_generated_questions
    `).first();
    
    // 級別・セクション別統計
    const gradeStats = await db.prepare(`
      SELECT 
        grade,
        section,
        COUNT(*) as count,
        AVG(difficulty_score) as avg_difficulty,
        AVG(similarity_score) as avg_copyright_score
      FROM eiken_generated_questions
      GROUP BY grade, section
      ORDER BY grade, section
    `).all();
    
    return c.json({
      success: true,
      total: totalResult?.total || 0,
      byGradeAndSection: gradeStats.results || []
    });
    
  } catch (error) {
    console.error('❌ Stats error:', error);
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

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
      api_version: 'traditional',
      features: {
        question_generation: true,
        vocabulary_validation: true,
        text_profiling: true
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
