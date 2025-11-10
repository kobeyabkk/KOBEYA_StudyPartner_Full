/**
 * 英検API用カスタムフック
 * 
 * APIエンドポイントとの通信を簡単にするためのReact Hook
 */

import { useState } from 'react';
import type { EikenGrade, QuestionType } from '../eiken/types';

// ==================== 型定義 ====================

export interface QuestionGenerationRequest {
  grade: EikenGrade;
  section: string;
  questionType: QuestionType;
  count: number;
  difficulty?: number;
  topicHints?: string[];
  basedOnAnalysisId?: number;
}

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
      const response = await fetch('/api/eiken/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setResult(data);
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
    result,
    generateQuestions,
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
