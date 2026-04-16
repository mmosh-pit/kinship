"""Pydantic schemas for Prompts — three-tier system."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class PromptBase(BaseModel):
    tier: int = Field(..., ge=1, le=3)
    name: str = Field(..., max_length=255)
    content: str | None = None
    category: str = "instructions"
    scene_type: str | None = None
    npc_id: UUID | None = None
    priority: int = 100
    is_guardian: bool = False
    status: str = "draft"
    platform_id: UUID | None = None


class PromptCreate(PromptBase):
    pass


class PromptUpdate(BaseModel):
    tier: int | None = None
    name: str | None = None
    content: str | None = None
    category: str | None = None
    scene_type: str | None = None
    npc_id: UUID | None = None
    priority: int | None = None
    is_guardian: bool | None = None
    status: str | None = None
    platform_id: UUID | None = None


class PromptResponse(PromptBase):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
