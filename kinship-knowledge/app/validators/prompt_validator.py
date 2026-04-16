"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PROMPT VALIDATOR                                           ║
║                                                                               ║
║  Validates user prompts before interpretation.                                ║
║                                                                               ║
║  CHECKS:                                                                      ║
║  1. Prompt not empty                                                          ║
║  2. Prompt length within limits                                               ║
║  3. No unsupported actions/content                                            ║
║  4. Language detection (optional)                                             ║
║  5. Content safety (no harmful content)                                       ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import re
import logging
from dataclasses import dataclass, field
from typing import List, Optional

from app.validators.validation_pipeline import (
    BaseValidator,
    ValidationResult,
    ValidationSeverity,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  CONSTANTS
# ═══════════════════════════════════════════════════════════════════════════════

MIN_PROMPT_LENGTH = 10
MAX_PROMPT_LENGTH = 5000

# Unsupported action keywords
UNSUPPORTED_ACTIONS = [
    "multiplayer",
    "online",
    "pvp",
    "mmo",
    "real-time combat",
    "first person shooter",
    "fps",
    "3d",
    "vr",
    "ar",
    "augmented reality",
    "virtual reality",
]

# Content that should be flagged
FLAGGED_CONTENT = [
    "violence",
    "gore",
    "blood",
    "kill",
    "murder",
    "weapon",
    "gun",
    "adult",
    "gambling",
]


# ═══════════════════════════════════════════════════════════════════════════════
#  PROMPT VALIDATION RESULT
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PromptValidationResult:
    """Result of prompt validation."""

    valid: bool = True
    cleaned_prompt: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Extracted info
    detected_goal_hints: List[str] = field(default_factory=list)
    detected_themes: List[str] = field(default_factory=list)
    estimated_complexity: str = "medium"  # simple, medium, complex


# ═══════════════════════════════════════════════════════════════════════════════
#  PROMPT VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class PromptValidator(BaseValidator):
    """
    Validates user prompts before AI interpretation.

    Ensures prompts are well-formed and don't request unsupported features.
    """

    @property
    def name(self) -> str:
        return "prompt_validator"

    def validate(self, manifest: dict) -> ValidationResult:
        """
        Validate using manifest format (for pipeline compatibility).

        Expects manifest to have 'prompt' key.
        """
        prompt = manifest.get("prompt", "")
        result = self.validate_prompt(prompt)

        # Convert to ValidationResult
        val_result = ValidationResult(validator_name=self.name)

        for error in result.errors:
            val_result.add_error(
                code="PROMPT_INVALID",
                message=error,
                location="prompt",
            )

        for warning in result.warnings:
            val_result.add_warning(
                code="PROMPT_WARNING",
                message=warning,
                location="prompt",
            )

        return val_result

    def validate_prompt(self, prompt: str) -> PromptValidationResult:
        """
        Validate a user prompt.

        Args:
            prompt: User's game description

        Returns:
            PromptValidationResult
        """
        result = PromptValidationResult()

        # Clean prompt
        cleaned = prompt.strip()
        result.cleaned_prompt = cleaned

        # Check empty
        if not cleaned:
            result.valid = False
            result.errors.append("Prompt cannot be empty")
            return result

        # Check length
        if len(cleaned) < MIN_PROMPT_LENGTH:
            result.valid = False
            result.errors.append(
                f"Prompt too short (min {MIN_PROMPT_LENGTH} characters). "
                "Please provide more detail about the game you want to create."
            )
            return result

        if len(cleaned) > MAX_PROMPT_LENGTH:
            result.valid = False
            result.errors.append(
                f"Prompt too long (max {MAX_PROMPT_LENGTH} characters). "
                "Please shorten your description."
            )
            return result

        # Check for unsupported actions
        prompt_lower = cleaned.lower()
        for action in UNSUPPORTED_ACTIONS:
            if action in prompt_lower:
                result.warnings.append(
                    f"'{action}' is not currently supported. "
                    "The game will be generated as a 2D isometric single-player experience."
                )

        # Check for flagged content
        for content in FLAGGED_CONTENT:
            if content in prompt_lower:
                result.warnings.append(
                    f"Content related to '{content}' will be made age-appropriate "
                    "for the target audience (children 9-12)."
                )

        # Extract goal hints
        result.detected_goal_hints = self._extract_goal_hints(prompt_lower)

        # Extract themes
        result.detected_themes = self._extract_themes(prompt_lower)

        # Estimate complexity
        result.estimated_complexity = self._estimate_complexity(cleaned)

        logger.info(
            f"Prompt validated: valid={result.valid}, "
            f"goals={result.detected_goal_hints}, "
            f"complexity={result.estimated_complexity}"
        )

        return result

    def _extract_goal_hints(self, prompt: str) -> List[str]:
        """Extract potential goal types from prompt."""
        hints = []

        goal_keywords = {
            "escape": ["escape", "get out", "flee", "run away"],
            "explore": ["explore", "discover", "find", "search"],
            "rescue": ["rescue", "save", "help", "free"],
            "gather": ["collect", "gather", "pick up", "find all"],
            "deliver": ["deliver", "bring", "take to", "give to"],
            "defeat": ["defeat", "beat", "fight", "battle"],
            "solve": ["solve", "puzzle", "figure out", "unlock"],
            "build": ["build", "construct", "create", "make"],
            "befriend": ["befriend", "talk to", "meet", "make friends"],
        }

        for goal, keywords in goal_keywords.items():
            for keyword in keywords:
                if keyword in prompt:
                    hints.append(goal)
                    break

        return list(set(hints))

    def _extract_themes(self, prompt: str) -> List[str]:
        """Extract potential themes from prompt."""
        themes = []

        theme_keywords = {
            "forest": ["forest", "woods", "trees", "nature"],
            "magic": ["magic", "magical", "wizard", "fairy", "enchanted"],
            "adventure": ["adventure", "quest", "journey", "explore"],
            "mystery": ["mystery", "secret", "hidden", "discover"],
            "friendly": ["friendly", "help", "kind", "peaceful"],
            "fantasy": ["fantasy", "dragon", "castle", "kingdom"],
        }

        for theme, keywords in theme_keywords.items():
            for keyword in keywords:
                if keyword in prompt:
                    themes.append(theme)
                    break

        return list(set(themes))

    def _estimate_complexity(self, prompt: str) -> str:
        """Estimate game complexity from prompt."""
        # Count specific feature mentions
        complexity_indicators = 0

        # Multiple scenes
        if any(
            word in prompt.lower() for word in ["scenes", "levels", "areas", "zones"]
        ):
            complexity_indicators += 1

        # Multiple NPCs
        if any(
            word in prompt.lower()
            for word in ["characters", "npcs", "people", "villagers"]
        ):
            complexity_indicators += 1

        # Multiple mechanics
        mechanic_words = [
            "collect",
            "puzzle",
            "fight",
            "talk",
            "trade",
            "build",
            "unlock",
        ]
        mechanic_count = sum(1 for word in mechanic_words if word in prompt.lower())
        if mechanic_count >= 3:
            complexity_indicators += 2
        elif mechanic_count >= 2:
            complexity_indicators += 1

        # Story elements
        if any(
            word in prompt.lower() for word in ["story", "narrative", "plot", "quest"]
        ):
            complexity_indicators += 1

        # Determine complexity
        if complexity_indicators >= 4:
            return "complex"
        elif complexity_indicators >= 2:
            return "medium"
        else:
            return "simple"


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def validate_prompt(prompt: str) -> PromptValidationResult:
    """
    Validate a user prompt.

    Args:
        prompt: User's game description

    Returns:
        PromptValidationResult
    """
    validator = PromptValidator()
    return validator.validate_prompt(prompt)
