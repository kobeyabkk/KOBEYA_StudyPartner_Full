# ✏️ OCR修正機能テスト手順（初心者向け）

## 🎯 このテストの目的
手書き文字のOCR認識結果を修正し、その修正内容がD1データベースに保存され、Worker再起動後も保持されることを確認します。

---

## 📋 前提条件

このテストを始める前に、以下が完了している必要があります：

1. ✅ セッションが初期化されている
2. ✅ 画像がアップロードされている
3. ✅ OCR処理が完了している

まだの場合は、`TEST_SESSION_PERSISTENCE.md` のステップ1〜3を先に実行してください。

---

## 🧪 テスト手順

### ステップ1: OCR結果を確認
1. アプリケーション画面で **OCR処理結果** を確認

2. **例**:
   ```
   私は将来、医師になりたいと考えている。
   なぜなら、人々の命を救う仕事に憧れているからだ。
   ```

3. **テスト用メモ**: 
   - 元のOCRテキストの最初の1〜2行をメモ帳にコピー

---

### ステップ2: 修正ボタンをクリック
1. **「OCR結果を修正」** ボタンをクリック

2. **確認ポイント**:
   - ✅ テキストエリア（編集可能なテキストボックス）が表示される
   - ✅ 現在のOCRテキストが表示されている
   - ✅ 「修正を保存」「キャンセル」ボタンが表示される

---

### ステップ3: テキストを修正
1. テキストエリア内で、OCRの誤認識を修正

**修正例**:

| 元のOCR結果（誤） | 修正後（正） |
|----------------|------------|
| 私は将来、医師になりたいと考えている。 | 私は将来、**優秀な**医師になりたいと考えている。 |
| なぜなら、人々の命を救う仕事に憧れているからだ。 | なぜなら、人々の命を救う仕事に**強く**憧れているからだ。 |

2. **テスト用メモ**: 
   - 修正後のテキストをメモ帳にコピー

---

### ステップ4: 修正を保存
1. **「修正を保存」** ボタンをクリック

2. **期待される結果**:
   - ✅ 「修正が保存されました」という成功メッセージが表示される
   - ✅ テキストエリアが閉じる
   - ✅ 修正後のテキストが表示される
   - ✅ ボタンが「OCR結果を修正」に戻る

3. **❌ もし失敗した場合**:
   - エラーメッセージが表示される
   - テキストが元に戻ってしまう
   → 後述のトラブルシューティングを参照

---

### ステップ5: D1データベースで保存を確認
1. Cloudflare Dashboard → D1 → `kobeya-logs-db` を開く

2. **Console** タブで以下のクエリを実行:
   ```sql
   SELECT session_id, has_ocr_results, updated_at, session_data 
   FROM essay_sessions 
   WHERE session_id = 'あなたのセッションID'
   LIMIT 1;
   ```

3. **確認ポイント**:
   - ✅ `has_ocr_results` が `1` (true)
   - ✅ `updated_at` が最新の時刻に更新されている
   - ✅ `session_data` フィールドに修正後のテキストが含まれている

4. **詳細確認**（session_dataの中身をチェック）:
   - `session_data` カラムをクリックして展開
   - JSONの中に `ocrResults` 配列が存在
   - 修正したテキストが含まれているか確認

---

### ステップ6: ページをリロード
1. ブラウザの **更新ボタン** をクリック（または F5 キー）

2. **期待される結果**:
   - ✅ 修正後のテキストが表示される
   - ✅ 元のOCRテキストではなく、修正版が表示される

3. **❌ もし失敗した場合**:
   - 元のOCRテキストに戻ってしまう
   → D1からの読み込みに問題があります

---

### ステップ7: 🔄 Worker再起動後の永続化テスト

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

### ステップ8: 修正内容の永続化を確認
1. セッションID付きURLを開く

2. **期待される結果**:
   - ✅ 修正後のOCRテキストが表示される
   - ✅ ステップ3で行った修正が保持されている
   - ✅ 「OCR結果を修正」ボタンが表示される

3. **比較確認**:
   - ステップ3でメモした「修正後のテキスト」と一致するか確認

---

### ステップ9: 複数回の修正をテスト（オプション）
1. 再度 **「OCR結果を修正」** をクリック

2. さらに別の箇所を修正
   - 例: 句読点を追加、段落を整理

3. **「修正を保存」** をクリック

4. ステップ5〜8を繰り返して、2回目の修正も永続化されるか確認

---

## 📊 テスト結果の記録

