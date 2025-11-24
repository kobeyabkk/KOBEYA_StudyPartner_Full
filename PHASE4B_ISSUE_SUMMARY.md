# Phase 4B Vocabulary Annotation System - Critical Issue Summary

## Current Situation

We are implementing a vocabulary annotation system for an English test preparation platform (Eiken practice). The system should:

1. **Identify difficult words** in reading passages (based on difficulty score ≥ 40)
2. **Display 📚 markers** next to those words in the UI
3. **Show popup tooltips** when users click marked words (showing word, part of speech, Japanese definition, CEFR level)
4. **Allow users to add words** to their personal vocabulary notebook

## Problem Statement

**The vocabulary annotation system is not working.** After extensive debugging, we discovered a **fundamental database schema mismatch**.

### What We Expected (Based on Phase 4A Documentation)

The code was written expecting a database table `eiken_vocabulary_lexicon` with these columns:
- `id` (INTEGER PRIMARY KEY)
- `headword` (TEXT) - the vocabulary word
- `pos_tags` (TEXT) - part of speech tags
- `definition_ja` (TEXT) - Japanese definition
- `definition_en` (TEXT) - English definition
- `cefr_level` (TEXT) - CEFR level (A1, A2, B1, B2, C1, C2)
- `final_difficulty_score` (INTEGER) - difficulty score for annotation threshold

### What Actually Exists (Current Database Schema)

```sql
PRAGMA table_info(eiken_vocabulary_lexicon);

Results:
- word_lemma (TEXT, PRIMARY KEY) - the base form of the word
- pos (TEXT, PRIMARY KEY) - part of speech
- cefr_level (TEXT) - CEFR level
- zipf_score (REAL) - word frequency metric
- grade_level (INTEGER)
- sources (TEXT)
- confidence (REAL)
- frequency_rank (INTEGER)
- manual_verified (INTEGER)
- last_updated (TEXT)
- notes (TEXT)
```

**Critical Missing Columns:**
- ❌ No `definition_ja` (Japanese definitions)
- ❌ No `definition_en` (English definitions)
- ❌ No `final_difficulty_score` (for filtering difficult words)
- ❌ No simple `id` column (uses composite primary key instead)

**Column Name Mismatches:**
- `headword` → actually `word_lemma`
- `pos_tags` → actually `pos`

## Technical Context

### Technology Stack
- **Frontend**: React 19 + TypeScript
- **Backend**: Cloudflare Workers (Hono framework)
- **Database**: Cloudflare D1 (SQLite)
- **Deployment**: Cloudflare Pages

### Code Structure

**Backend Services:**
1. `/src/eiken/services/vocabulary-annotator.ts` - Extracts difficult words from passages
2. `/src/eiken/services/integrated-question-generator.ts` - Calls VocabularyAnnotator after question generation
3. `/src/eiken/routes/vocabulary.ts` - API endpoints for vocabulary notebook

**Frontend Components:**
1. `/src/components/eiken/QuestionDisplay.tsx` - Displays passages with 📚 markers
2. `/src/pages/vocabulary/notebook.tsx` - Vocabulary notebook page
3. `/src/hooks/useEikenAPI.ts` - API integration hooks

### Current Error

```
[VocabularyAnnotator] Database query error: 
Error: D1_ERROR: no such column: vm.headword at offset 31: SQLITE_ERROR

[Vocabulary Annotation] Generating annotations for text...
[Vocabulary Annotation] No difficult words found
```

**Result**: `vocabulary_notes` array is always empty `[]`

## What We've Tried

### Attempt 1: Fix Column Names
Changed `vm.headword` → `vm.word_lemma` and `vm.pos_tags` → `vm.pos`

**Result**: Query executes, but returns no meaningful data because:
- No `definition_ja` to display in tooltips
- No `final_difficulty_score` to filter difficult words
- Had to use hardcoded values: `50 as difficulty_score`, `'' as definition_ja`

### Attempt 2: Use CEFR Level as Proxy
Changed filter from `final_difficulty_score >= 40` to `cefr_level >= 'B2'`

**Result**: String comparison doesn't work correctly (B2 < A1 alphabetically)

### Current Workaround Code
```typescript
// vocabulary-annotator.ts (lines 102-115)
const query = `
  SELECT 
    vm.word_lemma as word,
    vm.pos as pos,
    '' as definition_ja,           // ❌ Empty - no definition
    vm.cefr_level,
    50 as difficulty_score,         // ❌ Hardcoded - can't filter
    ROWID as word_id
  FROM eiken_vocabulary_lexicon vm
  WHERE LOWER(vm.word_lemma) IN (${placeholders})
    AND vm.cefr_level >= 'B2'      // ❌ Wrong comparison
  ORDER BY vm.cefr_level DESC
  LIMIT ?
`;
```

## Questions for Other AI Advisors

### 1. Database Schema Design

**Should we:**
- A) **Modify the existing table** to add missing columns (`definition_ja`, `definition_en`, `final_difficulty_score`)?
- B) **Create a new table** specifically for vocabulary annotations with proper schema?
- C) **Use an external API** for definitions (e.g., Weblio, jisho.org) and calculate difficulty on-the-fly?
- D) **Redesign the feature** to work with only CEFR levels (without definitions)?

