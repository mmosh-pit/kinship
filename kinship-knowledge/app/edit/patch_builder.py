"""
Layer 4 — Patch Layer.

Patch Builder: intent → concrete patch (deterministic, NO LLM).
  Backend computes positions, resolves file_urls, generates IDs.
Patch Enforcer: ID locking, budget check, update target validation.
Spatial Conflict Resolver: collision detection, path accessibility.
"""

import uuid
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Tuple, Set

from app.edit.intent_generator import EditIntent
from app.edit.state_layer import ExtractedContext
from app.edit.config import EditBudget
from app.edit.guardrail import check_budget

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class PatchOperation:
    """A single add/update/remove operation."""

    op_type: str  # "add", "update", "remove"
    target_type: str  # "object", "npc", "challenge", "route", "scene"
    target_scene: str = ""
    target_id: str = ""
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class EditPatch:
    """Complete patch — a set of operations to apply atomically."""

    add: List[PatchOperation] = field(default_factory=list)
    update: List[PatchOperation] = field(default_factory=list)
    remove: List[PatchOperation] = field(default_factory=list)

    def is_empty(self) -> bool:
        return not self.add and not self.update and not self.remove

    def total_ops(self) -> int:
        return len(self.add) + len(self.update) + len(self.remove)

    def to_dict(self) -> Dict:
        return {
            "add": [{"type": o.target_type, "scene": o.target_scene,
                      "id": o.target_id, **o.data} for o in self.add],
            "update": [{"type": o.target_type, "scene": o.target_scene,
                         "id": o.target_id, **o.data} for o in self.update],
            "remove": [{"type": o.target_type, "scene": o.target_scene,
                         "id": o.target_id} for o in self.remove],
        }


@dataclass
class PatchResult:
    """Result from patch building."""

    success: bool = False
    patch: EditPatch = field(default_factory=EditPatch)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)


# ═══════════════════════════════════════════════════════════════════════════════
#  PATCH BUILDER — DETERMINISTIC
# ═══════════════════════════════════════════════════════════════════════════════


def build_patch(
    intents: List[EditIntent],
    context: ExtractedContext,
) -> PatchResult:
    """
    Convert intents → concrete patch.
    Backend computes positions, IDs, file_urls.
    NO LLM involved.

    IMPORTANT: 
    - Updates context.occupied_cells after each add to prevent overlaps
    - Tracks positions per asset type for intelligent spreading when
      adding multiple objects of the same type (e.g., 2 campfires)
    """
    result = PatchResult()
    patch = EditPatch()

    # Convert to a mutable set for tracking during batch adds
    # This ensures subsequent adds don't overlap with earlier ones in the same batch
    occupied_set = set(context.occupied_cells)
    
    # Track positions per asset type for spreading same-type objects
    # Key: asset_name (lowercase), Value: list of (x, y) positions
    positions_by_asset: Dict[str, List[Tuple[int, int]]] = {}

    for intent in intents:
        try:
            if intent.action == "add":
                # Get asset name for tracking
                asset_name = (intent.asset_name or "object").lower()
                same_type_positions = positions_by_asset.get(asset_name, [])
                
                # Build operation with spread-aware positioning
                op = _build_add_operation_spread(
                    intent, context, same_type_positions
                )
                if op:
                    patch.add.append(op)
                    # CRITICAL: Update occupied_cells after each add so subsequent
                    # adds in this batch won't get the same position
                    x = op.data.get("x")
                    y = op.data.get("y")
                    if x is not None and y is not None:
                        new_pos = (int(x), int(y))
                        occupied_set.add(new_pos)
                        # Update context so _find_free_adjacent sees the new position
                        context.occupied_cells = list(occupied_set)
                        # Track position for this asset type
                        if asset_name not in positions_by_asset:
                            positions_by_asset[asset_name] = []
                        positions_by_asset[asset_name].append(new_pos)

            elif intent.action == "remove":
                # Check if this is a "remove all" operation
                if intent.properties.get("remove_all"):
                    # Find all objects matching the target asset name
                    ops = _build_remove_all_operations(intent, context)
                    patch.remove.extend(ops)
                else:
                    op = _build_remove_operation(intent, context)
                    if op:
                        patch.remove.append(op)

            elif intent.action == "move":
                op = _build_move_operation(intent, context)
                if op:
                    patch.update.append(op)

            elif intent.action == "update":
                op = _build_update_operation(intent, context)
                if op:
                    patch.update.append(op)

            else:
                result.warnings.append(f"Unknown action: {intent.action}")

        except Exception as e:
            result.errors.append(f"Failed to build patch for {intent.action}: {e}")

    result.patch = patch
    result.success = not result.errors and not patch.is_empty()
    return result


