#!/bin/bash

# Test script for Auto-Rewrite API
# Tests the vocabulary violation correction functionality

BASE_URL="http://localhost:8787"
API_PATH="/api/eiken/vocabulary"

echo "🧪 自動リライトAPI テスト"
echo "================================="
echo ""

# Test 1: Simple rewrite - "delighted to receive promotion"
echo "Test 1: シンプルなリライト"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/rewrite" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "She was ( ) to receive the promotion at work.",
    "choices": ["delighted", "happy", "sad", "tired"],
    "violations": [
      {"word": "delighted", "expected_level": "A1", "actual_level": "B2", "severity": "error"},
      {"word": "receive", "expected_level": "A1", "actual_level": "B1", "severity": "error"},
      {"word": "promotion", "expected_level": "A1", "actual_level": "B1", "severity": "error"}
    ],
    "target_level": "5"
  }' | jq '.'

echo ""
echo ""

# Test 2: Grammar preservation - "conference will commence"
echo "Test 2: 文法構造の保持"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/rewrite" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "The conference will ( ) next month.",
    "choices": ["commence", "begin", "start", "open"],
    "violations": [
      {"word": "conference", "expected_level": "A1", "actual_level": "B1", "severity": "error"},
      {"word": "commence", "expected_level": "A1", "actual_level": "C1", "severity": "error"}
    ],
    "target_level": "5",
    "options": {
      "minConfidence": 0.8
    }
  }' | jq '.'

echo ""
echo ""

# Test 3: Multiple violations - complex academic sentence
echo "Test 3: 複数違反の修正"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/rewrite" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "The scientist ( ) a comprehensive experiment.",
    "choices": ["conducted", "did", "made", "performed"],
    "violations": [
      {"word": "scientist", "expected_level": "A1", "actual_level": "B1", "severity": "error"},
      {"word": "conducted", "expected_level": "A1", "actual_level": "B2", "severity": "error"},
      {"word": "comprehensive", "expected_level": "A1", "actual_level": "C1", "severity": "error"},
      {"word": "experiment", "expected_level": "A1", "actual_level": "B1", "severity": "error"}
    ],
    "target_level": "5"
  }' | jq '.'

echo ""
echo ""

# Test 4: Validate → Rewrite → Re-validate workflow
echo "Test 4: 完全なワークフロー（検証→リライト→再検証）"
echo "----------------------"

# Step 1: Validate original (expect violations)
echo "Step 1: 元の問題を検証（違反あり）"
VALIDATION=$(curl -s -X POST "${BASE_URL}${API_PATH}/validate" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "She was delighted to receive the promotion at work.",
    "config": {"target_level": "A1"}
  }')

echo "$VALIDATION" | jq '{valid, total_words, violations: .violations | length}'
echo ""

# Extract violations for rewrite
VIOLATIONS=$(echo "$VALIDATION" | jq '.violations')

# Step 2: Rewrite
echo "Step 2: 自動リライト実行"
REWRITE=$(curl -s -X POST "${BASE_URL}${API_PATH}/rewrite" \
  -H "Content-Type: application/json" \
  -d "{
    \"question\": \"She was ( ) to receive the promotion at work.\",
    \"choices\": [\"delighted\", \"happy\", \"sad\", \"angry\"],
    \"violations\": $VIOLATIONS,
    \"target_level\": \"5\"
  }")

echo "$REWRITE" | jq '{success, confidence, replacements: .replacements | length, rewritten: .rewritten.question}'
echo ""

# Step 3: Re-validate rewritten question
if [ "$(echo "$REWRITE" | jq -r '.success')" = "true" ]; then
  REWRITTEN_TEXT=$(echo "$REWRITE" | jq -r '.rewritten.question + " " + (.rewritten.choices | join(" "))')
  
  echo "Step 3: リライト後の問題を再検証"
  curl -s -X POST "${BASE_URL}${API_PATH}/validate" \
    -H "Content-Type: application/json" \
    -d "{
      \"text\": \"$REWRITTEN_TEXT\",
      \"config\": {\"target_level\": \"A1\"}
    }" | jq '{valid, total_words, violations: .violations | length, message}'
fi

echo ""
echo ""

# Test 5: Batch rewrite
echo "Test 5: バッチリライト（複数問題）"
echo "----------------------"
curl -s -X POST "${BASE_URL}${API_PATH}/rewrite/batch" \
  -H "Content-Type: application/json" \
  -d '{
    "questions": [
      {
        "question": "She was delighted ( ) the news.",
        "choices": ["about", "with", "to", "of"],
        "violations": [{"word": "delighted", "expected_level": "A1", "actual_level": "B2", "severity": "error"}]
      },
      {
        "question": "The conference will commence ( ).",
        "choices": ["tomorrow", "yesterday", "today", "now"],
        "violations": [
          {"word": "conference", "expected_level": "A1", "actual_level": "B1", "severity": "error"},
          {"word": "commence", "expected_level": "A1", "actual_level": "C1", "severity": "error"}
        ]
      }
    ],
    "target_level": "5"
  }' | jq '{statistics, results: .results | map({success, confidence})}'

echo ""
echo ""
echo "================================="
echo "✅ テスト完了"
echo ""
echo "💡 サーバーを起動してこのスクリプトを実行してください："
echo "   1. npm run build"
echo "   2. wrangler pages dev dist --d1=kobeya-logs-db --kv=KV --local --port 8787"
echo "   3. bash test-auto-rewrite.sh"
