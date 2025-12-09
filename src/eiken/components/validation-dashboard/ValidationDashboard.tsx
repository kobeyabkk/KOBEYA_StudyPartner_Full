/**
 * Phase 5D: Validation Dashboard Component
 * 
 * 問題生成の検証ログを可視化するダッシュボード
 */

import { useState, useEffect } from 'react';
import type { ValidationStats } from '../../../api/validation-dashboard/stats';

export function ValidationDashboard() {
  const [stats, setStats] = useState<ValidationStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    days: 7,
    format: '',
    grade: '',
  });

  useEffect(() => {
    fetchStats();
  }, [filters]);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('days', filters.days.toString());
      if (filters.format) params.set('format', filters.format);
      if (filters.grade) params.set('grade', filters.grade);

      const response = await fetch(`/api/validation-dashboard/stats?${params}`);
      if (!response.ok) throw new Error('Failed to fetch stats');
      
      const data = await response.json();
      setStats(data);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">エラー: {error}</p>
      </div>
    );
  }

  if (!stats) return null;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            問題生成 検証ダッシュボード
          </h1>
          <p className="text-gray-600">
            英検問題生成システムの検証ログをリアルタイムで監視
          </p>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                期間
              </label>
              <select
                value={filters.days}
                onChange={(e) => setFilters({ ...filters, days: parseInt(e.target.value) })}
                className="border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="1">直近1日</option>
                <option value="7">直近7日</option>
                <option value="30">直近30日</option>
                <option value="90">直近90日</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                問題形式
              </label>
              <select
                value={filters.format}
                onChange={(e) => setFilters({ ...filters, format: e.target.value })}
                className="border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">全形式</option>
                <option value="grammar_fill">文法穴埋め</option>
                <option value="long_reading">長文読解</option>
                <option value="essay">エッセイ</option>
                <option value="opinion_speech">意見スピーチ</option>
                <option value="reading_aloud">音読</option>
                <option value="listening_comprehension">リスニング</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                英検級
              </label>
              <select
                value={filters.grade}
                onChange={(e) => setFilters({ ...filters, grade: e.target.value })}
                className="border border-gray-300 rounded-md px-3 py-2"
              >
                <option value="">全級</option>
                <option value="5">5級</option>
                <option value="4">4級</option>
                <option value="3">3級</option>
                <option value="pre-2">準2級</option>
                <option value="2">2級</option>
                <option value="pre-1">準1級</option>
                <option value="1">1級</option>
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={fetchStats}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
              >
                更新
              </button>
            </div>
          </div>
        </div>

        {/* Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <StatsCard
            title="総試行回数"
            value={stats.overview.total_attempts}
            color="blue"
          />
          <StatsCard
            title="成功"
            value={stats.overview.successful_generations}
            color="green"
          />
          <StatsCard
            title="失敗"
            value={stats.overview.failed_generations}
            color="red"
          />
          <StatsCard
            title="成功率"
            value={`${stats.overview.success_rate}%`}
            color="purple"
          />
          <StatsCard
            title="平均試行回数"
            value={stats.overview.average_attempts_per_question.toFixed(1)}
            color="orange"
          />
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* Failure Reasons Pie Chart */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">失敗理由の内訳</h2>
            <FailureReasonsChart reasons={stats.failure_reasons} />
          </div>

          {/* Validation Stages */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">検証ステージ別通過率</h2>
            <ValidationStagesChart stages={stats.validation_stages} />
          </div>
        </div>

        {/* Format and Grade Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          {/* By Format */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">形式別統計</h2>
            <FormatStatsTable stats={stats.by_format} />
          </div>

          {/* By Grade */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">級別統計</h2>
            <GradeStatsTable stats={stats.by_grade} />
          </div>
        </div>

        {/* Timeline */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">時系列推移</h2>
          <TimelineChart timeline={stats.timeline} />
        </div>
      </div>
    </div>
  );
}

// Stats Card Component
function StatsCard({ title, value, color }: { title: string; value: string | number; color: string }) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    red: 'bg-red-50 text-red-700',
    purple: 'bg-purple-50 text-purple-700',
    orange: 'bg-orange-50 text-orange-700',
  };

  return (
    <div className={`rounded-lg p-4 ${colorClasses[color as keyof typeof colorClasses]}`}>
      <p className="text-sm font-medium opacity-80 mb-1">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

// Failure Reasons Chart (Simple Bar Chart)
function FailureReasonsChart({ reasons }: { reasons: any }) {
  const total = Object.values(reasons).reduce((sum: number, val) => sum + (val as number), 0);
  if (total === 0) {
    return <p className="text-gray-500">データがありません</p>;
  }

  const labels: Record<string, string> = {
    vocabulary: '語彙レベル',
    copyright: '著作権類似',
    grammar: '文法複雑さ',
    uniqueness: '複数正解',
    duplicate: '重複',
  };

  return (
    <div className="space-y-3">
      {Object.entries(reasons).map(([key, value]) => {
        const percentage = ((value as number) / total) * 100;
        return (
          <div key={key}>
            <div className="flex justify-between text-sm mb-1">
              <span>{labels[key]}</span>
              <span className="font-medium">{value} ({percentage.toFixed(1)}%)</span>
            </div>
            <div className="bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-600 h-2 rounded-full"
                style={{ width: `${percentage}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Validation Stages Chart
function ValidationStagesChart({ stages }: { stages: any[] }) {
  if (stages.length === 0) {
    return <p className="text-gray-500">データがありません</p>;
  }

  const labels: Record<string, string> = {
    duplicate: '重複チェック',
    grammar: '文法複雑さ',
    vocabulary: '語彙レベル',
    copyright: '著作権',
    uniqueness: '複数正解チェック',
  };

  return (
    <div className="space-y-3">
      {stages.map((stage) => (
        <div key={stage.stage}>
          <div className="flex justify-between text-sm mb-1">
            <span>{labels[stage.stage] || stage.stage}</span>
            <span className="font-medium">{stage.pass_rate.toFixed(1)}% 通過</span>
          </div>
          <div className="bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full ${
                stage.pass_rate >= 90 ? 'bg-green-600' :
                stage.pass_rate >= 70 ? 'bg-yellow-600' : 'bg-red-600'
              }`}
              style={{ width: `${stage.pass_rate}%` }}
            />
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>成功: {stage.passed}</span>
            <span>失敗: {stage.failed}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// Format Stats Table
function FormatStatsTable({ stats }: { stats: any[] }) {
  if (stats.length === 0) {
    return <p className="text-gray-500">データがありません</p>;
  }

  const formatLabels: Record<string, string> = {
    grammar_fill: '文法穴埋め',
    long_reading: '長文読解',
    essay: 'エッセイ',
    opinion_speech: '意見スピーチ',
    reading_aloud: '音読',
    listening_comprehension: 'リスニング',
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2">形式</th>
          <th className="text-right py-2">総数</th>
          <th className="text-right py-2">成功率</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((row) => (
          <tr key={row.format} className="border-b">
            <td className="py-2">{formatLabels[row.format] || row.format}</td>
            <td className="text-right">{row.total}</td>
            <td className="text-right">
              <span className={`font-medium ${
                row.success_rate >= 90 ? 'text-green-600' :
                row.success_rate >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {row.success_rate.toFixed(1)}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Grade Stats Table
function GradeStatsTable({ stats }: { stats: any[] }) {
  if (stats.length === 0) {
    return <p className="text-gray-500">データがありません</p>;
  }

  const gradeLabels: Record<string, string> = {
    '5': '5級',
    '4': '4級',
    '3': '3級',
    'pre-2': '準2級',
    '2': '2級',
    'pre-1': '準1級',
    '1': '1級',
  };

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b">
          <th className="text-left py-2">級</th>
          <th className="text-right py-2">総数</th>
          <th className="text-right py-2">成功率</th>
        </tr>
      </thead>
      <tbody>
        {stats.map((row) => (
          <tr key={row.grade} className="border-b">
            <td className="py-2">{gradeLabels[row.grade] || row.grade}</td>
            <td className="text-right">{row.total}</td>
            <td className="text-right">
              <span className={`font-medium ${
                row.success_rate >= 90 ? 'text-green-600' :
                row.success_rate >= 70 ? 'text-yellow-600' : 'text-red-600'
              }`}>
                {row.success_rate.toFixed(1)}%
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Timeline Chart (Simple Line Chart)
function TimelineChart({ timeline }: { timeline: any[] }) {
  if (timeline.length === 0) {
    return <p className="text-gray-500">データがありません</p>;
  }

  const maxValue = Math.max(...timeline.map(t => t.total));

  return (
    <div className="space-y-4">
      <div className="flex items-end space-x-2 h-64">
        {timeline.map((day) => {
          const height = (day.total / maxValue) * 100;
          return (
            <div key={day.date} className="flex-1 flex flex-col items-center">
              <div className="relative flex-1 w-full flex flex-col justify-end">
                <div
                  className="bg-blue-600 rounded-t"
                  style={{ height: `${height}%` }}
                  title={`${day.date}: ${day.total}件 (成功率: ${day.success_rate.toFixed(1)}%)`}
                />
              </div>
              <p className="text-xs text-gray-600 mt-2 transform -rotate-45 origin-top-left">
                {day.date.split('-')[1]}/{day.date.split('-')[2]}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
