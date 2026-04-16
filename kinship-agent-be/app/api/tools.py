"""
Kinship Agent - Tools API

Architecture:
- One ToolConnection record per worker (not per tool)
- tool_names: array of connected tools ["telegram", "google_gmail_tool", "google_calendar_tool", ...]
- credentials_encrypted: JSON with credentials per tool
- external_handles: JSON with handles per tool
- external_user_ids: JSON with user IDs per tool
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from nanoid import generate as nanoid

from app.db.database import get_session
from app.db.models import Agent, AgentType, AgentStatus, ToolConnection
from app.services.tools import (
    verify_tool_credentials,
    encrypt_credentials_dict,
    decrypt_credentials_dict,
)

router = APIRouter(prefix="/api/tools", tags=["tools"])

# Google tools to be stored as array instead of single "google"
GOOGLE_TOOLS = ["google_gmail_tool", "google_calendar_tool", "google_meet_tool"]


# ─────────────────────────────────────────────────────────────────────────────
# Verify Credentials (No worker_id required - used during agent creation)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/verify")
async def verify_credentials(payload: dict):
    """
    Verify tool credentials without connecting to a worker.
    
    Used during agent creation flow when the worker doesn't exist yet.
    Frontend calls this to validate credentials before creating the agent.
    
    Request body:
    {
        "tool_name": "bluesky" | "telegram" | "google",
        "credentials": { ... tool-specific credentials ... }
    }
    
    Response:
    {
        "success": true,
        "external_handle": "@username",
        "external_user_id": "...",
        "credentials": { ... verified credentials with tokens ... }
    }
    """
    tool_name = payload.get("tool_name", "").lower()
    credentials = payload.get("credentials", {})
    
    supported_tools = ["bluesky", "telegram", "google", "solana"]
    if tool_name not in supported_tools:
        return {
            "success": False,
            "error": f"Unsupported tool: {tool_name}",
        }
    
    # Verify credentials with external API
    verification = await verify_tool_credentials(tool_name, credentials)
    
    if not verification.get("success"):
        return {
            "success": False,
            "error": verification.get("error", "Verification failed"),
        }
    
    # Get external info
    external_user_id = verification.get("external_user_id")
    raw_handle = verification.get("external_handle")
    
    # Add @ symbol to handle if not present
    external_handle = None
    if raw_handle:
        external_handle = f"@{raw_handle}" if not raw_handle.startswith("@") else raw_handle
    
    # Build verified credentials (include tokens for later storage)
    verified_credentials = dict(credentials)
    if verification.get("access_token"):
        verified_credentials["access_token"] = verification.get("access_token")
    if verification.get("refresh_token"):
        verified_credentials["refresh_token"] = verification.get("refresh_token")
    
    return {
        "success": True,
        "external_handle": external_handle,
        "external_user_id": external_user_id,
        "credentials": verified_credentials,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Connect Tool to Worker
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/worker/{worker_id}/connect")
async def connect_tool(
    worker_id: str,
    payload: dict,
    db: AsyncSession = Depends(get_session),
):
    """
    Connect a tool to a worker.
    
    Adds the tool to the worker's ToolConnection record.
    Creates a new record if none exists.
    """
    tool_name = payload.get("tool_name", "").lower()
    credentials = payload.get("credentials", {})
    
    supported_tools = ["bluesky", "telegram", "google", "solana"]
    if tool_name not in supported_tools:
        raise HTTPException(status_code=400, detail=f"Unsupported tool: {tool_name}")
    
    # Check worker exists
    worker_stmt = select(Agent).where(
        and_(
            Agent.id == worker_id,
            Agent.type == AgentType.WORKER,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(worker_stmt)
    worker = result.scalar_one_or_none()
    
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    worker_agent_name = worker.name
    now = datetime.utcnow()
    
    # ─── FIX: Get ANY existing connection record for this worker (regardless of status) ───
    # The unique constraint is on worker_id, so we must check for ANY existing record
    conn_stmt = select(ToolConnection).where(
        ToolConnection.worker_id == worker_id
    )
    result = await db.execute(conn_stmt)
    connection = result.scalar_one_or_none()
    
    # Check if tool already connected (only if connection is active)
    if connection and connection.status == "active" and tool_name in (connection.tool_names or []):
        raise HTTPException(status_code=409, detail=f"Tool '{tool_name}' already connected")
    
    # Verify credentials
    verification = await verify_tool_credentials(tool_name, credentials)
    
    if not verification.get("success"):
        return {
            "success": False,
            "error": verification.get("error", "Verification failed"),
        }
    
    # Get external info
    external_user_id = verification.get("external_user_id")
    raw_handle = verification.get("external_handle")
    
    # Add @ symbol to handle if not present
    external_handle = None
    if raw_handle:
        external_handle = f"@{raw_handle}" if not raw_handle.startswith("@") else raw_handle
    
    # Build credentials to store - tool-specific handling
    if tool_name == "solana":
        # Solana: no credentials (wallet-based auth)
        creds_to_store = None
    elif tool_name == "bluesky":
        # Bluesky: only handle and app_password (no tokens)
        creds_to_store = {
            "handle": credentials.get("handle"),
            "app_password": credentials.get("app_password"),
        }
    elif tool_name == "telegram":
        # Telegram: only bot_token
        creds_to_store = {
            "bot_token": credentials.get("bot_token"),
        }
    elif tool_name == "google":
        # Google: store with consistent snake_case keys only
        creds_to_store = {
            "access_token": credentials.get("accessToken") or credentials.get("access_token"),
            "refresh_token": credentials.get("refreshToken") or credentials.get("refresh_token"),
            "expires_at": credentials.get("expiresAt") or credentials.get("expires_at"),
            "email": credentials.get("email"),
            "name": credentials.get("name"),
        }
    else:
        # Other tools: store as-is
        creds_to_store = dict(credentials)
    
    if connection:
        # ─── FIX: Update existing connection record (reactivate if was disconnected) ───
        
        # Reactivate if was disconnected
        if connection.status != "active":
            connection.status = "active"
        
        # Add tool to tool_names array (keep "google" as single entry, NOT expanded)
        current_tool_names = list(connection.tool_names or [])
        if tool_name not in current_tool_names:
            current_tool_names.append(tool_name)
        connection.tool_names = current_tool_names
        
        # Update credentials dict (skip null credentials like Solana)
        # For Google: store under "google" key (shared OAuth tokens)
        current_creds = decrypt_credentials_dict(connection.credentials_encrypted) if connection.credentials_encrypted else {}
        if creds_to_store is not None:
            current_creds[tool_name] = creds_to_store
        connection.credentials_encrypted = encrypt_credentials_dict(current_creds) if current_creds else None
        
        # Update external handles dict
        current_handles = dict(connection.external_handles or {})
        if external_handle:
            current_handles[tool_name] = external_handle
        connection.external_handles = current_handles
        
        # Update external user IDs dict
        current_user_ids = dict(connection.external_user_ids or {})
        if external_user_id:
            current_user_ids[tool_name] = external_user_id
        connection.external_user_ids = current_user_ids
        
        # Update worker agent name in case it changed
        connection.worker_agent_name = worker_agent_name
        connection.updated_at = now
        conn_id = connection.id
        
        # Explicitly mark mutable fields as modified for SQLAlchemy change detection
        flag_modified(connection, 'tool_names')
        flag_modified(connection, 'external_handles')
        flag_modified(connection, 'external_user_ids')
    else:
        # Create new connection record
        conn_id = f"conn_{nanoid(size=12)}"
        
        # Build credentials_encrypted (null if only Solana)
        if creds_to_store is not None:
            creds_encrypted = encrypt_credentials_dict({tool_name: creds_to_store})
        else:
            creds_encrypted = None
        
        # tool_connections stores "google" as single entry (NOT expanded)
        connection = ToolConnection(
            id=conn_id,
            worker_id=worker_id,
            worker_agent_name=worker_agent_name,
            tool_names=[tool_name],
            credentials_encrypted=creds_encrypted,
            external_handles={tool_name: external_handle} if external_handle else {},
            external_user_ids={tool_name: external_user_id} if external_user_id else {},
            status="active",
            connected_at=now,
            updated_at=now,
        )
        db.add(connection)
    
    # Update worker's tools array (agents table)
    # For Google: expand to individual Google tools array
    # IMPORTANT: Telegram should NOT be stored in agents.tools - only in tool_connections
    if tool_name != "telegram":
        current_tools = worker.tools or []
        tools_to_add = GOOGLE_TOOLS if tool_name == "google" else [tool_name]
        new_tools = current_tools.copy()
        for t in tools_to_add:
            if t not in new_tools:
                new_tools.append(t)
        if new_tools != current_tools:
            worker.tools = new_tools
            worker.updated_at = now
            flag_modified(worker, 'tools')
    
    await db.commit()
    
    return {
        "success": True,
        "message": f"Connected {tool_name}",
        "connection": {
            "id": conn_id,
            "worker_id": worker_id,
            "tool_name": tool_name,
            "tool_names": connection.tool_names,
            "worker_agent_name": worker_agent_name,
            "status": "active",
            "external_user_id": external_user_id,
            "external_handle": external_handle,
            "connected_at": connection.connected_at.isoformat() if connection.connected_at else now.isoformat(),
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# Disconnect Tool from Worker
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/worker/{worker_id}/disconnect/{tool_name}")
async def disconnect_tool(
    worker_id: str,
    tool_name: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Disconnect a tool from a worker.
    
    Removes the tool from the worker's ToolConnection record.
    If no tools remain, DELETES the entire record from tool_connections.
    """
    tool_name = tool_name.lower()
    
    worker_stmt = select(Agent).where(Agent.id == worker_id)
    result = await db.execute(worker_stmt)
    worker = result.scalar_one_or_none()
    
    if not worker:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Get connection record (any status - might need to clean up old records too)
    conn_stmt = select(ToolConnection).where(
        ToolConnection.worker_id == worker_id
    )
    result = await db.execute(conn_stmt)
    connection = result.scalar_one_or_none()
    
    # tool_connections stores "google" as single entry
    current_tool_names = connection.tool_names or [] if connection else []
    
    if not connection or tool_name not in current_tool_names:
        raise HTTPException(status_code=404, detail=f"No active connection for '{tool_name}'")
    
    now = datetime.utcnow()
    
    # Remove tool from tool_names array (single entry like "google")
    remaining_tools = [t for t in current_tool_names if t != tool_name]
    
    if not remaining_tools:
        # ─── FIX: DELETE the entire row if no tools remain ───
        await db.delete(connection)
    else:
        # Update the record with remaining tools
        connection.tool_names = remaining_tools
        
        # Remove tool from credentials dict
        if connection.credentials_encrypted:
            current_creds = decrypt_credentials_dict(connection.credentials_encrypted)
            current_creds.pop(tool_name, None)
            connection.credentials_encrypted = encrypt_credentials_dict(current_creds) if current_creds else None
        
        # Remove tool from external_handles dict
        if connection.external_handles:
            connection.external_handles = {k: v for k, v in connection.external_handles.items() if k != tool_name}
        
        # Remove tool from external_user_ids dict
        if connection.external_user_ids:
            connection.external_user_ids = {k: v for k, v in connection.external_user_ids.items() if k != tool_name}
        
        connection.updated_at = now
        
        # Explicitly mark mutable fields as modified for SQLAlchemy change detection
        flag_modified(connection, 'tool_names')
        flag_modified(connection, 'external_handles')
        flag_modified(connection, 'external_user_ids')
    
    # Update worker's tools array (agents table)
    # For Google: remove all expanded Google tools from agents.tools
    # IMPORTANT: Telegram is NOT stored in agents.tools - only in tool_connections
    if tool_name != "telegram":
        tools_to_remove_from_agent = GOOGLE_TOOLS if tool_name == "google" else [tool_name]
        current_tools = worker.tools or []
        new_tools = [t for t in current_tools if t not in tools_to_remove_from_agent]
        if new_tools != current_tools:
            worker.tools = new_tools
            worker.updated_at = now
            flag_modified(worker, 'tools')
    
    await db.commit()
    
    return {"success": True, "message": f"Disconnected {tool_name}"}


