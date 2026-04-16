"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    AUTO-REPAIR SYSTEM                                         ║
║                                                                               ║
║  Automatically repairs common validation issues in manifests.                 ║
║                                                                               ║
║  REPAIRS:                                                                     ║
║  • NPC missing scene → assign to first scene                                  ║
║  • NPC out of bounds → clamp to scene bounds                                  ║
║  • Challenge missing mechanic → infer from type                               ║
║  • Route missing → create based on scene order                                ║
║  • Dialogue missing NPC → link to nearest NPC                                 ║
║  • Spawn point missing → add default spawn                                    ║
║  • Duplicate IDs → append suffix                                              ║
║                                                                               ║
║  USAGE:                                                                       ║
║      repairer = ManifestRepairer()                                           ║
║      repaired, changes = repairer.repair(manifest)                           ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
import copy
from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum


logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  REPAIR TYPES
# ═══════════════════════════════════════════════════════════════════════════════


class RepairType(str, Enum):
    """Types of repairs that can be applied."""

    NPC_SCENE_ASSIGNED = "npc_scene_assigned"
    NPC_POSITION_CLAMPED = "npc_position_clamped"
    NPC_NAME_GENERATED = "npc_name_generated"
    NPC_ROLE_DEFAULTED = "npc_role_defaulted"

    CHALLENGE_MECHANIC_INFERRED = "challenge_mechanic_inferred"
    CHALLENGE_TARGET_DEFAULTED = "challenge_target_defaulted"

    ROUTE_CREATED = "route_created"
    ROUTE_DIRECTION_FIXED = "route_direction_fixed"

    SPAWN_POINT_ADDED = "spawn_point_added"
    SPAWN_POINT_MOVED = "spawn_point_moved"

    DIALOGUE_NPC_LINKED = "dialogue_npc_linked"
    DIALOGUE_GREETING_ADDED = "dialogue_greeting_added"

    ID_DEDUPLICATED = "id_deduplicated"

    SCENE_SIZE_DEFAULTED = "scene_size_defaulted"
    TILEMAP_GENERATED = "tilemap_generated"


# ═══════════════════════════════════════════════════════════════════════════════
#  REPAIR RECORD
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class RepairRecord:
    """Record of a single repair action."""

    repair_type: RepairType
    location: str
    description: str
    before: Any = None
    after: Any = None

    def to_dict(self) -> dict:
        return {
            "type": self.repair_type.value,
            "location": self.location,
            "description": self.description,
            "before": str(self.before) if self.before else None,
            "after": str(self.after) if self.after else None,
        }


