"""
Kinship Score API Routes

Simple API for game score submission and retrieval.
Self-contained score storage without leaderboard dependencies.
"""

from datetime import datetime
from typing import Optional, Dict, List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import Column, String, Integer, Float, DateTime, JSON, Index
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func

from app.db.database import Base, get_db


router = APIRouter(prefix="/api/scores", tags=["scores"])


# ═══════════════════════════════════════════════════════════════════
#  Score Model (simplified game score storage)
# ═══════════════════════════════════════════════════════════════════


class GameScore(Base):
    """
    Simple game score storage.
    Stores individual score submissions for tracking and analytics.
    """

    __tablename__ = "game_scores"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    game_id = Column(String, nullable=False, index=True)
    player_id = Column(String, nullable=False, index=True)
    player_name = Column(String, nullable=True)

    # Score data
    total_score = Column(Integer, default=0)
    level = Column(Integer, default=1)
    hearts_scores = Column(JSON, nullable=True)  # {H: 5, E: 3, ...}
    challenges_completed = Column(Integer, default=0)
    quests_completed = Column(Integer, default=0)

    # Context
    scene_id = Column(String, nullable=True)
    scene_name = Column(String, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)

    __table_args__ = (
        Index("idx_score_game_player", "game_id", "player_id"),
        Index("idx_score_game_total", "game_id", "total_score"),
        Index("idx_score_created", "created_at"),
    )


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════


class ScoreSubmitRequest(BaseModel):
    """Request to submit a game score"""

    game_id: str
    player_id: str
    player_name: Optional[str] = "Player"
    total_score: int = 0
    level: int = 1
    hearts_scores: Optional[Dict[str, int]] = None
    challenges_completed: int = 0
    quests_completed: int = 0
    scene_id: Optional[str] = None
    scene_name: Optional[str] = None


class ScoreSubmitResponse(BaseModel):
    """Response after submitting a score"""

    id: str
    game_id: str
    player_id: str
    total_score: int
    rank: Optional[int] = None
    is_high_score: bool = False
    previous_high_score: Optional[int] = None
    created_at: datetime


class LeaderboardEntryDTO(BaseModel):
    """Leaderboard entry for display"""

    rank: int
    player_id: str
    player_name: str
    score: int
    level: int
    hearts_scores: Optional[Dict[str, int]] = None
    last_played: Optional[datetime] = None


class LeaderboardResponse(BaseModel):
    """Leaderboard response"""

    game_id: str
    entries: List[LeaderboardEntryDTO]
    total_players: int
    period: str


class PlayerRankResponse(BaseModel):
    """Player rank response"""

    player_id: str
    rank: int
    total_players: int
    score: int
    percentile: int


# ═══════════════════════════════════════════════════════════════════
#  API Endpoints
# ═══════════════════════════════════════════════════════════════════


@router.post("", response_model=ScoreSubmitResponse)
async def submit_score(request: ScoreSubmitRequest, db: AsyncSession = Depends(get_db)):
    """
    Submit a game score.
    Stores the score and updates the leaderboard.
    """
    # Get player's current high score
    result = await db.execute(
        select(GameScore)
        .where(GameScore.game_id == request.game_id)
        .where(GameScore.player_id == request.player_id)
        .order_by(desc(GameScore.total_score))
        .limit(1)
    )
    previous_best = result.scalar_one_or_none()
    previous_high_score = previous_best.total_score if previous_best else 0
    is_high_score = request.total_score > previous_high_score

    # Create new score record
    score = GameScore(
        game_id=request.game_id,
        player_id=request.player_id,
        player_name=request.player_name,
        total_score=request.total_score,
        level=request.level,
        hearts_scores=request.hearts_scores,
        challenges_completed=request.challenges_completed,
        quests_completed=request.quests_completed,
        scene_id=request.scene_id,
        scene_name=request.scene_name,
    )
    db.add(score)
    await db.commit()
    await db.refresh(score)

    # Get player's rank
    rank = await _get_player_rank(db, request.game_id, request.player_id)

    return ScoreSubmitResponse(
        id=score.id,
        game_id=score.game_id,
        player_id=score.player_id,
        total_score=score.total_score,
        rank=rank,
        is_high_score=is_high_score,
        previous_high_score=previous_high_score if previous_high_score > 0 else None,
        created_at=score.created_at,
    )


