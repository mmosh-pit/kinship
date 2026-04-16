"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    KINSHIP KNOWLEDGE API                                      ║
║                                                                               ║
║  REST API with REAL Claude AI integration                                    ║
║  Generates complete manifests from natural language descriptions             ║
║                                                                               ║
║  v2 ENDPOINTS (Pipeline-based):                                              ║
║  POST /api/v2/generate          - Generate with multi-agent pipeline         ║
║  POST /api/v2/validate          - Validate with full pipeline                ║
║  GET  /api/v2/mechanics         - List available mechanics                   ║
║  GET  /api/v2/templates         - List challenge templates                   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import os
import json
import logging
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from app.db.manifest_generator import GameManifest, generate_example_manifest
from app.services.ai_client import KinshipAI, KinshipAISync

# Import new pipeline routes
from app.api.pipeline_routes import router as pipeline_router

# ═══════════════════════════════════════════════════════════════════════════════
#  SETUP
# ═══════════════════════════════════════════════════════════════════════════════

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="Kinship Knowledge API",
    description="AI-powered game manifest generation with Claude",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include v2 pipeline routes
app.include_router(pipeline_router)

# Initialize AI client (will use ANTHROPIC_API_KEY env var)
ai_client: Optional[KinshipAI] = None


def get_ai_client() -> KinshipAI:
    global ai_client
    if ai_client is None:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if not api_key:
            raise HTTPException(
                status_code=500,
                detail="ANTHROPIC_API_KEY not configured. Set environment variable.",
            )
        ai_client = KinshipAI(api_key=api_key)
    return ai_client


# ═══════════════════════════════════════════════════════════════════════════════
#  REQUEST MODELS
# ═══════════════════════════════════════════════════════════════════════════════


class GenerateGameRequest(BaseModel):
    description: str
    theme: str = "forest"
    available_assets: Optional[List[Dict[str, Any]]] = None


class GenerateNPCRequest(BaseModel):
    npc_description: str
    game_context: str
    theme: str = "forest"


class GenerateChallengeRequest(BaseModel):
    challenge_type: str  # quiz, sorting, matching, memory
    topic: str
    difficulty: str = "easy"


class GenerateDialogueRequest(BaseModel):
    context: str
    speaker: str
    emotion: str = "neutral"
    num_nodes: int = 5


class GenerateQuestRequest(BaseModel):
    quest_description: str
    available_npcs: List[str] = []
    available_items: List[str] = []


# ═══════════════════════════════════════════════════════════════════════════════
#  ROUTES
# ═══════════════════════════════════════════════════════════════════════════════


@app.get("/")
async def root():
    return {
        "service": "Kinship Knowledge API",
        "version": "2.0.0",
        "ai_enabled": os.getenv("ANTHROPIC_API_KEY") is not None,
    }


@app.get("/health")
async def health():
    return {
        "status": "healthy",
        "ai_configured": os.getenv("ANTHROPIC_API_KEY") is not None,
    }


# ─────────────────────────────────────────────────────────────────────────────
#  GENERATE COMPLETE GAME (Real AI)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/generate/game")
async def generate_game(request: GenerateGameRequest):
    """Generate a complete game manifest using Claude AI."""

    logger.info(f"Generating game: {request.description[:50]}...")

    try:
        client = get_ai_client()
        manifest = await client.generate_game(
            description=request.description,
            theme=request.theme,
            available_assets=request.available_assets,
        )

        logger.info(f"Generated game: {manifest.get('name', 'Unknown')}")
        return {"success": True, "manifest": manifest}

    except json.JSONDecodeError as e:
        logger.error(f"JSON parse error: {e}")
        raise HTTPException(status_code=500, detail=f"AI response parsing failed: {e}")
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  GENERATE NPC (Real AI)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/generate/npc")
async def generate_npc(request: GenerateNPCRequest):
    """Generate a context-aware NPC using Claude AI."""

    logger.info(f"Generating NPC: {request.npc_description[:50]}...")

    try:
        client = get_ai_client()
        npc = await client.generate_npc(
            npc_description=request.npc_description,
            game_context=request.game_context,
            theme=request.theme,
        )

        logger.info(f"Generated NPC: {npc.get('name', 'Unknown')}")
        return {"success": True, "npc": npc}

    except Exception as e:
        logger.error(f"NPC generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  GENERATE CHALLENGE (Real AI)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/generate/challenge")
async def generate_challenge(request: GenerateChallengeRequest):
    """Generate a mini-game challenge using Claude AI."""

    valid_types = ["quiz", "sorting", "matching", "memory", "sequence", "puzzle"]
    if request.challenge_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid challenge type. Must be one of: {valid_types}",
        )

    logger.info(f"Generating {request.challenge_type} challenge: {request.topic}")

    try:
        client = get_ai_client()
        challenge = await client.generate_challenge(
            challenge_type=request.challenge_type,
            topic=request.topic,
            difficulty=request.difficulty,
        )

        logger.info(f"Generated challenge: {challenge.get('name', 'Unknown')}")
        return {"success": True, "challenge": challenge}

    except Exception as e:
        logger.error(f"Challenge generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  GENERATE DIALOGUE (Real AI)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/generate/dialogue")
