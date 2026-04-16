"""Pydantic schemas for Player Analytics API — Phase 0.

Schemas for:
  - Sessions: Start, end, list
  - Events: Track player actions
  - Progress: Save/load game progress
  - Analytics: Query aggregated data
"""

from datetime import datetime
from typing import Optional, Any
from uuid import UUID

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
# SESSION SCHEMAS
# ═══════════════════════════════════════════════════════════


class SessionStartRequest(BaseModel):
    """Request to start a new play session."""

    player_id: UUID
    game_id: str
    platform_id: Optional[str] = None
    device_type: Optional[str] = None  # web, ios, android
    app_version: Optional[str] = None


class SessionStartResponse(BaseModel):
    """Response with new session ID."""

    session_id: UUID
    started_at: datetime


class SessionEndRequest(BaseModel):
    """Request to end a play session."""

    session_id: UUID
    # Summary stats (optional, can be computed from events)
    scenes_visited: Optional[int] = None
    challenges_attempted: Optional[int] = None
    challenges_completed: Optional[int] = None
    hearts_earned: Optional[dict[str, float]] = None


class SessionEndResponse(BaseModel):
    """Response confirming session end."""

    session_id: UUID
    duration_seconds: int
    ended_at: datetime


class SessionResponse(BaseModel):
    """Full session details."""

    id: UUID
    player_id: UUID
    game_id: str
    platform_id: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    duration_seconds: Optional[int]
    device_type: Optional[str]
    scenes_visited: int
    challenges_attempted: int
    challenges_completed: int
    hearts_earned: dict

    model_config = {"from_attributes": True}


# ═══════════════════════════════════════════════════════════
# EVENT SCHEMAS
# ═══════════════════════════════════════════════════════════


class EventCreate(BaseModel):
    """Request to track a player event."""

    session_id: Optional[UUID] = None
    player_id: UUID
    game_id: str
    event_type: str = Field(
        ..., description="Event type: scene_enter, challenge_complete, etc."
    )
    event_data: dict[str, Any] = Field(default_factory=dict)
    scene_id: Optional[str] = None
    position_x: Optional[float] = None
    position_y: Optional[float] = None


class EventBatchCreate(BaseModel):
    """Request to track multiple events at once (for offline sync)."""

    events: list[EventCreate]


class EventResponse(BaseModel):
    """Tracked event confirmation."""

    id: UUID
    event_type: str
    created_at: datetime

    model_config = {"from_attributes": True}


class EventBatchResponse(BaseModel):
    """Batch event tracking response."""

    tracked: int
    failed: int
    errors: list[str] = []


# ═══════════════════════════════════════════════════════════
# PROGRESS SCHEMAS
# ═══════════════════════════════════════════════════════════


class ProgressSaveRequest(BaseModel):
    """Request to save game progress."""

    player_id: UUID
    game_id: str

    # Current state
    current_scene_id: Optional[str] = None
    spawn_position: Optional[dict[str, float]] = None

    # HEARTS
    hearts_scores: Optional[dict[str, float]] = None

    # Completion
    completed_challenges: Optional[list[str]] = None
    completed_quests: Optional[list[str]] = None
    unlocked_routes: Optional[list[str]] = None
    discovered_scenes: Optional[list[str]] = None

    # NPCs
    npc_dialogue_state: Optional[dict[str, Any]] = None
    met_npcs: Optional[list[str]] = None

    # Inventory
    inventory: Optional[list[dict[str, Any]]] = None


class ProgressResponse(BaseModel):
    """Full game progress state."""

    id: UUID
    player_id: UUID
    game_id: str

    current_scene_id: Optional[str]
    spawn_position: dict
    hearts_scores: dict

    completed_challenges: list
    completed_quests: list
    unlocked_routes: list
    discovered_scenes: list

    npc_dialogue_state: dict
    met_npcs: list
    inventory: list

    total_play_time_seconds: int
    sessions_count: int
    last_played_at: Optional[datetime]

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ProgressLoadResponse(BaseModel):
    """Response when loading progress (includes existence check)."""

    exists: bool
    progress: Optional[ProgressResponse] = None


