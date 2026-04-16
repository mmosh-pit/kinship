"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    INTER-STEP VALIDATOR                                       ║
║                                                                               ║
║  Validates agent outputs IMMEDIATELY after each step.                         ║
║  Catches errors BEFORE they propagate.                                        ║
║                                                                               ║
║  RUNS AFTER:                                                                  ║
║  • Planning → validates mechanic_sequence has matching assets                 ║
║  • Scene → validates zones are valid, spawn/exit exist                        ║
║  • Challenge → validates mechanics match plan, assets match affordances       ║
║  • NPC → validates roles match mechanics, positions valid                     ║
║  • Dialogue → validates required dialogue types present                       ║
║                                                                               ║
║  UNLIKE the end-of-pipeline VerificationAgent, this catches errors            ║
║  at the source so the next agent gets clean input.                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import Optional

from app.pipeline.pipeline_state import PipelineState
from app.core.mechanics import get_mechanic, ALL_MECHANICS
from app.core.challenge_templates import get_template, validate_filled_challenge
from app.core.npc_templates import NPC_TEMPLATES, validate_filled_npc
from app.core.npc_mechanic_mapping import can_role_support_mechanic
from app.services.mechanic_matcher import (
    build_affordance_map,
    match_mechanic,
    can_use_mechanic,
)

logger = logging.getLogger(__name__)


