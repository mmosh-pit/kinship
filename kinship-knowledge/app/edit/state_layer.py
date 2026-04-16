"""
Layer 2 — State Layer.

GameState Loader: memory → DB fallback, version capture.
Manifest Snapshot: full deepcopy for rollback.
Context Extractor: pull only relevant substate for LLM.
Edit Scope Resolver: EditType → affected domains.
"""

import copy
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set, Tuple

from app.state.game_state import GameState, EditType, get_state_manager
from app.edit.config import SCOPE_MAP, EditScope

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class StateSnapshot:
    """Full manifest snapshot for rollback."""

    manifest: Dict[str, Any]
    version: int

    def restore_to(self, game_state: GameState):
        """Restore the snapshot to a GameState."""
        game_state.manifest = copy.deepcopy(self.manifest)
        game_state._rebuild_indexes()


@dataclass
class ExtractedContext:
    """Scoped substate for the LLM — only what's relevant to the edit."""

    # The scene being edited
    scene_name: str = ""
    scene_data: Dict[str, Any] = field(default_factory=dict)
    grid_width: int = 16
    grid_height: int = 16

    # Specific referenced objects
    referenced_objects: List[Dict[str, Any]] = field(default_factory=list)

    # Spatial info
    spawn: Dict[str, Any] = field(default_factory=dict)
    exit_pos: Optional[Dict[str, Any]] = None
    occupied_cells: List[Tuple[int, int]] = field(default_factory=list)

    # Available assets
    available_assets: List[Dict[str, Any]] = field(default_factory=list)

    # Full context string for LLM
    context_text: str = ""

    # Scopes
    scopes: Set[str] = field(default_factory=set)


# ═══════════════════════════════════════════════════════════════════════════════
#  GAME STATE LOADER
# ═══════════════════════════════════════════════════════════════════════════════


async def load_game_state(game_id: str) -> Optional[GameState]:
    """Load GameState from memory or DB. Returns None if not found."""
    state_manager = get_state_manager()

    # Try memory first
    game_state = state_manager.get(game_id)
    if game_state:
        return game_state

    # Fallback to database
    try:
        from app.services.scenes_client import fetch_game_manifest

        manifest = await fetch_game_manifest(game_id=game_id)
        if manifest:
            game_state = state_manager.create_from_manifest(
                manifest=manifest,
                game_id=game_id,
            )
            return game_state
    except Exception as e:
        logger.warning(f"DB fetch failed for {game_id}: {e}")

    return None


