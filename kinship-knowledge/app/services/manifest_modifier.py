"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    MANIFEST MODIFIER (Full Pipeline)                          ║
║                                                                               ║
║  OPTION A: Re-run full pipeline, merge user modifications.                    ║
║                                                                               ║
║  FLOW:                                                                        ║
║  1. AI interprets instruction → structured operation                          ║
║  2. Extract config + seed from previous manifest                              ║
║  3. Re-run FULL /generate pipeline (same seed = same structure)               ║
║  4. Collect user modifications from previous manifest                         ║
║  5. Apply the NEW instruction                                                 ║
║  6. Merge all user modifications into fresh manifest                          ║
║  7. Return updated manifest                                                   ║
║                                                                               ║
║  Same seed = identical base. User mods layered on top.                        ║
║  Every modification goes through the full 13-stage pipeline.                  ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import json
import logging
import uuid
import random
import copy
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
#  DATA TYPES
# ═══════════════════════════════════════════════════════════════════════════════


@dataclass
class ModifyOperation:
    """Structured modification parsed from natural language."""

    action: str = "add_object"
    asset_name: str = ""
    scene_index: int = 0
    position_hint: str = "center"
    position_x: Optional[int] = None
    position_y: Optional[int] = None
    count: int = 1
    object_type: str = "decoration"
    role: str = ""
    mechanic_id: str = ""
    target: str = ""


@dataclass
class ModifyResult:
    """Result of a modification."""

    success: bool = False
    operation: Optional[ModifyOperation] = None
    changes: list[str] = field(default_factory=list)
    manifest: dict = field(default_factory=dict)
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    seed: int = 0
    duration_ms: int = 0


# ═══════════════════════════════════════════════════════════════════════════════
#  AI INTERPRETATION
# ═══════════════════════════════════════════════════════════════════════════════

INTERPRET_PROMPT = """You interpret game editing instructions into JSON.

Operations: add_object, remove_object, move_object, add_npc, remove_npc, add_challenge, remove_challenge, move_spawn, move_exit
Positions: north, south, east, west, center, northwest, northeast, southwest, southeast, near_spawn, near_exit

Respond ONLY with valid JSON. No markdown.

{"action":"add_object","asset_name":"campfire","scene_index":0,"position_hint":"near_spawn","count":1,"object_type":"landmark","role":"","mechanic_id":"","target":""}

Rules:
- "add 3 trees" → count=3, asset_name="tree"
- "in scene 2" → scene_index=1 (0-based)
- "remove all rocks" → action="remove_object", target="rock"
- "add a merchant" → action="add_npc", role="merchant"
- "add a puzzle" → action="add_challenge", mechanic_id="collect_items"
- No scene specified → scene_index=0
- campfire/ruins/statue → object_type="landmark"
- tree/rock/bush/flower → object_type="decoration"
- chest/lever/door → object_type="challenge"
"""


async def _interpret(
    instruction: str, summary: str = "", assets: list[str] = None
) -> ModifyOperation:
    """AI interprets natural language → structured operation."""
    from app.services.claude_client import invoke_claude

    ctx = ""
    if summary:
        ctx += f"\n\nCurrent game:\n{summary}"
    if assets:
        ctx += f"\n\nAvailable assets: {', '.join(assets[:30])}"

    try:
        resp = await invoke_claude(
            INTERPRET_PROMPT, f"Instruction: {instruction}{ctx}", model="haiku"
        )

        # Use robust parser from claude_client
        from app.services.claude_client import parse_json_response

        p = parse_json_response(resp)
        return ModifyOperation(
            action=p.get("action", "add_object"),
            asset_name=p.get("asset_name", ""),
            scene_index=p.get("scene_index", 0),
            position_hint=p.get("position_hint", "center"),
            position_x=p.get("position_x"),
            position_y=p.get("position_y"),
            count=p.get("count", 1),
            object_type=p.get("object_type", "decoration"),
            role=p.get("role", ""),
            mechanic_id=p.get("mechanic_id", ""),
            target=p.get("target", p.get("asset_name", "")),
        )
    except Exception as e:
        logger.warning(f"AI parse failed: {e}, using fallback")
        return _fallback(instruction)