# ═══════════════════════════════════════════════════════════
# ANALYTICS QUERY SCHEMAS
# ═══════════════════════════════════════════════════════════


class AnalyticsTimeRange(BaseModel):
    """Time range for analytics queries."""

    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    period: str = "7d"  # 7d, 30d, 90d, all


class GameAnalyticsRequest(BaseModel):
    """Request for game analytics."""

    game_id: str
    time_range: AnalyticsTimeRange = Field(default_factory=AnalyticsTimeRange)


class GameOverviewStats(BaseModel):
    """High-level game statistics."""

    game_id: str

    # Player metrics
    total_players: int
    active_players_7d: int
    active_players_30d: int
    new_players_7d: int

    # Session metrics
    total_sessions: int
    sessions_7d: int
    avg_session_duration_seconds: float
    total_play_time_seconds: int

    # Engagement
    avg_scenes_per_session: float
    avg_challenges_per_session: float

    # Completion
    players_completed_game: int
    completion_rate_pct: float


class HeartsAnalytics(BaseModel):
    """HEARTS facet analytics."""

    facet: str
    avg_score: float
    min_score: float
    max_score: float
    total_delta: float  # Total earned across all players


class SceneAnalytics(BaseModel):
    """Per-scene analytics."""

    scene_id: str
    scene_name: Optional[str] = None

    total_visits: int
    unique_visitors: int
    avg_time_seconds: Optional[float] = None

    # Drop-off: % of players who left the game from this scene
    drop_off_rate_pct: float

    # Challenges in this scene
    challenges_completed: int
    challenges_failed: int


class ChallengeAnalytics(BaseModel):
    """Per-challenge analytics."""

    challenge_id: str
    challenge_name: Optional[str] = None

    total_attempts: int
    completions: int
    failures: int
    skips: int

    success_rate_pct: float
    avg_attempts_to_complete: float

    unique_players: int


class QuestAnalytics(BaseModel):
    """Per-quest analytics."""

    quest_id: str
    quest_name: Optional[str] = None

    total_starts: int
    completions: int
    abandons: int

    completion_rate_pct: float
    avg_completion_time_seconds: Optional[float] = None


class DropOffPoint(BaseModel):
    """Where players quit the game."""

    scene_id: str
    scene_name: Optional[str] = None
    drop_off_count: int
    drop_off_pct: float


class GameAnalyticsResponse(BaseModel):
    """Complete analytics response for a game."""

    game_id: str
    time_range: AnalyticsTimeRange
    computed_at: datetime

    # Overview
    overview: GameOverviewStats

    # HEARTS
    hearts: list[HeartsAnalytics]

    # Scenes
    scenes: list[SceneAnalytics]

    # Challenges
    challenges: list[ChallengeAnalytics]

    # Quests
    quests: list[QuestAnalytics]

    # Drop-off analysis
    drop_off_points: list[DropOffPoint]


# ═══════════════════════════════════════════════════════════
# PLAYER ANALYTICS SCHEMAS
# ═══════════════════════════════════════════════════════════


class PlayerAnalyticsRequest(BaseModel):
    """Request for individual player analytics."""

    player_id: UUID
    game_id: Optional[str] = None  # If None, aggregate across all games


class PlayerAnalyticsResponse(BaseModel):
    """Analytics for a specific player."""

    player_id: UUID

    # Time stats
    total_play_time_seconds: int
    total_sessions: int
    avg_session_duration_seconds: float

    # Progress
    games_played: int
    scenes_discovered: int
    challenges_completed: int
    quests_completed: int

    # HEARTS journey
    hearts_scores: dict[str, float]
    hearts_history: list[dict]  # [{date, facet, delta}, ...]

    # Achievements
    badges: list[str]
