# Phase 2: Topic Management System - Quick Reference for AI Consultation

**Purpose**: This document provides a concise overview of Phase 2 design for consultation with other AI assistants.

---

## What Phase 2 Does

**Core Function**: Intelligently select appropriate conversation topics for English test question generation based on grade level, question type, and student history.

**Key Goals**:
1. Ensure topic diversity (no repetition within 5-question window)
2. Match topic complexity to grade level
3. Optimize topic-format compatibility
4. Handle generation failures gracefully

---

## System Architecture (3 Layers)

### 1. Blueprint Layer
- **Purpose**: Define problem format specifications
- **Contains**: Question types, constraints (word count, time limits), validation rules
- **Example**: "opinion_speech for Grade 2 requires 100-150 words, 2 minutes speaking time"

### 2. Topic Layer
- **Purpose**: Manage content themes with metadata
- **Contains**: Topic lists, abstractness levels (1-8), context types (personal/daily/general/social/policy)
- **Example**: "technology" topic has abstractness=5, suitable for grades 2/Pre-1/1

### 3. Selection Layer
- **Purpose**: Choose optimal topics using intelligent algorithms
- **Contains**: LRU history, weighted random selection, blacklist, fallback mechanisms
- **Example**: Select "environment" with 30% probability, excluding last 5 used topics

---

## Core Algorithms

### 1. Abstractness Level (8-Point Scale)

| Level | Complexity | Example Topics | Grades |
|-------|------------|----------------|--------|
| 1-2 | Concrete personal | my family, hobbies, daily routine | 5, 4 |
| 3-4 | General social | health habits, communication, travel | 3, Pre-2 |
| 5-6 | Abstract issues | technology impact, education policy | 2, Pre-1 |
| 7-8 | Philosophical | human rights, sustainable development | 1 |

**Key Principle**: Topic abstractness must align with grade's CEFR level to ensure vocabulary compatibility.

### 2. Weighted Random Selection (Roulette Wheel)

```typescript
// Pseudocode
function weightedRandom(topics: Topic[]): Topic {
  totalWeight = sum(topic.weight for topic in topics)
  random = randomFloat(0, totalWeight)
  
  for topic in topics:
    random -= topic.weight
    if random <= 0:
      return topic
}
```

**Weights influenced by**:
- Base weight (1.0 default)
- Official frequency (0.5-2.0 multiplier)
- Format suitability (0.5-1.5 multiplier)
- Context match bonus (+0.2)

**Time Complexity**: O(n)

### 3. LRU (Least Recently Used) History

**Purpose**: Prevent topic repetition

**Implementation**:
- Track last 5 uses per (student, grade, question_type)
- Exclude these topics from selection pool
- Reset window size if no topics available

**Example**: Student recently used ["technology", "education", "health", "environment", "society"] → These are excluded from next selection

### 4. Blacklist System

**Purpose**: Temporarily exclude topics that caused generation failures

**Trigger Conditions**:
- LLM generation timeout
- Vocabulary validation failure (>3% words out of range)
- Grammar complexity mismatch
- Coherence score below threshold

**Expiration**: 7 days (configurable)

**Example**: "sustainable development" failed vocabulary check for Grade 2 student → Blacklisted for 7 days

### 5. Emergency Fallback

**Trigger**: No topics available after all filters

**Strategy**:
1. Relax LRU window (5→3→1)
2. Ignore blacklist
3. Expand to adjacent grades (±1)
4. Use hardcoded safe topics

**Hardcoded Topics**:
- Grade 5: daily_life, school, family
- Grade 1: international_issues, technology, society

---

## Database Schema (5 Tables)

### 1. `eiken_topic_areas` (Master List)

```sql
CREATE TABLE eiken_topic_areas (
    id INTEGER PRIMARY KEY,
    grade TEXT NOT NULL,                    -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    topic_code TEXT NOT NULL,               -- 'technology', 'environment', etc.
    topic_label_ja TEXT,                    -- 'テクノロジー'
    topic_label_en TEXT,                    -- 'Technology'
    abstractness_level INTEGER NOT NULL,    -- 1-8
    context_type TEXT NOT NULL,             -- 'personal'|'daily'|'general'|'social'|'policy'
    scenario_description TEXT,              -- Detailed description for LLM prompts
    sub_topics TEXT,                        -- JSON: ["AI", "smartphones", "social media"]
    weight REAL DEFAULT 1.0,
    official_frequency REAL DEFAULT 1.0,
    is_active INTEGER DEFAULT 1,
    UNIQUE(grade, topic_code)
);
```

### 2. `eiken_topic_question_type_suitability`

**Purpose**: Format-specific compatibility scores

```sql
CREATE TABLE eiken_topic_question_type_suitability (
    topic_code TEXT,
    grade TEXT,
    question_type TEXT,                     -- 'speaking', 'writing', 'reading'
    suitability_score REAL DEFAULT 1.0,     -- 0.5=poor, 1.0=neutral, 1.5=excellent
    PRIMARY KEY (topic_code, grade, question_type)
);
```

**Example**: ("technology", "2", "opinion_speech", 1.4) → Technology is very suitable for opinion speeches in Grade 2

### 3. `eiken_topic_usage_history` (LRU)

