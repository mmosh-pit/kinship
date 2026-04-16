"""
Kinship Agent - Enhanced Base Cache Implementation

ADDRESSES CONCERNS:
- #2 Cache Key Design: Version/hash tracking for staleness detection
- #3 Unbounded Memory: max_size limit with LRU eviction
- #4 Worker Lifecycle: Entry state management (fresh/warm/stale/invalidated)
- #5 Versioning: Content hash + version tracking
- #13 Concurrency: RLock + asyncio.Lock + pending load deduplication
"""

import asyncio
import hashlib
import json
import time
import logging
from typing import TypeVar, Generic, Optional, Dict, Callable, Any, Awaitable
from dataclasses import dataclass, field
from collections import OrderedDict
from threading import RLock
from enum import Enum

logger = logging.getLogger(__name__)

T = TypeVar("T")


class CacheEntryState(Enum):
    """Lifecycle states for cache entries (Concern #4)."""
    FRESH = "fresh"           # Just loaded, known good
    WARM = "warm"             # Accessed recently, still valid
    STALE = "stale"           # TTL expired but usable as fallback
    INVALIDATED = "invalidated"  # Explicitly invalidated, do not use


@dataclass
class CacheEntry(Generic[T]):
    """Cache entry with value, expiration, version, and lifecycle state."""
    value: T
    expires_at: float
    created_at: float = field(default_factory=time.time)
    version: str = ""           # Content hash for staleness detection (#5)
    state: CacheEntryState = CacheEntryState.FRESH  # Lifecycle state (#4)
    access_count: int = 0
    last_accessed: float = field(default_factory=time.time)
    
    def is_expired(self) -> bool:
        """Check if entry TTL has expired."""
        return time.time() > self.expires_at
    
    def is_usable(self) -> bool:
        """Check if entry can be used (not explicitly invalidated)."""
        return self.state != CacheEntryState.INVALIDATED
    
    def mark_accessed(self) -> None:
        """Update access tracking and transition state."""
        self.access_count += 1
        self.last_accessed = time.time()
        if self.state == CacheEntryState.FRESH:
            self.state = CacheEntryState.WARM
    
    def mark_stale(self) -> None:
        """Mark as stale (expired but usable as fallback)."""
        if self.state != CacheEntryState.INVALIDATED:
            self.state = CacheEntryState.STALE


def compute_content_hash(content: Any) -> str:
    """
    Compute deterministic hash of content for version tracking (#5).
    
    This ensures cache can detect when content has changed,
    even if the key is the same.
    """
    try:
        if isinstance(content, (dict, list)):
            content_str = json.dumps(content, sort_keys=True, default=str)
        elif hasattr(content, '__dict__'):
            content_str = json.dumps(vars(content), sort_keys=True, default=str)
        else:
            content_str = str(content)
        return hashlib.sha256(content_str.encode()).hexdigest()[:16]
    except Exception:
        return f"t{int(time.time())}"


