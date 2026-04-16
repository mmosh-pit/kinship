"""
Kinship Agent - Database Models

SQLAlchemy models for agents, conversations, knowledge bases, and tools.
"""

from datetime import datetime
from typing import Optional, List
from enum import Enum

from sqlalchemy import (
    Column,
    DateTime,
    ForeignKey,
    Index,
    String,
    Text,
    Enum as SQLEnum,
    Boolean,
    Integer,
    JSON,
    Numeric,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.dialects.postgresql import ARRAY, JSONB

from app.db.database import Base


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────


class AgentType(str, Enum):
    """Agent type enumeration."""

    PRESENCE = "PRESENCE"  # Supervisor agent
    WORKER = "WORKER"  # Worker agent


class AgentStatus(str, Enum):
    """Agent status enumeration."""

    ACTIVE = "ACTIVE"
    ARCHIVED = "ARCHIVED"
    SUSPENDED = "SUSPENDED"


class AgentTone(str, Enum):
    """Tone for Presence agents."""

    NEUTRAL = "NEUTRAL"
    FRIENDLY = "FRIENDLY"
    PROFESSIONAL = "PROFESSIONAL"
    STRICT = "STRICT"
    COOL = "COOL"
    ANGRY = "ANGRY"
    PLAYFUL = "PLAYFUL"
    WISE = "WISE"


class AccessLevel(str, Enum):
    """Access level for worker agents."""

    PRIVATE = "PRIVATE"
    PUBLIC = "PUBLIC"
    ADMIN = "ADMIN"
    CREATOR = "CREATOR"


class ActionStatus(str, Enum):
    """Action execution status."""

    PENDING = "PENDING"
    EXECUTED = "EXECUTED"
    FAILED = "FAILED"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"


class CodeAccessType(str, Enum):
    """Access type for codes."""

    CONTEXT = "context"      # Access to a context
    GATHERING = "gathering"  # Access to a gathering within a context


class CodeStatus(str, Enum):
    """Code lifecycle status."""

    ACTIVE = "active"
    EXPIRED = "expired"
    DISABLED = "disabled"
    REDEEMED = "redeemed"


class CodeRole(str, Enum):
    """Role granted by the code."""

    MEMBER = "member"
    GUEST = "guest"


# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────


class Agent(Base):
    """
    Agent model - represents both Presence (supervisor) and Worker agents.

    Presence agents:
    - One per wallet
    - Unique handle
    - Cannot connect to tools directly
    - Orchestrates worker agents
    - Has a tone setting and system_prompt

    Worker agents:
    - Multiple per user
    - No handle
    - Can connect to tools (stored in tools array)
    - Executes specific tasks
    - Must have parent_id linking to Presence
    """

    __tablename__ = "agents"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    handle: Mapped[Optional[str]] = mapped_column(String(25), unique=True, nullable=True)

    # Agent type and status
    type: Mapped[AgentType] = mapped_column(
        SQLEnum(AgentType), nullable=False, default=AgentType.PRESENCE
    )
    status: Mapped[AgentStatus] = mapped_column(
        SQLEnum(AgentStatus), nullable=False, default=AgentStatus.ACTIVE
    )

    # Descriptions
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    backstory: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Access level - defaults to PUBLIC for discoverability
    access_level: Mapped[Optional[AccessLevel]] = mapped_column(
        SQLEnum(AccessLevel), nullable=True, default=AccessLevel.PUBLIC
    )

    # Presence-specific fields
    tone: Mapped[Optional[AgentTone]] = mapped_column(
        SQLEnum(AgentTone), nullable=True, default=AgentTone.NEUTRAL
    )
    system_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Prompt reference (links to Prompt table)
    prompt_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Knowledge base IDs (array of references)
    knowledge_base_ids: Mapped[Optional[list]] = mapped_column(
        ARRAY(String), nullable=True, default=[]
    )

    # Worker tools (array of tool IDs)
    tools: Mapped[Optional[list]] = mapped_column(
        ARRAY(String), nullable=True, default=[]
    )

    # Ownership
    wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    platform_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Relationships - Workers must link to their parent Presence
    parent_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("agents.id"), nullable=True
    )
    workers: Mapped[list["Agent"]] = relationship(
        "Agent", backref="parent", remote_side=[id], lazy="selectin"
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Indexes
    __table_args__ = (
        Index("ix_agents_wallet", "wallet"),
        Index("ix_agents_type", "type"),
        Index("ix_agents_wallet_type", "wallet", "type"),
        Index("ix_agents_platform_id", "platform_id"),
        Index("ix_agents_parent_id", "parent_id"),
    )


class KnowledgeBase(Base):
    """
    Knowledge base model - stores chunks of knowledge for agents.
    """

    __tablename__ = "knowledge_bases"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Content storage
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    content_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # Embeddings (stored as JSON array for simplicity, could use pgvector)
    embeddings: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Metadata
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON, nullable=True)

    # Ownership
    wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    platform_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("ix_knowledge_bases_wallet", "wallet"),
        Index("ix_knowledge_bases_platform_id", "platform_id"),
    )


