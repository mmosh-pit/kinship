"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PLANNER AGENT                                              ║
║                                                                               ║
║  AI-powered game loop planning based on GameConcept.                          ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  1. Take GameConcept from Prompt Interpreter                                  ║
║  2. Generate custom gameplay loops (not just template selection)              ║
║  3. Plan scene-by-scene progression                                           ║
║  4. Assign mechanics to each scene/challenge                                  ║
║  5. Create narrative arc across scenes                                        ║
║  6. Validate plan feasibility with available assets                           ║
║                                                                               ║
║  INPUT:  GameConcept (from Prompt Interpreter)                                ║
║                                                                               ║
║  OUTPUT: GamePlan with:                                                       ║
║          - scenes: [{goals, mechanics, npcs, challenges}]                     ║
║          - narrative_arc: intro → rising → climax → resolution                ║
║          - mechanic_sequence: ordered mechanics per scene                     ║
║          - npc_placements: which NPCs go where                                ║
║          - difficulty_curve: progression across scenes                        ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import json
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from app.services.claude_client import invoke_claude
from app.agents.prompt_interpreter import GameConcept
from app.core.gameplay_loop_planner import GoalType


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PlannedChallenge:
    """A challenge planned for a scene."""

    challenge_id: str
    mechanic_id: str
    name: str
    description: str
    difficulty: str = "medium"  # easy, medium, hard
    is_required: bool = True
    unlock_condition: Optional[str] = None  # What must be done first
    unlocks: List[str] = field(default_factory=list)  # What this unlocks
    rewards: Dict[str, Any] = field(default_factory=dict)
    hints: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "challenge_id": self.challenge_id,
            "mechanic_id": self.mechanic_id,
            "name": self.name,
            "description": self.description,
            "difficulty": self.difficulty,
            "is_required": self.is_required,
            "unlock_condition": self.unlock_condition,
            "unlocks": self.unlocks,
            "rewards": self.rewards,
            "hints": self.hints,
        }


@dataclass
class PlannedNPC:
    """An NPC planned for a scene."""

    npc_id: str
    role: str
    name: str
    description: str
    personality: str
    dialogue_style: str
    initial_greeting: str
    mechanics_involved: List[str] = field(default_factory=list)
    gives_quest: bool = False
    quest_description: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "npc_id": self.npc_id,
            "role": self.role,
            "name": self.name,
            "description": self.description,
            "personality": self.personality,
            "dialogue_style": self.dialogue_style,
            "initial_greeting": self.initial_greeting,
            "mechanics_involved": self.mechanics_involved,
            "gives_quest": self.gives_quest,
            "quest_description": self.quest_description,
        }


@dataclass
class PlannedScene:
    """A scene planned for the game."""

    scene_index: int
    scene_name: str
    zone_type: str
    narrative_purpose: str  # introduction, rising_action, climax, resolution

    # Story
    scene_description: str = ""
    entry_narrative: str = ""
    completion_narrative: str = ""

    # Gameplay
    primary_goal: str = ""
    mechanics: List[str] = field(default_factory=list)
    challenges: List[PlannedChallenge] = field(default_factory=list)
    npcs: List[PlannedNPC] = field(default_factory=list)

    # Progression
    difficulty: str = "medium"
    estimated_duration_minutes: int = 5
    exit_conditions: List[str] = field(default_factory=list)
    leads_to: Optional[str] = None  # Next scene name

    # Assets
    required_collectibles: List[str] = field(default_factory=list)
    required_objects: List[str] = field(default_factory=list)
    atmosphere: str = "peaceful"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "scene_index": self.scene_index,
            "scene_name": self.scene_name,
            "zone_type": self.zone_type,
            "narrative_purpose": self.narrative_purpose,
            "scene_description": self.scene_description,
            "entry_narrative": self.entry_narrative,
            "completion_narrative": self.completion_narrative,
            "primary_goal": self.primary_goal,
            "mechanics": self.mechanics,
            "challenges": [c.to_dict() for c in self.challenges],
            "npcs": [n.to_dict() for n in self.npcs],
            "difficulty": self.difficulty,
            "estimated_duration_minutes": self.estimated_duration_minutes,
            "exit_conditions": self.exit_conditions,
            "leads_to": self.leads_to,
            "required_collectibles": self.required_collectibles,
            "required_objects": self.required_objects,
            "atmosphere": self.atmosphere,
        }


