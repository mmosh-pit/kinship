"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE CONTENT VALIDATOR                                    ║
║                                                                               ║
║  Enforces scene composition rules BEFORE manifest assembly.                   ║
║  This is the missing piece that prevents empty/weak scenes.                   ║
║                                                                               ║
║  CHECKS PER SCENE:                                                            ║
║  ✓ spawn exists                                                               ║
║  ✓ exit exists                                                                ║
║  ✓ challenge count ≥ 1                                                        ║
║  ✓ NPC count ≥ 1                                                              ║
║  ✓ interactive objects ≥ 1                                                    ║
║  ✓ total objects ≥ 5 (scene doesn't feel empty)                               ║
║  ✓ required NPC roles present (guide in scene 0, guardian in finale)          ║
║  ✓ difficulty within range for scene position                                 ║
║                                                                               ║
║  CHECKS PER GAME:                                                             ║
║  ✓ asset coverage ≥ 30%                                                       ║
║  ✓ mechanic variety (no mechanic used >2 times)                               ║
║  ✓ difficulty progression (no sudden drops)                                   ║
║  ✓ total challenges ≥ 3                                                       ║
║                                                                               ║
║  Runs as a validator in the ValidationPipeline.                               ║
║  Also callable standalone from the orchestrator.                              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
)
from app.core.scene_composition import (
    assign_blueprints,
    validate_scene_against_blueprint,
    validate_game_composition,
    GameCompositionRules,
    DEFAULT_GAME_RULES,
)

logger = logging.getLogger(__name__)


class SceneContentValidator(BaseValidator):
    """
    Validates scene content against composition rules.
    Plugs into ValidationPipeline.
    """

    @property
    def name(self) -> str:
        return "scene_content_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        scenes = manifest.get("scenes", [])
        config = manifest.get("config", {})
        assets = manifest.get("assets", {})

        if not scenes:
            result.add_error(
                code="CONTENT_001",
                message="No scenes in manifest",
            )
            return result

        # Assign blueprints based on scene count
        blueprints = assign_blueprints(len(scenes))

        # ── Per-scene validation ──────────────────────────────────────────
        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                result.add_error(
                    code="CONTENT_002",
                    message=f"Scene {i} is not a valid object",
                    location=f"scenes[{i}]",
                )
                continue

            blueprint = blueprints[i] if i < len(blueprints) else blueprints[-1]

            is_valid, errors, warnings = validate_scene_against_blueprint(
                scene, blueprint
            )

            for err in errors:
                result.add_error(
                    code="CONTENT_SCENE",
                    message=f"Scene {i} ({blueprint.role.value}): {err}",
                    location=f"scenes[{i}]",
                )

            for warn in warnings:
                result.add_warning(
                    code="CONTENT_SCENE_WARN",
                    message=f"Scene {i} ({blueprint.role.value}): {warn}",
                    location=f"scenes[{i}]",
                )

            # Additional content checks not in blueprint
            self._check_scene_content(scene, i, result)

        # ── Game-wide validation ──────────────────────────────────────────
        assets_used = self._collect_assets_used(scenes)
        total_assets = assets.get("total", 0)

        is_valid, errors, warnings = validate_game_composition(
            scenes, assets_used, total_assets
        )

        for err in errors:
            result.add_error(
                code="CONTENT_GAME",
                message=err,
            )
        for warn in warnings:
            result.add_warning(
                code="CONTENT_GAME_WARN",
                message=warn,
            )

        # Summary
        result.metadata = {
            "scene_count": len(scenes),
            "total_challenges": sum(
                len(s.get("challenges", [])) for s in scenes if isinstance(s, dict)
            ),
            "total_npcs": sum(
                1
                for s in scenes
                if isinstance(s, dict)
                for _ in (s.get("npcs", []) if isinstance(s.get("npcs"), list) else [])
            ),
            "assets_used": len(assets_used),
            "total_assets": total_assets,
            "asset_coverage": f"{len(assets_used)/max(1,total_assets):.0%}",
        }

        return result

    def _check_scene_content(self, scene: dict, index: int, result: ValidationResult):
        """Additional content checks beyond blueprint."""
        location = f"scenes[{index}]"

        # Check for decoration-only scene (the key failure mode)
        objects = scene.get("objects", [])
        non_decoration = [
            o
            for o in objects
            if isinstance(o, dict) and o.get("type") not in ("decoration", "landmark")
        ]
        if not non_decoration and objects:
            result.add_error(
                code="CONTENT_003",
                message=f"Scene {index} has only decorations — no interactive content",
                location=location,
            )

        # Check challenges have positions
        for j, challenge in enumerate(scene.get("challenges", [])):
            if isinstance(challenge, dict):
                if challenge.get("x") is None or challenge.get("y") is None:
                    result.add_warning(
                        code="CONTENT_004",
                        message=f"Challenge {j} has no position",
                        location=f"{location}.challenges[{j}]",
                    )

        # Check path exists
        if scene.get("path_exists") is False:
            result.add_error(
                code="CONTENT_005",
                message=f"Scene {index} has no walkable path spawn→exit",
                location=location,
            )

    def _collect_assets_used(self, scenes: list) -> set[str]:
        """Collect all unique asset names used across scenes."""
        used = set()
        for scene in scenes:
            if not isinstance(scene, dict):
                continue
            for obj in scene.get("objects", []):
                if isinstance(obj, dict):
                    name = obj.get("asset_name", "")
                    if name and name not in ("challenge_marker", "goal_zone", "npc"):
                        used.add(name)
        return used


