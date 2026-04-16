"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MANIFEST VALIDATOR                                         ║
║                                                                               ║
║  Validates final manifest schema correctness.                                 ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Required top-level fields present                                         ║
║  2. Scene schema is correct                                                   ║
║  3. Route schema is correct                                                   ║
║  4. NPC schema is correct                                                     ║
║  5. Challenge schema is correct                                               ║
║  6. All IDs are unique                                                        ║
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
#  SCHEMA DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

REQUIRED_TOP_LEVEL = {"game", "scenes"}
OPTIONAL_TOP_LEVEL = {"routes", "npcs", "validation", "debug", "metadata"}

REQUIRED_GAME_FIELDS = {"id", "name"}
OPTIONAL_GAME_FIELDS = {"theme", "version", "goal_type", "goal_description", "audience"}

REQUIRED_SCENE_FIELDS = {"scene_name"}
OPTIONAL_SCENE_FIELDS = {
    "zone_type",
    "width",
    "height",
    "spawn",
    "actors",
    "npcs",
    "challenges",
    "tilemap",
    "narrative",
    "routes",
    "atmosphere",
}

REQUIRED_NPC_FIELDS = {"name"}
OPTIONAL_NPC_FIELDS = {
    "npc_id",
    "id",
    "role",
    "x",
    "y",
    "grid_x",
    "grid_y",
    "dialogue",
    "dialogue_tree",
    "initial_greeting",
    "greeting",
    "personality",
    "dialogue_style",
    "gives_quest",
    "quest_description",
}

REQUIRED_CHALLENGE_FIELDS = {"mechanic_id"}
OPTIONAL_CHALLENGE_FIELDS = {
    "challenge_id",
    "id",
    "name",
    "description",
    "difficulty",
    "params",
    "rewards",
    "hints",
    "is_required",
    "unlock_condition",
}

