"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    NPC TEMPLATES                                              ║
║                                                                               ║
║  Defines NPC roles and their fixed behaviors. AI fills the flavor.           ║
║                                                                               ║
║  ROLES:                                                                       ║
║  • Guide      - Near spawn, explains objective, teaches mechanics            ║
║  • Guardian   - Near exit, blocks until challenge complete                   ║
║  • Quest Giver - Near challenge, assigns tasks                               ║
║  • Merchant   - Trades items                                                  ║
║  • Villager   - Ambient, world-building                                       ║
║  • Trainer    - Teaches new mechanic before player uses it                    ║
║                                                                               ║
║  STRUCTURE (fixed):                                                           ║
║  • Role and placement rules                                                   ║
║  • Behavior type                                                              ║
║  • Required dialogue structure                                                ║
║                                                                               ║
║  FLAVOR (AI fills):                                                           ║
║  • Name, appearance description                                               ║
║  • Dialogue content                                                           ║
║  • Personality traits                                                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS
# ═══════════════════════════════════════════════════════════════════════════════

class NPCRole(str, Enum):
    GUIDE = "guide"
    GUARDIAN = "guardian"
    QUEST_GIVER = "quest_giver"
    MERCHANT = "merchant"
    VILLAGER = "villager"
    TRAINER = "trainer"


class NPCBehavior(str, Enum):
    STATIC = "static"           # Stays in place
    WANDER = "wander"           # Moves randomly in radius
    PATROL = "patrol"           # Follows a path
    FOLLOW = "follow"           # Follows player
    FLEE = "flee"               # Runs from player


class PlacementZone(str, Enum):
    NEAR_SPAWN = "near_spawn"
    NEAR_EXIT = "near_exit"
    NEAR_CHALLENGE = "near_challenge"
    SCENE_CENTER = "scene_center"
    ALONG_PATH = "along_path"
    ANYWHERE = "anywhere"


class DialogueType(str, Enum):
    GREETING = "greeting"           # First interaction
    HINT = "hint"                   # Challenge help
    QUEST_ASSIGN = "quest_assign"   # Assign task
    QUEST_COMPLETE = "quest_complete"  # Task done
    TRADE_OFFER = "trade_offer"     # Merchant dialogue
    TUTORIAL = "tutorial"           # Teaching
    AMBIENT = "ambient"             # Flavor text
    BLOCKING = "blocking"           # Can't pass yet


# ═══════════════════════════════════════════════════════════════════════════════
#  DIALOGUE STRUCTURE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class DialogueNode:
    """A single dialogue node."""
    
    dialogue_type: DialogueType
    required: bool = True
    
    # Content constraints
    min_length: int = 10        # Min characters
    max_length: int = 200       # Max characters
    
    # Structure hints for AI
    structure_hint: str = ""
    example: str = ""


@dataclass
class DialogueStructure:
    """Complete dialogue structure for an NPC role."""
    
    nodes: list[DialogueNode] = field(default_factory=list)
    
    # Whether dialogue tree choices are allowed
    allow_choices: bool = False
    max_choices: int = 3


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC TEMPLATE
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class NPCTemplate:
    """
    Template for an NPC role.
    
    STRUCTURE (fixed):
    - role: What function this NPC serves
    - placement: Where in scene
    - behavior: How they move
    - dialogue_structure: What dialogue is required
    
    FLAVOR (AI fills):
    - name, description
    - dialogue content
    - personality
    """
    
    # Identity
    template_id: str
    role: NPCRole
    
    # Placement (fixed)
    placement_zone: PlacementZone
    placement_offset: dict = field(default_factory=lambda: {"x": 0, "y": 0})
    
    # Behavior (fixed)
    behavior: NPCBehavior = NPCBehavior.STATIC
    wander_radius: int = 0
    patrol_points: int = 0
    
    # Interaction (fixed)
    interaction_required: bool = True
    blocks_progress: bool = False
    
    # Dialogue structure (fixed)
    dialogue_structure: DialogueStructure = field(default_factory=DialogueStructure)
    
    # Hearts facets this role supports
    hearts_facets: list[str] = field(default_factory=list)
    
    # Fill points (what AI provides)
    fill_points: list[str] = field(default_factory=lambda: [
        "name",
        "description",
        "appearance",
        "personality",
        "dialogue_content",
    ])


# ═══════════════════════════════════════════════════════════════════════════════
#  FILLED NPC (Output from AI)
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class FilledNPC:
    """
    An NPC with both structure (from template) and flavor (from AI).
    """
    
    # From template
    template_id: str
    role: NPCRole
    
    # From AI (flavor)
    name: str = ""
    description: str = ""
    appearance: str = ""
    personality: str = ""
    
    # Sprite (matched by system)
    sprite_asset: str = ""
    
    # Position (calculated by system)
    position: dict = field(default_factory=lambda: {"x": 0, "y": 0})
    
    # Dialogue (content from AI, structure from template)
    dialogue: dict = field(default_factory=dict)
    # Format: {"greeting": "...", "hint": "...", etc.}
    
    # Behavior (from template)
    behavior: NPCBehavior = NPCBehavior.STATIC
    movement_config: dict = field(default_factory=dict)
    
    # Hearts reward for interaction
    hearts_reward: dict[str, int] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  NPC TEMPLATES REGISTRY
