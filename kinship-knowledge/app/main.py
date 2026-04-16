"""Kinship Backend — FastAPI application entry point."""

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.config import get_settings

settings = get_settings()


api_key = os.environ.get("ANTHROPIC_API_KEY")
print(f"API Key set: {bool(api_key)}")
print(f"API Key prefix: {api_key[:20] if api_key else 'NOT SET'}...")


# ── LangSmith Tracing (set before any LangChain imports) ──
os.environ["LANGSMITH_API_KEY"] = settings.langsmith_api_key
os.environ["LANGSMITH_PROJECT"] = settings.langsmith_project
os.environ["LANGSMITH_TRACING"] = "true" if settings.langsmith_tracing else "false"
os.environ["LANGSMITH_ENDPOINT"] = settings.langsmith_endpoint

logging.basicConfig(
    level=logging.DEBUG if settings.app_env == "development" else logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup and shutdown events."""
    logger.info("🚀 Kinship Backend starting...")
    logger.info(f"   Environment: {settings.app_env}")
    logger.info(f"   LangSmith tracing: {settings.langsmith_tracing}")
    logger.info(f"   LangSmith project: {settings.langsmith_project}")

    # Initialize database tables (dev mode — use Alembic in production)
    if settings.app_env == "development":
        from app.db.database import init_db

        await init_db()
        from app.db.models_analytics import (
            PlayerSession,
            PlayerEvent,
            PlayerGameProgress,
        )

        logger.info("   ✅ Database tables created")

        # Seed HEARTS facets if empty
        from app.db.seed import seed_hearts_facets

        await seed_hearts_facets()
        logger.info("   ✅ HEARTS facets seeded")

    yield

    # Shutdown
    from app.services.assets_client import close_client

    await close_client()
    logger.info("👋 Kinship Backend shutting down")


app = FastAPI(
    title="Kinship Backend",
    description="AI-powered backend for the Kinship Intelligence platform — LangGraph + FastAPI",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──
app.add_middleware(
    CORSMiddleware,
    # allow_origins=settings.cors_origins_list,
    allow_origins="*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Mount Flutter Web build for /play/{scene_id} ──
flutter_path = settings.flutter_web_build_path
if os.path.exists(flutter_path):
    app.mount("/flutter_web", StaticFiles(directory=flutter_path), name="flutter_web")

# ── Register REST API Routers ──
# from app.api.npcs import router as npcs_router
from app.api.challenges import router as challenges_router
from app.api.quests import router as quests_router
from app.api.routes import router as routes_router
from app.api.knowledge import router as knowledge_router
from app.api.prompts import router as prompts_router
from app.api.hearts import router as hearts_router
from app.api.players import router as players_router
from app.api.runtime import router as runtime_router
from app.api.scene_gen import router as scene_router
from app.api.scene_converse import router as scene_converse_router
from app.api.asset_knowledge import router as asset_knowledge_router
from app.api.webhooks import router as webhooks_router
from app.api.asset_embed import router as asset_embed_router
from app.api.sprite_analysis import router as sprite_analysis_router
from app.api.game_plan import router as game_plan_router
from app.api.actors import actors_router, npcs_router
from app.api.analytics import router as analytics_router
from app.api.score_routes import router as score_router
from app.api.game_generation_api import router as game_router
from app.api.pipeline_routes import router as pipeline_routes

app.include_router(npcs_router)
app.include_router(challenges_router)
app.include_router(quests_router)
app.include_router(routes_router)
app.include_router(knowledge_router)
app.include_router(prompts_router)
app.include_router(hearts_router)
app.include_router(players_router)
app.include_router(runtime_router)
app.include_router(scene_router)
app.include_router(scene_converse_router)
app.include_router(asset_knowledge_router)
app.include_router(webhooks_router)
app.include_router(asset_embed_router)
app.include_router(sprite_analysis_router)
app.include_router(game_plan_router)
app.include_router(actors_router)
app.include_router(analytics_router)
app.include_router(score_router)
app.include_router(game_router)
app.include_router(pipeline_routes)

# ── Register WebSocket Router ──
from app.realtime.handlers import router as ws_router

app.include_router(ws_router)


# ── Health Check ──
@app.get("/health")
async def health():
    from app.realtime.manager import manager

    return {
        "status": "ok",
        "service": "kinship-backend",
        "version": "0.1.0",
        "websocket": manager.stats,
    }


# ── API Stats ──
@app.get("/api/stats")
async def stats():
    """Dashboard stats for Studio sidebar badges."""
    from sqlalchemy import select, func
    from app.db.database import async_session
    from app.db.models import (
        NPC,
        Challenge,
        Quest,
        Route,
        KnowledgeDoc,
        Prompt,
        PlayerProfile,
    )

    from app.db.models_analytics import (
        PlayerSession,
        PlayerEvent,
        PlayerGameProgress,
    )

    async with async_session() as db:
        counts = {}
        for name, model in [
            ("npcs", NPC),
            ("challenges", Challenge),
            ("quests", Quest),
            ("routes", Route),
            ("knowledge", KnowledgeDoc),
            ("prompts", Prompt),
            ("players", PlayerProfile),
            # PHASE 0: Add these
            ("sessions", PlayerSession),
            ("events", PlayerEvent),
            ("game_progress", PlayerGameProgress),
        ]:
            result = await db.execute(select(func.count()).select_from(model))
            counts[name] = result.scalar() or 0

    return counts
