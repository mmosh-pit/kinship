"""Player Analytics API — Phase 0.

Endpoints:
  POST   /api/analytics/sessions/start     — Start a new play session
  POST   /api/analytics/sessions/end       — End a play session
  GET    /api/analytics/sessions/{id}      — Get session details

  POST   /api/analytics/events             — Track a single event
  POST   /api/analytics/events/batch       — Track multiple events (offline sync)

  GET    /api/analytics/progress/{player_id}/{game_id}  — Load progress
  POST   /api/analytics/progress           — Save progress

  GET    /api/analytics/games/{game_id}    — Get game analytics
  GET    /api/analytics/games/{game_id}/overview — Quick overview stats
  GET    /api/analytics/games/{game_id}/scenes — Scene-level analytics
  GET    /api/analytics/games/{game_id}/challenges — Challenge analytics
  GET    /api/analytics/games/{game_id}/hearts — HEARTS analytics
"""

import logging
from datetime import datetime, timezone, timedelta
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.dialects.postgresql import insert

from app.db.database import get_db
from app.db.models_analytics import PlayerSession, PlayerEvent, PlayerGameProgress
from app.schemas.analytics import (
    # Sessions
    SessionStartRequest,
    SessionStartResponse,
    SessionEndRequest,
    SessionEndResponse,
    SessionResponse,
    # Events
    EventCreate,
    EventBatchCreate,
    EventResponse,
    EventBatchResponse,
    # Progress
    ProgressSaveRequest,
    ProgressResponse,
    ProgressLoadResponse,
    # Analytics
    AnalyticsTimeRange,
    GameOverviewStats,
    HeartsAnalytics,
    SceneAnalytics,
    ChallengeAnalytics,
    GameAnalyticsResponse,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/analytics", tags=["Analytics"])


# ═══════════════════════════════════════════════════════════
# SESSION ENDPOINTS
# ═══════════════════════════════════════════════════════════


@router.post("/sessions/start", response_model=SessionStartResponse)
async def start_session(body: SessionStartRequest, db: AsyncSession = Depends(get_db)):
    """Start a new play session.

    Call this when a player begins playing a game.
    Returns a session_id to include with all subsequent events.
    """
    session = PlayerSession(
        player_id=body.player_id,
        game_id=body.game_id,
        platform_id=body.platform_id,
        device_type=body.device_type,
        app_version=body.app_version,
        started_at=datetime.now(timezone.utc),
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    logger.info(
        f"Session started: {session.id} for player {body.player_id} in game {body.game_id}"
    )

    return SessionStartResponse(
        session_id=session.id,
        started_at=session.started_at,
    )


@router.post("/sessions/end", response_model=SessionEndResponse)
async def end_session(body: SessionEndRequest, db: AsyncSession = Depends(get_db)):
    """End a play session.

    Call this when a player stops playing.
    Computes duration and finalizes session stats.
    """
    result = await db.execute(
        select(PlayerSession).where(PlayerSession.id == body.session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.ended_at:
        raise HTTPException(status_code=400, detail="Session already ended")

    now = datetime.now(timezone.utc)
    duration = int((now - session.started_at).total_seconds())

    session.ended_at = now
    session.duration_seconds = duration

    # Update summary stats if provided
    if body.scenes_visited is not None:
        session.scenes_visited = body.scenes_visited
    if body.challenges_attempted is not None:
        session.challenges_attempted = body.challenges_attempted
    if body.challenges_completed is not None:
        session.challenges_completed = body.challenges_completed
    if body.hearts_earned is not None:
        session.hearts_earned = body.hearts_earned

    # Also update player_game_progress
    progress_result = await db.execute(
        select(PlayerGameProgress).where(
            and_(
                PlayerGameProgress.player_id == session.player_id,
                PlayerGameProgress.game_id == session.game_id,
            )
        )
    )
    progress = progress_result.scalar_one_or_none()

    if progress:
        progress.total_play_time_seconds += duration
        progress.sessions_count += 1
        progress.last_played_at = now

    await db.commit()

    logger.info(f"Session ended: {session.id}, duration: {duration}s")

    return SessionEndResponse(
        session_id=session.id,
        duration_seconds=duration,
        ended_at=now,
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(session_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get session details."""
    result = await db.execute(
        select(PlayerSession).where(PlayerSession.id == session_id)
    )
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return session


# ═══════════════════════════════════════════════════════════
# EVENT ENDPOINTS
# ═══════════════════════════════════════════════════════════


@router.post("/events", response_model=EventResponse)
async def track_event(body: EventCreate, db: AsyncSession = Depends(get_db)):
    """Track a single player event.

    Event types:
    - scene_enter, scene_exit
    - challenge_start, challenge_complete, challenge_fail, challenge_skip
    - quest_start, quest_complete, quest_abandon
    - collectible_pickup
    - npc_interact, dialogue_choice
    - route_transition
    - hearts_change
    - inventory_change
    - achievement_unlock
    """
    event = PlayerEvent(
        session_id=body.session_id,
        player_id=body.player_id,
        game_id=body.game_id,
        event_type=body.event_type,
        event_data=body.event_data,
        scene_id=body.scene_id,
        position_x=body.position_x,
        position_y=body.position_y,
    )

    db.add(event)
    await db.commit()
    await db.refresh(event)

    logger.debug(f"Event tracked: {body.event_type} for player {body.player_id}")

    return event


@router.post("/events/batch", response_model=EventBatchResponse)
async def track_events_batch(
    body: EventBatchCreate, db: AsyncSession = Depends(get_db)
):
    """Track multiple events at once.

    Use this for offline sync — send all queued events in one request.
    """
    tracked = 0
    failed = 0
    errors = []

    for event_data in body.events:
        try:
            event = PlayerEvent(
                session_id=event_data.session_id,
                player_id=event_data.player_id,
                game_id=event_data.game_id,
                event_type=event_data.event_type,
                event_data=event_data.event_data,
                scene_id=event_data.scene_id,
                position_x=event_data.position_x,
                position_y=event_data.position_y,
            )
            db.add(event)
            tracked += 1
        except Exception as e:
            failed += 1
            errors.append(str(e))

    await db.commit()

    logger.info(f"Batch events tracked: {tracked} success, {failed} failed")

    return EventBatchResponse(tracked=tracked, failed=failed, errors=errors[:10])


# ═══════════════════════════════════════════════════════════
# PROGRESS ENDPOINTS
# ═══════════════════════════════════════════════════════════


@router.get("/progress/{player_id}/{game_id}", response_model=ProgressLoadResponse)
async def load_progress(
    player_id: UUID,
    game_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Load saved game progress for a player."""
    result = await db.execute(
        select(PlayerGameProgress).where(
            and_(
                PlayerGameProgress.player_id == player_id,
                PlayerGameProgress.game_id == game_id,
            )
        )
    )
    progress = result.scalar_one_or_none()

    if not progress:
        return ProgressLoadResponse(exists=False, progress=None)

    return ProgressLoadResponse(exists=True, progress=progress)


@router.post("/progress", response_model=ProgressResponse)
async def save_progress(body: ProgressSaveRequest, db: AsyncSession = Depends(get_db)):
    """Save game progress.

    Uses upsert — creates new record if not exists, updates if exists.
    Only updates fields that are provided (non-None).
    """
    # Check if progress exists
    result = await db.execute(
        select(PlayerGameProgress).where(
            and_(
                PlayerGameProgress.player_id == body.player_id,
                PlayerGameProgress.game_id == body.game_id,
            )
        )
    )
    progress = result.scalar_one_or_none()

    if progress:
        # Update existing
        if body.current_scene_id is not None:
            progress.current_scene_id = body.current_scene_id
        if body.spawn_position is not None:
            progress.spawn_position = body.spawn_position
        if body.hearts_scores is not None:
            progress.hearts_scores = body.hearts_scores
        if body.completed_challenges is not None:
            progress.completed_challenges = body.completed_challenges
        if body.completed_quests is not None:
            progress.completed_quests = body.completed_quests
        if body.unlocked_routes is not None:
            progress.unlocked_routes = body.unlocked_routes
        if body.discovered_scenes is not None:
            progress.discovered_scenes = body.discovered_scenes
        if body.npc_dialogue_state is not None:
            progress.npc_dialogue_state = body.npc_dialogue_state
        if body.met_npcs is not None:
            progress.met_npcs = body.met_npcs
        if body.inventory is not None:
            progress.inventory = body.inventory

        progress.updated_at = datetime.now(timezone.utc)
    else:
        # Create new
        progress = PlayerGameProgress(
            player_id=body.player_id,
            game_id=body.game_id,
            current_scene_id=body.current_scene_id,
            spawn_position=body.spawn_position or {"x": 0, "y": 0},
            hearts_scores=body.hearts_scores
            or {"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50},
            completed_challenges=body.completed_challenges or [],
            completed_quests=body.completed_quests or [],
            unlocked_routes=body.unlocked_routes or [],
            discovered_scenes=body.discovered_scenes or [],
            npc_dialogue_state=body.npc_dialogue_state or {},
            met_npcs=body.met_npcs or [],
            inventory=body.inventory or [],
        )
        db.add(progress)

    await db.commit()
    await db.refresh(progress)

    logger.info(f"Progress saved for player {body.player_id} in game {body.game_id}")

    return progress


# ═══════════════════════════════════════════════════════════
# ANALYTICS QUERY ENDPOINTS
# ═══════════════════════════════════════════════════════════


def _get_date_range(time_range: AnalyticsTimeRange) -> tuple[datetime, datetime]:
    """Convert time range to start/end dates."""
    end = time_range.end_date or datetime.now(timezone.utc)

    if time_range.start_date:
        start = time_range.start_date
    else:
        period_days = {
            "7d": 7,
            "30d": 30,
            "90d": 90,
            "all": 365 * 10,  # 10 years
        }
        days = period_days.get(time_range.period, 7)
        start = end - timedelta(days=days)

    return start, end


@router.get("/games/{game_id}/overview", response_model=GameOverviewStats)
async def get_game_overview(
    game_id: str,
    period: str = Query("7d", description="Time period: 7d, 30d, 90d, all"),
    db: AsyncSession = Depends(get_db),
):
    """Get high-level game statistics."""
    time_range = AnalyticsTimeRange(period=period)
    start_date, end_date = _get_date_range(time_range)

    # Total players (all time)
    total_players_result = await db.execute(
        select(func.count(func.distinct(PlayerSession.player_id))).where(
            PlayerSession.game_id == game_id
        )
    )
    total_players = total_players_result.scalar() or 0

    # Active players in period
    active_result = await db.execute(
        select(func.count(func.distinct(PlayerSession.player_id))).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.started_at >= start_date,
                PlayerSession.started_at <= end_date,
            )
        )
    )
    active_players = active_result.scalar() or 0

    # Active players last 7d and 30d
    now = datetime.now(timezone.utc)
    active_7d_result = await db.execute(
        select(func.count(func.distinct(PlayerSession.player_id))).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.started_at >= now - timedelta(days=7),
            )
        )
    )
    active_7d = active_7d_result.scalar() or 0

    active_30d_result = await db.execute(
        select(func.count(func.distinct(PlayerSession.player_id))).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.started_at >= now - timedelta(days=30),
            )
        )
    )
    active_30d = active_30d_result.scalar() or 0

    # New players in period (first session in period)
    # Simplified: count players whose earliest session is within period
    new_players_result = await db.execute(
        select(func.count(func.distinct(PlayerSession.player_id))).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.started_at >= start_date,
            )
        )
    )
    new_players = new_players_result.scalar() or 0

    # Session stats
    session_stats_result = await db.execute(
        select(
            func.count(PlayerSession.id),
            func.avg(PlayerSession.duration_seconds),
            func.sum(PlayerSession.duration_seconds),
            func.avg(PlayerSession.scenes_visited),
            func.avg(PlayerSession.challenges_completed),
        ).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.ended_at.isnot(None),
                PlayerSession.started_at >= start_date,
                PlayerSession.started_at <= end_date,
            )
        )
    )
    stats = session_stats_result.one()

    total_sessions = stats[0] or 0
    avg_duration = float(stats[1] or 0)
    total_time = int(stats[2] or 0)
    avg_scenes = float(stats[3] or 0)
    avg_challenges = float(stats[4] or 0)

    # Sessions in last 7d
    sessions_7d_result = await db.execute(
        select(func.count(PlayerSession.id)).where(
            and_(
                PlayerSession.game_id == game_id,
                PlayerSession.started_at >= now - timedelta(days=7),
            )
        )
    )
    sessions_7d = sessions_7d_result.scalar() or 0

    # Completion rate (simplified: players who completed last quest)
    # This would need game-specific logic; returning 0 for now
    completion_rate = 0.0
    completed_count = 0

    return GameOverviewStats(
        game_id=game_id,
        total_players=total_players,
        active_players_7d=active_7d,
        active_players_30d=active_30d,
        new_players_7d=new_players,
        total_sessions=total_sessions,
        sessions_7d=sessions_7d,
        avg_session_duration_seconds=avg_duration,
        total_play_time_seconds=total_time,
        avg_scenes_per_session=avg_scenes,
        avg_challenges_per_session=avg_challenges,
        players_completed_game=completed_count,
        completion_rate_pct=completion_rate,
    )


