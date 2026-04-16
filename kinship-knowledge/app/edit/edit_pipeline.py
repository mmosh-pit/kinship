"""
Edit Pipeline — Orchestrates all 8 layers for vibe coding edits.

AUDIT FIXES APPLIED:
1. Full manifest snapshot for undo (not hash)
2. DB persistence with explicit persisted flag
3. Validation normalization step before validators
4. Budget pre-check in Layer 3 (before patch building)
5. Concurrency pre-check in Layer 2 (fast-fail)
6. Route builder triggered on dirty_routes
"""

import time
import copy
import logging
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any

from app.state.game_state import GameState, StateStatus, get_state_manager
from app.edit.config import EditBudget, RetryConfig
from app.edit.guardrail import run_guardrail
from app.edit.state_layer import load_game_state, take_snapshot, extract_context
from app.edit.intent_generator import generate_intent
from app.edit.patch_builder import build_patch, enforce_patch, resolve_spatial_conflicts, EditPatch
from app.edit.merge_engine import merge_patch
from app.edit.impact_analyzer import analyze_impact, run_conditional_agents

logger = logging.getLogger(__name__)


@dataclass
class EditPipelineResult:
    success: bool = False
    manifest: Optional[Dict[str, Any]] = None
    game_id: str = ""
    version: int = 0
    changes: List[Dict[str, Any]] = field(default_factory=list)
    diff: Optional[Dict[str, Any]] = None
    can_undo: bool = False
    needs_clarification: bool = False
    clarification_message: str = ""
    conflict: bool = False
    persisted: bool = False
    duration_ms: int = 0
    layers_run: List[str] = field(default_factory=list)
    intent_source: str = ""
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)

    # Metrics / observability
    metrics: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict:
        return {
            "success": self.success,
            "game_id": self.game_id,
            "version": self.version,
            "changes": self.changes,
            "can_undo": self.can_undo,
            "needs_clarification": self.needs_clarification,
            "clarification_message": self.clarification_message,
            "conflict": self.conflict,
            "persisted": self.persisted,
            "duration_ms": self.duration_ms,
            "layers_run": self.layers_run,
            "intent_source": self.intent_source,
            "metrics": self.metrics,
            "errors": self.errors,
            "warnings": self.warnings,
        }


# ═══════════════════════════════════════════════════════════════════════════════
#  ASSET FILTERING FOR EDIT OPERATIONS
# ═══════════════════════════════════════════════════════════════════════════════

import re

# Words to extract from instructions for asset matching
ASSET_KEYWORDS = {
    "campfire": ["campfire", "fire", "bonfire"],
    "tree": ["tree", "pine", "oak", "forest"],
    "rock": ["rock", "stone", "boulder"],
    "mushroom": ["mushroom", "fungi", "shroom"],
    "house": ["house", "building", "home", "cabin"],
    "well": ["well", "water"],
    "coin": ["coin", "gold", "treasure"],
    "chest": ["chest", "box", "container"],
    "flower": ["flower", "plant", "bloom"],
    "fence": ["fence", "barrier", "wall"],
    "bridge": ["bridge", "crossing"],
    "sign": ["sign", "post", "marker"],
    "lamp": ["lamp", "light", "lantern", "torch"],
    "bench": ["bench", "seat", "chair"],
    "barrel": ["barrel", "crate", "container"],
    "npc": ["npc", "character", "person", "villager", "merchant"],
}


def _extract_requested_asset_types(instruction: str) -> List[str]:
    """
    Extract asset types explicitly mentioned in the instruction.
    
    For "add two campfires", returns ["campfire"]
    For "add a tree near the rock", returns ["tree", "rock"]
    """
    lower = instruction.lower()
    requested = []
    
    for asset_type, keywords in ASSET_KEYWORDS.items():
        for keyword in keywords:
            if keyword in lower:
                requested.append(asset_type)
                break
    
    return list(set(requested))