@dataclass
class GamePlan:
    """
    Complete game plan generated by the Planner Agent.

    This is the blueprint for the entire game, scene by scene.
    """

    # Identity
    game_title: str = ""
    game_theme: str = ""

    # Overall narrative
    opening_narrative: str = ""
    closing_narrative: str = ""

    # Goal
    overall_goal: GoalType = GoalType.EXPLORE
    goal_description: str = ""

    # Scenes
    scenes: List[PlannedScene] = field(default_factory=list)

    # Global NPCs (appear across scenes)
    recurring_npcs: List[PlannedNPC] = field(default_factory=list)

    # Progression
    difficulty_curve: List[str] = field(
        default_factory=list
    )  # ["easy", "medium", "hard"]
    mechanic_introduction_order: List[str] = field(default_factory=list)

    # Routes between scenes
    scene_routes: List[Dict[str, Any]] = field(default_factory=list)

    # Validation
    is_valid: bool = True
    validation_issues: List[str] = field(default_factory=list)

    # Source
    concept: Optional[GameConcept] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "game_title": self.game_title,
            "game_theme": self.game_theme,
            "opening_narrative": self.opening_narrative,
            "closing_narrative": self.closing_narrative,
            "overall_goal": (
                self.overall_goal.value
                if isinstance(self.overall_goal, GoalType)
                else self.overall_goal
            ),
            "goal_description": self.goal_description,
            "scenes": [s.to_dict() for s in self.scenes],
            "recurring_npcs": [n.to_dict() for n in self.recurring_npcs],
            "difficulty_curve": self.difficulty_curve,
            "mechanic_introduction_order": self.mechanic_introduction_order,
            "scene_routes": self.scene_routes,
            "is_valid": self.is_valid,
            "validation_issues": self.validation_issues,
        }


@dataclass
class PlannerResult:
    """Result of planning."""

    success: bool
    plan: Optional[GamePlan] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    duration_ms: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
#  PLANNER PROMPT
# ═══════════════════════════════════════════════════════════════════════════════


