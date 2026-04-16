"""API endpoint for conversational scene creation — Phase 0 Update.

PHASE 0 CHANGES:
- Added platform_id to ConverseRequest
- Passes platform_id to run_scene_conversation
- AI now only sees assets from the specified platform

Add to app/main.py:
    from app.api.scene_converse import router as scene_converse_router
    app.include_router(scene_converse_router)
"""

import logging
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scene Conversation"])


# ── Request/Response Models ──────────────────────────────


class ConversationMessage(BaseModel):
    role: str = Field(..., description="user or assistant")
    content: str


class CurrentScenePayload(BaseModel):
    """Lenient schema — AI returns complete scene each turn."""

    model_config = {"extra": "allow"}

    scene: Optional[dict] = None
    asset_placements: list[dict] = []
    npcs: list[dict] = []
    challenges: list[dict] = []
    quests: list[dict] = []
    routes: list[dict] = []


class ConverseRequest(BaseModel):
    messages: list[ConversationMessage]
    current_scene: CurrentScenePayload = CurrentScenePayload()
    game_context: Optional[dict] = (
        None  # Existing game data: scenes, npcs, challenges, quests, routes
    )
    # PHASE 0: Added platform_id for asset filtering
    platform_id: Optional[str] = Field(
        None,
        description="Platform ID to filter assets. AI only sees assets from this platform.",
    )


class ConverseResponse(BaseModel):
    message: str = Field(..., description="AI response text for the chat")
    scene: Optional[dict] = Field(
        None, description="COMPLETE scene: all assets, npcs, challenges, quests, routes"
    )
    phase: str = Field(
        "exploring",
        description="Current conversation phase: exploring | designing | refining | ready",
    )
    suggestions: list[str] = Field(
        default_factory=list,
        description="Quick-reply suggestions for the creator",
    )
    # PHASE 0: Include asset capability info if platform_id provided
    asset_capabilities: Optional[dict] = Field(
        None, description="Available asset types and capabilities for this platform"
    )


# ── Endpoint ─────────────────────────────────────────────


@router.post("/api/scenes/converse", response_model=ConverseResponse)
async def converse_scene(body: ConverseRequest, db: AsyncSession = Depends(get_db)):
    """
    Conversational scene creation endpoint.

    Send a prompt + current scene state -> AI returns COMPLETE scene.
    Client simply REPLACES its scene with the returned `scene` each turn.
    No merging needed.

    PHASE 0: Now accepts platform_id to filter assets.
    If platform_id is provided, AI only sees assets from that platform.
    """
    from app.graphs.scene_conversation import run_scene_conversation

    result = await run_scene_conversation(
        messages=[{"role": m.role, "content": m.content} for m in body.messages],
        current_scene=body.current_scene.model_dump(),
        game_context=body.game_context,
        platform_id=body.platform_id,  # PHASE 0: Pass platform_id
    )

    response = ConverseResponse(
        message=result.get("message", ""),
        scene=result.get("scene"),
        phase=result.get("phase", "exploring"),
        suggestions=result.get("suggestions", []),
    )

    # PHASE 0: Include asset capabilities if available
    if result.get("asset_capabilities"):
        response.asset_capabilities = result["asset_capabilities"]

    return response


@router.get("/api/scenes/platform-capabilities/{platform_id}")
async def get_platform_capabilities(platform_id: str):
    """
    Get asset capabilities for a platform.

    Returns what types of assets are available, which informs
    what kinds of games can be built.

    PHASE 0: New endpoint.
    """
    from app.services.asset_embeddings import get_platform_asset_capabilities

    capabilities = await get_platform_asset_capabilities(platform_id)
    return capabilities
