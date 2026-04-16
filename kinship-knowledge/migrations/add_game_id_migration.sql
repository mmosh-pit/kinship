-- Migration: Add game_id to NPCs, Challenges, Quests, Routes
-- Run against the kinship-knowledge database
-- game_id references games.id in kinship-assets DB (cross-DB, no FK constraint)

ALTER TABLE npcs ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_npcs_game_id ON npcs(game_id);

ALTER TABLE challenges ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_challenges_game_id ON challenges(game_id);

ALTER TABLE quests ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_quests_game_id ON quests(game_id);

ALTER TABLE routes ADD COLUMN IF NOT EXISTS game_id VARCHAR(255);
CREATE INDEX IF NOT EXISTS idx_routes_game_id ON routes(game_id);
