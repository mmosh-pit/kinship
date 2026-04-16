"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    GAMEPLAY VALIDATOR                                         ║
║                                                                               ║
║  Validates game is completable from start to finish.                          ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • All scenes have spawn and exit                                             ║
║  • Scenes are ordered correctly                                               ║
║  • Required NPCs are present                                                  ║
║  • Required mechanics are available                                           ║
║  • Difficulty progression is valid                                            ║
║  • Game has clear win condition                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Any
import logging

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
    ValidationSeverity,
)


logger = logging.getLogger(__name__)


class GameplayValidator(BaseValidator):
    """Validates game is completable."""

    @property
    def name(self) -> str:
        return "gameplay_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        scenes = manifest.get("scenes", [])
        config = manifest.get("config", {})
        gameplay = manifest.get("gameplay", {})
        npcs = manifest.get("npcs", {})

        # Check we have scenes
        if not scenes:
            result.add_error(
                code="GAME_001",
                message="Game has no scenes",
            )
            return result

        # Validate each scene
        for i, scene in enumerate(scenes):
            self._validate_scene_playable(scene, i, result)

        # Check scene ordering
        self._validate_scene_ordering(scenes, result)

        # Check progression
        self._validate_difficulty_progression(scenes, result)

        # Check required NPCs for mechanics
        self._validate_required_npcs(scenes, npcs, gameplay, result)

        # Check win condition
        self._validate_win_condition(manifest, result)

        return result

    def _validate_scene_playable(
        self,
        scene: dict,
        index: int,
        result: ValidationResult,
    ):
        """Validate a scene is playable."""
        location = f"scenes[{index}]"

        if not isinstance(scene, dict):
            result.add_error(
                code="GAME_002",
                message="Scene is not a valid object",
                location=location,
            )
            return

        # Must have spawn
        spawn = scene.get("spawn")
        if not spawn or not isinstance(spawn, dict):
            result.add_error(
                code="GAME_003",
                message="Scene missing spawn point",
                location=location,
            )
        else:
            x, y = spawn.get("x"), spawn.get("y")
            if x is None or y is None:
                result.add_error(
                    code="GAME_004",
                    message="Spawn point missing coordinates",
                    location=f"{location}.spawn",
                )

        # Must have exit
        exit_point = scene.get("exit")
        if not exit_point or not isinstance(exit_point, dict):
            result.add_error(
                code="GAME_005",
                message="Scene missing exit point",
                location=location,
            )
        else:
            x, y = exit_point.get("x"), exit_point.get("y")
            if x is None or y is None:
                result.add_error(
                    code="GAME_006",
                    message="Exit point missing coordinates",
                    location=f"{location}.exit",
                )

        # Check path exists flag
        if scene.get("path_exists") is False:
            result.add_error(
                code="GAME_007",
                message="Scene has no valid path from spawn to exit",
                location=location,
            )

        # Check valid flag
        if scene.get("valid") is False:
            issues = scene.get("issues", [])
            result.add_error(
                code="GAME_008",
                message=f"Scene marked as invalid: {issues}",
                location=location,
            )

    def _validate_scene_ordering(
        self,
        scenes: list,
        result: ValidationResult,
    ):
        """Validate scenes are in correct order."""
        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            scene_index = scene.get("scene_index")
            if scene_index is not None and scene_index != i:
                result.add_warning(
                    code="GAME_009",
                    message=f"Scene at position {i} has scene_index={scene_index}",
                    location=f"scenes[{i}]",
                )

    def _validate_difficulty_progression(
        self,
        scenes: list,
        result: ValidationResult,
    ):
        """Validate difficulty increases smoothly."""
        prev_complexity = 0

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            challenges = scene.get("challenges", [])
            if not challenges:
                continue

            # Calculate average complexity
            complexities = []
            for c in challenges:
                if isinstance(c, dict):
                    complexities.append(c.get("complexity", 3))

            if complexities:
                avg = sum(complexities) / len(complexities)

                # Check for major drop
                if i > 0 and avg < prev_complexity * 0.5:
                    result.add_warning(
                        code="GAME_010",
                        message=f"Scene {i} has significantly lower difficulty than scene {i-1}",
                        location=f"scenes[{i}]",
                        previous_complexity=prev_complexity,
                        current_complexity=avg,
                    )

                # Check for major spike
                # Allow 4x jump from intro (scene 0→1) since blueprint sets intro=easy
                max_jump = 4 if i == 1 else 2
                if i > 0 and avg > prev_complexity * max_jump:
                    result.add_warning(
                        code="GAME_011",
                        message=f"Scene {i} has difficulty spike (complexity jump > {max_jump}x)",
                        location=f"scenes[{i}]",
                        previous_complexity=prev_complexity,
                        current_complexity=avg,
                    )

                prev_complexity = avg

    def _validate_required_npcs(
        self,
        scenes: list,
        npcs: dict,
        gameplay: dict,
        result: ValidationResult,
    ):
        """Validate required NPCs are present for mechanics."""
        # Check first scene has at least one NPC
        if scenes and isinstance(scenes[0], dict):
            first_scene_npcs = scenes[0].get("npcs", [])
            if not first_scene_npcs:
                result.add_warning(
                    code="GAME_012",
                    message="First scene has no NPCs (recommended to have guide)",
                    location="scenes[0]",
                )

        # Check for guide NPC
        has_guide = False
        for npc_id, npc in npcs.items():
            if isinstance(npc, dict) and npc.get("role") == "guide":
                has_guide = True
                break

        if not has_guide:
            result.add_warning(
                code="GAME_013",
                message="Game has no guide NPC (recommended for introduction)",
                location="npcs",
            )

        # Check mechanics have supporting NPCs
        mechanics = gameplay.get("mechanics", [])
        npc_roles = set()
        for npc in npcs.values():
            if isinstance(npc, dict):
                npc_roles.add(npc.get("role"))

        # Trade mechanics need merchant
        if "trade_items" in mechanics and "merchant" not in npc_roles:
            result.add_warning(
                code="GAME_014",
                message="Game uses trade_items but has no merchant NPC",
                location="npcs",
            )

    def _validate_win_condition(
        self,
        manifest: dict,
        result: ValidationResult,
    ):
        """Validate game has clear win condition."""
        config = manifest.get("config", {})
        scenes = manifest.get("scenes", [])

        goal_type = config.get("goal_type")

        if not goal_type:
            result.add_warning(
                code="GAME_015",
                message="Game has no defined goal_type",
                location="config.goal_type",
            )

        # Last scene should have exit
        if scenes:
            last_scene = scenes[-1]
            if isinstance(last_scene, dict):
                if not last_scene.get("exit"):
                    result.add_error(
                        code="GAME_016",
                        message="Last scene has no exit (no win condition)",
                        location=f"scenes[{len(scenes)-1}]",
                    )
