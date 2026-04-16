"""
Kinship Agent - Chat Messages API Routes

Chat endpoints using database-persisted conversation history.
History is loaded from PostgreSQL based on (user_wallet, presence_id).

Endpoint: POST /api/chatmessages/stream
"""

from typing import Optional, List, AsyncIterator
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Request, Header
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, ConfigDict

from app.db.database import get_session
from app.db.models import (
    Agent,
    AgentType,
    AgentStatus,
)
from app.agents.orchestrator import agent_orchestrator
from app.services.conversation import conversation_service
from app.core.config import settings


def to_camel(string: str) -> str:
    """Convert snake_case to camelCase."""
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


router = APIRouter(prefix="/api/chatmessages", tags=["chatmessages"])


# ─────────────────────────────────────────────────────────────────────────────
# Request/Response Schemas
# ─────────────────────────────────────────────────────────────────────────────


class ChatStreamRequest(BaseModel):
    """
    Request schema for streaming chat.
    
    History is now loaded from database - no need to send messageHistory.
    """
    
    model_config = ConfigDict(populate_by_name=True)
    
    presence_id: str = Field(..., alias="presenceId", description="ID of the Presence agent to chat with")
    message: str = Field(..., min_length=1, description="User message")
    user_wallet: str = Field(..., alias="userWallet", description="User wallet address (required for history lookup)")
    user_id: Optional[str] = Field(None, alias="userId", description="Optional user ID")
    llm_provider: Optional[str] = Field(
        default=None, 
        alias="llmProvider",
        description="LLM provider: 'openai', 'anthropic', or 'gemini'. Defaults to system setting."
    )
    llm_model: Optional[str] = Field(
        default=None, 
        alias="llmModel",
        description="Specific model name (e.g., 'gpt-4o', 'claude-3-5-sonnet-20241022')"
    )


class ChatResponse(BaseModel):
    """Non-streaming chat response."""
    
    model_config = ConfigDict(
        populate_by_name=True,
        alias_generator=to_camel,
        serialize_by_alias=True,
    )
    
    response: str
    presence_id: str
    presence_name: str
    worker_used: Optional[str] = None
    knowledge_sources: List[str] = []


