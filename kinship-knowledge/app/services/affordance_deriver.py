"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AFFORDANCE DERIVER                                          ║
║                                                                               ║
║  PROBLEM:                                                                     ║
║  sprite_analyzer (runs on upload) gives tags + rules but NO affordances.      ║
║  knowledge_generator (runs separately) gives affordances but might not run.   ║
║  build_affordance_map needs knowledge.affordances to match mechanics.         ║
║                                                                               ║
║  SOLUTION: Three-layer affordance resolution                                  ║
║  Layer 1: Use knowledge.affordances if present (from knowledge_generator)     ║
║  Layer 2: Derive affordances from sprite_analyzer metadata (deterministic)    ║
║  Layer 3: Infer from tags as last resort                                      ║
║                                                                               ║
║  ALSO: Normalizes any existing affordances using the canonical vocabulary     ║
║  from knowledge_generator.py                                                  ║
║                                                                               ║
║  USAGE:                                                                       ║
║  Call ensure_affordances(assets) before passing to build_affordance_map.      ║
║  This mutates the asset dicts in place to add/normalize affordances.          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DERIVATION RULES: metadata → affordances
# ═══════════════════════════════════════════════════════════════════════════════
# These map sprite_analyzer fields to mechanic affordances deterministically.
# No LLM needed. If the sprite_analyzer says is_movable=true, the asset
# affords "push" and "drag". Period.

RULES_TO_AFFORDANCES = {
    # rules.is_movable → push/drag
    ("rules", "is_movable", True): ["push", "drag"],
    # rules.is_destructible → attack
    ("rules", "is_destructible", True): ["attack"],
}

INTERACTION_TO_AFFORDANCES = {
    # interaction.type → affordances
    "tap": ["activate", "toggle", "collect"],
    "proximity": ["talk"],
    "none": [],
}

TILE_CONFIG_TO_CAPABILITIES = {
    # tile_config.walkable → capabilities
    "blocked": ["block_path"],
    "hazard": ["create_hazard"],
    "slow": [],
    "walkable": [],
}

ASSET_TYPE_TO_AFFORDANCES = {
    # asset_type → base affordances
    "npc": ["talk"],
    "character": ["talk"],
    "avatar": [],
    "sprite": [],  # Living things — derive from movement
    "object": [],  # Static objects — derive from rules
    "tile": [],
    "animation": [],
    "ui": [],
}

MOVEMENT_TO_AFFORDANCES = {
    # movement.type → for living sprites
    "wander": ["talk"],  # Wandering NPCs can be talked to
    "static": [],
}

# ═══════════════════════════════════════════════════════════════════════════════
#  TAG-BASED INFERENCE (last resort)
# ═══════════════════════════════════════════════════════════════════════════════
# Maps common tags to affordances when nothing else works.

TAG_TO_AFFORDANCES = {
    # Nature/collectible
    "berry": ["collect", "consume"],
    "fruit": ["collect", "consume"],
    "mushroom": ["collect", "consume"],
    "flower": ["collect"],
    "herb": ["collect", "consume"],
    "gem": ["collect"],
    "coin": ["collect"],
    "crystal": ["collect"],
    "feather": ["collect"],
    "shell": ["collect"],
    "collectible": ["collect"],
    "item": ["collect"],
    "treasure": ["collect"],
    "loot": ["collect"],
    # Pushable/movable
    "rock": ["push", "stack"],
    "stone": ["push", "stack"],
    "boulder": ["push"],
    "crate": ["push", "drag"],
    "barrel": ["push", "drag"],
    "box": ["push", "open"],
    "block": ["push", "stack"],
    "log": ["push", "drag"],
    # Interactive
    "lever": ["toggle", "activate"],
    "switch": ["toggle", "activate"],
    "button": ["activate"],
    "door": ["open", "close", "unlock"],
    "gate": ["open", "unlock"],
    "chest": ["open", "unlock"],
    "key": ["collect", "unlock"],
    "lock": ["unlock"],
    # Combat
    "sword": ["attack", "equip"],
    "weapon": ["attack", "equip"],
    "shield": ["defend", "equip"],
    "armor": ["equip"],
    "potion": ["collect", "consume"],
    # Social/NPC
    "npc": ["talk"],
    "character": ["talk"],
    "merchant": ["talk", "trade"],
    "villager": ["talk"],
    "guard": ["talk"],
    # Farming
    "seed": ["plant"],
    "soil": ["plant"],
    "crop": ["harvest"],
    "water": ["water"],
    "watering_can": ["water"],
    # Crafting
    "anvil": ["combine", "forge"],
    "furnace": ["cook", "forge"],
    "cauldron": ["combine", "brew"],
    "workbench": ["combine"],
    # Environment
    "torch": ["light"],
    "campfire": ["light"],
    "lantern": ["light"],
    "tent": ["shelter"],
    "bed": ["rest"],
    "bench": ["rest"],
    # Hazards
    "spike": [],  # Capabilities, not affordances
    "trap": [],
    "fire": [],
    "lava": [],
    # Structural
    "bridge": [],
    "plank": ["push", "drag"],
    "rope": ["collect"],
    "ladder": ["climb"],
    "stairs": ["climb"],
    # Pushable nature
    "pushable": ["push"],
    "draggable": ["drag"],
    "stackable": ["stack"],
}

