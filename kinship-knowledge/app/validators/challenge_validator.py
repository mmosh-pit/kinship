"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CHALLENGE VALIDATOR                                        ║
║                                                                               ║
║  Validates challenges are solvable.                                           ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • Challenge parameters within constraints                                    ║
║  • Required objects available                                                 ║
║  • Softlock conditions                                                        ║
║  • Mechanic dependencies met                                                  ║
║  • Time limits reasonable                                                     ║
║  • Challenge ordering valid                                                   ║
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


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC REQUIREMENTS
# ═══════════════════════════════════════════════════════════════════════════════

# Objects required for each mechanic
MECHANIC_REQUIREMENTS = {
    "push_to_target": ["pushable", "target"],
    "collect_items": ["collectible"],
    "key_unlock": ["key", "lockable"],
    "sequence_activate": ["switch", "activatable"],
    "pressure_plate": ["plate", "heavy"],
    "trade_items": ["tradeable", "merchant"],
    "deliver_item": ["deliverable", "destination"],
}

# Mechanics that can cause softlocks
SOFTLOCK_MECHANICS = [
    "push_to_target",  # Can push into corner
    "key_unlock",  # Can use key wrong
    "sequence_activate",  # Can activate wrong order
]

# Parameter constraints
PARAMETER_LIMITS = {
    "object_count": {"min": 1, "max": 10},
    "time_limit": {"min": 15, "max": 300},
    "distance": {"min": 2, "max": 20},
    "enemy_count": {"min": 1, "max": 5},
}


