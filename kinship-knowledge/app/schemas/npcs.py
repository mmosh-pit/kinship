"""Pydantic schemas for NPCs — matches Studio NPC pages."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class NPCBase(BaseModel):
    name: str = Field(..., max_length=255)
    role: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facet: str | None = Field(None, pattern=r"^(H|E|A|R|T|Si|So)$")
    personality: str | None = None
    background: str | None = None
    dialogue_style: str | None = None
    catchphrases: list[str] = []
    sprite_asset_id: str | None = None
    status: str = "draft"


class NPCCreate(NPCBase):
    pass


class NPCUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facet: str | None = None
    personality: str | None = None
    background: str | None = None
    dialogue_style: str | None = None
    catchphrases: list[str] | None = None
    sprite_asset_id: str | None = None
    status: str | None = None


class NPCResponse(NPCBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
