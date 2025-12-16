/**
 * 英検API用カスタムフック
 * 
 * APIエンドポイントとの通信を簡単にするためのReact Hook
 */

import { useState } from 'react';
import type { EikenGrade, QuestionType } from '../eiken/types';

// ==================== 型定義 ====================

// Phase 3 API対応: 新しいリクエスト型
export interface Phase3QuestionGenerationRequest {
  student_id: string;
  grade: EikenGrade;
  format: 'grammar_fill' | 'long_reading' | 'essay' | 'opinion_speech' | 'reading_aloud';
  count: number;
  difficulty_preference?: 'adaptive' | 'fixed';
  difficulty_level?: number;
  topic_hints?: string[];
  based_on_analysis_id?: number;
}

// 後方互換性のために保持
export interface QuestionGenerationRequest {
  grade: EikenGrade;
  format?: string;  // Phase 3
  section?: string;  // 従来API
  questionType?: QuestionType;  // 従来API
  count: number;
  difficulty?: number;
  topicHints?: string[];
  basedOnAnalysisId?: number;
}

// Phase 3 APIレスポンス型
export interface Phase3Question {
  id?: number;
  format: string;
  grade: string;
  question_data: any;  // 実際の問題データはここに入っている
  question_text?: string;
  choices_json?: string;
  correct_answer?: string;
  explanation?: string;
  vocabulary_notes_json?: string;  // Phase 4A: 語彙notes
  created_at?: string;
}

export interface Phase3GenerationResult {
  success: boolean;
  data?: {
    question: Phase3Question;
    blueprint?: any;
    topic_selection?: any;
    validation?: {
      vocabulary_coverage: number;
      text_profile: any;
      threshold_used: number;  // Phase 4A: 使用された閉値
      notes_added?: number;     // Phase 4A: 追加された語注数
    };
    metadata?: {
      generated_at: string;
      llm_model: string;
    };
  };
  error?: {
    message: string;
    code: string;
  };
}

// 従来APIレスポンス型 (後方互換性)
export interface GeneratedQuestion {
  questionNumber: number;
  questionText: string;
  passage?: string; // long_reading形式の場合に使用
  passageJa?: string; // long_reading形式の問題文の日本語訳
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  explanation_ja?: string; // Phase 6 Part 2: 4ブロック形式の日本語解説
  explanationJa?: string; // Phase 6 Part 2: 4ブロック形式の日本語解説 (alias)
  translation_ja?: string; // Phase 5F: 問題文の日本語訳
  translationJa?: string; // Phase 5F: 問題文の日本語訳 (alias)
  vocabulary_meanings?: Record<string, string>; // Phase 5F: 重要語句の意味
  difficulty: number;
  topic: string;
  copyrightSafe: boolean;
  copyrightScore: number;
  _raw?: any; // 元のAPIレスポンス（distractors配列などへのアクセス用）
}

// 従来APIレスポンス型 (後方互換性)
export interface GenerationResult {
  success: boolean;
  generated: GeneratedQuestion[];
  rejected: number;
  totalAttempts: number;
  saved: number;
  error?: string;
}

export interface StatsResult {
  success: boolean;
  total: number;
  byGradeAndSection?: Array<{
    grade: string;
    section: string;
    count: number;
    avg_difficulty: number;
    avg_copyright_score: number;
  }>;
  byGrade?: Array<{
    grade: string;
    count: number;
    avg_difficulty: number;
  }>;
}

// ==================== カスタムフック ====================

/**
 * 英検問題生成API用フック
 */
