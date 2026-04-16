"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    KINSHIP AI CLIENT                                          ║
║                                                                               ║
║  Real Claude API integration for game manifest generation                    ║
║  Generates complete games from natural language descriptions                 ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import os
import json
import logging
from typing import Optional, List, Dict, Any
from anthropic import Anthropic

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
#  AI CLIENT
# ═══════════════════════════════════════════════════════════════════════════════


class KinshipAI:
    """Real Claude AI client for game generation."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY required")
        self.client = Anthropic(api_key=self.api_key)
        self.model = "claude-sonnet-4-20250514"

    # ─────────────────────────────────────────────────────────────────────────────
    #  SYSTEM PROMPT
    # ─────────────────────────────────────────────────────────────────────────────

    SYSTEM_PROMPT = """You are Kinship Knowledge, an AI that generates complete educational game content for children ages 4-10.

OUTPUT FORMAT: You MUST respond with ONLY valid JSON. No markdown, no explanations, no code blocks. Just pure JSON.

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

MANIFEST STRUCTURE:
{
  "id": "unique-id",
  "name": "Game Name",
  "description": "Game description",
  "version": "1.0.0",
  "theme": "forest|underwater|space|village|etc",
  "start_scene": "scene-id",
  "settings": {
    "tile_width": 64,
    "tile_height": 32,
    "hearts": {
      "initial": {"H": 50, "E": 50, "A": 50, "R": 50, "T": 50, "Si": 50, "So": 50}
    }
  },
  "scenes": [...],
  "npcs": [...],
  "objects": [...],
  "dialogues": [...],
  "quests": [...],
  "challenges": [...],
  "items": [...],
  "routes": [...],
  "rules": [...],
  "scoreboard": {...}
}

Use descriptive IDs like "npc-bunny-mimi" not "npc-1".
Include ALL required fields.
"""

    # ─────────────────────────────────────────────────────────────────────────────
    #  GENERATE COMPLETE GAME
    # ─────────────────────────────────────────────────────────────────────────────

    async def generate_game(
        self,
        description: str,
        theme: str = "forest",
        available_assets: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Generate complete game manifest from description."""

        asset_context = ""
        if available_assets:
            asset_list = "\n".join(
                [
                    f"- {a['name']} (type: {a['type']}, id: {a['id']})"
                    for a in available_assets
                ]
            )
            asset_context = f"\n\nAVAILABLE ASSETS (use ONLY these):\n{asset_list}"

        prompt = f"""Generate a complete game manifest for:

DESCRIPTION: {description}

THEME: {theme}
{asset_context}

REQUIREMENTS:
1. Create 2-4 scenes with meaningful locations
2. Create 3-5 NPCs with context-aware behaviors:
   - Each NPC needs default_state with emotion and dialogue_id
   - Add 2-3 behaviors with different priorities and conditions
   - Add 2-4 interactions per NPC
3. Create 2-3 quests with clear objectives
4. Create 1-2 challenges (quiz, memory, matching, or sorting)
5. Create branching dialogues with choices that affect HEARTS
6. Create items needed for quests
7. Create routes between scenes (some locked by conditions)
8. Create at least 2 rules for game logic triggers
9. Configure the scoreboard with metrics

OUTPUT: Valid JSON only. No markdown. No explanations."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()

        # Clean up response if needed
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        return json.loads(text)

    # ─────────────────────────────────────────────────────────────────────────────
    #  GENERATE NPC
    # ─────────────────────────────────────────────────────────────────────────────

    async def generate_npc(
        self, npc_description: str, game_context: str, theme: str = "forest"
    ) -> Dict[str, Any]:
        """Generate a single context-aware NPC."""

        prompt = f"""Generate a context-aware NPC for a children's educational game.

NPC DESCRIPTION: {npc_description}
GAME CONTEXT: {game_context}
THEME: {theme}

REQUIREMENTS:
1. Create a friendly, age-appropriate character
2. Define default_state with emotion and animation
3. Create 3-5 behaviors with different priorities:
   - Priority 100: After major events (quest complete)
   - Priority 50: Based on items player has
   - Priority 25: Based on previous interactions
   - Priority 0: Default starting state
4. Each behavior has conditions, state, and available_interactions
5. Create 3-6 interactions with hearts_preview

OUTPUT: Valid JSON matching NPC schema. No markdown."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())

    # ─────────────────────────────────────────────────────────────────────────────
    #  GENERATE DIALOGUE
    # ─────────────────────────────────────────────────────────────────────────────

    async def generate_dialogue(
        self, context: str, speaker: str, emotion: str = "neutral", num_nodes: int = 5
    ) -> Dict[str, Any]:
        """Generate branching dialogue tree."""

        prompt = f"""Generate a branching dialogue for a children's game.

CONTEXT: {context}
SPEAKER: {speaker}
STARTING EMOTION: {emotion}

REQUIREMENTS:
1. Create {num_nodes}-{num_nodes + 3} dialogue nodes
2. Include 2-3 player choices at key moments
3. Choices should have different HEARTS effects
4. Include emotional responses from NPC
5. End with resolution or next steps

DIALOGUE STRUCTURE:
{{
  "id": "dlg-unique-id",
  "start_node": "node-1",
  "nodes": [
    {{
      "id": "node-1",
      "speaker": "{speaker}",
      "emotion": "{emotion}",
      "text": "...",
      "choices": [
        {{
          "text": "Player option",
          "next_node": "node-2",
          "hearts": {{"E": 5, "H": 3}}
        }}
      ],
      "next_node": null,
      "hearts": null,
      "events": []
    }}
  ]
}}

OUTPUT: Valid JSON only."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=4096,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())

    # ─────────────────────────────────────────────────────────────────────────────
    #  GENERATE CHALLENGE
    # ─────────────────────────────────────────────────────────────────────────────

    async def generate_challenge(
        self, challenge_type: str, topic: str, difficulty: str = "easy"
    ) -> Dict[str, Any]:
        """Generate a mini-game challenge."""

        type_configs = {
            "quiz": "questions with multiple choice answers (question, options array, correct index)",
            "sorting": "items array and correct_order array",
            "matching": "pairs array with left and right values",
            "memory": "cards array with items to match",
        }

        config_desc = type_configs.get(challenge_type, "custom challenge configuration")

        prompt = f"""Generate a {challenge_type} challenge for children.

