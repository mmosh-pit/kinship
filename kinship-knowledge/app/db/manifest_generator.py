"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    KINSHIP MANIFEST GENERATOR                                 ║
║                                                                               ║
║  Generates COMPLETE game manifests from natural language descriptions.       ║
║  Outputs JSON that Flutter can directly consume.                              ║
║                                                                               ║
║  Manifest includes:                                                           ║
║  • Scenes (isometric maps)                                                    ║
║  • NPCs (context-aware with behaviors)                                        ║
║  • Objects (collectibles, interactables)                                      ║
║  • Dialogues (branching with choices)                                         ║
║  • Quests (objectives, rewards)                                               ║
║  • Challenges (mini-games)                                                    ║
║  • Items (inventory)                                                          ║
║  • Routes (scene transitions)                                                 ║
║  • Rules (game logic)                                                         ║
║  • Scoreboard (tracking)                                                      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import json
import uuid
from datetime import datetime


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS
# ═══════════════════════════════════════════════════════════════════════════════


class ChallengeType(str, Enum):
    QUIZ = "quiz"
    SORTING = "sorting"
    MATCHING = "matching"
    MEMORY = "memory"
    SEQUENCE = "sequence"
    PUZZLE = "puzzle"
    MINIGAME = "minigame"
    TIMER = "timer"


class TriggerType(str, Enum):
    ON_ENTER_SCENE = "on_enter_scene"
    ON_EXIT_SCENE = "on_exit_scene"
    ON_INTERACT = "on_interact"
    ON_QUEST_START = "on_quest_start"
    ON_QUEST_COMPLETE = "on_quest_complete"
    ON_ITEM_PICKUP = "on_item_pickup"
    ON_ITEM_USE = "on_item_use"
    ON_HEARTS_CHANGE = "on_hearts_change"
    ON_FLAG_SET = "on_flag_set"
    ON_TIME_CHANGE = "on_time_change"


class EventType(str, Enum):
    CHANGE_HEARTS = "change_hearts"
    GIVE_ITEM = "give_item"
    REMOVE_ITEM = "remove_item"
    START_QUEST = "start_quest"
    COMPLETE_QUEST = "complete_quest"
    COMPLETE_OBJECTIVE = "complete_objective"
    SET_FLAG = "set_flag"
    CHANGE_SCENE = "change_scene"
    START_DIALOGUE = "start_dialogue"
    START_CHALLENGE = "start_challenge"
    PLAY_SOUND = "play_sound"
    SHOW_MESSAGE = "show_message"
    SPAWN_OBJECT = "spawn_object"
    DESPAWN_OBJECT = "despawn_object"
    UPDATE_SCOREBOARD = "update_scoreboard"


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST MODELS
# ═══════════════════════════════════════════════════════════════════════════════


class HeartsEffect(BaseModel):
    """Changes to HEARTS values"""

    H: int = 0  # Helpful
    E: int = 0  # Empathetic
    A: int = 0  # Aware
    R: int = 0  # Resilient
    T: int = 0  # Truthful
    Si: int = 0  # Self-aware (internal)
    So: int = 0  # Social (external)


class Condition(BaseModel):
    """Condition for behaviors, routes, rules"""

    hearts_min: Optional[Dict[str, int]] = None
    hearts_max: Optional[Dict[str, int]] = None
    has_item: Optional[List[str]] = None
    not_has_item: Optional[List[str]] = None
    quest_complete: Optional[List[str]] = None
    quest_active: Optional[List[str]] = None
    quest_not_started: Optional[List[str]] = None
    interaction_done: Optional[List[str]] = None
    interaction_not_done: Optional[List[str]] = None
    flag_true: Optional[List[str]] = None
    flag_false: Optional[List[str]] = None
    flag_equals: Optional[Dict[str, Any]] = None
    visited_scene: Optional[List[str]] = None
    time_of_day: Optional[str] = None
    weather: Optional[str] = None


class GameEvent(BaseModel):
    """Event triggered by rules/interactions"""

    type: EventType
    data: Dict[str, Any] = {}


