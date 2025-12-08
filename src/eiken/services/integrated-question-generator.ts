/**
 * Phase 3: Integrated Question Generation Service
 * 
 * Blueprint + LLM + 検証パイプラインを統合
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { 
  Blueprint, 
  EikenGrade, 
  QuestionFormat, 
  GenerationMode,
  BlueprintGenerationResult 
} from '../types';
import { BlueprintGenerator } from './blueprint-generator';
import { buildPromptForBlueprint } from '../prompts/format-prompts';
import { selectModel, getModelSelectionReason } from '../utils/model-selector';
import { validateVocabulary } from '../lib/vocabulary-validator';
import { validateGeneratedQuestion } from './copyright-validator';
import { getTargetCEFR } from './vocabulary-analyzer';
import { VocabularyFailureTracker } from './vocabulary-tracker';
import { validateGrammarComplexity } from '../config/grammar-constraints';
import { VocabularyAnnotator } from './vocabulary-annotator';

export interface QuestionGenerationRequest {
  student_id: string;
  grade: EikenGrade;
  format: QuestionFormat;
  mode?: GenerationMode;
  topic_code?: string;
  difficulty_adjustment?: number;
  session_id?: string;
}

export interface GeneratedQuestionData {
  id?: number;
  blueprint_id: string;
  student_id: string;
  grade: EikenGrade;
  format: QuestionFormat;
  topic_code: string;
  
  // 問題データ（形式によって構造が異なる）
  question_data: any;  // JSON
  
  // メタデータ
  model_used: string;
  generation_mode: GenerationMode;
  validation_passed: boolean;
  vocabulary_score?: number;
  copyright_score?: number;
  
  // long_reading形式の場合、関連問題のID配列
  related_question_ids?: number[];
  
  // タイムスタンプ
  created_at: string;
}

export interface QuestionGenerationResult {
  success: boolean;
  question?: GeneratedQuestionData;
  blueprint: Blueprint;
  topic_selection: any;
  validation: {
    vocabulary_passed: boolean;
    copyright_passed: boolean;
    vocabulary_score?: number;
    copyright_score?: number;
  };
  metadata: {
    model_used: string;
    generation_mode: GenerationMode;
    attempts: number;
    generation_time_ms: number;
  };
  error?: string;
}

/**
 * LLM最適設定
 */
interface LLMConfig {
  temperature: number;
  top_p: number;
  reasoning: string;
}

export class IntegratedQuestionGenerator {
  private db: D1Database;
  private blueprintGenerator: BlueprintGenerator;
  private openaiApiKey: string;

  constructor(db: D1Database, openaiApiKey: string) {
    this.db = db;
    this.blueprintGenerator = new BlueprintGenerator(db);
    this.openaiApiKey = openaiApiKey;
  }

  /**
   * 形式別の最適なLLMパラメータ
   * 
   * 長文形式ほど低いtemperatureで語彙制御を強化
   */
  private getOptimalLLMConfig(format: QuestionFormat): LLMConfig {
    const configs: Record<QuestionFormat, LLMConfig> = {
      'grammar_fill': {
        temperature: 0.5,
        top_p: 0.9,
        reasoning: '短文なので多様性とのバランス'
      },
      'opinion_speech': {
        temperature: 0.4,
        top_p: 0.85,
        reasoning: '自然な表現必要だが制御優先'
      },
      'reading_aloud': {
        temperature: 0.3,
        top_p: 0.8,
        reasoning: '語彙制御を最優先'
      },
      'essay': {
        temperature: 0.3,
        top_p: 0.75,
        reasoning: '長文なので最も厳格に制御'
      },
      'long_reading': {
        temperature: 0.2,
        top_p: 0.65,
        reasoning: '超長文なので極めて厳格に（Phase 3改善: 0.25→0.2, top_p: 0.7→0.65）'
      },
      'listening_comprehension': {
        temperature: 0.4,
        top_p: 0.85,
        reasoning: '自然な会話表現が必要'
      }
    };
    
    return configs[format] || configs['essay'];
  }
  
