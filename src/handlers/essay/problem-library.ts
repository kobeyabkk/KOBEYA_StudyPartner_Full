/**
 * Essay Problem Library Handler
 * 小論文問題ライブラリ管理
 * 
 * 目的:
 * - AI生成した問題文を蓄積・再利用
 * - コスト削減（OpenAI API呼び出しを70-80%削減）
 * - 同じ生徒に同じ問題を出さない
 */

// ========================================
// Types
// ========================================

export interface ProblemLibraryEntry {
  id?: number;
  theme: string;
  problem_text: string;
  target_level: 'high_school' | 'vocational' | 'university';
  target_word_count: number;
  category?: string;
  tags?: string;
  is_current_event: boolean;
  quality_score: number;
  usage_count: number;
  avg_student_score?: number;
  content_hash: string;
  is_active: boolean;
  is_approved: boolean;
  created_at?: string;
  created_by: string;
  updated_at?: string;
  deactivated_at?: string;
  notes?: string;
}

export interface ProblemUsageRecord {
  student_id: string;
  problem_id: number;
  session_id: number;
  student_score?: number;
  used_at?: string;
}

export interface ProblemSelectionOptions {
  studentId: string;
  theme: string;
  targetLevel: 'high_school' | 'vocational' | 'university';
  targetWordCount?: number;
  isCurrentEvent?: boolean;
}

// ========================================
// Utility Functions
// ========================================

/**
 * 問題文のハッシュを生成（重複チェック用）
 * Web Crypto API を使用（Cloudflare Workers対応）
 */
