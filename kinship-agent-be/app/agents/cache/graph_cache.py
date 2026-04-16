"""
Kinship Agent - Enhanced Graph Cache

ADDRESSES CONCERNS:
- #3 Unbounded Memory: max_size limit with LRU eviction
- #9 Graph Builder Work: Compiled graph is fully reused, no per-request rebuild

DESIGN:
The orchestration graph is STATIC (same structure for all Presences).
We cache compiled graphs per presence_id for:
1. Future customization support
2. Isolation between presences
3. Potential per-presence optimizations

The graph does NOT include worker-specific logic at build time.
Workers are selected dynamically at runtime via state.
"""

import logging
from typing import Optional, Callable, Any

# LangGraph import - handle different versions
try:
    from langgraph.graph import CompiledGraph
except ImportError:
    try:
        from langgraph.graph.state import CompiledStateGraph as CompiledGraph
    except ImportError:
        # Fallback: use Any type hint if langgraph not available
        CompiledGraph = Any

from app.agents.cache.base import TTLCache
from app.core.config import cache_config

logger = logging.getLogger(__name__)


class GraphCache:
    """
    Cache for compiled LangGraph instances.
    
    MEMORY BOUND (#3):
    - max_size limits total cached graphs
    - LRU eviction when full
    
    NO PER-REQUEST REBUILD (#9):
    - Compiled graph is fully reusable
    - No rehydration or rebinding needed
    - Graph structure is static
    
    The graph uses dynamic routing:
    - Worker selection happens via state, not graph structure
    - Tool binding happens in worker_executor node, not at build time
    """
    
    def __init__(self):
        """Initialize with config settings."""
        self._cache = TTLCache[CompiledGraph](
            max_size=cache_config.graph.max_size,
            ttl_seconds=cache_config.graph.ttl_seconds,
            name="graph_cache",
        )
        self._compile_count = 0
    
    def get(self, presence_id: str) -> Optional[CompiledGraph]:
        """Get cached compiled graph."""
        return self._cache.get(presence_id)
    
    def set(self, presence_id: str, graph: CompiledGraph) -> None:
        """Cache compiled graph."""
        self._cache.set(presence_id, graph)
    
    async def get_or_compile(
        self,
        presence_id: str,
        compiler: Callable[[], CompiledGraph],
    ) -> CompiledGraph:
        """
        Get cached graph or compile new one.
        
        The compiler function builds the STATIC graph structure.
        It does NOT include any per-request or per-worker logic.
        
        Args:
            presence_id: Presence agent ID (cache key)
            compiler: Function that builds and compiles the graph
            
        Returns:
            Compiled LangGraph ready for execution
        """
        # Try cache first
        graph = self.get(presence_id)
        if graph is not None:
            logger.debug(f"Graph cache hit: {presence_id}")
            return graph
        
        # Compile new graph
        logger.info(f"Compiling graph for presence: {presence_id}")
        graph = compiler()
        self._compile_count += 1
        
        # Cache it
        self.set(presence_id, graph)
        
        logger.info(
            f"Graph compiled and cached: {presence_id} "
            f"(total compiles: {self._compile_count})"
        )
        
        return graph
    
    def invalidate(self, presence_id: str) -> bool:
        """
        Invalidate cached graph for a presence (#1).
        
        Call this when:
        - Workers are added/removed (changes routing options)
        - Presence config changes significantly
        
        Note: For our STATIC graph design, this is mostly
        for future customization support.
        """
        result = self._cache.invalidate(presence_id)
        if result:
            logger.info(f"Graph cache invalidated: {presence_id}")
        return result
    
    def invalidate_all(self) -> int:
        """Invalidate all cached graphs."""
        count = self._cache.invalidate_all()
        logger.info(f"Graph cache invalidated all: {count} graphs")
        return count
    
    def size(self) -> int:
        """Get number of cached graphs."""
        return self._cache.size()
    
    def get_stats(self) -> dict:
        """Get cache statistics with compile count."""
        stats = self._cache.get_stats()
        stats["compile_count"] = self._compile_count
        return stats