class Prompt(Base):
    """
    Prompt model - stores system prompts for agents.
    """

    __tablename__ = "prompts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Prompt content
    content: Mapped[str] = mapped_column(Text, nullable=False, default="")
    
    # Guidance settings
    tone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    persona: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    audience: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    format: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    goal: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Connected knowledge base
    connected_kb_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    connected_kb_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Categorization
    category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tier: Mapped[int] = mapped_column(Integer, nullable=False, default=1)  # 1=Global, 2=Scene, 3=NPC
    
    # Status
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="active")

    # Ownership
    wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    platform_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        Index("ix_prompts_wallet", "wallet"),
        Index("ix_prompts_platform_id", "platform_id"),
    )


class Conversation(Base):
    """
    Conversation model - stores chat history between a user and a Presence agent.
    
    One record per (user_wallet, presence_id) combination.
    Messages are stored as a JSONB array within the record.
    
    Message format:
    {
        "id": "msg_xxx",
        "role": "user" | "assistant",
        "content": "message text",
        "timestamp": "2025-04-06T10:30:00Z"
    }
    
    Summary Cache:
    When conversation history exceeds the token budget, older messages are
    summarized. The summary is cached to avoid re-computation on each request.
    """

    __tablename__ = "conversations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    
    # Composite key for conversation identification
    user_wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    presence_id: Mapped[str] = mapped_column(String(64), nullable=False)
    
    # Messages stored as JSONB array
    messages: Mapped[list] = mapped_column(JSONB, nullable=False, default=[])
    
    # Message count for quick access
    message_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Summary cache for token-based history management
    summary_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_message_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    summary_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    __table_args__ = (
        # Unique constraint: one conversation per user_wallet + presence_id
        UniqueConstraint('user_wallet', 'presence_id', name='uq_conversation_user_presence'),
        Index("ix_conversations_user_wallet", "user_wallet"),
        Index("ix_conversations_presence_id", "presence_id"),
        Index("ix_conversations_updated_at", "updated_at"),
    )


class PendingApproval(Base):
    """
    Pending approval model - tracks actions that require user approval.
    """

    __tablename__ = "pending_approvals"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)

    # Agent references
    presence_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("agents.id"), nullable=False
    )
    worker_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("agents.id"), nullable=False
    )

    # Action details
    action_type: Mapped[str] = mapped_column(String(100), nullable=False)
    action_params: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # Requester info
    requested_by_user_id: Mapped[str] = mapped_column(String(255), nullable=False)
    requested_by_wallet: Mapped[str] = mapped_column(String(255), nullable=False)

    # Status
    status: Mapped[ActionStatus] = mapped_column(
        SQLEnum(ActionStatus), nullable=False, default=ActionStatus.PENDING
    )

    # Approval/rejection
    approved_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rejected_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    rejection_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    resolved_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    __table_args__ = (
        Index("ix_pending_approvals_presence_id", "presence_id"),
        Index("ix_pending_approvals_status", "status"),
    )