# ─────────────────────────────────────────────────────────────────────────────
#  SCENES
# ─────────────────────────────────────────────────────────────────────────────


class SceneObject(BaseModel):
    """Object placed in a scene"""

    id: str
    object_id: str  # Reference to objects[]
    position: Dict[str, float]  # {x, y}
    visible: bool = True
    conditions: Optional[Condition] = None


class SceneNPC(BaseModel):
    """NPC placed in a scene"""

    id: str
    npc_id: str  # Reference to npcs[]
    position: Dict[str, float]
    facing: str = "south"


class SceneExit(BaseModel):
    """Exit point to another scene"""

    id: str
    to_scene: str
    position: Dict[str, float]
    spawn_at: Optional[Dict[str, float]] = None
    label: Optional[str] = None


class Scene(BaseModel):
    """Game scene/map"""

    id: str
    name: str
    description: str = ""
    tilemap_url: Optional[str] = None
    background_color: str = "#3a5a40"
    ambient_music: Optional[str] = None
    lighting: str = "day"  # day, evening, night, dawn, dusk
    weather: str = "clear"  # clear, rain, snow, fog
    player_spawn: Dict[str, float] = {"x": 5, "y": 5}
    npcs: List[SceneNPC] = []
    objects: List[SceneObject] = []
    exits: List[SceneExit] = []


# ─────────────────────────────────────────────────────────────────────────────
#  NPCs (Context-Aware)
# ─────────────────────────────────────────────────────────────────────────────


class NPCState(BaseModel):
    """State of NPC at a given moment"""

    emotion: str = "neutral"
    sprite: Optional[str] = None
    animation: str = "idle"
    dialogue_id: Optional[str] = None
    visible: bool = True


class NPCBehavior(BaseModel):
    """Behavior that activates under conditions"""

    id: str
    priority: int = 0  # Higher = checked first
    conditions: Condition
    state: NPCState
    available_interactions: List[str] = []  # IDs of interactions


class NPCInteraction(BaseModel):
    """Interaction player can do with NPC"""

    id: str
    label: str
    icon: str = "chat"
    hearts_preview: Optional[HeartsEffect] = None
    dialogue_id: Optional[str] = None
    events: List[GameEvent] = []
    conditions: Optional[Condition] = None
    one_time: bool = False


class NPC(BaseModel):
    """Non-player character with context-aware behaviors"""

    id: str
    name: str
    description: str = ""
    sprite_url: Optional[str] = None
    default_state: NPCState
    behaviors: List[NPCBehavior] = []
    interactions: List[NPCInteraction] = []


# ─────────────────────────────────────────────────────────────────────────────
#  OBJECTS
# ─────────────────────────────────────────────────────────────────────────────


class ObjectInteraction(BaseModel):
    """How player interacts with object"""

    type: str = "tap"  # tap, long_press, proximity
    label: str
    events: List[GameEvent] = []
    conditions: Optional[Condition] = None
    one_time: bool = False


class GameObject(BaseModel):
    """Interactive object in game"""

    id: str
    name: str
    description: str = ""
    sprite_url: Optional[str] = None
    item_id: Optional[str] = None  # If pickup gives item
    interaction: Optional[ObjectInteraction] = None
    respawns: bool = False
    respawn_time: int = 0  # seconds


# ─────────────────────────────────────────────────────────────────────────────
#  DIALOGUES
# ─────────────────────────────────────────────────────────────────────────────


class DialogueChoice(BaseModel):
    """Player choice in dialogue"""

    text: str
    next_node: str
    hearts: Optional[HeartsEffect] = None
    events: List[GameEvent] = []
    conditions: Optional[Condition] = None


class DialogueNode(BaseModel):
    """Single dialogue node"""

    id: str
    speaker: Optional[str] = None
    emotion: str = "neutral"
    text: str
    choices: List[DialogueChoice] = []
    next_node: Optional[str] = None  # For linear dialogue
    hearts: Optional[HeartsEffect] = None
    events: List[GameEvent] = []


class Dialogue(BaseModel):
    """Complete dialogue tree"""

    id: str
    start_node: str
    nodes: List[DialogueNode]


