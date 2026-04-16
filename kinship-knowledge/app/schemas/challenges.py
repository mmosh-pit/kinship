"""Pydantic schemas for Challenges — includes mechanics, answers, scoring."""

from datetime import datetime
from typing import Any, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════════════════════════
#  PAGINATION
# ═══════════════════════════════════════════════════════════════════════════════

T = TypeVar("T")


class PaginationMeta(BaseModel):
    """Pagination metadata."""

    page: int
    limit: int
    total: int
    total_pages: int


class PaginatedResponse(BaseModel, Generic[T]):
    """Generic paginated response wrapper."""

    data: list[T]
    pagination: PaginationMeta


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════


class ChallengeBase(BaseModel):
    name: str = Field(..., max_length=255)
    description: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facets: list[str] = []
    difficulty: str = "medium"
    mechanic_type: str | None = "multiple_choice"
    steps: list[dict[str, Any]] = []
    correct_answers: list[dict[str, Any]] = []
    hints: list[str] = []
    feedback: dict[str, Any] = {}
    scoring_rubric: dict[str, Any] = {}
    learning_objectives: list[str] = []
    success_criteria: str | None = None
    base_delta: float = 5.0
    time_limit_sec: int = 0
    status: str = "draft"


class ChallengeCreate(ChallengeBase):
    pass


class ChallengeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    game_id: str | None = None
    scene_id: str | None = None
    facets: list[str] | None = None
    difficulty: str | None = None
    mechanic_type: str | None = None
    steps: list[dict[str, Any]] | None = None
    correct_answers: list[dict[str, Any]] | None = None
    hints: list[str] | None = None
    feedback: dict[str, Any] | None = None
    scoring_rubric: dict[str, Any] | None = None
    learning_objectives: list[str] | None = None
    success_criteria: str | None = None
    base_delta: float | None = None
    time_limit_sec: int | None = None
    status: str | None = None


class ChallengeResponse(ChallengeBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# Concrete paginated response for challenges
class PaginatedChallengeResponse(BaseModel):
    """Paginated list of challenges."""

    data: list[ChallengeResponse]
    pagination: PaginationMeta
