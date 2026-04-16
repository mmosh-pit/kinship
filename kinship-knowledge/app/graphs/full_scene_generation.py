"""Graph 7: Full Scene Generation — asset-aware, prompt-driven.

Trigger: Studio UI → "✨ Generate Scene"
Flow: parse_prompt → load_asset_catalog → generate_layout → generate_npcs →
      generate_challenges → generate_quests → generate_routes →
      generate_system_prompt → compose_response

Key difference from v1: The generate_layout node receives the FULL asset catalog
and places specific assets by name on the isometric grid.
"""

import json
import logging
from typing import TypedDict

from langgraph.graph import StateGraph, END

from app.services.claude_client import (
    invoke_claude,
    parse_json_response,
    safe_parse_json,
)
from app.services import assets_client

logger = logging.getLogger(__name__)


GENERATION_SYSTEM_PROMPT = """You are a world-class isometric game designer for Kinship, an emotional wellbeing 
app described as "a gym and spa for your heart and soul." The game uses isometric scenes rendered with 
Flutter/Flame engine on a tile grid.

The HEARTS framework measures 7 facets of emotional wellbeing:
- H (Honesty): Authenticity, truth-telling, self-awareness
- E (Empowerment): Agency, confidence, resilience  
- A (Autonomy): Independence, self-direction, boundaries
- R (Respect): Dignity, mutual regard, appreciation
- T (Tenacity): Persistence, grit, determination
- Si (Silence): Mindfulness, reflection, inner peace
- So (Solidarity): Connection, community, belonging

Content hierarchy: Cycles → Arcs → Scenarios → Scenes → Routines → Challenges

You must respond ONLY with valid JSON (no markdown fences, no commentary outside JSON)."""


class FullSceneGenState(TypedDict):
    # Input
    prompt: str
    scene_name: str
    scene_type: str
    target_facets: list[str]
    dimensions: dict
    # Catalog
    asset_catalog: list[dict]
    asset_catalog_summary: str  # condensed for AI prompt
    # Generated
    scene_config: dict
    asset_placements: list[dict]
    npcs: list[dict]
    challenges: list[dict]
    quests: list[dict]
    routes: list[dict]
    system_prompt: str
    generation_notes: str
    # Control
    error: str


# ─────────────────────────────────────────────
# Node: Parse prompt
# ─────────────────────────────────────────────


async def parse_prompt(state: FullSceneGenState) -> dict:
    """Extract scene parameters from the creator's prompt."""
    user_msg = f"""Analyze this scene creation prompt and extract structured parameters.

Creator's prompt: "{state['prompt']}"

Return JSON:
{{
    "scene_name": "descriptive name for the scene",
    "scene_type": "garden|forest|temple|cave|village|beach|mountain|camp|workshop|custom",
    "description": "1-2 sentence scene description",
    "target_facets": ["E", "T"],
    "lighting": "day|night|dawn|dusk",
    "weather": "clear|rain|fog|snow",
    "mood": "emotional tone description",
    "zones": ["brief description of zone 1", "zone 2", "zone 3"],
    "estimated_npcs": 2,
    "estimated_challenges": 3
}}

If the creator specified a name, use it. Otherwise infer a good one.
Pick 2-3 HEARTS facets that best match the scene's emotional purpose."""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")

    try:
        parsed = _parse_json(response)
    except Exception:
        parsed = {
            "scene_name": state.get("scene_name") or "Generated Scene",
            "scene_type": state.get("scene_type") or "forest",
            "description": state["prompt"],
            "target_facets": state.get("target_facets") or ["E", "So"],
            "lighting": "day",
            "weather": "clear",
            "mood": "welcoming",
            "zones": [],
            "estimated_npcs": 2,
            "estimated_challenges": 3,
        }

    # Creator overrides
    if state.get("scene_name"):
        parsed["scene_name"] = state["scene_name"]
    if state.get("scene_type"):
        parsed["scene_type"] = state["scene_type"]
    if state.get("target_facets"):
        parsed["target_facets"] = state["target_facets"]

    return {
        "scene_config": parsed,
        "scene_name": parsed.get("scene_name", "Generated Scene"),
        "scene_type": parsed.get("scene_type", "forest"),
        "target_facets": parsed.get("target_facets", ["E"]),
    }


# ─────────────────────────────────────────────
# Node: Load asset catalog from kinship-assets
# ─────────────────────────────────────────────