TOPIC: {topic}
DIFFICULTY: {difficulty}
CHALLENGE TYPE: {challenge_type}
CONFIG NEEDS: {config_desc}

REQUIREMENTS:
1. Age-appropriate content (4-10 years)
2. Educational focus on SEL skills
3. Clear instructions in description
4. Appropriate rewards (HEARTS changes)
5. Fair pass_score for difficulty level

CHALLENGE STRUCTURE:
{{
  "id": "chal-unique-id",
  "name": "Challenge Name",
  "description": "What to do",
  "type": "{challenge_type}",
  "config": {{...}},
  "time_limit": 120,
  "max_score": 100,
  "pass_score": 70,
  "reward_hearts": {{"A": 5, "Si": 5}},
  "reward_items": [],
  "reward_xp": 25,
  "retry_allowed": true
}}

OUTPUT: Valid JSON only."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())

    # ─────────────────────────────────────────────────────────────────────────────
    #  GENERATE QUEST
    # ─────────────────────────────────────────────────────────────────────────────

    async def generate_quest(
        self,
        quest_description: str,
        available_npcs: List[str],
        available_items: List[str],
    ) -> Dict[str, Any]:
        """Generate a quest with objectives and rewards."""

        prompt = f"""Generate a quest for a children's educational game.

QUEST DESCRIPTION: {quest_description}
AVAILABLE NPCs: {', '.join(available_npcs)}
AVAILABLE ITEMS: {', '.join(available_items)}

REQUIREMENTS:
1. 2-4 clear objectives
2. Objectives can be: talk_to, collect, visit, challenge, interact
3. Meaningful HEARTS rewards
4. Age-appropriate story

QUEST STRUCTURE:
{{
  "id": "quest-unique-id",
  "name": "Quest Name",
  "description": "What the player needs to do",
  "icon": "scroll",
  "objectives": [
    {{
      "id": "obj-1",
      "description": "Do something",
      "type": "talk_to|collect|visit|challenge|interact",
      "target_id": "npc-id or item-id",
      "target_count": 1,
      "optional": false
    }}
  ],
  "reward_hearts": {{"H": 10, "E": 5}},
  "reward_items": [],
  "reward_xp": 50,
  "prerequisites": [],
  "auto_start": false,
  "hidden": false
}}

OUTPUT: Valid JSON only."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=2048,
            system=self.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())


# ═══════════════════════════════════════════════════════════════════════════════
#  SYNC WRAPPER (for non-async contexts)
# ═══════════════════════════════════════════════════════════════════════════════


class KinshipAISync:
    """Synchronous wrapper for KinshipAI."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY required")
        self.client = Anthropic(api_key=self.api_key)
        self.model = "claude-sonnet-4-20250514"

    def generate_game(
        self,
        description: str,
        theme: str = "forest",
        available_assets: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        """Generate complete game manifest from description (sync)."""

        asset_context = ""
        if available_assets:
            asset_list = "\n".join(
                [
                    f"- {a['name']} (type: {a['type']}, id: {a['id']})"
                    for a in available_assets
                ]
            )
            asset_context = f"\n\nAVAILABLE ASSETS (use ONLY these):\n{asset_list}"

        prompt = f"""Generate a complete game manifest for:

DESCRIPTION: {description}

THEME: {theme}
{asset_context}

REQUIREMENTS:
1. Create 2-4 scenes with meaningful locations
2. Create 3-5 NPCs with context-aware behaviors
3. Create 2-3 quests with clear objectives
4. Create 1-2 challenges (quiz, memory, matching, or sorting)
5. Create branching dialogues with choices that affect HEARTS
6. Create items needed for quests
7. Create routes between scenes
8. Create rules for game logic
9. Configure the scoreboard

OUTPUT: Valid JSON only. No markdown."""

        response = self.client.messages.create(
            model=self.model,
            max_tokens=8192,
            system=KinshipAI.SYSTEM_PROMPT,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]

        return json.loads(text.strip())


# ═══════════════════════════════════════════════════════════════════════════════
#  CLI TOOL
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python ai_client.py 'game description'")
        print("Example: python ai_client.py 'A forest adventure about helping animals'")
        sys.exit(1)

    description = " ".join(sys.argv[1:])

    try:
        ai = KinshipAISync()
        print(f"Generating game: {description}")
        print("Please wait...")

        manifest = ai.generate_game(description)

        print(json.dumps(manifest, indent=2))

        # Save to file
        with open("generated_manifest.json", "w") as f:
            json.dump(manifest, f, indent=2)
        print("\nSaved to generated_manifest.json")

    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)