PLANNER_PROMPT = """You are a game designer creating a detailed game plan.

GAME CONCEPT:
Title: {title}
Theme: {theme}
Tone: {tone}

Goal Type: {goal_type}
Goal Description: {goal_description}
Win Condition: {win_condition}

Story Hook: {story_hook}
Story Context: {story_context}
Resolution: {resolution}

Characters Identified: {characters}
Locations Identified: {locations}
Collectibles: {collectibles}
Key Objects: {key_objects}
Obstacles: {obstacles}

Suggested Mechanics: {mechanics}

Target Audience: {audience}
Difficulty Preference: {difficulty}
Number of Scenes: {num_scenes}

AVAILABLE MECHANICS (use these IDs):
{available_mechanics}

Create a complete game plan with {num_scenes} scenes. Each scene should have a clear purpose in the narrative arc.

Respond with a JSON object:
{{
    "game_title": "Final polished title",
    "game_theme": "theme",
    
    "opening_narrative": "Story intro shown at game start",
    "closing_narrative": "Story outro shown on completion",
    
    "difficulty_curve": ["easy", "medium", ...],
    "mechanic_introduction_order": ["first_mechanic", "second_mechanic", ...],
    
    "scenes": [
        {{
            "scene_index": 0,
            "scene_name": "Unique scene name",
            "zone_type": "forest|cave|village|castle|beach|mountain",
            "narrative_purpose": "introduction|rising_action|climax|resolution",
            
            "scene_description": "What this scene looks like",
            "entry_narrative": "Text shown when entering",
            "completion_narrative": "Text shown when completing",
            
            "primary_goal": "What player must do in this scene",
            "mechanics": ["mechanic_id1", "mechanic_id2"],
            
            "challenges": [
                {{
                    "challenge_id": "unique_id",
                    "mechanic_id": "mechanic from list",
                    "name": "Challenge name",
                    "description": "What player does",
                    "difficulty": "easy|medium|hard",
                    "is_required": true,
                    "unlock_condition": null or "challenge_id that must be done first",
                    "unlocks": ["what this enables"],
                    "rewards": {{"score": 100, "hearts": {{"H": 5}}}},
                    "hints": ["Hint 1", "Hint 2"]
                }}
            ],
            
            "npcs": [
                {{
                    "npc_id": "unique_id",
                    "role": "guide|quest_giver|merchant|helper|guardian|villager",
                    "name": "NPC Name",
                    "description": "Physical description",
                    "personality": "Brief personality",
                    "dialogue_style": "How they speak",
                    "initial_greeting": "First thing they say",
                    "mechanics_involved": ["talk_to_npc", "deliver_item"],
                    "gives_quest": true/false,
                    "quest_description": "What quest they give or null"
                }}
            ],
            
            "difficulty": "easy|medium|hard",
            "estimated_duration_minutes": 3-10,
            "exit_conditions": ["condition to leave scene"],
            "leads_to": "next_scene_name or null for final",
            
            "required_collectibles": ["item names to place"],
            "required_objects": ["objects needed"],
            "atmosphere": "peaceful|mysterious|dangerous|magical"
        }}
    ],
    
    "scene_routes": [
        {{
            "from_scene": "scene_name",
            "to_scene": "scene_name",
            "condition": "What unlocks this route",
            "direction": "north|south|east|west"
        }}
    ]
}}

IMPORTANT RULES:
1. Each scene must have at least one challenge
2. Introduce mechanics gradually (don't overwhelm scene 1)
3. NPCs should support the mechanics (guide for tutorials, quest_giver for fetch quests)
4. Difficulty should progress: easy → medium → hard
5. Final scene should feel climactic
6. All challenges should connect to the story
7. Use the characters and locations from the concept when possible

Respond ONLY with the JSON object.
"""


AVAILABLE_MECHANICS_TEXT = """
- collect_items: Player collects specific items (params: item_type, count)
- collect_all: Player collects all items of a type in scene
- reach_destination: Player reaches a marked location
- talk_to_npc: Player talks to an NPC for information/quest
- deliver_item: Player delivers an item to NPC/location
- push_to_target: Player pushes objects to marked targets
- avoid_hazard: Player navigates around dangerous areas
- unlock_door: Player uses key to open door/gate
- solve_puzzle: Player solves a puzzle (sequence, pattern, etc.)
- trade_items: Player trades items with merchant NPC
- befriend_npc: Player builds relationship through actions
- defend_position: Player protects an area/object
- follow_path: Player follows a specific route
- escort_npc: Player guides an NPC to safety
- timed_challenge: Player completes objective within time limit
"""


# ═══════════════════════════════════════════════════════════════════════════════
#  PLANNER AGENT
# ═══════════════════════════════════════════════════════════════════════════════


