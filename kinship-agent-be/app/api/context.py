"""
Kinship Agent - Context API Routes (Context & NestedContext)

REST API endpoints for Context and NestedContext management.
Replicates the routes from kinship-assets.
"""

from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.db.models import VisibilityLevel
from app.schemas.context import (
    CreateContext,
    UpdateContext,
    ContextResponse,
    ContextWithNestedResponse,
    CreateNestedContext,
    UpdateNestedContext,
    NestedContextResponse,
)
from app.services.context import context_service, nested_context_service


# ─────────────────────────────────────────────────────────────────────────────
# Context Router (formerly Platforms)
# ─────────────────────────────────────────────────────────────────────────────

context_router = APIRouter(prefix="/api/v1/context", tags=["Context"])


@context_router.get("")
async def list_contexts(
    visibility: Optional[str] = Query(None, description="Filter by visibility level"),
    include_nested: Optional[str] = Query(None, description="Include nested contexts under each context"),
    wallet: Optional[str] = Query(None, description="Filter by wallet address (created_by)"),
    db: AsyncSession = Depends(get_session),
) -> List[dict]:
    """
    List all contexts.
    
    - **visibility**: Filter by visibility level (public, private, secret)
    - **include_nested**: If 'true', returns contexts with nested contexts embedded
    - **wallet**: Filter by wallet address (matches created_by field)
    
    Returns List[ContextResponse] or List[ContextWithNestedResponse] based on include_nested parameter.
    """
    try:
        if include_nested == "true":
            contexts = await context_service.list_with_nested(db, visibility, wallet)
            return contexts
        
        contexts = await context_service.list(db, visibility, wallet)
        return contexts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@context_router.get("/{context_id}", response_model=ContextResponse)
