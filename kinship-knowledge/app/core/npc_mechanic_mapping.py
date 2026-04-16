"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    NPC MECHANIC MAPPING                                       ║
║                                                                               ║
║  Maps game mechanics to appropriate NPC roles.                                ║
║                                                                               ║
║  Without this, NPCs become random flavor text.                                ║
║  With this, NPCs support the mechanics they're near.                          ║
║                                                                               ║
║  EXAMPLE:                                                                     ║
║  • push_to_target → guide (teaches pushing)                                   ║
║  • trade_items → merchant (enables trading)                                   ║
║  • key_unlock → guardian (guards the door)                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional


# ═══════════════════════════════════════════════════════════════════════════════
#  MECHANIC TO NPC ROLE MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

MECHANIC_NPC_ROLES: dict[str, list[str]] = {
    # Puzzle mechanics → guide/trainer
    "push_to_target": ["guide", "trainer"],
    "sequence_activate": ["trainer", "guide"],
    "pressure_plate": ["guide", "trainer"],
    "bridge_gap": ["guide", "trainer"],
    "stack_climb": ["trainer", "guide"],
    # Collection mechanics → villager/quest_giver
    "collect_items": ["villager", "quest_giver"],
    "collect_all": ["quest_giver", "villager"],
    "deliver_item": ["quest_giver", "villager"],
    # Unlock mechanics → guardian
    "key_unlock": ["guardian", "guide"],
    "lever_activate": ["guardian", "guide"],
    # Trade mechanics → merchant
    "trade_items": ["merchant"],
    "buy_item": ["merchant"],
    "sell_item": ["merchant"],
    # Combat mechanics → guardian/trainer
    "attack_enemy": ["guardian", "trainer"],
    "defend_position": ["guardian", "trainer"],
    "defeat_boss": ["guardian", "quest_giver"],
    # Navigation mechanics → guide
    "reach_destination": ["guide", "villager"],
    "avoid_hazard": ["guide", "trainer"],
    "escape": ["guide"],
    # Social mechanics → quest_giver/villager
    "talk_to_npc": ["quest_giver", "villager"],
    "escort_npc": ["quest_giver", "villager"],
    "befriend_npc": ["villager", "quest_giver"],
}


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC ROLE TO MECHANIC MAPPING (reverse)
# ═══════════════════════════════════════════════════════════════════════════════

ROLE_SUPPORTED_MECHANICS: dict[str, list[str]] = {
    "guide": [
        "push_to_target",
        "sequence_activate",
        "pressure_plate",
        "bridge_gap",
        "stack_climb",
        "reach_destination",
        "avoid_hazard",
        "escape",
        "key_unlock",
        "lever_activate",
    ],
    "trainer": [
        "push_to_target",
        "sequence_activate",
        "pressure_plate",
        "bridge_gap",
        "stack_climb",
        "attack_enemy",
        "defend_position",
        "avoid_hazard",
    ],
    "quest_giver": [
        "collect_items",
        "collect_all",
        "deliver_item",
        "talk_to_npc",
        "escort_npc",
        "befriend_npc",
        "defeat_boss",
    ],
    "merchant": [
        "trade_items",
        "buy_item",
        "sell_item",
    ],
    "guardian": [
        "key_unlock",
        "lever_activate",
        "attack_enemy",
        "defend_position",
        "defeat_boss",
    ],
    "villager": [
        "collect_items",
        "deliver_item",
        "talk_to_npc",
        "escort_npc",
        "befriend_npc",
        "reach_destination",
    ],
}


# ═══════════════════════════════════════════════════════════════════════════════
#  SAFE DEFAULTS (Fallback)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_NPC_ROLE = "villager"
DEFAULT_MECHANIC = "collect_items"

SAFE_DEFAULT_NPCS = [
    {"role": "guide", "step": "intro", "scene_preference": 0},
]

SAFE_DEFAULT_MECHANICS = [
    "reach_destination",
    "collect_items",
    "talk_to_npc",
]


# ═══════════════════════════════════════════════════════════════════════════════
#  MAPPING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def get_npc_role_for_mechanic(mechanic_id: str) -> str:
    """
    Get the best NPC role for a mechanic.

    Args:
        mechanic_id: The mechanic identifier

    Returns:
        Best matching NPC role (or default)
    """
    roles = MECHANIC_NPC_ROLES.get(mechanic_id, [])
    return roles[0] if roles else DEFAULT_NPC_ROLE


