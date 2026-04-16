"""
Kinship Agent - Cleanup Service

Service for orchestrating cleanup jobs, including chat history pruning.
Designed to be called by the background scheduler.
"""

import time
from datetime import datetime
from typing import Dict, Any, Optional
from dataclasses import dataclass

from app.db.database import async_session_factory
from app.services.conversation import conversation_service
from app.core.config import settings


@dataclass
class CleanupStats:
    """Statistics from the last cleanup run."""
    last_run_at: Optional[datetime] = None
    last_run_duration_ms: int = 0
    conversations_processed: int = 0
    messages_removed: int = 0
    success: bool = False
    error: Optional[str] = None


class CleanupService:
    """
    Service for managing cleanup operations.
    
    Tracks cleanup statistics and provides methods for:
    - Running chat history cleanup
    - Getting cleanup status/stats
    """
    
    def __init__(self):
        self._stats = CleanupStats()
    
    @property
    def stats(self) -> CleanupStats:
        """Get current cleanup statistics."""
        return self._stats
    
    async def run_history_cleanup(self) -> Dict[str, Any]:
        """
        Run chat history cleanup based on CHAT_HISTORY_MAX_AGE_DAYS config.
        
        Returns:
            Dict with cleanup results
        """
        start_time = time.time()
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        
        # Check if cleanup is configured
        max_age_days = settings.chat_history_max_age_days
        
        print(f"[{now}] [CleanupService] 🔍 Checking config: CHAT_HISTORY_MAX_AGE_DAYS = {max_age_days}")
        
        if max_age_days is None:
            print(f"[{now}] [CleanupService] ⏭️  Cleanup skipped: CHAT_HISTORY_MAX_AGE_DAYS not configured")
            return {
                "skipped": True,
                "reason": "CHAT_HISTORY_MAX_AGE_DAYS not configured",
            }
        
        print(f"[{now}] [CleanupService] 🚀 Starting chat history cleanup (max_age={max_age_days} days)")
        
        try:
            # Create database session
            print(f"[{now}] [CleanupService] 📦 Creating database session...")
            async with async_session_factory() as db:
                # Get total count for logging
                total_conversations = await conversation_service.get_conversation_count(db)
                print(f"[{now}] [CleanupService] 📊 Total conversations to scan: {total_conversations}")
                
                # Run cleanup
                batch_size = settings.cleanup_batch_size
                print(f"[{now}] [CleanupService] 🔄 Running prune_all_conversations (batch_size={batch_size})...")
                
                result = await conversation_service.prune_all_conversations(
                    db=db,
                    max_age_days=max_age_days,
                    batch_size=batch_size,
                )
                
                duration_ms = int((time.time() - start_time) * 1000)
                
                # Update stats
                self._stats = CleanupStats(
                    last_run_at=datetime.utcnow(),
                    last_run_duration_ms=duration_ms,
                    conversations_processed=result["conversations_processed"],
                    messages_removed=result["messages_removed"],
                    success=True,
                    error=None,
                )
                
                print(
                    f"[{now}] [CleanupService] ✅ Cleanup complete: "
                    f"{result['conversations_processed']} conversations processed, "
                    f"{result['messages_removed']} messages removed in {duration_ms}ms"
                )
                
                return {
                    "success": True,
                    "conversations_processed": result["conversations_processed"],
                    "messages_removed": result["messages_removed"],
                    "duration_ms": duration_ms,
                }
                
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            error_msg = str(e)
            
            # Update stats with error
            self._stats = CleanupStats(
                last_run_at=datetime.utcnow(),
                last_run_duration_ms=duration_ms,
                conversations_processed=0,
                messages_removed=0,
                success=False,
                error=error_msg,
            )
            
            print(f"[{now}] [CleanupService] ❌ Cleanup failed: {error_msg}")
            import traceback
            traceback.print_exc()
            
            return {
                "success": False,
                "error": error_msg,
                "duration_ms": duration_ms,
            }
    
    def get_status(self) -> Dict[str, Any]:
        """
        Get current cleanup service status.
        
        Returns:
            Dict with status information
        """
        return {
            "configured": settings.chat_history_max_age_days is not None,
            "max_age_days": settings.chat_history_max_age_days,
            "cleanup_enabled": settings.cleanup_enabled,
            "cleanup_schedule_hour": settings.cleanup_schedule_hour,
            "last_run": {
                "at": self._stats.last_run_at.isoformat() if self._stats.last_run_at else None,
                "duration_ms": self._stats.last_run_duration_ms,
                "conversations_processed": self._stats.conversations_processed,
                "messages_removed": self._stats.messages_removed,
                "success": self._stats.success,
                "error": self._stats.error,
            } if self._stats.last_run_at else None,
        }


# Singleton instance
cleanup_service = CleanupService()