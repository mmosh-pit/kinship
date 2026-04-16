"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CLARIFICATION AGENT                                        ║
║                                                                               ║
║  Conversational agent that detects ambiguity and asks clarifying questions.  ║
║                                                                               ║
║  RESPONSIBILITIES:                                                            ║
║  1. Analyze prompt clarity and completeness                                   ║
║  2. Generate smart clarifying questions when needed                           ║
║  3. Merge user answers back into enhanced prompt                              ║
║  4. Track conversation state for multi-turn clarification                     ║
║                                                                               ║
║  FLOW:                                                                        ║
║                                                                               ║
║  User: "make a game"                                                          ║
║     ↓                                                                         ║
║  ClarificationAgent.analyze()                                                 ║
║     ↓                                                                         ║
║  Returns: needs_clarification=True + questions                                ║
║     ↓                                                                         ║
║  User answers questions                                                       ║
║     ↓                                                                         ║
║  ClarificationAgent.merge_answers()                                           ║
║     ↓                                                                         ║
║  Returns: enhanced prompt ready for generation                                ║
║                                                                               ║
║  CLEAR PROMPT:                                                                ║
║                                                                               ║
║  User: "Create a forest game where kids collect mushrooms to help a fairy"   ║
║     ↓                                                                         ║
║  ClarificationAgent.analyze()                                                 ║
║     ↓                                                                         ║
║  Returns: needs_clarification=False, confidence=0.9                           ║
║     ↓                                                                         ║
║  Proceed directly to generation                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import json
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum

from app.services.claude_client import invoke_claude


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  ENUMS
# ═══════════════════════════════════════════════════════════════════════════════


class ClarificationField(str, Enum):
    """Fields that can be clarified."""

    THEME = "theme"
    GOAL = "goal"
    SCENES = "scenes"
    CHARACTERS = "characters"
    DIFFICULTY = "difficulty"
    TONE = "tone"
    MECHANICS = "mechanics"


class ConversationStatus(str, Enum):
    """Status of clarification conversation."""

    PENDING = "pending"  # Waiting for user answers
    COMPLETE = "complete"  # All questions answered
    READY = "ready"  # No clarification needed
    FAILED = "failed"  # Could not understand prompt


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ClarifyingQuestion:
    """A single clarifying question to ask the user."""

    question: str
    field: ClarificationField
    options: List[str] = field(default_factory=list)
    required: bool = True
    emoji_prefix: bool = True  # Use emoji in options

    def to_dict(self) -> dict:
        return {
            "question": self.question,
            "field": self.field.value,
            "options": self.options,
            "required": self.required,
        }


@dataclass
class PartialUnderstanding:
    """What we understood from the prompt so far."""

    theme: Optional[str] = None
    goal: Optional[str] = None
    characters: List[str] = field(default_factory=list)
    locations: List[str] = field(default_factory=list)
    mechanics: List[str] = field(default_factory=list)
    tone: Optional[str] = None
    num_scenes: Optional[int] = None

    def to_dict(self) -> dict:
        return {
            "theme": self.theme,
            "goal": self.goal,
            "characters": self.characters,
            "locations": self.locations,
            "mechanics": self.mechanics,
            "tone": self.tone,
            "num_scenes": self.num_scenes,
        }

    def completeness_score(self) -> float:
        """Calculate how complete our understanding is (0-1)."""
        score = 0.0
        if self.theme:
            score += 0.25
        if self.goal:
            score += 0.25
        if self.characters:
            score += 0.15
        if self.locations:
            score += 0.15
        if self.mechanics:
            score += 0.1
        if self.tone:
            score += 0.05
        if self.num_scenes:
            score += 0.05
        return min(score, 1.0)


@dataclass
class ClarificationResult:
    """Result of clarification analysis."""

    needs_clarification: bool = False
    status: ConversationStatus = ConversationStatus.READY
    questions: List[ClarifyingQuestion] = field(default_factory=list)
    understood: Optional[PartialUnderstanding] = None
    confidence: float = 0.0
    message: str = ""
    enhanced_prompt: Optional[str] = None

    def to_dict(self) -> dict:
        return {
            "needs_clarification": self.needs_clarification,
            "status": self.status.value,
            "questions": [q.to_dict() for q in self.questions],
            "understood": self.understood.to_dict() if self.understood else {},
            "confidence": self.confidence,
            "message": self.message,
            "enhanced_prompt": self.enhanced_prompt,
        }


