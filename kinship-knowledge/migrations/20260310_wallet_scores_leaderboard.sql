-- Migration: Wallet-Based Score & Leaderboard System
-- Date: 2026-03-10
-- Description: Creates tables for wallet-based player scoring with:
--   - wallet_user_id: Unique wallet identifier (primary key for lookups)
--   - wallet_username: Display name
--   - game_id: Game identifier
--
-- Tables:
--   1. wallet_players - Player profiles linked to wallets
--   2. wallet_game_scores - Individual score submissions
--   3. wallet_leaderboard_entries - Aggregated best scores per player per game

-- ═══════════════════════════════════════════════════════════════════
--  Wallet Players (Player Profiles)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_players (
    id VARCHAR(36) PRIMARY KEY,
    
    -- Wallet identification (THE key identifiers)
    wallet_user_id VARCHAR(255) UNIQUE NOT NULL,
    wallet_username VARCHAR(255),
    
    avatar_url TEXT,
    
    -- Stats aggregated across all games
    total_games_played INTEGER DEFAULT 0,
    total_score BIGINT DEFAULT 0,
    total_achievements INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_player_user_id ON wallet_players(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_player_username ON wallet_players(wallet_username);

COMMENT ON TABLE wallet_players IS 'Player profiles linked to wallet identifiers';
COMMENT ON COLUMN wallet_players.wallet_user_id IS 'Unique wallet identifier (0x... or other format)';
COMMENT ON COLUMN wallet_players.wallet_username IS 'Display name for the player';


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Game Scores (Individual Submissions)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_game_scores (
    id VARCHAR(36) PRIMARY KEY,
    
    -- THE THREE KEY IDENTIFIERS
    game_id VARCHAR(36) NOT NULL,
    wallet_user_id VARCHAR(255) NOT NULL,
    wallet_username VARCHAR(255),
    
    -- Score data
    total_score INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    hearts_scores JSONB,  -- {H: x, E: x, A: x, R: x, T: x, So: x, Si: x}
    challenges_completed INTEGER DEFAULT 0,
    quests_completed INTEGER DEFAULT 0,
    collectibles_found INTEGER DEFAULT 0,
    time_played_seconds INTEGER DEFAULT 0,
    
    -- Context
    scene_id VARCHAR(36),
    scene_name VARCHAR(255),
    
    -- Extra metadata
    extra_data JSONB,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wscore_game_wallet ON wallet_game_scores(game_id, wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wscore_game_total ON wallet_game_scores(game_id, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_wscore_wallet ON wallet_game_scores(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wscore_created ON wallet_game_scores(created_at DESC);

COMMENT ON TABLE wallet_game_scores IS 'Individual game score submissions from wallet players';
COMMENT ON COLUMN wallet_game_scores.game_id IS 'Game/scene identifier';
COMMENT ON COLUMN wallet_game_scores.wallet_user_id IS 'Unique wallet identifier';
COMMENT ON COLUMN wallet_game_scores.wallet_username IS 'Display name at time of submission';
COMMENT ON COLUMN wallet_game_scores.hearts_scores IS 'HEARTS personality scores: {H, E, A, R, T, So, Si}';


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Leaderboard Entries (Aggregated Best Scores)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_leaderboard_entries (
    id VARCHAR(36) PRIMARY KEY,
    
    -- THE THREE KEY IDENTIFIERS
    game_id VARCHAR(36) NOT NULL,
    wallet_user_id VARCHAR(255) NOT NULL,
    wallet_username VARCHAR(255),
    
    avatar_url TEXT,
    
    -- Best scores (all-time bests)
    best_total_score INTEGER DEFAULT 0,
    best_level INTEGER DEFAULT 1,
    best_challenges INTEGER DEFAULT 0,
    best_quests INTEGER DEFAULT 0,
    best_collectibles INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0,  -- cumulative seconds
    
    -- HEARTS scores (best achieved)
    best_hearts_scores JSONB,  -- {H: x, E: x, A: x, R: x, T: x, So: x, Si: x}
    
    -- Period scores (for daily/weekly/monthly leaderboards)
    score_daily INTEGER DEFAULT 0,
    score_weekly INTEGER DEFAULT 0,
    score_monthly INTEGER DEFAULT 0,
    
    -- Period reset tracking
    daily_reset_at TIMESTAMP,
    weekly_reset_at TIMESTAMP,
    monthly_reset_at TIMESTAMP,
    
    -- Stats
    games_played INTEGER DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_played_at TIMESTAMP,
    
    -- Unique constraint: one entry per wallet per game
    CONSTRAINT uq_wallet_leaderboard_entry UNIQUE (game_id, wallet_user_id)
);

CREATE INDEX IF NOT EXISTS idx_wlb_game ON wallet_leaderboard_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_wlb_wallet ON wallet_leaderboard_entries(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wlb_best_score ON wallet_leaderboard_entries(game_id, best_total_score DESC);
CREATE INDEX IF NOT EXISTS idx_wlb_weekly ON wallet_leaderboard_entries(game_id, score_weekly DESC);
CREATE INDEX IF NOT EXISTS idx_wlb_monthly ON wallet_leaderboard_entries(game_id, score_monthly DESC);
CREATE INDEX IF NOT EXISTS idx_wlb_daily ON wallet_leaderboard_entries(game_id, score_daily DESC);
CREATE INDEX IF NOT EXISTS idx_wlb_level ON wallet_leaderboard_entries(game_id, best_level DESC);
CREATE INDEX IF NOT EXISTS idx_wlb_challenges ON wallet_leaderboard_entries(game_id, best_challenges DESC);

COMMENT ON TABLE wallet_leaderboard_entries IS 'Aggregated best scores per wallet player per game for leaderboard rankings';
COMMENT ON COLUMN wallet_leaderboard_entries.game_id IS 'Game identifier';
COMMENT ON COLUMN wallet_leaderboard_entries.wallet_user_id IS 'Unique wallet identifier';
COMMENT ON COLUMN wallet_leaderboard_entries.wallet_username IS 'Current display name (updated on score submission)';
COMMENT ON COLUMN wallet_leaderboard_entries.best_total_score IS 'All-time best total score';
COMMENT ON COLUMN wallet_leaderboard_entries.score_daily IS 'Cumulative score for current day';
COMMENT ON COLUMN wallet_leaderboard_entries.score_weekly IS 'Cumulative score for current week';
COMMENT ON COLUMN wallet_leaderboard_entries.score_monthly IS 'Cumulative score for current month';


-- ═══════════════════════════════════════════════════════════════════
--  Helper Functions
-- ═══════════════════════════════════════════════════════════════════

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_wallet_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS wallet_players_updated_at ON wallet_players;
CREATE TRIGGER wallet_players_updated_at
    BEFORE UPDATE ON wallet_players
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();

DROP TRIGGER IF EXISTS wallet_leaderboard_entries_updated_at ON wallet_leaderboard_entries;
CREATE TRIGGER wallet_leaderboard_entries_updated_at
    BEFORE UPDATE ON wallet_leaderboard_entries
    FOR EACH ROW EXECUTE FUNCTION update_wallet_updated_at();
