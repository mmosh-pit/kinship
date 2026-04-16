"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SOFTLOCK VALIDATOR                                         ║
║                                                                               ║
║  Prevents impossible game states (softlocks).                                 ║
║                                                                               ║
║  SOFTLOCK EXAMPLES:                                                           ║
║  • Key behind locked door                                                     ║
║  • Push puzzle impossible (object stuck)                                      ║
║  • Collectible unreachable                                                    ║
║  • Route blocked by immovable object                                          ║
║  • Required NPC unreachable                                                   ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • Path exists after puzzle completion                                        ║
║  • Unlock mechanics are reachable                                             ║
║  • All required objects are reachable                                         ║
║  • Push puzzles have valid solutions                                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  SOFTLOCK TYPES
# ═══════════════════════════════════════════════════════════════════════════════


class SoftlockType(str, Enum):
    """Types of softlock conditions."""

    UNREACHABLE_KEY = "unreachable_key"
    UNREACHABLE_COLLECTIBLE = "unreachable_collectible"
    UNREACHABLE_NPC = "unreachable_npc"
    UNREACHABLE_EXIT = "unreachable_exit"
    BLOCKED_PATH = "blocked_path"
    IMPOSSIBLE_PUZZLE = "impossible_puzzle"
    CIRCULAR_DEPENDENCY = "circular_dependency"
    MISSING_REQUIRED_OBJECT = "missing_required_object"


class SoftlockSeverity(str, Enum):
    """Severity levels for softlock issues."""

    ERROR = "error"
    WARNING = "warning"


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class SoftlockIssue:
    """A detected softlock issue."""

    issue_type: SoftlockType
    severity: str  # "error" or "warning"
    description: str
    location: Optional[dict] = None  # {"x": int, "y": int} if applicable
    affected_objects: list[str] = field(default_factory=list)
    suggested_fix: str = ""


@dataclass
class SoftlockValidationResult:
    """Result of softlock validation."""

    is_valid: bool
    issues: list[SoftlockIssue] = field(default_factory=list)

    # Counts by severity
    error_count: int = 0
    warning_count: int = 0

    def add_issue(self, issue: SoftlockIssue):
        """Add an issue and update counts."""
        self.issues.append(issue)
        if issue.severity == "error":
            self.error_count += 1
            self.is_valid = False
        else:
            self.warning_count += 1


# ═══════════════════════════════════════════════════════════════════════════════
#  REACHABILITY CHECKER
# ═══════════════════════════════════════════════════════════════════════════════


