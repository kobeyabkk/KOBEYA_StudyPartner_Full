# Migration 0006: Learning Sessions Table

## 📋 概要

Study Partner機能のセッション永続化のため、D1データベースに`learning_sessions`テーブルを作成します。

## 🔴 問題の背景

**エラー**: 問題再生成ボタンをクリックすると404エラー
```
❌ 学習セッションが見つかりません。ページを更新してもう一度お試しください。
（エラー詳細: HTTP 404: ）
```

**原因**: Cloudflare Workersのステートレス実行により、インメモリセッションが異なるWorkerインスタンス間で共有されない。

## ✅ 修正内容

1. **D1テーブル追加**: `learning_sessions`テーブルでセッションを永続化
2. **フォールバック機能**: インメモリで見つからない場合、D1から取得
3. **セッション保存**: カメラ撮影・再生成時にD1に保存

## 🚀 マイグレーション実行手順

### オプション1: Cloudflare Dashboard経由（推奨）

1. **Cloudflare Dashboardにログイン**
   - https://dash.cloudflare.com/

2. **D1データベースを開く**
   - Workers & Pages → D1
   - `kobeya-logs-db` を選択

3. **コンソールタブを開く**
   - 「Console」タブをクリック

4. **マイグレーションSQLを実行**
   
   以下のSQLをコピー＆ペーストして実行：
   
   ```sql
   -- Study Partner Learning Sessions Table
   CREATE TABLE IF NOT EXISTS learning_sessions (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     session_id TEXT UNIQUE NOT NULL,
     appkey TEXT NOT NULL,
     sid TEXT NOT NULL,
     problem_type TEXT,
     analysis TEXT,
     steps TEXT,
     confirmation_problem TEXT,
     similar_problems TEXT,
     current_step INTEGER DEFAULT 0,
     status TEXT DEFAULT 'learning',
     original_image_data TEXT,
     original_user_message TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP,
     updated_at TEXT DEFAULT CURRENT_TIMESTAMP
   );
   
   CREATE INDEX IF NOT EXISTS idx_learning_sessions_session_id ON learning_sessions(session_id);
   CREATE INDEX IF NOT EXISTS idx_learning_sessions_sid ON learning_sessions(sid, created_at);
   CREATE INDEX IF NOT EXISTS idx_learning_sessions_status ON learning_sessions(status);
   ```

5. **実行結果を確認**
   - 成功メッセージが表示されることを確認

### オプション2: Wrangler CLI経由

```bash
# ローカル開発環境の場合
wrangler d1 execute kobeya-logs-db --local --file=migrations/0006_create_learning_sessions.sql

# 本番環境の場合
wrangler d1 execute kobeya-logs-db --remote --file=migrations/0006_create_learning_sessions.sql
```

### オプション3: API経由（既存の仕組み）

**注意**: この方法は試験的なものです。Dashboard経由を推奨します。

```bash
# 本番環境のAPIエンドポイントを使用
curl -X POST https://kobeyabkk-studypartner.pages.dev/api/admin/migrate-db \
  -H "Content-Type: application/json"
```

## ✅ マイグレーション確認

テーブルが正常に作成されたか確認：

```sql
-- Cloudflare Dashboard Console で実行
SELECT name FROM sqlite_master WHERE type='table' AND name='learning_sessions';
```

期待される結果:
```
learning_sessions
```

## 🧪 動作テスト

1. **カメラ撮影テスト**
   - Study Partnerページでカメラボタンをクリック
   - 問題を撮影
   - 分析結果が表示される

2. **再生成ボタンテスト**
   - 「同じような問題」ボタンをクリック
   - **以前**: 404エラー ❌
   - **修正後**: 新しい問題が生成される ✅

3. **他の再生成ボタン**
   - 「違うアプローチ」ボタン
   - 「完全に新しいパターン」ボタン
   - すべて正常に動作することを確認

## 📊 テーブル構造

| カラム名 | 型 | 説明 |
|---------|-----|------|
| id | INTEGER | 自動採番ID |
| session_id | TEXT | セッション識別子（ユニーク） |
| appkey | TEXT | アプリケーションキー |
| sid | TEXT | 生徒ID |
| problem_type | TEXT | 問題タイプ（例: quadratic_equation） |
| analysis | TEXT | AI分析結果 |
| steps | TEXT | 学習ステップ（JSON） |
| confirmation_problem | TEXT | 確認問題（JSON） |
| similar_problems | TEXT | 類似問題（JSON） |
| current_step | INTEGER | 現在のステップ番号 |
| status | TEXT | ステータス（learning/completed） |
| original_image_data | TEXT | 元画像データ（Base64） |
| original_user_message | TEXT | ユーザーメッセージ |
| created_at | TEXT | 作成日時 |
| updated_at | TEXT | 更新日時 |

## 🔍 トラブルシューティング

### エラー: "table learning_sessions already exists"

問題なし。テーブルは既に作成されています。`IF NOT EXISTS`により安全です。

### エラー: "no such table: learning_sessions"

マイグレーションが実行されていません。上記の手順を再実行してください。

### 404エラーが継続する場合

1. **マイグレーション確認**: テーブルが作成されているか確認
2. **コードデプロイ確認**: 最新コード（13cf6f6）がデプロイされているか確認
3. **ログ確認**: Cloudflare Dashboardでログを確認
   - `✅ Study Partner session saved to D1` が出力されているか
   - `✅ Study Partner session retrieved from D1` が出力されているか

## 📝 関連ファイル

- **マイグレーションSQL**: `migrations/0006_create_learning_sessions.sql`
- **ヘルパー関数**: `src/index.tsx` (183-280行目)
- **修正箇所**: 
  - `/api/analyze-and-learn` (5箇所)
  - `/api/regenerate-problem` (1箇所)
- **問題分析**: `STUDY_PARTNER_SESSION_ISSUE.md`

---

**作成日**: 2025-11-04  
**コミット**: 13cf6f6  
**マイグレーション番号**: 0006
