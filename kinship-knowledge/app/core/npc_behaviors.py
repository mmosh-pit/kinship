"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    NPC BEHAVIOR SYSTEM                                        ║
║                                                                               ║
║  Defines behavior states for NPCs to improve immersion.                       ║
║                                                                               ║
║  BEHAVIOR STATES:                                                             ║
║  • idle: Standing still, may play idle animation                              ║
║  • wander: Random movement within area                                        ║
║  • patrol: Follow predefined path                                             ║
║  • guard: Watch area, react to player                                         ║
║  • follow: Follow player or another NPC                                       ║
║  • flee: Run away from threat                                                 ║
║                                                                               ║
║  TRANSITIONS:                                                                 ║
║  • idle → wander (timeout)                                                    ║
║  • wander → idle (tired)                                                      ║
║  • any → guard (player approaches)                                            ║
║  • guard → follow (quest accepted)                                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional, Callable
from enum import Enum


# ═══════════════════════════════════════════════════════════════════════════════
#  BEHAVIOR STATES
# ═══════════════════════════════════════════════════════════════════════════════

class BehaviorState(str, Enum):
    """NPC behavior states."""
    
    IDLE = "idle"               # Standing still
    WANDER = "wander"           # Random movement
    PATROL = "patrol"           # Follow path
    GUARD = "guard"             # Watch area
    FOLLOW = "follow"           # Follow target
    FLEE = "flee"               # Run away
    INTERACT = "interact"       # Interacting with player
    WORK = "work"               # Performing task
    SLEEP = "sleep"             # Inactive/resting
    CONVERSATION = "conversation"  # In dialogue


class TriggerType(str, Enum):
    """Types of state transition triggers."""
    
    TIMEOUT = "timeout"              # Time elapsed
    PLAYER_NEAR = "player_near"      # Player within range
    PLAYER_FAR = "player_far"        # Player left range
    INTERACT = "interact"            # Player interaction
    DAMAGE = "damage"                # NPC took damage
    QUEST_START = "quest_start"      # Quest accepted
    QUEST_COMPLETE = "quest_complete"# Quest completed
    TIME_OF_DAY = "time_of_day"      # Day/night change
    SIGNAL = "signal"                # External signal


# ═══════════════════════════════════════════════════════════════════════════════
#  STATE TRANSITION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class StateTransition:
    """Defines a transition between states."""
    
    from_state: BehaviorState
    to_state: BehaviorState
    trigger: TriggerType
    
    # Conditions
    trigger_value: Optional[float] = None  # e.g., range for PLAYER_NEAR
    probability: float = 1.0               # Chance to transition
    
    # Effects
    play_animation: str = ""
    play_sound: str = ""


# ═══════════════════════════════════════════════════════════════════════════════
#  BEHAVIOR DEFINITION
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class BehaviorDefinition:
    """Complete behavior definition for an NPC."""
    
    behavior_id: str
    initial_state: BehaviorState
    
    # State configurations
    states: dict[BehaviorState, dict] = field(default_factory=dict)
    # e.g., {WANDER: {"speed": 0.5, "radius": 5, "duration": 10}}
    
    # Transitions
    transitions: list[StateTransition] = field(default_factory=list)
    
    # Global settings
    detection_range: float = 4.0
    interaction_range: float = 2.0
    
    # Animation mappings
    animations: dict[BehaviorState, str] = field(default_factory=dict)


# ═══════════════════════════════════════════════════════════════════════════════
#  PREDEFINED BEHAVIORS
# ═══════════════════════════════════════════════════════════════════════════════

