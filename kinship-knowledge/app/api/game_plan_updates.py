"""Conversational Game Plan API — Phase 0 Update.

PHASE 0 CHANGES:
- Added platform_id to PlanConverseRequest
- Passes platform_id to asset retrieval
- AI now only generates content using available platform assets

This file shows ONLY the schema and endpoint changes needed.
Apply these changes to your existing game_plan.py.
"""

from typing import Optional
from pydantic import BaseModel, Field


# ═══════════════════════════════════════════════════════════
# UPDATED SCHEMAS (merge into existing game_plan.py)
# ═══════════════════════════════════════════════════════════


class PlanConverseRequest(BaseModel):
    """Updated request schema with platform_id."""

    messages: list[dict]  # [{role, content}, ...]
    game_id: str
    game_name: str = ""
    game_description: str = ""
    existing_scenes: list[dict] = []
    existing_actors: list[dict] = []
    existing_challenges: list[dict] = []
    existing_quests: list[dict] = []
    existing_routes: list[dict] = []
    current_plan: Optional[dict] = None
    # PHASE 0: Added platform_id
    platform_id: Optional[str] = Field(
        None,
        description="Platform ID to filter assets. Required for accurate game generation.",
    )


class PlanConverseResponse(BaseModel):
    """Updated response schema with capabilities."""

    message: str
    plan: Optional[dict] = None
    phase: str = "exploring"
    suggestions: list[str] = []
    # PHASE 0: Include what's possible
    asset_capabilities: Optional[dict] = Field(
        None, description="Available asset types for this platform"
    )
    warnings: list[str] = Field(
        default_factory=list, description="Warnings about missing assets or limitations"
    )


# ═══════════════════════════════════════════════════════════
# CODE CHANGES TO APPLY TO game_plan.py
# ═══════════════════════════════════════════════════════════

"""
1. In the converse endpoint, add platform_id handling:

@router.post("/api/games/plan/converse", response_model=PlanConverseResponse)
async def converse_plan(body: PlanConverseRequest, db: AsyncSession = Depends(get_db)):
    # ... existing code ...
    
    # PHASE 0: Get platform capabilities BEFORE calling Claude
    asset_capabilities = None
    capability_warning = None
    
    if body.platform_id:
        from app.services.asset_embeddings import get_platform_asset_capabilities
        asset_capabilities = await get_platform_asset_capabilities(body.platform_id)
        
        # Check if platform can support the game type
        caps = asset_capabilities.get("capabilities", {})
        warnings = []
        
        if not caps.get("has_npcs"):
            warnings.append("⚠️ This platform has no NPC sprites. Character dialogues will need sprite assignment later.")
        if not caps.get("has_tiles"):
            warnings.append("⚠️ This platform has no ground tiles. Scenes may look empty.")
        
        # Add capability context to the prompt
        capability_context = f'''
Available assets for this platform:
- Asset types: {asset_capabilities.get("asset_types", {})}
- Scene types available: {", ".join(asset_capabilities.get("scene_types", [])) or "generic"}
- HEARTS facets with assets: {", ".join(asset_capabilities.get("facets_supported", [])) or "all"}

IMPORTANT: Only use assets that exist on this platform!
'''

2. In the system prompt, add the capability context.

3. In asset retrieval, pass platform_id:

    # When loading asset catalog for the AI
    from app.services.asset_embeddings import retrieve_relevant_assets
    
    assets = await retrieve_relevant_assets(
        context=f"{body.game_description} {body.game_name}",
        top_k=50,
        platform_id=body.platform_id,  # PHASE 0: Filter by platform
    )

4. Return capabilities in response:

    return PlanConverseResponse(
        message=response_message,
        plan=plan,
        phase=phase,
        suggestions=suggestions,
        asset_capabilities=asset_capabilities,  # PHASE 0
        warnings=warnings,  # PHASE 0
    )
"""


# ═══════════════════════════════════════════════════════════
# HELPER FUNCTION FOR CAPABILITY-AWARE PROMPTING
# ═══════════════════════════════════════════════════════════


def build_capability_context(capabilities: dict) -> str:
    """Build a context string explaining what assets are available.

    Include this in the system prompt so AI knows what it can use.
    """
    if not capabilities:
        return ""

    asset_types = capabilities.get("asset_types", {})
    scene_types = capabilities.get("scene_types", [])
    facets = capabilities.get("facets_supported", [])
    caps = capabilities.get("capabilities", {})

    lines = [
        "\n═══ AVAILABLE ASSETS FOR THIS PLATFORM ═══",
        f"Total assets: {capabilities.get('total_assets', 0)}",
        "",
        "Asset counts by type:",
    ]

    for atype, count in asset_types.items():
        lines.append(f"  - {atype}: {count}")

    lines.append("")
    lines.append("Capabilities:")
    lines.append(f"  - NPCs for dialogue: {'YES' if caps.get('has_npcs') else 'NO'}")
    lines.append(
        f"  - Animated sprites: {'YES' if caps.get('has_animated_sprites') else 'NO'}"
    )
    lines.append(f"  - Ground tiles: {'YES' if caps.get('has_tiles') else 'NO'}")
    lines.append(f"  - Audio/music: {'YES' if caps.get('has_audio') else 'NO'}")

    if scene_types:
        lines.append(f"\nBest scene types: {', '.join(scene_types[:5])}")

    if facets:
        facet_names = {
            "H": "Harmony",
            "E": "Empowerment",
            "A": "Awareness",
            "R": "Resilience",
            "T": "Tenacity",
            "Si": "Self-insight",
            "So": "Social",
        }
        facet_list = [facet_names.get(f, f) for f in facets[:5]]
        lines.append(f"Strong facet coverage: {', '.join(facet_list)}")

    lines.append("")
    lines.append("IMPORTANT: Design your game using ONLY asset types that exist above!")
    lines.append(
        "If has_npcs is NO, don't create character dialogue - use other actor types."
    )
    lines.append("═══════════════════════════════════════════")

    return "\n".join(lines)


def generate_capability_warnings(capabilities: dict, plan: dict) -> list[str]:
    """Check if the generated plan requires assets that don't exist.

    Returns list of warning messages.
    """
    if not capabilities or not plan:
        return []

    warnings = []
    caps = capabilities.get("capabilities", {})
    asset_types = capabilities.get("asset_types", {})

    # Check scenes
    for scene in plan.get("scenes", []):
        # Check actors
        for actor in scene.get("actors", []):
            actor_type = actor.get("actor_type", "character")

            if actor_type == "character" and not caps.get("has_npcs"):
                warnings.append(
                    f"Scene '{scene.get('scene_name')}' has character '{actor.get('name')}' "
                    f"but platform has no NPC sprites. Sprite assignment needed."
                )

    # Check if platform has enough variety
    total = capabilities.get("total_assets", 0)
    if total < 20:
        warnings.append(
            f"Platform only has {total} assets. Games may look repetitive. "
            f"Consider adding more assets to the platform."
        )

    return warnings
