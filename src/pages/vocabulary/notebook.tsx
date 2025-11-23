/**
 * Phase 4A: Vocabulary Notebook Page
 * 
 * Main page for managing vocabulary learning
 * Features:
 * - Word list with filters
 * - Search functionality
 * - Mastery level indicators
 * - Review interface
 * - Statistics dashboard
 */

import React, { useState, useEffect } from 'react';
import type {
  UserVocabularyProgress,
  VocabularyMaster,
  LearningStatus
} from '../../eiken/types/vocabulary';
import { VocabularyDifficultyScorer } from '../../eiken/services/vocabulary-difficulty';
import { SM2Algorithm } from '../../eiken/services/sm2-algorithm';
import VocabularyReviewModal, { type ReviewItem } from '../../components/eiken/VocabularyReviewModal';

// Mock user ID - TODO: Get from auth context
const MOCK_USER_ID = 'user-123';

interface VocabularyItem {
  progress: UserVocabularyProgress;
  word: VocabularyMaster;
}

export default function VocabularyNotebookPage() {
  const [items, setItems] = useState<VocabularyItem[]>([]);
  const [filteredItems, setFilteredItems] = useState<VocabularyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<LearningStatus | 'all'>('all');
  const [masteryFilter, setMasteryFilter] = useState<'all' | 'beginner' | 'intermediate' | 'advanced'>('all');
  const [sortBy, setSortBy] = useState<'recent' | 'mastery' | 'alphabetical'>('recent');
  
  // Review modal state
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  const [reviewItems, setReviewItems] = useState<ReviewItem[]>([]);
  
  // Statistics
  const [stats, setStats] = useState({
    totalWords: 0,
    learningWords: 0,
    masteredWords: 0,
    dueToday: 0,
    avgMasteryLevel: 0,
    overallAccuracy: 0,
    currentStreak: 0,
    longestStreak: 0
  });

  // Load vocabulary progress
  useEffect(() => {
    loadVocabulary();
    loadStatistics();
  }, []);

  // Apply filters
  useEffect(() => {
    applyFilters();
  }, [items, searchQuery, statusFilter, masteryFilter, sortBy]);

  const loadVocabulary = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/vocabulary/progress/${MOCK_USER_ID}`);
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('Failed to load vocabulary:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadStatistics = async () => {
    try {
      const response = await fetch(`/api/vocabulary/statistics/${MOCK_USER_ID}`);
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to load statistics:', error);
    }
  };

  const applyFilters = () => {
    let filtered = [...items];

    // Search filter
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(item =>
        item.word.word.toLowerCase().includes(query) ||
        item.word.definitionJa.toLowerCase().includes(query)
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(item => item.progress.status === statusFilter);
    }

    // Mastery filter
    if (masteryFilter !== 'all') {
      if (masteryFilter === 'beginner') {
        filtered = filtered.filter(item => item.progress.masteryLevel <= 3);
      } else if (masteryFilter === 'intermediate') {
        filtered = filtered.filter(item => item.progress.masteryLevel >= 4 && item.progress.masteryLevel <= 6);
      } else if (masteryFilter === 'advanced') {
        filtered = filtered.filter(item => item.progress.masteryLevel >= 7);
      }
    }

    // Sort
    if (sortBy === 'recent') {
      filtered.sort((a, b) => {
        const aTime = a.progress.lastReviewedAt?.getTime() || 0;
        const bTime = b.progress.lastReviewedAt?.getTime() || 0;
        return bTime - aTime;
      });
    } else if (sortBy === 'mastery') {
      filtered.sort((a, b) => a.progress.masteryLevel - b.progress.masteryLevel);
    } else if (sortBy === 'alphabetical') {
      filtered.sort((a, b) => a.word.word.localeCompare(b.word.word));
    }

    setFilteredItems(filtered);
  };

  const getMasteryLabel = (level: number): string => {
    if (level === 0) return '未知';
    if (level <= 3) return '初級';
    if (level <= 6) return '中級';
    if (level <= 9) return '上級';
    return '完璧';
  };

  const getMasteryColor = (level: number): string => {
    if (level === 0) return 'bg-gray-200 text-gray-700';
    if (level <= 3) return 'bg-red-100 text-red-700';
    if (level <= 6) return 'bg-yellow-100 text-yellow-700';
    if (level <= 9) return 'bg-green-100 text-green-700';
    return 'bg-blue-100 text-blue-700';
  };

  // Review handlers
  const handleStartReview = (item: VocabularyItem) => {
    setReviewItems([{ word: item.word, progress: item.progress }]);
    setIsReviewModalOpen(true);
  };

  const handleStartAllDueReviews = () => {
    const dueItems = items.filter(item => {
      const nextReview = item.progress.nextReviewDate;
      return nextReview && new Date(nextReview) <= new Date();
    });
    
    if (dueItems.length === 0) {
      alert('復習する単語がありません');
      return;
    }

    setReviewItems(dueItems.map(item => ({ word: item.word, progress: item.progress })));
    setIsReviewModalOpen(true);
  };

  const handleReviewComplete = () => {
    // Reload data after review
    loadVocabulary();
    loadStatistics();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="mt-4 text-gray-600">読み込み中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">📚 語彙ノート</h1>
              <p className="mt-1 text-sm text-gray-500">
                学習中の単語を管理・復習しましょう
              </p>
            </div>
            <a
              href="/eiken/practice"
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
            >
              ← 問題練習に戻る
            </a>
          </div>
        </div>
      </header>

      {/* Statistics Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Total Words */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">総単語数</p>
                <p className="mt-2 text-3xl font-bold text-gray-900">{stats.totalWords}</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-full">
                <span className="text-2xl">📖</span>
              </div>
            </div>
          </div>

          {/* Due Today */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">今日の復習</p>
                <p className="mt-2 text-3xl font-bold text-orange-600">{stats.dueToday}</p>
              </div>
              <div className="p-3 bg-orange-100 rounded-full">
                <span className="text-2xl">⏰</span>
              </div>
            </div>
            {stats.dueToday > 0 && (
              <button
                onClick={handleStartAllDueReviews}
                className="mt-4 w-full px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium"
              >
                復習を開始
              </button>
            )}
          </div>

          {/* Mastered */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">習得済み</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{stats.masteredWords}</p>
              </div>
              <div className="p-3 bg-green-100 rounded-full">
                <span className="text-2xl">✅</span>
              </div>
            </div>
          </div>

          {/* Streak */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">連続学習</p>
                <p className="mt-2 text-3xl font-bold text-purple-600">{stats.currentStreak}日</p>
                <p className="text-xs text-gray-500 mt-1">最長: {stats.longestStreak}日</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-full">
                <span className="text-2xl">🔥</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div className="lg:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                検索
              </label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="単語または意味を検索..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                状態
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">すべて</option>
                <option value="learning">学習中</option>
                <option value="mastered">習得済み</option>
                <option value="archived">アーカイブ</option>
              </select>
            </div>

            {/* Mastery Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                習熟度
              </label>
              <select
                value={masteryFilter}
                onChange={(e) => setMasteryFilter(e.target.value as any)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">すべて</option>
                <option value="beginner">初級 (0-3)</option>
                <option value="intermediate">中級 (4-6)</option>
                <option value="advanced">上級 (7-10)</option>
              </select>
            </div>
          </div>

          {/* Sort */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">並び替え:</span>
              <button
                onClick={() => setSortBy('recent')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'recent'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                最近の復習順
              </button>
              <button
                onClick={() => setSortBy('mastery')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'mastery'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                習熟度順
              </button>
              <button
                onClick={() => setSortBy('alphabetical')}
                className={`px-3 py-1 rounded text-sm ${
                  sortBy === 'alphabetical'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                アルファベット順
              </button>
            </div>
            <span className="text-sm text-gray-600">
              {filteredItems.length} 件の単語
            </span>
          </div>
        </div>
      </div>

      {/* Word List */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 pb-12">
        {filteredItems.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <span className="text-6xl">📚</span>
            <h3 className="mt-4 text-lg font-medium text-gray-900">
              {searchQuery || statusFilter !== 'all' || masteryFilter !== 'all'
                ? '該当する単語が見つかりません'
                : '単語がまだありません'}
            </h3>
            <p className="mt-2 text-sm text-gray-500">
              {searchQuery || statusFilter !== 'all' || masteryFilter !== 'all'
                ? 'フィルターを変更してみてください'
                : '問題練習で新しい単語を学習しましょう'}
            </p>
            {!searchQuery && statusFilter === 'all' && masteryFilter === 'all' && (
              <a
                href="/eiken/practice"
                className="mt-4 inline-block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                問題練習を始める
              </a>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItems.map((item) => (
              <VocabularyCard 
                key={item.progress.id} 
                item={item} 
                onUpdate={loadVocabulary}
                onReview={handleStartReview}
              />
            ))}
          </div>
        )}
      </div>

      {/* Review Modal */}
      <VocabularyReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        items={reviewItems}
        userId={MOCK_USER_ID}
        onReviewComplete={handleReviewComplete}
      />
    </div>
  );
}

// Vocabulary Card Component
interface VocabularyCardProps {
  item: VocabularyItem;
  onUpdate: () => void;
  onReview: (item: VocabularyItem) => void;
}

function VocabularyCard({ item, onUpdate, onReview }: VocabularyCardProps) {
  const { word, progress } = item;
  
  const difficultyColor = VocabularyDifficultyScorer.getDifficultyColor(word.finalDifficultyScore);
  const difficultyLabel = VocabularyDifficultyScorer.getDifficultyLabel(word.finalDifficultyScore);
  
  const getMasteryLabel = (level: number): string => {
    if (level === 0) return '未知';
    if (level <= 3) return '初級';
    if (level <= 6) return '中級';
    if (level <= 9) return '上級';
    return '完璧';
  };

  const getMasteryColor = (level: number): string => {
    if (level === 0) return 'bg-gray-200 text-gray-700';
    if (level <= 3) return 'bg-red-100 text-red-700';
    if (level <= 6) return 'bg-yellow-100 text-yellow-700';
    if (level <= 9) return 'bg-green-100 text-green-700';
    return 'bg-blue-100 text-blue-700';
  };

  const getMasteryProgress = (level: number): number => {
    return (level / 10) * 100;
  };

  const isDue = progress.nextReviewDate <= new Date();

  return (
    <div className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-4">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className={`text-xl font-bold ${difficultyColor}`}>
            {word.word}
          </h3>
          <p className="text-sm text-gray-600 mt-1">{word.definitionJa}</p>
        </div>
        {isDue && (
          <span className="ml-2 px-2 py-1 bg-orange-100 text-orange-700 text-xs font-medium rounded">
            復習
          </span>
        )}
      </div>

      {/* Badges */}
      <div className="flex items-center gap-2 mb-3">
        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded">
          {word.pos}
        </span>
        <span className={`px-2 py-1 text-xs font-medium rounded ${VocabularyDifficultyScorer.getDifficultyBgColor(word.finalDifficultyScore)} ${difficultyColor}`}>
          {word.cefrLevel || 'B1'} {difficultyLabel}
        </span>
        <span className={`px-2 py-1 text-xs font-medium rounded ${getMasteryColor(progress.masteryLevel)}`}>
          {getMasteryLabel(progress.masteryLevel)}
        </span>
      </div>

      {/* Progress Bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs text-gray-600 mb-1">
          <span>習熟度</span>
          <span>{progress.masteryLevel}/10</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all"
            style={{ width: `${getMasteryProgress(progress.masteryLevel)}%` }}
          />
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs text-gray-600 mb-3">
        <div>
          <span className="font-medium">復習回数:</span> {progress.totalReviews}回
        </div>
        <div>
          <span className="font-medium">正解率:</span>{' '}
          {progress.totalReviews > 0
            ? Math.round((progress.correctReviews / progress.totalReviews) * 100)
            : 0}
          %
        </div>
        <div>
          <span className="font-medium">次回:</span>{' '}
          {new Date(progress.nextReviewDate).toLocaleDateString('ja-JP', {
            month: 'short',
            day: 'numeric'
          })}
        </div>
        <div>
          <span className="font-medium">間隔:</span> {Math.round(progress.intervalDays)}日
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        {isDue && (
          <button 
            onClick={() => onReview(item)}
            className="flex-1 px-3 py-2 bg-blue-500 text-white rounded text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            復習する
          </button>
        )}
        <button className="px-3 py-2 bg-gray-100 text-gray-700 rounded text-sm font-medium hover:bg-gray-200 transition-colors">
          詳細
        </button>
      </div>
    </div>
  );
}