def _build_add_operation_spread(
    intent: EditIntent,
    context: ExtractedContext,
    same_type_positions: List[Tuple[int, int]],
) -> Optional[PatchOperation]:
    """
    Build an add operation with spread-aware positioning.
    
    When adding multiple objects of the same type, uses _find_spread_position
    to distribute them across the scene instead of clustering.
    Also considers existing objects of the same type already in the scene.
    
    IMPORTANT: Copies scale, walkable, tile_config from existing objects of same type
    to ensure consistent appearance and collision behavior.
    """
    resolved_name = intent.asset_name or "object"

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 1: Find existing object of same type to copy properties from
    # ═══════════════════════════════════════════════════════════════════════════
    template_obj = None
    all_objects = (
        context.scene_data.get("actors", [])
        + context.scene_data.get("objects", [])
    )
    
    for obj in all_objects:
        if not isinstance(obj, dict):
            continue
        obj_name = obj.get("asset_name", obj.get("name", "")).lower()
        if obj_name == resolved_name.lower() or _fuzzy_name_match(resolved_name, obj_name):
            template_obj = obj
            # Prefer template with file_url
            if obj.get("file_url"):
                break
    
    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 2: Find positions of same-type objects for spreading
    # ═══════════════════════════════════════════════════════════════════════════
    existing_same_type = []
    for obj in all_objects:
        if not isinstance(obj, dict):
            continue
        obj_name = obj.get("asset_name", obj.get("name", "")).lower()
        if obj_name == resolved_name.lower() or resolved_name.lower() in obj_name:
            pos = obj.get("position", {})
            ox = obj.get("x", pos.get("x"))
            oy = obj.get("y", pos.get("y"))
            if ox is not None and oy is not None:
                existing_same_type.append((int(ox), int(oy)))
    
    # Combine existing positions with batch positions
    all_same_type = existing_same_type + same_type_positions
    
    # Determine position based on whether we have same-type objects
    if intent.relative_to:
        x, y = _compute_position(intent, context)
    elif all_same_type:
        x, y = _find_spread_position(context, all_same_type)
    else:
        x, y = _compute_position(intent, context)

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 3: Resolve file_url and asset_id
    # ═══════════════════════════════════════════════════════════════════════════
    file_url = ""
    asset_id = ""

    # Priority 1: Copy from template object
    if template_obj:
        file_url = template_obj.get("file_url", "")
        asset_id = template_obj.get("asset_id", "")
        if not resolved_name or resolved_name == "object":
            resolved_name = template_obj.get("asset_name", resolved_name)

    # Priority 2: Exact match in available assets
    if not file_url:
        for asset in context.available_assets:
            if asset.get("name", "").lower() == resolved_name.lower():
                file_url = asset.get("file_url", "")
                asset_id = asset.get("id", "")
                break

    # Priority 3: Fuzzy match in available assets
    if not file_url:
        for asset in context.available_assets:
            name = asset.get("name", "").lower()
            if resolved_name.lower() in name or name in resolved_name.lower():
                file_url = asset.get("file_url", "")
                asset_id = asset.get("id", "")
                resolved_name = asset.get("name", resolved_name)
                break

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 4: Copy properties from template OR use AI-provided values
    # AI has priority since it understands visual appearance
    # ═══════════════════════════════════════════════════════════════════════════
    
    # Scale - PRIORITY: 1) AI-provided, 2) template, 3) default
    # AI should always provide scale based on existing objects of same type
    scale = 1.0
    scale_source = "default"
    
    if intent.properties.get("scale") is not None:
        scale = float(intent.properties["scale"])
        scale_source = "AI"
    elif template_obj:
        template_scale = template_obj.get("scale")
        if template_scale is not None and isinstance(template_scale, (int, float)):
            scale = float(template_scale)
            scale_source = f"template ({template_obj.get('asset_name', 'unknown')})"
    
    logger.info(f"Scale for {resolved_name}: {scale} (source: {scale_source})")
    
    # Z-index - PRIORITY: 1) AI-provided, 2) template-based, 3) fallback calculation
    # The AI understands visual appearance/height of assets, so we trust its z-index
    layer = intent.properties.get("layer", "objects")
    if template_obj:
        layer = template_obj.get("layer", layer)
    
    # Check if AI provided z_index
    if intent.properties.get("z_index") is not None:
        z_index = int(intent.properties["z_index"])
        logger.info(f"Z-index from AI: {z_index} for {intent.asset_name} at ({x},{y})")
    elif template_obj:
        # Get template's z-index and position
        template_z = template_obj.get("z_index", 100)
        template_pos = template_obj.get("position", {})
        template_x = template_obj.get("x", template_pos.get("x", 0))
        template_y = template_obj.get("y", template_pos.get("y", 0))
        
        # Calculate z-index offset per grid cell from template
        # This preserves the AI's visual understanding of the asset's depth
        grid_width = context.grid_width or 16
        
        # Use the same relative z-index calculation as the template
        # z increases as y increases (objects lower on screen are in front)
        template_grid_pos = template_y * grid_width + template_x
        new_grid_pos = y * grid_width + x
        
        if template_grid_pos > 0:
            # Calculate z-per-cell ratio from template
            z_per_cell = template_z / template_grid_pos
            z_index = int(new_grid_pos * z_per_cell)
        else:
            # Template at origin, use its z directly adjusted for position
            z_index = template_z + (new_grid_pos * 10)
        
        logger.debug(
            f"Z-index from template: template at ({template_x},{template_y}) z={template_z}, "
            f"new at ({x},{y}) z={z_index}"
        )
    else:
        # No AI value, no template - use default calculation (fallback)
        z_index = (y * (context.grid_width or 16) + x) * 10
        logger.debug(f"Z-index calculated (no template): ({x},{y}) z={z_index}")
    
    # Tile config - copy from template or use defaults
    # IMPORTANT: walkable in GCS is a STRING ("walkable", "blocked", etc.), not boolean
    tile_config = {
        "walkable": "blocked",  # Default: objects block movement
        "terrain_cost": 1,
        "terrain_type": "",
        "auto_group": "",
        "is_edge": False
    }
    if template_obj:
        template_meta = template_obj.get("metadata", {})
        template_tile_config = template_meta.get("tile_config", {})
        if template_tile_config:
            tile_config = dict(template_tile_config)
    
    # Hitbox - copy from template or use defaults
    hitbox = {
        "width": 1,
        "height": 1,
        "offset_x": 0,
        "offset_y": 0
    }
    if template_obj:
        template_meta = template_obj.get("metadata", {})
        template_hitbox = template_meta.get("hitbox", {})
        if template_hitbox:
            hitbox = dict(template_hitbox)
    
    # Other properties from template
    interaction_type = "none"
    obj_type = "object"
    tags = []
    facet = ""
    
    if template_obj:
        interaction_type = template_obj.get("interaction_type", "none")
        obj_type = template_obj.get("type", "object")
        tags = template_obj.get("tags", [])
        facet = template_obj.get("facet", "")

    # Generate unique ID
    obj_id = f"obj_{str(uuid.uuid4())[:8]}"

    # ═══════════════════════════════════════════════════════════════════════════
    # STEP 5: Build the complete data structure matching GCS format
    # ═══════════════════════════════════════════════════════════════════════════
    data = {
        "object_id": obj_id,
        "asset_id": asset_id,
        "asset_name": resolved_name,
        "x": x,
        "y": y,
        "position": {"x": x, "y": y},
        "file_url": file_url,
        "z_index": z_index,
        "layer": layer,
        "scale": scale,
        "type": obj_type,
        "interaction_type": interaction_type,
        "tags": list(tags) if tags else [],
        "facet": facet,
        # For backwards compatibility with some code paths
        "walkable": tile_config.get("walkable") == "walkable",
        "interactable": interaction_type != "none",
        # Full metadata for GCS
        "metadata": {
            "asset_type": obj_type,
            "tile_config": tile_config,
            "hitbox": hitbox,
            "added_by": "edit_pipeline",
            "scale": scale,
        }
    }

    # Merge extra properties from intent (but don't override critical ones)
    for key, val in intent.properties.items():
        if key not in data and key not in ("walkable", "scale", "z_index"):
            data[key] = val

    logger.info(
        f"Built ADD operation: {resolved_name} at ({x},{y}) "
        f"scale={scale} walkable={tile_config.get('walkable')} z={z_index}"
    )

    return PatchOperation(
        op_type="add",
        target_type=intent.target_type,
        target_scene=intent.target_scene or context.scene_name,
        target_id=obj_id,
        data=data,
    )