@router.get("/games/{game_id}/scenes", response_model=list[SceneAnalytics])
async def get_scene_analytics(
    game_id: str,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
):
    """Get per-scene analytics."""
    time_range = AnalyticsTimeRange(period=period)
    start_date, end_date = _get_date_range(time_range)

    # Get scene enter counts
    result = await db.execute(
        select(
            PlayerEvent.scene_id,
            func.count(PlayerEvent.id).label("total_visits"),
            func.count(func.distinct(PlayerEvent.player_id)).label("unique_visitors"),
        )
        .where(
            and_(
                PlayerEvent.game_id == game_id,
                PlayerEvent.event_type == "scene_enter",
                PlayerEvent.scene_id.isnot(None),
                PlayerEvent.created_at >= start_date,
                PlayerEvent.created_at <= end_date,
            )
        )
        .group_by(PlayerEvent.scene_id)
        .order_by(desc("total_visits"))
    )

    scenes = []
    for row in result:
        scene_id, total_visits, unique_visitors = row

        # Get challenge stats for this scene
        challenge_result = await db.execute(
            select(
                func.count(PlayerEvent.id).filter(
                    PlayerEvent.event_type == "challenge_complete"
                ),
                func.count(PlayerEvent.id).filter(
                    PlayerEvent.event_type == "challenge_fail"
                ),
            ).where(
                and_(
                    PlayerEvent.game_id == game_id,
                    PlayerEvent.scene_id == scene_id,
                    PlayerEvent.created_at >= start_date,
                )
            )
        )
        ch_stats = challenge_result.one()

        scenes.append(
            SceneAnalytics(
                scene_id=scene_id,
                total_visits=total_visits,
                unique_visitors=unique_visitors,
                drop_off_rate_pct=0.0,  # Would need session exit analysis
                challenges_completed=ch_stats[0] or 0,
                challenges_failed=ch_stats[1] or 0,
            )
        )

    return scenes


