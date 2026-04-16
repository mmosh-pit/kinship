"""
Layer 5 — Merge Layer.

State Merge Engine: apply patch to manifest (deterministic, no LLM).
Version Conflict Check: optimistic concurrency control.
Edit Diff Logger: store {before, patch, after} for debugging.
Session Memory Write: append to edit history for conversational context.
"""

import copy
import logging
import uuid
from datetime import datetime
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any, Set

from app.state.game_state import GameState, EditRecord, EditType
from app.edit.patch_builder import EditPatch, PatchOperation
from app.edit.state_layer import StateSnapshot

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA STRUCTURES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class EditDiff:
    """Full diff record for debugging."""

    edit_id: str
    timestamp: str
    instruction: str
    before_hash: str = ""
    after_hash: str = ""
    patch: Dict[str, Any] = field(default_factory=dict)
    dirty_scenes: List[str] = field(default_factory=list)
    dirty_npcs: List[str] = field(default_factory=list)
    dirty_challenges: List[str] = field(default_factory=list)


@dataclass
class MergeResult:
    """Result from state merge."""

    success: bool = False
    diff: Optional[EditDiff] = None
    dirty_flags: Dict[str, Any] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    conflict: bool = False


# ═══════════════════════════════════════════════════════════════════════════════
#  VERSION CONFLICT CHECK
# ═══════════════════════════════════════════════════════════════════════════════


def check_version_conflict(
    game_state: GameState,
    version_at_load: int,
) -> Optional[Dict[str, Any]]:
    """
    Optimistic concurrency check.
    Returns conflict info if version changed, None if safe.
    """
    if game_state.version != version_at_load:
        return {
            "conflict": True,
            "your_version": version_at_load,
            "current_version": game_state.version,
            "message": "State modified by another session. Reload and retry.",
        }
    return None


# ═══════════════════════════════════════════════════════════════════════════════
#  STATE MERGE ENGINE
# ═══════════════════════════════════════════════════════════════════════════════


def merge_patch(
    game_state: GameState,
    patch: EditPatch,
    instruction: str,
    version_at_load: int,
    manifest_snapshot: dict = None,
) -> MergeResult:
    """
    Apply patch to GameState manifest. Deterministic. No LLM.

    1. Check version conflict
    2. Snapshot full manifest for undo
    3. Apply adds
    4. Apply updates
    5. Apply removes
    6. Set dirty flags
    7. Log diff
    8. Write edit history with full before_state
    """
    result = MergeResult()
    edit_id = str(uuid.uuid4())[:8]

    # ── Version conflict check ──────────────────────────────────
    conflict = check_version_conflict(game_state, version_at_load)
    if conflict:
        result.conflict = True
        result.errors.append(conflict["message"])
        return result

    if not game_state.manifest:
        result.errors.append("No manifest to merge into")
        return result

    # ── Full manifest snapshot for undo ─────────────────────────
    # This is the actual data needed to undo — not a hash
    if manifest_snapshot is None:
        manifest_snapshot = copy.deepcopy(game_state.manifest)

    # ── Before hash (for diff log only) ─────────────────────────
    before_hash = game_state.get_hash()

    # ── Clear dirty flags ───────────────────────────────────────
    game_state.dirty_scenes = set()
    game_state.dirty_npcs = set()
    game_state.dirty_challenges = set()
    game_state.dirty_routes = False

    try:
        # ── Apply ADDS ──────────────────────────────────────────
        for op in patch.add:
            _apply_add(game_state, op)

        # ── Apply UPDATES ───────────────────────────────────────
        for op in patch.update:
            _apply_update(game_state, op)

        # ── Apply REMOVES ───────────────────────────────────────
        for op in patch.remove:
            _apply_remove(game_state, op)

        # ── Update version ──────────────────────────────────────
        game_state.version += 1
        game_state.updated_at = datetime.utcnow()
        game_state._rebuild_indexes()

        # ── Build diff ──────────────────────────────────────────
        after_hash = game_state.get_hash()
        diff = EditDiff(
            edit_id=edit_id,
            timestamp=datetime.utcnow().isoformat(),
            instruction=instruction,
            before_hash=before_hash,
            after_hash=after_hash,
            patch=patch.to_dict(),
            dirty_scenes=list(game_state.dirty_scenes),
            dirty_npcs=list(game_state.dirty_npcs),
            dirty_challenges=list(game_state.dirty_challenges),
        )

        # ── Write edit history ──────────────────────────────────
        # Create a single EditRecord for the entire patch
        edit_record = EditRecord(
            edit_id=edit_id,
            edit_type=_infer_edit_type(patch),
            timestamp=datetime.utcnow(),
            target_type=_infer_target_type(patch),
            target_id=_infer_target_id(patch),
            instruction=instruction,
            changes=patch.to_dict(),
            ai_generated=True,
            confidence=0.9,
        )

        # Snapshot before state for undo — FULL manifest, not hash
        # This enables user-facing undo to restore the complete state
        edit_record.before_state = manifest_snapshot
        edit_record.after_state = copy.deepcopy(game_state.manifest)

        game_state.edit_history.append(edit_record)
        game_state.undo_stack = []  # New edit invalidates redo

        result.success = True
        result.diff = diff
        result.dirty_flags = game_state.get_dirty_items()

        logger.info(
            f"Merge complete: {patch.total_ops()} ops, "
            f"dirty_scenes={list(game_state.dirty_scenes)}, "
            f"dirty_npcs={list(game_state.dirty_npcs)}"
        )

    except Exception as e:
        logger.error(f"Merge failed: {e}")
        result.errors.append(str(e))

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  APPLY OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════


