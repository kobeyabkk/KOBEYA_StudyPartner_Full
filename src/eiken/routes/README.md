# Eiken API Routes - Status & Documentation

## 📋 API Status Overview

| API Endpoint | Status | Used By | Implementation | Notes |
|-------------|--------|---------|----------------|-------|
| `/api/eiken/questions/generate` | ✅ **ACTIVE** | Frontend | `questions.ts` + `IntegratedQuestionGenerator` | Phase 3 API - Current production API |
| `/api/eiken/generate` | 🗑️ **REMOVED** | None | `generate.ts.REMOVED` (archived) | Removed 2025-12-09 - No longer exists |

---

## ✅ Active API: `/api/eiken/questions/generate`

### Status
- **ACTIVE** - Currently used by frontend
- **Production Ready**
- **Fully Tested**

### Frontend Usage
```typescript
// src/hooks/useEikenAPI.ts
const response = await fetch('/api/eiken/questions/generate', {
  method: 'POST',
  body: JSON.stringify(phase3Request),
});
```

### Implementation
- **Route File**: `src/eiken/routes/questions.ts`
- **Service**: `IntegratedQuestionGenerator` (`src/eiken/services/integrated-question-generator.ts`)
- **Prompt Builder**: `format-prompts.ts` (`src/eiken/prompts/format-prompts.ts`)

### Features
- ✅ Blueprint generation (topic selection, vocabulary constraints)
- ✅ LLM question generation (GPT-4)
- ✅ Multi-stage validation (vocabulary, grammar, copyright)
- ✅ Database persistence
- ✅ 4-block explanation format (＜着眼点＞＜鉄則！＞＜当てはめ＞＜誤答の理由＞)
- ✅ Answer diversity management
- ✅ Grammar category distribution

### Request Format
```json
{
  "student_id": "web_user_123",
  "grade": "4",
  "format": "grammar_fill",
  "count": 1,
  "difficulty_preference": "adaptive",
  "difficulty_level": 0.6,
  "topic_hints": []
}
```

### Response Format
```json
{
  "success": true,
  "question": {
    "question_id": 123,
    "question_data": {
      "question_text": "A: What did you do yesterday? B: I _____ soccer.",
      "choices": ["played", "play", "playing", "plays"],
      "correct_answer": "played",
      "explanation_ja": "＜着眼点＞\n...\n＜鉄則！＞\n...\n＜当てはめ＞\n...\n＜誤答の理由＞\n...",
      "translation_ja": "A: 昨日何をしましたか？ B: 私はサッカーを_____。"
    }
  }
}
```

---

## ⚠️ Deprecated API: `/api/eiken/generate`

### Status
- **DEPRECATED** - Do not use for new code
- **Legacy Support Only**
- **Will be removed in Phase 7**

### Why Deprecated?
- Simpler implementation without advanced validation
- No Blueprint generation
- No IntegratedQuestionGenerator features
- Less comprehensive validation

### Keep Reasons
1. **Backward compatibility**: External systems may still use it
2. **Health check endpoint**: `/api/eiken/generate/health`

### Implementation
- **Route File**: `src/eiken/routes/generate.ts`
- **Direct LLM calls**: No service layer abstraction

### Migration Guide
If you're using `/api/eiken/generate`, please migrate to `/api/eiken/questions/generate`:

**Before (Deprecated):**
```typescript
const response = await fetch('/api/eiken/generate', {
  method: 'POST',
  body: JSON.stringify({
    grade: '4',
    section: 'grammar',
    questionType: 'grammar_fill',
    count: 4
  })
});
```

**After (Recommended):**
```typescript
const response = await fetch('/api/eiken/questions/generate', {
  method: 'POST',
  body: JSON.stringify({
    student_id: 'your_student_id',
    grade: '4',
    format: 'grammar_fill',
    count: 1, // Generate one at a time
    difficulty_preference: 'adaptive',
    difficulty_level: 0.6
  })
});
```

---

## 🔧 Maintenance Guidelines

### When Modifying APIs

1. **Always update ACTIVE API first**
   - File: `src/eiken/routes/questions.ts`
   - Service: `src/eiken/services/integrated-question-generator.ts`

2. **Check if changes affect deprecated API**
   - Only if backward compatibility is required
   - Document any divergence

3. **Update this README**
   - Keep status table up to date
   - Document breaking changes

4. **Update frontend comments**
   - File: `src/hooks/useEikenAPI.ts`
   - Ensure developers know which API is active

### Before Removing Deprecated API

Checklist:
- [ ] Confirm no external systems use `/api/eiken/generate`
- [ ] Check access logs for usage patterns
- [ ] Announce deprecation to stakeholders
- [ ] Provide migration period (e.g., 3 months)
- [ ] Update all documentation
- [ ] Remove route from worker.ts
- [ ] Delete `src/eiken/routes/generate.ts`
- [ ] Update this README

---

## 📊 Historical Context

### Timeline

- **Phase 1-2**: Initial API development (`/api/eiken/generate`)
- **Phase 3**: Introduced new API (`/api/eiken/questions/generate`) with IntegratedQuestionGenerator
- **Phase 5F**: Added Japanese translation and vocabulary meanings
- **Phase 6**: Added 4-block explanation format
- **Phase 6.5**: Added answer diversity management
- **Phase 6.7**: Added grammar category distribution
- **Phase 6.8**: Critical bug fixes for 4-block explanation
- **Phase 7** (Planned): Remove deprecated API

### Why Two APIs Exist

During Phase 3, we built a new API with better architecture:
- Blueprint-based generation
- Multi-stage validation
- Service layer abstraction

However, we kept the old API for:
- Backward compatibility concerns
- Testing and comparison
- Gradual migration approach

**Lesson Learned**: Should have deprecated immediately and set removal timeline.

---

## 🚨 Common Pitfalls

### ❌ Wrong: Modifying deprecated API expecting changes to appear in frontend
```typescript
// Editing src/eiken/routes/generate.ts
// Frontend won't see these changes!
```

### ✅ Correct: Modify active API
```typescript
// Edit src/eiken/routes/questions.ts
// Or src/eiken/services/integrated-question-generator.ts
// Frontend will see these changes
```

### ❌ Wrong: Assuming both APIs behave the same
- Different request/response formats
- Different validation logic
- Different service implementations

### ✅ Correct: Check which API you're using
1. Check frontend code: `src/hooks/useEikenAPI.ts`
2. Check this README
3. Look for ✅ ACTIVE or ⚠️ DEPRECATED markers in code

---

## 📝 Questions?

If you're unsure which API to use:
1. **For new features**: Always use `/api/eiken/questions/generate`
2. **For bug fixes**: Check which API is affected (usually the active one)
3. **For refactoring**: Consider migrating deprecated API usage first

---

**Last Updated**: 2025-12-09 (Phase 6.8C)  
**Maintainer**: Development Team  
**Status**: Living Document - Update when API status changes
