# 🤖 AI添削フィードバック永続化テスト手順（初心者向け）

## 🎯 このテストの目的
OpenAI APIによるAI添削フィードバックがD1データベースに保存され、Worker再起動後も保持されることを確認します。

---

## 📋 前提条件

このテストを始める前に、以下が完了している必要があります：

1. ✅ セッションが初期化されている
2. ✅ 画像がアップロードされている
3. ✅ OCR処理が完了している
4. ✅ （オプション）OCR結果が修正されている

まだの場合は、以下を先に実行してください：
- `TEST_SESSION_PERSISTENCE.md` のステップ1〜3
- `TEST_OCR_CORRECTION.md`（任意）

---

## 🧪 テスト手順

### ステップ1: AI添削を実行
1. OCR処理が完了した状態で、**「AI添削を受ける」** ボタンをクリック

2. AI処理が開始される（10〜60秒程度かかります）

3. **確認ポイント**:
   - ✅ 「AI添削を実行中...」というメッセージが表示される
   - ✅ ローディングインジケーター（回転するアイコン）が表示される

---

### ステップ2: フィードバック結果を確認
1. AI処理が完了すると、フィードバックが表示されます

2. **表示内容の例**:
   ```
   【構成】
   ・序論、本論、結論の3部構成が明確です
   ・段落の区切りが適切です
   
   【内容】
   ・具体例が豊富で説得力があります
   ・論理的なつながりが明確です
   
   【改善点】
   ・結論部分でより強いメッセージを
   ・接続詞の使い方に注意
   
   【評価】
   80点 / 100点
   ```

3. **テスト用メモ**: 
   - フィードバックの最初の数行をメモ帳にコピー
   - 評価点数をメモ

---

### ステップ3: D1データベースで保存を確認
1. Cloudflare Dashboard → D1 → `kobeya-logs-db` を開く

2. **Console** タブで以下のクエリを実行:
   ```sql
   SELECT 
     session_id, 
     has_feedback, 
     updated_at,
     LENGTH(session_data) as data_size
   FROM essay_sessions 
   WHERE session_id = 'あなたのセッションID'
   LIMIT 1;
   ```

3. **確認ポイント**:
   - ✅ `has_feedback` が `1` (true)
   - ✅ `updated_at` が最新の時刻に更新されている
   - ✅ `data_size` が大きくなっている（フィードバックテキストが追加されたため）

---

### ステップ4: フィードバックの詳細を確認
1. 以下のSQLクエリで、保存されたフィードバックの内容を確認:
   ```sql
   SELECT json_extract(session_data, '$.feedbacks') as feedback_data
   FROM essay_sessions 
   WHERE session_id = 'あなたのセッションID';
   ```

2. **確認ポイント**:
   - ✅ `feedbacks` 配列が存在する
   - ✅ 配列の中にフィードバックオブジェクトが含まれている
   - ✅ `text` フィールドにフィードバック内容が保存されている
   - ✅ `timestamp` フィールドに実行時刻が記録されている

---

### ステップ5: ページをリロード
1. ブラウザの **更新ボタン** をクリック（または F5 キー）

2. **期待される結果**:
   - ✅ フィードバックが表示される
   - ✅ ステップ2でメモした内容と一致する
   - ✅ 「AI添削を受ける」ボタンが「再度AI添削を受ける」に変わっている

---

### ステップ6: 🔄 Worker再起動後の永続化テスト

#### 方法A: 10分間待つ（確実）
1. ブラウザのタブを閉じる
2. 10分間待つ（Workerが自動的にスリープ）
3. セッションID付きURLを開く:
   ```
   https://kobeyabkk-studypartner.pages.dev/?session=あなたのセッションID
   ```

#### 方法B: シークレットウィンドウで開く（簡易版）
1. 新しいシークレット/プライベートウィンドウを開く
2. セッションID付きURLを貼り付けて開く