BEHAVIORS: dict[str, BehaviorDefinition] = {
    
    # ─── VILLAGER BEHAVIOR ─────────────────────────────────────────────────────
    
    "villager": BehaviorDefinition(
        behavior_id="villager",
        initial_state=BehaviorState.WANDER,
        states={
            BehaviorState.IDLE: {"duration": 5, "face_random": True},
            BehaviorState.WANDER: {"speed": 0.4, "radius": 6, "duration": 15},
            BehaviorState.INTERACT: {"face_player": True},
        },
        transitions=[
            StateTransition(BehaviorState.WANDER, BehaviorState.IDLE, 
                          TriggerType.TIMEOUT, probability=0.3),
            StateTransition(BehaviorState.IDLE, BehaviorState.WANDER, 
                          TriggerType.TIMEOUT),
            StateTransition(BehaviorState.WANDER, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=2.0),
            StateTransition(BehaviorState.IDLE, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=2.0),
            StateTransition(BehaviorState.INTERACT, BehaviorState.IDLE, 
                          TriggerType.PLAYER_FAR, trigger_value=4.0),
        ],
        animations={
            BehaviorState.IDLE: "idle",
            BehaviorState.WANDER: "walk",
            BehaviorState.INTERACT: "talk",
        },
    ),
    
    # ─── GUARD BEHAVIOR ────────────────────────────────────────────────────────
    
    "guard": BehaviorDefinition(
        behavior_id="guard",
        initial_state=BehaviorState.GUARD,
        states={
            BehaviorState.GUARD: {"alert_range": 6, "face_direction": "south"},
            BehaviorState.PATROL: {"speed": 0.5, "path": []},
            BehaviorState.INTERACT: {"face_player": True},
        },
        transitions=[
            StateTransition(BehaviorState.GUARD, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=3.0),
            StateTransition(BehaviorState.INTERACT, BehaviorState.GUARD, 
                          TriggerType.PLAYER_FAR, trigger_value=5.0),
            StateTransition(BehaviorState.GUARD, BehaviorState.PATROL, 
                          TriggerType.TIMEOUT, probability=0.2),
            StateTransition(BehaviorState.PATROL, BehaviorState.GUARD, 
                          TriggerType.TIMEOUT),
        ],
        detection_range=6.0,
        animations={
            BehaviorState.GUARD: "idle_alert",
            BehaviorState.PATROL: "walk_alert",
            BehaviorState.INTERACT: "talk",
        },
    ),
    
    # ─── MERCHANT BEHAVIOR ─────────────────────────────────────────────────────
    
    "merchant": BehaviorDefinition(
        behavior_id="merchant",
        initial_state=BehaviorState.IDLE,
        states={
            BehaviorState.IDLE: {"duration": 0, "behind_counter": True},
            BehaviorState.INTERACT: {"face_player": True, "show_inventory": True},
            BehaviorState.WORK: {"duration": 5, "animation": "organize"},
        },
        transitions=[
            StateTransition(BehaviorState.IDLE, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=2.5),
            StateTransition(BehaviorState.INTERACT, BehaviorState.IDLE, 
                          TriggerType.PLAYER_FAR, trigger_value=4.0),
            StateTransition(BehaviorState.IDLE, BehaviorState.WORK, 
                          TriggerType.TIMEOUT, probability=0.15),
            StateTransition(BehaviorState.WORK, BehaviorState.IDLE, 
                          TriggerType.TIMEOUT),
        ],
        interaction_range=2.5,
        animations={
            BehaviorState.IDLE: "idle",
            BehaviorState.INTERACT: "talk_merchant",
            BehaviorState.WORK: "organize",
        },
    ),
    
    # ─── QUEST GIVER BEHAVIOR ──────────────────────────────────────────────────
    
    "quest_giver": BehaviorDefinition(
        behavior_id="quest_giver",
        initial_state=BehaviorState.IDLE,
        states={
            BehaviorState.IDLE: {"show_quest_marker": True},
            BehaviorState.INTERACT: {"face_player": True},
            BehaviorState.CONVERSATION: {"dialogue_tree": "quest"},
        },
        transitions=[
            StateTransition(BehaviorState.IDLE, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=2.0),
            StateTransition(BehaviorState.INTERACT, BehaviorState.CONVERSATION, 
                          TriggerType.INTERACT),
            StateTransition(BehaviorState.CONVERSATION, BehaviorState.IDLE, 
                          TriggerType.QUEST_START),
            StateTransition(BehaviorState.INTERACT, BehaviorState.IDLE, 
                          TriggerType.PLAYER_FAR, trigger_value=4.0),
        ],
        animations={
            BehaviorState.IDLE: "idle_excited",
            BehaviorState.INTERACT: "wave",
            BehaviorState.CONVERSATION: "talk",
        },
    ),
    
    # ─── TRAINER BEHAVIOR ──────────────────────────────────────────────────────
    
    "trainer": BehaviorDefinition(
        behavior_id="trainer",
        initial_state=BehaviorState.IDLE,
        states={
            BehaviorState.IDLE: {"demonstrate": False},
            BehaviorState.INTERACT: {"face_player": True},
            BehaviorState.WORK: {"demonstrate": True, "duration": 10},
        },
        transitions=[
            StateTransition(BehaviorState.IDLE, BehaviorState.INTERACT, 
                          TriggerType.PLAYER_NEAR, trigger_value=3.0),
            StateTransition(BehaviorState.INTERACT, BehaviorState.WORK, 
                          TriggerType.INTERACT),
            StateTransition(BehaviorState.WORK, BehaviorState.IDLE, 
                          TriggerType.TIMEOUT),
            StateTransition(BehaviorState.INTERACT, BehaviorState.IDLE, 
                          TriggerType.PLAYER_FAR, trigger_value=5.0),
        ],
        animations={
            BehaviorState.IDLE: "idle",
            BehaviorState.INTERACT: "point",
            BehaviorState.WORK: "demonstrate",
        },
    ),
    
    # ─── FOLLOWER BEHAVIOR ─────────────────────────────────────────────────────
    
    "follower": BehaviorDefinition(
        behavior_id="follower",
        initial_state=BehaviorState.FOLLOW,
        states={
            BehaviorState.FOLLOW: {"target": "player", "distance": 2, "speed": 0.6},
            BehaviorState.IDLE: {"wait_for_player": True},
            BehaviorState.FLEE: {"speed": 0.8, "direction": "away_from_threat"},
        },
        transitions=[
            StateTransition(BehaviorState.FOLLOW, BehaviorState.IDLE, 
                          TriggerType.PLAYER_NEAR, trigger_value=1.5),
            StateTransition(BehaviorState.IDLE, BehaviorState.FOLLOW, 
                          TriggerType.PLAYER_FAR, trigger_value=3.0),
            StateTransition(BehaviorState.FOLLOW, BehaviorState.FLEE, 
                          TriggerType.DAMAGE),
            StateTransition(BehaviorState.FLEE, BehaviorState.FOLLOW, 
                          TriggerType.TIMEOUT),
        ],
        animations={
            BehaviorState.FOLLOW: "walk",
            BehaviorState.IDLE: "idle",
            BehaviorState.FLEE: "run",
        },
    ),
    
    # ─── ENEMY BEHAVIOR ────────────────────────────────────────────────────────
    
    "enemy": BehaviorDefinition(
        behavior_id="enemy",
        initial_state=BehaviorState.PATROL,
        states={
            BehaviorState.PATROL: {"speed": 0.4, "path": [], "loop": True},
            BehaviorState.GUARD: {"alert_range": 5},
            BehaviorState.FOLLOW: {"target": "player", "speed": 0.7, "attack_range": 1.5},
        },
        transitions=[
            StateTransition(BehaviorState.PATROL, BehaviorState.FOLLOW, 
                          TriggerType.PLAYER_NEAR, trigger_value=5.0),
            StateTransition(BehaviorState.GUARD, BehaviorState.FOLLOW, 
                          TriggerType.PLAYER_NEAR, trigger_value=5.0),
            StateTransition(BehaviorState.FOLLOW, BehaviorState.PATROL, 
                          TriggerType.PLAYER_FAR, trigger_value=8.0),
        ],
        detection_range=5.0,
        animations={
            BehaviorState.PATROL: "walk_alert",
            BehaviorState.GUARD: "idle_alert",
            BehaviorState.FOLLOW: "run_attack",
        },
    ),
}


