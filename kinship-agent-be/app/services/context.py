"""
Kinship Agent - Context Service (Context & NestedContext)

Service classes for Context and NestedContext management.
Replicates the logic from kinship-assets.
"""

import json
import re
import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Context, NestedContext, VisibilityLevel

logger = logging.getLogger(__name__)


def slugify(name: str) -> str:
    """Convert a name to a URL-friendly slug."""
    slug = name.lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"^-+|-+$", "", slug)
    return slug


def parse_json_array(value: Optional[str]) -> List[str]:
    """Parse a JSON array stored as a string."""
    if not value:
        return []
    if isinstance(value, list):
        return value
    try:
        parsed = json.loads(value)
        return parsed if isinstance(parsed, list) else [parsed]
    except (json.JSONDecodeError, TypeError):
        return [value] if value else []


def serialize_json_array(value: Optional[List[str]]) -> Optional[str]:
    """Serialize a list to a JSON string for storage."""
    if value is None:
        return None
    return json.dumps(value)


# ─────────────────────────────────────────────────────────────────────────────
# Context Service (formerly Platform)
# ─────────────────────────────────────────────────────────────────────────────


class ContextService:
    """Service for managing contexts."""

    async def create(
        self,
        db: AsyncSession,
        name: str,
        created_by: str,
        handle: Optional[str] = None,
        context_type: Optional[str] = None,
        description: str = "",
        icon: str = "🎮",
        color: str = "#4CADA8",
        presence_ids: Optional[List[str]] = None,
        visibility: VisibilityLevel = VisibilityLevel.PUBLIC,
        knowledge_base_ids: Optional[List[str]] = None,
        instruction_ids: Optional[List[str]] = None,
        instructions: str = "",
    ) -> Dict[str, Any]:
        """Create a new context."""
        context_id = str(uuid4())
        slug = slugify(name)

        # Check for duplicate slug
        existing = await db.execute(
            select(Context).where(Context.slug == slug)
        )
        if existing.scalar_one_or_none():
            slug = f"{slug}-{int(datetime.utcnow().timestamp())}"

        # Check for duplicate handle
        if handle:
            handle_lower = handle.lower()
            handle_exists = await db.execute(
                select(Context).where(Context.handle == handle_lower)
            )
            if handle_exists.scalar_one_or_none():
                raise ValueError(f"Handle @{handle} is already taken")
        else:
            handle_lower = None

        context = Context(
            id=context_id,
            name=name,
            slug=slug,
            handle=handle_lower,
            context_type=context_type,
            description=description,
            icon=icon,
            color=color,
            presence_id=serialize_json_array(presence_ids or []),
            visibility=visibility,
            knowledge_base_ids=serialize_json_array(knowledge_base_ids or []),
            instruction_ids=serialize_json_array(instruction_ids or []),
            instructions=instructions,
            created_by=created_by,
        )

        db.add(context)
        await db.commit()
        await db.refresh(context)

        logger.info(f"Context created: {name} ({context_id})")
        return await self._format_context_with_counts(db, context)

    async def get_by_id(
        self,
        db: AsyncSession,
        context_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a context by ID."""
        result = await db.execute(
            select(Context).where(Context.id == context_id)
        )
        context = result.scalar_one_or_none()
        if not context:
            return None
        return await self._format_context_with_counts(db, context)

    async def get_by_slug(
        self,
        db: AsyncSession,
        slug: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a context by slug."""
        result = await db.execute(
            select(Context).where(Context.slug == slug)
        )
        context = result.scalar_one_or_none()
        if not context:
            return None
        return await self._format_context_with_counts(db, context)

    async def get_by_handle(
        self,
        db: AsyncSession,
        handle: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a context by handle."""
        result = await db.execute(
            select(Context).where(Context.handle == handle.lower())
        )
        context = result.scalar_one_or_none()
        if not context:
            return None
        return await self._format_context_with_counts(db, context)

    async def list(
        self,
        db: AsyncSession,
        visibility: Optional[str] = None,
        wallet: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all contexts, optionally filtered by visibility and/or wallet (created_by)."""
        query = select(Context).where(Context.is_active == True)

        if visibility:
            query = query.where(Context.visibility == visibility)
        
        if wallet:
            query = query.where(Context.created_by == wallet)

        query = query.order_by(Context.created_at.asc())

        result = await db.execute(query)
        contexts = result.scalars().all()

        return [
            await self._format_context_with_counts(db, c)
            for c in contexts
        ]

    async def list_with_nested(
        self,
        db: AsyncSession,
        visibility: Optional[str] = None,
        wallet: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all contexts with their nested contexts embedded."""
        contexts = await self.list(db, visibility, wallet)

        for context in contexts:
            nested_contexts = await nested_context_service.list_by_context_id(
                db, context["id"]
            )
            context["nested_contexts"] = nested_contexts

        return contexts

    async def get_nested_for_context(
        self,
        db: AsyncSession,
        context_id: str,
    ) -> List[Dict[str, Any]]:
        """Get all nested contexts for a context."""
        return await nested_context_service.list_by_context_id(db, context_id)

    async def update(
        self,
        db: AsyncSession,
        context_id: str,
        **kwargs,
    ) -> Optional[Dict[str, Any]]:
        """Update a context."""
        result = await db.execute(
            select(Context).where(Context.id == context_id)
        )
        context = result.scalar_one_or_none()
        if not context:
            return None

        # Handle name change -> update slug
        if "name" in kwargs and kwargs["name"]:
            kwargs["slug"] = slugify(kwargs["name"])

        # Handle handle uniqueness
        if "handle" in kwargs and kwargs["handle"]:
            handle_lower = kwargs["handle"].lower()
            handle_exists = await db.execute(
                select(Context)
                .where(Context.handle == handle_lower)
                .where(Context.id != context_id)
            )
            if handle_exists.scalar_one_or_none():
                raise ValueError(f"Handle @{kwargs['handle']} is already taken")
            kwargs["handle"] = handle_lower

        # Handle JSON array fields
        if "presence_ids" in kwargs:
            kwargs["presence_id"] = serialize_json_array(kwargs.pop("presence_ids"))
        if "knowledge_base_ids" in kwargs:
            kwargs["knowledge_base_ids"] = serialize_json_array(kwargs["knowledge_base_ids"])
        if "instruction_ids" in kwargs:
            kwargs["instruction_ids"] = serialize_json_array(kwargs["instruction_ids"])

        # Update fields
        for key, value in kwargs.items():
            if value is not None and hasattr(context, key):
                setattr(context, key, value)

        context.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(context)

        return await self._format_context_with_counts(db, context)

    async def delete(
        self,
        db: AsyncSession,
        context_id: str,
    ) -> bool:
        """Delete a context."""
        result = await db.execute(
            delete(Context).where(Context.id == context_id)
        )
        await db.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"Context deleted: {context_id}")
        return deleted

    async def _format_context_with_counts(
        self,
        db: AsyncSession,
        context: Context,
    ) -> Dict[str, Any]:
        """Format context with counts."""
        # Get nested contexts count
        nested_count_result = await db.execute(
            select(func.count(NestedContext.id)).where(
                NestedContext.context_id == context.id,
                NestedContext.is_active == True,
            )
        )
        nested_contexts_count = nested_count_result.scalar() or 0

        return {
            "id": context.id,
            "name": context.name,
            "slug": context.slug,
            "handle": context.handle,
            "context_type": context.context_type,
            "description": context.description,
            "icon": context.icon,
            "color": context.color,
            "presence_ids": parse_json_array(context.presence_id),
            "visibility": context.visibility.value if context.visibility else "public",
            "knowledge_base_ids": parse_json_array(context.knowledge_base_ids),
            "instruction_ids": parse_json_array(context.instruction_ids),
            "instructions": context.instructions or "",
            "is_active": context.is_active,
            "created_by": context.created_by,
            "created_at": context.created_at,
            "updated_at": context.updated_at,
            # Counts - assets and games would come from kinship-assets
            "assets_count": 0,
            "games_count": 0,
            "nested_contexts_count": nested_contexts_count,
        }


# ─────────────────────────────────────────────────────────────────────────────
# NestedContext Service (formerly Project)
# ─────────────────────────────────────────────────────────────────────────────


class NestedContextService:
    """Service for managing nested contexts."""

    async def create(
        self,
        db: AsyncSession,
        context_id: str,
        name: str,
        created_by: str,
        handle: Optional[str] = None,
        context_type: Optional[str] = None,
        description: str = "",
        icon: str = "📁",
        color: str = "#A855F7",
        presence_ids: Optional[List[str]] = None,
        visibility: VisibilityLevel = VisibilityLevel.PUBLIC,
        knowledge_base_ids: Optional[List[str]] = None,
        gathering_ids: Optional[List[str]] = None,
        instruction_ids: Optional[List[str]] = None,
        instructions: str = "",
    ) -> Dict[str, Any]:
        """Create a new nested context."""
        # Verify context exists
        context_result = await db.execute(
            select(Context).where(Context.id == context_id)
        )
        if not context_result.scalar_one_or_none():
            raise ValueError("Context not found")

        nested_context_id = str(uuid4())
        slug = slugify(name)

        # Check for duplicate slug within context
        existing = await db.execute(
            select(NestedContext).where(
                NestedContext.slug == slug,
                NestedContext.context_id == context_id,
            )
        )
        if existing.scalar_one_or_none():
            slug = f"{slug}-{int(datetime.utcnow().timestamp())}"

        # Check for duplicate handle
        if handle:
            handle_lower = handle.lower()
            handle_exists = await db.execute(
                select(NestedContext).where(NestedContext.handle == handle_lower)
            )
            if handle_exists.scalar_one_or_none():
                raise ValueError(f"Handle @{handle} is already taken")
        else:
            handle_lower = None

        nested_context = NestedContext(
            id=nested_context_id,
            context_id=context_id,
            name=name,
            slug=slug,
            handle=handle_lower,
            context_type=context_type,
            description=description,
            icon=icon,
            color=color,
            presence_id=serialize_json_array(presence_ids or []),
            visibility=visibility,
            knowledge_base_ids=serialize_json_array(knowledge_base_ids or []),
            gathering_ids=serialize_json_array(gathering_ids or []),
            instruction_ids=serialize_json_array(instruction_ids or []),
            instructions=instructions,
            created_by=created_by,
        )

        db.add(nested_context)
        await db.commit()
        await db.refresh(nested_context)

        logger.info(f"NestedContext created: {name} ({nested_context_id}) under context {context_id}")
        return self._format_nested_context_with_counts(nested_context)

    async def get_by_id(
        self,
        db: AsyncSession,
        nested_context_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a nested context by ID."""
        result = await db.execute(
            select(NestedContext).where(NestedContext.id == nested_context_id)
        )
        nested_context = result.scalar_one_or_none()
        if not nested_context:
            return None
        return self._format_nested_context_with_counts(nested_context)

    async def get_by_handle(
        self,
        db: AsyncSession,
        handle: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a nested context by handle."""
        result = await db.execute(
            select(NestedContext).where(NestedContext.handle == handle.lower())
        )
        nested_context = result.scalar_one_or_none()
        if not nested_context:
            return None
        return self._format_nested_context_with_counts(nested_context)

    async def list(
        self,
        db: AsyncSession,
        context_id: Optional[str] = None,
        visibility: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List all nested contexts."""
        query = select(NestedContext).where(NestedContext.is_active == True)

        if context_id:
            query = query.where(NestedContext.context_id == context_id)
        if visibility:
            query = query.where(NestedContext.visibility == visibility)

        query = query.order_by(NestedContext.created_at.asc())

        result = await db.execute(query)
        nested_contexts = result.scalars().all()

        return [self._format_nested_context_with_counts(nc) for nc in nested_contexts]

    async def list_by_context_id(
        self,
        db: AsyncSession,
        context_id: str,
    ) -> List[Dict[str, Any]]:
        """List all nested contexts for a specific context."""
        result = await db.execute(
            select(NestedContext)
            .where(NestedContext.context_id == context_id, NestedContext.is_active == True)
            .order_by(NestedContext.created_at.asc())
        )
        nested_contexts = result.scalars().all()
        return [self._format_nested_context_with_counts(nc) for nc in nested_contexts]

    async def update(
        self,
        db: AsyncSession,
        nested_context_id: str,
        **kwargs,
    ) -> Optional[Dict[str, Any]]:
        """Update a nested context."""
        result = await db.execute(
            select(NestedContext).where(NestedContext.id == nested_context_id)
        )
        nested_context = result.scalar_one_or_none()
        if not nested_context:
            return None

        # Handle name change -> update slug
        if "name" in kwargs and kwargs["name"]:
            kwargs["slug"] = slugify(kwargs["name"])

        # Handle handle uniqueness
        if "handle" in kwargs and kwargs["handle"]:
            handle_lower = kwargs["handle"].lower()
            handle_exists = await db.execute(
                select(NestedContext)
                .where(NestedContext.handle == handle_lower)
                .where(NestedContext.id != nested_context_id)
            )
            if handle_exists.scalar_one_or_none():
                raise ValueError(f"Handle @{kwargs['handle']} is already taken")
            kwargs["handle"] = handle_lower

        # Handle JSON array fields
        if "presence_ids" in kwargs:
            kwargs["presence_id"] = serialize_json_array(kwargs.pop("presence_ids"))
        if "knowledge_base_ids" in kwargs:
            kwargs["knowledge_base_ids"] = serialize_json_array(kwargs["knowledge_base_ids"])
        if "gathering_ids" in kwargs:
            kwargs["gathering_ids"] = serialize_json_array(kwargs["gathering_ids"])
        if "instruction_ids" in kwargs:
            kwargs["instruction_ids"] = serialize_json_array(kwargs["instruction_ids"])

        # Update fields
        for key, value in kwargs.items():
            if value is not None and hasattr(nested_context, key):
                setattr(nested_context, key, value)

        nested_context.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(nested_context)

        return self._format_nested_context_with_counts(nested_context)

    async def delete(
        self,
        db: AsyncSession,
        nested_context_id: str,
    ) -> bool:
        """Delete a nested context."""
        result = await db.execute(
            delete(NestedContext).where(NestedContext.id == nested_context_id)
        )
        await db.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"NestedContext deleted: {nested_context_id}")
        return deleted

    def _format_nested_context_with_counts(
        self,
        nested_context: NestedContext,
    ) -> Dict[str, Any]:
        """Format nested context with counts."""
        return {
            "id": nested_context.id,
            "context_id": nested_context.context_id,
            "name": nested_context.name,
            "slug": nested_context.slug,
            "handle": nested_context.handle,
            "context_type": nested_context.context_type,
            "description": nested_context.description,
            "icon": nested_context.icon,
            "color": nested_context.color,
            "presence_ids": parse_json_array(nested_context.presence_id),
            "visibility": nested_context.visibility.value if nested_context.visibility else "public",
            "knowledge_base_ids": parse_json_array(nested_context.knowledge_base_ids),
            "gathering_ids": parse_json_array(nested_context.gathering_ids),
            "instruction_ids": parse_json_array(nested_context.instruction_ids),
            "instructions": nested_context.instructions or "",
            "is_active": nested_context.is_active,
            "created_by": nested_context.created_by,
            "created_at": nested_context.created_at,
            "updated_at": nested_context.updated_at,
            # Counts - assets and games would come from kinship-assets
            "assets_count": 0,
            "games_count": 0,
        }


# Singleton instances
context_service = ContextService()
nested_context_service = NestedContextService()