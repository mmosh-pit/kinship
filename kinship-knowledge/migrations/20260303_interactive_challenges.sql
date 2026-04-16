-- Migration: Add Interactive Challenge Fields
-- Date: 2026-03-03
-- Purpose: Support hands-on interactive challenges (not quiz-style)

-- Add new columns for interactive challenge mechanics
ALTER TABLE challenges 
ADD COLUMN IF NOT EXISTS interaction_style VARCHAR(50) DEFAULT 'hands_on';

ALTER TABLE challenges 
ADD COLUMN IF NOT EXISTS scene_integration JSONB DEFAULT '{}';

ALTER TABLE challenges 
ADD COLUMN IF NOT EXISTS mechanics JSONB DEFAULT '{}';

ALTER TABLE challenges 
ADD COLUMN IF NOT EXISTS interactive_elements JSONB DEFAULT '[]';

ALTER TABLE challenges 
ADD COLUMN IF NOT EXISTS success_conditions JSONB DEFAULT '[]';

-- Add comments
COMMENT ON COLUMN challenges.interaction_style IS 'hands_on, observation, timing, etc.';
COMMENT ON COLUMN challenges.scene_integration IS 'trigger, location, ambient_effects';
COMMENT ON COLUMN challenges.mechanics IS 'type, objects, goal, constraints, physics';
COMMENT ON COLUMN challenges.interactive_elements IS 'array of {name, behavior, effect}';
COMMENT ON COLUMN challenges.success_conditions IS 'array of {type, details}';

-- Create index for mechanic_type queries
CREATE INDEX IF NOT EXISTS idx_challenges_mechanic_type ON challenges(mechanic_type);

-- Verify
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'challenges' 
ORDER BY ordinal_position;
