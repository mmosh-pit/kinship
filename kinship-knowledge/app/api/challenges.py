"""Challenges REST API."""

import math
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.api import crud
from app.db.database import get_db
from app.db.models import Challenge
from app.schemas.challenges import (
    ChallengeCreate,
    ChallengeResponse,
    ChallengeUpdate,
    PaginatedChallengeResponse,
    PaginationMeta,
)

router = APIRouter(prefix="/api/challenges", tags=["Challenges"])


def _normalize_to_string_list(value: list) -> list[str]:
    """Normalize a JSONB list field to a list of plain strings.

    Database may store either:
    - Plain strings: "some hint"
    - Dicts with 'type' key: {"type": "some hint"}

    ChallengeResponse expects list[str], so extract the string value.
    """
    result = []
    for item in value or []:
        if isinstance(item, dict):
            # Extract text from dict — try common keys
            text = (
                item.get("type") or item.get("text") or item.get("value") or str(item)
            )
            result.append(str(text))
        else:
            result.append(str(item))
    return result


def _normalize_list_of_dicts(value: list) -> list[dict]:
    """Ensure every entry in a JSONB list field is a dict.

    For fields that expect list[dict] (e.g. correct_answers, steps).
    """
    result = []
    for item in value or []:
        if isinstance(item, dict):
            result.append(item)
        else:
            result.append({"type": str(item)})
    return result


def _normalize_challenge(item: Challenge) -> Challenge:
    """Normalize JSONB list fields on a Challenge ORM object in-place.

    - hints and learning_objectives → list[str] (schema expects strings)
    - correct_answers, success_conditions → list[dict] (schema expects dicts)
    """
    # These fields expect list[str] per ChallengeResponse schema
    item.hints = _normalize_to_string_list(item.hints)
    item.learning_objectives = _normalize_to_string_list(item.learning_objectives)

    # These fields expect list[dict]
    item.correct_answers = _normalize_list_of_dicts(item.correct_answers)
    item.success_conditions = _normalize_list_of_dicts(
        getattr(item, "success_conditions", None)
    )
    return item


@router.get("", response_model=PaginatedChallengeResponse)
async def list_challenges(
    game_id: str | None = Query(None, description="Filter by game ID"),
    scene_id: str | None = Query(None, description="Filter by scene ID"),
    difficulty: str | None = Query(
        None, description="Filter by difficulty (easy, medium, hard)"
    ),
    status: str | None = Query(
        None, description="Filter by status (draft, active, archived)"
    ),
    page: int = Query(1, ge=1, description="Page number (1-indexed)"),
    limit: int = Query(20, ge=1, le=100, description="Items per page (max 100)"),
    db: AsyncSession = Depends(get_db),
):
    """List challenges with pagination.

    Returns paginated list of challenges with metadata.

    Example response:
    ```json
    {
        "data": [...],
        "pagination": {
            "page": 1,
            "limit": 20,
            "total": 74,
            "total_pages": 4
        }
    }
    ```
    """
    # Convert page to skip (page is 1-indexed)
    skip = (page - 1) * limit

    items, total = await crud.get_all(
        db,
        Challenge,
        {
            "game_id": game_id,
            "scene_id": scene_id,
            "difficulty": difficulty,
            "status": status,
        },
        skip,
        limit,
    )

    # Normalize each challenge
    normalized_items = [_normalize_challenge(item) for item in items]

    # Calculate total pages
    total_pages = math.ceil(total / limit) if total > 0 else 1

    return PaginatedChallengeResponse(
        data=normalized_items,
        pagination=PaginationMeta(
            page=page,
            limit=limit,
            total=total,
            total_pages=total_pages,
        ),
    )


@router.post("", response_model=ChallengeResponse, status_code=201)
async def create_challenge(body: ChallengeCreate, db: AsyncSession = Depends(get_db)):
    return await crud.create(db, Challenge, body.model_dump())


@router.get("/{id}", response_model=ChallengeResponse)
async def get_challenge(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Challenge, id)
    if not item:
        raise HTTPException(404, "Challenge not found")
    return _normalize_challenge(item)


@router.put("/{id}", response_model=ChallengeResponse)
async def update_challenge(
    id: UUID, body: ChallengeUpdate, db: AsyncSession = Depends(get_db)
):
    item = await crud.get_by_id(db, Challenge, id)
    if not item:
        raise HTTPException(404, "Challenge not found")
    return await crud.update(db, item, body.model_dump(exclude_unset=True))


@router.delete("/{id}", status_code=204)
async def delete_challenge(id: UUID, db: AsyncSession = Depends(get_db)):
    item = await crud.get_by_id(db, Challenge, id)
    if not item:
        raise HTTPException(404, "Challenge not found")
    await crud.delete(db, item)