def _build_add_operation(
    intent: EditIntent, context: ExtractedContext
) -> Optional[PatchOperation]:
    """Build an add operation with computed position and resolved asset."""

    # Resolve position
    x, y = _compute_position(intent, context)

    # Resolve file_url and asset_id
    file_url = ""
    asset_id = ""
    resolved_name = intent.asset_name or "object"

    # 1. Exact match in available assets
    for asset in context.available_assets:
        if asset.get("name", "").lower() == resolved_name.lower():
            file_url = asset.get("file_url", "")
            asset_id = asset.get("id", "")
            break

    # 2. Fuzzy match in available assets (e.g., "campfire" matches "campfire_01")
    if not file_url:
        for asset in context.available_assets:
            name = asset.get("name", "").lower()
            if resolved_name.lower() in name or name in resolved_name.lower():
                file_url = asset.get("file_url", "")
                asset_id = asset.get("id", "")
                resolved_name = asset.get("name", resolved_name)
                break

    # 3. Search ALL scenes for existing objects with same asset_name
    #    (this finds file_url from objects already placed in the game)
    if not file_url:
        manifest = {}
        if hasattr(context, 'scene_data') and context.scene_data:
            # Try to get the full manifest from the context if available
            pass

        # Search target scene first, then other data
        all_objects = (
            context.scene_data.get("actors", [])
            + context.scene_data.get("objects", [])
        )
        for obj in all_objects:
            if not isinstance(obj, dict):
                continue
            obj_name = obj.get("asset_name", obj.get("name", "")).lower()
            if obj_name == resolved_name.lower() or resolved_name.lower() in obj_name:
                file_url = obj.get("file_url", "")
                asset_id = asset_id or obj.get("asset_id", "")
                if not resolved_name or resolved_name == "object":
                    resolved_name = obj.get("asset_name", resolved_name)
                if file_url:
                    break

    # Generate unique ID
    obj_id = f"obj_{str(uuid.uuid4())[:8]}"
    
    # Calculate proper isometric z-index based on position
    layer = intent.properties.get("layer", "objects")
    z_index = _calculate_isometric_z_index(x, y, context.grid_width, layer)

    data = {
        "object_id": obj_id,
        "asset_id": asset_id,
        "asset_name": resolved_name,
        "x": x,
        "y": y,
        "position": {"x": x, "y": y},
        "file_url": file_url,
        "z_index": z_index,
        "layer": layer,
        "scale": 1.0,
        "type": intent.properties.get("type", "interactive"),
        "walkable": intent.properties.get("walkable", False),
        "interactable": intent.properties.get("interactable", True),
    }

    # Merge extra properties
    for key, val in intent.properties.items():
        if key not in data:
            data[key] = val

    return PatchOperation(
        op_type="add",
        target_type=intent.target_type,
        target_scene=intent.target_scene or context.scene_name,
        target_id=obj_id,
        data=data,
    )


