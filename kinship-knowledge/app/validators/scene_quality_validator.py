"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE QUALITY VALIDATOR                                    ║
║                                                                               ║
║  Wires the UNUSED modules into the pipeline:                                  ║
║  • placement_rules.py — validates asset placement context                     ║
║  • zone_system.py — validates zone reachability and spacing                   ║
║                                                                               ║
║  RUNS AFTER materialization, BEFORE manifest assembly.                        ║
║  Checks the actual placed objects against placement rules and zone layout.    ║
║                                                                               ║
║  WHAT IT VALIDATES:                                                           ║
║  1. Zone spacing (challenges not too close to spawn, zones don't overlap)     ║
║  2. Zone reachability (all challenge zones reachable from spawn via BFS)      ║
║  3. Placement rules (doors near buildings, furniture on indoor surfaces)      ║
║  4. Grouping rules (flowers in clusters, trees properly spaced)              ║
║  5. Avoidance rules (wooden objects away from fire)                           ║
║  6. Z-index consistency                                                       ║
║                                                                               ║
║  USAGE:                                                                       ║
║  results = validate_scene_quality(scene, assets)                              ║
║  results = validate_all_scenes(materialized_scenes, state)                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import math
from typing import Optional
from dataclasses import dataclass, field

from app.core.zone_system import (
    Zone,
    ZoneType,
    OccupancyGrid as ZoneOccupancyGrid,
    TileOccupancy,
    bfs_reachable,
    find_all_reachable,
    validate_zone_reachability,
    validate_zone_spacing,
    get_zone_spacing,
)
from app.core.placement_rules import (
    extract_placement_knowledge,
    validate_placement,
    get_contextual_function,
    PlacementValidation,
)

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class SceneQualityResult:
    """Result of scene quality validation."""

    scene_index: int
    is_valid: bool = True
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    placement_issues: list[dict] = field(default_factory=list)
    zone_issues: list[dict] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  ZONE VALIDATION (from zone_system.py)
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_zones(scene, result: SceneQualityResult):
    """
    Validate zone layout using zone_system functions.

    Checks:
    - Zone spacing rules (challenges not overlapping, hazards away from spawn)
    - All zones reachable from spawn via BFS
    """
    width = scene.width
    height = scene.height

    # Build Zone objects from materialized zones
    # Use radius=1 for spacing checks (zone width inflates distances too much)
    zones = []
    for z in scene.zones:
        if not isinstance(z, dict):
            continue

        zone_type_str = z.get("zone_type", "decoration")
        try:
            zt = ZoneType(zone_type_str)
        except ValueError:
            zt = ZoneType.DECORATION

        # Materialized zones have "width" (int). Cap radius at 1 for spacing math.
        zone_width = z.get("width", 2)
        radius = max(1, zone_width // 2)

        zones.append(
            Zone(
                zone_id=z.get("zone_id", ""),
                zone_type=zt,
                position={"x": z.get("x", 0), "y": z.get("y", 0)},
                radius=radius,
            )
        )

    if not zones:
        return

    # Scale spacing thresholds based on zone density
    # 16x16 with 6 zones: 256/6=42, sqrt=6.5, scale=6.5/10=0.65
    # spawn→challenge: 4 * 0.65 = 2.6 (achievable on 16x16)
    # 32x32 with 6 zones: 1024/6=170, sqrt=13, scale=1.0 (full rules)
    grid_area = width * height
    zone_count = max(1, len(zones))
    tiles_per_zone = grid_area / zone_count
    scale = min(1.0, (tiles_per_zone**0.5) / 10.0)

    spacing_result = validate_zone_spacing(zones)
    if not spacing_result["valid"]:
        for violation in spacing_result.get("violations", []):
            scaled_min = violation["min_required"] * scale
            if violation["actual"] < scaled_min:
                msg = (
                    f"Zones '{violation['zone_a']}' and '{violation['zone_b']}' "
                    f"too close: {violation['actual']:.1f} tiles "
                    f"(min: {scaled_min:.1f})"
                )
                result.warnings.append(msg)
                result.zone_issues.append(
                    {
                        "type": "spacing_violation",
                        **violation,
                    }
                )

    # Build occupancy grid for reachability check
    grid = ZoneOccupancyGrid(width=width, height=height)

    # Mark non-walkable objects as blocked
    all_objects = scene.objects + scene.landmarks
    for obj in all_objects:
        if not isinstance(obj, dict):
            continue
        if not obj.get("walkable", True):
            ox, oy = obj.get("x", -1), obj.get("y", -1)
            if 0 <= ox < width and 0 <= oy < height:
                grid.mark_blocked(ox, oy)

    # Check zone reachability from spawn
    spawn = {"x": scene.spawn_x, "y": scene.spawn_y}
    reachability = validate_zone_reachability(grid, spawn, zones)

    if not reachability["valid"]:
        for zone_id in reachability.get("unreachable", []):
            msg = f"Zone '{zone_id}' is not reachable from spawn"
            result.errors.append(msg)
            result.zone_issues.append(
                {
                    "type": "unreachable_zone",
                    "zone_id": zone_id,
                }
            )

    # Check specific critical reachability
    exit_reachable = bfs_reachable(grid, spawn, {"x": scene.exit_x, "y": scene.exit_y})
    if not exit_reachable:
        result.errors.append("Exit is not reachable from spawn")
        result.is_valid = False

    # Check challenge positions reachable
    for challenge in scene.challenges:
        if not isinstance(challenge, dict):
            continue
        cx, cy = challenge.get("x", -1), challenge.get("y", -1)
        if cx >= 0 and cy >= 0:
            challenge_reachable = bfs_reachable(grid, spawn, {"x": cx, "y": cy})
            if not challenge_reachable:
                result.errors.append(
                    f"Challenge '{challenge.get('name', challenge.get('mechanic_id'))}' "
                    f"at ({cx},{cy}) not reachable from spawn"
                )

    # Check NPC positions reachable
    for npc in scene.npcs:
        if not isinstance(npc, dict):
            continue
        nx, ny = npc.get("x", -1), npc.get("y", -1)
        if nx >= 0 and ny >= 0:
            npc_reachable = bfs_reachable(grid, spawn, {"x": nx, "y": ny})
            if not npc_reachable:
                result.warnings.append(
                    f"NPC '{npc.get('name', npc.get('role'))}' "
                    f"at ({nx},{ny}) not reachable from spawn"
                )


# ═══════════════════════════════════════════════════════════════════════════════
#  PLACEMENT RULES VALIDATION (from placement_rules.py)
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_placements(
    scene,
    asset_lookup: dict[str, dict],
    result: SceneQualityResult,
):
    """
    Validate object placements using placement_rules.

    Checks:
    - Attached assets are near their requirements (door near building)
    - Surface assets are on correct ground
    - Grouped assets meet minimum cluster size
    - Avoidance rules respected
    """
    all_placed = scene.objects + scene.landmarks + scene.decorations

    if not all_placed or not asset_lookup:
        return

    # Build spatial index: position → list of placed objects
    position_index: dict[tuple[int, int], list[dict]] = {}
    for obj in all_placed:
        if not isinstance(obj, dict):
            continue
        pos = (obj.get("x", -1), obj.get("y", -1))
        if pos not in position_index:
            position_index[pos] = []
        position_index[pos].append(obj)

    # For each placed object, find nearby objects and validate
    checked = 0
    violations = 0

    for obj in all_placed:
        if not isinstance(obj, dict):
            continue

        asset_name = obj.get("asset_name", "")
        asset_data = asset_lookup.get(asset_name)

        if not asset_data:
            continue

        # Skip if no placement knowledge
        knowledge = asset_data.get("knowledge", {})
        if not knowledge:
            continue

        placement_type = knowledge.get("placement_type", "standalone")
        if placement_type == "standalone" and not knowledge.get("requires_nearby"):
            continue

        checked += 1
        ox, oy = obj.get("x", 0), obj.get("y", 0)

        # Find nearby objects (within radius 3)
        nearby = []
        for dy in range(-3, 4):
            for dx in range(-3, 4):
                if dx == 0 and dy == 0:
                    continue
                pos = (ox + dx, oy + dy)
                for nearby_obj in position_index.get(pos, []):
                    nearby_name = nearby_obj.get("asset_name", "")
                    nearby_data = asset_lookup.get(nearby_name, {})
                    if nearby_data:
                        nearby.append(nearby_data)

        # Validate placement
        validation = validate_placement(
            asset=asset_data,
            nearby_assets=nearby,
            ground_asset=None,  # Would need tile data
            group_size=1,
        )

        if not validation.is_valid:
            violations += 1
            for error in validation.errors:
                result.warnings.append(f"Placement issue at ({ox},{oy}): {error}")
                result.placement_issues.append(
                    {
                        "type": "placement_violation",
                        "asset": asset_name,
                        "x": ox,
                        "y": oy,
                        "error": error,
                    }
                )

        for warning in validation.warnings:
            result.warnings.append(f"Placement note at ({ox},{oy}): {warning}")

    if checked > 0:
        logger.info(
            f"  Scene {result.scene_index}: checked {checked} placements, "
            f"{violations} violations"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  Z-INDEX VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_z_indices(scene, result: SceneQualityResult):
    """
    Validate z-index consistency.

    Uses POPULATOR's formula (y * 10 + offset), NOT zone_system's formula.
    Only checks ordering: objects at higher Y should have higher z-index.
    """
    all_objects = scene.objects + scene.landmarks + scene.decorations

    # Populator formula: z = y * 10 + type_offset
    type_offsets = {"challenge": 5, "challenge_goal": 5, "landmark": 3, "decoration": 0}

    violations = 0
    for obj in all_objects:
        if not isinstance(obj, dict):
            continue

        y = obj.get("y", 0)
        z = obj.get("z_index", 0)
        obj_type = obj.get("type", "decoration")
        offset = type_offsets.get(obj_type, 0)
        expected = y * 10 + offset

        # Tolerance of 10 (one row)
        if abs(z - expected) > 10:
            violations += 1

    # Only warn if many objects are wrong (not each individually)
    if violations > 5:
        result.warnings.append(
            f"{violations} objects have unexpected z-index values "
            f"(expected y*10 formula)"
        )


# ═══════════════════════════════════════════════════════════════════════════════
#  GROUPING VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


def _validate_grouping(
    scene,
    asset_lookup: dict[str, dict],
    result: SceneQualityResult,
):
    """
    Check that grouped assets meet minimum cluster sizes.
    """
    # Count each asset type in decorations
    asset_counts: dict[str, int] = {}
    for obj in scene.decorations:
        if not isinstance(obj, dict):
            continue
        name = obj.get("asset_name", "")
        asset_counts[name] = asset_counts.get(name, 0) + 1

    for asset_name, count in asset_counts.items():
        asset_data = asset_lookup.get(asset_name)
        if not asset_data:
            continue

        knowledge = asset_data.get("knowledge", {})
        if not knowledge:
            continue

        min_group = knowledge.get("min_group_size", 1)
        group_pattern = knowledge.get("group_pattern", "single")

        if group_pattern != "single" and count < min_group:
            result.warnings.append(
                f"'{asset_name}' placed {count} times but needs "
                f"minimum group of {min_group} ({group_pattern} pattern)"
            )


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def validate_scene_quality(
    scene,
    assets: list[dict],
) -> SceneQualityResult:
    """
    Run full quality validation on a materialized scene.

    Uses:
    - zone_system for reachability and spacing
    - placement_rules for contextual placement validation

    Args:
        scene: MaterializedScene
        assets: Asset dicts with knowledge metadata

    Returns:
        SceneQualityResult
    """
    result = SceneQualityResult(scene_index=scene.scene_index)

    # Build asset lookup by name
    asset_lookup = {}
    for asset in assets:
        if isinstance(asset, dict) and asset.get("name"):
            asset_lookup[asset["name"]] = asset

    # 1. Zone spacing and reachability
    _validate_zones(scene, result)

    # 2. Placement rules
    _validate_placements(scene, asset_lookup, result)

    # 3. Z-index consistency
    _validate_z_indices(scene, result)

    # 4. Grouping rules
    _validate_grouping(scene, asset_lookup, result)

    # Set overall validity
    if result.errors:
        result.is_valid = False

    logger.info(
        f"Scene {scene.scene_index} quality: "
        f"{'✓' if result.is_valid else '✗'} "
        f"({len(result.errors)} errors, {len(result.warnings)} warnings)"
    )

    return result


def validate_all_scenes(
    materialized_scenes: list,
    state,
) -> tuple[bool, list[str], list[str]]:
    """
    Validate all materialized scenes.

    Args:
        materialized_scenes: List of MaterializedScene
        state: PipelineState with assets

    Returns:
        (is_valid, errors, warnings)
    """
    all_errors = []
    all_warnings = []
    assets = list(state.input.assets)

    for scene in materialized_scenes:
        result = validate_scene_quality(scene, assets)

        for e in result.errors:
            all_errors.append(f"Scene {scene.scene_index}: {e}")
        for w in result.warnings:
            all_warnings.append(f"Scene {scene.scene_index}: {w}")

    is_valid = len(all_errors) == 0

    logger.info(
        f"Scene quality validation: "
        f"{'PASS' if is_valid else 'FAIL'} "
        f"({len(all_errors)} errors, {len(all_warnings)} warnings "
        f"across {len(materialized_scenes)} scenes)"
    )

    return is_valid, all_errors, all_warnings
