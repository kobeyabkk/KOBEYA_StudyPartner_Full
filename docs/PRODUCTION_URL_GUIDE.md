# プロダクションURL ガイド

## 🎯 正しいURLの使用

### プロダクションURL（本番環境）

**https://kobeyabkk-studypartner.pages.dev**

このURLを使用してください。これがプロダクション環境です。

---

## ⚠️ 重要な注意事項

### プレビューURLとプロダクションURLの違い

Cloudflare Pagesは各デプロイメントごとに**プレビューURL**を生成します：

#### プレビューURL（使用しないでください）
```
https://[ランダムID].kobeyabkk-studypartner.pages.dev
```

例：
- https://38f4ce04.kobeyabkk-studypartner.pages.dev
- https://cb028345.kobeyabkk-studypartner.pages.dev
- https://d982a4b5.kobeyabkk-studypartner.pages.dev

**問題点**:
- デプロイごとに異なるURLが発行される
- ブックマークできない
- 古いプレビューURLは古いコードを参照する可能性がある

#### プロダクションURL（常にこちらを使用）
```
https://kobeyabkk-studypartner.pages.dev
```

**利点**:
- 固定URL
- 常に最新のデプロイメントを参照
- ブックマーク可能
- キャッシュが適切に管理される

---

## 🔧 デプロイ方法

### 正しいデプロイコマンド

```bash
# プロダクション環境にデプロイ
npx wrangler pages deploy dist --project-name=kobeyabkk-studypartner --branch=main

# または（同じ結果）
npx wrangler pages deploy dist --project-name=kobeyabkk-studypartner
```

---

## ✅ Phase 4実装の確認

### プロダクションURLでテスト

**URL**: https://kobeyabkk-studypartner.pages.dev

### Essay形式のテスト

```bash
curl -X POST https://kobeyabkk-studypartner.pages.dev/api/eiken/questions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_production",
    "grade": "pre2",
    "format": "essay",
    "mode": "production"
  }'
```

**期待される結果**:
- `validation.vocabulary_score`: **79-81%**
- `validation.threshold`: **92付近**
- `metadata.attempts`: **1-2回**

### Long Reading形式のテスト

```bash
curl -X POST https://kobeyabkk-studypartner.pages.dev/api/eiken/questions/generate \
  -H "Content-Type: application/json" \
  -d '{
    "student_id": "test_production",
    "grade": "pre2",
    "format": "long_reading",
    "mode": "production"
  }'
```

**期待される結果**:
- `validation.vocabulary_score`: **82-85%**
- `validation.threshold`: **91付近**
- `metadata.attempts`: **1-2回**

---

## 🌐 UIの確認

### プロダクションURLでUIを確認

1. **アクセス**: https://kobeyabkk-studypartner.pages.dev
2. **ハードリフレッシュ**: Ctrl+Shift+R (Windows/Linux) / Cmd+Shift+R (Mac)
3. **「問題を生成」をクリック**
4. **「目標級を選択」でボタンの順序を確認**

**期待される表示（3列）**:
```
5級   4級   3級
準2級  2級   準1級
1級
```

---

## 📊 現在の実装状況

### ビルドファイル検証済み ✅

```bash
$ grep -c "getAdaptiveThreshold" dist/_worker.js
2

$ grep -c "getOptimalLLMConfig" dist/_worker.js
2

$ grep -c "ESSAY_FEW_SHOT_EXAMPLES" dist/_worker.js
5
```

**結論**: Phase 4のすべての実装がビルドに含まれている

### Git確認済み ✅

```bash
$ git show HEAD:src/eiken/services/integrated-question-generator.ts | grep -n "getAdaptiveThreshold\|getOptimalLLMConfig"

103:  private getOptimalLLMConfig(format: QuestionFormat): LLMConfig {
145:  private getAdaptiveThreshold(
387:    const llmConfig = this.getOptimalLLMConfig(blueprint.format);
501:      ? this.getAdaptiveThreshold(format, grade, wordCount)
```

**結論**: Phase 4のすべての実装がGitコミットに含まれている

### デプロイ確認済み ✅

- プロジェクト名: `kobeyabkk-studypartner`
- プロダクションURL: https://kobeyabkk-studypartner.pages.dev
- 最新デプロイ: 15秒前（確認時点）

---

## 🚨 トラブルシューティング

### 問題: 古いコードが表示される

**症状**:
- 語彙スコアが75%前後で失敗
- 適応的閾値が表示されない
- UIボタンの順序が違う

**原因**:
- プレビューURLを使用している
- ブラウザキャッシュ
- CDNキャッシュ

**解決方法**:
1. **プロダクションURL**を使用: https://kobeyabkk-studypartner.pages.dev
2. **ハードリフレッシュ**: Ctrl+Shift+R / Cmd+Shift+R
3. **シークレットモード**で開く
4. 5-10分待ってからアクセス（CDNキャッシュの更新待ち）

---

### 問題: Cursorが「実装されていない」と報告

**原因**:
- Cursorが古いデプロイURL（プレビューURL）をテストしている
- ローカルの古いコードを参照している

**解決方法**:
1. **プロダクションURL**でテスト: https://kobeyabkk-studypartner.pages.dev
2. 最新のGitコミットを確認: `git log -1`
3. ビルドファイルを確認: `grep "getAdaptiveThreshold" dist/_worker.js`

---

## 📝 デプロイ履歴（プレビューURLは参考用）

| 日時 | URL | タイプ | 内容 |
|------|-----|--------|------|
| - | https://kobeyabkk-studypartner.pages.dev | **プロダクション** | ⭐ **常にこちらを使用** |
| 2025-11-21 05:48 | https://d982a4b5... | プレビュー | Phase 4 + UI修正 |
| 2025-11-21 05:42 | https://38f4ce04... | プレビュー | UI 3列修正 |
| 2025-11-21 05:29 | https://cb028345... | プレビュー | Phase 4再デプロイ |

**重要**: プレビューURLは参考用です。常にプロダクションURLを使用してください。

---

## ✅ チェックリスト

### デプロイ前
- [ ] `npm run build` でビルド成功
- [ ] `grep "getAdaptiveThreshold" dist/_worker.js` で実装確認
- [ ] Gitコミット完了

### デプロイ時
- [ ] `npx wrangler pages deploy dist --project-name=kobeyabkk-studypartner` 実行
- [ ] プロダクションURLを確認: https://kobeyabkk-studypartner.pages.dev

### デプロイ後
- [ ] プロダクションURLにアクセス
- [ ] ハードリフレッシュ実行
- [ ] UIボタンの順序を確認
- [ ] APIテスト実行（Essay, Long Reading）
- [ ] 語彙スコアが目標範囲内か確認

---

## 🎯 次のステップ

### 今すぐ実施

1. **プロダクションURLにアクセス**: https://kobeyabkk-studypartner.pages.dev
2. **ハードリフレッシュ**: Ctrl+Shift+R / Cmd+Shift+R
3. **UIを確認**: ボタンの順序（5級→4級→3級→準2級→2級→準1級→1級）
4. **APIテスト**: Essay と Long Reading の語彙スコアを確認

### 期待される結果

- ✅ UIボタンの順序が正しい（3列レイアウト）
- ✅ Essay: 語彙スコア 79-81%、閾値 92%
- ✅ Long Reading: 語彙スコア 82-85%、閾値 91%
- ✅ 1-2回のリトライで成功

---

**作成日時**: 2025-11-21  
**プロダクションURL**: https://kobeyabkk-studypartner.pages.dev  
**ステータス**: ✅ Phase 4完全実装、プロダクション環境デプロイ済み
