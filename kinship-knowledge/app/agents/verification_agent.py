"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    VERIFICATION AGENT                                         ║
║                                                                               ║
║  Validates the complete generated game against all rules.                     ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  • Softlock validation (reachability)                                         ║
║  • Mechanic compatibility validation                                          ║
║  • Repetition validation                                                      ║
║  • Difficulty curve validation                                                ║
║  • NPC placement validation                                                   ║
║  • Challenge parameter validation                                             ║
║                                                                               ║
║  This agent is the FINAL GATE before manifest assembly.                       ║
║  If validation fails, generation is rejected.                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional
import logging

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult
from app.pipeline.pipeline_state import PipelineState, PipelineStage
from app.validators.softlock_validator import (
    validate_scene_for_softlocks,
    SoftlockSeverity,
)
from app.core.mechanic_compatibility import (
    check_scene_compatibility,
    check_game_loop_compatibility,
    validate_no_repetition,
)
from app.core.difficulty_curve import (
    validate_game_difficulty,
)


logger = logging.getLogger(__name__)


class VerificationAgent(BaseAgent):
    """
    Agent responsible for validating the complete generated game.

    This is the final quality gate before manifest assembly.
    """

    @property
    def name(self) -> str:
        return "verification_agent"

    async def _execute(self, state: PipelineState) -> dict:
        """
        Run all validation checks.

        Checks:
        1. Path validation (spawn → exit reachable)
        2. Softlock validation
        3. Mechanic compatibility
        4. Repetition limits
        5. Difficulty progression
        6. Challenge parameters
        7. NPC placement
        """
        results = {
            "path_validation": {"passed": True, "issues": []},
            "softlock_validation": {"passed": True, "issues": []},
            "mechanic_validation": {"passed": True, "issues": []},
            "repetition_validation": {"passed": True, "issues": []},
            "difficulty_validation": {"passed": True, "issues": []},
            "challenge_validation": {"passed": True, "issues": []},
            "npc_validation": {"passed": True, "issues": []},
        }

        all_errors = []
        all_warnings = []

        # 1. Path Validation
        path_result = self._validate_paths(state)
        results["path_validation"] = path_result
        if not path_result["passed"]:
            all_errors.extend(path_result["issues"])

        # 2. Softlock Validation
        softlock_result = self._validate_softlocks(state)
        results["softlock_validation"] = softlock_result
        if not softlock_result["passed"]:
            all_errors.extend(softlock_result["issues"])
        all_warnings.extend(softlock_result.get("warnings", []))

        # 3. Mechanic Compatibility
        mechanic_result = self._validate_mechanics(state)
        results["mechanic_validation"] = mechanic_result
        if not mechanic_result["passed"]:
            all_errors.extend(mechanic_result["issues"])

        # 4. Repetition Limits
        repetition_result = self._validate_repetition(state)
        results["repetition_validation"] = repetition_result
        if not repetition_result["passed"]:
            all_errors.extend(repetition_result["issues"])

        # 5. Difficulty Progression
        difficulty_result = self._validate_difficulty(state)
        results["difficulty_validation"] = difficulty_result
        if not difficulty_result["passed"]:
            all_warnings.extend(difficulty_result["issues"])  # Warnings only

        # 6. Challenge Parameters
        challenge_result = self._validate_challenges(state)
        results["challenge_validation"] = challenge_result
        if not challenge_result["passed"]:
            all_errors.extend(challenge_result["issues"])

        # 7. NPC Placement
        npc_result = self._validate_npcs(state)
        results["npc_validation"] = npc_result
        if not npc_result["passed"]:
            all_warnings.extend(npc_result["issues"])  # Warnings only

        # Aggregate results
        is_valid = all(r["passed"] for r in results.values())

        # Store in state via VerificationOutput (NOT by overwriting is_valid method!)
        from app.pipeline.pipeline_state import VerificationOutput

        state.verification_output = VerificationOutput(
            is_valid=is_valid,
            errors=tuple(all_errors),
            warnings=tuple(all_warnings),
            check_results=results,
        )

        return {
            "is_valid": is_valid,
            "checks_passed": sum(1 for r in results.values() if r["passed"]),
            "checks_total": len(results),
            "error_count": len(all_errors),
            "warning_count": len(all_warnings),
        }

    def _validate_paths(self, state: PipelineState) -> dict:
        """Validate that all scenes have valid paths."""
        issues = []

        for i, scene in enumerate(state.populated_scenes):
            if not scene.get("path_exists", True):
                issues.append(f"Scene {i}: No path from spawn to exit")

            if not scene.get("valid", True):
                for issue in scene.get("issues", []):
                    issues.append(f"Scene {i}: {issue}")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _validate_softlocks(self, state: PipelineState) -> dict:
        """Validate scenes for softlock conditions."""
        issues = []
        warnings = []

        for i, scene in enumerate(state.populated_scenes):
            # Build scene data for validator
            scene_data = self._build_scene_data(scene, state, i)

            result = validate_scene_for_softlocks(scene_data)

            for issue in result.get("issues", []):
                severity = issue.get("severity", SoftlockSeverity.ERROR)
                message = f"Scene {i}: {issue.get('message', 'Unknown issue')}"

                if severity == SoftlockSeverity.ERROR:
                    issues.append(message)
                else:
                    warnings.append(message)

        return {
            "passed": len(issues) == 0,
            "issues": issues,
            "warnings": warnings,
        }

    def _validate_mechanics(self, state: PipelineState) -> dict:
        """Validate mechanic compatibility."""
        issues = []

        # Get mechanics per scene
        scene_mechanics = []
        for challenges in state.scene_challenges:
            mechs = [c.get("mechanic_id") for c in challenges if c.get("mechanic_id")]
            scene_mechanics.append(mechs)

        # Check each scene
        for i, mechs in enumerate(scene_mechanics):
            if len(mechs) > 1:
                result = check_scene_compatibility(mechs)
                if not result.is_compatible:
                    issues.append(f"Scene {i}: {result.reason}")

        # Check full game loop
        all_mechs = [m for scene in scene_mechanics for m in scene]
        if all_mechs:
            loop_result = check_game_loop_compatibility(all_mechs)
            if not loop_result.is_compatible:
                issues.append(f"Game loop: {loop_result.reason}")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _validate_repetition(self, state: PipelineState) -> dict:
        """Validate mechanic repetition limits."""
        issues = []

        # Get mechanics per scene
        game_mechanics = []
        for challenges in state.scene_challenges:
            mechs = [c.get("mechanic_id") for c in challenges if c.get("mechanic_id")]
            game_mechanics.append(mechs)

        # Check repetition
        result = validate_no_repetition(game_mechanics)

        if not result["valid"]:
            # Scene issues
            for scene_issue in result.get("scene_issues", []):
                scene_idx = scene_issue.get("scene", "?")
                for violation in scene_issue.get("violations", []):
                    issues.append(f"Scene {scene_idx}: {violation}")

            # Game-wide issues
            for game_issue in result.get("game_issues", []):
                issues.append(f"Game: {game_issue}")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _validate_difficulty(self, state: PipelineState) -> dict:
        """Validate difficulty progression."""
        issues = []

        # Get complexity per scene
        scene_complexities = []
        for challenges in state.scene_challenges:
            if challenges:
                avg_complexity = sum(c.get("complexity", 3) for c in challenges) / len(
                    challenges
                )
                scene_complexities.append(avg_complexity)
            else:
                scene_complexities.append(0)

        # Check progression (should generally increase)
        for i in range(1, len(scene_complexities)):
            if scene_complexities[i] < scene_complexities[i - 1] * 0.5:
                issues.append(
                    f"Scene {i}: Difficulty drops significantly from scene {i-1}"
                )

        return {
            "passed": len(issues) == 0,  # Warnings only
            "issues": issues,
        }

    def _validate_challenges(self, state: PipelineState) -> dict:
        """Validate challenge parameters."""
        issues = []

        for scene_idx, challenges in enumerate(state.scene_challenges):
            for challenge in challenges:
                # Check required fields
                if not challenge.get("mechanic_id"):
                    issues.append(f"Scene {scene_idx}: Challenge missing mechanic_id")

                params = challenge.get("params", {})

                # Check for negative values
                for key, value in params.items():
                    if isinstance(value, (int, float)) and value < 0:
                        issues.append(
                            f"Scene {scene_idx}: Challenge has negative {key}"
                        )

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _validate_npcs(self, state: PipelineState) -> dict:
        """Validate NPC placement."""
        issues = []

        for scene_idx, npcs in enumerate(state.scene_npcs):
            scene = (
                state.populated_scenes[scene_idx]
                if scene_idx < len(state.populated_scenes)
                else None
            )

            for npc in npcs:
                x, y = npc.get("x", -1), npc.get("y", -1)

                # Check bounds
                if scene:
                    grid = scene.get("grid", {})
                    width = grid.get("width", 16)
                    height = grid.get("height", 16)

                    if x < 0 or x >= width or y < 0 or y >= height:
                        issues.append(
                            f"Scene {scene_idx}: NPC {npc.get('npc_id')} out of bounds"
                        )

                # Check for missing dialogue
                npc_id = npc.get("npc_id")
                dialogue_npc_ids = {do.npc_id for do in state.dialogue_outputs}
                if npc_id and npc_id not in dialogue_npc_ids:
                    issues.append(f"Scene {scene_idx}: NPC {npc_id} has no dialogue")

        return {
            "passed": len(issues) == 0,
            "issues": issues,
        }

    def _build_scene_data(
        self,
        scene: dict,
        state: PipelineState,
        scene_idx: int,
    ) -> dict:
        """Build scene data for softlock validator."""
        # Get challenges for this scene
        challenges = []
        if scene_idx < len(state.scene_challenges):
            challenges = state.scene_challenges[scene_idx]

        # Get NPCs for this scene
        npcs = []
        if scene_idx < len(state.scene_npcs):
            npcs = state.scene_npcs[scene_idx]

        return {
            "grid": scene.get("grid", {}),
            "spawn": scene.get("spawn", {}),
            "exit": scene.get("exit", {}),
            "objects": scene.get("objects", []),
            "challenges": challenges,
            "npcs": npcs,
        }

    def _validate_output(
        self,
        output: dict,
        state: PipelineState,
    ) -> tuple[bool, list[str]]:
        """Validate verification output."""
        errors = []

        if not output.get("is_valid", True):
            # Return validation errors as agent errors
            errors.extend(state.validation_errors)

        return len(errors) == 0, errors