@router.get("/games/{game_id}/challenges", response_model=list[ChallengeAnalytics])
async def get_challenge_analytics(
    game_id: str,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
):
    """Get per-challenge analytics."""
    time_range = AnalyticsTimeRange(period=period)
    start_date, end_date = _get_date_range(time_range)

    # Aggregate challenge events
    result = await db.execute(
        select(
            PlayerEvent.event_data["challenge_id"].astext.label("challenge_id"),
            PlayerEvent.event_data["challenge_name"].astext.label("challenge_name"),
            func.count(PlayerEvent.id)
            .filter(PlayerEvent.event_type == "challenge_start")
            .label("attempts"),
            func.count(PlayerEvent.id)
            .filter(PlayerEvent.event_type == "challenge_complete")
            .label("completions"),
            func.count(PlayerEvent.id)
            .filter(PlayerEvent.event_type == "challenge_fail")
            .label("failures"),
            func.count(PlayerEvent.id)
            .filter(PlayerEvent.event_type == "challenge_skip")
            .label("skips"),
            func.count(func.distinct(PlayerEvent.player_id)).label("unique_players"),
        )
        .where(
            and_(
                PlayerEvent.game_id == game_id,
                PlayerEvent.event_type.in_(
                    [
                        "challenge_start",
                        "challenge_complete",
                        "challenge_fail",
                        "challenge_skip",
                    ]
                ),
                PlayerEvent.event_data["challenge_id"].astext.isnot(None),
                PlayerEvent.created_at >= start_date,
            )
        )
        .group_by(
            PlayerEvent.event_data["challenge_id"].astext,
            PlayerEvent.event_data["challenge_name"].astext,
        )
        .order_by(desc("attempts"))
    )

    challenges = []
    for row in result:
        challenge_id, challenge_name, attempts, completions, failures, skips, unique = (
            row
        )

        total_finished = (completions or 0) + (failures or 0)
        success_rate = (
            (completions / total_finished * 100) if total_finished > 0 else 0.0
        )

        challenges.append(
            ChallengeAnalytics(
                challenge_id=challenge_id,
                challenge_name=challenge_name,
                total_attempts=attempts or 0,
                completions=completions or 0,
                failures=failures or 0,
                skips=skips or 0,
                success_rate_pct=round(success_rate, 1),
                avg_attempts_to_complete=1.0,  # Would need per-player analysis
                unique_players=unique or 0,
            )
        )

    return challenges


