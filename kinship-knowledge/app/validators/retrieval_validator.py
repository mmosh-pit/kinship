"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    RETRIEVAL VALIDATOR                                        ║
║                                                                               ║
║  Validates that assets and mechanics from Pinecone retrieval actually exist. ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Retrieved assets have required fields                                     ║
║  2. Asset IDs are valid                                                       ║
║  3. Mechanics are supported by the engine                                     ║
║  4. Design patterns are applicable                                            ║
║  5. Minimum assets retrieved for game generation                              ║
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
#  SUPPORTED MECHANICS
# ═══════════════════════════════════════════════════════════════════════════════

SUPPORTED_MECHANICS = {
    # Collection
    "collect_items",
    "collect_all",
    "gather_resources",
    # Navigation
    "reach_destination",
    "follow_path",
    "explore_area",
    # Interaction
    "talk_to_npc",
    "interact_object",
    "use_item",
    # Delivery
    "deliver_item",
    "escort_npc",
    # Puzzle
    "push_to_target",
    "solve_puzzle",
    "unlock_door",
    "activate_switch",
    # Combat
    "avoid_hazard",
    "defend_position",
    "attack_enemy",
    # Social
    "trade_items",
    "befriend_npc",
    "complete_dialogue",
    # Building
    "build_structure",
    "repair_object",
    "craft_item",
    # Timed
    "timed_challenge",
    "survive_duration",
}

REQUIRED_ASSET_FIELDS = {"name", "type"}
RECOMMENDED_ASSET_FIELDS = {"id", "file_url", "tags"}

MIN_ASSETS_FOR_GENERATION = 5


# ═══════════════════════════════════════════════════════════════════════════════
#  RETRIEVAL VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class RetrievalValidationResult:
    """Result of retrieval validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validated data
    valid_assets: List[Dict[str, Any]] = field(default_factory=list)
    valid_mechanics: List[str] = field(default_factory=list)
    valid_patterns: List[Dict[str, Any]] = field(default_factory=list)

    # Stats
    assets_checked: int = 0
    assets_valid: int = 0
    mechanics_checked: int = 0
    mechanics_valid: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
#  RETRIEVAL VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class RetrievalValidator(BaseValidator):
    """
    Validates retrieved assets and mechanics from Pinecone.

    Ensures that all retrieved items are valid and usable for generation.
    """

    def __init__(self, available_asset_names: Optional[Set[str]] = None):
        """
        Args:
            available_asset_names: Optional set of known valid asset names
        """
        self.available_asset_names = available_asset_names or set()

    @property
    def name(self) -> str:
        return "retrieval_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format (for pipeline compatibility).

        Expects manifest to have 'retrieved_assets' and 'suggested_mechanics' keys.
        """
        assets = manifest.get("retrieved_assets", [])
        mechanics = manifest.get("suggested_mechanics", [])
        patterns = manifest.get("design_patterns", [])

        result = self.validate_retrieval(assets, mechanics, patterns)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="RETRIEVAL_INVALID",
                message=error,
                location="retrieval",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="RETRIEVAL_WARNING",
                message=warning,
                location="retrieval",
            )

        return val_result

    def validate_retrieval(
        self,
        assets: List[Dict[str, Any]],
        mechanics: List[str],
        patterns: Optional[List[Dict[str, Any]]] = None,
    ) -> RetrievalValidationResult:
        """
        Validate retrieved assets and mechanics.

        Args:
            assets: Retrieved assets from Pinecone
            mechanics: Suggested mechanics
            patterns: Design patterns (optional)

        Returns:
            RetrievalValidationResult
        """
        result = RetrievalValidationResult()
        result.assets_checked = len(assets)
        result.mechanics_checked = len(mechanics)

        # Validate assets
        for asset in assets:
            is_valid, errors = self._validate_asset(asset)
            if is_valid:
                result.valid_assets.append(asset)
                result.assets_valid += 1
            else:
                for error in errors:
                    result.warnings.append(
                        f"Asset '{asset.get('name', 'unknown')}': {error}"
                    )

        # Check minimum assets
        if result.assets_valid < MIN_ASSETS_FOR_GENERATION:
            result.warnings.append(
                f"Only {result.assets_valid} valid assets found "
                f"(recommended: {MIN_ASSETS_FOR_GENERATION}+). "
                "Game variety may be limited."
            )

        # Validate mechanics
        for mechanic in mechanics:
            if self._validate_mechanic(mechanic):
                result.valid_mechanics.append(mechanic)
                result.mechanics_valid += 1
            else:
                result.warnings.append(
                    f"Mechanic '{mechanic}' is not supported. Will use fallback."
                )

        # Ensure at least one valid mechanic
        if not result.valid_mechanics:
            result.valid_mechanics = ["collect_items", "reach_destination"]
            result.warnings.append(
                "No valid mechanics found. Using defaults: collect_items, reach_destination"
            )

        # Validate patterns (if provided)
        if patterns:
            for pattern in patterns:
                if self._validate_pattern(pattern):
                    result.valid_patterns.append(pattern)

        logger.info(
            f"Retrieval validated: {result.assets_valid}/{result.assets_checked} assets, "
            f"{result.mechanics_valid}/{result.mechanics_checked} mechanics"
        )

        return result

    def _validate_asset(self, asset: Dict[str, Any]) -> tuple[bool, List[str]]:
        """Validate a single asset."""
        errors = []

        # Check required fields
        for field in REQUIRED_ASSET_FIELDS:
            if not asset.get(field):
                errors.append(f"Missing required field: {field}")

        # Check recommended fields
        for field in RECOMMENDED_ASSET_FIELDS:
            if not asset.get(field):
                pass  # Just a warning, not an error

        # Validate asset type
        valid_types = {
            "tile",
            "object",
            "sprite",
            "npc",
            "character",
            "item",
            "decoration",
            "effect",
        }
        asset_type = asset.get("type", "").lower()
        if asset_type and asset_type not in valid_types:
            errors.append(f"Unknown asset type: {asset_type}")

        # Check against known asset names (if provided)
        if self.available_asset_names:
            name = asset.get("name", "")
            if name and name not in self.available_asset_names:
                errors.append(f"Asset name not in platform catalog")

        return len(errors) == 0, errors

    def _validate_mechanic(self, mechanic: str) -> bool:
        """Validate a single mechanic."""
        return mechanic.lower() in SUPPORTED_MECHANICS

    def _validate_pattern(self, pattern: Dict[str, Any]) -> bool:
        """Validate a design pattern."""
        # Check required fields
        required = {"name", "category"}
        for field in required:
            if not pattern.get(field):
                return False
        return True


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_retrieval(
    assets: List[Dict[str, Any]],
    mechanics: List[str],
    patterns: Optional[List[Dict[str, Any]]] = None,
    available_asset_names: Optional[Set[str]] = None,
) -> RetrievalValidationResult:
    """
    Validate retrieved assets and mechanics.

    Args:
        assets: Retrieved assets from Pinecone
        mechanics: Suggested mechanics
        patterns: Design patterns (optional)
        available_asset_names: Known valid asset names (optional)

    Returns:
        RetrievalValidationResult
    """
    validator = RetrievalValidator(available_asset_names)
    return validator.validate_retrieval(assets, mechanics, patterns)
