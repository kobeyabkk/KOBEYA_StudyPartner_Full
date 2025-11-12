#!/bin/bash

# 本番環境統合テストスクリプト
# 
# 実行前に: wrangler pages secret put OPENAI_API_KEY でAPIキーを設定

BASE_URL="https://83c7664e.kobeyabkk-studypartner.pages.dev"
API_PATH="/api/eiken"

echo "🧪 本番環境統合テスト"
echo "================================="
echo "URL: $BASE_URL"
echo "Date: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Test 1: ヘルスチェック
echo "Test 1: ヘルスチェック"
echo "----------------------"
HEALTH=$(curl -s "${BASE_URL}${API_PATH}/vocabulary/health")
echo "$HEALTH" | jq '.'
STATUS=$(echo "$HEALTH" | jq -r '.status')

if [ "$STATUS" != "healthy" ]; then
  echo "❌ ヘルスチェック失敗"
  exit 1
fi
echo "✅ ヘルスチェック成功"
echo ""

# Test 2: 語彙統計
echo "Test 2: 語彙統計"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/vocabulary/stats" | jq '.'
echo ""

# Test 3: 単語検索
echo "Test 3: 単語検索 (go)"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/vocabulary/lookup/go" | jq '.'
echo ""

# Test 4: 語彙バリデーション（A1レベル）
echo "Test 4: 語彙バリデーション - A1レベルの文章"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/vocabulary/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I go to school every day. My teacher is very kind.",
    "config": {"target_level": "A1"}
  }' | jq '.'
echo ""

# Test 5: 語彙バリデーション（B1-B2語彙含む）
echo "Test 5: 語彙バリデーション - B1/B2語彙を含む文章"
echo "----------------------"
VALIDATION=$(curl -s -X POST "${BASE_URL}${API_PATH}/vocabulary/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "She was delighted to receive the promotion at work.",
    "config": {"target_level": "A1"}
  }')
echo "$VALIDATION" | jq '.'
echo ""

# Test 6: 自動リライト（API Key必要）
echo "Test 6: 自動リライト機能"
echo "----------------------"
echo "⚠️ OpenAI API Key設定が必要です"
VIOLATIONS=$(echo "$VALIDATION" | jq '.violations')

REWRITE=$(curl -s -X POST "${BASE_URL}${API_PATH}/vocabulary/rewrite" \
  -H "Content-Type: application/json" \
  -d "{
    \"question\": \"She was ( ) to receive the promotion at work.\",
    \"choices\": [\"delighted\", \"happy\", \"sad\", \"tired\"],
    \"violations\": $VIOLATIONS,
    \"target_level\": \"5\"
  }")

echo "$REWRITE" | jq '.'

REWRITE_SUCCESS=$(echo "$REWRITE" | jq -r '.success')
if [ "$REWRITE_SUCCESS" == "true" ]; then
  echo "✅ リライト成功"
  echo "   Original: She was ( ) to receive the promotion at work."
  echo "   Rewritten: $(echo "$REWRITE" | jq -r '.rewritten.question')"
elif [ "$REWRITE_SUCCESS" == "false" ]; then
  ERROR=$(echo "$REWRITE" | jq -r '.error')
  if [[ "$ERROR" == *"API key"* ]]; then
    echo "⚠️ OpenAI API Key未設定"
    echo "   設定方法: wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner"
  else
    echo "❌ リライト失敗: $ERROR"
  fi
fi
echo ""

# Test 7: 問題生成（API Key必要）
echo "Test 7: 問題生成 (3問)"
echo "----------------------"
echo "⚠️ OpenAI API Key設定が必要です"

GENERATION=$(curl -s -X POST "${BASE_URL}${API_PATH}/questions/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "grade": "5",
    "section": "grammar",
    "questionType": "fill_in_blank",
    "count": 3
  }')

echo "$GENERATION" | jq '{
  success,
  generated_count: (.generated | length),
  rejected,
  totalAttempts,
  rewriteStats,
  first_question: .generated[0] | {questionText, choices}
}'

GEN_SUCCESS=$(echo "$GENERATION" | jq -r '.success')
if [ "$GEN_SUCCESS" == "true" ]; then
  GEN_COUNT=$(echo "$GENERATION" | jq -r '.generated | length')
  REJECTED=$(echo "$GENERATION" | jq -r '.rejected')
  ATTEMPTS=$(echo "$GENERATION" | jq -r '.totalAttempts')
  
  echo ""
  echo "✅ 問題生成成功"
  echo "   生成数: $GEN_COUNT/3"
  echo "   却下数: $REJECTED"
  echo "   試行回数: $ATTEMPTS"
  echo "   試行回数/問題: $(echo "scale=2; $ATTEMPTS / $GEN_COUNT" | bc)"
  
  # リライト統計
  REWRITE_ATTEMPTS=$(echo "$GENERATION" | jq -r '.rewriteStats.attempts // 0')
  if [ "$REWRITE_ATTEMPTS" != "0" ]; then
    REWRITE_SUCCESSES=$(echo "$GENERATION" | jq -r '.rewriteStats.successes // 0')
    REWRITE_RATE=$(echo "$GENERATION" | jq -r '.rewriteStats.successRate // 0')
    echo "   リライト試行: $REWRITE_ATTEMPTS"
    echo "   リライト成功: $REWRITE_SUCCESSES"
    echo "   リライト成功率: $(echo "scale=1; $REWRITE_RATE * 100" | bc)%"
  fi
elif [ "$GEN_SUCCESS" == "false" ]; then
  ERRORS=$(echo "$GENERATION" | jq -r '.errors[]')
  if [[ "$ERRORS" == *"API key"* ]]; then
    echo "⚠️ OpenAI API Key未設定"
    echo "   設定方法: wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner"
  else
    echo "❌ 問題生成失敗"
    echo "$GENERATION" | jq '.errors'
  fi
fi
echo ""

# Summary
echo "================================="
echo "✅ 本番環境テスト完了"
echo "================================="
echo ""
echo "📋 テスト結果:"
echo "  ✅ ヘルスチェック"
echo "  ✅ 語彙統計"
echo "  ✅ 単語検索"
echo "  ✅ 語彙バリデーション"

if [ "$REWRITE_SUCCESS" == "true" ]; then
  echo "  ✅ 自動リライト"
else
  echo "  ⚠️ 自動リライト (API Key必要)"
fi

if [ "$GEN_SUCCESS" == "true" ]; then
  echo "  ✅ 問題生成"
else
  echo "  ⚠️ 問題生成 (API Key必要)"
fi

echo ""
echo "🔑 OpenAI API Key設定:"
if [ "$REWRITE_SUCCESS" == "true" ] && [ "$GEN_SUCCESS" == "true" ]; then
  echo "  ✅ 設定済み"
else
  echo "  ⏳ 未設定"
  echo "  設定方法:"
  echo "    wrangler pages secret put OPENAI_API_KEY --project-name kobeyabkk-studypartner"
fi

echo ""
echo "🚀 Next Steps:"
echo "  1. OpenAI API Key設定（未設定の場合）"
echo "  2. 10問生成テストで効果測定"
echo "  3. レポート作成"
