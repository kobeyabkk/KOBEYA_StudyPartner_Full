/**
 * AI問題生成サービス
 * OpenAI GPT-4oを使用して英検問題を生成
 */

import type { EikenGrade, QuestionType, GenerationMode, QuestionFormat } from '../types';
import { validateGeneratedQuestion } from './copyright-validator';
import type { EikenEnv } from '../types';
import { analyzeVocabularyLevel } from './vocabulary-analyzer';
import { analyzeTextProfile } from './text-profiler';
import { selectModel, getModelSelectionReason } from '../utils/model-selector';

export interface QuestionGenerationRequest {
  grade: EikenGrade;
  section: string;
  questionType: QuestionType;
  count: number;
  difficulty?: number;        // 0.0-1.0
  topicHints?: string[];
  basedOnAnalysisId?: number; // 分析結果IDを元に生成
  mode?: GenerationMode;      // 'production' | 'practice' (デフォルト: 'production')
  format?: QuestionFormat;    // 問題形式（モデル選択に使用）
}

export interface GeneratedQuestion {
  questionNumber: number;
  questionText: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  explanationJa?: string;      // 日本語解説
  translationJa?: string;       // 問題文の日本語訳
  difficulty: number;
  topic: string;
  copyrightSafe: boolean;
  copyrightScore: number;
}

export interface QuestionGenerationResult {
  success: boolean;
  generated: GeneratedQuestion[];
  rejected: number;
  totalAttempts: number;
  errors: string[];
}

/**
 * 英検問題を生成（著作権チェック付き）
 */
