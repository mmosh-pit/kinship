"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    IN-WORLD INTERACTIVE CHALLENGE SYSTEM                      ║
║                                                                               ║
║  Challenges are PART OF the isometric world, not overlay mini-games.         ║
║  Players interact with game objects, physics, and space to complete them.    ║
║                                                                               ║
║  CHALLENGE TYPES:                                                             ║
║  • PATH_BUILDING  - Create path using draggable objects (logs → bridge)      ║
║  • CONSTRUCTION   - Assemble structures from components                       ║
║  • COLLECTION     - Gather scattered items in world                           ║
║  • NAVIGATION     - Reach destination avoiding obstacles                      ║
║  • SEQUENCE       - Interact with objects in correct order                    ║
║  • PHYSICS        - Use physics (push, pull, drop) to solve                   ║
║  • PATTERN        - Arrange objects to match pattern                          ║
║  • DISCOVERY      - Find hidden items/locations                               ║
║                                                                               ║
║  NOT SUPPORTED (use external if needed):                                      ║
║  ✗ quiz, multiple_choice, text_input, sorting_ui, memory_cards                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Any

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class ChallengeMechanicType(str, Enum):
    """Valid in-world challenge mechanics."""
    
    # Building/Construction
    PATH_BUILDING = "path_building"      # Create path with objects (logs → bridge)
    CONSTRUCTION = "construction"         # Build structure from components
    ARRANGEMENT = "arrangement"           # Arrange objects in pattern
    
    # Movement/Navigation
    NAVIGATION = "navigation"             # Reach destination, avoid obstacles
    MAZE = "maze"                        # Navigate through maze
    PLATFORMING = "platforming"          # Jump between platforms
    
    # Collection/Discovery
    COLLECTION = "collection"             # Gather N items scattered in scene
    SCAVENGER_HUNT = "scavenger_hunt"    # Find specific hidden items
    DISCOVERY = "discovery"               # Reveal hidden areas/objects
    
    # Interaction/Sequence
    SEQUENCE = "sequence"                 # Interact with objects in order
    TIMING = "timing"                    # Interact at right moment
    MULTI_INTERACT = "multi_interact"    # Coordinate multiple interactions
    
    # Physics-based
    PHYSICS_PUSH = "physics_push"        # Push objects to targets
    PHYSICS_DROP = "physics_drop"        # Drop items into containers
    PHYSICS_BALANCE = "physics_balance"  # Balance/stack objects
    
    # Social/NPC
    ESCORT = "escort"                    # Guide NPC to destination
    DIALOGUE_CHOICE = "dialogue_choice"  # Make choices in conversation
    TRADE = "trade"                      # Exchange items with NPC
    
    # Observation
    SPOT_DIFFERENCE = "spot_difference"  # Find changes in scene
    MEMORY_SPATIAL = "memory_spatial"    # Remember object locations
    OBSERVATION = "observation"          # Notice specific details


