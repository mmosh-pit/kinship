"""
Pydantic models for the LangGraph Dynamic Workflow API

Contains all request/response models for the API endpoints.
"""

from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field
from datetime import datetime


# ==================== CHAT MODELS ====================

class ChatMessage(BaseModel):
    """A single chat message."""
    role: str = Field(..., description="Role: 'user' or 'assistant'")
    content: str = Field(..., description="Message content")
    timestamp: Optional[datetime] = None
    metadata: Optional[Dict[str, Any]] = None


# ==================== REQUEST MODELS ====================

class QueryRequest(BaseModel):
    """Request model for query endpoints."""
    query: str = Field(..., description="User's query/message")
    agentId: Optional[str] = Field(None, description="Agent ID")
    bot_id: Optional[str] = Field(None, description="Bot ID (legacy, use agentId)")
    namespaces: Optional[List[str]] = Field(default=[], description="Namespaces for search")
    instructions: Optional[str] = Field(None, description="System instructions")
    system_prompt: Optional[str] = Field(None, description="System prompt (alias)")
    aiModel: Optional[str] = Field("gpt-4o", description="AI model to use")
    chatHistory: Optional[List[ChatMessage]] = Field(None, description="Chat history")
    userHistory: Optional[List[ChatMessage]] = Field(None, description="User history (alias)")
    thread_id: Optional[str] = Field(None, description="Thread ID for checkpoint resumption")
    
    class Config:
        json_schema_extra = {
            "example": {
                "query": "Hello, how can you help me?",
                "agentId": "agent123",
                "namespaces": ["knowledge_base"],
                "aiModel": "gpt-4o"
            }
        }


# ==================== RESPONSE MODELS ====================

class HealthResponse(BaseModel):
    """Health check response."""
    status: str = Field(..., description="Health status")
    mcp_servers: Dict[str, str] = Field(default={}, description="MCP server statuses")
    agent_ready: bool = Field(..., description="Whether agent is ready")
    tools_count: int = Field(0, description="Number of available tools")
    version: str = Field("2.0.0", description="API version")


class QueryResponse(BaseModel):
    """Response model for query endpoints."""
    success: bool
    namespaces: Optional[List[str]] = None
    query: str
    result: str
    execution_time_seconds: float
    timestamp: str
    tools_used: Optional[List[str]] = None
    current_goal: Optional[str] = None
    all_goals_done: bool = False
    thread_id: Optional[str] = None


class StreamChunk(BaseModel):
    """A chunk of streamed response."""
    type: str = Field(..., description="Event type: 'chunk', 'complete', 'error'")
    content: Optional[str] = None
    message: Optional[str] = None
    error: Optional[str] = None


# ==================== AUTH MODELS ====================

class UserInfo(BaseModel):
    """User information from auth service."""
    id: str
    email: Optional[str] = None
    name: Optional[str] = None
    wallet: Optional[str] = None
    
    class Config:
        extra = "allow"  # Allow additional fields
        
        
class Telegram(BaseModel):
    id: int
    first_name: str = Field(..., alias="firstName")
    username: str

class GuestData(BaseModel):
    picture: str
    Banner: str
    name: str
    displayName: str
    lastName: str
    username: str
    website: str
    bio: str
    challenges: str

class Bluesky(BaseModel):
    handle: str
    password: str

class Subscription(BaseModel):
    product_id: str
    sub_product_id: str
    purchase_token: str
    subscription_id: str
    subscription_tier: int
    expires_at: int
    platform: str
    changed_plan: bool

class Profile(BaseModel):
    name: str
    lastName: str
    displayName: str
    username: str
    bio: str
    image: str
    seniority: int
    symbol: str
    link: str
    following: int
    follower: int
    connectionnft: str
    connectionbadge: str
    connection: int
    isprivate: bool
    request: bool

class User(BaseModel):
    id: str = Field(..., alias="ID")
    uuid: str
    name: str
    email: str
    password: str
    telegram: Telegram
    guest_data: GuestData
    sessions: List[str]
    bluesky: Bluesky
    subscription: Subscription
    wallet: str
    referred_by: str
    onboarding_step: int
    createdAt: str
    profile: Profile
    profilenft: str
    role: str
    from_bot: str = Field(..., alias="FromBot")

    class Config:
        populate_by_name = True
        validate_by_name = True


class SessionAuthResponse(BaseModel):
    isAuth: bool = Field(..., alias="is_auth")
    user: dict | None = None

    class Config:
        populate_by_name = True



class AuthenticatedUser(BaseModel):
    user: User
    session_token: str

# ==================== GOAL MODELS ====================

class GoalAttribute(BaseModel):
    """An attribute to collect for a goal."""
    label: str = Field(..., description="Attribute label/name")
    instructions: Optional[str] = Field(None, description="Instructions for collecting")
    required: bool = Field(True, description="Whether required")
    collected: bool = Field(False, description="Whether collected")
    value: Optional[str] = Field(None, description="Collected value")


class Goal(BaseModel):
    """A goal/checkpoint for the user to complete."""
    checkpoint_id: str = Field(..., description="Unique checkpoint ID")
    checkpoint_name: str = Field(..., description="Display name")
    user_id: str = Field(..., description="User ID")
    agent_id: str = Field(..., description="Agent ID")
    additional_instructions: Optional[str] = Field(None, description="Extra instructions")
    attributes: List[GoalAttribute] = Field(default=[], description="Attributes to collect")
    is_complete: bool = Field(False, description="Whether complete")
    order: int = Field(0, description="Execution order")
    
    class Config:
        json_schema_extra = {
            "example": {
                "checkpoint_id": "cp_001",
                "checkpoint_name": "Personal Information",
                "user_id": "user123",
                "agent_id": "agent456",
                "attributes": [
                    {"label": "name", "required": True, "collected": False},
                    {"label": "email", "required": True, "collected": False}
                ],
                "order": 1
            }
        }


class GoalProgress(BaseModel):
    """Progress on a goal."""
    checkpoint_id: str
    checkpoint_name: str
    total_attributes: int
    collected_attributes: int
    is_complete: bool
    progress_percentage: float


# ==================== SAVE CHAT MODELS ====================

class SaveChatRequest(BaseModel):
    """Request to save chat messages."""
    chatId: str
    agentID: str
    namespaces: Optional[List[str]] = None
    systemPrompt: str
    userContent: str
    botContent: str


class SaveChatResponse(BaseModel):
    """Response from save chat endpoint."""
    message: str
    user_message_id: str
    bot_message_id: str


# ==================== WEBHOOK MODELS ====================

class GoalsChangedRequest(BaseModel):
    """Request from Go backend when goals change."""
    user_id: str
    agent_id: str


class GoalsChangedResponse(BaseModel):
    """Response to goals changed webhook."""
    status: str
    message: str
