"""
Kinship Agent - Enhanced Worker Configuration Cache

ADDRESSES CONCERNS:
- #2 Cache Key Design: Version includes tools, prompt, config
- #4 Worker Lifecycle: Tracks entry state (fresh/warm/stale)
- #5 Versioning: Content hash for staleness detection
"""

import logging
from typing import Optional, TYPE_CHECKING

from langsmith import traceable

from app.agents.cache.base import AsyncTTLCache, compute_content_hash
from app.agents.types import WorkerConfig
from app.core.config import cache_config

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class WorkerConfigCache:
    """
    Cache for Worker agent configurations with version tracking.
    
    VERSION TRACKING (#5):
    - Version = hash of (tools + prompt + description)
    - Staleness detection for cache/DB divergence
    
    LIFECYCLE (#4):
    - Entries track fresh/warm/stale/invalidated state
    - Stale entries can serve as fallback on DB failure
    """
    
    def __init__(self):
        """Initialize with config settings."""
        self._cache = AsyncTTLCache[WorkerConfig](
            max_size=cache_config.worker.max_size,
            ttl_seconds=cache_config.worker.ttl_seconds,
            stale_ttl_seconds=cache_config.worker.ttl_seconds * 2,
            name="worker_cache",
        )
    
    def get(self, worker_id: str) -> Optional[WorkerConfig]:
        """Get cached worker config."""
        return self._cache.get(worker_id)
    
    def set(self, worker_id: str, config: WorkerConfig, version: Optional[str] = None) -> None:
        """Cache worker config with version."""
        if version is None:
            version = self._compute_version(config)
        self._cache.set(worker_id, config, version=version)
    
    @traceable(name="worker_cache_get_or_load", run_type="chain")
    async def get_or_load(
        self,
        worker_id: str,
        db_session: "AsyncSession",
    ) -> Optional[WorkerConfig]:
        """
        Get from cache or load from DB.
        
        Uses stale-while-revalidate for resilience.
        """
        # Try cache first
        config = self.get(worker_id)
        if config is not None:
            logger.debug(f"Worker cache HIT for {worker_id}")
            return config
        
        logger.debug(f"Worker cache MISS for {worker_id}, loading from DB")
        
        # Try stale as fallback
        stale = self._cache.get(worker_id, allow_stale=True)
        
        try:
            config = await self._load_from_db(worker_id, db_session)
            if config:
                version = self._compute_version(config)
                self.set(worker_id, config, version=version)
            return config
        except Exception as e:
            if stale:
                logger.warning(f"DB load failed for worker {worker_id}, using stale: {e}")
                return stale
            raise
    
    def _compute_version(self, config: WorkerConfig) -> str:
        """
        Compute version hash for staleness detection (#5).
        
        Includes all config that affects worker behavior.
        """
        version_data = {
            "id": config.get("id"),
            "name": config.get("name"),
            "tools": sorted(config.get("tools", [])),
            "prompt": (config.get("system_prompt") or "")[:200],
            "desc": (config.get("description") or "")[:100],
        }
        return compute_content_hash(version_data)
    
    def is_stale_vs_version(self, worker_id: str, current_version: str) -> bool:
        """Check if cache is stale vs known version."""
        return self._cache.is_stale(worker_id, current_version)
    
    def get_cached_version(self, worker_id: str) -> Optional[str]:
        """Get cached version hash."""
        return self._cache.get_version(worker_id)
    
    @traceable(name="worker_db_load", run_type="chain")
    async def _load_from_db(
        self,
        worker_id: str,
        db_session: "AsyncSession",
    ) -> Optional[WorkerConfig]:
        """Load worker config from database."""
        from sqlalchemy import select
        from app.db.models import Agent, AgentType, AgentStatus, Prompt
        
        # Load Worker
        stmt = select(Agent).where(
            Agent.id == worker_id,
            Agent.type == AgentType.WORKER,
            Agent.status != AgentStatus.ARCHIVED,
        )
        result = await db_session.execute(stmt)
        worker = result.scalar_one_or_none()
        
        if not worker:
            return None
        
        # Load system prompt if referenced
        system_prompt = worker.system_prompt or ""
        if worker.prompt_id and not system_prompt:
            prompt_stmt = select(Prompt).where(Prompt.id == worker.prompt_id)
            prompt_result = await db_session.execute(prompt_stmt)
            prompt = prompt_result.scalar_one_or_none()
            if prompt and prompt.content:
                system_prompt = prompt.content
        
        return WorkerConfig(
            id=worker.id,
            name=worker.name,
            description=worker.description,
            backstory=worker.backstory,
            tools=worker.tools or [],
            system_prompt=system_prompt,
            knowledge_base_ids=worker.knowledge_base_ids or [],
            parent_id=worker.parent_id,
        )
    
    def invalidate(self, worker_id: str) -> bool:
        """Invalidate cached config (#1)."""
        return self._cache.invalidate(worker_id)
    
    def invalidate_all(self) -> int:
        """Invalidate all configs."""
        return self._cache.invalidate_all()
    
    def size(self) -> int:
        """Get cache size."""
        return self._cache.size()
    
    def get_stats(self) -> dict:
        """Get cache statistics."""
        return self._cache.get_stats()
