"""
Kinship Agent - Type Definitions

TypedDict classes for agent orchestration state and data structures.
These provide type safety and documentation for the orchestration flow.
"""

from typing import (
    TypedDict, 
    Optional, 
    List, 
    Dict, 
    Any, 
    Annotated, 
    Sequence,
    Literal,
)
from datetime import datetime
import operator

from langchain_core.messages import BaseMessage


# ─────────────────────────────────────────────────────────────────────────────────
# Worker Data Types
# ─────────────────────────────────────────────────────────────────────────────────


class WorkerSummary(TypedDict):
    """
    Lightweight worker information for routing decisions.
    Used in PresenceContext to list available workers.
    """
    id: str
    name: str
    description: str
    tools: List[str]              # Tool names, e.g., ["twitter", "gmail"]
    capabilities: List[str]       # Derived from tools, e.g., ["post_tweet", "send_email"]


class WorkerConfig(TypedDict):
    """
    Full worker configuration for execution.
    Loaded from database when worker is selected for execution.
    """
    id: str
    name: str
    description: Optional[str]
    backstory: Optional[str]
    system_prompt: Optional[str]
    tools: List[str]              # Tool names from database
    knowledge_base_ids: List[str]
    parent_id: Optional[str]      # Parent presence ID


# ─────────────────────────────────────────────────────────────────────────────────
# Presence Context
# ─────────────────────────────────────────────────────────────────────────────────


class PresenceContext(TypedDict):
    """
    Cached context for a Presence (Supervisor) agent.
    Includes all information needed for intent analysis and routing.
    """
    # Presence agent details
    presence_id: str
    presence_name: str
    presence_handle: Optional[str]
    presence_tone: str
    presence_description: Optional[str]
    presence_backstory: Optional[str]
    presence_system_prompt: Optional[str]
    
    # Available workers
    workers: List[WorkerSummary]
    
    # Capability index for O(1) worker lookup
    # Maps capability/action → worker_id
    # e.g., {"post_tweet": "worker_123", "send_email": "worker_456"}
    capability_index: Dict[str, str]
    
    # All available capabilities (flattened from workers)
    all_capabilities: List[str]
    
    # Knowledge base IDs (from Presence)
    knowledge_base_ids: List[str]


# ─────────────────────────────────────────────────────────────────────────────────
# MCP Tool Types
# ─────────────────────────────────────────────────────────────────────────────────


class MCPServerInfo(TypedDict):
    """Information about an MCP server connection."""
    url: str
    transport: str
    tools: List[str]              # Tool names served by this server


class MCPToolDefinition(TypedDict):
    """Definition of a tool from an MCP server."""
    name: str
    description: str
    parameters: Dict[str, Any]    # JSON Schema for parameters
    server_url: str               # Which MCP server provides this tool


# ─────────────────────────────────────────────────────────────────────────────────
# Intent Analysis Types
# ─────────────────────────────────────────────────────────────────────────────────


class IntentResult(TypedDict):
    """Result of intent analysis."""
    intent: Literal["conversation", "task", "query", "help"]
    action: Optional[str]          # e.g., "post_tweet", "send_email", None
    selected_worker_id: Optional[str]
    selected_worker_name: Optional[str]
    confidence: float              # 0.0 - 1.0
    reasoning: Optional[str]       # Why this intent/worker was selected


# ─────────────────────────────────────────────────────────────────────────────────
# Worker Execution Types
# ─────────────────────────────────────────────────────────────────────────────────


class ToolCallInfo(TypedDict):
    """Information about a tool call made during worker execution."""
    tool_name: str
    arguments: Dict[str, Any]
    result: Any
    success: bool
    error: Optional[str]
    duration_ms: int


class WorkerResult(TypedDict):
    """Result of worker execution."""
    success: bool
    output: Optional[str]          # Final text output from worker
    tool_calls: List[ToolCallInfo] # List of tool calls made
    error: Optional[str]
    execution_time_ms: int


# ─────────────────────────────────────────────────────────────────────────────────
# Approval Types
# ─────────────────────────────────────────────────────────────────────────────────


class PendingApprovalInfo(TypedDict):
    """Information about a pending approval request."""
    approval_id: str
    action: str
    tool_name: str
    arguments: Dict[str, Any]
    reason: str
    requested_at: str              # ISO format datetime


# ─────────────────────────────────────────────────────────────────────────────────
# Agent State (for LangGraph)
# ─────────────────────────────────────────────────────────────────────────────────


