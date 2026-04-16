"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SCENE MATERIALIZER (FIXED — SELF-CONTAINED)                ║
║                                                                               ║
║  REPLACES the original scene_materializer.py entirely.                        ║
║  Contains MaterializedScene, position_hint_to_coordinates, AND               ║
║  the fixed SceneMaterializer with object expansion.                           ║
║                                                                               ║
║  FIXES:                                                                       ║
║  #2 — Real asset names into populator (not "challenge_marker")               ║
║  #4 — Reads challenge object_assignments for real asset mapping              ║
║  #5 — Expands object_count into multiple placed objects per challenge        ║
║  CIRCULAR IMPORT — No longer imports from itself                             ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

from dataclasses import dataclass, field
from typing import Optional
import logging
import random

from app.pipeline.pipeline_state import (
    PipelineState,
    SceneOutput,
    SceneZone,
    ChallengeOutput,
    NPCOutput,
)
from app.core.zone_system import (
    semantic_to_coordinates,
    SemanticPosition,
    OccupancyGrid,
    TileOccupancy,
    bfs_reachable,
)
from app.core.scene_populator import (
    ScenePopulator,
    PopulatorConfig,
    PopulatedScene,
    get_scene_manifest,
    DEFAULT_CLUSTER_RULES,
    CellType,
)
from app.core.mechanics import get_mechanic


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  POSITION HINT TO SEMANTIC POSITION
# ═══════════════════════════════════════════════════════════════════════════════

POSITION_HINT_MAP = {
    # Cardinal
    "north": SemanticPosition.NORTH,
    "south": SemanticPosition.SOUTH,
    "east": SemanticPosition.EAST,
    "west": SemanticPosition.WEST,
    "center": SemanticPosition.CENTER,
    # Corners
    "northwest": SemanticPosition.NORTHWEST,
    "northeast": SemanticPosition.NORTHEAST,
    "southwest": SemanticPosition.SOUTHWEST,
    "southeast": SemanticPosition.SOUTHEAST,
    # Extended
    "center_west": SemanticPosition.WEST,
    "center_east": SemanticPosition.EAST,
    "center_north": SemanticPosition.NORTH,
    "center_south": SemanticPosition.SOUTH,
    # Special
    "near_spawn": SemanticPosition.SOUTH,
    "near_exit": SemanticPosition.NORTH,
    "challenge_zone": SemanticPosition.CENTER,
}


def position_hint_to_coordinates(
    hint: str,
    width: int,
    height: int,
    margin: int = 2,
    rng: random.Random = None,
) -> tuple[int, int]:
    """
    Convert a position hint to actual coordinates.
    """
    semantic = POSITION_HINT_MAP.get(hint, SemanticPosition.CENTER)
    coords = semantic_to_coordinates(semantic, width, height)
    base_x = coords["x"]
    base_y = coords["y"]

    if rng:
        base_x += rng.randint(-1, 1)
        base_y += rng.randint(-1, 1)
        base_x = max(margin, min(width - margin - 1, base_x))
        base_y = max(margin, min(height - margin - 1, base_y))

    return (base_x, base_y)


