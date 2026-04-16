"""
Kinship Agent - Chat Schemas

Pydantic models for chat API request/response validation.
Simplified to work with database-persisted conversation history.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any, Literal
from enum import Enum

from pydantic import BaseModel, Field, ConfigDict


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────


class MessageRole(str, Enum):
    USER = "user"
    ASSISTANT = "assistant"
    SYSTEM = "system"
    TOOL = "tool"
    
    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            lower = value.lower()
            for member in cls:
                if member.value == lower:
                    return member
        return None


class ActionStatus(str, Enum):
    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"
    
    @classmethod
    def _missing_(cls, value):
        if isinstance(value, str):
            upper = value.upper().replace("-", "_").replace(" ", "_")
            for member in cls:
                if member.value == upper:
                    return member
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Message Schemas
# ─────────────────────────────────────────────────────────────────────────────


class ChatMessage(BaseModel):
    """Schema for a single chat message."""
    
    model_config = ConfigDict(populate_by_name=True)
    
    id: Optional[str] = None
    role: MessageRole
    content: str
    timestamp: Optional[str] = None


class MessageAction(BaseModel):
    """Schema for action metadata in messages."""

    type: str
    worker_id: Optional[str] = Field(None, alias="workerId")
    worker_name: Optional[str] = Field(None, alias="workerName")
    status: ActionStatus
    result: Optional[Any] = None
    error: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class MessageUsage(BaseModel):
    """Schema for token usage tracking."""

    input_tokens: int = Field(0, alias="inputTokens")
    output_tokens: int = Field(0, alias="outputTokens")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


# ─────────────────────────────────────────────────────────────────────────────
# Conversation Schemas
# ─────────────────────────────────────────────────────────────────────────────


class ConversationResponse(BaseModel):
    """Schema for conversation response (full history)."""
    
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
    
    id: str
    user_wallet: str = Field(..., alias="userWallet")
    presence_id: str = Field(..., alias="presenceId")
    messages: List[ChatMessage]
    message_count: int = Field(..., alias="messageCount")
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")


class ConversationSummary(BaseModel):
    """Schema for conversation summary (without full history)."""
    
    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
    
    id: str
    user_wallet: str = Field(..., alias="userWallet")
    presence_id: str = Field(..., alias="presenceId")
    message_count: int = Field(..., alias="messageCount")
    created_at: str = Field(..., alias="createdAt")
    updated_at: str = Field(..., alias="updatedAt")
    last_message: Optional[ChatMessage] = Field(None, alias="lastMessage")


class ConversationListResponse(BaseModel):
    """Schema for listing conversations."""
    
    conversations: List[ConversationSummary]


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration Schemas
# ─────────────────────────────────────────────────────────────────────────────


class IntentClassification(BaseModel):
    """Schema for intent classification result."""

    classified: str
    action: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)


class ExecutionResult(BaseModel):
    """Schema for worker execution result."""

    worker_id: str = Field(..., alias="workerId")
    worker_name: str = Field(..., alias="workerName")
    status: str
    result: Optional[Any] = None
    error: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


class PendingApprovalInfo(BaseModel):
    """Schema for pending approval notification."""

    id: str
    reason: str


class OrchestrationResult(BaseModel):
    """Schema for orchestration result."""

    success: bool
    intent: Optional[IntentClassification] = None
    execution: Optional[ExecutionResult] = None
    pending_approval: Optional[PendingApprovalInfo] = Field(None, alias="pendingApproval")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)


# ─────────────────────────────────────────────────────────────────────────────
# Streaming Schemas
# ─────────────────────────────────────────────────────────────────────────────


class StreamEvent(BaseModel):
    """Schema for server-sent event data."""

    event: Literal["token", "agent_start", "agent_end", "tool_start", "tool_end", "error", "done"]
    data: Any


class StreamTokenEvent(BaseModel):
    """Schema for streaming token event."""

    token: str
    accumulated: str


class StreamAgentEvent(BaseModel):
    """Schema for agent lifecycle event."""

    agent_id: str = Field(..., alias="agentId")
    agent_name: str = Field(..., alias="agentName")
    agent_type: str = Field(..., alias="agentType")

    model_config = ConfigDict(populate_by_name=True, serialize_by_alias=True)
