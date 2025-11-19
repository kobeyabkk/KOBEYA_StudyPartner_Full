# Eiken Question Data Analysis Summary

**Data Source**: `/home/user/webapp/data/eiken_questions.json`  
**Total Questions**: 236 questions across 7 grades  
**Parsed On**: 2025-11-19

---

## Distribution by Grade

| Grade | Questions | Question Types | Unique Topics | CEFR Level | Abstractness |
|-------|-----------|----------------|---------------|------------|--------------|
| 5 | 12 | 2 | 7 | A1 | 1-2 |
| 4 | 12 | 2 | 5 | A1 | 1-2 |
| 3 | 40 | 7 | 8 | A2 | 2-3 |
| Pre-2 | 40 | 6 | 5 | B1 | 3-4 |
| 2 | 56 | 7 | 6 | B1-B2 | 4-6 |
| Pre-1 | 36 | 7 | 9 | B2 | 6-7 |
| 1 | 40 | 5 | 11 | C1 | 7-8 |

---

## Question Type Evolution

### Grade 5 (Elementary)
- **grammar_fill**: 6 questions (50%)
- **conversation**: 6 questions (50%)

**Focus**: Basic grammar patterns, simple dialogues, concrete vocabulary

---

### Grade 4 (Elementary)
- **grammar_fill**: 6 questions (50%)
- **conversation**: 6 questions (50%)

**Focus**: Slightly more complex grammar, common situations

---

### Grade 3 (Lower Intermediate)
- **grammar_fill**: 6 questions (15%)
- **conversation**: 4 questions (10%)
- **reading_aloud**: 5 questions (12.5%)
- **picture_description**: 5 questions (12.5%)
- **q_and_a**: 6 questions (15%)
- **email_reply**: 8 questions (20%)
- **long_reading**: 6 questions (15%)

**New Formats**: Email writing, reading comprehension, picture description  
**Focus**: Practical communication skills

---

### Grade Pre-2 (Intermediate)
- **grammar_fill**: 10 questions (25%)
- **reading_aloud**: 5 questions (12.5%)
- **picture_description**: 5 questions (12.5%)
- **q_and_a**: 6 questions (15%)
- **short_opinion**: 8 questions (20%)
- **long_reading**: 6 questions (15%)

**New Formats**: Opinion expression (40 words)  
**Focus**: Expressing personal views with reasons

---

### Grade 2 (Upper Intermediate)
- **grammar_fill**: 8 questions (14.3%)
- **reading_aloud**: 5 questions (8.9%)
- **picture_description**: 5 questions (8.9%)
- **q_and_a**: 6 questions (10.7%)
- **essay**: 7 questions (12.5%)
- **opinion_speech**: 9 questions (16.1%)
- **long_reading**: 16 questions (28.6%)

**New Formats**: Essays (100-150 words), longer reading passages  
**Focus**: Academic writing, complex argumentation

---

### Grade Pre-1 (Advanced)
- **grammar_fill**: 4 questions (11.1%)
- **summary**: 5 questions (13.9%)
- **q_and_a**: 4 questions (11.1%)
- **opinion_speech**: 11 questions (30.6%)
- **opinion_essay**: 3 questions (8.3%)
- **writing_summary**: 2 questions (5.6%)
- **long_reading**: 7 questions (19.4%)

**New Formats**: Summarization, extended argumentation  
**Focus**: Critical analysis, synthesis of information

---

### Grade 1 (Proficient)
- **grammar_fill**: 4 questions (10%)
- **q_and_a**: 5 questions (12.5%)
- **opinion_speech**: 8 questions (20%)
- **opinion_essay**: 5 questions (12.5%)
- **writing_essay**: 5 questions (12.5%)
- **long_reading**: 13 questions (32.5%)

**Focus**: Sophisticated argumentation, complex texts, academic discourse

---

## Topic Themes by Grade

### Grade 5 Topics (7 unique)
- school, hobbies, family, food, daily life, greeting, self-introduction

**Characteristics**: Immediate personal environment, concrete objects

---

### Grade 4 Topics (5 unique)
- hobbies, family, daily life, school, food

**Characteristics**: Personal experiences, familiar routines

---

### Grade 3 Topics (8 unique)
- school life, travel, weekend, club activities, daily life, hobbies, family, communication

**Characteristics**: Social activities, personal plans, familiar situations

---

### Grade Pre-2 Topics (5 unique)
- communication, studying abroad, health, community, environment

**Characteristics**: General social concepts, lifestyle choices

---

### Grade 2 Topics (6 unique)
- education, environment, technology, society, health, culture

**Characteristics**: Social phenomena, abstract concepts, current issues

---

### Grade Pre-1 Topics (9 unique)
- international issues, technology, economy, social policy, education, environment, ethics, global problems, cultural exchange

**Characteristics**: Policy discussion, global perspectives, critical analysis

---

### Grade 1 Topics (11 unique)
- economics, global policy, environmental policy, technology ethics, social philosophy, international relations, cultural identity, scientific ethics, political systems, human rights, sustainable development

**Characteristics**: Philosophical concepts, systemic analysis, interdisciplinary thinking

---

## Key Insights for Phase 2 Implementation

### 1. Progressive Complexity Curve
- **Clear abstraction progression**: Personal (5,4) → Social (3,Pre-2) → Global (2,Pre-1,1)
- **Vocabulary naturally scales with topics**: "my pet" (A1) vs "sustainable development" (C1)

### 2. Format-Topic Alignment
- **Lower grades**: Grammar + conversation work best with concrete personal topics
- **Middle grades**: Opinions + emails suit general social topics well
- **Upper grades**: Essays + summaries require policy/philosophical topics

### 3. Topic Frequency Patterns
- **High-frequency across grades**: daily life, education, technology, environment
- **Grade-specific**: family (lower), international relations (upper)
- **Transition topics**: health, communication (bridge multiple grades)

### 4. Blueprint Design Requirements
- **Must specify**:
  - Word count range (Grade 2+: 40-240 words)
  - Required sentence patterns (especially lower grades)
  - Argument structure (opinion/essay formats)
  - Image description details (picture description tasks)
  
### 5. Validation Coordination
- **Topic abstractness must align with vocabulary level**
- **Pre-validation**: Check if topic historically passes vocab checks
- **Blacklist triggers**: Topics that consistently fail validation for specific grades

---

## Recommended Next Actions

1. **Create Topic Seed Data**:
   - Extract all unique topics from parsed questions
   - Assign abstractness levels (1-8)
   - Classify context types (personal/daily/general/social/policy)
   - Add Japanese/English labels

2. **Define Suitability Scores**:
   - Map each topic to compatible question types
   - Set weights based on observed distribution
   - Example: "technology" → opinion_speech (1.4), essay (1.3), grammar_fill (0.8)

3. **Build Blueprint Templates**:
   - One template per question type
   - Include constraints from parsed data (word counts, time limits)
   - Add good/bad example pairs

4. **Test Topic-Vocabulary Alignment**:
   - Run Phase 1 validation on sample problems from each topic
   - Identify topics that need adjustment or blacklisting
   - Refine abstractness levels based on actual vocabulary usage

---

**Analysis Completed**: 2025-11-19  
**Data Quality**: Excellent (all 7 grades, diverse formats, realistic examples)  
**Ready for**: Phase 2A Implementation (Topic System)