def get_npc_roles_for_mechanic(mechanic_id: str) -> list[str]:
    """
    Get all suitable NPC roles for a mechanic.

    Args:
        mechanic_id: The mechanic identifier

    Returns:
        List of suitable roles
    """
    return MECHANIC_NPC_ROLES.get(mechanic_id, [DEFAULT_NPC_ROLE])


def get_mechanics_for_role(role: str) -> list[str]:
    """
    Get mechanics that an NPC role can support.

    Args:
        role: NPC role

    Returns:
        List of mechanics
    """
    return ROLE_SUPPORTED_MECHANICS.get(role, [DEFAULT_MECHANIC])


def can_role_support_mechanic(role: str, mechanic_id: str) -> bool:
    """
    Check if an NPC role can support a specific mechanic.
    """
    supported = ROLE_SUPPORTED_MECHANICS.get(role, [])
    return mechanic_id in supported


def get_best_role_for_mechanics(mechanics: list[str]) -> str:
    """
    Find the best NPC role that supports multiple mechanics.

    Useful when placing an NPC near multiple challenges.
    """
    role_scores: dict[str, int] = {}

    for mechanic in mechanics:
        roles = MECHANIC_NPC_ROLES.get(mechanic, [])
        for i, role in enumerate(roles):
            # Higher score for primary role
            score = len(roles) - i
            role_scores[role] = role_scores.get(role, 0) + score

    if not role_scores:
        return DEFAULT_NPC_ROLE

    return max(role_scores.keys(), key=lambda r: role_scores[r])


def get_required_npcs_for_mechanics(mechanics: list[str]) -> list[dict]:
    """
    Determine required NPCs based on mechanics used.

    Args:
        mechanics: List of mechanics in the game

    Returns:
        List of required NPC definitions
    """
    required = []
    roles_used = set()

    for mechanic in mechanics:
        role = get_npc_role_for_mechanic(mechanic)

        if role not in roles_used:
            roles_used.add(role)
            required.append(
                {
                    "role": role,
                    "mechanic": mechanic,
                    "reason": f"Supports {mechanic}",
                }
            )

    # Always include a guide for intro
    if "guide" not in roles_used:
        required.insert(
            0,
            {
                "role": "guide",
                "mechanic": None,
                "reason": "Introduction",
                "scene_preference": 0,
            },
        )

    return required


# ═══════════════════════════════════════════════════════════════════════════════
#  DIALOGUE HOOKS BY ROLE/MECHANIC
# ═══════════════════════════════════════════════════════════════════════════════

ROLE_DIALOGUE_HOOKS: dict[str, list[str]] = {
    "guide": ["greeting", "hint", "tutorial_intro", "farewell"],
    "trainer": [
        "greeting",
        "tutorial_intro",
        "tutorial_encourage",
        "tutorial_complete",
        "farewell",
    ],
    "quest_giver": [
        "greeting",
        "quest_intro",
        "quest_accept",
        "quest_complete",
        "farewell",
    ],
    "merchant": ["greeting", "trade_offer", "trade_success", "farewell"],
    "guardian": ["greeting", "grant_passage", "deny_passage", "farewell"],
    "villager": ["greeting", "hint", "farewell"],
}

MECHANIC_DIALOGUE_HINTS: dict[str, str] = {
    "push_to_target": "Push objects to their destination",
    "collect_items": "Gather all the items",
    "key_unlock": "Find the key to proceed",
    "sequence_activate": "Activate in the right order",
    "pressure_plate": "Something needs to stay on the plate",
    "avoid_hazard": "Watch out for dangers",
    "trade_items": "Make a fair exchange",
    "attack_enemy": "Defeat the threat",
    "defend_position": "Protect this location",
    "escort_npc": "Keep them safe",
}


def get_dialogue_hooks_for_npc(role: str, mechanic: str = None) -> dict[str, bool]:
    """
    Get dialogue hooks needed for an NPC.

    Args:
        role: NPC role
        mechanic: Optional mechanic the NPC supports

    Returns:
        Dict of hook_type: enabled
    """
    base_hooks = ROLE_DIALOGUE_HOOKS.get(role, ["greeting", "farewell"])

    hooks = {hook: True for hook in base_hooks}

    # Add mechanic-specific hint
    if mechanic and mechanic in MECHANIC_DIALOGUE_HINTS:
        hooks["mechanic_hint"] = True

    return hooks


def get_mechanic_hint(mechanic_id: str) -> str:
    """Get hint text for a mechanic."""
    return MECHANIC_DIALOGUE_HINTS.get(mechanic_id, "Complete the challenge")
