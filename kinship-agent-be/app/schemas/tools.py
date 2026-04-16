"""
Kinship Agent - Tool Schemas

Pydantic schemas for tool connection API requests and responses.

Changes:
- Removed: external_name, last_used_at, expires_at from ToolConnectionResponse
- Added: worker_agent_name
"""

from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum

from pydantic import BaseModel, Field


# ─────────────────────────────────────────────────────────────────────────────
# Enums
# ─────────────────────────────────────────────────────────────────────────────


class ToolId(str, Enum):
    """Available tool identifiers."""
    BLUESKY = "bluesky"
    GOOGLE = "google"
    TELEGRAM = "telegram"


class ConnectionStatus(str, Enum):
    """Tool connection status."""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    ERROR = "error"
    DISCONNECTED = "disconnected"


# ─────────────────────────────────────────────────────────────────────────────
# Tool Registry Response
# ─────────────────────────────────────────────────────────────────────────────


class ToolAction(BaseModel):
    """An action that a tool can perform."""
    id: str
    name: str
    description: str
    requires_approval: bool = False


class ToolDefinition(BaseModel):
    """Definition of an available tool."""
    id: str
    name: str
    description: str
    icon: str
    auth_type: str  # "app_password", "oauth2", "bot_token"
    required_fields: List[str]
    actions: List[ToolAction]
    instructions: Optional[str] = None  # How to get credentials


class ToolListResponse(BaseModel):
    """Response for listing available tools."""
    tools: List[ToolDefinition]


# ─────────────────────────────────────────────────────────────────────────────
# Tool Connection Requests
# ─────────────────────────────────────────────────────────────────────────────


class ConnectBlueskyRequest(BaseModel):
    """Request to connect Bluesky tool."""
    handle: str = Field(..., description="Bluesky handle (e.g., user.bsky.social)")
    app_password: str = Field(..., description="App password from Bluesky settings")


class ConnectGoogleRequest(BaseModel):
    """Request to connect Google tool."""
    oauth_code: Optional[str] = Field(None, description="OAuth authorization code")
    access_token: Optional[str] = Field(None, description="Access token if already obtained")
    refresh_token: Optional[str] = Field(None, description="Refresh token")


class ConnectTelegramRequest(BaseModel):
    """Request to connect Telegram tool."""
    bot_token: str = Field(..., description="Telegram Bot Token from @BotFather")
    bot_username: Optional[str] = Field(None, description="Bot username")


class ConnectToolRequest(BaseModel):
    """Generic request to connect a tool."""
    tool_id: str = Field(..., description="Tool identifier (bluesky, google, telegram)")
    credentials: Dict[str, Any] = Field(..., description="Tool-specific credentials")


# ─────────────────────────────────────────────────────────────────────────────
# Tool Connection Responses
# ─────────────────────────────────────────────────────────────────────────────


class ToolConnectionResponse(BaseModel):
    """Response for a tool connection."""
    id: str
    worker_id: str
    tool_id: str
    worker_agent_name: Optional[str] = None
    status: str
    external_user_id: Optional[str] = None
    external_handle: Optional[str] = None
    connected_at: datetime
    metadata: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class ToolConnectionListResponse(BaseModel):
    """Response for listing tool connections."""
    connections: List[ToolConnectionResponse]
    total: int


class ConnectToolResponse(BaseModel):
    """Response after connecting a tool."""
    success: bool
    connection: Optional[ToolConnectionResponse] = None
    message: str
    error: Optional[str] = None


class DisconnectToolResponse(BaseModel):
    """Response after disconnecting a tool."""
    success: bool
    message: str


# ─────────────────────────────────────────────────────────────────────────────
# Tool Status
# ─────────────────────────────────────────────────────────────────────────────


class ToolStatusResponse(BaseModel):
    """Response for checking tool connection status."""
    tool_id: str
    connected: bool
    status: Optional[str] = None
    external_handle: Optional[str] = None
    worker_agent_name: Optional[str] = None
    needs_refresh: bool = False
