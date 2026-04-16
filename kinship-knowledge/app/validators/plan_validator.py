"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PLAN VALIDATOR                                             ║
║                                                                               ║
║  Validates game plan structure: goals, scenes, mechanics.                     ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Plan has valid goal type                                                  ║
║  2. Plan has at least one scene                                               ║
║  3. Each scene has valid mechanics                                            ║
║  4. Scenes are properly connected                                             ║
║  5. Narrative arc is coherent                                                 ║
║  6. Difficulty curve is reasonable                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
    ValidationSeverity,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  VALID GOAL TYPES
# ═══════════════════════════════════════════════════════════════════════════════

VALID_GOAL_TYPES = {
    "escape",
    "explore",
    "reach",
    "rescue",
    "deliver",
    "fetch",
    "gather",
    "defeat",
    "defend",
    "survive",
    "unlock",
    "solve",
    "activate",
    "befriend",
    "trade",
    "learn",
    "build",
    "repair",
    "craft",
}

VALID_NARRATIVE_PURPOSES = {
    "introduction",
    "rising_action",
    "climax",
    "resolution",
    "tutorial",
}

VALID_DIFFICULTY_LEVELS = {"easy", "medium", "hard"}


# ═══════════════════════════════════════════════════════════════════════════════
#  PLAN VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PlanValidationResult:
    """Result of plan validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Repaired data
    repaired_plan: Optional[Dict[str, Any]] = None
    repairs_made: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  PLAN VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class PlanValidator(BaseValidator):
    """
    Validates game plan structure.

    Ensures the plan has valid goals, scenes, and mechanics.
    Can also repair common issues.
    """

    @property
    def name(self) -> str:
        return "plan_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format (for pipeline compatibility).

        Expects manifest to be a GamePlan dict.
        """
        result = self.validate_plan(manifest)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="PLAN_INVALID",
                message=error,
                location="plan",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="PLAN_WARNING",
                message=warning,
                location="plan",
            )

        return val_result

    def validate_plan(self, plan: Dict[str, Any]) -> PlanValidationResult:
        """
        Validate a game plan.

        Args:
            plan: GamePlan dict

        Returns:
            PlanValidationResult
        """
        result = PlanValidationResult()

        if not plan:
            result.valid = False
            result.errors.append("Plan is empty")
            return result

        # Validate goal type
        goal_type = plan.get("overall_goal") or plan.get("goal_type", "")
        if isinstance(goal_type, str):
            goal_str = goal_type.lower()
        else:
            goal_str = str(goal_type).lower() if goal_type else ""

        if not goal_str:
            result.warnings.append(
                "No goal type specified. Will use 'explore' as default."
            )
        elif goal_str not in VALID_GOAL_TYPES:
            result.warnings.append(
                f"Unknown goal type '{goal_str}'. Will map to closest supported goal."
            )

        # Validate scenes
        scenes = plan.get("scenes", [])
        if not scenes:
            result.valid = False
            result.errors.append("Plan has no scenes")
            return result

        # Validate each scene
        scene_names = set()
        for i, scene in enumerate(scenes):
            scene_errors, scene_warnings = self._validate_scene(scene, i)
            result.errors.extend(scene_errors)
            result.warnings.extend(scene_warnings)

            scene_name = scene.get("scene_name", f"scene_{i}")
            if scene_name in scene_names:
                result.warnings.append(f"Duplicate scene name: {scene_name}")
            scene_names.add(scene_name)

        # Validate scene connectivity
        connectivity_errors = self._validate_connectivity(scenes)
        result.errors.extend(connectivity_errors)

        # Validate difficulty curve
        difficulty_warnings = self._validate_difficulty_curve(scenes)
        result.warnings.extend(difficulty_warnings)

        # Validate narrative arc
        narrative_warnings = self._validate_narrative_arc(scenes)
        result.warnings.extend(narrative_warnings)

        # Set valid flag
        result.valid = len(result.errors) == 0

        logger.info(
            f"Plan validated: valid={result.valid}, "
            f"{len(scenes)} scenes, {len(result.errors)} errors, {len(result.warnings)} warnings"
        )

        return result

    def _validate_scene(
        self, scene: Dict[str, Any], index: int
    ) -> tuple[List[str], List[str]]:
        """Validate a single scene."""
        errors = []
        warnings = []

        scene_id = scene.get("scene_name", f"scene_{index}")

        # Check required fields
        if not scene.get("scene_name"):
            warnings.append(f"Scene {index} has no name. Will use default.")

        if not scene.get("zone_type"):
            warnings.append(f"Scene '{scene_id}' has no zone_type. Will use 'forest'.")

        # Check mechanics
        mechanics = scene.get("mechanics", [])
        if not mechanics:
            warnings.append(
                f"Scene '{scene_id}' has no mechanics. Will assign defaults."
            )

        # Check challenges
        challenges = scene.get("challenges", [])
        if not challenges:
            warnings.append(f"Scene '{scene_id}' has no challenges.")
        else:
            for j, challenge in enumerate(challenges):
                if not challenge.get("mechanic_id"):
                    warnings.append(f"Challenge {j} in '{scene_id}' has no mechanic_id")

        # Check narrative purpose
        purpose = scene.get("narrative_purpose", "")
        if purpose and purpose not in VALID_NARRATIVE_PURPOSES:
            warnings.append(
                f"Scene '{scene_id}' has unknown narrative purpose: {purpose}"
            )

        # Check difficulty
        difficulty = scene.get("difficulty", "")
        if difficulty and difficulty not in VALID_DIFFICULTY_LEVELS:
            warnings.append(f"Scene '{scene_id}' has unknown difficulty: {difficulty}")

        return errors, warnings

    def _validate_connectivity(self, scenes: List[Dict[str, Any]]) -> List[str]:
        """Validate scene connectivity."""
        errors = []

        scene_names = {s.get("scene_name", f"scene_{i}") for i, s in enumerate(scenes)}

        for i, scene in enumerate(scenes[:-1]):  # All except last
            leads_to = scene.get("leads_to")
            if leads_to and leads_to not in scene_names:
                errors.append(
                    f"Scene '{scene.get('scene_name')}' leads to unknown scene: {leads_to}"
                )

        return errors

    def _validate_difficulty_curve(self, scenes: List[Dict[str, Any]]) -> List[str]:
        """Validate difficulty progression."""
        warnings = []

        difficulties = [s.get("difficulty", "medium") for s in scenes]

        # Check for sudden jumps
        difficulty_order = {"easy": 0, "medium": 1, "hard": 2}
        for i in range(len(difficulties) - 1):
            curr = difficulty_order.get(difficulties[i], 1)
            next_d = difficulty_order.get(difficulties[i + 1], 1)

            if next_d - curr > 1:
                warnings.append(
                    f"Large difficulty jump between scene {i} and {i+1} "
                    f"({difficulties[i]} → {difficulties[i+1]})"
                )

        return warnings

    def _validate_narrative_arc(self, scenes: List[Dict[str, Any]]) -> List[str]:
        """Validate narrative structure."""
        warnings = []

        purposes = [s.get("narrative_purpose", "") for s in scenes]

        # Check first scene is introduction
        if purposes and purposes[0] not in ("introduction", "tutorial", ""):
            warnings.append(
                "First scene is not marked as 'introduction'. "
                "Consider adding an intro scene."
            )

        # Check last scene is climax or resolution
        if purposes and purposes[-1] not in ("climax", "resolution", ""):
            warnings.append(
                "Last scene is not marked as 'climax' or 'resolution'. "
                "Consider a more conclusive ending."
            )

        return warnings

    def repair(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        """
        Repair common issues in a plan.

        Args:
            plan: GamePlan dict

        Returns:
            Repaired plan
        """
        repaired = dict(plan)

        # Ensure goal type
        if not repaired.get("overall_goal") and not repaired.get("goal_type"):
            repaired["overall_goal"] = "explore"

        # Ensure scenes have names
        scenes = repaired.get("scenes", [])
        for i, scene in enumerate(scenes):
            if not scene.get("scene_name"):
                scene["scene_name"] = f"Scene {i + 1}"
            if not scene.get("zone_type"):
                scene["zone_type"] = "forest"
            if not scene.get("mechanics"):
                scene["mechanics"] = ["collect_items"]
            if not scene.get("difficulty"):
                # Progressive difficulty
                if i == 0:
                    scene["difficulty"] = "easy"
                elif i == len(scenes) - 1:
                    scene["difficulty"] = "hard"
                else:
                    scene["difficulty"] = "medium"

        # Ensure connectivity
        for i, scene in enumerate(scenes[:-1]):
            if not scene.get("leads_to"):
                next_scene = scenes[i + 1]
                scene["leads_to"] = next_scene.get("scene_name", f"Scene {i + 2}")

        # Ensure difficulty curve
        if not repaired.get("difficulty_curve"):
            repaired["difficulty_curve"] = [
                s.get("difficulty", "medium") for s in scenes
            ]

        return repaired


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def validate_plan(plan: Dict[str, Any]) -> PlanValidationResult:
    """
    Validate a game plan.

    Args:
        plan: GamePlan dict

    Returns:
        PlanValidationResult
    """
    validator = PlanValidator()
    return validator.validate_plan(plan)


def validate_and_repair_plan(
    plan: Dict[str, Any],
) -> tuple[PlanValidationResult, Dict[str, Any]]:
    """
    Validate and repair a game plan.

    Args:
        plan: GamePlan dict

    Returns:
        (PlanValidationResult, repaired_plan)
    """
    validator = PlanValidator()
    result = validator.validate_plan(plan)
    repaired = validator.repair(plan)
    return result, repaired
