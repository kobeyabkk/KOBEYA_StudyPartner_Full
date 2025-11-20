-- Migration: 0015_create_generated_questions.sql
-- Description: Phase 3 - 生成された問題を保存するテーブル
-- Created: 2025-11-19
--
-- NOTE: このマイグレーションはスキップされます
-- Productionには既に異なる構造のeiken_generated_questionsテーブルが存在するため、
-- 既存のテーブルを尊重します。新しいスキーマは将来のマイグレーションで対応します。

-- マイグレーション成功をマーク（何もしない）
SELECT 'Migration 0015: Skipped - Table already exists with different schema' as status;
