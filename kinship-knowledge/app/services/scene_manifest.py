"""Scene Manifest Service — generates visual layouts and uploads manifests for scenes.

Shared by game_plan.py (auto-generates visuals for planned scenes) and scene_gen.py.

Flow:
  1. load_asset_catalog()        → fetch all assets from kinship-assets
  2. generate_scene_layout()     → AI designs tile + object placement using Pinecone-retrieved assets
  3. upload_scene_manifest()     → upload JSON to GCS, update scene tile_map_url

FULLY GENERIC: All layout decisions are made by AI based on:
- User's original prompt (passed through goal_description)
- Relevant assets from Pinecone semantic search
- Scene description, type, mood, lighting from the game plan
- Available assets from catalog with their metadata

The AI interprets the user's prompt and decides what type of scene to create
and which assets to use. No hardcoded interpretations.
"""

import json
import logging
from typing import Optional

from app.services.claude_client import invoke_claude, parse_json_response
from app.services import assets_client
from app.services.asset_embeddings import retrieve_relevant_assets

logger = logging.getLogger(__name__)


LAYOUT_SYSTEM_PROMPT = """You are a world-class isometric game designer for Kinship, an emotional wellbeing 
app. The game uses isometric scenes rendered with Flutter/Flame engine on a tile grid.

The HEARTS framework measures 7 facets of emotional wellbeing:
- H (Honesty), E (Empowerment), A (Autonomy), R (Respect), T (Tenacity), Si (Silence), So (Solidarity)

You must respond ONLY with valid JSON (no markdown fences, no commentary outside JSON)."""


async def load_asset_catalog() -> tuple[list[dict], dict]:
    """Fetch all available assets from kinship-assets.

    Returns:
        (catalog_list, catalog_by_name) — full catalog and name-indexed lookup
    """
    catalog = []

    try:
        all_assets = await assets_client.fetch_all_assets()
        logger.info(f"Asset catalog: {len(all_assets)} assets loaded")

        for a in all_assets:
            if not isinstance(a, dict):
                continue

            asset_id = a.get("id", "")
            meta = a.get("metadata", {})
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except (json.JSONDecodeError, TypeError):
                    meta = {}
            if not isinstance(meta, dict):
                meta = {}

            # Load asset knowledge for placement rules
            knowledge = a.get("knowledge", {})
            if isinstance(knowledge, str):
                try:
                    knowledge = json.loads(knowledge)
                except (json.JSONDecodeError, TypeError):
                    knowledge = {}
            if not isinstance(knowledge, dict):
                knowledge = {}

            tags = a.get("tags", [])
            if isinstance(tags, str):
                try:
                    tags = json.loads(tags)
                except (json.JSONDecodeError, TypeError):
                    tags = [t.strip() for t in tags.split(",") if t.strip()]

            aoe = meta.get("aoe", {}) or {}
            hitbox = meta.get("hitbox", {}) or {}
            hearts = meta.get("hearts_mapping", {}) or {}
            spawn = meta.get("spawn", {}) or {}
            interaction = meta.get("interaction", {}) or {}

            # Get render_scale from metadata, default to 1.0
            render_scale = meta.get("render_scale", 1.0)

            # Parse affordances to check if collectible
            affordances = knowledge.get("affordances", [])
            if isinstance(affordances, str):
                affordances = (
                    affordances.strip("{}").split(",")
                    if affordances.strip("{}")
                    else []
                )

            # Smart scaling: collectibles should be smaller (0.4-0.6)
            # unless explicitly set in metadata
            if render_scale == 1.0 and "collect" in affordances:
                render_scale = 0.5  # Default scale for collectibles

            catalog.append(
                {
                    "id": asset_id,
                    "name": a.get("name", ""),
                    "display_name": a.get("display_name", a.get("name", "")),
                    "type": a.get("type", "object"),
                    "file_url": a.get("file_url", ""),
                    "tags": tags,
                    "facet": hearts.get("primary_facet"),
                    "aoe": aoe,
                    "hitbox": hitbox,
                    "hearts_mapping": hearts,
                    "interaction": interaction,
                    "layer": spawn.get("default_layer", "objects"),
                    "z_index": spawn.get("default_z_index", 1),
                    "movement": meta.get("movement", {}),
                    "sprite_sheet": meta.get("sprite_sheet", {}),
                    "tile_config": meta.get("tile_config", {}),
                    "render_scale": render_scale,  # Added render_scale
                    # Include knowledge for placement rules
                    "knowledge": knowledge,
                    "placement_hint": knowledge.get("placement_hint", ""),
                    "avoid_near": knowledge.get("avoid_near", []),
                    "pair_with": knowledge.get("pair_with", []),
                    "scene_role": knowledge.get("scene_role", ""),
                    "suitable_scenes": knowledge.get("suitable_scenes", []),
                    "affordances": affordances,  # Already parsed
                    "visual_description": knowledge.get("visual_description", ""),
                }
            )
    except Exception as e:
        logger.error(f"Failed to load asset catalog: {e}")

    catalog_by_name = {a["name"]: a for a in catalog}
    return catalog, catalog_by_name