# ═══════════════════════════════════════════════════════════════════════════════
#  MATERIALIZED SCENE
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class MaterializedScene:
    """A scene with actual coordinates computed from semantic outputs."""

    scene_index: int
    width: int
    height: int

    layout_pattern: str
    zone_type: str

    spawn_x: int
    spawn_y: int
    exit_x: int
    exit_y: int

    zones: list[dict] = field(default_factory=list)
    challenges: list[dict] = field(default_factory=list)
    npcs: list[dict] = field(default_factory=list)
    objects: list[dict] = field(default_factory=list)
    landmarks: list[dict] = field(default_factory=list)
    decorations: list[dict] = field(default_factory=list)

    grid_data: dict = field(default_factory=dict)

    path_exists: bool = True
    walkable_coverage: float = 0.0
    issues: list[str] = field(default_factory=list)
    timer: dict = field(
        default_factory=dict
    )  # {"duration_seconds": 120, "type": "countdown"}

    def to_manifest(self) -> dict:
        """Convert to manifest format."""
        return {
            "scene_index": self.scene_index,
            "width": self.width,
            "height": self.height,
            "layout_pattern": self.layout_pattern,
            "zone_type": self.zone_type,
            "spawn": {"x": self.spawn_x, "y": self.spawn_y},
            "exit": {"x": self.exit_x, "y": self.exit_y},
            "zones": self.zones,
            "challenges": self.challenges,
            "npcs": [
                npc["npc_id"]
                for npc in self.npcs
                if isinstance(npc, dict) and "npc_id" in npc
            ],
            "objects": self.objects + self.landmarks + self.decorations,
            "stats": {
                "landmark_count": len(self.landmarks),
                "decoration_count": len(self.decorations),
                "challenge_count": len(self.challenges),
                "npc_count": len(self.npcs),
                "walkable_coverage": self.walkable_coverage,
            },
            "valid": self.path_exists and len(self.issues) == 0,
            "path_exists": self.path_exists,
            "issues": self.issues,
            "timer": self.timer if self.timer else None,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  SCENE MATERIALIZER (FIXED)
# ═══════════════════════════════════════════════════════════════════════════════


class SceneMaterializer:
    """
    Converts semantic agent outputs into actual game scenes.

    FIXED version:
    - Expands challenge object counts into multiple placements
    - Uses real asset names from object_assignments
    - Passes real data to the populator
    """

    def __init__(self, seed: int = None):
        self.seed = seed or random.randint(1, 999999999)
        self.rng = random.Random(self.seed)

    def materialize_scene(
        self,
        scene_output: SceneOutput,
        challenge_output: Optional[ChallengeOutput],
        npc_output: Optional[NPCOutput],
        width: int,
        height: int,
        zone_type: str,
        decoration_assets: list[str],
        enable_clustering: bool = True,
        enable_landmarks: bool = True,
    ) -> MaterializedScene:
        """Materialize a scene with REAL asset expansion."""
        scene_idx = scene_output.scene_index

        # Step 1: Convert semantic zones to coordinates
        zones = self._materialize_zones(scene_output.zones, width, height)

        spawn_zone = next((z for z in zones if z["zone_type"] == "spawn"), None)
        exit_zone = next((z for z in zones if z["zone_type"] == "exit"), None)

        spawn_x = spawn_zone["x"] if spawn_zone else width // 2
        spawn_y = spawn_zone["y"] if spawn_zone else height - 2
        exit_x = exit_zone["x"] if exit_zone else width // 2
        exit_y = exit_zone["y"] if exit_zone else 1

        # Step 2: Populator config
        config = PopulatorConfig(
            width=width,
            height=height,
            spawn_pos=(spawn_x, spawn_y),
            exit_pos=(exit_x, exit_y),
            spawn_radius=2,
            exit_radius=2,
            corridor_width=2,
            use_natural_corridors=True,
            corridor_noise_strength=0.3,
            decoration_density=scene_output.decoration_density,
            decoration_min_spacing=2.0,
            enable_clustering=enable_clustering,
            enable_landmarks=enable_landmarks,
            zone_type=zone_type,
            edge_margin=1,
        )

        # ═══════════════════════════════════════════════════════════════════
        # FIX #4 + #5: Expand challenges into REAL objects
        # ═══════════════════════════════════════════════════════════════════
        challenge_objects = []
        materialized_challenges = []

        if challenge_output:
            for idx, challenge in enumerate(challenge_output.challenges):
                if not isinstance(challenge, dict):
                    logger.error(f"Challenge {idx} is not dict: {type(challenge)}")
                    continue

                zone_hint = challenge.get("zone_hint", "center")
                cx, cy = position_hint_to_coordinates(
                    zone_hint, width, height, margin=3, rng=self.rng
                )

                # Avoid spawn/exit
                if abs(cx - spawn_x) < 3 and abs(cy - spawn_y) < 3:
                    cy = max(3, spawn_y - 4)
                if abs(cx - exit_x) < 3 and abs(cy - exit_y) < 3:
                    cy = min(height - 3, exit_y + 4)

                mechanic_id = challenge.get("mechanic_id", "")
                assignments = challenge.get("object_assignments", [])
                params = challenge.get("params", {})

                # FIX #5: Expand object_count into multiple objects
                expanded_objects = self._expand_challenge_objects(
                    assignments=assignments,
                    params=params,
                    mechanic_id=mechanic_id,
                    center_x=cx,
                    center_y=cy,
                    width=width,
                    height=height,
                    scene_idx=scene_idx,
                    challenge_idx=idx,
                )

                challenge_objects.extend(expanded_objects)

                materialized_challenges.append(
                    {
                        **challenge,
                        "x": cx,
                        "y": cy,
                        "expanded_object_count": len(expanded_objects),
                    }
                )

                logger.info(
                    f"  Challenge '{challenge.get('name')}': expanded to "
                    f"{len(expanded_objects)} objects at ({cx},{cy})"
                )

        # Step 4: Place NPCs
        npc_positions = []
        npc_position_tuples = []
        materialized_npcs = []

        if npc_output:
            for idx, npc in enumerate(npc_output.npcs):
                if not isinstance(npc, dict):
                    continue

                pos_hint = npc.get("position_hint", "center")
                nx, ny = position_hint_to_coordinates(
                    pos_hint, width, height, margin=2, rng=self.rng
                )

                # Avoid overlap
                attempts = 0
                while (nx, ny) in npc_position_tuples and attempts < 10:
                    nx += self.rng.randint(-2, 2)
                    ny += self.rng.randint(-2, 2)
                    nx = max(2, min(width - 3, nx))
                    ny = max(2, min(height - 3, ny))
                    attempts += 1

                npc_position_tuples.append((nx, ny))
                npc_positions.append(
                    {
                        "role": npc.get("role", "villager"),
                        "asset_name": npc.get("asset_name", "npc"),
                        "x": nx,
                        "y": ny,
                    }
                )
                materialized_npcs.append({**npc, "x": nx, "y": ny})

        # Step 5: Run scene populator
        populator = ScenePopulator(config)

        waypoints = [
            (z["x"], z["y"]) for z in zones if z["zone_type"] not in ["spawn", "exit"]
        ][:3]

        populated = populator.populate(
            challenge_objects=challenge_objects,
            npc_positions=npc_positions,
            decoration_assets=decoration_assets,
            cluster_rules=DEFAULT_CLUSTER_RULES if enable_clustering else None,
            waypoints=waypoints if waypoints else None,
        )

        populator.calculate_z_indices(populated)

        # Step 6: Extract placed objects
        objects = []
        landmarks = []
        decorations = []

        for obj in populated.challenge_objects:
            objects.append(
                {
                    "object_id": obj.object_id,
                    "asset_name": obj.asset_name,
                    "x": obj.x,
                    "y": obj.y,
                    "z_index": obj.z_index,
                    "type": "challenge",
                    "walkable": obj.is_walkable,
                    "interactable": obj.is_interactable,
                    "metadata": obj.metadata,
                }
            )

        for obj in populated.landmarks:
            landmarks.append(
                {
                    "object_id": obj.object_id,
                    "asset_name": obj.asset_name,
                    "x": obj.x,
                    "y": obj.y,
                    "z_index": obj.z_index,
                    "type": "landmark",
                    "walkable": obj.is_walkable,
                }
            )

        for obj in populated.decorations:
            decorations.append(
                {
                    "object_id": obj.object_id,
                    "asset_name": obj.asset_name,
                    "x": obj.x,
                    "y": obj.y,
                    "z_index": obj.z_index,
                    "type": "decoration",
                    "walkable": obj.is_walkable,
                    "metadata": obj.metadata,
                }
            )

        # ── Extract timer from timed challenges ──
        scene_timer = {}
        for challenge in materialized_challenges:
            params = challenge.get("params", {})
            timer_seconds = params.get("timer_seconds", 0)
            if timer_seconds > 0 and not scene_timer:
                scene_timer = {
                    "duration_seconds": timer_seconds,
                    "type": "countdown",
                    "mechanic_id": challenge.get("mechanic_id", ""),
                    "label": f"Time remaining: {challenge.get('name', 'Challenge')}",
                }

        return MaterializedScene(
            scene_index=scene_idx,
            width=width,
            height=height,
            layout_pattern=scene_output.layout_pattern,
            zone_type=zone_type,
            spawn_x=spawn_x,
            spawn_y=spawn_y,
            exit_x=exit_x,
            exit_y=exit_y,
            zones=zones,
            challenges=materialized_challenges,
            npcs=materialized_npcs,
            objects=objects,
            landmarks=landmarks,
            decorations=decorations,
            grid_data={
                "width": width,
                "height": height,
                "corridor_tiles": (
                    len(populated.corridors) if populated.corridors else 0
                ),
            },
            path_exists=populated.path_exists,
            walkable_coverage=populated.walkable_coverage,
            issues=list(populated.issues) if populated.issues else [],
            timer=scene_timer,
        )

    # ═══════════════════════════════════════════════════════════════════════
    #  FIX #5: EXPAND CHALLENGE OBJECTS
    # ═══════════════════════════════════════════════════════════════════════

    def _expand_challenge_objects(
        self,
        assignments: list[dict],
        params: dict,
        mechanic_id: str,
        center_x: int,
        center_y: int,
        width: int,
        height: int,
        scene_idx: int,
        challenge_idx: int,
    ) -> list[dict]:
        """
        Expand challenge object_assignments into individual placed objects.
        """
        objects = []

        object_count = params.get(
            "object_count",
            params.get(
                "collect_count",
                params.get(
                    "deliver_count",
                    params.get(
                        "sequence_length",
                        params.get("bridge_pieces", params.get("stack_height", 1)),
                    ),
                ),
            ),
        )

        mechanic = get_mechanic(mechanic_id)

        if not assignments and mechanic:
            for slot_name, slot in mechanic.object_slots.items():
                count = (
                    min(object_count, slot.max_count)
                    if slot.is_collectible or slot.is_draggable
                    else slot.min_count
                )
                for i in range(count):
                    ox, oy = self._scatter_position(
                        center_x, center_y, spread=3, idx=i, width=width, height=height
                    )
                    objects.append(
                        {
                            "object_id": f"challenge_{scene_idx}_{challenge_idx}_{slot_name}_{i}",
                            "asset_name": f"{mechanic_id}_{slot_name}",
                            "x": ox,
                            "y": oy,
                            "type": "challenge",
                            "mechanic_id": mechanic_id,
                            "slot": slot_name,
                        }
                    )
            return objects

        for assignment in assignments:
            slot_name = assignment.get("slot", "object")
            asset_name = assignment.get("asset_name", "object")
            base_count = assignment.get("count", 1)

            if mechanic:
                slot = mechanic.object_slots.get(slot_name)
                if slot and (slot.is_collectible or slot.is_draggable):
                    count = min(object_count, slot.max_count)
                elif slot:
                    count = base_count
                else:
                    count = base_count
            else:
                count = base_count

            for i in range(count):
                ox, oy = self._scatter_position(
                    center_x, center_y, spread=3, idx=i, width=width, height=height
                )
                objects.append(
                    {
                        "object_id": f"challenge_{scene_idx}_{challenge_idx}_{slot_name}_{i}",
                        "asset_name": asset_name,
                        "x": ox,
                        "y": oy,
                        "type": "challenge",
                        "mechanic_id": mechanic_id,
                        "slot": slot_name,
                    }
                )

        if mechanic and mechanic.requires_goal_zone:
            goal_x = center_x + self.rng.randint(-2, 2)
            goal_y = center_y + self.rng.randint(-2, 2)
            goal_x = max(2, min(width - 3, goal_x))
            goal_y = max(2, min(height - 3, goal_y))
            objects.append(
                {
                    "object_id": f"challenge_{scene_idx}_{challenge_idx}_goal_0",
                    "asset_name": "goal_zone",
                    "x": goal_x,
                    "y": goal_y,
                    "type": "challenge_goal",
                    "mechanic_id": mechanic_id,
                    "slot": "goal",
                }
            )

        return objects

    def _scatter_position(
        self,
        cx: int,
        cy: int,
        spread: int,
        idx: int,
        width: int,
        height: int,
    ) -> tuple[int, int]:
        """Scatter an object around a center point."""
        for _ in range(20):
            ox = cx + self.rng.randint(-spread, spread)
            oy = cy + self.rng.randint(-spread, spread)
            ox = max(2, min(width - 3, ox))
            oy = max(2, min(height - 3, oy))
            if (ox, oy) != (cx, cy):
                return (ox, oy)
        return (
            max(2, min(width - 3, cx + (idx % 3) - 1)),
            max(2, min(height - 3, cy + (idx // 3) - 1)),
        )

    # ═══════════════════════════════════════════════════════════════════════
    #  ZONE MATERIALIZATION
    # ═══════════════════════════════════════════════════════════════════════

    def _materialize_zones(
        self, semantic_zones: tuple, width: int, height: int
    ) -> list[dict]:
        """Convert semantic zones to zones with coordinates."""
        materialized = []
        for zone in semantic_zones:
            x, y = position_hint_to_coordinates(
                zone.position_hint,
                width,
                height,
                margin=2,
                rng=self.rng,
            )
            size_map = {"small": 2, "medium": 3, "large": 4}
            size = size_map.get(zone.size_hint, 3)
            materialized.append(
                {
                    "zone_id": zone.zone_id,
                    "zone_type": zone.zone_type,
                    "position_hint": zone.position_hint,
                    "x": x,
                    "y": y,
                    "width": size,
                    "height": size,
                }
            )
        return materialized

    # ═══════════════════════════════════════════════════════════════════════
    #  MATERIALIZE ALL
    # ═══════════════════════════════════════════════════════════════════════

    def materialize_all(self, state: PipelineState) -> list[MaterializedScene]:
        """Materialize all scenes from pipeline state."""
        input_cfg = state.input
        decoration_assets = state.get_decoration_assets()

        self.rng = random.Random(state.seed)

        materialized_scenes = []

        for i, scene_output in enumerate(state.scene_outputs):
            challenge_output = None
            npc_output = None

            for co in state.challenge_outputs:
                if co.scene_index == i:
                    challenge_output = co
                    break

            for no in state.npc_outputs:
                if no.scene_index == i:
                    npc_output = no
                    break

            scene = self.materialize_scene(
                scene_output=scene_output,
                challenge_output=challenge_output,
                npc_output=npc_output,
                width=input_cfg.scene_width,
                height=input_cfg.scene_height,
                zone_type=input_cfg.zone_type,
                decoration_assets=decoration_assets,
                enable_clustering=input_cfg.enable_clustering,
                enable_landmarks=input_cfg.enable_landmarks,
            )
            materialized_scenes.append(scene)

        return materialized_scenes


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def materialize_scenes(state: PipelineState) -> list[MaterializedScene]:
    """Convenience function to materialize all scenes."""
    materializer = SceneMaterializer(seed=state.seed)
    return materializer.materialize_all(state)
