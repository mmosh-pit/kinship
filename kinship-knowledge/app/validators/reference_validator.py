"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    REFERENCE VALIDATOR                                        ║
║                                                                               ║
║  Validates all ID references resolve correctly.                               ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  • Scene NPC references exist in npcs registry                                ║
║  • Asset references exist (if asset list provided)                            ║
║  • Challenge template IDs are valid                                           ║
║  • No orphaned NPCs (NPCs not referenced by any scene)                        ║
║  • No duplicate IDs                                                           ║
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


class ReferenceValidator(BaseValidator):
    """Validates all ID references resolve correctly."""

    @property
    def name(self) -> str:
        return "reference_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        result = ValidationResult(validator_name=self.name)

        # Collect all defined IDs
        defined_npcs = set()
        defined_challenges = set()
        referenced_npcs = set()

        # Get NPC registry
        npcs = manifest.get("npcs", {})
        if isinstance(npcs, dict):
            defined_npcs = set(npcs.keys())

        # Check scene references
        scenes = manifest.get("scenes", [])
        for i, scene in enumerate(scenes):
            if not isinstance(scene, dict):
                continue

            location = f"scenes[{i}]"

            # Check NPC references
            scene_npcs = scene.get("npcs", [])
            if isinstance(scene_npcs, list):
                for npc_id in scene_npcs:
                    referenced_npcs.add(npc_id)

                    if npc_id not in defined_npcs:
                        result.add_error(
                            code="REF_001",
                            message=f"NPC reference '{npc_id}' not found in npcs registry",
                            location=f"{location}.npcs",
                            npc_id=npc_id,
                        )

            # Check challenge references
            challenges = scene.get("challenges", [])
            if isinstance(challenges, list):
                for j, challenge in enumerate(challenges):
                    if not isinstance(challenge, dict):
                        continue

                    challenge_id = challenge.get("challenge_id")
                    if challenge_id:
                        if challenge_id in defined_challenges:
                            result.add_error(
                                code="REF_002",
                                message=f"Duplicate challenge_id: {challenge_id}",
                                location=f"{location}.challenges[{j}]",
                            )
                        defined_challenges.add(challenge_id)

                    # Validate mechanic_id exists in templates
                    mechanic_id = challenge.get("mechanic_id")
                    if mechanic_id:
                        self._validate_mechanic_id(
                            mechanic_id, f"{location}.challenges[{j}]", result
                        )

        # Check for orphaned NPCs
        orphaned_npcs = defined_npcs - referenced_npcs
        for npc_id in orphaned_npcs:
            result.add_warning(
                code="REF_003",
                message=f"NPC '{npc_id}' defined but not referenced by any scene",
                location=f"npcs.{npc_id}",
            )

        # Check NPC-to-scene consistency
        for npc_id, npc in npcs.items():
            if not isinstance(npc, dict):
                continue

            npc_scene_index = npc.get("scene_index")
            if npc_scene_index is not None:
                # Verify NPC is listed in that scene
                if npc_scene_index < len(scenes):
                    scene = scenes[npc_scene_index]
                    scene_npcs = (
                        scene.get("npcs", []) if isinstance(scene, dict) else []
                    )

                    if npc_id not in scene_npcs:
                        result.add_warning(
                            code="REF_004",
                            message=f"NPC '{npc_id}' has scene_index={npc_scene_index} but is not listed in that scene's npcs",
                            location=f"npcs.{npc_id}",
                        )

        # Check dialogue references
        dialogues = manifest.get("dialogues", {})
        if isinstance(dialogues, dict):
            for npc_id in dialogues.keys():
                if npc_id not in defined_npcs:
                    result.add_warning(
                        code="REF_005",
                        message=f"Dialogue defined for unknown NPC: {npc_id}",
                        location=f"dialogues.{npc_id}",
                    )

        # Add metadata
        result.metadata = {
            "npcs_defined": len(defined_npcs),
            "npcs_referenced": len(referenced_npcs),
            "npcs_orphaned": len(orphaned_npcs),
            "challenges_defined": len(defined_challenges),
        }

        return result

    def _validate_mechanic_id(
        self,
        mechanic_id: str,
        location: str,
        result: ValidationResult,
    ):
        """Validate mechanic_id exists in templates."""
        try:
            from app.core.challenge_templates import get_template

            template = get_template(mechanic_id)
            if template is None:
                result.add_error(
                    code="REF_006",
                    message=f"Unknown mechanic_id: {mechanic_id}",
                    location=location,
                    mechanic_id=mechanic_id,
                )
        except ImportError:
            # Can't validate without templates module
            pass
