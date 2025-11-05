#!/bin/bash

BASE_URL="https://c31773d6.kobeyabkk-studypartner.pages.dev"
PASS=0
FAIL=0

echo "🧪 Testing Step 5: Study Partner Page Extraction"
echo "================================================"
echo ""

# Test 1: Study Partner Page HTML Response
echo "Test 1: Study Partner page loads..."
RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/study-partner" -o /tmp/test_sp.html)
if [ "$RESPONSE" = "200" ] && grep -q "KOBEYA Study Partner" /tmp/test_sp.html; then
  echo "✅ PASS: Study Partner page loads correctly"
  ((PASS++))
else
  echo "❌ FAIL: Study Partner page failed (HTTP $RESPONSE)"
  ((FAIL++))
fi

# Test 2: MathJax Configuration
echo "Test 2: MathJax configuration present..."
if grep -q "window.MathJax" /tmp/test_sp.html && grep -q "tex-mml-chtml.js" /tmp/test_sp.html; then
  echo "✅ PASS: MathJax configuration found"
  ((PASS++))
else
  echo "❌ FAIL: MathJax configuration missing"
  ((FAIL++))
fi

# Test 3: CSS Styling
echo "Test 3: CSS styling present..."
if grep -q "<style>" /tmp/test_sp.html && grep -q "font-family" /tmp/test_sp.html; then
  echo "✅ PASS: CSS styling found"
  ((PASS++))
else
  echo "❌ FAIL: CSS styling missing"
  ((FAIL++))
fi

# Test 4: JavaScript Functions
echo "Test 4: Core JavaScript functions..."
FUNCTIONS=("handleLogin" "sendAnalysisRequest" "displayAnalysisResult" "startLearningSystem")
ALL_FOUND=true
for func in "${FUNCTIONS[@]}"; do
  if ! grep -q "function $func" /tmp/test_sp.html; then
    ALL_FOUND=false
    echo "  ⚠️  Missing: $func"
  fi
done
if [ "$ALL_FOUND" = true ]; then
  echo "✅ PASS: All core JavaScript functions present"
  ((PASS++))
else
  echo "❌ FAIL: Some JavaScript functions missing"
  ((FAIL++))
fi

# Test 5: Cropper.js Integration
echo "Test 5: Cropper.js library..."
if grep -q "cropperjs" /tmp/test_sp.html; then
  echo "✅ PASS: Cropper.js library included"
  ((PASS++))
else
  echo "❌ FAIL: Cropper.js library missing"
  ((FAIL++))
fi

# Test 6: Login Endpoint Still Works
echo "Test 6: Login endpoint..."
LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/login" \
  -H "Content-Type: application/json" \
  -d '{"appkey":"KOBEYA2024","sid":"test123"}')
if echo "$LOGIN_RESPONSE" | grep -q '"success":true'; then
  echo "✅ PASS: Login endpoint works"
  ((PASS++))
else
  echo "❌ FAIL: Login endpoint broken"
  ((FAIL++))
fi

# Test 7: Other Pages Still Work
echo "Test 7: Other endpoints..."
RESPONSE=$(curl -s -w "%{http_code}" "$BASE_URL/study-partner-simple" -o /dev/null)
if [ "$RESPONSE" = "200" ]; then
  echo "✅ PASS: Other pages still accessible"
  ((PASS++))
else
  echo "❌ FAIL: Other pages broken (HTTP $RESPONSE)"
  ((FAIL++))
fi

# Test 8: Font Awesome Icons
echo "Test 8: Font Awesome icons..."
if grep -q "font-awesome" /tmp/test_sp.html; then
  echo "✅ PASS: Font Awesome included"
  ((PASS++))
else
  echo "❌ FAIL: Font Awesome missing"
  ((FAIL++))
fi

# Test 9: Google Fonts
echo "Test 9: Google Fonts..."
if grep -q "Noto Sans JP" /tmp/test_sp.html; then
  echo "✅ PASS: Google Fonts included"
  ((PASS++))
else
  echo "❌ FAIL: Google Fonts missing"
  ((FAIL++))
fi

# Test 10: Event Listeners Setup
echo "Test 10: Event listeners..."
if grep -q "setupEventListeners" /tmp/test_sp.html && grep -q "DOMContentLoaded" /tmp/test_sp.html; then
  echo "✅ PASS: Event listeners setup found"
  ((PASS++))
else
  echo "❌ FAIL: Event listeners setup missing"
  ((FAIL++))
fi

echo ""
echo "================================================"
echo "📊 Test Results: $PASS passed, $FAIL failed"
echo "================================================"

if [ $FAIL -eq 0 ]; then
  echo "✅ All tests passed! Step 5 extraction successful."
  exit 0
else
  echo "❌ Some tests failed. Please review."
  exit 1
fi
