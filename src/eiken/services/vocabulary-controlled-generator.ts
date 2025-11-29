/**
 * Phase 1: 語彙制約付き問題生成サービス
 * 
 * 既存の question-generator に語彙レベル管理を統合
 * 事前制御（プロンプト指定）+ 事後検証（自動チェック）の2段階方式
 */

import { analyzeVocabularyLevel, getTargetCEFR, type EikenGrade, type VocabularyAnalysisResult } from './vocabulary-analyzer';
import type { EikenEnv } from '../types';

export interface QuestionGenerationRequest {
  grade: EikenGrade;
  section: string;
  questionType: string;
  count: number;
  topicHints?: string[];
  grammarPoints?: string[];
}

export interface GeneratedQuestion {
  questionText: string;
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  explanationJa: string;
  difficulty: number;
  grammarPoints?: string[];
  vocabularyLevel?: string;
}

export interface VocabularyControlledQuestion extends GeneratedQuestion {
  vocabularyAnalysis: VocabularyAnalysisResult;
  generationAttempts: number;
}

/**
 * 語彙制約付き問題生成（最大3回リトライ）
 */
export async function generateQuestionWithVocabControl(
  request: QuestionGenerationRequest,
  env: EikenEnv
): Promise<VocabularyControlledQuestion> {
  
  const maxRetries = 3;
  const targetCEFR = getTargetCEFR(request.grade);
  
  console.log(`🎯 Generating question for Grade ${request.grade} (CEFR: ${targetCEFR})`);
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`   Attempt ${attempt}/${maxRetries}...`);
    
    try {
      // 1. 語彙制約を含むプロンプトで問題生成
      const question = await generateSingleQuestion(request, targetCEFR, env);
      
      // 2. 語彙レベル検証
      const combinedText = `${question.questionText} ${question.choices.join(' ')} ${question.explanation}`;
      const analysis = await analyzeVocabularyLevel(combinedText, request.grade, env);
      
      // 3. 検証結果をログに保存
      await logVocabularyValidation(null, request.grade, 'post_generation', analysis, env);
      
      if (analysis.isValid) {
        console.log(`   ✅ Vocabulary check passed (attempt ${attempt})`);
        console.log(`      Valid words: ${analysis.validWords}/${analysis.uniqueWords} (${analysis.validPercentage.toFixed(1)}%)`);
        
        return {
          ...question,
          vocabularyAnalysis: analysis,
          generationAttempts: attempt
        };
      }
      
      console.log(`   ⚠️ Vocabulary check failed (attempt ${attempt})`);
      console.log(`      Out of range ratio: ${(analysis.outOfRangeRatio * 100).toFixed(1)}%`);
      console.log(`      Out of range words: ${analysis.outOfRangeWords.join(', ')}`);
      
      // 4. 最終試行でない場合、修正プロンプトで再生成
      if (attempt < maxRetries) {
        // 次の試行では、問題のある語彙を具体的に指摘
        request.topicHints = request.topicHints || [];
        request.topicHints.push(buildVocabRewriteHint(analysis, targetCEFR));
      }
      
    } catch (error) {
      console.error(`   ❌ Generation error (attempt ${attempt}):`, error);
      if (attempt === maxRetries) {
        throw error;
      }
    }
  }
  
  throw new Error(`Failed to generate question within vocabulary constraints after ${maxRetries} attempts`);
}

/**
 * 単一問題の生成（語彙制約プロンプト付き）
 */
