"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MANIFEST ASSEMBLER                                         ║
║                                                                               ║
║  Assembles the final game manifest from all agent outputs.                    ║
║                                                                               ║
║  KEY PRINCIPLE:                                                               ║
║  • AI produces semantic plans                                                 ║
║  • SYSTEM produces the manifest                                               ║
║                                                                               ║
║  This prevents structural errors and ensures consistent output format.        ║
║                                                                               ║
║  INPUT:                                                                       ║
║  • MaterializedScenes (from SceneMaterializer)                                ║
║  • DialogueOutputs (from DialogueAgent)                                       ║
║  • VerificationOutput (from VerificationAgent)                                ║
║  • PlannerOutput (narrative, gameplay loop)                                   ║
║                                                                               ║
║  OUTPUT:                                                                      ║
║  • Complete game manifest (JSON-serializable)                                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime
import uuid
import json
import logging

from app.pipeline.pipeline_state import (
    PipelineState,
    PlannerOutput,
    DialogueOutput,
    VerificationOutput,
)
from app.pipeline.scene_materializer import (
    MaterializedScene,
    materialize_scenes,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST SCHEMA VERSION
# ═══════════════════════════════════════════════════════════════════════════════

MANIFEST_VERSION = "2.0.0"
MANIFEST_SCHEMA = "kinship-game-manifest"


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST ASSEMBLER
# ═══════════════════════════════════════════════════════════════════════════════


class ManifestAssembler:
    """
    Assembles the final game manifest from all pipeline outputs.

    This is a SYSTEM component — deterministic, no AI.
    """

    def __init__(self, include_debug: bool = False):
        """
        Args:
            include_debug: Include debug info in manifest
        """
        self.include_debug = include_debug

    def assemble(
        self,
        state: PipelineState,
        materialized_scenes: list[MaterializedScene],
    ) -> dict:
        """
        Assemble complete game manifest.

        Args:
            state: Pipeline state with all outputs
            materialized_scenes: Scenes with coordinates

        Returns:
            Complete game manifest
        """
        input_cfg = state.input

        # Build manifest structure
        manifest = {
            # Header
            "$schema": MANIFEST_SCHEMA,
            "version": MANIFEST_VERSION,
            "generated_at": datetime.utcnow().isoformat(),
            "pipeline_id": state.pipeline_id,
            "seed": state.seed,
            # Game identity
            "game": {
                "id": input_cfg.game_id,
                "name": input_cfg.game_name,
                "theme_id": input_cfg.theme_id or None,
            },
            # Configuration
            "config": {
                "goal_type": input_cfg.goal_type,
                "goal_description": input_cfg.goal_description,
                "audience_type": input_cfg.audience_type,
                "zone_type": input_cfg.zone_type,
                "scene_width": input_cfg.scene_width,
                "scene_height": input_cfg.scene_height,
                "difficulty_curve": input_cfg.difficulty_curve,
            },
            # Narrative
            "narrative": self._build_narrative(state),
            # Gameplay
            "gameplay": self._build_gameplay(state),
            # Scenes (with generated IDs)
            "scenes": self._build_scenes(state, materialized_scenes),
            # Routes between scenes
            "routes": self._build_routes(state, materialized_scenes),
            # NPCs (global registry)
            "npcs": self._build_npc_registry(state, materialized_scenes),
            # Dialogues
            "dialogues": self._build_dialogues(state),
            # Assets used
            "assets": self._build_asset_list(state),
            # Validation
            "validation": self._build_validation(state),
        }

        # Add debug info if requested
        if self.include_debug:
            manifest["debug"] = self._build_debug(state)

        return manifest

    def _build_scenes(self, state: PipelineState, materialized_scenes: list) -> list:
        """Build scenes list with generated IDs."""
        game_id = state.input.game_id
        scenes = []

        for scene in materialized_scenes:
            scene_data = scene.to_manifest()
            # Add scene ID: game_id + scene_index
            scene_data["id"] = f"{game_id}_scene_{scene.scene_index}"
            scene_data["scene_id"] = scene_data["id"]
            # Add scene name for display
            scene_data["scene_name"] = f"Scene {scene.scene_index + 1}"
            scenes.append(scene_data)

        return scenes

    def _build_routes(self, state: PipelineState, materialized_scenes: list) -> list:
        """Build routes connecting consecutive scenes."""
        game_id = state.input.game_id
        routes = []

        for i in range(len(materialized_scenes) - 1):
            current_scene = materialized_scenes[i]
            next_scene = materialized_scenes[i + 1]

            from_scene_id = f"{game_id}_scene_{i}"
            to_scene_id = f"{game_id}_scene_{i + 1}"

            # Create route from current scene's exit to next scene's spawn
            routes.append(
                {
                    "route_id": f"route_{i}_to_{i+1}",
                    "from_scene": i,
                    "to_scene": i + 1,
                    "from_scene_id": from_scene_id,
                    "to_scene_id": to_scene_id,
                    "from_scene_name": f"Scene {i + 1}",
                    "to_scene_name": f"Scene {i + 2}",
                    "trigger": {
                        "type": "zone_enter",
                        "zone_type": "exit",
                        "position": {
                            "x": current_scene.exit_x,
                            "y": current_scene.exit_y,
                        },
                    },
                    "target_spawn": {
                        "x": next_scene.spawn_x,
                        "y": next_scene.spawn_y,
                    },
                    "conditions": [],
                    "transition": "fade",
                }
            )

        return routes

    def _build_narrative(self, state: PipelineState) -> dict:
        """Build narrative section from planner output."""
        narrative = {
            "story_hook": "",
            "resolution": "",
            "goal_description": state.input.goal_description,
        }

        if state.planner_output:
            loop = state.planner_output.gameplay_loop
            if isinstance(loop, dict):
                narrative["story_hook"] = loop.get("story_hook", "")
                narrative["resolution"] = loop.get("resolution", "")
                narrative["goal_description"] = loop.get(
                    "goal_description", narrative["goal_description"]
                )

        return narrative

    def _build_gameplay(self, state: PipelineState) -> dict:
        """Build gameplay section."""
        gameplay = {
            "loop_id": "",
            "mechanics": [],
            "difficulty_curve": {},
            "tutorial_mechanics": [],
        }

        if state.planner_output:
            loop = state.planner_output.gameplay_loop
            if isinstance(loop, dict):
                gameplay["loop_id"] = loop.get("loop_id", "")

            # Filter out None values from mechanic sequence
            gameplay["mechanics"] = [
                m for m in state.planner_output.mechanic_sequence if m is not None
            ]
            gameplay["difficulty_curve"] = (
                dict(state.planner_output.difficulty_curve)
                if state.planner_output.difficulty_curve
                else {}
            )

        # Get tutorial mechanics
        tutorial_mechs = set()
        for co in state.challenge_outputs:
            for tutorial in co.tutorials:
                if isinstance(tutorial, dict) and tutorial.get("mechanic_id"):
                    tutorial_mechs.add(tutorial["mechanic_id"])
        gameplay["tutorial_mechanics"] = list(tutorial_mechs)

        return gameplay

    def _build_npc_registry(
        self,
        state: PipelineState,
        materialized_scenes: list[MaterializedScene],
    ) -> dict:
        """Build global NPC registry."""
        npcs = {}

        for scene in materialized_scenes:
            for npc in scene.npcs:
                npc_id = npc.get("npc_id", str(uuid.uuid4()))

                # Get dialogue for this NPC
                dialogue = {}
                for do in state.dialogue_outputs:
                    if do.npc_id == npc_id:
                        dialogue = do.dialogue
                        break

                npcs[npc_id] = {
                    "npc_id": npc_id,
                    "name": npc.get("name", "NPC"),
                    "role": npc.get("role", "villager"),
                    "scene_index": scene.scene_index,
                    "position": {
                        "x": npc.get("x", 0),
                        "y": npc.get("y", 0),
                    },
                    "asset_name": npc.get("asset_name", ""),
                    "asset_id": npc.get("asset_id"),
                    "behavior": npc.get("behavior", {}),
                    "personality": npc.get("personality", []),
                    "mechanic": npc.get("mechanic"),
                    "dialogue": dialogue,
                }

        return npcs

    def _build_dialogues(self, state: PipelineState) -> dict:
        """Build dialogue registry."""
        dialogues = {}

        for do in state.dialogue_outputs:
            dialogues[do.npc_id] = do.dialogue

        return dialogues

    def _build_asset_list(self, state: PipelineState) -> dict:
        """Build list of assets used."""
        return {
            "total": len(state.input.assets),
            "asset_ids": list(state.input.asset_ids),
            "by_type": self._group_assets_by_type(state),
        }

    def _group_assets_by_type(self, state: PipelineState) -> dict:
        """Group assets by type."""
        by_type = {}

        for asset in state.input.assets:
            asset_type = asset.get("type", "object")
            if asset_type not in by_type:
                by_type[asset_type] = []
            by_type[asset_type].append(asset.get("name", ""))

        return by_type

    def _build_validation(self, state: PipelineState) -> dict:
        """Build validation section."""
        validation = {
            "is_valid": True,
            "errors": [],
            "warnings": [],
            "checks": {},
        }

        if state.verification_output:
            validation["is_valid"] = state.verification_output.is_valid
            validation["errors"] = list(state.verification_output.errors)
            validation["warnings"] = list(state.verification_output.warnings)
            validation["checks"] = (
                dict(state.verification_output.check_results)
                if state.verification_output.check_results
                else {}
            )

        return validation

    def _build_debug(self, state: PipelineState) -> dict:
        """Build debug section."""
        return {
            "pipeline_id": state.pipeline_id,
            "seed": state.seed,
            "created_at": state.created_at.isoformat(),
            "stages_completed": [s.value for s in state.completed_stages],
            "current_stage": state.current_stage.value,
            "duration_ms": state.total_duration_ms,
            "agent_logs": [entry.to_dict() for entry in state.log],
        }

    def to_json(
        self,
        state: PipelineState,
        materialized_scenes: list[MaterializedScene],
        indent: int = 2,
    ) -> str:
        """
        Assemble and return as JSON string.
        """
        manifest = self.assemble(state, materialized_scenes)
        return json.dumps(manifest, indent=indent, default=str)


# ═══════════════════════════════════════════════════════════════════════════════
#  FULL ASSEMBLY PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def assemble_game_manifest(
    state: PipelineState,
    include_debug: bool = False,
) -> dict:
    """
    Full assembly pipeline: materialize scenes + assemble manifest.

    Args:
        state: Pipeline state with all agent outputs
        include_debug: Include debug info

    Returns:
        Complete game manifest
    """
    # Step 1: Materialize scenes
    logger.info("Materializing scenes...")
    materialized_scenes = materialize_scenes(state)

    # Step 2: Assemble manifest
    logger.info("Assembling manifest...")
    assembler = ManifestAssembler(include_debug=include_debug)
    manifest = assembler.assemble(state, materialized_scenes)

    # Step 3: Store in state
    state.populated_scenes = [scene.to_manifest() for scene in materialized_scenes]
    state.manifest = manifest

    logger.info(f"Manifest assembled: {len(manifest['scenes'])} scenes")

    return manifest


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_manifest(manifest: dict) -> tuple[bool, list[str]]:
    """
    Validate a manifest against expected schema.

    Returns:
        (is_valid, list of errors)
    """
    errors = []

    # Check required fields
    required_fields = [
        "version",
        "game",
        "config",
        "scenes",
        "npcs",
        "validation",
    ]

    for field in required_fields:
        if field not in manifest:
            errors.append(f"Missing required field: {field}")

    # Check game identity
    game = manifest.get("game", {})
    if not game.get("id"):
        errors.append("Missing game.id")
    if not game.get("name"):
        errors.append("Missing game.name")

    # Check scenes
    scenes = manifest.get("scenes", [])
    if not scenes:
        errors.append("No scenes in manifest")

    for i, scene in enumerate(scenes):
        if "spawn" not in scene:
            errors.append(f"Scene {i} missing spawn")
        if "exit" not in scene:
            errors.append(f"Scene {i} missing exit")
        if not scene.get("valid", True):
            errors.append(f"Scene {i} marked as invalid: {scene.get('issues', [])}")

    # Check validation status
    validation = manifest.get("validation", {})
    if not validation.get("is_valid", True):
        errors.extend(validation.get("errors", []))

    return len(errors) == 0, errors


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST SERIALIZATION
# ═══════════════════════════════════════════════════════════════════════════════


def manifest_to_json(manifest: dict, indent: int = 2) -> str:
    """Convert manifest to JSON string."""
    return json.dumps(manifest, indent=indent, default=str)


def manifest_to_file(manifest: dict, filepath: str, indent: int = 2):
    """Write manifest to file."""
    with open(filepath, "w") as f:
        json.dump(manifest, f, indent=indent, default=str)


def manifest_from_file(filepath: str) -> dict:
    """Load manifest from file."""
    with open(filepath, "r") as f:
        return json.load(f)
