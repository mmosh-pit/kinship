"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ASSET KNOWLEDGE GENERATOR                                  ║
║                                                                               ║
║  Uses Claude Vision to analyze uploaded assets and generate:                  ║
║  • Visual description                                                         ║
║  • Placement rules (requires, provides, avoids)                               ║
║  • Contextual functions                                                       ║
║  • Grouping patterns                                                          ║
║                                                                               ║
║  This metadata is stored with the asset and used for validation.              ║
║  NO HARDCODED RULES - everything inferred from the actual image.              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import json
import logging
import base64
from typing import Optional
import httpx

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  KNOWLEDGE SCHEMA
# ═══════════════════════════════════════════════════════════════════════════════

# Valid affordances (what PLAYER can do with asset)
VALID_AFFORDANCES = [
    # Physics/Movement
    "push",
    "pull",
    "drag",
    "throw",
    "stack",
    "roll",
    "slide",
    "bounce",
    # Collection
    "collect",
    "gather",
    "harvest",
    "mine",
    "fish",
    "forage",
    "loot",
    # Interaction
    "toggle",
    "activate",
    "trigger",
    "press",
    "open",
    "close",
    "lock",
    "unlock",
    # Combat
    "attack",
    "defend",
    "equip",
    "heal",
    "buff",
    "debuff",
    # Farming
    "plant",
    "water",
    "tend",
    "breed",
    # Crafting
    "combine",
    "cook",
    "forge",
    "brew",
    "enchant",
    "upgrade",
    # Social
    "talk",
    "trade",
    "gift",
    "befriend",
    "convince",
    "recruit",
    # Survival
    "consume",
    "rest",
    "shelter",
    "light",
    # Management
    "assign",
    "produce",
    "schedule",
    "hire",
    "expand",
    # Navigation
    "climb",
    "swim",
    "ride",
    "teleport",
]

# Valid capabilities (what OBJECT can do)
VALID_CAPABILITIES = [
    # Physical
    "block_path",
    "apply_weight",
    "provide_support",
    "bridge_gap",
    "create_shadow",
    # State Change
    "trigger_event",
    "toggle_state",
    "emit_signal",
    "receive_signal",
    # Storage
    "store_items",
    "hide_contents",
    "dispense_items",
    # Production
    "grow",
    "produce_resource",
    "spawn_entity",
    "transform",
    # Environment
    "provide_light",
    "provide_heat",
    "provide_shelter",
    "create_hazard",
    # Interaction
    "display_text",
    "play_sound",
    "show_ui",
    # Combat
    "deal_damage",
    "apply_effect",
    "heal_entity",
]

# ═══════════════════════════════════════════════════════════════════════════════
#  AFFORDANCE NORMALIZATION
# ═══════════════════════════════════════════════════════════════════════════════
# Maps synonyms/variations to canonical affordances
# This ensures consistent vocabulary from Vision model output

AFFORDANCE_NORMALIZATION = {
    # Push synonyms
    "shove": "push",
    "move": "push",
    "slide": "push",
    "roll": "push",
    "nudge": "push",
    # Pull synonyms
    "tug": "pull",
    "yank": "pull",
    # Throw synonyms
    "toss": "throw",
    "hurl": "throw",
    "launch": "throw",
    # Stack synonyms
    "pile": "stack",
    "heap": "stack",
    "layer": "stack",
    # Collect synonyms
    "pick_up": "collect",
    "grab": "collect",
    "take": "collect",
    "get": "collect",
    "pickup": "collect",
    "gather": "collect",
    "loot": "collect",
    "forage": "collect",
    # Toggle synonyms
    "switch": "toggle",
    "flip": "toggle",
    "turn": "toggle",
    # Activate synonyms
    "use": "activate",
    "interact": "activate",
    "press": "activate",
    "trigger": "activate",
    "pull": "activate",  # for levers
    # Open synonyms
    "unlock": "open",
    "access": "open",
    # Attack synonyms
    "hit": "attack",
    "strike": "attack",
    "slash": "attack",
    "shoot": "attack",
    # Consume synonyms
    "eat": "consume",
    "drink": "consume",
    "use_item": "consume",
    # Talk synonyms
    "speak": "talk",
    "chat": "talk",
    "converse": "talk",
    "dialogue": "talk",
}

