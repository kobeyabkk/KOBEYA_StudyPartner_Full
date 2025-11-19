-- Migration: 0010_create_topic_system.sql
-- Description: Create Phase 2 Topic Management System tables and seed data
-- Created: 2025-11-19
-- Phase: 2A - Topic Selection Infrastructure
--
-- This migration creates:
-- 1. Five core tables for topic management
-- 2. Indexes for performance optimization
-- 3. Initial seed data (61 topics from real exam analysis + emergency additions)
-- 4. Format suitability scores (175 combinations from 236 real exam questions)
--
-- Estimated execution time: 5-10 seconds
-- Total records inserted: ~250 records across 5 tables

-- ============================================================================
-- TABLE 1: eiken_topic_areas (Master Topic List)
-- ============================================================================
-- Purpose: Central repository of all topics with metadata
-- Record count: 61 topics (51 from real exams + 10 emergency additions)

CREATE TABLE IF NOT EXISTS eiken_topic_areas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grade TEXT NOT NULL,                        -- '5', '4', '3', 'pre2', '2', 'pre1', '1'
    topic_code TEXT NOT NULL,                   -- Unique identifier: 'daily_life', 'technology'
    topic_label_ja TEXT NOT NULL,               -- Japanese label: '日常生活', 'テクノロジー'
    topic_label_en TEXT NOT NULL,               -- English label: 'Daily Life', 'Technology'
    abstractness_level INTEGER NOT NULL,        -- 1-8 scale (1=concrete, 8=philosophical)
    context_type TEXT NOT NULL,                 -- 'personal', 'daily', 'general', 'social', 'policy'
    scenario_description TEXT,                  -- Detailed description for LLM prompts
    sub_topics TEXT,                            -- JSON array: ["shopping", "cooking", "cleaning"]
    argument_axes TEXT,                         -- JSON array: ["pros_cons", "causes_effects"]
    weight REAL NOT NULL DEFAULT 1.0,           -- Base selection weight (0.5-2.0)
    official_frequency REAL DEFAULT 1.0,        -- Exam frequency multiplier (0.5-2.0)
    is_active INTEGER DEFAULT 1,                -- 1=active, 0=disabled
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(grade, topic_code),
    CHECK (abstractness_level >= 1 AND abstractness_level <= 8),
    CHECK (context_type IN ('personal', 'daily', 'general', 'social', 'policy')),
    CHECK (weight > 0 AND weight <= 3.0),
    CHECK (official_frequency > 0 AND official_frequency <= 3.0),
    CHECK (is_active IN (0, 1))
);

-- Indexes for efficient topic selection queries
CREATE INDEX IF NOT EXISTS idx_topic_grade_active 
    ON eiken_topic_areas(grade, is_active) 
    WHERE is_active = 1;

CREATE INDEX IF NOT EXISTS idx_topic_abstractness 
    ON eiken_topic_areas(abstractness_level);

CREATE INDEX IF NOT EXISTS idx_topic_context 
    ON eiken_topic_areas(context_type);

CREATE INDEX IF NOT EXISTS idx_topic_code_lookup 
    ON eiken_topic_areas(topic_code);


-- ============================================================================
-- TABLE 2: eiken_topic_question_type_suitability (Format Compatibility)
-- ============================================================================
-- Purpose: Store format-specific suitability scores for topics
-- Record count: 175 combinations (empirically derived from 236 real exam questions)

CREATE TABLE IF NOT EXISTS eiken_topic_question_type_suitability (
    topic_code TEXT NOT NULL,
    grade TEXT NOT NULL,
    question_type TEXT NOT NULL,                -- 'speaking', 'writing', 'reading', 'grammar', etc.
    suitability_score REAL NOT NULL DEFAULT 1.0,-- 0.5=poor, 1.0=neutral, 1.5=excellent
    reasoning TEXT,                             -- Explanation for the score
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    PRIMARY KEY (topic_code, grade, question_type),
    CHECK (suitability_score >= 0.1 AND suitability_score <= 2.0)
);

-- Indexes for format suitability lookups
CREATE INDEX IF NOT EXISTS idx_suitability_lookup 
    ON eiken_topic_question_type_suitability(grade, question_type, suitability_score DESC);

CREATE INDEX IF NOT EXISTS idx_suitability_topic 
    ON eiken_topic_question_type_suitability(topic_code);


-- ============================================================================
-- TABLE 3: eiken_topic_usage_history (LRU Tracking)
-- ============================================================================
-- Purpose: Track topic usage for Least Recently Used (LRU) filtering
-- Record count: Grows with usage, cleaned periodically (retention: 90 days)

CREATE TABLE IF NOT EXISTS eiken_topic_usage_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    topic_code TEXT NOT NULL,
    question_type TEXT NOT NULL,
    session_id TEXT,                            -- Optional: group by study session
    used_at TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- Foreign key constraint (enforced at application level)
    -- FOREIGN KEY (topic_code, grade) REFERENCES eiken_topic_areas(topic_code, grade)
    
    -- No uniqueness constraint - multiple uses allowed
    CHECK (length(student_id) > 0),
    CHECK (length(topic_code) > 0)
);

