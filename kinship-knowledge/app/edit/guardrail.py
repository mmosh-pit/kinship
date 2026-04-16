"""
Layer 1 — Guardrail Layer.

Edit Instruction Normalizer: rejects vague, decomposes compound.
Edit Intent Classifier: deterministic EditType mapping.
Edit Budget Check: caps mutations per instruction.
Session Memory Loader: loads last N edits for context.
"""

import re
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from app.state.game_state import GameState, EditType
from app.services.claude_client import invoke_claude
from app.edit.config import EditBudget, MAX_SESSION_MEMORY

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class GuardrailResult:
    """Result from the guardrail layer."""

    passed: bool = False
    instructions: List[str] = field(default_factory=list)
    edit_types: List[EditType] = field(default_factory=list)
    session_context: str = ""
    needs_clarification: bool = False
    clarification_message: str = ""
    errors: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  VAGUE INSTRUCTION PATTERNS
# ═══════════════════════════════════════════════════════════════════════════════

VAGUE_PATTERNS = [
    r"^make (?:it |the )?(?:better|cooler|nicer|more interesting|more fun)$",
    r"^improve (?:the )?(?:scene|game|level)$",
    r"^fix (?:it|this|the game)$",
    r"^change (?:it|things|stuff)$",
    r"^do something",
    r"^add something",
    r"^make (?:it |the )?(?:look |feel )?(?:good|great|nice|awesome)$",
]

VAGUE_RE = [re.compile(p, re.IGNORECASE) for p in VAGUE_PATTERNS]


# ═══════════════════════════════════════════════════════════════════════════════
#  EDIT TYPE DETECTION PATTERNS (deterministic)
# ═══════════════════════════════════════════════════════════════════════════════

# Pattern → EditType mapping for single-action instructions
ACTION_PATTERNS = [
    (r"\b(?:add|place|put|create|insert)\b.*\b(?:scene|area|zone|level|room)\b", EditType.ADD_SCENE),
    (r"\b(?:remove|delete|destroy)\b.*\b(?:scene|area|zone|level|room)\b", EditType.REMOVE_SCENE),
    (r"\b(?:add|place|put|create|insert)\b.*\b(?:npc|character|person|fairy|guard|merchant)\b", EditType.ADD_NPC),
    (r"\b(?:remove|delete)\b.*\b(?:npc|character|person)\b", EditType.REMOVE_NPC),
    (r"\b(?:add|place|put|create|insert)\b.*\b(?:challenge|quest|puzzle|task|mission)\b", EditType.ADD_CHALLENGE),
    (r"\b(?:remove|delete)\b.*\b(?:challenge|quest|puzzle|task|mission)\b", EditType.REMOVE_CHALLENGE),
    (r"\b(?:move|reposition|relocate|shift)\b", EditType.MOVE_OBJECT),
    (r"\b(?:remove|delete|destroy|clear)\b", EditType.REMOVE_OBJECT),
    (r"\b(?:update|change|modify|edit|make)\b.*\b(?:dialogue|dialog|conversation|speech|talk)\b", EditType.UPDATE_NPC_DIALOGUE),
    (r"\b(?:update|change|modify|edit|make)\b.*\b(?:npc|character|fairy|guard)\b", EditType.UPDATE_NPC),
    (r"\b(?:update|change|modify|edit|make)\b.*\b(?:challenge|quest|difficulty|puzzle)\b", EditType.UPDATE_CHALLENGE),
    (r"\b(?:add|place|put|create|insert)\b.*\b(?:route|path|connection|exit|door)\b", EditType.ADD_ROUTE),
    (r"\b(?:add|place|put|create|insert)\b", EditType.ADD_OBJECT),
]

ACTION_RE = [(re.compile(p, re.IGNORECASE), et) for p, et in ACTION_PATTERNS]

# Compound instruction markers
COMPOUND_MARKERS = [
    r"\band\b.*\b(?:add|remove|move|update|change|create|delete)\b",
    r"\bthen\b",
    r"\balso\b",
    r",\s*(?:add|remove|move|update|change|create|delete)\b",
]

COMPOUND_RE = [re.compile(p, re.IGNORECASE) for p in COMPOUND_MARKERS]


# ═══════════════════════════════════════════════════════════════════════════════
#  GUARDRAIL FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def is_vague(instruction: str) -> bool:
    """Check if instruction is too vague to process."""
    cleaned = instruction.strip()
    if len(cleaned) < 5:
        return True
    return any(p.match(cleaned) for p in VAGUE_RE)


