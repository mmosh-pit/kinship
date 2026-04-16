"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    GAME LOOP GENERATOR                                        ║
║                                                                               ║
║  Generates game progression logic to ensure challenges feel connected,        ║
║  not random.                                                                  ║
║                                                                               ║
║  Example progression:                                                         ║
║    talk_to_guide                                                              ║
║         ↓                                                                     ║
║    collect_berries                                                            ║
║         ↓                                                                     ║
║    deliver_to_npc                                                             ║
║         ↓                                                                     ║
║    unlock_gate                                                                ║
║         ↓                                                                     ║
║    reach_exit → next_scene                                                    ║
║                                                                               ║
║  LOOP PATTERNS:                                                               ║
║  • Intro → Exploration → Challenge → Unlock → Next                            ║
║  • Tutorial → Practice → Master → Reward                                      ║
║  • Collect → Craft → Use → Progress                                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  LOOP STEP TYPES
# ═══════════════════════════════════════════════════════════════════════════════


class LoopStepType(str, Enum):
    """Types of steps in a game loop."""

    # Introduction
    INTRO = "intro"  # Initial NPC interaction
    TUTORIAL = "tutorial"  # Learn mechanic

    # Exploration
    EXPLORE = "explore"  # Navigate area
    DISCOVER = "discover"  # Find something

    # Challenges
    COLLECT = "collect"  # Gather items
    PUZZLE = "puzzle"  # Solve puzzle
    COMBAT = "combat"  # Combat encounter
    SOCIAL = "social"  # Social interaction
    DELIVERY = "delivery"  # Deliver items

    # Progression
    UNLOCK = "unlock"  # Unlock path/door
    TRANSITION = "transition"  # Move to next area

    # Completion
    REWARD = "reward"  # Receive reward
    EXIT = "exit"  # Leave scene


# ═══════════════════════════════════════════════════════════════════════════════
#  LOOP STEP DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class LoopStep:
    """A single step in the game loop."""

    step_id: str
    step_type: LoopStepType

    # What mechanic to use (if any)
    mechanic_id: Optional[str] = None

    # What NPC role (if any)
    npc_role: Optional[str] = None

    # Dependencies (must complete before this)
    requires: list[str] = field(default_factory=list)

    # What this step unlocks
    unlocks: list[str] = field(default_factory=list)

    # Optional: specific asset requirements
    required_assets: list[str] = field(default_factory=list)

    # Is this step required to complete the scene?
    is_required: bool = True

    # Is this the final step?
    is_exit: bool = False

    # Position hint in scene
    position_hint: str = ""  # "near_spawn", "center", "near_exit", etc.