# ─────────────────────────────────────────────────────────────────────────────
# Streaming Chat Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/stream")
async def stream_chat(
    payload: ChatStreamRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    Stream a chat response from a Presence agent using the orchestration system.
    
    **History Management:**
    - Chat history is automatically loaded from database
    - Identified by (user_wallet, presence_id) combination
    - User message and assistant response are saved after generation
    
    **Request Body:**
    - presenceId: ID of the Presence agent (required)
    - userWallet: User's wallet address (required)
    - message: User's message (required)
    - userId: Optional user ID
    - llmProvider: Optional LLM provider override
    - llmModel: Optional model override
    
    ## Authorization
    
    The Authorization header (Bearer token) is forwarded to MCP tools for 
    authenticated operations like Solana transactions.
    
    ## SSE Events (in order)
    
    ### Orchestration Events
    - **start**: Initial metadata
    - **intent**: Intent classification
    - **routing**: Routing decision
    - **executing**: Worker execution started
    
    ### MCP Tool Events
    - **toolLoading**: MCP tools being loaded
    - **toolCall**: Tool invocation started
    - **toolResult**: Tool invocation completed
    
    ### Completion Events
    - **workerResult**: Worker execution completed
    - **token**: Response token for streaming
    - **done**: Completion event
    - **error**: Error event
    
    Returns:
        Server-Sent Events stream
    """
    print(f"\n[CHATMESSAGES /stream] ────────────────────────────────────────")
    print(f"[CHATMESSAGES /stream] Incoming request:")
    print(f"[CHATMESSAGES /stream]   presence_id: {payload.presence_id}")
    print(f"[CHATMESSAGES /stream]   user_wallet: {payload.user_wallet}")
    print(f"[CHATMESSAGES /stream]   message: {payload.message[:50]}...")
    print(f"[CHATMESSAGES /stream] ────────────────────────────────────────")
    
    # Extract authorization token
    auth_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            auth_token = authorization[7:]
        else:
            auth_token = authorization
        print(f"[CHATMESSAGES] ✅ Auth token received: {auth_token[:20] if auth_token else 'None'}...")
    else:
        print(f"[CHATMESSAGES] ⚠️ No authorization header received")
    
    # Build headers dict for MCP
    mcp_headers = {}
    if auth_token:
        mcp_headers["authorization"] = auth_token
        print(f"[CHATMESSAGES] ✅ MCP headers set (without Bearer prefix)")
    
    # Validate the Presence agent exists
    presence_stmt = select(Agent).where(
        and_(
            Agent.id == payload.presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")
    
    print(f"\n[CHATMESSAGES] ========== STREAM CHAT REQUEST ==========")
    print(f"[CHATMESSAGES] User: {payload.user_wallet[:20]}...")
    print(f"[CHATMESSAGES] Presence: {payload.presence_id}")
    print(f"[CHATMESSAGES] Message: {payload.message[:50]}...")
    
    # Load conversation history from database with token budget
    print(f"[CHATMESSAGES] Loading history with token budget...")
    history_result = await conversation_service.get_history_with_token_budget(
        db=db,
        user_wallet=payload.user_wallet,
        presence_id=payload.presence_id,
    )
    message_history = history_result["messages"]
    history_summary = history_result["summary"]
    
    print(f"[CHATMESSAGES] ✅ History loaded:")
    print(f"[CHATMESSAGES]    - Recent messages: {len(message_history)}")
    print(f"[CHATMESSAGES]    - Summarized messages: {history_result['summarized_message_count']}")
    print(f"[CHATMESSAGES]    - Total tokens: {history_result['total_tokens']}")
    print(f"[CHATMESSAGES]    - Has summary: {'YES' if history_summary else 'NO'}")
    if history_summary:
        print(f"[CHATMESSAGES]    - Summary preview: {history_summary[:100]}...")
    
    # Save user message to database BEFORE generating response
    await conversation_service.append_user_message(
        db=db,
        user_wallet=payload.user_wallet,
        presence_id=payload.presence_id,
        content=payload.message,
    )
    print(f"[CHATMESSAGES] ✅ User message saved to database")
    print(f"[CHATMESSAGES] ================================================\n")

    async def generate_stream() -> AsyncIterator[str]:
        """Generate SSE stream using the orchestrator."""
        
        full_response = ""
        
        try:
            # Run the orchestrator with streaming
            async for event in agent_orchestrator.run_streaming(
                presence_id=payload.presence_id,
                message=payload.message,
                db_session=db,
                message_history=message_history,  # Recent messages from history
                history_summary=history_summary,  # Summary of older messages
                user_id=payload.user_id or "",
                user_wallet=payload.user_wallet,
                user_role="member",
                llm_provider=payload.llm_provider,
                llm_model=payload.llm_model,
                auth_token=auth_token,
                mcp_headers=mcp_headers,
            ):
                # Collect full response from token events
                if event.get("event") == "token":
                    full_response += event.get("token", "")
                
                # Yield the SSE event
                yield f"data: {json.dumps(event)}\n\n"
            
            # Save assistant response to database AFTER generation completes
            if full_response:
                await conversation_service.append_assistant_message(
                    db=db,
                    user_wallet=payload.user_wallet,
                    presence_id=payload.presence_id,
                    content=full_response,
                )
                print(f"[CHATMESSAGES] ✅ Assistant response saved to database ({len(full_response)} chars)")
                
        except Exception as e:
            print(f"[CHATMESSAGES] ❌ Orchestration error: {e}")
            import traceback
            traceback.print_exc()
            error_data = {"event": "error", "error": str(e), "code": "ORCHESTRATION_ERROR"}
            yield f"data: {json.dumps(error_data)}\n\n"

    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        }
    )


# ─────────────────────────────────────────────────────────────────────────────
# Non-Streaming Chat Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", response_model=ChatResponse)
async def send_chat(
    payload: ChatStreamRequest,
    request: Request,
    db: AsyncSession = Depends(get_session),
    authorization: Optional[str] = Header(None),
):
    """
    Send a message to a Presence agent and get a complete response.
    
    History is automatically loaded from and saved to the database.
    For streaming responses, use POST /stream instead.
    """
    # Extract authorization token
    auth_token = None
    if authorization:
        if authorization.startswith("Bearer "):
            auth_token = authorization[7:]
        else:
            auth_token = authorization
    
    mcp_headers = {}
    if auth_token:
        mcp_headers["authorization"] = auth_token
    
    # Validate the Presence agent exists
    presence_stmt = select(Agent).where(
        and_(
            Agent.id == payload.presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")
    
    print(f"\n[CHATMESSAGES] ========== SEND CHAT REQUEST ==========")
    print(f"[CHATMESSAGES] User: {payload.user_wallet[:20]}...")
    print(f"[CHATMESSAGES] Presence: {payload.presence_id}")
    print(f"[CHATMESSAGES] Message: {payload.message[:50]}...")
    
    # Load conversation history from database with token budget
    print(f"[CHATMESSAGES] Loading history with token budget...")
    history_result = await conversation_service.get_history_with_token_budget(
        db=db,
        user_wallet=payload.user_wallet,
        presence_id=payload.presence_id,
    )
    message_history = history_result["messages"]
    history_summary = history_result["summary"]
    
    print(f"[CHATMESSAGES] ✅ History loaded:")
    print(f"[CHATMESSAGES]    - Recent messages: {len(message_history)}")
    print(f"[CHATMESSAGES]    - Summarized messages: {history_result['summarized_message_count']}")
    print(f"[CHATMESSAGES]    - Total tokens: {history_result['total_tokens']}")
    print(f"[CHATMESSAGES]    - Has summary: {'YES' if history_summary else 'NO'}")
    if history_summary:
        print(f"[CHATMESSAGES]    - Summary preview: {history_summary[:100]}...")
    
    # Save user message
    await conversation_service.append_user_message(
        db=db,
        user_wallet=payload.user_wallet,
        presence_id=payload.presence_id,
        content=payload.message,
    )
    print(f"[CHATMESSAGES] ✅ User message saved to database")
    print(f"[CHATMESSAGES] ================================================\n")

    # Run the orchestrator
    orchestration_result = await agent_orchestrator.run(
        presence_id=payload.presence_id,
        message=payload.message,
        db_session=db,
        message_history=message_history,
        history_summary=history_summary,
        user_id=payload.user_id or "",
        user_wallet=payload.user_wallet,
        user_role="member",
        llm_provider=payload.llm_provider,
        llm_model=payload.llm_model,
        auth_token=auth_token,
        mcp_headers=mcp_headers,
    )
    
    response_text = orchestration_result.get("response", "")
    
    # Save assistant response
    if response_text:
        await conversation_service.append_assistant_message(
            db=db,
            user_wallet=payload.user_wallet,
            presence_id=payload.presence_id,
            content=response_text,
        )

    return ChatResponse(
        response=response_text,
        presence_id=presence.id,
        presence_name=presence.name,
        worker_used=orchestration_result.get("worker_used"),
        knowledge_sources=orchestration_result.get("knowledge_sources", []),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Orchestration Status Endpoint
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/status")
async def get_orchestration_status():
    """
    Get orchestration system status including cache statistics.
    """
    from app.agents.cache.manager import cache_manager
    from app.agents.mcp.registry import mcp_tool_registry
    
    cache_stats = cache_manager.get_stats()
    
    return {
        "status": "healthy",
        "cache": {
            "graph": cache_stats.graph_cache,
            "worker": cache_stats.worker_cache,
            "presence": cache_stats.presence_cache,
        },
        "mcp": {
            "registeredTools": mcp_tool_registry.list_all_tools(),
            "serverCount": len(mcp_tool_registry.list_all_servers()),
        },
    }