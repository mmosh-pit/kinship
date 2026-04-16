"""
Game Generation API

Thin API layer that connects to the existing GamePipeline.

Endpoints:
  POST /api/games/plan/converse  — Generate game from prompt (saves to DB + GCS)
  POST /api/games/generate       — Generate game with explicit config
  POST /api/games/validate       — Validate existing manifest
  GET  /api/games/info           — Get API info
"""

import json
import logging
import uuid
import re
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.pipeline.game_pipeline import GamePipeline
from app.validators import ValidationPipeline
from app.services import assets_client
from app.services.scene_manifest import (
    load_asset_catalog,
    generate_scene_layout,
    upload_scene_manifest,
)


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/isometric", tags=["Game Generation"])


# ═══════════════════════════════════════════════════════════════════════════════
#  DYNAMIC CHALLENGE GENERATION
# ═══════════════════════════════════════════════════════════════════════════════


def _generate_dynamic_challenges(
    existing_challenges: list,
    goal_type: str,
    goal_description: str,
    scene_index: int,
) -> list:
    """
    Generate challenges dynamically based on the user's prompt.

    IMPORTANT: This function does NOT hardcode values like object_count.
    The Flutter client will dynamically count actual collectibles in the scene
    and use that as the target. This keeps the system fully generic.
    """
    logger.info("╔══════════════════════════════════════════════════════════════╗")
    logger.info("║  DYNAMIC CHALLENGE GENERATOR v4 - FULLY GENERIC             ║")
    logger.info("╚══════════════════════════════════════════════════════════════╝")
    logger.info(
        f"[DYNAMIC] Input: goal_type='{goal_type}', goal_description='{goal_description[:80] if goal_description else 'EMPTY'}...'"
    )

    # If we already have well-formed challenges from the AI pipeline, use them
    if existing_challenges:
        valid_challenges = []
        for c in existing_challenges:
            mechanic = c.get("mechanic_id") or c.get("template_id") or "exploration"
            # Ensure challenge has required fields
            if c.get("challenge_id") or c.get("id"):
                valid_challenges.append(c)

        if valid_challenges:
            logger.info(
                f"[DYNAMIC] Using {len(valid_challenges)} challenges from AI pipeline"
            )
            return valid_challenges

    # Fallback: Generate a generic exploration challenge
    # The AI pipeline should have generated proper challenges, but if not,
    # we create a simple one that works for any scene
    logger.info(
        f"[DYNAMIC] No valid challenges from pipeline - creating generic challenge"
    )

    new_challenge = {
        "challenge_id": f"challenge_{scene_index}_explore",
        "template_id": "exploration",
        "mechanic_id": "exploration",
        "name": f"Explore Scene {scene_index + 1}",
        "hint": "Explore the area and interact with what you find",
        # NO hardcoded params - Flutter determines targets dynamically
        "params": {},
        "difficulty": "easy" if scene_index == 0 else "medium",
        "complexity": scene_index + 1,
        "rewards": {"score_points": 50, "hearts_reward": {"R": 3}},
        "scene_index": scene_index,
        "zone_hint": "challenge_zone",
        "x": 8,
        "y": 8,
    }

    logger.info(f"[DYNAMIC] Created generic challenge: {new_challenge['mechanic_id']}")
    return [new_challenge]


# ═══════════════════════════════════════════════════════════════════════════════
#  REQUEST MODELS
# ═══════════════════════════════════════════════════════════════════════════════


class ConverseRequest(BaseModel):
    """Generate game from natural language prompt."""

    prompt: str = Field(..., description="Natural language game description")
    assets: List[Dict[str, Any]] = Field(
        default_factory=list, description="Available assets (optional)"
    )
    game_id: Optional[str] = None
    game_name: Optional[str] = None
    platform_id: str = ""
    num_scenes: int = Field(3, ge=1, le=10)
    seed: Optional[int] = None
    skip_dialogue: bool = False
    skip_balance: bool = False
    include_debug: bool = False


