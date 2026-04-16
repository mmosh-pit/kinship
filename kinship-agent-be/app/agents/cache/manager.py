"""
Kinship Agent - Enhanced Cache Manager

Coordinates all cache layers with EXPLICIT INVALIDATION STRATEGY.

ADDRESSES CONCERNS:
- #1 Cache Invalidation: Clear invalidation hooks for all CRUD operations
- #12 DB State Coupling: Version tracking to detect divergence

INVALIDATION STRATEGY:
- Worker created → invalidate parent presence cache
- Worker updated → invalidate worker cache + parent presence cache  
- Worker deleted → invalidate worker cache + parent presence cache
- Presence updated → invalidate presence cache + graph cache
- Prompt updated → invalidate all presences using that prompt
- Tool config changed → invalidate all caches (full refresh)
"""

import logging
from typing import Optional, Dict, Any, List, TYPE_CHECKING

# LangGraph import - handle different versions
try:
    from langgraph.graph import CompiledGraph
except ImportError:
    try:
        from langgraph.graph.state import CompiledStateGraph as CompiledGraph
    except ImportError:
        CompiledGraph = Any

from app.agents.cache.graph_cache import GraphCache
from app.agents.cache.worker_cache import WorkerConfigCache
from app.agents.cache.presence_cache import PresenceContextCache
from app.agents.types import WorkerConfig, PresenceContext

# NOTE: build_orchestration_graph is imported lazily in get_or_compile_graph
# to avoid circular imports

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

logger = logging.getLogger(__name__)


