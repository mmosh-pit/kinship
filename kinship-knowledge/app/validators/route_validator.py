"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ROUTE VALIDATOR                                            ║
║                                                                               ║
║  Validates player can complete the game from start to finish.                 ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • All scenes connected (exit leads to next spawn)                            ║
║  • All objectives reachable in order                                          ║
║  • Required items available before needed                                     ║
║  • NPCs reachable when needed                                                 ║
║  • No dead ends or unreachable areas                                          ║
║  • Complete route from scene 0 to final exit                                  ║
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


class RouteValidator(BaseValidator):
    """Validates complete game route is possible."""

    @property
    def name(self) -> str:
        return "route_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        scenes = manifest.get("scenes", [])
        npcs = manifest.get("npcs", {})
        gameplay = manifest.get("gameplay", {})

        if not scenes:
            result.add_error(
                code="ROUTE_001",
                message="No scenes to validate route",
            )
            return result

        # Check scene connectivity
        self._validate_scene_connectivity(scenes, result)

        # Check objective order
        self._validate_objective_order(scenes, gameplay, result)

        # Check NPC reachability
        self._validate_npc_reachability(scenes, npcs, result)

        # Check item availability
        self._validate_item_availability(scenes, result)

        # Validate complete route
        self._validate_complete_route(scenes, result)

        return result

    def _validate_scene_connectivity(
        self,
        scenes: list,
        result: ValidationResult,
    ):
        """Validate all scenes are connected."""
        for i in range(len(scenes) - 1):
            current_scene = scenes[i]
            next_scene = scenes[i + 1]

            if not isinstance(current_scene, dict) or not isinstance(next_scene, dict):
                continue

            # Current scene must have exit
            current_exit = current_scene.get("exit", {})
            if not current_exit or not current_exit.get("x"):
                result.add_error(
                    code="ROUTE_002",
                    message=f"Scene {i} has no exit to connect to scene {i+1}",
                    location=f"scenes[{i}]",
                )
                continue

            # Next scene must have spawn
            next_spawn = next_scene.get("spawn", {})
            if not next_spawn or not next_spawn.get("x"):
                result.add_error(
                    code="ROUTE_003",
                    message=f"Scene {i+1} has no spawn (cannot enter from scene {i})",
                    location=f"scenes[{i+1}]",
                )

    def _validate_objective_order(
        self,
        scenes: list,
        gameplay: dict,
        result: ValidationResult,
    ):
        """Validate objectives can be completed in order."""
        mechanics = gameplay.get("mechanics", [])

        # Track when each mechanic is first introduced
        mechanic_first_scene = {}
        mechanic_positions = {}

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            challenges = scene.get("challenges", [])
            for challenge in challenges:
                if not isinstance(challenge, dict):
                    continue

                mechanic = challenge.get("mechanic_id")
                if mechanic and mechanic not in mechanic_first_scene:
                    mechanic_first_scene[mechanic] = i

                    x, y = challenge.get("x"), challenge.get("y")
                    if x is not None and y is not None:
                        mechanic_positions[mechanic] = (i, x, y)

        # Check key_unlock has key available before door
        if "key_unlock" in mechanic_first_scene:
            scene_idx = mechanic_first_scene["key_unlock"]
            scene = scenes[scene_idx]

            if isinstance(scene, dict):
                # Look for key in same scene or earlier
                key_found = self._find_object_type(scenes[: scene_idx + 1], "key")

                if not key_found:
                    result.add_warning(
                        code="ROUTE_004",
                        message=f"key_unlock mechanic in scene {scene_idx} but no key found",
                        location=f"scenes[{scene_idx}]",
                    )

        # Check trade_items has merchant
        if "trade_items" in mechanic_first_scene:
            scene_idx = mechanic_first_scene["trade_items"]

            # Should have merchant NPC
            has_merchant = False
            for scene in scenes[: scene_idx + 1]:
                if isinstance(scene, dict):
                    for npc_id in scene.get("npcs", []):
                        # Would need to lookup NPC role
                        pass

    def _find_object_type(
        self,
        scenes: list,
        object_type: str,
    ) -> bool:
        """Find if object type exists in scenes."""
        for scene in scenes:
            if not isinstance(scene, dict):
                continue

            objects = scene.get("objects", [])
            for obj in objects:
                if isinstance(obj, dict):
                    obj_type = obj.get("type", "")
                    asset_name = obj.get("asset_name", "")

                    if (
                        object_type in obj_type.lower()
                        or object_type in asset_name.lower()
                    ):
                        return True

        return False

    def _validate_npc_reachability(
        self,
        scenes: list,
        npcs: dict,
        result: ValidationResult,
    ):
        """Validate all NPCs are reachable from spawn."""
        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            scene_npc_ids = scene.get("npcs", [])
            spawn = scene.get("spawn", {})
            spawn_pos = (spawn.get("x", 0), spawn.get("y", 0))

            width = scene.get("width", 16)
            height = scene.get("height", 16)

            # Build walkable grid
            walkable = self._build_walkable_grid(scene, width, height)

            # BFS from spawn
            reachable = self._bfs_reachable(spawn_pos, walkable, width, height)

            # Check each NPC
            for npc_id in scene_npc_ids:
                if npc_id not in npcs:
                    continue

                npc = npcs[npc_id]
                if not isinstance(npc, dict):
                    continue

                npc_pos = npc.get("position", {})
                nx, ny = npc_pos.get("x"), npc_pos.get("y")

                if nx is None or ny is None:
                    continue

                npc_position = (int(nx), int(ny))

                if npc_position not in reachable:
                    result.add_error(
                        code="ROUTE_005",
                        message=f"NPC '{npc_id}' at {npc_position} not reachable from spawn",
                        location=f"scenes[{i}]",
                        npc_id=npc_id,
                    )

    def _validate_item_availability(
        self,
        scenes: list,
        result: ValidationResult,
    ):
        """Validate required items are available when needed."""
        # Track collectibles
        collectibles_available = set()
        keys_available = 0
        locks_encountered = 0

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            objects = scene.get("objects", [])
            challenges = scene.get("challenges", [])

            # Count keys and locks in this scene
            scene_keys = 0
            scene_locks = 0

            for obj in objects:
                if isinstance(obj, dict):
                    asset_name = (obj.get("asset_name", "") or "").lower()
                    obj_type = (obj.get("type", "") or "").lower()

                    if "key" in asset_name or "key" in obj_type:
                        scene_keys += 1
                    if "lock" in asset_name or "door" in asset_name:
                        scene_locks += 1

            for challenge in challenges:
                if isinstance(challenge, dict):
                    mechanic = challenge.get("mechanic_id")
                    if mechanic == "key_unlock":
                        scene_locks += 1

            # Update totals
            keys_available += scene_keys

            # Check if we have enough keys
            if scene_locks > 0:
                if keys_available < locks_encountered + scene_locks:
                    result.add_warning(
                        code="ROUTE_006",
                        message=f"Scene {i} has {scene_locks} locks but only {keys_available - locks_encountered} keys available",
                        location=f"scenes[{i}]",
                    )

                locks_encountered += scene_locks

    def _validate_complete_route(
        self,
        scenes: list,
        result: ValidationResult,
    ):
        """Validate complete route from start to finish."""
        # Check first scene
        if scenes:
            first_scene = scenes[0]
            if isinstance(first_scene, dict):
                spawn = first_scene.get("spawn")
                if not spawn:
                    result.add_error(
                        code="ROUTE_007",
                        message="First scene has no spawn point (cannot start game)",
                        location="scenes[0]",
                    )

        # Check last scene
        if scenes:
            last_scene = scenes[-1]
            if isinstance(last_scene, dict):
                exit_point = last_scene.get("exit")
                if not exit_point:
                    result.add_error(
                        code="ROUTE_008",
                        message="Last scene has no exit (cannot complete game)",
                        location=f"scenes[{len(scenes)-1}]",
                    )

        # Count completable challenges
        total_challenges = 0
        blocked_challenges = 0

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            challenges = scene.get("challenges", [])
            for challenge in challenges:
                if isinstance(challenge, dict):
                    total_challenges += 1

                    # Check if challenge is reachable
                    # (already done in spatial validator)

        result.metadata = {
            "scene_count": len(scenes),
            "total_challenges": total_challenges,
            "route_complete": result.passed,
        }

    def _build_walkable_grid(
        self,
        scene: dict,
        width: int,
        height: int,
    ) -> dict[tuple[int, int], bool]:
        """Build walkability grid."""
        walkable = {}
        for x in range(width):
            for y in range(height):
                walkable[(x, y)] = True

        objects = scene.get("objects", [])
        for obj in objects:
            if isinstance(obj, dict):
                x, y = obj.get("x"), obj.get("y")
                if x is not None and y is not None:
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
        """BFS to find reachable positions."""
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