class PlannerAgent:
    """
    AI-powered game planner.

    Takes a GameConcept and generates a detailed GamePlan with
    scene-by-scene progression, challenges, and NPCs.
    """

    def __init__(self):
        self._logger = logging.getLogger("planner_agent")

    async def plan(
        self,
        concept: GameConcept,
        available_assets: Optional[List[Dict]] = None,
    ) -> PlannerResult:
        """
        Generate a game plan from a concept.

        Args:
            concept: GameConcept from Prompt Interpreter
            available_assets: Assets available for the game

        Returns:
            PlannerResult with GamePlan
        """
        import time

        start_time = time.time()

        result = PlannerResult(success=False)

        try:
            self._logger.info(f"Planning game: {concept.title}")

            # Call Claude for planning
            plan = await self._call_claude(concept)

            if plan:
                # Attach source concept
                plan.concept = concept

                # Validate the plan
                self._validate_plan(plan, result)

                result.success = True
                result.plan = plan

                self._logger.info(
                    f"Planning complete: {len(plan.scenes)} scenes, "
                    f"valid={plan.is_valid}"
                )
            else:
                result.errors.append("Failed to generate plan from Claude")

        except Exception as e:
            self._logger.error(f"Planning failed: {e}")
            result.errors.append(str(e))

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def _call_claude(self, concept: GameConcept) -> Optional[GamePlan]:
        """Call Claude to generate the game plan."""

        # Format characters for prompt
        characters_str = (
            ", ".join([f"{c.name or c.role} ({c.role})" for c in concept.characters])
            if concept.characters
            else "None specified"
        )

        # Format locations for prompt
        locations_str = (
            ", ".join([f"{loc.name} ({loc.zone_type})" for loc in concept.locations])
            if concept.locations
            else "Generic locations"
        )

        formatted_prompt = PLANNER_PROMPT.format(
            title=concept.title,
            theme=concept.theme,
            tone=concept.tone,
            goal_type=(
                concept.goal_type.value
                if isinstance(concept.goal_type, GoalType)
                else concept.goal_type
            ),
            goal_description=concept.goal_description,
            win_condition=concept.win_condition,
            story_hook=concept.story_hook,
            story_context=concept.story_context,
            resolution=concept.resolution,
            characters=characters_str,
            locations=locations_str,
            collectibles=(
                ", ".join(concept.collectibles) if concept.collectibles else "None"
            ),
            key_objects=(
                ", ".join(concept.key_objects) if concept.key_objects else "None"
            ),
            obstacles=", ".join(concept.obstacles) if concept.obstacles else "None",
            mechanics=(
                ", ".join(concept.suggested_mechanics)
                if concept.suggested_mechanics
                else "collect_items, talk_to_npc"
            ),
            audience=concept.target_audience,
            difficulty=concept.difficulty_preference,
            num_scenes=concept.num_scenes,
            available_mechanics=AVAILABLE_MECHANICS_TEXT,
        )

        try:
            response = await invoke_claude(
                prompt=formatted_prompt,
                max_tokens=4000,
                temperature=0.7,
            )

            if not response:
                self._logger.error("Empty response from Claude")
                return None

            return self._parse_response(response, concept)

        except Exception as e:
            self._logger.error(f"Claude call failed: {e}")
            return None

    def _parse_response(
        self, response: str, concept: GameConcept
    ) -> Optional[GamePlan]:
        """Parse Claude's JSON response into a GamePlan."""
        try:
            # Clean up response
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]

            data = json.loads(cleaned.strip())

            # Build GamePlan
            plan = GamePlan(
                game_title=data.get("game_title", concept.title),
                game_theme=data.get("game_theme", concept.theme),
                opening_narrative=data.get("opening_narrative", concept.story_hook),
                closing_narrative=data.get("closing_narrative", concept.resolution),
                overall_goal=concept.goal_type,
                goal_description=concept.goal_description,
                difficulty_curve=data.get(
                    "difficulty_curve", ["easy", "medium", "hard"]
                ),
                mechanic_introduction_order=data.get("mechanic_introduction_order", []),
                scene_routes=data.get("scene_routes", []),
            )

            # Parse scenes
            for scene_data in data.get("scenes", []):
                scene = PlannedScene(
                    scene_index=scene_data.get("scene_index", 0),
                    scene_name=scene_data.get(
                        "scene_name", f"Scene {scene_data.get('scene_index', 0) + 1}"
                    ),
                    zone_type=scene_data.get("zone_type", "forest"),
                    narrative_purpose=scene_data.get(
                        "narrative_purpose", "rising_action"
                    ),
                    scene_description=scene_data.get("scene_description", ""),
                    entry_narrative=scene_data.get("entry_narrative", ""),
                    completion_narrative=scene_data.get("completion_narrative", ""),
                    primary_goal=scene_data.get("primary_goal", ""),
                    mechanics=scene_data.get("mechanics", []),
                    difficulty=scene_data.get("difficulty", "medium"),
                    estimated_duration_minutes=scene_data.get(
                        "estimated_duration_minutes", 5
                    ),
                    exit_conditions=scene_data.get("exit_conditions", []),
                    leads_to=scene_data.get("leads_to"),
                    required_collectibles=scene_data.get("required_collectibles", []),
                    required_objects=scene_data.get("required_objects", []),
                    atmosphere=scene_data.get("atmosphere", "peaceful"),
                )

                # Parse challenges
                for ch_data in scene_data.get("challenges", []):
                    challenge = PlannedChallenge(
                        challenge_id=ch_data.get(
                            "challenge_id",
                            f"ch_{scene.scene_index}_{len(scene.challenges)}",
                        ),
                        mechanic_id=ch_data.get("mechanic_id", "collect_items"),
                        name=ch_data.get("name", "Challenge"),
                        description=ch_data.get("description", ""),
                        difficulty=ch_data.get("difficulty", "medium"),
                        is_required=ch_data.get("is_required", True),
                        unlock_condition=ch_data.get("unlock_condition"),
                        unlocks=ch_data.get("unlocks", []),
                        rewards=ch_data.get("rewards", {}),
                        hints=ch_data.get("hints", []),
                    )
                    scene.challenges.append(challenge)

                # Parse NPCs
                for npc_data in scene_data.get("npcs", []):
                    npc = PlannedNPC(
                        npc_id=npc_data.get(
                            "npc_id", f"npc_{scene.scene_index}_{len(scene.npcs)}"
                        ),
                        role=npc_data.get("role", "villager"),
                        name=npc_data.get("name", "Villager"),
                        description=npc_data.get("description", ""),
                        personality=npc_data.get("personality", "friendly"),
                        dialogue_style=npc_data.get("dialogue_style", "casual"),
                        initial_greeting=npc_data.get(
                            "initial_greeting", "Hello there!"
                        ),
                        mechanics_involved=npc_data.get("mechanics_involved", []),
                        gives_quest=npc_data.get("gives_quest", False),
                        quest_description=npc_data.get("quest_description"),
                    )
                    scene.npcs.append(npc)

                plan.scenes.append(scene)

            return plan

        except json.JSONDecodeError as e:
            self._logger.error(f"JSON parse error: {e}")
            self._logger.debug(f"Raw response: {response[:500]}")
            return None
        except Exception as e:
            self._logger.error(f"Response parsing error: {e}")
            return None

    def _validate_plan(self, plan: GamePlan, result: PlannerResult):
        """Validate the generated plan."""
        issues = []

        # Check scene count
        if not plan.scenes:
            issues.append("No scenes generated")

        # Check each scene
        for scene in plan.scenes:
            if not scene.challenges:
                issues.append(f"Scene '{scene.scene_name}' has no challenges")

            if not scene.mechanics:
                issues.append(f"Scene '{scene.scene_name}' has no mechanics")

            # Check challenge mechanics exist
            for challenge in scene.challenges:
                if not challenge.mechanic_id:
                    issues.append(
                        f"Challenge '{challenge.name}' in '{scene.scene_name}' has no mechanic"
                    )

        # Check scene connectivity
        for i, scene in enumerate(plan.scenes[:-1]):
            if not scene.leads_to:
                result.warnings.append(
                    f"Scene '{scene.scene_name}' has no 'leads_to' (not final scene)"
                )

        # Store issues
        plan.validation_issues = issues
        plan.is_valid = len(issues) == 0
        result.warnings.extend(issues)


