"""Quests REST API."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import Quest
from app.schemas.quests import QuestCreate, QuestResponse, QuestUpdate

router = APIRouter(prefix="/api/quests", tags=["Quests"])


@router.get("", response_model=list[QuestResponse])
async def list_quests(
    game_id: str | None = Query(None),
    scene_id: str | None = Query(None),
    beat_type: str | None = Query(None),
    facet: str | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    items, _ = await crud.get_all(
        db,
        Quest,
        {
            "game_id": game_id,
            "scene_id": scene_id,
            "beat_type": beat_type,
            "facet": facet,
        },
        skip,
        limit,
        order_by="sequence_order",
        order_desc=False,
    )
    return items


@router.post("", response_model=QuestResponse, status_code=201)
async def create_quest(body: QuestCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, Quest, body.model_dump())


@router.get("/{id}", response_model=QuestResponse)
async def get_quest(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Quest, id)
    if not item:
        raise HTTPException(404, "Quest not found")
    return item


@router.put("/{id}", response_model=QuestResponse)
async def update_quest(id: UUID, body: QuestUpdate, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Quest, id)
    if not item:
        raise HTTPException(404, "Quest not found")
    return await crud.update(db, item, body.model_dump(exclude_unset=True))


@router.delete("/{id}", status_code=204)
async def delete_quest(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Quest, id)
    if not item:
        raise HTTPException(404, "Quest not found")
    await crud.delete(db, item)