class GenerateRequest(BaseModel):
    """Generate game with explicit configuration."""

    assets: List[Dict[str, Any]] = Field(...)
    game_name: str = Field(...)
    goal_type: str = Field("escape")
    zone_type: str = Field("forest")
    game_id: Optional[str] = None
    platform_id: str = ""
    goal_description: str = ""
    audience_type: str = "children_9_12"
    num_scenes: int = Field(3, ge=1, le=10)
    scene_width: int = Field(16, ge=8, le=64)
    scene_height: int = Field(16, ge=8, le=64)
    seed: Optional[int] = None
    enable_tutorials: bool = True
    enable_landmarks: bool = True
    enable_clustering: bool = True
    skip_dialogue: bool = False
    skip_balance: bool = False
    include_debug: bool = False


class ValidateRequest(BaseModel):
    """Validate existing manifest."""

    manifest: Dict[str, Any] = Field(...)
    stop_on_error: bool = False


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE TYPE TO SCENE TYPE MAPPING
#  Database only allows: gym, garden, farm, shared, lobby
#  Pipeline generates: forest, cave, village, castle, beach, etc.
# ═══════════════════════════════════════════════════════════════════════════════

ZONE_TO_SCENE_TYPE = {
    "forest": "garden",
    "woods": "garden",
    "jungle": "garden",
    "cave": "lobby",
    "dungeon": "lobby",
    "underground": "lobby",
    "village": "shared",
    "town": "shared",
    "city": "shared",
    "castle": "lobby",
    "palace": "lobby",
    "fortress": "lobby",
    "beach": "garden",
    "ocean": "garden",
    "island": "garden",
    "gym": "gym",
    "garden": "garden",
    "farm": "farm",
    "shared": "shared",
    "lobby": "lobby",
}


def map_zone_to_scene_type(zone_type: str) -> str:
    """Map pipeline zone_type to valid database scene_type."""
    return ZONE_TO_SCENE_TYPE.get(zone_type.lower(), "shared")


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER: Parse prompt to extract config
# ═══════════════════════════════════════════════════════════════════════════════