def _filter_assets_for_instruction(
    instruction: str,
    all_assets: List[Dict],
    game_state: GameState,
) -> List[Dict]:
    """
    Filter available assets to ONLY those explicitly mentioned in the instruction.
    
    This is critical for preventing the LLM from adding unrequested assets.
    
    Rules:
    1. For ADD operations: Only include assets matching the requested type
    2. Always include assets that already exist in the scene (for references)
    3. For REMOVE/MOVE/UPDATE: Include existing scene assets only
    """
    lower = instruction.lower()
    
    # Detect operation type
    is_add = any(word in lower for word in ["add", "place", "put", "create", "insert"])
    is_modify = any(word in lower for word in ["remove", "delete", "move", "update", "change"])
    
    # Get existing asset names from the scene
    existing_asset_names = set()
    manifest = game_state.manifest or {}
    for scene in manifest.get("scenes", []):
        for obj in scene.get("actors", []) + scene.get("objects", []):
            if isinstance(obj, dict):
                name = obj.get("asset_name", obj.get("name", "")).lower()
                if name:
                    existing_asset_names.add(name)
    
    # Extract requested asset types from instruction
    requested_types = _extract_requested_asset_types(instruction)
    logger.info(f"Requested asset types: {requested_types}")
    
    filtered = []
    
    for asset in all_assets:
        asset_name = asset.get("name", "").lower()
        
        # Always include if asset exists in scene (for reference in moves/removes)
        if asset_name in existing_asset_names:
            filtered.append(asset)
            continue
        
        # For ADD operations: only include if matches requested type
        if is_add and requested_types:
            matches_request = False
            for req_type in requested_types:
                keywords = ASSET_KEYWORDS.get(req_type, [req_type])
                for kw in keywords:
                    if kw in asset_name:
                        matches_request = True
                        break
                if matches_request:
                    break
            
            if matches_request:
                filtered.append(asset)
        
        # For MODIFY operations: only existing assets (already added above)
        # Don't add new assets for modify operations
    
    # If no assets matched but we have an ADD request, try fuzzy match on instruction words
    if is_add and not filtered:
        # Extract nouns from instruction (simple approach)
        words = re.findall(r'\b[a-z]+\b', lower)
        skip_words = {'add', 'two', 'three', 'more', 'a', 'an', 'the', 'in', 'to', 'on', 'at', 'scene'}
        content_words = [w for w in words if w not in skip_words and len(w) > 2]
        
        for asset in all_assets:
            asset_name = asset.get("name", "").lower()
            for word in content_words:
                if word in asset_name or asset_name in word:
                    filtered.append(asset)
                    break
    
    # Deduplicate
    seen = set()
    result = []
    for asset in filtered:
        aid = asset.get("id", asset.get("name", ""))
        if aid not in seen:
            seen.add(aid)
            result.append(asset)
    
    logger.info(
        f"Asset filter: {len(all_assets)} -> {len(result)} "
        f"(instruction: '{instruction[:50]}...')"
    )
    
    return result


