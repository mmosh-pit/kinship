"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    DIALOGUE AGENT (FIXED)                                     ║
║                                                                               ║
║  FIXES:                                                                       ║
║  #3 — Uses seeded RNG instead of bare random.choice()                         ║
║  #6 — Passes narrative context (story_hook, goal, resolution) from            ║
║       gameplay_loop_planner into dialogue selection                            ║
║                                                                               ║
║  AI is optional and ONLY fills flavor text. Structure comes from templates.   ║
║  Drop-in replacement for dialogue_agent.py                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional
import logging
import random

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult
from app.pipeline.pipeline_state import PipelineState, PipelineStage, DialogueOutput
from app.core.npc_templates import (
    get_npc_template,
    NPCRole,
    get_required_dialogue_types,
)
from app.core.npc_mechanic_mapping import get_mechanic_hint


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DEFAULT DIALOGUE TEMPLATES — narrative-aware versions
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_DIALOGUES = {
    "guide": {
        "greeting": [
            "Welcome, traveler! I've been expecting you.",
            "Ah, a new face! Let me show you around.",
            "Hello there! Need help finding your way?",
        ],
        "hint": [
            "Watch your step ahead — there may be dangers.",
            "I sense you're on the right path. Keep going!",
            "Remember, every puzzle has a solution.",
        ],
        "farewell": [
            "Safe travels, friend!",
            "May your path be clear.",
            "Until we meet again!",
        ],
    },
    "quest_giver": {
        "greeting": [
            "Oh thank goodness you're here! I need your help!",
            "A hero arrives! Please, I have a request.",
            "You look capable. I have a task for you.",
        ],
        "quest_intro": [
            "Something terrible has happened and only you can help.",
            "I've lost something precious. Will you find it for me?",
            "There's trouble ahead. Are you brave enough?",
        ],
        "quest_accept": [
            "Thank you so much! Here's what you need to do...",
            "I knew I could count on you! Listen carefully...",
            "Wonderful! Let me explain the details...",
        ],
        "quest_complete": [
            "You did it! I can't thank you enough!",
            "Amazing! You've saved the day!",
            "I knew you could do it! Here's your reward.",
        ],
        "farewell": [
            "Good luck out there!",
            "Be careful!",
            "I believe in you!",
        ],
    },
    "merchant": {
        "greeting": [
            "Welcome to my shop! Take a look around.",
            "Finest goods in the land! What can I get you?",
            "A customer! Let me show you my wares.",
        ],
        "trade_offer": [
            "I'll make you a good deal on this.",
            "This is my best price, just for you.",
            "A fair trade, wouldn't you say?",
        ],
        "trade_success": [
            "Pleasure doing business with you!",
            "A fine choice! Enjoy!",
            "Thank you for your patronage!",
        ],
        "farewell": [
            "Come back anytime!",
            "Safe travels, and spend wisely!",
            "Tell your friends about my shop!",
        ],
    },
    "trainer": {
        "greeting": [
            "Ah, a student! Ready to learn?",
            "I see potential in you. Let me teach you.",
            "Welcome! Today you will master a new skill.",
        ],
        "tutorial_intro": [
            "Watch carefully and learn.",
            "Let me show you how it's done.",
            "Pay attention — this is important.",
        ],
        "tutorial_encourage": [
            "Good! You're getting it!",
            "Almost there! Try again.",
            "Excellent progress!",
        ],
        "tutorial_complete": [
            "Well done! You've mastered this skill!",
            "I'm proud of you! You learn quickly.",
            "Perfect! You're ready for the real challenge.",
        ],
        "farewell": [
            "Practice makes perfect!",
            "Go forth and use what you've learned!",
            "You have what it takes!",
        ],
    },
    "guardian": {
        "greeting": [
            "Halt! Who goes there?",
            "State your business, traveler.",
            "This area is protected. What do you seek?",
        ],
        "grant_passage": [
            "You may pass. Stay on the path.",
            "I see you are worthy. Go ahead.",
            "The way is open to you now.",
        ],
        "deny_passage": [
            "I cannot let you through yet.",
            "Prove your worth first.",
            "Return when you have completed the challenge.",
        ],
        "farewell": [
            "Stay vigilant.",
            "Be careful ahead.",
            "I'll be watching.",
        ],
    },
    "villager": {
        "greeting": [
            "Oh, hello there!",
            "Welcome to our area!",
            "A visitor! How exciting!",
        ],
        "hint": [
            "I heard there's something interesting nearby...",
            "The guide knows many secrets.",
            "Be careful out there.",
        ],
        "farewell": [
            "Have a nice day!",
            "Come visit again!",
            "Take care!",
        ],
    },
}


# ═══════════════════════════════════════════════════════════════════════════════
#  NARRATIVE-AWARE DIALOGUE OVERRIDES
# ═══════════════════════════════════════════════════════════════════════════════
# When we have narrative context from the game loop, use these templates
# that reference the game's story

