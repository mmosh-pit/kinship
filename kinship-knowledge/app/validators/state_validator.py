"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    STATE VALIDATOR                                            ║
║                                                                               ║
║  Validates GameState structure integrity.                                     ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. State has valid game_id                                                   ║
║  2. State version is valid                                                    ║
║  3. Manifest structure is intact                                              ║
║  4. Indexes are consistent                                                    ║
║  5. Edit history is valid                                                     ║
║  6. No orphaned references                                                    ║
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
#  STATE VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class StateValidationResult:
    """Result of state validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Integrity checks
    indexes_valid: bool = True
    manifest_valid: bool = True
    history_valid: bool = True

    # Repair suggestions
    suggested_repairs: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  STATE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class StateValidator(BaseValidator):
    """
    Validates GameState structure integrity.

    Ensures the state is consistent and usable.
    """

    @property
    def name(self) -> str:
        return "state_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format (for pipeline compatibility).

        Expects manifest to be a GameState dict.
        """
        result = self.validate_state(manifest)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="STATE_INVALID",
                message=error,
                location="game_state",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="STATE_WARNING",
                message=warning,
                location="game_state",
            )

        return val_result

    def validate_state(self, state: Dict[str, Any]) -> StateValidationResult:
        """
        Validate a GameState.

        Args:
            state: GameState dict or GameState object

        Returns:
            StateValidationResult
        """
        result = StateValidationResult()

        # Handle GameState object
        if hasattr(state, "to_dict"):
            state = state.to_dict()

        if not state:
            result.valid = False
            result.errors.append("State is empty")
            return result

        # Validate game_id
        game_id = state.get("game_id")
        if not game_id:
            result.errors.append("State has no game_id")
            result.valid = False

        # Validate version
        version = state.get("version", 0)
        if not isinstance(version, int) or version < 0:
            result.warnings.append(f"Invalid version: {version}. Will reset to 1.")
            result.suggested_repairs.append("Reset version to 1")

        # Validate status
        status = state.get("status", "")
        valid_statuses = {
            "empty",
            "planning",
            "generating",
            "ready",
            "editing",
            "error",
        }
        if status and status not in valid_statuses:
            result.warnings.append(f"Unknown status: {status}")

        # Validate manifest
        manifest = state.get("manifest")
        if manifest:
            manifest_errors, manifest_warnings = self._validate_manifest_structure(
                manifest
            )
            result.errors.extend(manifest_errors)
            result.warnings.extend(manifest_warnings)
            result.manifest_valid = len(manifest_errors) == 0

        # Validate indexes (if present)
        if "_scene_index" in state or "_npc_index" in state:
            index_errors = self._validate_indexes(state)
            result.errors.extend(index_errors)
            result.indexes_valid = len(index_errors) == 0

        # Validate edit history
        history = state.get("edit_history", [])
        if history:
            history_errors = self._validate_history(history)
            result.errors.extend(history_errors)
            result.history_valid = len(history_errors) == 0

        # Check for orphaned references
        orphan_warnings = self._check_orphaned_references(state)
        result.warnings.extend(orphan_warnings)

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"State validated: valid={result.valid}, "
            f"manifest={result.manifest_valid}, indexes={result.indexes_valid}"
        )

        return result

    def _validate_manifest_structure(
        self, manifest: Dict[str, Any]
    ) -> tuple[List[str], List[str]]:
        """Validate manifest structure."""
        errors = []
        warnings = []

        # Check required top-level keys
        if "scenes" not in manifest:
            errors.append("Manifest has no 'scenes' key")
        else:
            scenes = manifest["scenes"]
            if not isinstance(scenes, list):
                errors.append("Manifest 'scenes' is not a list")
            elif not scenes:
                warnings.append("Manifest has no scenes")

        # Check game info
        if "game" not in manifest:
            warnings.append("Manifest has no 'game' info")

        return errors, warnings

    def _validate_indexes(self, state: Dict[str, Any]) -> List[str]:
        """Validate that indexes match manifest content."""
        errors = []

        # Handle case where manifest is explicitly None
        manifest = state.get("manifest") or {}
        if not isinstance(manifest, dict):
            manifest = {}
        scenes = manifest.get("scenes", []) or []

        # Validate scene index
        scene_index = state.get("_scene_index", {})
        actual_scene_names = {
            s.get("scene_name", f"scene_{i}") for i, s in enumerate(scenes)
        }

        for name in scene_index:
            if name not in actual_scene_names:
                errors.append(f"Scene index contains non-existent scene: {name}")

        # Validate NPC index
        npc_index = state.get("_npc_index", {})
        actual_npcs = set()
        for scene in scenes:
            for npc in scene.get("npcs", []):
                npc_id = npc.get("npc_id") or npc.get("id")
                if npc_id:
                    actual_npcs.add(npc_id)

        for npc_id in npc_index:
            if npc_id not in actual_npcs:
                errors.append(f"NPC index contains non-existent NPC: {npc_id}")

        return errors

    def _validate_history(self, history: List[Dict[str, Any]]) -> List[str]:
        """Validate edit history."""
        errors = []

        for i, edit in enumerate(history):
            if not edit.get("edit_id"):
                errors.append(f"Edit {i} has no edit_id")
            if not edit.get("edit_type"):
                errors.append(f"Edit {i} has no edit_type")
            if not edit.get("timestamp"):
                errors.append(f"Edit {i} has no timestamp")

        return errors

    def _check_orphaned_references(self, state: Dict[str, Any]) -> List[str]:
        """Check for orphaned references."""
        warnings = []

        # Handle case where manifest is explicitly None (not just missing)
        manifest = state.get("manifest") or {}
        if not isinstance(manifest, dict):
            manifest = {}
        scenes = manifest.get("scenes", []) or []
        routes = manifest.get("routes", []) or []

        # Build set of scene names
        scene_names = {s.get("scene_name", f"scene_{i}") for i, s in enumerate(scenes)}

        # Check route references
        for route in routes:
            from_scene = route.get("from_scene")
            to_scene = route.get("to_scene")

            if from_scene and from_scene not in scene_names:
                warnings.append(f"Route references non-existent scene: {from_scene}")
            if to_scene and to_scene not in scene_names:
                warnings.append(f"Route references non-existent scene: {to_scene}")

        # Check challenge references
        for scene in scenes:
            for challenge in scene.get("challenges", []):
                unlock_condition = challenge.get("unlock_condition")
                if unlock_condition:
                    # Check if referenced challenge exists
                    pass  # Would need full challenge ID set

        return warnings

    def repair(self, state: Dict[str, Any]) -> Dict[str, Any]:
        """
        Repair common issues in a GameState.

        Args:
            state: GameState dict

        Returns:
            Repaired state
        """
        repaired = dict(state)

        # Ensure game_id
        if not repaired.get("game_id"):
            import uuid

            repaired["game_id"] = str(uuid.uuid4())

        # Ensure version
        if not isinstance(repaired.get("version"), int) or repaired["version"] < 0:
            repaired["version"] = 1

        # Ensure status
        if repaired.get("status") not in {
            "empty",
            "planning",
            "generating",
            "ready",
            "editing",
            "error",
        }:
            repaired["status"] = "ready" if repaired.get("manifest") else "empty"

        # Ensure manifest structure
        if repaired.get("manifest"):
            if "scenes" not in repaired["manifest"]:
                repaired["manifest"]["scenes"] = []
            if "routes" not in repaired["manifest"]:
                repaired["manifest"]["routes"] = []

        # Ensure edit history is a list
        if not isinstance(repaired.get("edit_history"), list):
            repaired["edit_history"] = []

        return repaired


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_game_state(state: Dict[str, Any]) -> StateValidationResult:
    """
    Validate a GameState.

    Args:
        state: GameState dict

    Returns:
        StateValidationResult
    """
    validator = StateValidator()
    return validator.validate_state(state)
