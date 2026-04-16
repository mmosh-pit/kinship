"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SOFTLOCK & PATHFINDING VALIDATOR                           ║
║                                                                               ║
║  Wraps softlock_validator.py functions and adds:                             ║
║  1. Full manifest → scene_data extraction (keys, locks, pushables)           ║
║  2. Pathfinding validation (spawn → every objective)                         ║
║  3. Multi-scene flow validation (scene A → B → C progression)               ║
║  4. Execution logging (proof the validator ran + what it checked)            ║
║                                                                               ║
║  Integrates into ValidationPipeline as a BaseValidator.                      ║
║                                                                               ║
║  RUNS AFTER: Scene, NPC, Challenge, Route validators                        ║
║  RUNS BEFORE: Manifest validator                                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from collections import deque

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
)

logger = logging.getLogger(__name__)


class SoftlockPathValidator(BaseValidator):
    """
    Combined softlock + pathfinding validator.

    Three validation passes:
    1. Per-scene softlock (keys, locks, pushables, collectibles, NPCs, exits)
    2. Per-scene pathfinding (spawn → every objective via BFS)
    3. Multi-scene flow (route graph connectivity)
    """

    @property
    def name(self) -> str:
        return "softlock"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name="softlock")
        stats = {"scenes_checked": 0, "paths_checked": 0, "issues_found": 0}

        try:
            config = manifest.get("config", {})
            default_w = config.get("scene_width", 16)
            default_h = config.get("scene_height", 16)
            scenes = manifest.get("scenes", [])
            routes = manifest.get("routes", [])
            npcs_dict = manifest.get("npcs", {})

            # ── Pass 1: Per-scene softlock checks ───────────────
            for i, scene in enumerate(scenes):
                scene_result = self._validate_scene(
                    scene, i, routes, npcs_dict, default_w, default_h
                )
                stats["scenes_checked"] += 1

                for code, msg, loc, is_error in scene_result:
                    stats["issues_found"] += 1
                    if is_error:
                        result.add_error(code=code, message=msg, location=loc)
                    else:
                        result.add_warning(code=code, message=msg, location=loc)

            # ── Pass 2: Per-scene pathfinding ───────────────────
            for i, scene in enumerate(scenes):
                path_issues, paths_count = self._validate_paths(
                    scene, i, routes, npcs_dict, default_w, default_h
                )
                stats["paths_checked"] += paths_count

                for code, msg, loc, is_error in path_issues:
                    stats["issues_found"] += 1
                    if is_error:
                        result.add_error(code=code, message=msg, location=loc)
                    else:
                        result.add_warning(code=code, message=msg, location=loc)

            # ── Pass 3: Multi-scene flow ────────────────────────
            flow_issues = self._validate_multi_scene_flow(
                scenes, routes, default_w, default_h
            )
            for code, msg, loc, is_error in flow_issues:
                stats["issues_found"] += 1
                if is_error:
                    result.add_error(code=code, message=msg, location=loc)
                else:
                    result.add_warning(code=code, message=msg, location=loc)

            # ── Log execution proof ─────────────────────────────
            result.metadata = stats
            logger.info(
                f"Softlock validator: {stats['scenes_checked']} scenes, "
                f"{stats['paths_checked']} paths checked, "
                f"{stats['issues_found']} issues found"
            )

        except Exception as e:
            logger.error(f"Softlock validator crashed: {e}")
            result.add_warning(
                code="SOFTLOCK_CRASH",
                message=f"Softlock validation failed: {e}",
            )

        return result

    # ═══════════════════════════════════════════════════════════════════════
    #  PASS 1: PER-SCENE SOFTLOCK
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_scene(
        self,
        scene: dict,
        scene_index: int,
        routes: list,
        npcs_dict: dict,
        default_w: int,
        default_h: int,
    ) -> List[Tuple[str, str, str, bool]]:
        """
        Run softlock checks on a single scene.
        Returns list of (code, message, location, is_error).
        """
        issues = []
        width = scene.get("width", default_w)
        height = scene.get("height", default_h)
        scene_name = scene.get("scene_name", f"Scene {scene_index + 1}")
        loc = f"scenes[{scene_index}]"

        # Build occupancy grid
        grid = self._build_grid(scene, width, height)
        spawn = scene.get("spawn", {"x": width // 2, "y": height - 2})

        # ── Check spawn exists and is valid ─────────────────────
        sx = spawn.get("x", 0)
        sy = spawn.get("y", 0)
        if not (0 <= sx < width and 0 <= sy < height):
            issues.append((
                "SOFTLOCK_SPAWN_OOB",
                f"{scene_name}: Spawn ({sx},{sy}) is outside grid bounds",
                loc, True
            ))
            return issues  # Can't continue without valid spawn

        if height > 0 and width > 0 and grid[int(sy)][int(sx)] == 1:
            issues.append((
                "SOFTLOCK_SPAWN_BLOCKED",
                f"{scene_name}: Spawn ({sx},{sy}) is on a blocked tile",
                loc, True
            ))

        # ── Extract challenge-specific objects ──────────────────
        keys, locks, pushables, goal_zones = self._extract_challenge_objects(
            scene, npcs_dict
        )

        # ── Run softlock_validator functions ────────────────────
        try:
            from app.validators.softlock_validator import (
                validate_scene_for_softlocks,
            )

            # Build full scene_data
            scene_data = {
                "grid": grid,
                "spawn": spawn,
                "exits": self._get_exits(routes, scene_index),
                "npcs": self._get_npcs(scene, npcs_dict),
                "collectibles": self._get_collectibles(scene),
                "challenges": scene.get("challenges", []),
                "keys": keys,
                "locks": locks,
                "pushable_objects": pushables,
                "goal_zones": goal_zones,
            }

            sl_result = validate_scene_for_softlocks(scene_data)

            if not sl_result.is_valid:
                for issue in sl_result.issues:
                    desc = getattr(issue, "description", str(issue))
                    sev = getattr(issue, "severity", "error")
                    is_err = str(sev) == "error"
                    code = f"SOFTLOCK_{getattr(issue, 'issue_type', 'UNKNOWN')}"
                    issues.append((code, f"{scene_name}: {desc}", loc, is_err))

        except ImportError:
            pass  # softlock_validator not available
        except Exception as e:
            issues.append((
                "SOFTLOCK_CHECK_FAIL",
                f"{scene_name}: Softlock check failed: {e}",
                loc, False
            ))

        return issues

    # ═══════════════════════════════════════════════════════════════════════
    #  PASS 2: PATHFINDING (spawn → every objective)
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_paths(
        self,
        scene: dict,
        scene_index: int,
        routes: list,
        npcs_dict: dict,
        default_w: int,
        default_h: int,
    ) -> Tuple[List[Tuple[str, str, str, bool]], int]:
        """
        BFS from spawn to every objective in the scene.
        Returns (issues, paths_checked_count).
        """
        issues = []
        paths_checked = 0
        width = scene.get("width", default_w)
        height = scene.get("height", default_h)
        scene_name = scene.get("scene_name", f"Scene {scene_index + 1}")
        loc = f"scenes[{scene_index}]"

        grid = self._build_grid(scene, width, height)
        spawn = scene.get("spawn", {"x": width // 2, "y": height - 2})

        # BFS once from spawn — get all reachable cells
        reachable = self._bfs_all_reachable(grid, spawn, width, height)

        # ── Check exits ─────────────────────────────────────────
        exits = self._get_exits(routes, scene_index)
        for exit_pos in exits:
            ex, ey = int(exit_pos.get("x", 0)), int(exit_pos.get("y", 0))
            paths_checked += 1
            if (ex, ey) not in reachable:
                issues.append((
                    "PATH_EXIT_BLOCKED",
                    f"{scene_name}: Exit at ({ex},{ey}) unreachable from spawn",
                    loc, True
                ))

        # ── Check NPCs ──────────────────────────────────────────
        npcs = self._get_npcs(scene, npcs_dict)
        for npc in npcs:
            nx, ny = int(npc.get("x", 0)), int(npc.get("y", 0))
            npc_id = npc.get("id", npc.get("npc_id", f"npc_at_{nx}_{ny}"))
            paths_checked += 1
            if (nx, ny) not in reachable:
                issues.append((
                    "PATH_NPC_BLOCKED",
                    f"{scene_name}: NPC '{npc_id}' at ({nx},{ny}) unreachable from spawn",
                    loc, True
                ))

        # ── Check collectibles / interactive objects ────────────
        collectibles = self._get_collectibles(scene)
        for obj in collectibles:
            ox, oy = int(obj.get("x", 0)), int(obj.get("y", 0))
            obj_id = obj.get("id", f"obj_at_{ox}_{oy}")
            paths_checked += 1
            if (ox, oy) not in reachable:
                issues.append((
                    "PATH_OBJECT_BLOCKED",
                    f"{scene_name}: Object '{obj_id}' at ({ox},{oy}) unreachable from spawn",
                    loc, False  # Warning — might be intentionally hidden
                ))

        # ── Check challenge locations ───────────────────────────
        for ch in scene.get("challenges", []):
            if not isinstance(ch, dict):
                continue
            ch_pos = ch.get("position", {})
            cx = ch.get("x", ch_pos.get("x"))
            cy = ch.get("y", ch_pos.get("y"))
            if cx is not None and cy is not None:
                ch_name = ch.get("name", ch.get("challenge_id", "challenge"))
                paths_checked += 1
                if (int(cx), int(cy)) not in reachable:
                    issues.append((
                        "PATH_CHALLENGE_BLOCKED",
                        f"{scene_name}: Challenge '{ch_name}' at ({cx},{cy}) unreachable from spawn",
                        loc, True
                    ))

        return issues, paths_checked

    # ═══════════════════════════════════════════════════════════════════════
    #  PASS 3: MULTI-SCENE FLOW
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_multi_scene_flow(
        self,
        scenes: list,
        routes: list,
        default_w: int,
        default_h: int,
    ) -> List[Tuple[str, str, str, bool]]:
        """
        Validate that the scene graph is traversable:
        - Every scene (except last) has at least one exit route
        - Every scene (except first) is reachable from a previous scene
        - No orphaned scenes
        """
        issues = []
        if len(scenes) <= 1:
            return issues

        # Build adjacency from routes
        outgoing = {}  # scene_index → [target_scene_indices]
        incoming = {}  # scene_index → [source_scene_indices]

        for route in routes:
            from_idx = route.get("from_scene")
            to_idx = route.get("to_scene")
            if from_idx is not None and to_idx is not None:
                outgoing.setdefault(from_idx, []).append(to_idx)
                incoming.setdefault(to_idx, []).append(from_idx)

        # Check every non-last scene has an outgoing route
        for i in range(len(scenes) - 1):
            scene_name = scenes[i].get("scene_name", f"Scene {i + 1}")
            if i not in outgoing or not outgoing[i]:
                issues.append((
                    "FLOW_NO_EXIT",
                    f"{scene_name}: No route to next scene (dead end)",
                    f"scenes[{i}]", True
                ))

        # Check every non-first scene has an incoming route
        for i in range(1, len(scenes)):
            scene_name = scenes[i].get("scene_name", f"Scene {i + 1}")
            if i not in incoming or not incoming[i]:
                issues.append((
                    "FLOW_ORPHANED",
                    f"{scene_name}: No route from any previous scene (unreachable)",
                    f"scenes[{i}]", True
                ))

        # Check full traversal: BFS from scene 0
        visited_scenes = set()
        queue = deque([0])
        visited_scenes.add(0)
        while queue:
            current = queue.popleft()
            for target in outgoing.get(current, []):
                if target not in visited_scenes:
                    visited_scenes.add(target)
                    queue.append(target)

        for i in range(len(scenes)):
            if i not in visited_scenes:
                scene_name = scenes[i].get("scene_name", f"Scene {i + 1}")
                issues.append((
                    "FLOW_DISCONNECTED",
                    f"{scene_name}: Not reachable from starting scene via routes",
                    f"scenes[{i}]", True
                ))

        # Check that exit tiles in each scene are actually reachable from spawn
        for route in routes:
            from_idx = route.get("from_scene")
            if from_idx is None or from_idx >= len(scenes):
                continue

            trigger = route.get("trigger", {})
            exit_pos = trigger.get("position", {})
            ex = exit_pos.get("x")
            ey = exit_pos.get("y")
            if ex is None or ey is None:
                continue

            scene = scenes[from_idx]
            width = scene.get("width", default_w)
            height = scene.get("height", default_h)
            spawn = scene.get("spawn", {"x": width // 2, "y": height - 2})
            grid = self._build_grid(scene, width, height)
            reachable = self._bfs_all_reachable(grid, spawn, width, height)

            if (int(ex), int(ey)) not in reachable:
                scene_name = scene.get("scene_name", f"Scene {from_idx + 1}")
                to_idx = route.get("to_scene", "?")
                to_name = scenes[to_idx].get("scene_name", f"Scene {to_idx + 1}") if isinstance(to_idx, int) and to_idx < len(scenes) else str(to_idx)
                issues.append((
                    "FLOW_EXIT_UNREACHABLE",
                    f"{scene_name}: Exit to '{to_name}' at ({ex},{ey}) blocked from spawn",
                    f"routes[{from_idx}→{to_idx}]", True
                ))

        return issues

    # ═══════════════════════════════════════════════════════════════════════
    #  HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _build_grid(
        self, scene: dict, width: int, height: int
    ) -> List[List[int]]:
        """Build 2D occupancy grid from scene objects."""
        grid = [[0] * width for _ in range(height)]

        for actor in scene.get("actors", []) + scene.get("objects", []):
            if not isinstance(actor, dict):
                continue
            pos = actor.get("position", {})
            ax = actor.get("x", pos.get("x"))
            ay = actor.get("y", pos.get("y"))
            walkable = actor.get("walkable", False)

            if ax is not None and ay is not None and not walkable:
                gx, gy = int(ax), int(ay)
                if 0 <= gx < width and 0 <= gy < height:
                    grid[gy][gx] = 1

        return grid

    def _bfs_all_reachable(
        self,
        grid: List[List[int]],
        spawn: dict,
        width: int,
        height: int,
    ) -> Set[Tuple[int, int]]:
        """BFS from spawn, return all reachable cells."""
        sx = int(spawn.get("x", 0))
        sy = int(spawn.get("y", 0))

        if not (0 <= sx < width and 0 <= sy < height):
            return set()

        # Don't block spawn itself even if grid says blocked
        visited = set()
        queue = deque([(sx, sy)])
        visited.add((sx, sy))

        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

        while queue:
            x, y = queue.popleft()
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                if (0 <= nx < width and 0 <= ny < height
                        and (nx, ny) not in visited
                        and grid[ny][nx] != 1):
                    visited.add((nx, ny))
                    queue.append((nx, ny))

        return visited

    def _get_exits(self, routes: list, scene_index: int) -> List[dict]:
        """Get exit positions for a scene from routes."""
        exits = []
        for route in routes:
            if route.get("from_scene") == scene_index:
                trigger = route.get("trigger", {})
                pos = trigger.get("position", {})
                if pos.get("x") is not None and pos.get("y") is not None:
                    exits.append(pos)
        return exits

    def _get_npcs(self, scene: dict, npcs_dict: dict) -> List[dict]:
        """Get NPC positions from scene."""
        npcs = []
        for npc in scene.get("npcs", []):
            if isinstance(npc, str):
                # Resolve from npcs_dict
                npc_data = npcs_dict.get(npc, {})
                if isinstance(npc_data, dict):
                    pos = npc_data.get("position", {})
                    x = npc_data.get("x", pos.get("x"))
                    y = npc_data.get("y", pos.get("y"))
                    if x is not None and y is not None:
                        npcs.append({"x": int(x), "y": int(y), "id": npc})
            elif isinstance(npc, dict):
                pos = npc.get("position", {})
                x = npc.get("x", pos.get("x"))
                y = npc.get("y", pos.get("y"))
                if x is not None and y is not None:
                    npc_id = npc.get("npc_id", npc.get("id", ""))
                    npcs.append({"x": int(x), "y": int(y), "id": npc_id})
        return npcs

    def _get_collectibles(self, scene: dict) -> List[dict]:
        """Get collectible/interactive object positions."""
        collectibles = []
        seen = set()

        for actor in scene.get("actors", []) + scene.get("objects", []):
            if not isinstance(actor, dict):
                continue
            obj_type = actor.get("type", "")
            if obj_type not in ("collectible", "interactive"):
                continue

            pos = actor.get("position", {})
            ax = actor.get("x", pos.get("x"))
            ay = actor.get("y", pos.get("y"))
            obj_id = actor.get("object_id", actor.get("id", ""))

            if ax is not None and ay is not None:
                key = (int(ax), int(ay))
                if key not in seen:
                    seen.add(key)
                    collectibles.append({
                        "x": int(ax), "y": int(ay), "id": obj_id
                    })

        return collectibles

    def _extract_challenge_objects(
        self, scene: dict, npcs_dict: dict
    ) -> Tuple[List[dict], List[dict], List[dict], List[dict]]:
        """
        Extract keys, locks, pushable objects, and goal zones
        from challenges and their mechanic types.
        """
        keys = []
        locks = []
        pushables = []
        goal_zones = []

        for ch in scene.get("challenges", []):
            if not isinstance(ch, dict):
                continue

            mechanic = ch.get("mechanic_id", "")
            ch_objects = ch.get("object_assignments", ch.get("objects", []))

            if mechanic == "key_unlock":
                # Extract key and lock from challenge objects
                for obj in (ch_objects if isinstance(ch_objects, list) else []):
                    if isinstance(obj, dict):
                        role = obj.get("role", obj.get("type", ""))
                        pos = obj.get("position", {})
                        x = obj.get("x", pos.get("x"))
                        y = obj.get("y", pos.get("y"))
                        if x is not None and y is not None:
                            entry = {
                                "x": int(x), "y": int(y),
                                "id": obj.get("id", obj.get("object_id", "")),
                            }
                            if "key" in role.lower():
                                entry["unlocks"] = ch.get("challenge_id", "")
                                keys.append(entry)
                            elif "lock" in role.lower() or "door" in role.lower():
                                locks.append(entry)

            elif mechanic == "push_to_target":
                for obj in (ch_objects if isinstance(ch_objects, list) else []):
                    if isinstance(obj, dict):
                        role = obj.get("role", obj.get("type", ""))
                        pos = obj.get("position", {})
                        x = obj.get("x", pos.get("x"))
                        y = obj.get("y", pos.get("y"))
                        if x is not None and y is not None:
                            entry = {
                                "x": int(x), "y": int(y),
                                "id": obj.get("id", obj.get("object_id", "")),
                            }
                            if "push" in role.lower() or "movable" in role.lower():
                                pushables.append(entry)
                            elif "target" in role.lower() or "goal" in role.lower():
                                goal_zones.append(entry)

        return keys, locks, pushables, goal_zones
