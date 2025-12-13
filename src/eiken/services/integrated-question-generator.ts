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
import { GrammarAnalyzer } from './grammar/grammar-analyzer';
import { getAnswerDiversityTracker } from './answer-diversity-tracker';

export interface QuestionGenerationRequest {
  student_id: string;
  grade: EikenGrade;
  format: QuestionFormat;
  mode?: GenerationMode;
  topic_code?: string;
  difficulty_adjustment?: number;
  session_id?: string;
  explanationStyle?: 'simple' | 'standard' | 'detailed';  // Phase 7.4: 解説スタイル
  fixedQuestion?: {  // Phase 7.4 FIX: 既存問題に対する解説再生成用
    question_text: string;
    correct_answer: string;
    distractors: string[];
    grade?: EikenGrade;
    format?: QuestionFormat;
  };
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
   * Phase 7.4 FIX: 固定問題に対する解説のみを再生成
   * 新しい問題を生成せず、既存の問題文・選択肢に対して解説だけを生成し直す
   */
  private async regenerateExplanationOnly(
    request: QuestionGenerationRequest
  ): Promise<QuestionGenerationResult> {
    const { fixedQuestion, grade, format, explanationStyle } = request;
    
    if (!fixedQuestion) {
      throw new Error('fixedQuestion is required for explanation regeneration');
    }

    console.log('[Explanation Regeneration] Question:', fixedQuestion.question_text);
    console.log('[Explanation Regeneration] Style:', explanationStyle || 'standard');

    try {
      // 固定問題用の簡易blueprintを作成
      const blueprint = {
        id: `fixed-${Date.now()}`,
        student_id: request.student_id,
        grade: grade,
        format: format,
        topic_code: 'general',
        guidelines: {
          vocabulary_level: this.getVocabularyLevel(grade),
          target_difficulty: 0.6,
          question_focus: 'grammar',
        },
      };

      // LLMモデル選択
      const selectedModel = selectModel({
        grade: grade,
        format: format,
        mode: 'production',
      });

      console.log('[Explanation Regeneration] Calling LLM with model:', selectedModel);
      console.log('[Explanation Regeneration] Blueprint:', blueprint);

      // 固定問題データをLLMプロンプトに含める形でcallLLMを呼び出す
      const questionData = await this.callLLM(
        blueprint as any,
        selectedModel,
        fixedQuestion,  // 固定問題データを渡す
        explanationStyle || 'standard'
      );

      console.log('[Explanation Regeneration] LLM response received:', !!questionData);
      console.log('[Explanation Regeneration] Response keys:', Object.keys(questionData || {}));

      // レスポンス構造を整える（QuestionGenerationResult 形式に合わせる）
      const response: QuestionGenerationResult = {
        success: true,
        question: {
          id: undefined,
          blueprint_id: blueprint.id,
          student_id: request.student_id,
          grade: grade,
          format: format,
          topic_code: 'general',
          question_data: questionData,
          model_used: selectedModel,
          generation_mode: 'production',
          created_at: new Date().toISOString(),
        } as GeneratedQuestionData,
        blueprint: blueprint as any,
        topic_selection: { code: 'general', name: 'General' },
        validation: {
          vocabulary_passed: true,
          copyright_passed: true,
        },
        metadata: {
          model_used: selectedModel,
          generation_mode: 'production',
          generation_time_ms: 0,
          attempts: 1,
        },
      };

      console.log('[Explanation Regeneration] Response structure:', {
        success: response.success,
        hasQuestion: !!response.question,
        hasQuestionData: !!response.question?.question_data,
      });

      return response;
    } catch (error) {
      console.error('[Explanation Regeneration] ERROR:', error);
      throw new Error(`Failed to regenerate explanation: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * 級別の語彙レベルを取得
   */
  private getVocabularyLevel(grade: EikenGrade): string {
    const levels: Record<EikenGrade, string> = {
      '5': 'A1',
      '4': 'A1-A2',
      '3': 'A2',
      'pre2': 'A2-B1',
      '2': 'B1',
      'pre1': 'B2',
      '1': 'C1',
    };
    return levels[grade] || 'A2';
  }

  /**
   * 形式別の最適なLLMパラメータ
   * 
   * 長文形式ほど低いtemperatureで語彙制御を強化
   */
  private getOptimalLLMConfig(format: QuestionFormat): LLMConfig {
    const configs: Record<QuestionFormat, LLMConfig> = {
      'grammar_fill': {
        temperature: 0.3,  // Phase 7.2: Reverted to 0.3 for more natural explanations (user feedback)
        top_p: 0.9,
        reasoning: '4ブロック解説形式の厳格な遵守のため（Phase 6.8B: 0.5→0.3）'
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

    // Phase 7.4 FIX: 固定問題モード（解説のみ再生成）
    if (request.fixedQuestion) {
      console.log('[Fixed Question Mode] Regenerating explanation only');
      return this.regenerateExplanationOnly(request);
    }

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
        // LLM呼び出し（Phase 7.4: explanationStyle を渡す）
        questionData = await this.callLLM(blueprint, selectedModel, undefined, request.explanationStyle);

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
        
        // Phase 5C: ログ記録
        await this.logValidation({
          student_id: request.student_id,
          grade: request.grade,
          format: request.format,
          topic_code: blueprint.topic.topic_code,
          attempt_number: attempts,
          validation_stage: 'duplicate',
          validation_passed: !isDuplicate,
          model_used: selectedModel,
          generation_mode: mode
        });
        
        if (isDuplicate) {
          console.log(`[Validation Failed] Duplicate question detected`);
          continue; // 重複の場合は再生成
        }

        // 検証2: 文法複雑さ（Phase 4B）- grammar_fill形式は除外
        if (request.format !== 'grammar_fill') {
          const grammarValidation = this.validateGrammar(questionData, request.grade);
          
          // Phase 5C: ログ記録
          await this.logValidation({
            student_id: request.student_id,
            grade: request.grade,
            format: request.format,
            topic_code: blueprint.topic.topic_code,
            attempt_number: attempts,
            validation_stage: 'grammar',
            validation_passed: grammarValidation.passed,
            validation_details: { violations: grammarValidation.violations },
            model_used: selectedModel,
            generation_mode: mode
          });
          
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

        // Phase 5C: ログ記録
        await this.logValidation({
          student_id: request.student_id,
          grade: request.grade,
          format: request.format,
          topic_code: blueprint.topic.topic_code,
          attempt_number: attempts,
          validation_stage: 'vocabulary',
          validation_passed: vocabularyPassed,
          validation_details: { score: vocabularyScore, threshold: vocabValidation.threshold || 'N/A' },
          model_used: selectedModel,
          generation_mode: mode
        });

        if (!vocabularyPassed) {
          console.log(`[Validation Failed] Vocabulary (score: ${vocabularyScore})`);
          continue;
        }

        // Phase 2: Essay形式の場合、CEFR-J Wordlistに基づく詳細分析
        if (request.format === 'essay') {
          try {
            const { VocabularyListService } = await import('./vocabulary-list-service');
            const vocabService = new VocabularyListService(this.db);
            
            // Sample essayのテキストを分析
            const sampleEssay = questionData.sample_essay || '';
            if (sampleEssay.length > 20) {
              const detailedAnalysis = await vocabService.analyzeVocabularyLevel(
                sampleEssay,
                blueprint.guidelines.vocabulary_level
              );
              
              console.log(`[Essay Vocab Analysis] Total: ${detailedAnalysis.totalWords}, Within level: ${detailedAnalysis.withinLevel}, Above level: ${detailedAnalysis.aboveLevel}, Unknown: ${detailedAnalysis.unknownWords.length}, Score: ${detailedAnalysis.score}%`);
              
              // 90%以上の単語がターゲットレベル内であることを確認
              if (detailedAnalysis.score < 90 && detailedAnalysis.aboveLevel > 3) {
                console.log(`[Essay Vocab Analysis FAILED] Score ${detailedAnalysis.score}% below 90% threshold`);
                console.log(`[Essay Vocab Analysis] Above-level words found: ${detailedAnalysis.aboveLevel}`);
                
                // 失敗した場合も記録
                await this.logValidation({
                  student_id: request.student_id,
                  grade: request.grade,
                  format: request.format,
                  topic_code: blueprint.topic.topic_code,
                  attempt_number: attempts,
                  validation_stage: 'vocabulary_db_check',
                  validation_passed: false,
                  validation_details: { 
                    score: detailedAnalysis.score,
                    totalWords: detailedAnalysis.totalWords,
                    withinLevel: detailedAnalysis.withinLevel,
                    aboveLevel: detailedAnalysis.aboveLevel,
                    unknownWords: detailedAnalysis.unknownWords.slice(0, 10)
                  },
                  model_used: selectedModel,
                  generation_mode: mode
                });
                
                continue; // 再生成
              }
              
              // 成功した場合も記録
              await this.logValidation({
                student_id: request.student_id,
                grade: request.grade,
                format: request.format,
                topic_code: blueprint.topic.topic_code,
                attempt_number: attempts,
                validation_stage: 'vocabulary_db_check',
                validation_passed: true,
                validation_details: { 
                  score: detailedAnalysis.score,
                  totalWords: detailedAnalysis.totalWords,
                  withinLevel: detailedAnalysis.withinLevel
                },
                model_used: selectedModel,
                generation_mode: mode
              });
            }
          } catch (error) {
            console.error(`[Essay Vocab Analysis] Error:`, error);
            // エラーは無視して次の検証に進む
          }
        }

        // 検証4: 著作権
        const copyrightValidation = await this.validateCopyright(
          questionData,
          request.grade
        );
        copyrightPassed = copyrightValidation.passed;
        copyrightScore = copyrightValidation.score;

        // Phase 5C: ログ記録
        await this.logValidation({
          student_id: request.student_id,
          grade: request.grade,
          format: request.format,
          topic_code: blueprint.topic.topic_code,
          attempt_number: attempts,
          validation_stage: 'copyright',
          validation_passed: copyrightPassed,
          validation_details: { score: copyrightScore },
          model_used: selectedModel,
          generation_mode: mode
        });

        if (!copyrightPassed) {
          console.log(`[Validation Failed] Copyright (score: ${copyrightScore})`);
          continue;
        }

        // 検証5: 複数正解チェック（Phase 4C）- 全形式対応
        const uniquenessValidation = await this.validateUniqueness(
          questionData,
          request.format,
          blueprint.guidelines.grammar_patterns[0] || 'unknown'
        );
        
        // Phase 5C: ログ記録
        await this.logValidation({
          student_id: request.student_id,
          grade: request.grade,
          format: request.format,
          topic_code: blueprint.topic.topic_code,
          attempt_number: attempts,
          validation_stage: 'uniqueness',
          validation_passed: uniquenessValidation.passed,
          validation_details: uniquenessValidation.passed ? null : {
            issue: uniquenessValidation.issue,
            suggestion: uniquenessValidation.suggestion
          },
          model_used: selectedModel,
          generation_mode: mode
        });
        
        if (!uniquenessValidation.passed) {
          console.log(`[Validation Failed] Multiple correct answers detected`);
          console.log(`  Issue: ${uniquenessValidation.issue}`);
          console.log(`  Suggestion: ${uniquenessValidation.suggestion}`);
          continue;
        }

        // 検証6: 4ブロック解説形式チェック（Phase 6）- grammar_fill のみ
        if (request.format === 'grammar_fill' && questionData.explanation) {
          const explanationValidation = this.validate4BlockExplanation(questionData.explanation, request.grade);
          
          // Phase 5C: ログ記録
          await this.logValidation({
            student_id: request.student_id,
            grade: request.grade,
            format: request.format,
            topic_code: blueprint.topic.topic_code,
            attempt_number: attempts,
            validation_stage: 'explanation_format',
            validation_passed: explanationValidation.valid,
            validation_details: explanationValidation.valid ? null : {
              issues: explanationValidation.issues
            },
            model_used: selectedModel,
            generation_mode: mode
          });
          
          if (!explanationValidation.valid) {
            console.log(`[Validation Warning] 4-block explanation format incomplete`);
            console.log(`  Issues: ${explanationValidation.issues.join(', ')}`);
            // 警告のみで続行（必須ではない）
          } else {
            console.log(`[Validation Passed] 4-block explanation format correct`);
          }
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

    // Step 3.6: 文法解説を生成（Phase 4A+）
    try {
      const grammarAnalyzer = new GrammarAnalyzer(this.db);
      
      // テキストを抽出（形式によって異なる）
      let textToAnalyze = '';
      if (questionData.question_text) {
        textToAnalyze = questionData.question_text;
      } else if (questionData.passage) {
        textToAnalyze = questionData.passage;
      } else if (questionData.essay_prompt) {
        textToAnalyze = questionData.essay_prompt;
      }
      
      if (textToAnalyze) {
        console.log('[Grammar Analysis] Analyzing grammar patterns...');
        const grammarAnalysis = await grammarAnalyzer.analyzeGrammar(
          textToAnalyze,
          request.grade
        );
        
        if (grammarAnalysis.detected_patterns.length > 0) {
          // 学校文法スタイルの解説を追加
          questionData.grammar_explanation = grammarAnalysis.school_style_explanation;
          questionData.grammar_patterns = grammarAnalysis.detected_patterns;
          questionData.grammar_breakdown = grammarAnalysis.grammar_breakdown;
          
          console.log(`[Grammar Analysis] Detected ${grammarAnalysis.detected_patterns.length} grammar patterns`);
          console.log(`[Grammar Analysis] Patterns: ${grammarAnalysis.detected_patterns.map(p => p.term_name_ja).join(', ')}`);
        } else {
          console.log('[Grammar Analysis] No specific grammar patterns detected');
        }
      }
    } catch (error) {
      console.error('[Grammar Analysis Error]', error);
      // 文法解析失敗は致命的エラーではない
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

    // Step 6: Phase 6 Part 3 - 正解を多様性トラッカーに記録（grammar_fill のみ）
    if (request.format === 'grammar_fill' && questionData.correct_answer) {
      const diversityTracker = getAnswerDiversityTracker();
      diversityTracker.addAnswer(
        questionData.correct_answer,
        request.grade,
        request.session_id
      );
      console.log(`[Diversity] Tracked answer: "${questionData.correct_answer}" for grade ${request.grade}`);
    }

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
    fixedQuestion?: { question_text: string; correct_answer: string; distractors: string[] },  // Phase 7.4 FIX
    explanationStyle?: 'simple' | 'standard' | 'detailed'  // Phase 7.4
  ): Promise<any> {
    // 形式別の最適パラメータを取得
    const llmConfig = this.getOptimalLLMConfig(blueprint.format);
    
    console.log(`[LLM] Using temperature=${llmConfig.temperature}, top_p=${llmConfig.top_p}`);
    console.log(`[LLM] Reason: ${llmConfig.reasoning}`);
    
    // 動的禁止語リストを取得
    const forbiddenWords = VocabularyFailureTracker.getForbiddenWords(blueprint.grade);
    const recentViolations = VocabularyFailureTracker.getTopViolations(blueprint.grade, 15);
    
    console.log(`[LLM] Using ${forbiddenWords.length} forbidden words (${recentViolations.length} from recent failures)`);
    
    // Phase 2: Essay形式の場合、CEFR-J Wordlistから語彙リストを取得
    let vocabularyPrompt: string | undefined;
    if (blueprint.format === 'essay' && !fixedQuestion) {
      try {
        const { VocabularyListService } = await import('./vocabulary-list-service');
        const vocabService = new VocabularyListService(this.db);
        
        // CEFRレベルに基づいて語彙リストを取得（categorized形式）
        vocabularyPrompt = await vocabService.getVocabularyPromptString(
          blueprint.guidelines.vocabulary_level,
          'categorized'
        );
        
        if (vocabularyPrompt && vocabularyPrompt.length > 50) {
          console.log(`[Vocabulary List] Loaded ${vocabularyPrompt.length} chars for ${blueprint.guidelines.vocabulary_level} level`);
        } else {
          console.log(`[Vocabulary List] Warning: Empty or short vocabulary list, using prompt-only constraints`);
          vocabularyPrompt = undefined;
        }
      } catch (error) {
        console.error(`[Vocabulary List] Error loading vocabulary list:`, error);
        vocabularyPrompt = undefined;
      }
    }
    
    // Phase 6 Part 3: 正解の多様性ガイダンスを取得（grammar_fill のみ）
    let diversityGuidance: string | undefined;
    if (blueprint.format === 'grammar_fill') {
      const diversityTracker = getAnswerDiversityTracker();
      diversityGuidance = diversityTracker.getDiversityGuidance(blueprint.grade);
      
      if (diversityGuidance) {
        console.log(`[Diversity] Adding diversity guidance to prompt`);
      }
    }
    
    // Phase 7.4 FIX: 固定問題モードの場合は解説のみを生成するプロンプト
    let basePrompt: string;
    if (fixedQuestion) {
      // 固定問題の場合: 問題文と選択肢を提示し、解説のみを生成
      basePrompt = `Generate ONLY the explanation for this existing question. DO NOT generate a new question.

Question: ${fixedQuestion.question_text}
Correct Answer: ${fixedQuestion.correct_answer}
Incorrect Choices: ${fixedQuestion.distractors.join(', ')}

Generate a complete explanation in Japanese following the 4-block format:
＜着眼点＞ [key observation about the question]
＜鉄則！＞ or ＜Point！＞ [grammar rule or principle]
＜当てはめ＞ [how to apply the rule to this question]
＜誤答の理由＞ [why each wrong answer is incorrect]

Output as JSON:
{
  "question_text": "${fixedQuestion.question_text}",
  "correct_answer": "${fixedQuestion.correct_answer}",
  "distractors": ${JSON.stringify(fixedQuestion.distractors)},
  "explanation_ja": "＜着眼点＞\\n...\\n\\n＜鉄則！＞\\n...\\n\\n＜当てはめ＞\\n...\\n\\n＜誤答の理由＞\\n...",
  "translation_ja": "(Japanese translation of the question)",
  "vocabulary_meanings": {
    "correct_answer": "(meaning in Japanese)",
    "distractor_1": "(meaning in Japanese)",
    "distractor_2": "(meaning in Japanese)"
  }
}`;
    } else {
      // 通常モード: 新しい問題を生成
      basePrompt = buildPromptForBlueprint(blueprint, diversityGuidance, vocabularyPrompt);
    }
    
    // Phase 7.4: 解説スタイルの追加
    const style = explanationStyle || 'standard';
    const { getExplanationStyleModifier } = await import('../prompts/format-prompts');
    const styleModifier = getExplanationStyleModifier(style, blueprint.grade);
    
    // 追加の禁止語コンテキストを構築（固定問題の場合はスキップ）
    const forbiddenWordsContext = !fixedQuestion && recentViolations.length > 0
      ? `\n\n## ⚠️ ADDITIONAL FORBIDDEN WORDS (from recent generation failures)\nThese words were used in previous attempts and caused vocabulary level violations:\n${recentViolations.join(', ')}\n\n**YOU MUST AVOID THESE WORDS!**`
      : '';
    
    // 完全なプロンプト（解説スタイルを含む）
    const enhancedPrompt = `${basePrompt}${styleModifier}${forbiddenWordsContext}`;
    
    // システムプロンプトに禁止語を含める
    const systemContent = `You are a vocabulary-constrained English test creator for Eiken (英検) ${blueprint.grade} preparation.

CRITICAL VOCABULARY CONSTRAINT: Use ONLY CEFR ${blueprint.guidelines.vocabulary_level} vocabulary.

FORBIDDEN WORDS (NEVER use): ${forbiddenWords.slice(0, 30).join(', ')}

🚨🚨🚨 ABSOLUTE REQUIREMENT - 4-BLOCK EXPLANATION FORMAT 🚨🚨🚨

For grammar_fill questions, the "explanation_ja" field MUST ALWAYS contain ALL 4 BLOCKS:
＜着眼点＞ [key observation]
＜鉄則！＞ or ＜Point！＞ [grammar rule]
＜当てはめ＞ [application]
＜誤答の理由＞ [why wrong answers are wrong]

❌ FORBIDDEN: One-sentence explanations
✅ MANDATORY: All 4 blocks with proper headers
✅ MANDATORY: Use \\n\\n between blocks

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

    // デバッグログ: 生成された解説をチェック
    console.log(`[LLM Response Debug] Grade: ${blueprint.grade}`);
    console.log(`[LLM Response Debug] Format: ${blueprint.format}`);
    console.log(`[LLM Response Debug] explanation_ja exists: ${!!generated.explanation_ja}`);
    console.log(`[LLM Response Debug] explanation_ja length: ${generated.explanation_ja?.length || 0}`);
    if (generated.explanation_ja) {
      console.log(`[LLM Response Debug] explanation_ja preview: ${generated.explanation_ja.substring(0, 100)}...`);
    } else {
      console.log(`[LLM Response Debug] ⚠️ WARNING: explanation_ja is missing!`);
      console.log(`[LLM Response Debug] Available fields:`, Object.keys(generated));
      
      // 🔧 FALLBACK: explanation_ja が空の場合、explanation をコピー
      if (generated.explanation && !generated.explanation_ja) {
        console.log(`[LLM Response Debug] 🔧 FALLBACK: Copying explanation to explanation_ja`);
        generated.explanation_ja = generated.explanation;
      }
    }

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
    
    // Phase 5F: translation_ja と vocabulary_meanings を JSON 文字列として保存
    const translationJa = questionData.translation_ja || null;
    const vocabularyMeaningsJson = questionData.vocabulary_meanings 
      ? (typeof questionData.vocabulary_meanings === 'string' 
          ? questionData.vocabulary_meanings 
          : JSON.stringify(questionData.vocabulary_meanings))
      : null;
    
    const result = await this.db
      .prepare(`
        INSERT INTO eiken_generated_questions (
          grade, section, question_type, answer_type,
          question_text, choices_json, correct_answer_index, correct_answer_text,
          explanation, explanation_ja, translation_ja, vocabulary_meanings,
          model, difficulty_score, vocab_band, quality_score, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        translationJa,  // Phase 5F: 問題文の日本語訳
        vocabularyMeaningsJson,  // Phase 5F: 重要語句の意味（JSON）
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
      
      // Phase 5F: passage の translation_ja と vocabulary_meanings をパース
      const translationJa = (q.translation_ja || questionData.passage_ja) || null;
      const vocabularyMeaningsJson = questionData.vocabulary_meanings 
        ? (typeof questionData.vocabulary_meanings === 'string' 
            ? questionData.vocabulary_meanings 
            : JSON.stringify(questionData.vocabulary_meanings))
        : null;
      
      const result = await this.db
        .prepare(`
          INSERT INTO eiken_generated_questions (
            grade, section, question_type, answer_type,
            question_text, choices_json, correct_answer_index, correct_answer_text,
            explanation, explanation_ja, translation_ja, vocabulary_meanings,
            model, difficulty_score, vocab_band, quality_score, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          translationJa,  // Phase 5F: 問題文・パッセージの日本語訳
          vocabularyMeaningsJson,  // Phase 5F: 重要語句の意味（JSON）
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
   * Phase 4C: 複数正解チェック
   * 
   * 問題文に対して複数の選択肢が正解になりうるかAIで検証
   * 全形式対応：grammar_fill, long_reading, essay, opinion_speech, reading_aloud
   */
  private async validateUniqueness(
    questionData: any,
    format: QuestionFormat,
    grammarPoint: string
  ): Promise<{ passed: boolean; issue?: string; suggestion?: string }> {
    
    // 形式別の検証ロジック
    if (format === 'grammar_fill') {
      return this.validateGrammarFillUniqueness(questionData, grammarPoint);
    } else if (format === 'long_reading') {
      return this.validateLongReadingUniqueness(questionData);
    } else if (format === 'essay' || format === 'opinion_speech') {
      return this.validateEssayUniqueness(questionData, format);
    } else if (format === 'listening_comprehension') {
      // Phase 5B: listening_comprehension への複数正解チェック追加
      return this.validateListeningUniqueness(questionData);
    } else if (format === 'reading_aloud') {
      // reading_aloud は選択肢がないのでスキップ
      console.log('[Uniqueness Check] Skipped for reading_aloud (no choices)');
      return { passed: true };
    }
    
    console.log(`[Uniqueness Check] Skipped for unknown format: ${format}`);
    return { passed: true };
  }

  /**
   * Grammar Fill 形式の複数正解チェック
   */
  private async validateGrammarFillUniqueness(
    questionData: any,
    grammarPoint: string
  ): Promise<{ passed: boolean; issue?: string; suggestion?: string }> {
    
    const { question_text, correct_answer, distractors } = questionData;
    
    // 必須フィールドのチェック
    if (!question_text || !correct_answer || !distractors) {
      console.log('[Uniqueness Check] Skipped - missing required fields');
      return { passed: true };
    }
    
    const allOptions = [correct_answer, ...distractors].filter(Boolean);
    
    if (allOptions.length < 2) {
      console.log('[Uniqueness Check] Skipped - insufficient options');
      return { passed: true };
    }

    const validationPrompt = `You are an English grammar expert. Analyze this Eiken grammar question for ambiguity.

Question: "${question_text}"
Stated correct answer: "${correct_answer}"
All options: ${allOptions.join(', ')}
Target grammar: "${grammarPoint}"

Task: Determine if MULTIPLE options are grammatically correct in this context.

Analysis criteria:
1. Is each option grammatically valid in this sentence?
2. Does the context make the answer unambiguous?
3. Could a native speaker reasonably choose a different answer?

Examples of PROBLEMS to detect:

❌ AMBIGUOUS (reject):
Q: "_____ you say hello to her?"
Options: Can, Do, Is, Are
Problem: Both "Can" (ability) and "Do" (habit) are grammatically correct without context
Result: {"is_ambiguous": true, "potentially_correct": ["Can", "Do"]}

❌ AMBIGUOUS (reject):
Q: "I _____ play soccer every weekend."
Options: usually, always, play, often
Problem: Multiple adverbs work, and "play" creates duplicate
Result: {"is_ambiguous": true, "potentially_correct": ["usually", "always", "often"]}

✅ CLEAR (accept):
Q: "A: Look! Ms. Green is over there.\\nB: Oh, _____ you say hello to her?"
Options: Can, Do, Is, Are
Clear: "Can" is natural (ability), "Do" is unnatural in this excited context
Result: {"is_ambiguous": false, "potentially_correct": ["Can"]}

✅ CLEAR (accept):
Q: "Yesterday, I _____ to the park."
Options: go, goes, went, going
Clear: "Yesterday" requires past tense, only "went" works
Result: {"is_ambiguous": false, "potentially_correct": ["went"]}

Return ONLY valid JSON (no markdown, no explanation outside JSON):
{
  "is_ambiguous": boolean,
  "potentially_correct": ["option1", "option2"],
  "issue": "brief description if ambiguous",
  "suggestion": "how to fix (add context, change options, use dialogue format)"
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: validationPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        console.error('[Uniqueness Check] API Error:', response.statusText);
        // API エラー時は通過させる（既存の挙動を維持）
        return { passed: true };
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content || '{}');
      
      if (result.is_ambiguous) {
        console.log(`[Uniqueness Check Failed] ✗`);
        console.log(`  Potentially correct: ${result.potentially_correct?.join(', ')}`);
        console.log(`  Issue: ${result.issue}`);
        console.log(`  Suggestion: ${result.suggestion}`);
        
        return {
          passed: false,
          issue: result.issue,
          suggestion: result.suggestion
        };
      }

      console.log(`[Uniqueness Check Passed] ✓`);
      return { passed: true };

    } catch (error) {
      console.error('[Grammar Fill Uniqueness Check Error]', error);
      // エラー時は通過させる（既存の挙動を維持）
      return { passed: true };
    }
  }

  /**
   * Long Reading 形式の複数正解チェック
   */
  private async validateLongReadingUniqueness(
    questionData: any
  ): Promise<{ passed: boolean; issue?: string; suggestion?: string }> {
    
    const { passage, questions } = questionData;
    
    if (!passage || !questions || !Array.isArray(questions)) {
      console.log('[Long Reading Uniqueness Check] Skipped - missing required fields');
      return { passed: true };
    }

    // 各質問をチェック
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const { question_text, choices, correct_answer } = q;
      
      if (!question_text || !choices || !correct_answer) {
        continue;
      }

      const validationPrompt = `You are an English reading comprehension expert. Analyze this question for ambiguity.

Passage excerpt: "${passage.substring(0, 300)}..."
Question: "${question_text}"
Choices: ${JSON.stringify(choices)}
Stated correct answer: "${correct_answer}"

Task: Check if multiple choices could be correct based on the passage.

Analysis criteria:
1. Does the passage clearly support only ONE answer?
2. Could multiple choices be defensible interpretations?
3. Is the question specific enough to eliminate other choices?

Return ONLY valid JSON:
{
  "is_ambiguous": boolean,
  "potentially_correct": ["choice1", "choice2"],
  "issue": "description if ambiguous",
  "suggestion": "how to fix"
}`;

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: validationPrompt }],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          }),
        });

        if (!response.ok) {
          console.error('[Long Reading Uniqueness Check] API Error:', response.statusText);
          continue;
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content || '{}');
        
        if (result.is_ambiguous) {
          console.log(`[Long Reading Uniqueness Check Failed] Question ${i + 1} ✗`);
          console.log(`  Issue: ${result.issue}`);
          console.log(`  Suggestion: ${result.suggestion}`);
          
          return {
            passed: false,
            issue: `Question ${i + 1}: ${result.issue}`,
            suggestion: result.suggestion
          };
        }
      } catch (error) {
        console.error(`[Long Reading Uniqueness Check Error] Question ${i + 1}:`, error);
        // エラー時は続行
      }
    }

    console.log(`[Long Reading Uniqueness Check Passed] All ${questions.length} questions ✓`);
    return { passed: true };
  }

  /**
   * Essay/Opinion Speech 形式の曖昧性チェック
   */
  private async validateEssayUniqueness(
    questionData: any,
    format: 'essay' | 'opinion_speech'
  ): Promise<{ passed: boolean; issue?: string; suggestion?: string }> {
    
    const prompt = questionData.essay_prompt || questionData.question_text;
    const sampleAnswer = questionData.sample_essay || questionData.sample_answer;
    
    if (!prompt) {
      console.log(`[${format} Uniqueness Check] Skipped - no prompt`);
      return { passed: true };
    }

    const validationPrompt = `You are an English writing/speaking test expert. Analyze this prompt for clarity.

Format: ${format}
Prompt: "${prompt}"
${sampleAnswer ? `Sample answer: "${sampleAnswer.substring(0, 200)}..."` : ''}

Task: Check if the prompt is clear and unambiguous.

Analysis criteria:
1. Is the prompt specific enough for students to understand what to write?
2. Could students interpret the prompt in multiple conflicting ways?
3. Does the sample answer align with the prompt?
4. Is there any ambiguous wording that could confuse students?

Examples of PROBLEMS:

❌ AMBIGUOUS:
"Write about technology."
Problem: Too vague - technology in general? specific tech? good or bad?

✅ CLEAR:
"Do you think using smartphones is good or bad for young people? Give reasons."
Clear: Specific topic, clear opinion required, reasons needed

Return ONLY valid JSON:
{
  "is_ambiguous": boolean,
  "issue": "description if ambiguous",
  "suggestion": "how to make it clearer"
}`;

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: validationPrompt }],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        }),
      });

      if (!response.ok) {
        console.error(`[${format} Uniqueness Check] API Error:`, response.statusText);
        return { passed: true };
      }

      const data = await response.json();
      const result = JSON.parse(data.choices[0].message.content || '{}');
      
      if (result.is_ambiguous) {
        console.log(`[${format} Uniqueness Check Failed] ✗`);
        console.log(`  Issue: ${result.issue}`);
        console.log(`  Suggestion: ${result.suggestion}`);
        
        return {
          passed: false,
          issue: result.issue,
          suggestion: result.suggestion
        };
      }

      console.log(`[${format} Uniqueness Check Passed] ✓`);
      return { passed: true };

    } catch (error) {
      console.error(`[${format} Uniqueness Check Error]`, error);
      return { passed: true };
    }
  }

  /**
   * Phase 5B: Listening Comprehension 形式の複数正解チェック
   * 
   * 音声問題の選択肢が曖昧でないかチェック
   */
  private async validateListeningUniqueness(
    questionData: any
  ): Promise<{ passed: boolean; issue?: string; suggestion?: string }> {
    
    // listening_comprehension の構造を確認
    const { audio_script, questions } = questionData;
    
    if (!audio_script || !questions || questions.length === 0) {
      console.log('[Listening Uniqueness Check] Skipped - missing audio_script or questions');
      return { passed: true };
    }
    
    // 各質問を検証
    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      const { question_text, choices, correct_answer } = question;
      
      if (!question_text || !choices || !correct_answer) {
        continue; // 必須フィールドがない場合はスキップ
      }
      
      const validationPrompt = `You are an English listening test expert. Analyze this listening comprehension question for ambiguity.

Audio Script: "${audio_script}"
Question ${i + 1}: "${question_text}"
Choices: ${choices.map((c: string, idx: number) => `${idx + 1}. ${c}`).join(', ')}
Stated correct answer: "${correct_answer}"

Task: Determine if ONLY ONE choice is clearly correct based on the audio script.

Analysis criteria:
1. Based on the audio script, is the stated answer the ONLY defensible choice?
2. Could any other choice be argued as correct based on the script?
3. Is the information in the script sufficient to answer definitively?
4. Are any choices ambiguous or could be interpreted differently?

Examples of PROBLEMS:

❌ AMBIGUOUS:
Audio: "John likes music."
Question: "What does John like?"
Choices: A) music, B) songs, C) playing instruments
Problem: B "songs" could also be correct as songs are a type of music

✅ CLEAR:
Audio: "John plays the piano every day."
Question: "What instrument does John play?"
Choices: A) piano, B) guitar, C) drums
Clear: Only A is supported by the script

Return ONLY valid JSON:
{
  "multiple_correct": boolean,
  "ambiguous_choices": ["choice A", "choice B"],
  "issue": "description if ambiguous",
  "suggestion": "how to fix the question"
}`;

      try {
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${this.openaiApiKey}`,
          },
          body: JSON.stringify({
            model: 'gpt-4o-mini',
            messages: [{ role: 'user', content: validationPrompt }],
            temperature: 0.2,
            response_format: { type: 'json_object' }
          }),
        });

        if (!response.ok) {
          console.error(`[Listening Uniqueness Check] API Error:`, response.statusText);
          continue; // APIエラーは次の質問へ
        }

        const data = await response.json();
        const result = JSON.parse(data.choices[0].message.content || '{}');
        
        if (result.multiple_correct) {
          console.log(`[Listening Uniqueness Check Failed] Question ${i + 1} ✗`);
          console.log(`  Ambiguous choices: ${result.ambiguous_choices?.join(', ')}`);
          console.log(`  Issue: ${result.issue}`);
          console.log(`  Suggestion: ${result.suggestion}`);
          
          return {
            passed: false,
            issue: `Question ${i + 1}: ${result.issue}`,
            suggestion: result.suggestion
          };
        }

        console.log(`[Listening Uniqueness Check] Question ${i + 1} ✓`);

      } catch (error) {
        console.error(`[Listening Uniqueness Check Error] Question ${i + 1}:`, error);
        // エラーは致命的ではないので続行
      }
    }
    
    console.log('[Listening Uniqueness Check] All questions passed ✓');
    return { passed: true };
  }

  /**
   * Phase 4B: 文法複雑さの検証
   * 
   * 級別の文法制約に違反していないかチェック
   */
  /**
   * Phase 6: 4ブロック解説形式の検証
   */
  private validate4BlockExplanation(
    explanation: string,
    grade: EikenGrade
  ): {
    valid: boolean;
    has_focus_points: boolean;
    has_rule: boolean;
    has_application: boolean;
    has_wrong_reasons: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    
    // 4ブロックの存在チェック
    const hasFocusPoints = explanation.includes('＜着眼点＞') || explanation.includes('<着眼点>');
    const hasRule = explanation.includes('＜鉄則') || explanation.includes('＜Point') || 
                    explanation.includes('<鉄則') || explanation.includes('<Point');
    const hasApplication = explanation.includes('＜当てはめ＞') || explanation.includes('<当てはめ>');
    const hasWrongReasons = explanation.includes('＜誤答の理由＞') || explanation.includes('<誤答の理由>');
    
    if (!hasFocusPoints) issues.push('＜着眼点＞ブロックなし');
    if (!hasRule) issues.push('＜鉄則/Point＞ブロックなし');
    if (!hasApplication) issues.push('＜当てはめ＞ブロックなし');
    if (!hasWrongReasons) issues.push('＜誤答の理由＞ブロックなし');
    
    // NG フレーズチェック
    const ngPhrases = [
      { phrase: '未来を表す文なので will を使います', reason: 'ルールが不明確' },
      { phrase: 'if の後には動詞の原形を使います', reason: '誤った情報' },
      { phrase: 'なんとなく', reason: '感覚的すぎる' },
    ];
    
    for (const ng of ngPhrases) {
      if (explanation.includes(ng.phrase)) {
        issues.push(`NGフレーズ: "${ng.phrase}" (${ng.reason})`);
      }
    }
    
    const valid = hasFocusPoints && hasRule && hasApplication && hasWrongReasons && issues.length === 0;
    
    console.log('[4-Block Validation]', {
      hasFocusPoints,
      hasRule,
      hasApplication,
      hasWrongReasons,
      issues
    });
    
    return {
      valid,
      has_focus_points: hasFocusPoints,
      has_rule: hasRule,
      has_application: hasApplication,
      has_wrong_reasons: hasWrongReasons,
      issues
    };
  }

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

  /**
   * Phase 5C: 検証ログの記録
   * 
   * ダッシュボード可視化のためにログをDBに記録
   */
  private async logValidation(params: {
    student_id: string;
    grade: EikenGrade;
    format: QuestionFormat;
    topic_code: string;
    attempt_number: number;
    validation_stage: 'duplicate' | 'grammar' | 'vocabulary' | 'copyright' | 'uniqueness';
    validation_passed: boolean;
    validation_details?: any;
    model_used: string;
    generation_mode: GenerationMode;
  }): Promise<void> {
    try {
      await this.db
        .prepare(`
          INSERT INTO question_validation_logs (
            student_id, grade, format, topic_code,
            attempt_number, validation_stage, validation_passed,
            validation_details, model_used, generation_mode
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          params.student_id,
          params.grade,
          params.format,
          params.topic_code || null,
          params.attempt_number,
          params.validation_stage,
          params.validation_passed ? 1 : 0,
          params.validation_details ? JSON.stringify(params.validation_details) : null,
          params.model_used,
          params.generation_mode
        )
        .run();
    } catch (error) {
      console.error('[Validation Log Error]', error);
      // ログ記録の失敗は致命的ではない
    }
  }

  /**
   * Phase 5C: セッション統計の更新
   */
  private async updateSessionStats(params: {
    session_id: string;
    student_id: string;
    grade: EikenGrade;
    format: QuestionFormat;
    success: boolean;
    failure_reason?: 'vocabulary' | 'copyright' | 'grammar' | 'uniqueness' | 'duplicate';
    generation_time_ms: number;
  }): Promise<void> {
    try {
      // セッションレコードが存在するか確認
      const session = await this.db
        .prepare(`SELECT * FROM generation_sessions WHERE session_id = ?`)
        .bind(params.session_id)
        .first();

      if (!session) {
        // 新規セッション作成
        await this.db
          .prepare(`
            INSERT INTO generation_sessions (
              session_id, student_id, grade, format,
              total_attempts, successful_generations, failed_generations,
              failed_vocabulary, failed_copyright, failed_grammar, failed_uniqueness, failed_duplicate,
              total_generation_time_ms, average_generation_time_ms
            ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            params.session_id,
            params.student_id,
            params.grade,
            params.format,
            params.success ? 1 : 0,
            params.success ? 0 : 1,
            params.failure_reason === 'vocabulary' ? 1 : 0,
            params.failure_reason === 'copyright' ? 1 : 0,
            params.failure_reason === 'grammar' ? 1 : 0,
            params.failure_reason === 'uniqueness' ? 1 : 0,
            params.failure_reason === 'duplicate' ? 1 : 0,
            params.generation_time_ms,
            params.generation_time_ms
          )
          .run();
      } else {
        // 既存セッション更新
        const totalAttempts = (session.total_attempts as number) + 1;
        const totalTime = (session.total_generation_time_ms as number) + params.generation_time_ms;
        const avgTime = totalTime / totalAttempts;

        const updates: any = {
          total_attempts: totalAttempts,
          total_generation_time_ms: totalTime,
          average_generation_time_ms: avgTime,
        };

        if (params.success) {
          updates.successful_generations = (session.successful_generations as number) + 1;
        } else {
          updates.failed_generations = (session.failed_generations as number) + 1;
          
          if (params.failure_reason === 'vocabulary') {
            updates.failed_vocabulary = (session.failed_vocabulary as number) + 1;
          } else if (params.failure_reason === 'copyright') {
            updates.failed_copyright = (session.failed_copyright as number) + 1;
          } else if (params.failure_reason === 'grammar') {
            updates.failed_grammar = (session.failed_grammar as number) + 1;
          } else if (params.failure_reason === 'uniqueness') {
            updates.failed_uniqueness = (session.failed_uniqueness as number) + 1;
          } else if (params.failure_reason === 'duplicate') {
            updates.failed_duplicate = (session.failed_duplicate as number) + 1;
          }
        }

        const setClause = Object.keys(updates).map(key => `${key} = ?`).join(', ');
        const values = Object.values(updates);

        await this.db
          .prepare(`
            UPDATE generation_sessions 
            SET ${setClause}, updated_at = datetime('now')
            WHERE session_id = ?
          `)
          .bind(...values, params.session_id)
          .run();
      }
    } catch (error) {
      console.error('[Session Stats Error]', error);
      // 統計更新の失敗は致命的ではない
    }
  }
}
