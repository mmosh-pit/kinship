"""
Kinship Agent - Agents API Routes

CRUD operations for Supervisor (Presence) and Worker agents.
Includes cache invalidation for the orchestration system.
"""

from typing import Optional, List
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm.attributes import flag_modified
from nanoid import generate as nanoid

from app.db.database import get_session
from app.db.models import (
    Agent,
    AgentType,
    AgentStatus,
    AgentTone,
    AccessLevel,
    ToolConnection,
    Conversation,
    PendingApproval,
)
from app.schemas.agent import (
    CreatePresenceAgent,
    CreateWorkerAgent,
    UpdateAgent,
    AgentResponse,
    AgentListResponse,
)
from app.agents.cache.manager import cache_manager


router = APIRouter(prefix="/api/agents", tags=["agents"])


# ─────────────────────────────────────────────────────────────────────────────
# List Agents
# ─────────────────────────────────────────────────────────────────────────────


@router.get("", response_model=AgentListResponse)
async def list_agents(
    wallet: Optional[str] = Query(None, description="Filter by wallet address"),
    platform_id: Optional[str] = Query(None, alias="platformId", description="Filter by platform"),
    agent_type: Optional[AgentType] = Query(None, alias="type", description="Filter by type"),
    include_workers: bool = Query(
        False, alias="includeWorkers", description="Include worker agents in results"
    ),
    db: AsyncSession = Depends(get_session),
):
    """
    List all agents, optionally filtered by wallet, platform, or type.

    By default, only Presence (supervisor) agents are returned.
    Set includeWorkers=true to also include Worker agents.

    When filtering by platform_id, also includes agents with no platform_id (global agents).
    """
    stmt = select(Agent).where(Agent.status != AgentStatus.ARCHIVED)

    if wallet:
        stmt = stmt.where(Agent.wallet == wallet)
    if platform_id:
        # Include agents that match the platform OR have no platform (global agents)
        stmt = stmt.where(or_(Agent.platform_id == platform_id, Agent.platform_id.is_(None)))

    # Filter by type - if specific type requested, use it; otherwise filter based on includeWorkers
    if agent_type:
        stmt = stmt.where(Agent.type == agent_type)
    elif not include_workers:
        # By default, only show Presence agents unless includeWorkers=true
        stmt = stmt.where(Agent.type == AgentType.PRESENCE)

    stmt = stmt.order_by(Agent.updated_at.desc())

    result = await db.execute(stmt)
    agents = result.scalars().all()

    return AgentListResponse(
        agents=[AgentResponse.model_validate(a) for a in agents],
        total=len(agents),
    )


