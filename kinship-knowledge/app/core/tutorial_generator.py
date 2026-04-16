"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    TUTORIAL GENERATOR                                         ║
║                                                                               ║
║  Generates tutorial content for mechanics that require introduction.          ║
║                                                                               ║
║  GENERATES:                                                                   ║
║  • Trainer NPC dialogue                                                       ║
║  • Hint text                                                                  ║
║  • Simplified challenge parameters                                            ║
║  • Visual cues                                                                ║
║                                                                               ║
║  TUTORIAL FLOW:                                                               ║
║  1. Trainer NPC explains mechanic                                             ║
║  2. Visual demonstration (optional)                                           ║
║  3. Simplified practice challenge                                             ║
║  4. Positive reinforcement on success                                         ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  TUTORIAL TYPES
# ═══════════════════════════════════════════════════════════════════════════════

class TutorialType(str, Enum):
    """Types of tutorials."""
    
    NPC_DIALOGUE = "npc_dialogue"     # Trainer explains
    VISUAL_DEMO = "visual_demo"       # Show animation
    GUIDED_PRACTICE = "guided_practice"  # Step-by-step
    HINT_ONLY = "hint_only"           # Just show hints
    CONTEXTUAL = "contextual"         # In-game hints


# ═══════════════════════════════════════════════════════════════════════════════
#  TUTORIAL CONTENT
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class TutorialDialogue:
    """Dialogue for tutorial NPC."""
    
    greeting: str
    explanation: str
    encouragement: str
    success_message: str
    
    # Optional hints during challenge
    hints: list[str] = field(default_factory=list)


@dataclass
class TutorialChallenge:
    """Simplified challenge for tutorial."""
    
    mechanic_id: str
    
    # Simplified parameters
    params: dict = field(default_factory=dict)
    
    # Extra time/attempts
    time_multiplier: float = 2.0
    max_attempts: int = 3
    
    # Visual aids
    show_goal_highlight: bool = True
    show_path_hint: bool = True
    show_object_highlight: bool = True
    
    # Reduced difficulty
    hazards_enabled: bool = False
    enemy_count: int = 0


@dataclass
class TutorialDefinition:
    """Complete tutorial definition for a mechanic."""
    
    mechanic_id: str
    tutorial_type: TutorialType
    
    # NPC configuration
    trainer_role: str = "trainer"
    trainer_position: str = "near_spawn"
    
    # Dialogue
    dialogue: Optional[TutorialDialogue] = None
    
    # Challenge
    challenge: Optional[TutorialChallenge] = None
    
    # Visual cues
    highlight_objects: list[str] = field(default_factory=list)
    show_arrows: bool = True
    
    # Timing
    demo_duration_seconds: int = 5
    min_practice_time_seconds: int = 30


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED TUTORIALS
# ═══════════════════════════════════════════════════════════════════════════════