@dataclass
class RepairResult:
    """Result of repair operation."""

    success: bool = True
    manifest: Dict[str, Any] = field(default_factory=dict)
    repairs: List[RepairRecord] = field(default_factory=list)
    errors: List[str] = field(default_factory=list)

    @property
    def repair_count(self) -> int:
        return len(self.repairs)

    def to_dict(self) -> dict:
        return {
            "success": self.success,
            "repair_count": self.repair_count,
            "repairs": [r.to_dict() for r in self.repairs],
            "errors": self.errors,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST REPAIRER
# ═══════════════════════════════════════════════════════════════════════════════


class ManifestRepairer:
    """
    Auto-repairs common issues in game manifests.

    Designed for "vibe coding" where AI-generated content may have
    minor issues that can be automatically fixed.
    """

    def repair(self, manifest: Dict[str, Any]) -> RepairResult:
        """
        Repair a manifest, fixing common issues.

        Args:
            manifest: Game manifest to repair

        Returns:
            RepairResult with repaired manifest and list of changes
        """
        result = RepairResult()

        # Work on a copy to avoid mutating original
        result.manifest = copy.deepcopy(manifest)

        try:
            # Run repair passes in order
            self._repair_scenes(result)
            self._repair_spawn_points(result)
            self._repair_npcs(result)
            self._repair_challenges(result)
            self._repair_routes(result)
            self._repair_dialogues(result)
            self._deduplicate_ids(result)

            logger.info(
                f"Manifest repair complete: {result.repair_count} repairs applied"
            )

        except Exception as e:
            result.success = False
            result.errors.append(f"Repair failed: {str(e)}")
            logger.error(f"Manifest repair failed: {e}")

        return result

    # ───────────────────────────────────────────────────────────────────────────
    #  SCENE REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_scenes(self, result: RepairResult):
        """Repair scene-level issues."""
        scenes = result.manifest.get("scenes", [])

        for i, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{i}")

            # Default scene size
            if not scene.get("width"):
                scene["width"] = 16
                result.repairs.append(
                    RepairRecord(
                        repair_type=RepairType.SCENE_SIZE_DEFAULTED,
                        location=f"scenes[{i}]",
                        description=f"Set default width=16 for {scene_name}",
                        before=None,
                        after=16,
                    )
                )

            if not scene.get("height"):
                scene["height"] = 16
                result.repairs.append(
                    RepairRecord(
                        repair_type=RepairType.SCENE_SIZE_DEFAULTED,
                        location=f"scenes[{i}]",
                        description=f"Set default height=16 for {scene_name}",
                        before=None,
                        after=16,
                    )
                )

            # Ensure scene has a name
            if not scene.get("scene_name"):
                scene["scene_name"] = f"scene_{i}"

    # ───────────────────────────────────────────────────────────────────────────
    #  SPAWN POINT REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_spawn_points(self, result: RepairResult):
        """Ensure every scene has a valid spawn point."""
        scenes = result.manifest.get("scenes", [])

        for i, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{i}")
            width = scene.get("width", 16)
            height = scene.get("height", 16)

            spawn = scene.get("spawn_point") or scene.get("player_spawn")

            if not spawn:
                # Add default spawn point
                spawn_x = width // 2
                spawn_y = height - 2  # Near bottom
                scene["spawn_point"] = {"x": spawn_x, "y": spawn_y}

                result.repairs.append(
                    RepairRecord(
                        repair_type=RepairType.SPAWN_POINT_ADDED,
                        location=f"scenes[{i}].spawn_point",
                        description=f"Added spawn point at ({spawn_x}, {spawn_y}) for {scene_name}",
                        after={"x": spawn_x, "y": spawn_y},
                    )
                )
            else:
                # Validate spawn is within bounds
                spawn_x = spawn.get("x", 0)
                spawn_y = spawn.get("y", 0)

                clamped_x = max(0, min(spawn_x, width - 1))
                clamped_y = max(0, min(spawn_y, height - 1))

                if clamped_x != spawn_x or clamped_y != spawn_y:
                    scene["spawn_point"] = {"x": clamped_x, "y": clamped_y}

                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.SPAWN_POINT_MOVED,
                            location=f"scenes[{i}].spawn_point",
                            description=f"Moved spawn from ({spawn_x}, {spawn_y}) to ({clamped_x}, {clamped_y})",
                            before={"x": spawn_x, "y": spawn_y},
                            after={"x": clamped_x, "y": clamped_y},
                        )
                    )

    # ───────────────────────────────────────────────────────────────────────────
    #  NPC REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_npcs(self, result: RepairResult):
        """Repair NPC-related issues."""
        scenes = result.manifest.get("scenes", [])
        global_npcs = result.manifest.get("npcs", {})

        # Track all NPC IDs for deduplication
        seen_npc_ids = set()

        for i, scene in enumerate(scenes):
            scene_name = scene.get("scene_name", f"scene_{i}")
            width = scene.get("width", 16)
            height = scene.get("height", 16)

            npcs = scene.get("npcs", [])

            for j, npc in enumerate(npcs):
                npc_id = npc.get("npc_id") or npc.get("id")

                # Generate ID if missing
                if not npc_id:
                    npc_id = f"npc_{scene_name}_{j}"
                    npc["npc_id"] = npc_id

                # Generate name if missing
                if not npc.get("name"):
                    npc["name"] = npc_id.replace("_", " ").title()
                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.NPC_NAME_GENERATED,
                            location=f"scenes[{i}].npcs[{j}]",
                            description=f"Generated name '{npc['name']}' for NPC",
                            after=npc["name"],
                        )
                    )

                # Default role if missing
                if not npc.get("role"):
                    npc["role"] = "villager"
                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.NPC_ROLE_DEFAULTED,
                            location=f"scenes[{i}].npcs[{j}]",
                            description=f"Set default role 'villager' for {npc.get('name', npc_id)}",
                            after="villager",
                        )
                    )

                # Clamp position to scene bounds
                x = npc.get("x", npc.get("grid_x", width // 2))
                y = npc.get("y", npc.get("grid_y", height // 2))

                clamped_x = max(0, min(x, width - 1))
                clamped_y = max(0, min(y, height - 1))

                if clamped_x != x or clamped_y != y:
                    npc["x"] = clamped_x
                    npc["y"] = clamped_y
                    npc["grid_x"] = clamped_x
                    npc["grid_y"] = clamped_y

                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.NPC_POSITION_CLAMPED,
                            location=f"scenes[{i}].npcs[{j}]",
                            description=f"Clamped NPC position from ({x}, {y}) to ({clamped_x}, {clamped_y})",
                            before={"x": x, "y": y},
                            after={"x": clamped_x, "y": clamped_y},
                        )
                    )
                else:
                    # Ensure both x/y and grid_x/grid_y are set
                    npc["x"] = x
                    npc["y"] = y
                    npc["grid_x"] = x
                    npc["grid_y"] = y

                # Add default greeting if missing
                if not npc.get("initial_greeting") and not npc.get("greeting"):
                    name = npc.get("name", "Friend")
                    npc["initial_greeting"] = f"Hello! I'm {name}."
                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.DIALOGUE_GREETING_ADDED,
                            location=f"scenes[{i}].npcs[{j}]",
                            description=f"Added default greeting for {name}",
                            after=npc["initial_greeting"],
                        )
                    )

                seen_npc_ids.add(npc_id)

        # Handle orphaned global NPCs - assign to first scene
        if global_npcs and scenes:
            first_scene = scenes[0]
            first_scene_name = first_scene.get("scene_name", "scene_0")

            for npc_id, npc_def in global_npcs.items():
                if npc_id not in seen_npc_ids:
                    # This NPC is defined but not placed
                    if "npcs" not in first_scene:
                        first_scene["npcs"] = []

                    # Create NPC instance from definition
                    npc_instance = {
                        "npc_id": npc_id,
                        "name": npc_def.get("name", npc_id),
                        "role": npc_def.get("role", "villager"),
                        "x": first_scene.get("width", 16) // 2,
                        "y": first_scene.get("height", 16) // 2,
                    }

                    first_scene["npcs"].append(npc_instance)

                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.NPC_SCENE_ASSIGNED,
                            location=f"npcs.{npc_id}",
                            description=f"Placed orphaned NPC '{npc_id}' in {first_scene_name}",
                            after=first_scene_name,
                        )
                    )

    # ───────────────────────────────────────────────────────────────────────────
    #  CHALLENGE REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_challenges(self, result: RepairResult):
        """Repair challenge-related issues."""
        scenes = result.manifest.get("scenes", [])

        # Mechanic inference map
        mechanic_map = {
            "collect": "collect_items",
            "gather": "collect_items",
            "find": "collect_items",
            "talk": "talk_to_npc",
            "speak": "talk_to_npc",
            "deliver": "deliver_item",
            "bring": "deliver_item",
            "reach": "reach_destination",
            "go": "reach_destination",
            "avoid": "avoid_hazard",
            "escape": "avoid_hazard",
            "push": "push_to_target",
            "move": "push_to_target",
            "unlock": "unlock_door",
            "open": "unlock_door",
            "solve": "solve_puzzle",
        }

        for i, scene in enumerate(scenes):
            challenges = scene.get("challenges", [])

            for j, challenge in enumerate(challenges):
                # Infer mechanic from challenge type or description
                if not challenge.get("mechanic"):
                    challenge_type = challenge.get("type", "").lower()
                    description = challenge.get("description", "").lower()

                    inferred_mechanic = None

                    # Try to infer from type
                    for keyword, mechanic in mechanic_map.items():
                        if keyword in challenge_type or keyword in description:
                            inferred_mechanic = mechanic
                            break

                    if inferred_mechanic:
                        challenge["mechanic"] = inferred_mechanic
                        result.repairs.append(
                            RepairRecord(
                                repair_type=RepairType.CHALLENGE_MECHANIC_INFERRED,
                                location=f"scenes[{i}].challenges[{j}]",
                                description=f"Inferred mechanic '{inferred_mechanic}' for challenge",
                                after=inferred_mechanic,
                            )
                        )
                    else:
                        # Default to collect_items
                        challenge["mechanic"] = "collect_items"
                        result.repairs.append(
                            RepairRecord(
                                repair_type=RepairType.CHALLENGE_MECHANIC_INFERRED,
                                location=f"scenes[{i}].challenges[{j}]",
                                description="Defaulted to 'collect_items' mechanic",
                                after="collect_items",
                            )
                        )

                # Default target count for collect challenges
                if challenge.get("mechanic") in [
                    "collect_items",
                    "collect_all",
                    "gather_resources",
                ]:
                    if not challenge.get("target_count") and not challenge.get(
                        "required_count"
                    ):
                        challenge["target_count"] = 3
                        result.repairs.append(
                            RepairRecord(
                                repair_type=RepairType.CHALLENGE_TARGET_DEFAULTED,
                                location=f"scenes[{i}].challenges[{j}]",
                                description="Set default target_count=3 for collect challenge",
                                after=3,
                            )
                        )

    # ───────────────────────────────────────────────────────────────────────────
    #  ROUTE REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_routes(self, result: RepairResult):
        """Ensure scenes are connected with routes."""
        scenes = result.manifest.get("scenes", [])
        routes = result.manifest.get("routes", [])

        if len(scenes) <= 1:
            return

        # Build set of existing connections
        existing_connections = set()
        for route in routes:
            from_scene = route.get("from_scene") or route.get("from_scene_name")
            to_scene = route.get("to_scene") or route.get("to_scene_name")
            if from_scene and to_scene:
                existing_connections.add((from_scene, to_scene))

        # Check if scenes are connected in order
        for i in range(len(scenes) - 1):
            scene_a = scenes[i].get("scene_name", f"scene_{i}")
            scene_b = scenes[i + 1].get("scene_name", f"scene_{i + 1}")

            # Check forward connection
            if (scene_a, scene_b) not in existing_connections:
                # Create route from A to B
                new_route = {
                    "from_scene_name": scene_a,
                    "to_scene_name": scene_b,
                    "direction": "east",
                    "type": "door",
                }
                routes.append(new_route)

                result.repairs.append(
                    RepairRecord(
                        repair_type=RepairType.ROUTE_CREATED,
                        location="routes",
                        description=f"Created route from {scene_a} to {scene_b}",
                        after=new_route,
                    )
                )

            # Check backward connection (for bidirectional travel)
            if (scene_b, scene_a) not in existing_connections:
                new_route = {
                    "from_scene_name": scene_b,
                    "to_scene_name": scene_a,
                    "direction": "west",
                    "type": "door",
                }
                routes.append(new_route)

                result.repairs.append(
                    RepairRecord(
                        repair_type=RepairType.ROUTE_CREATED,
                        location="routes",
                        description=f"Created route from {scene_b} to {scene_a}",
                        after=new_route,
                    )
                )

        result.manifest["routes"] = routes

    # ───────────────────────────────────────────────────────────────────────────
    #  DIALOGUE REPAIRS
    # ───────────────────────────────────────────────────────────────────────────

    def _repair_dialogues(self, result: RepairResult):
        """Repair dialogue-related issues."""
        scenes = result.manifest.get("scenes", [])

        for i, scene in enumerate(scenes):
            dialogues = scene.get("dialogues", [])
            npcs = scene.get("npcs", [])

            # Get NPC IDs in this scene
            npc_ids = set()
            for npc in npcs:
                npc_id = npc.get("npc_id") or npc.get("id")
                if npc_id:
                    npc_ids.add(npc_id)

            for j, dialogue in enumerate(dialogues):
                npc_id = dialogue.get("npc_id") or dialogue.get("speaker_id")

                # Link dialogue to NPC if not linked
                if not npc_id and npc_ids:
                    # Assign to first NPC
                    first_npc_id = list(npc_ids)[0]
                    dialogue["npc_id"] = first_npc_id

                    result.repairs.append(
                        RepairRecord(
                            repair_type=RepairType.DIALOGUE_NPC_LINKED,
                            location=f"scenes[{i}].dialogues[{j}]",
                            description=f"Linked dialogue to NPC '{first_npc_id}'",
                            after=first_npc_id,
                        )
                    )

    # ───────────────────────────────────────────────────────────────────────────
    #  ID DEDUPLICATION
    # ───────────────────────────────────────────────────────────────────────────

    def _deduplicate_ids(self, result: RepairResult):
        """Ensure all IDs are unique."""
        scenes = result.manifest.get("scenes", [])

        # Track all IDs
        seen_ids = {}  # id -> count

        def make_unique(id_value: str, location: str) -> str:
            if id_value not in seen_ids:
                seen_ids[id_value] = 1
                return id_value

            # Generate unique suffix
            seen_ids[id_value] += 1
            new_id = f"{id_value}_{seen_ids[id_value]}"

            result.repairs.append(
                RepairRecord(
                    repair_type=RepairType.ID_DEDUPLICATED,
                    location=location,
                    description=f"Renamed duplicate ID '{id_value}' to '{new_id}'",
                    before=id_value,
                    after=new_id,
                )
            )

            return new_id

        # Deduplicate scene IDs
        for i, scene in enumerate(scenes):
            scene_id = scene.get("scene_id") or scene.get("id")
            if scene_id:
                new_id = make_unique(scene_id, f"scenes[{i}].scene_id")
                scene["scene_id"] = new_id
                scene["id"] = new_id

        # Deduplicate NPC IDs
        for i, scene in enumerate(scenes):
            npcs = scene.get("npcs", [])
            for j, npc in enumerate(npcs):
                npc_id = npc.get("npc_id") or npc.get("id")
                if npc_id:
                    new_id = make_unique(npc_id, f"scenes[{i}].npcs[{j}].npc_id")
                    npc["npc_id"] = new_id
                    npc["id"] = new_id

        # Deduplicate challenge IDs
        for i, scene in enumerate(scenes):
            challenges = scene.get("challenges", [])
            for j, challenge in enumerate(challenges):
                challenge_id = challenge.get("challenge_id") or challenge.get("id")
                if challenge_id:
                    new_id = make_unique(
                        challenge_id, f"scenes[{i}].challenges[{j}].id"
                    )
                    challenge["challenge_id"] = new_id
                    challenge["id"] = new_id


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATE AND REPAIR PIPELINE
# ═══════════════════════════════════════════════════════════════════════════════


