"""
Kinship Achievement API Routes - FastAPI endpoints
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.achievement_models import (
    AchievementTier,
    TriggerEvent,
    AchievementCreate,
    AchievementUpdate,
    AchievementResponse,
    PlayerAchievementResponse,
    PlayerAchievementSummary,
    UnlockResult,
    ProgressUpdate,
    ProgressResult,
    TriggerCheckRequest,
    TriggerCheckResult,
)

from app.db.database import get_db
from app.services.achievement_service import (
    AchievementService,
    create_default_achievements,
)


router = APIRouter(prefix="/api/achievements", tags=["achievements"])


# ═══════════════════════════════════════════════════════════════════
#  Achievement Management (Studio)
# ═══════════════════════════════════════════════════════════════════


@router.post("/games/{game_id}", response_model=AchievementResponse)
async def create_achievement(
    game_id: str, data: AchievementCreate, db: Session = Depends(get_db)
):
    """Create a new achievement for a game"""
    service = AchievementService(db)
    achievement = service.create_achievement(game_id, data)
    stats = service.get_achievement_stats(achievement.id)
    return AchievementResponse(
        id=achievement.id,
        game_id=achievement.game_id,
        name=achievement.name,
        description=achievement.description,
        hint=achievement.hint,
        icon=achievement.icon,
        tier=achievement.tier,
        achievement_type=achievement.achievement_type,
        category=achievement.category,
        is_enabled=achievement.is_enabled,
        is_secret=achievement.is_secret,
        xp_reward=achievement.xp_reward,
        points_reward=achievement.points_reward,
        trigger_event=achievement.trigger_event,
        trigger_conditions=achievement.trigger_conditions,
        requires_progress=achievement.requires_progress,
        progress_max=achievement.progress_max,
        progress_unit=achievement.progress_unit,
        unlock_count=stats["unlock_count"],
        unlock_percentage=stats["unlock_percentage"],
    )


@router.get("/games/{game_id}", response_model=List[AchievementResponse])
async def get_game_achievements(
    game_id: str,
    include_disabled: bool = Query(False),
    tier: Optional[AchievementTier] = Query(None),
    db: Session = Depends(get_db),
):
    """Get all achievements for a game"""
    service = AchievementService(db)
    achievements = service.get_game_achievements(game_id, include_disabled, tier)

    results = []
    for a in achievements:
        stats = service.get_achievement_stats(a.id)
        results.append(
            AchievementResponse(
                id=a.id,
                game_id=a.game_id,
                name=a.name,
                description=a.description,
                hint=a.hint,
                icon=a.icon,
                tier=a.tier,
                achievement_type=a.achievement_type,
                category=a.category,
                is_enabled=a.is_enabled,
                is_secret=a.is_secret,
                xp_reward=a.xp_reward,
                points_reward=a.points_reward,
                trigger_event=a.trigger_event,
                trigger_conditions=a.trigger_conditions,
                requires_progress=a.requires_progress,
                progress_max=a.progress_max,
                progress_unit=a.progress_unit,
                unlock_count=stats["unlock_count"],
                unlock_percentage=stats["unlock_percentage"],
            )
        )
    return results


@router.get("/{achievement_id}", response_model=AchievementResponse)
async def get_achievement(achievement_id: str, db: Session = Depends(get_db)):
    """Get a specific achievement"""
    service = AchievementService(db)
    achievement = service.get_achievement(achievement_id)
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    stats = service.get_achievement_stats(achievement_id)
    return AchievementResponse(
        id=achievement.id,
        game_id=achievement.game_id,
        name=achievement.name,
        description=achievement.description,
        hint=achievement.hint,
        icon=achievement.icon,
        tier=achievement.tier,
        achievement_type=achievement.achievement_type,
        category=achievement.category,
        is_enabled=achievement.is_enabled,
        is_secret=achievement.is_secret,
        xp_reward=achievement.xp_reward,
        points_reward=achievement.points_reward,
        trigger_event=achievement.trigger_event,
        trigger_conditions=achievement.trigger_conditions,
        requires_progress=achievement.requires_progress,
        progress_max=achievement.progress_max,
        progress_unit=achievement.progress_unit,
        unlock_count=stats["unlock_count"],
        unlock_percentage=stats["unlock_percentage"],
    )


@router.put("/{achievement_id}", response_model=AchievementResponse)
async def update_achievement(
    achievement_id: str, updates: AchievementUpdate, db: Session = Depends(get_db)
):
    """Update an achievement"""
    service = AchievementService(db)
    achievement = service.update_achievement(achievement_id, updates)
    if not achievement:
        raise HTTPException(status_code=404, detail="Achievement not found")

    stats = service.get_achievement_stats(achievement_id)
    return AchievementResponse(
        id=achievement.id,
        game_id=achievement.game_id,
        name=achievement.name,
        description=achievement.description,
        hint=achievement.hint,
        icon=achievement.icon,
        tier=achievement.tier,
        achievement_type=achievement.achievement_type,
        category=achievement.category,
        is_enabled=achievement.is_enabled,
        is_secret=achievement.is_secret,
        xp_reward=achievement.xp_reward,
        points_reward=achievement.points_reward,
        trigger_event=achievement.trigger_event,
        trigger_conditions=achievement.trigger_conditions,
        requires_progress=achievement.requires_progress,
        progress_max=achievement.progress_max,
        progress_unit=achievement.progress_unit,
        unlock_count=stats["unlock_count"],
        unlock_percentage=stats["unlock_percentage"],
    )


@router.delete("/{achievement_id}")
async def delete_achievement(achievement_id: str, db: Session = Depends(get_db)):
    """Delete an achievement"""
    service = AchievementService(db)
    if not service.delete_achievement(achievement_id):
        raise HTTPException(status_code=404, detail="Achievement not found")
    return {"status": "deleted"}


@router.post("/games/{game_id}/defaults", response_model=List[AchievementResponse])
async def create_defaults(game_id: str, db: Session = Depends(get_db)):
    """Create default achievements for a game"""
    service = AchievementService(db)
    achievements = create_default_achievements(db, game_id)

    results = []
    for a in achievements:
        stats = service.get_achievement_stats(a.id)
        results.append(
            AchievementResponse(
                id=a.id,
                game_id=a.game_id,
                name=a.name,
                description=a.description,
                hint=a.hint,
                icon=a.icon,
                tier=a.tier,
                achievement_type=a.achievement_type,
                category=a.category,
                is_enabled=a.is_enabled,
                is_secret=a.is_secret,
                xp_reward=a.xp_reward,
                points_reward=a.points_reward,
                trigger_event=a.trigger_event,
                trigger_conditions=a.trigger_conditions,
                requires_progress=a.requires_progress,
                progress_max=a.progress_max,
                progress_unit=a.progress_unit,
                unlock_count=stats["unlock_count"],
                unlock_percentage=stats["unlock_percentage"],
            )
        )
    return results


# ═══════════════════════════════════════════════════════════════════
#  Player Achievements (Game Client)
# ═══════════════════════════════════════════════════════════════════


@router.get(
    "/games/{game_id}/player/{player_id}",
    response_model=List[PlayerAchievementResponse],
)
async def get_player_achievements(
    game_id: str,
    player_id: str,
    unlocked_only: bool = Query(False),
    db: Session = Depends(get_db),
):
    """Get a player's achievements"""
    service = AchievementService(db)
    return service.get_player_achievements(game_id, player_id, unlocked_only)


