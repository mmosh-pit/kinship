"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    NPC AGENT                                                  ║
║                                                                               ║
║  Places NPCs in scenes and assigns roles based on MECHANICS.                  ║
║                                                                               ║
║  KEY PRINCIPLE:                                                               ║
║  • NPC roles DEPEND on challenge mechanics                                    ║
║  • push_to_target → guide/trainer                                             ║
║  • trade_items → merchant                                                     ║
║  • key_unlock → guardian                                                      ║
║                                                                               ║
║  Without this, NPCs become random flavor text.                                ║
║                                                                               ║
║  PRODUCES: NPCOutput (immutable)                                              ║
║  DOES NOT: Modify shared state                                                ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional
import logging
import random

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult
from app.pipeline.pipeline_state import PipelineState, PipelineStage, NPCOutput
from app.core.npc_templates import (
    get_npc_template,
    NPCRole,
    NPC_TEMPLATES,
)
from app.core.npc_behaviors import (
    get_behavior_for_role,
    BehaviorState,
)
from app.core.npc_mechanic_mapping import (
    get_npc_role_for_mechanic,
    get_required_npcs_for_mechanics,
    get_dialogue_hooks_for_npc,
    get_mechanic_hint,
    SAFE_DEFAULT_NPCS,
    DEFAULT_NPC_ROLE,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  SAFE FALLBACK DEFAULTS
# ═══════════════════════════════════════════════════════════════════════════════

FALLBACK_NPC = {
    "role": "villager",
    "name": "Villager",
    "personality": ["friendly", "helpful"],
    "position_hint": "center",
}


# Default NPC names by role
DEFAULT_NPC_NAMES = {
    "guide": ["Elder Oak", "Sage", "Pathfinder", "The Guide", "Wanderer"],
    "quest_giver": ["Mayor", "Chief", "Elder", "The Seeker", "Troubled Soul"],
    "merchant": ["Trader", "Shopkeeper", "Merchant", "The Dealer", "Vendor"],
    "guardian": ["Gatekeeper", "Sentinel", "Watcher", "Guard", "Protector"],
    "trainer": ["Master", "Teacher", "Mentor", "Instructor", "Sensei"],
    "villager": ["Villager", "Farmer", "Citizen", "Local", "Resident"],
}

# Personality hints for dialogue generation
PERSONALITY_HINTS = {
    "guide": ["wise", "patient", "helpful", "experienced"],
    "quest_giver": ["worried", "hopeful", "urgent", "grateful"],
    "merchant": ["friendly", "shrewd", "cheerful", "business-minded"],
    "guardian": ["stern", "vigilant", "protective", "duty-bound"],
    "trainer": ["encouraging", "strict", "knowledgeable", "supportive"],
    "villager": ["curious", "friendly", "simple", "welcoming"],
}


class NPCAgent(BaseAgent):
    """
    Agent responsible for placing NPCs and assigning roles.

    MECHANIC AWARENESS: Roles are determined by challenge mechanics.
    PRODUCES: NPCOutput (immutable)
    """

    @property
    def name(self) -> str:
        return "npc_agent"

    async def _execute(self, state: PipelineState) -> dict:
        """
        Generate NPCs for each scene based on MECHANICS.

        Steps:
        1. Get mechanics per scene from challenge outputs
        2. Map mechanics to required NPC roles
        3. For each NPC:
           a. Assign role based on mechanic
           b. Assign semantic position (NOT coordinates)
           c. Generate name/personality
        """
        input_cfg = state.input
        rng = state.get_rng()  # Use seeded RNG

        # Get mechanics from challenge outputs
        scene_mechanics = self._get_scene_mechanics(state)

        # Get available NPC assets
        npc_assets = state.get_npc_assets()

        # Generate NPCs per scene
        npc_outputs: list[NPCOutput] = []

        for scene_idx in range(input_cfg.num_scenes):
            npcs = []

            # Get mechanics for this scene
            mechanics = scene_mechanics.get(scene_idx, [])

            # Map mechanics to NPC roles
            required_npcs = self._get_required_npcs_for_scene(
                mechanics, scene_idx, input_cfg.num_scenes, rng
            )

            for npc_req in required_npcs:
                role = npc_req.get("role", DEFAULT_NPC_ROLE)
                mechanic = npc_req.get("mechanic")

                # Semantic position (NOT coordinates)
                position_hint = self._get_position_hint(role, npc_req)

                # Get behavior
                behavior = self._get_behavior(role)

                # Match asset
                asset = self._match_asset(role, npc_assets, rng)

                # Generate name and personality
                name = self._generate_name(role, rng)
                personality = self._generate_personality(role, rng)

                # Dialogue hooks based on role + mechanic
                dialogue_hooks = get_dialogue_hooks_for_npc(role, mechanic)

                npc = {
                    "npc_id": f"npc_{scene_idx}_{role}_{len(npcs)}",
                    "role": role,
                    "name": name,
                    "position_hint": position_hint,  # SEMANTIC, not coordinates
                    "behavior": behavior,
                    "personality": personality,
                    "mechanic": mechanic,  # Which mechanic this NPC supports
                    "mechanic_hint": get_mechanic_hint(mechanic) if mechanic else None,
                    "asset_name": asset.get("name") if asset else f"npc_{role}",
                    "asset_id": asset.get("id") if asset else None,
                    "scene_index": scene_idx,
                    "dialogue_hooks": dialogue_hooks,
                }

                npcs.append(npc)

            # Create immutable output
            npc_output = NPCOutput(
                scene_index=scene_idx,
                npcs=tuple(npcs),
            )
            npc_outputs.append(npc_output)

        # Store outputs in state (immutable)
        state.npc_outputs = npc_outputs

        total_npcs = sum(len(o.npcs) for o in npc_outputs)

        return {
            "npcs_generated": total_npcs,
            "scenes_with_npcs": len([o for o in npc_outputs if o.npcs]),
            "roles_used": list(set(npc["role"] for o in npc_outputs for npc in o.npcs)),
        }

    def _get_scene_mechanics(self, state: PipelineState) -> dict[int, list[str]]:
        """Get mechanics per scene from challenge outputs."""
        scene_mechanics = {}

        for challenge_output in state.challenge_outputs:
            scene_idx = challenge_output.scene_index
            mechanics = list(challenge_output.mechanics_used)
            scene_mechanics[scene_idx] = mechanics

        # Fallback to planner output if no challenge outputs
        if not scene_mechanics and state.planner_output:
            mechs = list(state.planner_output.mechanic_sequence)
            for i in range(state.input.num_scenes):
                # Distribute mechanics
                start = i * len(mechs) // state.input.num_scenes
                end = (i + 1) * len(mechs) // state.input.num_scenes
                scene_mechanics[i] = mechs[start:end] if mechs else []

        return scene_mechanics

    def _get_required_npcs_for_scene(
        self,
        mechanics: list[str],
        scene_idx: int,
        total_scenes: int,
        rng: random.Random,
    ) -> list[dict]:
        """
        Get required NPCs for a scene based on mechanics.

        KEY: NPC roles are determined by mechanics, not randomly.
        """
        required = []

        # First scene always has a guide
        if scene_idx == 0:
            required.append(
                {
                    "role": "guide",
                    "mechanic": None,
                    "reason": "Introduction",
                    "position_hint": "near_spawn",
                }
            )

        # Map mechanics to NPC roles
        if mechanics:
            npcs_from_mechanics = get_required_npcs_for_mechanics(mechanics)

            # Don't duplicate guide
            for npc in npcs_from_mechanics:
                if npc["role"] == "guide" and scene_idx == 0:
                    # Already have guide
                    npc["mechanic"] = mechanics[0] if mechanics else None
                    continue
                required.append(npc)

        # Fallback: always have at least one NPC
        if not required:
            required = [FALLBACK_NPC.copy()]

        return required

    def _get_position_hint(self, role: str, npc_req: dict) -> str:
        """
        Get SEMANTIC position hint (not coordinates).

        Coordinates are computed later by zone_system.
        """
        # Check if specified in request
        if npc_req.get("position_hint"):
            return npc_req["position_hint"]

        # Default positions by role
        role_positions = {
            "guide": "near_spawn",
            "quest_giver": "center",
            "merchant": "northwest",
            "guardian": "near_exit",
            "trainer": "challenge_zone",
            "villager": "center",
        }

        return role_positions.get(role, "center")

    def _get_behavior(self, role: str) -> dict:
        """Get behavior configuration for NPC role."""
        behavior_def = get_behavior_for_role(role)

        if behavior_def:
            return {
                "behavior_id": behavior_def.behavior_id,
                "initial_state": behavior_def.initial_state.value,
                "detection_range": behavior_def.detection_range,
                "interaction_range": behavior_def.interaction_range,
            }

        # Default behavior
        return {
            "behavior_id": "villager",
            "initial_state": "idle",
            "detection_range": 4.0,
            "interaction_range": 2.0,
        }

    def _match_asset(
        self,
        role: str,
        npc_assets: list[dict],
        rng: random.Random,
    ) -> Optional[dict]:
        """Match an asset to an NPC role using seeded RNG."""
        if not npc_assets:
            return None

        # Look for asset matching role
        role_keywords = {
            "guide": ["guide", "sage", "elder", "old"],
            "quest_giver": ["quest", "mayor", "chief", "worried"],
            "merchant": ["merchant", "trader", "shop", "vendor"],
            "guardian": ["guard", "knight", "warrior", "sentinel"],
            "trainer": ["trainer", "master", "teacher"],
            "villager": ["villager", "farmer", "citizen", "npc"],
        }

        keywords = role_keywords.get(role, ["npc"])

        for asset in npc_assets:
            asset_name = asset.get("name", "").lower()
            asset_tags = [t.lower() for t in asset.get("tags", [])]

            for keyword in keywords:
                if keyword in asset_name or keyword in asset_tags:
                    return asset

        # Return random NPC asset using seeded RNG
        return rng.choice(npc_assets) if npc_assets else None

    def _generate_name(self, role: str, rng: random.Random) -> str:
        """Generate NPC name using seeded RNG."""
        names = DEFAULT_NPC_NAMES.get(role, ["Stranger"])
        return rng.choice(names)

    def _generate_personality(self, role: str, rng: random.Random) -> list[str]:
        """Generate personality hints using seeded RNG."""
        hints = PERSONALITY_HINTS.get(role, ["neutral"])
        count = min(len(hints), rng.randint(2, 3))
        return rng.sample(hints, count)

    def _validate_output(
        self,
        output: dict,
        state: PipelineState,
    ) -> tuple[bool, list[str]]:
        """Validate NPC generation output."""
        errors = []

        # Check first scene has at least one NPC
        if state.npc_outputs and len(state.npc_outputs[0].npcs) == 0:
            # Use fallback
            logger.warning("First scene has no NPCs, using fallback")

        # Validate each NPC
        for npc_output in state.npc_outputs:
            for npc in npc_output.npcs:
                if not npc.get("role"):
                    errors.append(f"NPC in scene {npc_output.scene_index} missing role")

                if not npc.get("position_hint"):
                    errors.append(f"NPC {npc.get('npc_id')} missing position_hint")

        return len(errors) == 0, errors
