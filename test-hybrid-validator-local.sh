#!/bin/bash

echo "🧪 Phase 1 ハイブリッドバリデーター - ローカルテスト"
echo "================================================"
echo ""

# テスト1: ルールベースのみ（LLM無効）
echo "📝 テスト1: ルールベースのみ（A1レベル）"
echo "テキスト: I like cats and dogs."
curl -s -X POST http://localhost:8788/api/eiken/vocabulary/validate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "I like cats and dogs.",
    "config": {"target_level": "A1"},
    "use_hybrid": true
  }' | jq '.'

echo ""
echo "================================================"
echo ""

# テスト2: 違反があるケース
echo "📝 テスト2: 語彙違反あり（A1レベルで難しい単語）"
echo "テキスト: The sophisticated algorithm demonstrates complexity."
curl -s -X POST http://localhost:8788/api/eiken/vocabulary/validate \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The sophisticated algorithm demonstrates complexity.",
    "config": {"target_level": "A1"},
    "use_hybrid": true
  }' | jq '.'

echo ""
echo "================================================"
echo ""

# テスト3: デバッグエンドポイント
echo "📝 テスト3: ハイブリッド設定の確認"
curl -s http://localhost:8788/api/eiken/vocabulary/debug/env | jq '.hybrid_validator'

echo ""
echo "================================================"
echo "✅ テスト完了"
