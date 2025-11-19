# Phase 2: Topic Area Management System - Complete Design Specification

**Last Updated**: 2025-11-19  
**Status**: Design Complete, Ready for Implementation  
**Phase 1 Status**: ✅ 100% Complete (Vocabulary Management System)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [System Architecture](#system-architecture)
3. [Data Analysis: Real Problem Patterns](#data-analysis-real-problem-patterns)
4. [Core Algorithms](#core-algorithms)
5. [Database Schema](#database-schema)
6. [Topic Selection Algorithm](#topic-selection-algorithm)
7. [Implementation Plan](#implementation-plan)
8. [Integration with Phase 1](#integration-with-phase-1)

---

## Executive Summary

### What Phase 2 Accomplishes

Phase 2 builds a **Topic Area Management System** that intelligently selects appropriate conversation topics and problem themes for generated English test questions. It ensures:

1. **Topic Diversity**: Students don't see repeated topics in short time windows
2. **Grade-Appropriate Complexity**: Topics match cognitive development level
3. **Format Suitability**: Topics work well for the specific problem type (speaking/writing/reading)
4. **Natural Distribution**: Weighted random selection based on official exam patterns
5. **Failure Recovery**: Blacklist system prevents re-use of topics that caused generation failures

### Design Philosophy

**Three-Tier Topic System**:

1. **Blueprint Layer**: Problem format specifications (question types, constraints, validation)
2. **Topic Layer**: Content themes with abstractness levels and context types
3. **Selection Layer**: Intelligent algorithms for topic picking with LRU + weighted random + blacklist

---

## System Architecture

### Component Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Phase 2: Topic System                     │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐ │
│  │   Blueprint    │  │     Topic      │  │   Selection    │ │
│  │   Management   │  │   Management   │  │    Engine      │ │
│  │                │  │                │  │                │ │
│  │ • Format specs │  │ • Topic lists  │  │ • LRU history  │ │
│  │ • Constraints  │  │ • Abstractness │  │ • Weighted     │ │
│  │ • Templates    │  │ • Suitability  │  │   random       │ │
│  │ • Validation   │  │ • Metadata     │  │ • Blacklist    │ │
│  └────────────────┘  └────────────────┘  └────────────────┘ │
│           │                   │                   │          │
│           └───────────────────┴───────────────────┘          │
│                               │                              │
└───────────────────────────────┼──────────────────────────────┘
                                │
                    ┌───────────▼────────────┐
                    │   LLM Problem          │
                    │   Generator            │
                    │   (Gemini 2.0 Flash)   │
                    └────────────────────────┘
```

### Data Flow

```
Student Request
    │
    ▼
┌─────────────────┐
│ 1. Get grade    │
│    and format   │
└────────┬────────┘
         │
         ▼
┌────────────────────────┐
│ 2. Load topic pool     │
│    • Filter by grade   │
│    • Filter by format  │
│    • Apply abstractness│
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 3. Apply filters       │
│    • Check LRU history │
│    • Check blacklist   │
│    • Check session     │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 4. Weighted selection  │
│    • Compute weights   │
│    • Roulette wheel    │
│    • Return topic      │
└────────┬───────────────┘
         │
         ▼
┌────────────────────────┐
│ 5. Record usage        │
│    • Log to history    │
│    • Update stats      │
└────────────────────────┘
```

---

## Data Analysis: Real Problem Patterns

### Actual Distribution from 236 Sample Questions

**Parsed Data**: `/home/user/webapp/data/eiken_questions.json`

#### Grade 5 (12 questions)
- **Formats**: grammar_fill (50%), conversation (50%)
- **Topics**: school, hobbies, family, food, daily life, greeting, self-introduction
- **CEFR Level**: A1
- **Abstractness**: 1-2 (concrete, personal experiences)

#### Grade 4 (12 questions)
- **Formats**: grammar_fill (50%), conversation (50%)
- **Topics**: hobbies, family, daily life, school, food
- **CEFR Level**: A1
- **Abstractness**: 1-2 (concrete, personal experiences)

#### Grade 3 (40 questions)
- **Formats**: reading_aloud (12.5%), picture_description (12.5%), q_and_a (15%), conversation (10%), email_reply (20%), grammar_fill (15%), long_reading (15%)
- **Topics**: school life, travel, weekend, club activities, daily life, hobbies, family, communication
- **CEFR Level**: A2
- **Abstractness**: 2-3 (personal routines, familiar situations)

#### Grade Pre-2 (40 questions)
- **Formats**: reading_aloud (12.5%), picture_description (12.5%), q_and_a (15%), short_opinion (20%), grammar_fill (25%), long_reading (15%)
- **Topics**: communication, studying abroad, health, community, environment
- **CEFR Level**: B1
- **Abstractness**: 3-4 (general concepts, social issues)

#### Grade 2 (56 questions)
- **Formats**: reading_aloud (8.9%), picture_description (8.9%), q_and_a (10.7%), essay (12.5%), opinion_speech (16.1%), grammar_fill (14.3%), long_reading (28.6%)
- **Topics**: education, environment, technology, society, health, culture
- **CEFR Level**: B1-B2
- **Abstractness**: 4-6 (abstract concepts, social analysis)

#### Grade Pre-1 (36 questions)
- **Formats**: summary (13.9%), q_and_a (11.1%), opinion_speech (30.6%), opinion_essay (8.3%), writing_summary (5.6%), grammar_fill (11.1%), long_reading (19.4%)
- **Topics**: international issues, technology, economy, social policy, education, environment, ethics, global problems, cultural exchange
- **CEFR Level**: B2
- **Abstractness**: 6-7 (policy discussion, critical analysis)

#### Grade 1 (40 questions)
- **Formats**: q_and_a (12.5%), opinion_speech (20%), opinion_essay (12.5%), writing_essay (12.5%), grammar_fill (10%), long_reading (32.5%)
- **Topics**: economics, global policy, environmental policy, technology ethics, social philosophy, international relations, cultural identity, scientific ethics, political systems, human rights, sustainable development
- **CEFR Level**: C1
- **Abstractness**: 7-8 (sophisticated argumentation, philosophical concepts)

### Key Insights

1. **Progressive Complexity**: Clear transition from concrete (Grade 5: "school", "hobbies") to abstract (Grade 1: "sustainable development", "political systems")

2. **Format Evolution**:
   - Lower grades: Multiple choice, simple Q&A
   - Middle grades: Short opinions, picture descriptions
   - Upper grades: Essays, summaries, complex reading comprehension

3. **Topic Breadth Expansion**:
   - Grade 5: 7 topics (personal, immediate)
   - Grade 1: 11 topics (global, philosophical)

4. **Word Count Scaling**:
   - Grade 5: No word count requirements
   - Grade Pre-2: 40 words
   - Grade 2: 100-150 words
   - Grade 1: 200-240 words

---

## Core Algorithms

### 1. Abstractness Level System

**Definition**: An 8-point scale measuring cognitive complexity and conceptual sophistication of topics.

| Level | Description | Example Topics | Grades |
|-------|-------------|----------------|--------|
| 1 | Immediate concrete objects/people | my family, my pet, my book | 5, 4 |
| 2 | Personal routines and experiences | daily schedule, hobbies, weekend activities | 5, 4, 3 |
| 3 | Familiar social situations | school events, community activities, shopping | 3, Pre-2 |
| 4 | General concepts and practices | health habits, communication methods, travel | Pre-2, 2 |
| 5 | Social phenomena and trends | technology impact, environmental awareness | 2, Pre-1 |
| 6 | Abstract social issues | education policy, cultural diversity, work-life balance | 2, Pre-1 |
| 7 | Policy and critical analysis | international cooperation, economic systems, ethics | Pre-1, 1 |
| 8 | Philosophical and global systems | human rights, sustainable development, political philosophy | 1 |

**Implementation**:
```typescript
function getAbstractnessRange(grade: EikenGrade): [number, number] {
  const ranges: Record<EikenGrade, [number, number]> = {
    '5': [1, 2],
    '4': [1, 2],
    '3': [2, 3],
    'pre2': [3, 4],
    '2': [4, 6],
    'pre1': [6, 7],
    '1': [7, 8]
  };
  return ranges[grade];
}
```

### 2. Context Type Classification

**Five Categories** based on social scope:

1. **personal**: Individual experiences, feelings, preferences
   - Examples: "my favorite food", "my daily routine", "my family"
   
2. **daily**: Routine activities and immediate environment
   - Examples: "shopping", "commuting", "weekend plans"
   
3. **general**: Common social practices and phenomena
   - Examples: "online learning", "healthy eating", "travel"
   
4. **social**: Community issues and social trends
   - Examples: "work-life balance", "aging society", "urbanization"
   
5. **policy**: Systemic issues requiring critical analysis
   - Examples: "education reform", "environmental policy", "economic systems"

**Mapping to Grades**:
```typescript
const contextDistribution: Record<EikenGrade, Record<ContextType, number>> = {
  '5': { personal: 0.8, daily: 0.2, general: 0, social: 0, policy: 0 },
  '4': { personal: 0.7, daily: 0.3, general: 0, social: 0, policy: 0 },
  '3': { personal: 0.4, daily: 0.4, general: 0.2, social: 0, policy: 0 },
  'pre2': { personal: 0.2, daily: 0.3, general: 0.4, social: 0.1, policy: 0 },
  '2': { personal: 0.1, daily: 0.2, general: 0.4, social: 0.3, policy: 0 },
  'pre1': { personal: 0, daily: 0.1, general: 0.3, social: 0.4, policy: 0.2 },
  '1': { personal: 0, daily: 0, general: 0.2, social: 0.3, policy: 0.5 }
};
```

### 3. Weighted Random Selection (Roulette Wheel Algorithm)

**Purpose**: Select topics with probability proportional to their weights, ensuring natural distribution while allowing flexibility.

**Algorithm**:
```typescript
function weightedRandom<T extends { weight: number }>(items: T[]): T {
  // 1. Calculate cumulative weights
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  
  // 2. Generate random value in range [0, totalWeight)
  let random = Math.random() * totalWeight;
  
  // 3. Find item where random falls in its weight segment
  for (const item of items) {
    random -= item.weight;
    if (random <= 0) {
      return item;
    }
  }
  
  // Fallback (should never reach due to floating point)
  return items[items.length - 1];
}
```

**Time Complexity**: O(n) where n = number of topics  
**Space Complexity**: O(1)

**Weight Factors**:
1. **Base Weight**: From topic definition (1.0 default)
2. **Official Frequency**: Multiplier based on exam statistics (0.5-2.0)
3. **Format Suitability**: Multiplier for question type (0.5-1.5)
4. **Context Match**: Bonus for matching grade's primary context type (+0.2)

**Final Weight Calculation**:
```typescript
finalWeight = baseWeight * officialFrequency * formatSuitability + contextBonus;
```

### 4. LRU (Least Recently Used) History

**Purpose**: Prevent topic repetition within a sliding window of recent uses.

**Implementation**:
```typescript
interface TopicUsageHistory {
  student_id: string;
  grade: EikenGrade;
  topic_code: string;
  question_type: string;
  used_at: string;
  session_id?: string;
}

async function getRecentTopics(
  studentId: string,
  grade: EikenGrade,
  questionType: string,
  windowSize: number = 5
): Promise<string[]> {
  const result = await db.prepare(`
    SELECT topic_code
    FROM eiken_topic_usage_history
    WHERE student_id = ? AND grade = ? AND question_type = ?
    ORDER BY used_at DESC
    LIMIT ?
  `).bind(studentId, grade, questionType, windowSize).all();
  
  return result.results.map(r => r.topic_code);
}
```

**Window Sizes**:
- **Student-level LRU**: Last 5 uses per (grade, question_type) combination
- **Session-level exclusion**: All topics used in current session (cleared on new session)

### 5. Blacklist System

**Purpose**: Temporarily exclude topics that caused LLM generation failures or validation errors.

**Entry Conditions**:
1. LLM generation timeout
2. Vocabulary level validation failure (>3% out-of-range words)
3. Grammar complexity mismatch
4. Coherence scoring below threshold

**Expiration**: 7 days (configurable)

**Implementation**:
```typescript
async function addToBlacklist(
  studentId: string,
  grade: EikenGrade,
  topicCode: string,
  questionType: string,
  reason: string
): Promise<void> {
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);
  
  await db.prepare(`
    INSERT INTO eiken_topic_blacklist 
    (student_id, grade, topic_code, question_type, failure_reason, expires_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(studentId, grade, topicCode, questionType, reason, expiresAt.toISOString()).run();
}
```

### 6. Emergency Fallback System

**Trigger**: No topics available after all filters applied

**Fallback Strategy**:
1. **Relax LRU window**: Reduce from 5 to 3 to 1
2. **Ignore blacklist**: Allow previously failed topics
3. **Expand grade range**: Include topics from adjacent grades (±1 level)
4. **Use hardcoded safe topics**: Predefined emergency topic list

**Hardcoded Emergency Topics** (by grade):
```typescript
const emergencyTopics: Record<EikenGrade, string[]> = {
  '5': ['daily_life', 'school', 'family'],
  '4': ['daily_life', 'hobbies', 'school'],
  '3': ['daily_life', 'school_life', 'hobbies'],
  'pre2': ['daily_life', 'communication', 'health'],
  '2': ['education', 'technology', 'environment'],
  'pre1': ['technology', 'society', 'education'],
  '1': ['international_issues', 'technology', 'society']
};
```

---

## Database Schema

### Table 1: `eiken_topic_areas`

**Purpose**: Master topic list with metadata

```sql
CREATE TABLE IF NOT EXISTS eiken_topic_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,                        -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    topic_code TEXT NOT NULL,                   -- 'daily_life', 'technology', etc.
    topic_label_ja TEXT NOT NULL,               -- '日常生活', 'テクノロジー'
    topic_label_en TEXT NOT NULL,               -- 'Daily Life', 'Technology'
    abstractness_level INTEGER NOT NULL,        -- 1-8 scale
    context_type TEXT NOT NULL,                 -- 'personal', 'daily', 'general', 'social', 'policy'
    scenario_description TEXT,                  -- Detailed description for LLM prompt
    sub_topics TEXT,                            -- JSON array: ['shopping', 'cooking', 'cleaning']
    argument_axes TEXT,                         -- JSON array: ['pros_cons', 'causes_effects']
    weight REAL NOT NULL DEFAULT 1.0,           -- Base selection weight
    official_frequency REAL DEFAULT 1.0,        -- Multiplier based on exam statistics
    is_active INTEGER DEFAULT 1,                -- Enable/disable flag
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(grade, topic_code),
    CHECK (abstractness_level >= 1 AND abstractness_level <= 8),
    CHECK (context_type IN ('personal', 'daily', 'general', 'social', 'policy')),
    CHECK (weight > 0),
    CHECK (is_active IN (0, 1))
);

CREATE INDEX idx_topic_grade_active ON eiken_topic_areas(grade, is_active);
CREATE INDEX idx_topic_abstractness ON eiken_topic_areas(abstractness_level);
CREATE INDEX idx_topic_context ON eiken_topic_areas(context_type);
```

**Sample Data**:
```json
{
  "grade": "3",
  "topic_code": "school_life",
  "topic_label_ja": "学校生活",
  "topic_label_en": "School Life",
  "abstractness_level": 2,
  "context_type": "daily",
  "scenario_description": "Topics related to school activities, club participation, classroom experiences, school events, and interactions with teachers and classmates.",
  "sub_topics": ["club_activities", "school_events", "classroom", "homework", "exams", "friends"],
  "argument_axes": ["favorite_least_favorite", "benefits_challenges"],
  "weight": 1.2,
  "official_frequency": 1.5,
  "is_active": 1
}
```

### Table 2: `eiken_topic_question_type_suitability`

**Purpose**: Format-specific weights for topics

```sql
CREATE TABLE IF NOT EXISTS eiken_topic_question_type_suitability (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_code TEXT NOT NULL,
    grade TEXT NOT NULL,
    question_type TEXT NOT NULL,                -- 'speaking', 'writing', 'reading', 'grammar'
    suitability_score REAL NOT NULL DEFAULT 1.0,-- 0.5 = poor fit, 1.0 = neutral, 1.5 = excellent fit
    reasoning TEXT,                             -- Why this score
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_code, grade) REFERENCES eiken_topic_areas(topic_code, grade),
    PRIMARY KEY (topic_code, grade, question_type),
    CHECK (suitability_score >= 0.1 AND suitability_score <= 2.0)
);

CREATE INDEX idx_suitability_type ON eiken_topic_question_type_suitability(question_type);
```

**Sample Data**:
```json
{
  "topic_code": "technology",
  "grade": "2",
  "question_type": "opinion_speech",
  "suitability_score": 1.4,
  "reasoning": "Technology topics provide clear pros/cons for argumentation and are familiar to students."
}
```

### Table 3: `eiken_topic_usage_history`

**Purpose**: LRU tracking for topic rotation

```sql
CREATE TABLE IF NOT EXISTS eiken_topic_usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    topic_code TEXT NOT NULL,
    question_type TEXT NOT NULL,
    session_id TEXT,                            -- Optional grouping by study session
    used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_code, grade) REFERENCES eiken_topic_areas(topic_code, grade)
);

CREATE INDEX idx_usage_student_grade ON eiken_topic_usage_history(student_id, grade, used_at DESC);
CREATE INDEX idx_usage_session ON eiken_topic_usage_history(session_id);
```

### Table 4: `eiken_topic_blacklist`

**Purpose**: Failure tracking and temporary exclusion

```sql
CREATE TABLE IF NOT EXISTS eiken_topic_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    topic_code TEXT NOT NULL,
    question_type TEXT NOT NULL,
    failure_reason TEXT,                        -- 'timeout', 'vocab_mismatch', 'coherence_low'
    blacklisted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,                   -- Auto-cleanup after expiration
    FOREIGN KEY (topic_code, grade) REFERENCES eiken_topic_areas(topic_code, grade),
    UNIQUE(student_id, grade, topic_code, question_type)
);

CREATE INDEX idx_blacklist_expiry ON eiken_topic_blacklist(expires_at);
CREATE INDEX idx_blacklist_student ON eiken_topic_blacklist(student_id, grade);
```

### Table 5: `eiken_topic_statistics`

**Purpose**: Analytics and performance tracking

```sql
CREATE TABLE IF NOT EXISTS eiken_topic_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_code TEXT NOT NULL,
    grade TEXT NOT NULL,
    question_type TEXT NOT NULL,
    total_uses INTEGER DEFAULT 0,
    successful_generations INTEGER DEFAULT 0,
    failed_generations INTEGER DEFAULT 0,
    avg_generation_time_ms REAL,
    avg_student_score REAL,
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (topic_code, grade) REFERENCES eiken_topic_areas(topic_code, grade),
    UNIQUE(topic_code, grade, question_type)
);

CREATE INDEX idx_stats_performance ON eiken_topic_statistics(grade, successful_generations DESC);
```

---

## Topic Selection Algorithm

### Complete Flow

```typescript
interface TopicSelectionOptions {
  student_id: string;
  grade: EikenGrade;
  question_type: string;
  session_id?: string;
  exclude_topics?: string[];        // Manual exclusions
  use_fallback?: boolean;
}

interface TopicSelectionResult {
  selected_topic: TopicArea;
  available_count: number;
  fallback_used: boolean;
  selection_metadata: {
    total_pool: number;
    after_lru_filter: number;
    after_blacklist_filter: number;
    after_session_filter: number;
    final_candidates: number;
  };
}

export class TopicSelector {
  constructor(private db: D1Database) {}

  async selectTopic(options: TopicSelectionOptions): Promise<TopicSelectionResult> {
    const { student_id, grade, question_type, session_id, exclude_topics = [] } = options;
    
    // Step 1: Get all active topics for grade
    const allTopics = await this.getTopicsForGrade(grade);
    
    // Step 2: Get blacklisted topics for this student
    const blacklistedTopics = await this.getBlacklistedTopics(student_id, grade, question_type);
    
    // Step 3: Get LRU history (last 5 uses)
    const recentTopics = await this.getRecentHistory(student_id, grade, question_type, 5);
    
    // Step 4: Get session exclusions if provided
    const sessionTopics = session_id 
      ? await this.getSessionTopics(student_id, session_id) 
      : [];
    
    // Step 5: Adjust weights by format suitability
    const topicsWithSuitability = await this.adjustWeightsBySuitability(
      allTopics, 
      grade, 
      question_type
    );
    
    // Step 6: Apply all filters
    let availableTopics = topicsWithSuitability.filter(topic => 
      !recentTopics.includes(topic.topic_code) &&
      !blacklistedTopics.includes(topic.topic_code) &&
      !sessionTopics.includes(topic.topic_code) &&
      !exclude_topics.includes(topic.topic_code) &&
      topic.is_active === 1
    );
    
    const metadata = {
      total_pool: allTopics.length,
      after_lru_filter: allTopics.length - recentTopics.length,
      after_blacklist_filter: allTopics.length - recentTopics.length - blacklistedTopics.length,
      after_session_filter: availableTopics.length,
      final_candidates: availableTopics.length
    };
    
    // Step 7: Handle no topics available
    if (availableTopics.length === 0) {
      if (options.use_fallback !== false) {
        return await this.emergencyFallback(grade, question_type, metadata);
      } else {
        throw new Error(`No topics available for grade ${grade}, type ${question_type}`);
      }
    }
    
    // Step 8: Weighted random selection
    const selectedTopic = this.weightedRandom(availableTopics);
    
    // Step 9: Record usage
    await this.recordTopicUsage(student_id, grade, selectedTopic.topic_code, question_type, session_id);
    
    return {
      selected_topic: selectedTopic,
      available_count: availableTopics.length,
      fallback_used: false,
      selection_metadata: metadata
    };
  }

  private weightedRandom<T extends { weight: number }>(items: T[]): T {
    const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const item of items) {
      random -= item.weight;
      if (random <= 0) {
        return item;
      }
    }
    
    return items[items.length - 1];
  }

  private async emergencyFallback(
    grade: EikenGrade, 
    questionType: string, 
    metadata: any
  ): Promise<TopicSelectionResult> {
    // Implementation of fallback strategies
    const hardcodedTopics = this.getEmergencyTopics(grade);
    
    return {
      selected_topic: hardcodedTopics[0],
      available_count: hardcodedTopics.length,
      fallback_used: true,
      selection_metadata: metadata
    };
  }

  private async recordTopicUsage(
    studentId: string,
    grade: EikenGrade,
    topicCode: string,
    questionType: string,
    sessionId?: string
  ): Promise<void> {
    await this.db.prepare(`
      INSERT INTO eiken_topic_usage_history 
      (student_id, grade, topic_code, question_type, session_id)
      VALUES (?, ?, ?, ?, ?)
    `).bind(studentId, grade, topicCode, questionType, sessionId || null).run();
  }

  // Additional helper methods...
}
```

---

## Implementation Plan

### Phase 2A: Topic Management (Week 1)

**Tasks**:
1. ✅ Parse sample question data (COMPLETED)
2. Create migration `0010_create_topic_system.sql`
3. Create seed data JSON files for all 7 grades
4. Implement `TopicSelector` service
5. Create API endpoints:
   - `POST /api/eiken/topics/select` - Select topic
   - `POST /api/eiken/topics/record` - Record usage
   - `POST /api/eiken/topics/blacklist` - Add to blacklist
   - `GET /api/eiken/topics/stats` - View statistics

**Deliverables**:
- Database tables created
- 50-100 topics seeded per grade
- Working topic selection with LRU + weighted random

### Phase 2B: Blueprint System (Week 2)

**Tasks**:
1. Create `eiken_problem_blueprints` table
2. Define schemas for each question type from parsed data
3. Create prompt templates with placeholders
4. Implement validation schemas (JSON Schema)
5. Add good/bad example pairs

**Deliverables**:
- Blueprint specifications for all 15+ question types
- Template system ready for LLM generation

### Phase 2C: Integration Testing (Week 3)

**Tasks**:
1. End-to-end test: Select topic → Generate problem → Validate
2. Performance testing: Topic selection speed (<50ms)
3. Distribution testing: Verify weighted random behavior
4. Failure recovery testing: Blacklist and fallback mechanisms

**Deliverables**:
- Test suite covering all algorithms
- Performance benchmarks documented
- Bug fixes and optimizations

---

## Integration with Phase 1

### How Phase 1 and Phase 2 Work Together

```
┌─────────────────────────────────────────────────────┐
│              Problem Generation Flow                │
├─────────────────────────────────────────────────────┤
│                                                     │
│  1. Student Request (grade, type)                  │
│           │                                         │
│           ▼                                         │
│  2. Phase 2: Topic Selection                       │
│     • Select appropriate topic                     │
│     • Get topic metadata                           │
│     • Load blueprint template                      │
│           │                                         │
│           ▼                                         │
│  3. LLM Generation (Gemini 2.0 Flash)             │
│     • Use topic + blueprint → Generate problem     │
│     • Return raw problem text                      │
│           │                                         │
│           ▼                                         │
│  4. Phase 1: Vocabulary Validation                 │
│     • Lemmatize with compromise                    │
│     • Query eiken_vocabulary_lexicon               │
│     • Apply 3% rule validation                     │
│     • Zipf score checking                          │
│           │                                         │
│           ├─ Valid ──→ 5a. Return problem          │
│           │                                         │
│           └─ Invalid → 5b. Regenerate OR Blacklist │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Vocabulary-Topic Coordination

**Vocabulary Constraints by Grade** (from Phase 1):
```typescript
const vocabularyTargets = {
  '5': { cefr: ['A1'], zipf_min: 4.0, max_out_of_range: 0.03 },
  '4': { cefr: ['A1'], zipf_min: 3.8, max_out_of_range: 0.03 },
  '3': { cefr: ['A1', 'A2'], zipf_min: 3.5, max_out_of_range: 0.03 },
  'pre2': { cefr: ['A2', 'B1'], zipf_min: 3.2, max_out_of_range: 0.03 },
  '2': { cefr: ['B1', 'B2'], zipf_min: 3.0, max_out_of_range: 0.03 },
  'pre1': { cefr: ['B2'], zipf_min: 2.8, max_out_of_range: 0.05 },
  '1': { cefr: ['B2', 'C1'], zipf_min: 2.5, max_out_of_range: 0.05 }
};
```

**Topic Complexity Coordination**:
- Topics with abstractness 7-8 naturally use B2-C1 vocabulary
- Topics with abstractness 1-2 naturally use A1-A2 vocabulary
- LLM prompt includes explicit vocabulary level instructions
- If validation fails, topic may be blacklisted (too difficult)

### End-to-End Example

**Request**: Grade 2, Opinion Speech

```typescript
// 1. Topic Selection (Phase 2)
const topicResult = await topicSelector.selectTopic({
  student_id: 'user123',
  grade: '2',
  question_type: 'opinion_speech',
  session_id: 'session456'
});

// Result: 
// {
//   selected_topic: {
//     topic_code: 'technology',
//     topic_label_en: 'Technology',
//     abstractness_level: 5,
//     scenario_description: 'Impact of technology on daily life...'
//   }
// }

// 2. LLM Generation
const problem = await generateProblem({
  topic: topicResult.selected_topic,
  blueprint: blueprints.opinion_speech_grade2,
  vocabulary_level: 'B1-B2'
});

// Result:
// "Some people think that social media helps people stay connected.
//  Others believe it reduces face-to-face communication.
//  What is your opinion on this topic?"

// 3. Vocabulary Validation (Phase 1)
const validation = await vocabularyAnalyzer.analyzeVocabularyLevel(
  problem,
  '2',
  env
);

// Result:
// {
//   isValid: true,
//   totalWords: 28,
//   uniqueWords: 24,
//   outOfRangeWords: 0,
//   outOfRangeRatio: 0.00,
//   zipfViolations: 0
// }

// 4. Return to student
return {
  problem_text: problem,
  topic: 'technology',
  validated: true
};
```

---

## Summary

### What We Built

1. **Data Foundation**: Parsed 236 real English test questions across 7 grades
2. **Topic Classification**: 8-level abstractness scale + 5 context types
3. **Smart Selection**: LRU + weighted random + blacklist algorithms
4. **Database Schema**: 5 tables for topics, history, suitability, blacklist, stats
5. **Integration Design**: Seamless coordination with Phase 1 vocabulary system

### Next Steps

1. **Immediate**: Create migration files and seed data
2. **Week 1**: Implement TopicSelector service
3. **Week 2**: Build Blueprint system with templates
4. **Week 3**: Integration testing and optimization

### Success Criteria

- ✅ Topic selection completes in <50ms
- ✅ No topic repetition within 5-question window
- ✅ Weighted distribution matches official exam patterns (±10%)
- ✅ Vocabulary validation pass rate >90% for selected topics
- ✅ Emergency fallback triggers in <0.1% of cases
- ✅ Blacklist prevents re-use of problematic topics

---

**Document Version**: 1.0  
**Last Updated**: 2025-11-19  
**Authors**: Phase 2 Design Team  
**Status**: Ready for Implementation Review
