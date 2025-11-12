# 本番環境セットアップガイド

## 🎯 本番環境情報

**デプロイ完了日**: 2025-11-12  
**本番URL**: https://28643c71.kobeyabkk-studypartner.pages.dev  
**プロジェクト名**: kobeyabkk-studypartner  
**ステータス**: ✅ デプロイ成功

---

## ✅ デプロイ完了

### ビルド情報
```
✓ 47 modules transformed
dist/_worker.js  652.36 kB
✓ built in 1.22s
✨ Deployment complete!
```

### ヘルスチェック結果
```json
{
  "status": "healthy",
  "database": "connected",
  "vocabulary_entries": 7801
}
```

---

## 🔑 OpenAI API Key設定（必須）

### Step 1: API Keyの準備

OpenAI API Keyを取得してください：
- https://platform.openai.com/api-keys

### Step 2: Secretの設定

```bash
# プロジェクトディレクトリで実行
cd /home/user/webapp

# OpenAI API Keyを設定
wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner

# プロンプトが表示されたらAPI Keyを入力
# 例: sk-proj-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### Step 3: 設定確認

```bash
# Secretsリストを確認
wrangler pages secret list --project-name kobeyabkk-studypartner

# 出力例:
# OPENAI_API_KEY (set)
```

---

## 🧪 本番環境テスト

### Test 1: ヘルスチェック

```bash
curl "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/health" | jq '.'

# 期待される出力:
# {
#   "status": "healthy",
#   "database": "connected",
#   "vocabulary_entries": 7801
# }
```

### Test 2: 語彙統計

```bash
curl "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/stats" | jq '.'

# 期待される出力:
# {
#   "total": 7801,
#   "by_level": {
#     "A1": 2518,
#     "A2": ...,
#     ...
#   }
# }
```

### Test 3: 単語検索

```bash
curl "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/lookup/go" | jq '.'

# 期待される出力:
# {
#   "found": true,
#   "entry": {
#     "word": "go",
#     "cefr_level": "A1",
#     ...
#   }
# }
```

### Test 4: 語彙バリデーション

```bash
curl -X POST "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I go to school every day.",
    "config": {"target_level": "A1"}
  }' | jq '.'

# 期待される出力:
# {
#   "valid": true,
#   "total_words": ...,
#   "violations": []
# }
```

### Test 5: 自動リライト（API Key設定後）

```bash
curl -X POST "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/rewrite" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "She was ( ) to receive the promotion.",
    "choices": ["delighted", "happy", "sad", "tired"],
    "violations": [
      {"word": "delighted", "expected_level": "A1", "actual_level": "B2", "severity": "error"},
      {"word": "receive", "expected_level": "A1", "actual_level": "B1", "severity": "error"},
      {"word": "promotion", "expected_level": "A1", "actual_level": "B1", "severity": "error"}
    ],
    "target_level": "5"
  }' | jq '.'

# 期待される出力:
# {
#   "success": true,
#   "rewritten": {
#     "question": "She was ( ) to get the good news.",
#     "choices": ["happy", "sad", "tired", "angry"]
#   },
#   "confidence": 0.95
# }
```

### Test 6: 問題生成（API Key設定後）

```bash
curl -X POST "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/questions/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "grade": "5",
    "section": "grammar",
    "questionType": "fill_in_blank",
    "count": 3
  }' | jq '.'

# 期待される出力:
# {
#   "success": true,
#   "generated": [...],
#   "rejected": 0,
#   "totalAttempts": 3,
#   "rewriteStats": {
#     "attempts": 0,
#     "successes": 0,
#     "successRate": 0
#   }
# }
```

---

## 📊 効果測定テスト

### テストシナリオ: 10問生成

```bash
# 本番環境で10問生成してメトリクスを収集
curl -X POST "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/questions/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "grade": "5",
    "section": "grammar",
    "questionType": "fill_in_blank",
    "count": 10
  }' | jq '{
    success,
    generated_count: (.generated | length),
    rejected,
    totalAttempts,
    rewriteStats,
    success_rate: ((.generated | length) / .totalAttempts),
    questions: .generated | map({
      questionNumber,
      questionText,
      choices
    })
  }' > production-test-results.json