def parse_prompt(prompt: str) -> Dict[str, Any]:
    """Extract game config from natural language prompt using pattern matching."""
    prompt_lower = prompt.lower()
    config = {}

    # Scene count - check for explicit numbers or words
    # Order matters - check more specific patterns first
    scene_patterns = [
        (r"only\s+one\s+scene", lambda m: 1),
        (r"contain[s]?\s+only\s+one", lambda m: 1),
        (r"just\s+one\s+scene", lambda m: 1),
        (r"single\s+scene", lambda m: 1),
        (r"one\s+scene", lambda m: 1),
        (r"only\s+(\d+)\s+scene", lambda m: int(m.group(1))),
        (r"(\d+)\s+scenes?", lambda m: int(m.group(1))),
        (r"two\s+scenes?", lambda m: 2),
        (r"three\s+scenes?", lambda m: 3),
        (r"four\s+scenes?", lambda m: 4),
        (r"five\s+scenes?", lambda m: 5),
    ]
    for pattern, extractor in scene_patterns:
        match = re.search(pattern, prompt_lower)
        if match:
            num = extractor(match)
            if 1 <= num <= 10:
                config["num_scenes"] = num
                logger.info(f"Parsed num_scenes={num} from pattern '{pattern}'")
            break

    # Goal type - must match GoalType enum values in gameplay_loop_planner.py
    # GoalType enum values: escape, explore, reach, rescue, deliver, fetch, gather,
    #                       defeat, defend, survive, unlock, solve, activate,
    #                       befriend, trade, learn, build, repair, craft
    if any(
        w in prompt_lower
        for w in ["collect", "collecting", "gather", "coin", "treasure", "pick up"]
    ):
        config["goal_type"] = (
            "gather"  # Maps to GoalType.GATHER for collection mechanics
        )
    elif any(w in prompt_lower for w in ["escape", "exit", "leave", "get out"]):
        config["goal_type"] = "escape"
    elif any(w in prompt_lower for w in ["rescue", "save", "help", "free"]):
        config["goal_type"] = "rescue"
    elif any(w in prompt_lower for w in ["find", "fetch", "retrieve", "bring"]):
        config["goal_type"] = "fetch"
    elif any(w in prompt_lower for w in ["explore", "discover", "investigate"]):
        config["goal_type"] = "explore"
    elif any(w in prompt_lower for w in ["defend", "protect", "guard"]):
        config["goal_type"] = "defend"
    elif any(w in prompt_lower for w in ["puzzle", "solve", "riddle", "unlock"]):
        config["goal_type"] = "solve"  # Maps to GoalType.SOLVE
    elif any(w in prompt_lower for w in ["reach", "get to", "destination"]):
        config["goal_type"] = "reach"

    # Zone type - only set if explicitly mentioned
    if any(w in prompt_lower for w in ["forest", "woods", "trees", "jungle"]):
        config["zone_type"] = "forest"
    elif any(w in prompt_lower for w in ["cave", "dungeon", "underground"]):
        config["zone_type"] = "cave"
    elif any(w in prompt_lower for w in ["village", "town", "city"]):
        config["zone_type"] = "village"
    elif any(w in prompt_lower for w in ["castle", "palace", "fortress"]):
        config["zone_type"] = "castle"
    elif any(w in prompt_lower for w in ["beach", "ocean", "island", "sea"]):
        config["zone_type"] = "beach"
    elif any(w in prompt_lower for w in ["space", "galaxy", "planet", "asteroid"]):
        config["zone_type"] = "space"
    elif any(w in prompt_lower for w in ["mountain", "cliff", "peak"]):
        config["zone_type"] = "mountain"
    # Don't set zone_type if not mentioned - let it default to generic

    # Game name from prompt
    for pattern in [r"called ['\"]?([^'\"]+)['\"]?", r"named ['\"]?([^'\"]+)['\"]?"]:
        match = re.search(pattern, prompt_lower)
        if match:
            name = match.group(1).strip().title()
            if 3 < len(name) < 50:
                config["game_name"] = name
                break

    return config


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER: Save scenes to database and upload manifests to GCS
# ═══════════════════════════════════════════════════════════════════════════════


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER: Save scenes to database and upload manifests to GCS
# ═══════════════════════════════════════════════════════════════════════════════


