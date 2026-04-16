"""
Kinship Leaderboard API Routes

FastAPI endpoints for leaderboard management and score submission.
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.db.database import get_db
from app.db.leaderboard_models import (
    LeaderboardConfigCreate,
    LeaderboardConfigResponse,
    LeaderboardConfigUpdate,
    LeaderboardEntryResponse,
    LeaderboardPeriod,
    LeaderboardResponse,
    PlayerLeaderboardSummary,
    ScoreSubmission,
    ScoreUpdateResponse,
    LeaderboardType,
)
from app.services.leaderboard_service import LeaderboardService, create_default_leaderboards


router = APIRouter(prefix="/api/leaderboards", tags=["leaderboards"])


# ═══════════════════════════════════════════════════════════════════
#  Leaderboard Management (Studio)
# ═══════════════════════════════════════════════════════════════════


@router.post("/games/{game_id}", response_model=LeaderboardConfigResponse)
async def create_leaderboard(
    game_id: str, config: LeaderboardConfigCreate, db: Session = Depends(get_db)
):
    """Create a new leaderboard for a game"""
    service = LeaderboardService(db)
    leaderboard = service.create_leaderboard(game_id, config)
    return leaderboard


@router.get("/games/{game_id}", response_model=List[LeaderboardConfigResponse])
async def get_game_leaderboards(
    game_id: str, include_disabled: bool = Query(False), db: Session = Depends(get_db)
):
    """Get all leaderboards for a game"""
    service = LeaderboardService(db)
    return service.get_game_leaderboards(game_id, include_disabled)


@router.get("/{leaderboard_id}/config", response_model=LeaderboardConfigResponse)
async def get_leaderboard_config(leaderboard_id: str, db: Session = Depends(get_db)):
    """Get leaderboard configuration"""
    service = LeaderboardService(db)
    leaderboard = service.get_leaderboard(leaderboard_id)
    if not leaderboard:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return leaderboard


@router.put("/{leaderboard_id}", response_model=LeaderboardConfigResponse)
async def update_leaderboard(
    leaderboard_id: str, updates: LeaderboardConfigUpdate, db: Session = Depends(get_db)
):
    """Update leaderboard configuration"""
    service = LeaderboardService(db)
    leaderboard = service.update_leaderboard(leaderboard_id, updates)
    if not leaderboard:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return leaderboard


@router.delete("/{leaderboard_id}")
async def delete_leaderboard(leaderboard_id: str, db: Session = Depends(get_db)):
    """Delete a leaderboard"""
    service = LeaderboardService(db)
    if not service.delete_leaderboard(leaderboard_id):
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return {"status": "deleted"}


@router.post(
    "/games/{game_id}/defaults", response_model=List[LeaderboardConfigResponse]
)
async def create_default_leaderboards_endpoint(
    game_id: str, db: Session = Depends(get_db)
):
    """Create default leaderboards for a game"""
    leaderboards = create_default_leaderboards(db, game_id)
    return leaderboards


# ═══════════════════════════════════════════════════════════════════
#  Leaderboard Entries (Public/Game Client)
# ═══════════════════════════════════════════════════════════════════


@router.get("/{leaderboard_id}", response_model=LeaderboardResponse)
async def get_leaderboard(
    leaderboard_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    player_id: Optional[str] = Query(None, description="Include this player's entry"),
    db: Session = Depends(get_db),
):
    """Get leaderboard entries with rankings"""
    service = LeaderboardService(db)
    result = service.get_leaderboard_entries(
        leaderboard_id, period, limit, offset, player_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return result


@router.get("/{leaderboard_id}/top", response_model=List[LeaderboardEntryResponse])
async def get_top_entries(
    leaderboard_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    """Get top N entries for a leaderboard"""
    service = LeaderboardService(db)
    result = service.get_leaderboard_entries(leaderboard_id, period, limit=limit)
    if not result:
        raise HTTPException(status_code=404, detail="Leaderboard not found")
    return result.entries


@router.get(
    "/{leaderboard_id}/player/{player_id}", response_model=LeaderboardEntryResponse
)
async def get_player_entry(
    leaderboard_id: str,
    player_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    db: Session = Depends(get_db),
):
    """Get a specific player's entry"""
    service = LeaderboardService(db)
    leaderboard = service.get_leaderboard(leaderboard_id)
    if not leaderboard:
        raise HTTPException(status_code=404, detail="Leaderboard not found")

    entry = service._get_player_entry_response(
        leaderboard_id, player_id, period, leaderboard
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Player not found on leaderboard")
    return entry


@router.get("/{leaderboard_id}/player/{player_id}/rank")
async def get_player_rank(
    leaderboard_id: str,
    player_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    db: Session = Depends(get_db),
):
    """Get a player's rank on a leaderboard"""
    service = LeaderboardService(db)
    rank = service.get_player_rank(leaderboard_id, player_id, period)
    if rank is None:
        raise HTTPException(status_code=404, detail="Player not found on leaderboard")
    return {
        "leaderboard_id": leaderboard_id,
        "player_id": player_id,
        "rank": rank,
        "period": period,
    }


@router.get(
    "/{leaderboard_id}/player/{player_id}/nearby",
    response_model=List[LeaderboardEntryResponse],
)
async def get_nearby_entries(
    leaderboard_id: str,
    player_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    above: int = Query(2, ge=0, le=10),
    below: int = Query(2, ge=0, le=10),
    db: Session = Depends(get_db),
):
    """Get entries around a player's rank"""
    service = LeaderboardService(db)
    entries = service.get_nearby_entries(
        leaderboard_id, player_id, period, above, below
    )
    return entries


# ═══════════════════════════════════════════════════════════════════
#  Score Submission (Game Client)
# ═══════════════════════════════════════════════════════════════════


@router.post("/{leaderboard_id}/scores", response_model=ScoreUpdateResponse)
async def submit_score(
    leaderboard_id: str, submission: ScoreSubmission, db: Session = Depends(get_db)
):
    """Submit or update a player's score"""
    service = LeaderboardService(db)
    result = service.submit_score(leaderboard_id, submission)
    if not result:
        raise HTTPException(status_code=404, detail="Leaderboard not found or disabled")
    return result


@router.post("/{leaderboard_id}/scores/increment", response_model=ScoreUpdateResponse)
async def increment_score(
    leaderboard_id: str,
    player_id: str = Query(...),
    amount: float = Query(...),
    player_name: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Increment a player's score by an amount"""
    service = LeaderboardService(db)
    result = service.increment_score(leaderboard_id, player_id, amount, player_name)
    if not result:
        raise HTTPException(status_code=404, detail="Leaderboard not found or disabled")
    return result


# ═══════════════════════════════════════════════════════════════════
#  Player Summary
# ═══════════════════════════════════════════════════════════════════


@router.get(
    "/games/{game_id}/player/{player_id}/summary",
    response_model=PlayerLeaderboardSummary,
)
async def get_player_summary(
    game_id: str, player_id: str, db: Session = Depends(get_db)
):
    """Get a player's summary across all leaderboards in a game"""
    service = LeaderboardService(db)
    return service.get_player_summary(game_id, player_id)


# ═══════════════════════════════════════════════════════════════════
#  Admin Operations
# ═══════════════════════════════════════════════════════════════════


@router.post("/{leaderboard_id}/snapshot")
async def create_snapshot(
    leaderboard_id: str,
    period: LeaderboardPeriod = Query(LeaderboardPeriod.ALL_TIME),
    top_n: int = Query(100, ge=10, le=1000),
    db: Session = Depends(get_db),
):
    """Create a snapshot of current standings"""
    service = LeaderboardService(db)
    snapshot = service.create_snapshot(leaderboard_id, period, top_n)
    return {
        "snapshot_id": snapshot.id,
        "leaderboard_id": snapshot.leaderboard_id,
        "period": snapshot.period,
        "snapshot_date": snapshot.snapshot_date,
        "total_players": snapshot.total_players,
        "entries_count": len(snapshot.top_entries),
    }


@router.post("/games/{game_id}/reset-period")
async def reset_period_scores(
    game_id: str, period: LeaderboardPeriod = Query(...), db: Session = Depends(get_db)
):
    """Reset scores for a period across all leaderboards in a game"""
    if period == LeaderboardPeriod.ALL_TIME:
        raise HTTPException(status_code=400, detail="Cannot reset all-time scores")

    service = LeaderboardService(db)
    count = service.reset_period_scores(period, game_id)
    return {"status": "reset", "entries_affected": count, "period": period}