# ─────────────────────────────────────────────────────────────────────────────
#  QUESTS
# ─────────────────────────────────────────────────────────────────────────────


class QuestObjective(BaseModel):
    """Single objective in quest"""

    id: str
    description: str
    type: str  # talk_to, collect, visit, challenge, interact, custom
    target_id: str
    target_count: int = 1
    optional: bool = False


class Quest(BaseModel):
    """Quest with objectives and rewards"""

    id: str
    name: str
    description: str
    icon: Optional[str] = None
    objectives: List[QuestObjective]
    reward_hearts: Optional[HeartsEffect] = None
    reward_items: List[str] = []
    reward_xp: int = 0
    prerequisites: List[str] = []  # Quest IDs
    auto_start: bool = False
    hidden: bool = False


# ─────────────────────────────────────────────────────────────────────────────
#  CHALLENGES
# ─────────────────────────────────────────────────────────────────────────────


class ChallengeConfig(BaseModel):
    """Configuration for different challenge types"""

    # Quiz
    questions: Optional[List[Dict[str, Any]]] = None
    # Sorting
    items: Optional[List[str]] = None
    correct_order: Optional[List[str]] = None
    # Matching
    pairs: Optional[List[Dict[str, str]]] = None
    # Memory
    cards: Optional[List[str]] = None
    # Sequence
    sequence: Optional[List[str]] = None
    # Puzzle
    pieces: Optional[int] = None
    image_url: Optional[str] = None
    # Timer
    duration: Optional[int] = None
    target: Optional[str] = None
    # Custom
    custom_data: Optional[Dict[str, Any]] = None


class Challenge(BaseModel):
    """Mini-game challenge"""

    id: str
    name: str
    description: str
    type: ChallengeType
    config: ChallengeConfig
    time_limit: int = 0  # 0 = no limit
    max_score: int = 100
    pass_score: int = 70
    reward_hearts: Optional[HeartsEffect] = None
    reward_items: List[str] = []
    reward_xp: int = 0
    retry_allowed: bool = True


# ─────────────────────────────────────────────────────────────────────────────
#  ITEMS
# ─────────────────────────────────────────────────────────────────────────────


class Item(BaseModel):
    """Inventory item"""

    id: str
    name: str
    description: str
    icon_url: Optional[str] = None
    type: str = "item"  # item, key, consumable, quest
    stackable: bool = True
    max_stack: int = 99
    use_effect: Optional[List[GameEvent]] = None


# ─────────────────────────────────────────────────────────────────────────────
#  ROUTES
# ─────────────────────────────────────────────────────────────────────────────


class Route(BaseModel):
    """Route between scenes with conditions"""

    id: str
    from_scene: str
    to_scene: str
    conditions: Optional[Condition] = None
    locked_message: Optional[str] = None
    unlock_events: List[GameEvent] = []


# ─────────────────────────────────────────────────────────────────────────────
#  RULES (Game Logic)
# ─────────────────────────────────────────────────────────────────────────────


class Rule(BaseModel):
    """Game logic rule"""

    id: str
    name: str
    trigger: TriggerType
    trigger_data: Dict[str, Any] = {}  # e.g., {"scene_id": "forest"}
    conditions: Optional[Condition] = None
    events: List[GameEvent]
    one_time: bool = False
    priority: int = 0


# ─────────────────────────────────────────────────────────────────────────────
#  SCOREBOARD
# ─────────────────────────────────────────────────────────────────────────────


class ScoreboardMetric(BaseModel):
    """Single metric tracked on scoreboard"""

    id: str
    name: str
    icon: Optional[str] = None
    initial_value: int = 0
    max_value: Optional[int] = None
    visible: bool = True
    track_type: str = "cumulative"  # cumulative, max, current


class Scoreboard(BaseModel):
    """Game scoreboard configuration"""

    enabled: bool = True
    metrics: List[ScoreboardMetric] = []
    show_hearts: bool = True
    show_time: bool = False
    show_xp: bool = True


# ─────────────────────────────────────────────────────────────────────────────
#  SETTINGS
# ─────────────────────────────────────────────────────────────────────────────


