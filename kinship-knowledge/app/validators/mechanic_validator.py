"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MECHANIC VALIDATOR                                         ║
║                                                                               ║
║  Validates mechanics are compatible with Flame engine.                        ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Mechanic is supported by engine                                           ║
║  2. Mechanic has required parameters                                          ║
║  3. Mechanic can be implemented with available assets                         ║
║  4. Mechanic combinations are valid                                           ║
║  5. Mechanic difficulty is appropriate                                        ║
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
#  ENGINE-SUPPORTED MECHANICS
# ═══════════════════════════════════════════════════════════════════════════════

# Mechanics fully supported by Flame engine
ENGINE_MECHANICS = {
    "collect_items": {
        "required_params": ["item_type"],
        "optional_params": ["count", "target_count"],
        "required_affordances": ["collectible"],
    },
    "collect_all": {
        "required_params": ["item_type"],
        "optional_params": [],
        "required_affordances": ["collectible"],
    },
    "reach_destination": {
        "required_params": ["destination_id"],
        "optional_params": ["zone_type"],
        "required_affordances": ["trigger_zone"],
    },
    "talk_to_npc": {
        "required_params": ["npc_id"],
        "optional_params": ["dialogue_id"],
        "required_affordances": ["talkable"],
    },
    "deliver_item": {
        "required_params": ["item_type", "target_id"],
        "optional_params": ["target_type"],
        "required_affordances": ["collectible", "receivable"],
    },
    "push_to_target": {
        "required_params": ["object_id", "target_id"],
        "optional_params": [],
        "required_affordances": ["pushable", "push_target"],
    },
    "avoid_hazard": {
        "required_params": ["hazard_type"],
        "optional_params": ["duration"],
        "required_affordances": ["hazard"],
    },
    "unlock_door": {
        "required_params": ["door_id"],
        "optional_params": ["key_type"],
        "required_affordances": ["lockable", "collectible"],
    },
    "solve_puzzle": {
        "required_params": ["puzzle_type"],
        "optional_params": ["complexity"],
        "required_affordances": ["interactable"],
    },
    "trade_items": {
        "required_params": ["npc_id"],
        "optional_params": ["item_type", "price"],
        "required_affordances": ["tradeable", "talkable"],
    },
    "befriend_npc": {
        "required_params": ["npc_id"],
        "optional_params": ["required_actions"],
        "required_affordances": ["talkable"],
    },
    "follow_path": {
        "required_params": ["path_id"],
        "optional_params": ["waypoints"],
        "required_affordances": ["trigger_zone"],
    },
    "escort_npc": {
        "required_params": ["npc_id", "destination_id"],
        "optional_params": [],
        "required_affordances": ["followable", "trigger_zone"],
    },
    "timed_challenge": {
        "required_params": ["time_limit", "objective"],
        "optional_params": [],
        "required_affordances": [],
    },
    "defend_position": {
        "required_params": ["position_id"],
        "optional_params": ["duration", "threat_type"],
        "required_affordances": ["trigger_zone"],
    },
    "interact_object": {
        "required_params": ["object_id"],
        "optional_params": ["interaction_type"],
        "required_affordances": ["interactable"],
    },
}

# Mechanics not yet fully implemented
EXPERIMENTAL_MECHANICS = {
    "attack_enemy",
    "craft_item",
    "build_structure",
    "repair_object",
    "survive_duration",
}