async def load_asset_catalog(state: FullSceneGenState) -> dict:
    """Fetch all available assets from kinship-assets with FULL metadata.

    Includes AOE, hitbox, HEARTS mapping, interaction, rules, spawn defaults —
    everything the AI needs to make intelligent placement decisions.
    """
    catalog = []
    summary_lines = []

    # ── Try 1: kinship-assets API (paginated — fetches all pages) ──
    try:
        all_assets = await assets_client.fetch_all_assets()
        logger.info(f"Assets API returned {len(all_assets)} assets")

        if all_assets:
            for a in all_assets:
                if not isinstance(a, dict):
                    continue

                asset_id = a.get("id", "")

                # metadata may come as JSON string from the API
                meta = a.get("metadata", {})
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except (json.JSONDecodeError, TypeError):
                        meta = {}
                if not isinstance(meta, dict):
                    meta = {}

                aoe = meta.get("aoe", {}) or {}
                hitbox = meta.get("hitbox", {}) or {}
                hearts = meta.get("hearts_mapping", {}) or {}
                spawn = meta.get("spawn", {}) or {}
                interaction = meta.get("interaction", {}) or {}
                rules = meta.get("rules", {}) or {}
                custom = meta.get("custom_properties", {}) or {}

                # tags may be a JSON string
                tags = a.get("tags", [])
                if isinstance(tags, str):
                    try:
                        tags = json.loads(tags)
                    except (json.JSONDecodeError, TypeError):
                        tags = [t.strip() for t in tags.split(",") if t.strip()]

                catalog.append(
                    {
                        "id": asset_id,
                        "name": a.get("name", ""),
                        "display_name": a.get("display_name", ""),
                        "file_url": a.get("file_url", ""),
                        "type": a.get("type", "object"),
                        "tags": tags,
                        "description": a.get(
                            "meta_description", a.get("description", "")
                        ),
                        # ── Full game metadata ──
                        "aoe": {
                            "shape": aoe.get("shape", "none"),
                            "radius": aoe.get("radius"),
                            "width": aoe.get("width"),
                            "height": aoe.get("height"),
                        },
                        "hitbox": {
                            "width": hitbox.get("width", 1),
                            "height": hitbox.get("height", 1),
                        },
                        "interaction": {
                            "type": interaction.get("type", "none"),
                            "range": interaction.get("range", 1),
                            "cooldown_ms": interaction.get("cooldown_ms", 500),
                            "requires_facing": interaction.get(
                                "requires_facing", False
                            ),
                        },
                        "hearts_mapping": {
                            "primary_facet": hearts.get("primary_facet"),
                            "secondary_facet": hearts.get("secondary_facet"),
                            "base_delta": hearts.get("base_delta", 0),
                            "description": hearts.get("description", ""),
                        },
                        "layer": spawn.get("layer", "objects"),
                        "z_index": spawn.get("z_index", 1),
                        "rules": {
                            "level_required": rules.get("level_required", 0),
                            "max_users": rules.get("max_users", 1),
                            "is_movable": rules.get("is_movable", False),
                            "is_destructible": rules.get("is_destructible", False),
                            "description": rules.get("description", ""),
                        },
                        "original_dimensions": custom.get("original_dimensions", {}),
                        # ── Type-specific metadata for game engine ──
                        "sprite_sheet": meta.get("sprite_sheet", {}) or {},
                        "tile_config": meta.get("tile_config", {}) or {},
                        "audio_config": meta.get("audio_config", {}) or {},
                        "tilemap_config": meta.get("tilemap_config", {}) or {},
                        "movement": meta.get("movement", {}) or {},
                        # Backward compat fields for summary builder
                        "facet": hearts.get("primary_facet"),
                        "interaction_type": interaction.get("type", "none"),
                    }
                )
    except Exception as e:
        logger.warning(f"Assets API unavailable: {e}")

    # ── Try 2: Fallback to embedded JSON if API returned nothing ──
    if not catalog:
        logger.info("Using fallback embedded catalog")
        fallback = await _load_fallback_catalog()
        catalog = fallback.get("asset_catalog", [])
        if fallback.get("asset_catalog_summary"):
            return fallback

    # ── Build condensed summary for AI prompt ──
    if not catalog:
        logger.error("No asset catalog available from API or fallback!")
        return {
            "asset_catalog": [],
            "asset_catalog_summary": "ERROR: No assets available.",
        }

    for cat_type in ["tile", "object", "sprite"]:
        items = [a for a in catalog if a["type"] == cat_type]
        if items:
            summary_lines.append(f"\n=== {cat_type.upper()}S ({len(items)}) ===")
            for a in items:
                facet_str = f" [{a.get('facet', '')}]" if a.get("facet") else ""
                inter_str = (
                    f" ({a.get('interaction_type', '')})"
                    if a.get("interaction_type", "none") != "none"
                    else ""
                )
                aoe_str = ""
                if a.get("aoe", {}).get("shape", "none") != "none" and a.get(
                    "aoe", {}
                ).get("radius"):
                    aoe_str = f" AOE:{a['aoe']['shape']}r{a['aoe']['radius']}"
                hearts_desc = ""
                if a.get("hearts_mapping", {}).get("description"):
                    hearts_desc = f" — {a['hearts_mapping']['description'][:60]}"
                rules_str = ""
                if a.get("rules", {}).get("level_required", 0) > 0:
                    rules_str = f" lvl>={a['rules']['level_required']}"
                if a.get("rules", {}).get("max_users", 1) > 1:
                    rules_str += f" max_users:{a['rules']['max_users']}"

                summary_lines.append(
                    f"  • {a['name']} — {a.get('description', '')[:60]}"
                    f"{facet_str}{inter_str}{aoe_str}{rules_str}{hearts_desc}"
                    f" [layer:{a.get('layer', 'objects')}, z:{a.get('z_index', 1)}]"
                )

    logger.info(f"Loaded {len(catalog)} assets for scene generation")
    return {
        "asset_catalog": catalog,
        "asset_catalog_summary": "\n".join(summary_lines),
    }