class HeartsSettings(BaseModel):
    """HEARTS system configuration"""

    initial: Dict[str, int] = {
        "H": 50,
        "E": 50,
        "A": 50,
        "R": 50,
        "T": 50,
        "Si": 50,
        "So": 50,
    }
    max_value: int = 100
    min_value: int = 0
    show_labels: bool = True
    facet_names: Dict[str, str] = {
        "H": "Helpful",
        "E": "Empathetic",
        "A": "Aware",
        "R": "Resilient",
        "T": "Truthful",
        "Si": "Self-aware",
        "So": "Social",
    }


class GameSettings(BaseModel):
    """Game configuration"""

    tile_width: int = 64
    tile_height: int = 32
    player_speed: float = 100.0
    hearts: HeartsSettings = HeartsSettings()
    auto_save: bool = True
    save_interval: int = 60  # seconds


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPLETE MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════


class GameManifest(BaseModel):
    """Complete game manifest - everything needed to play"""

    # Metadata
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    description: str = ""
    version: str = "1.0.0"
    theme: str = ""  # e.g., "forest", "underwater", "space"
    created_at: str = Field(default_factory=lambda: datetime.now().isoformat())

    # Settings
    settings: GameSettings = GameSettings()
    start_scene: str = ""

    # Content
    scenes: List[Scene] = []
    npcs: List[NPC] = []
    objects: List[GameObject] = []
    dialogues: List[Dialogue] = []
    quests: List[Quest] = []
    challenges: List[Challenge] = []
    items: List[Item] = []
    routes: List[Route] = []
    rules: List[Rule] = []
    scoreboard: Scoreboard = Scoreboard()

    # Assets (id -> url mapping)
    assets: Dict[str, str] = {}

    def to_json(self) -> str:
        return self.model_dump_json(indent=2)

    def to_dict(self) -> Dict[str, Any]:
        return self.model_dump()


# ═══════════════════════════════════════════════════════════════════════════════
#  AI PROMPTS FOR GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are Kinship Knowledge, an AI that generates complete educational game content for children ages 4-10.

CORE PRINCIPLES:
1. All content promotes Social-Emotional Learning (SEL)
2. Games use the HEARTS framework:
   - H: Helpful (helping others)
   - E: Empathetic (understanding feelings)
   - A: Aware (noticing surroundings)
   - R: Resilient (bouncing back)
   - T: Truthful (being honest)
   - Si: Self-aware (knowing yourself)
   - So: Social (connecting with others)

3. Content is age-appropriate, positive, and educational
4. NPCs should be context-aware - they remember and respond to player actions
5. Choices should have meaningful consequences through HEARTS changes
6. Quests teach SEL skills through gameplay
7. Challenges should be fun mini-games that reinforce learning

OUTPUT FORMAT:
Always output valid JSON that matches the GameManifest schema.
Include ALL required fields.
Use descriptive IDs (e.g., "npc-bunny-mimi" not "npc-1").
"""


def build_game_generation_prompt(
    description: str,
    theme: str,
    available_assets: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Build prompt for complete game generation"""

    asset_context = ""
    if available_assets:
        asset_list = "\n".join(
            [
                f"- {a['name']} (type: {a['type']}, id: {a['id']})"
                for a in available_assets
            ]
        )
        asset_context = f"""
AVAILABLE ASSETS:
Use ONLY these assets in your manifest:
{asset_list}
"""

    return f"""Generate a complete game manifest for the following:

DESCRIPTION: {description}

THEME: {theme}
{asset_context}

REQUIREMENTS:
1. Create 2-4 scenes with meaningful locations
2. Create 3-5 NPCs with context-aware behaviors
3. Each NPC should have:
   - A default state
   - 2-3 behaviors that change based on player actions
   - 2-4 interactions
4. Create 2-3 quests with clear objectives
5. Create 1-2 challenges (mini-games)
6. Create branching dialogues with choices
7. Create items needed for quests
8. Create routes between scenes (some locked by conditions)
9. Create rules for game logic
10. Configure the scoreboard

OUTPUT: Valid JSON matching the GameManifest schema.
"""