class CacheManager:
    """
    Unified cache manager with explicit invalidation strategy.
    
    CACHE LAYERS:
    - L1: Graph Cache (compiled LangGraph instances)
    - L2: Worker Cache (worker configurations)
    - L3: Presence Cache (presence contexts with worker lists)
    
    INVALIDATION RULES (Concern #1):
    ┌─────────────────────┬───────────────────────────────────────────────┐
    │ Event               │ Invalidation Action                           │
    ├─────────────────────┼───────────────────────────────────────────────┤
    │ Worker Created      │ presence_cache[parent_id]                     │
    │ Worker Updated      │ worker_cache[id] + presence_cache[parent_id]  │
    │ Worker Deleted      │ worker_cache[id] + presence_cache[parent_id]  │
    │ Presence Updated    │ presence_cache[id] + graph_cache[id]          │
    │ Prompt Updated      │ presence_cache[*using_prompt]                 │
    │ Full Refresh        │ ALL caches                                    │
    └─────────────────────┴───────────────────────────────────────────────┘
    
    Usage:
        # In API handlers, after DB operations:
        
        # Worker created
        cache_manager.on_worker_created(worker_id, parent_presence_id)
        
        # Worker updated
        cache_manager.on_worker_updated(worker_id, parent_presence_id)
        
        # Presence updated
        cache_manager.on_presence_updated(presence_id)
    """
    
    _instance = None
    
    def __new__(cls):
        """Singleton pattern."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance
    
    def __init__(self):
        """Initialize cache layers."""
        if self._initialized:
            return
        
        self._graph_cache = GraphCache()
        self._worker_cache = WorkerConfigCache()
        self._presence_cache = PresenceContextCache()
        
        self._initialized = True
        logger.info("CacheManager initialized with all cache layers")
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Cache Access Methods
    # ─────────────────────────────────────────────────────────────────────────────
    
    async def get_or_compile_graph(self, presence_id: str) -> CompiledGraph:
        """
        Get or compile orchestration graph for a Presence.
        
        Note: Graph is STATIC (same structure for all Presences).
        Cached per presence for future customization support.
        """
        # Lazy import to avoid circular dependency
        from app.agents.graph.builder import build_orchestration_graph
        
        return await self._graph_cache.get_or_compile(
            presence_id=presence_id,
            compiler=build_orchestration_graph,
        )
    
    async def get_worker_config(
        self,
        worker_id: str,
        db_session: "AsyncSession",
    ) -> Optional[WorkerConfig]:
        """Get worker configuration from cache or database."""
        return await self._worker_cache.get_or_load(worker_id, db_session)
    
    async def get_presence_context(
        self,
        presence_id: str,
        db_session: "AsyncSession",
    ) -> Optional[PresenceContext]:
        """Get presence context from cache or database."""
        return await self._presence_cache.get_or_load(presence_id, db_session)
    
    # ─────────────────────────────────────────────────────────────────────────────
    # EXPLICIT INVALIDATION HOOKS (Concern #1)
    # Call these from API handlers after DB operations
    # ─────────────────────────────────────────────────────────────────────────────
    
    def on_worker_created(self, worker_id: str, presence_id: str) -> Dict[str, bool]:
        """
        Invalidate caches after worker creation.
        
        Args:
            worker_id: The new worker's ID
            presence_id: Parent presence ID
            
        Returns:
            Dict showing which caches were invalidated
        """
        logger.info(f"Cache invalidation: worker_created worker={worker_id} presence={presence_id}")
        return {
            "presence": self._presence_cache.invalidate(presence_id),
            "graph": self._graph_cache.invalidate(presence_id),
        }
    
    def on_worker_updated(self, worker_id: str, presence_id: Optional[str] = None) -> Dict[str, bool]:
        """
        Invalidate caches after worker update.
        
        Args:
            worker_id: The updated worker's ID
            presence_id: Parent presence ID (if known)
            
        Returns:
            Dict showing which caches were invalidated
        """
        logger.info(f"Cache invalidation: worker_updated worker={worker_id} presence={presence_id}")
        result = {
            "worker": self._worker_cache.invalidate(worker_id),
        }
        
        if presence_id:
            result["presence"] = self._presence_cache.invalidate(presence_id)
            result["graph"] = self._graph_cache.invalidate(presence_id)
        
        return result
    
    def on_worker_deleted(self, worker_id: str, presence_id: Optional[str] = None) -> Dict[str, bool]:
        """
        Invalidate caches after worker deletion.
        
        Args:
            worker_id: The deleted worker's ID
            presence_id: Parent presence ID (if known)
            
        Returns:
            Dict showing which caches were invalidated
        """
        logger.info(f"Cache invalidation: worker_deleted worker={worker_id} presence={presence_id}")
        result = {
            "worker": self._worker_cache.invalidate(worker_id),
        }
        
        if presence_id:
            result["presence"] = self._presence_cache.invalidate(presence_id)
            result["graph"] = self._graph_cache.invalidate(presence_id)
        
        return result
    
    def on_presence_updated(self, presence_id: str) -> Dict[str, bool]:
        """
        Invalidate caches after presence update.
        
        Args:
            presence_id: The updated presence's ID
            
        Returns:
            Dict showing which caches were invalidated
        """
        logger.info(f"Cache invalidation: presence_updated presence={presence_id}")
        return {
            "presence": self._presence_cache.invalidate(presence_id),
            "graph": self._graph_cache.invalidate(presence_id),
        }
    
    def on_prompt_updated(self, prompt_id: str, presence_ids: List[str]) -> Dict[str, Any]:
        """
        Invalidate caches after prompt update.
        
        Args:
            prompt_id: The updated prompt's ID
            presence_ids: List of presence IDs using this prompt
            
        Returns:
            Dict showing which caches were invalidated
        """
        logger.info(f"Cache invalidation: prompt_updated prompt={prompt_id} presences={len(presence_ids)}")
        invalidated_presences = []
        
        for presence_id in presence_ids:
            if self._presence_cache.invalidate(presence_id):
                invalidated_presences.append(presence_id)
            self._graph_cache.invalidate(presence_id)
        
        return {
            "prompt_id": prompt_id,
            "invalidated_presences": invalidated_presences,
            "count": len(invalidated_presences),
        }
    
    def on_tool_config_changed(self) -> Dict[str, int]:
        """
        Invalidate ALL caches when tool config changes.
        
        This is a nuclear option for when MCP tool mappings change.
        
        Returns:
            Dict showing counts of invalidated entries
        """
        logger.warning("Cache invalidation: tool_config_changed - FULL REFRESH")
        return {
            "graphs": self._graph_cache.invalidate_all(),
            "workers": self._worker_cache.invalidate_all(),
            "presences": self._presence_cache.invalidate_all(),
        }
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Legacy Invalidation Methods (kept for compatibility)
    # ─────────────────────────────────────────────────────────────────────────────
    
    def invalidate_for_presence(self, presence_id: str) -> Dict[str, bool]:
        """Legacy method - prefer on_presence_updated()."""
        return self.on_presence_updated(presence_id)
    
    def invalidate_worker(self, worker_id: str, presence_id: Optional[str] = None) -> Dict[str, bool]:
        """Legacy method - prefer on_worker_updated()."""
        return self.on_worker_updated(worker_id, presence_id)
    
    def invalidate_all(self) -> Dict[str, int]:
        """Clear all caches."""
        return self.on_tool_config_changed()
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Version Checking (Concern #12 - DB State Coupling)
    # ─────────────────────────────────────────────────────────────────────────────
    
    def get_cached_presence_version(self, presence_id: str) -> Optional[str]:
        """Get the version hash of cached presence context."""
        return self._presence_cache.get_cached_version(presence_id)
    
    def get_cached_worker_version(self, worker_id: str) -> Optional[str]:
        """Get the version hash of cached worker config."""
        return self._worker_cache.get_cached_version(worker_id)
    
    def is_presence_cache_stale(self, presence_id: str, db_version: str) -> bool:
        """
        Check if presence cache is stale vs database version.
        
        Use this to detect cache/DB divergence (#12).
        """
        return self._presence_cache.is_stale_vs_version(presence_id, db_version)
    
    # ─────────────────────────────────────────────────────────────────────────────
    # Statistics
    # ─────────────────────────────────────────────────────────────────────────────
    
    def get_stats(self) -> Dict[str, Any]:
        """Get statistics from all cache layers."""
        return {
            "graph_cache": self._graph_cache.get_stats(),
            "worker_cache": self._worker_cache.get_stats(),
            "presence_cache": self._presence_cache.get_stats(),
        }
    
    def get_memory_pressure(self) -> Dict[str, float]:
        """Get memory pressure for all caches (#3)."""
        graph_stats = self._graph_cache.get_stats()
        worker_stats = self._worker_cache.get_stats()
        presence_stats = self._presence_cache.get_stats()
        
        return {
            "graph": graph_stats.get("memory_pressure", 0.0),
            "worker": worker_stats.get("memory_pressure", 0.0),
            "presence": presence_stats.get("memory_pressure", 0.0),
        }


# Singleton instance
cache_manager = CacheManager()