#### 方法C: Cloudflare Dashboardから再デプロイ（上級者向け）
1. Cloudflare Dashboard → Pages → kobeyabkk-studypartner
2. **Deployments** タブ → **Retry deployment**

---

### ステップ7: フィードバック永続化を確認
1. セッションID付きURLを開く

2. **期待される結果**:
   - ✅ AI添削フィードバックが表示される
   - ✅ ステップ2でメモした内容と完全に一致する
   - ✅ 評価点数が保持されている
   - ✅ 「再度AI添削を受ける」ボタンが表示される

3. **比較確認**:
   - メモした内容と画面表示を比較
   - 特に評価点数、主要なフィードバックポイントが一致するか

---

### ステップ8: 複数回のAI添削をテスト（オプション）
1. **「再度AI添削を受ける」** ボタンをクリック

2. 2回目のフィードバックが生成される

3. **確認ポイント**:
   - ✅ 1回目と2回目のフィードバックが両方表示される
   - ✅ 各フィードバックに実行時刻が表示される
   - ✅ 最新のフィードバックが一番上に表示される

4. D1データベースで確認:
   ```sql
   SELECT json_extract(session_data, '$.feedbacks') as feedback_data
   FROM essay_sessions 
   WHERE session_id = 'あなたのセッションID';
   ```
   → `feedbacks` 配列に複数のフィードバックが保存されているか確認

---

### ステップ9: 履歴の永続化を確認
1. 再度、ステップ6のWorker再起動シミュレーションを実行

2. セッションID付きURLを開く

3. **期待される結果**:
   - ✅ 複数回のフィードバックがすべて表示される
   - ✅ 実行時刻の順序が正しい（新しいものが上）
   - ✅ すべてのフィードバック内容が保持されている

---

## 📊 テスト結果の記録

| テスト項目 | 結果 | 備考 |
|-----------|------|------|
| AI添削の実行 | ⬜ 成功 / ⬜ 失敗 | |
| フィードバックの表示 | ⬜ 成功 / ⬜ 失敗 | |
| D1への保存確認 | ⬜ 成功 / ⬜ 失敗 | |
| ページリロード後の保持 | ⬜ 成功 / ⬜ 失敗 | |
| Worker再起動後の保持 | ⬜ 成功 / ⬜ 失敗 | |
| 複数回添削の履歴保持 | ⬜ 成功 / ⬜ 失敗 | |
| 履歴の永続化 | ⬜ 成功 / ⬜ 失敗 | |

---

## 🐛 トラブルシューティング

### 問題1: AI添削が実行できない
**原因**: OpenAI APIキーの問題またはセッションエラー

**確認方法**:
1. F12キーを押して開発者ツールを開く
2. **Console** タブでエラーメッセージを確認
3. ネットワークタブで `/api/essay/feedback` リクエストを確認

**解決策**:
- Cloudflare Pages の環境変数に `OPENAI_API_KEY` が設定されているか確認
- セッションIDが正しいか確認（URLの `?session=` 部分）
- OCR結果が存在するか確認

---

### 問題2: フィードバックが保存されない
**原因**: D1データベースへの書き込みエラー

**確認方法**:
```sql
SELECT has_feedback, updated_at FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```
→ `has_feedback` が `1` に更新されているか確認

**解決策**:
- D1バインディングが正しく設定されているか確認
- `wrangler.toml` の `binding = "DB"` を確認
- Cloudflare Dashboard → D1 → Metrics でエラーがないか確認

---

### 問題3: ページリロード後にフィードバックが消える
**原因**: D1からの読み込みエラー

**確認方法**:
```sql
SELECT session_data FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```
→ `feedbacks` フィールドにデータがあるか確認