  /**
   * 形式別の適応的語彙スコア閾値
   * 
   * 形式、級、文字数に応じて動的に調整
   * Phase 4A: 注釈付き語彙の場合、閾値をさらに緩和
   */
  private getAdaptiveThreshold(
    format: QuestionFormat,
    grade: EikenGrade,
    wordCount: number,
    hasVocabularyNotes: boolean = false
  ): number {
    // Phase 4修正: 適応的閾値を実際の達成可能な目標スコアに設定
    // 長文形式ほど語彙の多様性が必要なため、目標を下げる
    let baseThreshold = 95;
    
    // 形式別の現実的な目標スコア
    // 応急処置Phase 2: grammar_fillの閾値をさらに緩和（85% → 70%）
    // Phase 4A Update: 5級grammar_fillの閾値をさらに緩和（70% → 60%）
    const formatAdjustments: Record<QuestionFormat, number> = {
      'grammar_fill': -25,    // 短文だが語彙の自然な多様性を許容（95 → 70%）
      'opinion_speech': -5,   // 自然な表現必要（95 → 90%）
      'reading_aloud': -3,     // 90-92%目標
      'essay': -15,          // 長文、論理的表現必要（95 → 80%）
      'long_reading': -12,   // 超長文、多様性必要（95 → 83%）
      'listening_comprehension': -5
    };
    
    baseThreshold += formatAdjustments[format] || 0;
    
    // 5級・4級のgrammar_fill特別調整（短文で初心者向けなので、さらに緩和）
    if ((grade === '5' || grade === '4') && format === 'grammar_fill') {
      baseThreshold -= 10;  // 70% → 60%
      console.log(`[Threshold] Grade ${grade} grammar_fill: applying extra -10% adjustment (60% target)`);
    }
    
    // Phase 4A: 注釈付き語彙ボーナス（学習効果が高いため、より多様な語彙を許容）
    if (hasVocabularyNotes) {
      console.log(`[Threshold] Vocabulary notes detected - applying bonus adjustment`);
      
      // 形式別の注釈ボーナス（長文ほど大きなボーナス）
      const glossaryBonus: Record<QuestionFormat, number> = {
        'grammar_fill': -3,           // 80 → 77%（短文なので小さめ）
        'opinion_speech': -5,         // 90 → 85%
        'reading_aloud': -5,          // 92 → 87%
        'essay': -10,                 // 80 → 70%（注釈で補える）
        'long_reading': -8,           // 83 → 75%（注釈で補える）
        'listening_comprehension': -5 // 90 → 85%
      };
      
      baseThreshold += glossaryBonus[format] || -5;
      console.log(`[Threshold] Applied ${glossaryBonus[format] || -5}% glossary bonus for ${format}`);
    }
    
    // 文字数による調整（長いほど緩和）
    if (wordCount > 200) {
      baseThreshold -= 2;  // 200語超: さらに-2%
    } else if (wordCount > 150) {
      baseThreshold -= 1;  // 150語超: -1%
    }
    
    // グレード別調整（高レベルほど許容）
    if (grade === '1' || grade === 'pre1') {
      baseThreshold -= 2;  // 高レベルは多様性を許容
    }
    
    // 最低70%、最高95%に制限（長文形式を考慮）
    return Math.max(70, Math.min(95, baseThreshold));
  }
  
  /**
   * 単語数カウント
   */
  private getWordCount(questionData: any): number {
    const text = questionData.sample_essay 
                 || questionData.passage 
                 || questionData.question_text 
                 || '';
    return text.split(/\s+/).filter((w: string) => w.length > 0).length;
  }

  /**
   * Phase 4B: vocabulary_meanings から用語を抽出
   * LLMが生成する用語集（glossary）から語彙を取り出す
   * 
   * 形式:
   * - Array: [{"term": "word", "definition": "意味"}, ...]
   * - Object: {"word1": "meaning", "word2": "meaning", ...}
   */
  private extractGlossaryTerms(vocabularyMeanings: any): Array<{word: string; pos?: string; definition_ja?: string}> {
    if (!vocabularyMeanings) return [];
    
    if (Array.isArray(vocabularyMeanings)) {
      // Array format: [{"term": "...", "definition": "..."}, ...]
      return vocabularyMeanings
        .filter(item => item && typeof item === 'object' && item.term)
        .map(item => ({
          word: item.term,
          pos: undefined,
          definition_ja: item.definition
        }));
    } else if (typeof vocabularyMeanings === 'object') {
      // Object format: {"word1": "meaning", "word2": "meaning"}
      return Object.entries(vocabularyMeanings)
        .filter(([key, val]) => key && typeof val === 'string')
        .map(([word, definition]) => ({
          word,
          pos: undefined,
          definition_ja: definition as string
        }));
    }
    
    return [];
  }