CAPABILITY_NORMALIZATION = {
    # Block synonyms
    "obstruct": "block_path",
    "solid": "block_path",
    "impassable": "block_path",
    # Weight synonyms
    "heavy": "apply_weight",
    "weigh_down": "apply_weight",
    "press_down": "apply_weight",
    # Support synonyms
    "hold_up": "provide_support",
    "carry": "provide_support",
    # Light synonyms
    "illuminate": "provide_light",
    "glow": "provide_light",
    "shine": "provide_light",
    # Hazard synonyms
    "damage": "create_hazard",
    "hurt": "create_hazard",
    "dangerous": "create_hazard",
}


def normalize_affordance(affordance: str) -> str:
    """Normalize an affordance to canonical form."""
    affordance = affordance.lower().strip().replace(" ", "_")
    return AFFORDANCE_NORMALIZATION.get(affordance, affordance)


def normalize_capability(capability: str) -> str:
    """Normalize a capability to canonical form."""
    capability = capability.lower().strip().replace(" ", "_")
    return CAPABILITY_NORMALIZATION.get(capability, capability)


def normalize_and_validate_affordances(affordances: list[str]) -> list[str]:
    """Normalize affordances and filter to valid ones only."""
    result = []
    for aff in affordances:
        normalized = normalize_affordance(aff)
        if normalized in VALID_AFFORDANCES and normalized not in result:
            result.append(normalized)
    return result


def normalize_and_validate_capabilities(capabilities: list[str]) -> list[str]:
    """Normalize capabilities and filter to valid ones only."""
    result = []
    for cap in capabilities:
        normalized = normalize_capability(cap)
        if normalized in VALID_CAPABILITIES and normalized not in result:
            result.append(normalized)
    return result


