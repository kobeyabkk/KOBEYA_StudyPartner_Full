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
      temperature: 0.9, // より高い創造性で多様性を確保
      max_tokens: 2000  // 詳細な解説のために増量
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

DIVERSITY REQUIREMENTS (重要 - 多様性の確保):
1. VOCABULARY DIVERSITY - Avoid overused words
   - Common overused words to AVOID: environment, important, benefit, crucial, significant, essential, necessary, understand, problem, solution
   - Use FRESH, less common but equally appropriate vocabulary
   - Explore varied vocabulary domains: technology, arts, sports, culture, daily life, science, entertainment
   
2. TOPIC DIVERSITY - Explore different themes
   - Rotate between topics: technology innovations, cultural events, sports activities, artistic pursuits, travel experiences, culinary culture, entertainment industry, scientific discoveries, historical events, natural phenomena
   - Avoid repeatedly using education, environment, or health topics
   - Use creative and interesting contexts that engage students
   
3. SCENARIO DIVERSITY - Vary the contexts
   - Use different settings: workplace, school, home, outdoors, social gatherings, online, travel
   - Feature different characters: students, workers, families, friends, professionals
   - Include various activities: learning, working, playing, traveling, creating

EXPLANATION QUALITY REQUIREMENTS:
The explanation_ja field is CRITICAL for student learning. It must:
1. Explain WHY the correct answer is right (grammar rule, usage pattern, meaning)
2. Explain WHY each wrong answer is incorrect (specific grammar errors or contextual mismatch)
3. Provide learning points or tips to remember
4. Use 4-6 complete sentences in clear, educational Japanese
5. Be detailed enough that a student can understand the concept completely

GOOD EXAMPLE of explanation_ja:
"正解はBの「Using group work」です。パッセージでは、学校が教育を改善するためにグループワークを使用していると述べています。Aの「Increasing homework」（宿題を増やす）は言及されていません。Cの「Hiring more teachers」（教師を増やす）も述べられていません。Dの「Building new facilities」（新しい施設を建設する）も該当しません。グループワークは協働学習を促進し、生徒の理解を深める効果的な方法として紹介されています。"

BAD EXAMPLE (too brief):
"パッセージでは、学校が教育を改善するためにグループワークを使用していると述べています。A、C、Dは言及されていません。"

Return JSON format:
{
  "question_text": "Complete sentence with ( ) blank",
  "choices": ["option1", "option2", "option3", "option4"],
  "correct_answer_index": 0-3,
  "explanation": "Detailed explanation in English (3-5 sentences explaining why the correct answer is right and why others are wrong)",
  "explanation_ja": "詳細な日本語解説（4-6文で、正解の理由と不正解の選択肢がなぜ間違っているかを丁寧に説明。学習者が完全に理解できるように、文法ルールや使い方のポイントも含める）",
  "translation_ja": "問題文の日本語訳",
  "difficulty": 0.0-1.0,
  "topic": "category name (e.g., 'present perfect', 'conditionals', 'passive voice')"
}`;
}

/**
 * 多様なトピックプール（語彙問題用）
 */
const diverseTopicPool = [
  // Technology & Innovation
  'smartphone applications', 'artificial intelligence', 'virtual reality', 
  'social media trends', 'online gaming', 'streaming services',
  
  // Arts & Culture
  'music festivals', 'art exhibitions', 'theater performances', 
  'traditional crafts', 'photography', 'dance styles',
  
  // Sports & Recreation
  'team sports', 'individual sports', 'outdoor activities', 
  'fitness trends', 'Olympic events', 'adventure sports',
  
  // Food & Culinary
  'cooking techniques', 'international cuisine', 'food trends',
  'restaurant experiences', 'baking', 'dietary choices',
  
  // Travel & Adventure
  'tourist attractions', 'cultural experiences', 'travel planning',
  'accommodation types', 'transportation methods', 'local customs',
  
  // Entertainment
  'movie genres', 'television shows', 'video games',
  'amusement parks', 'concerts', 'festivals',
  
  // Science & Nature
  'weather phenomena', 'animal behavior', 'plant life',
  'scientific experiments', 'space exploration', 'natural disasters',
  
  // Daily Life & Society
  'shopping habits', 'fashion trends', 'home improvement',
  'family gatherings', 'friendship activities', 'community events',
  
  // Work & Career
  'job interviews', 'workplace communication', 'professional development',
  'business meetings', 'remote work', 'career planning'
];

/**
 * ランダムなトピックを選択
 */
function selectRandomTopic(): string {
  return diverseTopicPool[Math.floor(Math.random() * diverseTopicPool.length)];
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
    const suggestedTopic = selectRandomTopic();
    
    return `Generate a GRAMMAR question for Eiken Grade ${request.grade}.