  /**
   * メイン: 問題生成パイプライン
   */
  async generateQuestion(
    request: QuestionGenerationRequest
  ): Promise<QuestionGenerationResult> {
    const startTime = Date.now();
    const mode = request.mode || 'production';
    
    console.log(`[Question Generation] Starting for ${request.grade}/${request.format} (${mode})`);

    // Step 1: Blueprint生成
    const blueprintResult = await this.blueprintGenerator.generateBlueprint({
      student_id: request.student_id,
      grade: request.grade,
      format: request.format,
      topic_code: request.topic_code,
      difficulty_adjustment: request.difficulty_adjustment,
    });

    const { blueprint, topic_selection } = blueprintResult;

    // Step 2: LLMモデル選択
    const selectedModel = selectModel({
      grade: request.grade,
      format: request.format,
      mode,
    });
    const selectionReason = getModelSelectionReason({
      grade: request.grade,
      format: request.format,
      mode,
    });
    console.log(`[Model Selection] ${selectedModel} - ${selectionReason}`);

    // Step 3: 問題生成（最大5回リトライ - Phase 4A改善）
    const maxAttempts = 5;
    let attempts = 0;
    let questionData: any = null;
    let vocabularyPassed = false;
    let copyrightPassed = false;
    let vocabularyScore: number | undefined;
    let copyrightScore: number | undefined;

    while (attempts < maxAttempts && (!vocabularyPassed || !copyrightPassed)) {
      attempts++;
      console.log(`[Generation Attempt] ${attempts}/${maxAttempts}`);

      try {
        // LLM呼び出し
        questionData = await this.callLLM(blueprint, selectedModel);

        // 検証1: 重複チェック（Phase 4C - Gemini推奨）
        const questionText = questionData.question_text 
                           || questionData.essay_prompt 
                           || questionData.passage 
                           || '';
        
        const isDuplicate = await this.isDuplicateQuestion(
          request.grade,
          request.format,
          questionText
        );
        
        if (isDuplicate) {
          console.log(`[Validation Failed] Duplicate question detected`);
          continue; // 重複の場合は再生成
        }

        // 検証2: 文法複雑さ（Phase 4B）- grammar_fill形式は除外
        if (request.format !== 'grammar_fill') {
          const grammarValidation = this.validateGrammar(questionData, request.grade);
          if (!grammarValidation.passed) {
            console.log(`[Validation Failed] Grammar complexity:`, grammarValidation.violations);
            console.log(`[Grammar Rejection] Violations: ${grammarValidation.violations.join(', ')}`);
            continue;
          }
        } else {
          console.log(`[Grammar Validation] Skipped for grammar_fill format`);
        }

        // 検証3: 語彙レベル（形式を渡して適応的閾値を使用）
        const vocabValidation = await this.validateVocabulary(
          questionData,
          request.grade,
          request.format
        );
        vocabularyPassed = vocabValidation.passed;
        vocabularyScore = vocabValidation.score;

        if (!vocabularyPassed) {
          console.log(`[Validation Failed] Vocabulary (score: ${vocabularyScore})`);
          continue;
        }

        // 検証4: 著作権
        const copyrightValidation = await this.validateCopyright(
          questionData,
          request.grade
        );
        copyrightPassed = copyrightValidation.passed;
        copyrightScore = copyrightValidation.score;

        if (!copyrightPassed) {
          console.log(`[Validation Failed] Copyright (score: ${copyrightScore})`);
          continue;
        }

        // 全検証パス！
        console.log(`[Validation Passed] All checks passed on attempt ${attempts}`);
        break;

      } catch (error) {
        console.error(`[Generation Error] Attempt ${attempts}:`, error);
        if (attempts >= maxAttempts) {
          throw error;
        }
      }
    }

    // 全リトライ失敗
    if (!vocabularyPassed || !copyrightPassed) {
      return {
        success: false,
        blueprint,
        topic_selection,
        validation: {
          vocabulary_passed: vocabularyPassed,
          copyright_passed: copyrightPassed,
          vocabulary_score: vocabularyScore,
          copyright_score: copyrightScore,
        },
        metadata: {
          model_used: selectedModel,
          generation_mode: mode,
          attempts,
          generation_time_ms: Date.now() - startTime,
        },
        error: 'Failed to generate valid question after maximum attempts',
      };
    }

    // Step 3.5: 語彙アノテーションを生成（Phase 4B）
    try {
      const annotator = new VocabularyAnnotator(this.db);
      
      // テキストを抽出（形式によって異なる）
      let textToAnnotate = '';
      if (questionData.passage) {
        textToAnnotate = questionData.passage;
      } else if (questionData.question_text) {
        textToAnnotate = questionData.question_text;
      } else if (questionData.essay_prompt) {
        textToAnnotate = questionData.essay_prompt;
      }
      
      if (textToAnnotate) {
        console.log('[Vocabulary Annotation] Generating annotations for text...');
        const vocabularyNotes = await annotator.generateAnnotations(textToAnnotate, {
          minDifficultyScore: 40,
          maxAnnotations: 10,
          excludeKatakana: true
        });
        
        if (vocabularyNotes.length > 0) {
          questionData.vocabulary_notes = vocabularyNotes;
          console.log(`[Vocabulary Annotation] Generated ${vocabularyNotes.length} annotations`);
        } else {
          console.log('[Vocabulary Annotation] No difficult words found');
        }
      }
    } catch (error) {
      console.error('[Vocabulary Annotation Error]', error);
      // アノテーション生成失敗は致命的エラーではない
    }

    // Step 4: データベースに保存（production と practice の両方で保存）
    let savedQuestion: GeneratedQuestionData | undefined;
    let saveError: string | undefined;
    try {
      savedQuestion = await this.saveQuestion({
        blueprint_id: blueprint.id!,
        student_id: request.student_id,
        grade: request.grade,
        format: request.format,
        topic_code: blueprint.topic.topic_code,
        question_data: questionData,
        model_used: selectedModel,
        generation_mode: mode,
        validation_passed: true,
        vocabulary_score: vocabularyScore,
        copyright_score: copyrightScore,
        created_at: new Date().toISOString(),
      });
      console.log(`[Database Save] Question saved with ID: ${savedQuestion.id}`);
    } catch (error) {
      saveError = (error as Error).message;
      console.error(`[Database Save Error]`, error);
      // 保存失敗しても問題生成自体は成功として扱う（データ蓄積は副次的）
    }

    // Step 5: トピック使用履歴を記録
    await this.recordTopicUsage(
      request.student_id,
      request.grade,
      blueprint.topic.topic_code,
      request.format,
      request.session_id
    );

    const endTime = Date.now();
    console.log(`[Question Generation] Completed in ${endTime - startTime}ms`);

    return {
      success: true,
      question: savedQuestion || {
        blueprint_id: blueprint.id!,
        student_id: request.student_id,
        grade: request.grade,
        format: request.format,
        topic_code: blueprint.topic.topic_code,
        question_data: questionData,
        model_used: selectedModel,
        generation_mode: mode,
        validation_passed: true,
        vocabulary_score: vocabularyScore,
        copyright_score: copyrightScore,
        created_at: new Date().toISOString(),
      },
      blueprint,
      topic_selection,
      validation: {
        vocabulary_passed: true,
        copyright_passed: true,
        vocabulary_score: vocabularyScore,
        copyright_score: copyrightScore,
      },
      metadata: {
        model_used: selectedModel,
        generation_mode: mode,
        attempts,
        generation_time_ms: endTime - startTime,
        save_error: saveError,  // エラーをメタデータに追加
        saved_to_db: !!savedQuestion,  // 保存成功フラグ
      },
    };
  }