ASSET_KNOWLEDGE_SCHEMA = {
    # Visual analysis
    "visual_description": "",
    "color_palette": [],
    "visual_mood": [],
    "art_style": "",
    # Scene usage
    "scene_role": "",  # focal_point, furniture, vegetation, scatter, etc.
    "suitable_scenes": [],  # forest, village, indoor, etc.
    "suitable_facets": [],  # H, E, A, R, T, Si, So
    # Pairing
    "pair_with": [],  # Asset names that go well together
    "avoid_near": [],  # Asset names to avoid placing nearby
    "composition_notes": "",
    # Narrative
    "narrative_hook": "",
    "therapeutic_use": "",
    # ═══ NEW: AFFORDANCES & CAPABILITIES ═══
    "affordances": [],
    # What PLAYER can do with this asset
    # e.g., ["push", "stack"] for a stone
    "capabilities": [],
    # What this OBJECT can do
    # e.g., ["block_path", "apply_weight"] for a stone
    # ═══ PLACEMENT RULES (generated by Vision analysis) ═══
    "placement_type": "standalone",
    # Options: standalone, attached, grouped, contextual, surface
    "requires_nearby": [],
    # What must be nearby for valid placement
    # e.g., ["building", "wall"] for a door
    "requires_ground": [],
    # What ground types are valid
    # e.g., ["grass", "dirt"] for outdoor plants
    "attachment_point": "",
    # Where it attaches: front, back, top, side, any
    "provides_attachment": [],
    # What attachment points it provides
    # e.g., ["front", "side"] for a building
    "provides_surface": "",
    # What surface type it creates
    # e.g., "indoor" for a building, "bridge" for a plank
    "avoids_nearby": [],
    # What should NOT be placed nearby
    "avoids_ground": [],
    # What ground types don't work
    # e.g., ["water"] for land objects
    "min_group_size": 1,
    "max_group_size": 1,
    "group_pattern": "single",
    # Options: single, cluster, line, ring, scatter
    "context_functions": {},
    # How function changes by context
    # e.g., {"over:water": "bridge", "near:fire": "cooking"}
    "min_distance_from_similar": 0,
    # Minimum tiles between same asset type
    "placement_hint": "",
    # Human-readable placement guidance
    "error_message": "",
    # Message when placement is invalid
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CLAUDE VISION PROMPT
# ═══════════════════════════════════════════════════════════════════════════════

ANALYSIS_SYSTEM_PROMPT = """You are an expert game asset analyst for an isometric game builder.
Analyze game sprite images to extract:
1. Visual characteristics
2. AFFORDANCES - what a PLAYER can do with this asset
3. CAPABILITIES - what this OBJECT can do in the game world
4. Placement rules

You understand:
- How game objects relate spatially (doors attach to buildings, etc.)
- What ground types work for different objects
- How objects should be grouped or spaced
- Context-dependent functions (log over water = bridge)
- Game mechanics (pushing, collecting, unlocking, etc.)

Always return valid JSON matching the schema exactly."""


def build_analysis_prompt(
    asset_name: str, asset_type: str, existing_tags: list[str]
) -> str:
    """Build the analysis prompt for Claude Vision."""

    return f"""Analyze this game asset image: "{asset_name}" (type: {asset_type})
Existing tags: {existing_tags}

Return a JSON object with ALL of these fields:

{{
  "visual_description": "Detailed description of what this asset looks like",
  "color_palette": ["#hex1", "#hex2", "#hex3"],
  "visual_mood": ["cozy", "natural"],
  "art_style": "pixel art / hand-drawn / 3D rendered / etc",
  
  "scene_role": "focal_point | furniture | boundary | vegetation | scatter | prop | lighting",
  "suitable_scenes": ["forest", "village", "indoor"],
  "suitable_facets": ["H", "E", "A"],
  
  "pair_with": ["related_asset_name"],
  "avoid_near": ["conflicting_asset_name"],
  "composition_notes": "How to use this in a scene",
  
  "narrative_hook": "Story potential for this asset",
  "therapeutic_use": "How this could support wellbeing",
  
  "affordances": [],
  "capabilities": [],
  
  "placement_type": "standalone | attached | grouped | contextual | surface",
  
  "requires_nearby": [],
  "requires_ground": [],
  "attachment_point": "",
  
  "provides_attachment": [],
  "provides_surface": "",
  
  "avoids_nearby": [],
  "avoids_ground": [],
  
  "min_group_size": 1,
  "max_group_size": 1,
  "group_pattern": "single | cluster | line | ring | scatter",
  
  "context_functions": {{}},
  
  "min_distance_from_similar": 0,
  
  "placement_hint": "single | pair | cluster | scatter | line | ring | border | grid",
  "error_message": ""
}}

═══════════════════════════════════════════════════════════════════════════════
AFFORDANCES (what PLAYER can do with this asset)
═══════════════════════════════════════════════════════════════════════════════

Choose from these ONLY:

Physics/Movement: push, pull, drag, throw, stack, roll, slide, bounce
Collection: collect, gather, harvest, mine, fish, forage, loot
Interaction: toggle, activate, trigger, press, open, close, lock, unlock
Combat: attack, defend, equip, heal, buff, debuff
Farming: plant, water, tend, breed
Crafting: combine, cook, forge, brew, enchant, upgrade
Social: talk, trade, gift, befriend, convince, recruit
Survival: consume, rest, shelter, light
Management: assign, produce, schedule, hire, expand
Navigation: climb, swim, ride, teleport

Examples:
- Stone/Rock → ["push", "throw", "stack"]
- Berry/Fruit → ["collect", "consume"]
- Lever/Switch → ["toggle", "activate"]
- Chest/Box → ["open", "unlock"]
- Sword/Weapon → ["attack", "equip"]
- Seed → ["plant"]
- NPC/Character → ["talk", "trade"]
- Bed → ["rest"]
- Log/Plank → ["push", "drag"]
- Door → ["open", "close", "unlock"]

═══════════════════════════════════════════════════════════════════════════════
CAPABILITIES (what this OBJECT can do)
═══════════════════════════════════════════════════════════════════════════════

Choose from these ONLY:

Physical: block_path, apply_weight, provide_support, bridge_gap, create_shadow
State Change: trigger_event, toggle_state, emit_signal, receive_signal
Storage: store_items, hide_contents, dispense_items
Production: grow, produce_resource, spawn_entity, transform
Environment: provide_light, provide_heat, provide_shelter, create_hazard
Interaction: display_text, play_sound, show_ui
Combat: deal_damage, apply_effect, heal_entity

Examples:
- Stone/Rock → ["block_path", "apply_weight"]
- Lever → ["trigger_event", "toggle_state"]
- Chest → ["store_items", "hide_contents"]
- Torch → ["provide_light", "provide_heat"]
- Seed → ["grow", "produce_resource"]
- Spike/Trap → ["create_hazard", "deal_damage"]
- Sign → ["display_text"]
- Building → ["provide_shelter", "block_path"]
- Log over water → ["bridge_gap", "provide_support"]

═══════════════════════════════════════════════════════════════════════════════
PLACEMENT ANALYSIS RULES
═══════════════════════════════════════════════════════════════════════════════

IMPORTANT: placement_hint must be ONE of: single, pair, cluster, scatter, line, ring, border, grid
(Use composition_notes for detailed placement instructions)

1. ATTACHED assets (doors, windows, signs, ladders, shelves):
   - placement_type: "attached"
   - placement_hint: "single"
   - requires_nearby: what they attach to ["building", "wall", "structure"]
   - attachment_point: "front" / "side" / "top"
   - error_message: what's wrong if placed standalone

2. STRUCTURAL assets (buildings, walls, platforms):
   - placement_type: "standalone" 
   - placement_hint: "single"
   - provides_attachment: ["front", "side", "top"]
   - provides_surface: "indoor" if it has interior
   - avoids_ground: ["water"] usually

3. GROUPED assets (flowers, grass, pebbles):
   - placement_type: "grouped"
   - placement_hint: "cluster" or "scatter"
   - min_group_size: 3-5 typically
   - max_group_size: 8-12 typically
   - group_pattern: "cluster" for flowers, "scatter" for debris

4. CONTEXTUAL assets (logs, planks, ropes):
   - placement_type: "contextual"
   - placement_hint: "line" for bridges, "cluster" for piles
   - context_functions: {{"over:water": "bridge", "stacked": "pile"}}

5. SURFACE-SPECIFIC assets (indoor furniture, dock pieces):
   - placement_type: "surface"
   - placement_hint: "single" or "pair"
   - requires_ground: ["indoor", "wood_floor"] or ["water_edge"]
   - avoids_ground: ["grass", "outdoor"]

6. STANDALONE assets (trees, rocks, standalone decorations):
   - placement_type: "standalone"
   - placement_hint: "single" for unique items, "scatter" for environmental
   - min_distance_from_similar: 2-3 for trees, 0 for rocks
   - requires_ground: ["grass", "dirt"] for natural items

Be specific to THIS asset based on what you see in the image.
Return ONLY valid JSON, no other text."""


# ═══════════════════════════════════════════════════════════════════════════════
#  KNOWLEDGE GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_asset_knowledge(
    asset_id: str,
    asset_name: str,
    asset_type: str,
    image_url: str,
    existing_tags: list[str] = None,
    *,
    anthropic_api_key: str,
) -> dict:
    """
    Generate knowledge metadata for an asset using Claude Vision.

    Args:
        asset_id: Unique asset identifier
        asset_name: Display name of asset
        asset_type: tile, sprite, object, etc.
        image_url: URL to the asset image
        existing_tags: Tags already assigned to asset
        anthropic_api_key: API key for Claude

    Returns:
        Knowledge dict matching ASSET_KNOWLEDGE_SCHEMA
    """

    existing_tags = existing_tags or []

    # Fetch image and convert to base64
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(image_url)
            response.raise_for_status()
            image_data = base64.b64encode(response.content).decode("utf-8")

            # Detect media type
            content_type = response.headers.get("content-type", "image/png")
            if "jpeg" in content_type or "jpg" in content_type:
                media_type = "image/jpeg"
            elif "gif" in content_type:
                media_type = "image/gif"
            elif "webp" in content_type:
                media_type = "image/webp"
            else:
                media_type = "image/png"
    except Exception as e:
        logger.error(f"Failed to fetch image for {asset_name}: {e}")
        return _get_default_knowledge(asset_name)

    # Build prompt
    user_prompt = build_analysis_prompt(asset_name, asset_type, existing_tags)

    # Call Claude Vision API
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": anthropic_api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-sonnet-4-20250514",
                    "max_tokens": 2000,
                    "system": ANALYSIS_SYSTEM_PROMPT,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": image_data,
                                    },
                                },
                                {
                                    "type": "text",
                                    "text": user_prompt,
                                },
                            ],
                        }
                    ],
                },
                timeout=60.0,
            )
            response.raise_for_status()
            result = response.json()
    except Exception as e:
        logger.error(f"Claude Vision API failed for {asset_name}: {e}")
        return _get_default_knowledge(asset_name)

    # Parse response
    try:
        content = result.get("content", [{}])[0].get("text", "{}")

        # Clean up response (remove markdown if present)
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        knowledge = json.loads(content.strip())

        # Ensure all required fields exist
        for key, default_value in ASSET_KNOWLEDGE_SCHEMA.items():
            if key not in knowledge:
                knowledge[key] = default_value

        logger.info(
            f"Generated knowledge for {asset_name}: placement_type={knowledge.get('placement_type')}"
        )
        return knowledge

    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse knowledge JSON for {asset_name}: {e}")
        return _get_default_knowledge(asset_name)