# ─────────────────────────────────────────────────────────────────────────────
# List Tool Connections
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/worker/{worker_id}/connections")
async def list_connections(
    worker_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    List all tool connections for a worker.
    
    Returns individual connection info for each tool.
    tool_connections stores "google" as single entry (not expanded).
    """
    conn_stmt = select(ToolConnection).where(
        and_(
            ToolConnection.worker_id == worker_id,
            ToolConnection.status == "active",
        )
    )
    
    result = await db.execute(conn_stmt)
    connection = result.scalar_one_or_none()
    
    if not connection or not connection.tool_names:
        return {"connections": [], "total": 0}
    
    # Build individual connection objects for each tool
    # tool_names contains "google" (single entry), not expanded
    connections = []
    for tool in connection.tool_names:
        connections.append({
            "id": f"{connection.id}_{tool}",
            "tool_name": tool,
            "worker_agent_name": connection.worker_agent_name,
            "status": connection.status,
            "external_user_id": (connection.external_user_ids or {}).get(tool),
            "external_handle": (connection.external_handles or {}).get(tool),
            "connected_at": connection.connected_at.isoformat() if connection.connected_at else None,
        })
    
    return {
        "connections": connections,
        "total": len(connections),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Get Tool Credentials (Internal Use)
# ─────────────────────────────────────────────────────────────────────────────


async def get_tool_credentials(
    worker_id: str,
    tool_name: str,
    db: AsyncSession,
) -> dict | None:
    """
    Get decrypted credentials for a specific tool (internal use).
    
    tool_name can be:
    - "bluesky", "telegram", "solana" (direct match)
    - "google_gmail_tool", "google_calendar_tool", "google_meet_tool" (lookup "google")
    """
    
    conn_stmt = select(ToolConnection).where(
        and_(
            ToolConnection.worker_id == worker_id,
            ToolConnection.status == "active",
        )
    )
    result = await db.execute(conn_stmt)
    connection = result.scalar_one_or_none()
    
    if not connection or not connection.credentials_encrypted:
        return None
    
    # For Google tools: map to "google" for lookup in tool_connections
    lookup_key = "google" if tool_name in GOOGLE_TOOLS else tool_name
    
    # Check if the tool exists in tool_connections.tool_names
    if lookup_key not in (connection.tool_names or []):
        return None
    
    all_creds = decrypt_credentials_dict(connection.credentials_encrypted)
    return all_creds.get(lookup_key)


# ─────────────────────────────────────────────────────────────────────────────
# MCP Server Status
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/mcp/status")
async def get_mcp_status():
    """
    Get MCP server status and registered tools.
    
    Returns:
    - registered_tools: Tools registered in config.yaml
    - servers: MCP server URLs and their status
    - cache_stats: MCP cache statistics
    """
    from app.agents.mcp.registry import mcp_tool_registry
    from app.agents.mcp.langchain_adapter import get_mcp_cache_stats
    
    # Get registered tools
    registered_tools = mcp_tool_registry.list_all_tools()
    
    # Get server info
    servers = []
    for tool_name in registered_tools:
        config = mcp_tool_registry.get_mcp_config(tool_name)
        validation = mcp_tool_registry.validate_tool(tool_name)
        
        servers.append({
            "tool_name": tool_name,
            "url": config.url if config else None,
            "transport": config.transport if config else None,
            "valid": validation.is_valid,
            "validation_message": validation.message,
        })
    
    # Get cache stats
    cache_stats = get_mcp_cache_stats()
    
    return {
        "registered_tools": registered_tools,
        "servers": servers,
        "cache_stats": cache_stats,
    }


@router.get("/mcp/{tool_name}/tools")
async def get_mcp_tools(tool_name: str):
    """
    Get available tools from an MCP server.
    
    Fetches the tools from the MCP server using langchain_mcp_adapters
    and returns available tool schemas.
    """
    from app.agents.mcp.registry import mcp_tool_registry
    from app.agents.mcp.langchain_adapter import load_and_convert_tools
    
    # Validate tool
    validation = mcp_tool_registry.validate_tool(tool_name)
    if not validation.is_valid:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid tool: {validation.message}"
        )
    
    config = mcp_tool_registry.get_mcp_config(tool_name)
    
    try:
        # Load tools using the new adapter
        langchain_tools = await load_and_convert_tools([tool_name])
        
        tools = []
        for tool in langchain_tools:
            tools.append({
                "name": tool.name,
                "description": tool.description,
                "input_schema": tool.args_schema.schema() if hasattr(tool, 'args_schema') and tool.args_schema else {},
            })
        
        return {
            "tool_name": tool_name,
            "server_url": config.url,
            "mcp_tools": tools,
            "total": len(tools),
        }
        
    except Exception as e:
        raise HTTPException(
            status_code=503,
            detail=f"Failed to connect to MCP server: {str(e)}"
        )


@router.post("/mcp/{tool_name}/test")
async def test_mcp_connection(tool_name: str):
    """
    Test connection to an MCP server.
    
    Attempts to connect and fetch tools list using langchain_mcp_adapters.
    """
    from app.agents.mcp.registry import mcp_tool_registry
    from app.agents.mcp.langchain_adapter import load_and_convert_tools, clear_mcp_cache
    import time
    
    # Validate tool
    validation = mcp_tool_registry.validate_tool(tool_name)
    if not validation.is_valid:
        return {
            "success": False,
            "tool_name": tool_name,
            "error": validation.message,
        }
    
    config = mcp_tool_registry.get_mcp_config(tool_name)
    start_time = time.time()
    
    try:
        # Clear cache to force fresh connection
        clear_mcp_cache()
        
        # Try to connect and fetch tools
        langchain_tools = await load_and_convert_tools([tool_name])
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        return {
            "success": True,
            "tool_name": tool_name,
            "server_url": config.url,
            "connected": True,
            "tools_count": len(langchain_tools),
            "tool_names": [t.name for t in langchain_tools],
            "duration_ms": duration_ms,
        }
        
    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        
        return {
            "success": False,
            "tool_name": tool_name,
            "server_url": config.url,
            "connected": False,
            "error": str(e),
            "duration_ms": duration_ms,
        }