# Blocked mechanics (for validation)
BLOCKED_MECHANICS = {
    "quiz",
    "multiple_choice",
    "text_input",
    "sorting",
    "memory_cards",
    "trivia",
    "fill_blank",
    "word_puzzle",
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE COMPONENTS
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ChallengeObject:
    """An object involved in a challenge."""
    
    asset_name: str
    role: str  # "moveable", "target", "obstacle", "collectible", "trigger"
    position: dict  # {"x": int, "y": int}
    
    # Interaction properties
    is_draggable: bool = False
    is_pushable: bool = False
    is_collectible: bool = False
    
    # Target/goal properties
    target_position: Optional[dict] = None  # Where it needs to end up
    target_zone_radius: int = 1  # Tiles from target to count as "placed"
    
    # State
    initial_state: str = "default"
    states: list[str] = field(default_factory=lambda: ["default"])
    
    # Physics
    has_physics: bool = False
    mass: float = 1.0
    friction: float = 0.5


@dataclass
class ChallengeZone:
    """A zone in the scene for challenge logic."""
    
    zone_id: str
    zone_type: str  # "start", "goal", "hazard", "checkpoint", "trigger"
    position: dict  # {"x": int, "y": int}
    radius: int = 2  # Tiles
    
    # Trigger behavior
    trigger_on: str = "player_enter"  # "player_enter", "object_enter", "interact"
    trigger_once: bool = True
    
    # Effects
    on_enter_event: Optional[str] = None
    on_exit_event: Optional[str] = None


@dataclass
class SuccessCondition:
    """A condition that must be met to complete challenge."""
    
    condition_type: str
    # Types: "reach_zone", "collect_all", "place_object", "interact_sequence",
    #        "time_limit", "no_damage", "escort_complete"
    
    target: Optional[str] = None  # Zone ID, object name, etc.
    count: Optional[int] = None   # For collection
    order: Optional[list[str]] = None  # For sequences
    time_seconds: Optional[int] = None  # For time limits


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class InWorldChallenge:
    """
    A challenge that exists IN the isometric game world.
    
    Unlike overlay mini-games, these challenges:
    - Use game objects the player can see
    - Involve spatial reasoning and movement
    - Integrate with scene layout and physics
    - Feel like natural gameplay, not interruptions
    """
    
    challenge_id: str
    name: str
    description: str
    
    # Core mechanics
    mechanic_type: ChallengeMechanicType
    difficulty: str = "medium"  # easy, medium, hard
    
    # Scene integration
    scene_id: Optional[str] = None
    trigger_zone: Optional[ChallengeZone] = None
    
    # Objects involved
    objects: list[ChallengeObject] = field(default_factory=list)
    zones: list[ChallengeZone] = field(default_factory=list)
    
    # Success criteria
    success_conditions: list[SuccessCondition] = field(default_factory=list)
    
    # Timing
    time_limit_seconds: Optional[int] = None
    can_retry: bool = True
    
    # Rewards
    on_complete: dict = field(default_factory=dict)
    # {"hearts_delta": {"E": 5}, "unlock_route": "scene_2", "give_item": "key"}
    
    # Guidance
    hints: list[str] = field(default_factory=list)
    show_tutorial: bool = False
    tutorial_steps: list[str] = field(default_factory=list)
    
    # Visual feedback
    highlight_objects: bool = True
    show_goal_indicator: bool = True
    particle_effects: list[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

CHALLENGE_TEMPLATES: dict[ChallengeMechanicType, dict] = {
    
    ChallengeMechanicType.PATH_BUILDING: {
        "description_template": "Create a path across {obstacle} using {objects}",
        "typical_objects": ["log", "plank", "bridge_piece", "stone_slab"],
        "typical_obstacles": ["water", "gap", "ravine", "mud"],
        "success_template": [
            {"condition_type": "place_object", "target": "goal_zone"},
            {"condition_type": "path_complete"},  # Path connects start to goal
        ],
        "tutorial": [
            "Find the {object_name} nearby",
            "Drag it to the highlighted area",
            "Create a path across the {obstacle}",
        ],
        "example": {
            "name": "Cross the Stream",
            "description": "Find logs and place them across the stream to cross",
            "objects": [
                {"asset_name": "log", "role": "moveable", "is_draggable": True, "position": {"x": 5, "y": 8}},
                {"asset_name": "log", "role": "moveable", "is_draggable": True, "position": {"x": 7, "y": 9}},
            ],
            "zones": [
                {"zone_id": "stream_1", "zone_type": "obstacle", "position": {"x": 10, "y": 8}},
                {"zone_id": "bridge_target", "zone_type": "goal", "position": {"x": 10, "y": 8}},
            ],
        },
    },
    
    ChallengeMechanicType.COLLECTION: {
        "description_template": "Collect {count} {item_type} scattered around {area}",
        "typical_objects": ["berry", "flower", "gem", "coin", "feather", "mushroom"],
        "success_template": [
            {"condition_type": "collect_all", "count": "{count}"},
        ],
        "tutorial": [
            "Look for glowing {item_type}s in the area",
            "Walk near them to collect",
            "Collect all {count} to complete",
        ],
        "example": {
            "name": "Gather the Fireflies",
            "description": "Catch 5 fireflies dancing around the meadow",
            "objects": [
                {"asset_name": "firefly", "role": "collectible", "is_collectible": True, "position": {"x": 3, "y": 4}},
                {"asset_name": "firefly", "role": "collectible", "is_collectible": True, "position": {"x": 8, "y": 2}},
                {"asset_name": "firefly", "role": "collectible", "is_collectible": True, "position": {"x": 5, "y": 9}},
                {"asset_name": "firefly", "role": "collectible", "is_collectible": True, "position": {"x": 11, "y": 6}},
                {"asset_name": "firefly", "role": "collectible", "is_collectible": True, "position": {"x": 7, "y": 11}},
            ],
            "success_conditions": [{"condition_type": "collect_all", "count": 5}],
        },
    },
    
    ChallengeMechanicType.NAVIGATION: {
        "description_template": "Navigate through {area} to reach {destination}",
        "typical_obstacles": ["rocks", "water", "thorns", "moving platforms"],
        "success_template": [
            {"condition_type": "reach_zone", "target": "goal_zone"},
        ],
        "tutorial": [
            "Find a safe path through the obstacles",
            "Watch out for {hazard_type}",
            "Reach the glowing destination",
        ],
        "example": {
            "name": "Through the Briar Patch",
            "description": "Navigate through the thorny maze to reach the clearing",
            "zones": [
                {"zone_id": "start", "zone_type": "start", "position": {"x": 2, "y": 2}},
                {"zone_id": "hazard_1", "zone_type": "hazard", "position": {"x": 5, "y": 4}},
                {"zone_id": "hazard_2", "zone_type": "hazard", "position": {"x": 8, "y": 6}},
                {"zone_id": "goal", "zone_type": "goal", "position": {"x": 14, "y": 12}},
            ],
        },
    },
    
    ChallengeMechanicType.SEQUENCE: {
        "description_template": "Interact with {objects} in the correct order",
        "typical_objects": ["lever", "button", "statue", "torch", "bell"],
        "success_template": [
            {"condition_type": "interact_sequence", "order": ["{obj1}", "{obj2}", "{obj3}"]},
        ],
        "tutorial": [
            "Look for clues about the correct order",
            "Interact with objects by tapping them",
            "The order matters!",
        ],
        "example": {
            "name": "The Stone Guardians",
            "description": "Touch the statues in the order shown by the ancient symbols",
            "objects": [
                {"asset_name": "statue_sun", "role": "trigger", "position": {"x": 5, "y": 5}},
                {"asset_name": "statue_moon", "role": "trigger", "position": {"x": 10, "y": 5}},
                {"asset_name": "statue_star", "role": "trigger", "position": {"x": 7, "y": 9}},
            ],
            "success_conditions": [
                {"condition_type": "interact_sequence", "order": ["statue_sun", "statue_moon", "statue_star"]}
            ],
        },
    },
    
    ChallengeMechanicType.PHYSICS_PUSH: {
        "description_template": "Push {object} to {target}",
        "typical_objects": ["boulder", "crate", "barrel", "snowball"],
        "success_template": [
            {"condition_type": "place_object", "target": "goal_zone"},
        ],
        "tutorial": [
            "Walk into the {object} to push it",
            "Guide it toward the target zone",
            "Be careful—you can only push, not pull!",
        ],
        "example": {
            "name": "Boulder Puzzle",
            "description": "Push the boulder onto the pressure plate to open the door",
            "objects": [
                {"asset_name": "boulder", "role": "moveable", "is_pushable": True, "has_physics": True, 
                 "position": {"x": 6, "y": 6}, "target_position": {"x": 10, "y": 10}},
            ],
            "zones": [
                {"zone_id": "pressure_plate", "zone_type": "goal", "position": {"x": 10, "y": 10}, 
                 "trigger_on": "object_enter", "on_enter_event": "open_door"},
            ],
        },
    },
    
    ChallengeMechanicType.ESCORT: {
        "description_template": "Guide {npc} safely to {destination}",
        "typical_npcs": ["lost_child", "wounded_animal", "confused_robot"],
        "success_template": [
            {"condition_type": "escort_complete", "target": "goal_zone"},
        ],
        "tutorial": [
            "{npc} will follow you",
            "Clear obstacles from the path",
            "Lead them safely to the destination",
        ],
        "example": {
            "name": "Lead the Lost Fawn",
            "description": "The baby deer is lost. Guide it back to its mother.",
            "objects": [
                {"asset_name": "fawn", "role": "escort_npc", "position": {"x": 3, "y": 3}},
                {"asset_name": "deer_mother", "role": "goal_npc", "position": {"x": 14, "y": 12}},
            ],
            "zones": [
                {"zone_id": "mother_zone", "zone_type": "goal", "position": {"x": 14, "y": 12}},
            ],
        },
    },
    
    ChallengeMechanicType.CONSTRUCTION: {
        "description_template": "Build {structure} using the available materials",
        "typical_objects": ["wood_piece", "stone_block", "rope", "nail"],
        "success_template": [
            {"condition_type": "construction_complete"},
        ],
        "tutorial": [
            "Gather the building materials",
            "Place them in the highlighted positions",
            "Complete the structure",
        ],
        "example": {
            "name": "Build a Shelter",
            "description": "Gather branches and leaves to build a shelter for the night",
            "objects": [
                {"asset_name": "branch", "role": "material", "is_collectible": True, "position": {"x": 4, "y": 5}},
                {"asset_name": "branch", "role": "material", "is_collectible": True, "position": {"x": 8, "y": 3}},
                {"asset_name": "leaves", "role": "material", "is_collectible": True, "position": {"x": 6, "y": 9}},
            ],
            "zones": [
                {"zone_id": "build_site", "zone_type": "goal", "position": {"x": 10, "y": 10}},
            ],
        },
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  CHALLENGE VALIDATION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ChallengeValidation:
    """Result of challenge validation."""
    is_valid: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)


def validate_challenge(challenge: dict) -> ChallengeValidation:
    """
    Validate a challenge definition.
    
    Ensures:
    - Mechanic type is valid (not blocked)
    - Required fields are present
    - Objects have necessary properties for mechanic
    """
    result = ChallengeValidation(is_valid=True)
    
    mechanic = challenge.get("mechanic_type", "").lower()
    
    # Check for blocked mechanics
    if mechanic in BLOCKED_MECHANICS:
        result.is_valid = False
        result.errors.append(
            f"Mechanic '{mechanic}' is NOT ALLOWED. Use in-world mechanics like: "
            f"{[m.value for m in ChallengeMechanicType][:5]}"
        )
        result.suggestions.append(
            "Convert to in-world challenge: Instead of 'quiz', use 'sequence' with "
            "physical objects. Instead of 'sorting', use 'arrangement' with draggable items."
        )
        return result
    
    # Validate mechanic type
    try:
        ChallengeMechanicType(mechanic)
    except ValueError:
        result.warnings.append(f"Unknown mechanic type: {mechanic}")
    
    # Check required fields
    if not challenge.get("name"):
        result.errors.append("Challenge must have a name")
        result.is_valid = False
    
    if not challenge.get("description"):
        result.warnings.append("Challenge should have a description")
    
    # Validate objects for mechanic type
    objects = challenge.get("objects", [])
    
    if mechanic in ["path_building", "construction", "physics_push"]:
        moveable_count = sum(1 for o in objects if o.get("is_draggable") or o.get("is_pushable"))
        if moveable_count == 0:
            result.errors.append(f"{mechanic} challenge needs at least one moveable object")
            result.is_valid = False
    
    if mechanic == "collection":
        collectible_count = sum(1 for o in objects if o.get("is_collectible"))
        if collectible_count == 0:
            result.errors.append("Collection challenge needs collectible objects")
            result.is_valid = False
    
    # Check success conditions
    conditions = challenge.get("success_conditions", [])
    if not conditions:
        result.warnings.append("Challenge should have at least one success condition")
    
    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  PROMPT GENERATION FOR AI
# ═══════════════════════════════════════════════════════════════════════════════

def generate_challenge_rules_prompt(available_assets: list[dict]) -> str:
    """
    Generate a prompt section explaining challenge rules for AI.
    """
    # Find assets that could be used in challenges
    moveable_assets = []
    collectible_assets = []
    
    for asset in available_assets:
        name = asset.get("name", "")
        tags = asset.get("tags", [])
        all_text = f"{name} {' '.join(tags)}".lower()
        
        # Detect moveable assets
        if any(word in all_text for word in ["log", "plank", "crate", "barrel", "boulder", "stone"]):
            moveable_assets.append(name)
        
        # Detect collectible assets
        if any(word in all_text for word in ["berry", "flower", "gem", "coin", "mushroom", "feather", "seed"]):
            collectible_assets.append(name)
    
    lines = [
        "",
        "═══════════════════════════════════════════════════════════════════════════════",
        "CHALLENGE RULES — IN-WORLD ONLY",
        "═══════════════════════════════════════════════════════════════════════════════",
        "",
        "❌ NEVER USE THESE MECHANICS (overlay mini-games are BLOCKED):",
        "   quiz, multiple_choice, text_input, sorting_ui, memory_cards, trivia",
        "",
        "✅ VALID MECHANICS (challenges exist IN the isometric world):",
        "",
    ]
    
    for mech in ChallengeMechanicType:
        template = CHALLENGE_TEMPLATES.get(mech, {})
        desc = template.get("description_template", mech.value)
        lines.append(f"   • {mech.value}: {desc}")
    
    lines.append("")
    
    if moveable_assets:
        lines.append(f"MOVEABLE ASSETS (for path_building, physics): {', '.join(moveable_assets[:8])}")
    
    if collectible_assets:
        lines.append(f"COLLECTIBLE ASSETS (for collection): {', '.join(collectible_assets[:8])}")
    
    lines.extend([
        "",
        "CHALLENGE STRUCTURE:",
        "```json",
        "{",
        '  "name": "Challenge Name",',
        '  "mechanic_type": "path_building",  // MUST be from valid list',
        '  "description": "What player does physically in the world",',
        '  "objects": [',
        '    {"asset_name": "log", "role": "moveable", "is_draggable": true, "position": {"x": 5, "y": 8}}',
        '  ],',
        '  "zones": [',
        '    {"zone_id": "goal", "zone_type": "goal", "position": {"x": 10, "y": 8}}',
        '  ],',
        '  "success_conditions": [{"condition_type": "place_object", "target": "goal"}],',
        '  "on_complete": {"hearts_delta": {"E": 5}, "score_points": 100}',
        "}",
        "```",
        "═══════════════════════════════════════════════════════════════════════════════",
        "",
    ])
    
    return "\n".join(lines)


def convert_quiz_to_inworld(quiz_challenge: dict) -> InWorldChallenge:
    """
    Convert a blocked quiz-type challenge to an in-world equivalent.
    
    e.g., "Which animal is friendly?" → SEQUENCE challenge where player
    must interact with the correct animal statue.
    """
    name = quiz_challenge.get("name", "Quiz Challenge")
    
    # Extract questions/answers if present
    questions = quiz_challenge.get("questions", [])
    
    # Create sequence challenge
    return InWorldChallenge(
        challenge_id=f"converted_{quiz_challenge.get('id', 'quiz')}",
        name=name,
        description=f"Interact with the objects in the world to demonstrate your knowledge",
        mechanic_type=ChallengeMechanicType.SEQUENCE,
        objects=[
            ChallengeObject(
                asset_name=f"symbol_{i}",
                role="trigger",
                position={"x": 5 + i * 3, "y": 5},
            )
            for i in range(min(len(questions), 4))
        ],
        success_conditions=[
            SuccessCondition(
                condition_type="interact_sequence",
                order=[f"symbol_{i}" for i in range(min(len(questions), 4))],
            )
        ],
        hints=["Look for clues in the environment", "The symbols tell a story"],
        on_complete=quiz_challenge.get("on_complete", {"hearts_delta": {"A": 5}}),
    )