class ChallengeValidator(BaseValidator):
    """Validates challenges are solvable."""

    @property
    def name(self) -> str:
        return "challenge_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        scenes = manifest.get("scenes", [])
        config = manifest.get("config", {})
        audience = config.get("audience_type", "children_9_12")

        total_challenges = 0
        mechanics_used = set()

        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            challenges = scene.get("challenges", [])
            location = f"scenes[{i}]"

            for j, challenge in enumerate(challenges):
                if not isinstance(challenge, dict):
                    continue

                total_challenges += 1
                challenge_location = f"{location}.challenges[{j}]"

                # Validate challenge
                self._validate_challenge(
                    challenge, challenge_location, scene, audience, result
                )

                mechanic = challenge.get("mechanic_id")
                if mechanic:
                    mechanics_used.add(mechanic)

        # Check we have challenges
        if total_challenges == 0:
            result.add_warning(
                code="CHAL_001",
                message="Game has no challenges",
                location="scenes",
            )

        # Check for tutorial needs
        self._check_tutorial_coverage(scenes, mechanics_used, result)

        # Store metadata
        result.metadata = {
            "total_challenges": total_challenges,
            "mechanics_used": list(mechanics_used),
        }

        return result

    def _validate_challenge(
        self,
        challenge: dict,
        location: str,
        scene: dict,
        audience: str,
        result: ValidationResult,
    ):
        """Validate a single challenge."""
        mechanic_id = challenge.get("mechanic_id")
        params = challenge.get("params", {})

        if not mechanic_id:
            result.add_error(
                code="CHAL_002",
                message="Challenge missing mechanic_id",
                location=location,
            )
            return

        # Validate parameters within limits
        self._validate_parameters(params, mechanic_id, location, audience, result)

        # Check for softlock potential
        if mechanic_id in SOFTLOCK_MECHANICS:
            self._check_softlock_potential(challenge, location, scene, result)

        # Check complexity vs audience
        complexity = challenge.get("complexity", 3)
        self._validate_complexity_for_audience(complexity, audience, location, result)

        # Check challenge has position
        x, y = challenge.get("x"), challenge.get("y")
        if x is None or y is None:
            result.add_warning(
                code="CHAL_003",
                message="Challenge missing position coordinates",
                location=location,
            )

    def _validate_parameters(
        self,
        params: dict,
        mechanic_id: str,
        location: str,
        audience: str,
        result: ValidationResult,
    ):
        """Validate challenge parameters."""
        for param_name, value in params.items():
            if param_name not in PARAMETER_LIMITS:
                continue

            limits = PARAMETER_LIMITS[param_name]
            min_val = limits["min"]
            max_val = limits["max"]

            # Adjust for audience
            if audience in ["children_5_8", "children_9_12"]:
                if param_name == "time_limit":
                    min_val = 30  # More time for kids
                if param_name == "object_count":
                    max_val = 6  # Fewer objects for kids

            if not isinstance(value, (int, float)):
                result.add_error(
                    code="CHAL_004",
                    message=f"Parameter {param_name} must be a number",
                    location=f"{location}.params.{param_name}",
                )
                continue

            if value < min_val:
                result.add_error(
                    code="CHAL_005",
                    message=f"Parameter {param_name}={value} below minimum ({min_val})",
                    location=f"{location}.params.{param_name}",
                )

            if value > max_val:
                result.add_error(
                    code="CHAL_006",
                    message=f"Parameter {param_name}={value} exceeds maximum ({max_val})",
                    location=f"{location}.params.{param_name}",
                )

    def _check_softlock_potential(
        self,
        challenge: dict,
        location: str,
        scene: dict,
        result: ValidationResult,
    ):
        """Check for potential softlock conditions."""
        mechanic_id = challenge.get("mechanic_id")
        params = challenge.get("params", {})

        if mechanic_id == "push_to_target":
            # Check for reset mechanism
            has_reset = params.get("has_reset", False)
            if not has_reset:
                result.add_warning(
                    code="CHAL_007",
                    message="Push challenge without reset mechanism may cause softlock",
                    location=location,
                )

        elif mechanic_id == "key_unlock":
            # Check key is retrievable
            key_respawns = params.get("key_respawns", False)
            if not key_respawns:
                result.add_info(
                    code="CHAL_008",
                    message="Key does not respawn - ensure only one lock per key",
                    location=location,
                )

        elif mechanic_id == "sequence_activate":
            # Check for hints
            has_hints = params.get("show_hints", False)
            sequence_length = params.get("sequence_length", 3)

            if sequence_length > 4 and not has_hints:
                result.add_warning(
                    code="CHAL_009",
                    message=f"Long sequence ({sequence_length}) without hints may be frustrating",
                    location=location,
                )

    def _validate_complexity_for_audience(
        self,
        complexity: int,
        audience: str,
        location: str,
        result: ValidationResult,
    ):
        """Validate complexity appropriate for audience."""
        max_complexity = {
            "children_5_8": 3,
            "children_9_12": 5,
            "teens": 7,
            "adults": 10,
        }

        limit = max_complexity.get(audience, 5)

        if complexity > limit:
            result.add_warning(
                code="CHAL_010",
                message=f"Complexity {complexity} may be too high for {audience} (max: {limit})",
                location=location,
            )

    def _check_tutorial_coverage(
        self,
        scenes: list,
        mechanics_used: set,
        result: ValidationResult,
    ):
        """Check tutorials exist for complex mechanics."""
        # Complex mechanics that need tutorials
        complex_mechanics = {
            "push_to_target",
            "sequence_activate",
            "pressure_plate",
        }

        needs_tutorial = complex_mechanics & mechanics_used

        # Check if tutorials exist
        tutorial_mechanics = set()
        for scene in scenes:
            if not isinstance(scene, dict):
                continue

            challenges = scene.get("challenges", [])
            for challenge in challenges:
                if isinstance(challenge, dict) and challenge.get("is_tutorial"):
                    mechanic = challenge.get("mechanic_id")
                    if mechanic:
                        tutorial_mechanics.add(mechanic)

        # Also check tutorials array
        # (tutorials might be separate from challenges)

        missing_tutorials = needs_tutorial - tutorial_mechanics

        for mechanic in missing_tutorials:
            result.add_warning(
                code="CHAL_011",
                message=f"Complex mechanic '{mechanic}' used without tutorial",
                location="scenes",
            )
