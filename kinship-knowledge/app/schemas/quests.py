"""Pydantic schemas for Quests — includes progression logic and rewards."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class QuestBase(BaseModel):
    name: str = Field(..., max_length=255)
    beat_type: str | None = None
    facet: str | None = Field(None, pattern=r"^(H|E|A|R|T|Si|So)$")
    game_id: str | None = None
    scene_id: str | None = None
    description: str | None = None
    narrative_content: str | None = None
    completion_conditions: dict[str, Any] = {}
    prerequisites: list[Any] = []
    rewards: dict[str, Any] = {}
    learning_objectives: list[str] = []
    sequence_order: int = 1
    status: str = "draft"


class QuestCreate(QuestBase):
    pass


class QuestUpdate(BaseModel):
    name: str | None = None
    beat_type: str | None = None
    facet: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    description: str | None = None
    narrative_content: str | None = None
    completion_conditions: dict[str, Any] | None = None
    prerequisites: list[Any] | None = None
    rewards: dict[str, Any] | None = None
    learning_objectives: list[str] | None = None
    sequence_order: int | None = None
    status: str | None = None


class QuestResponse(QuestBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
