"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MECHANIC MATCHER SERVICE                                   ║
║                                                                               ║
║  Matches available assets (with affordances) to available mechanics.         ║
║                                                                               ║
║  FLOW:                                                                        ║
║  1. Fetch all assets for platform                                            ║
║  2. Extract all affordances and capabilities                                  ║
║  3. For each mechanic, check if required affordances exist                    ║
║  4. Return only valid mechanics (those with matching assets)                  ║
║                                                                               ║
║  RULES:                                                                       ║
║  • BASE mechanics always checked                                              ║
║  • PACK mechanics only checked if pack is enabled                             ║
║  • Mechanic is VALID only if ALL required affordances have matching assets    ║
║  • Auto-disable mechanics with no matching assets                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from dataclasses import dataclass, field
from typing import Optional

from app.core.mechanics import (
    Mechanic,
    MechanicPack,
    ALL_MECHANICS,
    BASE_MECHANICS,
    MECHANICS_BY_PACK,
    get_mechanic,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class AssetAffordanceMap:
    """Maps affordances/capabilities to assets that provide them."""

    # affordance → list of asset names
    affordance_to_assets: dict[str, list[str]] = field(default_factory=dict)

    # capability → list of asset names
    capability_to_assets: dict[str, list[str]] = field(default_factory=dict)

    # All unique affordances
    all_affordances: set[str] = field(default_factory=set)

    # All unique capabilities
    all_capabilities: set[str] = field(default_factory=set)

    # Total asset count
    asset_count: int = 0


@dataclass
class MechanicMatch:
    """Result of matching a mechanic to available assets."""

    mechanic: Mechanic
    is_valid: bool

    # Compatibility score (0.0 - 1.0)
    # Higher = better match
    compatibility_score: float = 0.0

    # Which affordances are satisfied
    satisfied_affordances: list[str] = field(default_factory=list)

    # Which affordances are missing
    missing_affordances: list[str] = field(default_factory=list)

    # Which capabilities are satisfied
    satisfied_capabilities: list[str] = field(default_factory=list)

    # Which capabilities are missing
    missing_capabilities: list[str] = field(default_factory=list)

    # Asset suggestions for each object slot
    slot_suggestions: dict[str, list[str]] = field(default_factory=dict)

    # How many assets available per slot (for scoring)
    slot_coverage: dict[str, int] = field(default_factory=dict)


@dataclass
class MatcherResult:
    """Complete result from mechanic matching."""

    # Enabled packs
    enabled_packs: list[MechanicPack] = field(default_factory=list)

    # Valid mechanics (can be used)
    valid_mechanics: dict[str, MechanicMatch] = field(default_factory=dict)

    # Invalid mechanics (missing affordances)
    invalid_mechanics: dict[str, MechanicMatch] = field(default_factory=dict)

    # Summary
    total_mechanics_checked: int = 0
    total_valid: int = 0
    total_invalid: int = 0

    # Affordance coverage
    affordance_map: Optional[AssetAffordanceMap] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  AFFORDANCE EXTRACTION
# ═══════════════════════════════════════════════════════════════════════════════


def build_affordance_map(assets: list[dict]) -> AssetAffordanceMap:
    """
    Build a map of affordances and capabilities from asset list.

    Args:
        assets: List of assets with knowledge containing affordances/capabilities

    Returns:
        AssetAffordanceMap with all mappings
    """

    result = AssetAffordanceMap()
    result.asset_count = len(assets)

    for asset in assets:
        asset_name = asset.get("name", "")
        if not asset_name:
            continue

        # Get knowledge (may be nested or at top level)
        knowledge = asset.get("knowledge", {}) or {}

        # Extract affordances
        affordances = knowledge.get("affordances", []) or []
        for aff in affordances:
            if aff not in result.affordance_to_assets:
                result.affordance_to_assets[aff] = []
            result.affordance_to_assets[aff].append(asset_name)
            result.all_affordances.add(aff)

        # Extract capabilities
        capabilities = knowledge.get("capabilities", []) or []
        for cap in capabilities:
            if cap not in result.capability_to_assets:
                result.capability_to_assets[cap] = []
            result.capability_to_assets[cap].append(asset_name)
            result.all_capabilities.add(cap)

    logger.info(
        f"Built affordance map: {len(result.all_affordances)} affordances, "
        f"{len(result.all_capabilities)} capabilities from {result.asset_count} assets"
    )

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC MATCHING
# ═══════════════════════════════════════════════════════════════════════════════


def match_mechanic(
    mechanic: Mechanic,
    affordance_map: AssetAffordanceMap,
) -> MechanicMatch:
    """
    Check if a mechanic can be used with available assets.

    Returns MechanicMatch with:
    - is_valid: True if ALL required affordances/capabilities are present
    - compatibility_score: 0.0-1.0 based on asset coverage

    Score calculation:
    - Base score from affordance/capability satisfaction
    - Bonus for having multiple assets per slot
    - Penalty for missing requirements
    """

    result = MechanicMatch(mechanic=mechanic, is_valid=True)

    total_requirements = 0
    satisfied_requirements = 0

    # Check required affordances
    for aff in mechanic.required_affordances:
        total_requirements += 1
        if aff in affordance_map.all_affordances:
            result.satisfied_affordances.append(aff)
            satisfied_requirements += 1
        else:
            result.missing_affordances.append(aff)
            result.is_valid = False

    # Check required capabilities
    for cap in mechanic.required_capabilities:
        total_requirements += 1
        if cap in affordance_map.all_capabilities:
            result.satisfied_capabilities.append(cap)
            satisfied_requirements += 1
        else:
            result.missing_capabilities.append(cap)
            result.is_valid = False

    # Build slot suggestions and calculate coverage
    total_slots = len(mechanic.object_slots)
    slots_with_assets = 0
    total_slot_assets = 0

    for slot_name, slot in mechanic.object_slots.items():
        suggestions = []

        # Match by affordance
        if slot.affordance and slot.affordance in affordance_map.affordance_to_assets:
            suggestions.extend(affordance_map.affordance_to_assets[slot.affordance])

        # Match by capability
        if slot.capability and slot.capability in affordance_map.capability_to_assets:
            suggestions.extend(affordance_map.capability_to_assets[slot.capability])

        # Remove duplicates while preserving order
        seen = set()
        unique_suggestions = []
        for s in suggestions:
            if s not in seen:
                seen.add(s)
                unique_suggestions.append(s)

        result.slot_suggestions[slot_name] = unique_suggestions
        result.slot_coverage[slot_name] = len(unique_suggestions)

        if unique_suggestions:
            slots_with_assets += 1
            total_slot_assets += len(unique_suggestions)

    # Calculate compatibility score
    if not result.is_valid:
        # Invalid mechanic gets partial score based on what IS satisfied
        if total_requirements > 0:
            result.compatibility_score = (
                satisfied_requirements / total_requirements * 0.5
            )
        else:
            result.compatibility_score = 0.0
    else:
        # Valid mechanic: score based on coverage quality
        base_score = 0.7  # Base for being valid

        # Bonus for slot coverage (up to 0.2)
        if total_slots > 0:
            avg_assets_per_slot = total_slot_assets / total_slots
            # More assets = higher score (diminishing returns)
            coverage_bonus = min(0.2, (avg_assets_per_slot - 1) * 0.05)
            base_score += coverage_bonus

        # Bonus for having all slots filled (up to 0.1)
        if total_slots > 0 and slots_with_assets == total_slots:
            base_score += 0.1

        result.compatibility_score = min(1.0, base_score)

    return result


def match_all_mechanics(
    assets: list[dict],
    enabled_packs: list[MechanicPack] = None,
) -> MatcherResult:
    """
    Match all mechanics against available assets.

    Args:
        assets: List of assets with knowledge/affordances
        enabled_packs: Which mechanic packs to include (BASE always included)

    Returns:
        MatcherResult with all valid/invalid mechanics
    """

    # Default to BASE only
    if enabled_packs is None:
        enabled_packs = [MechanicPack.BASE]

    # Always include BASE
    if MechanicPack.BASE not in enabled_packs:
        enabled_packs = [MechanicPack.BASE] + enabled_packs

    result = MatcherResult(enabled_packs=enabled_packs)

    # Build affordance map
    affordance_map = build_affordance_map(assets)
    result.affordance_map = affordance_map

    # Collect mechanics to check
    mechanics_to_check: dict[str, Mechanic] = {}

    for pack in enabled_packs:
        pack_mechanics = MECHANICS_BY_PACK.get(pack, {})
        mechanics_to_check.update(pack_mechanics)

    result.total_mechanics_checked = len(mechanics_to_check)

    # Match each mechanic
    for mech_id, mechanic in mechanics_to_check.items():
        match = match_mechanic(mechanic, affordance_map)

        if match.is_valid:
            result.valid_mechanics[mech_id] = match
            result.total_valid += 1
        else:
            result.invalid_mechanics[mech_id] = match
            result.total_invalid += 1

    logger.info(
        f"Mechanic matching complete: {result.total_valid}/{result.total_mechanics_checked} valid"
    )

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_valid_mechanic_ids(
    assets: list[dict],
    enabled_packs: list[MechanicPack] = None,
) -> list[str]:
    """Get list of valid mechanic IDs for given assets."""

    result = match_all_mechanics(assets, enabled_packs)
    return list(result.valid_mechanics.keys())


def get_assets_for_mechanic(
    mechanic_id: str,
    assets: list[dict],
) -> dict[str, list[str]]:
    """
    Get suggested assets for each slot in a mechanic.

    Returns:
        Dict mapping slot name → list of valid asset names
    """

    mechanic = get_mechanic(mechanic_id)
    if not mechanic:
        return {}

    affordance_map = build_affordance_map(assets)
    match = match_mechanic(mechanic, affordance_map)

    return match.slot_suggestions


def can_use_mechanic(
    mechanic_id: str,
    assets: list[dict],
) -> bool:
    """Check if a specific mechanic can be used with given assets."""

    mechanic = get_mechanic(mechanic_id)
    if not mechanic:
        return False

    affordance_map = build_affordance_map(assets)
    match = match_mechanic(mechanic, affordance_map)

    return match.is_valid


def get_missing_affordances(
    mechanic_id: str,
    assets: list[dict],
) -> list[str]:
    """Get list of missing affordances for a mechanic."""

    mechanic = get_mechanic(mechanic_id)
    if not mechanic:
        return []

    affordance_map = build_affordance_map(assets)
    match = match_mechanic(mechanic, affordance_map)

    return match.missing_affordances + match.missing_capabilities


def suggest_packs_for_assets(
    assets: list[dict],
) -> dict[MechanicPack, dict]:
    """
    Suggest which mechanic packs would work well with given assets.

    Returns:
        Dict mapping pack → {"valid_count": N, "total_count": M, "coverage": 0.0-1.0}
    """

    affordance_map = build_affordance_map(assets)
    suggestions = {}

    for pack in MechanicPack:
        if pack == MechanicPack.BASE:
            continue  # BASE is always included

        pack_mechanics = MECHANICS_BY_PACK.get(pack, {})
        if not pack_mechanics:
            continue

        valid_count = 0
        for mechanic in pack_mechanics.values():
            match = match_mechanic(mechanic, affordance_map)
            if match.is_valid:
                valid_count += 1

        total_count = len(pack_mechanics)
        coverage = valid_count / total_count if total_count > 0 else 0.0

        suggestions[pack] = {
            "valid_count": valid_count,
            "total_count": total_count,
            "coverage": round(coverage, 2),
        }

    return suggestions


# ═══════════════════════════════════════════════════════════════════════════════
#  REPORTING
# ═══════════════════════════════════════════════════════════════════════════════


def generate_match_report(result: MatcherResult) -> str:
    """Generate a human-readable report of mechanic matching."""

    lines = [
        "═══════════════════════════════════════════════════════════════════════════════",
        "MECHANIC MATCHING REPORT",
        "═══════════════════════════════════════════════════════════════════════════════",
        "",
        f"Assets analyzed: {result.affordance_map.asset_count if result.affordance_map else 0}",
        f"Enabled packs: {[p.value for p in result.enabled_packs]}",
        f"Mechanics checked: {result.total_mechanics_checked}",
        f"Valid: {result.total_valid}",
        f"Invalid: {result.total_invalid}",
        "",
    ]

    if result.affordance_map:
        lines.append(
            f"Available affordances ({len(result.affordance_map.all_affordances)}):"
        )
        lines.append(f"  {sorted(result.affordance_map.all_affordances)}")
        lines.append("")
        lines.append(
            f"Available capabilities ({len(result.affordance_map.all_capabilities)}):"
        )
        lines.append(f"  {sorted(result.affordance_map.all_capabilities)}")
        lines.append("")

    lines.append("VALID MECHANICS:")
    for mech_id, match in result.valid_mechanics.items():
        slots = ", ".join(
            f"{k}({len(v)})" for k, v in match.slot_suggestions.items() if v
        )
        lines.append(f"  ✓ {mech_id}: {slots}")

    lines.append("")
    lines.append("INVALID MECHANICS:")
    for mech_id, match in result.invalid_mechanics.items():
        missing = match.missing_affordances + match.missing_capabilities
        lines.append(f"  ✗ {mech_id}: missing {missing}")

    lines.append("")
    lines.append(
        "═══════════════════════════════════════════════════════════════════════════════"
    )

    return "\n".join(lines)


def score_mechanics(affordances: list[str]) -> list[dict]:
    """
    Score all mechanics based on available affordances.

    Args:
        affordances: List of affordance strings available from assets

    Returns:
        List of dicts with mechanic_id and score (0.0-1.0)
    """
    results = []
    affordance_set = set(affordances) if affordances else set()

    for mech_id, mechanic in ALL_MECHANICS.items():
        # Get required affordances for this mechanic
        required = set()

        # Add direct required_affordances from Mechanic
        if mechanic.required_affordances:
            required.update(mechanic.required_affordances)

        # Add affordances from object slots (dict[str, ObjectSlot])
        for slot_name, slot in mechanic.object_slots.items():
            if slot.affordance:
                required.add(slot.affordance)

        # Calculate score
        if not required:
            # No requirements = always valid with base score
            score = 0.5
        else:
            # Score based on how many required affordances are satisfied
            satisfied = required & affordance_set
            score = len(satisfied) / len(required) if required else 0.0

        results.append(
            {
                "mechanic_id": mech_id,
                "score": score,
                "satisfied": list(required & affordance_set) if required else [],
                "missing": list(required - affordance_set) if required else [],
            }
        )

    # Sort by score descending
    results.sort(key=lambda x: x["score"], reverse=True)

    return results
