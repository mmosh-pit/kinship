"""Prompts REST API — three-tier prompt management."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import Prompt
from app.schemas.prompts import PromptCreate, PromptResponse, PromptUpdate

router = APIRouter(prefix="/api/prompts", tags=["Prompts"])


def estimate_tokens(text: str | None) -> int:
    """Rough token estimate: ~4 chars per token."""
    if not text:
        return 0
    return len(text) // 4


@router.get("", response_model=list[PromptResponse])
async def list_prompts(
    tier: int | None = Query(None),
    category: str | None = Query(None),
    scene_type: str | None = Query(None),
    npc_id: UUID | None = Query(None),
    is_guardian: bool | None = Query(None),
    status: str | None = Query(None),
    platform_id: UUID | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    filters = {
        "tier": tier,
        "category": category,
        "scene_type": scene_type,
        "npc_id": npc_id,
        "is_guardian": is_guardian,
        "status": status,
        "platform_id": platform_id,
    }
    items, _ = await crud.get_all(db, Prompt, filters, skip, limit)
    return items


@router.post("", response_model=PromptResponse, status_code=201)
async def create_prompt(body: PromptCreate, db: AsyncSession = Depends(get_db)):
    data = body.model_dump()
    return await crud.create(db, Prompt, data)


@router.get("/{id}", response_model=PromptResponse)
async def get_prompt(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Prompt, id)
    if not item:
        raise HTTPException(404, "Prompt not found")
    return item


@router.put("/{id}", response_model=PromptResponse)
async def update_prompt(
    id: UUID, body: PromptUpdate, db: AsyncSession = Depends(get_db)
):
    item = await crud.get_by_id(db, Prompt, id)
    if not item:
        raise HTTPException(404, "Prompt not found")
    data = body.model_dump(exclude_unset=True)
    return await crud.update(db, item, data)


@router.delete("/{id}", status_code=204)
async def delete_prompt(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Prompt, id)
    if not item:
        raise HTTPException(404, "Prompt not found")
    await crud.delete(db, item)