# 結果を確認
cat production-test-results.json | jq '.'
```

### 収集するメトリクス

```json
{
  "test_date": "2025-11-12",
  "environment": "production",
  "test_type": "10_question_generation",
  
  "results": {
    "total_requested": 10,
    "successfully_generated": 9,
    "rejected": 1,
    "total_attempts": 11,
    
    "rewrite_stats": {
      "attempts": 2,
      "successes": 1,
      "success_rate": 0.5
    },
    
    "rates": {
      "success_rate": 0.90,
      "rejection_rate": 0.10,
      "attempts_per_question": 1.1
    }
  },
  
  "performance": {
    "total_time_seconds": 55,
    "average_time_per_question": 5.5
  }
}
```

---

## 🔧 トラブルシューティング

### Issue 1: API Key not configured

**エラー**:
```json
{
  "error": "OpenAI API key not configured"
}
```

**解決方法**:
```bash
wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner
```

### Issue 2: Database not connected

**エラー**:
```json
{
  "status": "unhealthy",
  "database": "disconnected"
}
```

**解決方法**:
1. wrangler.tomlでD1設定を確認
2. データベースが作成されているか確認
3. 再デプロイ: `npm run deploy`

### Issue 3: KV namespace not found

**エラー**:
```
Cannot read properties of undefined (reading 'get')
```

**解決方法**:
1. KV namespaceが作成されているか確認
2. wrangler.tomlでKV設定を確認
3. 再デプロイ

---

## 📈 モニタリング

### Cloudflare Dashboard

1. https://dash.cloudflare.com/ にアクセス
2. Pages > kobeyabkk-studypartner を選択
3. Analytics タブで確認できる項目：
   - Requests per second
   - Response time
   - Error rate
   - Status codes

### Logs確認

```bash
# リアルタイムログ
wrangler pages deployment tail --project-name kobeyabkk-studypartner

# 特定のデプロイメントログ
wrangler pages deployment logs <deployment-id> --project-name kobeyabkk-studypartner
```

---

## 🚀 継続的デプロイ

### 変更をデプロイ

```bash
# 1. コード変更
# 2. ローカルビルドテスト
npm run build

# 3. ローカルテスト
wrangler pages dev dist --d1=kobeya-logs-db --kv=KV --local

# 4. 本番デプロイ
npm run deploy

# 5. ヘルスチェック
curl "https://28643c71.kobeyabkk-studypartner.pages.dev/api/eiken/vocabulary/health"
```

### Git連携（推奨）

```bash
# mainブランチへのpushで自動デプロイ
git add .
git commit -m "feat: 新機能追加"
git push origin main

# Cloudflare PagesがGitHubと連携している場合、自動デプロイされます
```

---

## 📋 本番環境チェックリスト

### デプロイ前
- [ ] ローカルビルド成功
- [ ] ローカルテスト実行
- [ ] TypeScript型エラーなし
- [ ] Git commit完了

### デプロイ後
- [ ] デプロイ成功確認
- [ ] ヘルスチェック成功
- [ ] OpenAI API Key設定
- [ ] 語彙バリデーションテスト
- [ ] リライトAPIテスト
- [ ] 問題生成テスト
- [ ] エラーログ確認

### 効果測定
- [ ] 10問生成テスト実行
- [ ] メトリクス収集
- [ ] Before/After比較
- [ ] レポート作成

---

## 💡 次のステップ

1. **OpenAI API Key設定**
   ```bash
   wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner
   ```

2. **統合テスト実行**
   - Test 5: 自動リライトテスト
   - Test 6: 問題生成テスト

3. **効果測定**
   - 10問生成テスト
   - メトリクス分析
   - レポート作成

4. **Week 3実装**
   - Cron Worker
   - 問題プール事前生成
   - 即座のAPI応答

---

**本番環境準備完了！** ✅  
**URL**: https://28643c71.kobeyabkk-studypartner.pages.dev  
**次**: OpenAI API Key設定 → 統合テスト実行

---

**Last Updated**: 2025-11-12  
**Status**: ✅ Production Deployed  
**Next**: API Key Setup → Integration Testing
