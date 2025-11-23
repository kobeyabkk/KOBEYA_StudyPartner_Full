/**
 * Phase 4A: Custom React Hooks for Vocabulary System
 * 
 * Provides type-safe API integration hooks for:
 * - Vocabulary data fetching
 * - User progress tracking
 * - Review scheduling
 * - Statistics aggregation
 */

import { useState, useEffect, useCallback } from 'react';
import type {
  VocabularyMaster,
  UserVocabularyProgress,
  SM2Review,
  LearningStatus,
  EikenGrade
} from '../eiken/types/vocabulary';

// ============================================================================
// Types
// ============================================================================

export interface VocabularyItem {
  word: VocabularyMaster;
  progress: UserVocabularyProgress;
}

export interface VocabularyStatistics {
  totalWords: number;
  learningWords: number;
  masteredWords: number;
  archivedWords: number;
  dueToday: number;
  avgMasteryLevel: number;
  overallAccuracy: number;
  currentStreak: number;
  longestStreak: number;
  totalReviews: number;
  retentionRates: {
    day7: number;
    day30: number;
    day60: number;
  };
}

export interface ReviewSchedule {
  dueWords: VocabularyItem[];
  upcomingReviews: {
    today: number;
    tomorrow: number;
    thisWeek: number;
    nextWeek: number;
  };
}

export interface UseVocabularyOptions {
  userId: string;
  autoLoad?: boolean;
}

export interface UseVocabularyProgressOptions {
  userId: string;
  status?: LearningStatus;
  autoLoad?: boolean;
}

export interface UseReviewScheduleOptions {
  userId: string;
  autoLoad?: boolean;
}

// ============================================================================
// Hook: useVocabulary - Fetch and manage vocabulary data
// ============================================================================

export function useVocabulary(wordId: number) {
  const [word, setWord] = useState<VocabularyMaster | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchWord = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/word/${wordId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch word: ${response.statusText}`);
      }
      const data = await response.json();
      setWord(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [wordId]);

  useEffect(() => {
    fetchWord();
  }, [fetchWord]);

  return { word, loading, error, refetch: fetchWord };
}

// ============================================================================
// Hook: useVocabularySearch - Search vocabulary database
// ============================================================================

export function useVocabularySearch() {
  const [results, setResults] = useState<VocabularyMaster[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const search = useCallback(async (query: string, limit: number = 20) => {
    if (!query.trim()) {
      setResults([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/vocabulary/search?q=${encodeURIComponent(query)}&limit=${limit}`
      );
      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }
      const data = await response.json();
      setResults(data.results || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearResults = useCallback(() => {
    setResults([]);
    setError(null);
  }, []);

  return { results, loading, error, search, clearResults };
}

// ============================================================================
// Hook: useVocabularyProgress - Manage user's vocabulary progress
// ============================================================================

export function useVocabularyProgress(options: UseVocabularyProgressOptions) {
  const { userId, status, autoLoad = true } = options;
  
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<Error | null>(null);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      let url = `/api/vocabulary/progress/${userId}`;
      if (status && status !== 'learning') {
        url += `?status=${status}`;
      }
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch progress: ${response.statusText}`);
      }
      const data = await response.json();
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId, status]);

  useEffect(() => {
    if (autoLoad) {
      fetchProgress();
    }
  }, [autoLoad, fetchProgress]);

  const addWord = useCallback(async (wordId: number, sourceContext?: any) => {
    setError(null);
    try {
      const response = await fetch('/api/vocabulary/add', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          wordId,
          sourceContext
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to add word: ${response.statusText}`);
      }
      
      await fetchProgress(); // Reload list
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return false;
    }
  }, [userId, fetchProgress]);

  const submitReview = useCallback(async (wordId: number, review: SM2Review) => {
    setError(null);
    try {
      const response = await fetch('/api/vocabulary/review/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          userId,
          wordId,
          review
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to submit review: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Update local state
      setItems(prevItems => 
        prevItems.map(item => 
          item.progress.wordId === wordId 
            ? { ...item, progress: data.progress }
            : item
        )
      );
      
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return false;
    }
  }, [userId]);

  const updateNote = useCallback(async (wordId: number, note: string) => {
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/note/${userId}/${wordId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ note })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update note: ${response.statusText}`);
      }
      
      await fetchProgress(); // Reload list
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return false;
    }
  }, [userId, fetchProgress]);

  const archiveWord = useCallback(async (wordId: number) => {
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/archive/${userId}/${wordId}`, {
        method: 'POST'
      });
      
      if (!response.ok) {
        throw new Error(`Failed to archive word: ${response.statusText}`);
      }
      
      await fetchProgress(); // Reload list
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      return false;
    }
  }, [userId, fetchProgress]);

  return {
    items,
    loading,
    error,
    refetch: fetchProgress,
    addWord,
    submitReview,
    updateNote,
    archiveWord
  };
}

// ============================================================================
// Hook: useVocabularyStatistics - Fetch aggregated statistics
// ============================================================================

export function useVocabularyStatistics(options: UseVocabularyOptions) {
  const { userId, autoLoad = true } = options;
  
  const [stats, setStats] = useState<VocabularyStatistics>({
    totalWords: 0,
    learningWords: 0,
    masteredWords: 0,
    archivedWords: 0,
    dueToday: 0,
    avgMasteryLevel: 0,
    overallAccuracy: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalReviews: 0,
    retentionRates: {
      day7: 0,
      day30: 0,
      day60: 0
    }
  });
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<Error | null>(null);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/statistics/${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch statistics: ${response.statusText}`);
      }
      const data = await response.json();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (autoLoad) {
      fetchStats();
    }
  }, [autoLoad, fetchStats]);

  return { stats, loading, error, refetch: fetchStats };
}

// ============================================================================
// Hook: useReviewSchedule - Manage daily review schedule
// ============================================================================

export function useReviewSchedule(options: UseReviewScheduleOptions) {
  const { userId, autoLoad = true } = options;
  
  const [schedule, setSchedule] = useState<ReviewSchedule>({
    dueWords: [],
    upcomingReviews: {
      today: 0,
      tomorrow: 0,
      thisWeek: 0,
      nextWeek: 0
    }
  });
  const [loading, setLoading] = useState(autoLoad);
  const [error, setError] = useState<Error | null>(null);

  const fetchSchedule = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/review/today/${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch schedule: ${response.statusText}`);
      }
      const data = await response.json();
      setSchedule({
        dueWords: data.dueWords || [],
        upcomingReviews: data.upcomingReviews || {
          today: 0,
          tomorrow: 0,
          thisWeek: 0,
          nextWeek: 0
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (autoLoad) {
      fetchSchedule();
    }
  }, [autoLoad, fetchSchedule]);

  return { schedule, loading, error, refetch: fetchSchedule };
}

// ============================================================================
// Hook: useMasteredWords - Fetch mastered vocabulary
// ============================================================================

export function useMasteredWords(userId: string) {
  const [words, setWords] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchMastered = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vocabulary/mastered/${userId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch mastered words: ${response.statusText}`);
      }
      const data = await response.json();
      setWords(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchMastered();
  }, [fetchMastered]);

  return { words, loading, error, refetch: fetchMastered };
}

// ============================================================================
// Utility hook: useDebounce - Debounce values (useful for search)
// ============================================================================

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
