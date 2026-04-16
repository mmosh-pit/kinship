"""
Kinship Agent - Context Schemas (Context & NestedContext)

Pydantic models for Context and NestedContext API request/response validation.
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum
import re

from pydantic import BaseModel, Field, ConfigDict, field_validator


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────


class VisibilityLevel(str, Enum):
    PUBLIC = "public"
    PRIVATE = "private"
    SECRET = "secret"

    @classmethod
    def _missing_(cls, value):
        """Accept any case from frontend."""
        if isinstance(value, str):
            lower = value.lower()
            for member in cls:
                if member.value == lower:
                    return member
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Context Schemas (formerly Platform)
# ─────────────────────────────────────────────────────────────────────────────


class ContextBase(BaseModel):
    """Base schema for context data."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=200, description="Context name")
    description: Optional[str] = Field(None, max_length=2000, description="Description")


class CreateContext(ContextBase):
    """Schema for creating a context."""

    model_config = ConfigDict(populate_by_name=True)

    handle: Optional[str] = Field(
        None,
        min_length=1,
        max_length=25,
        description="Unique handle (letters, numbers, underscores, periods)",
    )
    context_type: Optional[str] = Field(
        None,
        max_length=100,
        alias="contextType",
        description="Type of context (e.g., Team, Project, Community)",
    )
    icon: str = Field(default="🎮", max_length=10)
    color: str = Field(default="#4CADA8", pattern=r"^#[0-9a-fA-F]{6}$")
    presence_ids: List[str] = Field(default=[], alias="presenceIds")
    visibility: VisibilityLevel = Field(default=VisibilityLevel.PUBLIC)
    knowledge_base_ids: List[str] = Field(default=[], alias="knowledgeBaseIds")
    instruction_ids: List[str] = Field(default=[], alias="instructionIds")
    instructions: str = Field(default="", max_length=10000)
    created_by: str = Field(..., alias="createdBy")

    @field_validator("handle")
    @classmethod
    def validate_handle(cls, v):
        if v is not None:
            if not re.match(r"^[a-zA-Z0-9_.]+$", v):
                raise ValueError("Handle must contain only letters, numbers, underscores, and periods")
            return v.lower()
        return v


class UpdateContext(BaseModel):
    """Schema for updating a context."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    handle: Optional[str] = Field(None, min_length=1, max_length=25)
    context_type: Optional[str] = Field(None, max_length=100, alias="contextType")
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=10)
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    presence_ids: Optional[List[str]] = Field(None, alias="presenceIds")
    visibility: Optional[VisibilityLevel] = None
    knowledge_base_ids: Optional[List[str]] = Field(None, alias="knowledgeBaseIds")
    instruction_ids: Optional[List[str]] = Field(None, alias="instructionIds")
    instructions: Optional[str] = Field(None, max_length=10000)
    is_active: Optional[bool] = Field(None, alias="isActive")

    @field_validator("handle")
    @classmethod
    def validate_handle(cls, v):
        if v is not None:
            if not re.match(r"^[a-zA-Z0-9_.]+$", v):
                raise ValueError("Handle must contain only letters, numbers, underscores, and periods")
            return v.lower()
        return v


class ContextResponse(BaseModel):
    """Schema for context response."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: str
    name: str
    slug: str
    handle: Optional[str] = None
    context_type: Optional[str] = Field(default=None, alias="context_type")
    description: str = ""
    icon: str = "🎮"
    color: str = "#4CADA8"
    presence_ids: List[str] = Field(default=[], alias="presence_ids")
    visibility: VisibilityLevel = VisibilityLevel.PUBLIC
    knowledge_base_ids: List[str] = Field(default=[], alias="knowledge_base_ids")
    instruction_ids: List[str] = Field(default=[], alias="instruction_ids")
    instructions: str = ""
    is_active: bool = Field(default=True, alias="is_active")
    created_by: str = Field(..., alias="created_by")
    created_at: datetime = Field(..., alias="created_at")
    updated_at: datetime = Field(..., alias="updated_at")

    # Counts
    assets_count: int = Field(default=0, alias="assets_count")
    games_count: int = Field(default=0, alias="games_count")
    nested_contexts_count: int = Field(default=0, alias="nested_contexts_count")


class ContextWithNestedResponse(ContextResponse):
    """Schema for context with embedded nested contexts."""

    nested_contexts: List["NestedContextResponse"] = []


