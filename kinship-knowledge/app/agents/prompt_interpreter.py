"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PROMPT INTERPRETER AGENT                                   ║
║                                                                               ║
║  AI-powered interpretation of natural language game descriptions.            ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  1. Parse user's natural language into structured game concept                ║
║  2. Detect ambiguity and ask clarifying questions if needed                   ║
║  3. Query Pinecone for relevant assets and design patterns                    ║
║  4. Extract entities: characters, objects, locations, goals                   ║
║  5. Identify required mechanics from description                              ║
║  6. Generate story context and themes                                         ║
║                                                                               ║
║  CONVERSATIONAL FLOW:                                                         ║
║                                                                               ║
║  User: "make a game about adventure"                                          ║
║                                                                               ║
║  AI: "I'd love to help! A few questions to make this perfect:                ║
║       1. What theme? (forest, ocean, space, haunted house)                    ║
║       2. What's the goal? (collect items, rescue someone, explore)            ║
║       3. How many areas? (1-5 scenes)"                                        ║
║                                                                               ║
║  User: "forest, collect mushrooms, 3 scenes"                                  ║
║                                                                               ║
║  AI: → generates full manifest                                                ║
║                                                                               ║
║  CLEAR PROMPT FLOW:                                                           ║
║                                                                               ║
║  User: "Create a forest game where players collect 5 mushrooms to help        ║
║         a sick fairy. The fairy lives in a hollow tree."                      ║
║                                                                               ║
║  AI: → generates full manifest immediately (no questions needed)              ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import json
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum

from app.services.claude_client import invoke_claude
from app.services.asset_embeddings import (
    retrieve_relevant_assets,
    retrieve_design_knowledge,
)
from app.core.gameplay_loop_planner import GoalType

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  CLARIFICATION STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ExtractedCharacter:
    """A character extracted from the user's prompt."""

    role: str  # guide, quest_giver, merchant, villain, helper, etc.
    name: Optional[str] = None
    description: Optional[str] = None
    personality_traits: List[str] = field(default_factory=list)
    relationship_to_player: str = "neutral"  # friendly, neutral, antagonist


@dataclass
class ExtractedLocation:
    """A location/scene extracted from the user's prompt."""

    name: str
    zone_type: str  # forest, cave, village, castle, etc.
    description: Optional[str] = None
    atmosphere: str = "neutral"  # peaceful, dangerous, mysterious, etc.
    suggested_features: List[str] = field(default_factory=list)


@dataclass
class GameConcept:
    """
    Structured representation of the user's game idea.

    This is the output of prompt interpretation - a rich understanding
    of what the user wants to create.
    """

    # Core identity
    title: str = ""
    theme: str = ""  # adventure, puzzle, social, exploration, etc.
    tone: str = "friendly"  # friendly, serious, whimsical, dark

    # Goal structure
    goal_type: GoalType = GoalType.EXPLORE
    goal_description: str = ""
    win_condition: str = ""

    # Story elements
    story_hook: str = ""
    story_context: str = ""
    resolution: str = ""

    # Extracted entities
    characters: List[ExtractedCharacter] = field(default_factory=list)
    locations: List[ExtractedLocation] = field(default_factory=list)
    collectibles: List[str] = field(default_factory=list)
    obstacles: List[str] = field(default_factory=list)
    key_objects: List[str] = field(default_factory=list)

    # Retrieved knowledge (from Pinecone)
    relevant_assets: List[Dict[str, Any]] = field(default_factory=list)
    design_patterns: List[Dict[str, Any]] = field(default_factory=list)

    # Suggested mechanics (based on analysis)
    suggested_mechanics: List[str] = field(default_factory=list)
    mechanic_reasoning: Dict[str, str] = field(default_factory=dict)

    # Audience
    target_audience: str = "children_9_12"
    difficulty_preference: str = "medium"

    # Scene configuration
    num_scenes: int = 3
    scene_flow: List[str] = field(
        default_factory=list
    )  # ["intro", "challenge", "finale"]

    # Raw data
    original_prompt: str = ""
    interpretation_confidence: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for pipeline state."""
        return {
            "title": self.title,
            "theme": self.theme,
            "tone": self.tone,
            "goal_type": (
                self.goal_type.value
                if isinstance(self.goal_type, GoalType)
                else self.goal_type
            ),
            "goal_description": self.goal_description,
            "win_condition": self.win_condition,
            "story_hook": self.story_hook,
            "story_context": self.story_context,
            "resolution": self.resolution,
            "characters": [
                {
                    "role": c.role,
                    "name": c.name,
                    "description": c.description,
                    "personality_traits": c.personality_traits,
                    "relationship_to_player": c.relationship_to_player,
                }
                for c in self.characters
            ],
            "locations": [
                {
                    "name": loc.name,
                    "zone_type": loc.zone_type,
                    "description": loc.description,
                    "atmosphere": loc.atmosphere,
                    "suggested_features": loc.suggested_features,
                }
                for loc in self.locations
            ],
            "collectibles": self.collectibles,
            "obstacles": self.obstacles,
            "key_objects": self.key_objects,
            "relevant_assets": self.relevant_assets,
            "design_patterns": self.design_patterns,
            "suggested_mechanics": self.suggested_mechanics,
            "mechanic_reasoning": self.mechanic_reasoning,
            "target_audience": self.target_audience,
            "difficulty_preference": self.difficulty_preference,
            "num_scenes": self.num_scenes,
            "scene_flow": self.scene_flow,
            "original_prompt": self.original_prompt,
            "interpretation_confidence": self.interpretation_confidence,
        }


@dataclass
class InterpretationResult:
    """Result of prompt interpretation."""

    success: bool
    concept: Optional[GameConcept] = None
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    duration_ms: int = 0
    retrieved_assets: List[Dict] = field(default_factory=list)

    def to_dict(self) -> dict:
        result = {
            "success": self.success,
            "errors": self.errors,
            "warnings": self.warnings,
            "duration_ms": self.duration_ms,
        }
        if self.concept:
            result["concept"] = {
                "title": self.concept.title,
                "theme": self.concept.theme,
                "goal_type": (
                    self.concept.goal_type.value
                    if hasattr(self.concept.goal_type, "value")
                    else str(self.concept.goal_type)
                ),
            }
        return result


# ═══════════════════════════════════════════════════════════════════════════════
#  PROMPT INTERPRETER
# ═══════════════════════════════════════════════════════════════════════════════


INTERPRETATION_PROMPT = """You are a game design expert analyzing a user's natural language game description.