# ═══════════════════════════════════════════════════════════════════════════════

NPC_TEMPLATES: dict[str, NPCTemplate] = {
    
    # ─── GUIDE ─────────────────────────────────────────────────────────────────
    
    "guide": NPCTemplate(
        template_id="guide",
        role=NPCRole.GUIDE,
        placement_zone=PlacementZone.NEAR_SPAWN,
        placement_offset={"x": 2, "y": 0},
        behavior=NPCBehavior.STATIC,
        interaction_required=False,  # Optional but helpful
        blocks_progress=False,
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.GREETING,
                    required=True,
                    structure_hint="Welcome player, hint at what to do",
                    example="Welcome, traveler! The forest holds many secrets. Look for the glowing berries nearby.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.HINT,
                    required=True,
                    structure_hint="Give specific help for current challenge",
                    example="Try pushing the stones toward the marked area. You can do it!",
                ),
            ],
            allow_choices=False,
        ),
        hearts_facets=["H", "So"],
    ),
    
    # ─── GUARDIAN ──────────────────────────────────────────────────────────────
    
    "guardian": NPCTemplate(
        template_id="guardian",
        role=NPCRole.GUARDIAN,
        placement_zone=PlacementZone.NEAR_EXIT,
        placement_offset={"x": 0, "y": -2},
        behavior=NPCBehavior.STATIC,
        interaction_required=True,
        blocks_progress=True,  # Must complete challenge to pass
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.BLOCKING,
                    required=True,
                    structure_hint="Explain why player can't pass yet",
                    example="The path ahead is dangerous. Prove your worth by completing the challenge first.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.QUEST_COMPLETE,
                    required=True,
                    structure_hint="Congratulate and let them pass",
                    example="You've proven yourself worthy. The path is now open to you.",
                ),
            ],
            allow_choices=False,
        ),
        hearts_facets=["R", "T"],
    ),
    
    # ─── QUEST GIVER ───────────────────────────────────────────────────────────
    
    "quest_giver": NPCTemplate(
        template_id="quest_giver",
        role=NPCRole.QUEST_GIVER,
        placement_zone=PlacementZone.NEAR_CHALLENGE,
        placement_offset={"x": -2, "y": 0},
        behavior=NPCBehavior.STATIC,
        interaction_required=True,
        blocks_progress=False,
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.GREETING,
                    required=True,
                    structure_hint="Introduce self and problem",
                    example="Oh, thank goodness you're here! I need your help with something.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.QUEST_ASSIGN,
                    required=True,
                    structure_hint="Explain the task clearly",
                    example="Could you collect 5 berries for me? They grow near the old oak tree.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.HINT,
                    required=False,
                    structure_hint="Optional help if player asks",
                    example="The berries are small and red. Check the bushes carefully!",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.QUEST_COMPLETE,
                    required=True,
                    structure_hint="Thank player and give reward",
                    example="You found them all! Thank you so much. Please take this as a reward.",
                ),
            ],
            allow_choices=True,
            max_choices=2,
        ),
        hearts_facets=["H", "E", "So"],
    ),
    
    # ─── MERCHANT ──────────────────────────────────────────────────────────────
    
    "merchant": NPCTemplate(
        template_id="merchant",
        role=NPCRole.MERCHANT,
        placement_zone=PlacementZone.SCENE_CENTER,
        behavior=NPCBehavior.STATIC,
        interaction_required=False,
        blocks_progress=False,
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.GREETING,
                    required=True,
                    structure_hint="Merchant greeting, hint at trades",
                    example="Welcome to my shop! I have many useful items for trade.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.TRADE_OFFER,
                    required=True,
                    structure_hint="Explain what they want and offer",
                    example="I'll give you a key if you bring me 3 mushrooms.",
                ),
            ],
            allow_choices=True,
            max_choices=3,
        ),
        hearts_facets=["So", "A"],
    ),
    
    # ─── VILLAGER ──────────────────────────────────────────────────────────────
    
    "villager": NPCTemplate(
        template_id="villager",
        role=NPCRole.VILLAGER,
        placement_zone=PlacementZone.ANYWHERE,
        behavior=NPCBehavior.WANDER,
        wander_radius=3,
        interaction_required=False,
        blocks_progress=False,
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.AMBIENT,
                    required=True,
                    structure_hint="Casual flavor dialogue",
                    example="Lovely weather today, isn't it? Perfect for a walk in the forest.",
                ),
            ],
            allow_choices=False,
        ),
        hearts_facets=["So"],
    ),
    
    # ─── TRAINER ───────────────────────────────────────────────────────────────
    
    "trainer": NPCTemplate(
        template_id="trainer",
        role=NPCRole.TRAINER,
        placement_zone=PlacementZone.NEAR_CHALLENGE,
        placement_offset={"x": -3, "y": -1},
        behavior=NPCBehavior.STATIC,
        interaction_required=True,
        blocks_progress=False,
        dialogue_structure=DialogueStructure(
            nodes=[
                DialogueNode(
                    dialogue_type=DialogueType.GREETING,
                    required=True,
                    structure_hint="Offer to teach",
                    example="Hello there! Would you like to learn how to solve puzzles like this one?",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.TUTORIAL,
                    required=True,
                    min_length=50,
                    max_length=300,
                    structure_hint="Step-by-step instructions for the mechanic",
                    example="First, approach the stone. Then, push it by walking into it. Guide it to the glowing target area.",
                ),
                DialogueNode(
                    dialogue_type=DialogueType.HINT,
                    required=True,
                    structure_hint="Encouragement and reminder",
                    example="Remember: push objects by walking into them. You've got this!",
                ),
            ],
            allow_choices=False,
        ),
        hearts_facets=["H", "T", "A"],
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  TEMPLATE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_npc_template(role: NPCRole) -> Optional[NPCTemplate]:
    """Get NPC template by role."""
    return NPC_TEMPLATES.get(role.value)


def get_all_npc_templates() -> dict[str, NPCTemplate]:
    """Get all NPC templates."""
    return NPC_TEMPLATES


def get_required_dialogue_types(role: NPCRole) -> list[DialogueType]:
    """Get list of required dialogue types for a role."""
    template = get_npc_template(role)
    if not template:
        return []
    
    return [
        node.dialogue_type
        for node in template.dialogue_structure.nodes
        if node.required
    ]


def validate_filled_npc(filled: FilledNPC) -> dict:
    """
    Validate a filled NPC against its template.
    
    Returns:
        {"valid": bool, "errors": [...], "warnings": [...]}
    """
    
    template = NPC_TEMPLATES.get(filled.template_id)
    if not template:
        return {"valid": False, "errors": [f"Unknown template: {filled.template_id}"], "warnings": []}
    
    errors = []
    warnings = []
    
    # Check required fields
    if not filled.name:
        errors.append("NPC must have a name")
    
    if not filled.sprite_asset:
        warnings.append("NPC has no sprite assigned")
    
    # Check required dialogue
    for node in template.dialogue_structure.nodes:
        if node.required:
            dialogue_key = node.dialogue_type.value
            content = filled.dialogue.get(dialogue_key, "")
            
            if not content:
                errors.append(f"Missing required dialogue: {dialogue_key}")
            elif len(content) < node.min_length:
                warnings.append(f"Dialogue '{dialogue_key}' is too short ({len(content)} < {node.min_length})")
            elif len(content) > node.max_length:
                warnings.append(f"Dialogue '{dialogue_key}' is too long ({len(content)} > {node.max_length})")
    
    return {
        "valid": len(errors) == 0,
        "errors": errors,
        "warnings": warnings,
    }


def get_placement_position(
    role: NPCRole,
    scene_layout: dict,
    challenge_position: Optional[dict] = None,
) -> dict:
    """
    Calculate NPC position based on role and scene layout.
    
    Args:
        role: NPC role
        scene_layout: {"width": 16, "height": 16, "spawn": {"x": 8, "y": 14}, "exit": {"x": 8, "y": 2}}
        challenge_position: Position of challenge (if any)
        
    Returns:
        {"x": int, "y": int}
    """
    
    template = get_npc_template(role)
    if not template:
        return {"x": 8, "y": 8}
    
    width = scene_layout.get("width", 16)
    height = scene_layout.get("height", 16)
    spawn = scene_layout.get("spawn", {"x": 8, "y": 14})
    exit_pos = scene_layout.get("exit", {"x": 8, "y": 2})
    
    offset = template.placement_offset
    
    if template.placement_zone == PlacementZone.NEAR_SPAWN:
        return {
            "x": spawn["x"] + offset.get("x", 0),
            "y": spawn["y"] + offset.get("y", 0),
        }
    
    elif template.placement_zone == PlacementZone.NEAR_EXIT:
        return {
            "x": exit_pos["x"] + offset.get("x", 0),
            "y": exit_pos["y"] + offset.get("y", 0),
        }
    
    elif template.placement_zone == PlacementZone.NEAR_CHALLENGE:
        if challenge_position:
            return {
                "x": challenge_position["x"] + offset.get("x", 0),
                "y": challenge_position["y"] + offset.get("y", 0),
            }
        else:
            # Default to center if no challenge
            return {"x": width // 2, "y": height // 2}
    
    elif template.placement_zone == PlacementZone.SCENE_CENTER:
        return {"x": width // 2, "y": height // 2}
    
    elif template.placement_zone == PlacementZone.ALONG_PATH:
        # Middle point between spawn and exit
        return {
            "x": (spawn["x"] + exit_pos["x"]) // 2,
            "y": (spawn["y"] + exit_pos["y"]) // 2,
        }
    
    else:  # ANYWHERE
        # Random position avoiding edges
        import random
        return {
            "x": random.randint(2, width - 3),
            "y": random.randint(2, height - 3),
        }