@dataclass
class ConversationState:
    """State for multi-turn clarification conversation."""

    session_id: str
    original_prompt: str
    questions_asked: List[ClarifyingQuestion] = field(default_factory=list)
    answers_received: Dict[str, str] = field(default_factory=dict)
    status: ConversationStatus = ConversationStatus.PENDING
    understanding: Optional[PartialUnderstanding] = None
    created_at: float = 0.0

    def is_complete(self) -> bool:
        """Check if all required questions have been answered."""
        required_fields = {q.field.value for q in self.questions_asked if q.required}
        answered_fields = set(self.answers_received.keys())
        return required_fields.issubset(answered_fields)


# ═══════════════════════════════════════════════════════════════════════════════
#  CLARIFICATION AGENT
# ═══════════════════════════════════════════════════════════════════════════════


class ClarificationAgent:
    """
    Agent that handles conversational clarification for ambiguous prompts.

    Uses both heuristics and LLM to detect what's missing, then generates
    friendly questions to fill in the gaps.
    """

    # Minimum word count for a "clear" prompt
    MIN_CLEAR_WORDS = 10

    # Confidence threshold below which we ask questions
    CLARIFICATION_THRESHOLD = 0.6

    # Keywords that indicate specificity
    THEME_KEYWORDS = {
        "forest",
        "ocean",
        "sea",
        "space",
        "haunted",
        "spooky",
        "castle",
        "village",
        "cave",
        "desert",
        "jungle",
        "mountain",
        "city",
        "underwater",
        "pirate",
        "fairy",
        "magical",
        "medieval",
        "futuristic",
        "tropical",
        "arctic",
        "volcanic",
        "swamp",
        "garden",
        "farm",
        "school",
        "hospital",
    }

    GOAL_KEYWORDS = {
        "collect",
        "gather",
        "find",
        "rescue",
        "save",
        "help",
        "deliver",
        "reach",
        "escape",
        "solve",
        "unlock",
        "defeat",
        "build",
        "repair",
        "explore",
        "discover",
        "protect",
        "defend",
        "trade",
        "learn",
        "teach",
        "befriend",
        "heal",
        "grow",
        "create",
        "destroy",
        "activate",
        "deactivate",
    }

    CHARACTER_KEYWORDS = {
        "fairy",
        "wizard",
        "dragon",
        "knight",
        "princess",
        "prince",
        "monster",
        "ghost",
        "robot",
        "animal",
        "friend",
        "helper",
        "npc",
        "villain",
        "fox",
        "owl",
        "bear",
        "cat",
        "dog",
        "rabbit",
        "squirrel",
        "bird",
        "witch",
        "elf",
        "dwarf",
        "giant",
        "troll",
        "goblin",
        "unicorn",
    }

    def __init__(self):
        self._logger = logging.getLogger("clarification_agent")
        self._sessions: Dict[str, ConversationState] = {}

    # ───────────────────────────────────────────────────────────────────────────
    #  MAIN API
    # ───────────────────────────────────────────────────────────────────────────

    async def analyze(
        self,
        prompt: str,
        answers: Optional[Dict[str, str]] = None,
        session_id: Optional[str] = None,
        skip_clarification: bool = False,
    ) -> ClarificationResult:
        """
        Analyze a prompt and determine if clarification is needed.

        Args:
            prompt: User's game description
            answers: Answers to previous clarifying questions (if any)
            session_id: Session ID for multi-turn conversation
            skip_clarification: If True, skip clarification and return ready status

        Returns:
            ClarificationResult with questions or enhanced prompt
        """
        self._logger.info(f"Analyzing prompt: {prompt[:80]}...")

        # If skip_clarification is True, return ready status immediately
        if skip_clarification:
            self._logger.info("Skipping clarification as requested")
            return ClarificationResult(
                needs_clarification=False,
                status=ConversationStatus.READY,
                confidence=0.5,  # Lower confidence since we're skipping
                enhanced_prompt=prompt,
                message="Generating with best guess...",
            )

        # If we have answers, merge them and return enhanced prompt
        if answers:
            return self._process_answers(prompt, answers)

        # Analyze clarity
        result = ClarificationResult()

        # Step 1: Quick heuristic check
        heuristic_result = self._heuristic_analysis(prompt)

        # Step 2: If heuristics say it's unclear, use LLM for smart questions
        if heuristic_result["needs_clarification"]:
            llm_result = await self._llm_analysis(prompt)

            if llm_result:
                result.needs_clarification = llm_result.get("needs_clarification", True)
                result.confidence = llm_result.get("confidence", 0.4)
                result.message = llm_result.get("message", self._default_message())
                result.status = (
                    ConversationStatus.PENDING
                    if result.needs_clarification
                    else ConversationStatus.READY
                )

                # Build questions from LLM response
                for q_data in llm_result.get("questions", []):
                    result.questions.append(
                        ClarifyingQuestion(
                            question=q_data.get("question", ""),
                            field=self._parse_field(q_data.get("field", "general")),
                            options=q_data.get("options", []),
                            required=q_data.get("required", True),
                        )
                    )

                # Build partial understanding
                understood = llm_result.get("understood", {})
                result.understood = PartialUnderstanding(
                    theme=understood.get("theme"),
                    goal=understood.get("goal"),
                    characters=understood.get("characters", []),
                )
            else:
                # LLM failed, use heuristic questions
                result.needs_clarification = True
                result.confidence = heuristic_result["confidence"]
                result.questions = self._generate_heuristic_questions(
                    heuristic_result["missing_aspects"]
                )
                result.message = self._default_message()
                result.status = ConversationStatus.PENDING
        else:
            # Prompt is clear enough
            result.needs_clarification = False
            result.confidence = heuristic_result["confidence"]
            result.status = ConversationStatus.READY
            result.enhanced_prompt = prompt

        # Limit to max 3 questions
        result.questions = result.questions[:3]

        self._logger.info(
            f"Analysis complete: needs_clarification={result.needs_clarification}, "
            f"confidence={result.confidence:.2f}, questions={len(result.questions)}"
        )

        return result

    def merge_answers(
        self,
        original_prompt: str,
        answers: Dict[str, str],
    ) -> str:
        """
        Merge user's answers into the original prompt.

        Args:
            original_prompt: The original game description
            answers: User's answers keyed by field name

        Returns:
            Enhanced prompt with answers incorporated
        """
        enhancements = []

        # Process theme
        if "theme" in answers:
            theme = self._clean_answer(answers["theme"])
            enhancements.append(f"Set in a {theme} environment")

        # Process goal
        if "goal" in answers:
            goal = self._clean_answer(answers["goal"])
            enhancements.append(f"The player should {goal}")

        # Process scenes
        if "scenes" in answers:
            scenes = answers["scenes"]
            if "1" in scenes:
                enhancements.append("with 1 area/scene")
            elif "3" in scenes:
                enhancements.append("with 3 areas/scenes")
            elif "5" in scenes:
                enhancements.append("with 5 areas/scenes")
            else:
                enhancements.append(f"with {scenes} areas/scenes")

        # Process characters
        if "characters" in answers:
            chars = self._clean_answer(answers["characters"])
            enhancements.append(f"featuring {chars}")

        # Process difficulty
        if "difficulty" in answers:
            diff = self._clean_answer(answers["difficulty"])
            enhancements.append(f"with {diff} difficulty")

        # Process tone
        if "tone" in answers:
            tone = self._clean_answer(answers["tone"])
            enhancements.append(f"with a {tone} atmosphere")

        # Process mechanics
        if "mechanics" in answers:
            mechanics = self._clean_answer(answers["mechanics"])
            enhancements.append(f"including {mechanics} gameplay")

        # Combine
        if enhancements:
            enhanced = f"{original_prompt}. {'. '.join(enhancements)}."
            self._logger.info(f"Enhanced prompt: {enhanced[:100]}...")
            return enhanced

        return original_prompt

    # ───────────────────────────────────────────────────────────────────────────
    #  HEURISTIC ANALYSIS
    # ───────────────────────────────────────────────────────────────────────────

    def _heuristic_analysis(self, prompt: str) -> Dict[str, Any]:
        """Quick heuristic check for prompt clarity."""
        prompt_lower = prompt.lower()
        words = prompt_lower.split()

        result = {
            "needs_clarification": False,
            "confidence": 0.8,
            "missing_aspects": [],
        }

        # Check word count
        if len(words) < self.MIN_CLEAR_WORDS:
            result["needs_clarification"] = True
            result["confidence"] = 0.3

        # Check for theme keywords
        has_theme = any(kw in prompt_lower for kw in self.THEME_KEYWORDS)
        if not has_theme:
            result["missing_aspects"].append("theme")
            result["confidence"] -= 0.2

        # Check for goal keywords
        has_goal = any(kw in prompt_lower for kw in self.GOAL_KEYWORDS)
        if not has_goal:
            result["missing_aspects"].append("goal")
            result["confidence"] -= 0.2

        # Check for character keywords (optional, less weight)
        has_characters = any(kw in prompt_lower for kw in self.CHARACTER_KEYWORDS)
        if not has_characters:
            result["missing_aspects"].append("characters")
            result["confidence"] -= 0.1

        # Determine if clarification needed
        if result["confidence"] < self.CLARIFICATION_THRESHOLD:
            result["needs_clarification"] = True

        # Clamp confidence
        result["confidence"] = max(0.1, min(1.0, result["confidence"]))

        return result

    # ───────────────────────────────────────────────────────────────────────────
    #  LLM ANALYSIS
    # ───────────────────────────────────────────────────────────────────────────

    async def _llm_analysis(self, prompt: str) -> Optional[Dict]:
        """Use Claude to analyze prompt and generate smart questions."""
        try:
            analysis_prompt = f"""Analyze this game description for clarity and completeness.

USER'S DESCRIPTION:
"{prompt}"

Determine if this description is clear enough to create a game, or if we need to ask clarifying questions.

A CLEAR description has:
- A specific theme/setting (forest, space, haunted house, etc.)
- A clear goal (collect items, rescue someone, explore, etc.)
- Enough detail to start designing

RULES:
- Ask at most 3 questions
- Questions should be friendly and conversational
- Provide 3-4 helpful options for each question
- Don't ask about things already clear in the description
- If the description is detailed enough, set needs_clarification to false
- Use emoji in options to make them friendly

Respond with JSON:
{{
    "needs_clarification": true/false,
    "confidence": 0.0-1.0,
    "message": "Friendly message to user (only if asking questions)",
    "understood": {{
        "theme": "detected theme or null",
        "goal": "detected goal or null",
        "characters": ["any characters mentioned"]
    }},
    "questions": [
        {{
            "question": "Friendly question",
            "field": "theme|goal|characters|scenes|difficulty|tone|mechanics",
            "options": ["🌲 Option 1", "🏰 Option 2", "🌌 Option 3", "👻 Option 4"],
            "required": true/false
        }}
    ]
}}

Respond ONLY with JSON, no other text."""

            response = await invoke_claude(
                prompt=analysis_prompt,
                max_tokens=1000,
                temperature=0.3,
            )

            if response:
                response_text = response.strip()
                # Clean up code blocks if present
                if response_text.startswith("```"):
                    response_text = response_text.split("```")[1]
                    if response_text.startswith("json"):
                        response_text = response_text[4:]

                return json.loads(response_text)

        except json.JSONDecodeError as e:
            self._logger.warning(f"Failed to parse LLM response: {e}")
        except Exception as e:
            self._logger.warning(f"LLM analysis failed: {e}")

        return None

    # ───────────────────────────────────────────────────────────────────────────
    #  QUESTION GENERATION
    # ───────────────────────────────────────────────────────────────────────────

    def _generate_heuristic_questions(
        self,
        missing_aspects: List[str],
    ) -> List[ClarifyingQuestion]:
        """Generate questions for missing aspects using heuristics."""
        questions = []

        if "theme" in missing_aspects:
            questions.append(
                ClarifyingQuestion(
                    question="What kind of world should this be?",
                    field=ClarificationField.THEME,
                    options=[
                        "🌲 Forest / Nature",
                        "🏰 Castle / Medieval",
                        "🌌 Space / Sci-fi",
                        "👻 Spooky / Haunted",
                        "🏖️ Beach / Ocean",
                        "🏙️ City / Urban",
                    ],
                    required=True,
                )
            )

        if "goal" in missing_aspects:
            questions.append(
                ClarifyingQuestion(
                    question="What should the player try to do?",
                    field=ClarificationField.GOAL,
                    options=[
                        "🍄 Collect items",
                        "🦊 Help / Rescue someone",
                        "🗺️ Explore & discover",
                        "🧩 Solve puzzles",
                        "🏃 Reach a destination",
                        "🔨 Build something",
                    ],
                    required=True,
                )
            )

        if "characters" in missing_aspects and len(questions) < 2:
            questions.append(
                ClarifyingQuestion(
                    question="Any special characters you'd like?",
                    field=ClarificationField.CHARACTERS,
                    options=[
                        "🧚 Magical creatures (fairies, wizards)",
                        "🦊 Friendly animals",
                        "🤖 Robots / Sci-fi beings",
                        "👻 Spooky creatures",
                        "🙂 Regular people / villagers",
                    ],
                    required=False,
                )
            )

        if len(questions) < 2:
            questions.append(
                ClarifyingQuestion(
                    question="How big should the adventure be?",
                    field=ClarificationField.SCENES,
                    options=[
                        "1️⃣ Quick (1 area)",
                        "3️⃣ Medium (3 areas)",
                        "5️⃣ Big (5 areas)",
                    ],
                    required=False,
                )
            )

        return questions[:3]

    # ───────────────────────────────────────────────────────────────────────────
    #  HELPERS
    # ───────────────────────────────────────────────────────────────────────────

    def _process_answers(
        self,
        prompt: str,
        answers: Dict[str, str],
    ) -> ClarificationResult:
        """Process user answers and return enhanced prompt."""
        enhanced = self.merge_answers(prompt, answers)

        return ClarificationResult(
            needs_clarification=False,
            status=ConversationStatus.COMPLETE,
            confidence=0.85,
            enhanced_prompt=enhanced,
            message="Great! Let me create your game...",
        )

    def _parse_field(self, field_str: str) -> ClarificationField:
        """Parse field string to enum."""
        field_map = {
            "theme": ClarificationField.THEME,
            "goal": ClarificationField.GOAL,
            "scenes": ClarificationField.SCENES,
            "characters": ClarificationField.CHARACTERS,
            "difficulty": ClarificationField.DIFFICULTY,
            "tone": ClarificationField.TONE,
            "mechanics": ClarificationField.MECHANICS,
        }
        return field_map.get(field_str.lower(), ClarificationField.THEME)

    def _clean_answer(self, answer: str) -> str:
        """Clean emoji prefixes from answers."""
        # Remove common emoji prefixes
        import re

        cleaned = re.sub(r"^[🌲🏰🌌👻🏖️🏙️🍄🦊🗺️🧩🏃🔨🧚🤖🙂1️⃣3️⃣5️⃣]\s*", "", answer)
        return cleaned.strip()

    def _default_message(self) -> str:
        """Get default clarification message."""
        messages = [
            "I'd love to help create your game! Just a few quick questions:",
            "Great idea! Let me ask a couple things to make it perfect:",
            "Sounds fun! A few questions to get started:",
            "Let's make this awesome! Quick questions:",
        ]
        import random

        return random.choice(messages)


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


async def analyze_prompt(
    prompt: str,
    answers: Optional[Dict[str, str]] = None,
    skip_clarification: bool = False,
) -> ClarificationResult:
    """
    Analyze a prompt for clarity.

    Args:
        prompt: User's game description
        answers: Answers to previous questions (if any)
        skip_clarification: Skip clarification and use best guess

    Returns:
        ClarificationResult
    """
    agent = ClarificationAgent()
    return await agent.analyze(prompt, answers, skip_clarification=skip_clarification)


def merge_clarifications(
    prompt: str,
    answers: Dict[str, str],
) -> str:
    """
    Merge answers into prompt.

    Args:
        prompt: Original prompt
        answers: User's answers

    Returns:
        Enhanced prompt
    """
    agent = ClarificationAgent()
    return agent.merge_answers(prompt, answers)
