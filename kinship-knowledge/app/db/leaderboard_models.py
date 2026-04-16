"""
Kinship Leaderboard Models

SQLAlchemy models and Pydantic schemas for the leaderboard system.
"""

from datetime import datetime
from enum import Enum
from typing import Optional, List, Dict, Any
from uuid import uuid4

from sqlalchemy import (
    Column,
    String,
    Integer,
    Float,
    DateTime,
    Boolean,
    ForeignKey,
    JSON,
    Index,
    UniqueConstraint,
    Enum as SQLEnum,
)
from sqlalchemy.orm import relationship
from pydantic import BaseModel, Field

from app.db.database import Base


# ═══════════════════════════════════════════════════════════════════
#  Enums
# ═══════════════════════════════════════════════════════════════════


class LeaderboardType(str, Enum):
    """Types of leaderboards"""

    TOTAL_SCORE = "total_score"
    CHALLENGES_COMPLETED = "challenges_completed"
    QUESTS_COMPLETED = "quests_completed"
    COLLECTIBLES_FOUND = "collectibles_found"
    TIME_PLAYED = "time_played"
    HEARTS_FACET = "hearts_facet"  # Specific HEARTS facet
    HEARTS_TOTAL = "hearts_total"  # Sum of all HEARTS
    ACHIEVEMENTS = "achievements"
    CUSTOM = "custom"


class LeaderboardPeriod(str, Enum):
    """Time periods for leaderboards"""

    ALL_TIME = "all_time"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class LeaderboardScope(str, Enum):
    """Scope of leaderboard visibility"""

    GLOBAL = "global"  # All players
    FRIENDS = "friends"  # Friends only (future)
    CLASSROOM = "classroom"  # Educational group (future)


# ═══════════════════════════════════════════════════════════════════
#  SQLAlchemy Models
# ═══════════════════════════════════════════════════════════════════


class LeaderboardConfig(Base):
    """
    Configuration for a leaderboard in a game.
    Each game can have multiple leaderboards.
    """

    __tablename__ = "leaderboard_configs"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    game_id = Column(String, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)

    # Leaderboard settings
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    leaderboard_type = Column(
        SQLEnum(LeaderboardType), nullable=False, default=LeaderboardType.TOTAL_SCORE
    )

    # For HEARTS_FACET type, which facet to track
    hearts_facet = Column(String, nullable=True)  # H, E, A, R, T, Si, So

    # For CUSTOM type, the custom metric key
    custom_metric_key = Column(String, nullable=True)

    # Display settings
    is_enabled = Column(Boolean, default=True)
    is_public = Column(Boolean, default=True)  # Visible to players
    show_rank = Column(Boolean, default=True)
    show_score = Column(Boolean, default=True)
    max_entries_displayed = Column(Integer, default=100)

    # Scoring
    sort_ascending = Column(Boolean, default=False)  # False = higher is better
    score_precision = Column(Integer, default=0)  # Decimal places

    # Time periods enabled
    enable_all_time = Column(Boolean, default=True)
    enable_daily = Column(Boolean, default=False)
    enable_weekly = Column(Boolean, default=True)
    enable_monthly = Column(Boolean, default=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    entries = relationship(
        "LeaderboardEntry", back_populates="leaderboard", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_leaderboard_game", "game_id"),)


class LeaderboardEntry(Base):
    """
    A player's entry on a leaderboard.
    Tracks scores for different time periods.
    """

    __tablename__ = "leaderboard_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    leaderboard_id = Column(
        String, ForeignKey("leaderboard_configs.id", ondelete="CASCADE"), nullable=False
    )
    player_id = Column(String, nullable=False)

    # Player display info (cached for performance)
    player_name = Column(String, nullable=True)
    player_avatar_url = Column(String, nullable=True)

    # Scores by period
    score_all_time = Column(Float, default=0)
    score_daily = Column(Float, default=0)
    score_weekly = Column(Float, default=0)
    score_monthly = Column(Float, default=0)

    # Period reset tracking
    daily_reset_at = Column(DateTime, nullable=True)
    weekly_reset_at = Column(DateTime, nullable=True)
    monthly_reset_at = Column(DateTime, nullable=True)

    # Additional stats
    games_played = Column(Integer, default=0)
    best_score = Column(Float, default=0)
    last_score = Column(Float, default=0)

    # Metadata
    extra_data = Column(JSON, nullable=True)  # Custom data

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_played_at = Column(DateTime, nullable=True)

    # Relationships
    leaderboard = relationship("LeaderboardConfig", back_populates="entries")

    __table_args__ = (
        UniqueConstraint("leaderboard_id", "player_id", name="uq_leaderboard_player"),
        Index("idx_entry_leaderboard", "leaderboard_id"),
        Index("idx_entry_player", "player_id"),
        Index("idx_entry_score_all_time", "leaderboard_id", "score_all_time"),
        Index("idx_entry_score_weekly", "leaderboard_id", "score_weekly"),
    )


class LeaderboardSnapshot(Base):
    """
    Historical snapshots of leaderboard standings.
    Used for tracking rank changes over time.
    """

    __tablename__ = "leaderboard_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    leaderboard_id = Column(
        String, ForeignKey("leaderboard_configs.id", ondelete="CASCADE"), nullable=False
    )
    period = Column(SQLEnum(LeaderboardPeriod), nullable=False)

    # Snapshot data
    snapshot_date = Column(DateTime, nullable=False)
    top_entries = Column(JSON, nullable=False)  # Top N entries at snapshot time
    total_players = Column(Integer, default=0)

    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_snapshot_leaderboard_date", "leaderboard_id", "snapshot_date"),
    )


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════