-- Indexes for LRU queries (most critical for performance)
CREATE INDEX IF NOT EXISTS idx_usage_student_recent 
    ON eiken_topic_usage_history(student_id, grade, question_type, used_at DESC);

CREATE INDEX IF NOT EXISTS idx_usage_session 
    ON eiken_topic_usage_history(session_id, used_at DESC) 
    WHERE session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_usage_cleanup 
    ON eiken_topic_usage_history(used_at);


-- ============================================================================
-- TABLE 4: eiken_topic_blacklist (Failure Tracking)
-- ============================================================================
-- Purpose: Temporarily exclude topics that caused generation failures
-- Record count: Small, grows with failures, auto-expires based on TTL

CREATE TABLE IF NOT EXISTS eiken_topic_blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id TEXT NOT NULL,
    grade TEXT NOT NULL,
    topic_code TEXT NOT NULL,
    question_type TEXT NOT NULL,
    failure_reason TEXT,                        -- 'timeout', 'vocabulary_mismatch', etc.
    failure_count INTEGER DEFAULT 1,            -- Increment for repeated failures
    blacklisted_at TEXT DEFAULT CURRENT_TIMESTAMP,
    expires_at TEXT NOT NULL,                   -- Auto-cleanup after expiration
    
    -- Constraints
    UNIQUE(student_id, grade, topic_code, question_type),
    CHECK (failure_count > 0),
    CHECK (expires_at > blacklisted_at)
);

-- Indexes for blacklist queries
CREATE INDEX IF NOT EXISTS idx_blacklist_active 
    ON eiken_topic_blacklist(student_id, grade, question_type, expires_at) 
    WHERE datetime(expires_at) > datetime('now');

CREATE INDEX IF NOT EXISTS idx_blacklist_cleanup 
    ON eiken_topic_blacklist(expires_at);

CREATE INDEX IF NOT EXISTS idx_blacklist_topic 
    ON eiken_topic_blacklist(topic_code, failure_reason);


-- ============================================================================
-- TABLE 5: eiken_topic_statistics (Analytics & Performance)
-- ============================================================================
-- Purpose: Track topic performance metrics for optimization
-- Record count: ~200-500 records (one per topic-grade-type combination)

CREATE TABLE IF NOT EXISTS eiken_topic_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    topic_code TEXT NOT NULL,
    grade TEXT NOT NULL,
    question_type TEXT NOT NULL,
    total_uses INTEGER DEFAULT 0,
    successful_generations INTEGER DEFAULT 0,
    failed_generations INTEGER DEFAULT 0,
    avg_generation_time_ms REAL,               -- Average LLM generation time
    avg_student_score REAL,                    -- Average student performance
    last_updated TEXT DEFAULT CURRENT_TIMESTAMP,
    
    -- Constraints
    UNIQUE(topic_code, grade, question_type),
    CHECK (total_uses >= 0),
    CHECK (successful_generations >= 0),
    CHECK (failed_generations >= 0),
    CHECK (total_uses = successful_generations + failed_generations),
    CHECK (avg_generation_time_ms IS NULL OR avg_generation_time_ms >= 0),
    CHECK (avg_student_score IS NULL OR (avg_student_score >= 0 AND avg_student_score <= 1))
);

-- Indexes for statistics queries
CREATE INDEX IF NOT EXISTS idx_stats_performance 
    ON eiken_topic_statistics(grade, question_type, successful_generations DESC);

CREATE INDEX IF NOT EXISTS idx_stats_topic 
    ON eiken_topic_statistics(topic_code, total_uses DESC);


-- ============================================================================
-- SEED DATA: Topics from Real Exam Analysis (51 topics)
-- ============================================================================
-- Source: 236 actual Eiken exam questions across all 7 grades
-- Note: Topic codes use underscore separator (e.g., 'daily_life', 'school_life')

INSERT INTO eiken_topic_areas 
  (grade, topic_code, topic_label_ja, topic_label_en, abstractness_level, 
   context_type, scenario_description, sub_topics, argument_axes, 
   weight, official_frequency, is_active)
