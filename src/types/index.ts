/**
 * KOBEYA Study Partner - Type Definitions
 * 型定義ファイル
 */

// 生徒情報の型
export interface StudentInfo {
  studentId: string
  name: string
  grade: number
  subjects: string[]
  weakSubjects: string[]
  lastLogin: string
}

// 学習ステップの型
export interface LearningStep {
  stepNumber: number
  instruction: string
  type: 'choice' | 'input'
  options?: string[]
  correctAnswer: string
  explanation: string
  hint?: string
}

// 確認問題の型
export interface ConfirmationProblem {
  question: string
  type: 'choice' | 'input'
  options?: string[]
  correctAnswer: string
  explanation: string
}

// 類似問題の型
export interface SimilarProblem {
  question: string
  type: 'choice' | 'input'
  options?: string[]
  correctAnswer: string
  explanation: string
  difficulty: string
}

// 学習セッションの型
export interface LearningSession {
  sessionId: string
  appkey: string
  sid: string
  problemType: string
  analysis: string
  steps: LearningStep[]
  confirmationProblem: ConfirmationProblem
  similarProblems: SimilarProblem[]
  currentStep: number
  status: 'learning' | 'confirmation' | 'similar' | 'completed'
  createdAt: string
  updatedAt: string
  originalImageData?: string | null
  originalUserMessage?: string
}

// API レスポンスの型
export interface ApiResponse<T = any> {
  ok: boolean
  error?: string
  message?: string
  data?: T
}

// ログインレスポンスの型
export interface LoginResponse {
  ok: boolean
  student?: StudentInfo
  error?: string
  message?: string
}

// 学習開始レスポンスの型
export interface AnalysisResponse {
  ok: boolean
  sessionId: string
  analysis: string
  subject: string
  grade: number
  difficulty: string
  steps: LearningStep[]
  confirmationProblem: ConfirmationProblem
  similarProblems: SimilarProblem[]
  currentStep: LearningStep
  totalSteps: number
  status: string
  message: string
}

// ステップチェックレスポンスの型
export interface StepCheckResponse {
  ok: boolean
  isCorrect: boolean
  feedback: string
  nextAction: 'next_step' | 'confirmation' | 'retry'
  nextStep?: LearningStep
  confirmationProblem?: ConfirmationProblem
}

// Cloudflare Workers環境の型
export interface Env {
  DB?: D1Database
  OPENAI_API_KEY?: string
}
