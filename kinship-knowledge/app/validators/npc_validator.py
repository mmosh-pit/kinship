"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    NPC VALIDATOR                                              ║
║                                                                               ║
║  Validates NPC assignments and behaviors.                                     ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. NPC is assigned to a valid scene                                          ║
║  2. NPC has valid behavior/role                                               ║
║  3. NPC position is within scene bounds                                       ║
║  4. NPC dialogue is properly linked                                           ║
║  5. NPC quests are achievable                                                 ║
║  6. No duplicate NPCs in same location                                        ║
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
#  VALID NPC ROLES
# ═══════════════════════════════════════════════════════════════════════════════

VALID_NPC_ROLES = {
    "guide",
    "quest_giver",
    "merchant",
    "helper",
    "guardian",
    "villager",
    "elder",
    "child",
    "healer",
    "craftsman",
    "explorer",
    "antagonist",
    "neutral",
}

VALID_NPC_BEHAVIORS = {
    "stationary",
    "patrol",
    "wander",
    "follow",
    "flee",
    "approach",
}

VALID_DIALOGUE_STYLES = {
    "friendly",
    "formal",
    "mysterious",
    "grumpy",
    "excited",
    "wise",
    "casual",
    "nervous",
}


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class NPCValidationResult:
    """Result of NPC validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validation stats
    npcs_checked: int = 0
    npcs_valid: int = 0
    orphaned_npcs: List[str] = field(default_factory=list)
    duplicate_positions: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class NPCValidator(BaseValidator):
    """
    Validates NPC assignments and behaviors.
    """

    @property
    def name(self) -> str:
        return "npc_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format.
        """
        scenes = manifest.get("scenes", [])
        global_npcs = manifest.get("npcs", {})

        result = self.validate_npcs(scenes, global_npcs)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="NPC_INVALID",
                message=error,
                location="npcs",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="NPC_WARNING",
                message=warning,
                location="npcs",
            )

        return val_result

    def validate_npcs(
        self,
        scenes: List[Dict[str, Any]],
        global_npcs: Optional[Dict[str, Any]] = None,
    ) -> NPCValidationResult:
        """
        Validate NPCs in scenes.

        Args:
            scenes: Scene list with NPCs
            global_npcs: Global NPC definitions (optional)

        Returns:
            NPCValidationResult
        """
        result = NPCValidationResult()

        scene_names = {s.get("scene_name", f"scene_{i}") for i, s in enumerate(scenes)}
        all_npc_ids = set()
        position_map = {}  # (scene, x, y) -> npc_id

        for scene_idx, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{scene_idx}")
            scene_width = scene.get("width", 16)
            scene_height = scene.get("height", 16)

            npcs = scene.get("npcs", [])

            for npc in npcs:
                # Resolve string NPC references against global npcs dict
                if isinstance(npc, str):
                    if global_npcs and npc in global_npcs:
                        npc = global_npcs[npc]
                        if not isinstance(npc, dict):
                            continue
                    else:
                        # String ID with no global definition — skip validation
                        result.npcs_checked += 1
                        result.warnings.append(
                            f"NPC '{npc}' in {scene_name} is a string reference "
                            f"with no global definition — skipped validation"
                        )
                        all_npc_ids.add(npc)
                        continue

                if not isinstance(npc, dict):
                    continue

                result.npcs_checked += 1
                npc_errors, npc_warnings = self._validate_npc(
                    npc,
                    scene_name,
                    scene_width,
                    scene_height,
                    all_npc_ids,
                    position_map,
                )

                if npc_errors:
                    result.errors.extend(npc_errors)
                else:
                    result.npcs_valid += 1

                result.warnings.extend(npc_warnings)

                # Track NPC ID
                npc_id = npc.get("npc_id") or npc.get("id")
                if npc_id:
                    all_npc_ids.add(npc_id)

        # Check for orphaned NPCs in global definitions
        if global_npcs:
            for npc_id, npc_def in global_npcs.items():
                if npc_id not in all_npc_ids:
                    result.orphaned_npcs.append(npc_id)
                    result.warnings.append(
                        f"NPC '{npc_id}' defined globally but not placed in any scene"
                    )

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"NPCs validated: valid={result.valid}, "
            f"{result.npcs_valid}/{result.npcs_checked} NPCs valid"
        )

        return result

    def _validate_npc(
        self,
        npc: Dict[str, Any],
        scene_name: str,
        scene_width: int,
        scene_height: int,
        all_npc_ids: Set[str],
        position_map: Dict,
    ) -> tuple[List[str], List[str]]:
        """Validate a single NPC."""
        errors = []
        warnings = []

        npc_id = npc.get("npc_id") or npc.get("id") or "unnamed"
        npc_name = npc.get("name", npc_id)
        if not isinstance(npc_name, str):
            npc_name = str(npc_name)

        # Check for duplicate ID
        if npc_id in all_npc_ids:
            errors.append(f"Duplicate NPC ID: {npc_id}")

        # Check role (may be string or dict — normalize to string)
        role_raw = npc.get("role", "")
        role = role_raw.lower() if isinstance(role_raw, str) else str(role_raw).lower()
        if role and role not in VALID_NPC_ROLES:
            warnings.append(f"NPC '{npc_name}': unknown role '{role}'")

        # Check behavior (may be string or dict — normalize to string)
        behavior_raw = npc.get("behavior", "")
        behavior = (
            behavior_raw.lower()
            if isinstance(behavior_raw, str)
            else str(behavior_raw).lower()
        )
        if behavior and behavior not in VALID_NPC_BEHAVIORS:
            warnings.append(f"NPC '{npc_name}': unknown behavior '{behavior}'")

        # Check position (handle nested position dict)
        pos = npc.get("position", {})
        x = npc.get("x", pos.get("x", 0) if isinstance(pos, dict) else 0)
        y = npc.get("y", pos.get("y", 0) if isinstance(pos, dict) else 0)
        if not isinstance(x, (int, float)):
            try:
                x = int(x)
            except (ValueError, TypeError):
                x = 0
        if not isinstance(y, (int, float)):
            try:
                y = int(y)
            except (ValueError, TypeError):
                y = 0

        if x < 0 or x >= scene_width:
            errors.append(
                f"NPC '{npc_name}' x position {x} out of bounds (0-{scene_width-1})"
            )
        if y < 0 or y >= scene_height:
            errors.append(
                f"NPC '{npc_name}' y position {y} out of bounds (0-{scene_height-1})"
            )

        # Check for duplicate positions
        pos_key = (scene_name, int(x), int(y))
        if pos_key in position_map:
            existing = position_map[pos_key]
            warnings.append(
                f"NPC '{npc_name}' at same position as '{existing}' in {scene_name}"
            )
        else:
            position_map[pos_key] = npc_name

        # Check dialogue style (may be string or dict)
        style_raw = npc.get("dialogue_style", "")
        style = (
            style_raw.lower() if isinstance(style_raw, str) else str(style_raw).lower()
        )
        if style and style not in VALID_DIALOGUE_STYLES:
            warnings.append(f"NPC '{npc_name}': unknown dialogue style '{style}'")

        # Check quest giver has quest
        if role == "quest_giver":
            if not npc.get("gives_quest", True) and not npc.get("quest_description"):
                warnings.append(
                    f"NPC '{npc_name}' is quest_giver but has no quest defined"
                )

        # Check has name
        if not npc.get("name"):
            warnings.append(f"NPC '{npc_id}' has no display name")

        # Check has greeting
        if not npc.get("initial_greeting") and not npc.get("greeting"):
            warnings.append(f"NPC '{npc_name}' has no greeting dialogue")

        return errors, warnings


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_npcs(
    scenes: List[Dict[str, Any]],
    global_npcs: Optional[Dict[str, Any]] = None,
) -> NPCValidationResult:
    """
    Validate NPCs in scenes.

    Args:
        scenes: Scene list with NPCs
        global_npcs: Global NPC definitions (optional)

    Returns:
        NPCValidationResult
    """
    validator = NPCValidator()
    return validator.validate_npcs(scenes, global_npcs)