async def save_scenes_and_upload_manifests(
    manifest: Dict[str, Any],
    game_id: str,
    platform_id: str = "",
    goal_type: str = "",
    goal_description: str = "",
) -> Dict[str, Any]:
    """
    Save scenes to kinship-assets database and upload manifests to GCS.
    Actors, challenges, and routes are stored directly in the scenes table.

    Following the same logic as game_plan.py:
    1. First pass: Create scenes in database (with actors, challenges, routes)
    2. Second pass: Upload manifests with enriched routes (scene IDs)

    Args:
        manifest: Generated game manifest
        game_id: Game UUID
        platform_id: Platform ID for assets
        goal_type: Game goal type (e.g., "collect", "escape")
        goal_description: User's original prompt describing the game

    Returns:
        Dict with created scene info and any warnings
    """
    created = {"scenes": [], "manifests": []}
    warnings = []
    scene_id_map = {}  # scene_name -> scene_id

    scenes = manifest.get("scenes", [])
    routes = manifest.get("routes", [])
    npcs_dict = manifest.get("npcs", {})

    if not scenes:
        return {"created": created, "warnings": ["No scenes to save"]}

    # ═══════════════════════════════════════════════════════════════════════════
    # FIRST PASS: Create scenes in database with actors, challenges, routes
    # ═══════════════════════════════════════════════════════════════════════════

    logger.info(f"First pass: Creating {len(scenes)} scenes in database...")

    for i, scene in enumerate(scenes):
        scene_name = scene.get("scene_name", f"Scene {i + 1}")
        zone_type = scene.get("zone_type", scene.get("scene_type", "forest"))
        # Map zone_type to valid database scene_type
        scene_type = map_zone_to_scene_type(zone_type)

        # Get spawn point
        spawn = scene.get("spawn", {"x": 8, "y": 14})

        # Get NPCs/actors for this scene from the npcs_dict
        scene_actors = []
        for npc_id in scene.get("npcs", []):
            if npc_id in npcs_dict:
                npc = npcs_dict[npc_id]
                scene_actors.append(
                    {
                        "id": npc.get("npc_id", npc_id),
                        "name": npc.get("name", "NPC"),
                        "actor_type": npc.get("type", "character"),
                        "role": npc.get("role", ""),
                        "personality": npc.get("personality", []),
                        "position": npc.get("position", {"x": 8, "y": 10}),
                        "facet": npc.get("facet", "E"),
                        "greeting": (
                            npc.get("dialogue", {})
                            .get("lines", [{}])[0]
                            .get("text", "Hello!")
                            if npc.get("dialogue", {}).get("lines")
                            else "Hello!"
                        ),
                        "dialogue": npc.get("dialogue", {}),
                    }
                )

        # Get challenges for this scene
        scene_challenges = scene.get("challenges", [])

        # DYNAMIC CHALLENGE FIX: Also apply to first pass (database save)
        scene_challenges = _generate_dynamic_challenges(
            existing_challenges=scene_challenges,
            goal_type=goal_type,
            goal_description=goal_description,
            scene_index=i,
        )
        logger.info(
            f"[FIRST PASS] Scene {i}: Challenges for DB = {[c.get('mechanic_id') for c in scene_challenges]}"
        )

        # Get routes FROM this scene
        scene_routes = [r for r in routes if r.get("from_scene") == i]

        scene_data = {
            "scene_name": scene_name,
            "scene_type": scene_type,
            "description": scene.get("description", ""),
            "ambient": {
                "lighting": "day",
                "weather": "clear",
            },
            "spawn_points": [
                {
                    "id": "default",
                    "label": "default",  # Required by kinship-assets
                    "position": spawn,
                    "type": "player",
                }
            ],
            "game_id": game_id,
            "platform_id": platform_id,
            "created_by": "ai_pipeline",  # Required by kinship-assets
            "metadata": {
                "generated": True,
                "scene_index": scene.get("scene_index", i),
                "width": scene.get("width", 16),
                "height": scene.get("height", 16),
                "original_zone_type": zone_type,  # Preserve original zone type
            },
            # Store actors, challenges, routes directly in the scenes table
            "actors": scene_actors,
            "challenges": scene_challenges,
            "routes": scene_routes,
        }

        try:
            logger.info(f"Creating scene '{scene_name}' with data: {scene_data}")
            created_scene = await assets_client.create_scene(scene_data)
            scene_id = created_scene.get("id", "")
            scene_id_map[scene_name] = scene_id

            created["scenes"].append(
                {
                    "id": scene_id,
                    "name": scene_name,
                    "index": i,
                }
            )

            logger.info(f"Created scene '{scene_name}' with ID: {scene_id}")

        except Exception as e:
            error_msg = str(e)
            # Try to get more details from httpx error
            if hasattr(e, "response") and e.response is not None:
                try:
                    error_detail = e.response.json()
                    error_msg = f"{error_msg} - {error_detail}"
                except:
                    error_msg = f"{error_msg} - {e.response.text[:200]}"
            logger.error(f"Failed to create scene '{scene_name}': {error_msg}")
            warnings.append(f"Failed to create scene '{scene_name}': {error_msg}")

    # ═══════════════════════════════════════════════════════════════════════════
    # SECOND PASS: Upload manifests with enriched routes
    # ═══════════════════════════════════════════════════════════════════════════

    logger.info("Second pass: Uploading manifests to GCS...")

    # Load asset catalog for layout generation (if assets are available)
    catalog, catalog_by_name = await load_asset_catalog()
    has_assets = len(catalog) > 0

    # Log catalog contents for debugging
    logger.info(f"Catalog loaded: {len(catalog)} total assets")
    types_count = {}
    for a in catalog:
        t = a.get("type", "unknown")
        types_count[t] = types_count.get(t, 0) + 1
    logger.info(f"Asset types: {types_count}")
    non_tile_assets = [a["name"] for a in catalog if a.get("type") != "tile"]
    logger.info(f"Non-tile assets ({len(non_tile_assets)}): {non_tile_assets}")

    # Track focal points used across scenes for diversity
    previous_focal_points: list[str] = []
    total_scenes = len(scenes)

    for i, scene in enumerate(scenes):
        scene_name = scene.get("scene_name", f"Scene {i + 1}")
        scene_id = scene_id_map.get(scene_name)

        if not scene_id:
            logger.warning(f"Skipping manifest for '{scene_name}': no scene_id")
            continue

        scene_type = scene.get("zone_type", scene.get("scene_type", "forest"))
        width = scene.get("width", 16)
        height = scene.get("height", 16)

        # Get NPCs for this scene
        scene_npcs = []
        for npc_id in scene.get("npcs", []):
            if npc_id in npcs_dict:
                npc = npcs_dict[npc_id]
                scene_npcs.append(
                    {
                        "id": npc.get("npc_id", npc_id),
                        "name": npc.get("name", "NPC"),
                        "role": npc.get("role", ""),
                        "position": npc.get("position", {"x": 8, "y": 10}),
                        "dialogue": npc.get("dialogue", {}),
                    }
                )

        # Get challenges for this scene
        scene_challenges = scene.get("challenges", [])

        # DYNAMIC CHALLENGE FIX: Generate challenges based on user's prompt
        scene_challenges = _generate_dynamic_challenges(
            existing_challenges=scene_challenges,
            goal_type=goal_type,
            goal_description=goal_description,
            scene_index=i,
        )
        logger.info(
            f"Scene {i}: Challenges after dynamic generation = {[c.get('mechanic_id') for c in scene_challenges]}"
        )

        # Get routes FROM this scene
        scene_routes = [r for r in routes if r.get("from_scene") == i]

        # Enrich routes with scene IDs
        enriched_routes = []
        for route in scene_routes:
            route_copy = dict(route)
            from_idx = route.get("from_scene", 0)
            to_idx = route.get("to_scene", 0)

            # Map scene index to scene ID
            from_name = f"Scene {from_idx + 1}"
            to_name = f"Scene {to_idx + 1}"

            route_copy["from_scene_id"] = scene_id_map.get(from_name, "")
            route_copy["to_scene_id"] = scene_id_map.get(to_name, "")
            route_copy["from_scene_name"] = from_name
            route_copy["to_scene_name"] = to_name

            enriched_routes.append(route_copy)

        try:
            # Generate layout if assets available
            asset_placements = []
            spawn_points = [
                {
                    "id": "main_entry",
                    "x": scene.get("spawn", {}).get("x", 8),
                    "y": scene.get("spawn", {}).get("y", 14),
                    "facing": "up",
                }
            ]
            zone_descriptions = []

            if has_assets:
                facets = [npc.get("facet", "E") for npc in scene_npcs]
                asset_placements, spawn_points, zone_descriptions = (
                    await generate_scene_layout(
                        scene_name=scene_name,
                        scene_type=scene_type,
                        description=scene.get("description", ""),
                        mood="",
                        lighting="day",
                        target_facets=facets or ["E"],
                        catalog=catalog,
                        catalog_by_name=catalog_by_name,
                        width=width,
                        height=height,
                        scene_index=i,
                        total_scenes=total_scenes,
                        previous_focal_points=previous_focal_points.copy(),
                        goal_type=goal_type,
                        goal_description=goal_description,
                        platform_id=platform_id,
                        challenges=scene_challenges,  # Pass challenges so AI can place collectibles
                    )
                )

                # ══════════════════════════════════════════════════════════════
                # GENERATE PER-COLLECTIBLE CHALLENGES
                # Each collectible gets its own challenge with target_zone = its position
                # When player reaches that zone, the challenge completes and coin disappears
                # ══════════════════════════════════════════════════════════════
                logger.info(
                    f"[COLLECTIBLE] ════════════════════════════════════════════════"
                )
                logger.info(
                    f"[COLLECTIBLE] Processing scene {i}, {len(asset_placements)} placements"
                )

                collectible_challenges = []
                collectible_count = 0

                for placement in asset_placements:
                    asset_name = placement.get("asset_name", "").lower()
                    layer = placement.get("layer", "")
                    x = placement.get("x", 0)
                    y = placement.get("y", 0)

                    # Skip ground tiles
                    if layer == "ground":
                        continue

                    # Check if this is a collectible
                    is_collectible = any(
                        keyword in asset_name
                        for keyword in [
                            "coin",
                            "gold",
                            "gem",
                            "treasure",
                            "crystal",
                            "diamond",
                            "collectible",
                            "pickup",
                            "star",
                            "orb",
                            "jewel",
                        ]
                    )

                    # Also check affordances
                    metadata = placement.get("metadata", {})
                    affordances = metadata.get("affordances", [])
                    if isinstance(affordances, list) and "collectible" in affordances:
                        is_collectible = True

                    if is_collectible:
                        collectible_count += 1
                        logger.info(
                            f"[COLLECTIBLE] ★ Found: {asset_name} at ({x}, {y})"
                        )

                        challenge = {
                            "challenge_id": f"collect_{scene_id}_{collectible_count}",
                            "id": f"collect_{scene_id}_{collectible_count}",
                            "template_id": "collect_item",
                            "mechanic_id": "collect_item",
                            "name": f"Collect Gold Coin",
                            "hint": f"Walk to the coin to collect it",
                            "description": f"Collect the coin at position ({x}, {y})",
                            "difficulty": "easy",
                            "params": {
                                "asset_name": asset_name,
                                "asset_id": placement.get("asset_id", ""),
                            },
                            "target_zone": {
                                "x": x,
                                "y": y,
                                "radius": 2,  # Radius of 2 for easier collection
                            },
                            "rewards": {
                                "score_points": 10,
                                "hearts_reward": {"R": 1},
                            },
                            "scene_index": i,
                        }
                        collectible_challenges.append(challenge)
                        logger.info(
                            f"[COLLECTIBLE] Created challenge with target_zone: ({x}, {y}, r=2)"
                        )

                # If we found collectibles, use per-collectible challenges
                # Otherwise keep the original challenges
                logger.info(
                    f"[COLLECTIBLE] Total collectibles found: {collectible_count}"
                )
                logger.info(
                    f"[COLLECTIBLE] Original challenges: {len(scene_challenges)}"
                )

                if collectible_challenges:
                    logger.info(
                        f"[COLLECTIBLE] ★★★ REPLACING {len(scene_challenges)} original challenges with {len(collectible_challenges)} per-collectible challenges"
                    )
                    scene_challenges = collectible_challenges
                else:
                    logger.info(
                        f"[COLLECTIBLE] No collectibles found, keeping original challenges"
                    )

                logger.info(f"[COLLECTIBLE] Final challenges for scene {i}:")
                for c in scene_challenges:
                    tz = c.get("target_zone", {})
                    logger.info(
                        f"[COLLECTIBLE]   → {c.get('name')}: target_zone=({tz.get('x')}, {tz.get('y')}, r={tz.get('radius')})"
                    )
                logger.info(
                    f"[COLLECTIBLE] ════════════════════════════════════════════════"
                )

                # Track focal points used in this scene for diversity
                # Uses asset's scene_role from catalog instead of hardcoded keywords
                for placement in asset_placements:
                    asset_name = placement.get("asset_name", "")
                    cat_entry = catalog_by_name.get(asset_name, {})
                    scene_role = cat_entry.get("scene_role", "")
                    if (
                        scene_role == "focal_point"
                        and asset_name not in previous_focal_points
                    ):
                        previous_focal_points.append(asset_name)

            # Upload manifest to GCS
            manifest_url = await upload_scene_manifest(
                scene_id=scene_id,
                scene_name=scene_name,
                scene_type=scene_type,
                description=scene.get("description", ""),
                lighting="day",
                asset_placements=asset_placements,
                spawn_points=spawn_points,
                zone_descriptions=zone_descriptions,
                actors=scene_npcs,
                challenges=scene_challenges,
                quests=[],
                routes=enriched_routes,
                width=width,
                height=height,
                scene_name_to_id=scene_id_map,
            )

            if manifest_url:
                created["manifests"].append(
                    {
                        "scene_id": scene_id,
                        "scene_name": scene_name,
                        "manifest_url": manifest_url,
                    }
                )
                logger.info(f"Manifest uploaded for '{scene_name}': {manifest_url}")
            else:
                warnings.append(f"Failed to upload manifest for '{scene_name}'")

        except Exception as e:
            logger.error(f"Manifest upload error for '{scene_name}': {e}")
            warnings.append(f"Manifest upload error for '{scene_name}': {str(e)}")

    return {
        "created": created,
        "warnings": warnings,
        "scene_id_map": scene_id_map,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/plan/converse")
async def plan_converse(request: ConverseRequest):
    """
    Generate a game from a natural language prompt.

    Runs the full pipeline automatically, saves scenes to database,
    uploads manifests to GCS, and returns the manifest.
    """
    logger.info(f"POST /api/games/plan/converse - prompt: {request.prompt[:50]}...")

    # Parse prompt for config hints
    parsed = parse_prompt(request.prompt)

    # Build final config - use parsed values from prompt, with request values as fallback
    game_id = request.game_id or str(uuid.uuid4())
    game_name = request.game_name or parsed.get("game_name", "Generated Game")
    goal_type = parsed.get("goal_type", "explore")  # Default to explore, not escape
    zone_type = parsed.get("zone_type", "generic")  # Default to generic, not forest
    num_scenes = parsed.get(
        "num_scenes", request.num_scenes
    )  # Use parsed scene count if found

    logger.info(f"=== PROMPT PARSING RESULTS ===")
    logger.info(f"Original prompt: {request.prompt[:100]}...")
    logger.info(f"Parsed goal_type: {goal_type}")
    logger.info(f"Parsed zone_type: {zone_type}")
    logger.info(f"Parsed num_scenes: {num_scenes}")
    logger.info(f"Full parsed config: {parsed}")
    logger.info(f"==============================")

    # Create pipeline and run
    pipeline = GamePipeline(
        skip_dialogue=request.skip_dialogue,
        skip_auto_balance=request.skip_balance,
        include_debug=request.include_debug,
    )

    result = await pipeline.generate(
        game_id=game_id,
        game_name=game_name,
        assets=request.assets,
        goal_type=goal_type,
        goal_description=request.prompt,
        num_scenes=num_scenes,
        zone_type=zone_type,
        seed=request.seed,
    )

    # Build response
    if not result.success:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Pipeline failed",
                "errors": result.errors,
                "warnings": result.warnings,
            },
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # AUTO-SAVE: Save scenes to database and upload manifests to GCS
    # ═══════════════════════════════════════════════════════════════════════════

    save_result = await save_scenes_and_upload_manifests(
        manifest=result.manifest,
        game_id=game_id,
        platform_id=request.platform_id,
        goal_type=goal_type,
        goal_description=request.prompt,
    )

    # Update manifest with actual scene IDs from database
    scene_id_map = save_result.get("scene_id_map", {})
    if scene_id_map and result.manifest.get("scenes"):
        for scene in result.manifest["scenes"]:
            scene_name = scene.get("scene_name", "")
            if scene_name in scene_id_map:
                scene["id"] = scene_id_map[scene_name]
                scene["scene_id"] = scene_id_map[scene_name]

        # Update routes with actual scene IDs
        for route in result.manifest.get("routes", []):
            from_name = route.get("from_scene_name", "")
            to_name = route.get("to_scene_name", "")
            if from_name in scene_id_map:
                route["from_scene_id"] = scene_id_map[from_name]
            if to_name in scene_id_map:
                route["to_scene_id"] = scene_id_map[to_name]

    # Combine warnings
    all_warnings = result.warnings + save_result.get("warnings", [])

    return {
        "success": True,
        "manifest": result.manifest,
        "game_id": game_id,
        "seed": result.state.seed if result.state else None,
        "duration_ms": result.total_duration_ms,
        "stats": {
            "scenes": len(result.manifest.get("scenes", [])),
            "npcs": len(result.manifest.get("npcs", {})),
            "routes": len(result.manifest.get("routes", [])),
        },
        "warnings": all_warnings,
        "parsed_config": {
            "goal_type": goal_type,
            "zone_type": zone_type,
            "num_scenes": num_scenes,
        },
        "synced": save_result.get("created"),
    }


