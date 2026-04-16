"""
Kinship Wallet Score & Leaderboard API Routes

FastAPI endpoints for wallet-based scoring and leaderboard management.
All endpoints use: wallet_user_id, wallet_username, game_id
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text

from app.db.database import get_db
from app.db.wallet_score_models import (
    TimePeriod,
    ScoreboardType,
    WalletScoreSubmit,
    WalletPlayerUpdate,
    WalletPlayerCreate,
    ScoreSubmitResponse,
    LeaderboardResponse,
    LeaderboardEntryResponse,
    ScoreboardResponse,
    PlayerRankResponse,
    NearbyPlayersResponse,
    WalletPlayerResponse,
)
from app.services.wallet_score_service import WalletScoreService


router = APIRouter(prefix="/api/wallet", tags=["wallet-scores"])


# ═══════════════════════════════════════════════════════════════════
#  Player Management
# ═══════════════════════════════════════════════════════════════════


@router.get("/players/{wallet_user_id}", response_model=WalletPlayerResponse)
async def get_player(
    wallet_user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get wallet player profile.
    
    - **wallet_user_id**: The player's unique wallet identifier
    """
    service = WalletScoreService(db)
    player = await service.get_player(wallet_user_id)
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    return WalletPlayerResponse.model_validate(player)


@router.post("/players", response_model=WalletPlayerResponse)
async def create_player(
    request: WalletPlayerCreate,
    db: AsyncSession = Depends(get_db),
):
    """
    Create or register a wallet player.
    
    - **wallet_user_id**: Unique wallet identifier
    - **wallet_username**: Display name
    - **avatar_url**: Avatar image URL (optional)
    """
    service = WalletScoreService(db)
    player = await service.get_or_create_player(
        request.wallet_user_id, request.wallet_username
    )
    
    if request.avatar_url:
        player = await service.update_player(
            request.wallet_user_id, avatar_url=request.avatar_url
        )
    
    await db.commit()
    return WalletPlayerResponse.model_validate(player)


@router.put("/players/{wallet_user_id}", response_model=WalletPlayerResponse)
async def update_player(
    wallet_user_id: str,
    update: WalletPlayerUpdate,
    db: AsyncSession = Depends(get_db),
):
    """
    Update a wallet player profile.
    
    - **wallet_user_id**: The player's unique wallet identifier
    - **wallet_username**: New display name (optional)
    - **avatar_url**: New avatar image URL (optional)
    """
    service = WalletScoreService(db)
    player = await service.update_player(
        wallet_user_id,
        wallet_username=update.wallet_username,
        avatar_url=update.avatar_url,
    )
    
    if not player:
        raise HTTPException(status_code=404, detail="Player not found")
    
    await db.commit()
    return WalletPlayerResponse.model_validate(player)


# ═══════════════════════════════════════════════════════════════════
#  Score Submission
# ═══════════════════════════════════════════════════════════════════


@router.post("/scores", response_model=ScoreSubmitResponse)
async def submit_score(
    submission: WalletScoreSubmit,
    db: AsyncSession = Depends(get_db),
):
    """
    Submit a game score for a wallet.
    
    Creates a new score entry and updates leaderboard standings.
    Returns rank information and whether it's a new high score.
    
    **Required fields:**
    - **game_id**: The game identifier
    - **wallet_user_id**: Player's unique wallet identifier
    - **wallet_username**: Player's display name
    
    **Optional fields:**
    - **total_score**: Score value
    - **level**: Current level
    - **hearts_scores**: HEARTS facet scores {H, E, A, R, T, So, Si}
    - **challenges_completed**: Number of challenges completed
    - **quests_completed**: Number of quests completed
    - **collectibles_found**: Number of collectibles found
    - **time_played_seconds**: Time played in seconds
    """
    service = WalletScoreService(db)
    result = await service.submit_score(submission)
    await db.commit()
    return result