class AgentState(TypedDict):
    """
    State shared across the LangGraph orchestration nodes.
    
    This is the central state object that flows through:
    intent_analyzer → router → worker_executor → response_synthesizer
    
    Messages use Annotated with operator.add for automatic accumulation.
    """
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Conversation History (accumulated)
    # ─────────────────────────────────────────────────────────────────────────────
    messages: Annotated[Sequence[BaseMessage], operator.add]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # User Context (set at request start, immutable during execution)
    # ─────────────────────────────────────────────────────────────────────────────
    user_id: str
    user_wallet: str
    user_role: str                 # "creator", "member", "guest"
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Presence Context (loaded from cache)
    # ─────────────────────────────────────────────────────────────────────────────
    presence_id: str
    presence_name: str
    presence_tone: str
    presence_system_prompt: str
    presence_description: str
    presence_backstory: str
    
    # Available workers for this presence
    available_workers: List[WorkerSummary]
    
    # Capability index for fast worker lookup
    capability_index: Dict[str, str]
    
    # Database session for worker execution
    db_session: Optional[Any]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # LLM Configuration
    # ─────────────────────────────────────────────────────────────────────────────
    llm_provider: Optional[str]
    llm_model: Optional[str]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Knowledge Context
    # ─────────────────────────────────────────────────────────────────────────────
    knowledge_context: str         # Retrieved from Pinecone
    knowledge_sources: List[str]   # Names of knowledge bases used
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Intent Analysis Results (set by intent_analyzer node)
    # ─────────────────────────────────────────────────────────────────────────────
    intent: Optional[str]          # "conversation", "task", "query", "help"
    action: Optional[str]          # e.g., "post_tweet", "send_email"
    selected_worker_id: Optional[str]
    selected_worker_name: Optional[str]
    confidence: float
    requires_delegation: bool      # Whether to route to worker executor
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Worker Execution Results (set by worker_executor node)
    # ─────────────────────────────────────────────────────────────────────────────
    worker_config: Optional[WorkerConfig]
    worker_result: Optional[WorkerResult]
    execution_status: Optional[str]  # "pending", "executing", "completed", "failed"
    tool_calls_made: List[ToolCallInfo]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Approval Workflow
    # ─────────────────────────────────────────────────────────────────────────────
    requires_approval: bool
    pending_approval: Optional[PendingApprovalInfo]
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Final Output
    # ─────────────────────────────────────────────────────────────────────────────
    final_response: Optional[str]
    response_metadata: Optional[Dict[str, Any]]


# ─────────────────────────────────────────────────────────────────────────────────
# Streaming Event Types
# ─────────────────────────────────────────────────────────────────────────────────


class SSEEventBase(TypedDict):
    """Base type for all SSE events."""
    event: str


class SSEStartEvent(SSEEventBase):
    """Emitted when streaming starts."""
    presence_id: str
    presence_name: str
    worker_count: int
    knowledge_sources: List[str]


class SSEIntentEvent(SSEEventBase):
    """Emitted after intent analysis."""
    intent: str
    action: Optional[str]
    confidence: float


class SSERoutingEvent(SSEEventBase):
    """Emitted when routing to a worker."""
    worker_id: str
    worker_name: str
    reason: str


class SSEExecutingEvent(SSEEventBase):
    """Emitted when worker starts executing."""
    worker_id: str
    action: str
    status: str


class SSEToolCallEvent(SSEEventBase):
    """Emitted when a tool is called."""
    tool_name: str
    arguments: Dict[str, Any]


class SSEToolResultEvent(SSEEventBase):
    """Emitted when a tool returns a result."""
    tool_name: str
    success: bool
    result: Any


class SSETokenEvent(SSEEventBase):
    """Emitted for each token during LLM streaming."""
    token: str
    accumulated: str


class SSEWorkerResultEvent(SSEEventBase):
    """Emitted when worker completes execution."""
    worker_id: str
    status: str
    result: Optional[Dict[str, Any]]


class SSEApprovalRequiredEvent(SSEEventBase):
    """Emitted when an action requires approval."""
    approval_id: str
    action: str
    tool_name: str
    reason: str


class SSEDoneEvent(SSEEventBase):
    """Emitted when streaming completes."""
    message_id: Optional[str]
    full_response: str
    usage: Optional[Dict[str, int]]


class SSEErrorEvent(SSEEventBase):
    """Emitted when an error occurs."""
    error: str
    code: Optional[str]


# ─────────────────────────────────────────────────────────────────────────────────
# Orchestration Result
# ─────────────────────────────────────────────────────────────────────────────────


class OrchestrationResult(TypedDict):
    """Final result from the orchestration service."""
    success: bool
    response: str
    
    # Intent classification
    intent: Optional[IntentResult]
    
    # Worker execution (if delegated)
    worker_used: Optional[str]
    worker_result: Optional[WorkerResult]
    
    # Approval (if required)
    pending_approval: Optional[PendingApprovalInfo]
    
    # Metadata
    knowledge_sources: List[str]
    execution_time_ms: int