def validate_and_repair(
    manifest: Dict[str, Any],
    auto_repair: bool = True,
) -> Tuple[Dict[str, Any], RepairResult]:
    """
    Validate manifest and optionally auto-repair issues.

    Args:
        manifest: Game manifest to validate
        auto_repair: Whether to auto-repair issues

    Returns:
        Tuple of (repaired_manifest, repair_result)
    """
    from app.validators.validation_pipeline import ValidationPipeline

    # First validation pass
    pipeline = ValidationPipeline()
    validation_result = pipeline.validate(manifest)

    if validation_result.valid or not auto_repair:
        # No issues or auto-repair disabled
        return manifest, RepairResult(manifest=manifest)

    # Auto-repair
    repairer = ManifestRepairer()
    repair_result = repairer.repair(manifest)

    if repair_result.success and repair_result.repair_count > 0:
        # Re-validate after repairs
        revalidation = pipeline.validate(repair_result.manifest)

        if revalidation.valid:
            logger.info(
                f"Auto-repair successful: {repair_result.repair_count} fixes applied"
            )
        else:
            logger.warning(
                f"Auto-repair applied {repair_result.repair_count} fixes but "
                f"{len(revalidation.all_errors)} errors remain"
            )

    return repair_result.manifest, repair_result


# ═══════════════════════════════════════════════════════════════════════════════
#  CONVENIENCE FUNCTION
# ═══════════════════════════════════════════════════════════════════════════════


def repair_manifest(manifest: Dict[str, Any]) -> RepairResult:
    """
    Repair a manifest, fixing common issues.

    Args:
        manifest: Game manifest to repair

    Returns:
        RepairResult with repaired manifest and list of changes
    """
    repairer = ManifestRepairer()
    return repairer.repair(manifest)
