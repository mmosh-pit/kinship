"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ASSET COVERAGE ENFORCER                                    ║
║                                                                               ║
║  Problem: 10 assets uploaded, only 1-2 used.                                  ║
║  Fix: After materialization, inject unused assets as decorations.             ║
║                                                                               ║
║  RUNS: After scene populator, before manifest assembly.                       ║
║  RULE: At least 30% of uploaded assets must appear in the game.              ║
║                                                                               ║
║  HOW:                                                                         ║
║  1. Collect all asset names used across all scenes                            ║
║  2. Find unused assets that are type "object"/"decoration"/"prop"             ║
║  3. Distribute them as decorations across scenes                              ║
║  4. Place using Poisson disc in empty cells                                   ║
║                                                                               ║
║  DOES NOT: Add NPC assets (those need roles). Only decorative/prop assets.   ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import random
from typing import Optional

logger = logging.getLogger(__name__)


def enforce_asset_coverage(
    materialized_scenes: list,
    all_assets: list[dict],
    min_coverage: float = 0.3,
    seed: int = None,
) -> tuple[list, dict]:
    """
    Ensure minimum asset coverage across the game.

    If coverage is below min_coverage, inject unused assets as decorations.

    Args:
        materialized_scenes: List of MaterializedScene objects
        all_assets: All uploaded assets (list of dicts)
        min_coverage: Minimum fraction of assets that must be used (default 0.3)
        seed: Random seed for determinism

    Returns:
        (updated_scenes, coverage_report)
    """
    rng = random.Random(seed or 42)

    # Collect currently used assets
    used_names = set()
    for scene in materialized_scenes:
        for obj in scene.objects + scene.landmarks + scene.decorations:
            if isinstance(obj, dict):
                name = obj.get("asset_name", "")
                if name:
                    used_names.add(name)

    # Find unused decoratable assets (skip NPCs, tiles, UI)
    decoratable_types = {"object", "decoration", "prop", "animation"}
    unused_assets = []
    for asset in all_assets:
        if not isinstance(asset, dict):
            continue
        name = asset.get("name", "")
        asset_type = asset.get("type", "object")
        if name and name not in used_names and asset_type in decoratable_types:
            unused_assets.append(asset)

    total_assets = len([a for a in all_assets if isinstance(a, dict) and a.get("name")])
    current_coverage = len(used_names) / max(1, total_assets)

    report = {
        "total_assets": total_assets,
        "used_before": len(used_names),
        "coverage_before": f"{current_coverage:.0%}",
        "unused_decoratable": len(unused_assets),
        "injected": 0,
        "coverage_after": f"{current_coverage:.0%}",
    }

    # If already above threshold, nothing to do
    if current_coverage >= min_coverage:
        logger.info(
            f"Asset coverage already {current_coverage:.0%} >= {min_coverage:.0%}"
        )
        return materialized_scenes, report

    # Calculate how many more assets we need
    target_used = int(total_assets * min_coverage)
    needed = target_used - len(used_names)
    to_inject = unused_assets[:needed]

    if not to_inject:
        logger.warning("No unused decoratable assets to inject")
        return materialized_scenes, report

    logger.info(
        f"Asset coverage {current_coverage:.0%} < {min_coverage:.0%}. "
        f"Injecting {len(to_inject)} unused assets as decorations."
    )

    # Distribute across scenes (round-robin)
    injected_count = 0
    for i, asset in enumerate(to_inject):
        scene_idx = i % len(materialized_scenes)
        scene = materialized_scenes[scene_idx]

        # Find an empty position
        pos = _find_empty_position(scene, rng)
        if not pos:
            continue

        x, y = pos
        decoration = {
            "object_id": f"injected_decoration_{injected_count}",
            "asset_name": asset["name"],
            "x": x,
            "y": y,
            "z_index": y * 10,
            "type": "decoration",
            "walkable": True,
            "metadata": {
                "injected": True,
                "reason": "asset_coverage",
                "rotation": rng.uniform(-10, 10),
                "scale": rng.uniform(0.9, 1.1),
            },
        }
        scene.decorations.append(decoration)
        used_names.add(asset["name"])
        injected_count += 1

    # Update report
    new_coverage = len(used_names) / max(1, total_assets)
    report["injected"] = injected_count
    report["used_after"] = len(used_names)
    report["coverage_after"] = f"{new_coverage:.0%}"

    logger.info(
        f"Injected {injected_count} decorations. "
        f"Coverage: {current_coverage:.0%} → {new_coverage:.0%}"
    )

    return materialized_scenes, report


def _find_empty_position(
    scene,
    rng: random.Random,
    margin: int = 2,
    max_attempts: int = 30,
) -> Optional[tuple[int, int]]:
    """Find an empty position in the scene avoiding existing objects."""
    width = scene.width
    height = scene.height

    # Build occupied set
    occupied = set()
    occupied.add((scene.spawn_x, scene.spawn_y))
    occupied.add((scene.exit_x, scene.exit_y))

    for obj_list in [scene.objects, scene.landmarks, scene.decorations, scene.npcs]:
        for obj in obj_list:
            if isinstance(obj, dict):
                ox, oy = obj.get("x", -1), obj.get("y", -1)
                if ox >= 0 and oy >= 0:
                    occupied.add((ox, oy))
                    # Also block adjacent cells
                    for dx in range(-1, 2):
                        for dy in range(-1, 2):
                            occupied.add((ox + dx, oy + dy))

    # Try random positions
    for _ in range(max_attempts):
        x = rng.randint(margin, width - margin - 1)
        y = rng.randint(margin, height - margin - 1)

        if (x, y) not in occupied:
            # Avoid spawn/exit zones
            if abs(x - scene.spawn_x) < 3 and abs(y - scene.spawn_y) < 3:
                continue
            if abs(x - scene.exit_x) < 3 and abs(y - scene.exit_y) < 3:
                continue
            return (x, y)

    return None