### 2. CEFR Level Filtering

How should we properly filter by CEFR level in SQLite?

```sql
-- Current (WRONG - alphabetical comparison):
WHERE vm.cefr_level >= 'B2'  -- Returns A1, A2, B1, B2, C1, C2 incorrectly

-- Option 1: CASE statement?
WHERE CASE vm.cefr_level 
  WHEN 'A1' THEN 1
  WHEN 'A2' THEN 2
  WHEN 'B1' THEN 3
  WHEN 'B2' THEN 4
  WHEN 'C1' THEN 5
  WHEN 'C2' THEN 6
END >= 4

-- Option 2: Add numeric column?
ALTER TABLE eiken_vocabulary_lexicon 
  ADD COLUMN cefr_level_numeric INTEGER;

-- Option 3: Use IN clause?
WHERE vm.cefr_level IN ('B2', 'C1', 'C2')
```

### 3. Definition Source

Where should Japanese definitions come from?

**Options:**
- A) **Pre-populate database** with definitions (how? from which source?)
- B) **API integration** (Weblio, DeepL, Google Translate) - but this adds latency
- C) **LLM-generated** (use GPT-4 to generate definitions in real-time)
- D) **Mixed approach** (database first, fallback to API)

### 4. Difficulty Score Calculation

How should we calculate `final_difficulty_score`?

**Current formula in documentation:**
```
final_difficulty_score = (
  (cefr_weight * 30) +           // CEFR level (A1=1 to C2=6) * 30
  (frequency_penalty * 20) +      // Based on word frequency
  (length_bonus * 10) +           // Longer words = harder
  (compound_bonus * 15) +         // Hyphenated/compound words
  (grade_adjustment * 25)         // Academic grade level
)
```

**Problems:**
- We have `zipf_score` (frequency) but no formula
- We have `grade_level` but unclear how to use it
- Missing other components

**Simpler alternative?**
- Just use CEFR level mapping: `{A1: 10, A2: 20, B1: 30, B2: 40, C1: 50, C2: 60}`
- Filter where score >= 40 (B2 and above)

### 5. Migration Strategy

If we need to modify the database schema, what's the safest approach?

**Constraints:**
- Production data exists (we cannot drop/recreate)
- Need to work with Cloudflare D1 (SQLite) limitations
- Must maintain backward compatibility

**Options:**
- A) **ALTER TABLE** to add columns (requires migration script)
- B) **Create new table** and JOIN (more flexible, but complex queries)
- C) **Use JSON column** for additional data (flexible but less queryable)

### 6. Temporary Solution

Should we **disable the vocabulary annotation feature** temporarily while we fix the schema?

**Pros:**
- Rest of the app works fine (question generation, translations, etc.)
- Prevents user frustration with broken feature
- Allows time for proper implementation

**Cons:**
- Phase 4B deliverable incomplete
- User expectations not met

## Data Available

We have a CEFR-J Wordlist (6,870 words) in `/home/user/webapp/CEFR-J_Wordlist_Ver1.6.xlsx` with columns:
- `headword` - the vocabulary word
- `pos` - part of speech
- `CEFR` - CEFR level

This could be used to populate the database, but we'd need to:
1. Add Japanese definitions (from where?)
2. Calculate difficulty scores (using what formula?)

## Our Current Thinking

**Immediate Next Steps (seeking validation):**

1. **Short-term Fix (Today)**:
   - Disable VocabularyAnnotator feature (set it to return empty array)
   - Document the issue thoroughly
   - Deploy working version without annotations

2. **Medium-term Solution (This Week)**:
   - Design proper database schema with all required columns
   - Find/create Japanese definition source
   - Implement difficulty score calculation
   - Write migration scripts
   - Test with real data

3. **Long-term Enhancement (Future)**:
   - Consider API integration for dynamic definitions
   - Add user-contributed definitions
   - Implement spaced repetition algorithm (SM-2)

## Request for Advice

**We need guidance on:**

1. **Which approach is most practical** for getting definitions? (database pre-population vs API vs LLM)
2. **Best way to filter by CEFR level** in SQLite queries
3. **Whether our database schema design** is reasonable or needs rethinking
4. **Difficulty score formula** - use simple CEFR mapping or implement complex calculation?
5. **Is it acceptable** to ship without this feature temporarily, or should we prioritize a quick fix?

## Repository Context

- **Project**: KOBEYA Study Partner (Eiken practice platform)
- **Current Branch**: `genspark_ai_developer`
- **Latest PR**: #65 (Phase 4B vocabulary annotation implementation)
- **Build Status**: ✅ Compiles successfully, but feature doesn't work due to schema issues

## Additional Notes

- This is a production application with real users
- Timeline is important, but correctness is more important
- We prefer solutions that scale well (6,870 words now, potentially more later)
- Performance matters (queries should be <50ms for good UX)

---

**Thank you for any insights or recommendations you can provide!**