@router.post("/generate")
async def generate(request: GenerateRequest):
    """
    Generate a game with explicit configuration.

    Returns the complete manifest.
    """
    logger.info(f"POST /api/games/generate - game: {request.game_name}")

    game_id = request.game_id or str(uuid.uuid4())

    # Create pipeline and run
    pipeline = GamePipeline(
        skip_dialogue=request.skip_dialogue,
        skip_auto_balance=request.skip_balance,
        include_debug=request.include_debug,
    )

    result = await pipeline.generate(
        game_id=game_id,
        game_name=request.game_name,
        assets=request.assets,
        goal_type=request.goal_type,
        goal_description=request.goal_description,
        audience_type=request.audience_type,
        num_scenes=request.num_scenes,
        zone_type=request.zone_type,
        seed=request.seed,
        scene_width=request.scene_width,
        scene_height=request.scene_height,
        enable_tutorials=request.enable_tutorials,
        enable_landmarks=request.enable_landmarks,
        enable_clustering=request.enable_clustering,
    )

    if not result.success:
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Pipeline failed",
                "errors": result.errors,
                "warnings": result.warnings,
            },
        )

    # AUTO-SAVE: Save scenes to database and upload manifests to GCS
    save_result = await save_scenes_and_upload_manifests(
        manifest=result.manifest,
        game_id=game_id,
        platform_id=request.platform_id,
    )

    # Update manifest with actual scene IDs
    scene_id_map = save_result.get("scene_id_map", {})
    if scene_id_map and result.manifest.get("scenes"):
        for scene in result.manifest["scenes"]:
            scene_name = scene.get("scene_name", "")
            if scene_name in scene_id_map:
                scene["id"] = scene_id_map[scene_name]
                scene["scene_id"] = scene_id_map[scene_name]

    all_warnings = result.warnings + save_result.get("warnings", [])

    return {
        "success": True,
        "manifest": result.manifest,
        "game_id": game_id,
        "seed": result.state.seed if result.state else None,
        "duration_ms": result.total_duration_ms,
        "stats": {
            "scenes": len(result.manifest.get("scenes", [])),
            "npcs": len(result.manifest.get("npcs", {})),
            "routes": len(result.manifest.get("routes", [])),
        },
        "warnings": all_warnings,
        "synced": save_result.get("created"),
    }


@router.post("/validate")
async def validate(request: ValidateRequest):
    """Validate an existing game manifest."""
    logger.info("POST /api/games/validate")

    pipeline = ValidationPipeline(stop_on_error=request.stop_on_error)
    result = pipeline.validate(request.manifest)

    return {
        "valid": result.valid,
        "errors": [
            {"code": e.code, "message": e.message, "location": e.location}
            for e in result.all_errors
        ],
        "warnings": [
            {"code": w.code, "message": w.message, "location": w.location}
            for w in result.all_warnings
        ],
        "duration_ms": result.total_duration_ms,
    }


@router.get("/info")
async def get_info():
    """Get API and pipeline info."""
    from app.pipeline.manifest_assembler import MANIFEST_VERSION

    return {
        "version": "1.0.0",
        "manifest_version": MANIFEST_VERSION,
        "endpoints": {
            "converse": "POST /api/games/plan/converse",
            "generate": "POST /api/games/generate",
            "validate": "POST /api/games/validate",
        },
        "pipeline_stages": [
            "planning",
            "scene_generation",
            "challenge_generation",
            "npc_generation",
            "auto_balance",
            "dialogue_generation",
            "verification",
            "materialization",
            "assembly",
        ],
    }