def build_npc_generation_prompt(
    npc_description: str, game_context: str, theme: str
) -> str:
    """Build prompt for single NPC generation"""

    return f"""Generate a context-aware NPC for a children's educational game.

NPC DESCRIPTION: {npc_description}

GAME CONTEXT: {game_context}

THEME: {theme}

REQUIREMENTS:
1. Create a friendly, age-appropriate character
2. Define default_state with emotion and animation
3. Create 3-5 behaviors with different priorities:
   - High priority (100): After major events (quest complete)
   - Medium priority (50): Based on items player has
   - Low priority (25): Based on previous interactions
   - Default priority (0): Starting state

4. Each behavior has:
   - conditions: What triggers this state
   - state: emotion, sprite, animation
   - available_interactions: What player can do

5. Create 3-6 interactions:
   - Talk options
   - Help options
   - Gift options (if player has items)

6. Link interactions to dialogues and events

OUTPUT: Valid JSON matching the NPC schema.
"""


def build_challenge_generation_prompt(
    challenge_type: ChallengeType, topic: str, difficulty: str = "easy"
) -> str:
    """Build prompt for challenge generation"""

    type_configs = {
        ChallengeType.QUIZ: "questions with multiple choice answers",
        ChallengeType.SORTING: "items to sort in correct order",
        ChallengeType.MATCHING: "pairs to match together",
        ChallengeType.MEMORY: "cards to find matching pairs",
        ChallengeType.SEQUENCE: "sequence to remember and repeat",
        ChallengeType.PUZZLE: "puzzle pieces to arrange",
    }

    config_type = type_configs.get(challenge_type, "custom challenge configuration")

    return f"""Generate a {challenge_type.value} challenge for children.

TOPIC: {topic}

DIFFICULTY: {difficulty}

CHALLENGE TYPE: {challenge_type.value}
CONFIG NEEDS: {config_type}

REQUIREMENTS:
1. Age-appropriate content (4-10 years)
2. Educational focus on SEL skills
3. Clear instructions
4. Appropriate rewards (HEARTS changes)
5. Fair pass_score for difficulty level

OUTPUT: Valid JSON matching the Challenge schema.
"""