# ═══════════════════════════════════════════════════════════════════════════════
#  STANDALONE VALIDATION (for orchestrator use)
# ═══════════════════════════════════════════════════════════════════════════════


def validate_scene_content(
    state,
    materialized_scenes: list,
) -> tuple[bool, list[str], list[str]]:
    """
    Validate scene content using composition rules.
    Called by the orchestrator after materialization.

    Returns (is_valid, errors, warnings)
    """
    errors = []
    warnings = []

    blueprints = assign_blueprints(len(materialized_scenes))

    for i, scene in enumerate(materialized_scenes):
        blueprint = blueprints[i] if i < len(blueprints) else blueprints[-1]

        # Build scene_data dict from MaterializedScene
        scene_data = {
            "spawn": {"x": scene.spawn_x, "y": scene.spawn_y},
            "exit": {"x": scene.exit_x, "y": scene.exit_y},
            "challenges": scene.challenges,
            "npcs": scene.npcs,
            "objects": scene.objects + scene.landmarks + scene.decorations,
            "path_exists": scene.path_exists,
        }

        is_valid, scene_errors, scene_warnings = validate_scene_against_blueprint(
            scene_data, blueprint
        )

        for e in scene_errors:
            errors.append(f"Scene {i} ({blueprint.role.value}): {e}")
        for w in scene_warnings:
            warnings.append(f"Scene {i} ({blueprint.role.value}): {w}")

    # Game-wide checks
    all_assets_used = set()
    for scene in materialized_scenes:
        for obj in scene.objects + scene.landmarks + scene.decorations:
            if isinstance(obj, dict):
                name = obj.get("asset_name", "")
                if name:
                    all_assets_used.add(name)

    total_assets = len(state.input.assets) if state else 0
    _, game_errors, game_warnings = validate_game_composition(
        [scene.to_manifest() for scene in materialized_scenes],
        all_assets_used,
        total_assets,
    )
    errors.extend(game_errors)
    warnings.extend(game_warnings)

    is_valid = len(errors) == 0

    logger.info(
        f"Scene content validation: {'PASS' if is_valid else 'FAIL'} "
        f"({len(errors)} errors, {len(warnings)} warnings)"
    )

    return is_valid, errors, warnings