TUTORIALS: dict[str, TutorialDefinition] = {
    
    # ─── PUSH TO TARGET ────────────────────────────────────────────────────────
    
    "push_to_target": TutorialDefinition(
        mechanic_id="push_to_target",
        tutorial_type=TutorialType.GUIDED_PRACTICE,
        dialogue=TutorialDialogue(
            greeting="Hello, young one! I see you're ready to learn.",
            explanation="Some objects can be pushed. Walk into them to push them toward a goal!",
            encouragement="That's it! Keep pushing!",
            success_message="Wonderful! You've mastered pushing objects!",
            hints=[
                "Walk into the stone to push it.",
                "Push it toward the glowing area.",
                "Almost there! One more push!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="push_to_target",
            params={"object_count": 1, "distance": 3, "obstacles": 0},
            show_goal_highlight=True,
            show_path_hint=True,
        ),
        highlight_objects=["moveable", "goal"],
    ),
    
    # ─── SEQUENCE ACTIVATE ─────────────────────────────────────────────────────
    
    "sequence_activate": TutorialDefinition(
        mechanic_id="sequence_activate",
        tutorial_type=TutorialType.VISUAL_DEMO,
        dialogue=TutorialDialogue(
            greeting="Ah, you've found the sequence puzzle!",
            explanation="These switches must be activated in the correct order. Watch the pattern, then repeat it!",
            encouragement="Good memory! Keep going!",
            success_message="Excellent! You've unlocked the path!",
            hints=[
                "Watch the order they light up.",
                "Now repeat the pattern.",
                "Try again - the first one was...",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="sequence_activate",
            params={"sequence_length": 2},  # Start with just 2
            time_multiplier=3.0,  # Extra time
        ),
        demo_duration_seconds=8,
    ),
    
    # ─── AVOID HAZARD ──────────────────────────────────────────────────────────
    
    "avoid_hazard": TutorialDefinition(
        mechanic_id="avoid_hazard",
        tutorial_type=TutorialType.NPC_DIALOGUE,
        dialogue=TutorialDialogue(
            greeting="Careful! There are dangers ahead.",
            explanation="See those spikes? They'll hurt you! Time your movement to pass safely.",
            encouragement="Wait for the right moment...",
            success_message="You made it! Well done!",
            hints=[
                "Watch the pattern.",
                "There's a safe moment - wait for it!",
                "Run when it's safe!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="avoid_hazard",
            params={"hazard_count": 2, "path_width": 3},  # Easier
            time_multiplier=2.0,
        ),
        highlight_objects=["hazard"],
    ),
    
    # ─── STACK CLIMB ───────────────────────────────────────────────────────────
    
    "stack_climb": TutorialDefinition(
        mechanic_id="stack_climb",
        tutorial_type=TutorialType.GUIDED_PRACTICE,
        dialogue=TutorialDialogue(
            greeting="See that ledge up there? You can reach it!",
            explanation="Push these crates together to make a staircase, then climb up!",
            encouragement="That's right! Stack them up!",
            success_message="Amazing climbing skills!",
            hints=[
                "Push the crates next to each other.",
                "Stack them to make steps.",
                "Now climb up!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="stack_climb",
            params={"stack_height": 2},  # Just 2 high
            show_goal_highlight=True,
        ),
    ),
    
    # ─── PRESSURE PLATE ────────────────────────────────────────────────────────
    
    "pressure_plate": TutorialDefinition(
        mechanic_id="pressure_plate",
        tutorial_type=TutorialType.NPC_DIALOGUE,
        dialogue=TutorialDialogue(
            greeting="This door won't open by itself!",
            explanation="Push something heavy onto that plate to keep the door open!",
            encouragement="The plate needs weight on it!",
            success_message="The door is open! Well done!",
            hints=[
                "See the plate on the floor?",
                "Push the stone onto it.",
                "It needs to stay on the plate!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="pressure_plate",
            params={"plate_count": 1},
            show_goal_highlight=True,
            show_object_highlight=True,
        ),
    ),
    
    # ─── BRIDGE GAP ────────────────────────────────────────────────────────────
    
    "bridge_gap": TutorialDefinition(
        mechanic_id="bridge_gap",
        tutorial_type=TutorialType.VISUAL_DEMO,
        dialogue=TutorialDialogue(
            greeting="There's a gap here you can't jump!",
            explanation="Push those planks to create a bridge across the gap!",
            encouragement="Almost there! Line them up!",
            success_message="You built a bridge! Impressive!",
            hints=[
                "Push the planks toward the gap.",
                "They need to span across.",
                "Now you can walk over!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="bridge_gap",
            params={"gap_width": 1, "bridge_pieces": 1},
            show_goal_highlight=True,
        ),
        demo_duration_seconds=6,
    ),
    
    # ─── ESCORT NPC ────────────────────────────────────────────────────────────
    
    "escort_npc": TutorialDefinition(
        mechanic_id="escort_npc",
        tutorial_type=TutorialType.NPC_DIALOGUE,
        dialogue=TutorialDialogue(
            greeting="Please help me reach safety!",
            explanation="I'll follow you. Lead the way, but watch out for dangers - I can't fight!",
            encouragement="Keep going! I'm right behind you!",
            success_message="Thank you for getting me here safely!",
            hints=[
                "I'll follow where you go.",
                "Clear the path before I follow.",
                "Wait for me if you get too far ahead!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="escort_npc",
            params={"distance": 10},
            hazards_enabled=False,  # No hazards in tutorial
        ),
    ),
    
    # ─── ATTACK ENEMY ──────────────────────────────────────────────────────────
    
    "attack_enemy": TutorialDefinition(
        mechanic_id="attack_enemy",
        tutorial_type=TutorialType.GUIDED_PRACTICE,
        dialogue=TutorialDialogue(
            greeting="Time to learn how to defend yourself!",
            explanation="Walk into enemies to attack them. Watch out - they can hurt you too!",
            encouragement="Good hit! Keep it up!",
            success_message="You defeated it! You're a natural!",
            hints=[
                "Walk into the enemy to attack.",
                "Attack from the side if you can.",
                "Don't let it corner you!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="attack_enemy",
            params={"enemy_count": 1, "enemy_health": 1},  # Weak enemy
            time_multiplier=2.0,
        ),
    ),
    
    # ─── DEFEND POSITION ───────────────────────────────────────────────────────
    
    "defend_position": TutorialDefinition(
        mechanic_id="defend_position",
        tutorial_type=TutorialType.NPC_DIALOGUE,
        dialogue=TutorialDialogue(
            greeting="The village needs protection!",
            explanation="Stand near the crystal and defeat any enemies that approach!",
            encouragement="Don't let them reach the crystal!",
            success_message="The village is safe thanks to you!",
            hints=[
                "Stay near the crystal.",
                "Attack enemies before they reach it.",
                "You can move, but stay close!",
            ],
        ),
        challenge=TutorialChallenge(
            mechanic_id="defend_position",
            params={"enemy_count": 2, "wave_count": 1},
            time_multiplier=1.5,
        ),
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  TUTORIAL FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_tutorial(mechanic_id: str) -> Optional[TutorialDefinition]:
    """Get tutorial for a mechanic."""
    return TUTORIALS.get(mechanic_id)


def get_all_tutorials() -> dict[str, TutorialDefinition]:
    """Get all tutorial definitions."""
    return TUTORIALS


def needs_tutorial(mechanic_id: str) -> bool:
    """Check if a mechanic requires a tutorial."""
    from app.core.mechanic_compatibility import MECHANIC_PROGRESSION
    
    prog = MECHANIC_PROGRESSION.get(mechanic_id)
    if prog and prog.requires_tutorial:
        return True
    
    return mechanic_id in TUTORIALS


def generate_tutorial_scene(
    mechanic_id: str,
    scene_width: int = 12,
    scene_height: int = 12,
) -> dict:
    """
    Generate a complete tutorial scene configuration.
    
    Returns:
        Scene configuration dict
    """
    tutorial = get_tutorial(mechanic_id)
    if not tutorial:
        return {}
    
    # Base scene
    scene = {
        "scene_type": "tutorial",
        "mechanic_id": mechanic_id,
        "width": scene_width,
        "height": scene_height,
        "zones": [],
        "npcs": [],
        "challenges": [],
        "dialogue": None,
    }
    
    # Add trainer NPC
    trainer_pos = _get_trainer_position(tutorial.trainer_position, scene_width, scene_height)
    scene["npcs"].append({
        "role": tutorial.trainer_role,
        "x": trainer_pos["x"],
        "y": trainer_pos["y"],
        "behavior": "trainer",
    })
    
    # Add dialogue
    if tutorial.dialogue:
        scene["dialogue"] = {
            "greeting": tutorial.dialogue.greeting,
            "explanation": tutorial.dialogue.explanation,
            "hints": tutorial.dialogue.hints,
            "success": tutorial.dialogue.success_message,
        }
    
    # Add simplified challenge
    if tutorial.challenge:
        scene["challenges"].append({
            "mechanic_id": mechanic_id,
            "params": tutorial.challenge.params,
            "is_tutorial": True,
            "visual_aids": {
                "show_goal": tutorial.challenge.show_goal_highlight,
                "show_path": tutorial.challenge.show_path_hint,
                "show_objects": tutorial.challenge.show_object_highlight,
            },
        })
    
    # Add zones
    scene["zones"].append({
        "type": "spawn",
        "x": scene_width // 2,
        "y": scene_height - 3,
    })
    
    scene["zones"].append({
        "type": "exit",
        "x": scene_width // 2,
        "y": 2,
    })
    
    return scene


def _get_trainer_position(position_hint: str, width: int, height: int) -> dict:
    """Get trainer position based on hint."""
    positions = {
        "near_spawn": {"x": width // 2 - 2, "y": height - 4},
        "center": {"x": width // 2, "y": height // 2},
        "near_challenge": {"x": width // 2, "y": height // 2 - 2},
    }
    return positions.get(position_hint, positions["near_spawn"])


def get_tutorial_hints(mechanic_id: str, hint_index: int = 0) -> str:
    """Get a specific hint for a mechanic."""
    tutorial = get_tutorial(mechanic_id)
    if not tutorial or not tutorial.dialogue:
        return ""
    
    hints = tutorial.dialogue.hints
    if 0 <= hint_index < len(hints):
        return hints[hint_index]
    
    return hints[-1] if hints else ""


def get_simplified_params(mechanic_id: str) -> dict:
    """Get simplified parameters for tutorial mode."""
    tutorial = get_tutorial(mechanic_id)
    if tutorial and tutorial.challenge:
        return tutorial.challenge.params
    
    # Default simplifications
    return {
        "object_count": 1,
        "distance": 3,
        "hazards": 0,
        "time_multiplier": 2.0,
    }