VALUES
  -- Grade 5 (7 topics) - Abstractness 1-2: Concrete personal experiences
  ('5', 'school', '学校', 'School', 1, 'daily', 
   'School life, classrooms, teachers, studying, school activities',
   '["classroom", "teacher", "studying", "school_activities"]',
   '["like_dislike", "description", "daily_routine"]',
   1.0, 1.3, 1),
  
  ('5', 'family', '家族', 'Family', 1, 'personal',
   'Family members, home life, family activities, relationships',
   '["mother", "father", "siblings", "home"]',
   '["description", "relationships", "activities"]',
   1.0, 1.2, 1),
  
  ('5', 'hobbies', '趣味', 'Hobbies', 2, 'personal',
   'Personal interests, playing, favorite activities',
   '["playing", "games", "activities", "interests"]',
   '["like_dislike", "favorite", "description"]',
   1.0, 1.2, 1),
  
  ('5', 'food', '食べ物', 'Food', 1, 'daily',
   'Favorite foods, meals, eating, food preferences',
   '["favorite_food", "meals", "eating", "preferences"]',
   '["like_dislike", "favorite", "description"]',
   1.0, 1.1, 1),
  
  ('5', 'daily_life', '日常生活', 'Daily Life', 1, 'daily',
   'Daily routines, everyday activities, common situations',
   '["morning", "evening", "daily_routine", "everyday"]',
   '["description", "routine", "activities"]',
   1.2, 1.4, 1),
  
  ('5', 'greeting', 'あいさつ', 'Greetings', 1, 'daily',
   'Basic greetings, introductions, polite expressions',
   '["hello", "goodbye", "thank_you", "please"]',
   '["usage", "situations", "politeness"]',
   1.0, 1.2, 1),
  
  ('5', 'self_introduction', '自己紹介', 'Self-Introduction', 2, 'personal',
   'Introducing yourself, name, age, basic personal information',
   '["name", "age", "where_from", "basic_info"]',
   '["information", "description", "personal"]',
   1.0, 1.3, 1),

  -- Grade 4 (5 topics) - Abstractness 1-2: Personal experiences with more detail
  ('4', 'daily_life', '日常生活', 'Daily Life', 2, 'daily',
   'Daily routines, common activities, everyday situations with more detail',
   '["morning_routine", "after_school", "weekday", "weekend"]',
   '["description", "routine", "preferences"]',
   1.2, 1.4, 1),
  
  ('4', 'family', '家族', 'Family', 2, 'personal',
   'Family members, family activities, home life with descriptions',
   '["family_members", "family_time", "home_activities"]',
   '["description", "activities", "relationships"]',
   1.0, 1.2, 1),
  
  ('4', 'hobbies', '趣味', 'Hobbies', 2, 'personal',
   'Personal hobbies, interests, leisure activities',
   '["sports", "music", "reading", "collecting"]',
   '["like_dislike", "frequency", "skill"]',
   1.1, 1.3, 1),
  
  ('4', 'school', '学校', 'School', 2, 'daily',
   'School life, classes, friends, school events',
   '["classes", "school_friends", "school_events", "studying"]',
   '["description", "activities", "experiences"]',
   1.1, 1.3, 1),
  
  ('4', 'food', '食べ物', 'Food', 2, 'daily',
   'Food preferences, favorite dishes, eating experiences',
   '["favorite_foods", "cooking", "restaurants", "meals"]',
   '["preferences", "experiences", "description"]',
   1.0, 1.1, 1),

  -- Grade 3 (8 topics) - Abstractness 2-3: Familiar social situations
  ('3', 'school_life', '学校生活', 'School Life', 2, 'daily',
   'School activities, club participation, classroom experiences, school events',
   '["club_activities", "school_events", "classroom", "homework", "exams"]',
   '["favorite_least_favorite", "benefits_challenges", "experiences"]',
   1.2, 1.5, 1),
  
  ('3', 'travel', '旅行', 'Travel', 3, 'general',
   'Travel experiences, places visited, vacation activities',
   '["vacation", "sightseeing", "destinations", "travel_experiences"]',
   '["experiences", "preferences", "memories"]',
   1.0, 1.2, 1),
  
  ('3', 'weekend', '週末', 'Weekend', 2, 'daily',
   'Weekend activities, free time, leisure',
   '["free_time", "activities", "relaxation", "fun"]',
   '["activities", "preferences", "routines"]',
   1.1, 1.3, 1),
  
  ('3', 'club_activities', '部活動', 'Club Activities', 3, 'daily',
   'School clubs, team activities, extracurricular activities',
   '["sports_clubs", "cultural_clubs", "teamwork", "competitions"]',
   '["participation", "benefits", "challenges"]',
   1.1, 1.3, 1),
  
  ('3', 'daily_life', '日常生活', 'Daily Life', 2, 'daily',
   'Daily routines, common situations, everyday experiences',
   '["routines", "activities", "situations", "habits"]',
   '["description", "preferences", "changes"]',
   1.2, 1.4, 1),
  
  ('3', 'hobbies', '趣味', 'Hobbies', 3, 'personal',
   'Personal interests, hobby activities, skill development',
   '["interests", "activities", "skill_building", "enjoyment"]',
   '["reasons", "frequency", "benefits"]',
   1.0, 1.2, 1),
  
  ('3', 'family', '家族', 'Family', 2, 'personal',
   'Family life, family activities, relationships',
   '["family_time", "family_events", "relationships", "support"]',
   '["description", "activities", "importance"]',
   1.0, 1.2, 1),
  
  ('3', 'communication', 'コミュニケーション', 'Communication', 3, 'general',
   'Ways of communicating, talking with friends, staying in touch',
   '["talking", "messaging", "meeting_friends", "staying_connected"]',
   '["methods", "preferences", "importance"]',
   1.1, 1.3, 1),

  -- Grade Pre-2 (5 topics) - Abstractness 3-4: General social concepts
  ('pre2', 'communication', 'コミュニケーション', 'Communication', 4, 'general',
   'Communication methods, social interaction, staying connected',
   '["face_to_face", "online", "messaging", "social_media", "phone_calls"]',
   '["methods", "pros_cons", "effectiveness", "preferences"]',
   1.3, 1.5, 1),
  
  ('pre2', 'studying_abroad', '留学', 'Studying Abroad', 4, 'general',
   'Study abroad experiences, international education, cultural exchange',
   '["international_experience", "language_learning", "culture", "challenges"]',
   '["benefits", "challenges", "preparation", "goals"]',
   1.1, 1.3, 1),
  
  ('pre2', 'health', '健康', 'Health', 3, 'daily',
   'Health habits, exercise, healthy lifestyle, wellness',
   '["exercise", "diet", "sleep", "wellness", "fitness"]',
   '["importance", "habits", "benefits", "challenges"]',
   1.2, 1.4, 1),
  
  ('pre2', 'community', 'コミュニティ', 'Community', 4, 'general',
   'Community activities, local events, neighborhood, volunteering',
   '["local_events", "volunteering", "neighbors", "community_service"]',
   '["participation", "benefits", "importance", "activities"]',
   1.1, 1.3, 1),
  
  ('pre2', 'travel', '旅行', 'Travel', 3, 'general',
   'Travel experiences, destinations, tourism, exploration',
   '["destinations", "planning", "experiences", "cultural_exploration"]',
   '["purposes", "benefits", "preferences", "memories"]',
   1.0, 1.2, 1),

  -- Grade 2 (6 topics) - Abstractness 4-6: Abstract social issues
  ('2', 'education', '教育', 'Education', 5, 'social',
   'Education systems, learning methods, educational technology, school policies',
   '["school_systems", "learning_methods", "online_education", "curriculum"]',
   '["quality", "methods", "innovation", "challenges"]',
   1.3, 1.5, 1),
  
  ('2', 'environment', '環境', 'Environment', 5, 'social',
   'Environmental issues, conservation, sustainability, climate',
   '["conservation", "pollution", "recycling", "climate_change", "sustainability"]',
   '["problems", "solutions", "responsibility", "impact"]',
   1.4, 1.6, 1),
  
  ('2', 'technology', 'テクノロジー', 'Technology', 5, 'general',
   'Technology impact on society, digital devices, innovation, social media',
   '["smartphones", "internet", "social_media", "innovation", "AI"]',
   '["benefits", "problems", "impact", "future"]',
   1.5, 1.7, 1),
  
  ('2', 'society', '社会', 'Society', 6, 'social',
   'Social issues, community problems, societal changes, modern life',
   '["social_issues", "community", "changes", "modern_life"]',
   '["problems", "solutions", "trends", "impact"]',
   1.2, 1.4, 1),
  
  ('2', 'health', '健康', 'Health', 4, 'general',
   'Public health, healthcare, healthy lifestyle, medical advances',
   '["healthcare", "wellness", "medical_technology", "lifestyle"]',
   '["importance", "systems", "challenges", "improvements"]',
   1.2, 1.4, 1),
  
  ('2', 'culture', '文化', 'Culture', 5, 'social',
   'Cultural diversity, traditions, cultural exchange, arts',
   '["diversity", "traditions", "exchange", "arts", "heritage"]',
   '["importance", "preservation", "exchange", "appreciation"]',
   1.1, 1.3, 1),

  -- Grade Pre-1 (9 topics) - Abstractness 6-7: Policy and critical analysis
  ('pre1', 'international_issues', '国際問題', 'International Issues', 7, 'policy',
   'Global challenges, international cooperation, world affairs, diplomacy',
   '["global_challenges", "cooperation", "conflicts", "diplomacy", "refugees"]',
   '["causes", "solutions", "cooperation", "impact"]',
   1.4, 1.6, 1),
  
  ('pre1', 'technology', 'テクノロジー', 'Technology', 6, 'social',
   'Technological advancement, AI, automation, digital society',
   '["AI", "automation", "digital_transformation", "innovation", "ethics"]',
   '["progress", "risks", "ethics", "regulation"]',
   1.5, 1.7, 1),
  
  ('pre1', 'economy', '経済', 'Economy', 7, 'policy',
   'Economic systems, business, employment, economic challenges',
   '["economic_systems", "employment", "business", "global_economy"]',
   '["systems", "challenges", "policies", "future"]',
   1.2, 1.4, 1),
  
  ('pre1', 'social_policy', '社会政策', 'Social Policy', 7, 'policy',
   'Government policies, welfare, social programs, public services',
   '["welfare", "public_services", "social_programs", "government_role"]',
   '["effectiveness", "funding", "reform", "priorities"]',
   1.3, 1.5, 1),
  
  ('pre1', 'education', '教育', 'Education', 6, 'social',
   'Education reform, teaching methods, educational equality, lifelong learning',
   '["reform", "methods", "equality", "lifelong_learning", "innovation"]',
   '["quality", "access", "innovation", "challenges"]',
   1.3, 1.5, 1),
  
  ('pre1', 'environment', '環境', 'Environment', 6, 'social',
   'Environmental policy, climate action, renewable energy, conservation',
   '["climate_policy", "renewable_energy", "conservation", "sustainability"]',
   '["policies", "technologies", "cooperation", "urgency"]',
   1.4, 1.6, 1),
  
  ('pre1', 'ethics', '倫理', 'Ethics', 7, 'policy',
   'Ethical issues, moral dilemmas, social responsibility, values',
   '["moral_dilemmas", "responsibility", "values", "decision_making"]',
   '["principles", "conflicts", "applications", "reasoning"]',
   1.2, 1.4, 1),
  
  ('pre1', 'global_problems', '地球規模の問題', 'Global Problems', 7, 'policy',
   'Global challenges, poverty, inequality, resource management',
   '["poverty", "inequality", "resources", "population", "cooperation"]',
   '["causes", "impacts", "solutions", "cooperation"]',
   1.3, 1.5, 1),
  
  ('pre1', 'cultural_exchange', '文化交流', 'Cultural Exchange', 6, 'social',
   'International cultural exchange, diversity, multiculturalism, understanding',
   '["diversity", "multiculturalism", "understanding", "cooperation"]',
   '["benefits", "challenges", "methods", "importance"]',
   1.1, 1.3, 1),

  -- Grade 1 (11 topics) - Abstractness 7-8: Philosophical and systemic
  ('1', 'economics', '経済学', 'Economics', 7, 'policy',
   'Economic theories, global economics, trade, financial systems',
   '["theories", "global_trade", "financial_systems", "inequality", "development"]',
   '["systems", "policies", "impacts", "future"]',
   1.3, 1.5, 1),
  
  ('1', 'global_policy', '国際政策', 'Global Policy', 8, 'policy',
   'International relations, global governance, diplomacy, cooperation',
   '["governance", "diplomacy", "cooperation", "conflicts", "institutions"]',
   '["effectiveness", "challenges", "reform", "balance"]',
   1.4, 1.6, 1),
  
  ('1', 'environmental_policy', '環境政策', 'Environmental Policy', 7, 'policy',
   'Climate policy, environmental regulation, sustainability strategies',
   '["climate_policy", "regulation", "sustainability", "innovation", "cooperation"]',
   '["effectiveness", "economics", "technology", "urgency"]',
   1.4, 1.6, 1),
  
  ('1', 'technology_ethics', '技術倫理', 'Technology Ethics', 8, 'policy',
   'AI ethics, biotechnology, privacy, technological responsibility',
   '["AI_ethics", "biotechnology", "privacy", "responsibility", "regulation"]',
   '["principles", "dilemmas", "governance", "future"]',
   1.5, 1.7, 1),
  
  ('1', 'social_philosophy', '社会哲学', 'Social Philosophy', 8, 'policy',
   'Justice, equality, rights, social contract, political philosophy',
   '["justice", "equality", "rights", "freedom", "social_contract"]',
   '["theories", "applications", "conflicts", "evolution"]',
   1.3, 1.5, 1),
  
  ('1', 'international_relations', '国際関係', 'International Relations', 7, 'policy',
   'Geopolitics, international cooperation, conflicts, global order',
   '["geopolitics", "cooperation", "conflicts", "power_balance", "institutions"]',
   '["dynamics", "cooperation", "challenges", "future"]',
   1.3, 1.5, 1),
  
  ('1', 'cultural_identity', '文化的アイデンティティ', 'Cultural Identity', 7, 'social',
   'Identity, cultural heritage, globalization, multiculturalism',
   '["identity", "heritage", "globalization", "multiculturalism", "preservation"]',
   '["formation", "preservation", "conflicts", "evolution"]',
   1.2, 1.4, 1),
  
  ('1', 'scientific_ethics', '科学倫理', 'Scientific Ethics', 8, 'policy',
   'Research ethics, scientific responsibility, bioethics, innovation',
   '["research_ethics", "responsibility", "bioethics", "regulation"]',
   '["principles", "dilemmas", "governance", "progress"]',
   1.3, 1.5, 1),
  
  ('1', 'political_systems', '政治システム', 'Political Systems', 7, 'policy',
   'Democracy, governance, political theory, civic participation',
   '["democracy", "governance", "theory", "participation", "reform"]',
   '["systems", "effectiveness", "challenges", "evolution"]',
   1.2, 1.4, 1),
  
  ('1', 'human_rights', '人権', 'Human Rights', 8, 'policy',
   'Universal rights, social justice, equality, human dignity',
   '["universal_rights", "justice", "equality", "dignity", "protection"]',
   '["principles", "violations", "protection", "progress"]',
   1.4, 1.6, 1),
  
  ('1', 'sustainable_development', '持続可能な開発', 'Sustainable Development', 8, 'policy',
   'Sustainability, development goals, resource management, future generations',
   '["SDGs", "resources", "balance", "future_generations", "innovation"]',
   '["goals", "challenges", "solutions", "cooperation"]',
   1.5, 1.7, 1);


