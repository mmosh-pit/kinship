"""NPCs REST API — CRUD for NPC entities."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.db.database import get_db
from app.db.models import NPC
from app.schemas.npcs import NPCCreate, NPCResponse, NPCUpdate

router = APIRouter(prefix="/api/npcs", tags=["NPCs"])


@router.get("", response_model=list[NPCResponse])
async def list_npcs(
    game_id: str | None = Query(None),
    scene_id: str | None = Query(None),
    facet: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    filters = {
        "game_id": game_id,
        "scene_id": scene_id,
        "facet": facet,
        "status": status,
    }
    items, _ = await crud.get_all(db, NPC, filters=filters, skip=skip, limit=limit)
    return items


@router.post("", response_model=NPCResponse, status_code=201)
async def create_npc(body: NPCCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, NPC, body.model_dump())


@router.get("/{npc_id}", response_model=NPCResponse)
async def get_npc(npc_id: UUID, db: AsyncSession = Depends(get_db)):
    npc = await crud.get_by_id(db, NPC, npc_id)
    if not npc:
        raise HTTPException(404, "NPC not found")
    return npc


@router.put("/{npc_id}", response_model=NPCResponse)
async def update_npc(npc_id: UUID, body: NPCUpdate, db: AsyncSession = Depends(get_db)):
    npc = await crud.get_by_id(db, NPC, npc_id)
    if not npc:
        raise HTTPException(404, "NPC not found")
    return await crud.update(db, npc, body.model_dump(exclude_unset=True))


@router.delete("/{npc_id}", status_code=204)
async def delete_npc(npc_id: UUID, db: AsyncSession = Depends(get_db)):
    npc = await crud.get_by_id(db, NPC, npc_id)
    if not npc:
        raise HTTPException(404, "NPC not found")
    await crud.delete(db, npc)