def _get_default_knowledge(asset_name: str) -> dict:
    """Return default knowledge when analysis fails."""
    return {
        **ASSET_KNOWLEDGE_SCHEMA,
        "visual_description": f"Game asset: {asset_name}",
        "placement_type": "standalone",
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  BATCH KNOWLEDGE GENERATION
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_knowledge_batch(
    assets: list[dict],
    *,
    anthropic_api_key: str,
    max_concurrent: int = 5,
) -> dict[str, dict]:
    """
    Generate knowledge for multiple assets.

    Returns dict mapping asset_id → knowledge.
    """
    import asyncio

    results = {}
    semaphore = asyncio.Semaphore(max_concurrent)

    async def process_asset(asset: dict):
        async with semaphore:
            asset_id = asset.get("id", "")
            knowledge = await generate_asset_knowledge(
                asset_id=asset_id,
                asset_name=asset.get("name", "unknown"),
                asset_type=asset.get("type", "object"),
                image_url=asset.get("file_url", ""),
                existing_tags=asset.get("tags", []),
                anthropic_api_key=anthropic_api_key,
            )
            results[asset_id] = knowledge

    await asyncio.gather(*[process_asset(a) for a in assets])

    return results


# ═══════════════════════════════════════════════════════════════════════════════
#  UPDATE EXISTING ASSETS
# ═══════════════════════════════════════════════════════════════════════════════


async def regenerate_placement_rules(
    asset: dict,
    *,
    anthropic_api_key: str,
) -> dict:
    """
    Regenerate just the placement rules for an existing asset.

    Useful when updating the analysis prompt without re-doing full knowledge.
    """

    # Get full knowledge
    knowledge = await generate_asset_knowledge(
        asset_id=asset.get("id", ""),
        asset_name=asset.get("name", "unknown"),
        asset_type=asset.get("type", "object"),
        image_url=asset.get("file_url", ""),
        existing_tags=asset.get("tags", []),
        anthropic_api_key=anthropic_api_key,
    )

    # Extract just placement fields
    placement_fields = {
        "placement_type": knowledge.get("placement_type", "standalone"),
        "requires_nearby": knowledge.get("requires_nearby", []),
        "requires_ground": knowledge.get("requires_ground", []),
        "attachment_point": knowledge.get("attachment_point", ""),
        "provides_attachment": knowledge.get("provides_attachment", []),
        "provides_surface": knowledge.get("provides_surface", ""),
        "avoids_nearby": knowledge.get("avoids_nearby", []),
        "avoids_ground": knowledge.get("avoids_ground", []),
        "min_group_size": knowledge.get("min_group_size", 1),
        "max_group_size": knowledge.get("max_group_size", 1),
        "group_pattern": knowledge.get("group_pattern", "single"),
        "context_functions": knowledge.get("context_functions", {}),
        "min_distance_from_similar": knowledge.get("min_distance_from_similar", 0),
        "placement_hint": knowledge.get("placement_hint", ""),
        "error_message": knowledge.get("error_message", ""),
    }

    return placement_fields


# ═══════════════════════════════════════════════════════════════════════════════
#  API WRAPPER FUNCTIONS
#  These wrapper functions are used by the /api/asset-knowledge routes
# ═══════════════════════════════════════════════════════════════════════════════


async def generate_knowledge_for_asset(
    asset: dict,
    catalog_names: list[str] = None,
) -> dict:
    """
    Wrapper function for API routes - generates knowledge for a single asset.

    Gets API key from settings, calls generate_asset_knowledge, returns result.

    Args:
        asset: Asset dict from kinship-assets API
        catalog_names: Optional list of all asset names (for context)

    Returns:
        dict with "knowledge" key containing generated knowledge
    """
    from app.config import get_settings

    settings = get_settings()
    api_key = settings.anthropic_api_key
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set in settings/.env")
        return {
            "knowledge": _get_default_knowledge(asset.get("name", "unknown")),
            "error": "API key not configured",
        }

    knowledge = await generate_asset_knowledge(
        asset_id=asset.get("id", ""),
        asset_name=asset.get("name", "unknown"),
        asset_type=asset.get("type", "object"),
        image_url=asset.get("file_url", ""),
        existing_tags=asset.get("tags", []),
        anthropic_api_key=api_key,
    )

    return {"knowledge": knowledge}


async def _save_knowledge(asset_id: str, result: dict) -> bool:
    """
    Save generated knowledge to kinship-assets service.

    Calls PUT /assets/{asset_id}/knowledge endpoint.

    Args:
        asset_id: Asset UUID
        result: Dict containing "knowledge" key with knowledge data

    Returns:
        True if save succeeded, False otherwise
    """
    from app.config import get_settings

    settings = get_settings()
    knowledge = result.get("knowledge", {})

    if not knowledge:
        logger.warning(f"No knowledge to save for asset {asset_id}")
        return False

    url = f"{settings.assets_service_url}/assets/{asset_id}/knowledge"
    logger.info(f"[_save_knowledge] Saving to {url}")
    logger.info(
        f"[_save_knowledge] visual_description: {knowledge.get('visual_description', '')[:50]}..."
    )

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.put(
                url,
                json=knowledge,
            )

            logger.info(f"[_save_knowledge] Response status: {response.status_code}")

            if response.status_code in (200, 201):
                logger.info(
                    f"[_save_knowledge] ✅ Saved knowledge for asset {asset_id}"
                )
                return True
            else:
                logger.error(
                    f"[_save_knowledge] ❌ Failed for {asset_id}: {response.status_code} - {response.text[:500]}"
                )
                return False

    except httpx.ConnectError as e:
        logger.error(f"[_save_knowledge] Connection error to kinship-assets: {e}")
        return False
    except httpx.TimeoutException as e:
        logger.error(f"[_save_knowledge] Timeout saving knowledge for {asset_id}: {e}")
        return False
    except Exception as e:
        logger.error(
            f"[_save_knowledge] Unexpected error saving knowledge for {asset_id}: {e}"
        )
        return False


async def embed_asset_knowledge(asset: dict) -> dict:
    """
    Embed a single asset's knowledge into Pinecone.

    This is a passthrough to asset_embeddings.embed_single_asset.
    Kept for API compatibility.

    Args:
        asset: Asset dict with knowledge attached

    Returns:
        Result dict from embedding operation
    """
    from app.services.asset_embeddings import embed_single_asset

    try:
        result = await embed_single_asset(asset)
        return {"status": "ok", "asset_id": asset.get("id"), "result": result}
    except Exception as e:
        logger.error(f"Failed to embed asset {asset.get('id')}: {e}")
        return {"status": "error", "asset_id": asset.get("id"), "error": str(e)}


async def generate_knowledge_for_all(
    assets: list[dict] = None,
    skip_existing: bool = True,
) -> dict:
    """
    Generate knowledge for multiple assets.

    Args:
        assets: List of asset dicts. If None, fetches from kinship-assets.
        skip_existing: If True, skip assets that already have knowledge.

    Returns:
        Summary dict with counts: {generated, skipped, failed, total}
    """
    from app.services import assets_client
    from app.config import get_settings

    # Fetch assets if not provided
    if assets is None:
        assets = await assets_client.fetch_all_assets()

    settings = get_settings()
    api_key = settings.anthropic_api_key
    if not api_key:
        logger.error("ANTHROPIC_API_KEY not set in settings/.env")
        return {"status": "error", "message": "API key not configured"}

    generated = 0
    skipped = 0
    failed = 0

    for asset in assets:
        asset_id = asset.get("id", "")
        asset_name = asset.get("name", "unknown")

        # Check if already has knowledge
        existing_knowledge = asset.get("knowledge")
        if (
            skip_existing
            and existing_knowledge
            and existing_knowledge.get("visual_description")
        ):
            logger.debug(f"Skipping {asset_name} - already has knowledge")
            skipped += 1
            continue

        try:
            # Generate knowledge
            knowledge = await generate_asset_knowledge(
                asset_id=asset_id,
                asset_name=asset_name,
                asset_type=asset.get("type", "object"),
                image_url=asset.get("file_url", ""),
                existing_tags=asset.get("tags", []),
                anthropic_api_key=api_key,
            )

            # Save to kinship-assets
            save_result = await _save_knowledge(asset_id, {"knowledge": knowledge})

            if save_result:
                generated += 1
                logger.info(f"Generated knowledge for {asset_name}")
            else:
                failed += 1
                logger.warning(f"Generated but failed to save for {asset_name}")

        except Exception as e:
            failed += 1
            logger.error(f"Failed to generate knowledge for {asset_name}: {e}")

    return {
        "status": "ok",
        "total": len(assets),
        "generated": generated,
        "skipped": skipped,
        "failed": failed,
    }