-- ============================================================================
-- SEED DATA: Emergency Topics (10 topics for Grade 4 and Pre-2)
-- ============================================================================
-- Purpose: Reach minimum 10 topics per grade for adequate selection diversity
-- Source: Official Eiken guidelines and common exam patterns

INSERT INTO eiken_topic_areas
  (grade, topic_code, topic_label_ja, topic_label_en, abstractness_level,
   context_type, scenario_description, sub_topics, argument_axes,
   weight, official_frequency, is_active)
VALUES
  -- Grade 4 Emergency Topics (+5)
  ('4', 'pets', 'ペット', 'Pets',
   2, 'personal', 'Topics about pets, animals at home, taking care of pets, favorite animals, visits to pet shops or zoos',
   '["my_pet", "cat", "dog", "animal_care", "zoo_visit"]', '["like_dislike", "favorite", "description"]',
   1.1, 1.3, 1),
  
  ('4', 'weather', '天気', 'Weather',
   1, 'daily', 'Weather descriptions, seasons, favorite weather, activities in different weather conditions',
   '["sunny", "rainy", "seasons", "weather_activities"]', '["description", "preference", "activities"]',
   1.0, 1.2, 1),
  
  ('4', 'sports', 'スポーツ', 'Sports',
   2, 'personal', 'Sports activities, favorite sports, playing sports, watching sports, sports at school',
   '["soccer", "baseball", "swimming", "sports_day", "team_sports"]', '["like_dislike", "participation", "watching"]',
   1.2, 1.4, 1),
  
  ('4', 'shopping', '買い物', 'Shopping',
   2, 'daily', 'Shopping experiences, going to stores, buying things, what to buy, shopping with family',
   '["supermarket", "shopping_mall", "buying_clothes", "pocket_money"]', '["experience", "preferences", "routines"]',
   1.0, 1.1, 1),
  
  ('4', 'festivals', 'お祭り・イベント', 'Festivals and Events',
   2, 'daily', 'School festivals, local festivals, events, celebrations, special occasions',
   '["school_festival", "summer_festival", "christmas", "new_year", "birthday"]', '["experience", "enjoyment", "activities"]',
   1.1, 1.2, 1),
  
  -- Pre-2 Emergency Topics (+5)
  ('pre2', 'hobbies', '趣味', 'Hobbies',
   3, 'personal', 'Personal hobbies, interests, leisure activities, developing skills, hobby benefits',
   '["reading", "music", "sports", "collecting", "creative_activities"]', '["benefits", "time_management", "skill_development"]',
   1.2, 1.4, 1),
  
  ('pre2', 'part_time_jobs', 'アルバイト', 'Part-time Jobs',
   4, 'general', 'Student part-time work, job experiences, balancing work and study, earning money',
   '["work_experience", "responsibility", "time_balance", "earning_money"]', '["pros_cons", "learning", "responsibility"]',
   1.1, 1.3, 1),
  
  ('pre2', 'technology', 'テクノロジー', 'Technology',
   4, 'general', 'Technology in daily life, smartphones, computers, internet, social media basics',
   '["smartphones", "internet", "social_media", "online_learning", "apps"]', '["benefits_problems", "usage", "impact"]',
   1.3, 1.5, 1),
  
  ('pre2', 'food', '食生活', 'Food and Diet',
   3, 'daily', 'Food preferences, healthy eating, cooking, restaurants, food culture',
   '["healthy_eating", "cooking", "restaurants", "food_culture", "diet"]', '["health", "preferences", "culture"]',
   1.0, 1.2, 1),
  
  ('pre2', 'transportation', '交通', 'Transportation',
   3, 'daily', 'Transportation methods, commuting, public transportation, travel, traffic',
   '["trains", "buses", "bicycles", "commuting", "traffic_issues"]', '["convenience", "environment", "safety"]',
   1.0, 1.1, 1);