def take_snapshot(game_state: GameState) -> StateSnapshot:
    """Take a full manifest snapshot for rollback."""
    return StateSnapshot(
        manifest=copy.deepcopy(game_state.manifest) if game_state.manifest else {},
        version=game_state.version,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  SCOPE RESOLVER
# ═══════════════════════════════════════════════════════════════════════════════


def resolve_scopes(edit_types: List[EditType]) -> Set[str]:
    """Resolve edit types to affected scope domains."""
    scopes = set()
    for et in edit_types:
        scope_set = SCOPE_MAP.get(et, {EditScope.SCENE})
        scopes.update(scope_set)
    return scopes


# ═══════════════════════════════════════════════════════════════════════════════
#  CONTEXT EXTRACTOR
# ═══════════════════════════════════════════════════════════════════════════════


def extract_context(
    game_state: GameState,
    instruction: str,
    edit_types: List[EditType],
    available_assets: Optional[List[Dict]] = None,
    gcs_manifest: Optional[Dict[str, Any]] = None,
) -> ExtractedContext:
    """
    Extract only the relevant substate for the LLM.

    Instead of sending the full manifest (all scenes, all objects),
    send only the target scene and referenced objects.
    
    CRITICAL: Merges objects from GCS manifest layer into scene_data
    so that remove operations can find objects that only exist in GCS.
    
    Args:
        gcs_manifest: Pre-fetched GCS manifest data (asset_placements, etc.)
                     If provided, this is used instead of trying to find it
                     in game_state.manifest.
    """
    ctx = ExtractedContext()
    ctx.scopes = resolve_scopes(edit_types)
    manifest = game_state.manifest or {}
    config = manifest.get("config", {})

    # ── Find target scene ───────────────────────────────────────
    target_scene = _find_target_scene(instruction, manifest)
    if target_scene:
        ctx.scene_name = target_scene.get("scene_name", "")
        # Make a copy so we can add GCS objects without modifying original
        ctx.scene_data = copy.deepcopy(target_scene)
        ctx.grid_width = target_scene.get("width", config.get("scene_width", 16))
        ctx.grid_height = target_scene.get("height", config.get("scene_height", 16))
        ctx.spawn = target_scene.get("spawn", {})

        # Find exit
        scene_idx = _get_scene_index(ctx.scene_name, manifest)
        ctx.exit_pos = _find_exit(manifest, scene_idx)

        # ── CRITICAL: Merge GCS asset_placements into scene_data.objects ──
        # This allows remove operations to find objects that only exist in GCS
        _merge_gcs_objects_into_scene(ctx.scene_data, manifest, gcs_manifest)

        # Build occupied cells (after merging GCS objects)
        ctx.occupied_cells = _get_occupied_cells(ctx.scene_data)

        # Find referenced objects
        ctx.referenced_objects = _find_referenced_objects(
            instruction, ctx.scene_data
        )

    # ── Available assets ────────────────────────────────────────
    if available_assets:
        ctx.available_assets = available_assets
    else:
        # Extract from existing manifest
        ctx.available_assets = _extract_manifest_assets(manifest)

    # ── Build context text for LLM ──────────────────────────────
    ctx.context_text = _build_context_text(ctx, manifest)

    return ctx


def _merge_gcs_objects_into_scene(
    scene_data: Dict, 
    manifest: Dict,
    gcs_manifest: Optional[Dict[str, Any]] = None
):
    """
    Merge objects from gcsManifest.asset_placements into scene_data.objects.
    
    This is CRITICAL for remove operations to work, because the scene layer
    often has no objects (only NPCs), while all actual objects are in GCS.
    
    Objects are given synthetic IDs based on asset_name and position to enable
    removal by the patch builder.
    
    Args:
        gcs_manifest: Pre-fetched GCS manifest data. If None, falls back to
                     manifest.get("gcsManifest", {})
    """
    # Use passed gcs_manifest if provided, otherwise try to get from manifest
    if gcs_manifest is None:
        logger.info("No pre-fetched GCS manifest, trying manifest.gcsManifest fallback")
        gcs_manifest = manifest.get("gcsManifest", {})
        if not gcs_manifest:
            logger.warning("No GCS manifest available - remove operations may not find objects!")
    else:
        logger.info(f"Using pre-fetched GCS manifest with {len(gcs_manifest.get('asset_placements', []))} placements")
    
    asset_placements = gcs_manifest.get("asset_placements", [])
    
    if not asset_placements:
        logger.warning("No GCS asset_placements to merge - scene objects will be empty")
        return
    
    # Ensure objects list exists
    if "objects" not in scene_data:
        scene_data["objects"] = []
    
    # Get existing object positions to avoid duplicates
    existing_positions = set()
    for obj in scene_data.get("objects", []) + scene_data.get("actors", []):
        if isinstance(obj, dict):
            x = obj.get("x", obj.get("position", {}).get("x"))
            y = obj.get("y", obj.get("position", {}).get("y"))
            if x is not None and y is not None:
                existing_positions.add((x, y))
    
    # Merge GCS placements that aren't ground tiles
    ground_tiles = {"grass_green_block", "grass_block", "dirt_block", "stone_floor", "water_tile"}
    
    for placement in asset_placements:
        if not isinstance(placement, dict):
            continue
        
        asset_name = placement.get("asset_name", "")
        
        # Skip ground tiles
        if asset_name.lower() in ground_tiles:
            continue
        
        x = placement.get("x")
        y = placement.get("y")
        
        # Skip if already have an object at this position
        if (x, y) in existing_positions:
            continue
        
        # Generate a synthetic object_id if none exists
        existing_id = placement.get("object_id", placement.get("id", ""))
        if existing_id:
            object_id = existing_id
        else:
            # Create ID from asset_name and position for consistent identification
            object_id = f"gcs_{asset_name}_{x}_{y}"
        
        # Create object entry with ALL properties from GCS for template matching
        # This is CRITICAL so that patch builder can copy scale, tile_config, etc.
        obj = {
            "object_id": object_id,
            "asset_name": asset_name,
            "x": x,
            "y": y,
            "z_index": placement.get("z_index", 50),
            "layer": placement.get("layer", "objects"),
            "scale": placement.get("scale", 1.0),
            "type": placement.get("type", "object"),
            "interaction_type": placement.get("interaction_type", "none"),
            "tags": placement.get("tags", []),
            "facet": placement.get("facet", ""),
            "walkable": placement.get("walkable", False),
            "interactable": placement.get("interactable", True),
            "_from_gcs": True,  # Mark as coming from GCS for tracking
        }
        
        # Copy additional fields if present
        if placement.get("asset_id"):
            obj["asset_id"] = placement["asset_id"]
        if placement.get("file_url"):
            obj["file_url"] = placement["file_url"]
        if placement.get("display_name"):
            obj["display_name"] = placement["display_name"]
        
        # Copy full metadata structure (includes tile_config, hitbox)
        # This is CRITICAL for the patch builder to copy collision/rendering properties
        if placement.get("metadata"):
            obj["metadata"] = dict(placement["metadata"])
        
        scene_data["objects"].append(obj)
        existing_positions.add((x, y))
    
    logger.info(
        f"Merged {len(scene_data['objects'])} GCS objects into scene_data "
        f"(total objects: {len(scene_data.get('objects', []))})"
    )


def _find_target_scene(
    instruction: str, manifest: Dict
) -> Optional[Dict[str, Any]]:
    """Find which scene the instruction targets."""
    import re

    scenes = manifest.get("scenes", [])
    if not scenes:
        return None

    lower = instruction.lower()

    # Check for scene number reference: "scene 1", "scene 2", etc.
    num_match = re.search(r"scene\s*(\d+)", lower)
    if num_match:
        idx = int(num_match.group(1)) - 1  # 1-indexed to 0-indexed
        if 0 <= idx < len(scenes):
            return scenes[idx]

    # Check for scene name reference
    for scene in scenes:
        scene_name = scene.get("scene_name", "").lower()
        if scene_name and scene_name in lower:
            return scene

    # Check for object name reference — find which scene contains it
    for scene in scenes:
        for obj in scene.get("actors", []) + scene.get("objects", []):
            if isinstance(obj, dict):
                name = obj.get("asset_name", obj.get("name", "")).lower()
                if name and name in lower:
                    return scene

    # Check for NPC name reference
    for scene in scenes:
        for npc in scene.get("npcs", []):
            if isinstance(npc, dict):
                name = npc.get("name", "").lower()
                if name and name in lower:
                    return scene

    # Default to first scene
    return scenes[0] if scenes else None


def _get_scene_index(scene_name: str, manifest: Dict) -> int:
    """Get the index of a scene by name."""
    for i, scene in enumerate(manifest.get("scenes", [])):
        if scene.get("scene_name") == scene_name:
            return i
    return 0


def _find_exit(manifest: Dict, scene_index: int) -> Optional[Dict]:
    """Find exit position from routes."""
    for route in manifest.get("routes", []):
        if route.get("from_scene") == scene_index:
            trigger = route.get("trigger", {})
            pos = trigger.get("position", {})
            if pos.get("x") is not None:
                return pos
    return None


def _get_occupied_cells(scene: Dict) -> List[Tuple[int, int]]:
    """Extract all occupied grid cells from a scene."""
    occupied = []
    seen = set()

    for obj in scene.get("actors", []) + scene.get("objects", []):
        if not isinstance(obj, dict):
            continue
        pos = obj.get("position", {})
        x = obj.get("x", pos.get("x"))
        y = obj.get("y", pos.get("y"))
        if x is not None and y is not None:
            key = (int(x), int(y))
            if key not in seen:
                seen.add(key)
                occupied.append(key)

    # NPCs also occupy cells
    for npc in scene.get("npcs", []):
        if isinstance(npc, dict):
            pos = npc.get("position", {})
            x = npc.get("x", pos.get("x"))
            y = npc.get("y", pos.get("y"))
            if x is not None and y is not None:
                key = (int(x), int(y))
                if key not in seen:
                    seen.add(key)
                    occupied.append(key)

    return sorted(occupied)


def _find_referenced_objects(
    instruction: str, scene: Dict
) -> List[Dict[str, Any]]:
    """Find objects mentioned in the instruction."""
    lower = instruction.lower()
    referenced = []

    for obj in scene.get("actors", []) + scene.get("objects", []):
        if not isinstance(obj, dict):
            continue
        name = obj.get("asset_name", obj.get("name", "")).lower()
        obj_id = obj.get("object_id", obj.get("id", "")).lower()

        if (name and name in lower) or (obj_id and obj_id in lower):
            referenced.append(obj)

    for npc in scene.get("npcs", []):
        if isinstance(npc, dict):
            name = npc.get("name", "").lower()
            npc_id = npc.get("npc_id", npc.get("id", "")).lower()
            if (name and name in lower) or (npc_id and npc_id in lower):
                referenced.append(npc)

    return referenced


def _extract_manifest_assets(manifest: Dict) -> List[Dict]:
    """Extract unique assets from existing manifest."""
    assets = []
    seen = set()
    for scene in manifest.get("scenes", []):
        for obj in scene.get("actors", []) + scene.get("objects", []):
            if isinstance(obj, dict):
                name = obj.get("asset_name", obj.get("name", ""))
                if name and name not in seen:
                    seen.add(name)
                    assets.append({
                        "name": name,
                        "id": obj.get("asset_id", ""),
                        "type": obj.get("type", "object"),
                        "file_url": obj.get("file_url", ""),
                    })
    return assets


def _build_context_text(ctx: ExtractedContext, manifest: Dict) -> str:
    """Build the context string sent to the LLM for semantic asset selection."""
    lines = []

    # Header explaining the task
    lines.append("=" * 60)
    lines.append("SEMANTIC ASSET SELECTION CONTEXT")
    lines.append("=" * 60)
    lines.append("")
    lines.append("Your job: Match user's description to EXACT names from the lists below.")
    lines.append("For REMOVE: Return exact asset_name from 'EXISTING OBJECTS IN SCENE'")
    lines.append("For ADD: Return exact asset_name from 'AVAILABLE ASSETS'")
    lines.append("")

    # Game info
    game = manifest.get("game", {})
    lines.append(f"Game: {game.get('name', 'Untitled')}")

    # Scene info
    if ctx.scene_data:
        lines.append(f'Target scene: "{ctx.scene_name}" '
                      f"(grid: {ctx.grid_width}x{ctx.grid_height})")
        lines.append(f"Valid x: 0-{ctx.grid_width - 1}, "
                      f"Valid y: 0-{ctx.grid_height - 1}")

        if ctx.spawn:
            lines.append(f"Spawn: ({ctx.spawn.get('x', '?')}, "
                          f"{ctx.spawn.get('y', '?')})")
        if ctx.exit_pos:
            lines.append(f"Exit: ({ctx.exit_pos.get('x', '?')}, "
                          f"{ctx.exit_pos.get('y', '?')})")

        # ══════════════════════════════════════════════════════════════
        # EXISTING OBJECTS — REFERENCE FOR SCALE AND Z-INDEX
        # ══════════════════════════════════════════════════════════════
        lines.append("")
        lines.append("─" * 50)
        lines.append("EXISTING OBJECTS IN SCENE")
        lines.append("For REMOVE: Use these EXACT asset_name values as target_id")
        lines.append("For ADD: **COPY the scale value** from objects of the same type!")
        lines.append("─" * 50)
        
        all_objects = []
        seen_ids = set()
        for obj in ctx.scene_data.get("actors", []) + ctx.scene_data.get("objects", []):
            if not isinstance(obj, dict):
                continue
            oid = obj.get("object_id", obj.get("id", id(obj)))
            if oid in seen_ids:
                continue
            seen_ids.add(oid)
            all_objects.append(obj)

        if all_objects:
            # Group by asset type for clarity
            by_type = {}
            for obj in all_objects:
                name = obj.get("asset_name", obj.get("name", "unknown"))
                if name not in by_type:
                    by_type[name] = []
                by_type[name].append(obj)
            
            for asset_name, objs in sorted(by_type.items()):
                # Get consistent scale for this asset type (should be same for all)
                scales = [obj.get("scale", 1.0) for obj in objs]
                typical_scale = scales[0] if scales else 1.0
                
                # Show positions with z_index
                positions = []
                for obj in objs[:3]:  # Limit to 3 examples per type
                    pos = obj.get("position", {})
                    ox = obj.get("x", pos.get("x", "?"))
                    oy = obj.get("y", pos.get("y", "?"))
                    z = obj.get("z_index", "?")
                    positions.append(f"({ox},{oy}) z={z}")
                
                lines.append(f"  • {asset_name} [scale={typical_scale}] — {len(objs)} objects: {', '.join(positions)}")
        else:
            lines.append("  (no objects in scene)")

        # NPCs
        npcs = ctx.scene_data.get("npcs", [])
        if npcs:
            lines.append("")
            lines.append("NPCs in scene:")
            for npc in npcs:
                if isinstance(npc, dict):
                    name = npc.get("name", "?")
                    role = npc.get("role", "?")
                    pos = npc.get("position", {})
                    nx = npc.get("x", pos.get("x", "?"))
                    ny = npc.get("y", pos.get("y", "?"))
                    lines.append(f"  • {name} ({role}) at ({nx},{ny})")

    # ══════════════════════════════════════════════════════════════
    # AVAILABLE ASSETS — FOR ADD OPERATIONS  
    # ══════════════════════════════════════════════════════════════
    if ctx.available_assets:
        lines.append("")
        lines.append("─" * 50)
        lines.append("AVAILABLE ASSETS (for ADD operations)")
        lines.append("Use these EXACT names as asset_name")
        lines.append("─" * 50)
        
        # Group by type for clarity
        by_type = {}
        for a in ctx.available_assets:
            a_type = a.get("type", "object")
            if a_type not in by_type:
                by_type[a_type] = []
            by_type[a_type].append(a)
        
        for a_type, assets in sorted(by_type.items()):
            lines.append(f"  [{a_type}]:")
            for a in assets[:15]:  # Limit per type
                name = a.get("name", "")
                lines.append(f"    • {name}")

    return "\n".join(lines)