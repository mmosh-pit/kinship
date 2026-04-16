"""
Kinship Agent - Roles API Routes

REST API endpoints for Context Role management.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_session
from app.schemas.roles import (
    CreateRole,
    UpdateRole,
    RoleResponse,
    RoleListResponse,
)
from app.services.roles import role_service


router = APIRouter(prefix="/api/v1/roles", tags=["Roles"])


@router.get("", response_model=RoleListResponse)
async def list_roles(
    context_id: Optional[str] = Query(None, alias="contextId"),
    wallet: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_session),
):
    """
    List roles with optional filters.
    
    - **contextId**: Filter by context ID
    - **wallet**: Filter by wallet address
    """
    try:
        roles = await role_service.list_all(db, context_id, wallet)
        return RoleListResponse(roles=roles, count=len(roles))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Get a role by ID."""
    role = await role_service.get_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


@router.post("", response_model=RoleResponse, status_code=201)
async def create_role(
    data: CreateRole,
    db: AsyncSession = Depends(get_session),
):
    """Create a new role."""
    try:
        role = await role_service.create(
            db=db,
            context_id=data.context_id,
            worker_ids=data.worker_ids,
            name=data.name,
            wallet=data.wallet,
            created_by=data.created_by,
        )
        return role
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        if "already exists" in str(e).lower():
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    data: UpdateRole,
    db: AsyncSession = Depends(get_session),
):
    """Update a role."""
    try:
        update_data = data.model_dump(exclude_unset=True, by_alias=False)
        role = await role_service.update(db, role_id, **update_data)
        if not role:
            raise HTTPException(status_code=404, detail="Role not found")
        return role
    except ValueError as e:
        if "not found" in str(e).lower():
            raise HTTPException(status_code=404, detail=str(e))
        if "already exists" in str(e).lower():
            raise HTTPException(status_code=409, detail=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{role_id}", status_code=204)
async def delete_role(
    role_id: str,
    db: AsyncSession = Depends(get_session),
):
    """Delete a role."""
    deleted = await role_service.delete(db, role_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Role not found")
    return None


# ─────────────────────────────────────────────────────────────────────────────
# Convenience endpoint for context
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/context/{context_id}", response_model=RoleListResponse)
async def list_roles_by_context(
    context_id: str,
    db: AsyncSession = Depends(get_session),
):
    """List all roles for a specific context."""
    try:
        roles = await role_service.list_by_context(db, context_id)
        return RoleListResponse(roles=roles, count=len(roles))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
