"""
Kinship Agent - Roles Service

Service class for Context Role management.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from uuid import uuid4

from sqlalchemy import select, delete, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ContextRole, Context, Agent, AgentType

logger = logging.getLogger(__name__)


class RoleService:
    """Service for managing context roles."""

    async def create(
        self,
        db: AsyncSession,
        context_id: str,
        worker_ids: List[str],
        name: str,
        wallet: str,
        created_by: str,
    ) -> Dict[str, Any]:
        """Create a new role."""
        
        # Verify context exists
        result = await db.execute(select(Context).where(Context.id == context_id))
        if not result.scalar_one_or_none():
            raise ValueError("Context not found")
        
        # Verify all workers exist and are WORKER type
        for worker_id in worker_ids:
            result = await db.execute(
                select(Agent).where(
                    and_(Agent.id == worker_id, Agent.type == AgentType.WORKER)
                )
            )
            if not result.scalar_one_or_none():
                raise ValueError(f"Worker agent not found: {worker_id}")
        
        # Check for duplicate name in same context
        existing = await db.execute(
            select(ContextRole).where(
                and_(
                    ContextRole.context_id == context_id,
                    ContextRole.name == name,
                )
            )
        )
        if existing.scalar_one_or_none():
            raise ValueError(f"Role with name '{name}' already exists in this context")
        
        role_id = str(uuid4())
        role = ContextRole(
            id=role_id,
            context_id=context_id,
            worker_ids=worker_ids,
            name=name,
            wallet=wallet,
            created_by=created_by,
        )
        
        db.add(role)
        await db.commit()
        await db.refresh(role)
        
        logger.info(f"Role created: {name} ({role_id}) with {len(worker_ids)} workers")
        return await self._format_role_with_workers(db, role)

    async def get_by_id(
        self,
        db: AsyncSession,
        role_id: str,
    ) -> Optional[Dict[str, Any]]:
        """Get a role by ID with worker details."""
        result = await db.execute(
            select(ContextRole).where(ContextRole.id == role_id)
        )
        role = result.scalar_one_or_none()
        if not role:
            return None
        return await self._format_role_with_workers(db, role)

    async def list_by_context(
        self,
        db: AsyncSession,
        context_id: str,
    ) -> List[Dict[str, Any]]:
        """List all roles for a context."""
        result = await db.execute(
            select(ContextRole)
            .where(ContextRole.context_id == context_id)
            .order_by(ContextRole.created_at.asc())
        )
        roles = result.scalars().all()
        return [await self._format_role_with_workers(db, r) for r in roles]

    async def list_all(
        self,
        db: AsyncSession,
        context_id: Optional[str] = None,
        wallet: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """List roles with optional filters."""
        query = select(ContextRole)
        
        if context_id:
            query = query.where(ContextRole.context_id == context_id)
        if wallet:
            query = query.where(ContextRole.wallet == wallet)
        
        query = query.order_by(ContextRole.created_at.asc())
        
        result = await db.execute(query)
        roles = result.scalars().all()
        return [await self._format_role_with_workers(db, r) for r in roles]

    async def update(
        self,
        db: AsyncSession,
        role_id: str,
        **kwargs,
    ) -> Optional[Dict[str, Any]]:
        """Update a role."""
        result = await db.execute(
            select(ContextRole).where(ContextRole.id == role_id)
        )
        role = result.scalar_one_or_none()
        if not role:
            return None
        
        # Validate worker_ids if provided
        if "worker_ids" in kwargs and kwargs["worker_ids"]:
            for worker_id in kwargs["worker_ids"]:
                result = await db.execute(
                    select(Agent).where(
                        and_(Agent.id == worker_id, Agent.type == AgentType.WORKER)
                    )
                )
                if not result.scalar_one_or_none():
                    raise ValueError(f"Worker agent not found: {worker_id}")
        
        # Check for duplicate name if name is being changed
        if "name" in kwargs and kwargs["name"] and kwargs["name"] != role.name:
            existing = await db.execute(
                select(ContextRole).where(
                    and_(
                        ContextRole.context_id == role.context_id,
                        ContextRole.name == kwargs["name"],
                        ContextRole.id != role_id,
                    )
                )
            )
            if existing.scalar_one_or_none():
                raise ValueError(f"Role with name '{kwargs['name']}' already exists")
        
        # Update fields
        for key, value in kwargs.items():
            if value is not None and hasattr(role, key):
                setattr(role, key, value)
        
        role.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(role)
        
        logger.info(f"Role updated: {role.name} ({role_id})")
        return await self._format_role_with_workers(db, role)

    async def delete(
        self,
        db: AsyncSession,
        role_id: str,
    ) -> bool:
        """Delete a role."""
        result = await db.execute(
            delete(ContextRole).where(ContextRole.id == role_id)
        )
        await db.commit()
        deleted = result.rowcount > 0
        if deleted:
            logger.info(f"Role deleted: {role_id}")
        return deleted

    async def _format_role_with_workers(
        self,
        db: AsyncSession,
        role: ContextRole,
    ) -> Dict[str, Any]:
        """Format role with aggregated worker data."""
        
        # Fetch all workers
        workers = []
        all_tool_ids = set()
        
        if role.worker_ids:
            for worker_id in role.worker_ids:
                result = await db.execute(
                    select(Agent).where(Agent.id == worker_id)
                )
                worker = result.scalar_one_or_none()
                if worker:
                    worker_tools = worker.tools or []
                    workers.append({
                        "id": worker.id,
                        "name": worker.name,
                        "tools": worker_tools,
                    })
                    all_tool_ids.update(worker_tools)
        
        return {
            "id": role.id,
            "context_id": role.context_id,
            "worker_ids": role.worker_ids or [],
            "name": role.name,
            "wallet": role.wallet,
            "tool_ids": list(all_tool_ids),
            "workers": workers,
            "created_by": role.created_by,
            "created_at": role.created_at,
            "updated_at": role.updated_at,
        }


# Singleton instance
role_service = RoleService()
