"""
Kinship Agent - Chat API Routes

Chat session and message management with streaming support.
Users interact only with Supervisor (Presence) agents.
"""

from typing import Optional, List, AsyncIterator
from datetime import datetime
import json

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select, and_, update
from sqlalchemy.ext.asyncio import AsyncSession
from nanoid import generate as nanoid
from sse_starlette.sse import EventSourceResponse

from app.db.database import get_session
from app.db.models import (
    Agent,
    AgentType,
    AgentStatus,
    ChatSession,
    ChatMessage,
    SessionStatus,
    MessageRole,
)
from app.schemas.chat import (
    CreateChatSession,
    ChatSessionResponse,
    SessionListResponse,
    ChatMessageResponse,
    MessageListResponse,
    SendMessageRequest,
    SendMessageResponse,
    ProcessMessageRequest,
    ProcessMessageResponse,
    OrchestrationResult,
    IntentClassification,
    ExecutionResult,
    MessageAction,
    MessageUsage,
)
from app.agents.supervisor import run_supervisor_agent
from app.agents.knowledge import get_relevant_knowledge
from app.core.llm import get_llm, StreamingCallbackHandler, get_available_providers


router = APIRouter(prefix="/api/chat", tags=["chat"])


# ─────────────────────────────────────────────────────────────────────────────
# Chat Sessions
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/sessions", response_model=dict, status_code=201)
async def create_session(
    payload: CreateChatSession,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new chat session with a Presence agent.
    """
    # Verify the presence exists
    stmt = select(Agent).where(
        and_(
            Agent.id == payload.presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    # Create session
    session_id = f"session_{nanoid(size=12)}"
    now = datetime.utcnow()

    session = ChatSession(
        id=session_id,
        presence_id=payload.presence_id,
        user_id=payload.user_id,
        user_wallet=payload.user_wallet,
        user_role=payload.user_role.value,
        platform_id=payload.platform_id,
        title=payload.title or f"Chat with {presence.name}",
        status=SessionStatus.ACTIVE,
        message_count=0,
        created_at=now,
        updated_at=now,
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    return {"session": ChatSessionResponse.model_validate(session)}


@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    user_id: Optional[str] = Query(None, alias="userId"),
    user_wallet: Optional[str] = Query(None, alias="userWallet"),
    presence_id: Optional[str] = Query(None, alias="presenceId"),
    status: Optional[SessionStatus] = None,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_session),
):
    """
    List chat sessions with optional filters.
    """
    stmt = select(ChatSession)

    if user_id:
        stmt = stmt.where(ChatSession.user_id == user_id)
    if user_wallet:
        stmt = stmt.where(ChatSession.user_wallet == user_wallet)
    if presence_id:
        stmt = stmt.where(ChatSession.presence_id == presence_id)
    if status:
        stmt = stmt.where(ChatSession.status == status)

    stmt = stmt.order_by(ChatSession.updated_at.desc()).limit(limit)

    result = await db.execute(stmt)
    sessions = result.scalars().all()

    return SessionListResponse(
        sessions=[ChatSessionResponse.model_validate(s) for s in sessions]
    )


@router.get("/sessions/{session_id}", response_model=dict)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Get a chat session by ID.
    """
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"session": ChatSessionResponse.model_validate(session)}


