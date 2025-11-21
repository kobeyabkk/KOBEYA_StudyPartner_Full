# データベースマイグレーションガイド

## 📋 概要

このガイドでは、ユーザー管理システムのためのデータベースマイグレーションを実行します。

### マイグレーション内容

1. **0013_create_users_table.sql** - usersテーブルと関連インデックスの作成
2. **0014_migrate_existing_users.sql** - 既存データからユーザーを抽出して移行

---

## 🚀 マイグレーション手順

### Step 1: 現在のデータベース状態を確認

```bash
cd /home/user/webapp

# テーブル一覧を確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT name FROM sqlite_master WHERE type='table';" --remote
```

### Step 2: マイグレーション 0013 を実行

```bash
# usersテーブルを作成
wrangler d1 execute kobeya-study-partner-db --file="migrations/0013_create_users_table.sql" --remote
```

**確認:**
```bash
# usersテーブルが作成されたか確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT sql FROM sqlite_master WHERE type='table' AND name='users';" --remote
```

### Step 3: マイグレーション 0014 を実行

```bash
# 既存データからユーザーを移行
wrangler d1 execute kobeya-study-partner-db --file="migrations/0014_migrate_existing_users.sql" --remote
```

**確認:**
```bash
# 作成されたユーザー数を確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT COUNT(*) as total_users FROM users;" --remote

# ユーザー一覧を表示
wrangler d1 execute kobeya-study-partner-db --command="SELECT id, app_key, student_id, student_name, created_at FROM users ORDER BY created_at DESC;" --remote
```

### Step 4: データ整合性を確認

```bash
# study_partner_sessionsのuser_id紐付けを確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT COUNT(*) as sessions_linked FROM study_partner_sessions WHERE user_id IS NOT NULL;" --remote

# essay_coaching_sessionsのuser_id紐付けを確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT COUNT(*) as essays_linked FROM essay_coaching_sessions WHERE user_id IS NOT NULL;" --remote

# flashcard_cardsのuser_id紐付けを確認
wrangler d1 execute kobeya-study-partner-db --command="SELECT COUNT(*) as cards_linked FROM flashcard_cards WHERE user_id IS NOT NULL;" --remote
```

---

## 🔧 便利なスクリプト

### 全マイグレーションを一括実行（推奨）

```bash
./scripts/run-migrations.sh
```

### 特定のマイグレーションだけ実行

```bash
./scripts/run-migrations.sh 0013
```

---

## 📊 マイグレーション後の確認クエリ

### ユーザー一覧を表示

```bash
wrangler d1 execute kobeya-study-partner-db --command="
SELECT 
  id,
  app_key,
  student_id,
  student_name,
  grade,
  email,
  created_at,
  last_login_at,
  is_active
FROM users
ORDER BY created_at DESC;
" --remote
```

### 学習履歴が紐付いているか確認

```bash
wrangler d1 execute kobeya-study-partner-db --command="
SELECT 
  u.student_id,
  u.student_name,
  COUNT(DISTINCT sps.id) as study_sessions,
  COUNT(DISTINCT ecs.id) as essay_sessions,
  COUNT(DISTINCT fc.id) as flashcards
FROM users u
LEFT JOIN study_partner_sessions sps ON sps.user_id = u.id
LEFT JOIN essay_coaching_sessions ecs ON ecs.user_id = u.id
LEFT JOIN flashcard_cards fc ON fc.user_id = u.id
GROUP BY u.id
ORDER BY u.created_at DESC;
" --remote
```

---

## ⚠️ トラブルシューティング

### エラー: "table users already exists"

すでにマイグレーション済みです。確認クエリで状態をチェックしてください。

### エラー: "no such table: users"

マイグレーション0013が実行されていません。Step 2から再実行してください。

### user_idがNULLのままのデータがある

既存データのapp_key/student_idが不正な可能性があります。以下で確認：

```bash
# user_idがNULLのセッションを確認
wrangler d1 execute kobeya-study-partner-db --command="
SELECT appkey, sid, COUNT(*) 
FROM study_partner_sessions 
WHERE user_id IS NULL 
GROUP BY appkey, sid;
" --remote
```

---

## 🎯 次のステップ

マイグレーションが完了したら：

1. ✅ **管理画面の実装** (`/admin/users`)
2. ✅ **ログイン機能の統合** (usersテーブルで認証)
3. ✅ **学習履歴の表示** (user_idで紐付け)

---

## 📝 デフォルト管理者パスワード

- **パスワード**: `admin123`
- **⚠️ 重要**: 初回ログイン後、必ず変更してください

---

## 💾 バックアップ

マイグレーション前にバックアップを取ることを推奨します：

```bash
# D1のデータをエクスポート（Cloudflareダッシュボードから実行）
# または、wrangler d1 export コマンドを使用
```