NARRATIVE_GREETING_TEMPLATES = {
    "guide": [
        "Welcome! {story_context} I can help you find your way.",
        "Ah, you must be here about {goal_short}. Let me help!",
        "I've been waiting for someone brave enough to {goal_short}.",
    ],
    "quest_giver": [
        "Please, you must help! {story_context}",
        "Thank goodness you're here! {goal_short} is our only hope.",
        "I need someone to {goal_short}. Will you help?",
    ],
    "guardian": [
        "Halt! This path leads to {goal_short}. Are you ready?",
        "Only those who {goal_short} may pass.",
        "You seek to {goal_short}? Prove yourself first.",
    ],
    "trainer": [
        "If you want to {goal_short}, you'll need to learn some skills first.",
        "I can teach you what you need to {goal_short}.",
        "Welcome, student. {story_context} Let me prepare you.",
    ],
}


class DialogueAgent(BaseAgent):
    """
    Fixed dialogue agent with seeded RNG and narrative context.
    """

    @property
    def name(self) -> str:
        return "dialogue_agent"

    async def _execute(self, state: PipelineState) -> dict:
        """Generate dialogue for all NPCs using seeded RNG and narrative context."""

        # FIX #3: Use seeded RNG
        rng = state.get_rng()

        # FIX #6: Get narrative context from planner
        narrative_context = self._get_narrative_context(state)
        logger.info(f"Narrative context: goal='{narrative_context.get('goal', 'N/A')}'")

        npc_dialogues: dict[str, dict] = {}

        for scene_idx, npcs in enumerate(state.scene_npcs):
            # Get narrative beat for this scene
            scene_beat = self._get_scene_narrative_beat(state, scene_idx)

            for npc in npcs:
                if not isinstance(npc, dict):
                    continue

                npc_id = npc.get("npc_id", f"npc_{scene_idx}")
                role = npc.get("role", "villager")
                personality = npc.get("personality", [])
                dialogue_hooks = npc.get("dialogue_hooks", {})
                mechanic = npc.get("mechanic")
                mechanic_hint_text = npc.get("mechanic_hint", "")

                # Generate dialogue with seeded RNG and narrative
                dialogue = self._generate_dialogue_seeded(
                    npc_id=npc_id,
                    role=role,
                    personality=personality,
                    dialogue_hooks=dialogue_hooks,
                    narrative_context=narrative_context,
                    scene_beat=scene_beat,
                    mechanic=mechanic,
                    mechanic_hint=mechanic_hint_text,
                    rng=rng,
                )

                npc_dialogues[npc_id] = dialogue

                state.dialogue_outputs.append(
                    DialogueOutput(npc_id=npc_id, dialogue=dialogue)
                )

        return {
            "dialogues_generated": len(npc_dialogues),
            "total_lines": sum(len(d.get("lines", [])) for d in npc_dialogues.values()),
        }

    def _get_narrative_context(self, state: PipelineState) -> dict:
        """
        FIX #6: Get rich narrative context from gameplay loop planner.
        """
        context = {
            "goal": state.input.goal_description or state.input.goal_type,
            "goal_short": "",
            "story_context": "",
            "story_hook": "",
            "resolution": "",
            "zone_type": state.input.zone_type,
            "game_name": state.input.game_name,
            "beats": [],
        }

        if state.planner_output:
            loop = state.planner_output.gameplay_loop
            if isinstance(loop, dict):
                context["story_hook"] = loop.get("story_hook", "")
                context["resolution"] = loop.get("resolution", "")
                context["goal"] = loop.get("goal_description", context["goal"])

                # Create short goal phrase for dialogue templates
                goal_desc = context["goal"]
                if goal_desc:
                    # Trim to a short action phrase
                    context["goal_short"] = goal_desc.lower().rstrip(".")
                    context["story_context"] = context["story_hook"]

        return context

    def _get_scene_narrative_beat(self, state: PipelineState, scene_idx: int) -> str:
        """Get the narrative beat for a scene (introduction, rising_action, climax, resolution)."""
        num_scenes = state.input.num_scenes

        if scene_idx == 0:
            return "introduction"
        elif scene_idx == num_scenes - 1:
            return "resolution"
        elif scene_idx >= num_scenes * 2 // 3:
            return "climax"
        else:
            return "rising_action"

    def _generate_dialogue_seeded(
        self,
        npc_id: str,
        role: str,
        personality: list[str],
        dialogue_hooks: dict,
        narrative_context: dict,
        scene_beat: str,
        mechanic: str,
        mechanic_hint: str,
        rng: random.Random,
    ) -> dict:
        """
        Generate dialogue using seeded RNG (FIX #3) and narrative context (FIX #6).
        """
        role_dialogues = DEFAULT_DIALOGUES.get(role, DEFAULT_DIALOGUES["villager"])

        dialogue = {
            "npc_id": npc_id,
            "role": role,
            "personality": personality,
            "narrative_beat": scene_beat,
            "lines": [],
        }

        for hook, enabled in dialogue_hooks.items():
            if not enabled:
                continue

            # Map hooks to dialogue keys
            key_mapping = {
                "greeting": "greeting",
                "quest_intro": "quest_intro",
                "quest_accept": "quest_accept",
                "quest_complete": "quest_complete",
                "tutorial_intro": "tutorial_intro",
                "tutorial_encourage": "tutorial_encourage",
                "tutorial_complete": "tutorial_complete",
                "trade_offer": "trade_offer",
                "trade_success": "trade_success",
                "grant_passage": "grant_passage",
                "deny_passage": "deny_passage",
                "hint": "hint",
                "farewell": "farewell",
                "mechanic_hint": "hint",
            }

            dialogue_key = key_mapping.get(hook, hook)

            # FIX #6: Use narrative-aware greeting if context available
            if dialogue_key == "greeting" and narrative_context.get("goal_short"):
                text = self._narrative_greeting(role, narrative_context, rng)
            elif hook == "mechanic_hint" and mechanic_hint:
                # Use mechanic-specific hint from npc_mechanic_mapping
                text = mechanic_hint
            elif dialogue_key in role_dialogues:
                options = role_dialogues[dialogue_key]
                # FIX #3: seeded RNG instead of random.choice
                text = rng.choice(options) if options else ""
            else:
                continue

            if text:
                dialogue["lines"].append(
                    {
                        "type": hook,
                        "text": text,
                        "trigger": self._get_trigger(hook),
                    }
                )

        # Add role-specific extra lines
        self._add_role_extras(dialogue, role, role_dialogues, rng)

        return dialogue

    def _narrative_greeting(
        self,
        role: str,
        narrative_context: dict,
        rng: random.Random,
    ) -> str:
        """
        FIX #6: Generate greeting that references the game's narrative.
        """
        templates = NARRATIVE_GREETING_TEMPLATES.get(role)
        if not templates:
            # Fall back to default
            defaults = DEFAULT_DIALOGUES.get(role, DEFAULT_DIALOGUES["villager"])
            options = defaults.get("greeting", ["Hello!"])
            return rng.choice(options)

        template = rng.choice(templates)

        # Fill in narrative placeholders
        try:
            text = template.format(
                story_context=narrative_context.get("story_context", ""),
                goal_short=narrative_context.get("goal_short", "help"),
            )
        except (KeyError, IndexError):
            text = template  # Use raw if formatting fails

        # Clean up double spaces from empty placeholders
        text = " ".join(text.split())

        return text

    def _add_role_extras(
        self,
        dialogue: dict,
        role: str,
        role_dialogues: dict,
        rng: random.Random,
    ):
        """Add role-specific extra dialogue lines."""
        if role == "quest_giver":
            for key in ["quest_accept", "quest_complete"]:
                if key in role_dialogues:
                    # Check not already added
                    existing_types = {l["type"] for l in dialogue["lines"]}
                    if key not in existing_types:
                        dialogue["lines"].append(
                            {
                                "type": key,
                                "text": rng.choice(role_dialogues[key]),
                                "trigger": (
                                    "quest_accepted"
                                    if "accept" in key
                                    else "quest_completed"
                                ),
                            }
                        )

        elif role == "trainer":
            for key in ["tutorial_encourage", "tutorial_complete"]:
                if key in role_dialogues:
                    existing_types = {l["type"] for l in dialogue["lines"]}
                    if key not in existing_types:
                        dialogue["lines"].append(
                            {
                                "type": key,
                                "text": rng.choice(role_dialogues[key]),
                                "trigger": (
                                    "tutorial_progress"
                                    if "encourage" in key
                                    else "tutorial_completed"
                                ),
                            }
                        )

    def _get_trigger(self, hook: str) -> str:
        """Get trigger event for a dialogue type."""
        triggers = {
            "greeting": "on_interact",
            "quest_intro": "on_interact",
            "quest_accept": "quest_accepted",
            "quest_complete": "quest_completed",
            "tutorial_intro": "on_interact",
            "tutorial_encourage": "tutorial_progress",
            "tutorial_complete": "tutorial_completed",
            "trade_offer": "on_interact",
            "trade_success": "trade_completed",
            "grant_passage": "challenge_completed",
            "deny_passage": "on_interact",
            "hint": "on_stuck",
            "mechanic_hint": "on_stuck",
            "farewell": "on_leave",
        }
        return triggers.get(hook, "on_interact")

    def _validate_output(
        self,
        output: dict,
        state: PipelineState,
    ) -> tuple[bool, list[str]]:
        """Validate dialogue generation output."""
        errors = []

        dialogue_by_npc = {do.npc_id: do.dialogue for do in state.dialogue_outputs}

        for scene_idx, npcs in enumerate(state.scene_npcs):
            for npc in npcs:
                if not isinstance(npc, dict):
                    continue
                npc_id = npc.get("npc_id")
                if npc_id and npc_id not in dialogue_by_npc:
                    errors.append(f"NPC {npc_id} has no dialogue generated")

        for npc_id, dialogue in dialogue_by_npc.items():
            if not dialogue.get("lines"):
                errors.append(f"NPC {npc_id} has empty dialogue")

        return len(errors) == 0, errors