**デバッグクエリ**:
```sql
SELECT 
  json_extract(session_data, '$.feedbacks') as feedbacks,
  json_array_length(json_extract(session_data, '$.feedbacks')) as feedback_count
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

**解決策**:
- `loadSessionFromDB()` 関数が `feedbacks` フィールドを正しく復元しているか確認
- ブラウザのConsole（F12）でJavaScriptエラーを確認

---

### 問題4: Worker再起動後にフィードバックが消える
**原因**: D1への保存またはD1からの復元に問題

**診断クエリ**:
```sql
-- フィードバックの詳細確認
SELECT 
  session_id,
  has_feedback,
  json_array_length(json_extract(session_data, '$.feedbacks')) as feedback_count,
  datetime(updated_at / 1000, 'unixepoch') as last_updated
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

**解決策**:
- `src/index.tsx` の `/api/essay/feedback` エンドポイントを確認
- `updateSession()` 関数が `feedbacks` フィールドを保存しているか確認
- Cloudflare Pagesを再デプロイ

---

### 問題5: 複数回のフィードバックが保持されない
**原因**: フィードバック配列の上書き問題

**確認方法**:
```sql
SELECT json_extract(session_data, '$.feedbacks') as feedbacks
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```
→ 配列に複数の要素があるか確認

**解決策**:
- フィードバック保存時に配列に追加（push）しているか確認
- 既存の配列を上書きしていないか確認
- コード例:
  ```typescript
  session.essaySession.feedbacks = session.essaySession.feedbacks || []
  session.essaySession.feedbacks.push({
    text: feedbackText,
    timestamp: Date.now()
  })
  ```

---

## 🔍 デバッグ用SQLクエリ

### フィードバック詳細情報
```sql
SELECT 
  session_id,
  has_feedback,
  json_array_length(json_extract(session_data, '$.feedbacks')) as feedback_count,
  datetime(created_at / 1000, 'unixepoch') as created,
  datetime(updated_at / 1000, 'unixepoch') as last_updated
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

### フィードバックの内容
```sql
SELECT json_extract(session_data, '$.feedbacks[0].text') as first_feedback
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

### 最近のフィードバック履歴（全セッション）
```sql
SELECT 
  session_id,
  has_feedback,
  datetime(updated_at / 1000, 'unixepoch') as last_updated
FROM essay_sessions 
WHERE has_feedback = 1
ORDER BY updated_at DESC 
LIMIT 10;
```

---

## ✅ テスト成功の基準

以下すべてが満たされていれば **テスト成功** です：

1. ✅ AI添削が正常に実行される
2. ✅ フィードバックが画面に表示される
3. ✅ D1データベースに保存される（`has_feedback = 1`）
4. ✅ ページリロード後もフィードバックが表示される
5. ✅ Worker再起動後もフィードバックが保持される
6. ✅ 複数回のフィードバック履歴がすべて保存される
7. ✅ 履歴がWorker再起動後も保持される

---

## 🎉 全機能統合テスト

すべてのテストに合格した場合、以下の完全なワークフローを試してください：

1. セッション初期化
2. 画像アップロード
3. OCR処理
4. OCR結果を修正
5. AI添削を実行
6. 2回目のAI添削を実行
7. 10分間待機（Worker自動スリープ）
8. セッションID付きURLで再アクセス
9. **期待される結果**: すべてのデータが復元される
   - ✅ アップロードした画像
   - ✅ 修正済みOCRテキスト
   - ✅ 複数回のAIフィードバック履歴

---

## 📞 サポートが必要な場合

以下の情報を添えて質問してください：

1. **失敗したステップ番号**
2. **エラーメッセージのスクリーンショット**
3. **ブラウザの開発者ツール Console の内容**（F12キーで開く）
4. **ネットワークタブの `/api/essay/feedback` リクエスト詳細**
5. **D1データベースのクエリ結果**（上記のデバッグクエリを実行）
6. **セッションID**

---

**作成日**: 2025-10-29  
**対象バージョン**: StudyPartner Full v1.0 (D1統合版)  
**関連ドキュメント**: 
- TEST_SESSION_PERSISTENCE.md
- TEST_OCR_CORRECTION.md
