"""Players REST API — profiles + conversation history."""
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.database import get_db
from app.db.models import PlayerProfile, ConversationHistory
from app.schemas.players import PlayerCreate, PlayerResponse, PlayerUpdate

router = APIRouter(prefix="/api/players", tags=["Players"])

@router.post("", response_model=PlayerResponse, status_code=201)
async def create_player(body: PlayerCreate, db: AsyncSession = Depends(get_db)):
    # Check if user_id already exists
    existing = await db.execute(
        select(PlayerProfile).where(PlayerProfile.user_id == body.user_id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Player already exists for this user_id")

    player = PlayerProfile(**body.model_dump())
    db.add(player)
    await db.flush()
    await db.refresh(player)
    return player

@router.get("/{player_id}", response_model=PlayerResponse)
async def get_player(player_id: UUID, db: AsyncSession = Depends(get_db)):
    player = await db.get(PlayerProfile, player_id)
    if not player: raise HTTPException(404, "Player not found")
    return player

@router.get("/by-user/{user_id}", response_model=PlayerResponse)
async def get_player_by_user(user_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(PlayerProfile).where(PlayerProfile.user_id == user_id)
    )
    player = result.scalar_one_or_none()
    if not player: raise HTTPException(404, "Player not found")
    return player

@router.put("/{player_id}", response_model=PlayerResponse)
async def update_player(player_id: UUID, body: PlayerUpdate, db: AsyncSession = Depends(get_db)):
    player = await db.get(PlayerProfile, player_id)
    if not player: raise HTTPException(404, "Player not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(player, key, value)
    await db.flush()
    await db.refresh(player)
    return player

@router.get("/{player_id}/history")
async def get_player_history(
    player_id: UUID,
    npc_id: UUID | None = Query(None),
    scene_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
):
    query = (
        select(ConversationHistory)
        .where(ConversationHistory.player_id == player_id)
        .order_by(ConversationHistory.created_at.desc())
        .limit(limit)
    )
    if npc_id:
        query = query.where(ConversationHistory.npc_id == npc_id)
    if scene_id:
        query = query.where(ConversationHistory.scene_id == scene_id)

    result = await db.execute(query)
    rows = result.scalars().all()
    return [
        {
            "id": str(r.id),
            "npc_id": str(r.npc_id) if r.npc_id else None,
            "scene_id": r.scene_id,
            "role": r.role,
            "content": r.content,
            "hearts_deltas": r.hearts_deltas,
            "created_at": r.created_at.isoformat(),
        }
        for r in reversed(rows)  # chronological order
    ]
