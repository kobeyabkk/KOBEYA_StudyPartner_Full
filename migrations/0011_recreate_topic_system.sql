-- Migration: 0011_recreate_topic_system.sql
-- Description: Drop and recreate Phase 2 Topic Management System tables
-- Created: 2025-11-19
-- Purpose: Fix schema mismatches by recreating all topic-related tables
-- WARNING: This will delete all existing topic data!

-- ============================================================================
-- Drop existing tables (in correct order due to constraints)
-- ============================================================================

DROP TABLE IF EXISTS eiken_topic_statistics;
DROP TABLE IF EXISTS eiken_topic_blacklist;
DROP TABLE IF EXISTS eiken_topic_usage_history;
DROP TABLE IF EXISTS eiken_topic_question_type_suitability;
DROP TABLE IF EXISTS eiken_topic_areas;

-- ============================================================================
-- Now run the main migration: 0010_create_topic_system.sql
-- ============================================================================
-- This file only drops the tables.
-- After running this, immediately run 0010_create_topic_system.sql