TAG_TO_CAPABILITIES = {
    "rock": ["block_path", "apply_weight"],
    "stone": ["block_path", "apply_weight"],
    "boulder": ["block_path", "apply_weight"],
    "wall": ["block_path"],
    "fence": ["block_path"],
    "tree": ["block_path"],
    "building": ["block_path", "provide_shelter"],
    "house": ["block_path", "provide_shelter"],
    "torch": ["provide_light", "provide_heat"],
    "campfire": ["provide_light", "provide_heat"],
    "lantern": ["provide_light"],
    "spike": ["create_hazard", "deal_damage"],
    "trap": ["create_hazard"],
    "lava": ["create_hazard"],
    "fire": ["create_hazard", "provide_heat"],
    "lever": ["trigger_event", "toggle_state"],
    "switch": ["trigger_event", "toggle_state"],
    "button": ["trigger_event"],
    "sign": ["display_text"],
    "chest": ["store_items", "hide_contents"],
    "barrel": ["store_items"],
    "crate": ["store_items"],
    "log": ["provide_support", "bridge_gap"],
    "plank": ["bridge_gap", "provide_support"],
    "seed": ["grow", "produce_resource"],
    "crop": ["produce_resource"],
    "plate": ["trigger_event", "apply_weight"],
    "pressure_plate": ["trigger_event", "apply_weight"],
}


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN FUNCTION: ensure_affordances
# ═══════════════════════════════════════════════════════════════════════════════