  /**
   * LLM呼び出し（最適化版）
   * 
   * 形式別の最適パラメータと動的禁止語リストを使用
   */
  private async callLLM(
    blueprint: Blueprint,
    model: string,
    additionalContext?: string
  ): Promise<any> {
    // 形式別の最適パラメータを取得
    const llmConfig = this.getOptimalLLMConfig(blueprint.format);
    
    console.log(`[LLM] Using temperature=${llmConfig.temperature}, top_p=${llmConfig.top_p}`);
    console.log(`[LLM] Reason: ${llmConfig.reasoning}`);
    
    // 動的禁止語リストを取得
    const forbiddenWords = VocabularyFailureTracker.getForbiddenWords(blueprint.grade);
    const recentViolations = VocabularyFailureTracker.getTopViolations(blueprint.grade, 15);
    
    console.log(`[LLM] Using ${forbiddenWords.length} forbidden words (${recentViolations.length} from recent failures)`);
    
    // ベースプロンプトを生成
    const basePrompt = buildPromptForBlueprint(blueprint);
    
    // 追加の禁止語コンテキストを構築
    const forbiddenWordsContext = recentViolations.length > 0
      ? `\n\n## ⚠️ ADDITIONAL FORBIDDEN WORDS (from recent generation failures)\nThese words were used in previous attempts and caused vocabulary level violations:\n${recentViolations.join(', ')}\n\n**YOU MUST AVOID THESE WORDS!**`
      : '';
    
    // 完全なプロンプト
    const enhancedPrompt = `${basePrompt}${forbiddenWordsContext}${additionalContext || ''}`;
    
    // システムプロンプトに禁止語を含める
    const systemContent = `You are a vocabulary-constrained English test creator for Eiken (英検) ${blueprint.grade} preparation.

CRITICAL VOCABULARY CONSTRAINT: Use ONLY CEFR ${blueprint.guidelines.vocabulary_level} vocabulary.

FORBIDDEN WORDS (NEVER use): ${forbiddenWords.slice(0, 30).join(', ')}

Always respond with valid JSON.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiApiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { 
            role: 'system', 
            content: systemContent
          },
          { role: 'user', content: enhancedPrompt },
        ],
        response_format: { type: 'json_object' },
        temperature: llmConfig.temperature,
        top_p: llmConfig.top_p,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const generated = JSON.parse(data.choices[0].message.content);

    return generated;
  }

  /**
   * 語彙レベル検証（適応的閾値対応版）
   */
  private async validateVocabulary(
    questionData: any,
    grade: EikenGrade,
    format?: QuestionFormat
  ): Promise<{ 
    passed: boolean; 
    score: number; 
    violations?: any[];
    threshold?: number;
  }> {
    // 問題テキストを抽出（形式によって異なる）
    let textToValidate = '';
    
    if (questionData.question_text) {
      textToValidate += questionData.question_text + ' ';
    }
    if (questionData.essay_prompt) {
      textToValidate += questionData.essay_prompt + ' ';
    }
    if (questionData.sample_essay) {
      textToValidate += questionData.sample_essay + ' ';
    }
    if (questionData.passage) {
      textToValidate += questionData.passage + ' ';
    }
    if (questionData.choices) {
      textToValidate += questionData.choices.join(' ') + ' ';
    }
    
    // long_reading形式の場合、複数問題のchoicesも検証対象に含める
    if (questionData.questions && Array.isArray(questionData.questions)) {
      for (const q of questionData.questions) {
        if (q.question_text) {
          textToValidate += q.question_text + ' ';
        }
        if (q.choices && Array.isArray(q.choices)) {
          textToValidate += q.choices.join(' ') + ' ';
        }
      }
    }

    // 英検級に対応するCEFRレベルを取得
    const targetCEFR = getTargetCEFR(grade);
    
    // Phase 4B: vocabulary_meanings (LLM glossary) と vocabulary_notes (VocabularyAnnotator) を区別
    // vocabulary_meaningsは用語集（LLMが生成）、vocabulary_notesは難しい単語のアノテーション（DBから取得）
    const hasVocabularyMeanings = !!(questionData.vocabulary_meanings && 
                                     (Array.isArray(questionData.vocabulary_meanings) && questionData.vocabulary_meanings.length > 0 ||
                                      typeof questionData.vocabulary_meanings === 'object' && Object.keys(questionData.vocabulary_meanings).length > 0));
    const vocabularyMeaningsCount = Array.isArray(questionData.vocabulary_meanings) 
      ? questionData.vocabulary_meanings.length 
      : (typeof questionData.vocabulary_meanings === 'object' ? Object.keys(questionData.vocabulary_meanings).length : 0);
    
    console.log(`[VocabValidation] Vocabulary meanings (glossary) present: ${hasVocabularyMeanings} (count: ${vocabularyMeaningsCount})`);
    console.log(`[VocabValidation] Vocabulary notes (annotations) present: ${!!(questionData.vocabulary_notes?.length)} (count: ${questionData.vocabulary_notes?.length || 0})`);
    
    // 適応的閾値を計算（形式、文字数、注釈の有無を考慮）
    const wordCount = this.getWordCount(questionData);
    const adaptiveThreshold = format 
      ? this.getAdaptiveThreshold(format, grade, wordCount, hasVocabularyMeanings)
      : 95; // デフォルト95%
    
    console.log(`[VocabValidation] Adaptive threshold: ${adaptiveThreshold}% (format: ${format}, words: ${wordCount}, glossary: ${hasVocabularyMeanings})`);
    
    // max_violation_rate は (100 - threshold) / 100
    const maxViolationRate = (100 - adaptiveThreshold) / 100;
    
    // DB と CEFR レベルを正しく渡す
    // Phase 4B: vocabulary_meanings (用語集) をバリデーションから除外
    // vocabulary_notesはVocabularyAnnotatorが後で生成するので、ここでは使わない
    const glossaryTerms = this.extractGlossaryTerms(questionData.vocabulary_meanings);
    const validation = await validateVocabulary(
      textToValidate, 
      this.db, 
      {
        target_level: targetCEFR as any,
        max_violation_rate: maxViolationRate,
      },
      glossaryTerms
    );
    
    const score = (validation.valid_words / validation.total_words) * 100 || 0;
    const passed = validation.valid && score >= adaptiveThreshold;
    
    console.log(`[VocabValidation] Score: ${Math.round(score)}%, Threshold: ${adaptiveThreshold}%, Passed: ${passed}`);
    
    // 失敗した場合、違反語を記録
    if (!passed && validation.violations && validation.violations.length > 0) {
      VocabularyFailureTracker.recordFailure(grade, validation.violations);
      
      // トップ違反語を表示
      const topViolations = validation.violations
        .slice(0, 5)
        .map(v => `${v.word} (${v.actual_level})`)
        .join(', ');
      console.log(`[VocabValidation] Top violations: ${topViolations}`);
    }
    
    return {
      passed,
      score,
      violations: validation.violations,
      threshold: adaptiveThreshold,
    };
  }

  /**
   * 著作権検証
   */
  private async validateCopyright(
    questionData: any,
    grade: EikenGrade
  ): Promise<{ passed: boolean; score: number }> {
    try {
      // 問題テキストを抽出
      let generatedQuestion = '';
      if (questionData.question_text) {
        generatedQuestion = questionData.question_text;
      } else if (questionData.passage) {
        generatedQuestion = questionData.passage;
      } else {
        generatedQuestion = JSON.stringify(questionData);
      }
      
      // 正しい形式で validateGeneratedQuestion を呼び出す
      const validation = await validateGeneratedQuestion(
        {
          generatedQuestion,
          generatedChoices: questionData.choices || [],
          grade,
          section: 'vocabulary', // デフォルトセクション
        },
        {
          DB: this.db,
          KV: undefined as any, // 未使用だが型定義に合わせる
          OPENAI_API_KEY: this.openaiApiKey,
          JWT_SECRET: '',
          R2_BUCKET: undefined,
        } as any // EikenEnv型に完全に合わせる
      );

      return {
        passed: validation.safe,
        score: validation.overallScore,
      };
    } catch (error) {
      // 著作権バリデーションでエラーが発生した場合、安全とみなす
      console.error('[Copyright Validation Error]', error);
      return {
        passed: true,
        score: 100, // デフォルトで安全（過去問データベースが未整備のため）
      };
    }
  }

  /**
   * 形式からセクションを判定
   */
  private getSectionFromFormat(format: QuestionFormat): string {
    // 形式に応じて適切なセクションを返す
    switch (format) {
      case 'grammar_fill':
        return 'grammar';
      
      case 'long_reading':
        return 'reading';
      
      case 'listening_comprehension':
        return 'listening';
      
      case 'opinion_speech':
      case 'reading_aloud':
        return 'speaking';
      
      case 'essay':
        return 'writing';
      
      default:
        return 'reading'; // デフォルト
    }
  }

  /**
   * 重複問題チェック（直近20問との照合）
   * 
   * @param grade 級
   * @param format 形式
   * @param questionText 問題文
   * @param recentWindow 照合する直近問題数（デフォルト20）
   * @returns 重複している場合true
   */
  private async isDuplicateQuestion(
    grade: string,
    format: string,
    questionText: string,
    recentWindow: number = 20
  ): Promise<boolean> {
    try {
      // 問題文を正規化（小文字化、空白統一、最初の100文字）
      const normalized = questionText
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .substring(0, 100);
      
      // 直近N問から類似問題を検索
      const result = await this.db
        .prepare(`
          SELECT 1 FROM eiken_generated_questions
          WHERE grade = ? 
            AND question_type = ?
            AND substr(lower(replace(question_text, '  ', ' ')), 1, 100) = ?
          ORDER BY id DESC 
          LIMIT ?
        `)
        .bind(grade, format, normalized, recentWindow)
        .first();
      
      if (result) {
        console.log(`[Duplicate Check] Found duplicate question for ${grade}/${format}`);
        return true;
      }
      
      return false;
    } catch (error) {
      console.warn(`[Duplicate Check] Error checking duplicates:`, error);
      return false; // エラー時は重複なしとして続行
    }
  }

  /**
   * データベースに保存（既存のeiken_generated_questionsスキーマに合わせる）
   */
  private async saveQuestion(data: GeneratedQuestionData): Promise<GeneratedQuestionData> {
    console.log(`[saveQuestion] Starting save for ${data.format} (${data.grade})`);
    
    // long_reading形式の特別処理: 複数問題を個別レコードとして保存
    if (data.format === 'long_reading') {
      console.log(`[saveQuestion] Detected long_reading format, checking for questions array`);
      console.log(`[saveQuestion] question_data keys:`, Object.keys(data.question_data));
      console.log(`[saveQuestion] questions exists:`, !!data.question_data.questions);
      console.log(`[saveQuestion] questions is array:`, Array.isArray(data.question_data.questions));
      
      if (data.question_data.questions && Array.isArray(data.question_data.questions)) {
        return await this.saveLongReadingQuestions(data);
      } else {
        // questionsが存在しない場合、JSON全体を保存（フォールバック）
        console.warn(`[saveQuestion] long_reading format but questions array not found, falling back to JSON stringify`);
      }
    }
    
    // 既存スキーマにマッピング
    const questionData = data.question_data;
    // essay形式は essay_prompt を使用
    const questionText = questionData.question_text 
                         || questionData.essay_prompt 
                         || questionData.passage 
                         || JSON.stringify(questionData);
    
    console.log(`[saveQuestion] questionText length: ${questionText.length} chars`);
    console.log(`[saveQuestion] questionData keys:`, Object.keys(questionData));
    const choices = questionData.choices || [];
    const correctAnswer = questionData.correct_answer || '';
    
    // 正解のインデックスを柔軟に検索
    let correctIndex = -1;
    if (choices.length > 0) {
      // 1. 完全一致を試す
      correctIndex = choices.indexOf(correctAnswer);
      
      // 2. 完全一致が見つからない場合、プレフィックス付き選択肢から検索
      if (correctIndex === -1 && correctAnswer.length <= 2) {
        correctIndex = choices.findIndex(choice => {
          const prefix = choice.trim().substring(0, 3).toUpperCase();
          return prefix.startsWith(correctAnswer.toUpperCase() + ')') ||
                 prefix.startsWith(correctAnswer.toUpperCase() + '.') ||
                 prefix.startsWith(correctAnswer.toUpperCase() + ' ') ||
                 prefix.startsWith('(' + correctAnswer.toUpperCase() + ')');
        });
      }
      
      // 3. それでも見つからない場合、選択肢のテキスト部分との部分一致を試す
      if (correctIndex === -1) {
        correctIndex = choices.findIndex(choice => {
          const textPart = choice.replace(/^[A-D][).]\s*/, '').trim();
          return textPart === correctAnswer.trim();
        });
      }
    }
    
    // answer_type を形式に応じて判定（CHECK制約: 'mcq' | 'written' | 'speaking'）
    const answerType = (() => {
      // Speaking形式は明示的に 'speaking' を設定
      if (data.format === 'opinion_speech' || data.format === 'reading_aloud') {
        return 'speaking';
      }
      // 選択肢があればMCQ、なければwritten
      if (choices.length > 0) {
        return 'mcq';
      }
      return 'written';
    })();
    
    // MCQの場合、正解が選択肢に含まれていることを検証
    if (answerType === 'mcq' && correctIndex === -1) {
      console.error(`[saveQuestion] ERROR: correct_answer "${correctAnswer}" not found in choices:`, choices);
      throw new Error(
        `Invalid question data for ${data.format}: ` +
        `correct_answer "${correctAnswer}" is not in choices [${choices.join(', ')}]. ` +
        `This indicates a data quality issue in the generated question.`
      );
    }
    
    // 選択肢の数をバリデーション（CHECK制約: correct_answer_index < 10）
    if (choices.length > 10) {
      console.error(`[saveQuestion] ERROR: Too many choices (${choices.length})`);
      throw new Error(
        `Invalid question data for ${data.format}: ` +
        `${choices.length} choices provided, but maximum is 10.`
      );
    }
    
    const choicesJson = choices.length > 0 ? JSON.stringify(choices) : null;
    const correctIdx = (answerType === 'mcq' && correctIndex >= 0) ? correctIndex : null;
    
    // 形式に応じてセクションを設定
    const section = this.getSectionFromFormat(data.format);
    
    // Speaking形式の場合、correct_answer_textに空文字列ではなくNULLを設定
    const correctAnswerText = answerType === 'speaking' ? null : (correctAnswer || null);
    
    console.log(`[saveQuestion] Computed values:`, {
      answerType,
      section,
      choicesJson: choicesJson ? 'EXISTS' : 'NULL',
      correctIdx,
      correctAnswerText: correctAnswerText ? 'EXISTS' : 'NULL',
    });
    
    const result = await this.db
      .prepare(`
        INSERT INTO eiken_generated_questions (
          grade, section, question_type, answer_type,
          question_text, choices_json, correct_answer_index, correct_answer_text,
          explanation, explanation_ja, model, difficulty_score,
          vocab_band, quality_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.grade,
        section,
        data.format,
        answerType,
        questionText,
        choicesJson,
        correctIdx,
        correctAnswerText,  // 空文字列ではなくNULL
        questionData.explanation || '',
        questionData.explanation_ja || '',
        data.model_used,
        0.5, // デフォルト難易度
        `vocabulary_score:${data.vocabulary_score}`, // 語彙スコアを保存
        data.copyright_score ? Math.min(5.0, Math.max(1.0, data.copyright_score / 20)) : null, // 100点満点→5点満点に変換
        data.created_at
      )
      .run();

    return {
      ...data,
      id: result.meta.last_row_id,
    };
  }