GRAMMAR FOCUS for this level:
${topicList}

SUGGESTED TOPIC CONTEXT: ${suggestedTopic}
(Use this as inspiration for a fresh, interesting context. Feel free to adapt creatively.)

DIVERSITY REQUIREMENTS (CRITICAL):
- USE interesting, varied contexts (technology, sports, arts, food, travel, entertainment, etc.)
- AVOID typical education/environment/health themes if possible
- CREATE engaging scenarios that students can relate to
- Make the sentence INTERESTING and FUN, not just grammatically correct

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

EXPLANATION REQUIREMENTS (VERY IMPORTANT):
Your explanation_ja must be DETAILED and EDUCATIONAL:
- Minimum 4-6 complete sentences
- Explain the grammar rule being tested
- Explain why the correct answer follows this rule
- Explain specifically why EACH wrong answer violates the grammar rule
- Include learning tips if relevant
- Use clear, educational Japanese that helps students understand

GOOD EXAMPLE explanation_ja:
"正解はAの「has been」です。この文では現在完了形（have/has + 過去分詞）が必要です。「three times this year」という表現は、今年という期間がまだ継続中であることを示しており、現在完了形を使用します。Bの「was」は過去形で、現在とのつながりを表現できません。Cの「is going」は未来の予定を表す形で、すでに完了した行動には使えません。Dの「will be」は単純未来形で、過去から現在までの経験を表現できません。現在完了形は「過去の行動が現在に影響を与えている」場合に使用することを覚えておきましょう。"

Create an ORIGINAL question that tests grammar skills for this level.`;
  }
  
  // 語彙問題用のプロンプト（既存）
  const suggestedTopic = selectRandomTopic();
  
  return `Generate a ${request.questionType} question for Eiken Grade ${request.grade}.
Section: ${request.section}
Difficulty: ${difficultyDesc}${hints}

SUGGESTED TOPIC CONTEXT: ${suggestedTopic}
(Use this as inspiration for a fresh, interesting context. Feel free to adapt creatively.)

DIVERSITY REQUIREMENTS (CRITICAL):
- AVOID overused vocabulary: environment, important, benefit, crucial, significant, understand, problem, solution
- USE fresh, interesting vocabulary appropriate for the level
- CREATE engaging scenarios from daily life, hobbies, or interesting situations
- VARY the context from typical education/health/environment themes
- Make the question FUN and INTERESTING for students

Create an ORIGINAL question that tests the appropriate skills for this level.
Ensure the question is completely unique and does not resemble existing test questions.

EXPLANATION REQUIREMENTS (VERY IMPORTANT):
Your explanation_ja must be DETAILED and EDUCATIONAL:
- Minimum 4-6 complete sentences
- Explain why the correct answer is right (meaning, context fit, usage)
- Explain specifically why EACH wrong answer is incorrect
- Include the meaning of key words if relevant
- Use clear, educational Japanese that helps students understand completely

GOOD EXAMPLE explanation_ja for vocabulary:
"正解はBの「persistent」（粘り強い）です。この文脈では、困難にもかかわらず努力を続ける人物の性格を表現しています。Aの「temporary」（一時的な）は持続性がないため不適切です。Cの「aggressive」（攻撃的な）は努力の質を表す言葉として文脈に合いません。Dの「hesitant」（ためらいがちな）は逆の意味で、努力を続ける姿勢とは矛盾します。「persistent」は「あきらめずに続ける」という前向きな性質を表す重要な単語です。"`;
}
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
