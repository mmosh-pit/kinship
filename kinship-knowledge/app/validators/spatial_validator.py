"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SPATIAL VALIDATOR                                          ║
║                                                                               ║
║  Validates spatial aspects of scenes.                                         ║
║                                                                               ║
║  SUB-VALIDATORS:                                                              ║
║  1. Grid Validation — Bounds, dimensions, walkable tiles                      ║
║  2. Collision Validation — No overlapping objects, valid placements           ║
║  3. Pathfinding Validation — All required positions reachable                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Any, Optional
from collections import deque
import logging

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
    ValidationSeverity,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  GRID VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class GridValidator:
    """Validates grid structure and bounds."""

    def validate(self, scene: dict, scene_index: int, result: ValidationResult):
        """Validate grid for a scene."""
        location = f"scenes[{scene_index}]"

        # Get dimensions
        width = scene.get("width", 16)
        height = scene.get("height", 16)

        # Validate dimensions
        if width < 8:
            result.add_error(
                code="GRID_001",
                message=f"Scene width ({width}) too small (min: 8)",
                location=location,
            )

        if height < 8:
            result.add_error(
                code="GRID_002",
                message=f"Scene height ({height}) too small (min: 8)",
                location=location,
            )

        if width > 64:
            result.add_warning(
                code="GRID_003",
                message=f"Scene width ({width}) unusually large (max recommended: 64)",
                location=location,
            )

        if height > 64:
            result.add_warning(
                code="GRID_004",
                message=f"Scene height ({height}) unusually large (max recommended: 64)",
                location=location,
            )

        # Validate spawn/exit are within bounds
        spawn = scene.get("spawn", {})
        exit_point = scene.get("exit", {})

        self._validate_position_bounds(spawn, "spawn", width, height, location, result)
        self._validate_position_bounds(
            exit_point, "exit", width, height, location, result
        )

        # Validate all objects are within bounds
        objects = scene.get("objects", [])
        for i, obj in enumerate(objects):
            if isinstance(obj, dict):
                self._validate_position_bounds(
                    obj, f"objects[{i}]", width, height, location, result
                )

        # Check walkable coverage
        stats = scene.get("stats", {})
        walkable_coverage = stats.get("walkable_coverage", 1.0)

        if walkable_coverage < 0.3:
            result.add_warning(
                code="GRID_005",
                message=f"Low walkable coverage ({walkable_coverage:.1%})",
                location=location,
            )

    def _validate_position_bounds(
        self,
        pos: dict,
        name: str,
        width: int,
        height: int,
        scene_location: str,
        result: ValidationResult,
    ):
        """Validate a position is within grid bounds."""
        x = pos.get("x")
        y = pos.get("y")

        if x is None or y is None:
            return  # Schema validator handles missing coords

        if x < 0 or x >= width:
            result.add_error(
                code="GRID_006",
                message=f"{name} x={x} out of bounds [0, {width-1}]",
                location=f"{scene_location}.{name}",
            )

        if y < 0 or y >= height:
            result.add_error(
                code="GRID_007",
                message=f"{name} y={y} out of bounds [0, {height-1}]",
                location=f"{scene_location}.{name}",
            )


# ═══════════════════════════════════════════════════════════════════════════════
#  COLLISION VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class CollisionValidator:
    """Validates no invalid object overlaps."""

    def validate(self, scene: dict, scene_index: int, result: ValidationResult):
        """Validate collisions for a scene."""
        location = f"scenes[{scene_index}]"

        # Collect all occupied positions
        occupied: dict[tuple[int, int], list[dict]] = {}

        # Add spawn
        spawn = scene.get("spawn", {})
        sx, sy = spawn.get("x"), spawn.get("y")
        if sx is not None and sy is not None:
            key = (int(sx), int(sy))
            occupied[key] = [{"type": "spawn", "name": "spawn"}]

        # Add exit
        exit_point = scene.get("exit", {})
        ex, ey = exit_point.get("x"), exit_point.get("y")
        if ex is not None and ey is not None:
            key = (int(ex), int(ey))
            if key in occupied:
                occupied[key].append({"type": "exit", "name": "exit"})
            else:
                occupied[key] = [{"type": "exit", "name": "exit"}]

        # Add objects
        objects = scene.get("objects", [])
        for i, obj in enumerate(objects):
            if not isinstance(obj, dict):
                continue

            x, y = obj.get("x"), obj.get("y")
            if x is None or y is None:
                continue

            key = (int(x), int(y))
            obj_info = {
                "type": obj.get("type", "object"),
                "name": obj.get("asset_name", f"object_{i}"),
                "walkable": obj.get("walkable", True),
            }

            if key in occupied:
                occupied[key].append(obj_info)
            else:
                occupied[key] = [obj_info]

        # Check for collisions
        for pos, items in occupied.items():
            if len(items) > 1:
                # Check if collision is problematic
                non_walkable = [i for i in items if not i.get("walkable", True)]
                special = [i for i in items if i["type"] in ["spawn", "exit"]]

                # Multiple non-walkable objects at same position
                if len(non_walkable) > 1:
                    names = [i["name"] for i in non_walkable]
                    result.add_error(
                        code="COLLISION_001",
                        message=f"Multiple non-walkable objects at ({pos[0]}, {pos[1]}): {names}",
                        location=location,
                    )

                # Non-walkable object on spawn/exit
                if special and non_walkable:
                    special_names = [i["name"] for i in special]
                    blocking_names = [i["name"] for i in non_walkable]
                    result.add_error(
                        code="COLLISION_002",
                        message=f"Non-walkable object blocking {special_names}: {blocking_names}",
                        location=location,
                        position=pos,
                    )

        # Check spawn-exit collision
        if sx == ex and sy == ey:
            result.add_error(
                code="COLLISION_003",
                message="Spawn and exit at same position",
                location=location,
            )