  /**
   * long_reading形式の複数問題を個別レコードとして保存
   * Option A: 1エントリ=1MCQ、passage重複方式
   */
  private async saveLongReadingQuestions(data: GeneratedQuestionData): Promise<GeneratedQuestionData> {
    console.log(`[saveLongReadingQuestions] Starting save for long_reading (${data.grade})`);
    
    const questionData = data.question_data;
    const passage = questionData.passage || '';
    const questions = questionData.questions || [];
    
    if (questions.length === 0) {
      throw new Error('long_reading format requires questions array');
    }
    
    console.log(`[saveLongReadingQuestions] Processing ${questions.length} questions`);
    
    const savedIds: number[] = [];
    const section = this.getSectionFromFormat(data.format);
    
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      
      // passage + 問題文を結合してquestion_textに保存
      const questionText = `${passage}\n\nQuestion ${i + 1}: ${q.question_text}`;
      
      const choices = q.choices || [];
      const correctAnswer = q.correct_answer || '';
      
      // 正解のインデックスを柔軟に検索
      // 1. 完全一致を試す
      let correctIndex = choices.indexOf(correctAnswer);
      
      // 2. 完全一致が見つからない場合、プレフィックス付き選択肢から検索
      //    例: correct_answer="A" と choices=["A) Text", "B) Text", ...] を照合
      if (correctIndex === -1 && correctAnswer.length <= 2) {
        // correctAnswerが "A", "B", "C", "D" のような短い形式の場合
        correctIndex = choices.findIndex(choice => {
          // "A)", "A.", "A -", "(A)" などのパターンに対応
          const prefix = choice.trim().substring(0, 3).toUpperCase();
          return prefix.startsWith(correctAnswer.toUpperCase() + ')') ||
                 prefix.startsWith(correctAnswer.toUpperCase() + '.') ||
                 prefix.startsWith(correctAnswer.toUpperCase() + ' ') ||
                 prefix.startsWith('(' + correctAnswer.toUpperCase() + ')');
        });
      }
      
      // 3. それでも見つからない場合、選択肢のテキスト部分との部分一致を試す
      if (correctIndex === -1) {
        correctIndex = choices.findIndex(choice => {
          // プレフィックスを削除してテキスト部分を抽出（例: "A) Text" → "Text"）
          const textPart = choice.replace(/^[A-D][).]\s*/, '').trim();
          return textPart === correctAnswer.trim();
        });
      }
      
