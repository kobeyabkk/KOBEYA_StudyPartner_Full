/**
 * KOBEYA Study Partner - Student Database
 * 生徒データ定義
 */

import type { StudentInfo } from '../types'

/**
 * 生徒データベース
 * 本番環境では実際の生徒データが入ります
 */
export const studentDatabase: Record<string, StudentInfo> = {
  'JS2-04': {
    studentId: 'JS2-04',
    name: '田中太郎',
    grade: 2,
    subjects: ['数学', '理科'],
    weakSubjects: ['英語'],
    lastLogin: new Date().toISOString()
  },
  'test123': {
    studentId: 'test123',
    name: 'テスト生徒',
    grade: 1,
    subjects: ['国語'],
    weakSubjects: ['数学'],
    lastLogin: new Date().toISOString()
  }
}

/**
 * 生徒情報を検索する
 * @param sid - 生徒ID
 * @returns 生徒情報 (見つからない場合はundefined)
 */
export function findStudent(sid: string): StudentInfo | undefined {
  return studentDatabase[sid]
}

/**
 * 生徒のログイン時刻を更新する
 * @param sid - 生徒ID
 */
export function updateStudentLogin(sid: string): void {
  const student = studentDatabase[sid]
  if (student) {
    student.lastLogin = new Date().toISOString()
  }
}

/**
 * 全生徒のリストを取得する（管理用）
 * @returns 生徒IDの配列
 */
export function getAllStudentIds(): string[] {
  return Object.keys(studentDatabase)
}