# ═══════════════════════════════════════════════════════════════════════════════
#  PATHFINDING VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class PathfindingValidator:
    """Validates all required positions are reachable."""

    def validate(self, scene: dict, scene_index: int, result: ValidationResult):
        """Validate pathfinding for a scene."""
        location = f"scenes[{scene_index}]"

        width = scene.get("width", 16)
        height = scene.get("height", 16)

        # Build walkability grid
        walkable = self._build_walkability_grid(scene, width, height)

        # Get spawn position
        spawn = scene.get("spawn", {})
        spawn_x, spawn_y = spawn.get("x"), spawn.get("y")

        if spawn_x is None or spawn_y is None:
            return  # Schema validator handles this

        spawn_pos = (int(spawn_x), int(spawn_y))

        # Get exit position
        exit_point = scene.get("exit", {})
        exit_x, exit_y = exit_point.get("x"), exit_point.get("y")

        if exit_x is None or exit_y is None:
            return

        exit_pos = (int(exit_x), int(exit_y))

        # Check spawn is walkable
        if not walkable.get(spawn_pos, False):
            result.add_error(
                code="PATH_001",
                message="Spawn position is not walkable",
                location=f"{location}.spawn",
            )
            return

        # BFS from spawn
        reachable = self._bfs_reachable(spawn_pos, walkable, width, height)

        # Check exit is reachable
        if exit_pos not in reachable:
            result.add_error(
                code="PATH_002",
                message="Exit is not reachable from spawn",
                location=location,
                spawn=spawn_pos,
                exit=exit_pos,
            )

        # Check challenges are reachable
        challenges = scene.get("challenges", [])
        for i, challenge in enumerate(challenges):
            if not isinstance(challenge, dict):
                continue

            cx, cy = challenge.get("x"), challenge.get("y")
            if cx is not None and cy is not None:
                challenge_pos = (int(cx), int(cy))

                if challenge_pos not in reachable:
                    result.add_error(
                        code="PATH_003",
                        message=f"Challenge at ({cx}, {cy}) not reachable from spawn",
                        location=f"{location}.challenges[{i}]",
                    )

        # Check NPCs are reachable
        npcs = scene.get("npcs", [])
        for npc_id in npcs:
            # Need to look up NPC position from manifest
            # This is handled in route_validator
            pass

        # Calculate and report reachability coverage
        total_walkable = sum(1 for v in walkable.values() if v)
        if total_walkable > 0:
            coverage = len(reachable) / total_walkable

            if coverage < 0.5:
                result.add_warning(
                    code="PATH_004",
                    message=f"Only {coverage:.1%} of walkable area reachable from spawn",
                    location=location,
                )

    def _build_walkability_grid(
        self,
        scene: dict,
        width: int,
        height: int,
    ) -> dict[tuple[int, int], bool]:
        """Build walkability grid from scene."""
        # Start with all tiles walkable
        walkable = {}
        for x in range(width):
            for y in range(height):
                walkable[(x, y)] = True

        # Mark non-walkable objects
        objects = scene.get("objects", [])
        for obj in objects:
            if not isinstance(obj, dict):
                continue

            x, y = obj.get("x"), obj.get("y")
            if x is None or y is None:
                continue

            if not obj.get("walkable", True):
                walkable[(int(x), int(y))] = False

        return walkable

    def _bfs_reachable(
        self,
        start: tuple[int, int],
        walkable: dict[tuple[int, int], bool],
        width: int,
        height: int,
    ) -> set[tuple[int, int]]:
        """BFS to find all reachable positions."""
        reachable = set()
        queue = deque([start])
        visited = {start}

        directions = [(0, -1), (0, 1), (-1, 0), (1, 0)]

        while queue:
            x, y = queue.popleft()
            reachable.add((x, y))

            for dx, dy in directions:
                nx, ny = x + dx, y + dy

                if (nx, ny) in visited:
                    continue

                if nx < 0 or nx >= width or ny < 0 or ny >= height:
                    continue

                if not walkable.get((nx, ny), False):
                    continue

                visited.add((nx, ny))
                queue.append((nx, ny))

        return reachable


# ═══════════════════════════════════════════════════════════════════════════════
#  SPATIAL VALIDATOR (COMBINED)
# ═══════════════════════════════════════════════════════════════════════════════


class SpatialValidator(BaseValidator):
    """
    Combined spatial validator.

    Runs:
    1. Grid Validation
    2. Collision Validation
    3. Pathfinding Validation
    """

    def __init__(self):
        self.grid_validator = GridValidator()
        self.collision_validator = CollisionValidator()
        self.pathfinding_validator = PathfindingValidator()

    @property
    def name(self) -> str:
        return "spatial_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        scenes = manifest.get("scenes", [])

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            # Run sub-validators
            self.grid_validator.validate(scene, i, result)
            self.collision_validator.validate(scene, i, result)
            self.pathfinding_validator.validate(scene, i, result)

        return result
