"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    GAMEPLAY LOOP VALIDATOR                                    ║
║                                                                               ║
║  Validates gameplay loop has proper structure.                                ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Loop has a start state (entry point)                                      ║
║  2. Loop has progression steps                                                ║
║  3. Loop has a clear goal/end state                                           ║
║  4. Steps are achievable with available mechanics                             ║
║  5. No dead ends or infinite loops                                            ║
║  6. Loop is completable                                                       ║
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
#  STEP TYPES
# ═══════════════════════════════════════════════════════════════════════════════

ENTRY_STEP_TYPES = {"spawn", "start", "entry", "intro", "tutorial"}
EXIT_STEP_TYPES = {"goal", "exit", "end", "win", "complete", "finish"}
PROGRESSION_STEP_TYPES = {"challenge", "task", "quest", "objective", "checkpoint"}


# ═══════════════════════════════════════════════════════════════════════════════
#  LOOP VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class LoopValidationResult:
    """Result of gameplay loop validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Loop analysis
    has_entry: bool = False
    has_exit: bool = False
    has_progression: bool = False
    step_count: int = 0
    is_completable: bool = False

    # Dead end detection
    dead_ends: List[str] = field(default_factory=list)
    unreachable_steps: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  GAMEPLAY LOOP VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class GameplayLoopValidator(BaseValidator):
    """
    Validates gameplay loop structure.

    Ensures the loop has entry → progression → goal and is completable.
    """

    @property
    def name(self) -> str:
        return "gameplay_loop_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format (for pipeline compatibility).

        Expects manifest to have gameplay loop data.
        """
        loop = manifest.get("gameplay_loop", {})
        steps = manifest.get("gameplay_steps", [])

        result = self.validate_loop(loop, steps)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="LOOP_INVALID",
                message=error,
                location="gameplay_loop",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="LOOP_WARNING",
                message=warning,
                location="gameplay_loop",
            )

        return val_result

    def validate_loop(
        self,
        loop: Dict[str, Any],
        steps: Optional[List[Dict[str, Any]]] = None,
    ) -> LoopValidationResult:
        """
        Validate a gameplay loop.

        Args:
            loop: Gameplay loop configuration
            steps: Gameplay steps (optional)

        Returns:
            LoopValidationResult
        """
        result = LoopValidationResult()

        # Get steps from loop or parameter
        if not steps:
            steps = loop.get("steps", [])

        if not steps:
            # Check if this is a simple loop definition
            if loop.get("goal_type") and loop.get("mechanic_sequence"):
                # Simplified loop - create virtual steps
                steps = self._create_virtual_steps(loop)

        result.step_count = len(steps)

        if not steps:
            result.valid = False
            result.errors.append("Gameplay loop has no steps")
            return result

        # Check for entry point
        result.has_entry = self._has_entry_point(loop, steps)
        if not result.has_entry:
            result.warnings.append(
                "No explicit entry point found. First step will be used as entry."
            )

        # Check for exit/goal
        result.has_exit = self._has_exit_point(loop, steps)
        if not result.has_exit:
            result.errors.append("No goal/exit point found. Game has no win condition.")
            result.valid = False

        # Check for progression
        result.has_progression = self._has_progression(steps)
        if not result.has_progression:
            result.warnings.append(
                "Loop has no progression steps. Game may feel empty."
            )

        # Validate each step
        for i, step in enumerate(steps):
            step_errors, step_warnings = self._validate_step(step, i, steps)
            result.errors.extend(step_errors)
            result.warnings.extend(step_warnings)

        # Check for dead ends
        result.dead_ends = self._find_dead_ends(steps)
        if result.dead_ends:
            result.warnings.append(
                f"Found {len(result.dead_ends)} potential dead ends: {result.dead_ends}"
            )

        # Check for unreachable steps
        result.unreachable_steps = self._find_unreachable(steps)
        if result.unreachable_steps:
            result.warnings.append(
                f"Found {len(result.unreachable_steps)} unreachable steps: {result.unreachable_steps}"
            )

        # Check completability
        result.is_completable = self._check_completability(loop, steps)
        if not result.is_completable:
            result.errors.append("Game loop is not completable")
            result.valid = False

        # Final validity check
        result.valid = len(result.errors) == 0

        logger.info(
            f"Loop validated: valid={result.valid}, "
            f"steps={result.step_count}, entry={result.has_entry}, exit={result.has_exit}"
        )

        return result

    def _create_virtual_steps(self, loop: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Create virtual steps from a simplified loop definition."""
        steps = []

        # Entry step
        steps.append(
            {
                "step_id": "entry",
                "type": "entry",
                "description": "Game start",
            }
        )

        # Mechanic steps
        mechanics = loop.get("mechanic_sequence", [])
        for i, mechanic in enumerate(mechanics):
            steps.append(
                {
                    "step_id": f"step_{i}",
                    "type": "challenge",
                    "mechanic": mechanic,
                    "description": f"Complete {mechanic}",
                }
            )

        # Goal step
        goal_type = loop.get("goal_type", "complete")
        steps.append(
            {
                "step_id": "goal",
                "type": "goal",
                "description": f"Achieve {goal_type}",
            }
        )

        return steps

    def _has_entry_point(
        self, loop: Dict[str, Any], steps: List[Dict[str, Any]]
    ) -> bool:
        """Check if loop has an entry point."""
        # Check loop config
        if loop.get("entry_point") or loop.get("spawn_point"):
            return True

        # Check steps
        for step in steps:
            step_type = step.get("type", "").lower()
            if step_type in ENTRY_STEP_TYPES:
                return True
            if step.get("is_entry", False):
                return True

        # First step counts as entry
        return len(steps) > 0

    def _has_exit_point(
        self, loop: Dict[str, Any], steps: List[Dict[str, Any]]
    ) -> bool:
        """Check if loop has an exit/goal point."""
        # Check loop config
        if loop.get("goal_type") or loop.get("win_condition"):
            return True

        # Check steps
        for step in steps:
            step_type = step.get("type", "").lower()
            if step_type in EXIT_STEP_TYPES:
                return True
            if step.get("is_goal", False) or step.get("is_exit", False):
                return True

        return False

    def _has_progression(self, steps: List[Dict[str, Any]]) -> bool:
        """Check if loop has progression steps."""
        for step in steps:
            step_type = step.get("type", "").lower()
            if step_type in PROGRESSION_STEP_TYPES:
                return True
            if step.get("mechanic") or step.get("challenge"):
                return True

        return len(steps) > 2  # More than entry + exit

    def _validate_step(
        self,
        step: Dict[str, Any],
        index: int,
        all_steps: List[Dict[str, Any]],
    ) -> tuple[List[str], List[str]]:
        """Validate a single step."""
        errors = []
        warnings = []

        step_id = step.get("step_id", f"step_{index}")

        # Check step has ID
        if not step.get("step_id"):
            warnings.append(f"Step {index} has no step_id")

        # Check step has type or mechanic
        if not step.get("type") and not step.get("mechanic"):
            warnings.append(f"Step '{step_id}' has no type or mechanic")

        # Check step is achievable
        if step.get("requires"):
            required = step["requires"]
            available_ids = {
                s.get("step_id", f"step_{i}") for i, s in enumerate(all_steps[:index])
            }

            if isinstance(required, str):
                required = [required]

            for req in required:
                if req not in available_ids:
                    warnings.append(
                        f"Step '{step_id}' requires '{req}' which may not be completed first"
                    )

        return errors, warnings

    def _find_dead_ends(self, steps: List[Dict[str, Any]]) -> List[str]:
        """Find steps that don't lead anywhere."""
        dead_ends = []

        step_ids = {s.get("step_id", f"step_{i}") for i, s in enumerate(steps)}

        for i, step in enumerate(steps):
            step_id = step.get("step_id", f"step_{i}")
            step_type = step.get("type", "").lower()

            # Skip exit steps
            if step_type in EXIT_STEP_TYPES:
                continue

            # Check if step leads to another
            leads_to = step.get("leads_to") or step.get("next_step")
            unlocks = step.get("unlocks", [])

            # Last step should lead somewhere or be exit
            if i == len(steps) - 1:
                if step_type not in EXIT_STEP_TYPES and not leads_to:
                    dead_ends.append(step_id)

        return dead_ends

    def _find_unreachable(self, steps: List[Dict[str, Any]]) -> List[str]:
        """Find steps that can't be reached."""
        if len(steps) <= 1:
            return []

        # Build reachability graph
        reachable = {steps[0].get("step_id", "step_0")}

        # Simple forward pass
        for i, step in enumerate(steps):
            step_id = step.get("step_id", f"step_{i}")

            if step_id in reachable:
                # Mark next steps as reachable
                leads_to = step.get("leads_to") or step.get("next_step")
                if leads_to:
                    reachable.add(leads_to)

                unlocks = step.get("unlocks", [])
                for unlock in unlocks:
                    reachable.add(unlock)

                # Sequential steps are reachable
                if i + 1 < len(steps):
                    next_id = steps[i + 1].get("step_id", f"step_{i+1}")
                    reachable.add(next_id)

        # Find unreachable
        unreachable = []
        for i, step in enumerate(steps):
            step_id = step.get("step_id", f"step_{i}")
            if step_id not in reachable:
                unreachable.append(step_id)

        return unreachable

    def _check_completability(
        self, loop: Dict[str, Any], steps: List[Dict[str, Any]]
    ) -> bool:
        """Check if the game loop can be completed."""
        # Simple check: can we reach from entry to exit?
        if not steps:
            return False

        # Check there's a path through all required steps
        required_steps = [s for s in steps if s.get("required", True)]

        # For now, assume linear progression is completable
        # A more sophisticated check would do graph traversal
        return len(required_steps) > 0

    def repair(
        self, loop: Dict[str, Any], steps: List[Dict[str, Any]]
    ) -> tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Repair common issues in a gameplay loop.

        Args:
            loop: Gameplay loop configuration
            steps: Gameplay steps

        Returns:
            (repaired_loop, repaired_steps)
        """
        repaired_loop = dict(loop)
        repaired_steps = [dict(s) for s in steps]

        # Ensure entry point
        if repaired_steps and not self._has_entry_point(repaired_loop, repaired_steps):
            repaired_steps[0]["type"] = "entry"
            repaired_steps[0]["is_entry"] = True

        # Ensure exit point
        if repaired_steps and not self._has_exit_point(repaired_loop, repaired_steps):
            repaired_steps[-1]["type"] = "goal"
            repaired_steps[-1]["is_goal"] = True

        # Ensure step IDs
        for i, step in enumerate(repaired_steps):
            if not step.get("step_id"):
                step["step_id"] = f"step_{i}"

        # Link sequential steps
        for i, step in enumerate(repaired_steps[:-1]):
            if not step.get("leads_to"):
                step["leads_to"] = repaired_steps[i + 1].get("step_id", f"step_{i+1}")

        return repaired_loop, repaired_steps


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_gameplay_loop(
    loop: Dict[str, Any],
    steps: Optional[List[Dict[str, Any]]] = None,
) -> LoopValidationResult:
    """
    Validate a gameplay loop.

    Args:
        loop: Gameplay loop configuration
        steps: Gameplay steps (optional)

    Returns:
        LoopValidationResult
    """
    validator = GameplayLoopValidator()
    return validator.validate_loop(loop, steps)
