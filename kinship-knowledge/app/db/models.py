"""SQLAlchemy ORM models — all tables for kinship-backend."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
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
# NPCs
# ──────────────────────────────────────────────
class Actor(Base):
    __tablename__ = "actors"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    actor_type: Mapped[str] = mapped_column(
        String(50), default="character"
    )  # character, creature, collectible, obstacle, interactive, ambient, enemy, companion
    role: Mapped[str | None] = mapped_column(String(255))
    game_id: Mapped[str | None] = mapped_column(String(255), index=True)
    scene_id: Mapped[str | None] = mapped_column(String(255))
    facet: Mapped[str | None] = mapped_column(String(4))  # H, E, A, R, T, Si, So
    # Character fields
    personality: Mapped[str | None] = mapped_column(Text)
    background: Mapped[str | None] = mapped_column(Text)
    dialogue_style: Mapped[str | None] = mapped_column(Text)
    catchphrases: Mapped[dict] = mapped_column(JSONB, default=list)
    dialogue_tree: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # [{id, text, options}]
    greeting: Mapped[str | None] = mapped_column(Text)
    interaction_rules: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {available_after, repeatable}
    # Movement & behavior (all actor types)
    movement_pattern: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {type: patrol|wander|follow|static, speed, path}
    behavior_config: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # type-specific: observe_text, pickup_effect, detection_radius
    states: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # [{id, sprite, transition}] for interactive
    collision_effect: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {type: damage|collect|dialogue|challenge, value}
    spawn_config: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {position, respawn, max_count}
    # Visual
    sprite_asset_id: Mapped[str | None] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# Backward compat alias
NPC = Actor


# ──────────────────────────────────────────────
# Challenges
# ──────────────────────────────────────────────
class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    game_id: Mapped[str | None] = mapped_column(String(255), index=True)
    scene_id: Mapped[str | None] = mapped_column(String(255))
    facets: Mapped[dict] = mapped_column(JSONB, default=list)  # ["E", "T"]
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")
    steps: Mapped[dict] = mapped_column(JSONB, default=list)  # [{order, description}]
    success_criteria: Mapped[str | None] = mapped_column(Text)

    # Challenge type and mechanics
    mechanic_type: Mapped[str | None] = mapped_column(
        String(50), default="exploration"  # Changed from multiple_choice
    )
    interaction_style: Mapped[str | None] = mapped_column(
        String(50), default="hands_on"  # NEW: hands_on, observation, timing
    )

    # Interactive challenge fields (NEW)
    scene_integration: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {trigger, location, ambient_effects}

    mechanics: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {type, objects, goal, constraints, physics}

    interactive_elements: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # [{name, behavior, effect}]

    success_conditions: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # [{type, details}]

    # Existing fields
    correct_answers: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # Can also hold success_conditions for backward compat
    hints: Mapped[dict] = mapped_column(JSONB, default=list)
    feedback: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {correct, incorrect, partial}
    scoring_rubric: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {facet_deltas, pass_threshold, time_bonus}
    learning_objectives: Mapped[dict] = mapped_column(JSONB, default=list)
    base_delta: Mapped[float] = mapped_column(Float, default=5.0)
    time_limit_sec: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ──────────────────────────────────────────────
# Quests
# ──────────────────────────────────────────────
class Quest(Base):
    __tablename__ = "quests"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    beat_type: Mapped[str | None] = mapped_column(String(50))
    facet: Mapped[str | None] = mapped_column(String(4))
    game_id: Mapped[str | None] = mapped_column(String(255), index=True)
    scene_id: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    narrative_content: Mapped[str | None] = mapped_column(Text)
    completion_conditions: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {type, target}
    prerequisites: Mapped[dict] = mapped_column(JSONB, default=list)  # ["quest_id"]
    rewards: Mapped[dict] = mapped_column(
        JSONB, default=dict
    )  # {hearts_deltas, unlock_route}
    learning_objectives: Mapped[dict] = mapped_column(JSONB, default=list)
    sequence_order: Mapped[int] = mapped_column(Integer, default=1)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ──────────────────────────────────────────────
# Routes
# ──────────────────────────────────────────────
class Route(Base):
    __tablename__ = "routes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    game_id: Mapped[str | None] = mapped_column(String(255), index=True)
    from_scene: Mapped[str | None] = mapped_column(String(255))
    to_scene: Mapped[str | None] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    trigger_type: Mapped[str | None] = mapped_column(String(50))
    trigger_value: Mapped[str | None] = mapped_column(String(255))
    conditions: Mapped[dict] = mapped_column(JSONB, default=list)
    bidirectional: Mapped[bool] = mapped_column(Boolean, default=False)
    show_in_map: Mapped[bool] = mapped_column(Boolean, default=True)
    hidden_until_triggered: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ──────────────────────────────────────────────
# Knowledge Documents
# ──────────────────────────────────────────────
class KnowledgeDoc(Base):
    __tablename__ = "knowledge_docs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    platform_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str | None] = mapped_column(String(50))
    doc_type: Mapped[str | None] = mapped_column(String(50))
    tags: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # ["wellness", "hearts", "intro"]
    facets: Mapped[dict] = mapped_column(
        JSONB, default=list
    )  # ["H", "E", "A", "R", "T", "S"]
    source_url: Mapped[str | None] = mapped_column(String(500))
    file_url: Mapped[str | None] = mapped_column(
        String(500)
    )  # S3/bucket URL for uploaded PDFs
    file_name: Mapped[str | None] = mapped_column(String(255))  # Original filename
    pinecone_namespace: Mapped[str] = mapped_column(
        String(100), default="kinship-knowledge"
    )
    chunk_count: Mapped[int] = mapped_column(Integer, default=0)
    ingest_status: Mapped[str] = mapped_column(String(20), default="pending")
    last_ingested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


# ──────────────────────────────────────────────
# Prompts (Three-Tier)
# ──────────────────────────────────────────────
class Prompt(Base):
    __tablename__ = "prompts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    platform_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), nullable=True, index=True
    )
    tier: Mapped[int] = mapped_column(
        Integer, nullable=False
    )  # 1=Global, 2=Scene, 3=NPC
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    content: Mapped[str | None] = mapped_column(Text)
    category: Mapped[str] = mapped_column(
        String(50), default="instructions"
    )  # constitution, behavior, safety, persona, context, instructions
    scene_type: Mapped[str | None] = mapped_column(
        String(100)
    )  # gym, garden, kitchen, etc.
    npc_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("actors.id", ondelete="SET NULL")
    )
    priority: Mapped[int] = mapped_column(Integer, default=100)  # Higher = runs first
    is_guardian: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str] = mapped_column(
        String(20), default="draft"
    )  # draft, active, archived
    version: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    npc = relationship("Actor", lazy="selectin")

    __table_args__ = (CheckConstraint("tier >= 1 AND tier <= 3", name="valid_tier"),)


# ──────────────────────────────────────────────
# HEARTS Framework
# ──────────────────────────────────────────────
class HeartsFacet(Base):
    __tablename__ = "hearts_facets"

    key: Mapped[str] = mapped_column(String(4), primary_key=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    definition: Mapped[str | None] = mapped_column(Text)
    under_pattern: Mapped[str | None] = mapped_column(Text)
    over_pattern: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(10))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class HeartsRubric(Base):
    __tablename__ = "hearts_rubric"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    move_type: Mapped[str] = mapped_column(String(100), nullable=False)
    facet_key: Mapped[str] = mapped_column(
        String(4), ForeignKey("hearts_facets.key"), nullable=False
    )
    delta: Mapped[float] = mapped_column(Float, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )

    facet = relationship("HeartsFacet", lazy="selectin")

    __table_args__ = (
        UniqueConstraint("move_type", "facet_key", name="unique_move_facet"),
    )


# ──────────────────────────────────────────────
# Player State (Runtime)
# ──────────────────────────────────────────────
class PlayerProfile(Base):
    __tablename__ = "player_profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    user_id: Mapped[str] = mapped_column(
        String(255), unique=True, nullable=False
    )  # Firebase UID
    display_name: Mapped[str | None] = mapped_column(String(255))
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
    current_scene: Mapped[str | None] = mapped_column(String(255))
    completed_quests: Mapped[dict] = mapped_column(JSONB, default=list)
    completed_challenges: Mapped[dict] = mapped_column(JSONB, default=list)
    met_npcs: Mapped[dict] = mapped_column(JSONB, default=list)
    inventory: Mapped[dict] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )


class ConversationHistory(Base):
    __tablename__ = "conversation_history"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=new_uuid
    )
    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    npc_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("actors.id", ondelete="SET NULL")
    )
    scene_id: Mapped[str | None] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant
    content: Mapped[str] = mapped_column(Text, nullable=False)
    hearts_deltas: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    __table_args__ = (
        Index("idx_conv_history_player_npc", "player_id", "npc_id", "created_at"),
    )


# ──────────────────────────────────────────────
# Multi-player Scene Presence
# ──────────────────────────────────────────────
class ScenePresence(Base):
    __tablename__ = "scene_presence"

    player_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("player_profiles.id", ondelete="CASCADE"),
        primary_key=True,
    )
    scene_id: Mapped[str] = mapped_column(String(255), primary_key=True)
    position_x: Mapped[float] = mapped_column(Float, default=0)
    position_y: Mapped[float] = mapped_column(Float, default=0)
    facing: Mapped[str] = mapped_column(String(10), default="down")
    status: Mapped[str] = mapped_column(String(20), default="idle")
    connected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )
    last_heartbeat: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow
    )

    __table_args__ = (Index("idx_presence_heartbeat", "last_heartbeat"),)
