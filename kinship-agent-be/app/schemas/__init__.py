"""
Kinship Agent - Schema Exports

Re-exports all Pydantic schemas for easy importing.
"""

from app.schemas.agent import (
    AgentType,
    AgentStatus,
    AgentTone,
    AccessLevel,
    CreatePresenceAgent,
    CreateWorkerAgent,
    UpdateAgent,
    AgentResponse,
    AgentListResponse,
    KnowledgeBaseBase,
    CreateKnowledgeBase,
    KnowledgeBaseResponse,
)

from app.schemas.context import (
    VisibilityLevel,
    CreateContext,
    UpdateContext,
    ContextResponse,
    ContextWithNestedResponse,
    CreateNestedContext,
    UpdateNestedContext,
    NestedContextResponse,
)

__all__ = [
    # Agent schemas
    "AgentType",
    "AgentStatus",
    "AgentTone",
    "AccessLevel",
    "CreatePresenceAgent",
    "CreateWorkerAgent",
    "UpdateAgent",
    "AgentResponse",
    "AgentListResponse",
    "KnowledgeBaseBase",
    "CreateKnowledgeBase",
    "KnowledgeBaseResponse",
    # Context schemas
    "VisibilityLevel",
    "CreateContext",
    "UpdateContext",
    "ContextResponse",
    "ContextWithNestedResponse",
    "CreateNestedContext",
    "UpdateNestedContext",
    "NestedContextResponse",
]
