#!/bin/bash

BASE_URL="https://673e5a61.kobeyabkk-studypartner.pages.dev"
PASS=0
FAIL=0

echo "🧪 Testing Step 6 Cleanup Deployment"
echo "====================================="
echo ""

# Test 1: Study Partner page
echo "Test 1: Study Partner page..."
RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/study-partner" -o /tmp/test1.html)
if [ "$RESPONSE" = "200" ] && grep -q "KOBEYA Study Partner" /tmp/test1.html; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL (HTTP $RESPONSE)"
  ((FAIL++))
fi

# Test 2: Essay Coaching main page
echo "Test 2: Essay Coaching main page..."
RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/essay-coaching" -o /tmp/test2.html)
if [ "$RESPONSE" = "200" ] && grep -q "小論文指導" /tmp/test2.html; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL (HTTP $RESPONSE)"
  ((FAIL++))
fi

# Test 3: Login API
echo "Test 3: Login API..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"appkey":"KOBEYA2024","sid":"test123"}')
if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL"
  ((FAIL++))
fi

# Test 4: AI Chat window (should still work)
echo "Test 4: AI Chat window..."
RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/ai-chat/test-session" -o /tmp/test4.html)
if [ "$RESPONSE" = "200" ]; then
  echo "✅ PASS"
  ((PASS++))
else
  echo "❌ FAIL (HTTP $RESPONSE)"
  ((FAIL++))
fi

echo ""
echo "====================================="
echo "📊 Results: $PASS passed, $FAIL failed"
echo "====================================="

if [ $FAIL -eq 0 ]; then
  echo "✅ All tests passed!"
  exit 0
else
  echo "❌ Some tests failed"
  exit 1
fi