def _build_placement_metadata(cat: dict) -> dict:
    """Build metadata dict for a placement from catalog entry."""
    meta = {"asset_type": cat.get("type", "object")}

    # Include render_scale in metadata for Flutter
    render_scale = cat.get("render_scale", 1.0)
    if render_scale != 1.0:
        meta["render_scale"] = render_scale

    ss = cat.get("sprite_sheet", {})
    if isinstance(ss, dict) and ss.get("frame_width"):
        meta["sprite_sheet"] = ss

    tc = cat.get("tile_config", {})
    if isinstance(tc, dict) and tc:
        meta["tile_config"] = tc

    mv = cat.get("movement", {})
    if isinstance(mv, dict) and mv:
        meta["movement"] = mv

    hearts = cat.get("hearts_mapping", {})
    if isinstance(hearts, dict) and hearts.get("primary_facet"):
        meta["hearts_mapping"] = hearts

    # Include hitbox for collision detection
    hitbox = cat.get("hitbox", {})
    if isinstance(hitbox, dict) and hitbox:
        meta["hitbox"] = hitbox

    return meta


def _format_asset_for_ai(asset: dict) -> str:
    """Format asset with all its knowledge for AI consumption."""
    lines = [f"  • {asset['name']}"]

    # HEARTS facet
    if asset.get("facet"):
        delta = asset.get("hearts_mapping", {}).get("base_delta", 0)
        lines.append(f"    hearts_facet: {asset['facet']} (delta: {delta})")

    # Interaction
    interaction = asset.get("interaction", {})
    if interaction.get("type", "none") != "none":
        lines.append(f"    interaction: {interaction['type']}")

    # Knowledge-based metadata
    knowledge = asset.get("knowledge", {})

    scene_role = asset.get("scene_role") or knowledge.get("scene_role", "")
    if scene_role:
        lines.append(f"    scene_role: {scene_role}")

    placement_hint = asset.get("placement_hint") or knowledge.get("placement_hint", "")
    if placement_hint:
        lines.append(f"    placement_hint: {placement_hint}")

    # Affordances - important for matching assets to game goals
    affordances = asset.get("affordances") or knowledge.get("affordances", [])
    if affordances:
        if isinstance(affordances, str):
            # Parse PostgreSQL array format {a,b,c}
            affordances = (
                affordances.strip("{}").split(",") if affordances.strip("{}") else []
            )
        if affordances:
            lines.append(f"    affordances: {', '.join(affordances)}")

    suitable_scenes = asset.get("suitable_scenes") or knowledge.get(
        "suitable_scenes", []
    )
    if suitable_scenes:
        if isinstance(suitable_scenes, str):
            suitable_scenes = (
                suitable_scenes.strip("{}").split(",")
                if suitable_scenes.strip("{}")
                else []
            )
        if suitable_scenes:
            lines.append(f"    suitable_for: {', '.join(suitable_scenes)}")

    avoid_near = asset.get("avoid_near") or knowledge.get("avoid_near", [])
    if avoid_near:
        if isinstance(avoid_near, str):
            avoid_near = (
                avoid_near.strip("{}").split(",") if avoid_near.strip("{}") else []
            )
        if avoid_near:
            lines.append(f"    avoid_near: {', '.join(avoid_near)}")

    pair_with = asset.get("pair_with") or knowledge.get("pair_with", [])
    if pair_with:
        if isinstance(pair_with, str):
            pair_with = (
                pair_with.strip("{}").split(",") if pair_with.strip("{}") else []
            )
        if pair_with:
            lines.append(f"    pair_with: {', '.join(pair_with)}")

    # Visual description for context
    visual_desc = asset.get("visual_description") or knowledge.get(
        "visual_description", ""
    )
    if visual_desc:
        # Truncate long descriptions
        if len(visual_desc) > 100:
            visual_desc = visual_desc[:97] + "..."
        lines.append(f"    description: {visual_desc}")

    # Hitbox for spacing info
    hitbox = asset.get("hitbox", {})
    if hitbox and (hitbox.get("width", 1) > 1 or hitbox.get("height", 1) > 1):
        lines.append(f"    size: {hitbox.get('width', 1)}x{hitbox.get('height', 1)}")

    return "\n".join(lines)