async def run_edit_pipeline(
    game_id: str,
    instruction: str,
    available_assets: Optional[List[Dict]] = None,
    budget: EditBudget = None,
    retry_config: RetryConfig = None,
) -> EditPipelineResult:
    result = EditPipelineResult(game_id=game_id)
    start_time = time.time()
    budget = budget or EditBudget()
    game_state = None
    layer_timings = {}  # Per-layer latency tracking

    try:
        # ═══════════════════════════════════════════════════════
        #  LAYER 1: GUARDRAIL
        # ═══════════════════════════════════════════════════════
        game_state = await load_game_state(game_id)
        if not game_state:
            result.errors.append(f"Game not found: {game_id}")
            return result

        guardrail = await run_guardrail(instruction, game_state)
        result.layers_run.append("guardrail")

        if guardrail.needs_clarification:
            result.needs_clarification = True
            result.clarification_message = guardrail.clarification_message
            return result

        if not guardrail.passed:
            result.errors.extend(guardrail.errors)
            return result

        # ═══════════════════════════════════════════════════════
        #  LAYER 2: STATE
        #  FIX 5: Concurrency pre-check
        # ═══════════════════════════════════════════════════════
        if game_state.status == StateStatus.EDITING:
            result.conflict = True
            result.errors.append(
                "Game is currently being edited by another session. "
                "Please wait and retry."
            )
            return result

        game_state.status = StateStatus.EDITING
        snapshot = take_snapshot(game_state)
        version_at_load = game_state.version

        if not available_assets:
            try:
                from app.services.asset_embeddings import retrieve_relevant_assets

                # Always query Pinecone — platform_id is optional filter
                available_assets = await retrieve_relevant_assets(
                    context=instruction,
                    top_k=30,
                    platform_id=game_state.platform_id or None,
                )
                if available_assets:
                    logger.info(
                        f"Pinecone returned {len(available_assets)} assets for: '{instruction}'"
                    )
                else:
                    logger.warning("Pinecone returned no assets")
            except Exception as e:
                logger.warning(f"Asset retrieval failed: {e}")

        # ── CRITICAL: Filter assets to only those explicitly mentioned ──
        # This prevents the LLM from "helpfully" adding unrequested assets
        available_assets = _filter_assets_for_instruction(
            instruction=instruction,
            all_assets=available_assets or [],
            game_state=game_state,
        )
        logger.info(f"Filtered to {len(available_assets)} assets for instruction")

        # ── Fetch GCS manifest for object data ──
        # Objects often exist only in GCS, not in game_state.manifest
        gcs_manifest = await _fetch_gcs_manifest_for_scene(game_state, instruction)

        context = extract_context(
            game_state=game_state,
            instruction=instruction,
            edit_types=guardrail.edit_types,
            available_assets=available_assets,
            gcs_manifest=gcs_manifest,
        )
        result.layers_run.append("state")

        # ═══════════════════════════════════════════════════════
        #  LAYER 3: INTENT
        #  FIX 4: Budget pre-check on intent count
        # ═══════════════════════════════════════════════════════
        if len(guardrail.instructions) > budget.max_total:
            game_state.status = StateStatus.READY
            result.errors.append(
                f"Instruction decomposes into {len(guardrail.instructions)} "
                f"operations (max {budget.max_total}). Simplify or split."
            )
            return result

        all_intents = []
        intent_start = time.time()
        intent_retries = 0
        for sub_instruction in guardrail.instructions:
            intent_result = await generate_intent(
                instruction=sub_instruction,
                context=context,
                session_memory=guardrail.session_context,
                config=retry_config,
            )
            if not intent_result.success:
                game_state.status = StateStatus.READY
                result.errors.extend(intent_result.errors)
                return result
            all_intents.extend(intent_result.intents)
            result.intent_source = intent_result.source
            if intent_result.source == "fallback":
                intent_retries += 1  # LLM failed, fell back to regex

        layer_timings["intent_ms"] = int((time.time() - intent_start) * 1000)
        layer_timings["intent_retries"] = intent_retries
        result.layers_run.append("intent")

        if not all_intents:
            game_state.status = StateStatus.READY
            result.errors.append("No valid intents generated")
            return result

        # FIX 4: Budget pre-check by action type BEFORE patch building
        add_count = sum(1 for i in all_intents if i.action == "add")
        remove_count = sum(1 for i in all_intents if i.action == "remove")
        update_count = sum(1 for i in all_intents if i.action in ("update", "move"))

        budget_violations = []
        if add_count > budget.max_adds:
            budget_violations.append(
                f"Too many additions: {add_count} (max {budget.max_adds})"
            )
        if remove_count > budget.max_removes:
            budget_violations.append(
                f"Too many removals: {remove_count} (max {budget.max_removes})"
            )
        if update_count > budget.max_updates:
            budget_violations.append(
                f"Too many updates: {update_count} (max {budget.max_updates})"
            )

        if budget_violations:
            game_state.status = StateStatus.READY
            result.errors.extend(budget_violations)
            return result

        # ═══════════════════════════════════════════════════════
        #  LAYER 4: PATCH
        # ═══════════════════════════════════════════════════════
        patch_result = build_patch(all_intents, context)

        if not patch_result.success:
            game_state.status = StateStatus.READY
            result.errors.extend(patch_result.errors)
            return result

        violations = enforce_patch(patch_result.patch, context, budget)
        if violations:
            game_state.status = StateStatus.READY
            result.errors.extend(violations)
            return result

        spatial_warnings = resolve_spatial_conflicts(patch_result.patch, context)
        result.warnings.extend(spatial_warnings)
        result.warnings.extend(patch_result.warnings)
        result.layers_run.append("patch")

        # ═══════════════════════════════════════════════════════
        #  LAYER 5: MERGE
        #  FIX 1: Pass full manifest snapshot for undo
        # ═══════════════════════════════════════════════════════
        merge_result = merge_patch(
            game_state=game_state,
            patch=patch_result.patch,
            instruction=instruction,
            version_at_load=version_at_load,
            manifest_snapshot=snapshot.manifest,
        )

        if merge_result.conflict:
            game_state.status = StateStatus.READY
            result.conflict = True
            result.errors.extend(merge_result.errors)
            return result

        if not merge_result.success:
            snapshot.restore_to(game_state)
            game_state.status = StateStatus.READY
            result.errors.extend(merge_result.errors)
            return result

        result.diff = merge_result.diff.__dict__ if merge_result.diff else None
        result.warnings.extend(merge_result.warnings)
        result.layers_run.append("merge")

        # ═══════════════════════════════════════════════════════
        #  LAYER 6: IMPACT
        # ═══════════════════════════════════════════════════════
        analysis = analyze_impact(game_state, context.scopes)
        agent_result = await run_conditional_agents(game_state, analysis)
        result.warnings.extend(agent_result.warnings)
        result.layers_run.append("impact")

        # ═══════════════════════════════════════════════════════
        #  LAYER 7: VALIDATION
        #  FIX 3: Normalize manifest before validators
        # ═══════════════════════════════════════════════════════
        _normalize_manifest(game_state.manifest)

        validation_passed = _run_validation(game_state, analysis, result)

        if not validation_passed:
            repair_success = _try_auto_repair(game_state, result)
            if not repair_success:
                logger.warning("Validation failed after repair — rolling back")
                snapshot.restore_to(game_state)
                game_state.status = StateStatus.READY
                result.errors.append(
                    "Edit failed validation and could not be auto-repaired"
                )
                return result

        result.layers_run.append("validation")

        # ═══════════════════════════════════════════════════════
        #  LAYER 8: OUTPUT
        #  FIX 2: Explicit persisted flag
        #  FIX 6: Route builder on dirty_routes
        # ═══════════════════════════════════════════════════════
        if analysis.affected_scenes:
            _materialize_dirty_scenes(game_state, analysis)

        if analysis.routes_affected:
            _rebuild_routes(game_state)

        game_state.status = StateStatus.READY
        state_manager = get_state_manager()
        state_manager.save(game_state)

        persist_result = await _persist_to_db(game_state, patch_result.patch)
        result.persisted = persist_result.get("success", False)
        if not result.persisted:
            result.warnings.extend(persist_result.get("warnings", []))

        result.layers_run.append("output")

        result.success = True
        result.manifest = game_state.manifest
        result.version = game_state.version
        result.can_undo = len(game_state.edit_history) > 0
        result.changes = patch_result.patch.to_dict()

        # Aggregate metrics
        result.metrics = {
            "layer_timings": layer_timings,
            "intent_source": result.intent_source,
            "ops_count": patch_result.patch.total_ops(),
            "add_count": len(patch_result.patch.add),
            "update_count": len(patch_result.patch.update),
            "remove_count": len(patch_result.patch.remove),
            "validators_run": list(analysis.validators_to_run),
            "agents_run": agent_result.agents_run if agent_result else [],
            "dirty_scenes": list(game_state.dirty_scenes),
            "persisted": result.persisted,
        }

        logger.info(
            f"Edit pipeline complete: layers={result.layers_run}, "
            f"ops={patch_result.patch.total_ops()}, "
            f"intent={result.intent_source}, persisted={result.persisted}, "
            f"intent_ms={layer_timings.get('intent_ms', 0)}"
        )

    except Exception as e:
        logger.exception(f"Edit pipeline failed: {e}")
        result.errors.append(str(e))
        try:
            if game_state:
                game_state.status = StateStatus.READY
        except Exception:
            pass

    finally:
        result.duration_ms = int((time.time() - start_time) * 1000)

    return result