class VisibilityLevel(str, Enum):
    """Visibility level for context and nested context."""

    PUBLIC = "public"
    PRIVATE = "private"
    SECRET = "secret"


class Context(Base):
    """
    Context model - top-level organizational container.

    Context can have:
    - Multiple nested contexts
    - Associated presence agents
    - Knowledge bases
    - Instructions/system prompts
    """

    __tablename__ = "context"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(250), nullable=False)
    handle: Mapped[Optional[str]] = mapped_column(String(25), unique=True, nullable=True)
    context_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(10), nullable=False, default="🎮")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#4CADA8")

    # Presence agent IDs (JSON array stored as string)
    presence_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Visibility
    visibility: Mapped[VisibilityLevel] = mapped_column(
        SQLEnum(VisibilityLevel), nullable=False, default=VisibilityLevel.PUBLIC
    )

    # Knowledge and instructions (JSON arrays stored as strings)
    knowledge_base_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instruction_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Ownership
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    nested_contexts: Mapped[list["NestedContext"]] = relationship(
        "NestedContext", back_populates="context", lazy="selectin"
    )

    __table_args__ = (
        Index("ix_context_slug", "slug"),
        Index("ix_context_handle", "handle"),
        Index("ix_context_is_active", "is_active"),
        Index("ix_context_created_by", "created_by"),
    )


class NestedContext(Base):
    """
    NestedContext model - belongs to a context.

    Nested contexts can have:
    - Associated presence agents
    - Knowledge bases
    - Gatherings
    - Instructions/system prompts
    """

    __tablename__ = "nested_context"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    context_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("context.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(250), nullable=False)
    handle: Mapped[Optional[str]] = mapped_column(String(25), unique=True, nullable=True)
    context_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    icon: Mapped[str] = mapped_column(String(10), nullable=False, default="📁")
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#A855F7")

    # Presence agent IDs (JSON array stored as string)
    presence_id: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Visibility
    visibility: Mapped[VisibilityLevel] = mapped_column(
        SQLEnum(VisibilityLevel), nullable=False, default=VisibilityLevel.PUBLIC
    )

    # Knowledge, gatherings, and instructions (JSON arrays stored as strings)
    knowledge_base_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    gathering_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instruction_ids: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    instructions: Mapped[str] = mapped_column(Text, nullable=False, default="")

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    # Ownership
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    context: Mapped["Context"] = relationship("Context", back_populates="nested_contexts")

    __table_args__ = (
        Index("ix_nested_context_context_id", "context_id"),
        Index("ix_nested_context_slug", "slug"),
        Index("ix_nested_context_handle", "handle"),
        Index("ix_nested_context_is_active", "is_active"),
        Index("ix_nested_context_created_by", "created_by"),
        UniqueConstraint("context_id", "slug", name="uq_nested_context_slug"),
    )


class ToolConnection(Base):
    """
    Tool connection - stores tool info and encrypted credentials for a worker.
    
    One record per worker - stores all connected tools in arrays/JSON.
    
    Columns:
    - id, worker_id, worker_agent_name
    - tool_names: array of connected tool names ["telegram", "google", "bluesky"]
    - credentials_encrypted: JSON with credentials per tool {"telegram": {...}, "google": {...}}
    - external_handles: JSON with handles per tool {"telegram": "@bot", "google": "user@gmail.com"}
    - status, connected_at, updated_at
    """

    __tablename__ = "tool_connections"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    worker_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("agents.id"), nullable=False, unique=True
    )
    worker_agent_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    
    # Array of connected tool names
    tool_names: Mapped[Optional[list]] = mapped_column(
        ARRAY(String), nullable=True, default=[]
    )
    
    # JSON with credentials per tool: {"telegram": {"bot_token": "..."}, "google": {"access_token": "..."}}
    credentials_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # JSON with external handles per tool: {"telegram": "@mybot", "google": "user@gmail.com"}
    external_handles: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default={})
    
    # JSON with external user IDs per tool
    external_user_ids: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default={})
    
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    connected_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    worker: Mapped["Agent"] = relationship("Agent", lazy="selectin")

    __table_args__ = (
        Index("ix_tool_connections_worker_id", "worker_id"),
        Index("ix_tool_connections_status", "status"),
        Index("ix_tool_connections_worker_agent_name", "worker_agent_name"),
    )


