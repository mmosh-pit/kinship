"""
Kinship Achievement Models - SQLAlchemy models and Pydantic schemas
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
from pydantic import BaseModel

from app.db.database import Base


# ═══════════════════════════════════════════════════════════════════
#  Enums
# ═══════════════════════════════════════════════════════════════════


class AchievementTier(str, Enum):
    BRONZE = "bronze"
    SILVER = "silver"
    GOLD = "gold"
    DIAMOND = "diamond"
    SPECIAL = "special"


class AchievementType(str, Enum):
    PROGRESS = "progress"
    MILESTONE = "milestone"
    COLLECTION = "collection"
    STREAK = "streak"
    SPEED = "speed"
    SECRET = "secret"
    HEARTS = "hearts"
    CUSTOM = "custom"


class TriggerEvent(str, Enum):
    CHALLENGE_COMPLETE = "challenge_complete"
    CHALLENGE_FAIL = "challenge_fail"
    QUEST_COMPLETE = "quest_complete"
    QUEST_START = "quest_start"
    SCENE_ENTER = "scene_enter"
    COLLECTIBLE_PICKUP = "collectible_pickup"
    NPC_INTERACT = "npc_interact"
    HEARTS_CHANGE = "hearts_change"
    SESSION_START = "session_start"
    GAME_COMPLETE = "game_complete"
    DAILY_LOGIN = "daily_login"
    SCORE_UPDATE = "score_update"
    CUSTOM = "custom"


# ═══════════════════════════════════════════════════════════════════
#  SQLAlchemy Models
# ═══════════════════════════════════════════════════════════════════


class Achievement(Base):
    __tablename__ = "achievements"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    game_id = Column(String, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    description = Column(String, nullable=False)
    hint = Column(String, nullable=True)
    icon = Column(String, default="🏅")
    tier = Column(SQLEnum(AchievementTier), default=AchievementTier.BRONZE)
    achievement_type = Column(
        SQLEnum(AchievementType), default=AchievementType.PROGRESS
    )
    category = Column(String, nullable=True)
    sort_order = Column(Integer, default=0)
    is_enabled = Column(Boolean, default=True)
    is_secret = Column(Boolean, default=False)
    xp_reward = Column(Integer, default=0)
    points_reward = Column(Integer, default=0)
    trigger_event = Column(SQLEnum(TriggerEvent), default=TriggerEvent.CUSTOM)
    trigger_conditions = Column(JSON, nullable=True)
    requires_progress = Column(Boolean, default=False)
    progress_max = Column(Integer, default=1)
    progress_unit = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    unlocks = relationship(
        "PlayerAchievement", back_populates="achievement", cascade="all, delete-orphan"
    )

    __table_args__ = (Index("idx_achievement_game", "game_id"),)


class PlayerAchievement(Base):
    __tablename__ = "player_achievements"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    achievement_id = Column(
        String, ForeignKey("achievements.id", ondelete="CASCADE"), nullable=False
    )
    player_id = Column(String, nullable=False)
    game_id = Column(String, ForeignKey("games.id", ondelete="CASCADE"), nullable=False)
    is_unlocked = Column(Boolean, default=False)
    unlocked_at = Column(DateTime, nullable=True)
    progress_current = Column(Integer, default=0)
    progress_data = Column(JSON, nullable=True)
    notification_seen = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    achievement = relationship("Achievement", back_populates="unlocks")

    __table_args__ = (
        UniqueConstraint("achievement_id", "player_id", name="uq_player_achievement"),
        Index("idx_player_achievement_player", "player_id"),
    )


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════


class AchievementCreate(BaseModel):
    name: str
    description: str
    hint: Optional[str] = None
    icon: str = "🏅"
    tier: AchievementTier = AchievementTier.BRONZE
    achievement_type: AchievementType = AchievementType.PROGRESS
    category: Optional[str] = None
    sort_order: int = 0
    is_enabled: bool = True
    is_secret: bool = False
    xp_reward: int = 0
    points_reward: int = 0
    trigger_event: TriggerEvent = TriggerEvent.CUSTOM
    trigger_conditions: Optional[Dict[str, Any]] = None
    requires_progress: bool = False
    progress_max: int = 1
    progress_unit: Optional[str] = None


class AchievementUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    hint: Optional[str] = None
    icon: Optional[str] = None
    tier: Optional[AchievementTier] = None
    category: Optional[str] = None
    is_enabled: Optional[bool] = None
    is_secret: Optional[bool] = None
    xp_reward: Optional[int] = None
    points_reward: Optional[int] = None
    trigger_event: Optional[TriggerEvent] = None
    trigger_conditions: Optional[Dict[str, Any]] = None
    requires_progress: Optional[bool] = None
    progress_max: Optional[int] = None


class AchievementResponse(BaseModel):
    id: str
    game_id: str
    name: str
    description: str
    hint: Optional[str]
    icon: str
    tier: AchievementTier
    achievement_type: AchievementType
    category: Optional[str]
    is_enabled: bool
    is_secret: bool
    xp_reward: int
    points_reward: int
    trigger_event: TriggerEvent
    trigger_conditions: Optional[Dict[str, Any]]
    requires_progress: bool
    progress_max: int
    progress_unit: Optional[str]
    unlock_count: Optional[int] = None
    unlock_percentage: Optional[float] = None

    class Config:
        from_attributes = True


class PlayerAchievementResponse(BaseModel):
    achievement_id: str
    player_id: str
    is_unlocked: bool
    unlocked_at: Optional[datetime]
    progress_current: int
    progress_max: int
    progress_percentage: float
    achievement: AchievementResponse

    class Config:
        from_attributes = True


class PlayerAchievementSummary(BaseModel):
    player_id: str
    game_id: str
    total_achievements: int
    unlocked_count: int
    unlock_percentage: float
    total_xp_earned: int
    by_tier: Dict[str, int]
    recent_unlocks: List[PlayerAchievementResponse]
    in_progress: List[PlayerAchievementResponse]


class UnlockResult(BaseModel):
    achievement_id: str
    player_id: str
    was_already_unlocked: bool
    newly_unlocked: bool
    xp_earned: int
    achievement: AchievementResponse


class ProgressUpdate(BaseModel):
    player_id: str
    increment: int = 1
    set_value: Optional[int] = None


class ProgressResult(BaseModel):
    achievement_id: str
    player_id: str
    previous_progress: int
    new_progress: int
    progress_max: int
    newly_unlocked: bool
    unlock_result: Optional[UnlockResult] = None


class TriggerCheckRequest(BaseModel):
    player_id: str
    game_id: str
    event: TriggerEvent
    event_data: Optional[Dict[str, Any]] = None


class TriggerCheckResult(BaseModel):
    player_id: str
    event: TriggerEvent
    achievements_unlocked: List[UnlockResult]
    progress_updated: List[ProgressResult]


TIER_META = {
    AchievementTier.BRONZE: {"label": "Bronze", "icon": "🥉", "color": "#CD7F32"},
    AchievementTier.SILVER: {"label": "Silver", "icon": "🥈", "color": "#C0C0C0"},
    AchievementTier.GOLD: {"label": "Gold", "icon": "🥇", "color": "#FFD700"},
    AchievementTier.DIAMOND: {"label": "Diamond", "icon": "💎", "color": "#B9F2FF"},
    AchievementTier.SPECIAL: {"label": "Special", "icon": "🌟", "color": "#FF69B4"},
}

TYPE_META = {
    AchievementType.PROGRESS: {"label": "Progress", "icon": "📊"},
    AchievementType.MILESTONE: {"label": "Milestone", "icon": "🎯"},
    AchievementType.COLLECTION: {"label": "Collection", "icon": "💎"},
    AchievementType.STREAK: {"label": "Streak", "icon": "🔥"},
    AchievementType.SPEED: {"label": "Speed", "icon": "⚡"},
    AchievementType.SECRET: {"label": "Secret", "icon": "🔒"},
    AchievementType.HEARTS: {"label": "HEARTS", "icon": "❤️"},
    AchievementType.CUSTOM: {"label": "Custom", "icon": "⭐"},
}