# ═══════════════════════════════════════════════════════════════════════════════
#  BEHAVIOR FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def get_behavior(behavior_id: str) -> Optional[BehaviorDefinition]:
    """Get a behavior definition by ID."""
    return BEHAVIORS.get(behavior_id)


def get_all_behaviors() -> dict[str, BehaviorDefinition]:
    """Get all behavior definitions."""
    return BEHAVIORS


def get_behavior_for_role(role: str) -> Optional[BehaviorDefinition]:
    """Get the default behavior for an NPC role."""
    role_mapping = {
        "guide": "villager",
        "guardian": "guard",
        "quest_giver": "quest_giver",
        "merchant": "merchant",
        "villager": "villager",
        "trainer": "trainer",
        "escort_target": "follower",
        "enemy": "enemy",
    }
    behavior_id = role_mapping.get(role)
    return get_behavior(behavior_id) if behavior_id else None


def create_patrol_path(
    waypoints: list[dict],
    loop: bool = True,
) -> dict:
    """
    Create a patrol path from waypoints.
    
    Args:
        waypoints: List of {"x": int, "y": int} positions
        loop: Whether to loop back to start
        
    Returns:
        Patrol configuration
    """
    return {
        "waypoints": waypoints,
        "loop": loop,
        "current_index": 0,
        "direction": 1,  # 1 = forward, -1 = backward
    }


def get_next_waypoint(patrol_config: dict) -> Optional[dict]:
    """Get the next waypoint in a patrol path."""
    waypoints = patrol_config.get("waypoints", [])
    if not waypoints:
        return None
    
    index = patrol_config.get("current_index", 0)
    
    if index >= len(waypoints):
        if patrol_config.get("loop"):
            patrol_config["current_index"] = 0
            return waypoints[0]
        return None
    
    return waypoints[index]


def advance_patrol(patrol_config: dict) -> None:
    """Advance to the next waypoint."""
    waypoints = patrol_config.get("waypoints", [])
    index = patrol_config.get("current_index", 0)
    direction = patrol_config.get("direction", 1)
    
    new_index = index + direction
    
    if new_index >= len(waypoints):
        if patrol_config.get("loop"):
            patrol_config["current_index"] = 0
        else:
            # Reverse direction (ping-pong)
            patrol_config["direction"] = -1
            patrol_config["current_index"] = len(waypoints) - 2
    elif new_index < 0:
        patrol_config["direction"] = 1
        patrol_config["current_index"] = 1
    else:
        patrol_config["current_index"] = new_index
