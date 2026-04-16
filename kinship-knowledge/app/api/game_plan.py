"""Game Plan — Senior Game Architect AI for Flutter/Flame Isometric Games.

CAPABILITIES:
- Generic for ANY game theme (uses asset knowledge from Pinecone)
- Flutter/Flame engine expertise (z-ordering, coordinates, collision)
- Asset-aware planning (only creates actors with available sprites)
- Preview integrated in response
- Edit-aware (tracks user's UI changes)
- Clear navigation guide for players
- Interactive challenges (never quiz-style)
- AUTO-SAVE: Syncs to database on every conversation (no confirm needed)

Endpoints:
  POST /api/games/plan/converse  — Conversation with auto-save
  POST /api/games/plan/confirm   — Create game from plan (legacy)
  POST /api/games/plan/preview   — Standalone preview
  DELETE /api/games/plan/clear   — Clear all game content
"""

import json
import logging
import re
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from app.db.database import get_db
from app.services.claude_client import invoke_claude
from app.services import assets_client
from app.services.asset_embeddings import (
    retrieve_relevant_assets,
    retrieve_design_knowledge,
)
from app.services.scene_manifest import (
    load_asset_catalog,
    generate_scene_layout,
    upload_scene_manifest,
)

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Game Plan"])


# ═══════════════════════════════════════════════════════════════════════════════
#  SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════


class PlanMessage(BaseModel):
    role: str
    content: str


class UserEdit(BaseModel):
    """Tracks user edits made via drag-drop, inline edit, or delete button."""

    edit_type: str  # "add" | "update" | "delete"
    entity_type: str  # "scene" | "actor" | "challenge" | "quest" | "route"
    entity_name: str
    scene_name: Optional[str] = None
    details: Optional[dict] = None


class PlanConverseRequest(BaseModel):
    messages: list[PlanMessage]
    game_id: str
    platform_id: str = ""
    game_name: str = ""
    game_description: str = ""
    game_theme: str = ""
    existing_scenes: list[dict] = []
    existing_actors: list[dict] = []
    existing_challenges: list[dict] = []
    existing_quests: list[dict] = []
    existing_routes: list[dict] = []
    current_plan: Optional[dict] = None
    user_edits: list[UserEdit] = []
    include_preview: bool = True


class PreviewScene(BaseModel):
    scene_name: str
    scene_type: str
    description: str = ""
    manifest: dict
    actor_count: int = 0
    challenge_count: int = 0


class NavigationStep(BaseModel):
    scene: str
    objectives: list[str]
    how_to_complete: list[str]
    unlocks: list[str]
    exit_location: Optional[str] = None


class NavigationGuide(BaseModel):
    start_scene: str
    total_scenes: int
    estimated_time: str
    steps: list[NavigationStep]
    route_map: list[dict]


class PlanConverseResponse(BaseModel):
    message: str
    plan: Optional[dict] = None
    preview: Optional[list[PreviewScene]] = None
    phase: str = "exploring"
    suggestions: list[str] = []
    asset_warnings: list[str] = []
    available_assets: Optional[dict] = None
    navigation_guide: Optional[NavigationGuide] = None
    synced: Optional[dict] = None  # NEW: Auto-save results


class PlanConfirmRequest(BaseModel):
    game_id: str
    platform_id: str = ""
    plan: dict


class PlanConfirmResponse(BaseModel):
    success: bool
    created: dict
    starting_scene_id: Optional[str] = None
    warnings: list[str] = []
    navigation_guide: Optional[dict] = None
    rewards_summary: Optional[dict] = None


class PlanPreviewRequest(BaseModel):
    plan: dict
    platform_id: str = ""


class PlanPreviewResponse(BaseModel):
    scenes: list[PreviewScene]
    warnings: list[str] = []


class PlanClearRequest(BaseModel):
    game_id: str


# ═══════════════════════════════════════════════════════════════════════════════
#  ASSET CONTEXT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════


async def build_asset_context(
    platform_id: str,
    game_description: str = "",
    game_theme: str = "",
) -> tuple[str, list[str], dict]:
    """Build comprehensive asset context."""
    warnings = []
    summary = {"tiles": 0, "characters": 0, "creatures": 0, "objects": 0, "total": 0}

    if not platform_id:
        return "", ["No platform_id - cannot fetch assets"], summary

    try:
        assets = await assets_client.fetch_all_assets(platform_id=platform_id)
        logger.info(f"Loaded {len(assets)} assets for platform {platform_id}")
    except Exception as e:
        logger.error(f"Asset fetch failed: {e}")
        return "", [f"Asset fetch error: {e}"], summary

    if not assets:
        no_asset_context = """
═══════════════════════════════════════════════════════════════════════════════
⚠️ NO ASSETS AVAILABLE
═══════════════════════════════════════════════════════════════════════════════

This platform has no uploaded sprites, tiles, or objects.

DESIGN WITHOUT ASSETS:
✓ Create scenes with rich descriptions (mood, lighting, layout intent)
✓ Design challenges with full interactive mechanics
✓ Create quests with objectives and rewards
✓ Define routes with clear unlock conditions
✗ DO NOT create any actors (no sprites to assign)

When assets are uploaded later, actors can be added to the existing structure.
"""
        warnings.append("No assets - design structure only, no actors")
        return no_asset_context, warnings, summary

    tiles, characters, creatures, objects = [], [], [], []
    collectibles, interactives, ambient = [], [], []
    detected_themes = set()

    for a in assets:
        atype = a.get("type", "object")
        name = a.get("name", "unknown")
        display = a.get("display_name", name)
        tags = a.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        knowledge = a.get("knowledge", {}) or {}
        scene_role = knowledge.get("scene_role", "")
        visual_desc = knowledge.get("visual_description", "")[:80]
        suitable_scenes = knowledge.get("suitable_scenes", [])
        placement = knowledge.get("placement_hint", "")

        detected_themes.update(suitable_scenes)

        info = {
            "name": name,
            "display": display,
            "tags": tags[:4],
            "role": scene_role,
            "desc": visual_desc,
            "scenes": suitable_scenes[:3],
            "placement": placement,
        }

        if atype == "tile":
            tiles.append(info)
            summary["tiles"] += 1
        elif atype == "character":
            characters.append(info)
            summary["characters"] += 1
        elif atype == "creature":
            creatures.append(info)
            summary["creatures"] += 1
        else:
            if scene_role == "collectible":
                collectibles.append(info)
            elif scene_role in ("interactive", "obstacle"):
                interactives.append(info)
            elif scene_role == "ambient":
                ambient.append(info)
            else:
                objects.append(info)
            summary["objects"] += 1

    summary["total"] = len(assets)

    def format_assets(items: list, limit: int = 15) -> str:
        if not items:
            return "  (none)"
        lines = []
        for item in items[:limit]:
            tags_str = ", ".join(item["tags"]) if item["tags"] else ""
            scenes_str = ", ".join(item["scenes"]) if item["scenes"] else ""
            line = f"  • {item['name']}"
            if item["display"] != item["name"]:
                line += f" ({item['display']})"
            if tags_str:
                line += f" [{tags_str}]"
            if item["role"]:
                line += f" - {item['role']}"
            if scenes_str:
                line += f" (scenes: {scenes_str})"
            lines.append(line)
        if len(items) > limit:
            lines.append(f"  ... and {len(items) - limit} more")
        return "\n".join(lines)

    themes_str = (
        ", ".join(sorted(detected_themes)[:10]) if detected_themes else "general"
    )

    context = f"""
═══════════════════════════════════════════════════════════════════════════════
AVAILABLE ASSETS ({summary['total']} total)
═══════════════════════════════════════════════════════════════════════════════

Detected themes: {themes_str}

TILES ({summary['tiles']}):
{format_assets(tiles)}

CHARACTERS ({summary['characters']}):
{format_assets(characters)}

CREATURES ({summary['creatures']}):
{format_assets(creatures)}

COLLECTIBLES ({len(collectibles)}):
{format_assets(collectibles)}

INTERACTIVE/OBSTACLES ({len(interactives)}):
{format_assets(interactives)}

AMBIENT ({len(ambient)}):
{format_assets(ambient)}

OTHER OBJECTS ({len(objects)}):
{format_assets(objects)}

═══════════════════════════════════════════════════════════════════════════════
ASSET USAGE RULES:
1. ONLY use actors that match available character/creature sprites
2. Use detected themes to inform scene types
3. Place collectibles in explorable areas
4. Use ambient objects to enhance atmosphere
5. Match actors to appropriate scene types (check "scenes" field)
═══════════════════════════════════════════════════════════════════════════════
"""
    return context, warnings, summary


