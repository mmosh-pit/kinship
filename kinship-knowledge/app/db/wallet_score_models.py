"""
Kinship Wallet-Based Score & Leaderboard Models

Pydantic schemas for wallet-based player scoring.
Uses wallet_user_id as primary identifier and wallet_username for display.

NOTE: This file only contains Pydantic schemas. 
All database operations use raw SQL to match your existing DB schema exactly.
Your DB uses `wallet_address` column, not `wallet_user_id`.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════
#  Enums
# ═══════════════════════════════════════════════════════════════════


class ScoreboardType(str, Enum):
    """Types of scoreboards/leaderboards"""
    TOTAL_SCORE = "total_score"
    CHALLENGES_COMPLETED = "challenges_completed"
    QUESTS_COMPLETED = "quests_completed"
    COLLECTIBLES_FOUND = "collectibles_found"
    TIME_PLAYED = "time_played"
    HEARTS_TOTAL = "hearts_total"
    ACHIEVEMENTS = "achievements"
    LEVEL = "level"
    CUSTOM = "custom"


class TimePeriod(str, Enum):
    """Time periods for leaderboards"""
    ALL_TIME = "all_time"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas - Request Models
# ═══════════════════════════════════════════════════════════════════


class WalletScoreSubmit(BaseModel):
    """Request to submit a game score."""
    game_id: str
    wallet_user_id: str
    wallet_username: str
    total_score: int = 0
    level: int = 1
    hearts_scores: Optional[Dict[str, int]] = None
    challenges_completed: int = 0
    quests_completed: int = 0
    collectibles_found: int = 0
    time_played_seconds: int = 0
    scene_id: Optional[str] = None
    scene_name: Optional[str] = None
    extra_data: Optional[Dict[str, Any]] = None


class WalletPlayerUpdate(BaseModel):
    """Update wallet player profile"""
    wallet_username: Optional[str] = None
    avatar_url: Optional[str] = None


class WalletPlayerCreate(BaseModel):
    """Create or register a wallet player"""
    wallet_user_id: str
    wallet_username: str
    avatar_url: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas - Response Models
# ═══════════════════════════════════════════════════════════════════


class WalletPlayerResponse(BaseModel):
    """Wallet player profile response"""
    id: str
    wallet_user_id: str
    wallet_username: Optional[str]
    avatar_url: Optional[str] = None
    total_games_played: int = 0
    total_score: int = 0
    total_achievements: int = 0
    created_at: datetime
    last_active_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ScoreSubmitResponse(BaseModel):
    """Response after submitting a score"""
    id: str
    game_id: str
    wallet_user_id: str
    wallet_username: str
    total_score: int
    rank: Optional[int] = None
    is_high_score: bool = False
    previous_high_score: Optional[int] = None
    rank_change: Optional[int] = None
    created_at: datetime


class LeaderboardEntryResponse(BaseModel):
    """Single leaderboard entry"""
    rank: int
    wallet_user_id: str
    wallet_username: Optional[str]
    avatar_url: Optional[str] = None
    score: int
    level: int = 1
    games_played: int = 0
    hearts_scores: Optional[Dict[str, int]] = None
    last_played_at: Optional[datetime] = None
    rank_change: Optional[int] = None
    is_current_player: bool = False

    class Config:
        from_attributes = True


class LeaderboardResponse(BaseModel):
    """Full leaderboard response"""
    game_id: str
    scoreboard_type: ScoreboardType
    period: TimePeriod
    total_players: int
    entries: List[LeaderboardEntryResponse]
    last_updated: datetime
    player_entry: Optional[LeaderboardEntryResponse] = None


class ScoreboardResponse(BaseModel):
    """Scoreboard response (player's personal scores)."""
    game_id: str
    wallet_user_id: str
    wallet_username: Optional[str]
    current_score: int
    best_score: int
    level: int = 1
    rank: Optional[int]
    total_players: int
    percentile: Optional[int]
    games_played: int = 0
    hearts_scores: Optional[Dict[str, int]] = None
    challenges_completed: int = 0
    quests_completed: int = 0
    collectibles_found: int = 0
    time_played_seconds: int = 0
    last_played_at: Optional[datetime] = None


class PlayerRankResponse(BaseModel):
    """Player rank on leaderboard"""
    wallet_user_id: str
    wallet_username: Optional[str]
    rank: int
    total_players: int
    score: int
    percentile: int
    period: TimePeriod


class NearbyPlayersResponse(BaseModel):
    """Players ranked near the current player"""
    wallet_user_id: str
    current_rank: int
    entries: List[LeaderboardEntryResponse]
