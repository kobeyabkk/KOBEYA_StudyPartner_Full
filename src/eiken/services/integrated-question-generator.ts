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
import { validateVocabulary as validateVocabularyLevel } from '../lib/vocabulary-validator';
import { validateGeneratedQuestion } from './copyright-validator';

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

    // Step 3: 問題生成（最大3回リトライ）
    const maxAttempts = 3;
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

        // 検証: 語彙レベル
        const vocabValidation = await this.validateVocabulary(
          questionData,
          request.grade
        );
        vocabularyPassed = vocabValidation.passed;
        vocabularyScore = vocabValidation.score;

        if (!vocabularyPassed) {
          console.log(`[Validation Failed] Vocabulary (score: ${vocabularyScore})`);
          continue;
        }

        // 検証: 著作権
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

        // 両方パス！
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

    // Step 4: データベースに保存（productionモードのみ）
    let savedQuestion: GeneratedQuestionData | undefined;
    if (mode === 'production') {
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
      },
    };
  }

  /**
   * LLM呼び出し
   */
  private async callLLM(blueprint: Blueprint, model: string): Promise<any> {
    const prompt = buildPromptForBlueprint(blueprint);

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
            content: 'You are an expert English test creator for Eiken (英検) preparation. Always respond with valid JSON.' 
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.7,
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
   * 語彙レベル検証
   */
  private async validateVocabulary(
    questionData: any,
    grade: EikenGrade
  ): Promise<{ passed: boolean; score: number }> {
    // 問題テキストを抽出（形式によって異なる）
    let textToValidate = '';
    
    if (questionData.question_text) {
      textToValidate += questionData.question_text + ' ';
    }
    if (questionData.passage) {
      textToValidate += questionData.passage + ' ';
    }
    if (questionData.choices) {
      textToValidate += questionData.choices.join(' ') + ' ';
    }

    const validation = await validateVocabularyLevel(textToValidate, grade);
    
    return {
      passed: validation.is_valid,
      score: validation.score || 0,
    };
  }

  /**
   * 著作権検証
   */
  private async validateCopyright(
    questionData: any,
    grade: EikenGrade
  ): Promise<{ passed: boolean; score: number }> {
    // 簡易的な実装（実際はより詳細な検証が必要）
    const textToCheck = JSON.stringify(questionData);
    
    const validation = await validateGeneratedQuestion(
      {
        questionText: textToCheck,
        choices: questionData.choices || [],
        correctAnswerIndex: 0,
        explanation: questionData.explanation || '',
        difficulty: 0.5,
        topic: '',
        copyrightSafe: true,
        copyrightScore: 1.0,
        questionNumber: 1,
      },
      this.db,
      grade
    );

    return {
      passed: validation.copyright_safe,
      score: validation.copyright_score,
    };
  }

  /**
   * データベースに保存
   */
  private async saveQuestion(data: GeneratedQuestionData): Promise<GeneratedQuestionData> {
    const result = await this.db
      .prepare(`
        INSERT INTO eiken_generated_questions (
          blueprint_id, student_id, grade, format, topic_code,
          question_data, model_used, generation_mode,
          validation_passed, vocabulary_score, copyright_score,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        data.blueprint_id,
        data.student_id,
        data.grade,
        data.format,
        data.topic_code,
        JSON.stringify(data.question_data),
        data.model_used,
        data.generation_mode,
        data.validation_passed ? 1 : 0,
        data.vocabulary_score,
        data.copyright_score,
        data.created_at
      )
      .run();

    return {
      ...data,
      id: result.meta.last_row_id,
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
        sessionId,
        new Date().toISOString()
      )
      .run();
  }
}
