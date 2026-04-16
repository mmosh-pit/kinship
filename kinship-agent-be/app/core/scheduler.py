"""
Kinship Agent - Background Scheduler

Manages background jobs using APScheduler.
Currently handles:
- Chat history cleanup (daily)
"""

from datetime import datetime
from typing import Optional
from zoneinfo import ZoneInfo

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.events import EVENT_JOB_ERROR, EVENT_JOB_EXECUTED, EVENT_JOB_MISSED, JobExecutionEvent

from app.core.config import settings


# UTC timezone
UTC = ZoneInfo("UTC")


class BackgroundScheduler:
    """
    Background scheduler for periodic jobs.
    
    Uses APScheduler with AsyncIO support.
    """
    
    def __init__(self):
        self._scheduler: Optional[AsyncIOScheduler] = None
        self._started = False
    
    @property
    def is_running(self) -> bool:
        """Check if scheduler is running."""
        return self._started and self._scheduler is not None and self._scheduler.running
    
    def _job_listener(self, event: JobExecutionEvent):
        """Handle job execution events for logging."""
        job_id = event.job_id
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        
        if hasattr(event, 'exception') and event.exception:
            print(f"[{now}] [Scheduler] ❌ Job '{job_id}' FAILED: {event.exception}")
        else:
            print(f"[{now}] [Scheduler] ✅ Job '{job_id}' executed successfully")
    
    async def _run_cleanup_job(self):
        """Wrapper to run cleanup job asynchronously."""
        from app.services.cleanup import cleanup_service
        
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{now}] [Scheduler] 🚀 Running scheduled chat history cleanup...")
        
        try:
            result = await cleanup_service.run_history_cleanup()
            
            if result.get("skipped"):
                print(f"[{now}] [Scheduler] ⏭️  Cleanup skipped: {result.get('reason')}")
            elif result.get("success"):
                print(
                    f"[{now}] [Scheduler] ✅ Cleanup completed: "
                    f"{result.get('conversations_processed', 0)} conversations, "
                    f"{result.get('messages_removed', 0)} messages removed"
                )
            else:
                print(f"[{now}] [Scheduler] ❌ Cleanup failed: {result.get('error')}")
        except Exception as e:
            print(f"[{now}] [Scheduler] ❌ Cleanup exception: {e}")
            raise
    
    def start(self):
        """Start the background scheduler."""
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        
        if self._started:
            print(f"[{now}] [Scheduler] ⚠️  Already started")
            return
        
        if not settings.cleanup_enabled:
            print(f"[{now}] [Scheduler] ⚠️  Cleanup is disabled, scheduler not started")
            return
        
        print(f"[{now}] [Scheduler] 🔧 Creating AsyncIOScheduler...")
        
        # Create scheduler
        self._scheduler = AsyncIOScheduler(
            timezone="UTC",
            job_defaults={
                "coalesce": True,  # Combine missed runs into one
                "max_instances": 1,  # Only one instance at a time
                "misfire_grace_time": 3600,  # 1 hour grace time
            }
        )
        
        # Add job listener for logging
        self._scheduler.add_listener(
            self._job_listener,
            EVENT_JOB_EXECUTED | EVENT_JOB_ERROR | EVENT_JOB_MISSED
        )
        
        print(f"[{now}] [Scheduler] 📅 Registering cleanup job for {settings.cleanup_schedule_hour:02d}:{settings.cleanup_schedule_minute:02d} UTC")
        
        # Register cleanup job
        self._scheduler.add_job(
            self._run_cleanup_job,
            trigger=CronTrigger(
                hour=settings.cleanup_schedule_hour,
                minute=settings.cleanup_schedule_minute,
                timezone=UTC,  # Explicitly use UTC
            ),
            id="chat_history_cleanup",
            name="Chat History Cleanup",
            replace_existing=True,
        )
        
        # Start scheduler
        self._scheduler.start()
        self._started = True
        
        # Print job info
        jobs = self._scheduler.get_jobs()
        for job in jobs:
            next_run = job.next_run_time
            print(f"[{now}] [Scheduler] ✅ Job '{job.id}' registered, next run: {next_run}")
        
        print(f"[{now}] [Scheduler] ✅ Scheduler started successfully")
    
    def shutdown(self, wait: bool = True):
        """
        Shutdown the scheduler.
        
        Args:
            wait: Whether to wait for running jobs to complete
        """
        if not self._started or self._scheduler is None:
            return
        
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        print(f"[{now}] [Scheduler] 👋 Shutting down...")
        self._scheduler.shutdown(wait=wait)
        self._started = False
        print(f"[{now}] [Scheduler] ✅ Shutdown complete")
    
    def get_jobs_info(self) -> list:
        """Get information about scheduled jobs."""
        if not self._scheduler:
            return []
        
        jobs = []
        for job in self._scheduler.get_jobs():
            next_run = job.next_run_time
            jobs.append({
                "id": job.id,
                "name": job.name,
                "next_run": next_run.isoformat() if next_run else None,
                "trigger": str(job.trigger),
            })
        
        return jobs
    
    async def run_job_now(self, job_id: str) -> bool:
        """
        Manually trigger a job to run immediately.
        
        Args:
            job_id: ID of the job to run
            
        Returns:
            True if job was found and triggered
        """
        now = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        
        if not self._scheduler:
            print(f"[{now}] [Scheduler] ❌ Scheduler not initialized")
            return False
        
        job = self._scheduler.get_job(job_id)
        if not job:
            print(f"[{now}] [Scheduler] ❌ Job '{job_id}' not found")
            return False
        
        print(f"[{now}] [Scheduler] 🔄 Manually triggering job '{job_id}'...")
        
        # Run the job function directly
        if job_id == "chat_history_cleanup":
            await self._run_cleanup_job()
            return True
        
        return False


# Singleton instance
scheduler = BackgroundScheduler()