@router.post("/scores/batch", response_model=List[ScoreSubmitResponse])
async def submit_scores_batch(
    submissions: List[WalletScoreSubmit],
    db: AsyncSession = Depends(get_db),
):
    """
    Submit multiple scores in a batch.
    Useful for syncing offline scores.
    
    Each submission requires: game_id, wallet_user_id, wallet_username
    """
    service = WalletScoreService(db)
    results = []
    for submission in submissions:
        result = await service.submit_score(submission)
        results.append(result)
    await db.commit()
    return results


# ═══════════════════════════════════════════════════════════════════
#  Leaderboard Endpoints
# ═══════════════════════════════════════════════════════════════════


@router.get("/leaderboard/{game_id}", response_model=LeaderboardResponse)
async def get_leaderboard(
    game_id: str,
    period: TimePeriod = Query(TimePeriod.ALL_TIME),
    scoreboard_type: ScoreboardType = Query(ScoreboardType.TOTAL_SCORE),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    wallet_user_id: Optional[str] = Query(None, description="Current player's wallet ID for highlighting"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get leaderboard for a game.
    
    - **game_id**: The game identifier
    - **period**: Time period filter (all_time, daily, weekly, monthly)
    - **scoreboard_type**: What to rank by (total_score, level, challenges, etc.)
    - **limit**: Maximum entries to return (1-500)
    - **offset**: Pagination offset
    - **wallet_user_id**: Include to highlight current player and get their entry
    """
    service = WalletScoreService(db)
    return await service.get_leaderboard(
        game_id=game_id,
        period=period,
        scoreboard_type=scoreboard_type,
        limit=limit,
        offset=offset,
        current_wallet=wallet_user_id,
    )


@router.get("/leaderboard/{game_id}/top", response_model=List[LeaderboardEntryResponse])
async def get_top_entries(
    game_id: str,
    period: TimePeriod = Query(TimePeriod.ALL_TIME),
    limit: int = Query(10, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Get top N entries for quick display.
    
    - **game_id**: The game identifier
    - **period**: Time period (all_time, daily, weekly, monthly)
    - **limit**: Number of top entries (1-100)
    """
    service = WalletScoreService(db)
    return await service.get_top_entries(game_id, period, limit)


# ═══════════════════════════════════════════════════════════════════
#  Player-Specific Endpoints (Scoreboard)
# ═══════════════════════════════════════════════════════════════════


@router.get("/scoreboard/{game_id}/{wallet_user_id}", response_model=ScoreboardResponse)
async def get_player_scoreboard(
    game_id: str,
    wallet_user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get player's personal scoreboard data.
    
    Returns comprehensive stats including:
    - Current and best scores
    - Level and rank
    - HEARTS breakdown
    - Challenges and quests completed
    - Time played
    
    - **game_id**: The game identifier
    - **wallet_user_id**: Player's unique wallet identifier
    """
    service = WalletScoreService(db)
    result = await service.get_player_scoreboard(game_id, wallet_user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Player not found on scoreboard")
    return result


@router.get("/leaderboard/{game_id}/rank/{wallet_user_id}", response_model=PlayerRankResponse)
async def get_player_rank(
    game_id: str,
    wallet_user_id: str,
    period: TimePeriod = Query(TimePeriod.ALL_TIME),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a player's rank on the leaderboard.
    
    - **game_id**: The game identifier
    - **wallet_user_id**: Player's unique wallet identifier
    - **period**: Time period for ranking
    """
    service = WalletScoreService(db)
    result = await service.get_player_rank(game_id, wallet_user_id, period)
    if not result:
        raise HTTPException(status_code=404, detail="Player not found on leaderboard")
    return result


@router.get("/leaderboard/{game_id}/nearby/{wallet_user_id}", response_model=NearbyPlayersResponse)
async def get_nearby_players(
    game_id: str,
    wallet_user_id: str,
    period: TimePeriod = Query(TimePeriod.ALL_TIME),
    above: int = Query(2, ge=0, le=10),
    below: int = Query(2, ge=0, le=10),
    db: AsyncSession = Depends(get_db),
):
    """
    Get players ranked near the current player.
    
    Useful for showing competition context.
    
    - **game_id**: The game identifier
    - **wallet_user_id**: Player's unique wallet identifier
    - **period**: Time period for ranking
    - **above**: Number of higher-ranked players to show
    - **below**: Number of lower-ranked players to show
    """
    service = WalletScoreService(db)
    result = await service.get_nearby_players(
        game_id, wallet_user_id, period, above, below
    )
    if not result:
        raise HTTPException(status_code=404, detail="Player not found on leaderboard")
    return result


# ═══════════════════════════════════════════════════════════════════
#  Score History
# ═══════════════════════════════════════════════════════════════════


@router.get("/scores/{game_id}/{wallet_user_id}/history")
async def get_score_history(
    game_id: str,
    wallet_user_id: str,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    """
    Get player's score history.
    
    Returns recent score submissions for analytics and progress tracking.
    
    - **game_id**: The game identifier
    - **wallet_user_id**: Player's unique wallet identifier
    - **limit**: Maximum entries to return
    """
    service = WalletScoreService(db)
    scores = await service.get_score_history(game_id, wallet_user_id, limit)
    
    return [
        {
            "id": score.id,
            "game_id": score.game_id,
            "wallet_user_id": score.wallet_user_id,
            "wallet_username": score.wallet_username,
            "total_score": score.total_score,
            "level": score.level,
            "hearts_scores": score.hearts_scores,
            "challenges_completed": score.challenges_completed,
            "quests_completed": score.quests_completed,
            "collectibles_found": score.collectibles_found,
            "time_played_seconds": score.time_played_seconds,
            "scene_id": score.scene_id,
            "scene_name": score.scene_name,
            "created_at": score.created_at,
        }
        for score in scores
    ]


# ═══════════════════════════════════════════════════════════════════
#  Quick Stats Endpoints
# ═══════════════════════════════════════════════════════════════════


@router.get("/stats/{game_id}")
async def get_game_stats(
    game_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get quick stats for a game.
    
    Returns:
    - Total players
    - Top score
    - Average score
    """
    from sqlalchemy import func, select
    from app.db.wallet_score_models import WalletLeaderboardEntry
    
    result = await db.execute(
        select(
            func.count().label("total_players"),
            func.max(WalletLeaderboardEntry.best_total_score).label("top_score"),
            func.avg(WalletLeaderboardEntry.best_total_score).label("avg_score"),
        ).where(WalletLeaderboardEntry.game_id == game_id)
    )
    row = result.one()
    
    return {
        "game_id": game_id,
        "total_players": row.total_players or 0,
        "top_score": row.top_score or 0,
        "average_score": round(row.avg_score or 0, 2),
    }


# ═══════════════════════════════════════════════════════════════════
#  Score Reset (Retry / New Game)
# ═══════════════════════════════════════════════════════════════════


@router.delete("/scores/{game_id}/{wallet_user_id}")
async def reset_player_score(
    game_id: str,
    wallet_user_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete a player's leaderboard entry AND score history for a specific game.

    Called when the player presses "Retry" on the Game Over screen so their
    leaderboard slot resets to zero and a fresh run starts cleanly.
    """
    wallet_user_id = wallet_user_id.strip()

    # Delete leaderboard entry so the next submit creates a fresh one
    await db.execute(
        text(
            """
            DELETE FROM wallet_leaderboard_entries
            WHERE game_id = :game_id AND wallet_address = :wallet_address
            """
        ),
        {"game_id": game_id, "wallet_address": wallet_user_id},
    )

    # Delete all score history for this game so history is clean too
    await db.execute(
        text(
            """
            DELETE FROM wallet_game_scores
            WHERE game_id = :game_id AND wallet_address = :wallet_address
            """
        ),
        {"game_id": game_id, "wallet_address": wallet_user_id},
    )

    await db.flush()

    return {
        "status": "reset",
        "game_id": game_id,
        "wallet_user_id": wallet_user_id,
        "message": "Score and leaderboard entry deleted. Next submit will start fresh.",
    }