Extract a structured game concept from the following description. Be thorough but also creative - fill in reasonable defaults for anything not explicitly mentioned.

USER'S GAME DESCRIPTION:
{prompt}

AVAILABLE ASSETS (from our asset library):
{assets_context}

DESIGN PATTERNS (from our knowledge base):
{design_context}

Analyze the description and respond with a JSON object containing:

{{
    "title": "A catchy game title",
    "theme": "adventure|puzzle|social|exploration|combat|building",
    "tone": "friendly|serious|whimsical|mysterious|adventurous",
    
    "goal_type": "escape|explore|reach|rescue|deliver|fetch|gather|defeat|defend|survive|unlock|solve|activate|befriend|trade|learn|build|repair|craft",
    "goal_description": "Clear description of what player must achieve",
    "win_condition": "Specific condition that ends the game successfully",
    
    "story_hook": "Opening narrative hook (1-2 sentences)",
    "story_context": "Background story context",
    "resolution": "How the story resolves when player wins",
    
    "characters": [
        {{
            "role": "guide|quest_giver|merchant|villain|helper|guardian|villager",
            "name": "Character name or null",
            "description": "Brief description",
            "personality_traits": ["trait1", "trait2"],
            "relationship_to_player": "friendly|neutral|antagonist"
        }}
    ],
    
    "locations": [
        {{
            "name": "Location name",
            "zone_type": "forest|cave|village|castle|beach|mountain|swamp|ruins",
            "description": "Brief description",
            "atmosphere": "peaceful|dangerous|mysterious|magical|busy",
            "suggested_features": ["feature1", "feature2"]
        }}
    ],
    
    "collectibles": ["item1", "item2"],
    "obstacles": ["obstacle1", "obstacle2"],
    "key_objects": ["important_object1"],
    
    "suggested_mechanics": ["mechanic_id1", "mechanic_id2"],
    "mechanic_reasoning": {{
        "mechanic_id": "Why this mechanic fits the game"
    }},
    
    "target_audience": "children_5_8|children_9_12|teens|adults",
    "difficulty_preference": "easy|medium|hard",
    
    "num_scenes": 1-5,
    "scene_flow": ["intro_scene_purpose", "middle_scene_purpose", "finale_scene_purpose"],
    
    "interpretation_confidence": 0.0-1.0
}}

