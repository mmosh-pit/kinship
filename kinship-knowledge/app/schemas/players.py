"""Pydantic schemas for Player profiles."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PlayerCreate(BaseModel):
    user_id: str = Field(..., max_length=255)
    display_name: str | None = None


class PlayerResponse(BaseModel):
    id: UUID
    user_id: str
    display_name: str | None
    hearts_scores: dict[str, float]
    current_scene: str | None
    completed_quests: list
    completed_challenges: list
    met_npcs: list
    inventory: list
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class PlayerUpdate(BaseModel):
    display_name: str | None = None
    current_scene: str | None = None
    hearts_scores: dict[str, float] | None = None