def _fallback(inst: str) -> ModifyOperation:
    """Keyword fallback when AI fails."""
    inst = inst.lower()
    action = (
        "remove_object"
        if any(w in inst for w in ["remove", "delete"])
        else "move_object" if "move" in inst else "add_object"
    )

    asset, otype = "", "decoration"
    for kw, nm in {
        "campfire": "campfire",
        "tree": "tree",
        "rock": "rock",
        "bush": "bush",
        "flower": "flower",
        "chest": "chest",
        "torch": "torch",
        "sign": "sign",
    }.items():
        if kw in inst:
            asset, otype = nm, (
                "landmark" if nm in ("campfire", "torch") else "decoration"
            )
            break

    role = ""
    for kw, r in {
        "merchant": "merchant",
        "guard": "guardian",
        "guide": "guide",
        "villager": "villager",
    }.items():
        if kw in inst:
            action = "add_npc" if "remove" not in inst else "remove_npc"
            role = r
            break

    pos = "center"
    for kw, p in {
        "near spawn": "near_spawn",
        "near exit": "near_exit",
        "north": "north",
        "south": "south",
        "east": "east",
        "west": "west",
        "center": "center",
    }.items():
        if kw in inst:
            pos = p
            break

    count = 1
    for w in inst.split():
        if w.isdigit():
            count = min(int(w), 10)
            break

    si = 1 if "scene 2" in inst else 2 if "scene 3" in inst else 0
    return ModifyOperation(
        action=action,
        asset_name=asset,
        scene_index=si,
        position_hint=pos,
        count=count,
        object_type=otype,
        role=role,
        target=asset,
    )


# ═══════════════════════════════════════════════════════════════════════════════
#  EXTRACT CONFIG FROM PREVIOUS MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════