# ─────────────────────────────────────────────────────────────────────────────
# List Public Presence Agents (must be before /{agent_id} to avoid route conflict)
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/public", response_model=AgentListResponse)
async def list_public_presence_agents(
    platform_id: Optional[str] = Query(None, alias="platformId", description="Filter by platform"),
    limit: int = Query(50, ge=1, le=100, description="Maximum number of results"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    db: AsyncSession = Depends(get_session),
):
    """
    List all public Presence agents.

    This endpoint returns only:
    - Presence agents (not Workers)
    - With access_level set to PUBLIC
    - That are not archived

    Use this for discovery features where users can browse public agents.
    """
    stmt = select(Agent).where(
        and_(
            Agent.type == AgentType.PRESENCE,
            Agent.access_level == AccessLevel.PUBLIC,
            Agent.status != AgentStatus.ARCHIVED,
        )
    )

    if platform_id:
        stmt = stmt.where(or_(Agent.platform_id == platform_id, Agent.platform_id.is_(None)))

    # Order by most recently updated
    stmt = stmt.order_by(Agent.updated_at.desc())

    # Apply pagination
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    agents = result.scalars().all()

    return AgentListResponse(
        agents=[AgentResponse.model_validate(a) for a in agents],
        total=len(agents),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Get Single Agent
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{agent_id}", response_model=AgentResponse)
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Get a single agent by ID.
    """
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return AgentResponse.model_validate(agent)


# ─────────────────────────────────────────────────────────────────────────────
# Create Presence Agent
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/presence", response_model=AgentResponse, status_code=201)
async def create_presence_agent(
    payload: CreatePresenceAgent,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new Presence (supervisor) agent.

    Rules:
    - Handle must be unique
    """
    # Check if handle is taken
    handle = payload.handle.lower().strip()
    handle_stmt = select(Agent).where(Agent.handle == handle)
    result = await db.execute(handle_stmt)
    if result.scalar_one_or_none():
        raise HTTPException(
            status_code=409,
            detail="That handle is already taken",
        )

    # Create the agent
    agent_id = f"agent_{nanoid(size=8)}"
    now = datetime.utcnow()

    agent = Agent(
        id=agent_id,
        name=payload.name.strip(),
        handle=handle,
        type=AgentType.PRESENCE,
        status=AgentStatus.ACTIVE,
        description=payload.description,
        backstory=payload.backstory,
        tone=payload.tone,
        access_level=payload.access_level,
        system_prompt=payload.system_prompt,
        prompt_id=payload.prompt_id,
        knowledge_base_ids=payload.knowledge_base_ids or [],
        wallet=payload.wallet,
        platform_id=payload.platform_id,
        # Presence agents don't have: parent_id, tools
        created_at=now,
        updated_at=now,
    )

    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    return AgentResponse.model_validate(agent)


# ─────────────────────────────────────────────────────────────────────────────
# Create Worker Agent
# ─────────────────────────────────────────────────────────────────────────────


@router.post("/worker", response_model=AgentResponse, status_code=201)
async def create_worker_agent(
    payload: CreateWorkerAgent,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new Worker agent.

    Rules:
    - Wallet must have a Presence agent first
    - Workers are linked to their parent Presence
    """
    # Check if wallet has a Presence
    presence_stmt = select(Agent).where(
        and_(
            Agent.wallet == payload.wallet,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
    ).order_by(Agent.created_at.asc()).limit(1)
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "You must create a Presence agent before creating Worker agents.",
                "code": "PRESENCE_REQUIRED",
            },
        )

    # Use provided parent_id or default to the wallet's Presence
    parent_id = payload.parent_id or presence.id

    # Create the agent
    agent_id = f"agent_{nanoid(size=8)}"
    now = datetime.utcnow()

    agent = Agent(
        id=agent_id,
        name=payload.name.strip(),
        handle=None,  # Workers don't have handles
        type=AgentType.WORKER,
        status=AgentStatus.ACTIVE,
        description=payload.description,
        backstory=payload.backstory,
        access_level=payload.access_level,
        system_prompt=payload.system_prompt,
        prompt_id=payload.prompt_id,
        knowledge_base_ids=payload.knowledge_base_ids or [],
        tools=payload.tools or [],
        wallet=payload.wallet,
        platform_id=payload.platform_id,
        parent_id=parent_id,  # CRITICAL: Link to parent Presence
        # Workers don't have: handle, tone
        created_at=now,
        updated_at=now,
    )

    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    # Invalidate cache for the parent Presence (workers list changed)
    # Uses explicit hook for clarity (#1)
    cache_manager.on_worker_created(agent_id, parent_id)

    return AgentResponse.model_validate(agent)


# ─────────────────────────────────────────────────────────────────────────────
# Update Agent
# ─────────────────────────────────────────────────────────────────────────────


@router.patch("/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str,
    payload: UpdateAgent,
    db: AsyncSession = Depends(get_session),
):
    """
    Update an existing agent.
    """
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Check handle uniqueness if updating
    if payload.handle and payload.handle != agent.handle:
        handle = payload.handle.lower().strip()
        handle_stmt = select(Agent).where(and_(Agent.handle == handle, Agent.id != agent_id))
        result = await db.execute(handle_stmt)
        if result.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="That handle is already taken")

    # Update fields
    update_data = payload.model_dump(exclude_unset=True)

    # Fields that need explicit change detection (arrays and nullable strings)
    mutable_fields = {"knowledge_base_ids", "tools", "prompt_id"}

    for field, value in update_data.items():
        if hasattr(agent, field):
            setattr(agent, field, value)
            # Explicitly mark mutable fields as modified for SQLAlchemy change detection
            if field in mutable_fields:
                flag_modified(agent, field)

    agent.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(agent)

    # Invalidate cache using explicit hooks (#1)
    if agent.type == AgentType.WORKER:
        # For workers, invalidate worker cache and parent presence cache
        cache_manager.on_worker_updated(agent.id, agent.parent_id)
    else:
        # For presence, invalidate presence cache and graph cache
        cache_manager.on_presence_updated(agent.id)

    return AgentResponse.model_validate(agent)


# ─────────────────────────────────────────────────────────────────────────────
# Delete Agent
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{agent_id}", status_code=204)
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Hard delete an agent and all related data from the database.

    For Presence agents: Cascade deletes all associated data:
      - Worker agents and their tool connections
      - Chat sessions and messages
      - Pending approvals

    For Worker agents: Deletes tool connections and pending approvals.
    """
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    # Capture info before deletion (for cache invalidation)
    parent_id = agent.parent_id
    agent_type = agent.type

    if agent_type == AgentType.PRESENCE:
        # ─────────────────────────────────────────────────────────────────────
        # CASCADE HARD DELETE: Remove all data related to this Presence
        # ─────────────────────────────────────────────────────────────────────

        # Step 1: Find all workers for this presence (including archived ones)
        workers_stmt = select(Agent).where(
            and_(
                Agent.parent_id == agent_id,
                Agent.type == AgentType.WORKER,
            )
        )
        result = await db.execute(workers_stmt)
        workers = result.scalars().all()
        worker_ids = [w.id for w in workers]

        # Step 2: Delete Conversations for this presence
        delete_conversations_stmt = delete(Conversation).where(
            Conversation.presence_id == agent_id
        )
        await db.execute(delete_conversations_stmt)

        # Step 4: Delete PendingApprovals for this presence and its workers
        delete_approvals_stmt = delete(PendingApproval).where(
            or_(
                PendingApproval.presence_id == agent_id,
                PendingApproval.worker_id.in_(worker_ids) if worker_ids else False,
            )
        )
        await db.execute(delete_approvals_stmt)

        # Step 5: Delete ToolConnections for all workers
        if worker_ids:
            delete_connections_stmt = delete(ToolConnection).where(
                ToolConnection.worker_id.in_(worker_ids)
            )
            await db.execute(delete_connections_stmt)

        # Step 6: Invalidate caches for all workers
        for worker in workers:
            cache_manager.on_worker_deleted(worker.id, agent_id)

        # Step 7: Hard delete all workers from database
        if worker_ids:
            delete_workers_stmt = delete(Agent).where(Agent.id.in_(worker_ids))
            await db.execute(delete_workers_stmt)

        # Step 8: Hard delete the presence itself
        await db.delete(agent)

        # Step 9: Invalidate presence cache and graph cache
        cache_manager.on_presence_updated(agent_id)

    else:
        # ─────────────────────────────────────────────────────────────────────
        # WORKER HARD DELETE: Remove worker and related data
        # ─────────────────────────────────────────────────────────────────────

        # Delete tool connections
        delete_connections_stmt = delete(ToolConnection).where(ToolConnection.worker_id == agent_id)
        await db.execute(delete_connections_stmt)

        # Delete pending approvals for this worker
        delete_approvals_stmt = delete(PendingApproval).where(PendingApproval.worker_id == agent_id)
        await db.execute(delete_approvals_stmt)

        # Hard delete the worker from database
        await db.delete(agent)

        # Invalidate worker cache and parent presence cache
        cache_manager.on_worker_deleted(agent_id, parent_id)

    await db.commit()

    return None


# ─────────────────────────────────────────────────────────────────────────────
# Get Workers for Presence
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{presence_id}/workers", response_model=AgentListResponse)
async def get_workers(
    presence_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Get all worker agents for a Presence.
    """
    # First verify the presence exists
    presence_stmt = select(Agent).where(
        and_(
            Agent.id == presence_id,
            Agent.type == AgentType.PRESENCE,
        )
    )
    result = await db.execute(presence_stmt)
    presence = result.scalar_one_or_none()

    if not presence:
        raise HTTPException(status_code=404, detail="Presence agent not found")

    # Get workers for this presence
    workers_stmt = (
        select(Agent)
        .where(
            and_(
                Agent.parent_id == presence_id,
                Agent.type == AgentType.WORKER,
                Agent.status != AgentStatus.ARCHIVED,
            )
        )
        .order_by(Agent.created_at.desc())
    )

    result = await db.execute(workers_stmt)
    workers = result.scalars().all()

    return AgentListResponse(
        agents=[AgentResponse.model_validate(w) for w in workers],
        total=len(workers),
    )


# ─────────────────────────────────────────────────────────────────────────────
# Generate Agent Content (Description / Backstory)
# ─────────────────────────────────────────────────────────────────────────────


from pydantic import BaseModel
from typing import Literal as TypeLiteral


class GenerateContentRequest(BaseModel):
    """Request body for content generation."""

    target: TypeLiteral["description", "backstory"]
    instructions: str
    mode: TypeLiteral["generate", "refine"] = "generate"


class GenerateContentResponse(BaseModel):
    """Response from content generation."""

    content: str
    agent: AgentResponse


@router.post("/{agent_id}/generate", response_model=GenerateContentResponse)
async def generate_agent_content(
    agent_id: str,
    payload: GenerateContentRequest,
    db: AsyncSession = Depends(get_session),
):
    """
    Generate or refine agent description or backstory using AI.

    - **target**: What to generate - "description" or "backstory"
    - **instructions**: Creative direction for the AI
    - **mode**: "generate" for new content, "refine" to improve existing
    """
    from app.services.generation import generation_service

    # Get the agent
    stmt = select(Agent).where(Agent.id == agent_id)
    result = await db.execute(stmt)
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if not payload.instructions.strip():
        raise HTTPException(status_code=400, detail="Instructions are required")

    try:
        # Generate content
        generated = await generation_service.generate_agent_content(
            target=payload.target,
            instructions=payload.instructions,
            mode=payload.mode,
            agent_name=agent.name,
            current_description=agent.description,
            current_backstory=agent.backstory,
        )

        # Update agent with generated content
        if payload.target == "description":
            agent.description = generated
        else:
            agent.backstory = generated

        agent.updated_at = datetime.utcnow()

        await db.commit()
        await db.refresh(agent)

        return GenerateContentResponse(
            content=generated,
            agent=AgentResponse.model_validate(agent),
        )

    except ValueError as e:
        # API key not configured
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"AI generation failed: {str(e)}")