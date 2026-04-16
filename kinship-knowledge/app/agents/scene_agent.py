"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE AGENT (COMPLETE — WITH COMPOSITION RULES)             ║
║                                                                               ║
║  SYSTEM-FIRST scene generation. Blueprints define mandatory structure.        ║
║  AI has ZERO say in zone layout. Zones come from composition rules.           ║
║                                                                               ║
║  PRODUCES: SceneOutput (immutable) with SEMANTIC positions only.              ║
║  ENFORCES: Every scene has spawn + exit + ≥1 challenge + NPC zone.            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from typing import Optional
import logging

from app.agents.base_agent import BaseAgent, AgentConfig, AgentResult
from app.pipeline.pipeline_state import (
    PipelineState,
    PipelineStage,
    SceneOutput,
    SceneZone,
    PlannerOutput,
)
from app.core.layout_patterns import (
    get_layout_pattern,
    suggest_pattern as suggest_layout_pattern,
    LAYOUT_PATTERNS,
    LayoutType,
)
from app.core.difficulty_curve import (
    create_difficulty_curve,
    CurveType,
    AudienceType,
)


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  SAFE FALLBACK
# ═══════════════════════════════════════════════════════════════════════════════

FALLBACK_ZONES = (
    SceneZone(zone_id="spawn", zone_type="spawn", position_hint="south"),
    SceneZone(zone_id="challenge_0", zone_type="challenge", position_hint="center"),
    SceneZone(zone_id="npc_area", zone_type="npc", position_hint="near_spawn"),
    SceneZone(zone_id="exit", zone_type="exit", position_hint="north"),
)

FALLBACK_LAYOUT = "hub"