async def get_context(
    context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a context by ID."""
    context = await context_service.get_by_id(db, context_id)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
    return context


@context_router.get("/slug/{slug}", response_model=ContextResponse)
async def get_context_by_slug(
    slug: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a context by slug."""
    context = await context_service.get_by_slug(db, slug)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
    return context


@context_router.get("/handle/{handle}", response_model=ContextResponse)
async def get_context_by_handle(
    handle: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a context by handle."""
    context = await context_service.get_by_handle(db, handle)
    if not context:
        raise HTTPException(status_code=404, detail="Context not found")
    return context


@context_router.get("/{context_id}/nested", response_model=List[NestedContextResponse])
async def get_context_nested(
    context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get all nested contexts for a context."""
    try:
        nested_contexts = await context_service.get_nested_for_context(db, context_id)
        return nested_contexts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@context_router.post("", response_model=ContextResponse, status_code=201)
async def create_context(
    data: CreateContext,
    db: AsyncSession = Depends(get_session),
):
    """Create a new context."""
    try:
        # Convert visibility enum if needed
        visibility = data.visibility
        if isinstance(visibility, str):
            visibility = VisibilityLevel(visibility.lower())
        
        context = await context_service.create(
            db=db,
            name=data.name,
            created_by=data.created_by,
            handle=data.handle,
            context_type=data.context_type,
            description=data.description or "",
            icon=data.icon,
            color=data.color,
            presence_ids=data.presence_ids,
            visibility=visibility,
            knowledge_base_ids=data.knowledge_base_ids,
            instruction_ids=data.instruction_ids,
            instructions=data.instructions,
        )
        return context
    except ValueError as e:
        if "Handle" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@context_router.patch("/{context_id}", response_model=ContextResponse)
async def update_context(
    context_id: str,
    data: UpdateContext,
    db: AsyncSession = Depends(get_session),
):
    """Update a context."""
    try:
        update_data = data.model_dump(exclude_unset=True, by_alias=False)
        
        # Handle visibility enum
        if "visibility" in update_data and update_data["visibility"]:
            visibility = update_data["visibility"]
            if isinstance(visibility, str):
                update_data["visibility"] = VisibilityLevel(visibility.lower())
        
        context = await context_service.update(db, context_id, **update_data)
        if not context:
            raise HTTPException(status_code=404, detail="Context not found")
        return context
    except ValueError as e:
        if "Handle" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@context_router.delete("/{context_id}", status_code=204)
async def delete_context(
    context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete a context."""
    deleted = await context_service.delete(db, context_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Context not found")
    return None


# ─────────────────────────────────────────────────────────────────────────────
# NestedContext Router (formerly Projects)
# ─────────────────────────────────────────────────────────────────────────────

nested_context_router = APIRouter(prefix="/api/v1/nested-context", tags=["NestedContext"])


@nested_context_router.get("", response_model=List[NestedContextResponse])
async def list_nested_contexts(
    context_id: Optional[str] = Query(None, description="Filter by parent context ID"),
    visibility: Optional[str] = Query(None, description="Filter by visibility level"),
    db: AsyncSession = Depends(get_session),
):
    """
    List all nested contexts.
    
    - **context_id**: Filter by parent context ID
    - **visibility**: Filter by visibility level (public, private, secret)
    """
    try:
        nested_contexts = await nested_context_service.list(db, context_id, visibility)
        return nested_contexts
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@nested_context_router.get("/{nested_context_id}", response_model=NestedContextResponse)
async def get_nested_context(
    nested_context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a nested context by ID."""
    nested_context = await nested_context_service.get_by_id(db, nested_context_id)
    if not nested_context:
        raise HTTPException(status_code=404, detail="Nested context not found")
    return nested_context


@nested_context_router.get("/handle/{handle}", response_model=NestedContextResponse)
async def get_nested_context_by_handle(
    handle: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a nested context by handle."""
    nested_context = await nested_context_service.get_by_handle(db, handle)
    if not nested_context:
        raise HTTPException(status_code=404, detail="Nested context not found")
    return nested_context


@nested_context_router.post("", response_model=NestedContextResponse, status_code=201)
async def create_nested_context(
    data: CreateNestedContext,
    db: AsyncSession = Depends(get_session),
):
    """Create a new nested context."""
    try:
        # Convert visibility enum if needed
        visibility = data.visibility
        if isinstance(visibility, str):
            visibility = VisibilityLevel(visibility.lower())
        
        nested_context = await nested_context_service.create(
            db=db,
            context_id=data.context_id,
            name=data.name,
            created_by=data.created_by,
            handle=data.handle,
            context_type=data.context_type,
            description=data.description or "",
            icon=data.icon,
            color=data.color,
            presence_ids=data.presence_ids,
            visibility=visibility,
            knowledge_base_ids=data.knowledge_base_ids,
            gathering_ids=data.gathering_ids,
            instruction_ids=data.instruction_ids,
            instructions=data.instructions,
        )
        return nested_context
    except ValueError as e:
        if "Handle" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        if "Context not found" in str(e):
            raise HTTPException(status_code=404, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@nested_context_router.patch("/{nested_context_id}", response_model=NestedContextResponse)
async def update_nested_context(
    nested_context_id: str,
    data: UpdateNestedContext,
    db: AsyncSession = Depends(get_session),
):
    """Update a nested context."""
    try:
        update_data = data.model_dump(exclude_unset=True, by_alias=False)
        
        # Handle visibility enum
        if "visibility" in update_data and update_data["visibility"]:
            visibility = update_data["visibility"]
            if isinstance(visibility, str):
                update_data["visibility"] = VisibilityLevel(visibility.lower())
        
        nested_context = await nested_context_service.update(db, nested_context_id, **update_data)
        if not nested_context:
            raise HTTPException(status_code=404, detail="Nested context not found")
        return nested_context
    except ValueError as e:
        if "Handle" in str(e):
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@nested_context_router.delete("/{nested_context_id}", status_code=204)
async def delete_nested_context(
    nested_context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete a nested context."""
    deleted = await nested_context_service.delete(db, nested_context_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Nested context not found")
    return None


# Combined router for both context and nested context
router = APIRouter()
router.include_router(context_router)
router.include_router(nested_context_router)