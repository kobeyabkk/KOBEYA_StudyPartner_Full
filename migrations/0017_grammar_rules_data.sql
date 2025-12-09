-- Migration: 0017_grammar_rules_data.sql
-- Description: Populate grammar_pattern_rules table with detection rules
-- Created: 2025-12-09
-- 
-- Purpose: Add grammar rule data for teacher-style explanations (Phase 6)

-- Insert detection rules for conditional clauses
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('H3-019', 'if.*tomorrow|when.*next', '["if", "when", "tomorrow", "next"]', 'conditional_clause', 10, datetime('now')),
  ('JHS2-012', 'if.*will|when.*will', '["if", "when", "will"]', 'present_for_future', 9, datetime('now'));

-- Insert detection rules for third person singular
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('ELEM-005', 'he.*_____| she.*_____|it.*_____', '["he", "she", "it"]', 'third_person_singular', 8, datetime('now')),
  ('JHS1-003', 'every.*(day|week|month)', '["every", "always", "usually"]', 'present_simple_habit', 7, datetime('now'));

-- Insert detection rules for past simple
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('JHS1-006', 'yesterday|last.*(week|month|year)|ago', '["yesterday", "last", "ago"]', 'past_simple', 8, datetime('now'));

-- Insert detection rules for present perfect
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('JHS3-010', 'have.*been|has.*been|since|for.*years?', '["have", "has", "since", "for"]', 'present_perfect', 9, datetime('now'));

-- Insert detection rules for modals
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('JHS1-008', 'can.*_____', '["can"]', 'modal_can', 6, datetime('now')),
  ('JHS1-010', 'will.*_____', '["will"]', 'future_will', 7, datetime('now'));

-- Insert detection rules for gerunds and infinitives
INSERT INTO grammar_pattern_rules (term_code, detection_regex, keyword_markers, pos_pattern, priority, created_at)
VALUES 
  ('JHS2-015', 'enjoy|finish|stop.*_____', '["enjoy", "finish", "stop"]', 'verb_taking_gerund', 9, datetime('now')),
  ('JHS2-013', 'want|need|decide.*to', '["want", "need", "decide", "to"]', 'verb_taking_infinitive', 9, datetime('now'));

SELECT 'Migration 0017: Successfully populated grammar_pattern_rules table' as status;