def _apply_add(game_state: GameState, op: PatchOperation):
    """Apply an add operation to the manifest."""
    manifest = game_state.manifest
    scene = _get_scene(manifest, op.target_scene)
    if not scene:
        logger.warning(f"Scene not found for add: {op.target_scene}")
        return

    if op.target_type == "object":
        # Add to objects[] first (primary — used by GCS manifest builder)
        objects = scene.setdefault("objects", [])
        objects.append(op.data)
        # Also add to actors[] for backward compatibility
        actors = scene.setdefault("actors", [])
        actors.append(op.data)
        game_state.dirty_scenes.add(op.target_scene)

    elif op.target_type == "npc":
        npcs = scene.setdefault("npcs", [])
        npcs.append(op.data)
        npc_id = op.data.get("npc_id", op.data.get("id", ""))
        if npc_id:
            game_state.dirty_npcs.add(npc_id)
        game_state.dirty_scenes.add(op.target_scene)

    elif op.target_type == "challenge":
        challenges = scene.setdefault("challenges", [])
        challenges.append(op.data)
        ch_id = op.data.get("challenge_id", op.data.get("id", ""))
        if ch_id:
            game_state.dirty_challenges.add(ch_id)
        game_state.dirty_scenes.add(op.target_scene)

    elif op.target_type == "route":
        routes = manifest.setdefault("routes", [])
        routes.append(op.data)
        game_state.dirty_routes = True


def _apply_update(game_state: GameState, op: PatchOperation):
    """Apply an update operation — modify existing object in place."""
    manifest = game_state.manifest
    scene = _get_scene(manifest, op.target_scene)
    if not scene:
        return

    if op.target_type in ("object", "npc", "challenge"):
        target = _find_in_scene(scene, op.target_id, op.target_type)
        if target:
            # Update fields WITHOUT changing IDs
            for key, val in op.data.items():
                if key not in ("object_id", "npc_id", "challenge_id", "id"):
                    target[key] = val
            game_state.dirty_scenes.add(op.target_scene)

            if op.target_type == "npc":
                game_state.dirty_npcs.add(op.target_id)
            elif op.target_type == "challenge":
                game_state.dirty_challenges.add(op.target_id)


def _apply_remove(game_state: GameState, op: PatchOperation):
    """Apply a remove operation."""
    manifest = game_state.manifest
    scene = _get_scene(manifest, op.target_scene)
    if not scene:
        return

    if op.target_type == "object":
        for key in ("actors", "objects"):
            if key in scene:
                scene[key] = [
                    o for o in scene[key]
                    if not isinstance(o, dict)
                    or (o.get("object_id") != op.target_id
                        and o.get("id") != op.target_id)
                ]
        game_state.dirty_scenes.add(op.target_scene)

    elif op.target_type == "npc":
        scene["npcs"] = [
            n for n in scene.get("npcs", [])
            if not isinstance(n, dict)
            or (n.get("npc_id") != op.target_id
                and n.get("id") != op.target_id)
        ]
        game_state.dirty_npcs.add(op.target_id)
        game_state.dirty_scenes.add(op.target_scene)

    elif op.target_type == "challenge":
        scene["challenges"] = [
            c for c in scene.get("challenges", [])
            if not isinstance(c, dict)
            or (c.get("challenge_id") != op.target_id
                and c.get("id") != op.target_id)
        ]
        game_state.dirty_challenges.add(op.target_id)
        game_state.dirty_scenes.add(op.target_scene)


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _get_scene(manifest: Dict, scene_name: str) -> Optional[Dict]:
    """Find a scene by name."""
    for scene in manifest.get("scenes", []):
        if scene.get("scene_name") == scene_name:
            return scene
    # Try index-based
    scenes = manifest.get("scenes", [])
    for i, scene in enumerate(scenes):
        if scene_name in (f"Scene {i + 1}", f"scene_{i}", str(i)):
            return scene
    return scenes[0] if scenes else None


def _find_in_scene(
    scene: Dict, target_id: str, target_type: str
) -> Optional[Dict]:
    """Find an object/npc/challenge in a scene by ID."""
    if target_type == "object":
        for obj in scene.get("actors", []) + scene.get("objects", []):
            if isinstance(obj, dict):
                if obj.get("object_id") == target_id or obj.get("id") == target_id:
                    return obj

    elif target_type == "npc":
        for npc in scene.get("npcs", []):
            if isinstance(npc, dict):
                if npc.get("npc_id") == target_id or npc.get("id") == target_id:
                    return npc

    elif target_type == "challenge":
        for ch in scene.get("challenges", []):
            if isinstance(ch, dict):
                if ch.get("challenge_id") == target_id or ch.get("id") == target_id:
                    return ch

    return None


def _infer_edit_type(patch: EditPatch) -> EditType:
    """Infer the primary edit type from the patch."""
    if patch.add:
        tt = patch.add[0].target_type
        if tt == "npc":
            return EditType.ADD_NPC
        if tt == "challenge":
            return EditType.ADD_CHALLENGE
        if tt == "scene":
            return EditType.ADD_SCENE
        return EditType.ADD_OBJECT
    if patch.remove:
        tt = patch.remove[0].target_type
        if tt == "npc":
            return EditType.REMOVE_NPC
        if tt == "challenge":
            return EditType.REMOVE_CHALLENGE
        return EditType.REMOVE_OBJECT
    if patch.update:
        return EditType.UPDATE_OBJECT
    return EditType.UPDATE_OBJECT


def _infer_target_type(patch: EditPatch) -> str:
    """Infer primary target type from patch."""
    ops = patch.add or patch.update or patch.remove
    return ops[0].target_type if ops else "object"


def _infer_target_id(patch: EditPatch) -> str:
    """Infer primary target ID from patch."""
    ops = patch.add or patch.update or patch.remove
    return ops[0].target_id if ops else ""
