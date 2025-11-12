#!/bin/bash

# 語彙バリデーションAPIの動作確認スクリプト

BASE_URL="http://localhost:9999"
API_PATH="/api/eiken/vocabulary"

echo "🧪 語彙バリデーションAPI テスト"
echo "================================="
echo ""

# カラー出力
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: ヘルスチェック
echo "Test 1: ヘルスチェック"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/health" | jq '.'
echo ""

# Test 2: 統計情報
echo "Test 2: 統計情報"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/stats" | jq '.'
echo ""

# Test 3: 単語検索（A1語彙）
echo "Test 3: 単語検索 - 'go' (A1)"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/lookup/go" | jq '.'
echo ""

# Test 4: 単語検索（B2語彙）
echo "Test 4: 単語検索 - 'delighted' (B2)"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/lookup/delighted" | jq '.'
echo ""

# Test 5: 簡単な文章のバリデーション（成功するはず）
echo "Test 5: バリデーション - A1レベルの文章"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I go to school every day. My teacher is very kind.",
    "config": {
      "target_level": "A1",
      "max_violation_rate": 0.05
    }
  }' | jq '.'
echo ""

# Test 6: 難しい文章のバリデーション（失敗するはず）
echo "Test 6: バリデーション - B1/B2語彙を含む文章"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I was delighted to receive a promotion at work.",
    "config": {
      "target_level": "A1",
      "max_violation_rate": 0.05
    }
  }' | jq '.'
echo ""

# Test 7: 不規則動詞を含む文章
echo "Test 7: バリデーション - 不規則動詞の活用形"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I went to the park and saw my friend. We ate lunch together.",
    "config": {
      "target_level": "A1"
    }
  }' | jq '.'
echo ""

# Test 8: キャッシュ統計
echo "Test 8: キャッシュ統計"
echo "----------------------"
curl -s "${BASE_URL}${API_PATH}/cache/stats" | jq '.'
echo ""

echo "================================="
echo "✅ テスト完了"
echo ""
echo "💡 開発サーバーを起動してこのスクリプトを実行してください："
echo "   1. npm run dev"
echo "   2. bash test-vocabulary-api.sh"
