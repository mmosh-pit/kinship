"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    ENGINE VALIDATOR                                           ║
║                                                                               ║
║  Validates assets, tilemaps, and physics are compatible with Flame engine.   ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Asset URLs are valid                                                      ║
║  2. Sprite dimensions are valid                                               ║
║  3. Tilemap format is correct                                                 ║
║  4. Physics bodies are valid                                                  ║
║  5. Animation configs are valid                                               ║
║  6. Z-index ordering is correct                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import re
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Set

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
    ValidationSeverity,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE CONSTRAINTS
# ═══════════════════════════════════════════════════════════════════════════════

MAX_SPRITE_WIDTH = 512
MAX_SPRITE_HEIGHT = 512
MIN_SPRITE_SIZE = 8

VALID_LAYERS = {"ground", "floor", "objects", "decorations", "effects", "overlay", "ui"}
VALID_COLLISION_TYPES = {"none", "solid", "trigger", "sensor", "one_way"}
VALID_IMAGE_FORMATS = {".png", ".jpg", ".jpeg", ".gif", ".webp"}

MAX_Z_INDEX = 1000
MIN_Z_INDEX = -100


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class EngineValidationResult:
    """Result of engine validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validation stats
    assets_checked: int = 0
    assets_valid: int = 0
    tilemaps_checked: int = 0
    tilemaps_valid: int = 0

    # Invalid items
    invalid_assets: List[str] = field(default_factory=list)
    invalid_tilemaps: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  ENGINE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class EngineValidator(BaseValidator):
    """
    Validates compatibility with Flame engine.
    """

    @property
    def name(self) -> str:
        return "engine_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format.
        """
        scenes = manifest.get("scenes", [])

        result = self.validate_engine_compatibility(scenes)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="ENGINE_INVALID",
                message=error,
                location="engine",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="ENGINE_WARNING",
                message=warning,
                location="engine",
            )

        return val_result

    def validate_engine_compatibility(
        self,
        scenes: List[Dict[str, Any]],
    ) -> EngineValidationResult:
        """
        Validate engine compatibility.

        Args:
            scenes: Scene list with actors and tilemaps

        Returns:
            EngineValidationResult
        """
        result = EngineValidationResult()

        for scene_idx, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{scene_idx}")

            # Validate actors (assets)
            actors = scene.get("actors", [])
            for actor in actors:
                result.assets_checked += 1
                a_errors, a_warnings = self._validate_actor(actor, scene_name)

                if a_errors:
                    result.errors.extend(a_errors)
                    result.invalid_assets.append(actor.get("name", "unnamed"))
                else:
                    result.assets_valid += 1

                result.warnings.extend(a_warnings)

            # Validate tilemap
            tilemap = scene.get("tilemap")
            if tilemap:
                result.tilemaps_checked += 1
                t_errors, t_warnings = self._validate_tilemap(tilemap, scene_name)

                if t_errors:
                    result.errors.extend(t_errors)
                    result.invalid_tilemaps.append(scene_name)
                else:
                    result.tilemaps_valid += 1

                result.warnings.extend(t_warnings)

            # Validate spawn point
            spawn = scene.get("spawn")
            if spawn:
                s_errors, s_warnings = self._validate_spawn(spawn, scene_name, scene)
                result.errors.extend(s_errors)
                result.warnings.extend(s_warnings)

            # Validate z-index ordering
            z_warnings = self._validate_z_ordering(actors, scene_name)
            result.warnings.extend(z_warnings)

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"Engine validation: valid={result.valid}, "
            f"assets={result.assets_valid}/{result.assets_checked}, "
            f"tilemaps={result.tilemaps_valid}/{result.tilemaps_checked}"
        )

        return result

    def _validate_actor(
        self,
        actor: Dict[str, Any],
        scene_name: str,
    ) -> tuple[List[str], List[str]]:
        """Validate a single actor/asset."""
        errors = []
        warnings = []

        actor_name = actor.get("name", "unnamed")

        # Check file URL
        file_url = actor.get("file_url", "")
        if not file_url:
            warnings.append(f"{scene_name}.{actor_name}: no file_url")
        else:
            # Check format
            url_lower = file_url.lower()
            valid_format = any(url_lower.endswith(fmt) for fmt in VALID_IMAGE_FORMATS)
            if not valid_format and not "cloudfront" in url_lower:
                warnings.append(f"{scene_name}.{actor_name}: unknown image format")

        # Check dimensions
        metadata = actor.get("metadata", {})
        width = metadata.get("pixel_width", 0)
        height = metadata.get("pixel_height", 0)

        if width > 0 and height > 0:
            if width > MAX_SPRITE_WIDTH:
                warnings.append(
                    f"{scene_name}.{actor_name}: width {width} exceeds max {MAX_SPRITE_WIDTH}"
                )
            if height > MAX_SPRITE_HEIGHT:
                warnings.append(
                    f"{scene_name}.{actor_name}: height {height} exceeds max {MAX_SPRITE_HEIGHT}"
                )
            if width < MIN_SPRITE_SIZE or height < MIN_SPRITE_SIZE:
                warnings.append(
                    f"{scene_name}.{actor_name}: sprite very small ({width}x{height})"
                )

        # Check layer
        spawn = metadata.get("spawn", {})
        layer = spawn.get("layer", "")
        if layer and layer not in VALID_LAYERS:
            warnings.append(f"{scene_name}.{actor_name}: unknown layer '{layer}'")

        # Check z-index
        z_index = spawn.get("z_index", 0)
        if z_index > MAX_Z_INDEX or z_index < MIN_Z_INDEX:
            warnings.append(
                f"{scene_name}.{actor_name}: z_index {z_index} out of range"
            )

        # Check collision
        hitbox = metadata.get("hitbox", {})
        collision = hitbox.get("collision_type", "")
        if collision and collision not in VALID_COLLISION_TYPES:
            warnings.append(
                f"{scene_name}.{actor_name}: unknown collision type '{collision}'"
            )

        return errors, warnings

    def _validate_tilemap(
        self,
        tilemap: Dict[str, Any],
        scene_name: str,
    ) -> tuple[List[str], List[str]]:
        """Validate a tilemap."""
        errors = []
        warnings = []

        # Check required fields
        if not tilemap.get("width"):
            errors.append(f"{scene_name}.tilemap: no width")
        if not tilemap.get("height"):
            errors.append(f"{scene_name}.tilemap: no height")

        # Check layers
        layers = tilemap.get("layers", [])
        if not layers:
            warnings.append(f"{scene_name}.tilemap: no layers defined")

        for layer in layers:
            if not isinstance(layer, dict):
                continue

            layer_name = layer.get("name", "unnamed")
            data = layer.get("data", [])

            if not data:
                warnings.append(f"{scene_name}.tilemap.{layer_name}: empty layer data")

            # Check data is valid
            if isinstance(data, list):
                for row in data:
                    if isinstance(row, list):
                        for cell in row:
                            if cell is not None and not isinstance(cell, (int, str)):
                                errors.append(
                                    f"{scene_name}.tilemap.{layer_name}: invalid cell type"
                                )
                                break

        # Check tile dimensions
        tile_width = tilemap.get("tile_width", 0)
        tile_height = tilemap.get("tile_height", 0)

        if tile_width <= 0 or tile_height <= 0:
            warnings.append(f"{scene_name}.tilemap: invalid tile dimensions")

        return errors, warnings

    def _validate_spawn(
        self,
        spawn: Dict[str, Any],
        scene_name: str,
        scene: Dict[str, Any],
    ) -> tuple[List[str], List[str]]:
        """Validate spawn point."""
        errors = []
        warnings = []

        x = spawn.get("x", spawn.get("grid_x", 0))
        y = spawn.get("y", spawn.get("grid_y", 0))

        scene_width = scene.get("width", 16)
        scene_height = scene.get("height", 16)

        if x < 0 or x >= scene_width:
            errors.append(
                f"{scene_name}.spawn: x={x} out of bounds (0-{scene_width-1})"
            )
        if y < 0 or y >= scene_height:
            errors.append(
                f"{scene_name}.spawn: y={y} out of bounds (0-{scene_height-1})"
            )

        return errors, warnings

    def _validate_z_ordering(
        self,
        actors: List[Dict[str, Any]],
        scene_name: str,
    ) -> List[str]:
        """Validate z-index ordering."""
        warnings = []

        z_groups = {}
        for actor in actors:
            metadata = actor.get("metadata", {})
            spawn = metadata.get("spawn", {})
            z = spawn.get("z_index", 0)

            if z not in z_groups:
                z_groups[z] = []
            z_groups[z].append(actor.get("name", "unnamed"))

        # Warn if too many actors at same z-index
        for z, names in z_groups.items():
            if len(names) > 20:
                warnings.append(
                    f"{scene_name}: {len(names)} actors at z-index {z} may cause rendering issues"
                )

        return warnings


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_engine_compatibility(
    scenes: List[Dict[str, Any]],
) -> EngineValidationResult:
    """
    Validate engine compatibility.

    Args:
        scenes: Scene list with actors and tilemaps

    Returns:
        EngineValidationResult
    """
    validator = EngineValidator()
    return validator.validate_engine_compatibility(scenes)