@router.get("/leaderboard/{game_id}", response_model=LeaderboardResponse)
async def get_leaderboard(
    game_id: str,
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    period: str = Query("all_time", regex="^(all_time|daily|weekly|monthly)$"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get leaderboard for a game.
    Returns top players by high score.
    """
    # Build query for highest score per player
    # Using a subquery to get max score per player
    subquery = (
        select(
            GameScore.player_id,
            func.max(GameScore.total_score).label("max_score"),
        )
        .where(GameScore.game_id == game_id)
        .group_by(GameScore.player_id)
        .subquery()
    )

    # Get entries with player details
    query = (
        select(GameScore)
        .join(
            subquery,
            (GameScore.player_id == subquery.c.player_id)
            & (GameScore.total_score == subquery.c.max_score),
        )
        .where(GameScore.game_id == game_id)
        .order_by(desc(GameScore.total_score))
        .offset(offset)
        .limit(limit)
    )

    result = await db.execute(query)
    scores = result.scalars().all()

    # Get total player count
    count_result = await db.execute(
        select(func.count(func.distinct(GameScore.player_id))).where(
            GameScore.game_id == game_id
        )
    )
    total_players = count_result.scalar() or 0

    # Build response
    entries = []
    for i, score in enumerate(scores):
        entries.append(
            LeaderboardEntryDTO(
                rank=offset + i + 1,
                player_id=score.player_id,
                player_name=score.player_name or "Player",
                score=score.total_score,
                level=score.level,
                hearts_scores=score.hearts_scores,
                last_played=score.created_at,
            )
        )

    return LeaderboardResponse(
        game_id=game_id,
        entries=entries,
        total_players=total_players,
        period=period,
    )


@router.get(
    "/leaderboard/{game_id}/player/{player_id}", response_model=PlayerRankResponse
)
async def get_player_rank_endpoint(
    game_id: str,
    player_id: str,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a player's rank on the leaderboard.
    """
    # Get player's high score
    result = await db.execute(
        select(func.max(GameScore.total_score)).where(
            GameScore.game_id == game_id, GameScore.player_id == player_id
        )
    )
    player_score = result.scalar() or 0

    # Get rank
    rank = await _get_player_rank(db, game_id, player_id)

    # Get total players
    count_result = await db.execute(
        select(func.count(func.distinct(GameScore.player_id))).where(
            GameScore.game_id == game_id
        )
    )
    total_players = count_result.scalar() or 1

    # Calculate percentile
    percentile = int(((total_players - rank + 1) / total_players) * 100) if rank else 0

    return PlayerRankResponse(
        player_id=player_id,
        rank=rank or 0,
        total_players=total_players,
        score=player_score,
        percentile=percentile,
    )


class PlayerScoreResponse(BaseModel):
    """Player score data response"""

    player_id: str
    game_id: str
    total_score: int
    level: int
    hearts_scores: Optional[Dict[str, int]] = None
    challenges_completed: int = 0
    quests_completed: int = 0
    last_played: Optional[datetime] = None


@router.get("/player/{player_id}", response_model=PlayerScoreResponse)
async def get_player_score(
    player_id: str,
    game_id: str = Query(..., description="Game ID to get score for"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get a player's current score and progress for a specific game.
    Returns the player's highest score entry.
    """
    # Get the player's most recent high score entry
    result = await db.execute(
        select(GameScore)
        .where(GameScore.game_id == game_id, GameScore.player_id == player_id)
        .order_by(GameScore.total_score.desc())
        .limit(1)
    )
    score_entry = result.scalar_one_or_none()

    if not score_entry:
        raise HTTPException(status_code=404, detail="Player score not found")

    return PlayerScoreResponse(
        player_id=score_entry.player_id,
        game_id=score_entry.game_id,
        total_score=score_entry.total_score,
        level=score_entry.level,
        hearts_scores=score_entry.hearts_scores,
        challenges_completed=score_entry.challenges_completed,
        quests_completed=score_entry.quests_completed,
        last_played=score_entry.created_at,
    )


@router.get("/leaderboard/{game_id}/player/{player_id}/nearby")
async def get_nearby_entries(
    game_id: str,
    player_id: str,
    above: int = Query(2, ge=0, le=10),
    below: int = Query(2, ge=0, le=10),
    db: AsyncSession = Depends(get_db),
):
    """
    Get leaderboard entries around a player's rank.
    """
    # Get player's rank first
    rank = await _get_player_rank(db, game_id, player_id)
    if not rank:
        raise HTTPException(status_code=404, detail="Player not found on leaderboard")

    # Calculate offset
    start_rank = max(1, rank - above)
    limit = above + below + 1

    # Get entries
    response = await get_leaderboard(
        game_id=game_id,
        limit=limit,
        offset=start_rank - 1,
        period="all_time",
        db=db,
    )

    return response.entries


async def _get_player_rank(
    db: AsyncSession, game_id: str, player_id: str
) -> Optional[int]:
    """Get a player's rank on the leaderboard."""
    # Get player's high score
    result = await db.execute(
        select(func.max(GameScore.total_score)).where(
            GameScore.game_id == game_id, GameScore.player_id == player_id
        )
    )
    player_score = result.scalar()

    if player_score is None:
        return None

    # Count players with higher score
    count_result = await db.execute(
        select(func.count(func.distinct(GameScore.player_id))).where(
            GameScore.game_id == game_id,
            GameScore.total_score > player_score,
        )
    )
    players_above = count_result.scalar() or 0

    return players_above + 1
