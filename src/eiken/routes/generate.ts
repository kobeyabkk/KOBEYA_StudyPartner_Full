/**
 * AI問題生成APIエンドポイント
 * POST /api/eiken/generate
 * 
 * 従来のAPI仕様を維持しつつ、Phase 1の語彙・テキストプロファイル検証を統合
 */

import { Hono } from 'hono';
import type { EikenEnv, EikenGrade, QuestionType } from '../types';
import { AnswerDiversityManager } from '../services/answer-diversity-manager';
import { GrammarCategoryManager } from '../services/grammar-category-manager';

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
    
    // Phase 6.5: 正解分散マネージャーを初期化
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const diversityManager = new AnswerDiversityManager(db);
    await diversityManager.initializeSession(sessionId, grade);
    
    // Phase 6.7: 文法カテゴリー分散マネージャーを初期化
    const categoryManager = new GrammarCategoryManager(db);
    await categoryManager.initializeSession(sessionId, grade);
    
    // AI問題生成
    const generated: GeneratedQuestion[] = [];
    const maxAttempts = count * 4; // 最大試行回数（Phase 6.7でさらに増加）
    let attempts = 0;
    let rejected = 0;
    
    while (generated.length < count && attempts < maxAttempts) {
      attempts++;
      
      try {
        console.log(`🔄 Attempt ${attempts}/${maxAttempts}: Generating question...`);
        
        // Phase 6.5: 正解分散の指示をプロンプトに追加
        const diversityInstruction = diversityManager.getAnswerDiversityInstruction(sessionId);
        
        // Phase 6.7: 文法カテゴリー分散の指示を追加
        const categoryInstruction = categoryManager.getCategoryInstruction(sessionId);
        
        const question = await generateSingleQuestion(
          grade,
          section,
          questionType,
          difficulty,
          topicHints,
          openaiApiKey,
          c.env,
          diversityInstruction + categoryInstruction
        );
        
        // Phase 6.5: 正解選択肢が偏っていないかチェック
        const correctAnswer = question.choices[question.correctAnswerIndex];
        if (diversityManager.shouldAvoidAnswer(sessionId, correctAnswer)) {
          console.log(`⚠️ Answer diversity check failed for: "${correctAnswer}" - regenerating...`);
          rejected++;
          continue; // この問題をスキップして再生成
        }
        
        // Phase 6.7: 文法カテゴリーが偏っていないかチェック
        const detectedCategory = categoryManager.detectCategory(
          question.questionText,
          question.choices
        );
        console.log(`📝 Detected grammar category: "${detectedCategory}"`);
        
        if (categoryManager.shouldAvoidCategory(sessionId, detectedCategory)) {
          console.log(`⚠️ Grammar category diversity check failed for: "${detectedCategory}" - regenerating...`);
          rejected++;
          continue; // この問題をスキップして再生成
        }
        
        // Phase 6.5: 正解選択肢を記録
        await diversityManager.recordAnswer(sessionId, correctAnswer, grade);
        
        // Phase 6.7: 文法カテゴリーを記録
        await categoryManager.recordCategory(sessionId, detectedCategory, grade);
        
        // 生成成功
        generated.push(question);
        console.log(`✅ Question ${generated.length} generated successfully (answer: "${correctAnswer}", category: "${detectedCategory}")`);
        
      } catch (error) {
        rejected++;
        console.log(`❌ Question rejected: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // Phase 6.5: 正解分散の統計情報をログ出力
    const diversityStats = diversityManager.getStatistics(sessionId);
    if (diversityStats) {
      console.log(`📊 Answer diversity stats:`, diversityStats);
    }
    
    // Phase 6.7: 文法カテゴリー分散の統計情報をログ出力
    const categoryStats = categoryManager.getStatistics(sessionId);
    if (categoryStats) {
      console.log(`📚 Grammar category stats:`, categoryStats);
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
 * 単一問題を生成（語彙レベル検証付き）
 */
async function generateSingleQuestion(
  grade: EikenGrade,
  section: string,
  questionType: QuestionType,
  difficulty: number,
  topicHints: string[],
  apiKey: string,
  env?: EikenEnv,
  diversityInstruction?: string
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

${diversityInstruction || ''}

Requirements:
1. Question must be appropriate for EIKEN Grade ${grade} level
2. Provide 4 multiple-choice options
3. Include correct answer index (0-3)
4. Provide Japanese translation of question text (translationJa)
5. Each question must be UNIQUE - avoid repeating the same vocabulary or sentence structure

6. CRITICAL: Provide Japanese explanation (explanationJa) in 4-BLOCK TEACHER STYLE:

＜着眼点＞
[この問題で注目すべきポイントを1文で]

＜鉄則！＞または＜Point！＞
[文法ルールを学校で習う用語で説明（「〜の文」「〜を表す」など）]

＜当てはめ＞
[このルールを問題文にどう適用するかを説明]

＜誤答の理由＞
[他の選択肢がなぜ間違いなのかを説明]

🚨 REQUIRED FORMAT for explanationJa (YOU MUST FOLLOW THIS):

Example 1 - Good explanationJa:
"＜着眼点＞
過去のことを聞く疑問文です。

＜鉄則！＞
過去のことを聞く疑問文では、文の最初に Did を使います。

＜当てはめ＞
'yesterday'（昨日）という言葉があるので、過去のことです。だから Did が正解です。

＜誤答の理由＞
Do と Does は現在の文で使います。Was は be動詞の過去形なので、一般動詞と一緒には使えません。"

Example 2 - Good explanationJa:
"＜着眼点＞
未来のことを表す文です。

＜鉄則！＞
未来のことを表すには will を使います。

＜当てはめ＞
'tomorrow'（明日）という言葉があるので、未来のことです。だから will が正解です。

＜誤答の理由＞
can は能力を表す言葉です。do は現在形、am は be動詞なので、未来を表す文では使えません。"

❌ BAD example (NEVER do this):
"この文は現在のことを聞いています。主語はIなので、動詞は現在形のlikeが正しいです。"
↑ This is TOO SHORT and missing the 4 blocks!

CRITICAL: Your JSON output MUST look EXACTLY like this:
{
  "questionNumber": 1,
  "questionText": "A: What did you do yesterday? B: I _____ soccer.",
  "choices": ["played", "play", "playing", "plays"],
  "correctAnswerIndex": 0,
  "explanation": "Use past tense 'played' because the question asks about yesterday.",
  "explanationJa": "＜着眼点＞\\n過去のことを答える文です。\\n\\n＜鉄則！＞\\n過去のことを表すには、動詞の過去形を使います。\\n\\n＜当てはめ＞\\n'yesterday'（昨日）のことなので、play の過去形 played が正解です。\\n\\n＜誤答の理由＞\\nplay は現在形、playing は進行形、plays は三人称単数現在形なので、過去の文では使えません。",
  "translationJa": "A: 昨日何をしましたか？ B: 私はサッカーを_____。",
  "difficulty": ${difficulty},
  "topic": "${topicHint || section}",
  "copyrightSafe": true,
  "copyrightScore": 95
}

🚨🚨🚨 MANDATORY SELF-CHECK BEFORE RESPONDING 🚨🚨🚨

Before you send your JSON response, verify these requirements:

1. ✓ Does explanationJa start with "＜着眼点＞"?
2. ✓ Does explanationJa contain "＜鉄則！＞"?
3. ✓ Does explanationJa contain "＜当てはめ＞"?
4. ✓ Does explanationJa contain "＜誤答の理由＞"?
5. ✓ Are there \\n\\n between each block?
6. ✓ Is explanationJa at least 100 characters long?

If ANY ✓ is missing, DO NOT RESPOND. Fix your explanationJa first!

❌ REJECT this response if explanationJa looks like:
"この文は現在のことを聞いています。主語はIなので、動詞は現在形のlikeが正しいです。"

✅ ACCEPT this response if explanationJa looks like:
"＜着眼点＞\\n現在の習慣を表す文です。\\n\\n＜鉄則！＞\\n現在の習慣には現在形の動詞を使います。\\n\\n＜当てはめ＞\\n'every day'（毎日）があるので、現在形のlikeが正解です。\\n\\n＜誤答の理由＞\\ndidは過去形、willは未来形、amはbe動詞なので使えません。"

Generate only valid JSON, no additional text.`;

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
          content: `You are a Japanese junior high school English teacher creating EIKEN test questions.

🚨🚨🚨 ABSOLUTE REQUIREMENT - NO EXCEPTIONS 🚨🚨🚨

The "explanationJa" field MUST ALWAYS contain ALL 4 BLOCKS:

＜着眼点＞
[何に注目すべきか]

＜鉄則！＞
[文法ルール]

＜当てはめ＞
[ルールの適用方法]

＜誤答の理由＞
[各誤答がなぜ間違いか]

❌ FORBIDDEN: One-sentence explanations like "この文は〜です。"
❌ FORBIDDEN: Missing ANY of the 4 blocks
❌ FORBIDDEN: Changing the block header names

✅ MANDATORY: Include "＜着眼点＞", "＜鉄則！＞", "＜当てはめ＞", "＜誤答の理由＞"
✅ MANDATORY: Use \\n\\n between each block
✅ MANDATORY: Follow the EXACT format shown in the user prompt examples

If you generate explanationJa without all 4 blocks, your response will be REJECTED.`
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.3,
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
  
  // Phase 6.8: 4ブロック形式のバリデーション
  if (parsed.explanationJa) {
    const has着眼点 = parsed.explanationJa.includes('＜着眼点＞');
    const has鉄則 = parsed.explanationJa.includes('＜鉄則！＞') || parsed.explanationJa.includes('＜Point！＞');
    const has当てはめ = parsed.explanationJa.includes('＜当てはめ＞');
    const has誤答 = parsed.explanationJa.includes('＜誤答の理由＞');
    
    if (!has着眼点 || !has鉄則 || !has当てはめ || !has誤答) {
      console.warn('⚠️ Generated explanation missing 4-block structure:', {
        has着眼点,
        has鉄則,
        has当てはめ,
        has誤答,
        explanation: parsed.explanationJa
      });
      throw new Error('Generated explanation does not follow 4-block format');
    }
  }
  
  // Phase 1: 語彙レベル検証（envがある場合のみ）
  if (env?.DB) {
    const { analyzeVocabularyLevel } = await import('../services/vocabulary-analyzer');
    const analysisResult = await analyzeVocabularyLevel(
      parsed.questionText,
      grade,
      env
    );
    
    // 3%ルールに違反している場合はリトライ
    if (!analysisResult.isValid) {
      console.log(`⚠️ Vocabulary validation failed: ${analysisResult.outOfRangeRatio * 100}% out of range`);
      console.log(`   Problematic words: ${analysisResult.outOfRangeWords.slice(0, 5).join(', ')}`);
      throw new Error(`Vocabulary level too difficult: ${analysisResult.outOfRangeRatio * 100}% out of range (max 3%)`);
    }
    
    console.log(`✅ Vocabulary validation passed: ${analysisResult.validPercentage.toFixed(1)}% valid words`);
  }
  
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
          translation_ja,
          explanation_ja,
          difficulty_score,
          similarity_score,
          review_status,
          generated_at,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
      `).bind(
        grade,
        section,
        questionType,
        'mcq',
        question.questionText,
        JSON.stringify(question.choices),
        question.correctAnswerIndex,
        question.explanation,
        question.translationJa || null,
        question.explanationJa || null,
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