# ─────────────────────────────────────────────────────────────────────────────
# NestedContext Schemas (formerly Project)
# ─────────────────────────────────────────────────────────────────────────────


class NestedContextBase(BaseModel):
    """Base schema for nested context data."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=200, description="Nested context name")
    description: Optional[str] = Field(None, max_length=2000, description="Description")


class CreateNestedContext(NestedContextBase):
    """Schema for creating a nested context."""

    model_config = ConfigDict(populate_by_name=True)

    context_id: str = Field(..., alias="contextId", description="Parent context ID")
    handle: Optional[str] = Field(
        None,
        min_length=1,
        max_length=25,
        description="Unique handle (letters, numbers, underscores, periods)",
    )
    context_type: Optional[str] = Field(
        None,
        max_length=100,
        alias="contextType",
        description="Type of nested context (e.g., Team, Project, Community)",
    )
    icon: str = Field(default="📁", max_length=10)
    color: str = Field(default="#A855F7", pattern=r"^#[0-9a-fA-F]{6}$")
    presence_ids: List[str] = Field(default=[], alias="presenceIds")
    visibility: VisibilityLevel = Field(default=VisibilityLevel.PUBLIC)
    knowledge_base_ids: List[str] = Field(default=[], alias="knowledgeBaseIds")
    gathering_ids: List[str] = Field(default=[], alias="gatheringIds")
    instruction_ids: List[str] = Field(default=[], alias="instructionIds")
    instructions: str = Field(default="", max_length=10000)
    created_by: str = Field(..., alias="createdBy")

    @field_validator("handle")
    @classmethod
    def validate_handle(cls, v):
        if v is not None:
            if not re.match(r"^[a-zA-Z0-9_.]+$", v):
                raise ValueError("Handle must contain only letters, numbers, underscores, and periods")
            return v.lower()
        return v


class UpdateNestedContext(BaseModel):
    """Schema for updating a nested context."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(None, min_length=1, max_length=200)
    handle: Optional[str] = Field(None, min_length=1, max_length=25)
    context_type: Optional[str] = Field(None, max_length=100, alias="contextType")
    description: Optional[str] = Field(None, max_length=2000)
    icon: Optional[str] = Field(None, max_length=10)
    color: Optional[str] = Field(None, pattern=r"^#[0-9a-fA-F]{6}$")
    presence_ids: Optional[List[str]] = Field(None, alias="presenceIds")
    visibility: Optional[VisibilityLevel] = None
    knowledge_base_ids: Optional[List[str]] = Field(None, alias="knowledgeBaseIds")
    gathering_ids: Optional[List[str]] = Field(None, alias="gatheringIds")
    instruction_ids: Optional[List[str]] = Field(None, alias="instructionIds")
    instructions: Optional[str] = Field(None, max_length=10000)
    is_active: Optional[bool] = Field(None, alias="isActive")

    @field_validator("handle")
    @classmethod
    def validate_handle(cls, v):
        if v is not None:
            if not re.match(r"^[a-zA-Z0-9_.]+$", v):
                raise ValueError("Handle must contain only letters, numbers, underscores, and periods")
            return v.lower()
        return v


class NestedContextResponse(BaseModel):
    """Schema for nested context response."""

    model_config = ConfigDict(
        from_attributes=True,
        populate_by_name=True,
    )

    id: str
    context_id: str = Field(..., alias="context_id")
    name: str
    slug: str
    handle: Optional[str] = None
    context_type: Optional[str] = Field(default=None, alias="context_type")
    description: str = ""
    icon: str = "📁"
    color: str = "#A855F7"
    presence_ids: List[str] = Field(default=[], alias="presence_ids")
    visibility: VisibilityLevel = VisibilityLevel.PUBLIC
    knowledge_base_ids: List[str] = Field(default=[], alias="knowledge_base_ids")
    gathering_ids: List[str] = Field(default=[], alias="gathering_ids")
    instruction_ids: List[str] = Field(default=[], alias="instruction_ids")
    instructions: str = ""
    is_active: bool = Field(default=True, alias="is_active")
    created_by: str = Field(..., alias="created_by")
    created_at: datetime = Field(..., alias="created_at")
    updated_at: datetime = Field(..., alias="updated_at")

    # Counts
    assets_count: int = Field(default=0, alias="assets_count")
    games_count: int = Field(default=0, alias="games_count")


# Update forward reference
ContextWithNestedResponse.model_rebuild()