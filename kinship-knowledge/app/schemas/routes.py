"""Pydantic schemas for Routes — scene transitions."""

from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class RouteBase(BaseModel):
    name: str = Field(..., max_length=255)
    game_id: str | None = None
    from_scene: str | None = None
    to_scene: str | None = None
    description: str | None = None
    trigger_type: str | None = (
        None  # quest_complete, challenge_complete, npc_dialogue, exit_zone, hearts_threshold, manual
    )
    trigger_value: str | None = None
    conditions: list[dict[str, Any]] = (
        []
    )  # [{type: "quest_complete", quest_name: "..."}, ...]
    bidirectional: bool = False
    show_in_map: bool = True
    hidden_until_triggered: bool = False
    status: str = "draft"


class RouteCreate(RouteBase):
    pass


class RouteUpdate(BaseModel):
    name: str | None = None
    game_id: str | None = None
    from_scene: str | None = None
    to_scene: str | None = None
    description: str | None = None
    trigger_type: str | None = None
    trigger_value: str | None = None
    conditions: list[dict[str, Any]] | None = None
    bidirectional: bool | None = None
    show_in_map: bool | None = None
    hidden_until_triggered: bool | None = None
    status: str | None = None


class RouteResponse(RouteBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