# ═══════════════════════════════════════════════════════════════════════════════
#  PLANNER VALIDATOR
# ═══════════════════════════════════════════════════════════════════════════════


class PlannerValidator:
    """
    Validates and repairs game plans.

    Can fix common issues like missing mechanics, incomplete routes, etc.
    """

    def __init__(self):
        self._logger = logging.getLogger("planner_validator")

    def validate(self, plan: GamePlan) -> tuple[bool, List[str], List[str]]:
        """
        Validate a game plan.

        Returns:
            (is_valid, errors, warnings)
        """
        errors = []
        warnings = []

        if not plan.scenes:
            errors.append("Plan has no scenes")
            return False, errors, warnings

        # Validate scenes
        for scene in plan.scenes:
            scene_errors, scene_warnings = self._validate_scene(scene)
            errors.extend(scene_errors)
            warnings.extend(scene_warnings)

        # Validate routes
        route_errors = self._validate_routes(plan)
        errors.extend(route_errors)

        # Validate narrative
        if not plan.opening_narrative:
            warnings.append("No opening narrative")
        if not plan.closing_narrative:
            warnings.append("No closing narrative")

        return len(errors) == 0, errors, warnings

    def _validate_scene(self, scene: PlannedScene) -> tuple[List[str], List[str]]:
        """Validate a single scene."""
        errors = []
        warnings = []

        if not scene.scene_name:
            errors.append(f"Scene {scene.scene_index} has no name")

        if not scene.mechanics:
            warnings.append(f"Scene '{scene.scene_name}' has no mechanics")

        if not scene.challenges:
            warnings.append(f"Scene '{scene.scene_name}' has no challenges")

        # Validate challenges
        for challenge in scene.challenges:
            if not challenge.mechanic_id:
                errors.append(f"Challenge '{challenge.name}' has no mechanic_id")

        return errors, warnings

    def _validate_routes(self, plan: GamePlan) -> List[str]:
        """Validate scene routes."""
        errors = []
        scene_names = {s.scene_name for s in plan.scenes}

        for route in plan.scene_routes:
            from_scene = route.get("from_scene")
            to_scene = route.get("to_scene")

            if from_scene and from_scene not in scene_names:
                errors.append(f"Route references unknown scene: {from_scene}")
            if to_scene and to_scene not in scene_names:
                errors.append(f"Route references unknown scene: {to_scene}")

        return errors

    def repair(self, plan: GamePlan) -> GamePlan:
        """
        Attempt to repair common issues in a plan.

        Returns the repaired plan.
        """
        # Ensure each scene has at least one mechanic
        for scene in plan.scenes:
            if not scene.mechanics:
                # Derive from challenges
                scene.mechanics = list(
                    set(ch.mechanic_id for ch in scene.challenges if ch.mechanic_id)
                )

                # Fallback
                if not scene.mechanics:
                    scene.mechanics = ["explore"]

        # Ensure routes exist
        if not plan.scene_routes and len(plan.scenes) > 1:
            for i, scene in enumerate(plan.scenes[:-1]):
                next_scene = plan.scenes[i + 1]
                plan.scene_routes.append(
                    {
                        "from_scene": scene.scene_name,
                        "to_scene": next_scene.scene_name,
                        "condition": f"Complete {scene.scene_name}",
                        "direction": "north",
                    }
                )
                scene.leads_to = next_scene.scene_name

        # Ensure difficulty curve
        if not plan.difficulty_curve:
            plan.difficulty_curve = [scene.difficulty for scene in plan.scenes]

        return plan


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


async def plan_game(
    concept: GameConcept,
    available_assets: Optional[List[Dict]] = None,
    auto_repair: bool = True,
) -> PlannerResult:
    """
    Generate a game plan from a concept.

    Convenience function that creates a planner and runs it.

    Args:
        concept: GameConcept from Prompt Interpreter
        available_assets: Assets available for the game
        auto_repair: Automatically repair common issues

    Returns:
        PlannerResult with GamePlan
    """
    planner = PlannerAgent()
    result = await planner.plan(concept, available_assets)

    if result.success and auto_repair:
        validator = PlannerValidator()
        result.plan = validator.repair(result.plan)

    return result