export function useEikenGenerate() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResult | null>(null);

  const generateQuestions = async (
    request: QuestionGenerationRequest,
    onProgressCallback?: (current: number, total: number, question?: GeneratedQuestion) => void
  ) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const requestedQuestionCount = request.count || 1;
      
      // long_reading形式の場合、必要なパッセージ数を計算
      // 平均3.5問/パッセージと仮定
      const isLongReading = request.format === 'long_reading';
      const passageCount = isLongReading 
        ? Math.ceil(requestedQuestionCount / 3.5) // 5問 → 2パッセージ, 10問 → 3パッセージ
        : requestedQuestionCount;
      
      console.log(`📊 Generating ${isLongReading ? passageCount + ' passages for ~' + requestedQuestionCount + ' questions' : requestedQuestionCount + ' questions'}...`);
      
      const allGeneratedQuestions: GeneratedQuestion[] = [];
      let totalAttempts = 0;
      let rejected = 0;
      
      // 複数問題を順次生成
      for (let i = 0; i < passageCount; i++) {
        console.log(`\n🔄 Generating ${isLongReading ? 'passage' : 'question'} ${i + 1}/${passageCount}...`);
        
        // ✅ Phase 3 API（アクティブAPI）へのリクエスト
        // エンドポイント: /api/eiken/questions/generate
        // 実装: src/eiken/routes/questions.ts
        // サービス: IntegratedQuestionGenerator (src/eiken/services/integrated-question-generator.ts)
        // 
        // 注意: /api/eiken/generate (レガシーAPI) は使用していません
        const phase3Request: Phase3QuestionGenerationRequest = {
          student_id: 'web_user_' + Date.now(),
          grade: request.grade,
          format: request.format as any,
          count: 1, // API側は1問ずつ生成
          difficulty_preference: 'adaptive',
          difficulty_level: request.difficulty || 0.6,
          topic_hints: request.topicHints,
        };

        const response = await fetch('/api/eiken/questions/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(phase3Request),
        });

        const phase3Data: Phase3GenerationResult = await response.json();
        
        if (!response.ok || !phase3Data.success) {
          console.warn(`⚠️ Question ${i + 1} generation failed:`, phase3Data.error?.message);
          rejected++;
          totalAttempts++;
          continue; // 次の問題へ
        }

        // 変換して追加
        const convertedQuestions = phase3Data.data ? convertPhase3ToLegacyMulti(phase3Data.data.question) : [];
        allGeneratedQuestions.push(...convertedQuestions);
        totalAttempts++;
        
        console.log(`✅ ${isLongReading ? 'Passage' : 'Question'} ${i + 1}/${passageCount} generated successfully (${allGeneratedQuestions.length} total questions)`);
        
        // 🎯 Phase 2: 1問生成されたら即座にコールバックで通知
        if (onProgressCallback && convertedQuestions.length > 0) {
          onProgressCallback(allGeneratedQuestions.length, requestedQuestionCount, convertedQuestions[0]);
        }
        
        // long_readingで要求数に達したら打ち切り
        if (isLongReading && allGeneratedQuestions.length >= requestedQuestionCount) {
          console.log(`✅ Reached requested question count (${requestedQuestionCount}), stopping generation`);
          break;
        }
        
        // API rate limit対策（最後の問題以外は少し待機）
        if (i < passageCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log(`\n📊 Generation complete: ${allGeneratedQuestions.length} succeeded, ${rejected} rejected`);

      const legacyFormat: GenerationResult = {
        success: true,
        generated: allGeneratedQuestions,
        rejected,
        totalAttempts,
        saved: allGeneratedQuestions.length,
      };

      setResult(legacyFormat);
      console.log('💾 Result stored in state:', legacyFormat);
      return legacyFormat;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('💥 API Error:', errorMessage, err);
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
      console.log('🏁 Loading finished');
    }
  };

  return {
    loading,
    error,
    result,
    generateQuestions,
  };
}

// Phase 3レスポンスを従来形式に変換（複数設問対応）
function convertPhase3ToLegacyMulti(question: Phase3Question): GeneratedQuestion[] {
  const questionData = question.question_data || {};
  
  // long_reading形式: questions配列がある場合
  if (questionData.questions && Array.isArray(questionData.questions)) {
    console.log('📚 Long reading format detected with', questionData.questions.length, 'sub-questions');
    
    // パッセージと翻訳を取得
    const passage = questionData.passage || '';
    const passageJa = questionData.passage_ja || ''; // 日本語訳を取得
    
    return questionData.questions.map((q: any, index: number) => {
      const choices = q.choices || [];
      const correctAnswer = q.correct_answer;
      
      // 正解インデックスを計算（"C" → 2）
      let correctAnswerIndex = 0;
      if (typeof correctAnswer === 'string') {
        // "C" や "A)" の形式に対応
        const match = correctAnswer.match(/^([A-Z])/);
        if (match) {
          correctAnswerIndex = match[1].charCodeAt(0) - 'A'.charCodeAt(0);
        }
      }
      
      return {
        questionNumber: index + 1,
        questionText: q.question_text || '',
        passage: passage, // 各設問にパッセージを含める
        passageJa: passageJa, // 各設問に翻訳も含める
        choices: choices.map((c: string) => c.replace(/^[A-Z]\)\s*/, '')), // "A) Math" → "Math"
        correctAnswerIndex,
        explanation: q.explanation || '',
        translation_ja: q.translation_ja || questionData.passage_ja, // Phase 5F: 日本語訳
        vocabulary_meanings: questionData.vocabulary_meanings || q.vocabulary_meanings, // Phase 5F: 語句解説
        difficulty: 0.6,
        topic: question.format,
        copyrightSafe: true,
        copyrightScore: 95,
        vocabulary_notes: questionData.vocabulary_notes || [], // Phase 4B: vocabulary annotations
      } as GeneratedQuestion;
    });
  }
  
  // 単一設問形式（grammar_fill, essayなど）
  return [convertPhase3ToLegacy(question)];
}

