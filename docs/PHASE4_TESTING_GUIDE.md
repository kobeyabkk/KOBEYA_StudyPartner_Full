# Phase 4: Vocabulary Quality Improvements - Testing Guide

## 🎯 Testing Objectives

Test vocabulary score improvements for essay and long_reading formats:
- **Essay**: Current 64% → Target 78-81% (Phase 1)
- **Long Reading**: Current 69% → Target 82-85% (Phase 1)

---

## 📋 Test Setup

### Prerequisites
1. API endpoint: `POST /api/eiken/questions/generate`
2. Valid authentication token
3. Test environment with OpenAI API access

### Test Parameters

#### Essay Format Test
```json
{
  "student_id": "test_student_001",
  "grade": "pre2",
  "format": "essay",
  "mode": "practice"
}
```

#### Long Reading Format Test
```json
{
  "student_id": "test_student_001",
  "grade": "pre2",
  "format": "long_reading",
  "mode": "practice"
}
```

---

## 🧪 Test Scenarios

### Scenario 1: Essay Generation - Baseline Comparison

**Objective**: Measure vocabulary score improvement compared to previous implementation

**Steps**:
1. Generate 10 essay questions (grade: pre2)
2. Record vocabulary scores for each
3. Calculate average and distribution

**Success Criteria**:
- Average vocabulary score ≥ 78%
- At least 7/10 questions pass 75% threshold
- Maximum 2 failures out of 3 retry attempts

**Expected Results**:
```
Before Phase 4: 64% average (3/10 passed)
After Phase 4:  78-81% average (7-8/10 passed)
Improvement:    +14-17%
```

---

### Scenario 2: Long Reading Generation - Baseline Comparison

**Objective**: Measure vocabulary score improvement for 200-300 word passages

**Steps**:
1. Generate 10 long_reading questions (grade: pre2)
2. Record vocabulary scores for each
3. Analyze passage word counts and vocabulary distribution

**Success Criteria**:
- Average vocabulary score ≥ 82%
- At least 8/10 questions pass 80% threshold
- Passages remain 200-300 words
- Questions remain clear and answerable

**Expected Results**:
```
Before Phase 4: 69% average (2/10 passed)
After Phase 4:  82-85% average (8-9/10 passed)
Improvement:    +13-16%
```

---

### Scenario 3: Temperature Settings Validation

**Objective**: Verify format-specific temperature settings are applied

**Steps**:
1. Enable debug logging
2. Generate questions for each format
3. Verify temperature values in logs:
   - Grammar Fill: 0.5
   - Opinion Speech: 0.4
   - Reading Aloud: 0.3
   - Essay: 0.3
   - Long Reading: 0.25

**Success Criteria**:
- Correct temperature logged for each format
- System reasoning displayed in logs

**Log Pattern**:
```
[LLM] Using temperature=0.3, top_p=0.75
[LLM] Reason: 長文なので最も厳格に制御
```

---

### Scenario 4: Forbidden Words Learning

**Objective**: Test dynamic forbidden words tracking

**Steps**:
1. Generate 5 questions with failures expected
2. Check VocabularyFailureTracker logs
3. Verify top violations are recorded
4. Generate 5 more questions
5. Verify additional forbidden words in system prompt

**Success Criteria**:
- Violations logged: `[VocabTracker] Recorded N violations`
- Top violations displayed in subsequent generations
- Success rate improves in second batch

**Log Pattern**:
```
[VocabTracker] Recorded 8 violations for pre2級 (total: 23)
[LLM] Using 42 forbidden words (10 from recent failures)
[LLM] ADDITIONAL FORBIDDEN WORDS: facilitate, comprehensive, demonstrate...
```

---

### Scenario 5: Adaptive Threshold Validation

**Objective**: Verify format-specific thresholds are calculated correctly

**Steps**:
1. Generate essay (120-150 words)
2. Generate long_reading (250-300 words)
3. Check threshold calculations in logs

**Expected Thresholds**:
- Essay (140 words, pre2): 92% (95 - 3 format adjustment)
- Long Reading (270 words, pre2): 91% (95 - 4 format, -2 word count)

**Success Criteria**:
- Correct adaptive thresholds logged
- Questions within 2% of threshold still pass

**Log Pattern**:
```
[VocabValidation] Adaptive threshold: 92% (format: essay, words: 145)
[VocabValidation] Score: 93%, Threshold: 92%, Passed: true
```

---

### Scenario 6: Few-shot Examples Impact

**Objective**: Verify Few-shot examples reduce forbidden word usage

**Steps**:
1. Review generated content for forbidden words
2. Compare to forbidden words list in Few-shot examples
3. Manually verify vocabulary simplicity

**Forbidden Words to Check**:
- numerous → many ✅
- individuals → people ✅
- acquire → learn/get ✅
- facilitate → help ✅
- contemporary → modern/today's ✅
- comprehensive → complete/full ✅

**Success Criteria**:
- 0 occurrences of forbidden words in GOOD examples
- Generated content matches GOOD example style
- No C1/C2 words in output

---

## 📊 Metrics to Track

