"""
Kinship Player Game Progress API Routes

Stores and retrieves per-player, per-game, per-scene checkpoint data.
When a player exits mid-game and returns, the frontend fetches this record
and resumes exactly from the challenge they left off at.

Key identifiers (same as wallet score system):
  game_id        - stable game / scene identifier
  wallet_user_id - wallet address or stable anonymous ID
  scene_id       - current scene the player is in
"""

import json
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/progress", tags=["game-progress"])


# ═══════════════════════════════════════════════════════════════════
#  Pydantic Schemas
# ═══════════════════════════════════════════════════════════════════


class GameProgressSave(BaseModel):
    """Request body for saving / updating game progress."""

    game_id: str
    wallet_user_id: str
    scene_id: str
    scene_name: Optional[str] = None
    scene_level: int = 1

    # Challenge progress
    completed_challenge_ids: List[str] = Field(default_factory=list)
    challenge_scores: Dict[str, int] = Field(default_factory=dict)
    last_challenge_index: int = 0

    # Quest progress
    completed_quest_ids: List[str] = Field(default_factory=list)

    # Scores
    total_score: int = 0
    level: int = 1
    xp: int = 0
    hearts_scores: Dict[str, int] = Field(default_factory=dict)

    # Full state snapshot
    inventory: Dict[str, int] = Field(default_factory=dict)
    visited_zones: List[str] = Field(default_factory=list)
    unlocked_routes: List[str] = Field(default_factory=list)
    extra_state: Dict[str, Any] = Field(default_factory=dict)


class GameProgressResponse(BaseModel):
    """Response with persisted game progress."""

    id: str
    game_id: str
    wallet_user_id: str
    scene_id: str
    scene_name: Optional[str]
    scene_level: int

    completed_challenge_ids: List[str]
    challenge_scores: Dict[str, int]
    last_challenge_index: int

    completed_quest_ids: List[str]

    total_score: int
    level: int
    xp: int
    hearts_scores: Dict[str, int]

    inventory: Dict[str, int]
    visited_zones: List[str]
    unlocked_routes: List[str]
    extra_state: Dict[str, Any]

    created_at: datetime
    updated_at: datetime


# ═══════════════════════════════════════════════════════════════════
#  Helpers
# ═══════════════════════════════════════════════════════════════════


def _parse_json_field(value, default):
    """Safely parse a JSON field that may already be a dict/list or a raw string."""
    if value is None:
        return default
    if isinstance(value, (dict, list)):
        return value
    try:
        return json.loads(value)
    except Exception:
        return default


def _row_to_response(row) -> GameProgressResponse:
    return GameProgressResponse(
        id=row[0],
        game_id=row[1],
        wallet_user_id=row[2],
        scene_id=row[3],
        scene_name=row[4],
        scene_level=row[5] or 1,
        completed_challenge_ids=_parse_json_field(row[6], []),
        challenge_scores=_parse_json_field(row[7], {}),
        last_challenge_index=row[8] or 0,
        completed_quest_ids=_parse_json_field(row[9], []),
        total_score=row[10] or 0,
        level=row[11] or 1,
        xp=row[12] or 0,
        hearts_scores=_parse_json_field(row[13], {}),
        inventory=_parse_json_field(row[14], {}),
        visited_zones=_parse_json_field(row[15], []),
        unlocked_routes=_parse_json_field(row[16], []),
        extra_state=_parse_json_field(row[17], {}),
        created_at=row[18],
        updated_at=row[19],
    )


# ═══════════════════════════════════════════════════════════════════
#  Endpoints
# ═══════════════════════════════════════════════════════════════════