class LeaderboardConfigCreate(BaseModel):
    """Schema for creating a leaderboard"""

    name: str
    description: Optional[str] = None
    leaderboard_type: LeaderboardType = LeaderboardType.TOTAL_SCORE
    hearts_facet: Optional[str] = None
    custom_metric_key: Optional[str] = None
    is_enabled: bool = True
    is_public: bool = True
    show_rank: bool = True
    show_score: bool = True
    max_entries_displayed: int = 100
    sort_ascending: bool = False
    score_precision: int = 0
    enable_all_time: bool = True
    enable_daily: bool = False
    enable_weekly: bool = True
    enable_monthly: bool = True


class LeaderboardConfigUpdate(BaseModel):
    """Schema for updating a leaderboard"""

    name: Optional[str] = None
    description: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_public: Optional[bool] = None
    show_rank: Optional[bool] = None
    show_score: Optional[bool] = None
    max_entries_displayed: Optional[int] = None
    enable_all_time: Optional[bool] = None
    enable_daily: Optional[bool] = None
    enable_weekly: Optional[bool] = None
    enable_monthly: Optional[bool] = None


class LeaderboardConfigResponse(BaseModel):
    """Schema for leaderboard config response"""

    id: str
    game_id: str
    name: str
    description: Optional[str]
    leaderboard_type: LeaderboardType
    hearts_facet: Optional[str]
    custom_metric_key: Optional[str]
    is_enabled: bool
    is_public: bool
    show_rank: bool
    show_score: bool
    max_entries_displayed: int
    sort_ascending: bool
    score_precision: int
    enable_all_time: bool
    enable_daily: bool
    enable_weekly: bool
    enable_monthly: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class LeaderboardEntryResponse(BaseModel):
    """Schema for a leaderboard entry"""

    rank: int
    player_id: str
    player_name: Optional[str]
    player_avatar_url: Optional[str]
    score: float
    games_played: int
    best_score: float
    last_played_at: Optional[datetime]
    rank_change: Optional[int] = None  # +/- from previous period
    extra_data: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class LeaderboardResponse(BaseModel):
    """Schema for full leaderboard response"""

    leaderboard_id: str
    name: str
    leaderboard_type: LeaderboardType
    period: LeaderboardPeriod
    total_players: int
    entries: List[LeaderboardEntryResponse]
    last_updated: datetime
    player_entry: Optional[LeaderboardEntryResponse] = None  # Requesting player's entry


class ScoreSubmission(BaseModel):
    """Schema for submitting a score"""

    player_id: str
    player_name: Optional[str] = None
    score: float
    extra_data: Optional[Dict[str, Any]] = None


class ScoreUpdateResponse(BaseModel):
    """Response after updating a score"""

    leaderboard_id: str
    player_id: str
    new_score: float
    previous_score: float
    new_rank: int
    previous_rank: Optional[int]
    is_personal_best: bool
    rank_change: int


class PlayerLeaderboardSummary(BaseModel):
    """Summary of a player's standings across leaderboards"""

    player_id: str
    player_name: Optional[str]
    leaderboards: List[Dict[str, Any]]  # [{leaderboard_id, name, rank, score, period}]
    total_points: float
    best_rank: int
    total_leaderboards: int
