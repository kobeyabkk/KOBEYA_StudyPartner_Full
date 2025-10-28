# 🗄️ D1データベース マイグレーション手順

## ✅ プッシュ完了

GitHubへのプッシュが完了しました：
```
0333ae1..1843f02  main -> main
```

Cloudflare Pagesの自動デプロイが開始されます（2-5分）。

---

## 🔧 D1データベース設定が必要

**重要**: D1データベースのマイグレーションを実行する必要があります。

---

## 📋 手順

### ステップ1: Cloudflare Dashboard でD1データベースを確認

1. https://dash.cloudflare.com/ へログイン
2. **Workers & Pages** → **D1** を選択
3. `kobeya-logs-db` データベースを探す

**もしデータベースが存在しない場合**:
```bash
# ローカルで実行（wrangler CLI が必要）
cd /path/to/StudyPartner_Full_Main
npx wrangler d1 create kobeya-logs-db
```

実行後、出力される `database_id` を `wrangler.jsonc` の `database_id` に設定してください。

---

### ステップ2: マイグレーションを実行

#### オプションA: Cloudflare Dashboard（推奨、簡単）

1. D1 database `kobeya-logs-db` を開く
2. **Console** タブを選択
3. 以下のSQLを **1つずつ** 実行:

**マイグレーション 0003 (essay_sessions テーブル作成)**:
```sql
-- 小論文学習セッションテーブル
CREATE TABLE IF NOT EXISTS essay_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT UNIQUE NOT NULL,
  student_id TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  
  -- 授業設定
  target_level TEXT NOT NULL,
  lesson_format TEXT NOT NULL,
  
  -- 進捗状況
  current_step INTEGER DEFAULT 1,
  step_status TEXT,
  
  -- 今日のテーマ
  theme TEXT,
  reading_material TEXT,
  
  -- 完了フラグ
  is_completed INTEGER DEFAULT 0,
  completion_time TEXT
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_essay_sessions_student ON essay_sessions(student_id, created_at);
CREATE INDEX IF NOT EXISTS idx_essay_sessions_session_id ON essay_sessions(session_id);
```

**マイグレーション 0004 (session_data フィールド追加)**:
```sql
-- セッションデータの完全な永続化
ALTER TABLE essay_sessions ADD COLUMN session_data TEXT;

-- インデックスを追加
CREATE INDEX IF NOT EXISTS idx_essay_sessions_updated ON essay_sessions(updated_at DESC);
```

4. 各SQLの実行後、**Query successful** と表示されることを確認

---

#### オプションB: Wrangler CLI（ローカル）

```bash
cd /path/to/StudyPartner_Full_Main

# 本番環境にマイグレーション適用
npx wrangler d1 migrations apply kobeya-logs-db --remote
```

**注意**: 
- `--remote` をつけないとローカルD1にのみ適用されます
- `--remote` で本番D1に適用されます

---

### ステップ3: Pages バインディングを確認

1. Cloudflare Dashboard → **Workers & Pages**
2. `kobeyabkk-studypartner` プロジェクトを選択
3. **Settings** → **Functions** → **D1 database bindings**
4. 以下のバインディングが設定されているか確認:
   - **Variable name**: `DB`
   - **D1 database**: `kobeya-logs-db`

**もし設定されていない場合**:
- **Add binding** をクリック
- Variable name: `DB`
- D1 database: `kobeya-logs-db` を選択
- **Save** をクリック

---

### ステップ4: デプロイ完了を確認

1. **Deployments** タブで最新デプロイのステータスを確認
2. **Success** になったら完了

---

## 🧪 テスト手順

### テスト1: セッション永続性のテスト

```
1. https://kobeyabkk-studypartner.pages.dev/essay-coaching へアクセス
2. 🛠️ 開発モードで開始
3. ⚡ Step 4 へジャンプ
4. 📸 撮影 → OCR → 「確認完了」
5. ✅ AI添削が実行されることを確認
6. ブラウザを完全に閉じる（またはシークレットウィンドウを閉じる）
7. 数分待つ（Worker が再起動する可能性あり）
8. 同じURLに再度アクセス
9. ✅ セッションが復元され、前回の状態が保持されていることを確認
```

### テスト2: OCR修正機能

```
1. Step 4 で撮影 → OCR結果表示
2. OCRが間違っている場合、正しい全文を入力
3. ✅ 「修正内容を保存しました」メッセージ
4. ✅ AI添削が自動開始
5. 🐛 コンソールで確認: '✏️ OCR text corrected by user and saved to D1'
```

### テスト3: エラーメッセージ改善

```
1. 存在しないセッションIDでアクセス
2. ✅ 「セッションが見つかりません。ページをリフレッシュして再度お試しください。」
   というメッセージが表示される
```

---

## 🔍 D1データベースの確認方法

### Cloudflare Dashboard で確認:

1. D1 → `kobeya-logs-db` → **Console** タブ
2. 以下のクエリを実行:

```sql
-- 全セッションを表示
SELECT session_id, student_id, target_level, current_step, created_at, updated_at 
FROM essay_sessions 
ORDER BY updated_at DESC 
LIMIT 10;

-- 特定のセッションの詳細
SELECT * FROM essay_sessions WHERE session_id = 'essay-1234567890-xxxxx';

-- session_data の内容を確認
SELECT session_id, json_extract(session_data, '$.lastActivity') as last_activity,
       json_extract(session_data, '$.ocrResults') as ocr_count
FROM essay_sessions
WHERE session_id = 'essay-1234567890-xxxxx';
```

---

## ❌ トラブルシューティング

### エラー: "session not found"

**原因1**: D1マイグレーションが未実行
- **解決策**: 上記のマイグレーション手順を実行

**原因2**: D1バインディングが未設定
- **解決策**: Pages Settings で `DB` バインディングを設定

**原因3**: セッションIDが古い（マイグレーション前に作成）
- **解決策**: ページをリフレッシュして新しいセッションを開始

### エラー: "DB is undefined"

**原因**: D1バインディングが設定されていない
- **解決策**: 
  1. Pages Settings → Functions → D1 database bindings
  2. Variable name: `DB`, D1 database: `kobeya-logs-db`
  3. 保存して再デプロイ

### マイグレーションエラー

**エラー**: "table essay_sessions already exists"
- **対処**: 正常です。`IF NOT EXISTS` があるため問題ありません

**エラー**: "duplicate column name: session_data"
- **対処**: すでにマイグレーション済みです。次のステップへ進んでください

---

## 📊 期待される動作

### Before（D1導入前）
- ❌ Worker再起動 → セッション消失
- ❌ 長時間放置 → セッション消失
- ❌ デプロイ → 全セッションリセット

### After（D1導入後）
- ✅ Worker再起動 → セッション自動復元
- ✅ 長時間放置 → D1から復元
- ✅ デプロイ → セッションが保持される
- ✅ 生徒が安心して学習を続けられる

---

## 🎉 完了確認

以下が全て ✅ になったら完了です：

- [ ] D1データベース `kobeya-logs-db` が存在する
- [ ] マイグレーション 0003, 0004 が適用済み
- [ ] Pages バインディング `DB` が設定済み
- [ ] 最新デプロイが Success
- [ ] テスト1（セッション永続性）が成功
- [ ] テスト2（OCR修正）が成功
- [ ] エラーメッセージが改善されている

---

**質問があればお知らせください！** 🚀