@router.get("/{game_id}/{wallet_user_id}", response_model=GameProgressResponse)
async def get_progress(
    game_id: str,
    wallet_user_id: str,
    scene_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Get a player's saved progress for a game.

    If **scene_id** is provided, returns progress for that specific scene.
    Otherwise returns the most recently updated scene progress record.

    Returns 404 when no progress has been saved yet (new player / first session).
    """
    wallet_user_id = wallet_user_id.strip()

    if scene_id:
        result = await db.execute(
            text(
                """
                SELECT id, game_id, wallet_user_id, scene_id, scene_name, scene_level,
                       completed_challenge_ids, challenge_scores, last_challenge_index,
                       completed_quest_ids, total_score, level, xp, hearts_scores,
                       inventory, visited_zones, unlocked_routes, extra_state,
                       created_at, updated_at
                FROM wallet_game_progress
                WHERE game_id = :game_id
                  AND wallet_user_id = :wallet_user_id
                  AND scene_id = :scene_id
                LIMIT 1
                """
            ),
            {
                "game_id": game_id,
                "wallet_user_id": wallet_user_id,
                "scene_id": scene_id,
            },
        )
    else:
        result = await db.execute(
            text(
                """
                SELECT id, game_id, wallet_user_id, scene_id, scene_name, scene_level,
                       completed_challenge_ids, challenge_scores, last_challenge_index,
                       completed_quest_ids, total_score, level, xp, hearts_scores,
                       inventory, visited_zones, unlocked_routes, extra_state,
                       created_at, updated_at
                FROM wallet_game_progress
                WHERE game_id = :game_id
                  AND wallet_user_id = :wallet_user_id
                ORDER BY updated_at DESC
                LIMIT 1
                """
            ),
            {"game_id": game_id, "wallet_user_id": wallet_user_id},
        )

    row = result.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="No progress found")

    return _row_to_response(row)


@router.post("", response_model=GameProgressResponse)
async def save_progress(
    payload: GameProgressSave,
    db: AsyncSession = Depends(get_db),
):
    """
    Create or update game progress (upsert).

    On every challenge completion, navigation, or game exit the client sends
    the full current state here so the player can resume from exactly this
    point if they return.
    """
    wallet_user_id = payload.wallet_user_id.strip()
    now = datetime.utcnow()

    # Check if a record already exists for this (game, wallet, scene) triple.
    check = await db.execute(
        text(
            """
            SELECT id FROM wallet_game_progress
            WHERE game_id = :game_id
              AND wallet_user_id = :wallet_user_id
              AND scene_id = :scene_id
            LIMIT 1
            """
        ),
        {
            "game_id": payload.game_id,
            "wallet_user_id": wallet_user_id,
            "scene_id": payload.scene_id,
        },
    )
    existing = check.fetchone()

    params = {
        "game_id": payload.game_id,
        "wallet_user_id": wallet_user_id,
        "scene_id": payload.scene_id,
        "scene_name": payload.scene_name,
        "scene_level": payload.scene_level,
        "completed_challenge_ids": json.dumps(payload.completed_challenge_ids),
        "challenge_scores": json.dumps(payload.challenge_scores),
        "last_challenge_index": payload.last_challenge_index,
        "completed_quest_ids": json.dumps(payload.completed_quest_ids),
        "total_score": payload.total_score,
        "level": payload.level,
        "xp": payload.xp,
        "hearts_scores": json.dumps(payload.hearts_scores),
        "inventory": json.dumps(payload.inventory),
        "visited_zones": json.dumps(payload.visited_zones),
        "unlocked_routes": json.dumps(payload.unlocked_routes),
        "extra_state": json.dumps(payload.extra_state),
        "updated_at": now,
    }

    if existing:
        record_id = existing[0]
        await db.execute(
            text(
                """
                UPDATE wallet_game_progress SET
                    scene_name              = :scene_name,
                    scene_level             = :scene_level,
                    completed_challenge_ids = :completed_challenge_ids::jsonb,
                    challenge_scores        = :challenge_scores::jsonb,
                    last_challenge_index    = :last_challenge_index,
                    completed_quest_ids     = :completed_quest_ids::jsonb,
                    total_score             = :total_score,
                    level                   = :level,
                    xp                      = :xp,
                    hearts_scores           = :hearts_scores::jsonb,
                    inventory               = :inventory::jsonb,
                    visited_zones           = :visited_zones::jsonb,
                    unlocked_routes         = :unlocked_routes::jsonb,
                    extra_state             = :extra_state::jsonb,
                    updated_at              = :updated_at
                WHERE game_id = :game_id
                  AND wallet_user_id = :wallet_user_id
                  AND scene_id = :scene_id
                """
            ),
            params,
        )
        logger.info(
            "[Progress] Updated record %s for game=%s wallet=%s scene=%s "
            "challenges=%d score=%d",
            record_id,
            payload.game_id,
            wallet_user_id,
            payload.scene_id,
            len(payload.completed_challenge_ids),
            payload.total_score,
        )
    else:
        record_id = str(uuid4())
        params["id"] = record_id
        params["created_at"] = now
        await db.execute(
            text(
                """
                INSERT INTO wallet_game_progress (
                    id, game_id, wallet_user_id, scene_id, scene_name, scene_level,
                    completed_challenge_ids, challenge_scores, last_challenge_index,
                    completed_quest_ids, total_score, level, xp, hearts_scores,
                    inventory, visited_zones, unlocked_routes, extra_state,
                    created_at, updated_at
                ) VALUES (
                    :id, :game_id, :wallet_user_id, :scene_id, :scene_name, :scene_level,
                    :completed_challenge_ids::jsonb, :challenge_scores::jsonb, :last_challenge_index,
                    :completed_quest_ids::jsonb, :total_score, :level, :xp, :hearts_scores::jsonb,
                    :inventory::jsonb, :visited_zones::jsonb, :unlocked_routes::jsonb, :extra_state::jsonb,
                    :created_at, :updated_at
                )
                """
            ),
            params,
        )
        logger.info(
            "[Progress] Created record %s for game=%s wallet=%s scene=%s",
            record_id,
            payload.game_id,
            wallet_user_id,
            payload.scene_id,
        )

    await db.commit()

    # Fetch and return the saved record.
    fetch = await db.execute(
        text(
            """
            SELECT id, game_id, wallet_user_id, scene_id, scene_name, scene_level,
                   completed_challenge_ids, challenge_scores, last_challenge_index,
                   completed_quest_ids, total_score, level, xp, hearts_scores,
                   inventory, visited_zones, unlocked_routes, extra_state,
                   created_at, updated_at
            FROM wallet_game_progress
            WHERE id = :id
            """
        ),
        {"id": record_id},
    )
    row = fetch.fetchone()
    return _row_to_response(row)


@router.delete("/{game_id}/{wallet_user_id}")
async def reset_progress(
    game_id: str,
    wallet_user_id: str,
    scene_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    """
    Delete saved progress (full reset or single scene).

    - With **scene_id**: deletes only that scene's checkpoint.
    - Without **scene_id**: deletes ALL checkpoints for this player in this game.
    """
    wallet_user_id = wallet_user_id.strip()

    if scene_id:
        await db.execute(
            text(
                """
                DELETE FROM wallet_game_progress
                WHERE game_id = :game_id
                  AND wallet_user_id = :wallet_user_id
                  AND scene_id = :scene_id
                """
            ),
            {
                "game_id": game_id,
                "wallet_user_id": wallet_user_id,
                "scene_id": scene_id,
            },
        )
        await db.commit()
        return {"status": "deleted", "scope": "scene", "scene_id": scene_id}
    else:
        result = await db.execute(
            text(
                """
                DELETE FROM wallet_game_progress
                WHERE game_id = :game_id AND wallet_user_id = :wallet_user_id
                """
            ),
            {"game_id": game_id, "wallet_user_id": wallet_user_id},
        )
        await db.commit()
        return {"status": "deleted", "scope": "game"}