@dataclass
class GameLoop:
    """Complete game loop for a scene."""

    scene_id: str
    steps: list[LoopStep] = field(default_factory=list)

    # Entry point
    entry_step: str = ""

    # Exit points (can be multiple)
    exit_steps: list[str] = field(default_factory=list)

    # Optional: time limit for entire loop
    time_limit_seconds: Optional[int] = None

    def get_step(self, step_id: str) -> Optional[LoopStep]:
        """Get step by ID."""
        for step in self.steps:
            if step.step_id == step_id:
                return step
        return None

    def get_dependencies(self, step_id: str) -> list[LoopStep]:
        """Get all steps that must be completed before this step."""
        step = self.get_step(step_id)
        if not step:
            return []
        return [self.get_step(req) for req in step.requires if self.get_step(req)]

    def get_unlocked_by(self, step_id: str) -> list[LoopStep]:
        """Get all steps unlocked by completing this step."""
        step = self.get_step(step_id)
        if not step:
            return []
        return [
            self.get_step(unlock) for unlock in step.unlocks if self.get_step(unlock)
        ]

    def validate(self) -> dict:
        """Validate the game loop structure."""
        errors = []
        warnings = []

        # Check entry step exists
        if not self.entry_step:
            errors.append("No entry step defined")
        elif not self.get_step(self.entry_step):
            errors.append(f"Entry step '{self.entry_step}' not found")

        # Check exit steps exist
        if not self.exit_steps:
            errors.append("No exit steps defined")
        for exit_step in self.exit_steps:
            if not self.get_step(exit_step):
                errors.append(f"Exit step '{exit_step}' not found")

        # Check dependencies exist
        for step in self.steps:
            for req in step.requires:
                if not self.get_step(req):
                    errors.append(
                        f"Step '{step.step_id}' requires non-existent step '{req}'"
                    )
            for unlock in step.unlocks:
                if not self.get_step(unlock):
                    warnings.append(
                        f"Step '{step.step_id}' unlocks non-existent step '{unlock}'"
                    )

        # Check for circular dependencies
        for step in self.steps:
            visited = set()
            if self._has_cycle(step.step_id, visited):
                errors.append(
                    f"Circular dependency detected involving '{step.step_id}'"
                )

        # Check all required steps are reachable from entry
        reachable = self._get_reachable(self.entry_step)
        for step in self.steps:
            if step.is_required and step.step_id not in reachable:
                errors.append(
                    f"Required step '{step.step_id}' is not reachable from entry"
                )

        return {
            "valid": len(errors) == 0,
            "errors": errors,
            "warnings": warnings,
        }

    def _has_cycle(self, step_id: str, visited: set) -> bool:
        """Check for circular dependencies."""
        if step_id in visited:
            return True
        visited.add(step_id)
        step = self.get_step(step_id)
        if step:
            for req in step.requires:
                if self._has_cycle(req, visited.copy()):
                    return True
        return False

    def _get_reachable(self, start_id: str) -> set:
        """Get all steps reachable from start."""
        reachable = set()
        queue = [start_id]

        while queue:
            current = queue.pop(0)
            if current in reachable:
                continue
            reachable.add(current)
            step = self.get_step(current)
            if step:
                queue.extend(step.unlocks)

        return reachable


# ═══════════════════════════════════════════════════════════════════════════════
#  LOOP PATTERNS
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class LoopPattern:
    """A predefined loop pattern."""

    pattern_id: str
    name: str
    description: str

    # Step sequence (step_type -> step_type)
    sequence: list[LoopStepType] = field(default_factory=list)

    # Required mechanics categories
    required_categories: list[str] = field(default_factory=list)

    # Suitable for scene types
    suitable_scenes: list[str] = field(default_factory=list)


