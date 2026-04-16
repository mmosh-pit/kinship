-- Migration: Player Game Progress Persistence
-- Date: 2026-03-11
-- Description: Stores per-player, per-game, per-scene checkpoint data so that
--              when a player exits mid-game and returns they resume exactly where
--              they left off — at the correct challenge, with all scores intact.
--
-- Key identifiers (mirrors wallet score tables):
--   game_id          - stable game / scene identifier
--   wallet_user_id   - wallet address or stable anonymous ID
--   scene_id         - current scene the player is in
--
-- Progress data stored:
--   completed_challenge_ids  - ordered list of challenge IDs finished
--   challenge_scores         - per-challenge score breakdown {challenge_id: points}
--   completed_quest_ids      - list of quest IDs finished
--   last_challenge_index     - 0-based index of the next challenge to activate
--   total_score / level      - aggregated for leaderboard sync
--   hearts_scores            - HEARTS facet breakdown
--   extra_state              - arbitrary JSON for future extensibility

-- ═══════════════════════════════════════════════════════════════════
--  player_game_progress table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS player_game_progress (
    id VARCHAR(36) PRIMARY KEY,

    -- THE THREE KEY IDENTIFIERS (same naming as wallet_leaderboard_entries)
    game_id          VARCHAR(255) NOT NULL,
    wallet_user_id   VARCHAR(255) NOT NULL,
    scene_id         VARCHAR(255) NOT NULL DEFAULT '',

    -- Scene / level metadata
    scene_name       VARCHAR(255),
    scene_level      INTEGER DEFAULT 1,

    -- Challenge progress
    completed_challenge_ids  JSONB DEFAULT '[]',   -- ["ch_1", "ch_2", ...]
    challenge_scores         JSONB DEFAULT '{}',   -- {"ch_1": 50, "ch_2": 30}
    last_challenge_index     INTEGER DEFAULT 0,    -- index of NEXT challenge to start

    -- Quest progress
    completed_quest_ids JSONB DEFAULT '[]',        -- ["q_1", ...]

    -- Aggregated scores
    total_score     INTEGER DEFAULT 0,
    level           INTEGER DEFAULT 1,
    xp              INTEGER DEFAULT 0,
    hearts_scores   JSONB DEFAULT '{}',            -- {H:x, E:x, A:x, R:x, T:x, Si:x, So:x}

    -- Inventory & zones (for full session restore)
    inventory       JSONB DEFAULT '{}',            -- {"item_id": count}
    visited_zones   JSONB DEFAULT '[]',
    unlocked_routes JSONB DEFAULT '[]',

    -- Flexible extra state
    extra_state     JSONB DEFAULT '{}',

    -- Timestamps
    created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- One progress record per player per game per scene
    CONSTRAINT uq_player_game_scene UNIQUE (game_id, wallet_user_id, scene_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pgp_game_wallet
    ON player_game_progress(game_id, wallet_user_id);

CREATE INDEX IF NOT EXISTS idx_pgp_wallet
    ON player_game_progress(wallet_user_id);

CREATE INDEX IF NOT EXISTS idx_pgp_updated
    ON player_game_progress(updated_at DESC);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_pgp_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS pgp_updated_at ON player_game_progress;
CREATE TRIGGER pgp_updated_at
    BEFORE UPDATE ON player_game_progress
    FOR EACH ROW EXECUTE FUNCTION update_pgp_updated_at();

-- Comments
COMMENT ON TABLE player_game_progress IS
    'Per-player per-scene checkpoint: completed challenges, scores, quests and full state snapshot for resume-on-return.';
COMMENT ON COLUMN player_game_progress.completed_challenge_ids IS
    'Ordered JSON array of completed challenge IDs ["ch_1","ch_2"]';
COMMENT ON COLUMN player_game_progress.challenge_scores IS
    'Per-challenge score breakdown {"ch_1": 50, "ch_2": 30}';
COMMENT ON COLUMN player_game_progress.last_challenge_index IS
    '0-based index of the NEXT challenge the player should start (= len(completed_challenge_ids))';
COMMENT ON COLUMN player_game_progress.extra_state IS
    'Arbitrary JSON for future state: active_quests, objective_progress, etc.';