AVAILABLE MECHANICS (use these IDs):
- collect_items: Player collects specific items
- collect_all: Player collects all items of a type
- reach_destination: Player reaches a specific location
- talk_to_npc: Player talks to an NPC
- deliver_item: Player delivers an item to someone/somewhere
- push_to_target: Player pushes objects to targets
- avoid_hazard: Player avoids dangerous areas
- unlock_door: Player unlocks a door with a key
- solve_puzzle: Player solves a puzzle
- trade_items: Player trades with NPCs
- befriend_npc: Player builds relationship with NPC
- defend_position: Player defends an area
- attack_enemy: Player engages in combat
- build_structure: Player builds something
- repair_object: Player fixes something broken

Respond ONLY with the JSON object, no other text.
"""


class PromptInterpreter:
    """
    AI-powered interpreter for natural language game descriptions.

    Uses Claude to understand user intent and Pinecone to retrieve
    relevant assets and design knowledge.

    NOTE: Clarification is handled by ClarificationAgent, not here.
    This class focuses purely on interpretation once the prompt is clear.
    """

    def __init__(self, platform_id: Optional[str] = None):
        """
        Initialize the interpreter.

        Args:
            platform_id: Platform ID for asset retrieval filtering
        """
        self.platform_id = platform_id
        self._logger = logging.getLogger("prompt_interpreter")

    async def interpret(
        self,
        prompt: str,
        num_scenes: int = 3,
        existing_assets: Optional[List[Dict]] = None,
    ) -> InterpretationResult:
        """
        Interpret a natural language game description.

        Args:
            prompt: User's game description (should be clear/enhanced)
            num_scenes: Requested number of scenes
            existing_assets: Pre-fetched assets (optional)

        Returns:
            InterpretationResult with GameConcept
        """
        import time

        start_time = time.time()

        result = InterpretationResult(success=False)

        try:
            self._logger.info(f"Interpreting prompt: {prompt[:100]}...")

            # Step 1: Retrieve relevant assets from Pinecone
            assets_context = await self._retrieve_assets(prompt, existing_assets)

            # Step 2: Retrieve design knowledge from Pinecone
            design_context = await self._retrieve_design_knowledge(prompt)

            # Step 3: Call Claude for interpretation
            concept = await self._call_claude(
                prompt=prompt,
                assets_context=assets_context,
                design_context=design_context,
                num_scenes=num_scenes,
            )

            if concept:
                concept.original_prompt = prompt
                concept.num_scenes = num_scenes
                result.success = True
                result.concept = concept
                self._logger.info(
                    f"Interpretation complete: {concept.title} "
                    f"(goal={concept.goal_type}, confidence={concept.interpretation_confidence})"
                )
            else:
                result.errors.append("Failed to parse Claude's response")

        except Exception as e:
            self._logger.error(f"Interpretation failed: {e}")
            result.errors.append(str(e))

        result.duration_ms = int((time.time() - start_time) * 1000)
        return result

    async def _retrieve_assets(
        self,
        prompt: str,
        existing_assets: Optional[List[Dict]] = None,
    ) -> str:
        """Retrieve relevant assets from Pinecone."""
        try:
            if existing_assets:
                # Use provided assets
                asset_names = [a.get("name", "") for a in existing_assets[:20]]
                return f"Available assets: {', '.join(asset_names)}"

            # Query Pinecone for relevant assets
            assets = await retrieve_relevant_assets(
                context=prompt,
                top_k=15,
                platform_id=self.platform_id,
            )

            if not assets:
                return "No specific assets retrieved. Use generic game objects."

            # Format for prompt
            asset_descriptions = []
            for asset in assets:
                name = asset.get("name", "unknown")
                asset_type = asset.get("type", "object")
                tags = asset.get("tags", [])
                desc = asset.get("description", "")

                asset_descriptions.append(
                    f"- {name} ({asset_type}): {desc or ', '.join(tags[:3])}"
                )

            return "\n".join(asset_descriptions)

        except Exception as e:
            self._logger.warning(f"Asset retrieval failed: {e}")
            return "Asset retrieval unavailable. Use generic objects."

    async def _retrieve_design_knowledge(self, prompt: str) -> str:
        """Retrieve relevant design patterns from Pinecone."""
        try:
            patterns = await retrieve_design_knowledge(
                context=prompt,
                top_k=5,
            )

            if not patterns:
                return "No specific design patterns retrieved."

            # Format for prompt
            pattern_descriptions = []
            for pattern in patterns:
                name = pattern.get("name", "")
                category = pattern.get("category", "")
                desc = pattern.get("description", "")

                if name:
                    pattern_descriptions.append(f"- {name} ({category}): {desc[:100]}")

            return (
                "\n".join(pattern_descriptions)
                if pattern_descriptions
                else "Standard game design patterns apply."
            )

        except Exception as e:
            self._logger.warning(f"Design knowledge retrieval failed: {e}")
            return "Design knowledge unavailable."

    async def _call_claude(
        self,
        prompt: str,
        assets_context: str,
        design_context: str,
        num_scenes: int,
    ) -> Optional[GameConcept]:
        """Call Claude to interpret the prompt."""

        formatted_prompt = INTERPRETATION_PROMPT.format(
            prompt=prompt,
            assets_context=assets_context,
            design_context=design_context,
        )

        try:
            # Fixed: use correct parameter names matching invoke_claude signature
            response = await invoke_claude(
                system_prompt="You are a game design expert. Respond ONLY with valid JSON.",
                user_message=formatted_prompt,
            )

            if not response:
                self._logger.error("Empty response from Claude")
                return None

            # Parse JSON response
            return self._parse_response(response, num_scenes)

        except Exception as e:
            self._logger.error(f"Claude call failed: {e}")
            return None

    def _parse_response(self, response: str, num_scenes: int) -> Optional[GameConcept]:
        """Parse Claude's JSON response into a GameConcept."""
        try:
            # Clean up response (remove markdown code blocks if present)
            cleaned = response.strip()
            if cleaned.startswith("```"):
                cleaned = cleaned.split("```")[1]
                if cleaned.startswith("json"):
                    cleaned = cleaned[4:]
            if cleaned.endswith("```"):
                cleaned = cleaned[:-3]

            data = json.loads(cleaned.strip())

            # Build GameConcept
            concept = GameConcept(
                title=data.get("title", "Untitled Game"),
                theme=data.get("theme", "adventure"),
                tone=data.get("tone", "friendly"),
                goal_description=data.get("goal_description", ""),
                win_condition=data.get("win_condition", ""),
                story_hook=data.get("story_hook", ""),
                story_context=data.get("story_context", ""),
                resolution=data.get("resolution", ""),
                collectibles=data.get("collectibles", []),
                obstacles=data.get("obstacles", []),
                key_objects=data.get("key_objects", []),
                suggested_mechanics=data.get("suggested_mechanics", []),
                mechanic_reasoning=data.get("mechanic_reasoning", {}),
                target_audience=data.get("target_audience", "children_9_12"),
                difficulty_preference=data.get("difficulty_preference", "medium"),
                num_scenes=data.get("num_scenes", num_scenes),
                scene_flow=data.get("scene_flow", []),
                interpretation_confidence=data.get("interpretation_confidence", 0.8),
            )

            # Parse goal type
            goal_str = data.get("goal_type", "explore")
            try:
                concept.goal_type = GoalType(goal_str)
            except ValueError:
                concept.goal_type = GoalType.EXPLORE

            # Parse characters
            for char_data in data.get("characters", []):
                concept.characters.append(
                    ExtractedCharacter(
                        role=char_data.get("role", "villager"),
                        name=char_data.get("name"),
                        description=char_data.get("description"),
                        personality_traits=char_data.get("personality_traits", []),
                        relationship_to_player=char_data.get(
                            "relationship_to_player", "friendly"
                        ),
                    )
                )

            # Parse locations
            for loc_data in data.get("locations", []):
                concept.locations.append(
                    ExtractedLocation(
                        name=loc_data.get("name", "Unknown Location"),
                        zone_type=loc_data.get("zone_type", "forest"),
                        description=loc_data.get("description"),
                        atmosphere=loc_data.get("atmosphere", "peaceful"),
                        suggested_features=loc_data.get("suggested_features", []),
                    )
                )

            return concept

        except json.JSONDecodeError as e:
            self._logger.error(f"JSON parse error: {e}")
            self._logger.debug(f"Raw response: {response[:500]}")
            return None
        except Exception as e:
            self._logger.error(f"Response parsing error: {e}")
            return None


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


async def interpret_prompt(
    prompt: str,
    platform_id: Optional[str] = None,
    num_scenes: int = 3,
    existing_assets: Optional[List[Dict]] = None,
) -> InterpretationResult:
    """
    Interpret a natural language game description.

    Convenience function that creates an interpreter and runs it.

    Args:
        prompt: User's game description
        platform_id: Platform ID for asset filtering
        num_scenes: Requested number of scenes
        existing_assets: Pre-fetched assets (optional)

    Returns:
        InterpretationResult with GameConcept
    """
    interpreter = PromptInterpreter(platform_id=platform_id)
    return await interpreter.interpret(
        prompt=prompt,
        num_scenes=num_scenes,
        existing_assets=existing_assets,
    )
