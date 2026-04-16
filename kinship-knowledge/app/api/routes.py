"""Routes REST API."""

from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import Route
from app.schemas.routes import RouteCreate, RouteResponse, RouteUpdate

router = APIRouter(prefix="/api/routes", tags=["Routes"])


@router.get("", response_model=list[RouteResponse])
async def list_routes(
    game_id: str | None = Query(None),
    from_scene: str | None = Query(None),
    to_scene: str | None = Query(None),
    status: str | None = Query(None),
    skip: int = 0,
    limit: int = 100,
    db: AsyncSession = Depends(get_db),
):
    items, _ = await crud.get_all(
        db,
        Route,
        {
            "game_id": game_id,
            "from_scene": from_scene,
            "to_scene": to_scene,
            "status": status,
        },
        skip,
        limit,
    )
    return items


@router.post("", response_model=RouteResponse, status_code=201)
async def create_route(body: RouteCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, Route, body.model_dump())


@router.get("/{id}", response_model=RouteResponse)
async def get_route(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Route, id)
    if not item:
        raise HTTPException(404, "Route not found")
    return item


@router.put("/{id}", response_model=RouteResponse)
async def update_route(id: UUID, body: RouteUpdate, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Route, id)
    if not item:
        raise HTTPException(404, "Route not found")
    return await crud.update(db, item, body.model_dump(exclude_unset=True))


@router.delete("/{id}", status_code=204)
async def delete_route(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Route, id)
    if not item:
        raise HTTPException(404, "Route not found")
    await crud.delete(db, item)
