"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    PIPELINE API ROUTES                                        ║
║                                                                               ║
║  REST API endpoints for the AI-powered game generation pipeline.             ║
║                                                                               ║
║  ENDPOINTS:                                                                   ║
║  POST /api/v2/generate    - Generate game from prompt or edit existing       ║
║  POST /api/v2/edit        - Edit existing game                                ║
║  GET  /api/v2/state/{id}  - Get game state                                    ║
║  POST /api/v2/state/{id}/undo - Undo last edit                               ║
║  POST /api/v2/state/{id}/redo - Redo undone edit                             ║
║  GET  /api/v2/states      - List all game states                             ║
║  POST /api/v2/validate    - Validate manifest                                 ║
║  GET  /api/v2/mechanics   - List available mechanics                          ║
║  GET  /api/v2/templates   - List challenge templates                          ║
║  GET  /api/v2/npc-roles   - List NPC roles                                    ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Body, Query
from pydantic import BaseModel, Field

# Validators
from app.validators import (
    validate_manifest as validate_manifest_pipeline,
    ValidationPipeline,
)

# Orchestrator (AI pipeline)
from app.agents.orchestrator import (
    Orchestrator,
    OrchestratorConfig,
    OrchestratorResult,
)
from app.state.game_state import (
    GameState,
    GameStateManager,
    StateStatus,
    get_state_manager,
)

# EditorAgent imported lazily where needed to avoid circular import

# Auto-save import
from app.api.game_generation_api import save_scenes_and_upload_manifests

# Core imports
from app.core.mechanics import ALL_MECHANICS, get_mechanic
from app.core.challenge_templates import (
    get_all_templates,
    get_template,
    PARAMETER_CONSTRAINTS,
)
from app.core.npc_mechanic_mapping import (
    MECHANIC_NPC_ROLES,
    ROLE_SUPPORTED_MECHANICS,
    get_npc_role_for_mechanic,
    get_required_npcs_for_mechanics,
)
from app.core.difficulty_curve import CurveType, AudienceType


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v2", tags=["Pipeline"])


# ═══════════════════════════════════════════════════════════════════════════════
#  REQUEST MODELS
# ═══════════════════════════════════════════════════════════════════════════════


class GenerateRequest(BaseModel):
    """Request for AI-powered game generation.

    GENERATE MODE (simple):
        { "prompt": "A forest adventure where kids collect mushrooms" }
        → If clear: generates manifest directly
        → If ambiguous: returns clarifying questions

    GENERATE MODE (with clarifications):
        {
            "prompt": "make a game",
            "clarifications": {
                "theme": "Forest/Nature",
                "goal": "Collect items"
            }
        }
        → Merges clarifications with prompt, generates manifest

    EDIT MODE:
        { "game_id": "abc123", "instruction": "add campfire near spawn" }
        → Fetches manifest from state/database, applies edit.
    """

    # ── GENERATE MODE ───────────────────────────────────────────────────
    prompt: Optional[str] = Field(
        None,
        description="Natural language game description. Required for new generation.",
        min_length=3,  # Lowered to allow short prompts that need clarification
    )

    # ── CLARIFICATION ANSWERS ───────────────────────────────────────────
    clarifications: Optional[Dict[str, str]] = Field(
        None,
        description="Answers to clarifying questions. Keys: theme, goal, scenes, characters, difficulty",
    )

    skip_clarification: bool = Field(
        False,
        description="Skip clarification and generate with best guess (not recommended for vague prompts)",
    )

    # ── EDIT MODE ───────────────────────────────────────────────────────
    game_id: str = Field(
        "", description="Game ID. Required for edit mode, auto-generated for new games."
    )
    instruction: Optional[str] = Field(
        None,
        description="Natural language edit instruction. Requires game_id.",
    )


class ValidateRequest(BaseModel):
    """Request to validate a manifest."""

    manifest: Dict[str, Any] = Field(..., description="Game manifest to validate")
    stop_on_error: bool = Field(False, description="Stop validation on first error")
    skip_validators: List[str] = Field([], description="Validators to skip")


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPERS
# ═══════════════════════════════════════════════════════════════════════════════