// Phase 3レスポンスを従来形式に変換するヘルパー関数（単一設問用）
function convertPhase3ToLegacy(question: Phase3Question): GeneratedQuestion {
  // question_dataから実際のデータを取得
  const questionData = question.question_data || {};
  
  // 選択肢の取得（複数の可能性に対応）
  let choices: string[] = [];
  
  // grammar_fill形式: distractors + correct_answer から choices を構築
  if (questionData.distractors && questionData.correct_answer) {
    const allChoices = [...questionData.distractors, questionData.correct_answer];
    // シャッフルして表示順をランダム化
    choices = allChoices.sort(() => Math.random() - 0.5);
    console.log('🔀 Built choices from distractors + correct_answer:', choices);
  } else if (questionData.choices) {
    choices = Array.isArray(questionData.choices) ? questionData.choices : [];
  } else if (question.choices_json) {
    choices = JSON.parse(question.choices_json);
  }
  
  // 問題文の取得
  const questionText = questionData.question_text || 
                      questionData.passage || 
                      question.question_text || 
                      '';
  
  // 正解の取得
  const correctAnswer = questionData.correct_answer || question.correct_answer;
  
  // 解説の取得
  const explanation = questionData.explanation || question.explanation || '';
  
  // デバッグログ
  console.log('🔍 Converting Phase 3 question:', {
    raw_question: question,
    questionData,
    questionText,
    choices,
    correctAnswer
  });
  
  // correct_answerがインデックス（数値）か文字列かを判定
  let correctAnswerIndex: number;
  if (typeof correctAnswer === 'number') {
    correctAnswerIndex = correctAnswer;
  } else if (typeof correctAnswer === 'string') {
    // 文字列の場合、選択肢から検索
    correctAnswerIndex = choices.indexOf(correctAnswer);
    if (correctAnswerIndex === -1) {
      // 見つからない場合、数値として解釈を試みる
      const parsed = parseInt(correctAnswer, 10);
      correctAnswerIndex = isNaN(parsed) ? 0 : parsed;
    }
  } else {
    correctAnswerIndex = 0;
  }
  
  console.log('✅ Converted correctAnswerIndex:', correctAnswerIndex);

  return {
    questionNumber: 1,
    questionText,
    choices,
    correctAnswerIndex,
    explanation,
    translation_ja: questionData.translation_ja, // Phase 5F: 問題文の日本語訳
    vocabulary_meanings: questionData.vocabulary_meanings, // Phase 5F: 重要語句の意味
    difficulty: 0.6,
    topic: question.format,
    copyrightSafe: true,
    copyrightScore: 95,
    vocabulary_notes: questionData.vocabulary_notes || [], // Phase 4B: vocabulary annotations
    _raw: questionData, // 元のAPIレスポンスを保存（distractors配列へのアクセス用）
  };
}

/**
 * 英検統計情報取得用フック
 */
export function useEikenStats() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsResult | null>(null);

  const fetchGenerateStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/eiken/generate/stats');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setStats(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalyzeStats = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/eiken/analyze/stats');
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setStats(data);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    loading,
    error,
    stats,
    fetchGenerateStats,
    fetchAnalyzeStats,
  };
}

/**
 * ローカルストレージを使った進捗管理フック
 */
export function useEikenProgress() {
  const STORAGE_KEY = 'eiken_progress';

  const getProgress = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : {
      totalQuestions: 0,
      correctAnswers: 0,
      byGrade: {},
      history: []
    };
  };

  const [progress, setProgress] = useState(getProgress());

  const addAnswer = (question: GeneratedQuestion, userAnswer: number) => {
    const isCorrect = userAnswer === question.correctAnswerIndex;
    
    const newProgress = {
      ...progress,
      totalQuestions: progress.totalQuestions + 1,
      correctAnswers: progress.correctAnswers + (isCorrect ? 1 : 0),
      history: [
        ...progress.history,
        {
          timestamp: new Date().toISOString(),
          question: question.questionText,
          correct: isCorrect,
          difficulty: question.difficulty,
          topic: question.topic
        }
      ]
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newProgress));
    setProgress(newProgress);
  };

  const resetProgress = () => {
    const emptyProgress = {
      totalQuestions: 0,
      correctAnswers: 0,
      byGrade: {},
      history: []
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(emptyProgress));
    setProgress(emptyProgress);
  };

  return {
    progress,
    addAnswer,
    resetProgress,
    accuracy: progress.totalQuestions > 0 
      ? (progress.correctAnswers / progress.totalQuestions) * 100 
      : 0
  };
}