async def generate_scene_layout(
    scene_name: str,
    scene_type: str,
    description: str,
    mood: str,
    lighting: str,
    target_facets: list[str],
    catalog: list[dict],
    catalog_by_name: dict,
    width: int = 16,
    height: int = 16,
    scene_index: int = 0,
    total_scenes: int = 1,
    previous_focal_points: list[str] = None,
    goal_type: str = "",
    goal_description: str = "",
    platform_id: str = "",
    challenges: list[dict] = None,
) -> tuple[list[dict], list[dict], list[dict]]:
    """AI generates tile layout + object placements for a scene.

    Returns (asset_placements, spawn_points, zone_descriptions).

    FULLY GENERIC: The AI decides ALL layout based on:
    - User's original prompt (goal_description) - AI interprets what to create
    - Relevant assets from Pinecone semantic search based on user's prompt
    - Scene description, type, mood, lighting from the game plan
    - Full asset catalog with metadata
    - Challenge requirements (e.g., place N collectibles for collection challenges)

    No hardcoded interpretations - AI decides what the user wants.
    """
    if previous_focal_points is None:
        previous_focal_points = []
    if challenges is None:
        challenges = []

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 1: Use Pinecone to find relevant assets based on user's prompt
    # ═══════════════════════════════════════════════════════════════════════════

    relevant_assets = []
    relevant_names = set()

    if goal_description:
        try:
            # Semantic search for assets matching user's request
            relevant_assets = await retrieve_relevant_assets(
                context=goal_description,
                top_k=20,
                platform_id=platform_id if platform_id else None,
            )
            relevant_names = {
                a.get("name", "") for a in relevant_assets if a.get("name")
            }
            logger.info(
                f"Pinecone returned {len(relevant_assets)} relevant assets: {list(relevant_names)[:5]}..."
            )
        except Exception as e:
            logger.warning(f"Pinecone retrieval failed: {e}. Will use full catalog.")

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 2: Build asset lists from catalog
    # ═══════════════════════════════════════════════════════════════════════════

    tile_assets = [a for a in catalog if a["type"] == "tile"]
    # Include ALL non-tile assets as potential objects (object, sprite, animated, prop, etc.)
    object_assets = [a for a in catalog if a["type"] != "tile"]

    logger.info(
        f"Catalog has {len(tile_assets)} tiles, {len(object_assets)} non-tile assets"
    )
    if object_assets:
        logger.info(
            f"Available non-tile assets: {[(a['name'], a['type']) for a in object_assets]}"
        )

    # No tiles at all — can't generate layout
    if not tile_assets:
        logger.warning(f"No tile assets available — skipping layout for '{scene_name}'")
        return (
            [],
            [{"id": "default", "x": width // 2, "y": height - 2, "facing": "up"}],
            [],
        )

    # If no objects available, log warning but continue (will generate tiles only)
    if not object_assets:
        logger.warning(
            f"No non-tile assets in catalog — scene will only have ground tiles"
        )

    # Build prioritized asset list: relevant assets from Pinecone first, then rest
    prioritized_objects = []
    added_names = set()

    # Add Pinecone-matched assets first (if any) - include all non-tile types
    for a in relevant_assets:
        name = a.get("name", "")
        asset_type = a.get("type", "object")
        if asset_type != "tile" and name and name not in added_names:
            prioritized_objects.append(a)
            added_names.add(name)

    # Add remaining catalog objects
    for a in object_assets:
        name = a["name"]
        if name not in added_names:
            prioritized_objects.append(a)
            added_names.add(name)

    logger.info(f"Total non-tile assets for AI prompt: {len(prioritized_objects)}")

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 3: Build AI prompt with user's raw request
    # ═══════════════════════════════════════════════════════════════════════════

    # Build asset catalogs for AI
    tile_catalog = "\n".join([_format_asset_for_ai(a) for a in tile_assets])

    # Format objects - mark Pinecone-matched ones with ★
    object_lines = []
    for a in prioritized_objects:
        formatted = _format_asset_for_ai(a)
        if a.get("name", "") in relevant_names:
            formatted = formatted.replace("  • ", "  ★ ")  # Star marks relevant assets
        object_lines.append(formatted)
    object_catalog = (
        "\n".join(object_lines) if object_lines else "No objects available."
    )

    # Build scene context
    scene_context = f"""SCENE: {scene_name}
TYPE: {scene_type}
DESCRIPTION: {description}
MOOD: {mood}
LIGHTING: {lighting}
TARGET HEARTS FACETS: {', '.join(target_facets) if target_facets else 'Any'}
GRID SIZE: {width}x{height} tiles"""

    # User's original request - pass as-is, let AI interpret
    user_request_context = ""
    if goal_description:
        user_request_context = f"""
=== USER'S REQUEST ===
"{goal_description}"

The assets marked with ★ were found to be most relevant to this request based on semantic search.
Interpret the user's request and create a scene that matches what they're asking for."""

    # Challenge context - inform AI about any challenges, but don't force specific counts
    # The Flutter client will dynamically adapt to whatever collectibles the AI places
    challenge_context = ""
    if challenges:
        challenge_hints = []
        for c in challenges:
            mechanic = c.get("mechanic_id") or c.get("template_id") or "exploration"
            name = c.get("name", "Challenge")
            hint = c.get("hint", "")
            challenge_hints.append(f"- {name} ({mechanic}): {hint}")

        challenge_context = f"""
=== SCENE CHALLENGES ===
This scene has the following challenges defined:
{chr(10).join(challenge_hints)}

When designing the scene, consider placing assets that would support these challenges.
For example:
- If the scene feels like it should have treasure hunting, place coins/gems/collectibles
- If the scene feels like it should have NPC interactions, ensure NPCs are accessible
- If the scene is exploration-focused, create interesting paths and destinations

The game will automatically detect what you place and adapt the challenges accordingly.
Place what makes sense for the scene - the system is fully dynamic."""
        logger.info(f"Challenge context added for {len(challenges)} challenges")

    # Build diversity context if multiple scenes
    diversity_context = ""
    if total_scenes > 1:
        diversity_context = f"""
SCENE POSITION: Scene {scene_index + 1} of {total_scenes}
{"ALREADY USED IN PREVIOUS SCENES (avoid these): " + ", ".join(previous_focal_points) if previous_focal_points else ""}
Make this scene visually distinct from other scenes in the game."""

    # AI prompt - generic, AI interprets user's intent
    user_msg = f"""Design an isometric scene layout based on the following context.

{scene_context}
{user_request_context}
{challenge_context}
{diversity_context}

=== AVAILABLE GROUND TILES ===
{tile_catalog}

=== AVAILABLE OBJECTS/SPRITES ===
(★ = Recommended based on user's request)
{object_catalog}

YOUR TASK:
1. Read the USER'S REQUEST and interpret what kind of scene they want
2. Prioritize placing the ★ recommended assets as they match the user's intent
3. Place assets that make sense for the scene's atmosphere and purpose
4. Choose appropriate ground tiles for the scene
5. Use asset metadata (affordances, scene_role, placement_hint) to guide placement decisions
6. Create a layout that fulfills what the user asked for
7. Leave adequate space for player movement

TECHNICAL REQUIREMENTS:
- Grid coordinates: x=0 to {width-1}, y=0 to {height-1}
- ground_regions: Cover entire grid, painted in order (later overwrites earlier)
- object_placements: Each object needs unique position, avoid stacking
- spawn_points: Where player enters the scene
- Only use asset names from the catalogs above

Return valid JSON only:
{{
    "ground_regions": [
        {{"asset_name": "<tile_name>", "x_from": 0, "x_to": {width-1}, "y_from": 0, "y_to": {height-1}, "purpose": "<description>"}}
    ],
    "object_placements": [
        {{"asset_name": "<object_name>", "x": <x>, "y": <y>, "purpose": "<why this object here>"}}
    ],
    "spawn_points": [
        {{"id": "main_entry", "x": <x>, "y": <y>, "facing": "up"}}
    ],
    "zone_descriptions": [
        {{"name": "<zone_name>", "x_range": [<x1>, <x2>], "y_range": [<y1>, <y2>], "description": "<zone_description>"}}
    ]
}}"""

    try:
        response = await invoke_claude(LAYOUT_SYSTEM_PROMPT, user_msg, model="sonnet")

        logger.info(f"AI response length: {len(response)} chars")

        # Parse JSON using robust parser (handles GPT/Gemini formats)
        try:
            parsed = parse_json_response(response)
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse AI response as JSON: {e}")
            logger.error(f"Response preview: {response[:500]}...")
            # Return empty layout on parse failure
            return (
                [],
                [{"id": "default", "x": width // 2, "y": height - 2, "facing": "up"}],
                [],
            )

        # Log what AI returned
        ground_regions = parsed.get("ground_regions", [])
        object_placements_raw = parsed.get("object_placements", [])
        logger.info(
            f"AI returned: {len(ground_regions)} ground regions, {len(object_placements_raw)} object placements"
        )

        if ground_regions:
            for i, gr in enumerate(ground_regions[:3]):  # Log first 3
                logger.info(
                    f"  Ground region {i}: {gr.get('asset_name')} from ({gr.get('x_from')},{gr.get('y_from')}) to ({gr.get('x_to')},{gr.get('y_to')})"
                )

        if object_placements_raw:
            for i, op in enumerate(object_placements_raw[:5]):  # Log first 5
                logger.info(
                    f"  Object {i}: {op.get('asset_name')} at ({op.get('x')},{op.get('y')})"
                )

        enriched = []

        # Expand ground regions
        ground_grid: dict[tuple[int, int], dict] = {}
        for region in ground_regions:
            name = region.get("asset_name", "")
            cat = catalog_by_name.get(name, {})
            if not cat:
                logger.warning(f"Unknown ground tile: {name}")
                continue

            x_from = max(0, region.get("x_from", 0))
            x_to = min(width - 1, region.get("x_to", width - 1))
            y_from = max(0, region.get("y_from", 0))
            y_to = min(height - 1, region.get("y_to", height - 1))
            purpose = region.get("purpose", "")

            for gx in range(x_from, x_to + 1):
                for gy in range(y_from, y_to + 1):
                    ground_grid[(gx, gy)] = {"asset_name": name, "purpose": purpose}

        # Convert ground grid to placements
        # Ground tiles use z_index = 0 so they always render as base layer below all objects
        # Objects and player sort among themselves using position-based z_index
        for (gx, gy), tile in ground_grid.items():
            cat = catalog_by_name.get(tile["asset_name"], {})
            enriched.append(
                {
                    "asset_name": tile["asset_name"],
                    "asset_id": cat.get("id", ""),
                    "display_name": cat.get("display_name", tile["asset_name"]),
                    "file_url": cat.get("file_url", ""),
                    "x": gx,
                    "y": gy,
                    "z_index": 0,  # All ground at base layer
                    "stack_order": 0,
                    "layer": "ground",
                    "scale": 1.0,
                    "purpose": tile["purpose"],
                    "type": "tile",
                    "tags": cat.get("tags", []),
                    "metadata": _build_placement_metadata(cat),
                }
            )

        # Process object placements with collision detection
        object_placements = parsed.get("object_placements", [])

        # Track occupied areas for collision detection
        occupied_areas: list[tuple[int, int, int]] = []  # (x, y, radius)
        focal_points_placed: set[str] = set()

        def get_asset_radius(catalog_entry: dict) -> int:
            """Get spacing radius from catalog data only."""
            if not catalog_entry:
                return 1

            # Use scene_role from knowledge
            knowledge = catalog_entry.get("knowledge", {})
            scene_role = knowledge.get("scene_role", "") or catalog_entry.get(
                "scene_role", ""
            )
            placement_hint = knowledge.get("placement_hint", "") or catalog_entry.get(
                "placement_hint", ""
            )

            if scene_role == "focal_point":
                return 2
            elif scene_role == "vegetation":
                return 2 if placement_hint == "single" else 1

            # Use hitbox if available
            hitbox = catalog_entry.get("hitbox", {})
            if isinstance(hitbox, dict):
                if hitbox.get("width", 1) > 1 or hitbox.get("height", 1) > 1:
                    return 2

            return 1

        def is_focal_asset(catalog_entry: dict) -> bool:
            """Check if asset is a focal point from catalog data."""
            if not catalog_entry:
                return False
            knowledge = catalog_entry.get("knowledge", {})
            scene_role = knowledge.get("scene_role", "") or catalog_entry.get(
                "scene_role", ""
            )
            return scene_role == "focal_point"

        def check_collision(x: int, y: int, radius: int) -> bool:
            """Check if position collides with occupied area."""
            for ox, oy, oradius in occupied_areas:
                min_dist = radius + oradius
                if abs(x - ox) < min_dist and abs(y - oy) < min_dist:
                    return True
            return False

        def find_valid_position(x: int, y: int, radius: int) -> tuple[int, int] | None:
            """Find nearby valid position if original collides."""
            for dist in range(1, min(width, height) // 2):
                for dx in range(-dist, dist + 1):
                    for dy in range(-dist, dist + 1):
                        if abs(dx) != dist and abs(dy) != dist:
                            continue
                        nx, ny = x + dx, y + dy
                        if nx < 0 or nx >= width or ny < 0 or ny >= height:
                            continue
                        if not check_collision(nx, ny, radius):
                            return (nx, ny)
            return None

        validated_placements = []

        for obj in object_placements:
            name = obj.get("asset_name", "")
            x = obj.get("x", 0)
            y = obj.get("y", 0)

            cat = catalog_by_name.get(name, {})
            if not cat:
                logger.warning(f"Unknown object asset: {name}, skipping")
                continue

            radius = get_asset_radius(cat)

            # Skip duplicate focal points
            if is_focal_asset(cat) and name in focal_points_placed:
                logger.info(f"Skipping duplicate focal point: {name}")
                continue

            # Clamp to grid bounds
            x = max(0, min(width - 1, x))
            y = max(0, min(height - 1, y))

            # Handle collision
            if check_collision(x, y, radius):
                new_pos = find_valid_position(x, y, radius)
                if new_pos:
                    x, y = new_pos
                    logger.info(f"Relocated {name} to ({x}, {y}) to avoid collision")
                else:
                    logger.warning(
                        f"Could not find valid position for {name}, skipping"
                    )
                    continue

            # Mark as occupied
            occupied_areas.append((x, y, radius))
            if is_focal_asset(cat):
                focal_points_placed.add(name)

            validated_placements.append({**obj, "x": x, "y": y})

        logger.info(
            f"Validated {len(validated_placements)}/{len(object_placements)} object placements"
        )

        # Build enriched object placements
        for obj in validated_placements:
            name = obj.get("asset_name", "")
            cat = catalog_by_name.get(name, {})

            obj_x = obj.get("x", 0)
            obj_y = obj.get("y", 0)

            # Isometric depth: (y * gridCols + x) * 10
            # Flutter adds stack_order to this for final priority
            isometric_z = (obj_y * width + obj_x) * 10

            enriched.append(
                {
                    "asset_name": name,
                    "asset_id": cat.get("id", ""),
                    "display_name": cat.get("display_name", name),
                    "file_url": cat.get("file_url", ""),
                    "x": obj_x,
                    "y": obj_y,
                    "z_index": isometric_z,
                    "stack_order": 1,  # Objects render above ground (ground = 0)
                    "layer": cat.get("layer", "objects"),
                    "scale": cat.get(
                        "render_scale", 1.0
                    ),  # Use render_scale from catalog (smart-scaled for collectibles)
                    "purpose": obj.get("purpose", ""),
                    "type": cat.get("type", "object"),
                    "tags": cat.get("tags", []),
                    "facet": cat.get("facet"),
                    "interaction_type": cat.get("interaction", {}).get("type", "none"),
                    "metadata": _build_placement_metadata(cat),
                }
            )

        spawn_points = parsed.get(
            "spawn_points",
            [{"id": "default", "x": width // 2, "y": height - 2, "facing": "up"}],
        )
        zone_descriptions = parsed.get("zone_descriptions", [])

        logger.info(
            f"Layout for '{scene_name}': {len(ground_grid)} tiles + {len(validated_placements)} objects"
        )

        return enriched, spawn_points, zone_descriptions

    except Exception as e:
        logger.error(f"Layout generation failed for '{scene_name}': {e}")
        return (
            [],
            [{"id": "default", "x": width // 2, "y": height - 2, "facing": "up"}],
            [],
        )


def enrich_routes_with_scene_ids(
    routes: list[dict],
    current_scene_id: str,
    current_scene_name: str,
    scene_name_to_id: dict[str, str],
) -> list[dict]:
    """Enrich routes with from_scene_id and to_scene_id for Flutter navigation.

    Flutter needs scene UUIDs to call the manifest API:
    GET /api/v1/scenes/{scene_id}/manifest

    Args:
        routes: List of route dicts with from_scene_name, to_scene_name
        current_scene_id: The scene being saved (used for from_scene_id)
        current_scene_name: Name of current scene
        scene_name_to_id: Map of scene_name -> scene_id

    Returns:
        Routes with from_scene_id and to_scene_id added
    """
    if not routes:
        return routes

    enriched = []
    for route in routes:
        route_copy = dict(route)

        from_name = route.get("from_scene_name", "")
        to_name = route.get("to_scene_name", "")

        # Add from_scene_id
        if from_name.lower() == current_scene_name.lower():
            route_copy["from_scene_id"] = current_scene_id
        elif from_name in scene_name_to_id:
            route_copy["from_scene_id"] = scene_name_to_id[from_name]
        else:
            # Try case-insensitive lookup
            for name, sid in scene_name_to_id.items():
                if name.lower() == from_name.lower():
                    route_copy["from_scene_id"] = sid
                    break

        # Add to_scene_id
        if to_name in scene_name_to_id:
            route_copy["to_scene_id"] = scene_name_to_id[to_name]
        else:
            # Try case-insensitive lookup
            for name, sid in scene_name_to_id.items():
                if name.lower() == to_name.lower():
                    route_copy["to_scene_id"] = sid
                    break

        if "to_scene_id" not in route_copy:
            logger.warning(f"Could not find scene ID for route target: {to_name}")

        enriched.append(route_copy)

    logger.info(f"Enriched {len(enriched)} routes with scene IDs")
    return enriched


async def upload_scene_manifest(
    scene_id: str,
    scene_name: str,
    scene_type: str,
    description: str,
    lighting: str,
    asset_placements: list[dict],
    spawn_points: list[dict],
    zone_descriptions: list[dict],
    actors: list[dict] = None,
    challenges: list[dict] = None,
    quests: list[dict] = None,
    routes: list[dict] = None,
    width: int = 16,
    height: int = 16,
    scene_name_to_id: dict[str, str] = None,
) -> Optional[str]:
    """Build manifest JSON, upload to GCS, update scene tile_map_url.

    Args:
        scene_id: UUID of the scene
        scene_name: Display name of the scene
        scene_type: Type of scene (from game plan)
        description: Scene description
        lighting: Lighting mode
        asset_placements: List of placed assets
        spawn_points: Player spawn points
        zone_descriptions: Zone descriptions
        actors: NPC/actor data
        challenges: Challenge definitions
        quests: Quest definitions
        routes: Route definitions (will be enriched with scene IDs)
        width: Scene width
        height: Scene height
        scene_name_to_id: Map of scene names to IDs for route enrichment

    Returns:
        manifest_url or None on failure.
    """
    try:
        # Enrich routes with scene IDs if map is provided
        enriched_routes = routes or []
        if routes and scene_name_to_id:
            enriched_routes = enrich_routes_with_scene_ids(
                routes=routes,
                current_scene_id=scene_id,
                current_scene_name=scene_name,
                scene_name_to_id=scene_name_to_id,
            )

        full_manifest = {
            "scene": {
                "scene_id": scene_id,
                "scene_name": scene_name,
                "scene_type": scene_type,
                "description": description,
                "lighting": lighting,
                "weather": "clear",
                "dimensions": {"width": width, "height": height},
                "spawn_points": spawn_points,
                "zone_descriptions": zone_descriptions,
            },
            "asset_placements": asset_placements,
            "npcs": actors or [],
            "challenges": challenges or [],
            "quests": quests or [],
            "routes": enriched_routes,
            "generation_notes": f"Auto-generated layout for {scene_name}",
        }

        # DEBUG: Log what challenges are being written to manifest
        logger.info(
            f"[MANIFEST] Scene '{scene_name}' challenges being uploaded: {[c.get('mechanic_id') for c in (challenges or [])]}"
        )

        manifest_json = json.dumps(full_manifest, ensure_ascii=False)
        manifest_bytes = manifest_json.encode("utf-8")
        manifest_filename = f"scene_{scene_id}_manifest.json"

        upload_result = await assets_client.upload_file(
            file_data=manifest_bytes,
            filename=manifest_filename,
            content_type="application/json",
            folder="scenes",
        )
        manifest_url = upload_result.get("file_url", "")

        if manifest_url:
            await assets_client.update_scene(scene_id, {"tile_map_url": manifest_url})
            logger.info(f"Manifest uploaded for '{scene_name}': {manifest_url}")

        return manifest_url

    except Exception as e:
        logger.error(f"Manifest upload failed for '{scene_name}': {e}")
        return None
