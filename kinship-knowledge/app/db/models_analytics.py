"""SQLAlchemy ORM models for Player Analytics — Phase 0.

Tables:
  - PlayerSession: Track individual play sessions
  - PlayerEvent: Track all player actions
  - PlayerGameProgress: Track per-game progress

Add this to existing models.py or import from here.
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    DateTime,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def new_uuid() -> uuid.UUID:
    return uuid.uuid4()


# ──────────────────────────────────────────────
# Player Sessions
# ──────────────────────────────────────────────
class PlayerSession(Base):
    """Track individual play sessions for analytics."""

    __tablename__ = "player_sessions"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )

    # Who & Where
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    platform_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)

    # Session timing
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
    ended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    duration_seconds: Mapped[Optional[int]] = mapped_column(Integer)

    # Session metadata
    device_type: Mapped[Optional[str]] = mapped_column(String(50))  # web, ios, android
    app_version: Mapped[Optional[str]] = mapped_column(String(50))

    # Session summary (populated on end)
    scenes_visited: Mapped[int] = mapped_column(Integer, default=0)
    challenges_attempted: Mapped[int] = mapped_column(Integer, default=0)
    challenges_completed: Mapped[int] = mapped_column(Integer, default=0)
    hearts_earned: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {"H": 10, "E": 5}

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    # Relationships
    player = relationship("PlayerProfile", lazy="selectin")
    events = relationship("PlayerEvent", back_populates="session", lazy="selectin")

    __table_args__ = (
        Index("idx_sessions_player", "player_id"),
        Index("idx_sessions_started", "started_at"),
    )


# ──────────────────────────────────────────────
# Player Events
# ──────────────────────────────────────────────
class PlayerEvent(Base):
    """Track all player actions for analytics.

    Event Types:
    - session_start / session_end
    - scene_enter / scene_exit
    - challenge_start / challenge_complete / challenge_fail / challenge_skip
    - quest_start / quest_complete / quest_abandon
    - collectible_pickup
    - npc_interact
    - dialogue_choice
    - route_transition
    - hearts_change
    - inventory_change
    - achievement_unlock
    """

    __tablename__ = "player_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )

    # Context
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_sessions.id", ondelete="CASCADE"),
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Event details
    event_type: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    event_data: Mapped[dict] = mapped_column(JSONB, default=dict)

    # Location context
    scene_id: Mapped[Optional[str]] = mapped_column(String(255), index=True)
    position_x: Mapped[Optional[float]] = mapped_column(Float)
    position_y: Mapped[Optional[float]] = mapped_column(Float)

    # Timing
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )

    # Relationships
    session = relationship("PlayerSession", back_populates="events")
    player = relationship("PlayerProfile", lazy="selectin")

    __table_args__ = (
        Index("idx_events_session", "session_id"),
        Index("idx_events_player", "player_id"),
        Index("idx_events_game_type_created", "game_id", "event_type", "created_at"),
    )


# ──────────────────────────────────────────────
# Player Game Progress
# ──────────────────────────────────────────────
class PlayerGameProgress(Base):
    """Track per-game progress (separate from global player_profiles).

    This allows players to have different progress in different games,
    with per-game HEARTS scores, inventory, and completion state.
    """

    __tablename__ = "player_game_progress"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )

    # Who & Where
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    game_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # Progress state
    current_scene_id: Mapped[Optional[str]] = mapped_column(String(255))
    spawn_position: Mapped[dict] = mapped_column(
        JSONB, default=lambda: {"x": 0, "y": 0}
    )

    # HEARTS scores (per-game)
    hearts_scores: Mapped[dict] = mapped_column(
        JSONB,
        default=lambda: {
            "H": 50,
            "E": 50,
            "A": 50,
            "R": 50,
            "T": 50,
            "Si": 50,
            "So": 50,
        },
    )

    # Completion tracking
    completed_challenges: Mapped[dict] = mapped_column(JSONB, default=list)
    completed_quests: Mapped[dict] = mapped_column(JSONB, default=list)
    unlocked_routes: Mapped[dict] = mapped_column(JSONB, default=list)
    discovered_scenes: Mapped[dict] = mapped_column(JSONB, default=list)

    # NPC state
    npc_dialogue_state: Mapped[dict] = mapped_column(JSONB, default=dict)
    met_npcs: Mapped[dict] = mapped_column(JSONB, default=list)

    # Inventory
    inventory: Mapped[dict] = mapped_column(JSONB, default=list)

    # Stats
    total_play_time_seconds: Mapped[int] = mapped_column(Integer, default=0)
    sessions_count: Mapped[int] = mapped_column(Integer, default=0)
    last_played_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    # Relationships
    player = relationship("PlayerProfile", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("player_id", "game_id", name="unique_player_game"),
        Index("idx_progress_player", "player_id"),
        Index("idx_progress_game", "game_id"),
        Index("idx_progress_last_played", "last_played_at"),
    )
