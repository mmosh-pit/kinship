"""
Kinship Agent - Prompts API Routes

Full CRUD operations for system prompts with guidance settings.
"""

from datetime import datetime
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from nanoid import generate as nanoid
from pydantic import BaseModel, Field, ConfigDict

from app.db.database import get_session
from app.db.models import Prompt

router = APIRouter(prefix="/api/prompts", tags=["prompts"])


# ─────────────────────────────────────────────────────────────────────────────
# Schemas
# ─────────────────────────────────────────────────────────────────────────────


def to_camel(string: str) -> str:
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CreatePrompt(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    name: str = Field(..., min_length=1, max_length=255)
    content: str = Field(default="", description="Prompt content")
    description: Optional[str] = None
    category: Optional[str] = None
    tier: int = Field(default=1, ge=1, le=3, description="1=Global, 2=Scene, 3=NPC")
    
    # Guidance settings
    tone: Optional[str] = None
    persona: Optional[str] = None
    audience: Optional[str] = None
    format: Optional[str] = None
    goal: Optional[str] = None
    
    # Connected knowledge base
    connected_kb_id: Optional[str] = Field(None, alias="connectedKBId")
    connected_kb_name: Optional[str] = Field(None, alias="connectedKBName")
    
    # Ownership
    wallet: str
    platform_id: Optional[str] = Field(None, alias="platformId")


class UpdatePrompt(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    content: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tier: Optional[int] = Field(None, ge=1, le=3)
    status: Optional[str] = None
    
    # Guidance settings
    tone: Optional[str] = None
    persona: Optional[str] = None
    audience: Optional[str] = None
    format: Optional[str] = None
    goal: Optional[str] = None
    
    # Connected knowledge base
    connected_kb_id: Optional[str] = Field(None, alias="connectedKBId")
    connected_kb_name: Optional[str] = Field(None, alias="connectedKBName")


# ─────────────────────────────────────────────────────────────────────────────
# Helper: Serialize Prompt
# ─────────────────────────────────────────────────────────────────────────────


def serialize_prompt(p: Prompt, full: bool = False) -> dict:
    """Serialize a Prompt model to dict with camelCase keys."""
    data = {
        "id": p.id,
        "name": p.name,
        "content": p.content or "",
        "tone": p.tone,
        "persona": p.persona,
        "audience": p.audience,
        "format": p.format,
        "goal": p.goal,
        "connectedKBId": p.connected_kb_id,
        "connectedKBName": p.connected_kb_name,
        "category": p.category,
        "tier": p.tier,
        "status": p.status,
        "createdAt": p.created_at.isoformat(),
        "updatedAt": p.updated_at.isoformat(),
    }
    
    if full:
        data["description"] = p.description
        data["wallet"] = p.wallet
        data["platformId"] = p.platform_id
    
    return data


# ─────────────────────────────────────────────────────────────────────────────
# List Prompts
# ─────────────────────────────────────────────────────────────────────────────


@router.get("")
async def list_prompts(
    wallet: Optional[str] = Query(None),
    platform_id: Optional[str] = Query(None, alias="platformId"),
    tier: Optional[int] = Query(None, ge=1, le=3),
    status: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_session),
):
    """
    List prompts with optional filters.
    """
    stmt = select(Prompt)

    if wallet:
        stmt = stmt.where(Prompt.wallet == wallet)
    if platform_id:
        stmt = stmt.where(
            or_(
                Prompt.platform_id == platform_id,
                Prompt.platform_id.is_(None)
            )
        )
    if tier is not None:
        stmt = stmt.where(Prompt.tier == tier)
    if status:
        stmt = stmt.where(Prompt.status == status)
    if category:
        stmt = stmt.where(Prompt.category == category)

    stmt = stmt.order_by(Prompt.updated_at.desc())
    stmt = stmt.offset(offset).limit(limit)

    result = await db.execute(stmt)
    prompts = result.scalars().all()

    return {
        "prompts": [serialize_prompt(p) for p in prompts],
        "total": len(prompts),
    }


# ─────────────────────────────────────────────────────────────────────────────
# Get Single Prompt
# ─────────────────────────────────────────────────────────────────────────────


@router.get("/{prompt_id}")
async def get_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Get a prompt by ID.
    """
    stmt = select(Prompt).where(Prompt.id == prompt_id)
    result = await db.execute(stmt)
    prompt = result.scalar_one_or_none()

    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    return serialize_prompt(prompt, full=True)


# ─────────────────────────────────────────────────────────────────────────────
# Create Prompt
# ─────────────────────────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_prompt(
    payload: CreatePrompt,
    db: AsyncSession = Depends(get_session),
):
    """
    Create a new prompt.
    """
    prompt_id = f"prompt_{nanoid(size=8)}"
    now = datetime.utcnow()

    prompt = Prompt(
        id=prompt_id,
        name=payload.name.strip(),
        content=payload.content or "",
        description=payload.description,
        category=payload.category,
        tier=payload.tier,
        tone=payload.tone,
        persona=payload.persona,
        audience=payload.audience,
        format=payload.format,
        goal=payload.goal,
        connected_kb_id=payload.connected_kb_id,
        connected_kb_name=payload.connected_kb_name,
        status="active",
        wallet=payload.wallet,
        platform_id=payload.platform_id,
        created_at=now,
        updated_at=now,
    )

    db.add(prompt)
    await db.commit()
    await db.refresh(prompt)

    return serialize_prompt(prompt)


# ─────────────────────────────────────────────────────────────────────────────
# Update Prompt (PATCH)
# ─────────────────────────────────────────────────────────────────────────────


@router.patch("/{prompt_id}")
async def update_prompt(
    prompt_id: str,
    payload: UpdatePrompt,
    db: AsyncSession = Depends(get_session),
):
    """
    Partially update a prompt.
    """
    stmt = select(Prompt).where(Prompt.id == prompt_id)
    result = await db.execute(stmt)
    prompt = result.scalar_one_or_none()

    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    # Update fields - map camelCase aliases to snake_case
    update_data = payload.model_dump(exclude_unset=True, by_alias=False)
    
    for field, value in update_data.items():
        if hasattr(prompt, field):
            setattr(prompt, field, value)

    prompt.updated_at = datetime.utcnow()

    await db.commit()
    await db.refresh(prompt)

    return serialize_prompt(prompt, full=True)


# ─────────────────────────────────────────────────────────────────────────────
# Update Prompt (PUT) - Full update
# ─────────────────────────────────────────────────────────────────────────────


@router.put("/{prompt_id}")
async def replace_prompt(
    prompt_id: str,
    payload: UpdatePrompt,
    db: AsyncSession = Depends(get_session),
):
    """
    Full update a prompt (same as PATCH for flexibility).
    """
    return await update_prompt(prompt_id, payload, db)


# ─────────────────────────────────────────────────────────────────────────────
# Delete Prompt
# ─────────────────────────────────────────────────────────────────────────────


@router.delete("/{prompt_id}", status_code=204)
async def delete_prompt(
    prompt_id: str,
    db: AsyncSession = Depends(get_session),
):
    """
    Delete a prompt.
    """
    stmt = select(Prompt).where(Prompt.id == prompt_id)
    result = await db.execute(stmt)
    prompt = result.scalar_one_or_none()

    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    await db.delete(prompt)
    await db.commit()

    return None
