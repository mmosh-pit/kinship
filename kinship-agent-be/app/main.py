"""
Kinship Agent - Main FastAPI Application

Entry point for the Kinship Agent Backend.
Provides REST API and streaming endpoints for agent interactions.
"""

# CRITICAL: Load environment variables FIRST, before any other imports
# This ensures LangSmith tracing is configured before @traceable decorators are evaluated
import os
from dotenv import load_dotenv

load_dotenv()  # Load .env file into environment variables

# Now import everything else
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.core.scheduler import scheduler
from app.db.database import init_db, close_db

# Import routers
from app.api.agents import router as agents_router
from app.api.chatmessages import router as chatmessages_router
from app.api.conversations import router as conversations_router
from app.api.knowledge import router as knowledge_router
from app.api.prompts import router as prompts_router
from app.api.tools import router as tools_router
from app.api.oauth import router as oauth_router
from app.api.voice import router as voice_router
from app.api.context import router as context_router
from app.api.roles import router as roles_router
from app.api.codes import router as codes_router


# ─────────────────────────────────────────────────────────────────────────────
# Application Lifecycle
# ─────────────────────────────────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Application lifecycle management.
    Handles startup and shutdown events.
    """
    # Startup
    print(f"🚀 Starting {settings.app_name}...")
    print(f"   Environment: {settings.app_env}")
    print(f"   LLM Provider: {settings.llm_provider}")

    # Initialize database
    await init_db()
    print("   ✅ Database initialized")

    # Start background scheduler
    if settings.cleanup_enabled:
        scheduler.start()
        if settings.chat_history_max_age_days:
            print(f"   ✅ Cleanup scheduler started (max_age={settings.chat_history_max_age_days} days, runs at {settings.cleanup_schedule_hour:02d}:{settings.cleanup_schedule_minute:02d} UTC)")
        else:
            print(f"   ⚠️  Cleanup scheduler started but CHAT_HISTORY_MAX_AGE_DAYS not set")
    else:
        print("   ⚠️  Cleanup scheduler is disabled")

    # Check LangSmith tracing status
    langsmith_tracing = os.environ.get("LANGSMITH_TRACING", "").lower() == "true" or \
                        os.environ.get("LANGCHAIN_TRACING_V2", "").lower() == "true"
    if langsmith_tracing:
        project = os.environ.get("LANGSMITH_PROJECT") or os.environ.get("LANGCHAIN_PROJECT", "default")
        print(f"   ✅ LangSmith tracing enabled (project: {project})")
    else:
        print("   ⚠️  LangSmith tracing is DISABLED")

    print(f"   🎯 Server ready at http://{settings.host}:{settings.port}")

    yield

    # Shutdown
    print("👋 Shutting down...")
    
    # Stop scheduler
    if scheduler.is_running:
        scheduler.shutdown(wait=False)
        print("   ✅ Scheduler stopped")
    
    await close_db()
    print("   ✅ Database connections closed")


# ─────────────────────────────────────────────────────────────────────────────
# Create Application
# ─────────────────────────────────────────────────────────────────────────────


app = FastAPI(
    title=settings.app_name,
    description="""
    Kinship Agent Backend API
    
    A LangGraph-powered agent orchestration system with:
    - Supervisor (Presence) agents that coordinate workers
    - Worker agents that execute specific tasks
    - Streaming chat support
    - Knowledge base integration
    - Tool execution with approval workflows
    """,
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
)


# ─────────────────────────────────────────────────────────────────────────────
# Middleware
# ─────────────────────────────────────────────────────────────────────────────


# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─────────────────────────────────────────────────────────────────────────────
# Exception Handlers
# ─────────────────────────────────────────────────────────────────────────────


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Global exception handler for unhandled errors.
    """
    print(f"❌ Unhandled error: {exc}")

    if settings.debug:
        return JSONResponse(
            status_code=500,
            content={
                "error": "Internal server error",
                "detail": str(exc),
                "type": type(exc).__name__,
            },
        )

    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
    )


# ─────────────────────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────────────────────


# Include API routers
app.include_router(agents_router)
app.include_router(chatmessages_router)
app.include_router(conversations_router)
app.include_router(knowledge_router)
app.include_router(prompts_router)
app.include_router(tools_router)
app.include_router(oauth_router)
app.include_router(voice_router)
app.include_router(context_router)
app.include_router(roles_router)
app.include_router(codes_router)


# Health check
@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "environment": settings.app_env,
        "scheduler": {
            "enabled": settings.cleanup_enabled,
            "running": scheduler.is_running,
            "jobs": scheduler.get_jobs_info() if scheduler.is_running else [],
        },
    }


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": settings.app_name,
        "version": "0.1.0",
        "docs": "/docs" if settings.debug else None,
        "endpoints": {
            "agents": "/api/agents",
            "chatmessages": "/api/chatmessages",
            "conversations": "/api/conversations",
            "knowledge": "/api/knowledge",
            "prompts": "/api/prompts",
            "context": "/api/v1/context",
            "nested_context": "/api/v1/nested-context",
            "roles": "/api/v1/roles",
            "codes": "/api/v1/codes",
        },
    }


# ─────────────────────────────────────────────────────────────────────────────
# CLI Entry Point
# ─────────────────────────────────────────────────────────────────────────────


def main():
    """Run the application using uvicorn."""
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="debug" if settings.debug else "info",
    )


if __name__ == "__main__":
    main()