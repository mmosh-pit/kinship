"""Runtime REST API — dialogue, scene generation, manifest serving."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import HTMLResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.runtime import DialogueRequest, DialogueResponse
from app.schemas.manifest import SceneGenerateRequest, SceneManifest

router = APIRouter(tags=["Runtime"])


# ── Dialogue (Graph 4 trigger) ──

@router.post("/api/runtime/dialogue", response_model=DialogueResponse)
async def dialogue(body: DialogueRequest, db: AsyncSession = Depends(get_db)):
    """
    Main runtime endpoint. Player sends a message → Graph 4 orchestrates:
    prompt assembly, Claude call, HEARTS scoring, route resolution.
    """
    from app.graphs.npc_dialogue import run_dialogue

    result = await run_dialogue(
        player_id=str(body.player_id),
        scene_id=body.scene_id,
        npc_id=str(body.npc_id),
        player_input=body.input,
        db=db,
    )
    return result


# ── Scene Generation (Graph 1 trigger) ──

@router.post("/api/scenes/generate")
async def generate_scene(body: SceneGenerateRequest, db: AsyncSession = Depends(get_db)):
    """
    Studio trigger: AI generates a scene manifest from a prompt.
    Creates scene in kinship-assets, places assets, returns manifest.
    """
    from app.graphs.scene_generation import run_scene_generation

    result = await run_scene_generation(
        prompt=body.prompt,
        scene_type=body.scene_type,
        scene_name=body.scene_name,
        dimensions=body.dimensions,
        target_facets=body.target_facets,
        lighting=body.lighting,
        weather=body.weather,
    )
    return result


# ── Scene Manifest (for Flutter/mobile) ──

@router.get("/api/runtime/scenes/{scene_id}/manifest", response_model=SceneManifest)
async def get_scene_manifest(scene_id: str, db: AsyncSession = Depends(get_db)):
    """
    Flutter mobile calls this on scene entry.
    Fetches scene + assets from kinship-assets, builds manifest JSON.
    """
    from app.services.assets_client import get_scene_manifest as fetch_manifest
    from app.services.manifest_builder import build_manifest

    raw = await fetch_manifest(scene_id)
    if not raw:
        raise HTTPException(404, "Scene not found in kinship-assets")

    manifest = await build_manifest(raw, scene_id, db)
    return manifest


# ── Player State ──

@router.get("/api/runtime/player/{player_id}")
async def get_runtime_player(player_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get player's full runtime state including HEARTS, location, progress."""
    from app.db.models import PlayerProfile
    player = await db.get(PlayerProfile, player_id)
    if not player:
        raise HTTPException(404, "Player not found")
    return {
        "id": str(player.id),
        "display_name": player.display_name,
        "hearts_scores": player.hearts_scores,
        "current_scene": player.current_scene,
        "completed_quests": player.completed_quests,
        "completed_challenges": player.completed_challenges,
        "met_npcs": player.met_npcs,
        "inventory": player.inventory,
    }


# ── Published Scene Player (Flutter Web — standalone HTML) ──

@router.get("/play/{scene_id}", response_class=HTMLResponse)
async def play_scene(scene_id: str):
    """
    Dynamic route: serves Flutter Web build pre-configured for this scene.
    The HTML loads the pre-built Flutter Web app and passes scene_id to it.
    """
    return f"""<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kinship - Play</title>
    <style>body {{ margin: 0; overflow: hidden; background: #0a0a0a; }}</style>
</head>
<body>
    <script>
        // Pass scene_id to Flutter Web app on load
        window.KINSHIP_SCENE_ID = "{scene_id}";
        window.KINSHIP_API_URL = window.location.origin;
    </script>
    <script src="/flutter_web/flutter.js" defer></script>
    <script>
        window.addEventListener('load', function() {{
            _flutter.loader.loadEntrypoint({{
                serviceWorker: {{ serviceWorkerVersion: null }},
                onEntrypointLoaded: async function(engineInitializer) {{
                    let appRunner = await engineInitializer.initializeEngine();
                    await appRunner.runApp();
                }}
            }});
        }});
    </script>
</body>
</html>"""
