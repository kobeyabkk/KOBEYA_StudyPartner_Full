# Study Partner セッション 404 エラー 問題分析

## 🔴 エラー内容

**エラーメッセージ**:
```
❌ 学習セッションが見つかりません。ページを更新してもう一度お試しください。
（エラー詳細: HTTP 404: ）
```

**発生タイミング**: 
- カメラで問題を撮影後
- 「同じような問題」「違うアプローチ」「完全に新しいパターン」ボタンをクリックした時

---

## 🔍 原因分析

### API呼び出しフロー

```
1. カメラ撮影 → /api/analyze-and-learn (POST)
   ↓
2. セッション作成: learningSessions.set(sessionId, learningSession)
   ↓
3. レスポンス返却: { ok: true, sessionId, analysis, steps, ... }
   ↓
4. フロントエンド: currentSession = result (sessionIdを保存)
   ↓
5. ボタンクリック → /api/regenerate-problem (POST)
   ↓
6. セッション取得: learningSessions.get(sessionId)
   ↓
7. 🔴 エラー: session not found → 404
```

### 問題の根本原因

**Cloudflare Workers の特性**:
- **ステートレス実行環境**: 各HTTPリクエストが異なるWorkerインスタンスで処理される可能性がある
- **メモリの非共有**: `learningSessions` Map（インメモリ）は各Workerインスタンスごとに独立
- **セッションが消える**: 最初のリクエストでセッションを作成しても、次のリクエストで別のWorkerインスタンスが使われると、そのMapは空

**コード上の問題箇所**:

### `/api/analyze-and-learn` (464行目)
```typescript
const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`

const learningSession = {
  sessionId,
  appkey,
  sid,
  problemType,
  analysis: learningData.analysis,
  steps: learningData.steps,
  // ...
}

learningSessions.set(sessionId, learningSession) // ❌ インメモリのみ（永続化なし）

return c.json({
  ok: true,
  sessionId,  // ✅ レスポンスには含まれる
  // ...
})
```

### `/api/regenerate-problem` (8330行目)
```typescript
const { sessionId, regenerationType = 'full' } = await c.req.json()

const session = learningSessions.get(sessionId) // ❌ 別のWorkerインスタンスでは見つからない
if (!session) {
  return c.json({
    ok: false,
    error: 'session_not_found',
    message: 'セッションが見つかりません',
    timestamp: new Date().toISOString()
  }, 404) // 🔴 ここでエラー
}
```

---

## ✅ 解決策

### オプション1: D1データベースでセッション永続化（推奨）

**Essay Coaching と同じ方式**を採用：

```typescript
// /api/analyze-and-learn
// 1. セッションをインメモリに保存
learningSessions.set(sessionId, learningSession)

// 2. D1データベースにも保存
const db = c.env?.DB
if (db) {
  await db.prepare(`
    INSERT INTO learning_sessions 
    (session_id, appkey, sid, problem_type, analysis, steps, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    sessionId,
    appkey,
    sid,
    problemType,
    learningData.analysis,
    JSON.stringify(learningData.steps),
    new Date().toISOString()
  ).run()
}
```

```typescript
// /api/regenerate-problem
// 1. インメモリから取得を試す
let session = learningSessions.get(sessionId)

// 2. 見つからない場合はD1から取得
if (!session) {
  const db = c.env?.DB
  if (db) {
    const result = await db.prepare(`
      SELECT * FROM learning_sessions WHERE session_id = ?
    `).bind(sessionId).first()
    
    if (result) {
      session = {
        sessionId: result.session_id,
        appkey: result.appkey,
        sid: result.sid,
        problemType: result.problem_type,
        analysis: result.analysis,
        steps: JSON.parse(result.steps),
        // ...
      }
      // インメモリにもキャッシュ
      learningSessions.set(sessionId, session)
    }
  }
}

if (!session) {
  return c.json({ ok: false, error: 'session_not_found' }, 404)
}
```

### オプション2: Durable Objectsの使用（より高度）

Cloudflare Durable Objectsを使えば、ステートフルなセッション管理が可能ですが、設定が複雑です。

---

## 📋 必要な作業

### 1. データベースマイグレーション

`learning_sessions` テーブルを作成：

```sql
CREATE TABLE IF NOT EXISTS learning_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  appkey TEXT NOT NULL,
  sid TEXT NOT NULL,
  problem_type TEXT,
  analysis TEXT,
  steps TEXT, -- JSON string
  confirmation_problem TEXT, -- JSON string
  similar_problems TEXT, -- JSON string
  current_step INTEGER DEFAULT 0,
  status TEXT DEFAULT 'learning',
  original_image_data TEXT,
  original_user_message TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_learning_sessions_session_id ON learning_sessions(session_id);
CREATE INDEX idx_learning_sessions_sid ON learning_sessions(sid, created_at);
```

### 2. ヘルパー関数の作成

```typescript
// Study Partner用のセッション取得関数
async function getStudyPartnerSession(db: any, sessionId: string) {
  // 1. インメモリから取得
  let session = learningSessions.get(sessionId)
  if (session) return session
  
  // 2. D1から取得
  if (!db) return null
  
  const result = await db.prepare(`
    SELECT * FROM learning_sessions WHERE session_id = ?
  `).bind(sessionId).first()
  
  if (!result) return null
  
  // 3. オブジェクトに変換してキャッシュ
  session = {
    sessionId: result.session_id,
    appkey: result.appkey,
    sid: result.sid,
    problemType: result.problem_type,
    analysis: result.analysis,
    steps: JSON.parse(result.steps || '[]'),
    confirmationProblem: JSON.parse(result.confirmation_problem || '{}'),
    similarProblems: JSON.parse(result.similar_problems || '[]'),
    currentStep: result.current_step,
    status: result.status,
    originalImageData: result.original_image_data,
    originalUserMessage: result.original_user_message,
    createdAt: result.created_at,
    updatedAt: result.updated_at
  }
  
  learningSessions.set(sessionId, session)
  return session
}
```

### 3. API エンドポイントの修正

- `/api/analyze-and-learn`: セッション作成時にD1にも保存
- `/api/regenerate-problem`: セッション取得時にD1からフォールバック
- `/api/submit-step-answer`: セッション更新時にD1も更新

---

## 🎯 優先度

**高**: このバグにより、Study Partner機能の問題再生成が完全に使えない状態です。

---

**作成日**: 2025-11-04  
**報告者**: AI Assistant  
**影響範囲**: Study Partner の問題再生成ボタン（「同じような問題」「違うアプローチ」「完全に新しいパターン」）