async def _load_fallback_catalog() -> dict:
    """Load from embedded JSON catalog if API is unavailable."""
    import os

    # Try multiple possible locations
    possible_paths = [
        os.path.join(
            os.path.dirname(__file__), "..", "data", "forest_asset_catalog.json"
        ),
        os.path.join(
            os.path.dirname(__file__), "..", "..", "data", "forest_asset_catalog.json"
        ),
        os.path.join(os.getcwd(), "app", "data", "forest_asset_catalog.json"),
        os.path.join(os.getcwd(), "data", "forest_asset_catalog.json"),
        "/app/data/forest_asset_catalog.json",  # Docker path
    ]

    data = None
    for path in possible_paths:
        resolved = os.path.abspath(path)
        if os.path.exists(resolved):
            logger.info(f"Found fallback catalog at: {resolved}")
            with open(resolved) as f:
                data = json.load(f)
            break

    if not data:
        logger.error(
            f"Fallback catalog not found. Tried: {[os.path.abspath(p) for p in possible_paths]}"
        )
        return {"asset_catalog": [], "asset_catalog_summary": "No assets available."}

    catalog = []
    summary_lines = []
    for a in data.get("assets", []):
        meta = a.get("metadata", {})
        hearts = meta.get("hearts_mapping", {})
        spawn = meta.get("spawn", {})
        interaction = meta.get("interaction", {})

        entry = {
            "id": "",
            "name": a["name"],
            "display_name": a.get("display_name", ""),
            "file": a.get("file", ""),
            "file_url": "",
            "type": a.get("type", "object"),
            "tags": a.get("tags", []),
            "description": a.get("meta_description", ""),
            "layer": spawn.get("layer", "objects"),
            "z_index": spawn.get("z_index", 1),
            "facet": hearts.get("primary_facet"),
            "interaction_type": interaction.get("type", "none"),
        }
        catalog.append(entry)

    # Build summary
    for cat_type in ["tile", "object", "sprite"]:
        items = [a for a in catalog if a["type"] == cat_type]
        if items:
            summary_lines.append(f"\n=== {cat_type.upper()}S ({len(items)}) ===")
            for a in items:
                facet_str = f" [{a['facet']}]" if a.get("facet") else ""
                inter_str = (
                    f" ({a['interaction_type']})"
                    if a["interaction_type"] != "none"
                    else ""
                )
                summary_lines.append(
                    f"  • {a['name']} — {a['description'][:80]}{facet_str}{inter_str} [layer:{a['layer']}, z:{a['z_index']}]"
                )

    logger.info(f"Loaded {len(catalog)} assets from fallback catalog")
    return {
        "asset_catalog": catalog,
        "asset_catalog_summary": "\n".join(summary_lines),
    }


def _infer_personality(cat: dict) -> str:
    """Infer movement personality from asset metadata when not explicitly set.

    The game engine will use this to drive natural behavior.
    Returns empty string if the engine should auto-detect from sprite states.
    """
    asset_type = cat.get("type", "object")

    # If already set in metadata, use it
    mv = cat.get("movement", {}) or {}
    if isinstance(mv, dict) and mv.get("personality"):
        return mv["personality"]

    # Auto-infer based on asset type
    ss = cat.get("sprite_sheet", {}) or {}
    states = ss.get("states", {}) or {}
    state_names = set(states.keys()) if isinstance(states, dict) else set()
    has_walk = "walk" in state_names

    if asset_type == "animation":
        return "ambient"  # campfire, torch, water → stationary loop

    if asset_type == "npc" and has_walk:
        return "guard"  # NPCs → stay near post

    # For sprites/other: return empty → game engine auto-detects from states
    return ""