@router.get(
    "/games/{game_id}/player/{player_id}/summary",
    response_model=PlayerAchievementSummary,
)
async def get_player_summary(
    game_id: str, player_id: str, db: Session = Depends(get_db)
):
    """Get a summary of player's achievements"""
    service = AchievementService(db)
    return service.get_player_summary(game_id, player_id)


@router.get(
    "/games/{game_id}/player/{player_id}/unseen",
    response_model=List[PlayerAchievementResponse],
)
async def get_unseen_unlocks(
    game_id: str, player_id: str, db: Session = Depends(get_db)
):
    """Get unlocked achievements that haven't been shown to the player"""
    service = AchievementService(db)
    return service.get_unseen_unlocks(game_id, player_id)


@router.post("/{achievement_id}/unlock", response_model=UnlockResult)
async def unlock_achievement(
    achievement_id: str, player_id: str = Query(...), db: Session = Depends(get_db)
):
    """Manually unlock an achievement for a player"""
    service = AchievementService(db)
    try:
        return service.unlock_achievement(achievement_id, player_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{achievement_id}/progress", response_model=ProgressResult)
async def update_progress(
    achievement_id: str, update: ProgressUpdate, db: Session = Depends(get_db)
):
    """Update progress on an achievement"""
    service = AchievementService(db)
    try:
        return service.update_progress(achievement_id, update)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post("/{achievement_id}/seen")
async def mark_seen(
    achievement_id: str, player_id: str = Query(...), db: Session = Depends(get_db)
):
    """Mark an achievement notification as seen"""
    service = AchievementService(db)
    if not service.mark_seen(achievement_id, player_id):
        raise HTTPException(status_code=404, detail="Player achievement not found")
    return {"status": "seen"}


# ═══════════════════════════════════════════════════════════════════
#  Trigger Checking
# ═══════════════════════════════════════════════════════════════════


@router.post("/check", response_model=TriggerCheckResult)
async def check_triggers(request: TriggerCheckRequest, db: Session = Depends(get_db)):
    """Check all achievements for a trigger event"""
    service = AchievementService(db)
    return service.check_triggers(request)
