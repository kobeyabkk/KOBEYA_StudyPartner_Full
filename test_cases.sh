#!/bin/bash

# KOBEYA Programming Log System テストスイート
BASE_URL="http://localhost:3000"
SECRET="kobeya-dev-secret-2024"

echo "🧪 KOBEYA Programming Log System テスト開始"
echo "=========================================="

# テスト1: 基本的なログ収集
echo "📝 テスト1: 基本的なログ収集"
curl -X POST $BASE_URL/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "student_id": "suzuki001", 
    "student_name": "鈴木太郎",
    "subject": "数学",
    "tasks_done": "5",
    "correct": "4",
    "incorrect": "1",
    "mini_quiz_score": "85"
  }' | jq .

echo -e "\n"

# テスト2: 英語の学習ログ
echo "📝 テスト2: 英語の学習ログ"
curl -X POST $BASE_URL/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "student_id": "tanaka002", 
    "student_name": "田中花子",
    "subject": "英語",
    "tasks_done": "3",
    "correct": "1",
    "incorrect": "2",
    "mini_quiz_score": "45",
    "started_at": "2025-10-12T14:00:00Z",
    "ended_at": "2025-10-12T14:30:00Z"
  }' | jq .

echo -e "\n"

# テスト3: プログラミングの学習ログ
echo "📝 テスト3: プログラミングの学習ログ" 
curl -X POST $BASE_URL/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "student_id": "yamada003",
    "student_name": "山田次郎", 
    "subject": "プログラミング",
    "tasks_done": "10",
    "correct": "8",
    "incorrect": "2",
    "mini_quiz_score": "92",
    "page": "25",
    "problem_id": "loop_exercise_01"
  }' | jq .

echo -e "\n"

# テスト4: 低スコア（AIタグ推論テスト）
echo "📝 テスト4: 低スコア学習者（AIタグ推論テスト）"
curl -X POST $BASE_URL/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: $SECRET" \
  -d '{
    "student_id": "sato004",
    "student_name": "佐藤三郎",
    "subject": "数学", 
    "tasks_done": "2",
    "correct": "0",
    "incorrect": "2",
    "mini_quiz_score": "25"
  }' | jq .

echo -e "\n"

# テスト5: 認証エラーテスト
echo "🔒 テスト5: 認証エラーテスト（不正なSecret）"
curl -X POST $BASE_URL/api/logs \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: invalid-secret" \
  -d '{"student_id": "test"}' | jq .

echo -e "\n"

echo "✅ テスト完了！"