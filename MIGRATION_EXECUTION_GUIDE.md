# マイグレーション実行ガイド（修正版）

## 📋 状況確認

### 判明した事実
以下のテーブルは **kobeya-logs-db に存在しません**：
- ❌ `learning_sessions`
- ❌ `flashcard_categories`
- ❌ `flashcard_tags`

### 実際に存在するテーブル
- ✅ `essay_sessions` (student_id カラムあり)
- ✅ `flashcards` (appkey, sid カラムあり)
- ✅ `flashcard_decks` (appkey, sid カラムあり)
- ✅ `international_sessions` (student_name のみ、student_id なし)
- ✅ `international_conversations` (session_id 経由でリンク)

## 🔧 修正されたマイグレーションファイル

### ファイル構成
```
migrations/
├── 0013_FINAL_create_users_table.sql        ← 新規（修正版）
└── 0014_FINAL_migrate_existing_users.sql    ← 新規（修正版）
```

### 旧ファイル（使用しないでください）
- ~~0013_create_users_table.sql~~ → 存在しないテーブルへの操作を含む
- ~~0014_migrate_existing_users.sql~~ → 存在しないテーブルへの操作を含む

## 📝 マイグレーション実行手順

### Step 1: Cloudflare Dashboard にログイン

1. https://dash.cloudflare.com/ にアクセス
2. プロジェクトを選択
3. 左メニューから **「Workers & Pages」** を選択
4. 該当するアプリケーションを選択
5. **「Settings」** → **「Bindings」** から D1 Database の項目を確認
6. **「kobeya-logs-db」** をクリックしてデータベース詳細画面へ

### Step 2: Console タブを開く

1. データベース詳細画面で **「Console」** タブをクリック
2. SQL入力欄が表示されることを確認

### Step 3: Migration 0013 を実行

以下のファイルの内容をコピー&ペーストして実行：

**ファイル**: `migrations/0013_FINAL_create_users_table.sql`

#### 実行内容（概要）
```sql
-- 1. users テーブル作成
CREATE TABLE IF NOT EXISTS users (...);

-- 2. essay_sessions に user_id 追加
ALTER TABLE essay_sessions ADD COLUMN user_id INTEGER ...;

-- 3. flashcards に user_id 追加
ALTER TABLE flashcards ADD COLUMN user_id INTEGER ...;

-- 4. flashcard_decks に user_id 追加
ALTER TABLE flashcard_decks ADD COLUMN user_id INTEGER ...;

-- 5. international_sessions に user_id 追加
ALTER TABLE international_sessions ADD COLUMN user_id INTEGER ...;

-- 6. international_conversations に user_id 追加
ALTER TABLE international_conversations ADD COLUMN user_id INTEGER ...;

-- 7. admin_settings テーブル作成
CREATE TABLE IF NOT EXISTS admin_settings (...);
```

#### 期待される結果
- ✅ `users` テーブルが作成される
- ✅ 各テーブルに `user_id` カラムが追加される
- ✅ `admin_settings` テーブルが作成される
- ✅ エラーなし

#### もしエラーが出た場合

**エラー: "duplicate column name: user_id"**
→ すでに user_id カラムが存在しています。次のステップに進んでください。

**エラー: "table XXX does not exist"**
→ そのテーブルは存在しないため、そのALTER TABLE文をスキップしてください。

### Step 4: Migration 0014 を実行

以下のファイルの内容をコピー&ペーストして実行：

**ファイル**: `migrations/0014_FINAL_migrate_existing_users.sql`

#### 実行内容（概要）
```sql
-- 1. essay_sessions から生徒を抽出
INSERT OR IGNORE INTO users ...
FROM essay_sessions ...;

-- 2. essay_sessions にユーザーIDを紐付け
UPDATE essay_sessions SET user_id = ...;

-- 3. flashcards から生徒を抽出
INSERT OR IGNORE INTO users ...
FROM flashcards ...;

-- 4. flashcards にユーザーIDを紐付け
UPDATE flashcards SET user_id = ...;

-- 5. flashcard_decks から生徒を抽出
INSERT OR IGNORE INTO users ...
FROM flashcard_decks ...;

-- 6. flashcard_decks にユーザーIDを紐付け
UPDATE flashcard_decks SET user_id = ...;

-- 7. international_conversations を間接的に紐付け
UPDATE international_conversations SET user_id = ...;
```

