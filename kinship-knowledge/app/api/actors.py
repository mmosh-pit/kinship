"""Actors REST API — CRUD for all game actors (characters, creatures, collectibles, etc).

Serves both:
  /api/actors       — new canonical endpoint
  /api/npcs         — backward-compatible alias (same behavior)

actor_type filter: ?actor_type=character,creature
"""

import math
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.api import crud
from app.db.database import get_db
from app.db.models import Actor
from app.schemas.actors import ActorCreate, ActorResponse, ActorUpdate


# ═══════════════════════════════════════════════════════════════════════════════
#  PAGINATION SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    page: int
    limit: int
    total: int
    total_pages: int


class PaginatedActorResponse(BaseModel):
    """Paginated list of actors."""

    data: list[ActorResponse]
    pagination: PaginationMeta


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTERS
# ═══════════════════════════════════════════════════════════════════════════════


# Two routers — same handlers
actors_router = APIRouter(prefix="/api/actors", tags=["Actors"])
npcs_router = APIRouter(prefix="/api/npcs", tags=["Actors"])  # backward compat


async def _list_actors(
    game_id: str | None,
    scene_id: str | None,
    actor_type: str | None,
    facet: str | None,
    status: str | None,
    skip: int,
    limit: int,
    db: AsyncSession,
) -> tuple[list[Actor], int]:
    """List actors with filters. Returns (items, total_count)."""
    query = select(Actor)
    if game_id:
        query = query.where(Actor.game_id == game_id)
    if scene_id:
        query = query.where(Actor.scene_id == scene_id)
    if actor_type:
        # Support comma-separated: ?actor_type=character,creature
        types = [t.strip() for t in actor_type.split(",")]
        if len(types) == 1:
            query = query.where(Actor.actor_type == types[0])
        else:
            query = query.where(Actor.actor_type.in_(types))
    if facet:
        query = query.where(Actor.facet == facet)
    if status:
        query = query.where(Actor.status == status)

    # Get total count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Apply pagination and ordering
    query = query.order_by(Actor.created_at.desc()).offset(skip).limit(limit)
    result = await db.execute(query)
    return list(result.scalars().all()), total


async def _create_actor(body: ActorCreate, db: AsyncSession):
    return await crud.create(db, Actor, body.model_dump())


async def _get_actor(actor_id: UUID, db: AsyncSession):
    actor = await crud.get_by_id(db, Actor, actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")
    return actor


async def _update_actor(actor_id: UUID, body: ActorUpdate, db: AsyncSession):
    actor = await crud.get_by_id(db, Actor, actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")
    return await crud.update(db, actor, body.model_dump(exclude_unset=True))


async def _delete_actor(actor_id: UUID, db: AsyncSession):
    actor = await crud.get_by_id(db, Actor, actor_id)
    if not actor:
        raise HTTPException(404, "Actor not found")
    await crud.delete(db, actor)


# ═══ /api/actors ═══


@actors_router.get("", response_model=PaginatedActorResponse)
async def list_actors(
    game_id: str | None = Query(None, description="Filter by game ID"),
    scene_id: str | None = Query(None, description="Filter by scene ID"),
    actor_type: str | None = Query(
        None,
        description="Filter by type: character,creature,collectible,obstacle,interactive,ambient,enemy,companion",
    ),
    facet: str | None = Query(None, description="Filter by HEARTS facet"),
    status: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_db),
):
    """List actors with pagination."""
    skip = (page - 1) * limit
    items, total = await _list_actors(
        game_id, scene_id, actor_type, facet, status, skip, limit, db
    )
    total_pages = math.ceil(total / limit) if total > 0 else 1
    return PaginatedActorResponse(
        data=items,
        pagination=PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@actors_router.post("", response_model=ActorResponse, status_code=201)
async def create_actor(body: ActorCreate, db: AsyncSession = Depends(get_db)):
    return await _create_actor(body, db)


@actors_router.get("/{actor_id}", response_model=ActorResponse)
async def get_actor(actor_id: UUID, db: AsyncSession = Depends(get_db)):
    return await _get_actor(actor_id, db)


@actors_router.put("/{actor_id}", response_model=ActorResponse)
async def update_actor(
    actor_id: UUID, body: ActorUpdate, db: AsyncSession = Depends(get_db)
):
    return await _update_actor(actor_id, body, db)


@actors_router.delete("/{actor_id}", status_code=204)
async def delete_actor(actor_id: UUID, db: AsyncSession = Depends(get_db)):
    return await _delete_actor(actor_id, db)


# ═══ /api/npcs (backward compat — identical behavior) ═══


@npcs_router.get("", response_model=PaginatedActorResponse)
async def list_npcs(
    game_id: str | None = Query(None, description="Filter by game ID"),
    scene_id: str | None = Query(None, description="Filter by scene ID"),
    actor_type: str | None = Query(None, description="Filter by actor type"),
    facet: str | None = Query(None, description="Filter by HEARTS facet"),
    status: str | None = Query(None, description="Filter by status"),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(10, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_db),
):
    """List NPCs with pagination."""
    skip = (page - 1) * limit
    items, total = await _list_actors(
        game_id, scene_id, actor_type, facet, status, skip, limit, db
    )
    total_pages = math.ceil(total / limit) if total > 0 else 1
    return PaginatedActorResponse(
        data=items,
        pagination=PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@npcs_router.post("", response_model=ActorResponse, status_code=201)
async def create_npc(body: ActorCreate, db: AsyncSession = Depends(get_db)):
    return await _create_actor(body, db)


@npcs_router.get("/{npc_id}", response_model=ActorResponse)
async def get_npc(npc_id: UUID, db: AsyncSession = Depends(get_db)):
    return await _get_actor(npc_id, db)


@npcs_router.put("/{npc_id}", response_model=ActorResponse)
async def update_npc(
    npc_id: UUID, body: ActorUpdate, db: AsyncSession = Depends(get_db)
):
    return await _update_actor(npc_id, body, db)


@npcs_router.delete("/{npc_id}", status_code=204)
async def delete_npc(npc_id: UUID, db: AsyncSession = Depends(get_db)):
    return await _delete_actor(npc_id, db)