def _normalize_name(name: str) -> str:
    """Normalize name for fuzzy matching: remove spaces/underscores/hyphens."""
    return name.lower().replace(" ", "").replace("_", "").replace("-", "")


def _get_words(name: str) -> set:
    """Extract individual words from a name (split on space/underscore/hyphen)."""
    import re
    return set(w.lower() for w in re.split(r'[\s_\-]+', name) if w)


def _fuzzy_name_match(target: str, asset_name: str) -> bool:
    """
    Check if target matches asset_name (handles space/underscore variations).
    
    Matching strategies:
    1. Exact normalized match: "stone_well" == "stone well"
    2. Substring match: "tree" in "pine_tree"
    3. Word-based match: all words in target found in asset_name
       e.g., "red mushroom" matches "red_spotted_mushrooms"
    """
    target_lower = target.lower()
    asset_lower = asset_name.lower()
    target_norm = _normalize_name(target)
    asset_norm = _normalize_name(asset_name)
    
    # Exact normalized match
    if target_norm == asset_norm:
        return True
    # Substring match (both directions)
    if target_lower in asset_lower or asset_lower in target_lower:
        return True
    # Normalized substring match
    if target_norm in asset_norm or asset_norm in target_norm:
        return True
    
    # Word-based match: all words in target found in asset_name
    # e.g., "red mushroom" matches "red_spotted_mushrooms"
    target_words = _get_words(target)
    asset_words = _get_words(asset_name)
    
    if target_words and all(
        any(tw in aw or aw.startswith(tw) for aw in asset_words) 
        for tw in target_words
    ):
        return True
    
    return False


def _build_remove_operation(
    intent: EditIntent, context: ExtractedContext
) -> Optional[PatchOperation]:
    """
    Build a remove operation, resolving target by ID or asset name.
    
    Supports two modes:
    1. Remove by object_id: "remove obj_abc123" -> removes specific object
    2. Remove by asset_name: "remove campfire" -> removes first matching object
    
    Handles space/underscore variations: "stone well" matches "stone_well"
    """
    if not intent.target_id:
        logger.warning("No target_id provided for remove")
        return None
    
    target_lower = intent.target_id.lower()
    
    # First try exact ID match
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            oid = obj.get("object_id", obj.get("id", ""))
            if oid and oid.lower() == target_lower:
                return PatchOperation(
                    op_type="remove",
                    target_type=intent.target_type,
                    target_scene=intent.target_scene or context.scene_name,
                    target_id=oid,
                )
    
    # Then try asset_name match - find first object with matching asset name
    # Uses fuzzy matching to handle "stone well" -> "stone_well"
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            asset_name = obj.get("asset_name", obj.get("name", ""))
            if asset_name and _fuzzy_name_match(intent.target_id, asset_name):
                oid = obj.get("object_id", obj.get("id", ""))
                if oid:
                    logger.info(f"Remove by asset_name: '{intent.target_id}' -> '{oid}' (asset: {asset_name})")
                    return PatchOperation(
                        op_type="remove",
                        target_type=intent.target_type,
                        target_scene=intent.target_scene or context.scene_name,
                        target_id=oid,
                    )
    
    # Try NPC match
    for npc in context.scene_data.get("npcs", []):
        if isinstance(npc, dict):
            nid = npc.get("npc_id", npc.get("id", ""))
            name = npc.get("name", "").lower()
            if nid and (nid.lower() == target_lower or target_lower in name):
                return PatchOperation(
                    op_type="remove",
                    target_type="npc",
                    target_scene=intent.target_scene or context.scene_name,
                    target_id=nid,
                )
    
    logger.warning(f"Cannot resolve remove target: {intent.target_id}")
    return None