class ContextRole(Base):
    """
    Role model - maps multiple Worker Agents to a Context with a custom name.
    
    Roles aggregate tools from all referenced Worker Agents.
    """
    __tablename__ = "context_roles"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    
    # Parent context (required)
    context_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("context.id", ondelete="CASCADE"), nullable=False
    )
    
    # Worker agent references (array of IDs)
    worker_ids: Mapped[Optional[list]] = mapped_column(
        ARRAY(String), nullable=False, default=[]
    )
    
    # Role name
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Ownership
    wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    created_by: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    __table_args__ = (
        Index("ix_context_roles_context_id", "context_id"),
        Index("ix_context_roles_wallet", "wallet"),
        UniqueConstraint("context_id", "name", name="uq_context_role_name"),
    )


class Code(Base):
    """
    Code model - access codes for contexts and gatherings.
    
    Codes grant access to a context or gathering with a specified role.
    Format: KIN-XXXXXX-XXX (e.g., KIN-ABC123-XYZ)
    """

    __tablename__ = "codes"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    code: Mapped[str] = mapped_column(String(15), unique=True, nullable=False)
    
    # Access configuration
    access_type: Mapped[CodeAccessType] = mapped_column(
        SQLEnum(CodeAccessType), nullable=False, default=CodeAccessType.CONTEXT
    )
    context_id: Mapped[str] = mapped_column(
        String(64), ForeignKey("context.id", ondelete="CASCADE"), nullable=False
    )
    gathering_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("nested_context.id", ondelete="SET NULL"), nullable=True
    )
    scope_id: Mapped[Optional[str]] = mapped_column(
        String(64), ForeignKey("context_roles.id", ondelete="SET NULL"), nullable=True
    )
    
    # Role granted by this code
    role: Mapped[CodeRole] = mapped_column(
        SQLEnum(CodeRole), nullable=False, default=CodeRole.MEMBER
    )
    
    # Pricing
    price: Mapped[Optional[float]] = mapped_column(Numeric(18, 6), nullable=True)
    discount: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    
    # Expiry
    expiry_date: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # Usage limits
    max_uses: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    current_uses: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    status: Mapped[CodeStatus] = mapped_column(
        SQLEnum(CodeStatus), nullable=False, default=CodeStatus.ACTIVE
    )
    
    # Ownership
    creator_wallet: Mapped[str] = mapped_column(String(255), nullable=False)
    
    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    
    # Relationships
    context: Mapped["Context"] = relationship("Context", foreign_keys=[context_id], lazy="selectin")
    gathering: Mapped[Optional["NestedContext"]] = relationship(
        "NestedContext", foreign_keys=[gathering_id], lazy="selectin"
    )
    scope: Mapped[Optional["ContextRole"]] = relationship(
        "ContextRole", foreign_keys=[scope_id], lazy="selectin"
    )

    __table_args__ = (
        Index("ix_codes_code", "code", unique=True),
        Index("ix_codes_context_id", "context_id"),
        Index("ix_codes_gathering_id", "gathering_id"),
        Index("ix_codes_scope_id", "scope_id"),
        Index("ix_codes_role", "role"),
        Index("ix_codes_creator_wallet", "creator_wallet"),
        Index("ix_codes_status", "status"),
        Index("ix_codes_is_active", "is_active"),
        Index("ix_codes_access_type", "access_type"),
    )