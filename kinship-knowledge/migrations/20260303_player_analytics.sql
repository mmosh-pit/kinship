-- ═══════════════════════════════════════════════════════════════════════════
-- KINSHIP PHASE 0: Player Analytics Migration
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Tables:
--   1. player_sessions     — Track game sessions (start, end, duration)
--   2. player_events       — Track all player actions (scene_enter, challenge_complete, etc.)
--   3. player_game_progress — Track per-game progress (HEARTS, inventory, completed items)
--
-- Run: psql -d kinship_backend -f migrations/20260303_player_analytics.sql
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Player Sessions
-- ─────────────────────────────────────────────
-- Tracks individual play sessions for a player in a specific game

CREATE TABLE IF NOT EXISTS player_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who & Where
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_id VARCHAR(255) NOT NULL,
    platform_id VARCHAR(255),
    
    -- Session timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    duration_seconds INTEGER,  -- Computed on session end
    
    -- Session metadata
    device_type VARCHAR(50),   -- web, ios, android
    app_version VARCHAR(50),
    
    -- Session summary (populated on end)
    scenes_visited INTEGER DEFAULT 0,
    challenges_attempted INTEGER DEFAULT 0,
    challenges_completed INTEGER DEFAULT 0,
    hearts_earned JSONB DEFAULT '{}',  -- {"H": 10, "E": 5, ...}
    
    -- Indexes
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sessions_player ON player_sessions(player_id);
CREATE INDEX IF NOT EXISTS idx_sessions_game ON player_sessions(game_id);
CREATE INDEX IF NOT EXISTS idx_sessions_started ON player_sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_platform ON player_sessions(platform_id);


-- ─────────────────────────────────────────────
-- 2. Player Events
-- ─────────────────────────────────────────────
-- Tracks all player actions for analytics

CREATE TABLE IF NOT EXISTS player_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    session_id UUID REFERENCES player_sessions(id) ON DELETE CASCADE,
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_id VARCHAR(255) NOT NULL,
    
    -- Event details
    event_type VARCHAR(100) NOT NULL,  -- See event types below
    event_data JSONB DEFAULT '{}',      -- Event-specific payload
    
    -- Location context
    scene_id VARCHAR(255),
    position_x FLOAT,
    position_y FLOAT,
    
    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Event Types:
-- ─────────────
-- session_start       — Player started playing
-- session_end         — Player stopped playing
-- scene_enter         — Player entered a scene
-- scene_exit          — Player left a scene
-- challenge_start     — Player started a challenge
-- challenge_complete  — Player completed a challenge (with result)
-- challenge_fail      — Player failed a challenge
-- challenge_skip      — Player skipped a challenge
-- quest_start         — Player started a quest
-- quest_complete      — Player completed a quest
-- quest_abandon       — Player abandoned a quest
-- collectible_pickup  — Player picked up an item
-- npc_interact        — Player interacted with NPC
-- dialogue_choice     — Player made dialogue choice
-- route_transition    — Player moved to another scene
-- hearts_change       — HEARTS score changed
-- inventory_change    — Inventory changed
-- achievement_unlock  — Player unlocked achievement/badge