| テスト項目 | 結果 | 備考 |
|-----------|------|------|
| 修正ボタンの表示 | ⬜ 成功 / ⬜ 失敗 | |
| テキスト編集 | ⬜ 成功 / ⬜ 失敗 | |
| 修正の保存 | ⬜ 成功 / ⬜ 失敗 | |
| D1への保存確認 | ⬜ 成功 / ⬜ 失敗 | |
| ページリロード後の保持 | ⬜ 成功 / ⬜ 失敗 | |
| Worker再起動後の保持 | ⬜ 成功 / ⬜ 失敗 | |
| 複数回修正の保持 | ⬜ 成功 / ⬜ 失敗 | |

---

## 🐛 トラブルシューティング

### 問題1: 「修正を保存」ボタンが押せない
**原因**: APIエラーまたはJavaScriptエラー

**確認方法**:
1. F12キーを押して開発者ツールを開く
2. **Console** タブを確認
3. 赤いエラーメッセージがないか確認

**解決策**:
- ブラウザをリロード（Ctrl+F5 または Cmd+Shift+R）
- セッションIDが正しいか確認
- Cloudflare Pagesのデプロイが成功しているか確認

---

### 問題2: 修正が保存されない
**原因**: D1データベースへの書き込みエラー

**確認方法**:
```sql
SELECT session_id, updated_at FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```
→ `updated_at` が修正時刻に更新されているか確認

**解決策**:
- D1バインディングが正しく設定されているか確認
- `wrangler.toml` の `binding = "DB"` を確認
- Cloudflare Dashboard → D1 → Metrics でエラーがないか確認

---

### 問題3: ページリロード後に修正が消える
**原因**: D1からの読み込みエラー

**確認方法**:
```sql
SELECT session_data FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```
→ `ocrResults` フィールドに修正後のテキストがあるか確認

**解決策**:
- `loadSessionFromDB()` 関数が正しく動作しているか確認
- ブラウザのConsole（F12）でエラーを確認
- セッションIDが正しいか確認（URLの `?session=` 部分）

---

### 問題4: Worker再起動後に修正が消える
**原因**: D1への保存またはD1からの復元に問題

**診断クエリ**:
```sql
-- セッションデータ全体を確認
SELECT 
  session_id, 
  uploaded_images_count, 
  has_ocr_results,
  LENGTH(session_data) as data_size,
  updated_at 
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';

-- session_dataの内容を確認
SELECT session_data FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

**確認ポイント**:
- `data_size` が 0 でないか（データが保存されているか）
- `session_data` JSON内に `ocrResults` 配列が存在するか
- `ocrResults[0].text` に修正後のテキストが含まれているか

**解決策**:
- `src/index.tsx` の `saveSessionToDB()` 関数を確認
- `updateSession()` 関数が正しく呼ばれているか確認
- Cloudflare Pagesを再デプロイ

---

## 🔍 デバッグ用SQLクエリ

### セッション詳細情報
```sql
SELECT 
  session_id,
  uploaded_images_count,
  has_ocr_results,
  has_feedback,
  LENGTH(session_data) as json_size_bytes,
  datetime(created_at / 1000, 'unixepoch') as created,
  datetime(updated_at / 1000, 'unixepoch') as updated
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

### OCR結果の中身
```sql
SELECT json_extract(session_data, '$.ocrResults') as ocr_data
FROM essay_sessions 
WHERE session_id = 'あなたのセッションID';
```

### 最近の修正履歴（全セッション）
```sql
SELECT 
  session_id,
  datetime(updated_at / 1000, 'unixepoch') as last_updated,
  has_ocr_results
FROM essay_sessions 
ORDER BY updated_at DESC 
LIMIT 10;
```

---

## ✅ テスト成功の基準

以下すべてが満たされていれば **テスト成功** です：

1. ✅ OCRテキストを修正できる
2. ✅ 「修正が保存されました」メッセージが表示される
3. ✅ D1データベースに修正内容が保存される
4. ✅ ページリロード後も修正内容が表示される
5. ✅ Worker再起動後も修正内容が保持される
6. ✅ 複数回の修正がすべて保持される

---

## 📞 サポートが必要な場合

以下の情報を添えて質問してください：

1. **失敗したステップ番号**
2. **エラーメッセージのスクリーンショット**
3. **ブラウザの開発者ツール Console の内容**（F12キーで開く）
4. **D1データベースのクエリ結果**（上記のデバッグクエリを実行）
5. **セッションID**

---

**作成日**: 2025-10-29  
**対象バージョン**: StudyPartner Full v1.0 (D1統合版)  
**関連ドキュメント**: TEST_SESSION_PERSISTENCE.md