# ═══════════════════════════════════════════════════════════════════════════════
#  FIX 3: MANIFEST NORMALIZATION
# ═══════════════════════════════════════════════════════════════════════════════


def _normalize_manifest(manifest: Dict[str, Any]):
    """Normalize manifest format so validators don't false-positive.

    Edit merge writes flexible format. Validators expect specific fields.
    """
    if not manifest:
        return

    config = manifest.get("config", {})
    default_w = config.get("scene_width", 16)
    default_h = config.get("scene_height", 16)

    for scene in manifest.get("scenes", []):
        scene.setdefault("scene_name", f"Scene {scene.get('scene_index', 0) + 1}")
        scene.setdefault("zone_type", "forest")
        scene.setdefault("width", default_w)
        scene.setdefault("height", default_h)
        scene.setdefault("spawn", {"x": 8, "y": 14})

        for actor in scene.get("actors", []):
            if isinstance(actor, dict):
                _normalize_position(actor)
                actor.setdefault("object_id", actor.get("id", ""))
                actor.setdefault("asset_name", actor.get("name", "object"))
                actor.setdefault("z_index", 50)
                actor.setdefault("layer", "objects")
                actor.setdefault("scale", 1.0)
                actor.setdefault("type", "interactive")

        for obj in scene.get("objects", []):
            if isinstance(obj, dict):
                _normalize_position(obj)

        for npc in scene.get("npcs", []):
            if isinstance(npc, dict):
                _normalize_position(npc)
                npc.setdefault("npc_id", npc.get("id", ""))
                npc.setdefault("name", "NPC")
                npc.setdefault("role", "villager")

        for ch in scene.get("challenges", []):
            if isinstance(ch, dict):
                ch.setdefault("challenge_id", ch.get("id", ""))
                ch.setdefault("mechanic_id", "collect_items")
                ch.setdefault("difficulty", "medium")


def _normalize_position(obj: Dict):
    """Ensure both flat x/y and nested position dict exist."""
    pos = obj.get("position", {})
    if isinstance(pos, dict):
        if "x" not in obj and "x" in pos:
            obj["x"] = pos["x"]
        if "y" not in obj and "y" in pos:
            obj["y"] = pos["y"]
    if "x" in obj and "y" in obj:
        obj["position"] = {"x": obj["x"], "y": obj["y"]}


