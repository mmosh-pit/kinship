"""
Edit Pipeline Configuration.

Budget limits, retry settings, scope mappings, and agent ordering.
All tunables in one place — no magic numbers in business logic.
"""

from dataclasses import dataclass, field
from typing import Dict, Set
from app.state.game_state import EditType


# ═══════════════════════════════════════════════════════════════════════════════
#  EDIT BUDGET
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class EditBudget:
    """
    Max mutations allowed per single edit instruction.
    
    With AI-driven semantic selection, these limits are high
    to allow operations like "remove all trees" without blocking.
    The AI determines the appropriate scope of changes.
    """

    max_adds: int = 50
    max_updates: int = 50
    max_removes: int = 100  # Allow "remove all X" operations
    max_total: int = 150


# ═══════════════════════════════════════════════════════════════════════════════
#  RETRY CONFIG
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class RetryConfig:
    """Retry settings for LLM calls."""

    max_intent_retries: int = 1
    intent_timeout_seconds: float = 30.0
    use_deterministic_fallback: bool = True


# ═══════════════════════════════════════════════════════════════════════════════
#  SCOPE DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════


class EditScope:
    SCENE = "scene"
    NPC = "npc"
    MECHANIC = "mechanic"
    ROUTE = "route"
    GLOBAL = "global"


# EditType → which domains are affected
SCOPE_MAP: Dict[str, Set[str]] = {
    # Object edits → scene only
    EditType.ADD_OBJECT: {EditScope.SCENE},
    EditType.REMOVE_OBJECT: {EditScope.SCENE},
    EditType.MOVE_OBJECT: {EditScope.SCENE},
    EditType.UPDATE_OBJECT: {EditScope.SCENE},
    # NPC edits → scene + npc
    EditType.ADD_NPC: {EditScope.SCENE, EditScope.NPC},
    EditType.REMOVE_NPC: {EditScope.SCENE, EditScope.NPC},
    EditType.UPDATE_NPC: {EditScope.NPC},
    EditType.UPDATE_NPC_DIALOGUE: {EditScope.NPC},
    # Challenge edits → scene + mechanic
    EditType.ADD_CHALLENGE: {EditScope.SCENE, EditScope.MECHANIC},
    EditType.REMOVE_CHALLENGE: {EditScope.SCENE, EditScope.MECHANIC},
    EditType.UPDATE_CHALLENGE: {EditScope.MECHANIC},
    # Route edits → route
    EditType.ADD_ROUTE: {EditScope.ROUTE},
    EditType.REMOVE_ROUTE: {EditScope.ROUTE},
    EditType.UPDATE_ROUTE: {EditScope.ROUTE},
    # Scene-level edits → global (affects routes, all validators)
    EditType.ADD_SCENE: {EditScope.GLOBAL},
    EditType.REMOVE_SCENE: {EditScope.GLOBAL},
    EditType.UPDATE_SCENE: {EditScope.SCENE},
    EditType.REORDER_SCENES: {EditScope.GLOBAL},
    # Global edits
    EditType.UPDATE_THEME: {EditScope.GLOBAL},
    EditType.UPDATE_NARRATIVE: {EditScope.GLOBAL},
    EditType.UPDATE_GOAL: {EditScope.GLOBAL},
    # Regeneration requests
    EditType.REGENERATE_ALL: {EditScope.GLOBAL},
    EditType.REGENERATE_SCENE: {EditScope.SCENE, EditScope.NPC, EditScope.MECHANIC},
    EditType.REGENERATE_DIALOGUE: {EditScope.NPC},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CONDITIONAL AGENT ORDERING
# ═══════════════════════════════════════════════════════════════════════════════

# Agents run in this order when their domain is dirty.
# Order matters: mechanics first (challenges depend on them),
# then NPCs, then challenges that may reference NPCs, then dialogue.
AGENT_ORDER = [
    "mechanic_mapping",
    "npc_agent",
    "challenge_agent",
    "dialogue_agent",
    "auto_balancer",
    "scene_builder",
]

# Which dirty flags trigger which agents
AGENT_TRIGGERS = {
    "mechanic_mapping": {"dirty_challenges"},
    "npc_agent": {"dirty_npcs"},
    "challenge_agent": {"dirty_challenges"},
    "dialogue_agent": {"dirty_npcs"},
    "auto_balancer": {"dirty_challenges"},
    "scene_builder": {"dirty_new_scenes"},
}


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATOR MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

# Always run these validators regardless of edit type
ALWAYS_VALIDATORS = {"scene", "engine", "manifest", "softlock"}

# Conditionally run based on scope
SCOPE_VALIDATORS = {
    EditScope.NPC: {"npc", "dialogue"},
    EditScope.MECHANIC: {"challenge", "mechanic"},
    EditScope.ROUTE: {"route"},
    EditScope.GLOBAL: {
        "scene", "engine", "manifest", "softlock", "npc", "dialogue",
        "challenge", "mechanic", "route", "reference", "gameplay",
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SESSION MEMORY
# ═══════════════════════════════════════════════════════════════════════════════

MAX_SESSION_MEMORY = 5  # Last N edits kept for context