def classify_edit_type(instruction: str) -> Optional[EditType]:
    """Deterministic classification of instruction to EditType."""
    for pattern, edit_type in ACTION_RE:
        if pattern.search(instruction):
            return edit_type
    return None


def is_compound(instruction: str) -> bool:
    """Check if instruction contains multiple edit actions."""
    return any(p.search(instruction) for p in COMPOUND_RE)


def check_budget(patch: Dict[str, list], budget: EditBudget = None) -> List[str]:
    """Validate patch against edit budget. Returns list of violations."""
    budget = budget or EditBudget()
    violations = []

    adds = len(patch.get("add", []))
    updates = len(patch.get("update", []))
    removes = len(patch.get("remove", []))
    total = adds + updates + removes

    if adds > budget.max_adds:
        violations.append(f"Too many additions: {adds} (max {budget.max_adds})")
    if updates > budget.max_updates:
        violations.append(f"Too many updates: {updates} (max {budget.max_updates})")
    if removes > budget.max_removes:
        violations.append(f"Too many removals: {removes} (max {budget.max_removes})")
    if total > budget.max_total:
        violations.append(f"Too many total changes: {total} (max {budget.max_total})")

    return violations


def load_session_memory(game_state: GameState) -> str:
    """Load last N edits from history as context string for LLM."""
    if not game_state.edit_history:
        return ""

    recent = game_state.edit_history[-MAX_SESSION_MEMORY:]
    lines = ["RECENT EDITS (most recent last):"]

    for i, edit in enumerate(recent, 1):
        instruction = edit.instruction or edit.edit_type.value
        target = edit.target_id or "unknown"
        changes = edit.changes or {}
        asset = changes.get("asset_name", "")
        x = changes.get("x", "")
        y = changes.get("y", "")

        parts = [f'{i}. "{instruction}"']
        parts.append(f"→ {edit.edit_type.value}")
        if target:
            parts.append(f"target={target}")
        if asset:
            parts.append(f"asset={asset}")
        if x != "" and y != "":
            parts.append(f"at ({x},{y})")

        lines.append("  ".join(parts))

    return "\n".join(lines)


async def decompose_compound(instruction: str) -> List[str]:
    """Use LLM to decompose a compound instruction into atomic edits."""
    try:
        response = await invoke_claude(
            system_prompt=(
                "Decompose this game edit instruction into separate atomic actions. "
                "Return a JSON array of strings, each a single edit instruction. "
                "Example: ['add a tree near rock1', 'move the fairy to center']. "
                "Respond ONLY with the JSON array."
            ),
            user_message=instruction,
        )

        if not response:
            return [instruction]

        import json
        cleaned = response.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.split("```")[1]
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
        if cleaned.endswith("```"):
            cleaned = cleaned[:-3]

        result = json.loads(cleaned.strip())
        if isinstance(result, list) and all(isinstance(s, str) for s in result):
            return result

        return [instruction]

    except Exception as e:
        logger.warning(f"Compound decomposition failed: {e}")
        return [instruction]


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN GUARDRAIL FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


async def run_guardrail(
    instruction: str,
    game_state: GameState,
) -> GuardrailResult:
    """
    Run the full guardrail layer.

    1. Check vagueness → clarify
    2. Check compound → decompose
    3. Classify each sub-instruction
    4. Load session memory
    """
    result = GuardrailResult()

    # ── Vagueness check ─────────────────────────────────────────
    if is_vague(instruction):
        result.needs_clarification = True
        result.clarification_message = (
            "That instruction is a bit vague. Could you be more specific? "
            "For example: 'add a campfire near the mushrooms in scene 1' "
            "or 'move the fairy closer to spawn'."
        )
        return result

    # ── Compound decomposition ──────────────────────────────────
    if is_compound(instruction):
        sub_instructions = await decompose_compound(instruction)
    else:
        sub_instructions = [instruction]

    # ── Classify each sub-instruction ───────────────────────────
    for sub in sub_instructions:
        edit_type = classify_edit_type(sub)
        if edit_type is None:
            # Can't classify deterministically — will rely on LLM in Layer 3
            edit_type = EditType.UPDATE_OBJECT  # safe default
        result.instructions.append(sub)
        result.edit_types.append(edit_type)

    # ── Session memory ──────────────────────────────────────────
    result.session_context = load_session_memory(game_state)

    result.passed = True
    return result