def ensure_affordances(assets: list[dict]) -> list[dict]:
    """
    Ensure every asset has affordances and capabilities.

    Three-layer resolution:
    1. Use existing knowledge.affordances (from knowledge_generator)
    2. Derive from sprite_analyzer metadata (rules, interaction, type)
    3. Infer from tags as last resort

    Normalizes all affordances to canonical vocabulary.
    Mutates assets in place AND returns them.

    Args:
        assets: List of asset dicts (mutated in place)

    Returns:
        Same list with affordances/capabilities guaranteed
    """
    from app.services.knowledge_generator import (
        normalize_and_validate_affordances,
        normalize_and_validate_capabilities,
    )

    enriched = 0
    already_had = 0

    for asset in assets:
        if not isinstance(asset, dict):
            continue

        knowledge = asset.get("knowledge", {})
        if not isinstance(knowledge, dict):
            knowledge = {}

        existing_affordances = knowledge.get("affordances", [])
        existing_capabilities = knowledge.get("capabilities", [])

        # Normalize existing (Layer 1)
        if existing_affordances:
            if isinstance(existing_affordances, str):
                existing_affordances = (
                    existing_affordances.strip("{}").split(",")
                    if existing_affordances.strip("{}")
                    else []
                )
            existing_affordances = normalize_and_validate_affordances(
                existing_affordances
            )

        if existing_capabilities:
            if isinstance(existing_capabilities, str):
                existing_capabilities = (
                    existing_capabilities.strip("{}").split(",")
                    if existing_capabilities.strip("{}")
                    else []
                )
            existing_capabilities = normalize_and_validate_capabilities(
                existing_capabilities
            )

        # If we already have good data, just normalize and continue
        if existing_affordances:
            knowledge["affordances"] = existing_affordances
            knowledge["capabilities"] = existing_capabilities
            asset["knowledge"] = knowledge
            already_had += 1
            continue

        # Layer 2: Derive from metadata
        derived_affordances = set()
        derived_capabilities = set()

        # From rules
        rules = asset.get("rules", knowledge.get("rules", {}))
        if isinstance(rules, dict):
            if rules.get("is_movable"):
                derived_affordances.update(["push", "drag"])
            if rules.get("is_destructible"):
                derived_affordances.add("attack")

        # From interaction type
        interaction = asset.get("interaction", knowledge.get("interaction", {}))
        if isinstance(interaction, dict):
            itype = interaction.get("type", "none")
            derived_affordances.update(INTERACTION_TO_AFFORDANCES.get(itype, []))

        # From tile_config
        tile_config = asset.get("tile_config", knowledge.get("tile_config", {}))
        if isinstance(tile_config, dict):
            walkable = tile_config.get("walkable", "walkable")
            derived_capabilities.update(TILE_CONFIG_TO_CAPABILITIES.get(walkable, []))

        # From asset_type
        asset_type = asset.get("asset_type", asset.get("type", ""))
        if asset_type:
            derived_affordances.update(ASSET_TYPE_TO_AFFORDANCES.get(asset_type, []))

        # From movement
        movement = asset.get("movement", knowledge.get("movement", {}))
        if isinstance(movement, dict):
            mtype = movement.get("type", "static")
            derived_affordances.update(MOVEMENT_TO_AFFORDANCES.get(mtype, []))

        # Layer 3: Infer from tags
        tags = asset.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]

        asset_name = asset.get("name", "").lower()

        for tag in tags:
            tag_lower = tag.lower().strip()
            derived_affordances.update(TAG_TO_AFFORDANCES.get(tag_lower, []))
            derived_capabilities.update(TAG_TO_CAPABILITIES.get(tag_lower, []))

        # Also check asset name against tag maps
        for key in TAG_TO_AFFORDANCES:
            if key in asset_name:
                derived_affordances.update(TAG_TO_AFFORDANCES[key])
        for key in TAG_TO_CAPABILITIES:
            if key in asset_name:
                derived_capabilities.update(TAG_TO_CAPABILITIES[key])

        # Validate derived values
        final_affordances = normalize_and_validate_affordances(
            list(derived_affordances)
        )
        final_capabilities = normalize_and_validate_capabilities(
            list(derived_capabilities)
        )

        # Store back
        knowledge["affordances"] = final_affordances
        knowledge["capabilities"] = final_capabilities
        asset["knowledge"] = knowledge

        if final_affordances or final_capabilities:
            enriched += 1
            logger.debug(
                f"Derived affordances for '{asset.get('name')}': "
                f"affordances={final_affordances}, capabilities={final_capabilities}"
            )

    logger.info(
        f"Affordance enrichment: {already_had} had data, "
        f"{enriched} derived, "
        f"{len(assets) - already_had - enriched} unchanged"
    )

    return assets


# ═══════════════════════════════════════════════════════════════════════════════
#  QUALITY CHECK
# ═══════════════════════════════════════════════════════════════════════════════


def check_affordance_coverage(assets: list[dict]) -> dict:
    """
    Check how many assets have affordances after enrichment.

    Returns:
        {
            "total": int,
            "with_affordances": int,
            "with_capabilities": int,
            "coverage_pct": float,
            "missing": [asset_name, ...],
        }
    """
    total = 0
    with_aff = 0
    with_cap = 0
    missing = []

    for asset in assets:
        if not isinstance(asset, dict):
            continue
        total += 1

        knowledge = asset.get("knowledge", {})
        if not isinstance(knowledge, dict):
            knowledge = {}

        affordances = knowledge.get("affordances", [])
        capabilities = knowledge.get("capabilities", [])

        if affordances:
            with_aff += 1
        if capabilities:
            with_cap += 1
        if not affordances and not capabilities:
            missing.append(asset.get("name", "unknown"))

    return {
        "total": total,
        "with_affordances": with_aff,
        "with_capabilities": with_cap,
        "coverage_pct": (with_aff / max(1, total)) * 100,
        "missing": missing,
    }
