"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AUTO BALANCER                                              ║
║                                                                               ║
║  Automatically adjusts game difficulty and mechanics based on validation.     ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  • Ensure difficulty curve is smooth                                          ║
║  • Prevent difficulty spikes                                                  ║
║  • Balance challenge count across scenes                                      ║
║  • Adjust parameters if too hard/easy                                         ║
║  • Suggest mechanic substitutions                                             ║
║                                                                               ║
║  TRIGGERS:                                                                    ║
║  • After verification fails                                                   ║
║  • When difficulty curve is broken                                            ║
║  • When scene has too many/few challenges                                     ║
║                                                                               ║
║  This is SYSTEM logic — deterministic adjustments, no AI.                     ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
import logging

from app.pipeline.pipeline_state import (
    PipelineState,
    ChallengeOutput,
    SceneOutput,
)
from app.core.challenge_templates import (
    PARAMETER_CONSTRAINTS,
    get_template,
)
from app.core.mechanic_compatibility import (
    suggest_alternative_mechanics,
    check_scene_compatibility,
)
from app.core.difficulty_curve import (
    AudienceType,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  BALANCE CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class BalanceConfig:
    """Configuration for auto-balancing."""

    # Difficulty limits by audience
    max_complexity_children: int = 4
    max_complexity_teens: int = 6
    max_complexity_adults: int = 8

    # Scene limits
    min_challenges_per_scene: int = 1
    max_challenges_per_scene: int = 3

    # Difficulty spike threshold
    max_difficulty_jump: float = 2.0  # Max increase between scenes

    # Time limit bounds
    min_time_limit: int = 30
    max_time_limit: int = 180

    # Object count bounds
    min_object_count: int = 1
    max_object_count: int = 6


# ═══════════════════════════════════════════════════════════════════════════════
#  BALANCE ADJUSTMENT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class BalanceAdjustment:
    """A single balance adjustment."""

    scene_index: int
    adjustment_type: (
        str  # "reduce_complexity", "increase_time", "substitute_mechanic", etc.
    )
    original_value: any
    adjusted_value: any
    reason: str


@dataclass
class BalanceResult:
    """Result of auto-balancing."""

    balanced: bool = True
    adjustments: list[BalanceAdjustment] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    # Adjusted outputs (new immutable outputs with fixes)
    adjusted_challenges: list[ChallengeOutput] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  AUTO BALANCER
# ═══════════════════════════════════════════════════════════════════════════════


class AutoBalancer:
    """
    Automatically balances game difficulty and mechanics.

    SYSTEM component — deterministic adjustments.
    """

    def __init__(self, config: BalanceConfig = None):
        self.config = config or BalanceConfig()

    def balance(self, state: PipelineState) -> BalanceResult:
        """
        Balance the game based on current state.

        Args:
            state: Pipeline state with agent outputs

        Returns:
            BalanceResult with adjustments
        """
        result = BalanceResult()

        # Get audience complexity limit
        max_complexity = self._get_max_complexity(state.input.audience_type)

        # Balance each scene
        adjusted_outputs = []

        for co in state.challenge_outputs:
            adjusted_co = self._balance_scene(
                co,
                max_complexity,
                result,
            )
            adjusted_outputs.append(adjusted_co)

        # Check difficulty curve
        self._check_difficulty_curve(adjusted_outputs, result)

        # Check challenge distribution
        self._check_challenge_distribution(adjusted_outputs, result)

        result.adjusted_challenges = adjusted_outputs
        result.balanced = len(result.adjustments) == 0 or all(
            adj.adjustment_type != "failed" for adj in result.adjustments
        )

        return result

    def _get_max_complexity(self, audience_type: str) -> int:
        """Get maximum complexity for audience."""
        try:
            audience = AudienceType(audience_type)
        except ValueError:
            audience = AudienceType.CHILDREN_9_12

        complexity_map = {
            AudienceType.CHILDREN_6_8: self.config.max_complexity_children - 1,
            AudienceType.CHILDREN_9_12: self.config.max_complexity_children,
            AudienceType.TEENS: self.config.max_complexity_teens,
            AudienceType.ADULTS: self.config.max_complexity_adults,
        }

        return complexity_map.get(audience, self.config.max_complexity_children)

    def _balance_scene(
        self,
        challenge_output: ChallengeOutput,
        max_complexity: int,
        result: BalanceResult,
    ) -> ChallengeOutput:
        """
        Balance a single scene's challenges.

        Returns new ChallengeOutput with adjustments.
        """
        scene_idx = challenge_output.scene_index
        adjusted_challenges = []

        for challenge in challenge_output.challenges:
            adjusted = dict(challenge)  # Make mutable copy

            # Check complexity
            complexity = challenge.get("complexity", 3)
            if complexity > max_complexity:
                adjusted["complexity"] = max_complexity
                adjusted["params"] = self._reduce_params(
                    challenge.get("params", {}),
                    challenge.get("mechanic_id", ""),
                    max_complexity,
                )

                result.adjustments.append(
                    BalanceAdjustment(
                        scene_index=scene_idx,
                        adjustment_type="reduce_complexity",
                        original_value=complexity,
                        adjusted_value=max_complexity,
                        reason=f"Complexity {complexity} exceeds max {max_complexity} for audience",
                    )
                )

            # Check time limit
            params = adjusted.get("params", {})
            if "time_limit" in params:
                time_limit = params["time_limit"]
                if time_limit < self.config.min_time_limit:
                    params["time_limit"] = self.config.min_time_limit
                    result.adjustments.append(
                        BalanceAdjustment(
                            scene_index=scene_idx,
                            adjustment_type="increase_time",
                            original_value=time_limit,
                            adjusted_value=self.config.min_time_limit,
                            reason="Time limit too short",
                        )
                    )
                elif time_limit > self.config.max_time_limit:
                    params["time_limit"] = self.config.max_time_limit
                    result.adjustments.append(
                        BalanceAdjustment(
                            scene_index=scene_idx,
                            adjustment_type="reduce_time",
                            original_value=time_limit,
                            adjusted_value=self.config.max_time_limit,
                            reason="Time limit too long",
                        )
                    )

            # Check object count
            if "object_count" in params:
                obj_count = params["object_count"]
                if obj_count > self.config.max_object_count:
                    params["object_count"] = self.config.max_object_count
                    result.adjustments.append(
                        BalanceAdjustment(
                            scene_index=scene_idx,
                            adjustment_type="reduce_objects",
                            original_value=obj_count,
                            adjusted_value=self.config.max_object_count,
                            reason="Too many objects",
                        )
                    )

            adjusted["params"] = params
            adjusted_challenges.append(adjusted)

        # Create new immutable output
        return ChallengeOutput(
            scene_index=scene_idx,
            challenges=tuple(adjusted_challenges),
            tutorials=challenge_output.tutorials,
            mechanics_used=challenge_output.mechanics_used,
        )

    def _reduce_params(
        self,
        params: dict,
        mechanic_id: str,
        target_complexity: int,
    ) -> dict:
        """
        Reduce parameters to match target complexity.

        FIXED:
        - Iterates params by name, looks up in PARAMETER_CONSTRAINTS by param name
        - Accesses .min_value / .max_value on Constraint objects (not dict .get())
        - Also checks template-specific constraints
        """
        from app.core.challenge_templates import PARAMETER_CONSTRAINTS, get_template

        adjusted = dict(params)
        scale = target_complexity / 10.0

        # First: apply global PARAMETER_CONSTRAINTS (keyed by param name)
        for param_name, value in list(adjusted.items()):
            constraint = PARAMETER_CONSTRAINTS.get(param_name)
            if not constraint:
                continue

            # Constraint is a dataclass with .min_value, .max_value, .default
            min_val = constraint.min_value
            max_val = constraint.max_value

            if param_name in (
                "object_count",
                "collect_count",
                "deliver_count",
                "sequence_length",
                "bridge_pieces",
                "stack_height",
                "hazard_count",
            ):
                # These increase with difficulty — scale down
                adjusted[param_name] = min_val + int((max_val - min_val) * scale)
            elif param_name == "time_limit":
                # This decreases with difficulty — scale up (more time = easier)
                adjusted[param_name] = max_val - int((max_val - min_val) * scale)
            elif param_name == "zone_radius":
                adjusted[param_name] = min_val + int((max_val - min_val) * scale)

            # Clamp to valid range
            adjusted[param_name] = max(min_val, min(max_val, adjusted[param_name]))

        # Second: apply template-specific scaling if available
        template = get_template(mechanic_id)
        if template and template.scaling:
            from app.core.challenge_templates import Difficulty

            if target_complexity <= 3:
                difficulty = Difficulty.EASY
            elif target_complexity <= 6:
                difficulty = Difficulty.MEDIUM
            else:
                difficulty = Difficulty.HARD

            scaled = template.get_scaled_params(difficulty)
            if scaled:
                # Use template scaling as override (it's more specific)
                for key, val in scaled.items():
                    if isinstance(val, (int, float)):
                        adjusted[key] = val

        return adjusted

    def _check_difficulty_curve(
        self,
        challenge_outputs: list[ChallengeOutput],
        result: BalanceResult,
    ):
        """Check and fix difficulty curve."""
        prev_complexity = 0

        for co in challenge_outputs:
            # Get average complexity for this scene
            complexities = [c.get("complexity", 3) for c in co.challenges]

            if not complexities:
                continue

            avg_complexity = sum(complexities) / len(complexities)

            # Check for spike
            # Allow bigger jump from intro scene (index 0→1)
            max_jump = (
                self.config.max_difficulty_jump * 2
                if co.scene_index == 1
                else self.config.max_difficulty_jump
            )
            if avg_complexity - prev_complexity > max_jump:
                result.warnings.append(
                    f"Scene {co.scene_index}: Difficulty spike detected "
                    f"({prev_complexity} → {avg_complexity})"
                )

            prev_complexity = avg_complexity

    def _check_challenge_distribution(
        self,
        challenge_outputs: list[ChallengeOutput],
        result: BalanceResult,
    ):
        """Check challenge count distribution."""
        for co in challenge_outputs:
            count = len(co.challenges)

            if count < self.config.min_challenges_per_scene:
                result.warnings.append(
                    f"Scene {co.scene_index}: Too few challenges ({count})"
                )

            if count > self.config.max_challenges_per_scene:
                result.warnings.append(
                    f"Scene {co.scene_index}: Too many challenges ({count})"
                )


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC SUBSTITUTION
# ═══════════════════════════════════════════════════════════════════════════════


def suggest_mechanic_substitution(
    mechanic_id: str,
    reason: str,
    available_mechanics: list[str],
) -> Optional[str]:
    """
    Suggest a substitute mechanic.

    Args:
        mechanic_id: Mechanic to replace
        reason: Why replacement is needed
        available_mechanics: Available alternatives

    Returns:
        Substitute mechanic ID or None
    """
    alternatives = suggest_alternative_mechanics(
        mechanic_id,
        available_mechanics,
    )

    if alternatives:
        return alternatives[0]

    return None


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def auto_balance(state: PipelineState) -> BalanceResult:
    """
    Run auto-balancing on pipeline state.

    Args:
        state: Pipeline state

    Returns:
        BalanceResult
    """
    balancer = AutoBalancer()
    result = balancer.balance(state)

    # Apply adjustments if any
    if result.adjustments:
        state.challenge_outputs = result.adjusted_challenges

        for adj in result.adjustments:
            state.add_log(
                "auto_balancer",
                "ADJUSTED",
                f"Scene {adj.scene_index}: {adj.adjustment_type}",
            )

    for warning in result.warnings:
        state.add_log("auto_balancer", "WARNING", warning)

    return result
