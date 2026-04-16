-- Migration: Create game_scores table for storing player scores
-- Date: 2026-03-05

CREATE TABLE IF NOT EXISTS game_scores (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(36) NOT NULL,
    player_id VARCHAR(255) NOT NULL,
    player_name VARCHAR(255),
    
    -- Score data
    total_score INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    hearts_scores JSONB,  -- {H: 5, E: 3, A: 2, R: 4, T: 1, Si: 0, So: 2}
    challenges_completed INTEGER DEFAULT 0,
    quests_completed INTEGER DEFAULT 0,
    
    -- Context
    scene_id VARCHAR(36),
    scene_name VARCHAR(255),
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_score_game_player ON game_scores(game_id, player_id);
CREATE INDEX IF NOT EXISTS idx_score_game_total ON game_scores(game_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_score_created ON game_scores(created_at DESC);

-- Comments
COMMENT ON TABLE game_scores IS 'Stores individual game score submissions from players';
COMMENT ON COLUMN game_scores.hearts_scores IS 'HEARTS personality scores as JSON: {H, E, A, R, T, Si, So}';