class TTLCache(Generic[T]):
    """
    Thread-safe cache with TTL, LRU eviction, and version tracking.
    
    MEMORY BOUND (#3): max_size enforces hard limit with LRU eviction
    VERSION TRACKING (#5): Each entry has content hash for staleness detection
    LIFECYCLE STATES (#4): Entries track fresh/warm/stale/invalidated
    THREAD SAFE (#13): RLock protects all operations
    
    Usage:
        cache = TTLCache[str](max_size=100, ttl_seconds=300)
        
        # Set with auto-computed version
        cache.set("key1", value)
        
        # Check if stale vs known version
        if cache.is_stale("key1", current_version="abc123"):
            # Reload from DB
    """
    
    def __init__(
        self,
        max_size: int = 100,
        ttl_seconds: int = 300,
        stale_ttl_seconds: Optional[int] = None,
        name: str = "cache",
    ):
        """
        Initialize cache with memory bounds.
        
        Args:
            max_size: HARD LIMIT on entries (prevents unbounded growth #3)
            ttl_seconds: Time-to-live for fresh entries
            stale_ttl_seconds: Additional time stale entries remain usable (default: ttl_seconds)
            name: Name for logging
        """
        self._max_size = max_size
        self._ttl_seconds = ttl_seconds
        self._stale_ttl_seconds = stale_ttl_seconds or ttl_seconds
        self._name = name
        
        # OrderedDict for LRU eviction (#3)
        self._cache: OrderedDict[str, CacheEntry[T]] = OrderedDict()
        self._lock = RLock()  # Thread safety (#13)
        
        # Version tracking (#5)
        self._versions: Dict[str, str] = {}
        
        # Statistics
        self._hits = 0
        self._misses = 0
        self._stale_hits = 0
        self._evictions = 0
        self._invalidations = 0
    
    def get(self, key: str, allow_stale: bool = False) -> Optional[T]:
        """
        Get value from cache.
        
        Args:
            key: Cache key
            allow_stale: Return stale entries as fallback (#15 failure handling)
        """
        with self._lock:
            entry = self._cache.get(key)
            
            if entry is None:
                self._misses += 1
                return None
            
            # Check if invalidated (#4 lifecycle)
            if not entry.is_usable():
                del self._cache[key]
                self._versions.pop(key, None)
                self._misses += 1
                return None
            
            # Check TTL expiration
            if entry.is_expired():
                stale_deadline = entry.expires_at + self._stale_ttl_seconds
                if allow_stale and time.time() < stale_deadline:
                    # Return stale as fallback (#15)
                    entry.mark_stale()
                    entry.mark_accessed()
                    self._stale_hits += 1
                    self._cache.move_to_end(key)
                    logger.debug(f"Cache stale hit: {self._name}/{key}")
                    return entry.value
                else:
                    del self._cache[key]
                    self._versions.pop(key, None)
                    self._misses += 1
                    return None
            
            # Fresh hit
            entry.mark_accessed()
            self._cache.move_to_end(key)  # LRU update
            self._hits += 1
            return entry.value
    
    def set(
        self,
        key: str,
        value: T,
        ttl_seconds: Optional[int] = None,
        version: Optional[str] = None,
    ) -> None:
        """
        Set value with version tracking.
        
        Args:
            key: Cache key
            value: Value to cache
            ttl_seconds: Custom TTL
            version: Version string (auto-computed if not provided) (#5)
        """
        ttl = ttl_seconds if ttl_seconds is not None else self._ttl_seconds
        expires_at = time.time() + ttl
        
        # Auto-compute version from content (#5)
        if version is None:
            version = compute_content_hash(value)
        
        with self._lock:
            # Remove existing
            if key in self._cache:
                del self._cache[key]
            
            # LRU eviction at capacity (#3 memory bound)
            while len(self._cache) >= self._max_size:
                evicted_key, _ = self._cache.popitem(last=False)
                self._versions.pop(evicted_key, None)
                self._evictions += 1
                logger.debug(f"Cache LRU eviction: {self._name}/{evicted_key}")
            
            # Add new entry
            self._cache[key] = CacheEntry(
                value=value,
                expires_at=expires_at,
                version=version,
                state=CacheEntryState.FRESH,
            )
            self._versions[key] = version
    
    def invalidate(self, key: str) -> bool:
        """
        Explicitly invalidate a key (#1 invalidation strategy).
        
        Returns:
            True if key existed and was invalidated
        """
        with self._lock:
            if key in self._cache:
                del self._cache[key]
                self._versions.pop(key, None)
                self._invalidations += 1
                logger.info(f"Cache invalidated: {self._name}/{key}")
                return True
            return False
    
    def invalidate_all(self) -> int:
        """Invalidate all entries (#1)."""
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            self._versions.clear()
            self._invalidations += count
            logger.info(f"Cache invalidated all: {self._name} ({count} entries)")
            return count
    
    def invalidate_prefix(self, prefix: str) -> int:
        """Invalidate all keys with prefix (#1)."""
        with self._lock:
            keys = [k for k in self._cache.keys() if k.startswith(prefix)]
            for key in keys:
                del self._cache[key]
                self._versions.pop(key, None)
            self._invalidations += len(keys)
            if keys:
                logger.info(f"Cache invalidated prefix: {self._name}/{prefix} ({len(keys)} entries)")
            return len(keys)
    
    def is_stale(self, key: str, current_version: str) -> bool:
        """
        Check if cached entry is stale vs known version (#5, #12).
        
        This is key for detecting DB state divergence.
        """
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return True
            if entry.is_expired() or not entry.is_usable():
                return True
            return entry.version != current_version
    
    def get_version(self, key: str) -> Optional[str]:
        """Get cached version for a key (#5)."""
        with self._lock:
            return self._versions.get(key)
    
    def get_entry_state(self, key: str) -> Optional[CacheEntryState]:
        """Get lifecycle state of entry (#4)."""
        with self._lock:
            entry = self._cache.get(key)
            return entry.state if entry else None
    
    def cleanup_expired(self) -> int:
        """Remove all expired entries (call periodically)."""
        with self._lock:
            now = time.time()
            stale_deadline = now - self._stale_ttl_seconds
            expired = [
                k for k, v in self._cache.items()
                if v.expires_at < stale_deadline or not v.is_usable()
            ]
            for key in expired:
                del self._cache[key]
                self._versions.pop(key, None)
            return len(expired)
    
    def size(self) -> int:
        """Current entry count."""
        with self._lock:
            return len(self._cache)
    
    def memory_pressure(self) -> float:
        """Memory pressure ratio (0.0 to 1.0) (#3)."""
        with self._lock:
            return len(self._cache) / self._max_size if self._max_size > 0 else 0.0
    
    def get_stats(self) -> Dict[str, Any]:
        """Comprehensive statistics."""
        with self._lock:
            total = self._hits + self._misses + self._stale_hits
            hit_rate = (self._hits + self._stale_hits) / total if total > 0 else 0.0
            
            state_counts = {s.value: 0 for s in CacheEntryState}
            for entry in self._cache.values():
                state_counts[entry.state.value] += 1
            
            return {
                "name": self._name,
                "hits": self._hits,
                "stale_hits": self._stale_hits,
                "misses": self._misses,
                "evictions": self._evictions,
                "invalidations": self._invalidations,
                "size": len(self._cache),
                "max_size": self._max_size,
                "ttl_seconds": self._ttl_seconds,
                "hit_rate": round(hit_rate, 4),
                "memory_pressure": round(self.memory_pressure(), 4),
                "state_counts": state_counts,
            }