### Primary Metrics
| Metric | Before | Target | Actual |
|--------|--------|--------|--------|
| Essay Vocab Score (avg) | 64% | 78-81% | _TBD_ |
| Long Reading Vocab Score (avg) | 69% | 82-85% | _TBD_ |
| Essay Success Rate (3 attempts) | 30% | 70%+ | _TBD_ |
| Long Reading Success Rate | 20% | 80%+ | _TBD_ |

### Secondary Metrics
- Generation time (should remain < 90s)
- Retry attempts (average should be ≤ 2)
- Forbidden word violations (should decrease over time)
- Content quality (manual review score 1-5)

---

## 🔍 Detailed Test Cases

### Test Case 1: Essay - Education Topic

**Input**:
```json
{
  "grade": "pre2",
  "format": "essay",
  "topic_code": "EDU-01"
}
```

**Expected Output**:
- 120-150 words
- Vocabulary score ≥ 78%
- Uses simple transitions: First, Second, Also, In conclusion
- Avoids: furthermore, moreover, consequently
- Clear thesis statement and supporting points

---

### Test Case 2: Long Reading - Technology Topic

**Input**:
```json
{
  "grade": "pre2",
  "format": "long_reading",
  "topic_code": "TECH-02"
}
```

**Expected Output**:
- 200-300 words passage
- 3-4 comprehension questions
- Vocabulary score ≥ 82%
- Short sentences (12-18 words avg)
- Clear paragraph structure
- Questions test: main idea, details, inference

---

### Test Case 3: Multiple Grades Comparison

**Test Matrix**:
| Grade | Format | Expected Vocab Score | Adaptive Threshold |
|-------|--------|---------------------|-------------------|
| Pre-2 | Essay | 78-81% | 92% |
| 2 | Essay | 75-78% | 90% |
| Pre-1 | Essay | 72-75% | 88% |
| Pre-2 | Long Reading | 82-85% | 91% |
| 2 | Long Reading | 79-82% | 89% |

---

## 🐛 Known Issues to Monitor

### Issue 1: Temperature Too Low
**Symptom**: Repetitive phrasing, unnatural language
**Solution**: If detected, increase temperature by 0.05

### Issue 2: Adaptive Threshold Too Strict
**Symptom**: All attempts fail despite reasonable vocabulary
**Solution**: Review threshold calculation, possibly add -1% adjustment

### Issue 3: Forbidden Words Too Broad
**Symptom**: LLM struggles to generate coherent text
**Solution**: Review static forbidden words list, remove some B2 words

---

## ✅ Acceptance Criteria

### Phase 1 Success (This Implementation)
- [ ] Essay average score ≥ 78%
- [ ] Long Reading average score ≥ 82%
- [ ] Build passes without errors
- [ ] No regression in other formats (grammar_fill, opinion_speech, reading_aloud)
- [ ] VocabularyFailureTracker operational
- [ ] Adaptive thresholds working as designed

### Phase 2 Goals (Next Week)
- [ ] Essay average score ≥ 87%
- [ ] Long Reading average score ≥ 90%
- [ ] Iterative feedback system implemented
- [ ] Success rate > 90% within 3 attempts

---

## 📝 Test Execution Log Template

```markdown
### Test Run: [Date] [Time]

**Environment**: Production / Staging / Local
**Tester**: [Name]

#### Test Results

##### Essay Format (10 attempts)
1. Attempt 1: 82% ✅ (145 words, 2 retries)
2. Attempt 2: 79% ✅ (138 words, 1 retry)
3. Attempt 3: 76% ⚠️ (151 words, 3 retries)
...

**Average**: 79.5%
**Success Rate**: 8/10 (80%)
**Avg Retries**: 1.8

##### Long Reading Format (10 attempts)
1. Attempt 1: 85% ✅ (267 words, 1 retry)
2. Attempt 2: 83% ✅ (289 words, 2 retries)
...

**Average**: 83.2%
**Success Rate**: 9/10 (90%)
**Avg Retries**: 1.4

#### Observations
- [Note any patterns or issues]
- [Forbidden words still appearing]
- [Quality of generated content]

#### Recommendations
- [Suggestions for further improvement]
```

---

## 🎓 Manual Quality Review Checklist

For each generated question, manually verify:

### Essay Questions
- [ ] Thesis statement clear and simple
- [ ] Supporting points use A2-B1 vocabulary
- [ ] Transitions are simple (First, Second, Also)
- [ ] Conclusion restates main idea
- [ ] No forbidden words present
- [ ] Natural and fluent for target level

### Long Reading Questions
- [ ] Passage has clear structure (intro, body, conclusion)
- [ ] Each paragraph focused on one idea
- [ ] Sentences are short and clear
- [ ] Questions are answerable from passage
- [ ] Choices are plausible but distinct
- [ ] No forbidden words present

---

## 🚀 Next Steps After Testing

### If Success Rate ≥ 80%
1. Remove "Coming Soon" restriction from API
2. Enable essay and long_reading in production
3. Monitor production metrics for 1 week
4. Proceed to Phase 2 improvements

### If Success Rate < 80%
1. Analyze failure patterns
2. Adjust temperature settings (+/- 0.05)
3. Refine forbidden words list
4. Add more Few-shot examples
5. Re-test

---

Last Updated: 2025-11-21
Version: Phase 4.0