REQUIRED_ROUTE_FIELDS = {"from_scene", "to_scene"}
OPTIONAL_ROUTE_FIELDS = {"condition", "direction", "route_type"}


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ManifestValidationResult:
    """Result of manifest validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validation stats
    scenes_valid: int = 0
    npcs_valid: int = 0
    challenges_valid: int = 0
    routes_valid: int = 0

    # ID tracking
    duplicate_ids: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class ManifestValidator(BaseValidator):
    """
    Validates final manifest schema correctness.
    """

    @property
    def name(self) -> str:
        return "manifest_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using ValidationResult format.
        """
        result = self.validate_manifest(manifest)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="MANIFEST_INVALID",
                message=error,
                location="manifest",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="MANIFEST_WARNING",
                message=warning,
                location="manifest",
            )

        return val_result

    def validate_manifest(self, manifest: Dict[str, Any]) -> ManifestValidationResult:
        """
        Validate a game manifest.

        Args:
            manifest: Complete game manifest

        Returns:
            ManifestValidationResult
        """
        result = ManifestValidationResult()

        if not manifest:
            result.valid = False
            result.errors.append("Manifest is empty")
            return result

        # Check required top-level fields
        for field in REQUIRED_TOP_LEVEL:
            if field not in manifest:
                result.errors.append(f"Missing required field: {field}")

        # Validate game info
        game = manifest.get("game", {})
        g_errors, g_warnings = self._validate_game(game)
        result.errors.extend(g_errors)
        result.warnings.extend(g_warnings)

        # Track all IDs
        all_ids = set()

        # Validate scenes
        scenes = manifest.get("scenes", [])
        for i, scene in enumerate(scenes):
            s_errors, s_warnings, s_ids = self._validate_scene(scene, i)
            result.errors.extend(s_errors)
            result.warnings.extend(s_warnings)

            if not s_errors:
                result.scenes_valid += 1

            # Check for duplicate IDs
            for sid in s_ids:
                if sid in all_ids:
                    result.duplicate_ids.append(sid)
                    result.errors.append(f"Duplicate ID: {sid}")
                all_ids.add(sid)

        # Validate routes
        routes = manifest.get("routes", [])
        scene_names = {s.get("scene_name", f"scene_{i}") for i, s in enumerate(scenes)}
        num_scenes = len(scenes)

        for route in routes:
            r_errors, r_warnings = self._validate_route(route, scene_names, num_scenes)
            result.errors.extend(r_errors)
            result.warnings.extend(r_warnings)

            if not r_errors:
                result.routes_valid += 1

        # Count NPCs and challenges (skip string ID references)
        for scene in scenes:
            for npc in scene.get("npcs", []):
                # Skip string ID references
                if isinstance(npc, str):
                    result.npcs_valid += 1  # Assume valid if just an ID reference
                    continue
                if isinstance(npc, dict):
                    n_errors, _ = self._validate_npc_schema(npc)
                    if not n_errors:
                        result.npcs_valid += 1

            for challenge in scene.get("challenges", []):
                # Skip string ID references
                if isinstance(challenge, str):
                    result.challenges_valid += 1  # Assume valid if just an ID reference
                    continue
                if isinstance(challenge, dict):
                    c_errors, _ = self._validate_challenge_schema(challenge)
                    if not c_errors:
                        result.challenges_valid += 1

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"Manifest validated: valid={result.valid}, "
            f"scenes={result.scenes_valid}, npcs={result.npcs_valid}, "
            f"challenges={result.challenges_valid}, routes={result.routes_valid}"
        )

        return result

    def _validate_game(self, game: Dict[str, Any]) -> tuple[List[str], List[str]]:
        """Validate game info."""
        errors = []
        warnings = []

        for field in REQUIRED_GAME_FIELDS:
            if field not in game:
                errors.append(f"game: missing required field '{field}'")

        return errors, warnings

    def _validate_scene(
        self,
        scene: Dict[str, Any],
        index: int,
    ) -> tuple[List[str], List[str], Set[str]]:
        """Validate a scene."""
        errors = []
        warnings = []
        ids = set()

        scene_name = scene.get("scene_name", f"scene_{index}")

        # Check required fields
        for field in REQUIRED_SCENE_FIELDS:
            if field not in scene:
                errors.append(f"scene[{index}]: missing required field '{field}'")

        # Check unknown fields
        all_known = REQUIRED_SCENE_FIELDS | OPTIONAL_SCENE_FIELDS
        for key in scene:
            if key not in all_known and not key.startswith("_"):
                warnings.append(f"scene '{scene_name}': unknown field '{key}'")

        # Validate dimensions
        width = scene.get("width", 16)
        height = scene.get("height", 16)
        if width <= 0 or height <= 0:
            errors.append(f"scene '{scene_name}': invalid dimensions {width}x{height}")

        # Collect IDs
        ids.add(f"scene:{scene_name}")

        # Validate NPCs - handle both full NPC dicts and string ID references
        for npc in scene.get("npcs", []):
            # Skip if NPC is just a string ID reference (will be validated from global registry)
            if isinstance(npc, str):
                ids.add(f"npc:{npc}")
                continue

            # Full NPC dict - validate schema
            if isinstance(npc, dict):
                n_errors, n_warnings = self._validate_npc_schema(npc)
                errors.extend(n_errors)
                warnings.extend(n_warnings)

                npc_id = npc.get("npc_id") or npc.get("id")
                if npc_id:
                    ids.add(f"npc:{npc_id}")

        # Validate challenges - handle both full challenge dicts and string ID references
        for challenge in scene.get("challenges", []):
            # Skip if challenge is just a string ID reference
            if isinstance(challenge, str):
                ids.add(f"challenge:{challenge}")
                continue

            # Full challenge dict - validate schema
            if isinstance(challenge, dict):
                c_errors, c_warnings = self._validate_challenge_schema(challenge)
                errors.extend(c_errors)
                warnings.extend(c_warnings)

                ch_id = challenge.get("challenge_id") or challenge.get("id")
                if ch_id:
                    ids.add(f"challenge:{ch_id}")

        return errors, warnings, ids

    def _validate_npc_schema(self, npc: Dict[str, Any]) -> tuple[List[str], List[str]]:
        """Validate NPC schema."""
        errors = []
        warnings = []

        npc_id = npc.get("npc_id") or npc.get("id") or "unnamed"

        for field in REQUIRED_NPC_FIELDS:
            if field not in npc:
                errors.append(f"npc '{npc_id}': missing required field '{field}'")

        return errors, warnings

    def _validate_challenge_schema(
        self,
        challenge: Dict[str, Any],
    ) -> tuple[List[str], List[str]]:
        """Validate challenge schema."""
        errors = []
        warnings = []

        ch_id = challenge.get("challenge_id") or challenge.get("id") or "unnamed"

        for field in REQUIRED_CHALLENGE_FIELDS:
            if field not in challenge:
                warnings.append(
                    f"challenge '{ch_id}': missing recommended field '{field}'"
                )

        return errors, warnings

    def _validate_route(
        self,
        route: Dict[str, Any],
        scene_names: Set[str],
        num_scenes: int = 0,
    ) -> tuple[List[str], List[str]]:
        """Validate a route."""
        errors = []
        warnings = []

        for field in REQUIRED_ROUTE_FIELDS:
            if field not in route:
                errors.append(f"route: missing required field '{field}'")

        # Check scene references - support both integer indices and string names
        from_scene = route.get("from_scene")
        to_scene = route.get("to_scene")
        from_scene_name = route.get("from_scene_name")
        to_scene_name = route.get("to_scene_name")

        # Validate from_scene: accept int index OR string name
        if from_scene is not None:
            if isinstance(from_scene, int):
                # Integer index - check if valid range
                if num_scenes > 0 and from_scene >= num_scenes:
                    errors.append(
                        f"route: from_scene index {from_scene} out of range (max {num_scenes - 1})"
                    )
            elif isinstance(from_scene, str) and from_scene not in scene_names:
                # String name - check if exists
                if from_scene_name and from_scene_name in scene_names:
                    pass  # from_scene_name is valid, ignore from_scene
                else:
                    errors.append(f"route: from_scene '{from_scene}' does not exist")

        # Validate to_scene: accept int index OR string name
        if to_scene is not None:
            if isinstance(to_scene, int):
                # Integer index - check if valid range
                if num_scenes > 0 and to_scene >= num_scenes:
                    errors.append(
                        f"route: to_scene index {to_scene} out of range (max {num_scenes - 1})"
                    )
            elif isinstance(to_scene, str) and to_scene not in scene_names:
                # String name - check if exists
                if to_scene_name and to_scene_name in scene_names:
                    pass  # to_scene_name is valid, ignore to_scene
                else:
                    errors.append(f"route: to_scene '{to_scene}' does not exist")

        return errors, warnings


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_manifest(manifest: Dict[str, Any]) -> ManifestValidationResult:
    """
    Validate a game manifest.

    Args:
        manifest: Complete game manifest

    Returns:
        ManifestValidationResult
    """
    validator = ManifestValidator()
    return validator.validate_manifest(manifest)