@router.delete("/sessions/{session_id}", status_code=204)
async def archive_session(
    session_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Archive a chat session.
    """
    stmt = select(ChatSession).where(ChatSession.id == session_id)
    result = await db.execute(stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    session.status = SessionStatus.ARCHIVED
    session.updated_at = datetime.utcnow()

    await db.commit()

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Chat Messages
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/messages", response_model=MessageListResponse)
async def get_messages(
    session_id: str = Query(..., alias="sessionId"),
    limit: int = Query(50, ge=1, le=200),
    before: Optional[str] = None,
    db: AsyncSession = Depends(get_session),
):
    """
    Get messages for a session.
    """
    stmt = select(ChatMessage).where(ChatMessage.session_id == session_id)

    if before:
        stmt = stmt.where(ChatMessage.id < before)

    stmt = stmt.order_by(ChatMessage.created_at.asc()).limit(limit)

    result = await db.execute(stmt)
    messages = result.scalars().all()

    return MessageListResponse(
        messages=[ChatMessageResponse.model_validate(m) for m in messages]
    )


@router.post("/messages", response_model=SendMessageResponse)
async def send_message(
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Send a message to a Presence agent and get a response.

    This is the main orchestration entry point where:
    1. User message is saved
    2. Supervisor agent processes the message
    3. Worker agents are delegated to if needed
    4. Response is generated and saved
    """
    # Get session
    session_stmt = select(ChatSession).where(ChatSession.id == payload.session_id)
    result = await db.execute(session_stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Get presence agent
    presence_stmt = select(Agent).where(Agent.id == session.presence_id)
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    # Get worker agents for this presence
    workers_stmt = select(Agent).where(
        and_(
            Agent.parent_id == presence.id,
            Agent.type == AgentType.WORKER,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(workers_stmt)
    workers = result.scalars().all()

    # Get message history
    history_stmt = (
        select(ChatMessage)
        .where(ChatMessage.session_id == session.id)
        .order_by(ChatMessage.created_at.asc())
        .limit(20)
    )
    result = await db.execute(history_stmt)
    history_messages = result.scalars().all()

    message_history = [
        {"role": m.role.value, "content": m.content}
        for m in history_messages
    ]

    # Get relevant knowledge
    knowledge_context = ""
    if presence.knowledge_base_ids:
        knowledge_context = await get_relevant_knowledge(
            knowledge_base_ids=presence.knowledge_base_ids,
            query=payload.content,
            db_session=db,
        )

    # Save user message
    now = datetime.utcnow()
    user_msg_id = f"msg_{nanoid(size=12)}"
    user_message = ChatMessage(
        id=user_msg_id,
        session_id=session.id,
        role=MessageRole.USER,
        content=payload.content,
        created_at=now,
    )
    db.add(user_message)

    # Run supervisor agent
    orchestration_result = await run_supervisor_agent(
        presence=presence,
        workers=list(workers),
        message=payload.content,
        message_history=message_history,
        user_id=payload.user_id,
        user_wallet=session.user_wallet,
        user_role=payload.user_role.value,
        knowledge_context=knowledge_context,
        llm_provider=payload.llm_provider,
        llm_model=payload.llm_model,
    )

    # Save assistant message
    assistant_msg_id = f"msg_{nanoid(size=12)}"
    assistant_now = datetime.utcnow()

    # Build action metadata if worker was used
    action_data = None
    if orchestration_result.get("execution"):
        exec_data = orchestration_result["execution"]
        action_data = {
            "type": orchestration_result.get("intent", {}).get("action", "unknown"),
            "workerId": exec_data.get("worker_id"),
            "workerName": exec_data.get("worker_name"),
            "status": exec_data.get("status", "completed"),
            "result": exec_data.get("result"),
        }

    assistant_message = ChatMessage(
        id=assistant_msg_id,
        session_id=session.id,
        role=MessageRole.ASSISTANT,
        content=orchestration_result.get("response", ""),
        action=action_data,
        created_at=assistant_now,
    )
    db.add(assistant_message)

    # Update session
    session.message_count += 2
    session.last_message_at = assistant_now
    session.updated_at = assistant_now

    await db.commit()
    await db.refresh(user_message)
    await db.refresh(assistant_message)

    # Build response
    return SendMessageResponse(
        user_message=ChatMessageResponse.model_validate(user_message),
        assistant_message=ChatMessageResponse.model_validate(assistant_message),
        orchestration=OrchestrationResult(
            success=orchestration_result.get("success", True),
            intent=IntentClassification(
                classified=orchestration_result.get("intent", {}).get("classified", "conversation"),
                action=orchestration_result.get("intent", {}).get("action"),
                confidence=orchestration_result.get("intent", {}).get("confidence", 0.9),
            ) if orchestration_result.get("intent") else None,
            execution=ExecutionResult(
                worker_id=orchestration_result["execution"]["worker_id"],
                worker_name=orchestration_result["execution"]["worker_name"],
                status=orchestration_result["execution"]["status"],
                result=orchestration_result["execution"].get("result"),
            ) if orchestration_result.get("execution") and orchestration_result["execution"].get("worker_id") else None,
            pending_approval=orchestration_result.get("pending_approval"),
        ),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Streaming Chat
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/messages/stream")
async def send_message_stream(
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Send a message and stream the response using Server-Sent Events.
    """
    # Get session and presence
    session_stmt = select(ChatSession).where(ChatSession.id == payload.session_id)
    result = await db.execute(session_stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    presence_stmt = select(Agent).where(Agent.id == session.presence_id)
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    async def generate_stream() -> AsyncIterator[str]:
        """Generate SSE stream."""
        from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
        from app.agents.supervisor import get_supervisor_system_prompt

        # Get workers
        workers_stmt = select(Agent).where(
            and_(
                Agent.parent_id == presence.id,
                Agent.type == AgentType.WORKER,
                Agent.status != AgentStatus.ARCHIVED,
            )
        )
        result = await db.execute(workers_stmt)
        workers = result.scalars().all()

        # Get message history
        history_stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
            .limit(20)
        )
        result = await db.execute(history_stmt)
        history_messages = result.scalars().all()

        # Get knowledge context
        knowledge_context = ""
        if presence.knowledge_base_ids:
            knowledge_context = await get_relevant_knowledge(
                knowledge_base_ids=presence.knowledge_base_ids,
                query=payload.content,
                db_session=db,
            )

        # Build system prompt
        system_prompt = get_supervisor_system_prompt(
            agent=presence,
            workers=list(workers),
            knowledge_context=knowledge_context,
        )

        # Build messages
        messages = [SystemMessage(content=system_prompt)]
        for msg in history_messages:
            if msg.role == MessageRole.USER:
                messages.append(HumanMessage(content=msg.content))
            elif msg.role == MessageRole.ASSISTANT:
                messages.append(AIMessage(content=msg.content))
        messages.append(HumanMessage(content=payload.content))

        # Stream response
        llm = get_llm(
            provider=payload.llm_provider,
            model=payload.llm_model,
            temperature=0.7,
            streaming=True
        )
        accumulated = ""

        # Send start event
        yield f"data: {json.dumps({'event': 'start', 'presence_name': presence.name})}\n\n"

        try:
            async for chunk in llm.astream(messages):
                token = chunk.content
                if token:
                    accumulated += token
                    yield f"data: {json.dumps({'event': 'token', 'token': token, 'accumulated': accumulated})}\n\n"

            # Save messages
            now = datetime.utcnow()

            user_msg = ChatMessage(
                id=f"msg_{nanoid(size=12)}",
                session_id=session.id,
                role=MessageRole.USER,
                content=payload.content,
                created_at=now,
            )
            db.add(user_msg)

            assistant_msg = ChatMessage(
                id=f"msg_{nanoid(size=12)}",
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=accumulated,
                created_at=datetime.utcnow(),
            )
            db.add(assistant_msg)

            session.message_count += 2
            session.last_message_at = datetime.utcnow()
            session.updated_at = datetime.utcnow()

            await db.commit()

            # Send done event
            yield f"data: {json.dumps({'event': 'done', 'message_id': assistant_msg.id})}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"

    return EventSourceResponse(generate_stream())


# ─────────────────────────────────────────────────────────────────────────────
# Direct Process (Without Session)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/presence/{presence_id}/process", response_model=ProcessMessageResponse)
async def process_message(
    presence_id: str,
    payload: ProcessMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Process a message directly without creating a session.
    Useful for one-off interactions.
    """
    # Get presence
    presence_stmt = select(Agent).where(
        and_(
            Agent.id == presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    # Get workers
    workers_stmt = select(Agent).where(
        and_(
            Agent.parent_id == presence.id,
            Agent.type == AgentType.WORKER,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(workers_stmt)
    workers = result.scalars().all()

    # Get knowledge context
    knowledge_context = ""
    if presence.knowledge_base_ids:
        knowledge_context = await get_relevant_knowledge(
            knowledge_base_ids=presence.knowledge_base_ids,
            query=payload.message,
            db_session=db,
        )

    # Run supervisor
    result = await run_supervisor_agent(
        presence=presence,
        workers=list(workers),
        message=payload.message,
        message_history=payload.message_history or [],
        user_id=payload.user_id,
        user_wallet=payload.user_wallet,
        user_role=payload.user_role.value,
        knowledge_context=knowledge_context,
        llm_provider=payload.llm_provider,
        llm_model=payload.llm_model,
    )

    return ProcessMessageResponse(
        success=result.get("success", True),
        response=result.get("response", ""),
        intent=IntentClassification(
            classified=result.get("intent", {}).get("classified", "conversation"),
            action=result.get("intent", {}).get("action"),
            confidence=result.get("intent", {}).get("confidence", 0.9),
        ) if result.get("intent") else None,
        execution=ExecutionResult(
            worker_id=result["execution"]["worker_id"],
            worker_name=result["execution"]["worker_name"],
            status=result["execution"]["status"],
            result=result["execution"].get("result"),
        ) if result.get("execution") and result["execution"].get("worker_id") else None,
        pending_approval=result.get("pending_approval"),
    )


@router.post("/presence/{presence_id}/stream")
async def process_message_stream(
    presence_id: str,
    payload: ProcessMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Process a message directly with streaming and full orchestration.
    
    Same as /process but with SSE streaming and tool events.
    Useful for real-time interactions without session management.
    
    SSE Events:
    - start: Initial metadata
    - intent: Intent classification
    - routing: Worker routing decision  
    - executing: Worker execution started
    - toolLoading: MCP tools being loaded
    - toolCall: Tool execution starting
    - toolResult: Tool execution complete
    - workerResult: Worker finished
    - token: Response token
    - done: Completion with full response
    - error: Error occurred
    """
    # Get presence
    presence_stmt = select(Agent).where(
        and_(
            Agent.id == presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    async def generate_stream() -> AsyncIterator[str]:
        """Generate SSE stream using orchestrator."""
        from app.agents.orchestrator import agent_orchestrator
        
        # Convert message history to dict format
        message_history = []
        if payload.message_history:
            for msg in payload.message_history:
                message_history.append({
                    "role": msg.role,
                    "content": msg.content,
                })
        
        try:
            # Run orchestrator with streaming
            async for event in agent_orchestrator.run_streaming(
                presence_id=presence_id,
                message=payload.message,
                db_session=db,
                message_history=message_history,
                user_id=payload.user_id or "",
                user_wallet=payload.user_wallet or "",
                user_role=payload.user_role.value if payload.user_role else "member",
                llm_provider=payload.llm_provider,
                llm_model=payload.llm_model,
            ):
                yield f"data: {json.dumps(event)}\n\n"
                
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"

    return EventSourceResponse(generate_stream())


# ─────────────────────────────────────────────────────────────────────────────
# Orchestrated Streaming Chat (with Tool Events)
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/messages/stream/v2")
async def send_message_stream_v2(
    payload: SendMessageRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Send a message and stream the response using the orchestrator.
    
    This endpoint provides full visibility into the agent execution:
    - Intent analysis events
    - Worker routing events
    - Tool loading events
    - Tool call/result events
    - Token streaming
    
    SSE Events:
    - start: Initial metadata
    - intent: Intent classification result
    - routing: Worker routing decision
    - executing: Worker execution started
    - toolLoading: Loading tools from MCP servers
    - toolCall: Tool being called
    - toolResult: Tool execution result
    - workerResult: Worker finished
    - token: Response token
    - done: Completion
    - error: Error occurred
    """
    # Get session
    session_stmt = select(ChatSession).where(ChatSession.id == payload.session_id)
    result = await db.execute(session_stmt)
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    presence_stmt = select(Agent).where(Agent.id == session.presence_id)
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    async def generate_stream() -> AsyncIterator[str]:
        """Generate SSE stream using orchestrator."""
        from app.agents.orchestrator import agent_orchestrator
        
        # Get message history
        history_stmt = (
            select(ChatMessage)
            .where(ChatMessage.session_id == session.id)
            .order_by(ChatMessage.created_at.asc())
            .limit(20)
        )
        result = await db.execute(history_stmt)
        history_messages = result.scalars().all()
        
        # Convert to dict format
        message_history = []
        for msg in history_messages:
            message_history.append({
                "role": "user" if msg.role == MessageRole.USER else "assistant",
                "content": msg.content,
            })
        
        accumulated_response = ""
        
        try:
            # Run orchestrator with streaming
            async for event in agent_orchestrator.run_streaming(
                presence_id=session.presence_id,
                message=payload.content,
                db_session=db,
                message_history=message_history,
                user_id=session.user_id or "",
                user_wallet=session.user_wallet or "",
                user_role=session.user_role or "member",
                llm_provider=payload.llm_provider,
                llm_model=payload.llm_model,
            ):
                event_type = event.get("event", "unknown")
                
                # Track accumulated response for saving
                if event_type == "token":
                    accumulated_response += event.get("token", "")
                
                # Send event to client
                yield f"data: {json.dumps(event)}\n\n"
            
            # Save messages after streaming completes
            now = datetime.utcnow()
            
            user_msg = ChatMessage(
                id=f"msg_{nanoid(size=12)}",
                session_id=session.id,
                role=MessageRole.USER,
                content=payload.content,
                created_at=now,
            )
            db.add(user_msg)
            
            assistant_msg = ChatMessage(
                id=f"msg_{nanoid(size=12)}",
                session_id=session.id,
                role=MessageRole.ASSISTANT,
                content=accumulated_response,
                created_at=datetime.utcnow(),
            )
            db.add(assistant_msg)
            
            session.message_count += 2
            session.last_message_at = datetime.utcnow()
            session.updated_at = datetime.utcnow()
            
            await db.commit()
            
        except Exception as e:
            yield f"data: {json.dumps({'event': 'error', 'error': str(e)})}\n\n"

    return EventSourceResponse(generate_stream())


# ─────────────────────────────────────────────────────────────────────────────
# LLM Providers
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/providers")
async def list_llm_providers():
    """
    List available LLM providers and their models.
    
    Returns providers with:
    - id: Provider identifier (openai, anthropic, gemini)
    - name: Display name
    - models: Available models with id, name, and default flag
    - available: Whether the provider is configured (has API key)
    """
    providers = get_available_providers()
    return {"providers": providers}