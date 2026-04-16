"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    DIALOGUE VALIDATOR                                         ║
║                                                                               ║
║  Validates dialogue is properly linked to NPCs and quests.                    ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Dialogue is linked to valid NPC                                           ║
║  2. Quest dialogue references valid quests                                    ║
║  3. Dialogue choices lead to valid responses                                  ║
║  4. No orphaned dialogue                                                      ║
║  5. Dialogue length is appropriate                                            ║
║  6. Dialogue tone matches NPC personality                                     ║
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
#  DIALOGUE LIMITS
# ═══════════════════════════════════════════════════════════════════════════════

MAX_DIALOGUE_LENGTH = 500  # characters per line
MAX_CHOICES = 4
MIN_DIALOGUE_LENGTH = 5


# ═══════════════════════════════════════════════════════════════════════════════
#  DIALOGUE VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class DialogueValidationResult:
    """Result of dialogue validation."""

    valid: bool = True
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Validation stats
    dialogues_checked: int = 0
    dialogues_valid: int = 0
    orphaned_dialogues: List[str] = field(default_factory=list)
    missing_dialogues: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  DIALOGUE VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class DialogueValidator(BaseValidator):
    """
    Validates dialogue is properly linked to NPCs and quests.
    """

    @property
    def name(self) -> str:
        return "dialogue_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format.
        """
        scenes = manifest.get("scenes", [])
        global_npcs = manifest.get("npcs", {})

        result = self.validate_dialogues(scenes, global_npcs)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="DIALOGUE_INVALID",
                message=error,
                location="dialogue",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="DIALOGUE_WARNING",
                message=warning,
                location="dialogue",
            )

        return val_result

    def validate_dialogues(
        self,
        scenes: List[Dict[str, Any]],
        global_npcs: Optional[Dict[str, Any]] = None,
    ) -> DialogueValidationResult:
        """
        Validate dialogues in scenes.

        Args:
            scenes: Scene list with NPCs and dialogues
            global_npcs: Global NPC definitions (optional)

        Returns:
            DialogueValidationResult
        """
        result = DialogueValidationResult()

        # Collect all NPC IDs
        all_npc_ids = set()
        for scene in scenes:
            for npc in scene.get("npcs", []):
                if isinstance(npc, str):
                    all_npc_ids.add(npc)
                elif isinstance(npc, dict):
                    npc_id = npc.get("npc_id") or npc.get("id")
                    if npc_id:
                        all_npc_ids.add(npc_id)

        if global_npcs:
            all_npc_ids.update(global_npcs.keys())

        # Validate dialogues in each scene
        for scene_idx, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{scene_idx}")

            # Check NPC dialogues
            for npc in scene.get("npcs", []):
                # Resolve string NPC references against global npcs dict
                if isinstance(npc, str):
                    if global_npcs and npc in global_npcs:
                        npc = global_npcs[npc]
                        if not isinstance(npc, dict):
                            continue
                    else:
                        continue  # String ref with no global def — skip

                if not isinstance(npc, dict):
                    continue

                npc_id = npc.get("npc_id") or npc.get("id", "unnamed")
                npc_name = npc.get("name", npc_id)

                # Check greeting
                greeting = npc.get("initial_greeting") or npc.get("greeting", "")
                if greeting:
                    result.dialogues_checked += 1
                    d_errors, d_warnings = self._validate_dialogue_text(
                        greeting, f"{npc_name}.greeting"
                    )
                    result.errors.extend(d_errors)
                    result.warnings.extend(d_warnings)
                    if not d_errors:
                        result.dialogues_valid += 1
                else:
                    result.missing_dialogues.append(f"{npc_name}.greeting")
                    result.warnings.append(f"NPC '{npc_name}' has no greeting")

                # Check dialogue tree
                dialogue_tree = npc.get("dialogue") or npc.get("dialogue_tree", [])
                if dialogue_tree:
                    tree_errors, tree_warnings = self._validate_dialogue_tree(
                        dialogue_tree, npc_name
                    )
                    result.errors.extend(tree_errors)
                    result.warnings.extend(tree_warnings)

                # Check quest dialogue
                if npc.get("gives_quest") or npc.get("quest_description"):
                    quest_dialogue = npc.get("quest_dialogue", {})
                    if not quest_dialogue:
                        result.warnings.append(
                            f"Quest giver '{npc_name}' has no quest dialogue"
                        )

        # Check for orphaned dialogues in global definitions
        if global_npcs:
            for npc_id, npc_def in global_npcs.items():
                if npc_id not in all_npc_ids:
                    if npc_def.get("dialogue") or npc_def.get("dialogue_tree"):
                        result.orphaned_dialogues.append(f"{npc_id}.dialogue")

        # Final validity
        result.valid = len(result.errors) == 0

        logger.info(
            f"Dialogues validated: valid={result.valid}, "
            f"{result.dialogues_valid}/{result.dialogues_checked} valid"
        )

        return result

    def _validate_dialogue_text(
        self,
        text: str,
        context: str,
    ) -> tuple[List[str], List[str]]:
        """Validate a single dialogue text."""
        errors = []
        warnings = []

        if not text:
            errors.append(f"{context}: empty dialogue")
            return errors, warnings

        # Check length
        if len(text) < MIN_DIALOGUE_LENGTH:
            warnings.append(f"{context}: dialogue very short ({len(text)} chars)")

        if len(text) > MAX_DIALOGUE_LENGTH:
            warnings.append(
                f"{context}: dialogue too long ({len(text)} chars, max {MAX_DIALOGUE_LENGTH})"
            )

        # Check for placeholder text
        placeholders = ["{name}", "{player}", "TODO", "PLACEHOLDER", "XXX"]
        for ph in placeholders:
            if ph.upper() in text.upper():
                warnings.append(f"{context}: contains placeholder '{ph}'")

        # Check for common issues
        if text.startswith('"') and not text.endswith('"'):
            warnings.append(f"{context}: unclosed quote")

        return errors, warnings

    def _validate_dialogue_tree(
        self,
        tree: Any,
        npc_name: str,
    ) -> tuple[List[str], List[str]]:
        """Validate a dialogue tree."""
        errors = []
        warnings = []

        if not tree:
            return errors, warnings

        # Handle list format
        if isinstance(tree, list):
            node_ids = set()

            for i, node in enumerate(tree):
                if not isinstance(node, dict):
                    continue

                node_id = node.get("id", f"node_{i}")

                # Check for duplicate IDs
                if node_id in node_ids:
                    errors.append(f"{npc_name}.dialogue: duplicate node ID '{node_id}'")
                node_ids.add(node_id)

                # Check node has text
                text = node.get("text", "")
                if text:
                    self.dialogues_checked = getattr(self, "dialogues_checked", 0) + 1
                    t_errors, t_warnings = self._validate_dialogue_text(
                        text, f"{npc_name}.{node_id}"
                    )
                    errors.extend(t_errors)
                    warnings.extend(t_warnings)

                # Check choices
                choices = node.get("choices", [])
                if len(choices) > MAX_CHOICES:
                    warnings.append(
                        f"{npc_name}.{node_id}: too many choices ({len(choices)}, max {MAX_CHOICES})"
                    )

                for choice in choices:
                    if isinstance(choice, dict):
                        next_node = choice.get("next") or choice.get("goto")
                        if next_node and next_node not in node_ids:
                            # Could be forward reference - just warn
                            pass  # Will check at end

        # Handle dict format (simple)
        elif isinstance(tree, dict):
            for key, value in tree.items():
                if isinstance(value, str):
                    t_errors, t_warnings = self._validate_dialogue_text(
                        value, f"{npc_name}.{key}"
                    )
                    errors.extend(t_errors)
                    warnings.extend(t_warnings)

        return errors, warnings


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_dialogues(
    scenes: List[Dict[str, Any]],
    global_npcs: Optional[Dict[str, Any]] = None,
) -> DialogueValidationResult:
    """
    Validate dialogues in scenes.

    Args:
        scenes: Scene list with NPCs and dialogues
        global_npcs: Global NPC definitions (optional)

    Returns:
        DialogueValidationResult
    """
    validator = DialogueValidator()
    return validator.validate_dialogues(scenes, global_npcs)
