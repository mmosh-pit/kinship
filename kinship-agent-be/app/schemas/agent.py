"""
Kinship Agent - Agent Schemas

Pydantic models for agent API request/response validation.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict, model_validator


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split("_")
    return components[0] + "".join(x.title() for x in components[1:])


# ─────────────────────────────────────────────────────────────────────────────
# Enums (uppercase to match database, but accept lowercase input)
# ─────────────────────────────────────────────────────────────────────────────


class AgentType(str, Enum):
    PRESENCE = "PRESENCE"
    WORKER = "WORKER"

    @classmethod
    def _missing_(cls, value):
        """Accept lowercase values from frontend."""
        if isinstance(value, str):
            upper = value.upper()
            for member in cls:
                if member.value == upper:
                    return member
        return None


class AgentStatus(str, Enum):
    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    SUSPENDED = "SUSPENDED"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            upper = value.upper()
            for member in cls:
                if member.value == upper:
                    return member
        return None


class AgentTone(str, Enum):
    NEUTRAL = "NEUTRAL"
    FRIENDLY = "FRIENDLY"
    PROFESSIONAL = "PROFESSIONAL"
    STRICT = "STRICT"
    COOL = "COOL"
    ANGRY = "ANGRY"
    PLAYFUL = "PLAYFUL"
    WISE = "WISE"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            upper = value.upper()
            for member in cls:
                if member.value == upper:
                    return member
        return None


class AccessLevel(str, Enum):
    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"
    ADMIN = "ADMIN"
    CREATOR = "CREATOR"

    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            upper = value.upper()
            for member in cls:
                if member.value == upper:
                    return member
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Base Schema
# ─────────────────────────────────────────────────────────────────────────────


class AgentBase(BaseModel):
    """Base schema for agent data."""

    model_config = ConfigDict(populate_by_name=True)

    name: str = Field(..., min_length=1, max_length=255, description="Agent name")
    description: Optional[str] = Field(None, description="Full description")
    backstory: Optional[str] = Field(None, description="Agent backstory")


# ─────────────────────────────────────────────────────────────────────────────
# Create Schemas
# ─────────────────────────────────────────────────────────────────────────────


class CreatePresenceAgent(AgentBase):
    """Schema for creating a Presence (supervisor) agent."""

    model_config = ConfigDict(populate_by_name=True)

    handle: str = Field(
        ...,
        min_length=1,
        max_length=25,
        pattern=r"^[a-zA-Z0-9_.]+$",
        description="Unique handle for the Presence agent",
    )
    wallet: str = Field(..., description="Owner wallet address")
    platform_id: Optional[str] = Field(None, alias="platformId", description="Platform ID")

    # Presence-specific
    tone: AgentTone = Field(default=AgentTone.NEUTRAL, description="Agent tone/personality")
    access_level: AccessLevel = Field(
        default=AccessLevel.PUBLIC,
        alias="accessLevel",
        description="Access level - PUBLIC makes agent publicly discoverable",
    )
    system_prompt: Optional[str] = Field(
        None, alias="systemPrompt", description="System prompt for the agent"
    )
    prompt_id: Optional[str] = Field(
        None, alias="promptId", description="Reference to prompt template"
    )
    knowledge_base_ids: List[str] = Field(
        default=[], alias="knowledgeBaseIds", description="List of knowledge base IDs"
    )


class CreateWorkerAgent(AgentBase):
    """Schema for creating a Worker agent."""

    model_config = ConfigDict(populate_by_name=True)

    wallet: str = Field(..., description="Owner wallet address")
    parent_id: Optional[str] = Field(
        None,
        alias="parentId",
        description="Parent Presence agent ID (auto-detected if not provided)",
    )
    platform_id: Optional[str] = Field(None, alias="platformId", description="Platform ID")

    # Worker-specific
    access_level: AccessLevel = Field(
        default=AccessLevel.PRIVATE, alias="accessLevel", description="Access level"
    )
    system_prompt: Optional[str] = Field(
        None, alias="systemPrompt", description="System prompt for the worker"
    )
    prompt_id: Optional[str] = Field(
        None, alias="promptId", description="Reference to prompt template"
    )
    knowledge_base_ids: List[str] = Field(
        default=[], alias="knowledgeBaseIds", description="List of knowledge base IDs"
    )
    tools: List[str] = Field(default=[], description="List of tool IDs to enable")


# ─────────────────────────────────────────────────────────────────────────────
# Update Schemas
# ─────────────────────────────────────────────────────────────────────────────


class UpdateAgent(BaseModel):
    """Schema for updating an agent."""

    model_config = ConfigDict(populate_by_name=True)

    name: Optional[str] = Field(None, min_length=1, max_length=255)
    handle: Optional[str] = Field(None, min_length=1, max_length=25, pattern=r"^[a-zA-Z0-9_.]+$")
    description: Optional[str] = None
    backstory: Optional[str] = None
    status: Optional[AgentStatus] = None

    # Access level (for both Presence and Worker)
    access_level: Optional[AccessLevel] = Field(None, alias="accessLevel")

    # Presence-specific
    tone: Optional[AgentTone] = None
    system_prompt: Optional[str] = Field(None, alias="systemPrompt")

    # Common
    prompt_id: Optional[str] = Field(None, alias="promptId")
    knowledge_base_ids: Optional[List[str]] = Field(None, alias="knowledgeBaseIds")

    # Worker-specific
    tools: Optional[List[str]] = None


# ─────────────────────────────────────────────────────────────────────────────
# Response Schemas (with camelCase output)
# ─────────────────────────────────────────────────────────────────────────────


class AgentResponse(BaseModel):
    """Schema for agent response."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,  # Output camelCase in JSON
    )

    id: str
    name: str
    handle: Optional[str] = None
    type: AgentType
    status: AgentStatus

    # Descriptions
    description: Optional[str] = None
    backstory: Optional[str] = None

    # Shared
    access_level: Optional[AccessLevel] = None

    # Presence-specific
    tone: Optional[AgentTone] = None
    system_prompt: Optional[str] = None

    # Prompt configuration
    prompt_id: Optional[str] = None
    knowledge_base_ids: List[str] = []

    # Worker-specific
    tools: List[str] = []
    parent_id: Optional[str] = None

    # Ownership
    wallet: str
    platform_id: Optional[str] = None

    # Timestamps
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data):
        """Normalize fields from SQLAlchemy model."""
        if hasattr(data, "__dict__"):
            # SQLAlchemy model - extract fields
            return {
                "id": data.id,
                "name": data.name,
                "handle": data.handle,
                "type": data.type,
                "status": data.status,
                "description": data.description,
                "backstory": data.backstory,
                "access_level": data.access_level,
                "tone": data.tone,
                "system_prompt": data.system_prompt,
                "prompt_id": data.prompt_id,
                "knowledge_base_ids": data.knowledge_base_ids or [],
                "tools": data.tools or [],
                "parent_id": data.parent_id,
                "wallet": data.wallet,
                "platform_id": data.platform_id,
                "created_at": data.created_at,
                "updated_at": data.updated_at,
            }
        return data


class AgentListResponse(BaseModel):
    """Schema for listing agents."""

    agents: List[AgentResponse]
    total: int = 0


# ─────────────────────────────────────────────────────────────────────────────
# Knowledge Base Schemas
# ─────────────────────────────────────────────────────────────────────────────


class KnowledgeBaseBase(BaseModel):
    """Base schema for knowledge base."""

    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    content: Optional[str] = None
    content_type: Optional[str] = Field(None, max_length=50)


class CreateKnowledgeBase(KnowledgeBaseBase):
    """Schema for creating a knowledge base."""

    model_config = ConfigDict(populate_by_name=True)

    wallet: str
    platform_id: Optional[str] = Field(None, alias="platformId")


class KnowledgeBaseResponse(KnowledgeBaseBase):
    """Schema for knowledge base response."""

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
        serialize_by_alias=True,
    )

    id: str
    wallet: str
    platform_id: Optional[str] = None
    created_at: datetime
    updated_at: datetime