def build_dialogue_generation_prompt(
    context: str, speaker: str, emotion: str, num_nodes: int = 5
) -> str:
    """Build prompt for dialogue generation"""

    return f"""Generate a branching dialogue for a children's game.

CONTEXT: {context}

SPEAKER: {speaker}

STARTING EMOTION: {emotion}

REQUIREMENTS:
1. Create {num_nodes}-{num_nodes + 3} dialogue nodes
2. Include 2-3 player choices at key moments
3. Choices should:
   - Have different HEARTS effects
   - Lead to different outcomes
   - Be age-appropriate
4. Include emotional responses from NPC
5. End with resolution or next steps

OUTPUT: Valid JSON matching the Dialogue schema.
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  EXAMPLE MANIFEST GENERATOR
# ═══════════════════════════════════════════════════════════════════════════════


def generate_example_manifest() -> GameManifest:
    """Generate a complete example manifest"""

    # Items
    acorn = Item(
        id="item-acorn",
        name="Golden Acorn",
        description="A shiny acorn that Mimi lost",
        type="quest",
        stackable=False,
    )

    flower = Item(
        id="item-flower",
        name="Friendship Flower",
        description="A beautiful flower to give as a gift",
        type="item",
    )

    # Objects
    hidden_acorn = GameObject(
        id="obj-hidden-acorn",
        name="Hidden Acorn",
        description="Something shiny under the leaves",
        item_id="item-acorn",
        interaction=ObjectInteraction(
            type="tap",
            label="Pick up",
            events=[
                GameEvent(type=EventType.GIVE_ITEM, data={"item_id": "item-acorn"}),
                GameEvent(
                    type=EventType.COMPLETE_OBJECTIVE,
                    data={
                        "quest_id": "quest-find-acorn",
                        "objective_id": "obj-find-acorn",
                    },
                ),
                GameEvent(
                    type=EventType.SHOW_MESSAGE, data={"text": "You found the acorn!"}
                ),
            ],
            one_time=True,
        ),
    )

    # NPCs
    mimi = NPC(
        id="npc-bunny-mimi",
        name="Mimi",
        description="A small bunny who lost her acorn",
        default_state=NPCState(
            emotion="sad", animation="idle_sad", dialogue_id="dlg-mimi-sad"
        ),
        behaviors=[
            # Highest priority: Quest complete
            NPCBehavior(
                id="beh-mimi-happy",
                priority=100,
                conditions=Condition(quest_complete=["quest-find-acorn"]),
                state=NPCState(
                    emotion="happy",
                    animation="idle_happy",
                    dialogue_id="dlg-mimi-happy",
                ),
                available_interactions=["int-mimi-chat-happy", "int-mimi-play"],
            ),
            # Has acorn
            NPCBehavior(
                id="beh-mimi-hopeful",
                priority=50,
                conditions=Condition(has_item=["item-acorn"]),
                state=NPCState(
                    emotion="hopeful", animation="idle", dialogue_id="dlg-mimi-hopeful"
                ),
                available_interactions=["int-mimi-give-acorn", "int-mimi-chat"],
            ),
            # Quest active
            NPCBehavior(
                id="beh-mimi-waiting",
                priority=25,
                conditions=Condition(quest_active=["quest-find-acorn"]),
                state=NPCState(
                    emotion="hopeful", animation="idle", dialogue_id="dlg-mimi-waiting"
                ),
                available_interactions=["int-mimi-chat", "int-mimi-encourage"],
            ),
        ],
        interactions=[
            NPCInteraction(
                id="int-mimi-ask",
                label="What's wrong?",
                icon="question",
                hearts_preview=HeartsEffect(E=5),
                dialogue_id="dlg-mimi-problem",
                events=[
                    GameEvent(
                        type=EventType.START_QUEST,
                        data={"quest_id": "quest-find-acorn"},
                    )
                ],
            ),
            NPCInteraction(
                id="int-mimi-give-acorn",
                label="Give her the acorn",
                icon="gift",
                hearts_preview=HeartsEffect(H=10, E=5, So=5),
                conditions=Condition(has_item=["item-acorn"]),
                events=[
                    GameEvent(
                        type=EventType.REMOVE_ITEM, data={"item_id": "item-acorn"}
                    ),
                    GameEvent(
                        type=EventType.COMPLETE_QUEST,
                        data={"quest_id": "quest-find-acorn"},
                    ),
                    GameEvent(
                        type=EventType.CHANGE_HEARTS, data={"H": 10, "E": 5, "So": 5}
                    ),
                    GameEvent(
                        type=EventType.START_DIALOGUE,
                        data={"dialogue_id": "dlg-mimi-thank-you"},
                    ),
                ],
            ),
            NPCInteraction(
                id="int-mimi-chat",
                label="Chat",
                icon="chat",
                dialogue_id="dlg-mimi-chat",
            ),
            NPCInteraction(
                id="int-mimi-chat-happy",
                label="Chat",
                icon="chat",
                dialogue_id="dlg-mimi-chat-happy",
            ),
            NPCInteraction(
                id="int-mimi-play",
                label="Play together",
                icon="play",
                hearts_preview=HeartsEffect(So=10),
                events=[
                    GameEvent(type=EventType.CHANGE_HEARTS, data={"So": 10}),
                    GameEvent(
                        type=EventType.START_CHALLENGE,
                        data={"challenge_id": "chal-memory-game"},
                    ),
                ],
                conditions=Condition(quest_complete=["quest-find-acorn"]),
            ),
            NPCInteraction(
                id="int-mimi-encourage",
                label="Encourage her",
                icon="heart",
                hearts_preview=HeartsEffect(E=3),
                dialogue_id="dlg-mimi-encouraged",
            ),
        ],
    )

    felix = NPC(
        id="npc-fox-felix",
        name="Felix",
        description="A shy fox who wants to make friends",
        default_state=NPCState(
            emotion="shy", animation="idle", dialogue_id="dlg-felix-shy"
        ),
        behaviors=[
            NPCBehavior(
                id="beh-felix-friendly",
                priority=50,
                conditions=Condition(flag_true=["helped_mimi"]),
                state=NPCState(
                    emotion="curious", animation="idle", dialogue_id="dlg-felix-curious"
                ),
                available_interactions=["int-felix-chat", "int-felix-invite"],
            ),
        ],
        interactions=[
            NPCInteraction(
                id="int-felix-wave",
                label="Wave hello",
                icon="wave",
                hearts_preview=HeartsEffect(So=3),
                dialogue_id="dlg-felix-wave",
            ),
            NPCInteraction(
                id="int-felix-chat",
                label="Chat",
                icon="chat",
                dialogue_id="dlg-felix-chat",
                conditions=Condition(flag_true=["helped_mimi"]),
            ),
            NPCInteraction(
                id="int-felix-invite",
                label="Invite to play",
                icon="friends",
                hearts_preview=HeartsEffect(So=10, H=5),
                events=[
                    GameEvent(type=EventType.CHANGE_HEARTS, data={"So": 10, "H": 5}),
                    GameEvent(
                        type=EventType.SET_FLAG,
                        data={"key": "felix_is_friend", "value": True},
                    ),
                    GameEvent(
                        type=EventType.START_DIALOGUE,
                        data={"dialogue_id": "dlg-felix-joins"},
                    ),
                ],
                conditions=Condition(
                    flag_true=["helped_mimi"], quest_complete=["quest-find-acorn"]
                ),
            ),
        ],
    )

    # Dialogues
    dlg_mimi_problem = Dialogue(
        id="dlg-mimi-problem",
        start_node="node-1",
        nodes=[
            DialogueNode(
                id="node-1",
                speaker="Mimi",
                emotion="sad",
                text="*sniff* I lost my favorite acorn... It was golden and shiny.",
                next_node="node-2",
            ),
            DialogueNode(
                id="node-2",
                speaker="Mimi",
                emotion="sad",
                text="My grandma gave it to me. I was playing near the old tree and then... it was gone!",
                choices=[
                    DialogueChoice(
                        text="I'll help you find it!",
                        next_node="node-3a",
                        hearts=HeartsEffect(H=5, E=3),
                    ),
                    DialogueChoice(
                        text="Don't worry, it'll turn up",
                        next_node="node-3b",
                        hearts=HeartsEffect(E=2, R=3),
                    ),
                ],
            ),
            DialogueNode(
                id="node-3a",
                speaker="Mimi",
                emotion="hopeful",
                text="Really?! You'd do that for me? Thank you so much! Maybe check around the old tree?",
                hearts=HeartsEffect(E=2),
            ),
            DialogueNode(
                id="node-3b",
                speaker="Mimi",
                emotion="touched",
                text="You're right... I should stay positive. But if you see a golden acorn anywhere...",
                hearts=HeartsEffect(R=2),
            ),
        ],
    )

    dlg_mimi_thank_you = Dialogue(
        id="dlg-mimi-thank-you",
        start_node="node-1",
        nodes=[
            DialogueNode(
                id="node-1",
                speaker="Mimi",
                emotion="overjoyed",
                text="MY ACORN! You found it!! *happy bunny hop*",
                next_node="node-2",
            ),
            DialogueNode(
                id="node-2",
                speaker="Mimi",
                emotion="grateful",
                text="Thank you SO much! You're the kindest person I've ever met!",
                hearts=HeartsEffect(H=5, So=3),
                events=[
                    GameEvent(
                        type=EventType.SET_FLAG,
                        data={"key": "helped_mimi", "value": True},
                    )
                ],
            ),
        ],
    )

    # Quests
    quest_find_acorn = Quest(
        id="quest-find-acorn",
        name="Mimi's Lost Acorn",
        description="Help Mimi find her precious golden acorn",
        objectives=[
            QuestObjective(
                id="obj-find-acorn",
                description="Find the golden acorn",
                type="collect",
                target_id="item-acorn",
            ),
            QuestObjective(
                id="obj-return-acorn",
                description="Return the acorn to Mimi",
                type="interact",
                target_id="npc-bunny-mimi",
            ),
        ],
        reward_hearts=HeartsEffect(H=15, E=10),
        reward_xp=50,
    )

    # Challenges
    memory_challenge = Challenge(
        id="chal-memory-game",
        name="Friendship Memory",
        description="Match the pairs of friends!",
        type=ChallengeType.MEMORY,
        config=ChallengeConfig(
            cards=["bunny", "fox", "owl", "squirrel", "deer", "hedgehog"]
        ),
        time_limit=120,
        max_score=100,
        pass_score=60,
        reward_hearts=HeartsEffect(A=5, Si=5),
        reward_xp=25,
    )

    # Scenes
    meadow = Scene(
        id="scene-meadow",
        name="Sunny Meadow",
        description="A peaceful meadow with flowers",
        background_color="#90be6d",
        lighting="day",
        player_spawn={"x": 5, "y": 5},
        npcs=[
            SceneNPC(
                id="scene-npc-mimi", npc_id="npc-bunny-mimi", position={"x": 8, "y": 6}
            )
        ],
        exits=[
            SceneExit(
                id="exit-to-forest",
                to_scene="scene-forest",
                position={"x": 15, "y": 8},
                label="Forest →",
            )
        ],
    )

    forest = Scene(
        id="scene-forest",
        name="Whispering Forest",
        description="A quiet forest with old trees",
        background_color="#2d6a4f",
        lighting="day",
        player_spawn={"x": 3, "y": 5},
        npcs=[
            SceneNPC(
                id="scene-npc-felix", npc_id="npc-fox-felix", position={"x": 10, "y": 4}
            )
        ],
        objects=[
            SceneObject(
                id="scene-obj-acorn",
                object_id="obj-hidden-acorn",
                position={"x": 12, "y": 8},
                conditions=Condition(
                    quest_active=["quest-find-acorn"],
                    interaction_not_done=["int-pickup-acorn"],
                ),
            )
        ],
        exits=[
            SceneExit(
                id="exit-to-meadow",
                to_scene="scene-meadow",
                position={"x": 0, "y": 5},
                label="← Meadow",
            )
        ],
    )

    # Routes
    route_meadow_forest = Route(
        id="route-meadow-forest", from_scene="scene-meadow", to_scene="scene-forest"
    )

    route_forest_meadow = Route(
        id="route-forest-meadow", from_scene="scene-forest", to_scene="scene-meadow"
    )

    # Rules
    rule_quest_complete_bonus = Rule(
        id="rule-first-quest-bonus",
        name="First Quest Bonus",
        trigger=TriggerType.ON_QUEST_COMPLETE,
        trigger_data={"quest_id": "quest-find-acorn"},
        events=[
            GameEvent(type=EventType.CHANGE_HEARTS, data={"R": 5}),
            GameEvent(
                type=EventType.SHOW_MESSAGE,
                data={"text": "Great job completing your first quest! 🎉"},
            ),
        ],
        one_time=True,
    )

    # Scoreboard
    scoreboard = Scoreboard(
        enabled=True,
        metrics=[
            ScoreboardMetric(
                id="metric-quests",
                name="Quests",
                icon="scroll",
                track_type="cumulative",
            ),
            ScoreboardMetric(
                id="metric-friends",
                name="Friends Made",
                icon="heart",
                track_type="cumulative",
            ),
            ScoreboardMetric(
                id="metric-challenges",
                name="Challenges Won",
                icon="trophy",
                track_type="cumulative",
            ),
        ],
        show_hearts=True,
        show_xp=True,
    )

    # Create manifest
    manifest = GameManifest(
        name="Forest Friends",
        description="Help forest animals and make new friends!",
        theme="forest",
        start_scene="scene-meadow",
        scenes=[meadow, forest],
        npcs=[mimi, felix],
        objects=[hidden_acorn],
        dialogues=[dlg_mimi_problem, dlg_mimi_thank_you],
        quests=[quest_find_acorn],
        challenges=[memory_challenge],
        items=[acorn, flower],
        routes=[route_meadow_forest, route_forest_meadow],
        rules=[rule_quest_complete_bonus],
        scoreboard=scoreboard,
    )

    return manifest