async def _fetch_game_from_database(game_id: str) -> Optional[GameState]:
    """
    Fetch game manifest from database and create GameState.

    Tries to fetch from kinship-scenes API if not found in memory.
    Returns None if not found anywhere.
    """
    try:
        # Try to fetch from database API
        from app.services.scenes_client import fetch_game_manifest

        logger.info(f"Fetching game from database: {game_id}")
        manifest = await fetch_game_manifest(game_id=game_id)

        if manifest:
            # Create GameState from fetched manifest
            state_manager = get_state_manager()
            game_state = state_manager.create_from_manifest(
                manifest=manifest,
                game_id=game_id,
            )
            logger.info(f"Loaded game from database: {game_id}")
            return game_state

        return None

    except ImportError:
        # scenes_client not available
        logger.warning("scenes_client not available, cannot fetch from database")
        return None
    except Exception as e:
        logger.warning(f"Failed to fetch game from database: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
#  GENERATION ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/generate")
async def generate_game_endpoint(request: GenerateRequest):
    """
    Generate a game manifest from a natural language prompt.

    GENERATE MODE:
        POST /api/v2/generate
        { "prompt": "A forest adventure where kids collect mushrooms" }

        → AI interprets prompt, plans game, generates full manifest.

    EDIT MODE:
        POST /api/v2/generate
        { "game_id": "abc123", "instruction": "add a campfire near spawn" }

        → Fetches manifest from state/database, applies edit.
    """
    is_edit = bool(request.instruction and request.game_id)

    if is_edit:
        logger.info(
            f"EDIT mode: game={request.game_id}, instruction='{request.instruction}'"
        )
    else:
        logger.info(
            f"GENERATE mode: '{request.prompt[:60] if request.prompt else 'no prompt'}...'"
        )

    try:
        # ══════════════════════════════════════════════════════════════
        #  EDIT MODE (uses EditorAgent)
        # ══════════════════════════════════════════════════════════════
        if is_edit:
            # ── NEW EDIT PIPELINE (8-layer architecture) ──────────
            from app.edit import run_edit_pipeline

            edit_result = await run_edit_pipeline(
                game_id=request.game_id,
                instruction=request.instruction,
            )

            if edit_result.needs_clarification:
                return {
                    "success": False,
                    "needs_clarification": True,
                    "message": edit_result.clarification_message,
                }

            if edit_result.conflict:
                return {
                    "success": False,
                    "conflict": True,
                    "errors": edit_result.errors,
                    "message": "State modified by another session. Reload and retry.",
                }

            return {
                "success": edit_result.success,
                "game_id": edit_result.game_id,
                "manifest": edit_result.manifest,
                "version": edit_result.version,
                "changes": edit_result.changes,
                "can_undo": edit_result.can_undo,
                "persisted": edit_result.persisted,
                "duration_ms": edit_result.duration_ms,
                "intent_source": edit_result.intent_source,
                "layers_run": edit_result.layers_run,
                "metrics": edit_result.metrics,
                "errors": edit_result.errors,
                "warnings": edit_result.warnings,
            }

        # ══════════════════════════════════════════════════════════════
        #  GENERATE MODE (with clarification support)
        # ══════════════════════════════════════════════════════════════
        if not request.prompt:
            raise HTTPException(
                status_code=422,
                detail="'prompt' is required for game generation. Use 'instruction' + 'game_id' for edits.",
            )

        import uuid as _uuid
        from app.agents.clarification_agent import ClarificationAgent

        # ── STEP 0: Check for clarification ────────────────────────────
        clarifier = ClarificationAgent()

        clarification_result = await clarifier.analyze(
            prompt=request.prompt,
            answers=request.clarifications,
            skip_clarification=request.skip_clarification,
        )

        # If clarification is needed, return questions
        if clarification_result.needs_clarification:
            return {
                "success": False,
                "needs_clarification": True,
                "message": clarification_result.message
                or "I'd love to help create your game! Just a few quick questions:",
                "questions": [q.to_dict() for q in clarification_result.questions],
                "understood": (
                    clarification_result.understood.to_dict()
                    if clarification_result.understood
                    else {}
                ),
                "confidence": clarification_result.confidence,
                "hint": "Send the same prompt with 'clarifications' field containing your answers",
            }

        game_id = request.game_id or str(_uuid.uuid4())

        # Configure orchestrator
        config = OrchestratorConfig(
            use_ai_interpretation=True,
            use_ai_planning=True,
        )

        orchestrator = Orchestrator(config)

        # Use enhanced prompt if clarifications were provided
        enhanced_prompt = clarification_result.enhanced_prompt or request.prompt
        if request.clarifications and not clarification_result.enhanced_prompt:
            enhanced_prompt = clarifier.merge_answers(
                request.prompt, request.clarifications
            )
        logger.info(f"Final prompt: {enhanced_prompt[:100]}...")

        # Run the full AI pipeline
        result = await orchestrator.run(
            prompt=enhanced_prompt,
            game_id=game_id,
            game_name=enhanced_prompt[:50],
        )

        if not result.success:
            return {
                "success": False,
                "errors": result.errors,
                "warnings": result.warnings,
                "duration_ms": result.total_duration_ms,
            }

        manifest = result.manifest

        # ── AUTO-SAVE ─────────────────────────────────────────────────
        synced_scenes = []  # Track synced scenes for frontend
        try:
            game_data = manifest.get("game", {})
            config_data = manifest.get("config", {})
            save_result = await save_scenes_and_upload_manifests(
                manifest=manifest,
                game_id=game_data.get("id", game_id),
                platform_id="",
                goal_type=config_data.get("goal_type", "explore"),
                goal_description=config_data.get("goal_description", ""),
            )

            scene_id_map = save_result.get("scene_id_map", {})
            if scene_id_map and manifest.get("scenes"):
                for idx, scene in enumerate(manifest["scenes"]):
                    scene_name = scene.get("scene_name", "")
                    if scene_name in scene_id_map:
                        scene["id"] = scene_id_map[scene_name]
                        scene["scene_id"] = scene_id_map[scene_name]
                        # Build synced scenes list for frontend
                        synced_scenes.append(
                            {
                                "id": scene_id_map[scene_name],
                                "name": scene_name,
                                "index": idx,
                            }
                        )

                for route in manifest.get("routes", []):
                    from_name = route.get("from_scene_name", "")
                    to_name = route.get("to_scene_name", "")
                    if from_name in scene_id_map:
                        route["from_scene_id"] = scene_id_map[from_name]
                    if to_name in scene_id_map:
                        route["to_scene_id"] = scene_id_map[to_name]

        except Exception as save_err:
            logger.warning(f"Auto-save failed: {save_err}")

        # ── RESPONSE ──────────────────────────────────────────────────
        return {
            "success": True,
            "game_id": game_id,
            "manifest": manifest,
            "synced": {
                "scenes": synced_scenes,  # Frontend needs this for API mode preview
            },
            "stats": {
                "scenes": len(manifest.get("scenes", [])),
                "npcs": len(manifest.get("npcs", {})),
                "challenges": sum(
                    len(s.get("challenges", [])) for s in manifest.get("scenes", [])
                ),
                "routes": len(manifest.get("routes", [])),
            },
            "duration_ms": result.total_duration_ms,
            "warnings": result.warnings,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Generate error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  EDIT ENDPOINT (VIBE CODING)
# ═══════════════════════════════════════════════════════════════════════════════


class EditRequest(BaseModel):
    """Request for natural language game edit."""

    game_id: str = Field(..., description="Game ID to edit")
    instruction: str = Field(..., description="Natural language edit instruction")


@router.post("/edit")
async def edit_game(request: EditRequest):
    """
    Apply a natural language edit to an existing game.

    Example:
        POST /api/v2/edit
        { "game_id": "abc123", "instruction": "add a friendly squirrel NPC near the oak tree" }

    The edit is applied to the GameState and tracked in edit history.
    Supports undo/redo via /state/{game_id}/undo and /state/{game_id}/redo.
    """
    logger.info(
        f"Edit request: game={request.game_id}, instruction='{request.instruction}'"
    )

    try:
        state_manager = get_state_manager()
        game_state = state_manager.get(request.game_id)

        # Try to fetch from database if not in memory
        if not game_state:
            game_state = await _fetch_game_from_database(request.game_id)

        if not game_state:
            raise HTTPException(
                status_code=404,
                detail=f"Game not found: {request.game_id}. Generate a game first.",
            )

        # Apply edit (lazy import to avoid circular dependency)
        from app.agents.editor_agent import EditorAgent

        editor = EditorAgent()
        result = await editor.edit(
            state=game_state,
            instruction=request.instruction,
        )

        if not result.success:
            return {
                "success": False,
                "errors": result.errors,
                "warnings": result.warnings,
                "duration_ms": result.duration_ms,
            }

        # Save state
        state_manager.save(game_state)

        return {
            "success": True,
            "game_id": request.game_id,
            "manifest": game_state.manifest,
            "version": game_state.version,
            "edits_applied": (
                [e.to_dict() for e in result.edits_applied]
                if result.edits_applied
                else []
            ),
            "can_undo": len(game_state.edit_history) > 0,
            "duration_ms": result.duration_ms,
            "warnings": result.warnings,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Edit error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  STATE MANAGEMENT ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/state/{game_id}")
async def get_game_state(game_id: str):
    """
    Get current GameState for a game.

    Returns the full state including manifest, edit history, and metadata.
    Fetches from memory first, then database if not found.
    """
    state_manager = get_state_manager()
    game_state = state_manager.get(game_id)

    # Try to fetch from database if not in memory
    if not game_state:
        game_state = await _fetch_game_from_database(game_id)

    if not game_state:
        raise HTTPException(status_code=404, detail=f"Game not found: {game_id}")

    return {
        "game_id": game_state.game_id,
        "version": game_state.version,
        "status": (
            game_state.status.value
            if hasattr(game_state.status, "value")
            else str(game_state.status)
        ),
        "manifest": game_state.manifest,
        "edit_history": (
            [e.to_dict() for e in game_state.edit_history]
            if game_state.edit_history
            else []
        ),
        "can_undo": len(game_state.edit_history) > 0,
        "can_redo": (
            len(game_state.undo_stack) > 0
            if hasattr(game_state, "undo_stack")
            else False
        ),
        "created_at": (
            game_state.created_at.isoformat()
            if hasattr(game_state, "created_at")
            else None
        ),
        "updated_at": (
            game_state.updated_at.isoformat()
            if hasattr(game_state, "updated_at")
            else None
        ),
    }


@router.delete("/state/{game_id}")
async def delete_game_state(game_id: str):
    """
    Delete a GameState.

    This removes the game from memory. The manifest can still be saved separately.
    """
    state_manager = get_state_manager()

    if not state_manager.get(game_id):
        raise HTTPException(status_code=404, detail=f"Game not found: {game_id}")

    state_manager.delete(game_id)

    return {"success": True, "deleted": game_id}


@router.post("/state/{game_id}/undo")
async def undo_edit(game_id: str):
    """
    Undo the last edit on a game.

    Treats undo as a new state write: restore → persist → update version.
    Returns the reverted state with manifest for immediate client use.
    """
    state_manager = get_state_manager()
    game_state = state_manager.get(game_id)

    # Try to fetch from database if not in memory
    if not game_state:
        game_state = await _fetch_game_from_database(game_id)

    if not game_state:
        raise HTTPException(status_code=404, detail=f"Game not found: {game_id}")

    if not game_state.edit_history:
        raise HTTPException(status_code=400, detail="Nothing to undo")

    # Concurrency check — reject if being edited
    if game_state.status == StateStatus.EDITING:
        raise HTTPException(
            status_code=409,
            detail="Game is currently being edited. Wait and retry.",
        )

    # Perform undo
    undone_edit = game_state.undo()

    if not undone_edit:
        raise HTTPException(status_code=400, detail="Undo failed")

    # Save to memory
    state_manager.save(game_state)

    # Persist to DB (undo = new state write)
    persisted = False
    try:
        await save_scenes_and_upload_manifests(
            manifest=game_state.manifest or {},
            game_id=game_state.manifest.get("game", {}).get("id", game_id),
            platform_id=game_state.platform_id or "",
            goal_type=game_state.manifest.get("config", {}).get("goal_type", ""),
            goal_description=game_state.manifest.get("config", {}).get(
                "goal_description", ""
            ),
        )
        persisted = True
    except Exception as e:
        logger.warning(f"Undo DB persist failed: {e}")

    return {
        "success": True,
        "undone": (
            undone_edit.to_dict()
            if hasattr(undone_edit, "to_dict")
            else str(undone_edit)
        ),
        "manifest": game_state.manifest,
        "version": game_state.version,
        "persisted": persisted,
        "can_undo": len(game_state.edit_history) > 0,
        "can_redo": True,
    }


@router.post("/state/{game_id}/redo")
async def redo_edit(game_id: str):
    """
    Redo a previously undone edit.

    Treats redo as a new state write: restore → persist → update version.
    """
    state_manager = get_state_manager()
    game_state = state_manager.get(game_id)

    if not game_state:
        game_state = await _fetch_game_from_database(game_id)

    if not game_state:
        raise HTTPException(status_code=404, detail=f"Game not found: {game_id}")

    if not hasattr(game_state, "undo_stack") or not game_state.undo_stack:
        raise HTTPException(status_code=400, detail="Nothing to redo")

    # Concurrency check
    if game_state.status == StateStatus.EDITING:
        raise HTTPException(
            status_code=409,
            detail="Game is currently being edited. Wait and retry.",
        )

    # Perform redo
    redone_edit = game_state.redo()

    if not redone_edit:
        raise HTTPException(status_code=400, detail="Redo failed")

    # Save to memory
    state_manager.save(game_state)

    # Persist to DB
    persisted = False
    try:
        await save_scenes_and_upload_manifests(
            manifest=game_state.manifest or {},
            game_id=game_state.manifest.get("game", {}).get("id", game_id),
            platform_id=game_state.platform_id or "",
            goal_type=game_state.manifest.get("config", {}).get("goal_type", ""),
            goal_description=game_state.manifest.get("config", {}).get(
                "goal_description", ""
            ),
        )
        persisted = True
    except Exception as e:
        logger.warning(f"Redo DB persist failed: {e}")

    return {
        "success": True,
        "redone": (
            redone_edit.to_dict()
            if hasattr(redone_edit, "to_dict")
            else str(redone_edit)
        ),
        "manifest": game_state.manifest,
        "version": game_state.version,
        "persisted": persisted,
        "can_undo": True,
        "can_redo": len(game_state.undo_stack) > 0,
    }


@router.get("/states")
async def list_game_states(
    limit: int = Query(20, ge=1, le=100, description="Max states to return"),
    status: Optional[str] = Query(None, description="Filter by status"),
):
    """
    List all active GameStates.

    Returns summary of each game state.
    """
    state_manager = get_state_manager()
    all_states = state_manager.list_all()

    # Filter by status if provided
    if status:
        all_states = [
            s
            for s in all_states
            if str(s.status) == status or getattr(s.status, "value", None) == status
        ]

    # Limit results
    all_states = all_states[:limit]

    return {
        "count": len(all_states),
        "states": [
            {
                "game_id": s.game_id,
                "version": s.version,
                "status": (
                    s.status.value if hasattr(s.status, "value") else str(s.status)
                ),
                "scene_count": len(s.manifest.get("scenes", [])) if s.manifest else 0,
                "edit_count": len(s.edit_history) if s.edit_history else 0,
            }
            for s in all_states
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  VALIDATION ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════


@router.post("/validate")
async def validate_manifest(request: ValidateRequest):
    """Validate a game manifest through the full validation pipeline."""
    logger.info("Validating manifest...")

    try:
        pipeline = ValidationPipeline(
            stop_on_error=request.stop_on_error,
            skip_validators=request.skip_validators,
        )

        result = pipeline.validate(request.manifest)

        return {
            "valid": result.valid,
            "total_errors": len(result.all_errors),
            "total_warnings": len(result.all_warnings),
            "duration_ms": result.total_duration_ms,
            "validators": [
                {
                    "name": r.validator_name,
                    "passed": r.passed,
                    "errors": [
                        {"code": e.code, "message": e.message, "location": e.location}
                        for e in r.errors
                    ],
                    "warnings": [
                        {"code": w.code, "message": w.message, "location": w.location}
                        for w in r.warnings
                    ],
                    "duration_ms": r.duration_ms,
                }
                for r in result.results
            ],
            "summary": result.summary(),
        }

    except Exception as e:
        logger.exception(f"Validation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ═══════════════════════════════════════════════════════════════════════════════
#  REFERENCE DATA ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/mechanics")
async def list_mechanics():
    """List all available game mechanics."""

    mechanics = []
    for mechanic_id, mechanic in ALL_MECHANICS.items():
        mechanics.append(
            {
                "id": mechanic_id,
                "name": mechanic.name,
                "description": mechanic.description,
                "category": mechanic.category.value if mechanic.category else None,
                "pack": mechanic.pack.value if mechanic.pack else None,
                "required_affordances": list(mechanic.required_affordances),
                "required_capabilities": list(mechanic.required_capabilities),
                "base_difficulty": mechanic.base_difficulty,
                "hearts_facets": list(mechanic.hearts_facets),
                "object_slots": list(mechanic.object_slots.keys()),
            }
        )

    return {
        "count": len(mechanics),
        "mechanics": mechanics,
    }


@router.get("/mechanics/{mechanic_id}")
async def get_mechanic_detail(mechanic_id: str):
    """Get details for a specific mechanic."""

    mechanic = get_mechanic(mechanic_id)
    if not mechanic:
        raise HTTPException(
            status_code=404, detail=f"Mechanic not found: {mechanic_id}"
        )

    template = get_template(mechanic_id)
    npc_roles = MECHANIC_NPC_ROLES.get(mechanic_id, [])

    result = {
        "id": mechanic_id,
        "name": mechanic.name,
        "description": mechanic.description,
        "category": mechanic.category.value if mechanic.category else None,
        "pack": mechanic.pack.value if mechanic.pack else None,
        "base_difficulty": mechanic.base_difficulty,
        "required_affordances": list(mechanic.required_affordances),
        "required_capabilities": list(mechanic.required_capabilities),
        "hearts_facets": list(mechanic.hearts_facets),
        "object_slots": {
            name: {
                "affordance": slot.affordance,
                "capability": slot.capability,
                "min_count": slot.min_count,
                "max_count": slot.max_count,
                "is_draggable": slot.is_draggable,
                "is_collectible": slot.is_collectible,
                "is_interactable": slot.is_interactable,
            }
            for name, slot in mechanic.object_slots.items()
        },
        "has_template": template is not None,
        "supported_npc_roles": npc_roles,
    }

    if template:
        result["template"] = {
            "difficulty_range": template.difficulty_range,
            "estimated_time_seconds": template.estimated_time_seconds,
            "constraints": {
                name: {
                    "min": c.min_value,
                    "max": c.max_value,
                    "default": c.default,
                }
                for name, c in template.constraints.items()
            },
            "base_score": template.base_score,
            "base_hearts": template.base_hearts,
        }

    return result


@router.get("/templates")
async def list_templates():
    """List all challenge templates."""

    templates = get_all_templates()

    result = []
    for template_id, template in templates.items():
        mechanic = get_mechanic(template.mechanic_id)

        result.append(
            {
                "id": template_id,
                "mechanic_id": template.mechanic_id,
                "mechanic_name": mechanic.name if mechanic else template_id,
                "difficulty_range": template.difficulty_range,
                "estimated_time_seconds": template.estimated_time_seconds,
                "constraints": {
                    name: {
                        "min": c.min_value,
                        "max": c.max_value,
                        "default": c.default,
                    }
                    for name, c in template.constraints.items()
                },
                "base_score": template.base_score,
                "base_hearts": template.base_hearts,
            }
        )

    return {
        "count": len(result),
        "templates": result,
    }


@router.get("/npc-roles")
async def list_npc_roles():
    """List NPC roles and their mechanic mappings."""

    roles = []
    for role, mechanics in ROLE_SUPPORTED_MECHANICS.items():
        roles.append(
            {
                "role": role,
                "supported_mechanics": mechanics,
                "description": _get_role_description(role),
            }
        )

    return {
        "count": len(roles),
        "roles": roles,
        "mechanic_to_role": MECHANIC_NPC_ROLES,
    }


@router.get("/goal-types")
async def list_goal_types():
    """List available goal types."""

    from app.core.gameplay_loop_planner import GoalType

    return {
        "goal_types": [
            {"id": gt.value, "name": gt.value.replace("_", " ").title()}
            for gt in GoalType
        ],
    }


@router.get("/audience-types")
async def list_audience_types():
    """List available audience types."""

    return {
        "audience_types": [
            {"id": at.value, "name": at.value.replace("_", " ").title()}
            for at in AudienceType
        ],
    }


@router.get("/difficulty-curves")
async def list_difficulty_curves():
    """List available difficulty curve types."""

    return {
        "curve_types": [
            {"id": ct.value, "name": ct.value.replace("_", " ").title()}
            for ct in CurveType
        ],
    }


# ═══════════════════════════════════════════════════════════════════════════════
#  HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════


def _get_role_description(role: str) -> str:
    """Get description for an NPC role."""
    descriptions = {
        "guide": "Helps player navigate and learn mechanics",
        "trainer": "Teaches new skills and mechanics",
        "quest_giver": "Assigns quests and tasks",
        "merchant": "Trades items with player",
        "guardian": "Guards areas, may grant passage",
        "villager": "Provides hints and flavor",
    }
    return descriptions.get(role, "")


# ═══════════════════════════════════════════════════════════════════════════════
#  INFO ENDPOINT
# ═══════════════════════════════════════════════════════════════════════════════


@router.get("/info")
async def get_pipeline_info():
    """Get information about the pipeline."""

    from app.core.gameplay_loop_planner import GoalType

    return {
        "version": "V2",
        "pipeline": {
            "stages": [
                "affordance_enrichment",
                "planning",
                "scene_generation",
                "challenge_generation",
                "npc_generation",
                "auto_balance",
                "dialogue_generation",
                "verification",
                "materialization",
                "route_building",
                "scene_quality_validation",
                "full_validation_pipeline",
                "assembly",
            ],
            "validators": [
                "schema_validator",
                "reference_validator",
                "gameplay_validator",
                "spatial_validator",
                "challenge_validator",
                "route_validator",
                "scene_content_validator",
            ],
        },
        "capabilities": {
            "mechanics_count": len(ALL_MECHANICS),
            "templates_count": len(get_all_templates()),
            "npc_roles": list(ROLE_SUPPORTED_MECHANICS.keys()),
            "goal_types": [gt.value for gt in GoalType],
            "audience_types": [at.value for at in AudienceType],
            "difficulty_curves": [ct.value for ct in CurveType],
            "supports_validation": True,
            "ai_provider": "configurable (AI_PROVIDER env)",
        },
    }