def _build_remove_all_operations(
    intent: EditIntent, context: ExtractedContext
) -> List[PatchOperation]:
    """
    Build remove operations for ALL objects matching the target asset name.
    
    Used for "remove all campfires" type commands.
    Handles space/underscore variations: "stone well" matches "stone_well"
    """
    operations = []
    
    if not intent.target_id:
        return operations
    
    # Find all objects with matching asset_name (using fuzzy match)
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            asset_name = obj.get("asset_name", obj.get("name", ""))
            if asset_name and _fuzzy_name_match(intent.target_id, asset_name):
                oid = obj.get("object_id", obj.get("id", ""))
                if oid:
                    operations.append(PatchOperation(
                        op_type="remove",
                        target_type=intent.target_type,
                        target_scene=intent.target_scene or context.scene_name,
                        target_id=oid,
                    ))
    
    if operations:
        logger.info(f"Remove all '{intent.target_id}': found {len(operations)} objects")
    else:
        logger.warning(f"Remove all '{intent.target_id}': no matching objects found")
    
    return operations


def _build_move_operation(
    intent: EditIntent, context: ExtractedContext
) -> Optional[PatchOperation]:
    """Build a move operation with computed new position."""
    target_id = _resolve_target_id(intent, context)
    if not target_id:
        logger.warning(f"Cannot resolve move target: {intent.target_id}")
        return None

    # Get current position
    current = _find_object_position(target_id, context)
    if not current:
        logger.warning(f"Cannot find position for: {target_id}")
        return None

    # Compute new position
    if intent.relative_to:
        new_x, new_y = _compute_position(intent, context)
    elif intent.direction:
        new_x, new_y = _apply_direction(current[0], current[1], intent.direction)
    else:
        new_x, new_y = current  # No change

    # Clamp to bounds
    new_x = max(0, min(context.grid_width - 1, new_x))
    new_y = max(0, min(context.grid_height - 1, new_y))
    
    # Recalculate z-index for new position to maintain proper depth sorting
    layer = intent.properties.get("layer", "objects")
    new_z_index = _calculate_isometric_z_index(new_x, new_y, context.grid_width, layer)

    return PatchOperation(
        op_type="update",
        target_type=intent.target_type,
        target_scene=intent.target_scene or context.scene_name,
        target_id=target_id,
        data={
            "x": new_x,
            "y": new_y,
            "position": {"x": new_x, "y": new_y},
            "z_index": new_z_index,
        },
    )