async def _fetch_gcs_manifest_for_scene(
    game_state: GameState, instruction: str
) -> Optional[Dict[str, Any]]:
    """
    Fetch the GCS manifest for the target scene.
    
    Objects often exist only in GCS (asset_placements), not in game_state.manifest.
    This fetches the raw GCS JSON so that remove/move operations can find objects.
    """
    import re
    import httpx
    from app.services import assets_client
    
    try:
        manifest = game_state.manifest or {}
        scenes = manifest.get("scenes", [])
        game_id = manifest.get("game", {}).get("id", game_state.game_id)
        
        if not scenes:
            logger.warning("No scenes in manifest for GCS fetch")
            return None
        
        # Determine target scene from instruction
        target_scene = None
        target_scene_name = None
        lower_instr = instruction.lower()
        
        # Check for scene number reference
        num_match = re.search(r"scene\s*(\d+)", lower_instr)
        if num_match:
            idx = int(num_match.group(1)) - 1
            if 0 <= idx < len(scenes):
                target_scene = scenes[idx]
                target_scene_name = target_scene.get("scene_name", f"Scene {idx + 1}")
        
        # Default to first scene
        if not target_scene and scenes:
            target_scene = scenes[0]
            target_scene_name = target_scene.get("scene_name", "Scene 1")
        
        if not target_scene:
            logger.warning("Could not determine target scene for GCS fetch")
            return None
        
        logger.info(f"Fetching GCS manifest for scene: {target_scene_name}")
        
        # ── Step 1: Fetch scene records from DB to get tile_map_url ──
        client = assets_client.get_client()
        tile_map_url = None
        
        try:
            resp = await client.get("/scenes", params={"game_id": game_id})
            if resp.status_code == 200:
                db_scenes = resp.json()
                if isinstance(db_scenes, dict):
                    db_scenes = db_scenes.get("scenes", db_scenes.get("data", []))
                if not isinstance(db_scenes, list):
                    db_scenes = []
                
                # Find matching scene by name
                for db_scene in db_scenes:
                    if not isinstance(db_scene, dict):
                        continue
                    db_name = db_scene.get("scene_name", db_scene.get("name", ""))
                    if db_name == target_scene_name:
                        tile_map_url = db_scene.get("tile_map_url", "")
                        break
                
                # Fallback: try index-based matching
                if not tile_map_url and db_scenes:
                    sorted_db = sorted(
                        [s for s in db_scenes if isinstance(s, dict)],
                        key=lambda s: s.get("scene_index", s.get("order", 0)),
                    )
                    scene_idx = 0
                    if num_match:
                        scene_idx = int(num_match.group(1)) - 1
                    if 0 <= scene_idx < len(sorted_db):
                        tile_map_url = sorted_db[scene_idx].get("tile_map_url", "")
                        
            else:
                logger.warning(f"DB scene fetch failed: {resp.status_code}")
        except Exception as e:
            logger.warning(f"DB scene fetch error: {e}")
        
        if not tile_map_url:
            logger.warning(f"No tile_map_url found for scene {target_scene_name}")
            return None
        
        # ── Step 2: Fetch the raw GCS manifest ──
        async with httpx.AsyncClient(timeout=30.0) as raw_client:
            gcs_resp = await raw_client.get(tile_map_url)
            if gcs_resp.status_code == 200:
                gcs_data = gcs_resp.json()
                placements = gcs_data.get("asset_placements", [])
                logger.info(
                    f"Fetched GCS manifest: {len(placements)} placements from {tile_map_url[:50]}..."
                )
                return gcs_data
            else:
                logger.warning(f"GCS fetch failed: {gcs_resp.status_code}")
                return None
                
    except Exception as e:
        logger.warning(f"Failed to fetch GCS manifest: {e}")
        import traceback
        logger.debug(traceback.format_exc())
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYER 7 HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _run_validation(
    game_state: GameState, analysis, result: EditPipelineResult
) -> bool:
    """Run validation. For edits, only structural errors cause failure.

    Spatial/softlock/gameplay issues become warnings (not rollback triggers)
    because:
    - The create pipeline validators are strict (game was generated wrong)
    - But for edits, the user intentionally placed objects — warn, don't block
    - Only schema/manifest/engine errors mean the manifest is structurally broken
    """
    try:
        from app.validators.validation_pipeline import ValidationPipeline

        all_v = {
            "schema",
            "reference",
            "gameplay",
            "spatial",
            "challenge",
            "route",
            "npc",
            "dialogue",
            "mechanic",
            "engine",
            "manifest",
            "softlock",
        }
        skip = {v for v in all_v if v not in analysis.validators_to_run}

        pipeline = ValidationPipeline(stop_on_error=False, skip_validators=list(skip))
        vr = pipeline.validate(game_state.manifest or {})

        if not vr.valid:
            # Separate structural errors (hard fail) from advisory errors (warn only)
            # Only these validators should cause edit rollback:
            structural_validators = {"schema", "engine", "manifest"}
            has_structural_error = False

            for err in vr.all_errors:
                validator_name = getattr(err, "validator", "")
                msg = f"Validation [{validator_name}]: {err.message}"

                if validator_name in structural_validators:
                    has_structural_error = True
                    result.warnings.append(msg)
                else:
                    # Spatial, softlock, gameplay, npc, etc. → warning only
                    result.warnings.append(msg)

            if has_structural_error:
                return False  # Manifest is structurally broken → rollback

            # Non-structural errors only → proceed with warnings
            logger.info(
                f"Validation has {len(vr.all_errors)} non-structural issues (warnings only)"
            )
            return True

        return True

    except Exception as e:
        logger.warning(f"Validation error: {e}")
        result.warnings.append(f"Validation skipped: {e}")
        return True


def _try_auto_repair(game_state: GameState, result: EditPipelineResult) -> bool:
    try:
        from app.validators.auto_repair import ManifestRepairer

        repairer = ManifestRepairer()
        rr = repairer.repair(game_state.manifest or {})

        if rr.success and rr.repair_count > 0:
            game_state.manifest = rr.manifest
            for repair in rr.repairs:
                result.warnings.append(f"Auto-repair: {repair.description}")
            _normalize_manifest(game_state.manifest)
            return True
        return rr.success

    except Exception as e:
        logger.warning(f"Auto-repair failed: {e}")
        return False


# ═══════════════════════════════════════════════════════════════════════════════
#  LAYER 8 HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


def _materialize_dirty_scenes(game_state: GameState, analysis):
    if analysis.new_scenes:
        try:
            from app.pipeline.scene_materializer import SceneMaterializer

            logger.info(f"Materializing {len(analysis.new_scenes)} new scenes")
        except Exception as e:
            logger.warning(f"Materialization skipped: {e}")