```sql
CREATE TABLE eiken_topic_usage_history (
    student_id TEXT,
    grade TEXT,
    topic_code TEXT,
    question_type TEXT,
    session_id TEXT,
    used_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

### 4. `eiken_topic_blacklist`

```sql
CREATE TABLE eiken_topic_blacklist (
    student_id TEXT,
    grade TEXT,
    topic_code TEXT,
    question_type TEXT,
    failure_reason TEXT,
    expires_at TEXT NOT NULL
);
```

### 5. `eiken_topic_statistics`

```sql
CREATE TABLE eiken_topic_statistics (
    topic_code TEXT,
    grade TEXT,
    question_type TEXT,
    total_uses INTEGER DEFAULT 0,
    successful_generations INTEGER DEFAULT 0,
    failed_generations INTEGER DEFAULT 0,
    avg_generation_time_ms REAL
);
```

---

## Integration with Phase 1 (Vocabulary System)

### Flow

```
1. Phase 2: Select Topic
   ↓
   Input: grade="2", type="opinion_speech"
   Output: topic="technology", abstractness=5
   
2. LLM: Generate Problem
   ↓
   Input: topic + blueprint template
   Output: "Some people think social media helps communication..."
   
3. Phase 1: Validate Vocabulary
   ↓
   Input: generated text + grade target
   Process: Lemmatize → Query lexicon → Check 3% rule → Validate Zipf scores
   Output: isValid=true/false, outOfRangeRatio=0.02
   
4. Decision
   ↓
   If valid: Return problem
   If invalid: Regenerate OR add to blacklist
```

### Key Coordination

**Vocabulary Targets by Grade** (from Phase 1):
- Grade 5: CEFR A1, Zipf ≥4.0
- Grade 3: CEFR A1-A2, Zipf ≥3.5
- Grade 2: CEFR B1-B2, Zipf ≥3.0
- Grade 1: CEFR B2-C1, Zipf ≥2.5

**Topic-Vocabulary Alignment**:
- Abstractness 1-2 topics → Naturally use A1-A2 vocabulary (concrete words)
- Abstractness 7-8 topics → Naturally use B2-C1 vocabulary (abstract terms)
- If misalignment occurs, topic gets blacklisted

---

## Real Data Foundation

**Parsed 236 Questions** from actual Eiken exams:

| Grade | Questions | Formats | Topics | Example Topic |
|-------|-----------|---------|--------|---------------|
| 5 | 12 | 2 | 7 | school, family, hobbies |
| 4 | 12 | 2 | 5 | daily life, food |
| 3 | 40 | 7 | 8 | school life, travel, communication |
| Pre-2 | 40 | 6 | 5 | health, community, studying abroad |
| 2 | 56 | 7 | 6 | technology, environment, education |
| Pre-1 | 36 | 7 | 9 | international issues, economy, ethics |
| 1 | 40 | 5 | 11 | global policy, human rights, sustainability |

**Key Findings**:
- Clear progression: Personal (lower) → Social (middle) → Global (upper)
- Format diversity increases with grade
- Topic abstractness correlates with CEFR level

---

## API Endpoints (Planned)

```typescript
// 1. Select topic for question generation
POST /api/eiken/topics/select
Body: { student_id, grade, question_type, session_id?, exclude_topics? }
Response: { selected_topic, available_count, fallback_used, metadata }

// 2. Record topic usage (for LRU)
POST /api/eiken/topics/record
Body: { student_id, grade, topic_code, question_type, session_id? }
Response: { success: true }

// 3. Add topic to blacklist
POST /api/eiken/topics/blacklist
Body: { student_id, grade, topic_code, question_type, reason }
Response: { success: true, expires_at }

// 4. View topic statistics
GET /api/eiken/topics/stats?grade=2&question_type=opinion_speech
Response: { topics: [...], total_uses, success_rate }
```

---

## Implementation Status

### Completed ✅
1. Parse 236 real exam questions
2. Design complete architecture (3 layers)
3. Define 5 core algorithms
4. Design 5 database tables
5. Create comprehensive documentation (30KB)

### Next Steps (Phase 2A - Week 1)
1. Create migration `0010_create_topic_system.sql`
2. Generate seed data (50-100 topics per grade)
3. Implement `TopicSelector` service in TypeScript
4. Create API endpoints
5. Integration testing with Phase 1

### Success Criteria
- ✅ Topic selection < 50ms
- ✅ No repetition within 5-question window
- ✅ Weighted distribution matches exam patterns (±10%)
- ✅ Vocabulary validation pass rate >90%
- ✅ Emergency fallback triggers <0.1% of cases

---

## Questions for Other AI Consultants

1. **Algorithm Optimization**: Any suggestions for improving weighted random selection performance?

2. **Blacklist Strategy**: Is 7-day expiration appropriate, or should it be dynamic based on failure severity?

3. **Fallback Ordering**: Current strategy is LRU→Blacklist→Grade→Hardcoded. Better alternatives?

4. **Suitability Scoring**: How to automatically learn optimal topic-format suitability scores from user feedback?

5. **Edge Cases**: What happens if student exhausts entire topic pool in single session?

6. **Multi-language**: Current design assumes English. Adaptations needed for other languages?

---

## Reference Documents

- **Full Design**: `/home/user/webapp/docs/PHASE2_DESIGN.md` (30KB, comprehensive)
- **Data Analysis**: `/home/user/webapp/data/question_analysis_summary.md`
- **Parsed Questions**: `/home/user/webapp/data/eiken_questions.json` (236 questions)
- **Parser Script**: `/home/user/webapp/scripts/parse_eiken_questions.py`

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-19  
**Ready for**: AI Consultation, Implementation Planning  
**Estimated Implementation**: 3 weeks (2A: Topics, 2B: Blueprints, 2C: Testing)