def check_reachability(
    grid: list[list[int]],
    start: dict,
    targets: list[dict],
    blocked_values: list[int] = None,
) -> dict[str, bool]:
    """
    Check if targets are reachable from start using BFS.

    Args:
        grid: 2D occupancy grid (0=empty, 1=blocked, etc.)
        start: Start position {"x": int, "y": int}
        targets: List of target positions with IDs {"id": str, "x": int, "y": int}
        blocked_values: Grid values that block movement (default: [1])

    Returns:
        Dict mapping target ID to reachability
    """
    blocked_values = blocked_values or [1]

    height = len(grid)
    width = len(grid[0]) if height > 0 else 0

    # BFS from start
    from collections import deque

    visited = set()
    queue = deque([(start["x"], start["y"])])
    visited.add((start["x"], start["y"]))

    directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

    while queue:
        x, y = queue.popleft()

        for dx, dy in directions:
            nx, ny = x + dx, y + dy

            if 0 <= nx < width and 0 <= ny < height:
                if (nx, ny) not in visited:
                    if grid[ny][nx] not in blocked_values:
                        visited.add((nx, ny))
                        queue.append((nx, ny))

    # Check target reachability
    result = {}
    for target in targets:
        target_id = target.get("id", f"{target['x']},{target['y']}")
        result[target_id] = (target["x"], target["y"]) in visited

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  KEY/LOCK VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_key_lock_reachability(
    grid: list[list[int]],
    spawn: dict,
    keys: list[dict],
    locks: list[dict],
) -> list[SoftlockIssue]:
    """
    Validate that keys are reachable before their corresponding locks.

    Args:
        grid: Occupancy grid
        spawn: Player spawn position
        keys: List of key objects {"id": str, "x": int, "y": int, "unlocks": str}
        locks: List of lock objects {"id": str, "x": int, "y": int}

    Returns:
        List of softlock issues
    """
    issues = []

    # Check all keys are reachable from spawn
    key_reachability = check_reachability(grid, spawn, keys)

    for key in keys:
        key_id = key.get("id", f"key_{key['x']}_{key['y']}")

        if not key_reachability.get(key_id, False):
            issues.append(
                SoftlockIssue(
                    issue_type=SoftlockType.UNREACHABLE_KEY,
                    severity="error",
                    description=f"Key '{key_id}' is not reachable from spawn",
                    location={"x": key["x"], "y": key["y"]},
                    affected_objects=[key_id],
                    suggested_fix="Move key to reachable location or clear path",
                )
            )

    # Check for key behind lock scenario
    for lock in locks:
        lock_id = lock.get("id", f"lock_{lock['x']}_{lock['y']}")

        # Find the key for this lock
        matching_key = None
        for key in keys:
            if key.get("unlocks") == lock_id:
                matching_key = key
                break

        if matching_key:
            # Create a modified grid where the lock blocks the path
            locked_grid = [row[:] for row in grid]
            locked_grid[lock["y"]][lock["x"]] = 1  # Block lock tile

            # Check if key is reachable with lock blocking
            key_pos = [{"id": "key", "x": matching_key["x"], "y": matching_key["y"]}]
            reachable = check_reachability(locked_grid, spawn, key_pos)

            if not reachable.get("key", False):
                issues.append(
                    SoftlockIssue(
                        issue_type=SoftlockType.UNREACHABLE_KEY,
                        severity="error",
                        description=f"Key for '{lock_id}' is behind the locked door",
                        location={"x": matching_key["x"], "y": matching_key["y"]},
                        affected_objects=[lock_id, matching_key.get("id", "key")],
                        suggested_fix="Move key to accessible location before the lock",
                    )
                )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  PUSH PUZZLE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_push_puzzle(
    grid: list[list[int]],
    pushable_objects: list[dict],
    goal_zones: list[dict],
    spawn: dict,
) -> list[SoftlockIssue]:
    """
    Validate that push puzzles are solvable.

    Basic checks:
    - Objects are reachable
    - Objects can be pushed (have empty space on opposite side)
    - Goal zones are reachable
    - Objects can reach goal zones

    Args:
        grid: Occupancy grid
        pushable_objects: List of pushable objects {"id": str, "x": int, "y": int}
        goal_zones: List of goal zones {"id": str, "x": int, "y": int, "radius": int}
        spawn: Player spawn

    Returns:
        List of softlock issues
    """
    issues = []

    height = len(grid)
    width = len(grid[0]) if height > 0 else 0

    # Check objects are reachable
    obj_reachability = check_reachability(grid, spawn, pushable_objects)

    for obj in pushable_objects:
        obj_id = obj.get("id", f"obj_{obj['x']}_{obj['y']}")

        if not obj_reachability.get(obj_id, False):
            issues.append(
                SoftlockIssue(
                    issue_type=SoftlockType.UNREACHABLE_COLLECTIBLE,
                    severity="error",
                    description=f"Pushable object '{obj_id}' is not reachable",
                    location={"x": obj["x"], "y": obj["y"]},
                    affected_objects=[obj_id],
                    suggested_fix="Clear path to object or move object",
                )
            )
            continue

        # Check if object can be pushed (has at least one direction with space)
        x, y = obj["x"], obj["y"]
        can_push = False

        # Check all 4 directions: player needs space on one side,
        # object needs space on opposite side
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

        for dx, dy in directions:
            # Player position (behind object)
            px, py = x - dx, y - dy
            # Push destination (in front of object)
            dest_x, dest_y = x + dx, y + dy

            # Check bounds
            if not (0 <= px < width and 0 <= py < height):
                continue
            if not (0 <= dest_x < width and 0 <= dest_y < height):
                continue

            # Check if player can stand behind and destination is empty
            if grid[py][px] == 0 and grid[dest_y][dest_x] == 0:
                can_push = True
                break

        if not can_push:
            issues.append(
                SoftlockIssue(
                    issue_type=SoftlockType.IMPOSSIBLE_PUZZLE,
                    severity="error",
                    description=f"Object '{obj_id}' is stuck and cannot be pushed",
                    location={"x": x, "y": y},
                    affected_objects=[obj_id],
                    suggested_fix="Ensure object has at least one pushable direction",
                )
            )

    # Check goal zones are reachable
    goal_reachability = check_reachability(grid, spawn, goal_zones)

    for goal in goal_zones:
        goal_id = goal.get("id", f"goal_{goal['x']}_{goal['y']}")

        if not goal_reachability.get(goal_id, False):
            issues.append(
                SoftlockIssue(
                    issue_type=SoftlockType.UNREACHABLE_EXIT,
                    severity="error",
                    description=f"Goal zone '{goal_id}' is not reachable",
                    location={"x": goal["x"], "y": goal["y"]},
                    affected_objects=[goal_id],
                    suggested_fix="Clear path to goal zone",
                )
            )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  COLLECTIBLE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_collectibles(
    grid: list[list[int]],
    spawn: dict,
    collectibles: list[dict],
    required_count: int = None,
) -> list[SoftlockIssue]:
    """
    Validate that required collectibles are reachable.

    Args:
        grid: Occupancy grid
        spawn: Player spawn
        collectibles: List of collectibles {"id": str, "x": int, "y": int}
        required_count: How many must be collected (None = all)

    Returns:
        List of softlock issues
    """
    issues = []

    required_count = required_count or len(collectibles)

    # Check reachability
    reachability = check_reachability(grid, spawn, collectibles)

    reachable_count = sum(1 for r in reachability.values() if r)
    unreachable = [
        c
        for c in collectibles
        if not reachability.get(c.get("id", f"{c['x']},{c['y']}"), False)
    ]

    if reachable_count < required_count:
        issues.append(
            SoftlockIssue(
                issue_type=SoftlockType.UNREACHABLE_COLLECTIBLE,
                severity="error",
                description=f"Only {reachable_count}/{required_count} required collectibles are reachable",
                affected_objects=[
                    c.get("id", f"collectible_{c['x']}_{c['y']}") for c in unreachable
                ],
                suggested_fix="Move unreachable collectibles or clear paths",
            )
        )
    elif unreachable:
        # Some unreachable but not required - warning
        issues.append(
            SoftlockIssue(
                issue_type=SoftlockType.UNREACHABLE_COLLECTIBLE,
                severity="warning",
                description=f"{len(unreachable)} optional collectibles are unreachable",
                affected_objects=[
                    c.get("id", f"collectible_{c['x']}_{c['y']}") for c in unreachable
                ],
                suggested_fix="Consider moving unreachable collectibles",
            )
        )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_npc_reachability(
    grid: list[list[int]],
    spawn: dict,
    npcs: list[dict],
    required_npc_ids: list[str] = None,
) -> list[SoftlockIssue]:
    """
    Validate that required NPCs are reachable.

    Args:
        grid: Occupancy grid
        spawn: Player spawn
        npcs: List of NPCs {"id": str, "x": int, "y": int, "role": str}
        required_npc_ids: IDs of NPCs that must be reached (None = all with quests)

    Returns:
        List of softlock issues
    """
    issues = []

    # Determine required NPCs
    required_roles = {"quest_giver", "guardian", "trainer", "merchant"}

    if required_npc_ids is None:
        required_npc_ids = [
            npc.get("id", f"npc_{npc['x']}_{npc['y']}")
            for npc in npcs
            if npc.get("role") in required_roles
        ]

    # Check reachability
    reachability = check_reachability(grid, spawn, npcs)

    for npc in npcs:
        npc_id = npc.get("id", f"npc_{npc['x']}_{npc['y']}")

        if npc_id in required_npc_ids:
            if not reachability.get(npc_id, False):
                issues.append(
                    SoftlockIssue(
                        issue_type=SoftlockType.UNREACHABLE_NPC,
                        severity="error",
                        description=f"Required NPC '{npc_id}' ({npc.get('role', 'unknown')}) is not reachable",
                        location={"x": npc["x"], "y": npc["y"]},
                        affected_objects=[npc_id],
                        suggested_fix="Move NPC to reachable location or clear path",
                    )
                )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  EXIT VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_exit_reachability(
    grid: list[list[int]],
    spawn: dict,
    exits: list[dict],
    unlock_requirements: dict = None,
) -> list[SoftlockIssue]:
    """
    Validate that exits are reachable (after completing requirements).

    Args:
        grid: Occupancy grid
        spawn: Player spawn
        exits: List of exits {"id": str, "x": int, "y": int}
        unlock_requirements: Map of exit_id to requirements {"exit_1": ["key_1", "lever_1"]}

    Returns:
        List of softlock issues
    """
    issues = []

    unlock_requirements = unlock_requirements or {}

    # Check reachability
    reachability = check_reachability(grid, spawn, exits)

    for exit_obj in exits:
        exit_id = exit_obj.get("id", f"exit_{exit_obj['x']}_{exit_obj['y']}")

        if not reachability.get(exit_id, False):
            # Check if it's locked (might be intentionally unreachable)
            if exit_id in unlock_requirements:
                # This is okay - will be unlocked later
                continue

            issues.append(
                SoftlockIssue(
                    issue_type=SoftlockType.UNREACHABLE_EXIT,
                    severity="error",
                    description=f"Exit '{exit_id}' is not reachable and has no unlock requirement",
                    location={"x": exit_obj["x"], "y": exit_obj["y"]},
                    affected_objects=[exit_id],
                    suggested_fix="Add unlock mechanic or clear path to exit",
                )
            )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  DEPENDENCY VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_dependencies(
    challenges: list[dict],
) -> list[SoftlockIssue]:
    """
    Validate that challenge dependencies form a valid DAG (no cycles).

    Args:
        challenges: List of challenges {"id": str, "requires": [str], "unlocks": [str]}

    Returns:
        List of softlock issues
    """
    issues = []

    # Build dependency graph
    deps = {c["id"]: set(c.get("requires", [])) for c in challenges}

    # Detect cycles using DFS
    def has_cycle(node: str, visited: set, rec_stack: set) -> bool:
        visited.add(node)
        rec_stack.add(node)

        for dep in deps.get(node, []):
            if dep not in visited:
                if has_cycle(dep, visited, rec_stack):
                    return True
            elif dep in rec_stack:
                return True

        rec_stack.remove(node)
        return False

    visited = set()
    for challenge in challenges:
        if challenge["id"] not in visited:
            if has_cycle(challenge["id"], visited, set()):
                issues.append(
                    SoftlockIssue(
                        issue_type=SoftlockType.CIRCULAR_DEPENDENCY,
                        severity="error",
                        description=f"Circular dependency detected involving '{challenge['id']}'",
                        affected_objects=[challenge["id"]],
                        suggested_fix="Remove circular dependency",
                    )
                )

    return issues