CREATE INDEX IF NOT EXISTS idx_events_session ON player_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_player ON player_events(player_id);
CREATE INDEX IF NOT EXISTS idx_events_game ON player_events(game_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON player_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_scene ON player_events(scene_id);
CREATE INDEX IF NOT EXISTS idx_events_created ON player_events(created_at);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_events_game_type_created 
    ON player_events(game_id, event_type, created_at);


-- ─────────────────────────────────────────────
-- 3. Player Game Progress
-- ─────────────────────────────────────────────
-- Tracks per-game progress (separate from global player_profiles)

CREATE TABLE IF NOT EXISTS player_game_progress (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Who & Where
    player_id UUID NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
    game_id VARCHAR(255) NOT NULL,
    
    -- Progress state
    current_scene_id VARCHAR(255),
    spawn_position JSONB DEFAULT '{"x": 0, "y": 0}',
    
    -- HEARTS scores (per-game, not global)
    hearts_scores JSONB DEFAULT '{"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50}',
    
    -- Completion tracking
    completed_challenges JSONB DEFAULT '[]',  -- ["challenge_id_1", ...]
    completed_quests JSONB DEFAULT '[]',       -- ["quest_id_1", ...]
    unlocked_routes JSONB DEFAULT '[]',        -- ["route_id_1", ...]
    discovered_scenes JSONB DEFAULT '[]',      -- ["scene_id_1", ...]
    
    -- NPC state
    npc_dialogue_state JSONB DEFAULT '{}',  -- {"npc_id": {"last_node": "...", "flags": {}}}
    met_npcs JSONB DEFAULT '[]',            -- ["npc_id_1", ...]
    
    -- Inventory
    inventory JSONB DEFAULT '[]',  -- [{"item_id": "...", "quantity": 1}, ...]
    
    -- Stats
    total_play_time_seconds INTEGER DEFAULT 0,
    sessions_count INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Unique constraint: one progress record per player per game
    CONSTRAINT unique_player_game UNIQUE (player_id, game_id)
);

CREATE INDEX IF NOT EXISTS idx_progress_player ON player_game_progress(player_id);
CREATE INDEX IF NOT EXISTS idx_progress_game ON player_game_progress(game_id);
CREATE INDEX IF NOT EXISTS idx_progress_last_played ON player_game_progress(last_played_at);


-- ─────────────────────────────────────────────
-- 4. Analytics Summary (Materialized View)
-- ─────────────────────────────────────────────
-- Pre-computed analytics for dashboard performance

CREATE MATERIALIZED VIEW IF NOT EXISTS game_analytics_summary AS
SELECT 
    game_id,
    
    -- Player counts
    COUNT(DISTINCT player_id) AS total_players,
    COUNT(DISTINCT CASE 
        WHEN started_at > NOW() - INTERVAL '7 days' 
        THEN player_id 
    END) AS players_last_7d,
    COUNT(DISTINCT CASE 
        WHEN started_at > NOW() - INTERVAL '30 days' 
        THEN player_id 
    END) AS players_last_30d,
    
    -- Session counts
    COUNT(*) AS total_sessions,
    COUNT(CASE 
        WHEN started_at > NOW() - INTERVAL '7 days' 
        THEN 1 
    END) AS sessions_last_7d,
    
    -- Time stats
    AVG(duration_seconds) AS avg_session_duration,
    SUM(duration_seconds) AS total_play_time,
    
    -- Completion stats
    AVG(scenes_visited) AS avg_scenes_per_session,
    AVG(challenges_completed) AS avg_challenges_per_session,
    
    -- Last updated
    NOW() AS computed_at
    
FROM player_sessions
WHERE ended_at IS NOT NULL
GROUP BY game_id;

-- Create unique index for REFRESH CONCURRENTLY
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_summary_game 
    ON game_analytics_summary(game_id);


-- ─────────────────────────────────────────────
-- 5. Scene Analytics View
-- ─────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS scene_analytics_summary AS
SELECT 
    game_id,
    scene_id,
    
    -- Visit counts
    COUNT(*) FILTER (WHERE event_type = 'scene_enter') AS total_visits,
    COUNT(DISTINCT player_id) FILTER (WHERE event_type = 'scene_enter') AS unique_visitors,
    
    -- Time in scene (from scene_enter to scene_exit pairs)
    -- This is a simplified version; production would need session window functions
    
    -- Challenge stats in this scene
    COUNT(*) FILTER (WHERE event_type = 'challenge_complete') AS challenges_completed,
    COUNT(*) FILTER (WHERE event_type = 'challenge_fail') AS challenges_failed,
    
    -- Collectibles
    COUNT(*) FILTER (WHERE event_type = 'collectible_pickup') AS items_collected,
    
    NOW() AS computed_at
    
FROM player_events
WHERE scene_id IS NOT NULL
GROUP BY game_id, scene_id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_scene_analytics_game_scene 
    ON scene_analytics_summary(game_id, scene_id);


-- ─────────────────────────────────────────────
-- 6. Challenge Analytics View
-- ─────────────────────────────────────────────

CREATE MATERIALIZED VIEW IF NOT EXISTS challenge_analytics_summary AS
SELECT 
    game_id,
    event_data->>'challenge_id' AS challenge_id,
    event_data->>'challenge_name' AS challenge_name,
    
    -- Attempt counts
    COUNT(*) FILTER (WHERE event_type = 'challenge_start') AS total_attempts,
    COUNT(*) FILTER (WHERE event_type = 'challenge_complete') AS completions,
    COUNT(*) FILTER (WHERE event_type = 'challenge_fail') AS failures,
    COUNT(*) FILTER (WHERE event_type = 'challenge_skip') AS skips,
    
    -- Success rate
    ROUND(
        COUNT(*) FILTER (WHERE event_type = 'challenge_complete')::NUMERIC / 
        NULLIF(COUNT(*) FILTER (WHERE event_type IN ('challenge_complete', 'challenge_fail')), 0) * 100,
        1
    ) AS success_rate_pct,
    
    -- Unique players
    COUNT(DISTINCT player_id) AS unique_players,
    
    NOW() AS computed_at
    
FROM player_events
WHERE event_type IN ('challenge_start', 'challenge_complete', 'challenge_fail', 'challenge_skip')
  AND event_data->>'challenge_id' IS NOT NULL
GROUP BY game_id, event_data->>'challenge_id', event_data->>'challenge_name';

CREATE UNIQUE INDEX IF NOT EXISTS idx_challenge_analytics_game_challenge 
    ON challenge_analytics_summary(game_id, challenge_id);


-- ─────────────────────────────────────────────
-- Refresh Function (call periodically via cron)
-- ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_analytics_views()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY game_analytics_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY scene_analytics_summary;
    REFRESH MATERIALIZED VIEW CONCURRENTLY challenge_analytics_summary;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════
-- Done! Run this to verify:
--   SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';
-- ═══════════════════════════════════════════════════════════════════════════