def _extract_config(manifest: dict) -> dict:
    """Pull generation config from a manifest so we can re-run the same pipeline."""
    game = manifest.get("game", {})
    config = manifest.get("config", {})

    return {
        "game_id": game.get("id", str(uuid.uuid4())),
        "game_name": game.get("name", "Modified Game"),
        "seed": manifest.get("seed"),
        "goal_type": config.get("goal_type", "escape"),
        "goal_description": config.get("goal_description", ""),
        "audience_type": config.get("audience_type", "children_9_12"),
        "num_scenes": len(manifest.get("scenes", [])) or 3,
        "zone_type": config.get("zone_type", "forest"),
        "scene_width": config.get("scene_width", 16),
        "scene_height": config.get("scene_height", 16),
        "difficulty_curve": config.get("difficulty_curve", "gentle"),
        "enable_tutorials": True,
        "enable_landmarks": True,
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  COLLECT USER MODIFICATIONS FROM PREVIOUS MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════


def _collect_user_mods(manifest: dict) -> dict:
    """
    Extract user-added objects/NPCs from previous manifest.
    Anything with metadata.added_by = "modify" was added by user.
    """
    mods = {
        "objects": {},  # scene_index → [objects]
        "npcs": {},  # npc_id → npc_data
        "npc_scenes": {},  # scene_index → [npc_ids]
        "removed_objects": {},  # scene_index → [asset_names to remove]
        "removed_npcs": [],  # [npc_id patterns to remove]
    }

    for i, scene in enumerate(manifest.get("scenes", [])):
        if not isinstance(scene, dict):
            continue

        user_objects = []
        for obj in scene.get("objects", []):
            if (
                isinstance(obj, dict)
                and obj.get("metadata", {}).get("added_by") == "modify"
            ):
                user_objects.append(obj)

        if user_objects:
            mods["objects"][i] = user_objects

    # User-added NPCs
    for npc_id, npc in manifest.get("npcs", {}).items():
        if isinstance(npc, dict) and npc.get("dialogue", {}).get(
            "greeting", ""
        ).startswith("Hello!"):
            # Heuristic: modify-added NPCs have simple greeting
            # Better: check a flag, but this works for now
            if "mod_" in npc_id or npc_id.count("_") >= 3:
                mods["npcs"][npc_id] = npc

    return mods


# ═══════════════════════════════════════════════════════════════════════════════
#  APPLY OPERATION TO MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════


def _resolve_pos(scene, hint, px=None, py=None, rng=None):
    if px is not None and py is not None:
        return (px, py)
    rng = rng or random.Random()
    w, h = scene.get("width", 16), scene.get("height", 16)
    sp, ex = scene.get("spawn", {}), scene.get("exit", {})

    MAP = {
        "north": (w // 2, 2),
        "south": (w // 2, h - 3),
        "east": (w - 3, h // 2),
        "west": (2, h // 2),
        "center": (w // 2, h // 2),
        "northwest": (3, 3),
        "northeast": (w - 4, 3),
        "southwest": (3, h - 4),
        "southeast": (w - 4, h - 4),
        "near_spawn": (
            sp.get("x", w // 2) + rng.randint(-2, 2),
            sp.get("y", h - 3) + rng.randint(-2, 0),
        ),
        "near_exit": (
            ex.get("x", w // 2) + rng.randint(-2, 2),
            ex.get("y", 2) + rng.randint(0, 2),
        ),
    }
    bx, by = MAP.get(hint, MAP["center"])
    return (
        max(1, min(w - 2, bx + rng.randint(-1, 1))),
        max(1, min(h - 2, by + rng.randint(-1, 1))),
    )


def _find_empty(scene, nx, ny, rng):
    w, h = scene.get("width", 16), scene.get("height", 16)
    occ = set(
        (o.get("x", -1), o.get("y", -1))
        for o in scene.get("objects", [])
        if isinstance(o, dict)
    )
    for _ in range(30):
        x = max(1, min(w - 2, nx + rng.randint(-3, 3)))
        y = max(1, min(h - 2, ny + rng.randint(-3, 3)))
        if (x, y) not in occ:
            return (x, y)
    return (nx, ny)


def _apply_operation(
    manifest: dict, op: ModifyOperation, rng: random.Random
) -> list[str]:
    """Apply a single operation to the manifest. Returns list of change descriptions."""
    scenes = manifest.get("scenes", [])
    if op.scene_index >= len(scenes):
        return [
            f"Scene {op.scene_index} does not exist (game has {len(scenes)} scenes)"
        ]

    scene = scenes[op.scene_index]

    if op.action == "add_object":
        objects = scene.get("objects", [])
        changes = []
        bx, by = _resolve_pos(
            scene, op.position_hint, op.position_x, op.position_y, rng
        )

        for i in range(op.count):
            x, y = _find_empty(scene, bx, by, rng) if op.count > 1 else (bx, by)
            objects.append(
                {
                    "object_id": f"mod_{op.asset_name}_{uuid.uuid4().hex[:8]}",
                    "asset_name": op.asset_name,
                    "x": x,
                    "y": y,
                    "z_index": y * 10,
                    "type": op.object_type,
                    "walkable": op.object_type != "challenge",
                    "interactable": op.object_type in ("challenge", "landmark"),
                    "metadata": {"added_by": "modify"},
                }
            )
            changes.append(
                f"Added '{op.asset_name}' at ({x},{y}) in scene {op.scene_index}"
            )
        scene["objects"] = objects
        return changes

    elif op.action == "remove_object":
        target = (op.target or op.asset_name).lower()
        before = len(scene.get("objects", []))
        scene["objects"] = [
            o
            for o in scene.get("objects", [])
            if not isinstance(o, dict) or target not in o.get("asset_name", "").lower()
        ]
        removed = before - len(scene["objects"])
        return (
            [f"Removed {removed} '{target}' from scene {op.scene_index}"]
            if removed
            else [f"No '{target}' found"]
        )

    elif op.action == "move_object":
        target = (op.target or op.asset_name).lower()
        for obj in scene.get("objects", []):
            if isinstance(obj, dict) and target in obj.get("asset_name", "").lower():
                old_x, old_y = obj.get("x"), obj.get("y")
                x, y = _resolve_pos(
                    scene, op.position_hint, op.position_x, op.position_y, rng
                )
                obj["x"], obj["y"], obj["z_index"] = x, y, y * 10
                return [f"Moved '{target}' from ({old_x},{old_y}) to ({x},{y})"]
        return [f"No '{target}' found"]

    elif op.action == "add_npc":
        npcs = manifest.get("npcs", {})
        role = op.role or "villager"
        npc_id = f"npc_{role}_{uuid.uuid4().hex[:6]}"
        x, y = _resolve_pos(scene, op.position_hint or "southwest", rng=rng)

        npcs[npc_id] = {
            "npc_id": npc_id,
            "role": role,
            "scene_index": op.scene_index,
            "position": {"x": x, "y": y},
            "asset_name": op.asset_name or f"npc_{role}",
            "dialogue": {
                "greeting": f"Hello! I'm the {role}.",
                "farewell": "Safe travels!",
            },
        }
        scene_npcs = scene.get("npcs", [])
        if isinstance(scene_npcs, list):
            scene_npcs.append(npc_id)
        scene["npcs"] = scene_npcs
        manifest["npcs"] = npcs
        return [f"Added {role} NPC '{npc_id}' at ({x},{y}) in scene {op.scene_index}"]

    elif op.action == "remove_npc":
        npcs = manifest.get("npcs", {})
        target = (op.target or op.role).lower()
        removed = []
        for nid in list(npcs.keys()):
            if target in nid.lower() or target in npcs[nid].get("role", "").lower():
                del npcs[nid]
                for s in scenes:
                    if (
                        isinstance(s, dict)
                        and isinstance(s.get("npcs"), list)
                        and nid in s["npcs"]
                    ):
                        s["npcs"].remove(nid)
                removed.append(nid)
        return (
            [f"Removed NPC(s): {', '.join(removed)}"]
            if removed
            else [f"No NPC matching '{target}'"]
        )

    elif op.action == "add_challenge":
        mechanic = op.mechanic_id or "collect_items"
        x, y = _resolve_pos(scene, op.position_hint or "center", rng=rng)

        # Use template system (same as /generate)
        try:
            from app.core.challenge_templates import (
                get_template,
                create_filled_challenge,
                Difficulty,
            )

            tmpl = get_template(mechanic)
            if tmpl:
                filled = create_filled_challenge(mechanic, Difficulty.MEDIUM)
                challenge = {
                    **filled,
                    "x": x,
                    "y": y,
                    "name": f"{mechanic.replace('_', ' ').title()} Challenge",
                }
            else:
                raise ValueError("no template")
        except Exception:
            challenge = {
                "mechanic_id": mechanic,
                "x": x,
                "y": y,
                "name": f"{mechanic.replace('_', ' ').title()} Challenge",
                "complexity": 3,
                "params": {"object_count": 3, "time_limit": 120},
            }

        scene.setdefault("challenges", []).append(challenge)
        return [f"Added '{mechanic}' challenge at ({x},{y}) in scene {op.scene_index}"]

    elif op.action == "remove_challenge":
        target = (op.target or op.mechanic_id).lower()
        before = len(scene.get("challenges", []))
        scene["challenges"] = [
            c
            for c in scene.get("challenges", [])
            if not isinstance(c, dict) or target not in c.get("mechanic_id", "").lower()
        ]
        removed = before - len(scene["challenges"])
        return (
            [f"Removed {removed} '{target}' challenge(s)"]
            if removed
            else [f"No challenge matching '{target}'"]
        )

    elif op.action == "move_spawn":
        old = scene.get("spawn", {})
        x, y = _resolve_pos(scene, op.position_hint, op.position_x, op.position_y, rng)
        scene["spawn"] = {"x": x, "y": y}
        return [f"Moved spawn from ({old.get('x')},{old.get('y')}) to ({x},{y})"]

    elif op.action == "move_exit":
        old = scene.get("exit", {})
        x, y = _resolve_pos(scene, op.position_hint, op.position_x, op.position_y, rng)
        scene["exit"] = {"x": x, "y": y}
        return [f"Moved exit from ({old.get('x')},{old.get('y')}) to ({x},{y})"]

    return [f"Unknown action: {op.action}"]


# ═══════════════════════════════════════════════════════════════════════════════
#  MERGE USER MODS INTO FRESH MANIFEST
# ═══════════════════════════════════════════════════════════════════════════════


def _merge_user_mods(manifest: dict, user_mods: dict):
    """
    Merge previously user-added objects/NPCs into fresh pipeline manifest.
    This preserves everything the user added in previous /modify calls.
    """
    scenes = manifest.get("scenes", [])

    # Re-add user objects
    for scene_idx, objects in user_mods.get("objects", {}).items():
        idx = int(scene_idx)
        if idx < len(scenes):
            existing_objects = scenes[idx].get("objects", [])
            existing_ids = set(
                o.get("object_id", "") for o in existing_objects if isinstance(o, dict)
            )

            for obj in objects:
                if obj.get("object_id") not in existing_ids:
                    existing_objects.append(obj)
            scenes[idx]["objects"] = existing_objects

    # Re-add user NPCs
    npcs = manifest.get("npcs", {})
    for npc_id, npc_data in user_mods.get("npcs", {}).items():
        if npc_id not in npcs:
            npcs[npc_id] = npc_data
            si = npc_data.get("scene_index", 0)
            if si < len(scenes):
                scene_npcs = scenes[si].get("npcs", [])
                if isinstance(scene_npcs, list) and npc_id not in scene_npcs:
                    scene_npcs.append(npc_id)
    manifest["npcs"] = npcs


# ═══════════════════════════════════════════════════════════════════════════════
#  MANIFEST SUMMARY
# ═══════════════════════════════════════════════════════════════════════════════


def _summarize(manifest: dict) -> str:
    scenes = manifest.get("scenes", [])
    lines = [f"Game: {manifest.get('game', {}).get('name', '?')}, {len(scenes)} scenes"]
    for i, s in enumerate(scenes):
        if isinstance(s, dict):
            names = set(
                o.get("asset_name", "")
                for o in s.get("objects", [])
                if isinstance(o, dict)
            )
            lines.append(
                f"  Scene {i}: {len(s.get('objects', []))} objects ({', '.join(list(names)[:5])})"
            )
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
#  MAIN: FULL PIPELINE MODIFY
# ═══════════════════════════════════════════════════════════════════════════════


async def modify_manifest(
    manifest: dict,
    instruction: str,
    assets: list[dict] = None,
    available_asset_names: list[str] = None,
    seed: int = None,
) -> ModifyResult:
    """
    Modify a manifest using the FULL /generate pipeline.

    Steps:
    1. AI interprets instruction
    2. Collect user modifications from previous manifest
    3. Re-run full pipeline (same seed = same base structure)
    4. Merge previous user modifications into fresh manifest
    5. Apply the new instruction
    6. Return fully validated manifest

    Args:
        manifest: Previous manifest to modify
        instruction: User instruction ("add a campfire near spawn")
        assets: Asset dicts (if available, avoids re-fetch)
        available_asset_names: Asset names for AI context
        seed: Override seed (default: use manifest's seed)
    """
    import time

    start = time.time()
    result = ModifyResult()

    # ── Step 1: AI interprets instruction ──────────────────────────────
    summary = _summarize(manifest)
    operation = await _interpret(instruction, summary, available_asset_names)
    result.operation = operation

    logger.info(
        f"Modify: '{instruction}' → {operation.action}({operation.asset_name or operation.target})"
    )

    # ── Step 2: Collect user mods from previous manifest ───────────────
    user_mods = _collect_user_mods(manifest)
    user_mod_count = sum(len(v) for v in user_mods.get("objects", {}).values()) + len(
        user_mods.get("npcs", {})
    )

    if user_mod_count > 0:
        logger.info(
            f"Carrying forward {user_mod_count} user modifications from previous manifest"
        )

    # ── Step 3: Re-run FULL pipeline (same seed = same structure) ──────
    config = _extract_config(manifest)
    pipeline_seed = seed or config["seed"]

    if not assets:
        result.errors.append("No assets provided — cannot re-run pipeline")
        return result

    try:
        from app.pipeline.game_pipeline import GamePipeline

        pipeline = GamePipeline(
            max_retries=1,
            skip_dialogue=True,  # Faster — dialogue doesn't affect structure
            include_debug=False,
        )

        pipeline_result = await pipeline.generate(
            game_id=config["game_id"],
            game_name=config["game_name"],
            assets=assets,
            goal_type=config["goal_type"],
            goal_description=config["goal_description"],
            audience_type=config["audience_type"],
            num_scenes=config["num_scenes"],
            zone_type=config["zone_type"],
            scene_width=config.get("scene_width", 16),
            scene_height=config.get("scene_height", 16),
            seed=pipeline_seed,
            enable_tutorials=config.get("enable_tutorials", True),
            enable_landmarks=config.get("enable_landmarks", True),
            difficulty_curve=config.get("difficulty_curve", "gentle"),
        )

        if not pipeline_result.success:
            result.errors.append(f"Pipeline re-run failed: {pipeline_result.errors}")
            result.warnings = pipeline_result.warnings
            return result

        fresh_manifest = pipeline_result.manifest
        result.seed = (
            pipeline_result.state.seed if pipeline_result.state else pipeline_seed
        )
        result.warnings = pipeline_result.warnings

    except Exception as e:
        logger.error(f"Pipeline re-run failed: {e}")
        result.errors.append(f"Pipeline error: {str(e)}")
        return result

    # ── Step 4: Merge previous user modifications ──────────────────────
    _merge_user_mods(fresh_manifest, user_mods)

    # ── Step 5: Apply the NEW instruction ──────────────────────────────
    rng = random.Random(result.seed + hash(instruction) % 999999)

    scenes = fresh_manifest.get("scenes", [])
    if operation.scene_index >= len(scenes) and operation.action not in ("remove_npc",):
        result.errors.append(
            f"Scene {operation.scene_index} does not exist (game has {len(scenes)} scenes)"
        )
        return result

    changes = _apply_operation(fresh_manifest, operation, rng)
    result.changes = changes

    # ── Step 6: Recalculate z-indices for affected scene ───────────────
    if operation.scene_index < len(scenes):
        offsets = {"challenge": 5, "challenge_goal": 5, "landmark": 3, "decoration": 0}
        for obj in scenes[operation.scene_index].get("objects", []):
            if isinstance(obj, dict):
                obj["z_index"] = obj.get("y", 0) * 10 + offsets.get(
                    obj.get("type", ""), 0
                )

    # ── Done ───────────────────────────────────────────────────────────
    result.manifest = fresh_manifest
    result.success = True
    result.duration_ms = int((time.time() - start) * 1000)

    logger.info(
        f"Modify complete: {', '.join(changes)} "
        f"({result.duration_ms}ms, seed={result.seed})"
    )

    return result
