-- Wallet-Based Score & Leaderboard Tables Migration (v2)
-- Updated to use wallet_user_id instead of wallet_address
-- Run this migration to add wallet-based scoring support
-- 
-- KEY IDENTIFIERS FOR ALL TABLES:
-- - wallet_user_id: Unique wallet identifier
-- - wallet_username: Display name
-- - game_id: Game identifier

-- ═══════════════════════════════════════════════════════════════════
--  Drop old tables if migrating from wallet_address schema
-- ═══════════════════════════════════════════════════════════════════

-- Uncomment these if you need to migrate from the old schema:
-- DROP TABLE IF EXISTS wallet_game_scores CASCADE;
-- DROP TABLE IF EXISTS wallet_leaderboard_entries CASCADE;
-- DROP TABLE IF EXISTS wallet_players CASCADE;
-- DROP VIEW IF EXISTS v_top_players_alltime;
-- DROP VIEW IF EXISTS v_top_players_weekly;


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Players Table
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_players (
    id VARCHAR(36) PRIMARY KEY,
    
    -- THE KEY IDENTIFIERS
    wallet_user_id VARCHAR(255) UNIQUE NOT NULL,  -- Unique wallet identifier
    wallet_username VARCHAR(255),                  -- Display name
    
    avatar_url TEXT,
    total_games_played INTEGER DEFAULT 0,
    total_score INTEGER DEFAULT 0,
    total_achievements INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wallet_player_user_id ON wallet_players(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_player_username ON wallet_players(wallet_username);


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Game Scores Table (individual score submissions)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_game_scores (
    id VARCHAR(36) PRIMARY KEY,
    
    -- THE THREE KEY IDENTIFIERS
    game_id VARCHAR(255) NOT NULL,
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
    scene_id VARCHAR(255),
    scene_name VARCHAR(255),
    
    -- Extra metadata
    extra_data JSONB,
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_wscore_game_wallet ON wallet_game_scores(game_id, wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wscore_game_total ON wallet_game_scores(game_id, total_score);
CREATE INDEX IF NOT EXISTS idx_wscore_created ON wallet_game_scores(created_at);


-- ═══════════════════════════════════════════════════════════════════
--  Wallet Leaderboard Entries Table (aggregated per player per game)
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wallet_leaderboard_entries (
    id VARCHAR(36) PRIMARY KEY,
    
    -- THE THREE KEY IDENTIFIERS
    game_id VARCHAR(255) NOT NULL,
    wallet_user_id VARCHAR(255) NOT NULL,
    wallet_username VARCHAR(255),
    
    avatar_url TEXT,
    
    -- Best scores (all-time bests)
    best_total_score INTEGER DEFAULT 0,
    best_level INTEGER DEFAULT 1,
    best_challenges INTEGER DEFAULT 0,
    best_quests INTEGER DEFAULT 0,
    best_collectibles INTEGER DEFAULT 0,
    total_time_played INTEGER DEFAULT 0,
    
    -- Best HEARTS scores
    best_hearts_scores JSONB,  -- {H: x, E: x, A: x, R: x, T: x, So: x, Si: x}
    
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
    
    CONSTRAINT uq_wallet_leaderboard_entry UNIQUE (game_id, wallet_user_id)
);

CREATE INDEX IF NOT EXISTS idx_wlb_game ON wallet_leaderboard_entries(game_id);
CREATE INDEX IF NOT EXISTS idx_wlb_wallet ON wallet_leaderboard_entries(wallet_user_id);
CREATE INDEX IF NOT EXISTS idx_wlb_best_score ON wallet_leaderboard_entries(game_id, best_total_score);
CREATE INDEX IF NOT EXISTS idx_wlb_weekly ON wallet_leaderboard_entries(game_id, score_weekly);


-- ═══════════════════════════════════════════════════════════════════
--  Helpful Views
-- ═══════════════════════════════════════════════════════════════════

-- View: Top players per game (all-time)
CREATE OR REPLACE VIEW v_top_players_alltime AS
SELECT 
    game_id,
    wallet_user_id,
    wallet_username,
    avatar_url,
    best_total_score as score,
    best_level as level,
    games_played,
    last_played_at,
    best_hearts_scores,
    RANK() OVER (PARTITION BY game_id ORDER BY best_total_score DESC) as rank
FROM wallet_leaderboard_entries
WHERE best_total_score > 0;

-- View: Top players this week
CREATE OR REPLACE VIEW v_top_players_weekly AS
SELECT 
    game_id,
    wallet_user_id,
    wallet_username,
    avatar_url,
    score_weekly as score,
    best_level as level,
    games_played,
    last_played_at,
    best_hearts_scores,
    RANK() OVER (PARTITION BY game_id ORDER BY score_weekly DESC) as rank
FROM wallet_leaderboard_entries
WHERE score_weekly > 0;

-- View: Top players today
CREATE OR REPLACE VIEW v_top_players_daily AS
SELECT 
    game_id,
    wallet_user_id,
    wallet_username,
    avatar_url,
    score_daily as score,
    best_level as level,
    games_played,
    last_played_at,
    best_hearts_scores,
    RANK() OVER (PARTITION BY game_id ORDER BY score_daily DESC) as rank
FROM wallet_leaderboard_entries
WHERE score_daily > 0;


-- ═══════════════════════════════════════════════════════════════════
--  Migration from old schema (wallet_address -> wallet_user_id)
-- ═══════════════════════════════════════════════════════════════════

-- If you have existing data with wallet_address, run these to migrate:

-- 1. Add new columns if they don't exist
-- ALTER TABLE wallet_players ADD COLUMN IF NOT EXISTS wallet_user_id VARCHAR(255);
-- ALTER TABLE wallet_game_scores ADD COLUMN IF NOT EXISTS wallet_user_id VARCHAR(255);
-- ALTER TABLE wallet_leaderboard_entries ADD COLUMN IF NOT EXISTS wallet_user_id VARCHAR(255);

-- 2. Copy data from wallet_address to wallet_user_id
-- UPDATE wallet_players SET wallet_user_id = wallet_address WHERE wallet_user_id IS NULL;
-- UPDATE wallet_game_scores SET wallet_user_id = wallet_address WHERE wallet_user_id IS NULL;
-- UPDATE wallet_leaderboard_entries SET wallet_user_id = wallet_address WHERE wallet_user_id IS NULL;

-- 3. Add constraints
-- ALTER TABLE wallet_players ALTER COLUMN wallet_user_id SET NOT NULL;
-- ALTER TABLE wallet_game_scores ALTER COLUMN wallet_user_id SET NOT NULL;
-- ALTER TABLE wallet_leaderboard_entries ALTER COLUMN wallet_user_id SET NOT NULL;

-- 4. Drop old columns (only after verifying migration)
-- ALTER TABLE wallet_players DROP COLUMN IF EXISTS wallet_address;
-- ALTER TABLE wallet_game_scores DROP COLUMN IF EXISTS wallet_address;
-- ALTER TABLE wallet_leaderboard_entries DROP COLUMN IF EXISTS wallet_address;