# ═══════════════════════════════════════════════════════════════════════════════
#  FULL SCENE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


def validate_scene_for_softlocks(
    scene_data: dict,
) -> SoftlockValidationResult:
    """
    Run full softlock validation on a scene.

    Args:
        scene_data: Complete scene data with:
            - grid: 2D occupancy grid
            - spawn: Player spawn position
            - exits: Exit positions
            - challenges: Challenge definitions
            - npcs: NPC positions
            - collectibles: Collectible positions
            - pushable_objects: Push puzzle objects
            - goal_zones: Goal zone positions
            - keys: Key positions
            - locks: Lock positions

    Returns:
        SoftlockValidationResult with all issues
    """
    result = SoftlockValidationResult(is_valid=True)

    grid = scene_data.get("grid", [[]])
    spawn = scene_data.get("spawn", {"x": 0, "y": 0})

    # Validate key/lock reachability
    if "keys" in scene_data and "locks" in scene_data:
        issues = validate_key_lock_reachability(
            grid,
            spawn,
            scene_data["keys"],
            scene_data["locks"],
        )
        for issue in issues:
            result.add_issue(issue)

    # Validate push puzzles
    if "pushable_objects" in scene_data and "goal_zones" in scene_data:
        issues = validate_push_puzzle(
            grid,
            scene_data["pushable_objects"],
            scene_data["goal_zones"],
            spawn,
        )
        for issue in issues:
            result.add_issue(issue)

    # Validate collectibles
    if "collectibles" in scene_data:
        required = scene_data.get("required_collectibles")
        issues = validate_collectibles(
            grid,
            spawn,
            scene_data["collectibles"],
            required,
        )
        for issue in issues:
            result.add_issue(issue)

    # Validate NPCs
    if "npcs" in scene_data:
        issues = validate_npc_reachability(
            grid,
            spawn,
            scene_data["npcs"],
        )
        for issue in issues:
            result.add_issue(issue)

    # Validate exits
    if "exits" in scene_data:
        issues = validate_exit_reachability(
            grid,
            spawn,
            scene_data["exits"],
            scene_data.get("unlock_requirements"),
        )
        for issue in issues:
            result.add_issue(issue)

    # Validate dependencies
    if "challenges" in scene_data:
        issues = validate_dependencies(scene_data["challenges"])
        for issue in issues:
            result.add_issue(issue)

    return result
