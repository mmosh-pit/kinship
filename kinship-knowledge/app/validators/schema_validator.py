"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCHEMA VALIDATOR                                           ║
║                                                                               ║
║  Validates manifest structure matches expected schema.                        ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • Required top-level fields present                                          ║
║  • Field types are correct                                                    ║
║  • Scene structure is valid                                                   ║
║  • NPC structure is valid                                                     ║
║  • Challenge structure is valid                                               ║
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
#  EXPECTED SCHEMA
# ═══════════════════════════════════════════════════════════════════════════════

REQUIRED_TOP_LEVEL = [
    "version",
    "game",
    "config",
    "scenes",
    "npcs",
    "validation",
]

REQUIRED_GAME = ["id", "name"]

REQUIRED_CONFIG = [
    "goal_type",
    "audience_type",
    "zone_type",
    "scene_width",
    "scene_height",
]

REQUIRED_SCENE = [
    "scene_index",
    "spawn",
    "exit",
]

REQUIRED_POSITION = ["x", "y"]

REQUIRED_NPC = [
    "npc_id",
    "role",
    "position",
]

REQUIRED_CHALLENGE = [
    "mechanic_id",
]


# ═══════════════════════════════════════════════════════════════════════════════
#  SCHEMA VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class SchemaValidator(BaseValidator):
    """Validates manifest structure."""

    @property
    def name(self) -> str:
        return "schema_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        # Check manifest is dict
        if not isinstance(manifest, dict):
            result.add_error(
                code="SCHEMA_001",
                message="Manifest must be a dictionary",
            )
            return result

        # Check required top-level fields
        self._check_required_fields(manifest, REQUIRED_TOP_LEVEL, "", result)

        # Validate game section
        if "game" in manifest:
            self._validate_game(manifest["game"], result)

        # Validate config section
        if "config" in manifest:
            self._validate_config(manifest["config"], result)

        # Validate scenes
        if "scenes" in manifest:
            self._validate_scenes(manifest["scenes"], result)

        # Validate NPCs
        if "npcs" in manifest:
            self._validate_npcs(manifest["npcs"], result)

        return result

    def _check_required_fields(
        self,
        obj: dict,
        required: list[str],
        location: str,
        result: ValidationResult,
    ):
        """Check that required fields are present."""
        for field in required:
            if field not in obj:
                result.add_error(
                    code="SCHEMA_MISSING_FIELD",
                    message=f"Missing required field: {field}",
                    location=f"{location}.{field}" if location else field,
                )

    def _validate_game(self, game: Any, result: ValidationResult):
        """Validate game section."""
        if not isinstance(game, dict):
            result.add_error(
                code="SCHEMA_002",
                message="game must be a dictionary",
                location="game",
            )
            return

        self._check_required_fields(game, REQUIRED_GAME, "game", result)

        # Check types
        if "id" in game and not isinstance(game["id"], str):
            result.add_error(
                code="SCHEMA_TYPE",
                message="game.id must be a string",
                location="game.id",
            )

        if "name" in game and not isinstance(game["name"], str):
            result.add_error(
                code="SCHEMA_TYPE",
                message="game.name must be a string",
                location="game.name",
            )

    def _validate_config(self, config: Any, result: ValidationResult):
        """Validate config section."""
        if not isinstance(config, dict):
            result.add_error(
                code="SCHEMA_003",
                message="config must be a dictionary",
                location="config",
            )
            return

        self._check_required_fields(config, REQUIRED_CONFIG, "config", result)

        # Check scene dimensions
        if "scene_width" in config:
            width = config["scene_width"]
            if not isinstance(width, int) or width < 8 or width > 64:
                result.add_error(
                    code="SCHEMA_RANGE",
                    message="scene_width must be integer between 8 and 64",
                    location="config.scene_width",
                )

        if "scene_height" in config:
            height = config["scene_height"]
            if not isinstance(height, int) or height < 8 or height > 64:
                result.add_error(
                    code="SCHEMA_RANGE",
                    message="scene_height must be integer between 8 and 64",
                    location="config.scene_height",
                )

    def _validate_scenes(self, scenes: Any, result: ValidationResult):
        """Validate scenes array."""
        if not isinstance(scenes, list):
            result.add_error(
                code="SCHEMA_004",
                message="scenes must be an array",
                location="scenes",
            )
            return

        if len(scenes) == 0:
            result.add_error(
                code="SCHEMA_EMPTY",
                message="scenes array cannot be empty",
                location="scenes",
            )
            return

        for i, scene in enumerate(scenes):
            self._validate_scene(scene, i, result)

    def _validate_scene(self, scene: Any, index: int, result: ValidationResult):
        """Validate a single scene."""
        location = f"scenes[{index}]"

        if not isinstance(scene, dict):
            result.add_error(
                code="SCHEMA_005",
                message="Scene must be a dictionary",
                location=location,
            )
            return

        self._check_required_fields(scene, REQUIRED_SCENE, location, result)

        # Validate spawn
        if "spawn" in scene:
            self._validate_position(scene["spawn"], f"{location}.spawn", result)

        # Validate exit
        if "exit" in scene:
            self._validate_position(scene["exit"], f"{location}.exit", result)

        # Validate scene_index matches array position
        if "scene_index" in scene and scene["scene_index"] != index:
            result.add_warning(
                code="SCHEMA_INDEX_MISMATCH",
                message=f"scene_index ({scene['scene_index']}) does not match array position ({index})",
                location=location,
            )

        # Validate challenges if present
        if "challenges" in scene:
            self._validate_challenges(scene["challenges"], location, result)

    def _validate_position(
        self,
        pos: Any,
        location: str,
        result: ValidationResult,
    ):
        """Validate a position object."""
        if not isinstance(pos, dict):
            result.add_error(
                code="SCHEMA_006",
                message="Position must be a dictionary with x and y",
                location=location,
            )
            return

        self._check_required_fields(pos, REQUIRED_POSITION, location, result)

        for coord in ["x", "y"]:
            if coord in pos and not isinstance(pos[coord], (int, float)):
                result.add_error(
                    code="SCHEMA_TYPE",
                    message=f"{coord} must be a number",
                    location=f"{location}.{coord}",
                )

    def _validate_challenges(
        self,
        challenges: Any,
        scene_location: str,
        result: ValidationResult,
    ):
        """Validate challenges array."""
        if not isinstance(challenges, list):
            result.add_error(
                code="SCHEMA_007",
                message="challenges must be an array",
                location=f"{scene_location}.challenges",
            )
            return

        for i, challenge in enumerate(challenges):
            location = f"{scene_location}.challenges[{i}]"

            if not isinstance(challenge, dict):
                result.add_error(
                    code="SCHEMA_008",
                    message="Challenge must be a dictionary",
                    location=location,
                )
                continue

            self._check_required_fields(challenge, REQUIRED_CHALLENGE, location, result)

    def _validate_npcs(self, npcs: Any, result: ValidationResult):
        """Validate NPCs dictionary."""
        if not isinstance(npcs, dict):
            result.add_error(
                code="SCHEMA_009",
                message="npcs must be a dictionary",
                location="npcs",
            )
            return

        for npc_id, npc in npcs.items():
            location = f"npcs.{npc_id}"

            if not isinstance(npc, dict):
                result.add_error(
                    code="SCHEMA_010",
                    message="NPC must be a dictionary",
                    location=location,
                )
                continue

            self._check_required_fields(npc, REQUIRED_NPC, location, result)

            # Validate position
            if "position" in npc:
                self._validate_position(npc["position"], f"{location}.position", result)
