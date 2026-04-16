"""Pydantic schemas for HEARTS framework — facets + rubric."""

from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


# ── Facets ──

class HeartsFacetBase(BaseModel):
    key: str = Field(..., max_length=4)
    name: str = Field(..., max_length=50)
    description: str | None = None
    definition: str | None = None
    under_pattern: str | None = None
    over_pattern: str | None = None
    color: str | None = None


class HeartsFacetUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    definition: str | None = None
    under_pattern: str | None = None
    over_pattern: str | None = None
    color: str | None = None


class HeartsFacetResponse(HeartsFacetBase):
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Rubric ──

class HeartsRubricEntry(BaseModel):
    move_type: str = Field(..., max_length=100)
    facet_key: str = Field(..., max_length=4)
    delta: float = 0


class HeartsRubricResponse(HeartsRubricEntry):
    id: UUID
    updated_at: datetime

    model_config = {"from_attributes": True}


class HeartsRubricBulkUpdate(BaseModel):
    entries: list[HeartsRubricEntry]