export async function generateContentHash(problemText: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(problemText.trim());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * 品質スコアを計算
 * - 使用回数と平均点から自動計算
 */
export function calculateQualityScore(usageCount: number, avgScore?: number): number {
  if (usageCount >= 10 && avgScore && avgScore >= 80) return 100;
  if (usageCount >= 5 && avgScore && avgScore >= 70) return 85;
  if (usageCount >= 3 && avgScore && avgScore >= 60) return 60;
  if (usageCount >= 1 && avgScore && avgScore < 50) return 20;
  return 50; // デフォルト
}

// ========================================
// Database Operations
// ========================================

/**
 * 問題をライブラリから検索
 * - 生徒が未使用の問題のみ
 * - 品質スコア順
 */
export async function findAvailableProblem(
  db: D1Database,
  options: ProblemSelectionOptions
): Promise<ProblemLibraryEntry | null> {
  const { studentId, theme, targetLevel, isCurrentEvent = false } = options;

  const query = `
    SELECT * FROM essay_problem_library
    WHERE theme = ?
      AND target_level = ?
      AND is_active = 1
      AND is_approved = 1
      AND is_current_event = ?
      AND id NOT IN (
        SELECT problem_id FROM essay_problem_usage
        WHERE student_id = ?
      )
    ORDER BY quality_score DESC, usage_count ASC, RANDOM()
    LIMIT 5
  `;

  const result = await db.prepare(query)
    .bind(theme, targetLevel, isCurrentEvent ? 1 : 0, studentId)
    .all<ProblemLibraryEntry>();

  if (!result.results || result.results.length === 0) {
    return null;
  }

  // 上位5件からランダムに1つ選択（偏り防止）
  const randomIndex = Math.floor(Math.random() * result.results.length);
  return result.results[randomIndex];
}

/**
 * 問題をライブラリに保存
 */
export async function saveProblemToLibrary(
  db: D1Database,
  problem: Omit<ProblemLibraryEntry, 'id' | 'content_hash' | 'created_at' | 'updated_at'>
): Promise<number> {
  const contentHash = await generateContentHash(problem.problem_text);

  // 重複チェック
  const existingProblem = await db.prepare(
    'SELECT id FROM essay_problem_library WHERE content_hash = ?'
  ).bind(contentHash).first<{ id: number }>();

  if (existingProblem) {
    console.log(`Problem already exists in library: ID ${existingProblem.id}`);
    return existingProblem.id;
  }

  // 新規保存
  const query = `
    INSERT INTO essay_problem_library (
      theme, problem_text, target_level, target_word_count,
      category, tags, is_current_event,
      quality_score, usage_count, content_hash,
      is_active, is_approved, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const result = await db.prepare(query).bind(
    problem.theme,
    problem.problem_text,
    problem.target_level,
    problem.target_word_count || 800,
    problem.category || null,
    problem.tags || null,
    problem.is_current_event ? 1 : 0,
    problem.quality_score || 50,
    problem.usage_count || 0,
    contentHash,
    problem.is_active ? 1 : 0,
    problem.is_approved ? 1 : 0,
    problem.created_by || 'ai'
  ).run();

  const insertId = result.meta.last_row_id;
  console.log(`Saved new problem to library: ID ${insertId}, Theme: ${problem.theme}`);
  
  return insertId;
}

/**
 * 問題の使用履歴を記録
 */
export async function recordProblemUsage(
  db: D1Database,
  usage: ProblemUsageRecord
): Promise<void> {
  // 使用履歴を保存
  const insertQuery = `
    INSERT INTO essay_problem_usage (student_id, problem_id, session_id, student_score)
    VALUES (?, ?, ?, ?)
  `;

  try {
    await db.prepare(insertQuery).bind(
      usage.student_id,
      usage.problem_id,
      usage.session_id,
      usage.student_score || null
    ).run();

    // 使用回数をインクリメント
    await db.prepare(
      'UPDATE essay_problem_library SET usage_count = usage_count + 1 WHERE id = ?'
    ).bind(usage.problem_id).run();

    console.log(`Recorded problem usage: Student ${usage.student_id}, Problem ${usage.problem_id}`);
  } catch (error: any) {
    // UNIQUE制約違反（既に記録済み）の場合はスキップ
    if (error.message && error.message.includes('UNIQUE constraint failed')) {
      console.log(`Problem usage already recorded: Student ${usage.student_id}, Problem ${usage.problem_id}`);
      return;
    }
    throw error;
  }
}

/**
 * 生徒の点数を更新して、問題の平均点を再計算
 */
export async function updateProblemScore(
  db: D1Database,
  problemId: number,
  studentId: string,
  score: number
): Promise<void> {
  // 使用履歴の点数を更新
  await db.prepare(
    'UPDATE essay_problem_usage SET student_score = ? WHERE problem_id = ? AND student_id = ?'
  ).bind(score, problemId, studentId).run();

  // 平均点を再計算
  const avgResult = await db.prepare(
    'SELECT AVG(student_score) as avg_score FROM essay_problem_usage WHERE problem_id = ? AND student_score IS NOT NULL'
  ).bind(problemId).first<{ avg_score: number }>();

  if (avgResult && avgResult.avg_score !== null) {
    const avgScore = avgResult.avg_score;

    // 使用回数を取得
    const countResult = await db.prepare(
      'SELECT usage_count FROM essay_problem_library WHERE id = ?'
    ).bind(problemId).first<{ usage_count: number }>();

    if (countResult) {
      const newQualityScore = calculateQualityScore(countResult.usage_count, avgScore);

      // 平均点と品質スコアを更新
      await db.prepare(
        'UPDATE essay_problem_library SET avg_student_score = ?, quality_score = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(avgScore, newQualityScore, problemId).run();

      console.log(`Updated problem quality: ID ${problemId}, Avg: ${avgScore.toFixed(1)}, Quality: ${newQualityScore}`);
    }
  }
}

/**
 * 問題の統計情報を取得
 */
export async function getProblemStatistics(db: D1Database): Promise<any> {
  const stats = await db.prepare(`
    SELECT 
      target_level,
      COUNT(*) as total_problems,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_problems,
      SUM(usage_count) as total_usage,
      AVG(quality_score) as avg_quality_score,
      AVG(avg_student_score) as overall_avg_score
    FROM essay_problem_library
    GROUP BY target_level
  `).all();

  return stats.results;
}

/**
 * 時事問題を年次で論理削除（毎年4月1日実行）
 */
export async function deactivateOldCurrentEvents(db: D1Database): Promise<number> {
  const result = await db.prepare(`
    UPDATE essay_problem_library
    SET is_active = 0, deactivated_at = CURRENT_TIMESTAMP
    WHERE is_current_event = 1
      AND created_at < date('now', '-1 year')
      AND is_active = 1
  `).run();

  const deactivatedCount = result.meta.changes || 0;
  console.log(`Deactivated ${deactivatedCount} old current event problems`);
  
  return deactivatedCount;
}

/**
 * メインの問題取得関数
 * - ライブラリから検索 → 見つかればそれを使用
 * - 見つからなければ null を返す（呼び出し側でAI生成）
 */
export async function getProblemForStudent(
  db: D1Database,
  options: ProblemSelectionOptions
): Promise<{ source: 'library' | 'need_generation'; problem: ProblemLibraryEntry | null; problemId?: number }> {
  // ライブラリから検索
  const libraryProblem = await findAvailableProblem(db, options);

  if (libraryProblem && libraryProblem.id) {
    return {
      source: 'library',
      problem: libraryProblem,
      problemId: libraryProblem.id
    };
  }

  // 見つからない場合は生成が必要
  return {
    source: 'need_generation',
    problem: null
  };
}
