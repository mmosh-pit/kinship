"""
Kinship Agent - Enhanced Presence Context Cache

ADDRESSES CONCERNS:
- #2 Cache Key Design: Version hash includes workers, tools, prompts
- #5 Versioning: Content hash for staleness detection
- #12 DB State Coupling: Version check detects divergence
- #14 Worker Count Limits: Enforces max workers per presence
"""

import hashlib
import json
import logging
from typing import Optional, List, Dict, TYPE_CHECKING

from langsmith import traceable

from app.agents.cache.base import AsyncTTLCache, compute_content_hash
from app.agents.types import PresenceContext, WorkerSummary
from app.core.config import cache_config, mcp_tools_config, orchestration_config

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)

# Default max workers if not in config
DEFAULT_MAX_WORKERS = 50


class PresenceContextCache:
    """
    Cache for Presence agent contexts with version tracking.
    
    VERSION TRACKING (#5):
    - Version = hash of (presence_data + worker_ids + worker_tools + prompt)
    - Staleness detection via version comparison
    
    WORKER LIMITS (#14):
    - Enforces max_workers_per_presence from config
    - Logs warning when limit is hit
    
    INVALIDATION (#1):
    - Call invalidate() when presence/workers change
    - Version mismatch triggers automatic refresh
    """
    
    def __init__(self):
        """Initialize with config settings."""
        self._cache = AsyncTTLCache[PresenceContext](
            max_size=cache_config.presence.max_size,
            ttl_seconds=cache_config.presence.ttl_seconds,
            stale_ttl_seconds=cache_config.presence.ttl_seconds * 2,
            name="presence_cache",
        )
        
        # Worker limit (#14)
        self._max_workers = getattr(
            orchestration_config, 'max_workers_per_presence', DEFAULT_MAX_WORKERS
        )
    
    def get(self, presence_id: str) -> Optional[PresenceContext]:
        """Get cached presence context."""
        return self._cache.get(presence_id)
    
    def set(self, presence_id: str, context: PresenceContext, version: Optional[str] = None) -> None:
        """Cache presence context with version."""
        if version is None:
            version = self._compute_version(context)
        self._cache.set(presence_id, context, version=version)
    
    @traceable(name="presence_cache_get_or_load", run_type="chain")
    async def get_or_load(
        self,
        presence_id: str,
        db_session: "AsyncSession",
    ) -> Optional[PresenceContext]:
        """
        Get from cache or load from DB.
        
        Uses stale-while-revalidate for resilience.
        """
        # Try cache first
        context = self.get(presence_id)
        if context is not None:
            logger.debug(f"Presence cache HIT for {presence_id}")
            return context
        
        logger.debug(f"Presence cache MISS for {presence_id}, loading from DB")
        
        # Try stale as fallback
        stale = self._cache.get(presence_id, allow_stale=True)
        
        try:
            context = await self._load_from_db(presence_id, db_session)
            if context:
                version = self._compute_version(context)
                self.set(presence_id, context, version=version)
            return context
        except Exception as e:
            if stale:
                logger.warning(f"DB load failed for presence {presence_id}, using stale: {e}")
                return stale
            raise
    
    def _compute_version(self, context: PresenceContext) -> str:
        """
        Compute version hash for staleness detection (#5).
        
        Includes:
        - Presence ID and name
        - System prompt (truncated)
        - Worker IDs and their tools
        - Knowledge base IDs
        """
        version_data = {
            "pid": context["presence_id"],
            "name": context["presence_name"],
            "tone": context["presence_tone"],
            "prompt": (context.get("presence_system_prompt") or "")[:200],
            "workers": sorted([
                f"{w['id']}:{','.join(sorted(w['tools']))}"
                for w in context["workers"]
            ]),
            "kb": sorted(context.get("knowledge_base_ids", [])),
        }
        return compute_content_hash(version_data)
    
    def is_stale_vs_version(self, presence_id: str, current_version: str) -> bool:
        """Check if cache is stale vs known version (#12)."""
        return self._cache.is_stale(presence_id, current_version)
    
    def get_cached_version(self, presence_id: str) -> Optional[str]:
        """Get cached version hash."""
        return self._cache.get_version(presence_id)
    
    @traceable(name="presence_db_load", run_type="chain")
    async def _load_from_db(
        self,
        presence_id: str,
        db_session: "AsyncSession",
    ) -> Optional[PresenceContext]:
        """
        Load presence context from database.
        
        WORKER LIMIT (#14): Enforces max workers.
        """
        from sqlalchemy import select, and_
        from app.db.models import Agent, AgentType, AgentStatus, Prompt
        
        # Load Presence
        stmt = select(Agent).where(
            Agent.id == presence_id,
            Agent.type == AgentType.PRESENCE,
            Agent.status != AgentStatus.ARCHIVED,
        )
        result = await db_session.execute(stmt)
        presence = result.scalar_one_or_none()
        
        if not presence:
            return None
        
        # Load system prompt
        system_prompt = presence.system_prompt or ""
        if presence.prompt_id and not system_prompt:
            prompt_stmt = select(Prompt).where(Prompt.id == presence.prompt_id)
            prompt_result = await db_session.execute(prompt_stmt)
            prompt = prompt_result.scalar_one_or_none()
            if prompt and prompt.content:
                system_prompt = prompt.content
        
        # Load Workers with LIMIT (#14)
        workers_stmt = select(Agent).where(
            and_(
                Agent.parent_id == presence_id,
                Agent.type == AgentType.WORKER,
                Agent.status != AgentStatus.ARCHIVED,
            )
        ).order_by(Agent.created_at.desc()).limit(self._max_workers)
        
        result = await db_session.execute(workers_stmt)
        workers = result.scalars().all()
        
        # Log warning if at limit (#14)
        if len(workers) >= self._max_workers:
            logger.warning(
                f"Presence {presence_id} has {len(workers)}+ workers, "
                f"limited to {self._max_workers}. Archive unused workers."
            )
        
        # Build worker summaries and capability index
        worker_summaries: List[WorkerSummary] = []
        capability_index: Dict[str, str] = {}
        all_capabilities: List[str] = []
        
        for worker in workers:
            tools = worker.tools or []
            capabilities = self._get_capabilities_for_tools(tools)
            
            worker_summaries.append(WorkerSummary(
                id=worker.id,
                name=worker.name,
                description=worker.description or "",
                tools=tools,
                capabilities=capabilities,
            ))
            
            for cap in capabilities:
                if cap not in capability_index:
                    capability_index[cap] = worker.id
                    all_capabilities.append(cap)
        
        return PresenceContext(
            presence_id=presence.id,
            presence_name=presence.name,
            presence_handle=presence.handle,
            presence_tone=presence.tone.value if presence.tone else "neutral",
            presence_description=presence.description,
            presence_backstory=presence.backstory,
            presence_system_prompt=system_prompt,
            workers=worker_summaries,
            capability_index=capability_index,
            all_capabilities=all_capabilities,
            knowledge_base_ids=presence.knowledge_base_ids or [],
        )
    
    def _get_capabilities_for_tools(self, tools: List[str]) -> List[str]:
        """Get capabilities from MCP config."""
        capabilities = []
        for tool_name in tools:
            if tool_name in mcp_tools_config:
                capabilities.extend(mcp_tools_config[tool_name].capabilities)
        return capabilities
    
    def invalidate(self, presence_id: str) -> bool:
        """Invalidate cached context (#1)."""
        return self._cache.invalidate(presence_id)
    
    def invalidate_all(self) -> int:
        """Invalidate all contexts."""
        return self._cache.invalidate_all()
    
    def size(self) -> int:
        """Get cache size."""
        return self._cache.size()
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        return self._cache.get_stats()