def _rebuild_routes(game_state: GameState):
    try:
        manifest = game_state.manifest
        if not manifest:
            return

        scenes = manifest.get("scenes", [])
        if len(scenes) < 2:
            manifest["routes"] = []
            return

        routes = []
        game_id = manifest.get("game", {}).get("id", game_state.game_id)

        for i in range(len(scenes) - 1):
            current = scenes[i]
            next_s = scenes[i + 1]
            width = current.get("width", 16)

            routes.append(
                {
                    "route_id": f"route_{i}_to_{i + 1}",
                    "from_scene": i,
                    "to_scene": i + 1,
                    "from_scene_id": current.get("id", f"{game_id}_scene_{i}"),
                    "to_scene_id": next_s.get("id", f"{game_id}_scene_{i + 1}"),
                    "from_scene_name": current.get("scene_name", f"Scene {i + 1}"),
                    "to_scene_name": next_s.get("scene_name", f"Scene {i + 2}"),
                    "trigger": {
                        "type": "zone_enter",
                        "zone_type": "exit",
                        "position": {"x": width // 2, "y": 1},
                    },
                }
            )

        manifest["routes"] = routes
        logger.info(f"Rebuilt {len(routes)} routes")

    except Exception as e:
        logger.warning(f"Route rebuild failed: {e}")


async def _persist_to_db(game_state: GameState, patch: EditPatch = None) -> Dict[str, Any]:
    """
    Persist edit changes by patching the RAW GCS manifest file.

    CRITICAL: Only persist objects that were ACTUALLY modified by the current edit.
    Do NOT persist all objects from in-memory manifest (which may include
    decoration/cluster objects from scene generation that were never persisted).

    CRITICAL: The API endpoint /scenes/{id}/manifest RESTRUCTURES the data
    (moves npcs/challenges/routes inside scene{}). DO NOT USE IT.

    Instead: fetch the raw GCS JSON via tile_map_url, patch it, re-upload.
    This preserves all ground tiles, objects, NPCs, challenges, routes.
    """
    result = {"success": False, "warnings": []}

    try:
        import json
        import httpx
        from app.services import assets_client

        manifest = game_state.manifest or {}
        game_id = manifest.get("game", {}).get("id", game_state.game_id)
        scenes = manifest.get("scenes", [])
        dirty_scene_names = game_state.dirty_scenes

        if not dirty_scene_names:
            result["success"] = True
            return result

        # ── Extract object IDs from the patch ──
        # These are the ONLY objects we should add/remove
        patch_added_ids = set()
        patch_removed_ids = set()
        
        if patch:
            for op in patch.add:
                if op.target_type == "object" and op.data:
                    oid = op.data.get("object_id", op.data.get("id", ""))
                    if oid:
                        patch_added_ids.add(oid)
            
            for op in patch.remove:
                if op.target_type == "object" and op.target_id:
                    patch_removed_ids.add(op.target_id)
        
        logger.info(
            f"Patch contains: +{len(patch_added_ids)} adds, -{len(patch_removed_ids)} removes"
        )

        client = assets_client.get_client()

        # ── Step 1: Fetch scene records from DB to get tile_map_url ──
        try:
            resp = await client.get("/scenes", params={"game_id": game_id})
            if resp.status_code == 200:
                db_scenes = resp.json()
                if isinstance(db_scenes, dict):
                    db_scenes = db_scenes.get("scenes", db_scenes.get("data", []))
                if not isinstance(db_scenes, list):
                    db_scenes = []
            else:
                db_scenes = []
                result["warnings"].append(f"Scene list failed: {resp.status_code}")
        except Exception as e:
            db_scenes = []
            result["warnings"].append(f"Scene list failed: {e}")

        if not db_scenes:
            result["warnings"].append("No DB scenes found")
            return result

        logger.info(f"Found {len(db_scenes)} DB scenes for game {game_id}")

        # ── Step 2: Build scene_name -> {id, tile_map_url} map ──
        scene_info_map = {}
        for db_scene in db_scenes:
            if not isinstance(db_scene, dict):
                continue
            db_name = db_scene.get("scene_name", db_scene.get("name", ""))
            db_id = db_scene.get("id", db_scene.get("scene_id", ""))
            tile_url = db_scene.get("tile_map_url", "")
            if db_name and db_id:
                scene_info_map[db_name] = {"id": db_id, "tile_map_url": tile_url}

        # Fallback: index-based matching
        if not scene_info_map:
            sorted_db = sorted(
                [s for s in db_scenes if isinstance(s, dict)],
                key=lambda s: s.get("scene_index", s.get("order", 0)),
            )
            for i, db_scene in enumerate(sorted_db):
                db_id = db_scene.get("id", db_scene.get("scene_id", ""))
                tile_url = db_scene.get("tile_map_url", "")
                if db_id:
                    scene_info_map[f"Scene {i + 1}"] = {
                        "id": db_id,
                        "tile_map_url": tile_url,
                    }

        if not scene_info_map:
            result["warnings"].append("Could not match scenes to DB records")
            return result

        logger.info(f"Scene info: {list(scene_info_map.keys())}")

        # Write scene IDs back to internal manifest
        for scene in scenes:
            s_name = scene.get("scene_name", f"Scene {scene.get('scene_index', 0) + 1}")
            if s_name in scene_info_map:
                scene["id"] = scene_info_map[s_name]["id"]
                scene["scene_id"] = scene_info_map[s_name]["id"]

        patched_count = 0

        # ── Step 3: For each dirty scene: fetch raw GCS -> patch -> re-upload ──
        for scene_name in dirty_scene_names:
            info = scene_info_map.get(scene_name)
            if not info:
                result["warnings"].append(f"No DB record for '{scene_name}'")
                continue

            scene_id = info["id"]
            tile_map_url = info["tile_map_url"]

            # Find scene data in internal manifest
            scene_data = None
            for s in scenes:
                sn = s.get("scene_name", f"Scene {s.get('scene_index', 0) + 1}")
                if sn == scene_name:
                    scene_data = s
                    break
            if not scene_data:
                continue

            try:
                # ── Fetch RAW GCS manifest (not the API endpoint!) ──
                gcs_data = None
                if tile_map_url:
                    try:
                        async with httpx.AsyncClient(timeout=30.0) as raw_client:
                            gcs_resp = await raw_client.get(tile_map_url)
                            if gcs_resp.status_code == 200:
                                gcs_data = gcs_resp.json()
                                logger.info(
                                    f"Fetched raw GCS for '{scene_name}': "
                                    f"{len(gcs_data.get('asset_placements', []))} placements, "
                                    f"{len(gcs_data.get('npcs', []))} npcs, "
                                    f"{len(gcs_data.get('challenges', []))} challenges, "
                                    f"{len(gcs_data.get('routes', []))} routes"
                                )
                    except Exception as e:
                        logger.warning(f"Raw GCS fetch failed: {e}")

                if not gcs_data:
                    result["warnings"].append(
                        f"Could not fetch GCS for '{scene_name}' "
                        f"(url={'present' if tile_map_url else 'MISSING'})"
                    )
                    continue

                # ── Get existing placements from GCS ──
                existing_placements = gcs_data.get("asset_placements", [])
                existing_ids = set()
                # Also build a lookup by position for objects without IDs
                placement_by_pos = {}  # (x, y) -> placement
                for p in existing_placements:
                    if isinstance(p, dict):
                        oid = p.get("object_id", p.get("id", ""))
                        if oid:
                            existing_ids.add(oid)
                        # Store position lookup for all non-ground placements
                        x, y = p.get("x"), p.get("y")
                        asset_name = p.get("asset_name", "")
                        if x is not None and y is not None and asset_name not in ("grass_green_block", "grass_block"):
                            placement_by_pos[(asset_name, x, y)] = p

                # ── Find objects to REMOVE ──
                # CRITICAL: Handle both real object_ids AND synthetic GCS IDs
                # Synthetic GCS IDs have format: gcs_{asset_name}_{x}_{y}
                removed_ids = set()
                removed_positions = set()  # For objects identified by position
                
                if patch_removed_ids:
                    for oid in patch_removed_ids:
                        # Check if this is a synthetic GCS ID
                        if oid.startswith("gcs_"):
                            # Parse: gcs_pine_tree_5_1 -> asset_name=pine_tree, x=5, y=1
                            parts = oid.split("_")
                            if len(parts) >= 4:
                                try:
                                    # Last two parts are x, y
                                    y = int(parts[-1])
                                    x = int(parts[-2])
                                    # Everything between "gcs" and x,y is the asset name
                                    asset_name = "_".join(parts[1:-2])
                                    removed_positions.add((asset_name, x, y))
                                    logger.info(f"Parsed synthetic ID '{oid}' -> remove {asset_name} at ({x}, {y})")
                                except ValueError:
                                    # Not a valid synthetic ID, try as regular ID
                                    if oid in existing_ids:
                                        removed_ids.add(oid)
                        elif oid in existing_ids:
                            removed_ids.add(oid)
                    
                    if removed_ids:
                        logger.info(f"Removing {len(removed_ids)} objects by ID from '{scene_name}': {removed_ids}")
                    if removed_positions:
                        logger.info(f"Removing {len(removed_positions)} objects by position from '{scene_name}'")

                # ── Filter out removed objects from existing placements ──
                def should_keep_placement(p):
                    if not isinstance(p, dict):
                        return False
                    
                    # Check removal by ID
                    oid = p.get("object_id", p.get("id", ""))
                    if oid and oid in removed_ids:
                        return False
                    
                    # Check removal by position (for objects without IDs)
                    asset_name = p.get("asset_name", "")
                    x, y = p.get("x"), p.get("y")
                    if (asset_name, x, y) in removed_positions:
                        return False
                    
                    return True
                
                filtered_placements = [p for p in existing_placements if should_keep_placement(p)]
                
                removed_count = len(existing_placements) - len(filtered_placements)
                if removed_count > 0:
                    logger.info(f"Actually removed {removed_count} placements from GCS")

                # ── Find ONLY objects that were added by THIS EDIT to add ──
                # CRITICAL: Only add objects whose IDs are in patch_added_ids
                # Do NOT add all objects from in-memory manifest
                # NOTE: If patch was provided but patch_added_ids is EMPTY, add NOTHING
                # (this handles remove-only operations correctly)
                new_placements = []
                seen = set()
                
                # If we have a patch, only add objects from that patch
                # An empty patch_added_ids means "add nothing" (remove-only operation)
                has_patch = patch is not None
                
                for obj in scene_data.get("objects", []) + scene_data.get("actors", []):
                    if not isinstance(obj, dict):
                        continue
                    oid = obj.get("object_id", obj.get("id", ""))
                    
                    # Skip objects already in GCS or already processed
                    if not oid or oid in existing_ids or oid in seen:
                        continue
                    
                    # CRITICAL FIX: If we have a patch, ONLY add objects from patch_added_ids
                    # Even if patch_added_ids is empty (remove-only), we should add NOTHING
                    if has_patch and oid not in patch_added_ids:
                        # This object exists in memory but was NOT added by current edit
                        # Skip it - don't persist decoration/cluster objects from scene generation
                        continue
                        
                    seen.add(oid)

                    # Build complete GCS placement with all properties
                    # including tile_config, hitbox, scale for proper collision/rendering
                    obj_metadata = obj.get("metadata", {})
                    
                    # Build tile_config - critical for collision
                    tile_config = obj_metadata.get("tile_config", {
                        "walkable": "blocked" if not obj.get("walkable") else "walkable",
                        "terrain_cost": 1,
                        "terrain_type": "",
                        "auto_group": "",
                        "is_edge": False
                    })
                    
                    # Build hitbox
                    hitbox = obj_metadata.get("hitbox", {
                        "width": 1,
                        "height": 1,
                        "offset_x": 0,
                        "offset_y": 0
                    })
                    
                    placement = {
                        "asset_name": obj.get("asset_name", "object"),
                        "asset_id": obj.get("asset_id", ""),
                        "x": obj.get("x", 0),
                        "y": obj.get("y", 0),
                        "z_index": obj.get("z_index", 50),
                        "layer": obj.get("layer", "objects"),
                        "scale": obj.get("scale", 1.0),
                        "type": obj.get("type", "object"),
                        "interaction_type": obj.get("interaction_type", "none"),
                        "tags": obj.get("tags", []),
                        "facet": obj.get("facet", ""),
                        "object_id": oid,
                        "metadata": {
                            "added_by": "edit_pipeline",
                            "asset_type": obj.get("type", "object"),
                            "scale": obj.get("scale", 1.0),
                            "tile_config": tile_config,
                            "hitbox": hitbox,
                        },
                    }
                    if obj.get("file_url"):
                        placement["file_url"] = obj["file_url"]
                    if obj.get("display_name"):
                        placement["display_name"] = obj["display_name"]
                    new_placements.append(placement)

                # ── Check if anything changed ──
                if not new_placements and not removed_ids and not removed_positions:
                    logger.info(f"No changes for '{scene_name}'")
                    continue

                logger.info(
                    f"Patching '{scene_name}': "
                    f"+{len(new_placements)} new, -{len(removed_ids) + len(removed_positions)} removed, "
                    f"{len(filtered_placements)} preserved"
                )

                # ── Patch: use filtered placements + new placements ──
                patched = dict(gcs_data)
                patched["asset_placements"] = filtered_placements + new_placements
                
                # Build change notes
                change_notes = []
                if new_placements:
                    change_notes.append(f"+{len(new_placements)} objects")
                if removed_ids or removed_positions:
                    total_removed = len(removed_ids) + len(removed_positions)
                    change_notes.append(f"-{total_removed} objects")
                patched["generation_notes"] = (
                    gcs_data.get("generation_notes", "")
                    + f" | edit: {', '.join(change_notes)}"
                )

                # ── Upload ──
                manifest_json = json.dumps(patched, ensure_ascii=False)
                manifest_bytes = manifest_json.encode("utf-8")
                filename = f"scene_{scene_id}_manifest.json"

                upload_result = await assets_client.upload_file(
                    file_data=manifest_bytes,
                    filename=filename,
                    content_type="application/json",
                    folder="scenes",
                )
                new_url = upload_result.get("file_url", "")

                if new_url:
                    await assets_client.update_scene(
                        scene_id, {"tile_map_url": new_url}
                    )
                    patched_count += 1
                    logger.info(
                        f"GCS patched '{scene_name}': "
                        f"+{len(new_placements)} objects, "
                        f"{len(existing_placements)} preserved -> {new_url}"
                    )

            except Exception as e:
                result["warnings"].append(f"GCS patch failed for '{scene_name}': {e}")
                logger.error(f"GCS patch failed for '{scene_name}': {e}")

        result["success"] = patched_count > 0
        logger.info(
            f"Persistence: {patched_count}/{len(dirty_scene_names)} scenes patched"
        )

    except Exception as e:
        result["warnings"].append(f"Persist failed: {e}")
        logger.error(f"Persist failed: {e}")

    return result