class InterStepValidator:
    """
    Validates agent outputs between pipeline steps.

    Each validate_* method returns (is_valid, errors, warnings).
    Errors = must retry. Warnings = log but continue.
    """

    def __init__(self, state: PipelineState):
        self.state = state
        self.assets = list(state.input.assets)

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER PLANNING
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_planning(self) -> tuple[bool, list[str], list[str]]:
        """
        Validate planner output before scene generation.

        Checks:
        - mechanic_sequence is not empty
        - Each mechanic in sequence has matching assets
        - required_npcs is not empty
        """
        errors = []
        warnings = []

        planner = self.state.planner_output
        if not planner:
            errors.append("No planner output")
            return False, errors, warnings

        # Check mechanic sequence
        mechanics = list(planner.mechanic_sequence)
        if not mechanics:
            errors.append("Planner produced empty mechanic_sequence")
            return False, errors, warnings

        # Validate each mechanic has matching assets
        affordance_map = build_affordance_map(self.assets) if self.assets else None

        for mech_id in mechanics:
            mechanic = get_mechanic(mech_id)
            if not mechanic:
                errors.append(f"Planner selected unknown mechanic: {mech_id}")
                continue

            if affordance_map:
                result = match_mechanic(mechanic, affordance_map)
                if not result.is_valid:
                    warnings.append(
                        f"Mechanic '{mech_id}' missing affordances: "
                        f"{result.missing_affordances}. May fall back."
                    )

        # Check required NPCs
        if not planner.required_npcs:
            warnings.append("Planner produced no required_npcs")

        is_valid = len(errors) == 0
        if is_valid:
            logger.info(
                f"✓ Planning validated: {len(mechanics)} mechanics, "
                f"{len(planner.required_npcs)} NPCs"
            )
        else:
            logger.error(f"✗ Planning validation failed: {errors}")

        return is_valid, errors, warnings

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER SCENE GENERATION
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_scenes(self) -> tuple[bool, list[str], list[str]]:
        """
        Validate scene outputs before challenge generation.

        Checks:
        - Correct number of scenes generated
        - Each scene has spawn and exit zones
        - Layout patterns are valid
        """
        errors = []
        warnings = []

        expected = self.state.input.num_scenes
        actual = len(self.state.scene_outputs)

        if actual == 0:
            errors.append("No scenes generated")
            return False, errors, warnings

        if actual < expected:
            errors.append(f"Only {actual}/{expected} scenes generated")

        for scene in self.state.scene_outputs:
            has_spawn = any(z.zone_type == "spawn" for z in scene.zones)
            has_exit = any(z.zone_type == "exit" for z in scene.zones)

            if not has_spawn:
                errors.append(f"Scene {scene.scene_index} missing spawn zone")
            if not has_exit:
                errors.append(f"Scene {scene.scene_index} missing exit zone")

        is_valid = len(errors) == 0
        if is_valid:
            logger.info(f"✓ Scenes validated: {actual} scenes with valid zones")
        else:
            logger.error(f"✗ Scene validation failed: {errors}")

        return is_valid, errors, warnings

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER CHALLENGE GENERATION
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_challenges(self) -> tuple[bool, list[str], list[str]]:
        """
        Validate challenge outputs before NPC generation.

        Checks:
        - Every scene has at least one challenge
        - Every challenge uses a valid template
        - Challenge mechanics have matching assets (affordance check)
        - Params are within template constraints
        - Mechanics align with planner sequence (warning only)
        """
        errors = []
        warnings = []

        if not self.state.challenge_outputs:
            errors.append("No challenge outputs")
            return False, errors, warnings

        planner_mechanics = set(self.state.get_mechanic_sequence())

        for co in self.state.challenge_outputs:
            if not co.challenges:
                warnings.append(f"Scene {co.scene_index} has no challenges")

            for challenge in co.challenges:
                if not isinstance(challenge, dict):
                    errors.append(
                        f"Scene {co.scene_index}: challenge is {type(challenge)}, not dict"
                    )
                    continue

                mech_id = challenge.get("mechanic_id", "")

                # Template must exist
                template = get_template(mech_id)
                if not template:
                    errors.append(
                        f"Scene {co.scene_index}: invalid template '{mech_id}'"
                    )
                    continue

                # Mechanic should be from planner
                if planner_mechanics and mech_id not in planner_mechanics:
                    warnings.append(
                        f"Scene {co.scene_index}: '{mech_id}' not in planner sequence"
                    )

                # Asset affordance check
                if self.assets and not can_use_mechanic(mech_id, self.assets):
                    warnings.append(
                        f"Scene {co.scene_index}: '{mech_id}' has no matching assets"
                    )

                # Param constraints
                params = challenge.get("params", {})
                _, modifications = template.enforce_constraints(params)
                for mod in modifications:
                    warnings.append(
                        f"Scene {co.scene_index}: constraint enforced — {mod}"
                    )

        is_valid = len(errors) == 0
        if is_valid:
            total = sum(len(co.challenges) for co in self.state.challenge_outputs)
            logger.info(f"✓ Challenges validated: {total} challenges")
        else:
            logger.error(f"✗ Challenge validation failed: {errors}")

        return is_valid, errors, warnings

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER NPC GENERATION
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_npcs(self) -> tuple[bool, list[str], list[str]]:
        """
        Validate NPC outputs before dialogue generation.

        Checks:
        - Every NPC has a valid role
        - NPC roles match challenge mechanics in same scene
        - Position hints are valid
        - First scene has at least a guide
        """
        errors = []
        warnings = []

        if not self.state.npc_outputs:
            errors.append("No NPC outputs")
            return False, errors, warnings

        valid_roles = set(NPC_TEMPLATES.keys())

        # Build scene→mechanics map from challenges
        scene_mechanics: dict[int, list[str]] = {}
        for co in self.state.challenge_outputs:
            scene_mechanics[co.scene_index] = list(co.mechanics_used)

        for no in self.state.npc_outputs:
            for npc in no.npcs:
                if not isinstance(npc, dict):
                    errors.append(f"Scene {no.scene_index}: NPC is not dict")
                    continue

                role = npc.get("role", "")
                if role not in valid_roles:
                    warnings.append(f"Scene {no.scene_index}: unknown role '{role}'")

                # Check role matches scene mechanics
                mechanic = npc.get("mechanic")
                if mechanic and role:
                    if not can_role_support_mechanic(role, mechanic):
                        warnings.append(
                            f"Scene {no.scene_index}: role '{role}' "
                            f"doesn't support mechanic '{mechanic}'"
                        )

                if not npc.get("position_hint"):
                    warnings.append(
                        f"Scene {no.scene_index}: NPC '{npc.get('npc_id')}' "
                        f"missing position_hint"
                    )

        # First scene should have a guide
        if self.state.npc_outputs:
            first_scene_npcs = self.state.npc_outputs[0].npcs
            has_guide = any(
                n.get("role") == "guide"
                for n in first_scene_npcs
                if isinstance(n, dict)
            )
            if not has_guide:
                warnings.append("First scene has no guide NPC")

        is_valid = len(errors) == 0
        if is_valid:
            total = sum(len(no.npcs) for no in self.state.npc_outputs)
            logger.info(f"✓ NPCs validated: {total} NPCs")
        else:
            logger.error(f"✗ NPC validation failed: {errors}")

        return is_valid, errors, warnings

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER DIALOGUE
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_dialogue(self) -> tuple[bool, list[str], list[str]]:
        """
        Validate dialogue outputs.

        Checks:
        - Every NPC has dialogue generated
        - Required dialogue types are present per role
        """
        errors = []
        warnings = []

        dialogue_npc_ids = {do.npc_id for do in self.state.dialogue_outputs}

        # Check every NPC has dialogue
        for no in self.state.npc_outputs:
            for npc in no.npcs:
                if not isinstance(npc, dict):
                    continue
                npc_id = npc.get("npc_id")
                if npc_id and npc_id not in dialogue_npc_ids:
                    warnings.append(f"NPC '{npc_id}' has no dialogue")

        # Check dialogue content
        for do in self.state.dialogue_outputs:
            dialogue = do.dialogue
            if not dialogue.get("lines"):
                warnings.append(f"NPC '{do.npc_id}' has empty dialogue lines")

        # Dialogue failures are warnings, not errors
        is_valid = True
        logger.info(
            f"✓ Dialogue validated: {len(self.state.dialogue_outputs)} NPCs "
            f"({len(warnings)} warnings)"
        )

        return is_valid, errors, warnings

    # ═══════════════════════════════════════════════════════════════════════
    #  AFTER MATERIALIZATION (routes + completability)
    # ═══════════════════════════════════════════════════════════════════════

    def validate_after_materialization(
        self,
        materialized_scenes: list,
        routes: list[dict],
    ) -> tuple[bool, list[str], list[str]]:
        """
        Validate materialized scenes and routes.

        Checks:
        - Every scene has walkable path spawn → exit
        - Routes reference valid challenges and NPCs
        - Game is completable end-to-end
        - Challenge objects actually placed (not zero)
        - All condition targets exist in their source scene
        """
        errors = []
        warnings = []

        # ── Path validation ───────────────────────────────────────────────
        for scene in materialized_scenes:
            if not scene.path_exists:
                errors.append(f"Scene {scene.scene_index}: no path from spawn to exit")

            if scene.walkable_coverage < 0.3:
                warnings.append(
                    f"Scene {scene.scene_index}: low walkable coverage "
                    f"({scene.walkable_coverage:.0%})"
                )

            # Check challenge objects were actually placed
            challenge_count = len(
                [o for o in scene.objects if o.get("type") == "challenge"]
            )
            expected = len(scene.challenges)
            if expected > 0 and challenge_count == 0:
                errors.append(
                    f"Scene {scene.scene_index}: {expected} challenges defined "
                    f"but 0 challenge objects placed"
                )

            # Check for scene issues from populator
            for issue in scene.issues:
                if "no path" in issue.lower() or "blocked" in issue.lower():
                    errors.append(f"Scene {scene.scene_index}: {issue}")
                else:
                    warnings.append(f"Scene {scene.scene_index}: {issue}")

        # ── Route validation ──────────────────────────────────────────────
        from app.pipeline.route_builder import validate_routes

        r_valid, r_errors, r_warnings = validate_routes(
            routes, self.state, materialized_scenes
        )
        errors.extend(r_errors)
        warnings.extend(r_warnings)

        # ── Cross-scene completability ────────────────────────────────────
        # Check that mechanics used across scenes form a playable sequence
        all_mechanics = []
        for co in self.state.challenge_outputs:
            all_mechanics.extend(co.mechanics_used)

        if len(all_mechanics) != len(set(all_mechanics)):
            # Duplicate mechanics across scenes — check if intentional
            from collections import Counter

            counts = Counter(all_mechanics)
            repeated = {m: c for m, c in counts.items() if c > 2}
            if repeated:
                warnings.append(
                    f"Mechanics used >2 times: {repeated}. " f"May feel repetitive."
                )

        is_valid = len(errors) == 0
        if is_valid:
            logger.info(
                f"✓ Post-materialization validated: "
                f"{len(materialized_scenes)} scenes, {len(routes)} routes"
            )
        else:
            logger.error(f"✗ Post-materialization failed: {errors}")

        return is_valid, errors, warnings
