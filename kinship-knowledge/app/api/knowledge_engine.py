"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                         KINSHIP KNOWLEDGE ENGINE                              ║
║                                                                               ║
║  AI-powered game generation system that creates EVERYTHING:                   ║
║  • Complete game from natural language description                            ║
║  • Context-aware NPCs that respond to game state                              ║
║  • Dynamic dialogues based on player choices                                  ║
║  • Quests, items, scenes, routing                                             ║
║  • Game logic and rules                                                       ║
║                                                                               ║
║  Designer describes → Kinship Knowledge generates → Flutter plays             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel
from enum import Enum
import json


# ═══════════════════════════════════════════════════════════════════════════════
#  CONTEXT SYSTEM - NPCs respond to game state
# ═══════════════════════════════════════════════════════════════════════════════

class GameContext(BaseModel):
    """Current game state that affects NPC behavior"""
    
    # Player state
    hearts: Dict[str, int] = {"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50}
    inventory: List[str] = []
    
    # Progress
    completed_quests: List[str] = []
    active_quests: List[str] = []
    completed_interactions: List[str] = []
    visited_scenes: List[str] = []
    
    # Current state
    current_scene: str = ""
    time_of_day: str = "day"  # day, evening, night
    weather: str = "clear"    # clear, rain, snow
    
    # Flags (custom game state)
    flags: Dict[str, Any] = {}


class ContextCondition(BaseModel):
    """Condition that checks game context"""
    
    # HEARTS conditions
    hearts_min: Optional[Dict[str, int]] = None  # {"E": 30} = Empathy >= 30
    hearts_max: Optional[Dict[str, int]] = None  # {"E": 70} = Empathy <= 70
    
    # Inventory
    has_item: Optional[List[str]] = None
    not_has_item: Optional[List[str]] = None
    
    # Progress
    quest_complete: Optional[List[str]] = None
    quest_active: Optional[List[str]] = None
    quest_not_started: Optional[List[str]] = None
    interaction_done: Optional[List[str]] = None
    interaction_not_done: Optional[List[str]] = None
    visited_scene: Optional[List[str]] = None
    
    # Flags
    flag_true: Optional[List[str]] = None
    flag_false: Optional[List[str]] = None
    flag_equals: Optional[Dict[str, Any]] = None
    
    # Time/Weather
    time_of_day: Optional[str] = None
    weather: Optional[str] = None

    def evaluate(self, ctx: GameContext) -> bool:
        """Check if all conditions are met"""
        
        # HEARTS min
        if self.hearts_min:
            for k, v in self.hearts_min.items():
                if ctx.hearts.get(k, 0) < v:
                    return False
        
        # HEARTS max
        if self.hearts_max:
            for k, v in self.hearts_max.items():
                if ctx.hearts.get(k, 0) > v:
                    return False
        
        # Has items
        if self.has_item:
            for item in self.has_item:
                if item not in ctx.inventory:
                    return False
        
        # Not has items
        if self.not_has_item:
            for item in self.not_has_item:
                if item in ctx.inventory:
                    return False
        
        # Quest complete
        if self.quest_complete:
            for q in self.quest_complete:
                if q not in ctx.completed_quests:
                    return False
        
        # Quest active
        if self.quest_active:
            for q in self.quest_active:
                if q not in ctx.active_quests:
                    return False
        
        # Quest not started
        if self.quest_not_started:
            for q in self.quest_not_started:
                if q in ctx.active_quests or q in ctx.completed_quests:
                    return False
        
        # Interaction done
        if self.interaction_done:
            for i in self.interaction_done:
                if i not in ctx.completed_interactions:
                    return False
        
        # Interaction not done
        if self.interaction_not_done:
            for i in self.interaction_not_done:
                if i in ctx.completed_interactions:
                    return False
        
        # Visited scene
        if self.visited_scene:
            for s in self.visited_scene:
                if s not in ctx.visited_scenes:
                    return False
        
        # Flags
        if self.flag_true:
            for f in self.flag_true:
                if not ctx.flags.get(f):
                    return False
        
        if self.flag_false:
            for f in self.flag_false:
                if ctx.flags.get(f):
                    return False
        
        if self.flag_equals:
            for k, v in self.flag_equals.items():
                if ctx.flags.get(k) != v:
                    return False
        
        # Time/Weather
        if self.time_of_day and ctx.time_of_day != self.time_of_day:
            return False
        
        if self.weather and ctx.weather != self.weather:
            return False
        
        return True


# ═══════════════════════════════════════════════════════════════════════════════
#  CONTEXT-AWARE NPC BEHAVIOR
# ═══════════════════════════════════════════════════════════════════════════════

class NPCState(BaseModel):
    """NPC state that changes based on context"""
    emotion: str = "neutral"
    dialogue_id: Optional[str] = None
    position: Optional[Dict[str, float]] = None
    sprite_id: Optional[str] = None
    visible: bool = True
    interactions: List[str] = []  # Available interaction IDs


class NPCBehavior(BaseModel):
    """Conditional NPC behavior"""
    conditions: ContextCondition
    state: NPCState
    priority: int = 0  # Higher = checked first


class ContextAwareNPC(BaseModel):
    """NPC with context-aware behavior"""
    id: str
    name: str
    description: str
    
    # Default state
    default_state: NPCState
    
    # Conditional behaviors (checked in priority order)
    behaviors: List[NPCBehavior] = []
    
    # All possible interactions
    all_interactions: List[Dict[str, Any]] = []

    def get_current_state(self, ctx: GameContext) -> NPCState:
        """Get NPC state based on current context"""
        
        # Sort by priority (highest first)
        sorted_behaviors = sorted(self.behaviors, key=lambda b: -b.priority)
        
        # Find first matching behavior
        for behavior in sorted_behaviors:
            if behavior.conditions.evaluate(ctx):
                return behavior.state
        
        # Return default
        return self.default_state
    
    def get_available_interactions(self, ctx: GameContext) -> List[Dict[str, Any]]:
        """Get interactions available in current context"""
        state = self.get_current_state(ctx)
        return [i for i in self.all_interactions if i['id'] in state.interactions]


# ═══════════════════════════════════════════════════════════════════════════════
#  GAME LOGIC & ROUTING
# ═══════════════════════════════════════════════════════════════════════════════

class GameEvent(BaseModel):
    """Event triggered by game logic"""
    type: str  # "hearts_change", "give_item", "start_quest", "complete_objective", etc.
    data: Dict[str, Any] = {}


class GameRule(BaseModel):
    """Game logic rule - when condition met, trigger events"""
    id: str
    description: str
    trigger: str  # "on_interaction", "on_scene_enter", "on_item_pickup", etc.
    conditions: ContextCondition
    events: List[GameEvent]
    one_time: bool = False


class SceneRoute(BaseModel):
    """Route between scenes with conditions"""
    from_scene: str
    to_scene: str
    position: Dict[str, float]  # Exit position
    spawn_at: Dict[str, float]  # Spawn position in target scene
    conditions: Optional[ContextCondition] = None  # Conditions to use this route
    locked_message: Optional[str] = None  # Message when conditions not met


# ═══════════════════════════════════════════════════════════════════════════════
#  COMPLETE GAME MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════

class GeneratedManifest(BaseModel):
    """Complete game manifest generated by Kinship Knowledge"""
    
    # Meta
    game_id: str
    name: str
    description: str
    theme: str
    version: str = "1.0.0"
    
    # Settings
    settings: Dict[str, Any] = {
        "tile_width": 64,
        "tile_height": 32,
        "player_speed": 100,
        "initial_hearts": {"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50},
        "max_hearts": 100,
    }
    
    # Content
    scenes: List[Dict[str, Any]] = []
    npcs: List[Dict[str, Any]] = []  # Context-aware NPCs
    objects: List[Dict[str, Any]] = []
    interactions: List[Dict[str, Any]] = []
    dialogues: List[Dict[str, Any]] = []
    quests: List[Dict[str, Any]] = []
    items: List[Dict[str, Any]] = []
    
    # Logic
    rules: List[Dict[str, Any]] = []  # Game logic rules
    routes: List[Dict[str, Any]] = []  # Scene routing
    
    # Assets
    assets: Dict[str, str] = {}
    
    # Start
    start_scene: str = ""
    intro_dialogue: Optional[str] = None


# ═══════════════════════════════════════════════════════════════════════════════
#  KINSHIP KNOWLEDGE PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are Kinship Knowledge, an AI that designs social-emotional learning (SEL) games for children ages 6-12.

Your role is to generate complete, playable game content from natural language descriptions.

HEARTS Framework:
- H (Hope): Optimism, seeing positive possibilities
- E (Empathy): Understanding others' feelings
- A (Aspiration): Goals, dreams, motivation
- R (Resilience): Bouncing back from setbacks
- T (Tenacity): Persistence, not giving up
- Si (Self-insight): Understanding own emotions
- So (Self-other): Healthy relationships

When generating content:
1. Make interactions meaningful - they should teach SEL skills
2. NPCs should feel real with emotions and motivations
3. Dialogues should model healthy communication
4. Quests should involve helping others, not combat
5. Everything should be age-appropriate and positive

Context-aware NPCs:
- NPCs change behavior based on player actions
- NPCs remember what player has done
- NPCs react to player's HEARTS levels
- NPCs have different dialogues based on quest progress

Output valid JSON matching the schema provided."""


def build_game_generation_prompt(description: str, theme: str) -> str:
    """Build prompt to generate complete game"""
    
    return f"""Generate a complete SEL game based on this description:

DESCRIPTION: {description}

THEME: {theme} (use this for visual/narrative style)

Generate a complete game manifest with:

1. SCENES - Each scene needs:
   - id, name, description
   - player_spawn position
   - npc_ids (which NPCs are in this scene)
   - object_ids (which objects are in this scene)
   - exits (routes to other scenes)

2. CONTEXT-AWARE NPCs - Each NPC needs:
   - id, name, description
   - default_state (emotion, sprite, position, available interactions)
   - behaviors (array of conditional behaviors):
     - conditions (when this behavior activates)
     - state (emotion, sprite, position, available interactions)
     - priority (higher = checked first)
   - all_interactions (all possible interactions with this NPC)

3. INTERACTIONS - Each interaction needs:
   - id, label, description, icon
   - hearts_effect (which HEARTS change)
   - dialogue_id OR inline_dialogue
   - requires_item, gives_item (optional)
   - conditions (when available)
   - effects (what happens: flags set, quests started, etc.)

4. DIALOGUES - Branching conversations:
   - id, start node
   - nodes with speaker, text, emotion
   - choices with next_node, hearts_effect
   - conditions on choices

5. QUESTS - Learning objectives:
   - id, name, description
   - objectives with description, type, target
   - reward_hearts
   - conditions to start

6. ITEMS - Collectible items:
   - id, name, description, icon

7. GAME RULES - Logic that triggers events:
   - trigger (on_interaction, on_quest_complete, etc.)
   - conditions
   - events (give_item, change_hearts, set_flag, etc.)

8. ROUTES - Scene connections:
   - from_scene, to_scene
   - positions
   - conditions (e.g., need key item, quest complete)

Return complete JSON manifest."""


def build_npc_generation_prompt(
    npc_description: str, 
    scene_context: str,
    theme: str,
    learning_objectives: List[str]
) -> str:
    """Build prompt to generate context-aware NPC"""
    
    return f"""Generate a context-aware NPC for a children's SEL game.

NPC DESCRIPTION: {npc_description}

SCENE CONTEXT: {scene_context}

THEME: {theme}

LEARNING OBJECTIVES: {', '.join(learning_objectives)}

Generate an NPC with multiple behaviors that change based on:
1. Player's HEARTS levels (e.g., more open if player has high Empathy)
2. Items player has (e.g., different dialogue if player has needed item)
3. Quests completed (e.g., grateful after being helped)
4. Interactions done (e.g., remembers previous conversations)
5. Flags set (e.g., knows player's choices in other situations)

Return JSON:
{{
  "id": "npc-id",
  "name": "Name",
  "description": "Description",
  "default_state": {{
    "emotion": "neutral",
    "sprite_id": "sprite-name",
    "position": {{"x": 5, "y": 5}},
    "interactions": ["int-1", "int-2"]
  }},
  "behaviors": [
    {{
      "priority": 10,
      "conditions": {{
        "quest_complete": ["quest-help-npc"]
      }},
      "state": {{
        "emotion": "happy",
        "sprite_id": "sprite-name-happy",
        "interactions": ["int-thank"]
      }}
    }},
    {{
      "priority": 5,
      "conditions": {{
        "has_item": ["needed-item"]
      }},
      "state": {{
        "emotion": "hopeful",
        "interactions": ["int-1", "int-give"]
      }}
    }}
  ],
  "all_interactions": [
    {{
      "id": "int-1",
      "label": "Talk",
      "icon": "💬",
      "dialogue_id": "dialogue-npc-default"
    }},
    {{
      "id": "int-give",
      "label": "Give item",
      "icon": "🎁",
      "requires_item": "needed-item",
      "hearts_effect": {{"E": 10}},
      "effects": [
        {{"type": "complete_objective", "data": {{"id": "obj-give-item"}}}}
      ]
    }}
  ]
}}"""


def build_dialogue_generation_prompt(
    context: str,
    npc_name: str,
    situation: str,
    learning_focus: str
) -> str:
    """Build prompt to generate dialogue"""
    
    return f"""Generate a dialogue for a children's SEL game.

CONTEXT: {context}
NPC: {npc_name}
SITUATION: {situation}
LEARNING FOCUS: {learning_focus}

Generate branching dialogue with:
1. Natural, age-appropriate language
2. Player choices that affect HEARTS
3. Meaningful consequences for choices
4. Emotional awareness (NPC emotions change)

Include conditional branches based on:
- Player's HEARTS levels
- Items player has
- Previous choices

Return JSON:
{{
  "id": "dialogue-id",
  "start": "start",
  "nodes": [
    {{
      "id": "start",
      "speaker": "{npc_name}",
      "text": "...",
      "emotion": "...",
      "choices": [
        {{
          "text": "Kind response",
          "next": "kind-response",
          "hearts_effect": {{"E": 3}}
        }},
        {{
          "text": "Neutral response",
          "next": "neutral-response"
        }}
      ]
    }}
  ]
}}"""


# ═══════════════════════════════════════════════════════════════════════════════
#  KINSHIP KNOWLEDGE API
# ═══════════════════════════════════════════════════════════════════════════════

from fastapi import APIRouter, HTTPException
import anthropic  # Or your AI provider

router = APIRouter(prefix="/api/knowledge", tags=["kinship-knowledge"])


class GenerateGameRequest(BaseModel):
    description: str
    theme: str
    learning_objectives: List[str] = []


class GenerateNPCRequest(BaseModel):
    npc_description: str
    scene_context: str
    theme: str
    learning_objectives: List[str] = []


class GenerateDialogueRequest(BaseModel):
    context: str
    npc_name: str
    situation: str
    learning_focus: str


async def call_ai(prompt: str, system: str = SYSTEM_PROMPT) -> Dict[str, Any]:
    """
    Call AI to generate content.
    
    Replace with your actual AI provider:
    - Anthropic Claude
    - OpenAI GPT
    - Local LLM
    """
    
    # Example with Anthropic Claude
    # client = anthropic.Anthropic()
    # response = client.messages.create(
    #     model="claude-sonnet-4-20250514",
    #     max_tokens=4096,
    #     system=system,
    #     messages=[{"role": "user", "content": prompt}]
    # )
    # return json.loads(response.content[0].text)
    
    # Placeholder - replace with actual AI call
    return {"generated": True, "prompt_preview": prompt[:200]}


@router.post("/generate/game")
async def generate_complete_game(request: GenerateGameRequest):
    """
    Generate complete game from description.
    
    Designer provides:
    - Description: "A game about helping forest animals"
    - Theme: "tiny_forest"
    
    Kinship Knowledge returns:
    - Complete playable manifest
    - All NPCs with context-aware behaviors
    - All dialogues, quests, items
    - Game logic and routing
    """
    
    prompt = build_game_generation_prompt(request.description, request.theme)
    result = await call_ai(prompt)
    return result


@router.post("/generate/npc")
async def generate_context_aware_npc(request: GenerateNPCRequest):
    """Generate NPC with context-aware behaviors"""
    
    prompt = build_npc_generation_prompt(
        request.npc_description,
        request.scene_context,
        request.theme,
        request.learning_objectives,
    )
    result = await call_ai(prompt)
    return result


@router.post("/generate/dialogue")
async def generate_dialogue(request: GenerateDialogueRequest):
    """Generate branching dialogue"""
    
    prompt = build_dialogue_generation_prompt(
        request.context,
        request.npc_name,
        request.situation,
        request.learning_focus,
    )
    result = await call_ai(prompt)
    return result


@router.post("/generate/quest")
async def generate_quest(
    description: str,
    npc_ids: List[str],
    learning_focus: str,
):
    """Generate quest with objectives"""
    # Build prompt and call AI
    pass


@router.post("/generate/interactions")
async def generate_interactions(
    npc_description: str,
    current_context: Dict[str, Any],
):
    """Generate contextually appropriate interactions"""
    # Build prompt and call AI
    pass


@router.post("/evaluate/context")
async def evaluate_npc_context(
    npc_id: str,
    game_context: GameContext,
    manifest: Dict[str, Any],
):
    """
    Evaluate NPC state based on current game context.
    
    This is called by Flutter to get current NPC behavior.
    """
    
    # Find NPC in manifest
    npc_data = None
    for npc in manifest.get("npcs", []):
        if npc["id"] == npc_id:
            npc_data = npc
            break
    
    if not npc_data:
        raise HTTPException(404, "NPC not found")
    
    # Build context-aware NPC
    npc = ContextAwareNPC(**npc_data)
    
    # Get current state
    current_state = npc.get_current_state(game_context)
    available_interactions = npc.get_available_interactions(game_context)
    
    return {
        "npc_id": npc_id,
        "current_state": current_state.dict(),
        "available_interactions": available_interactions,
    }