@router.get("/games/{game_id}/hearts", response_model=list[HeartsAnalytics])
async def get_hearts_analytics(
    game_id: str,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
):
    """Get HEARTS facet analytics."""
    time_range = AnalyticsTimeRange(period=period)
    start_date, end_date = _get_date_range(time_range)

    # Get all progress records for this game
    result = await db.execute(
        select(PlayerGameProgress.hearts_scores).where(
            and_(
                PlayerGameProgress.game_id == game_id,
                PlayerGameProgress.last_played_at >= start_date,
            )
        )
    )

    # Aggregate HEARTS scores
    facets = ["H", "E", "A", "R", "T", "Si", "So"]
    facet_scores: dict[str, list[float]] = {f: [] for f in facets}

    for row in result:
        scores = row[0] or {}
        for f in facets:
            if f in scores:
                facet_scores[f].append(float(scores[f]))

    analytics = []
    for f in facets:
        scores = facet_scores[f]
        if scores:
            analytics.append(
                HeartsAnalytics(
                    facet=f,
                    avg_score=round(sum(scores) / len(scores), 1),
                    min_score=min(scores),
                    max_score=max(scores),
                    total_delta=sum(s - 50 for s in scores),  # Delta from baseline
                )
            )
        else:
            analytics.append(
                HeartsAnalytics(
                    facet=f,
                    avg_score=50.0,
                    min_score=50.0,
                    max_score=50.0,
                    total_delta=0.0,
                )
            )

    return analytics


@router.get("/games/{game_id}", response_model=GameAnalyticsResponse)
async def get_full_game_analytics(
    game_id: str,
    period: str = Query("7d"),
    db: AsyncSession = Depends(get_db),
):
    """Get complete analytics for a game.

    Combines overview, scenes, challenges, quests, and HEARTS analytics.
    """
    time_range = AnalyticsTimeRange(period=period)

    # Fetch all analytics
    overview = await get_game_overview(game_id, period, db)
    scenes = await get_scene_analytics(game_id, period, db)
    challenges = await get_challenge_analytics(game_id, period, db)
    hearts = await get_hearts_analytics(game_id, period, db)

    return GameAnalyticsResponse(
        game_id=game_id,
        time_range=time_range,
        computed_at=datetime.now(timezone.utc),
        overview=overview,
        hearts=hearts,
        scenes=scenes,
        challenges=challenges,
        quests=[],  # TODO: Implement quest analytics
        drop_off_points=[],  # TODO: Implement drop-off analysis
    )
