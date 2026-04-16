-- Wallet-Based Score & Leaderboard Tables Migration
-- Run this migration to add wallet-based scoring support

-- ═══════════════════════════════════════════════════════════════════
--  Wallet Players Table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_players (
    id VARCHAR(36) PRIMARY KEY,
    wallet_address VARCHAR(255) UNIQUE NOT NULL,
    wallet_username VARCHAR(255),
    avatar_url TEXT,
    total_games_played INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    total_achievements INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_player_address ON wallet_players(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wallet_player_username ON wallet_players(wallet_username);


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Game Scores Table (individual score submissions)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_game_scores (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(255) NOT NULL,
    wallet_address VARCHAR(255) NOT NULL,
    wallet_username VARCHAR(255),
    total_score INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    hearts_scores JSONB,
    challenges_completed INTEGER DEFAULT 0,
    quests_completed INTEGER DEFAULT 0,
    collectibles_found INTEGER DEFAULT 0,
    time_played_seconds INTEGER DEFAULT 0,
    scene_id VARCHAR(255),
    scene_name VARCHAR(255),
    extra_data JSONB,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wscore_game_wallet ON wallet_game_scores(game_id, wallet_address);
CREATE INDEX IF NOT EXISTS idx_wscore_game_total ON wallet_game_scores(game_id, total_score);
CREATE INDEX IF NOT EXISTS idx_wscore_created ON wallet_game_scores(created_at);


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Leaderboard Entries Table (aggregated per player per game)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_leaderboard_entries (
    id VARCHAR(36) PRIMARY KEY,
    game_id VARCHAR(255) NOT NULL,
    wallet_address VARCHAR(255) NOT NULL,
    wallet_username VARCHAR(255),
    avatar_url TEXT,
    
    -- Best scores (all-time bests)
    best_total_score INTEGER DEFAULT 0,
    best_level INTEGER DEFAULT 1,
    best_challenges INTEGER DEFAULT 0,
    best_quests INTEGER DEFAULT 0,
    best_collectibles INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0,
    
    -- Period scores
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
    
    CONSTRAINT uq_wallet_leaderboard_entry UNIQUE (game_id, wallet_address)
);

CREATE INDEX IF NOT EXISTS idx_wlb_game ON wallet_leaderboard_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_wlb_wallet ON wallet_leaderboard_entries(wallet_address);
CREATE INDEX IF NOT EXISTS idx_wlb_best_score ON wallet_leaderboard_entries(game_id, best_total_score);
CREATE INDEX IF NOT EXISTS idx_wlb_weekly ON wallet_leaderboard_entries(game_id, score_weekly);


-- ═══════════════════════════════════════════════════════════════════
--  Helpful Views
-- ═══════════════════════════════════════════════════════════════════

-- View: Top players per game (all-time)
CREATE OR REPLACE VIEW v_top_players_alltime AS
SELECT 
    game_id,
    wallet_address,
    wallet_username,
    avatar_url,
    best_total_score as score,
    best_level as level,
    games_played,
    last_played_at,
    RANK() OVER (PARTITION BY game_id ORDER BY best_total_score DESC) as rank
FROM wallet_leaderboard_entries
WHERE best_total_score > 0;

-- View: Top players this week
CREATE OR REPLACE VIEW v_top_players_weekly AS
SELECT 
    game_id,
    wallet_address,
    wallet_username,
    avatar_url,
    score_weekly as score,
    best_level as level,
    games_played,
    last_played_at,
    RANK() OVER (PARTITION BY game_id ORDER BY score_weekly DESC) as rank
FROM wallet_leaderboard_entries
WHERE score_weekly > 0;