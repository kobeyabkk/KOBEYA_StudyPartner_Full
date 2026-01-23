# データベース問題の修正手順

## 問題の概要

**エラー**: `D1_ERROR: table eiken_generated_questions has no column named translation_ja`

**原因**: 
- マイグレーション `0016_add_translation_fields.sql` が本番環境のCloudflare D1データベースに適用されていない
- コードは `translation_ja` と `vocabulary_meanings` カラムに書き込もうとしているが、カラムが存在しない

**影響**:
- データベース保存が失敗する
- APIレスポンスは正常（エラーはログにのみ記録される）
- 機能には影響なし（優先度: 中）

## 修正手順

### Step 1: 重複マイグレーションの削除（完了✅）

```bash
# 重複したマイグレーション（0027）を削除
rm migrations/0027_add_translation_and_vocabulary_fields.sql
```

**Status**: ✅ 完了

### Step 2: マイグレーションを本番環境に適用

#### Option A: Cloudflare Dashboard経由（推奨）

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) にログイン
2. **Workers & Pages** → **D1** → `kobeya-logs-db` を選択
3. **Console** タブに移動
4. 以下のSQLを実行:

```sql
-- translation_ja カラムを追加
ALTER TABLE eiken_generated_questions ADD COLUMN translation_ja TEXT;

-- vocabulary_meanings カラムを追加
ALTER TABLE eiken_generated_questions ADD COLUMN vocabulary_meanings TEXT;

-- 確認
SELECT 'Migration complete' as status;
```

#### Option B: Wrangler CLI経由

```bash
# 環境変数を設定（GitHubシークレットから取得）
export CLOUDFLARE_API_TOKEN="your_api_token_here"

# マイグレーションを適用
wrangler d1 migrations apply kobeya-logs-db --remote

# または、特定のマイグレーションのみ適用
wrangler d1 execute kobeya-logs-db --remote --file=migrations/0016_add_translation_fields.sql
```

### Step 3: 動作確認

マイグレーション適用後、以下のSQLで確認:

```sql
-- テーブル構造を確認
PRAGMA table_info(eiken_generated_questions);

-- カラムが追加されたことを確認（translation_ja と vocabulary_meanings が表示されるはず）
```

### Step 4: API動作確認

```javascript
// ブラウザコンソールで実行
const API_BASE = 'https://kobeyabkk-studypartner.pages.dev/api/eiken';

async function testDatabaseFix() {
  console.log('=== Database Fix Verification ===');
  
  const response = await fetch(`${API_BASE}/questions/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      student_id: 'test_db_fix',
      grade: '3',
      format: 'grammar_fill',
      count: 1
    })
  });
  
  const data = await response.json();
  console.log('Response:', data);
  
  // save_errorがないことを確認
  if (data.metadata && data.metadata.save_error) {
    console.log('❌ Database save error still exists:', data.metadata.save_error);
  } else {
    console.log('✅ No database save error - Fix successful!');
  }
}

testDatabaseFix();
```

**期待される結果**:
- `metadata.save_error` が `undefined` または存在しない
- エラーメッセージに `translation_ja` が含まれていない

## 補足情報

### マイグレーションファイルの内容

**File**: `migrations/0016_add_translation_fields.sql`

```sql
-- Add translation_ja column to store question text translations
ALTER TABLE eiken_generated_questions ADD COLUMN translation_ja TEXT;

-- Add vocabulary_meanings column to store idioms and phrase explanations
ALTER TABLE eiken_generated_questions ADD COLUMN vocabulary_meanings TEXT;
```

### データベース接続情報

- **Database Name**: `kobeya-logs-db`
- **Database ID**: `b5ac684a-2536-496a-916f-c2c5816a13a0`
- **Binding**: `DB`
- **Config File**: `wrangler.toml`

### 影響範囲

- **影響するテーブル**: `eiken_generated_questions`
- **影響するコード**: 
  - `src/eiken/services/integrated-question-generator.ts` (行 1599-1625)
  - INSERT文で `translation_ja` と `vocabulary_meanings` を使用

## 完了チェックリスト

- [x] Step 1: 重複マイグレーション（0027）を削除
- [ ] Step 2: マイグレーションを本番環境に適用
- [ ] Step 3: データベース構造を確認
- [ ] Step 4: API動作確認
- [ ] Step 5: エラーログを監視（24時間）

## トラブルシューティング

### エラー: "column already exists"

```sql
-- カラムが既に存在する場合、警告のみで続行
-- SQLiteはIF NOT EXISTSをサポートしていないため、
-- エラーが出た場合は既に適用済みと判断
```

### エラー: "API token not set"

```bash
# Cloudflare API トークンを設定
export CLOUDFLARE_API_TOKEN="your_token_here"
```

### マイグレーション状態の確認

```bash
# 適用済みマイグレーションを確認
wrangler d1 migrations list kobeya-logs-db

# 未適用マイグレーションを確認
wrangler d1 migrations list kobeya-logs-db --remote
```

## 次のステップ

マイグレーション適用後:

1. **監視**: 24時間エラーログを監視
2. **検証**: 複数の問題生成テストを実行
3. **ドキュメント更新**: 成功を記録
4. **Phase 7.8.1 の正式リリース**: データベース問題が解決したことを確認

## 関連ドキュメント

- Phase 7.8.1 成功レポート: `PHASE_7.8.1_PRODUCTION_READY.md`
- Phase 7.7 成功レポート: `PHASE_7.7_SUCCESS.md`
- Phase 7.6 成功レポート: `PHASE_7.6_SUCCESS.md`