async function generateSingleQuestion(
  request: QuestionGenerationRequest,
  targetCEFR: string,
  env: EikenEnv
): Promise<GeneratedQuestion> {
  
  const vocabularyGuidance = buildVocabularyGuidancePrompt(request.grade, targetCEFR);
  
  const systemPrompt = `You are an EIKEN (英検) question generator.

${vocabularyGuidance}

Generate a ${request.questionType} question for Grade ${request.grade}.

Requirements:
- Question type: ${request.questionType}
- Section: ${request.section}
- Grammar points: ${request.grammarPoints?.join(', ') || 'appropriate for the level'}
${request.topicHints && request.topicHints.length > 0 ? `- Additional hints: ${request.topicHints.join('; ')}` : ''}

Output JSON format:
{
  "questionText": "Question text with ( ) blank",
  "choices": ["A", "B", "C", "D"],
  "correctAnswerIndex": 0,
  "explanation": "Why this answer is correct",
  "explanationJa": "正解の理由（日本語）",
  "difficulty": 0.5,
  "grammarPoints": ["grammar_point1", "grammar_point2"]
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Generate one question following the specifications above.' }
      ],
      temperature: 0.7,
      max_tokens: 1500,
      response_format: { type: 'json_object' }
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
  }
  
  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  
  return {
    questionText: result.questionText,
    choices: result.choices,
    correctAnswerIndex: result.correctAnswerIndex,
    explanation: result.explanation,
    explanationJa: result.explanationJa,
    difficulty: result.difficulty || 0.5,
    grammarPoints: result.grammarPoints,
    vocabularyLevel: targetCEFR
  };
}

/**
 * 語彙ガイダンスプロンプトの構築
 */
function buildVocabularyGuidancePrompt(grade: EikenGrade, targetCEFR: string): string {
  const gradeInfo = getGradeVocabularyInfo(grade);
  
  return `
【CRITICAL: VOCABULARY CONSTRAINTS】
This question is for Eiken Grade ${grade} students.

Vocabulary Requirements:
- CEFR Level: ${targetCEFR} or below
- Vocabulary Range: ${gradeInfo.vocabRange}
- Target Zipf Score: ≥ 3.5 (use common, high-frequency words)

STRICT RULES:
1. Use ONLY ${targetCEFR}-level vocabulary or simpler
2. Avoid rare or advanced words (Zipf score < 3.5)
3. Choose the most common synonym when multiple options exist
4. If a word seems too difficult, replace it with a simpler alternative

Examples of appropriate vocabulary for ${targetCEFR}:
${gradeInfo.exampleWords}

⚠️ IMPORTANT: This constraint is MANDATORY. The question will be automatically validated.
If it contains words beyond ${targetCEFR} level, it will be rejected and regenerated.
`.trim();
}

/**
 * 級別の語彙情報
 */
function getGradeVocabularyInfo(grade: EikenGrade): {
  vocabRange: string;
  exampleWords: string;
} {
  const info: Record<EikenGrade, { vocabRange: string; exampleWords: string }> = {
    '5': {
      vocabRange: '300-600 words',
      exampleWords: 'be, have, do, go, get, make, want, like, need, etc.'
    },
    '4': {
      vocabRange: '600-1,300 words',
      exampleWords: 'study, learn, understand, important, interesting, explain, etc.'
    },
    '3': {
      vocabRange: '1,300-2,100 words',
      exampleWords: 'consider, suggest, especially, advantage, environment, etc.'
    },
    'pre2': {
      vocabRange: '2,100-3,600 words',
      exampleWords: 'contribute, furthermore, significant, particular, establish, etc.'
    },
    '2': {
      vocabRange: '3,600-5,100 words',
      exampleWords: 'facilitate, subsequent, predominantly, comprehensive, innovative, etc.'
    },
    'pre1': {
      vocabRange: '5,100-7,500 words',
      exampleWords: 'intricate, meticulous, substantiate, alleviate, paradigm, etc.'
    },
    '1': {
      vocabRange: '7,500-15,000 words',
      exampleWords: 'elucidate, ubiquitous, circumvent, ostensibly, juxtapose, etc.'
    }
  };
  
  return info[grade] || info['2'];
}

/**
 * 語彙書き換えヒントの構築
 */
function buildVocabRewriteHint(
  analysis: VocabularyAnalysisResult,
  targetCEFR: string
): string {
  
  if (analysis.outOfRangeWords.length === 0) {
    return '';
  }
  
  const problematicWords = analysis.outOfRangeWords.slice(0, 5).join(', ');
  
  return `VOCABULARY CONSTRAINT VIOLATION DETECTED. 
Replace these advanced words with ${targetCEFR}-level synonyms: ${problematicWords}. 
Use simpler, more common alternatives while maintaining the same grammar point and difficulty.`;
}

/**
 * 語彙検証ログの保存
 */
async function logVocabularyValidation(
  questionId: number | null,
  grade: EikenGrade,
  validationType: 'pre_generation' | 'post_generation',
  analysis: VocabularyAnalysisResult,
  env: EikenEnv
): Promise<void> {
  
  try {
    await env.DB.prepare(`
      INSERT INTO eiken_vocabulary_validation_logs 
        (question_id, grade, validation_type, total_words, unique_words, 
         out_of_range_words, out_of_range_ratio, zipf_violations, is_valid)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      questionId,
      grade,
      validationType,
      analysis.totalWords,
      analysis.uniqueWords,
      JSON.stringify(analysis.outOfRangeWords),
      analysis.outOfRangeRatio,
      JSON.stringify(analysis.zipfViolations),
      analysis.isValid ? 1 : 0
    ).run();
    
    console.log(`   📝 Logged vocabulary validation to database`);
  } catch (error) {
    console.error('   ❌ Failed to log vocabulary validation:', error);
    // エラーが発生してもメインフローは継続
  }
}

/**
 * 語彙使用統計の更新
 */
export async function updateVocabularyUsageStats(
  question: GeneratedQuestion,
  grade: EikenGrade,
  env: EikenEnv
): Promise<void> {
  
  const doc = nlp(question.questionText + ' ' + question.choices.join(' '));
  const tokens = doc.terms().out('array');
  
  // 簡易的なLemmatization
  const lemmas = tokens.map((token: string) => token.toLowerCase());
  const uniqueLemmas = [...new Set(lemmas)];
  
  for (const lemma of uniqueLemmas) {
    try {
      await env.DB.prepare(`
        INSERT INTO eiken_vocabulary_usage_stats (word_lemma, pos, grade, usage_count, last_used_at)
        VALUES (?, 'unknown', ?, 1, CURRENT_TIMESTAMP)
        ON CONFLICT(word_lemma, pos, grade) DO UPDATE SET
          usage_count = usage_count + 1,
          last_used_at = CURRENT_TIMESTAMP
      `).bind(lemma, grade).run();
    } catch (error) {
      // エラーは無視（統計更新失敗は致命的ではない）
    }
  }
}