class AsyncTTLCache(TTLCache[T]):
    """
    Async-aware cache with thundering herd protection (#13).
    
    THUNDERING HERD: Only one concurrent load per key
    STALE-WHILE-REVALIDATE: Returns stale while refreshing
    GRACEFUL DEGRADATION: Falls back to stale on failure (#15)
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._async_lock = asyncio.Lock()  # Async concurrency (#13)
        self._pending_loads: Dict[str, asyncio.Task] = {}
    
    async def get_or_load(
        self,
        key: str,
        loader: Callable[[str], Awaitable[T]],
        ttl_seconds: Optional[int] = None,
        version_checker: Optional[Callable[[str], Awaitable[str]]] = None,
    ) -> T:
        """
        Get from cache or load, with concurrency protection.
        
        THUNDERING HERD (#13): Only one load per key at a time
        STALE FALLBACK (#15): Returns stale on load failure
        VERSION CHECK (#12): Optional background refresh if version changed
        """
        # Fast path
        value = self.get(key)
        if value is not None:
            # Optional background refresh
            if version_checker:
                asyncio.create_task(
                    self._background_refresh(key, loader, version_checker, ttl_seconds)
                )
            return value
        
        # Get stale as potential fallback
        stale_value = self.get(key, allow_stale=True)
        
        # Slow path with lock
        async with self._async_lock:
            # Double-check after lock
            value = self.get(key)
            if value is not None:
                return value
            
            # Check for pending load (thundering herd protection)
            if key in self._pending_loads:
                try:
                    return await self._pending_loads[key]
                except Exception:
                    pass  # Will try to load ourselves
            
            # Start load task
            load_task = asyncio.create_task(
                self._load_and_cache(key, loader, ttl_seconds)
            )
            self._pending_loads[key] = load_task
        
        # Wait outside lock
        try:
            return await load_task
        except Exception as e:
            # GRACEFUL DEGRADATION (#15): return stale on failure
            if stale_value is not None:
                logger.warning(f"Load failed for {self._name}/{key}, using stale: {e}")
                return stale_value
            raise
    
    async def _load_and_cache(
        self,
        key: str,
        loader: Callable[[str], Awaitable[T]],
        ttl_seconds: Optional[int],
    ) -> T:
        """Load and cache, cleaning up pending state."""
        try:
            value = await loader(key)
            self.set(key, value, ttl_seconds)
            logger.debug(f"Cache loaded: {self._name}/{key}")
            return value
        finally:
            self._pending_loads.pop(key, None)
    
    async def _background_refresh(
        self,
        key: str,
        loader: Callable[[str], Awaitable[T]],
        version_checker: Callable[[str], Awaitable[str]],
        ttl_seconds: Optional[int],
    ) -> None:
        """Background refresh if version changed (#12 DB divergence)."""
        try:
            current_version = await version_checker(key)
            if self.is_stale(key, current_version):
                logger.debug(f"Background refresh: {self._name}/{key}")
                value = await loader(key)
                self.set(key, value, ttl_seconds, version=current_version)
        except Exception as e:
            logger.debug(f"Background refresh failed: {self._name}/{key}: {e}")