def _build_placement_metadata(cat: dict) -> dict:
    """Build the metadata dict for a placement from catalog entry.

    Includes type-specific configs that the game engine needs:
    sprite_sheet, tile_config, audio_config, tilemap_config, movement,
    hitbox, interaction, hearts_mapping.
    """
    meta = {"asset_type": cat.get("type", "object")}

    # Sprite sheet (animated sprites, NPCs, avatars)
    ss = cat.get("sprite_sheet", {})
    if isinstance(ss, dict) and ss.get("frame_width"):
        meta["sprite_sheet"] = ss

    # Tile config (walkability, terrain, pathfinding)
    tc = cat.get("tile_config", {})
    if isinstance(tc, dict) and any(tc.values()):
        meta["tile_config"] = tc

    # Audio config (volume, loop, spatial)
    ac = cat.get("audio_config", {})
    if isinstance(ac, dict) and any(ac.values()):
        meta["audio_config"] = ac

    # Tilemap config (grid dimensions, orientation)
    tmc = cat.get("tilemap_config", {})
    if isinstance(tmc, dict) and any(tmc.values()):
        meta["tilemap_config"] = tmc

    # Movement config — always include personality for game engine
    mv = cat.get("movement", {}) or {}
    personality = _infer_personality(cat)
    if isinstance(mv, dict) and mv.get("type") and mv["type"] != "static":
        mv["personality"] = mv.get("personality") or personality
        meta["movement"] = mv
    elif personality:
        # No explicit movement but we have a personality → include it
        # so the game engine knows how to auto-configure behavior
        meta["movement"] = {"personality": personality}

    # Hitbox
    hb = cat.get("hitbox", {})
    if isinstance(hb, dict) and hb:
        meta["hitbox"] = hb

    # Interaction
    inter = cat.get("interaction", {})
    if isinstance(inter, dict) and inter.get("type") and inter["type"] != "none":
        meta["interaction"] = inter

    # HEARTS mapping
    hearts = cat.get("hearts_mapping", {})
    if isinstance(hearts, dict) and hearts.get("primary_facet"):
        meta["hearts_mapping"] = hearts

    return meta


# ─────────────────────────────────────────────
# Node: Generate isometric layout with assets
# ─────────────────────────────────────────────


