import React from 'react';
import type { EikenGrade } from '../../eiken/types';

interface GradeSelectorProps {
  value: EikenGrade;
  onChange: (grade: EikenGrade) => void;
  disabled?: boolean;
}

const GRADE_INFO: Record<EikenGrade, { label: string; level: string; description: string }> = {
  '5': {
    label: '5級',
    level: '中学初級程度',
    description: '英語学習の入門レベル'
  },
  '4': {
    label: '4級',
    level: '中学中級程度',
    description: '基礎的な英語理解'
  },
  '3': {
    label: '3級',
    level: '中学卒業程度',
    description: '日常会話レベル'
  },
  'pre2': {
    label: '準2級',
    level: '高校中級程度',
    description: '高校生レベルの英語力'
  },
  '2': {
    label: '2級',
    level: '高校卒業程度',
    description: '社会生活に必要な英語'
  },
  'pre1': {
    label: '準1級',
    level: '大学中級程度',
    description: 'ビジネスで使える英語'
  },
  '1': {
    label: '1級',
    level: '大学上級程度',
    description: '広範囲な知識と高度な英語力'
  }
};

export default function GradeSelector({ value, onChange, disabled = false }: GradeSelectorProps) {
  // 表示順序: 5級 → 4級 → 3級 → 準2級 → 2級 → 準1級 → 1級
  // （左上から右下に向かってこの順序で表示）
  const grades: EikenGrade[] = ['5', '4', '3', 'pre2', '2', 'pre1', '1'];

  return (
    <div className="space-y-4">
      <label className="block text-sm font-medium text-gray-700">
        目標級を選択 {/* v2.0 - 順序修正版 */}
      </label>
      
      {/* グリッドレイアウト: 3列固定で期待通りの順序を表示 */}
      <div className="grid grid-cols-3 gap-3">
        {grades.map((grade) => {
          const info = GRADE_INFO[grade];
          const isSelected = value === grade;
          
          return (
            <button
              key={grade}
              onClick={() => onChange(grade)}
              disabled={disabled}
              className={`
                p-4 rounded-lg border-2 transition-all
                ${isSelected 
                  ? 'border-blue-500 bg-blue-50 shadow-md' 
                  : 'border-gray-200 bg-white hover:border-blue-300'
                }
                ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
              `}
            >
              <div className="text-center">
                <div className={`text-2xl font-bold ${isSelected ? 'text-blue-600' : 'text-gray-900'}`}>
                  {info.label}
                </div>
                <div className="text-xs text-gray-600 mt-1">
                  {info.level}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* 選択された級の詳細説明 */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <svg className="h-6 w-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-900">
              {GRADE_INFO[value].label} - {GRADE_INFO[value].level}
            </h3>
            <p className="mt-1 text-sm text-gray-600">
              {GRADE_INFO[value].description}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
