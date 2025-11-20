#!/bin/bash

# Day 1実装の効果測定スクリプト
# 以前90%違反率だった10問を再テスト

DEPLOY_URL="https://fa08d76d.kobeyabkk-studypartner.pages.dev"

echo "======================================"
echo "Day 1実装 効果測定テスト"
echo "======================================"
echo ""

# テストケース（以前の10問）
declare -a questions=(
  "Tom likes to play soccer. He plays every day after school."
  "Lisa helps her mom cook dinner every night."
  "My friend goes to the library on Saturdays."
  "They watch TV after doing their homework."
  "She reads books before going to bed."
  "We eat lunch at school with our friends."
  "He walks to school every morning."
  "The cat sleeps on the chair in the living room."
  "I write my name on my notebook."
  "They study English on Monday and Wednesday."
)

total_questions=0
valid_questions=0
total_violations=0

echo "テスト開始..."
echo ""

for i in "${!questions[@]}"; do
  question_num=$((i + 1))
  question="${questions[$i]}"
  
  echo "[$question_num/10] テスト中..."
  
  response=$(curl -s -X POST \
    "$DEPLOY_URL/api/eiken/vocabulary/validate" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$question\", \"target_level\": \"A1\"}")
  
  valid=$(echo "$response" | jq -r '.valid')
  violation_count=$(echo "$response" | jq '.violations | length')
  violation_rate=$(echo "$response" | jq -r '.violation_rate')
  total_words=$(echo "$response" | jq -r '.total_words')
  
  ((total_questions++))
  if [ "$valid" = "true" ]; then
    ((valid_questions++))
    echo "  ✅ PASS - 違反なし (総語数: $total_words)"
  else
    echo "  ❌ FAIL - 違反: $violation_count語 / $total_words語 (違反率: $(echo "$violation_rate * 100" | bc -l | xargs printf "%.1f")%)"
    ((total_violations += violation_count))
    
    # 違反の詳細を表示
    echo "$response" | jq -r '.violations[] | "    - \(.word) (\(.actual_level))"' | head -5
  fi
  
  echo ""
  sleep 0.5
done

echo "======================================"
echo "📊 Day 1実装 効果測定結果"
echo "======================================"
echo "✅ 合格問題: $valid_questions / $total_questions"
echo "❌ 違反問題: $((total_questions - valid_questions)) / $total_questions"
echo "🔍 総違反数: $total_violations語"
echo ""

violation_question_rate=$(echo "scale=1; ($total_questions - $valid_questions) * 100 / $total_questions" | bc)
echo "📈 問題違反率: ${violation_question_rate}%"
echo ""

if [ "$valid_questions" -eq "$total_questions" ]; then
  echo "🎉🎉🎉 完璧！全問題が合格しました！"
elif [ "$valid_questions" -ge 8 ]; then
  echo "👏 素晴らしい！ほとんどの問題が合格しました！"
elif [ "$valid_questions" -ge 5 ]; then
  echo "📈 改善が見られます。さらに調整が必要です。"
else
  echo "⚠️  まだ多くの問題があります。Day 2の実装が必要です。"
fi

echo ""
echo "======================================"