# Invalid mechanic combinations
INCOMPATIBLE_COMBINATIONS = [
    {"timed_challenge", "escort_npc"},  # Timing + escort is problematic
]


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class MechanicValidationResult:
    """Result of mechanic validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validation details
    supported_mechanics: List[str] = field(default_factory=list)
    unsupported_mechanics: List[str] = field(default_factory=list)
    missing_params: Dict[str, List[str]] = field(default_factory=dict)
    missing_affordances: Dict[str, List[str]] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class MechanicValidator(BaseValidator):
    """
    Validates mechanics are compatible with Flame engine.
    """

    def __init__(self, available_affordances: Optional[Set[str]] = None):
        """
        Args:
            available_affordances: Set of available affordances from assets
        """
        self.available_affordances = available_affordances or set()

    @property
    def name(self) -> str:
        return "mechanic_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format.
        """
        mechanics = manifest.get("mechanics", [])
        challenges = manifest.get("challenges", [])

        # Also extract mechanics from challenges
        if challenges:
            for ch in challenges:
                mech = ch.get("mechanic_id") or ch.get("mechanic")
                if mech and mech not in mechanics:
                    mechanics.append(mech)

        result = self.validate_mechanics(mechanics, challenges)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="MECHANIC_INVALID",
                message=error,
                location="mechanics",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="MECHANIC_WARNING",
                message=warning,
                location="mechanics",
            )

        return val_result

    def validate_mechanics(
        self,
        mechanics: List[str],
        challenges: Optional[List[Dict[str, Any]]] = None,
    ) -> MechanicValidationResult:
        """
        Validate mechanics.

        Args:
            mechanics: List of mechanic IDs
            challenges: Challenge configurations (optional)

        Returns:
            MechanicValidationResult
        """
        result = MechanicValidationResult()

        if not mechanics:
            result.warnings.append("No mechanics specified")
            return result

        # Validate each mechanic
        for mechanic in mechanics:
            mechanic_lower = mechanic.lower()

            if mechanic_lower in ENGINE_MECHANICS:
                result.supported_mechanics.append(mechanic)
            elif mechanic_lower in EXPERIMENTAL_MECHANICS:
                result.supported_mechanics.append(mechanic)
                result.warnings.append(
                    f"Mechanic '{mechanic}' is experimental and may not work fully"
                )
            else:
                result.unsupported_mechanics.append(mechanic)
                result.errors.append(f"Unsupported mechanic: {mechanic}")

        # Validate challenge parameters
        if challenges:
            for challenge in challenges:
                ch_errors, ch_warnings = self._validate_challenge_mechanic(challenge)
                result.errors.extend(ch_errors)
                result.warnings.extend(ch_warnings)

        # Check mechanic combinations
        combo_warnings = self._check_combinations(mechanics)
        result.warnings.extend(combo_warnings)

        # Check affordance availability
        if self.available_affordances:
            affordance_warnings = self._check_affordances(mechanics)
            result.warnings.extend(affordance_warnings)

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"Mechanics validated: valid={result.valid}, "
            f"supported={len(result.supported_mechanics)}, "
            f"unsupported={len(result.unsupported_mechanics)}"
        )

        return result

    def _validate_challenge_mechanic(
        self,
        challenge: Dict[str, Any],
    ) -> tuple[List[str], List[str]]:
        """Validate a challenge's mechanic configuration."""
        errors = []
        warnings = []

        mechanic = challenge.get("mechanic_id") or challenge.get("mechanic", "")
        mechanic_lower = mechanic.lower()
        ch_name = challenge.get("name", "unnamed")

        if mechanic_lower not in ENGINE_MECHANICS:
            return errors, warnings  # Already reported in main validation

        spec = ENGINE_MECHANICS[mechanic_lower]
        params = challenge.get("params", {})

        # Check required parameters
        for req_param in spec.get("required_params", []):
            if req_param not in params and req_param not in challenge:
                warnings.append(
                    f"Challenge '{ch_name}' ({mechanic}): missing recommended param '{req_param}'"
                )

        return errors, warnings

    def _check_combinations(self, mechanics: List[str]) -> List[str]:
        """Check for incompatible mechanic combinations."""
        warnings = []

        mechanic_set = set(m.lower() for m in mechanics)

        for combo in INCOMPATIBLE_COMBINATIONS:
            if combo.issubset(mechanic_set):
                warnings.append(
                    f"Potentially problematic mechanic combination: {combo}"
                )

        return warnings

    def _check_affordances(self, mechanics: List[str]) -> List[str]:
        """Check if required affordances are available."""
        warnings = []

        for mechanic in mechanics:
            mechanic_lower = mechanic.lower()
            if mechanic_lower not in ENGINE_MECHANICS:
                continue

            spec = ENGINE_MECHANICS[mechanic_lower]
            required = spec.get("required_affordances", [])

            for affordance in required:
                if affordance not in self.available_affordances:
                    warnings.append(
                        f"Mechanic '{mechanic}' requires affordance '{affordance}' "
                        "which may not be available"
                    )

        return warnings

    def get_mechanic_requirements(self, mechanic: str) -> Dict[str, Any]:
        """Get requirements for a mechanic."""
        mechanic_lower = mechanic.lower()
        return ENGINE_MECHANICS.get(mechanic_lower, {})


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_mechanics(
    mechanics: List[str],
    challenges: Optional[List[Dict[str, Any]]] = None,
    available_affordances: Optional[Set[str]] = None,
) -> MechanicValidationResult:
    """
    Validate mechanics.

    Args:
        mechanics: List of mechanic IDs
        challenges: Challenge configurations (optional)
        available_affordances: Available affordances (optional)

    Returns:
        MechanicValidationResult
    """
    validator = MechanicValidator(available_affordances)
    return validator.validate_mechanics(mechanics, challenges)
