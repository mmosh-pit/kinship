"""Generic async CRUD operations for SQLAlchemy models."""

from typing import Any, Sequence, Type, TypeVar
from uuid import UUID

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import Base

ModelType = TypeVar("ModelType", bound=Base)


async def get_all(
    db: AsyncSession,
    model: Type[ModelType],
    filters: dict[str, Any] | None = None,
    skip: int = 0,
    limit: int = 100,
    order_by: str = "created_at",
    order_desc: bool = True,
) -> tuple[Sequence[ModelType], int]:
    """Get paginated list with optional filters. Returns (items, total_count)."""
    query = select(model)

    if filters:
        for key, value in filters.items():
            if value is not None and hasattr(model, key):
                query = query.where(getattr(model, key) == value)

    # Count
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Order & paginate
    col = getattr(model, order_by, None) or getattr(model, "created_at")
    query = query.order_by(col.desc() if order_desc else col.asc())
    query = query.offset(skip).limit(limit)

    result = await db.execute(query)
    return result.scalars().all(), total


async def get_by_id(db: AsyncSession, model: Type[ModelType], id: UUID) -> ModelType | None:
    """Get single entity by primary key UUID."""
    return await db.get(model, id)


async def get_by_key(db: AsyncSession, model: Type[ModelType], key: str) -> ModelType | None:
    """Get entity by string primary key (e.g. hearts_facets.key)."""
    return await db.get(model, key)


async def create(db: AsyncSession, model: Type[ModelType], data: dict) -> ModelType:
    """Create a new entity."""
    instance = model(**data)
    db.add(instance)
    await db.flush()
    await db.refresh(instance)
    return instance


async def update(db: AsyncSession, instance: ModelType, data: dict) -> ModelType:
    """Update an existing entity with non-None fields."""
    for key, value in data.items():
        if value is not None:
            setattr(instance, key, value)
    await db.flush()
    await db.refresh(instance)
    return instance


async def delete(db: AsyncSession, instance: ModelType) -> None:
    """Delete an entity."""
    await db.delete(instance)
    await db.flush()
