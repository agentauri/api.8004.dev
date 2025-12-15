-- 8004-backend Database Schema
-- Migration: 0004_oasf_taxonomy_reset
-- Description: Reset OASF classifications for new official taxonomy alignment
--
-- This migration clears existing classifications because:
-- 1. Old taxonomy used hierarchical slugs (e.g., "reasoning/planning")
-- 2. New OASF official taxonomy uses flat slugs (e.g., "advanced_reasoning_planning")
-- 3. Re-classification with new taxonomy produces more accurate results
--
-- Old taxonomy: 9 skills, 8 domains (with children/hierarchies)
-- New taxonomy: 15 skills, 24 domains (flat, no hierarchies)
-- See: https://github.com/agntcy/oasf

-- ============================================================================
-- Step 1: Clear existing classifications
-- They will be regenerated with the new OASF taxonomy
-- ============================================================================

DELETE FROM agent_classifications;

-- ============================================================================
-- Step 2: Reset classification queue
-- Clear any pending/failed jobs and let fresh classifications be triggered
-- ============================================================================

DELETE FROM classification_queue;

-- ============================================================================
-- Step 3: Add migration tracking comment
-- ============================================================================

-- Migration applied: OASF taxonomy updated to official v1.0.0
-- Skills: 15 categories (flat)
-- Domains: 24 categories (flat)
-- Agents will be re-classified on next access