async def generate_layout(state: FullSceneGenState) -> dict:
    """AI designs layout using region fills for ground + individual object placements.

    The AI receives FULL asset metadata so it can:
    - Place HEARTS-aligned assets (match scene target facets)
    - Space objects based on AOE radius (no overlapping interaction zones)
    - Respect hitbox sizes (no collision overlaps)
    - Put beginner assets (level_required=0) near spawn, advanced ones further
    - Use correct layer and z_index from spawn defaults
    - Scatter decorative assets (no interaction) for atmosphere
    - Place high max_users objects in central areas for multiplayer
    """
    config = state.get("scene_config", {})
    dims = state.get("dimensions", {"width": 16, "height": 16})
    w, h = dims.get("width", 16), dims.get("height", 16)
    target_facets = state.get("target_facets", ["E"])

    catalog = state.get("asset_catalog", [])
    tile_names = [a["name"] for a in catalog if a["type"] == "tile"]
    object_items = [a for a in catalog if a["type"] in ("object", "sprite")]

    # Build rich object catalog with metadata for AI
    object_catalog_lines = []
    for a in object_items:
        parts = [f"  • {a['name']}"]
        if a.get("description"):
            parts.append(f"    desc: {a['description'][:80]}")
        if a.get("facet"):
            facets = a["facet"]
            sec = a.get("hearts_mapping", {}).get("secondary_facet")
            if sec:
                facets += f"+{sec}"
            parts.append(
                f"    HEARTS: {facets} (delta:{a.get('hearts_mapping', {}).get('base_delta', 0)})"
            )
            hdesc = a.get("hearts_mapping", {}).get("description", "")
            if hdesc:
                parts.append(f"    purpose: {hdesc[:60]}")
        if a.get("aoe", {}).get("shape", "none") != "none":
            parts.append(
                f"    AOE: {a['aoe']['shape']} radius={a['aoe'].get('radius', 0)}"
            )
        if a.get("hitbox"):
            parts.append(f"    hitbox: {a['hitbox']['width']}x{a['hitbox']['height']}")
        if a.get("interaction", {}).get("type", "none") != "none":
            parts.append(
                f"    interact: {a['interaction']['type']} range={a['interaction'].get('range', 1)}"
            )
        if a.get("rules", {}).get("level_required", 0) > 0:
            parts.append(f"    level_required: {a['rules']['level_required']}")
        if a.get("rules", {}).get("max_users", 1) > 1:
            parts.append(f"    max_users: {a['rules']['max_users']}")
        parts.append(
            f"    layer: {a.get('layer', 'objects')}, z_index: {a.get('z_index', 1)}"
        )
        object_catalog_lines.append("\n".join(parts))

    object_catalog_text = (
        "\n\n".join(object_catalog_lines)
        if object_catalog_lines
        else "No objects available"
    )

    user_msg = f"""Design an isometric scene layout for a {w}x{h} tile grid.

SCENE: {config.get('scene_name', 'Scene')}
TYPE: {config.get('scene_type', 'forest')}
DESCRIPTION: {config.get('description', state['prompt'])}
MOOD: {config.get('mood', 'welcoming')}
LIGHTING: {config.get('lighting', 'day')}
TARGET HEARTS FACETS: {', '.join(target_facets)}
ZONES: {json.dumps(config.get('zones', []))}

=== AVAILABLE GROUND TILES ===
{json.dumps(tile_names)}

=== AVAILABLE OBJECTS/SPRITES (with full metadata) ===
{object_catalog_text}

DESIGN RULES:
1. FACET ALIGNMENT: This scene targets {', '.join(target_facets)} facets. 
   Prioritize placing assets whose HEARTS facets match. Put them in prominent positions.
2. AOE SPACING: Assets with AOE radius > 0 need breathing room. 
   Don't place two AOE assets closer than the sum of their radii.
3. DIFFICULTY PROGRESSION: Place level_required=0 near spawn, higher levels further away.
4. MULTIPLAYER: max_users > 1 objects go in open/central areas.
5. DECORATIVE: Assets with no HEARTS mapping (delta=0) are decorations — scatter for atmosphere.
6. HITBOX: Don't overlap hitboxes of interactive objects.

MOBILE: Portrait ~8×12 tiles visible, Landscape ~12×8 tiles visible.
Keep key content in center ({w//4}..{w*3//4}, {h//4}..{h*3//4}).
Decorative content on edges. Spawn near center or south edge.

IMPORTANT — USE THIS COMPACT FORMAT:

1. GROUND REGIONS: Specify rectangular fills (the code will expand to individual tiles).
2. OBJECT PLACEMENTS: Place individual objects/sprites on the grid (15-30 items).
   Use EXACT asset names from the catalog above.

Return JSON:
{{
    "ground_regions": [
        {{
            "asset_name": "grass_block_clean",
            "x_from": 0, "x_to": {w-1},
            "y_from": 0, "y_to": {h-1},
            "purpose": "base forest floor"
        }}
    ],
    "object_placements": [
        {{
            "asset_name": "well_stone",
            "x": 8, "y": 8,
            "purpose": "central gathering point — So+A facets, AOE 1.5"
        }}
    ],
    "spawn_points": [
        {{"id": "main_entry", "x": {w//2}, "y": {h-2}, "facing": "up"}}
    ],
    "zone_descriptions": [
        {{"name": "Zone Name", "x_range": [2, 6], "y_range": [2, 6], "description": "..."}}
    ],
    "layout_notes": "Brief design explanation referencing HEARTS alignment and spatial reasoning"
}}

RULES:
- ground_regions are painted in ORDER. Later regions overwrite earlier ones (use for paths on top of grass).
- x_from/x_to and y_from/y_to are INCLUSIVE. x=0..{w-1}, y=0..{h-1}.
- Cover the ENTIRE grid floor with ground_regions (first region should be the base fill).
- Place 15-30 objects/sprites. Focus on interactive HEARTS-aligned items in center, decorative on edges.
- Only use asset names from the catalog above.
- Do NOT include a "file" field — Flutter resolves images from asset_name at runtime."""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")

    try:
        parsed = _parse_json(response)
        catalog_by_name = {a["name"]: a for a in catalog}

        enriched = []

        # ── Expand ground regions into individual tile placements ──
        # Use a grid to handle overwrites (later regions overwrite earlier)
        ground_grid: dict[tuple[int, int], dict] = {}
        for region in parsed.get("ground_regions", []):
            name = region.get("asset_name", "")
            if name not in catalog_by_name:
                logger.warning(f"Unknown ground asset: {name}, skipping")
                continue

            x_from = max(0, region.get("x_from", 0))
            x_to = min(w - 1, region.get("x_to", w - 1))
            y_from = max(0, region.get("y_from", 0))
            y_to = min(h - 1, region.get("y_to", h - 1))

            for gx in range(x_from, x_to + 1):
                for gy in range(y_from, y_to + 1):
                    ground_grid[(gx, gy)] = {
                        "asset_name": name,
                        "purpose": region.get("purpose", ""),
                    }

        # Convert grid to placements
        for (gx, gy), tile in ground_grid.items():
            cat = catalog_by_name.get(tile["asset_name"], {})
            enriched.append(
                {
                    "asset_name": tile["asset_name"],
                    "asset_id": cat.get("id", ""),
                    "display_name": cat.get("display_name", tile["asset_name"]),
                    "file": cat.get("file", ""),
                    "file_url": cat.get("file_url", ""),
                    "x": gx,
                    "y": gy,
                    "z_index": 0,
                    "layer": "ground",
                    "scale": 1.0,
                    "purpose": tile["purpose"],
                    "type": "tile",
                    "tags": cat.get("tags", []),
                    "facet": cat.get("facet"),
                    "interaction_type": cat.get("interaction_type", "none"),
                    "metadata": _build_placement_metadata(cat),
                }
            )

        # ── Add individual object placements ──
        for obj in parsed.get("object_placements", []):
            name = obj.get("asset_name", "")
            cat = catalog_by_name.get(name, {})
            if not cat:
                logger.warning(f"Unknown object asset: {name}, skipping")
                continue

            enriched.append(
                {
                    "asset_name": name,
                    "asset_id": cat.get("id", ""),
                    "display_name": cat.get("display_name", name),
                    "file": cat.get("file", ""),
                    "file_url": cat.get("file_url", ""),
                    "x": obj.get("x", 0),
                    "y": obj.get("y", 0),
                    "z_index": cat.get("z_index", 1),
                    "layer": cat.get("layer", "objects"),
                    "scale": obj.get("scale", 1.0),
                    "purpose": obj.get("purpose", ""),
                    "type": cat.get("type", "object"),
                    "tags": cat.get("tags", []),
                    "facet": cat.get("facet"),
                    "interaction_type": cat.get("interaction_type", "none"),
                    "metadata": _build_placement_metadata(cat),
                }
            )

        logger.info(
            f"Layout generated: {len(ground_grid)} ground tiles + {len(parsed.get('object_placements', []))} objects = {len(enriched)} total"
        )

        return {
            "asset_placements": enriched,
            "scene_config": {
                **state.get("scene_config", {}),
                "spawn_points": parsed.get(
                    "spawn_points",
                    [{"id": "default", "x": w // 2, "y": h - 2, "facing": "up"}],
                ),
                "zone_descriptions": parsed.get("zone_descriptions", []),
                "layout_notes": parsed.get("layout_notes", ""),
            },
        }
    except Exception as e:
        logger.error(f"Layout generation failed: {e}")
        return {"asset_placements": []}


# ─────────────────────────────────────────────
# Node: Generate NPCs
# ─────────────────────────────────────────────


async def generate_npcs(state: FullSceneGenState) -> dict:
    """Generate NPCs with grid positions."""
    config = state.get("scene_config", {})
    dims = state.get("dimensions", {"width": 16, "height": 16})

    user_msg = f"""Create NPCs for this scene.

Scene: {config.get('scene_name', 'Scene')} ({config.get('scene_type', 'forest')})
Description: {config.get('description', state['prompt'])}
Mood: {config.get('mood', 'welcoming')}
Target Facets: {', '.join(state.get('target_facets', ['E']))}
Grid: {dims.get('width', 20)}x{dims.get('height', 15)}
Zones: {json.dumps(config.get('zone_descriptions', []))}

Create {config.get('estimated_npcs', 2)} NPCs. Each should embody a different HEARTS facet.
Position them in meaningful zones on the grid.

Return JSON:
{{
    "npcs": [
        {{
            "name": "NPC name",
            "role": "guide|mentor|companion|guardian|trickster|healer",
            "facet": "H/E/A/R/T/Si/So",
            "personality": "2-3 sentences",
            "background": "brief backstory",
            "dialogue_style": "tone, patterns, quirks",
            "catchphrases": ["phrase 1", "phrase 2"],
            "position": {{"x": 10, "y": 7}}
        }}
    ]
}}"""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        return {"npcs": _parse_json(response).get("npcs", [])}
    except Exception:
        return {"npcs": []}


# ─────────────────────────────────────────────
# Node: Generate Challenges
# ─────────────────────────────────────────────


async def generate_challenges(state: FullSceneGenState) -> dict:
    """Generate challenges that reference placed assets."""
    config = state.get("scene_config", {})
    npc_names = [n.get("name") for n in state.get("npcs", [])]

    # Find interactive assets for challenge suggestions
    interactive_assets = [
        f"{a['display_name']} ({a['asset_name']}) at ({a['x']},{a['y']})"
        for a in state.get("asset_placements", [])
        if a.get("interaction_type") and a["interaction_type"] != "none"
    ]

    user_msg = f"""Create challenges for this scene.

Scene: {config.get('scene_name', 'Scene')} ({config.get('scene_type', 'forest')})
Description: {config.get('description', state['prompt'])}
Target Facets: {', '.join(state.get('target_facets', ['E']))}
NPCs: {', '.join(npc_names)}
Interactive assets in scene: {json.dumps(interactive_assets[:20])}

Create {config.get('estimated_challenges', 3)} challenges. Challenges should USE the interactive
assets placed in the scene. For example, if there's a campfire, a challenge could involve lighting it.

Return JSON:
{{
    "challenges": [
        {{
            "name": "Challenge name",
            "description": "What the player does",
            "facets": ["E", "T"],
            "difficulty": "Easy|Medium|Hard",
            "steps": [
                {{"order": 1, "description": "step description", "hint": "optional hint"}}
            ],
            "success_criteria": "How to succeed",
            "base_delta": 5.0,
            "time_limit_sec": 0,
            "related_assets": ["asset_name_1", "asset_name_2"]
        }}
    ]
}}"""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        return {"challenges": _parse_json(response).get("challenges", [])}
    except Exception:
        return {"challenges": []}


# ─────────────────────────────────────────────
# Node: Generate Quests (Story Beats)
# ─────────────────────────────────────────────


async def generate_quests(state: FullSceneGenState) -> dict:
    """Generate narrative quest sequence."""
    config = state.get("scene_config", {})
    npc_names = [n.get("name") for n in state.get("npcs", [])]
    challenge_names = [c.get("name") for c in state.get("challenges", [])]

    user_msg = f"""Create a narrative quest sequence for this scene.

Scene: {config.get('scene_name')} ({config.get('scene_type')})
Description: {config.get('description', state['prompt'])}
NPCs: {', '.join(npc_names)}
Challenges: {', '.join(challenge_names)}
Target Facets: {', '.join(state.get('target_facets', ['E']))}

Create 3-5 story beats forming a mini narrative arc. Return JSON:
{{
    "quests": [
        {{
            "name": "Quest name",
            "beat_type": "Introduction|Exploration|Challenge|Climax|Reflection|Resolution",
            "facet": "H/E/A/R/T/Si/So",
            "description": "short description",
            "narrative_content": "The story text (2-4 sentences)",
            "sequence_order": 1
        }}
    ]
}}

The sequence should feel like a meaningful emotional journey."""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        return {"quests": _parse_json(response).get("quests", [])}
    except Exception:
        return {"quests": []}


# ─────────────────────────────────────────────
# Node: Generate Routes
# ─────────────────────────────────────────────


async def generate_routes(state: FullSceneGenState) -> dict:
    """Generate scene transitions and challenge chains."""
    config = state.get("scene_config", {})
    challenge_names = [c.get("name") for c in state.get("challenges", [])]

    user_msg = f"""Create routes (transitions) for this scene.

Scene: {config.get('scene_name')}
Challenges: {', '.join(challenge_names)}

Create 2-4 routes. Return JSON:
{{
    "routes": [
        {{
            "name": "Route name",
            "from_scene": "scene name or empty for entry",
            "to_scene": "destination or empty for exit",
            "description": "what triggers this route",
            "trigger_type": "auto|challenge_complete|npc_dialogue|item_pickup|proximity",
            "conditions": [{{"type": "challenge_complete", "value": "challenge name"}}],
            "bidirectional": false
        }}
    ]
}}"""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        return {"routes": _parse_json(response).get("routes", [])}
    except Exception:
        return {"routes": []}


# ─────────────────────────────────────────────
# Node: Generate System Prompt
# ─────────────────────────────────────────────


async def generate_system_prompt(state: FullSceneGenState) -> dict:
    """Generate the scene's runtime AI prompt for NPC dialogue."""
    config = state.get("scene_config", {})
    npcs = state.get("npcs", [])
    challenges = state.get("challenges", [])
    quests = state.get("quests", [])

    npc_summary = "\n".join(
        [
            f"- {n.get('name')}: {n.get('role')}, embodies {n.get('facet')}. {n.get('personality', '')}"
            for n in npcs
        ]
    )
    challenge_summary = "\n".join(
        [
            f"- {c.get('name')}: {c.get('description', '')} (facets: {', '.join(c.get('facets', []))})"
            for c in challenges
        ]
    )
    quest_summary = "\n".join(
        [
            f"- {q.get('sequence_order')}. {q.get('name')}: {q.get('description', '')}"
            for q in quests
        ]
    )

    user_msg = f"""Write a system prompt for the AI driving NPC dialogue at runtime.

Scene: {config.get('scene_name')} ({config.get('scene_type')})
Description: {config.get('description', state['prompt'])}
Mood: {config.get('mood', 'welcoming')}
Lighting: {config.get('lighting', 'day')}, Weather: {config.get('weather', 'clear')}
Target Facets: {', '.join(state.get('target_facets', ['E']))}

NPCs:
{npc_summary}

Challenges:
{challenge_summary}

Story Arc:
{quest_summary}

Return JSON:
{{
    "system_prompt": "Full multi-paragraph system prompt text",
    "generation_notes": "Brief notes about design choices (for the creator)"
}}

The system prompt should guide the AI to maintain atmosphere, keep NPCs in character,
nudge players toward challenges, score HEARTS facets, and trigger transitions."""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        parsed = _parse_json(response)
        return {
            "system_prompt": parsed.get("system_prompt", ""),
            "generation_notes": parsed.get("generation_notes", ""),
        }
    except Exception:
        return {"system_prompt": "", "generation_notes": ""}


# ─────────────────────────────────────────────
# Node: Compose final response
# ─────────────────────────────────────────────


async def compose_response(state: FullSceneGenState) -> dict:
    """Assemble the complete generation result."""
    config = state.get("scene_config", {})
    dims = state.get("dimensions", {"width": 16, "height": 16})

    scene = {
        "scene_name": config.get("scene_name", "Generated Scene"),
        "scene_type": config.get("scene_type", "forest"),
        "description": config.get("description", ""),
        "lighting": config.get("lighting", "day"),
        "weather": config.get("weather", "clear"),
        "target_facets": state.get("target_facets", []),
        "dimensions": dims,
        "spawn_points": config.get("spawn_points", []),
        "zone_descriptions": config.get("zone_descriptions", []),
    }

    return {"scene_config": scene, "error": ""}


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────


def _parse_json(text: str) -> dict:
    """Parse JSON from AI response (Claude/GPT/Gemini), stripping markdown fences if present."""
    return parse_json_response(text)


# ─────────────────────────────────────────────
# Graph Assembly
# ─────────────────────────────────────────────


def build_full_scene_gen_graph():
    workflow = StateGraph(FullSceneGenState)

    workflow.add_node("parse_prompt", parse_prompt)
    workflow.add_node("load_asset_catalog", load_asset_catalog)
    workflow.add_node("generate_layout", generate_layout)
    workflow.add_node("generate_npcs", generate_npcs)
    workflow.add_node("generate_challenges", generate_challenges)
    workflow.add_node("generate_quests", generate_quests)
    workflow.add_node("generate_routes", generate_routes)
    workflow.add_node("generate_system_prompt", generate_system_prompt)
    workflow.add_node("compose", compose_response)

    workflow.set_entry_point("parse_prompt")
    workflow.add_edge("parse_prompt", "load_asset_catalog")
    workflow.add_edge("load_asset_catalog", "generate_layout")
    workflow.add_edge("generate_layout", "generate_npcs")
    workflow.add_edge("generate_npcs", "generate_challenges")
    workflow.add_edge("generate_challenges", "generate_quests")
    workflow.add_edge("generate_quests", "generate_routes")
    workflow.add_edge("generate_routes", "generate_system_prompt")
    workflow.add_edge("generate_system_prompt", "compose")
    workflow.add_edge("compose", END)

    return workflow.compile()


full_scene_gen_graph = build_full_scene_gen_graph()


async def run_full_scene_generation(
    prompt: str,
    scene_name: str = "",
    scene_type: str = "",
    target_facets: list[str] | None = None,
    dimensions: dict | None = None,
) -> dict:
    """Entry point — single prompt → full scene package with asset placements."""
    initial_state: FullSceneGenState = {
        "prompt": prompt,
        "scene_name": scene_name,
        "scene_type": scene_type,
        "target_facets": target_facets or [],
        "dimensions": dimensions or {"width": 16, "height": 16},
        "asset_catalog": [],
        "asset_catalog_summary": "",
        "scene_config": {},
        "asset_placements": [],
        "npcs": [],
        "challenges": [],
        "quests": [],
        "routes": [],
        "system_prompt": "",
        "generation_notes": "",
        "error": "",
    }

    result = await full_scene_gen_graph.ainvoke(initial_state)

    return {
        "scene": result.get("scene_config", {}),
        "asset_placements": result.get("asset_placements", []),
        "npcs": result.get("npcs", []),
        "challenges": result.get("challenges", []),
        "quests": result.get("quests", []),
        "routes": result.get("routes", []),
        "system_prompt": result.get("system_prompt", ""),
        "generation_notes": result.get("generation_notes", ""),
    }


async def run_scene_refinement(prompt: str, current: dict) -> dict:
    """Refine existing generation with a follow-up prompt."""
    user_msg = f"""The creator wants to modify the generated scene.

Current content:
{json.dumps(current, indent=2)}

Refinement request: "{prompt}"

Apply changes and return the COMPLETE updated content in the same JSON structure:
{{
    "scene": {{...}},
    "asset_placements": [{{...}}],
    "npcs": [{{...}}],
    "challenges": [{{...}}],
    "quests": [{{...}}],
    "routes": [{{...}}],
    "system_prompt": "...",
    "generation_notes": "what changed and why"
}}

Only modify what was requested. Keep everything else intact.
For asset_placements, use the same asset_name values from the catalog."""

    response = await invoke_claude(GENERATION_SYSTEM_PROMPT, user_msg, model="sonnet")
    try:
        return _parse_json(response)
    except Exception:
        return current
