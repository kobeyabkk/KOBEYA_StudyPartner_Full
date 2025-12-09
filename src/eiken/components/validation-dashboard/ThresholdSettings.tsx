/**
 * Phase 5E: Validation Threshold Settings Component
 * 
 * 検証閾値の調整画面
 */

import { useState, useEffect } from 'react';
import type { ValidationThreshold } from '../../../api/validation-dashboard/thresholds';

export function ThresholdSettings() {
  const [thresholds, setThresholds] = useState<ValidationThreshold[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<Partial<ValidationThreshold>>({});

  useEffect(() => {
    fetchThresholds();
  }, []);

  const fetchThresholds = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/validation-dashboard/thresholds');
      const data = await response.json();
      setThresholds(data.thresholds);
    } catch (error) {
      console.error('Failed to fetch thresholds:', error);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (threshold: ValidationThreshold) => {
    setEditingId(threshold.id || null);
    setEditForm({ ...threshold });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
  };

  const saveThreshold = async () => {
    try {
      const response = await fetch('/api/validation-dashboard/threshold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...editForm,
          changed_by: 'admin', // 本番環境では認証情報から取得
        }),
      });

      if (response.ok) {
        await fetchThresholds();
        cancelEdit();
      }
    } catch (error) {
      console.error('Failed to save threshold:', error);
      alert('保存に失敗しました');
    }
  };

  const deleteThreshold = async (grade: string, format: string) => {
    if (!confirm(`本当に削除しますか？\nGrade: ${grade}, Format: ${format}`)) {
      return;
    }

    try {
      const response = await fetch(
        `/api/validation-dashboard/threshold?grade=${grade}&format=${format}&changed_by=admin`,
        { method: 'DELETE' }
      );

      if (response.ok) {
        await fetchThresholds();
      }
    } catch (error) {
      console.error('Failed to delete threshold:', error);
      alert('削除に失敗しました');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">検証閾値設定</h2>
        <button
          onClick={() => startEdit({
            grade: '',
            format: '',
            vocabulary_threshold: 85,
            vocabulary_enabled: true,
            copyright_threshold: 85,
            copyright_enabled: true,
            grammar_enabled: true,
            uniqueness_enabled: true,
            duplicate_enabled: true,
          })}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
        >
          新規追加
        </button>
      </div>

      {/* Edit Form Modal */}
      {editingId !== null && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h3 className="text-xl font-bold mb-4">
                {editForm.id ? '閾値編集' : '新規閾値追加'}
              </h3>

              <div className="space-y-4">
                {/* Grade & Format */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">英検級</label>
                    <select
                      value={editForm.grade || ''}
                      onChange={(e) => setEditForm({ ...editForm, grade: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">選択...</option>
                      <option value="default">デフォルト</option>
                      <option value="5">5級</option>
                      <option value="4">4級</option>
                      <option value="3">3級</option>
                      <option value="pre-2">準2級</option>
                      <option value="2">2級</option>
                      <option value="pre-1">準1級</option>
                      <option value="1">1級</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">問題形式</label>
                    <select
                      value={editForm.format || ''}
                      onChange={(e) => setEditForm({ ...editForm, format: e.target.value })}
                      className="w-full border border-gray-300 rounded-md px-3 py-2"
                    >
                      <option value="">選択...</option>
                      <option value="default">デフォルト</option>
                      <option value="grammar_fill">文法穴埋め</option>
                      <option value="long_reading">長文読解</option>
                      <option value="essay">エッセイ</option>
                      <option value="opinion_speech">意見スピーチ</option>
                      <option value="reading_aloud">音読</option>
                      <option value="listening_comprehension">リスニング</option>
                    </select>
                  </div>
                </div>

                {/* Vocabulary */}
                <div className="border-t pt-4">
                  <div className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      checked={editForm.vocabulary_enabled || false}
                      onChange={(e) => setEditForm({ ...editForm, vocabulary_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <label className="font-medium">語彙レベル検証</label>
                  </div>
                  {editForm.vocabulary_enabled && (
                    <div>
                      <label className="block text-sm mb-1">
                        閾値: {editForm.vocabulary_threshold || 85}%
                      </label>
                      <input
                        type="range"
                        min="60"
                        max="100"
                        value={editForm.vocabulary_threshold || 85}
                        onChange={(e) => setEditForm({ ...editForm, vocabulary_threshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        低いほど厳しい（より基本的な語彙のみ許可）
                      </p>
                    </div>
                  )}
                </div>

                {/* Copyright */}
                <div className="border-t pt-4">
                  <div className="flex items-center mb-2">
                    <input
                      type="checkbox"
                      checked={editForm.copyright_enabled || false}
                      onChange={(e) => setEditForm({ ...editForm, copyright_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <label className="font-medium">著作権類似検証</label>
                  </div>
                  {editForm.copyright_enabled && (
                    <div>
                      <label className="block text-sm mb-1">
                        閾値: {editForm.copyright_threshold || 85}%
                      </label>
                      <input
                        type="range"
                        min="60"
                        max="100"
                        value={editForm.copyright_threshold || 85}
                        onChange={(e) => setEditForm({ ...editForm, copyright_threshold: parseFloat(e.target.value) })}
                        className="w-full"
                      />
                      <p className="text-xs text-gray-600 mt-1">
                        高いほど類似を許容しない（より厳しい）
                      </p>
                    </div>
                  )}
                </div>

                {/* Grammar */}
                <div className="border-t pt-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editForm.grammar_enabled || false}
                      onChange={(e) => setEditForm({ ...editForm, grammar_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <label className="font-medium">文法複雑さ検証</label>
                  </div>
                </div>

                {/* Uniqueness */}
                <div className="border-t pt-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editForm.uniqueness_enabled || false}
                      onChange={(e) => setEditForm({ ...editForm, uniqueness_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <label className="font-medium">複数正解チェック</label>
                  </div>
                </div>

                {/* Duplicate */}
                <div className="border-t pt-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editForm.duplicate_enabled || false}
                      onChange={(e) => setEditForm({ ...editForm, duplicate_enabled: e.target.checked })}
                      className="mr-2"
                    />
                    <label className="font-medium">重複チェック</label>
                  </div>
                </div>

                {/* Description */}
                <div className="border-t pt-4">
                  <label className="block text-sm font-medium mb-1">説明（任意）</label>
                  <textarea
                    value={editForm.description || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2"
                    rows={3}
                    placeholder="この設定の用途や注意点など"
                  />
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 mt-6">
                <button
                  onClick={cancelEdit}
                  className="px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
                >
                  キャンセル
                </button>
                <button
                  onClick={saveThreshold}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Thresholds List */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium">級</th>
              <th className="px-4 py-3 text-left text-sm font-medium">形式</th>
              <th className="px-4 py-3 text-left text-sm font-medium">語彙</th>
              <th className="px-4 py-3 text-left text-sm font-medium">著作権</th>
              <th className="px-4 py-3 text-left text-sm font-medium">検証ON</th>
              <th className="px-4 py-3 text-left text-sm font-medium">説明</th>
              <th className="px-4 py-3 text-right text-sm font-medium">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {thresholds.map((threshold) => (
              <tr key={`${threshold.grade}-${threshold.format}`} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm">{threshold.grade}</td>
                <td className="px-4 py-3 text-sm">{threshold.format}</td>
                <td className="px-4 py-3 text-sm">
                  {threshold.vocabulary_enabled ? `${threshold.vocabulary_threshold}%` : '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  {threshold.copyright_enabled ? `${threshold.copyright_threshold}%` : '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <div className="flex gap-1">
                    {threshold.grammar_enabled && <span className="text-xs bg-blue-100 text-blue-700 px-1 rounded">文法</span>}
                    {threshold.uniqueness_enabled && <span className="text-xs bg-green-100 text-green-700 px-1 rounded">複数</span>}
                    {threshold.duplicate_enabled && <span className="text-xs bg-purple-100 text-purple-700 px-1 rounded">重複</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">{threshold.description}</td>
                <td className="px-4 py-3 text-sm text-right">
                  <button
                    onClick={() => startEdit(threshold)}
                    className="text-blue-600 hover:text-blue-800 mr-2"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => deleteThreshold(threshold.grade, threshold.format)}
                    className="text-red-600 hover:text-red-800"
                  >
                    削除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