def build_edit_context(edits: list[UserEdit]) -> str:
    """Build context string describing user's manual edits."""
    if not edits:
        return ""
    lines = ["\n<user_edits>", "The user has made these manual changes:"]
    for edit in edits:
        if edit.edit_type == "add":
            lines.append(f"  + Added {edit.entity_type}: {edit.entity_name}")
        elif edit.edit_type == "update":
            lines.append(f"  ~ Updated {edit.entity_type}: {edit.entity_name}")
        elif edit.edit_type == "delete":
            lines.append(f"  - Deleted {edit.entity_type}: {edit.entity_name}")
        if edit.scene_name:
            lines[-1] += f" (in {edit.scene_name})"
    lines.append("Incorporate these changes into your updated plan.")
    lines.append("</user_edits>")
    return "\n".join(lines)


def generate_navigation_guide(plan: dict) -> Optional[NavigationGuide]:
    """Generate player navigation guide from plan."""
    if not plan:
        return None
    scenes = plan.get("scenes", [])
    routes = plan.get("routes", [])
    if not scenes:
        return None

    steps = []
    route_map = []
    routes_from = {}
    for r in routes:
        from_scene = r.get("from_scene_name", "")
        if from_scene not in routes_from:
            routes_from[from_scene] = []
        routes_from[from_scene].append(r)

    for i, scene in enumerate(scenes):
        scene_name = scene.get("scene_name", f"Scene {i+1}")
        challenges = scene.get("challenges", [])
        actors = scene.get("actors", [])

        objectives = []
        how_to = []
        unlocks = []

        for ch in challenges:
            objectives.append(f"Complete: {ch.get('name', 'challenge')}")
            if ch.get("description"):
                how_to.append(ch["description"])

        for actor in actors:
            if actor.get("role") in ("guide", "quest_giver", "merchant"):
                objectives.append(f"Talk to {actor.get('name', 'NPC')}")

        scene_routes = routes_from.get(scene_name, [])
        exit_location = None
        for r in scene_routes:
            to_scene = r.get("to_scene_name", "")
            unlocks.append(to_scene)
            trigger = r.get("trigger", {})
            if isinstance(trigger, dict) and trigger.get("zone"):
                zone = trigger["zone"]
                exit_location = f"Exit at ({zone.get('x', '?')}, {zone.get('y', '?')})"
            route_map.append(
                {
                    "from": scene_name,
                    "to": to_scene,
                    "trigger": (
                        trigger.get("type", "zone_enter")
                        if isinstance(trigger, dict)
                        else "zone_enter"
                    ),
                }
            )

        steps.append(
            NavigationStep(
                scene=scene_name,
                objectives=objectives or ["Explore the area"],
                how_to_complete=how_to or ["Navigate and interact"],
                unlocks=unlocks,
                exit_location=exit_location,
            )
        )

    total_challenges = sum(len(s.get("challenges", [])) for s in scenes)
    est_minutes = len(scenes) * 3 + total_challenges * 2
    est_time = (
        f"{est_minutes} minutes"
        if est_minutes < 60
        else f"{est_minutes // 60}h {est_minutes % 60}m"
    )

    return NavigationGuide(
        start_scene=scenes[0].get("scene_name", "Scene 1") if scenes else "Unknown",
        total_scenes=len(scenes),
        estimated_time=est_time,
        steps=steps,
        route_map=route_map,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  SYSTEM PROMPT
#  NOTE: Replace this with your full PLAN_SYSTEM_PROMPT from your original file
# ═══════════════════════════════════════════════════════════════════════════════

PLAN_SYSTEM_PROMPT = """You are a senior game architect for Kinship Studio, designing Flutter/Flame isometric games.

Your role: Create complete game plans with scenes, actors, challenges, quests, and routes.

CRITICAL RULES:
1. ONLY interactive challenges: path_building, construction, exploration, collection, puzzle, simulation, navigation
2. NEVER use quiz, multiple_choice, or text_input mechanics
3. Actor types: character, creature, collectible, obstacle, interactive, ambient
4. Scene types: forest, ocean, mountain, village, cave, camp, sports, adventure, generic
5. HEART facets: H (Harmony), E (Empowerment), A (Awareness), R (Resilience), T (Tenacity)
6. Only create actors if matching sprites are available in assets

OUTPUT FORMAT:
Always wrap your plan in <plan></plan> tags with valid JSON:

<plan>
{
  "game_name": "Game Name",
  "scenes": [
    {
      "scene_name": "Unique Scene Name",
      "scene_type": "forest",
      "description": "Scene description for atmosphere",
      "mood": "peaceful",
      "lighting": "day",
      "layout": {
        "player_spawn": {"x": 8, "y": 14},
        "key_areas": ["entrance", "center", "exit"]
      },
      "actors": [
        {
          "name": "Actor Name",
          "actor_type": "character",
          "role": "guide",
          "facet": "E",
          "position": {"x": 6, "y": 10},
          "dialogue": {
            "greeting": "Hello traveler!",
            "tree": []
          },
          "behavior": {
            "movement": {"type": "patrol", "points": []}
          }
        }
      ],
      "challenges": [
        {
          "name": "Challenge Name",
          "mechanic_type": "exploration",
          "description": "What the player does",
          "difficulty": "medium",
          "facets": ["T", "E"],
          "success_conditions": ["reach_zone", "collect_items"],
          "on_complete": {
            "hearts_delta": {"T": 5, "E": 3},
            "score_points": 100,
            "show_message": "Well done!"
          }
        }
      ],
      "quests": [
        {
          "name": "Quest Name",
          "description": "Quest objective",
          "beat_type": "Exploration",
          "facet": "E",
          "objectives": ["Find the hidden path"],
          "on_complete": {"unlock_route": "next_scene"}
        }
      ]
    }
  ],
  "routes": [
    {
      "from_scene_name": "Scene A",
      "to_scene_name": "Scene B",
      "trigger": {"type": "zone_enter", "zone": {"x": 15, "y": 8, "radius": 2}},
      "conditions": []
    }
  ],
  "achievements": [
    {
      "name": "First Steps",
      "description": "Complete your first challenge",
      "tier": "bronze",
      "type": "progress",
      "trigger": {"event": "challenge_complete", "conditions": {"count": 1}},
      "rewards": {"xp": 50, "points": 100}
    }
  ],
  "leaderboards": [
    {
      "name": "Top Explorers",
      "type": "total_score",
      "periods": ["all_time", "weekly"]
    }
  ]
}
</plan>

Wrap current phase in <phase>exploring|planning|refining|ready</phase>
Wrap suggestions in <suggestions>["suggestion1", "suggestion2"]</suggestions>

MODIFICATION COMMANDS:
When user asks to modify, update the COMPLETE plan:
- "add fox to scene 1" → Add actor to that scene
- "remove challenge from Forest" → Remove it
- "add route from A to B" → Add route
- "change scene type to ocean" → Update scene_type

Always return the COMPLETE updated plan with ALL scenes, actors, challenges, routes.
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVERSE ENDPOINT (with AUTO-SAVE)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/api/games/plan/converse", response_model=PlanConverseResponse)
async def plan_converse(body: PlanConverseRequest, db: AsyncSession = Depends(get_db)):
    """Main conversation endpoint with integrated preview and AUTO-SAVE."""

    asset_context, asset_warnings, asset_summary = await build_asset_context(
        body.platform_id, body.game_description, body.game_theme
    )
    edit_context = build_edit_context(body.user_edits)

    context_parts = []
    if body.game_name:
        context_parts.append(f"Game: {body.game_name}")
    if body.game_description:
        context_parts.append(f"Description: {body.game_description}")
    if body.game_theme:
        context_parts.append(f"Theme: {body.game_theme}")
    if body.existing_scenes:
        names = [s.get("scene_name", s.get("name", "?")) for s in body.existing_scenes]
        context_parts.append(f"Existing scenes: {', '.join(names)}")
    if body.existing_actors:
        context_parts.append(f"Existing actors: {len(body.existing_actors)}")
    if body.existing_challenges:
        context_parts.append(f"Existing challenges: {len(body.existing_challenges)}")
    if body.existing_routes:
        context_parts.append(f"Existing routes: {len(body.existing_routes)}")

    existing_context = "\n".join(context_parts) if context_parts else "New game"

    plan_context = ""
    if body.current_plan:
        plan_context = f"\nCurrent plan:\n<plan>\n{json.dumps(body.current_plan, indent=2)}\n</plan>"

    system = (
        PLAN_SYSTEM_PROMPT
        + f"""

{asset_context}
{edit_context}

<game_context>
{existing_context}
{plan_context}
</game_context>
"""
    )

    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    last_msg = messages[-1]["content"] if messages else ""
    history = messages[:-1] if len(messages) > 1 else None

    try:
        raw = await invoke_claude(
            system_prompt=system,
            user_message=last_msg,
            history=history,
            model="sonnet",
        )

        plan = None
        if "<plan>" in raw and "</plan>" in raw:
            try:
                plan_str = raw.split("<plan>")[1].split("</plan>")[0].strip()
                plan = json.loads(plan_str)
            except json.JSONDecodeError as e:
                logger.warning(f"Plan JSON parse error: {e}")

        phase = "exploring"
        if "<phase>" in raw and "</phase>" in raw:
            phase = raw.split("<phase>")[1].split("</phase>")[0].strip()
        elif plan:
            phase = "planning"

        suggestions = []
        if "<suggestions>" in raw and "</suggestions>" in raw:
            try:
                suggestions = json.loads(
                    raw.split("<suggestions>")[1].split("</suggestions>")[0].strip()
                )
            except:
                pass

        message = raw
        for tag in ["plan", "phase", "suggestions"]:
            message = re.sub(rf"<{tag}>.*?</{tag}>", "", message, flags=re.DOTALL)
        message = re.sub(r"\n{3,}", "\n\n", message).strip()

        preview = None
        if body.include_preview and plan and plan.get("scenes"):
            try:
                preview = await generate_preview_scenes(plan)
            except Exception as e:
                logger.warning(f"Preview generation error: {e}")

        nav_guide = generate_navigation_guide(plan) if plan else None

        # ═══════════════════════════════════════════════════════════════
        #  AUTO-SAVE: Sync plan to database
        # ═══════════════════════════════════════════════════════════════
        synced = None
        # Inside plan_converse, after getting the plan:
        if plan and body.game_id:
            logger.info(f"=== AUTO-SAVE STARTING ===")
            logger.info(f"game_id: {body.game_id}")
            logger.info(f"platform_id: {body.platform_id}")
            logger.info(f"scenes in plan: {len(plan.get('scenes', []))}")

            try:
                synced, scene_name_to_id = await sync_plan_to_db(
                    game_id=body.game_id,
                    platform_id=body.platform_id,
                    plan=plan,
                    db=db,
                )
                plan = attach_ids_to_plan(plan, scene_name_to_id, synced)
                logger.info(f"=== AUTO-SAVE SUCCESS ===")
                logger.info(f"synced: {synced}")
            except Exception as e:
                logger.error(f"=== AUTO-SAVE FAILED ===")
                logger.error(f"Error: {e}")
                import traceback

                logger.error(traceback.format_exc())

        if not suggestions:
            if phase == "exploring":
                suggestions = [
                    "3-scene adventure",
                    "5-scene journey",
                    "2-scene tutorial",
                ]
            elif phase in ("planning", "refining"):
                suggestions = [
                    "Looks good!",
                    "Add more challenges",
                    "Add another scene",
                ]
            elif phase == "ready":
                suggestions = ["Create game", "One more change"]

        return PlanConverseResponse(
            message=message,
            plan=plan,
            preview=preview,
            phase=phase,
            suggestions=suggestions,
            asset_warnings=asset_warnings,
            available_assets=(
                asset_summary if asset_summary.get("total", 0) > 0 else None
            ),
            navigation_guide=nav_guide,
            synced=synced,
        )

    except Exception as e:
        logger.error(f"Converse error: {e}")
        return PlanConverseResponse(
            message="I encountered an issue. Could you try rephrasing?",
            phase="exploring",
            suggestions=["Try again", "Describe your game idea"],
            asset_warnings=[],
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  PREVIEW GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_preview_scenes(plan: dict) -> list[PreviewScene]:
    """Generate visual preview manifests for plan scenes."""
    scenes_data = plan.get("scenes", [])
    if not scenes_data:
        return []

    catalog, catalog_by_name = await load_asset_catalog()

    LIGHTING_MAP = {
        "morning": "dawn",
        "evening": "dusk",
        "midnight": "night",
        "sunny": "day",
    }
    VALID_LIGHTING = {"day", "night", "dawn", "dusk"}

    result = []
    for i, s in enumerate(scenes_data):
        scene_name = s.get("scene_name", f"Scene {i + 1}")
        scene_type = s.get("scene_type", "generic")
        description = s.get("description", "")
        raw_lighting = str(s.get("lighting", "day")).lower()
        lighting = (
            raw_lighting
            if raw_lighting in VALID_LIGHTING
            else LIGHTING_MAP.get(raw_lighting, "day")
        )

        actors = s.get("actors", [])
        challenges = s.get("challenges", [])

        if not catalog:
            result.append(
                PreviewScene(
                    scene_name=scene_name,
                    scene_type=scene_type,
                    description=description,
                    manifest={
                        "scene": {"scene_name": scene_name},
                        "asset_placements": [],
                    },
                    actor_count=len(actors),
                    challenge_count=len(challenges),
                )
            )
            continue

        try:
            facets = list(
                set(a.get("facet", "E") for a in actors if a.get("facet"))
            ) or ["E"]
            placements, spawns, zones = await generate_scene_layout(
                scene_name=scene_name,
                scene_type=scene_type,
                description=description,
                mood=s.get("mood", ""),
                lighting=lighting,
                target_facets=facets,
                catalog=catalog,
                catalog_by_name=catalog_by_name,
            )
            manifest = {
                "scene": {
                    "scene_name": scene_name,
                    "scene_type": scene_type,
                    "description": description,
                    "lighting": lighting,
                    "dimensions": {"width": 16, "height": 16},
                    "spawn_points": spawns,
                    "zones": zones,
                    "layout": s.get("layout", {}),
                },
                "asset_placements": placements,
                "actors": actors,
                "challenges": challenges,
            }
            result.append(
                PreviewScene(
                    scene_name=scene_name,
                    scene_type=scene_type,
                    description=description,
                    manifest=manifest,
                    actor_count=len(actors),
                    challenge_count=len(challenges),
                )
            )
        except Exception as e:
            logger.error(f"Preview error for {scene_name}: {e}")
            result.append(
                PreviewScene(
                    scene_name=scene_name,
                    scene_type=scene_type,
                    description=description,
                    manifest={
                        "scene": {"scene_name": scene_name},
                        "asset_placements": [],
                    },
                    actor_count=len(actors),
                    challenge_count=len(challenges),
                )
            )

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTO-SYNC FUNCTIONS (NEW)
# ═══════════════════════════════════════════════════════════════════════════════


def _normalize_correct_answers(value) -> list[dict]:
    """Convert a list of success_conditions (strings or dicts) to list[dict].

    The AI may return success_conditions as plain strings like 'craft_item'.
    ChallengeResponse.correct_answers expects list[dict], so we normalize at
    write time to avoid ResponseValidationError on read.
    """
    result = []
    for item in value or []:
        if isinstance(item, dict):
            result.append(item)
        else:
            result.append({"type": str(item)})
    return result


def enrich_routes_with_scene_ids(routes: list, scene_name_to_id: dict) -> list:
    """
    Enrich route objects with from_scene_id and to_scene_id.

    This is necessary for Flutter to navigate between scenes via API calls.
    The API requires scene UUIDs, not names.

    Args:
        routes: List of route dicts with from_scene_name, to_scene_name
        scene_name_to_id: Map of scene name to scene UUID

    Returns:
        List of routes with scene IDs added
    """
    enriched = []
    for r in routes:
        route_copy = dict(r)
        from_name = r.get("from_scene_name", "")
        to_name = r.get("to_scene_name", "")

        # Add scene IDs if we can resolve them
        if from_name and from_name in scene_name_to_id:
            route_copy["from_scene_id"] = scene_name_to_id[from_name]
        if to_name and to_name in scene_name_to_id:
            route_copy["to_scene_id"] = scene_name_to_id[to_name]

        enriched.append(route_copy)
    return enriched


async def sync_plan_to_db(
    game_id: str, platform_id: str, plan: dict, db: AsyncSession
) -> tuple[dict, dict]:
    """Smart sync plan to database: create/update/delete."""
    print("========================= CHECK 1 =========================")
    from app.db.models import Actor, Challenge, Quest, Route

    synced = {
        "scenes": {"created": [], "updated": [], "deleted": []},
        "actors": {"created": [], "updated": [], "deleted": []},
        "challenges": {"created": [], "updated": [], "deleted": []},
        "quests": {"created": [], "updated": [], "deleted": []},
        "routes": {"created": [], "updated": [], "deleted": []},
    }

    print("========================= CHECK 2 =========================")

    plan_scenes = plan.get("scenes", [])
    plan_routes = plan.get("routes", [])

    print("========================= CHECK 3 =========================")
    if not plan_scenes:
        print("========================= CHECK 4 =========================")
        return synced, {}

    print("========================= CHECK 5 =========================")
    catalog, catalog_by_name = await load_asset_catalog()
    has_assets = len(catalog) > 0
    LIGHTING = {"day", "night", "dawn", "dusk"}

    print("========================= CHECK 6 =========================")

    try:
        print("========================= CHECK 7 =========================")
        existing_scenes_list = await assets_client.list_scenes(game_id=game_id)
        print(
            "========================= CHECK 8 =========================",
            existing_scenes_list,
        )
    except:
        print("========================= CHECK 9 =========================")
        existing_scenes_list = []

    existing_scene_map = {
        s.get("scene_name", s.get("name", "")): s for s in existing_scenes_list
    }
    print("========================= CHECK 10 =========================")
    scene_name_to_id = {}
    plan_scene_names = {s.get("scene_name") for s in plan_scenes}

    print("========================= CHECK 11 =========================")

    for i, s in enumerate(plan_scenes):
        name = s.get("scene_name", f"Scene {i+1}")
        stype = s.get("scene_type", "adventure")
        lighting = s.get("lighting", "day")
        if lighting not in LIGHTING:
            lighting = "day"
        layout = s.get("layout", {})
        spawn = layout.get("player_spawn", {"x": 8, "y": 14})

        # Full internal scene data (used for context/logging)
        scene_data = {
            "scene_name": name,
            "scene_type": stype,
            "description": s.get("description", ""),
            "ambient": {
                "lighting": lighting,
                "weather": "clear",
            },
            "spawn_points": [
                {
                    "id": "default",
                    "label": "Default Spawn",
                    "position": spawn,
                    "type": "player",
                }
            ],
            "game_id": game_id,
            "created_by": platform_id or "kinship-ai",
        }

        # Payload sent to kinship-assets — only fields accepted by CreateSceneSchema
        assets_payload = {
            "scene_name": name,
            "scene_type": stype,
            "description": s.get("description", ""),
            "ambient": {
                "lighting": lighting,
                "weather": "clear",
            },
            "spawn_points": [
                {
                    "id": "default",
                    "label": "Default Spawn",
                    "position": spawn,
                    "type": "player",
                }
            ],
            "game_id": game_id,
            "created_by": platform_id or "kinship-ai",
        }

        if name in existing_scene_map:
            scene_id = existing_scene_map[name].get("id")
            try:
                print("========================= CHECK 12 =========================")
                await assets_client.update_scene(scene_id, assets_payload)
                synced["scenes"]["updated"].append({"id": scene_id, "name": name})
                print("========================= CHECK 13 =========================")
            except Exception as e:
                print("========================= CHECK 14 =========================")
                logger.warning(f"Update scene failed: {e}")
            scene_name_to_id[name] = scene_id
        else:
            print("========================= CHECK 15 =========================")
            try:
                print("========================= CHECK 16 =========================")
                scene = await assets_client.create_scene(assets_payload)
                scene_id = scene.get("id", "")
                synced["scenes"]["created"].append({"id": scene_id, "name": name})
                scene_name_to_id[name] = scene_id
                print("========================= CHECK 17 =========================")
            except Exception as e:
                print("========================= CHECK 18 =========================")
                logger.error(f"Create scene failed: {e}")
                continue

        scene_id = scene_name_to_id.get(name)

        print("========================= CHECK 19 =========================")
        if not scene_id:
            print("========================= CHECK 20 =========================")
            continue

        # NOTE: Manifest upload moved to second pass after all scenes are created
        # This ensures scene_name_to_id is complete for route enrichment

        # Sync actors
        result = await db.execute(select(Actor).where(Actor.scene_id == scene_id))
        existing_actors = {a.name: a for a in result.scalars().all()}
        plan_actor_names = {a.get("name") for a in s.get("actors", []) if a.get("name")}
        print("========================= CHECK 27 =========================")

        for actor_data in s.get("actors", []):
            print("========================= CHECK 28 =========================")
            aname = actor_data.get("name", "")
            if not aname:
                print("========================= CHECK 29 =========================")
                continue
            behavior = actor_data.get("behavior", {})
            dialogue = actor_data.get("dialogue", {})
            print("========================= CHECK 30 =========================")

            if aname in existing_actors:
                print("========================= CHECK 31 =========================")
                actor = existing_actors[aname]
                actor.actor_type = actor_data.get("actor_type", "character")
                actor.role = actor_data.get("role")
                actor.facet = actor_data.get("facet")
                actor.greeting = dialogue.get(
                    "greeting", actor_data.get("greeting", "")
                )
                actor.dialogue_tree = dialogue.get("tree", [])
                actor.movement_pattern = behavior.get("movement", {})
                actor.behavior_config = behavior
                actor.spawn_config = {
                    "position": actor_data.get("position", {"x": 8, "y": 10}),
                    "z_layer": "objects",
                }
                synced["actors"]["updated"].append(
                    {"id": str(actor.id), "name": aname, "scene": name}
                )
                print("========================= CHECK 32 =========================")
            else:
                actor = Actor(
                    name=aname,
                    actor_type=actor_data.get("actor_type", "character"),
                    role=actor_data.get("role"),
                    facet=actor_data.get("facet"),
                    greeting=dialogue.get("greeting", actor_data.get("greeting", "")),
                    dialogue_tree=dialogue.get("tree", []),
                    movement_pattern=behavior.get("movement", {}),
                    behavior_config=behavior,
                    spawn_config={
                        "position": actor_data.get("position", {"x": 8, "y": 10}),
                        "z_layer": "objects",
                    },
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                print("========================= CHECK 33 =========================")
                db.add(actor)
                await db.flush()
                synced["actors"]["created"].append(
                    {"id": str(actor.id), "name": aname, "scene": name}
                )
                print("========================= CHECK 34 =========================")

        for aname, actor in existing_actors.items():
            print("========================= CHECK 35 =========================")
            if aname not in plan_actor_names:
                print("========================= CHECK 36 =========================")
                await db.delete(actor)
                synced["actors"]["deleted"].append({"id": str(actor.id), "name": aname})
                print("========================= CHECK 37 =========================")

        # Sync challenges
        result = await db.execute(
            select(Challenge).where(Challenge.scene_id == scene_id)
        )
        existing_ch = {c.name: c for c in result.scalars().all()}
        plan_ch_names = {
            c.get("name") for c in s.get("challenges", []) if c.get("name")
        }
        print("========================= CHECK 38 =========================")

        for ch_data in s.get("challenges", []):
            cname = ch_data.get("name", "")
            if not cname:
                continue

            if cname in existing_ch:
                ch = existing_ch[cname]
                ch.description = ch_data.get("description", "")
                ch.mechanic_type = ch_data.get("mechanic_type", "exploration")
                ch.difficulty = ch_data.get("difficulty", "medium")
                ch.facets = ch_data.get("facets", [])
                ch.correct_answers = _normalize_correct_answers(
                    ch_data.get("success_conditions", [])
                )
                ch.hints = (
                    list(ch_data.get("guidance", {}).values())[:3]
                    if ch_data.get("guidance")
                    else []
                )
                ch.feedback = {
                    "correct": ch_data.get("on_complete", {}).get(
                        "show_message", "Complete!"
                    )
                }
                ch.scoring_rubric = ch_data.get("on_complete", {})
                synced["challenges"]["updated"].append(
                    {"id": str(ch.id), "name": cname, "scene": name}
                )
            else:
                ch = Challenge(
                    name=cname,
                    description=ch_data.get("description", ""),
                    mechanic_type=ch_data.get("mechanic_type", "exploration"),
                    difficulty=ch_data.get("difficulty", "medium"),
                    facets=ch_data.get("facets", []),
                    correct_answers=_normalize_correct_answers(
                        ch_data.get("success_conditions", [])
                    ),
                    hints=(
                        list(ch_data.get("guidance", {}).values())[:3]
                        if ch_data.get("guidance")
                        else []
                    ),
                    feedback={
                        "correct": ch_data.get("on_complete", {}).get(
                            "show_message", "Complete!"
                        )
                    },
                    scoring_rubric=ch_data.get("on_complete", {}),
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                db.add(ch)
                await db.flush()
                synced["challenges"]["created"].append(
                    {"id": str(ch.id), "name": cname, "scene": name}
                )

        for cname, ch in existing_ch.items():
            if cname not in plan_ch_names:
                await db.delete(ch)
                synced["challenges"]["deleted"].append(
                    {"id": str(ch.id), "name": cname}
                )

        # Sync quests
        result = await db.execute(select(Quest).where(Quest.scene_id == scene_id))
        existing_quests = {q.name: q for q in result.scalars().all()}
        plan_quest_names = {q.get("name") for q in s.get("quests", []) if q.get("name")}

        for iq, q_data in enumerate(s.get("quests", [])):
            qname = q_data.get("name", "")
            if not qname:
                continue

            if qname in existing_quests:
                quest = existing_quests[qname]
                quest.description = q_data.get("description", "")
                quest.beat_type = q_data.get("beat_type", "Exploration")
                quest.facet = q_data.get("facet")
                quest.completion_conditions = {
                    "objectives": q_data.get("objectives", [])
                }
                quest.rewards = q_data.get("on_complete", {})
                synced["quests"]["updated"].append({"id": str(quest.id), "name": qname})
            else:
                quest = Quest(
                    name=qname,
                    description=q_data.get("description", ""),
                    beat_type=q_data.get("beat_type", "Exploration"),
                    facet=q_data.get("facet"),
                    sequence_order=iq + 1,
                    narrative_content=json.dumps(q_data.get("narrative", {})),
                    completion_conditions={"objectives": q_data.get("objectives", [])},
                    rewards=q_data.get("on_complete", {}),
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                db.add(quest)
                await db.flush()
                synced["quests"]["created"].append({"id": str(quest.id), "name": qname})

        for qname, quest in existing_quests.items():
            if qname not in plan_quest_names:
                await db.delete(quest)
                synced["quests"]["deleted"].append({"id": str(quest.id), "name": qname})

    # Delete removed scenes
    for name, existing in existing_scene_map.items():
        if name not in plan_scene_names:
            try:
                sid = existing.get("id")
                await db.execute(delete(Actor).where(Actor.scene_id == sid))
                await db.execute(delete(Challenge).where(Challenge.scene_id == sid))
                await db.execute(delete(Quest).where(Quest.scene_id == sid))
                await assets_client.delete_scene(sid)
                synced["scenes"]["deleted"].append({"id": sid, "name": name})
            except:
                pass

    # ═══════════════════════════════════════════════════════════════════════════
    # SECOND PASS: Upload manifests with routes enriched with scene IDs
    # Now that ALL scenes exist, scene_name_to_id is complete
    # ═══════════════════════════════════════════════════════════════════════════

    if has_assets:
        logger.info("Second pass: uploading manifests with enriched routes...")

        for i, s in enumerate(plan_scenes):
            name = s.get("scene_name", f"Scene {i+1}")
            scene_id = scene_name_to_id.get(name)

            if not scene_id:
                logger.warning(f"Skipping manifest for {name}: no scene_id")
                continue

            stype = s.get("scene_type", "adventure")
            lighting = s.get("lighting", "day")
            if lighting not in LIGHTING:
                lighting = "day"

            try:
                facets = [a.get("facet", "E") for a in s.get("actors", [])]
                placements, spawns, zones = await generate_scene_layout(
                    scene_name=name,
                    scene_type=stype,
                    description=s.get("description", ""),
                    mood=s.get("mood", ""),
                    lighting=lighting,
                    target_facets=facets or ["E"],
                    catalog=catalog,
                    catalog_by_name=catalog_by_name,
                )

                if placements:
                    # Get routes for this scene and ENRICH with scene IDs
                    plan_routes_for_scene = [
                        r for r in plan_routes if r.get("from_scene_name") == name
                    ]
                    enriched_routes = enrich_routes_with_scene_ids(
                        plan_routes_for_scene, scene_name_to_id
                    )

                    await upload_scene_manifest(
                        scene_id=scene_id,
                        scene_name=name,
                        scene_type=stype,
                        description=s.get("description", ""),
                        lighting=lighting,
                        asset_placements=placements,
                        spawn_points=spawns,
                        zone_descriptions=zones,
                        actors=s.get("actors", []),
                        challenges=s.get("challenges", []),
                        quests=s.get("quests", []),
                        routes=enriched_routes,  # Routes now have scene IDs!
                    )
                    logger.info(
                        f"Manifest uploaded for '{name}' with {len(enriched_routes)} enriched routes"
                    )
            except Exception as e:
                logger.warning(f"Manifest upload error for {name}: {e}")

    # Sync routes
    result = await db.execute(select(Route).where(Route.game_id == game_id))
    existing_routes = result.scalars().all()
    existing_route_map = {}
    for r in existing_routes:
        from_name = next(
            (n for n, sid in scene_name_to_id.items() if sid == str(r.from_scene)), None
        )
        to_name = next(
            (n for n, sid in scene_name_to_id.items() if sid == str(r.to_scene)), None
        )
        if from_name and to_name:
            existing_route_map[f"{from_name}→{to_name}"] = r

    plan_route_keys = set()
    for r in plan_routes:
        from_name, to_name = r.get("from_scene_name", ""), r.get("to_scene_name", "")
        from_id, to_id = scene_name_to_id.get(from_name), scene_name_to_id.get(to_name)
        if not from_id or not to_id:
            continue
        key = f"{from_name}→{to_name}"
        plan_route_keys.add(key)
        trigger = r.get("trigger", {})

        if key in existing_route_map:
            route = existing_route_map[key]
            route.trigger_type = (
                trigger.get("type", "zone_enter")
                if isinstance(trigger, dict)
                else "zone_enter"
            )
            route.trigger_value = (
                json.dumps(trigger.get("zone", {})) if isinstance(trigger, dict) else ""
            )
            route.conditions = r.get("conditions", [])
            route.bidirectional = r.get("bidirectional", False)
            synced["routes"]["updated"].append(
                {"id": str(route.id), "from": from_name, "to": to_name}
            )
        else:
            route = Route(
                name=r.get("name", f"{from_name} → {to_name}"),
                game_id=game_id,
                from_scene=from_id,
                to_scene=to_id,
                trigger_type=(
                    trigger.get("type", "zone_enter")
                    if isinstance(trigger, dict)
                    else "zone_enter"
                ),
                trigger_value=(
                    json.dumps(trigger.get("zone", {}))
                    if isinstance(trigger, dict)
                    else ""
                ),
                conditions=r.get("conditions", []),
                bidirectional=r.get("bidirectional", False),
                status="draft",
            )
            db.add(route)
            await db.flush()
            synced["routes"]["created"].append(
                {"id": str(route.id), "from": from_name, "to": to_name}
            )

    for key, route in existing_route_map.items():
        if key not in plan_route_keys:
            await db.delete(route)
            synced["routes"]["deleted"].append({"id": str(route.id), "route": key})

    await db.commit()
    return synced, scene_name_to_id


def attach_ids_to_plan(plan: dict, scene_map: dict, synced: dict) -> dict:
    """Attach real IDs to plan."""
    actor_map = {}
    ch_map = {}
    quest_map = {}
    for cat in ["created", "updated"]:
        for a in synced["actors"].get(cat, []):
            actor_map[a["name"]] = a["id"]
        for c in synced["challenges"].get(cat, []):
            ch_map[c["name"]] = c["id"]
        for q in synced["quests"].get(cat, []):
            quest_map[q["name"]] = q["id"]

    for scene in plan.get("scenes", []):
        scene["id"] = scene_map.get(scene.get("scene_name"))
        for a in scene.get("actors", []):
            a["id"] = actor_map.get(a.get("name"))
        for c in scene.get("challenges", []):
            c["id"] = ch_map.get(c.get("name"))
        for q in scene.get("quests", []):
            q["id"] = quest_map.get(q.get("name"))
    for r in plan.get("routes", []):
        r["from_scene_id"] = scene_map.get(r.get("from_scene_name"))
        r["to_scene_id"] = scene_map.get(r.get("to_scene_name"))
    return plan


# ═══════════════════════════════════════════════════════════════════════════════
#  CONFIRM ENDPOINT (Legacy - kept for backward compatibility)
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/api/games/plan/confirm", response_model=PlanConfirmResponse)
async def plan_confirm(body: PlanConfirmRequest, db: AsyncSession = Depends(get_db)):
    """Create game entities from finalized plan (legacy endpoint).

    NOTE: With auto-save in converse, this is optional.
    Kept for achievements/leaderboards creation and backward compatibility.
    """
    from app.db.models import Actor, Challenge, Quest, Route
    from app.db.achievement_models import (
        Achievement,
        AchievementTier,
        AchievementType,
        TriggerEvent,
    )
    from app.db.leaderboard_models import LeaderboardConfig, LeaderboardType

    plan = body.plan
    game_id = body.game_id
    scenes = plan.get("scenes", [])
    routes = plan.get("routes", [])
    achievements_data = plan.get("achievements", [])
    leaderboards_data = plan.get("leaderboards", [])

    if not scenes:
        raise HTTPException(400, "No scenes in plan")

    created = {
        "scenes": [],
        "actors": [],
        "challenges": [],
        "quests": [],
        "routes": [],
        "achievements": [],
        "leaderboards": [],
    }
    scene_id_map = {}
    LIGHTING = {"day", "night", "dawn", "dusk"}

    catalog, catalog_by_name = await load_asset_catalog()
    has_assets = len(catalog) > 0
    starting_scene_id = None
    quest_order = 1

    TIER_MAP = {
        "bronze": AchievementTier.BRONZE,
        "silver": AchievementTier.SILVER,
        "gold": AchievementTier.GOLD,
        "diamond": AchievementTier.DIAMOND,
        "special": AchievementTier.SPECIAL,
    }
    TYPE_MAP = {
        "progress": AchievementType.PROGRESS,
        "milestone": AchievementType.MILESTONE,
        "collection": AchievementType.COLLECTION,
        "streak": AchievementType.STREAK,
        "speed": AchievementType.SPEED,
        "secret": AchievementType.SECRET,
        "hearts": AchievementType.HEARTS,
        "custom": AchievementType.CUSTOM,
    }
    TRIGGER_MAP = {
        "challenge_complete": TriggerEvent.CHALLENGE_COMPLETE,
        "challenge_fail": TriggerEvent.CHALLENGE_FAIL,
        "quest_complete": TriggerEvent.QUEST_COMPLETE,
        "quest_start": TriggerEvent.QUEST_START,
        "scene_enter": TriggerEvent.SCENE_ENTER,
        "collectible_pickup": TriggerEvent.COLLECTIBLE_PICKUP,
        "npc_interact": TriggerEvent.NPC_INTERACT,
        "hearts_change": TriggerEvent.HEARTS_CHANGE,
        "game_complete": TriggerEvent.GAME_COMPLETE,
        "daily_login": TriggerEvent.DAILY_LOGIN,
        "score_update": TriggerEvent.SCORE_UPDATE,
        "custom": TriggerEvent.CUSTOM,
    }
    LEADERBOARD_TYPE_MAP = {
        "total_score": LeaderboardType.TOTAL_SCORE,
        "challenges_completed": LeaderboardType.CHALLENGES_COMPLETED,
        "quests_completed": LeaderboardType.QUESTS_COMPLETED,
        "collectibles_found": LeaderboardType.COLLECTIBLES_FOUND,
        "time_played": LeaderboardType.TIME_PLAYED,
        "hearts_facet": LeaderboardType.HEARTS_FACET,
        "hearts_total": LeaderboardType.HEARTS_TOTAL,
        "achievements": LeaderboardType.ACHIEVEMENTS,
        "custom": LeaderboardType.CUSTOM,
    }

    try:
        for i, s in enumerate(scenes):
            name = s.get("scene_name", f"Scene {i+1}")
            stype = s.get("scene_type", "generic")
            lighting = s.get("lighting", "day")
            if lighting not in LIGHTING:
                lighting = "day"

            layout = s.get("layout", {})
            spawn = layout.get("player_spawn", {"x": 8, "y": 14})

            scene_data = {
                "scene_name": name,
                "scene_type": stype,
                "description": s.get("description", ""),
                "ambient": {
                    "lighting": lighting,
                    "weather": "clear",
                    "mood": s.get("mood", ""),
                },
                "spawn_points": [
                    {"id": "default", "position": spawn, "type": "player"}
                ],
                "game_id": game_id,
                "platform_id": body.platform_id,
                "metadata": {
                    "layout": layout,
                    "learning_focus": s.get("learning_focus", ""),
                },
            }

            scene = await assets_client.create_scene(scene_data)
            scene_id = scene.get("id", "")
            scene_id_map[name] = scene_id

            if i == 0:
                starting_scene_id = scene_id

            created["scenes"].append({"id": scene_id, "name": name})

            # NOTE: Manifest upload moved to second pass after all scenes are created
            # This ensures scene_id_map is complete for route enrichment

            for a in s.get("actors", []):
                behavior = a.get("behavior", {})
                dialogue = a.get("dialogue", {})
                actor = Actor(
                    name=a.get("name", "Actor"),
                    actor_type=a.get("actor_type", "character"),
                    role=a.get("role"),
                    facet=a.get("facet"),
                    greeting=dialogue.get("greeting", ""),
                    dialogue_tree=dialogue.get("tree", []),
                    movement_pattern=behavior.get("movement", {}),
                    behavior_config=behavior,
                    spawn_config={
                        "position": a.get("position", {}),
                        "z_layer": a.get("z_layer", "objects"),
                    },
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                db.add(actor)
                await db.flush()
                created["actors"].append({"id": str(actor.id), "name": actor.name})

            for c in s.get("challenges", []):
                ch = Challenge(
                    name=c.get("name", "Challenge"),
                    description=c.get("description", ""),
                    mechanic_type=c.get("mechanic_type", "exploration"),
                    difficulty=c.get("difficulty", "medium"),
                    facets=c.get("facets", []),
                    correct_answers=_normalize_correct_answers(
                        c.get("success_conditions", [])
                    ),
                    hints=(
                        list(c.get("guidance", {}).values())[:3]
                        if c.get("guidance")
                        else []
                    ),
                    feedback={
                        "correct": c.get("on_complete", {}).get(
                            "show_message", "Complete!"
                        )
                    },
                    scoring_rubric=c.get("on_complete", {}),
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                db.add(ch)
                await db.flush()
                created["challenges"].append({"id": str(ch.id), "name": ch.name})

            for q in s.get("quests", []):
                quest = Quest(
                    name=q.get("name", "Quest"),
                    description=q.get("description", ""),
                    beat_type=q.get("beat_type", "Exploration"),
                    facet=q.get("facet"),
                    sequence_order=quest_order,
                    narrative_content=json.dumps(q.get("narrative", {})),
                    completion_conditions={"objectives": q.get("objectives", [])},
                    rewards=q.get("on_complete", {}),
                    game_id=game_id,
                    scene_id=scene_id,
                    status="draft",
                )
                db.add(quest)
                await db.flush()
                created["quests"].append({"id": str(quest.id), "name": quest.name})
                quest_order += 1

        # ═══════════════════════════════════════════════════════════════════════════
        # SECOND PASS: Upload manifests with routes enriched with scene IDs
        # Now that ALL scenes exist, scene_id_map is complete
        # ═══════════════════════════════════════════════════════════════════════════

        if has_assets:
            logger.info("Second pass: uploading manifests with enriched routes...")

            for i, s in enumerate(scenes):
                name = s.get("scene_name", f"Scene {i+1}")
                scene_id = scene_id_map.get(name)

                if not scene_id:
                    logger.warning(f"Skipping manifest for {name}: no scene_id")
                    continue

                stype = s.get("scene_type", "generic")
                lighting = s.get("lighting", "day")
                if lighting not in LIGHTING:
                    lighting = "day"

                try:
                    facets = [a.get("facet", "E") for a in s.get("actors", [])]
                    placements, spawns, zones = await generate_scene_layout(
                        scene_name=name,
                        scene_type=stype,
                        description=s.get("description", ""),
                        mood=s.get("mood", ""),
                        lighting=lighting,
                        target_facets=facets or ["E"],
                        catalog=catalog,
                        catalog_by_name=catalog_by_name,
                    )

                    if placements:
                        # Get routes for this scene and ENRICH with scene IDs
                        plan_routes_for_scene = [
                            r for r in routes if r.get("from_scene_name") == name
                        ]
                        enriched_routes = enrich_routes_with_scene_ids(
                            plan_routes_for_scene, scene_id_map
                        )

                        await upload_scene_manifest(
                            scene_id=scene_id,
                            scene_name=name,
                            scene_type=stype,
                            description=s.get("description", ""),
                            lighting=lighting,
                            asset_placements=placements,
                            spawn_points=spawns,
                            zone_descriptions=zones,
                            actors=s.get("actors", []),
                            challenges=s.get("challenges", []),
                            quests=s.get("quests", []),
                            routes=enriched_routes,  # Routes now have scene IDs!
                        )
                        logger.info(
                            f"Manifest uploaded for '{name}' with {len(enriched_routes)} enriched routes"
                        )
                except Exception as e:
                    logger.warning(f"Manifest upload error for {name}: {e}")

        for r in routes:
            from_id = scene_id_map.get(r.get("from_scene_name", ""))
            to_id = scene_id_map.get(r.get("to_scene_name", ""))
            if not from_id or not to_id:
                continue

            trigger = r.get("trigger", {})
            route = Route(
                name=r.get("name", ""),
                game_id=game_id,
                from_scene=from_id,
                to_scene=to_id,
                trigger_type=(
                    trigger.get("type", "zone_enter")
                    if isinstance(trigger, dict)
                    else str(trigger)
                ),
                trigger_value=(
                    json.dumps(trigger.get("zone", {}))
                    if isinstance(trigger, dict)
                    else ""
                ),
                conditions=r.get("conditions", []),
                bidirectional=r.get("bidirectional", False),
                status="draft",
            )
            db.add(route)
            await db.flush()
            created["routes"].append({"id": str(route.id), "name": route.name})

        for i, ach in enumerate(achievements_data):
            trigger = ach.get("trigger", {})
            rewards = ach.get("rewards", {})
            achievement = Achievement(
                game_id=game_id,
                name=ach.get("name", f"Achievement {i+1}"),
                description=ach.get("description", ""),
                hint=ach.get("hint"),
                icon=ach.get("icon", "🏅"),
                tier=TIER_MAP.get(ach.get("tier", "bronze"), AchievementTier.BRONZE),
                achievement_type=TYPE_MAP.get(
                    ach.get("type", "progress"), AchievementType.PROGRESS
                ),
                category=ach.get("category"),
                sort_order=i,
                is_enabled=True,
                is_secret=ach.get("is_secret", False),
                xp_reward=rewards.get("xp", 0),
                points_reward=rewards.get("points", 0),
                trigger_event=TRIGGER_MAP.get(
                    trigger.get("event", "custom"), TriggerEvent.CUSTOM
                ),
                trigger_conditions=trigger.get("conditions"),
                requires_progress=ach.get("progress_max", 1) > 1,
                progress_max=ach.get("progress_max", 1),
                progress_unit=ach.get("progress_unit"),
            )
            db.add(achievement)
            await db.flush()
            created["achievements"].append(
                {
                    "id": str(achievement.id),
                    "name": achievement.name,
                    "tier": ach.get("tier", "bronze"),
                }
            )

        for i, lb in enumerate(leaderboards_data):
            periods = lb.get("periods", ["all_time"])
            leaderboard = LeaderboardConfig(
                game_id=game_id,
                name=lb.get("name", f"Leaderboard {i+1}"),
                description=lb.get("description"),
                leaderboard_type=LEADERBOARD_TYPE_MAP.get(
                    lb.get("type", "total_score"), LeaderboardType.TOTAL_SCORE
                ),
                hearts_facet=lb.get("hearts_facet"),
                is_enabled=True,
                is_public=lb.get("is_public", True),
                show_rank=True,
                show_score=True,
                enable_all_time="all_time" in periods,
                enable_daily="daily" in periods,
                enable_weekly="weekly" in periods,
                enable_monthly="monthly" in periods,
            )
            db.add(leaderboard)
            await db.flush()
            created["leaderboards"].append(
                {
                    "id": str(leaderboard.id),
                    "name": leaderboard.name,
                    "type": lb.get("type", "total_score"),
                }
            )

        await db.commit()
        nav = generate_navigation_guide(plan)
        warnings = []
        if not has_assets:
            warnings.append("No assets available - scenes created without visuals")
        if created["actors"]:
            warnings.append("Assign sprites to actors in the editor")

        return PlanConfirmResponse(
            success=True,
            created=created,
            starting_scene_id=starting_scene_id,
            warnings=warnings,
            navigation_guide=nav.dict() if nav else None,
            rewards_summary=(
                {
                    "achievements_count": len(created["achievements"]),
                    "leaderboards_count": len(created["leaderboards"]),
                }
                if achievements_data or leaderboards_data
                else None
            ),
        )

    except Exception as e:
        await db.rollback()
        logger.error(f"Confirm error: {e}")
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  CLEAR ENDPOINT (NEW)
# ═══════════════════════════════════════════════════════════════════════════════


@router.delete("/api/games/plan/clear")
async def plan_clear(body: PlanClearRequest, db: AsyncSession = Depends(get_db)):
    """Clear all game content to start fresh."""
    from app.db.models import Actor, Challenge, Quest, Route

    try:
        await db.execute(delete(Route).where(Route.game_id == body.game_id))
        await db.execute(delete(Quest).where(Quest.game_id == body.game_id))
        await db.execute(delete(Actor).where(Actor.game_id == body.game_id))
        await db.execute(delete(Challenge).where(Challenge.game_id == body.game_id))
        try:
            scenes = await assets_client.list_scenes(game_id=body.game_id)
            for s in scenes:
                await assets_client.delete_scene(s.get("id"))
        except:
            pass
        await db.commit()
        return {"success": True}
    except Exception as e:
        await db.rollback()
        raise HTTPException(500, str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  PREVIEW ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/api/games/plan/preview", response_model=PlanPreviewResponse)
async def plan_preview(body: PlanPreviewRequest):
    """Generate preview without saving."""
    scenes = await generate_preview_scenes(body.plan)
    return PlanPreviewResponse(scenes=scenes, warnings=[] if scenes else ["No scenes"])
