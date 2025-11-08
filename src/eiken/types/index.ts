/**
 * 英検対策システム - 型定義
 * V3設計書に基づく型定義
 */

// ====================
// 環境変数
// ====================

export interface EikenEnv {
  DB: D1Database;
  KV: KVNamespace;
  OPENAI_API_KEY: string;
  JWT_SECRET: string;
  R2_BUCKET?: R2Bucket;
}

// ====================
// 学生プロフィール
// ====================

export type EikenGrade = '5' | '4' | '3' | 'pre2' | '2' | 'pre1' | '1';
export type AccountStatus = 'active' | 'suspended' | 'deleted';

export interface StudentProfile {
  id: string;                    // UUID
  email: string;
  display_name?: string;
  target_grade: EikenGrade;
  registration_date: string;
  last_login?: string;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
}

// ====================
// 問題分析
// ====================

export type QuestionType = 'vocabulary' | 'grammar' | 'reading_comp' | 'listening';
export type SentenceStructure = 'simple' | 'compound' | 'complex';

export interface DistractorPattern {
  type: string;
  level: string;
  characteristics?: string[];
}

export interface QuestionAnalysis {
  id: number;
  grade: EikenGrade;
  section: string;
  question_number?: number;
  question_type: QuestionType;
  
  // 分析結果
  grammar_patterns: string[];        // JSON parsed
  vocabulary_level: string;
  sentence_structure: SentenceStructure;
  difficulty_score: number;          // 0.0-1.0
  distractor_patterns: DistractorPattern;
  common_errors?: string[];
  
  source_year?: number;
  source_session?: string;
  analysis_date: string;
  pattern_embedding_hash?: string;
  
  created_at: string;
  updated_at: string;
}

// ====================
// AI生成問題
// ====================

export type AnswerType = 'mcq' | 'written' | 'speaking';
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface GeneratedQuestion {
  id: number;
  analysis_id?: number;
  grade: EikenGrade;
  section: string;
  question_type: QuestionType;
  answer_type: AnswerType;
  
  // 問題データ
  question_text: string;
  choices_json?: string;             // For MCQ
  correct_answer_index?: number;     // For MCQ (0-9)
  correct_answer_text?: string;      // For written/speaking
  explanation?: string;
  explanation_ja?: string;
  audio_key?: string;
  
  // メタデータ
  difficulty_score: number;
  vocab_band?: string;
  
  // AI生成情報
  model: string;
  temperature?: number;
  prompt_hash?: string;
  seed?: number;
  generation_timestamp: string;
  
  // 品質管理
  similarity_score?: number;
  review_status: ReviewStatus;
  reviewed_by?: string;
  reviewed_at?: string;
  quality_score?: number;           // 1-5
  
  created_at: string;
  updated_at: string;
}

export interface GeneratedQuestionWithChoices extends Omit<GeneratedQuestion, 'choices_json'> {
  choices?: string[];               // Parsed from JSON
}

// ====================
// タグ
// ====================

export type TagType = 'grammar' | 'vocabulary' | 'topic';

export interface Tag {
  id: number;
  name: string;
  type: TagType;
  category?: string;
  description?: string;
  created_at: string;
}

export interface QuestionTag {
  question_id: number;
  tag_id: number;
  relevance_score: number;        // 0.0-1.0
}

// ====================
// Embeddingキャッシュ
// ====================

export interface EmbeddingCache {
  id: number;
  text_hash: string;              // SHA-256
  model: string;                  // 'text-embedding-3-small'
  embedding_json: string;         // JSON array of floats
  created_at: string;
  last_used_at: string;
  use_count: number;
}

export interface CachedEmbedding {
  embedding: number[];
  cached_at: string;
}

// ====================
// AI生成ログ
// ====================

export interface GenerationLog {
  id: number;
  request_id: string;
  analysis_id?: number;
  model: string;
  temperature?: number;
  prompt_text?: string;
  response_text?: string;
  generation_time_ms?: number;
  tokens_used?: number;
  success: boolean;
  error_message?: string;
  created_at: string;
}

// ====================
// 監査ログ
// ====================

export interface AuditLog {
  id: number;
  student_id: string;
  action_type: string;
  resource_type?: string;
  resource_id?: string;
  ip_address?: string;
  user_agent?: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// ====================
// 分析設定バージョン管理
// ====================

export interface AnalysisConfiguration {
  id: number;
  config_version: string;         // 'v1.0.0', 'v1.1.0'
  model_name: string;
  prompt_template_hash: string;
  is_active: boolean;
  description?: string;
  created_at: string;
  activated_at?: string;
  deactivated_at?: string;
}

// ====================
// APIレスポンス
// ====================

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code?: string;
    details?: unknown;
  };
  meta?: {
    timestamp: string;
    request_id?: string;
  };
}

// ====================
// ページネーション
// ====================

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    has_more: boolean;
  };
}