class SceneAgent(BaseAgent):
    """
    SYSTEM-FIRST scene layout generation.
    Zones come from composition blueprints, not AI.
    """

    @property
    def name(self) -> str:
        return "scene_agent"

    async def _execute(self, state: PipelineState) -> dict:
        input_cfg = state.input
        rng = state.get_rng()

        # Store for blueprint access
        self._num_scenes = input_cfg.num_scenes

        # Step 1: Difficulty curve
        try:
            audience = AudienceType(input_cfg.audience_type)
        except ValueError:
            audience = AudienceType.CHILDREN_9_12

        try:
            curve_type = CurveType(input_cfg.difficulty_curve)
        except ValueError:
            curve_type = CurveType.GENTLE

        difficulty_curve = create_difficulty_curve(
            total_scenes=input_cfg.num_scenes,
            curve_type=curve_type,
            audience=audience,
        )

        scene_difficulties = tuple(
            {
                "scene_index": i,
                "range": {
                    "min_complexity": difficulty_curve.scene_ranges[i].min_complexity,
                    "max_complexity": difficulty_curve.scene_ranges[i].max_complexity,
                    "target_complexity": difficulty_curve.scene_ranges[
                        i
                    ].target_complexity,
                },
            }
            for i in range(input_cfg.num_scenes)
        )

        if state.planner_output:
            state.planner_output = PlannerOutput(
                gameplay_loop=state.planner_output.gameplay_loop,
                mechanic_sequence=state.planner_output.mechanic_sequence,
                required_npcs=state.planner_output.required_npcs,
                available_mechanics=state.planner_output.available_mechanics,
                mechanic_scores=state.planner_output.mechanic_scores,
                difficulty_curve={
                    "curve_type": curve_type.value,
                    "audience": audience.value,
                },
                scene_difficulties=scene_difficulties,
            )

        # Step 2: Generate scenes from BLUEPRINTS
        scene_outputs: list[SceneOutput] = []

        for scene_idx in range(input_cfg.num_scenes):
            scene_mechanics = self._get_scene_mechanics(state, scene_idx)

            layout_pattern = self._select_layout(
                scene_idx=scene_idx,
                zone_type=input_cfg.zone_type,
                mechanics=scene_mechanics,
                rng=rng,
            )

            # BLUEPRINT-ENFORCED zones
            zones = self._generate_zones_from_blueprint(
                layout_pattern=layout_pattern,
                scene_idx=scene_idx,
                mechanics=scene_mechanics,
            )

            landmark_hints = (
                self._generate_landmark_hints(
                    layout_pattern=layout_pattern,
                    zone_type=input_cfg.zone_type,
                    rng=rng,
                )
                if input_cfg.enable_landmarks
                else ()
            )

            scene_output = SceneOutput(
                scene_index=scene_idx,
                layout_pattern=layout_pattern,
                zones=zones,
                landmark_hints=landmark_hints,
                decoration_density=0.3,
                enable_clustering=input_cfg.enable_clustering,
            )

            scene_outputs.append(scene_output)

        state.scene_outputs = scene_outputs

        return {
            "scenes_generated": len(scene_outputs),
            "layouts": [o.layout_pattern for o in scene_outputs],
            "difficulty_curve": {
                "curve_type": curve_type.value,
                "audience": audience.value,
            },
        }

    # ═══════════════════════════════════════════════════════════════════════
    #  MECHANICS PER SCENE (enforces minimum from blueprint)
    # ═══════════════════════════════════════════════════════════════════════

    def _get_scene_mechanics(self, state: PipelineState, scene_idx: int) -> list[str]:
        """Get mechanics for a scene. Enforces blueprint minimum."""
        mechanics = state.get_mechanic_sequence()
        available = state.get_available_mechanics()

        # Get blueprint minimum
        min_challenges = self._get_blueprint_min_challenges(scene_idx)

        if not mechanics:
            # No planner output — use available or fallback
            fallback = (
                list(available) if available else ["reach_destination", "collect_items"]
            )
            return fallback[:min_challenges]

        # Distribute mechanics across scenes
        total_scenes = state.input.num_scenes
        mechs_per_scene = max(1, len(mechanics) // total_scenes)
        start = scene_idx * mechs_per_scene
        end = start + mechs_per_scene

        if scene_idx == total_scenes - 1:
            end = len(mechanics)

        scene_mechs = list(mechanics[start:end])

        # Enforce minimum
        pool = (
            list(available)
            if available
            else ["reach_destination", "collect_items", "talk_to_npc"]
        )
        while len(scene_mechs) < min_challenges:
            for m in pool:
                if m not in scene_mechs:
                    scene_mechs.append(m)
                    break
            else:
                scene_mechs.append(scene_mechs[0] if scene_mechs else "collect_items")
                break

        return scene_mechs

    def _get_blueprint_min_challenges(self, scene_idx: int) -> int:
        """Get minimum challenges for a scene from composition rules."""
        try:
            from app.core.scene_composition import assign_blueprints

            blueprints = assign_blueprints(self._num_scenes)
            bp = (
                blueprints[scene_idx] if scene_idx < len(blueprints) else blueprints[-1]
            )
            return bp.min_challenges
        except Exception:
            return 1  # Safe default

    # ═══════════════════════════════════════════════════════════════════════
    #  BLUEPRINT-ENFORCED ZONE GENERATION
    # ═══════════════════════════════════════════════════════════════════════

    def _generate_zones_from_blueprint(
        self,
        layout_pattern: str,
        scene_idx: int,
        mechanics: list[str],
    ) -> tuple:
        """
        Generate zones from COMPOSITION BLUEPRINT.
        System-controlled. Every scene gets mandatory structure.
        """
        try:
            from app.core.scene_composition import assign_blueprints, get_required_zones

            blueprints = assign_blueprints(self._num_scenes)
            blueprint = (
                blueprints[scene_idx] if scene_idx < len(blueprints) else blueprints[-1]
            )

            required_zones = get_required_zones(blueprint, mechanics)

            zones = []
            for rz in required_zones:
                zones.append(
                    SceneZone(
                        zone_id=rz["zone_id"],
                        zone_type=rz["zone_type"],
                        position_hint=rz["position_hint"],
                        size_hint=rz.get("size_hint", "medium"),
                    )
                )

            # Add optional decoration zones
            if layout_pattern in ["hub", "village"]:
                zones.append(
                    SceneZone(
                        zone_id="decoration_1",
                        zone_type="forest",
                        position_hint="northwest",
                        size_hint="large",
                    )
                )
                zones.append(
                    SceneZone(
                        zone_id="decoration_2",
                        zone_type="forest",
                        position_hint="northeast",
                        size_hint="large",
                    )
                )

            return tuple(zones) if zones else FALLBACK_ZONES

        except Exception as e:
            logger.error(f"Blueprint zone generation failed: {e}, using fallback")
            return self._generate_fallback_zones(layout_pattern, scene_idx, mechanics)

    def _generate_fallback_zones(
        self,
        layout_pattern: str,
        scene_idx: int,
        mechanics: list[str],
    ) -> tuple:
        """Fallback if composition module not available."""
        zones = [
            SceneZone(
                zone_id="spawn",
                zone_type="spawn",
                position_hint="south",
                size_hint="small",
            ),
            SceneZone(
                zone_id="exit",
                zone_type="exit",
                position_hint="north",
                size_hint="small",
            ),
            SceneZone(
                zone_id="npc_area",
                zone_type="npc",
                position_hint="near_spawn",
                size_hint="small",
            ),
        ]

        # Always at least one challenge zone
        challenge_positions = ["center", "center_west", "center_east"]
        num_challenges = max(1, len(mechanics))
        for i in range(num_challenges):
            pos = challenge_positions[i % len(challenge_positions)]
            zones.append(
                SceneZone(
                    zone_id=f"challenge_{i}",
                    zone_type="challenge",
                    position_hint=pos,
                    size_hint="medium",
                )
            )

        if layout_pattern in ["hub", "village"]:
            zones.append(
                SceneZone(
                    zone_id="decoration_1",
                    zone_type="forest",
                    position_hint="northwest",
                    size_hint="large",
                )
            )
            zones.append(
                SceneZone(
                    zone_id="decoration_2",
                    zone_type="forest",
                    position_hint="northeast",
                    size_hint="large",
                )
            )

        return tuple(zones)

    # ═══════════════════════════════════════════════════════════════════════
    #  LAYOUT SELECTION
    # ═══════════════════════════════════════════════════════════════════════

    def _select_layout(
        self, scene_idx: int, zone_type: str, mechanics: list[str], rng
    ) -> str:
        from app.core.layout_patterns import get_patterns_for_scene_type

        suitable = get_patterns_for_scene_type(zone_type)
        if not suitable:
            return FALLBACK_LAYOUT

        if mechanics:
            suggested = suggest_layout_pattern(zone_type, mechanics)
            if suggested:
                return suggested.pattern_id

        if scene_idx == 0:
            for pattern in suitable:
                if pattern.layout_type in [LayoutType.HUB, LayoutType.VILLAGE]:
                    return pattern.pattern_id

        return suitable[0].pattern_id if suitable else FALLBACK_LAYOUT

    # ═══════════════════════════════════════════════════════════════════════
    #  LANDMARKS
    # ═══════════════════════════════════════════════════════════════════════

    def _generate_landmark_hints(
        self, layout_pattern: str, zone_type: str, rng
    ) -> tuple:
        from app.core.scene_populator import ZONE_LANDMARKS

        available = ZONE_LANDMARKS.get(zone_type, ["campfire"])
        if not available:
            return ()

        count = min(len(available), rng.randint(1, 2))
        selected = rng.sample(available, count)

        landmark_hints = []
        positions = ["northwest", "northeast", "center_west", "center_east"]

        for i, landmark_type in enumerate(selected):
            pos = positions[i % len(positions)]
            landmark_hints.append(
                {
                    "landmark_type": landmark_type,
                    "position_hint": pos,
                }
            )

        return tuple(landmark_hints)

    # ═══════════════════════════════════════════════════════════════════════
    #  VALIDATION
    # ═══════════════════════════════════════════════════════════════════════

    def _validate_output(
        self, output: dict, state: PipelineState
    ) -> tuple[bool, list[str]]:
        errors = []

        scenes_generated = output.get("scenes_generated", 0)
        expected = state.input.num_scenes

        if scenes_generated == 0:
            errors.append("No scenes were generated")

        if scenes_generated < expected:
            errors.append(f"Only {scenes_generated}/{expected} scenes generated")

        for scene_output in state.scene_outputs:
            has_spawn = any(z.zone_type == "spawn" for z in scene_output.zones)
            has_exit = any(z.zone_type == "exit" for z in scene_output.zones)
            has_challenge = any(z.zone_type == "challenge" for z in scene_output.zones)

            if not has_spawn:
                errors.append(f"Scene {scene_output.scene_index} missing spawn zone")
            if not has_exit:
                errors.append(f"Scene {scene_output.scene_index} missing exit zone")
            if not has_challenge:
                errors.append(
                    f"Scene {scene_output.scene_index} missing challenge zone"
                )

        return len(errors) == 0, errors