#### 期待される結果
- ✅ 既存の学習データから生徒が抽出される
- ✅ 各レコードが users テーブルにリンクされる
- ✅ エラーなし（または警告のみ）

### Step 5: 検証クエリを実行

マイグレーション成功を確認するため、以下のクエリを実行してください：

#### 5-1. 生徒数の確認
```sql
SELECT COUNT(*) as total_users FROM users;
```

**期待される結果**: 1以上の数値が返る

#### 5-2. サンプルユーザーの確認
```sql
SELECT * FROM users LIMIT 10;
```

**期待される結果**: 生徒のデータが表示される

#### 5-3. リンク状況の確認
```sql
SELECT 
  'essay_sessions' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM essay_sessions
UNION ALL
SELECT 
  'flashcards' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM flashcards
UNION ALL
SELECT 
  'flashcard_decks' as table_name,
  COUNT(*) as total_records,
  COUNT(user_id) as linked_records,
  COUNT(*) - COUNT(user_id) as unlinked_records
FROM flashcard_decks;
```

**期待される結果**: 各テーブルのレコードが user_id にリンクされている

#### 5-4. 重複チェック（重要）
```sql
SELECT app_key, student_id, COUNT(*) as count
FROM users
GROUP BY app_key, student_id
HAVING COUNT(*) > 1;
```

**期待される結果**: 結果なし（重複ユーザーが存在しない）

#### 5-5. 生徒ごとの学習データ統計
```sql
SELECT 
  u.id,
  u.student_id,
  u.student_name,
  u.app_key,
  (SELECT COUNT(*) FROM essay_sessions WHERE user_id = u.id) as essays,
  (SELECT COUNT(*) FROM flashcards WHERE user_id = u.id) as flashcards,
  (SELECT COUNT(*) FROM flashcard_decks WHERE user_id = u.id) as decks
FROM users u
LIMIT 20;
```

**期待される結果**: 各生徒の学習データ統計が表示される

## ✅ マイグレーション完了チェックリスト

- [ ] Migration 0013 を実行（users テーブル作成、user_id カラム追加）
- [ ] Migration 0014 を実行（既存データから生徒抽出、リンク作成）
- [ ] 検証クエリ 5-1 実行（生徒数確認）
- [ ] 検証クエリ 5-2 実行（サンプルユーザー確認）
- [ ] 検証クエリ 5-3 実行（リンク状況確認）
- [ ] 検証クエリ 5-4 実行（重複チェック）
- [ ] 検証クエリ 5-5 実行（学習データ統計確認）

## 🚀 次のステップ

### 1. アプリケーションのデプロイ

```bash
npm run deploy
```

または

```bash
wrangler deploy
```

### 2. 管理画面へのアクセス

デプロイ後、以下のURLにアクセス：

```
https://your-app.pages.dev/admin/login
```

**デフォルトパスワード**: `admin123`

### 3. 管理画面の動作確認

- [ ] ログインページが表示される
- [ ] パスワード `admin123` でログインできる
- [ ] 生徒一覧ページが表示される
- [ ] 既存の生徒データが表示される
- [ ] 新規生徒を追加できる
- [ ] 生徒情報を編集できる
- [ ] 生徒詳細ページで学習統計が表示される

## ⚠️ トラブルシューティング

### 問題: "table XXX does not exist" エラー

**原因**: そのテーブルがデータベースに存在しない

**対応**: そのALTER TABLE文をスキップして次に進む

### 問題: "duplicate column name" エラー

**原因**: user_id カラムがすでに存在している

**対応**: 正常です。次のステップに進んでください。

### 問題: 生徒が1人も抽出されない

**原因**: 既存テーブルにデータが存在しない

**対応**: 
1. 検証クエリ 5-3 で各テーブルのレコード数を確認
2. データが存在する場合は、カラム名が正しいか確認
3. 必要に応じて、管理画面から手動で生徒を追加

### 問題: international_sessions がリンクされない

**原因**: international_sessions テーブルに student_id カラムが存在しない

**対応**: 
- 現在の仕様では automatic linking はできません
- 必要に応じて、後で手動でリンクするか、テーブルスキーマを変更してください

## 📞 サポート

問題が解決しない場合：
1. エラーメッセージの全文をコピー
2. 実行したSQLクエリをコピー
3. 検証クエリの結果をコピー
4. これらの情報を添えて報告してください

---

**作成日**: 2024-11-18  
**対象データベース**: kobeya-logs-db  
**バージョン**: FINAL (修正版)