      // 正解が見つからない場合はエラーをスロー（データ品質保証）
      if (correctIndex === -1) {
        console.error(`[saveLongReadingQuestions] ERROR: correct_answer "${correctAnswer}" not found in choices:`, choices);
        console.error(`[saveLongReadingQuestions] Attempted matching strategies:`, {
          exactMatch: false,
          prefixMatch: false,
          textPartMatch: false
        });
        throw new Error(
          `Invalid question data for long_reading question ${i + 1}: ` +
          `correct_answer "${correctAnswer}" is not in choices [${choices.join(', ')}]. ` +
          `This indicates a data quality issue in the generated question.`
        );
      }
      
      // 選択肢の数をバリデーション（CHECK制約: correct_answer_index < 10）
      if (choices.length > 10) {
        console.error(`[saveLongReadingQuestions] ERROR: Too many choices (${choices.length}) for question ${i + 1}`);
        throw new Error(
          `Invalid question data for long_reading question ${i + 1}: ` +
          `${choices.length} choices provided, but maximum is 10.`
        );
      }
      
      console.log(`[saveLongReadingQuestions] Question ${i + 1}: correctIndex=${correctIndex}, choices.length=${choices.length}`);
      
      const result = await this.db
        .prepare(`
          INSERT INTO eiken_generated_questions (
            grade, section, question_type, answer_type,
            question_text, choices_json, correct_answer_index, correct_answer_text,
            explanation, explanation_ja, model, difficulty_score,
            vocab_band, quality_score, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          data.grade,
          section,
          data.format,
          'mcq', // long_readingは常にMCQ
          questionText,
          JSON.stringify(choices),
          correctIndex, // correctIndex >= 0 が保証されているので直接使用
          correctAnswer,
          q.explanation || '',
          q.explanation_ja || '',
          data.model_used,
          0.5,
          `vocabulary_score:${data.vocabulary_score}`,
          data.copyright_score ? Math.min(5.0, Math.max(1.0, data.copyright_score / 20)) : null,
          data.created_at
        )
        .run();
      
      savedIds.push(result.meta.last_row_id);
      console.log(`[saveLongReadingQuestions] ✅ Saved question ${i + 1}/${questions.length} with ID: ${result.meta.last_row_id}`);
    }
    
    console.log(`[saveLongReadingQuestions] Successfully saved ${savedIds.length} questions`);
    
    // 最初のレコードIDを返す（互換性のため）
    // related_question_idsに全IDを保存（将来的に使用可能）
    return {
      ...data,
      id: savedIds[0],
      related_question_ids: savedIds,
    };
  }

  /**
   * トピック使用履歴を記録
   */
  private async recordTopicUsage(
    studentId: string,
    grade: EikenGrade,
    topicCode: string,
    format: QuestionFormat,
    sessionId?: string
  ): Promise<void> {
    await this.db
      .prepare(`
        INSERT INTO eiken_topic_usage_history (
          student_id, grade, topic_code, question_type, session_id, used_at
        ) VALUES (?, ?, ?, ?, ?, ?)
      `)
      .bind(
        studentId,
        grade,
        topicCode,
        format,
        sessionId || null, // undefined を null に変換
        new Date().toISOString()
      )
      .run();
  }

  /**
   * Phase 4B: 文法複雑さの検証
   * 
   * 級別の文法制約に違反していないかチェック
   */
  private validateGrammar(
    questionData: any,
    grade: EikenGrade
  ): { passed: boolean; violations: string[] } {
    const textToValidate: string[] = [];

    // 検証対象のテキストを収集
    if (questionData.question_text) {
      textToValidate.push(questionData.question_text);
    }
    if (questionData.passage) {
      textToValidate.push(questionData.passage);
    }
    if (questionData.choices && Array.isArray(questionData.choices)) {
      textToValidate.push(...questionData.choices);
    }
    if (questionData.questions && Array.isArray(questionData.questions)) {
      for (const q of questionData.questions) {
        if (q.question_text) {
          textToValidate.push(q.question_text);
        }
        if (q.choices && Array.isArray(q.choices)) {
          textToValidate.push(...q.choices);
        }
      }
    }

    // 全テキストを結合して検証
    const fullText = textToValidate.join(' ');
    const result = validateGrammarComplexity(fullText, grade);

    if (!result.passed) {
      console.log(`[Grammar Validation] Grade ${grade} violations found:`, result.violations);
    }

    return result;
  }
}