# Predefined loop patterns
LOOP_PATTERNS: dict[str, LoopPattern] = {
    "intro_explore_challenge": LoopPattern(
        pattern_id="intro_explore_challenge",
        name="Intro → Explore → Challenge",
        description="Basic pattern: meet NPC, explore area, complete challenge, exit",
        sequence=[
            LoopStepType.INTRO,
            LoopStepType.EXPLORE,
            LoopStepType.COLLECT,
            LoopStepType.UNLOCK,
            LoopStepType.EXIT,
        ],
        required_categories=["progression"],
        suitable_scenes=["forest", "village", "cave"],
    ),
    "tutorial_practice_master": LoopPattern(
        pattern_id="tutorial_practice_master",
        name="Tutorial → Practice → Master",
        description="Learning pattern: learn mechanic, practice it, master it",
        sequence=[
            LoopStepType.TUTORIAL,
            LoopStepType.PUZZLE,
            LoopStepType.PUZZLE,
            LoopStepType.REWARD,
            LoopStepType.EXIT,
        ],
        required_categories=["interaction"],
        suitable_scenes=["tutorial", "training_ground"],
    ),
    "collect_craft_use": LoopPattern(
        pattern_id="collect_craft_use",
        name="Collect → Craft → Use",
        description="Resource pattern: gather materials, make item, use it",
        sequence=[
            LoopStepType.INTRO,
            LoopStepType.COLLECT,
            LoopStepType.PUZZLE,  # Crafting as puzzle
            LoopStepType.UNLOCK,
            LoopStepType.EXIT,
        ],
        required_categories=["interaction", "progression"],
        suitable_scenes=["workshop", "forest", "village"],
    ),
    "social_quest_reward": LoopPattern(
        pattern_id="social_quest_reward",
        name="Social → Quest → Reward",
        description="Quest pattern: get quest from NPC, complete it, get reward",
        sequence=[
            LoopStepType.INTRO,
            LoopStepType.SOCIAL,
            LoopStepType.COLLECT,
            LoopStepType.DELIVERY,
            LoopStepType.REWARD,
            LoopStepType.EXIT,
        ],
        required_categories=["progression"],
        suitable_scenes=["village", "town", "market"],
    ),
    "explore_discover_unlock": LoopPattern(
        pattern_id="explore_discover_unlock",
        name="Explore → Discover → Unlock",
        description="Discovery pattern: explore area, find key item, unlock path",
        sequence=[
            LoopStepType.EXPLORE,
            LoopStepType.DISCOVER,
            LoopStepType.COLLECT,
            LoopStepType.UNLOCK,
            LoopStepType.EXIT,
        ],
        required_categories=["progression"],
        suitable_scenes=["cave", "ruins", "forest"],
    ),
    "puzzle_sequence": LoopPattern(
        pattern_id="puzzle_sequence",
        name="Puzzle Sequence",
        description="Multiple puzzles in sequence",
        sequence=[
            LoopStepType.INTRO,
            LoopStepType.PUZZLE,
            LoopStepType.PUZZLE,
            LoopStepType.PUZZLE,
            LoopStepType.REWARD,
            LoopStepType.EXIT,
        ],
        required_categories=["interaction"],
        suitable_scenes=["temple", "puzzle_room", "maze"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  LOOP GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════


def generate_loop_from_pattern(
    pattern_id: str,
    scene_id: str,
    available_mechanics: list[str],
    npc_roles: list[str] = None,
) -> Optional[GameLoop]:
    """
    Generate a game loop from a pattern.

    Args:
        pattern_id: Which pattern to use
        scene_id: Scene this loop is for
        available_mechanics: What mechanics can be used
        npc_roles: What NPC roles are available

    Returns:
        GameLoop or None if pattern not found
    """

    pattern = LOOP_PATTERNS.get(pattern_id)
    if not pattern:
        return None

    npc_roles = npc_roles or ["guide", "quest_giver"]

    loop = GameLoop(scene_id=scene_id)
    previous_step_id = None

    for i, step_type in enumerate(pattern.sequence):
        step_id = f"step_{i}_{step_type.value}"

        # Map step type to mechanic
        mechanic_id = _map_step_to_mechanic(step_type, available_mechanics)

        # Map step type to NPC role
        npc_role = _map_step_to_npc(step_type, npc_roles)

        # Create step
        step = LoopStep(
            step_id=step_id,
            step_type=step_type,
            mechanic_id=mechanic_id,
            npc_role=npc_role,
            requires=[previous_step_id] if previous_step_id else [],
            unlocks=[],
            is_exit=(step_type == LoopStepType.EXIT),
            position_hint=_get_position_hint(step_type, i, len(pattern.sequence)),
        )

        # Link previous step
        if previous_step_id:
            prev_step = loop.get_step(previous_step_id)
            if prev_step:
                prev_step.unlocks.append(step_id)

        loop.steps.append(step)

        # Set entry/exit
        if i == 0:
            loop.entry_step = step_id
        if step.is_exit:
            loop.exit_steps.append(step_id)

        previous_step_id = step_id

    return loop


def _map_step_to_mechanic(
    step_type: LoopStepType, available_mechanics: list[str]
) -> Optional[str]:
    """Map a step type to an appropriate mechanic."""

    # Priority lists for each step type
    mechanic_preferences = {
        LoopStepType.INTRO: ["talk_to_npc"],
        LoopStepType.TUTORIAL: ["talk_to_npc"],
        LoopStepType.EXPLORE: ["reach_destination", "avoid_hazard"],
        LoopStepType.DISCOVER: ["collect_all", "key_unlock"],
        LoopStepType.COLLECT: ["collect_items", "collect_all"],
        LoopStepType.PUZZLE: [
            "push_to_target",
            "sequence_activate",
            "bridge_gap",
            "pressure_plate",
        ],
        LoopStepType.COMBAT: ["attack_enemy", "defend_position"],
        LoopStepType.SOCIAL: ["talk_to_npc", "trade_items", "befriend_npc"],
        LoopStepType.DELIVERY: ["deliver_item"],
        LoopStepType.UNLOCK: ["key_unlock", "lever_activate"],
        LoopStepType.TRANSITION: ["reach_destination"],
        LoopStepType.REWARD: ["talk_to_npc"],
        LoopStepType.EXIT: ["reach_destination"],
    }

    preferences = mechanic_preferences.get(step_type, [])

    for pref in preferences:
        if pref in available_mechanics:
            return pref

    # Fallback: first available
    return available_mechanics[0] if available_mechanics else None


def _map_step_to_npc(step_type: LoopStepType, npc_roles: list[str]) -> Optional[str]:
    """Map a step type to an NPC role."""

    npc_preferences = {
        LoopStepType.INTRO: ["guide", "villager"],
        LoopStepType.TUTORIAL: ["trainer", "guide"],
        LoopStepType.SOCIAL: ["quest_giver", "merchant", "villager"],
        LoopStepType.DELIVERY: ["quest_giver", "villager"],
        LoopStepType.REWARD: ["quest_giver", "guide"],
    }

    preferences = npc_preferences.get(step_type, [])

    for pref in preferences:
        if pref in npc_roles:
            return pref

    return None


def _get_position_hint(step_type: LoopStepType, index: int, total: int) -> str:
    """Get position hint based on step type and position in sequence."""

    position_map = {
        LoopStepType.INTRO: "near_spawn",
        LoopStepType.TUTORIAL: "near_spawn",
        LoopStepType.UNLOCK: "near_exit",
        LoopStepType.EXIT: "near_exit",
        LoopStepType.REWARD: "near_exit",
    }

    if step_type in position_map:
        return position_map[step_type]

    # Middle steps go in center or along path
    if index < total // 2:
        return "along_path"
    else:
        return "center"


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_pattern(pattern_id: str) -> Optional[LoopPattern]:
    """Get a loop pattern by ID."""
    return LOOP_PATTERNS.get(pattern_id)


def get_all_patterns() -> dict[str, LoopPattern]:
    """Get all loop patterns."""
    return LOOP_PATTERNS


def get_patterns_for_scene_type(scene_type: str) -> list[LoopPattern]:
    """Get patterns suitable for a scene type."""
    return [p for p in LOOP_PATTERNS.values() if scene_type in p.suitable_scenes]


def suggest_pattern(
    scene_type: str,
    available_categories: list[str],
) -> Optional[LoopPattern]:
    """
    Suggest the best pattern for a scene.

    Args:
        scene_type: Type of scene (forest, village, etc.)
        available_categories: What mechanic categories are available

    Returns:
        Best matching pattern or None
    """

    # Get patterns for scene type
    candidates = get_patterns_for_scene_type(scene_type)

    if not candidates:
        # Fallback: use any pattern
        candidates = list(LOOP_PATTERNS.values())

    # Score by category match
    best = None
    best_score = -1

    for pattern in candidates:
        score = 0
        for cat in pattern.required_categories:
            if cat in available_categories:
                score += 1

        if score > best_score:
            best_score = score
            best = pattern

    return best


def create_custom_loop(
    scene_id: str,
    steps_config: list[dict],
) -> GameLoop:
    """
    Create a custom game loop from configuration.

    Args:
        scene_id: Scene ID
        steps_config: List of step configs:
            [
                {"step_type": "intro", "mechanic_id": "talk_to_npc", "npc_role": "guide"},
                {"step_type": "collect", "mechanic_id": "collect_items"},
                ...
            ]

    Returns:
        GameLoop
    """

    loop = GameLoop(scene_id=scene_id)
    previous_step_id = None

    for i, config in enumerate(steps_config):
        step_type = LoopStepType(config.get("step_type", "explore"))
        step_id = config.get("step_id", f"step_{i}_{step_type.value}")

        step = LoopStep(
            step_id=step_id,
            step_type=step_type,
            mechanic_id=config.get("mechanic_id"),
            npc_role=config.get("npc_role"),
            requires=config.get(
                "requires", [previous_step_id] if previous_step_id else []
            ),
            unlocks=config.get("unlocks", []),
            required_assets=config.get("required_assets", []),
            is_required=config.get("is_required", True),
            is_exit=config.get("is_exit", step_type == LoopStepType.EXIT),
            position_hint=config.get("position_hint", ""),
        )

        # Auto-link
        if previous_step_id and previous_step_id not in step.requires:
            step.requires.append(previous_step_id)

        if previous_step_id:
            prev_step = loop.get_step(previous_step_id)
            if prev_step and step_id not in prev_step.unlocks:
                prev_step.unlocks.append(step_id)

        loop.steps.append(step)

        if i == 0:
            loop.entry_step = step_id
        if step.is_exit:
            loop.exit_steps.append(step_id)

        previous_step_id = step_id

    return loop


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPATIBILITY INTEGRATION
# ═══════════════════════════════════════════════════════════════════════════════


def generate_compatible_loop(
    pattern_id: str,
    scene_id: str,
    available_mechanics: list[str],
    scene_index: int = 0,
    total_scenes: int = 4,
    npc_roles: list[str] = None,
) -> tuple[Optional[GameLoop], dict]:
    """
    Generate a game loop with compatibility validation.

    Args:
        pattern_id: Pattern to use
        scene_id: Scene ID
        available_mechanics: Available mechanics
        scene_index: Which scene (0-based)
        total_scenes: Total scenes in game
        npc_roles: Available NPC roles

    Returns:
        Tuple of (GameLoop or None, compatibility_result dict)
    """
    # Import here to avoid circular import
    from app.core.mechanic_compatibility import (
        check_scene_compatibility,
        check_progression_compatibility,
        suggest_compatible_mechanics,
        sort_by_progression,
    )

    # Generate base loop
    loop = generate_loop_from_pattern(
        pattern_id, scene_id, available_mechanics, npc_roles
    )

    if not loop:
        return None, {"valid": False, "error": f"Pattern not found: {pattern_id}"}

    # Extract mechanics from loop
    loop_mechanics = [step.mechanic_id for step in loop.steps if step.mechanic_id]

    # Check scene compatibility
    scene_result = check_scene_compatibility(loop_mechanics)

    # Check progression compatibility
    prog_result = check_progression_compatibility(
        loop_mechanics, scene_index, total_scenes
    )

    # Combine results
    result = {
        "valid": scene_result.is_compatible and prog_result.is_compatible,
        "score": (scene_result.score + prog_result.score) / 2,
        "synergies": scene_result.synergies,
        "conflicts": scene_result.conflicts,
        "warnings": scene_result.warnings,
        "order_violations": prog_result.order_violations,
        "missing_prerequisites": prog_result.missing_prerequisites,
    }

    # If not valid, try to suggest fixes
    if not result["valid"]:
        result["suggestions"] = suggest_compatible_mechanics(
            loop_mechanics, available_mechanics, max_suggestions=3
        )

    return loop, result


def validate_game_loops(
    loops: list[GameLoop],
) -> dict:
    """
    Validate compatibility across all game loops.

    Args:
        loops: List of GameLoops (one per scene)

    Returns:
        Validation result with overall score
    """
    from app.core.mechanic_compatibility import check_game_loop_compatibility

    # Extract mechanics from each loop
    all_mechanics = []
    for loop in loops:
        scene_mechanics = [step.mechanic_id for step in loop.steps if step.mechanic_id]
        all_mechanics.append(scene_mechanics)

    # Check full game compatibility
    result = check_game_loop_compatibility(all_mechanics)

    return {
        "valid": result.is_compatible,
        "score": result.score,
        "synergies": result.synergies,
        "conflicts": result.conflicts,
        "warnings": result.warnings,
        "order_violations": result.order_violations,
        "missing_prerequisites": result.missing_prerequisites,
    }