def _build_update_operation(
    intent: EditIntent, context: ExtractedContext
) -> Optional[PatchOperation]:
    """Build an update operation for properties."""
    target_id = _resolve_target_id(intent, context)
    if not target_id:
        logger.warning(f"Cannot resolve update target: {intent.target_id}")
        return None

    return PatchOperation(
        op_type="update",
        target_type=intent.target_type,
        target_scene=intent.target_scene or context.scene_name,
        target_id=target_id,
        data=intent.properties,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  POSITION COMPUTATION
# ═══════════════════════════════════════════════════════════════════════════════


def _compute_position(
    intent: EditIntent, context: ExtractedContext
) -> Tuple[int, int]:
    """Compute position based on relative_to reference. No LLM."""

    # If relative_to references an existing object, place adjacent
    if intent.relative_to:
        ref_pos = _find_reference_position(intent.relative_to, context)
        if ref_pos:
            return _find_free_adjacent(ref_pos[0], ref_pos[1], context)

    # If relative_to is "spawn"
    if intent.relative_to and intent.relative_to.lower() == "spawn":
        sx = context.spawn.get("x", context.grid_width // 2)
        sy = context.spawn.get("y", context.grid_height - 2)
        return _find_free_adjacent(sx, sy, context)

    # If relative_to is "exit"
    if intent.relative_to and intent.relative_to.lower() == "exit":
        if context.exit_pos:
            ex = context.exit_pos.get("x", context.grid_width // 2)
            ey = context.exit_pos.get("y", 1)
            return _find_free_adjacent(ex, ey, context)

    # If relative_to is "center"
    if intent.relative_to and intent.relative_to.lower() == "center":
        cx = context.grid_width // 2
        cy = context.grid_height // 2
        return _find_free_adjacent(cx, cy, context)

    # Default: find any free cell near center
    cx = context.grid_width // 2
    cy = context.grid_height // 2
    return _find_free_adjacent(cx, cy, context)


def _find_reference_position(
    reference: str, context: ExtractedContext
) -> Optional[Tuple[int, int]]:
    """Find position of a referenced object by name or ID (handles space/underscore variations)."""
    ref_lower = reference.lower()

    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if not isinstance(obj, dict):
            continue
        name = obj.get("asset_name", obj.get("name", ""))
        oid = obj.get("object_id", obj.get("id", "")).lower()

        # Check exact ID match or fuzzy name match
        if oid == ref_lower or (name and _fuzzy_name_match(reference, name)):
            pos = obj.get("position", {})
            x = obj.get("x", pos.get("x"))
            y = obj.get("y", pos.get("y"))
            if x is not None and y is not None:
                return (int(x), int(y))

    # Check NPCs
    for npc in context.scene_data.get("npcs", []):
        if isinstance(npc, dict):
            name = npc.get("name", "").lower()
            if name == ref_lower or ref_lower in name:
                pos = npc.get("position", {})
                x = npc.get("x", pos.get("x"))
                y = npc.get("y", pos.get("y"))
                if x is not None and y is not None:
                    return (int(x), int(y))

    return None


def _find_free_adjacent(
    cx: int, cy: int, context: ExtractedContext
) -> Tuple[int, int]:
    """Find nearest free cell adjacent to (cx, cy)."""
    occupied = set(context.occupied_cells)

    # Try offsets in expanding radius
    for radius in range(1, max(context.grid_width, context.grid_height)):
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                if abs(dx) != radius and abs(dy) != radius:
                    continue  # Only check the perimeter of this radius
                nx, ny = cx + dx, cy + dy
                if (0 <= nx < context.grid_width
                        and 0 <= ny < context.grid_height
                        and (nx, ny) not in occupied):
                    return (nx, ny)

    # Fallback: center of grid
    return (context.grid_width // 2, context.grid_height // 2)


# Minimum distance between objects of the same type when batch adding
MIN_SAME_TYPE_SPACING = 3

# Base z-index offset for the objects layer
Z_INDEX_OBJECTS_BASE = 100


def _calculate_isometric_z_index(
    x: int, y: int, grid_width: int, layer: str = "objects"
) -> int:
    """
    Calculate z-index for proper isometric depth sorting.
    
    In isometric view, objects with higher Y (and X) should render in front
    of objects with lower Y (and X). This creates the correct depth illusion
    where objects closer to the camera (bottom of screen) overlap objects
    farther away (top of screen).
    
    IMPORTANT: Must match the GCS/engine z-index pattern:
    z = (y * grid_width + x) * 10
    
    This gives z-index values like:
    - (2, 1) on 16-wide grid: (1*16 + 2) * 10 = 180
    - (6, 4) on 16-wide grid: (4*16 + 6) * 10 = 700
    - (8, 8) on 16-wide grid: (8*16 + 8) * 10 = 1360
    
    Layer offsets can be added for layer separation if needed.
    """
    # Base calculation matching GCS pattern
    position_z = (y * grid_width + x) * 10
    
    # Layer offsets (optional - for separating layers)
    layer_offsets = {
        "ground": -2000,      # Always behind
        "floor": -1000,       # Behind objects
        "objects": 0,         # Standard objects
        "characters": 5,      # Slightly in front of objects at same position
        "effects": 2000,      # In front of everything
        "ui": 5000,           # UI always on top
    }
    
    offset = layer_offsets.get(layer, 0)
    return position_z + offset


def _find_spread_position(
    context: ExtractedContext,
    same_type_positions: List[Tuple[int, int]],
    min_spacing: int = MIN_SAME_TYPE_SPACING,
) -> Tuple[int, int]:
    """
    Find a position that is well-spaced from other objects of the same type.
    
    This prevents clustering when adding multiple objects (e.g., 2 campfires).
    Uses a scoring system to find positions that maximize distance from
    same-type objects while staying in playable area.
    """
    occupied = set(context.occupied_cells)
    w = context.grid_width
    h = context.grid_height
    
    # Define playable area (avoid edges)
    margin = 2
    min_x, max_x = margin, w - margin - 1
    min_y, max_y = margin, h - margin - 1
    
    # If no same-type objects yet, find a good starting position
    if not same_type_positions:
        # Try quadrant-based placement for variety
        quadrants = [
            (w // 4, h // 4),         # Top-left quadrant
            (3 * w // 4, h // 4),     # Top-right quadrant
            (w // 4, 3 * h // 4),     # Bottom-left quadrant
            (3 * w // 4, 3 * h // 4), # Bottom-right quadrant
            (w // 2, h // 2),         # Center
        ]
        for qx, qy in quadrants:
            pos = _find_free_adjacent(qx, qy, context)
            if pos not in occupied:
                return pos
        return _find_free_adjacent(w // 2, h // 2, context)
    
    # Find position that maximizes minimum distance from same-type objects
    best_pos = None
    best_min_dist = -1
    
    # Scan playable area
    for y in range(min_y, max_y + 1):
        for x in range(min_x, max_x + 1):
            if (x, y) in occupied:
                continue
            
            # Calculate minimum distance to any same-type object
            min_dist = float('inf')
            for sx, sy in same_type_positions:
                dist = abs(x - sx) + abs(y - sy)  # Manhattan distance
                min_dist = min(min_dist, dist)
            
            # Prefer positions that are far from same-type objects
            if min_dist > best_min_dist:
                best_min_dist = min_dist
                best_pos = (x, y)
    
    # If we found a good spread position with enough spacing, use it
    if best_pos and best_min_dist >= min_spacing:
        return best_pos
    
    # If no position meets spacing requirement, use best available
    if best_pos:
        return best_pos
    
    # Fallback to adjacent search from center
    return _find_free_adjacent(w // 2, h // 2, context)


def _find_object_position(
    target_id: str, context: ExtractedContext
) -> Optional[Tuple[int, int]]:
    """Find current position of an object by ID or name."""
    tid = target_id.lower()

    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if not isinstance(obj, dict):
            continue
        oid = obj.get("object_id", obj.get("id", "")).lower()
        name = obj.get("asset_name", obj.get("name", "")).lower()

        if oid == tid or name == tid or tid in name:
            pos = obj.get("position", {})
            x = obj.get("x", pos.get("x"))
            y = obj.get("y", pos.get("y"))
            if x is not None and y is not None:
                return (int(x), int(y))

    return None


def _apply_direction(x: int, y: int, direction: str) -> Tuple[int, int]:
    """Apply a directional offset."""
    offsets = {
        "left": (-2, 0), "right": (2, 0),
        "up": (0, -2), "down": (0, 2),
        "north": (0, -2), "south": (0, 2),
        "east": (2, 0), "west": (-2, 0),
    }
    dx, dy = offsets.get(direction.lower(), (0, 0))
    return (x + dx, y + dy)


def _resolve_target_id(
    intent: EditIntent, context: ExtractedContext
) -> Optional[str]:
    """Resolve target by ID or name match (handles space/underscore variations)."""
    if not intent.target_id:
        return None

    tid = intent.target_id.lower()

    # Direct ID match
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            oid = obj.get("object_id", obj.get("id", ""))
            if oid.lower() == tid:
                return oid

    # Name match (with fuzzy matching for space/underscore variations)
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            name = obj.get("asset_name", obj.get("name", ""))
            if name and _fuzzy_name_match(intent.target_id, name):
                return obj.get("object_id", obj.get("id", ""))

    # NPC match
    for npc in context.scene_data.get("npcs", []):
        if isinstance(npc, dict):
            nid = npc.get("npc_id", npc.get("id", ""))
            name = npc.get("name", "").lower()
            if nid.lower() == tid or name == tid or tid in name:
                return nid

    return intent.target_id  # Return as-is if no match


# ═══════════════════════════════════════════════════════════════════════════════
#  PATCH ENFORCER
# ═══════════════════════════════════════════════════════════════════════════════


def enforce_patch(
    patch: EditPatch,
    context: ExtractedContext,
    budget: EditBudget = None,
) -> List[str]:
    """
    Enforce hard constraints on the patch.
    Returns list of violations. Empty = patch is safe.
    """
    violations = []

    # Budget check
    budget_dict = {
        "add": [op.data for op in patch.add],
        "update": [op.data for op in patch.update],
        "remove": [{}] * len(patch.remove),
    }
    violations.extend(check_budget(budget_dict, budget))

    # ID immutability — updates must not change IDs
    for op in patch.update:
        if "object_id" in op.data and op.data["object_id"] != op.target_id:
            violations.append(
                f"Cannot change ID: {op.target_id} → {op.data['object_id']}"
            )

    # Update targets must exist
    existing_ids = set()
    for obj in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
        if isinstance(obj, dict):
            oid = obj.get("object_id", obj.get("id", ""))
            if oid:
                existing_ids.add(oid)
    for npc in context.scene_data.get("npcs", []):
        if isinstance(npc, dict):
            nid = npc.get("npc_id", npc.get("id", ""))
            if nid:
                existing_ids.add(nid)

    for op in patch.update:
        if op.target_id and op.target_id not in existing_ids:
            violations.append(f"Update target not found: {op.target_id}")

    for op in patch.remove:
        if op.target_id and op.target_id not in existing_ids:
            violations.append(f"Remove target not found: {op.target_id}")

    return violations


# ═══════════════════════════════════════════════════════════════════════════════
#  SPATIAL CONFLICT RESOLVER
# ═══════════════════════════════════════════════════════════════════════════════


def resolve_spatial_conflicts(
    patch: EditPatch,
    context: ExtractedContext,
) -> List[str]:
    """
    Check and fix spatial conflicts.
    Returns list of warnings (conflicts that were auto-resolved).

    Checks:
    - Collision detection (overlapping objects)
    - Single BFS from spawn → check ALL objectives reachable:
      exits, NPCs, challenges, collectibles

    IMPORTANT: Updates context.occupied_cells during collision resolution
    so that multiple colliding objects get unique new positions.
    """
    warnings = []
    occupied = set(context.occupied_cells)

    # ── Check each add for collision ────────────────────────────
    for op in patch.add:
        x = op.data.get("x")
        y = op.data.get("y")
        if x is None or y is None:
            continue

        pos = (int(x), int(y))
        if pos in occupied:
            # CRITICAL: Update context.occupied_cells BEFORE calling _find_free_adjacent
            # so that it sees all positions occupied by earlier items in this batch
            context.occupied_cells = list(occupied)
            new_x, new_y = _find_free_adjacent(pos[0], pos[1], context)
            op.data["x"] = new_x
            op.data["y"] = new_y
            op.data["position"] = {"x": new_x, "y": new_y}
            warnings.append(
                f"Collision at ({x},{y}), moved to ({new_x},{new_y})"
            )
            pos = (new_x, new_y)

        occupied.add(pos)

    # Final sync of context for BFS path check
    context.occupied_cells = list(occupied)

    # ── Path accessibility — single BFS, check all targets ──────
    spawn = context.spawn
    if not spawn or spawn.get("x") is None:
        return warnings

    try:
        from collections import deque

        w = context.grid_width
        h = context.grid_height
        sx = int(spawn.get("x", 0))
        sy = int(spawn.get("y", 0))

        if not (0 <= sx < w and 0 <= sy < h):
            return warnings

        # Build grid with all occupied cells (including new adds)
        grid = [[0] * w for _ in range(h)]
        for ox, oy in occupied:
            if 0 <= ox < w and 0 <= oy < h:
                grid[oy][ox] = 1

        # Single BFS from spawn
        reachable = set()
        queue = deque([(sx, sy)])
        reachable.add((sx, sy))
        directions = [(0, 1), (0, -1), (1, 0), (-1, 0)]

        while queue:
            x, y = queue.popleft()
            for dx, dy in directions:
                nx, ny = x + dx, y + dy
                if (0 <= nx < w and 0 <= ny < h
                        and (nx, ny) not in reachable
                        and grid[ny][nx] != 1):
                    reachable.add((nx, ny))
                    queue.append((nx, ny))

        # Check exit
        if context.exit_pos and context.exit_pos.get("x") is not None:
            ex = int(context.exit_pos["x"])
            ey = int(context.exit_pos["y"])
            if (ex, ey) not in reachable:
                warnings.append(
                    f"WARNING: Exit at ({ex},{ey}) blocked from spawn after edit"
                )

        # Check NPCs
        for npc in context.scene_data.get("npcs", []):
            if not isinstance(npc, dict):
                continue
            npc_pos_d = npc.get("position", {})
            nx = npc.get("x", npc_pos_d.get("x"))
            ny = npc.get("y", npc_pos_d.get("y"))
            if nx is not None and ny is not None:
                if (int(nx), int(ny)) not in reachable:
                    name = npc.get("name", npc.get("npc_id", "NPC"))
                    warnings.append(
                        f"WARNING: NPC '{name}' at ({nx},{ny}) blocked after edit"
                    )

        # Check challenges
        for ch in context.scene_data.get("challenges", []):
            if not isinstance(ch, dict):
                continue
            ch_pos = ch.get("position", {})
            cx = ch.get("x", ch_pos.get("x"))
            cy = ch.get("y", ch_pos.get("y"))
            if cx is not None and cy is not None:
                if (int(cx), int(cy)) not in reachable:
                    name = ch.get("name", ch.get("challenge_id", "challenge"))
                    warnings.append(
                        f"WARNING: Challenge '{name}' at ({cx},{cy}) blocked after edit"
                    )

        # Check collectibles / interactive objects
        for actor in context.scene_data.get("actors", []) + context.scene_data.get("objects", []):
            if not isinstance(actor, dict):
                continue
            if actor.get("type") not in ("collectible", "interactive"):
                continue
            apos = actor.get("position", {})
            ax = actor.get("x", apos.get("x"))
            ay = actor.get("y", apos.get("y"))
            if ax is not None and ay is not None:
                if (int(ax), int(ay)) not in reachable:
                    name = actor.get("asset_name", actor.get("object_id", "object"))
                    warnings.append(
                        f"WARNING: Object '{name}' at ({ax},{ay}) blocked after edit"
                    )

    except Exception as e:
        logger.warning(f"Path check failed: {e}")

    return warnings