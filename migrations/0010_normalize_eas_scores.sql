-- Migration: Normalize EAS feedback scores from 1-5 to 0-100 scale
--
-- Background:
-- EAS attestations use a 1-5 score scale, while Graph feedback uses 0-100.
-- Previously, EAS scores were stored as-is, causing incorrect reputation calculations
-- when mixed with Graph feedback. This migration normalizes existing EAS feedback
-- to the 0-100 scale for consistency.
--
-- Score conversion: 1->0, 2->25, 3->50, 4->75, 5->100
--
-- Identification:
-- - EAS feedback has eas_uid NOT NULL and NOT starting with 'graph:'
-- - Graph feedback has eas_uid starting with 'graph:'
-- - Only scores 1-5 are legacy EAS scores that need conversion

-- Update EAS feedback scores: 1->0, 2->25, 3->50, 4->75, 5->100
-- Only affects feedback from EAS (not from Graph which uses "graph:" prefix)
-- and only scores in the 1-5 range (to avoid re-normalizing already normalized scores)
UPDATE agent_feedback
SET score = CASE score
    WHEN 1 THEN 0
    WHEN 2 THEN 25
    WHEN 3 THEN 50
    WHEN 4 THEN 75
    WHEN 5 THEN 100
    ELSE score
  END,
  updated_at = datetime('now')
WHERE eas_uid IS NOT NULL
  AND eas_uid NOT LIKE 'graph:%'
  AND score >= 1
  AND score <= 5;

-- Note: After running this migration, you must trigger reputation recalculation
-- for all agents to update the aggregated scores. This can be done by calling:
--   reputationService.recalculateAll()
-- in the application code, or by running:
--   DELETE FROM agent_reputation;
-- and letting the next sync cycle rebuild reputations (slower but automatic).