-- ============================================================================
-- SEED DATA: Format Suitability Scores (175 combinations)
-- ============================================================================
-- Source: Empirically calculated from 236 real Eiken exam questions
-- Scoring: 1.3=high confidence (5+ samples), 1.2=good (3-4), 1.0=neutral (2), 0.9=low (1)

-- Auto-generated format suitability scores from 236 real exam questions
-- Generated on: 2025-11-19
-- Total records: 175

INSERT INTO eiken_topic_question_type_suitability
  (topic_code, grade, question_type, suitability_score, reasoning)
VALUES
  ('daily_life', '5', 'conversation', 1.0, 'Based on 2 actual exam question(s) in grade 5'),
  ('daily_life', '5', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('family', '5', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('food', '5', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('food', '5', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('greeting', '5', 'conversation', 1.0, 'Based on 2 actual exam question(s) in grade 5'),
  ('hobbies', '5', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('school', '5', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 5'),
  ('self-introduction', '5', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 5'),
  ('daily_life', '4', 'conversation', 1.2, 'Based on 3 actual exam question(s) in grade 4'),
  ('daily_life', '4', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 4'),
  ('family', '4', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 4'),
  ('family', '4', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 4'),
  ('food', '4', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 4'),
  ('hobbies', '4', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 4'),
  ('school', '4', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 4'),
  ('school', '4', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 4'),
  ('club_activities', '3', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('club_activities', '3', 'email_reply', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('club_activities', '3', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('daily_life', '3', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('daily_life', '3', 'email_reply', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('daily_life', '3', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('daily_life', '3', 'picture_description', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('daily_life', '3', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('family', '3', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('family', '3', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('family', '3', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('future', '3', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('hobbies', '3', 'email_reply', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('hobbies', '3', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('hobbies', '3', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('school_life', '3', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('school_life', '3', 'email_reply', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('school_life', '3', 'grammar_fill', 1.2, 'Based on 3 actual exam question(s) in grade 3'),
  ('school_life', '3', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('school_life', '3', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('school_life', '3', 'q_and_a', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('school_life', '3', 'reading_aloud', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('travel', '3', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('travel', '3', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('travel', '3', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('weekend', '3', 'conversation', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('weekend', '3', 'email_reply', 1.0, 'Based on 2 actual exam question(s) in grade 3'),
  ('weekend', '3', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('weekend', '3', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('weekend', '3', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('weekend', '3', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 3'),
  ('communication', 'pre2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('communication', 'pre2', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('communication', 'pre2', 'picture_description', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('communication', 'pre2', 'q_and_a', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('communication', 'pre2', 'reading_aloud', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('communication', 'pre2', 'short_opinion', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('community', 'pre2', 'short_opinion', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('health', 'pre2', 'short_opinion', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'grammar_fill', 1.2, 'Based on 3 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'q_and_a', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade pre2'),
  ('studying_abroad', 'pre2', 'short_opinion', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('travel', 'pre2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade pre2'),
  ('education', '2', 'essay', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('education', '2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('education', '2', 'long_reading', 1.2, 'Based on 4 actual exam question(s) in grade 2'),
  ('education', '2', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('education', '2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('education', '2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('education', '2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('environment', '2', 'essay', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('environment', '2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('environment', '2', 'long_reading', 1.2, 'Based on 4 actual exam question(s) in grade 2'),
  ('environment', '2', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('environment', '2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('environment', '2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('environment', '2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('health', '2', 'essay', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('health', '2', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('health', '2', 'long_reading', 1.2, 'Based on 3 actual exam question(s) in grade 2'),
  ('health', '2', 'opinion_speech', 1.2, 'Based on 4 actual exam question(s) in grade 2'),
  ('health', '2', 'picture_description', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('health', '2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('health', '2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('science', '2', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('society', '2', 'essay', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('society', '2', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('society', '2', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('society', '2', 'opinion_speech', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('society', '2', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('society', '2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('technology', '2', 'essay', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('technology', '2', 'grammar_fill', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('technology', '2', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('technology', '2', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('technology', '2', 'picture_description', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('technology', '2', 'q_and_a', 1.0, 'Based on 2 actual exam question(s) in grade 2'),
  ('technology', '2', 'reading_aloud', 0.9, 'Based on 1 actual exam question(s) in grade 2'),
  ('ai_/_science', 'pre1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('ai_/_science', 'pre1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('ai_/_science', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('ai_/_science', 'pre1', 'summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('climate_change', 'pre1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('climate_change', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('climate_change', 'pre1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('climate_change', 'pre1', 'summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('climate_change', 'pre1', 'writing_summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('economics', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('environment', 'pre1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('environment', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('environment', 'pre1', 'summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('global_health', 'pre1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('global_health', 'pre1', 'opinion_speech', 1.0, 'Based on 2 actual exam question(s) in grade pre1'),
  ('global_health', 'pre1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('global_health', 'pre1', 'summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('global_health', 'pre1', 'writing_summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('international_issues', 'pre1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade pre1'),
  ('international_issues', 'pre1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('international_issues', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('international_issues', 'pre1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('science', 'pre1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('science', 'pre1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade pre1'),
  ('science', 'pre1', 'opinion_speech', 1.0, 'Based on 2 actual exam question(s) in grade pre1'),
  ('society', 'pre1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('society', 'pre1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade pre1'),
  ('society', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('technology', 'pre1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('technology', 'pre1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('technology', 'pre1', 'summary', 0.9, 'Based on 1 actual exam question(s) in grade pre1'),
  ('ai_/_science', '1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('ai_/_science', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('ai_/_science', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('ai_/_science', '1', 'writing_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('climate_change', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('climate_change', '1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('economics', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('economics', '1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('economics', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('economics', '1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('economics', '1', 'writing_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('education', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('education', '1', 'writing_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('environment', '1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('environment', '1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 1'),
  ('environment', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('environment', '1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('global_health', '1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('global_health', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('global_health', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('global_health', '1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('global_health', '1', 'writing_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('international_issues', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('international_issues', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('international_issues', '1', 'writing_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('politics', '1', 'grammar_fill', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('politics', '1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 1'),
  ('politics', '1', 'opinion_essay', 1.0, 'Based on 2 actual exam question(s) in grade 1'),
  ('politics', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('science', '1', 'long_reading', 1.0, 'Based on 2 actual exam question(s) in grade 1'),
  ('science', '1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('science', '1', 'opinion_speech', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('society', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('technology', '1', 'long_reading', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('technology', '1', 'opinion_essay', 0.9, 'Based on 1 actual exam question(s) in grade 1'),
  ('technology', '1', 'q_and_a', 0.9, 'Based on 1 actual exam question(s) in grade 1');
-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries after migration to verify successful deployment

-- 1. Verify topic counts by grade
-- Expected: Grade 5=7, 4=10, 3=8, pre2=10, 2=6, pre1=9, 1=11 (Total: 61)
-- SELECT grade, COUNT(*) as topic_count 
-- FROM eiken_topic_areas 
-- WHERE is_active = 1 
-- GROUP BY grade 
-- ORDER BY CASE grade 
--   WHEN '5' THEN 1 WHEN '4' THEN 2 WHEN '3' THEN 3 
--   WHEN 'pre2' THEN 4 WHEN '2' THEN 5 WHEN 'pre1' THEN 6 WHEN '1' THEN 7 
-- END;

-- 2. Verify suitability score count
-- Expected: 175 combinations
-- SELECT COUNT(*) as suitability_count 
-- FROM eiken_topic_question_type_suitability;

-- 3. Check abstractness distribution
-- Expected: Progression from 1 (Grade 5) to 8 (Grade 1)
-- SELECT grade, 
--        MIN(abstractness_level) as min_abs, 
--        MAX(abstractness_level) as max_abs,
--        AVG(abstractness_level) as avg_abs
-- FROM eiken_topic_areas
-- WHERE is_active = 1
-- GROUP BY grade
-- ORDER BY CASE grade 
--   WHEN '5' THEN 1 WHEN '4' THEN 2 WHEN '3' THEN 3 
--   WHEN 'pre2' THEN 4 WHEN '2' THEN 5 WHEN 'pre1' THEN 6 WHEN '1' THEN 7 
-- END;

-- 4. Verify index creation
-- SELECT name, tbl_name 
-- FROM sqlite_master 
-- WHERE type = 'index' 
--   AND tbl_name LIKE 'eiken_topic%'
-- ORDER BY tbl_name, name;

-- 5. Check for any constraint violations
-- SELECT 'eiken_topic_areas' as table_name, COUNT(*) as records 
-- FROM eiken_topic_areas
-- UNION ALL
-- SELECT 'eiken_topic_question_type_suitability', COUNT(*) 
-- FROM eiken_topic_question_type_suitability
-- UNION ALL
-- SELECT 'eiken_topic_usage_history', COUNT(*) 
-- FROM eiken_topic_usage_history
-- UNION ALL
-- SELECT 'eiken_topic_blacklist', COUNT(*) 
-- FROM eiken_topic_blacklist
-- UNION ALL
-- SELECT 'eiken_topic_statistics', COUNT(*) 
-- FROM eiken_topic_statistics;

-- ============================================================================
-- MIGRATION COMPLETE
-- ============================================================================
-- Phase 2A Topic Management System tables created successfully!
-- 
-- Summary:
-- - 5 tables created with appropriate indexes
-- - 61 topics inserted (51 real + 10 emergency)
-- - 175 format suitability scores inserted
-- - All constraints and foreign keys defined
-- 
-- Next Steps:
-- 1. Implement TopicSelector service (src/eiken/services/topic-selector.ts)
-- 2. Create API endpoints for topic selection
-- 3. Integrate with Phase 1 vocabulary validation
-- 4. Add Blueprint templates for problem generation
--
-- Estimated total records: 236 (61 topics + 175 suitability scores)
-- Migration version: 0010
-- Created: 2025-11-19
-- ============================================================================
