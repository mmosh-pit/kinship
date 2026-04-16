"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    CHALLENGE AGENT (FIXED)                                    ║
║                                                                               ║
║  ZERO AI calls for structure. System-only challenge generation.               ║
║                                                                               ║
║  FLOW:                                                                        ║
║  1. Read mechanic_sequence from PlannerOutput                                 ║
║  2. For each mechanic, get template from challenge_templates                  ║
║  3. Use mechanic_matcher to map REAL assets to object slots                   ║
║  4. Fill template with constrained params (difficulty-scaled)                 ║
║  5. Validate with validate_filled_challenge                                   ║
║  6. System provides flavor text (names, hints) — no Claude needed             ║
║                                                                               ║
║  WHAT CHANGED:                                                                ║
║  • Removed _analyze_prompt_for_challenges (was calling Claude)                ║
║  • Removed _create_dynamic_challenge (was calling Claude)                     ║
║  • Now uses _fill_template_strict which was dead code before                  ║
║  • Now uses mechanic_matcher.get_assets_for_mechanic for real assets          ║
║  • Reads planner's mechanic_sequence — no longer ignores the plan             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional
import logging

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult
from app.pipeline.pipeline_state import PipelineState, PipelineStage, ChallengeOutput
from app.core.challenge_templates import (
    get_template,
    get_all_templates,
    create_filled_challenge,
    validate_filled_challenge,
    calculate_rewards,
    PARAMETER_CONSTRAINTS,
    Difficulty,
    ChallengeTemplate,
)
from app.core.tutorial_generator import (
    needs_tutorial,
    get_tutorial,
    get_simplified_params,
)
from app.core.mechanics import get_mechanic, ALL_MECHANICS
from app.services.mechanic_matcher import (
    get_assets_for_mechanic,
    can_use_mechanic,
    build_affordance_map,
    match_mechanic,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  SYSTEM-PROVIDED FLAVOR TEXT (no AI needed)
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_CHALLENGE_NAMES = {
    "push_to_target": ["Stone Puzzle", "Block Slide", "Path Builder", "Rock Moving"],
    "collect_items": ["Gather Quest", "Collection", "Scavenger Hunt", "Find Them All"],
    "collect_all": ["Hidden Treasure", "Secret Search", "Find Every One"],
    "key_unlock": ["Locked Path", "Find the Key", "Unlock the Way", "Key Hunt"],
    "sequence_activate": [
        "Memory Puzzle",
        "Pattern Lock",
        "Sequence Master",
        "Order Matters",
    ],
    "pressure_plate": ["Weight Puzzle", "Hold It Down", "Pressure Point", "Heavy Duty"],
    "avoid_hazard": ["Danger Zone", "Watch Your Step", "Safe Passage", "Hazard Run"],
    "reach_destination": [
        "Journey's End",
        "Find the Exit",
        "Destination",
        "The Path Forward",
    ],
    "deliver_item": [
        "Delivery Quest",
        "Special Delivery",
        "Bring It Home",
        "Package Run",
    ],
    "escort_npc": ["Safe Escort", "Protect the Traveler", "Guide Them Home"],
    "trade_items": ["Fair Trade", "Merchant Deal", "Exchange", "Barter"],
    "talk_to_npc": ["Friendly Chat", "Conversation", "Meet and Greet"],
    "stack_climb": ["Stack Up", "Climb High", "Tower Builder"],
    "bridge_gap": ["Bridge Builder", "Cross the Gap", "Span the Divide"],
    "lever_activate": ["Pull the Lever", "Switch It", "Activate!"],
    "attack_enemy": ["Battle Time", "Defeat the Foe", "Combat Challenge"],
    "defend_position": ["Hold the Line", "Defense Mode", "Stand Guard"],
    "plant_seed": ["Planting Time", "Green Thumb", "Seed Sower"],
    "harvest_crop": ["Harvest Time", "Reap the Rewards"],
    "combine_items": ["Crafting Time", "Mix and Match", "Creation Station"],
    "cook_recipe": ["Cooking Challenge", "Chef's Special"],
    "befriend_npc": ["Make a Friend", "Friendship Quest"],
    "gift_giving": ["Gift Exchange", "Kind Gesture"],
    "pattern_match": ["Pattern Puzzle", "Match Maker"],
    "light_reflect": ["Light Puzzle", "Mirror Master"],
    "weight_balance": ["Balance Act", "Scale Puzzle"],
}

DEFAULT_HINTS = {
    "push_to_target": "Push the objects toward the glowing area",
    "collect_items": "Find and collect all the items scattered around",
    "collect_all": "Search carefully — some items are hidden!",
    "key_unlock": "Find the key to unlock the path forward",
    "sequence_activate": "Activate the switches in the correct order",
    "pressure_plate": "Something heavy needs to stay on the plate",
    "avoid_hazard": "Time your movement to avoid the dangers",
    "reach_destination": "Find your way to the goal",
    "deliver_item": "Pick up the item and bring it to the destination",
    "escort_npc": "Keep them safe as you guide them",
    "trade_items": "Gather items to trade with the merchant",
    "talk_to_npc": "Approach and talk to the character",
    "stack_climb": "Stack objects to reach the high area",
    "bridge_gap": "Use objects to create a bridge across the gap",
    "lever_activate": "Find and pull the lever to open the way",
    "attack_enemy": "Defeat the enemies to proceed",
    "defend_position": "Protect this area from attackers",
    "plant_seed": "Plant the seeds in the prepared soil",
    "harvest_crop": "Harvest the ready crops",
    "combine_items": "Combine the right ingredients",
    "cook_recipe": "Cook the ingredients in the right order",
    "befriend_npc": "Talk kindly to make a new friend",
    "gift_giving": "Find the right gift to give",
    "pattern_match": "Arrange objects to match the pattern",
    "light_reflect": "Aim the mirrors to direct light to the target",
    "weight_balance": "Place weights to balance the scale",
}

FALLBACK_MECHANIC = "collect_items"


class ChallengeAgent(BaseAgent):
    """
    Challenge generation using TEMPLATES ONLY.

    FLOW:
    1. Planner decides mechanic_sequence based on affordances
    2. This agent fills templates for those mechanics
    3. mechanic_matcher maps real assets to object slots
    4. System enforces constraints
    5. Zero Claude calls

    AI is NOT used here. Flavor text comes from dictionaries.
    """

    @property
    def name(self) -> str:
        return "challenge_agent"

    async def _execute(self, state: PipelineState) -> dict:
        """
        Generate challenges STRICTLY from templates using planner's mechanic sequence.
        """
        logger.info("═══════════════════════════════════════════")
        logger.info("  CHALLENGE AGENT — TEMPLATE-ONLY MODE")
        logger.info("═══════════════════════════════════════════")

        input_cfg = state.input
        rng = state.get_rng()

        # ── Step 1: Get mechanic sequence from planner ────────────────────
        mechanics = self._get_scene_mechanics_from_planner(state)
        logger.info(f"Mechanic sequence from planner: {mechanics}")

        if not mechanics:
            logger.warning(
                "No mechanic sequence from planner, using affordance fallback"
            )
            mechanics = self._affordance_fallback(state)
            logger.info(f"Affordance fallback mechanics: {mechanics}")

        # ── Step 2: Validate mechanics have matching assets ───────────────
        assets = list(input_cfg.assets)
        validated_mechanics = self._validate_mechanics_against_assets(mechanics, assets)
        logger.info(
            f"Validated mechanics (have matching assets): {validated_mechanics}"
        )

        if not validated_mechanics:
            logger.warning("No mechanics match assets, using safe defaults")
            validated_mechanics = self._safe_default_mechanics(state)

        # ── Step 3: Distribute mechanics across scenes ────────────────────
        scene_mechanic_map = self._distribute_mechanics(
            validated_mechanics, input_cfg.num_scenes
        )
        logger.info(f"Mechanics per scene: {scene_mechanic_map}")

        # ── Step 4: Fill templates for each scene ─────────────────────────
        challenge_outputs: list[ChallengeOutput] = []

        for scene_idx in range(input_cfg.num_scenes):
            scene_mechanics = scene_mechanic_map.get(scene_idx, [])
            challenges = []
            tutorials = []

            # Get difficulty range for this scene
            difficulty_range = self._get_difficulty_range(state, scene_idx)

            for mech_idx, mechanic_id in enumerate(scene_mechanics):
                # Check if tutorial needed (first appearance of mechanic)
                if input_cfg.enable_tutorials and self._is_first_appearance(
                    mechanic_id, scene_idx, scene_mechanic_map
                ):
                    tutorial = self._create_tutorial(mechanic_id, scene_idx)
                    if tutorial:
                        tutorials.append(tutorial)

                # Fill template — THIS IS THE KEY FUNCTION
                challenge = self._fill_template_strict(
                    mechanic_id=mechanic_id,
                    difficulty_range=difficulty_range,
                    scene_idx=scene_idx,
                    challenge_idx=mech_idx,
                    assets=assets,
                    rng=rng,
                )

                if challenge:
                    # Validate filled challenge
                    validation = validate_filled_challenge(challenge["_filled"])
                    if validation["valid"]:
                        # Remove internal data before storing
                        del challenge["_filled"]
                        challenges.append(challenge)
                        logger.info(
                            f"  Scene {scene_idx}: ✓ {mechanic_id} → "
                            f"'{challenge['name']}' (difficulty={challenge['difficulty']})"
                        )
                    else:
                        logger.warning(
                            f"  Scene {scene_idx}: ✗ {mechanic_id} failed validation: "
                            f"{validation['errors']}"
                        )
                        # Apply constraint enforcement and retry
                        if validation.get("enforced_params"):
                            challenge["params"] = validation["enforced_params"]
                            del challenge["_filled"]
                            challenges.append(challenge)
                            logger.info(
                                f"    → Constraints enforced, challenge accepted"
                            )
                else:
                    logger.warning(
                        f"  Scene {scene_idx}: ✗ {mechanic_id} — no template"
                    )

            # Fallback: every scene must have at least one challenge
            if not challenges:
                logger.warning(f"  Scene {scene_idx}: No challenges, adding fallback")
                fallback = self._create_fallback_challenge(scene_idx, rng)
                challenges.append(fallback)

            challenge_output = ChallengeOutput(
                scene_index=scene_idx,
                challenges=tuple(challenges),
                tutorials=tuple(tutorials),
                mechanics_used=tuple(c["mechanic_id"] for c in challenges),
            )
            challenge_outputs.append(challenge_output)

        state.challenge_outputs = challenge_outputs

        total = sum(len(o.challenges) for o in challenge_outputs)
        logger.info(
            f"═══ Generated {total} challenges across {input_cfg.num_scenes} scenes ═══"
        )

        return {
            "challenges_generated": total,
            "mechanics_used": list(
                set(c["mechanic_id"] for o in challenge_outputs for c in o.challenges)
            ),
        }

    # ═══════════════════════════════════════════════════════════════════════
    #  STEP 1: GET MECHANICS FROM PLANNER
    # ═══════════════════════════════════════════════════════════════════════

    def _get_scene_mechanics_from_planner(self, state: PipelineState) -> list[str]:
        """
        Get mechanic sequence from PlannerOutput.
        This is the planner's plan — we FOLLOW it, not ignore it.
        """
        sequence = state.get_mechanic_sequence()
        if sequence:
            logger.info(f"Using planner mechanic_sequence: {sequence}")
            return sequence

        logger.warning("No mechanic_sequence in planner output")
        return []

    def _affordance_fallback(self, state: PipelineState) -> list[str]:
        """
        Fallback: use mechanic_matcher to find mechanics that work with assets.
        Only used if planner produced no sequence.
        """
        assets = list(state.input.assets)
        if not assets:
            return [FALLBACK_MECHANIC]

        affordance_map = build_affordance_map(assets)

        # Score all mechanics against assets
        valid = []
        for mech_id, mechanic in ALL_MECHANICS.items():
            result = match_mechanic(mechanic, affordance_map)
            if result.is_valid:
                valid.append((mech_id, result.compatibility_score))

        # Sort by score, take top N
        valid.sort(key=lambda x: x[1], reverse=True)
        top = [m[0] for m in valid[: state.input.num_scenes + 1]]

        return top if top else [FALLBACK_MECHANIC]

    # ═══════════════════════════════════════════════════════════════════════
    #  STEP 2: VALIDATE MECHANICS AGAINST ASSETS
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_mechanics_against_assets(
        self, mechanics: list[str], assets: list[dict]
    ) -> list[str]:
        """
        Filter mechanics to only those with matching asset affordances.
        This is the HARD enforcement — no exceptions.
        """
        validated = []
        for mech_id in mechanics:
            if can_use_mechanic(mech_id, assets):
                validated.append(mech_id)
            else:
                logger.warning(f"Mechanic '{mech_id}' has no matching assets — REMOVED")
        return validated

    def _safe_default_mechanics(self, state: PipelineState) -> list[str]:
        """
        Last-resort fallback: mechanics that require no specific affordances.
        """
        # These mechanics work with any assets or none
        safe = ["reach_destination", "talk_to_npc"]

        # Try collect_items if any asset has 'collect' affordance
        assets = list(state.input.assets)
        if can_use_mechanic("collect_items", assets):
            safe.insert(0, "collect_items")

        return safe

    # ═══════════════════════════════════════════════════════════════════════
    #  STEP 3: DISTRIBUTE MECHANICS ACROSS SCENES
    # ═══════════════════════════════════════════════════════════════════════

    def _distribute_mechanics(
        self, mechanics: list[str], num_scenes: int
    ) -> dict[int, list[str]]:
        """
        Distribute mechanics across scenes evenly.
        Each scene gets at least one mechanic.
        """
        scene_map: dict[int, list[str]] = {i: [] for i in range(num_scenes)}

        if not mechanics:
            for i in range(num_scenes):
                scene_map[i] = [FALLBACK_MECHANIC]
            return scene_map

        # Round-robin distribution
        for i, mech in enumerate(mechanics):
            scene_idx = i % num_scenes
            scene_map[scene_idx].append(mech)

        # Ensure every scene has at least one
        for i in range(num_scenes):
            if not scene_map[i]:
                # Reuse first mechanic or fallback
                scene_map[i] = [mechanics[0] if mechanics else FALLBACK_MECHANIC]

        return scene_map

    # ═══════════════════════════════════════════════════════════════════════
    #  STEP 4: FILL TEMPLATE (THE KEY FUNCTION)
    # ═══════════════════════════════════════════════════════════════════════

    def _fill_template_strict(
        self,
        mechanic_id: str,
        difficulty_range: dict,
        scene_idx: int,
        challenge_idx: int,
        assets: list[dict],
        rng,
    ) -> Optional[dict]:
        """
        Fill a challenge template with STRICTLY CONSTRAINED parameters.

        Uses:
        - challenge_templates for structure + constraints
        - mechanic_matcher for real asset mapping
        - difficulty_range for parameter scaling
        - seeded RNG for determinism

        NEVER exceeds PARAMETER_CONSTRAINTS bounds.
        """
        # Get template (references mechanic as single source of truth)
        template = get_template(mechanic_id)
        if not template:
            logger.warning(f"No template for mechanic: {mechanic_id}")
            return None

        # Get mechanic
        mechanic = get_mechanic(mechanic_id)
        if not mechanic:
            logger.warning(f"Mechanic not found: {mechanic_id}")
            return None

        # ── Map real assets to object slots ───────────────────────────────
        slot_assets = get_assets_for_mechanic(mechanic_id, assets)
        asset_objects = []
        for slot_name, asset_names in slot_assets.items():
            slot = mechanic.object_slots.get(slot_name)
            if slot and asset_names:
                # Pick asset using seeded RNG
                chosen_asset = rng.choice(asset_names)
                asset_objects.append(
                    {
                        "slot": slot_name,
                        "asset_name": chosen_asset,
                        "count": slot.min_count,  # Will be adjusted by params
                    }
                )

        # ── Calculate parameters based on difficulty ──────────────────────
        target_complexity = difficulty_range.get("target_complexity", 3)

        # Use template's scaling for the appropriate difficulty level
        if target_complexity <= 3:
            difficulty = Difficulty.EASY
        elif target_complexity <= 6:
            difficulty = Difficulty.MEDIUM
        else:
            difficulty = Difficulty.HARD

        # Get scaled params from template
        scaled_params = template.get_scaled_params(difficulty)
        params = dict(scaled_params)  # Copy

        # If no scaled params, calculate from constraints
        if not params:
            for param_name, constraint in template.constraints.items():
                scale_factor = target_complexity / 10.0
                value = constraint.min_value + int(
                    (constraint.max_value - constraint.min_value) * scale_factor
                )
                value = max(constraint.min_value, min(constraint.max_value, value))
                params[param_name] = value

        # ── Create filled challenge using template system ─────────────────
        name = self._generate_name(mechanic_id, rng)
        hint = DEFAULT_HINTS.get(mechanic_id, "Complete the challenge")
        description = f"Complete the {mechanic_id.replace('_', ' ')} challenge"

        try:
            filled = create_filled_challenge(
                mechanic_id=mechanic_id,
                name=name,
                description=description,
                difficulty=difficulty,
                params=params,
                hints=[hint],
            )
        except Exception as e:
            logger.error(f"create_filled_challenge failed for {mechanic_id}: {e}")
            return None

        # ── Build output dict ─────────────────────────────────────────────
        rewards = calculate_rewards(template, difficulty)

        return {
            "challenge_id": f"challenge_{scene_idx}_{challenge_idx}_{mechanic_id}",
            "template_id": mechanic_id,
            "mechanic_id": mechanic_id,
            "name": name,
            "description": description,
            "hint": hint,
            "hints": [hint],
            "params": filled.params,
            "difficulty": difficulty.value,
            "difficulty_score": filled.difficulty_score,
            "complexity": target_complexity,
            "rewards": rewards,
            "scene_index": scene_idx,
            "zone_hint": "challenge_zone",
            # Real asset mapping from mechanic_matcher
            "object_assignments": asset_objects,
            # Internal: for validation (removed before storage)
            "_filled": filled,
        }

    # ═══════════════════════════════════════════════════════════════════════
    #  HELPERS
    # ═══════════════════════════════════════════════════════════════════════

    def _get_difficulty_range(self, state: PipelineState, scene_idx: int) -> dict:
        """Get difficulty range for a scene from planner output."""
        difficulties = state.get_scene_difficulties()
        if scene_idx < len(difficulties):
            return difficulties[scene_idx].get("range", {})
        # Progressive fallback
        return {
            "min_complexity": max(1, scene_idx),
            "max_complexity": min(10, scene_idx + 4),
            "target_complexity": min(8, scene_idx + 2),
        }

    def _is_first_appearance(
        self, mechanic_id: str, scene_idx: int, scene_map: dict
    ) -> bool:
        """Check if this is the first scene where this mechanic appears."""
        for i in range(scene_idx):
            if mechanic_id in scene_map.get(i, []):
                return False
        return True

    def _create_tutorial(self, mechanic_id: str, scene_idx: int) -> Optional[dict]:
        """Create a tutorial entry for a mechanic."""
        if not needs_tutorial(mechanic_id):
            return None

        tutorial = get_tutorial(mechanic_id)
        if not tutorial:
            return None

        return {
            "mechanic_id": mechanic_id,
            "tutorial_id": (
                tutorial.tutorial_id
                if hasattr(tutorial, "tutorial_id")
                else f"tutorial_{mechanic_id}"
            ),
            "scene_index": scene_idx,
            "is_tutorial": True,
        }

    def _generate_name(self, mechanic_id: str, rng) -> str:
        """Generate challenge name using seeded RNG. No AI."""
        names = DEFAULT_CHALLENGE_NAMES.get(mechanic_id, ["Challenge"])
        return rng.choice(names)

    def _create_fallback_challenge(self, scene_idx: int, rng) -> dict:
        """Create a minimal valid challenge as last resort."""
        return {
            "challenge_id": f"challenge_{scene_idx}_0_reach_destination",
            "template_id": "reach_destination",
            "mechanic_id": "reach_destination",
            "name": rng.choice(DEFAULT_CHALLENGE_NAMES["reach_destination"]),
            "description": "Find your way to the goal",
            "hint": DEFAULT_HINTS["reach_destination"],
            "hints": [DEFAULT_HINTS["reach_destination"]],
            "params": {"distance": 5, "obstacles": 0, "hazards": 0},
            "difficulty": "easy",
            "difficulty_score": 20,
            "complexity": 1,
            "rewards": {"score_points": 80, "hearts_reward": {"R": 5}},
            "scene_index": scene_idx,
            "zone_hint": "challenge_zone",
            "object_assignments": [],
        }

    # ═══════════════════════════════════════════════════════════════════════
    #  VALIDATION
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_output(
        self, output: dict, state: PipelineState
    ) -> tuple[bool, list[str]]:
        """
        Validate challenge generation output.

        Checks:
        1. Every scene has at least one challenge
        2. Every challenge has a valid template
        3. Every challenge mechanic is from the planner's sequence (if available)
        4. Params are within constraints
        """
        errors = []

        # Check scene coverage
        for i in range(state.input.num_scenes):
            scene_has_challenge = any(
                co.scene_index == i and len(co.challenges) > 0
                for co in state.challenge_outputs
            )
            if not scene_has_challenge:
                errors.append(f"Scene {i} has no challenges")

        # Validate each challenge
        planner_mechanics = set(state.get_mechanic_sequence())

        for co in state.challenge_outputs:
            for challenge in co.challenges:
                if not isinstance(challenge, dict):
                    errors.append(f"Challenge is not a dict: {type(challenge)}")
                    continue

                mech_id = challenge.get("mechanic_id", "")

                # Template must exist
                if not get_template(mech_id):
                    errors.append(f"Invalid template: {mech_id}")

                # Mechanic should be from planner (warning, not error)
                if planner_mechanics and mech_id not in planner_mechanics:
                    logger.warning(
                        f"Challenge uses {mech_id} which is not in planner sequence"
                    )

                # Params within constraints
                template = get_template(mech_id)
                if template:
                    params = challenge.get("params", {})
                    _, modifications = template.enforce_constraints(params)
                    for mod in modifications:
                        logger.warning(f"Constraint enforced: {mod}")

        return len(errors) == 0, errors
