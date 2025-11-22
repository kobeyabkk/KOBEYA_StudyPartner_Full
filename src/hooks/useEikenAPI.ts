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
  id: number;
  format: string;
  grade: string;
  question_text: string;
  choices_json?: string;
  correct_answer?: string;
  explanation?: string;
  vocabulary_notes_json?: string;  // Phase 4A: 語彙notes
  created_at: string;
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
  choices: string[];
  correctAnswerIndex: number;
  explanation: string;
  difficulty: number;
  topic: string;
  copyrightSafe: boolean;
  copyrightScore: number;
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

  const generateQuestions = async (request: QuestionGenerationRequest) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // Phase 3 APIを使用
      const phase3Request: Phase3QuestionGenerationRequest = {
        student_id: 'web_user_' + Date.now(),  // 仮のuser ID
        grade: request.grade,
        format: request.format as any,  // UIからの format を使用
        count: request.count,
        difficulty_preference: 'adaptive',
        difficulty_level: request.difficulty || 0.6,
        topic_hints: request.topicHints,
      };

      console.log('📡 Sending Phase 3 API request:', phase3Request);
      const response = await fetch('/api/eiken/questions/generate', {  // Phase 3 API
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(phase3Request),
      });

      console.log('📥 API response status:', response.status, response.ok);
      const phase3Data: Phase3GenerationResult = await response.json();
      console.log('📦 Phase 3 API response data:', phase3Data);

      if (!response.ok || !phase3Data.success) {
        throw new Error(phase3Data.error?.message || `HTTP error! status: ${response.status}`);
      }

      // Phase 3レスポンスを従来形式に変換 (後方互換性)
      const legacyFormat: GenerationResult = {
        success: true,
        generated: phase3Data.data ? [convertPhase3ToLegacy(phase3Data.data.question)] : [],
        rejected: 0,
        totalAttempts: 1,
        saved: 1,
      };

      // 元のPhase 3データも保持
      (legacyFormat as any).phase3Data = phase3Data.data;

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

// Phase 3レスポンスを従来形式に変換するヘルパー関数
function convertPhase3ToLegacy(question: Phase3Question): GeneratedQuestion {
  const choices = question.choices_json ? JSON.parse(question.choices_json) : [];
  const correctAnswerIndex = choices.indexOf(question.correct_answer);

  return {
    questionNumber: 1,
    questionText: question.question_text,
    choices,
    correctAnswerIndex: correctAnswerIndex >= 0 ? correctAnswerIndex : 0,
    explanation: question.explanation || '',
    difficulty: 0.6,
    topic: question.format,
    copyrightSafe: true,
    copyrightScore: 95,
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