export async function generateQuestions(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<QuestionGenerationResult> {
  
  const generated: GeneratedQuestion[] = [];
  const errors: string[] = [];
  let rejected = 0;
  let totalAttempts = 0;
  
  const openaiApiKey = env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    return {
      success: false,
      generated: [],
      rejected: 0,
      totalAttempts: 0,
      errors: ['OpenAI API key not configured']
    };
  }
  
  console.log(`🎯 Generating ${request.count} questions for Grade ${request.grade}`);
  
  // 分析データを取得（basedOnAnalysisIdが指定されている場合）
  let analysisContext = null;
  if (request.basedOnAnalysisId) {
    analysisContext = await fetchAnalysisContext(env.DB, request.basedOnAnalysisId);
  }
  
  // 最大試行回数（著作権違反で却下される可能性を考慮）
  const maxAttempts = request.count * 3;
  
  while (generated.length < request.count && totalAttempts < maxAttempts) {
    totalAttempts++;
    
    try {
      console.log(`🔄 Attempt ${totalAttempts}: Generating question...`);
      
      // 1. OpenAI APIで問題生成
      const question = await generateSingleQuestion(
        request,
        analysisContext,
        openaiApiKey
      );
      
      // 2. 著作権検証
      console.log('🔍 Validating copyright safety...');
      const validation = await validateGeneratedQuestion(
        {
          generatedQuestion: question.questionText,
          generatedChoices: question.choices,
          grade: request.grade,
          section: request.section
        },
        env
      );
      
      // 著作権チェックで却下された場合はスキップ
      if (validation.recommendation === 'reject') {
        rejected++;
        console.log(`❌ Question rejected (${validation.violations.length} copyright violations)`);
        continue;
      }
      
      // 3. 語彙レベル検証（Phase 1 PoC）
      console.log('📚 Validating vocabulary level...');
      const combinedText = `${question.questionText} ${question.choices.join(' ')}`;
      const vocabAnalysis = await analyzeVocabularyLevel(
        combinedText,
        request.grade,
        env
      );
      
      // 語彙レベルチェックで不合格の場合はスキップ
      if (!vocabAnalysis.isValid) {
        rejected++;
        console.log(`❌ Question rejected (vocabulary out of range: ${(vocabAnalysis.outOfRangeRatio * 100).toFixed(1)}%)`);
        if (vocabAnalysis.suggestion) {
          console.log(`   Suggestion: ${vocabAnalysis.suggestion}`);
        }
        continue;
      }
      
      console.log(`✅ Vocabulary check passed (${(vocabAnalysis.outOfRangeRatio * 100).toFixed(1)}% out of range)`);
      
      // 4. テキストプロファイル検証（Phase 1 改善版: 簡易CVLA）
      console.log('📊 Analyzing text profile (simplified CVLA)...');
      const textProfile = await analyzeTextProfile(
        combinedText,
        request.grade,
        env
      );
      
      // テキスト全体のレベルが高すぎる場合は却下
      if (!textProfile.isValid) {
        rejected++;
        console.log(`❌ Question rejected (text level too high: ${textProfile.cefrjLevel}, score: ${textProfile.numericScore.toFixed(2)})`);
        if (textProfile.suggestions) {
          console.log(`   Suggestion: ${textProfile.suggestions}`);
        }
        continue;
      }
      
      console.log(`✅ Text profile check passed (CEFR-J: ${textProfile.cefrjLevel}, score: ${textProfile.numericScore.toFixed(2)})`);
      
      // 4. 検証結果に基づいて承認・却下判定
      if (validation.recommendation === 'approve') {
        console.log(`✅ Question approved (copyright score: ${validation.overallScore})`);
        generated.push({
          ...question,
          questionNumber: generated.length + 1,
          copyrightSafe: true,
          copyrightScore: validation.overallScore
        });
      } else if (validation.recommendation === 'review') {
        console.log(`⚠️ Question needs review (copyright score: ${validation.overallScore})`);
        // スコアが比較的高ければ採用
        if (validation.overallScore >= 70) {
          generated.push({
            ...question,
            questionNumber: generated.length + 1,
            copyrightSafe: true,
            copyrightScore: validation.overallScore
          });
        } else {
          rejected++;
          console.log(`❌ Question rejected (low copyright score)`);
        }
      }
      
      // レート制限対策
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error('❌ Question generation error:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
    }
  }
  
  console.log(`✅ Generation complete: ${generated.length}/${request.count} questions`);
  console.log(`📊 Stats: ${rejected} rejected, ${totalAttempts} total attempts`);
  
  return {
    success: generated.length > 0,
    generated,
    rejected,
    totalAttempts,
    errors
  };
}

/**
 * 単一問題を生成
 */
async function generateSingleQuestion(
  request: QuestionGenerationRequest,
  analysisContext: any,
  openaiApiKey: string
): Promise<Omit<GeneratedQuestion, 'questionNumber' | 'copyrightSafe' | 'copyrightScore'>> {
  
  const systemPrompt = buildSystemPrompt(request, analysisContext);
  const userPrompt = buildUserPrompt(request);
  
  // モデル選択ロジック（ハイブリッド戦略）
  const mode = request.mode || 'production';
  const format = request.format || 'grammar_fill'; // デフォルトは文法問題
  const selectedModel = selectModel({ grade: request.grade, format, mode });
  
  // ログ出力（デバッグ用）
  const reason = getModelSelectionReason({ grade: request.grade, format, mode });
  console.log(`[Model Selection] ${selectedModel} - ${reason}`);
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${openaiApiKey}`
    },
    body: JSON.stringify({
      model: selectedModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.8, // 創造性重視
      max_tokens: 1000
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
  }
  
  const data = await response.json();
  const generated = JSON.parse(data.choices[0].message.content);
  
  // 🎲 選択肢をシャッフルして正解位置をランダム化
  const { shuffledChoices, newCorrectIndex } = shuffleChoices(
    generated.choices,
    generated.correct_answer_index
  );
  
  return {
    questionText: generated.question_text,
    choices: shuffledChoices,
    correctAnswerIndex: newCorrectIndex,
    explanation: generated.explanation,
    explanationJa: generated.explanation_ja,
    translationJa: generated.translation_ja,
    difficulty: generated.difficulty || request.difficulty || 0.5,
    topic: generated.topic || 'general'
  };
}

/**
 * 選択肢をシャッフルして正解位置をランダム化
 */
function shuffleChoices(
  choices: string[],
  correctIndex: number
): { shuffledChoices: string[]; newCorrectIndex: number } {
  const correctAnswer = choices[correctIndex];
  
  // Fisher-Yatesアルゴリズムでシャッフル
  const shuffled = [...choices];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  // 正解の新しい位置を見つける
  const newCorrectIndex = shuffled.indexOf(correctAnswer);
  
  return {
    shuffledChoices: shuffled,
    newCorrectIndex
  };
}

/**
 * システムプロンプト構築
 */
function buildSystemPrompt(
  request: QuestionGenerationRequest,
  analysisContext: any
): string {
  
  const gradeLevel = {
    '5': 'Grade 5 (初級)',
    '4': 'Grade 4 (初級-中級)',
    '3': 'Grade 3 (中級)',
    'pre2': 'Pre-2 (中級-上級)',
    '2': 'Grade 2 (上級)',
    'pre1': 'Pre-1 (準1級)',
    '1': 'Grade 1 (1級)'
  }[request.grade] || 'Unknown';
  
  let contextInfo = '';
  if (analysisContext) {
    contextInfo = `
Reference Analysis:
- Grammar patterns: ${analysisContext.grammar_patterns?.join(', ') || 'N/A'}
- Vocabulary level: ${analysisContext.vocabulary_level || 'N/A'}
- Sentence structure: ${analysisContext.sentence_structure || 'N/A'}
- Difficulty: ${analysisContext.difficulty_score || 0.5}
`;
  }
  
  const sectionGuidance = request.section === 'grammar'
    ? `
GRAMMAR QUESTION GUIDELINES:
- Focus on grammatical structure and form
- Test verb tenses, conditionals, voice, clauses, or other grammar points
- Ensure all choices are grammatically plausible but only one is correct
- The context should make the grammar point testable
- Avoid testing pure vocabulary knowledge`
    : request.section === 'vocabulary'
    ? `
VOCABULARY QUESTION GUIDELINES:
- Focus on word meaning and usage
- Test appropriate-level vocabulary
- Ensure context clearly indicates the needed word
- All choices should fit grammatically but only one fits contextually`
    : '';

  return `You are an expert Eiken (英検) test question creator.
Generate ORIGINAL questions for ${gradeLevel} that are:
1. Completely different from existing past exam questions
2. Appropriate for the target level
3. Educational and realistic
4. Free from copyright issues

${contextInfo}
${sectionGuidance}

IMPORTANT: Create questions with ORIGINAL content. Do not copy or closely imitate existing test materials.

Return JSON format:
{
  "question_text": "Complete sentence with ( ) blank",
  "choices": ["option1", "option2", "option3", "option4"],
  "correct_answer_index": 0-3,
  "explanation": "Why this answer is correct (in English)",
  "explanation_ja": "正解の理由を日本語で簡潔に説明",
  "translation_ja": "問題文の日本語訳",
  "difficulty": 0.0-1.0,
  "topic": "category name (e.g., 'present perfect', 'conditionals', 'passive voice')"
}`;
}

/**
 * 各級の文法トピック定義
 */
const grammarTopicsByGrade: Record<string, string[]> = {
  '5': [
    'present simple tense',
    'past simple tense', 
    'basic present continuous',
    'simple questions (who, what, where)',
    'basic prepositions (in, on, at)',
    'plural nouns'
  ],
  '4': [
    'present perfect tense',
    'future with will/going to',
    'comparatives and superlatives',
    'can/could/may for ability and permission',
    'there is/are',
    'countable vs uncountable nouns'
  ],
  '3': [
    'present perfect continuous',
    'past continuous tense',
    'conditional type 1 (if + present, will)',
    'modal verbs (should, must, have to)',
    'relative pronouns (who, which, that)',
    'infinitives and basic gerunds'
  ],
  'pre2': [
    'conditional type 2 (if + past, would)',
    'passive voice (present and past)',
    'relative clauses (defining and non-defining)',
    'reported speech (statements)',
    'gerunds vs infinitives',
    'past perfect tense'
  ],
  '2': [
    'conditional type 3 (if + past perfect, would have)',
    'all passive voice forms',
    'reported speech (questions and commands)',
    'causative verbs (have/get something done)',
    'wish and if only',
    'participle clauses'
  ],
  'pre1': [
    'mixed conditionals',
    'subjunctive mood (suggest, demand, insist)',
    'inversion for emphasis',
    'cleft sentences (it is...that, what...is)',
    'advanced passive forms (being done, having been done)',
    'emphatic structures'
  ],
  '1': [
    'advanced conditionals and hypotheticals',
    'ellipsis and substitution',
    'fronting and inversion',
    'complex participle constructions',
    'sophisticated reported structures',
    'advanced discourse markers'
  ]
};

/**
 * ユーザープロンプト構築
 */
function buildUserPrompt(request: QuestionGenerationRequest): string {
  
  const hints = request.topicHints?.length 
    ? `\nTopic hints: ${request.topicHints.join(', ')}` 
    : '';
  
  const difficultyDesc = request.difficulty 
    ? request.difficulty < 0.3 ? 'easy' :
      request.difficulty < 0.7 ? 'medium' : 'hard'
    : 'medium';
  
  // 文法問題用の特別なプロンプト
  if (request.section === 'grammar') {
    const grammarTopics = grammarTopicsByGrade[request.grade] || [];
    const topicList = grammarTopics.join(', ');
    
    return `Generate a GRAMMAR question for Eiken Grade ${request.grade}.

GRAMMAR FOCUS for this level:
${topicList}

Requirements:
- Create a fill-in-the-blank sentence with ( ) 
- Test ONE specific grammar point from the list above
- Provide 4 choices where only one is grammatically correct
- Make wrong answers plausible but clearly incorrect
- Use natural, real-world context
- Difficulty: ${difficultyDesc}${hints}

IMPORTANT: 
- Focus on GRAMMAR structure, not just vocabulary
- The sentence should test grammatical knowledge, not word meaning
- Ensure the context makes the grammar point clear

Example formats:
- "She ( ) to Tokyo three times this year." (present perfect)
- "If I ( ) more money, I would buy a new car." (conditional)
- "The book ( ) by many students." (passive voice)

Create an ORIGINAL question that tests grammar skills for this level.`;
  }
  
  // 語彙問題用のプロンプト（既存）
  return `Generate a ${request.questionType} question for Eiken Grade ${request.grade}.
Section: ${request.section}
Difficulty: ${difficultyDesc}${hints}

Create an ORIGINAL question that tests the appropriate skills for this level.
Ensure the question is completely unique and does not resemble existing test questions.`;
}

/**
 * 分析コンテキストを取得
 */
async function fetchAnalysisContext(
  db: D1Database,
  analysisId: number
): Promise<any> {
  
  const result = await db.prepare(`
    SELECT 
      grammar_patterns,
      vocabulary_level,
      sentence_structure,
      difficulty_score
    FROM eiken_question_analysis
    WHERE id = ?
  `).bind(analysisId).first();
  
  if (!result) {
    return null;
  }
  
  return {
    grammar_patterns: JSON.parse(result.grammar_patterns as string || '[]'),
    vocabulary_level: result.vocabulary_level,
    sentence_structure: result.sentence_structure,
    difficulty_score: result.difficulty_score
  };
}