async def generate_dialogue(request: GenerateDialogueRequest):
    """Generate branching dialogue using Claude AI."""

    logger.info(f"Generating dialogue for {request.speaker}")

    try:
        client = get_ai_client()
        dialogue = await client.generate_dialogue(
            context=request.context,
            speaker=request.speaker,
            emotion=request.emotion,
            num_nodes=request.num_nodes,
        )

        logger.info(f"Generated dialogue: {dialogue.get('id', 'Unknown')}")
        return {"success": True, "dialogue": dialogue}

    except Exception as e:
        logger.error(f"Dialogue generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  GENERATE QUEST (Real AI)
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/generate/quest")
async def generate_quest(request: GenerateQuestRequest):
    """Generate a quest using Claude AI."""

    logger.info(f"Generating quest: {request.quest_description[:50]}...")

    try:
        client = get_ai_client()
        quest = await client.generate_quest(
            quest_description=request.quest_description,
            available_npcs=request.available_npcs,
            available_items=request.available_items,
        )

        logger.info(f"Generated quest: {quest.get('name', 'Unknown')}")
        return {"success": True, "quest": quest}

    except Exception as e:
        logger.error(f"Quest generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ─────────────────────────────────────────────────────────────────────────────
#  EXAMPLE MANIFEST (No AI required)
# ─────────────────────────────────────────────────────────────────────────────


@app.get("/api/example/manifest")
async def get_example_manifest():
    """Get a complete example manifest (no AI required)."""
    manifest = generate_example_manifest()
    return manifest.to_dict()


# ─────────────────────────────────────────────────────────────────────────────
#  VALIDATE MANIFEST
# ─────────────────────────────────────────────────────────────────────────────


@app.post("/api/validate/manifest")
async def validate_manifest(manifest: Dict[str, Any] = Body(...)):
    """Validate a game manifest structure."""

    errors = []
    warnings = []

    # Check required fields
    required = ["id", "name", "start_scene", "scenes"]
    for field in required:
        if field not in manifest:
            errors.append(f"Missing required field: {field}")

    # Check scenes
    scenes = manifest.get("scenes", [])
    if not scenes:
        errors.append("At least one scene is required")

    scene_ids = {s.get("id") for s in scenes}

    # Check start_scene exists
    if manifest.get("start_scene") and manifest["start_scene"] not in scene_ids:
        errors.append(f"start_scene '{manifest['start_scene']}' not found in scenes")

    # Check NPC references
    npc_ids = {n.get("id") for n in manifest.get("npcs", [])}
    for scene in scenes:
        for scene_npc in scene.get("npcs", []):
            if scene_npc.get("npc_id") not in npc_ids:
                warnings.append(
                    f"Scene '{scene.get('id')}' references unknown NPC '{scene_npc.get('npc_id')}'"
                )

    # Check dialogue references
    dialogue_ids = {d.get("id") for d in manifest.get("dialogues", [])}
    for npc in manifest.get("npcs", []):
        default_dialogue = npc.get("default_state", {}).get("dialogue_id")
        if default_dialogue and default_dialogue not in dialogue_ids:
            warnings.append(
                f"NPC '{npc.get('id')}' references unknown dialogue '{default_dialogue}'"
            )

    # Check quest item references
    item_ids = {i.get("id") for i in manifest.get("items", [])}
    for quest in manifest.get("quests", []):
        for item_id in quest.get("reward_items", []):
            if item_id not in item_ids:
                warnings.append(
                    f"Quest '{quest.get('id')}' rewards unknown item '{item_id}'"
                )

    # Check route references
    for route in manifest.get("routes", []):
        if route.get("from_scene") not in scene_ids:
            warnings.append(
                f"Route references unknown scene '{route.get('from_scene')}'"
            )
        if route.get("to_scene") not in scene_ids:
            warnings.append(f"Route references unknown scene '{route.get('to_scene')}'")

    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
        "stats": {
            "scenes": len(scenes),
            "npcs": len(manifest.get("npcs", [])),
            "dialogues": len(manifest.get("dialogues", [])),
            "quests": len(manifest.get("quests", [])),
            "challenges": len(manifest.get("challenges", [])),
            "items": len(manifest.get("items", [])),
            "routes": len(manifest.get("routes", [])),
            "rules": len(manifest.get("rules", [])),
        },
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", 8000))

    print("=" * 60)
    print("KINSHIP KNOWLEDGE API")
    print("=" * 60)
    print(f"Port: {port}")
    print(f"AI Enabled: {os.getenv('ANTHROPIC_API_KEY') is not None}")
    print()
    print("Endpoints:")
    print("  POST /api/generate/game      - Generate complete game")
    print("  POST /api/generate/npc       - Generate NPC")
    print("  POST /api/generate/dialogue  - Generate dialogue")
    print("  POST /api/generate/challenge - Generate challenge")
    print("  POST /api/generate/quest     - Generate quest")
    print("  GET  /api/example/manifest   - Get example (no AI)")
    print("  POST /api/validate/manifest  - Validate manifest")
    print("=" * 60)

    uvicorn.run(app, host="0.0.0.0", port=port)
