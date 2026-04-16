"""API endpoints for full scene generation with asset placement.

Add to app/main.py:
    from app.api.scene_gen import router as scene_gen_router
    app.include_router(scene_gen_router)
"""

import logging
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.database import get_db
from app.schemas.scene_generate import (
    SceneFullGenerateRequest,
    SceneFullGenerateResponse,
    SceneRefineRequest,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Scene Generation"])


@router.post("/api/scenes/generate-full", response_model=SceneFullGenerateResponse)
async def generate_full_scene(
    body: SceneFullGenerateRequest, db: AsyncSession = Depends(get_db)
):
    from app.graphs.full_scene_generation import run_full_scene_generation

    result = await run_full_scene_generation(
        prompt=body.prompt,
        scene_name=body.scene_name,
        scene_type=body.scene_type,
        target_facets=body.target_facets,
        dimensions=body.dimensions,
    )
    return result


@router.post("/api/scenes/refine", response_model=SceneFullGenerateResponse)
async def refine_scene(body: SceneRefineRequest, db: AsyncSession = Depends(get_db)):
    from app.graphs.full_scene_generation import run_scene_refinement

    result = await run_scene_refinement(prompt=body.prompt, current=body.current)
    return result


# ── Helpers ───────────────────────────────────────────────────────────────────


def _str(val, default: str = "") -> str:
    if val is None:
        return default
    return str(val)


def _int(val, default: int = 0) -> int:
    if val is None:
        return default
    try:
        return int(val)
    except (TypeError, ValueError):
        logger.warning(f"Could not coerce {val!r} to int, using default {default}")
        return default


def _float(val, default: float = 0.0) -> float:
    if val is None:
        return default
    try:
        return float(val)
    except (TypeError, ValueError):
        logger.warning(f"Could not coerce {val!r} to float, using default {default}")
        return default


def _list(val, default=None) -> list:
    if default is None:
        default = []
    if val is None:
        return default
    if isinstance(val, list):
        return val
    logger.warning(
        f"Expected list but got {type(val).__name__}: {val!r}, using default"
    )
    return default


def _difficulty(val) -> str:
    """Normalize difficulty — AI sometimes returns an integer (1/2/3) instead of a string."""
    VALID = {"easy", "medium", "hard"}
    if isinstance(val, (int, float)):
        mapping = {1: "easy", 2: "medium", 3: "hard"}
        result = mapping.get(int(val), "medium")
        logger.warning(f"Difficulty was numeric {val!r}, mapped to '{result}'")
        return result
    s = str(val).lower().strip() if val else "medium"
    if s not in VALID:
        logger.warning(f"Unknown difficulty {val!r}, defaulting to 'medium'")
        return "medium"
    return s


def _normalize_steps(steps: list) -> list:
    """
    Normalize AI-generated step objects to {order, description} format.

    The AI sometimes returns rich objects with keys like id, action, trigger,
    completion, reward, target_asset etc. The DB stores whatever is given, but
    the ChallengeStep schema requires at minimum order + description.
    This function extracts those two fields and preserves the rest as-is so
    the DB record is always readable by the API response serializer.
    """
    if not isinstance(steps, list):
        return []
    normalized = []
    for i, step in enumerate(steps):
        if not isinstance(step, dict):
            normalized.append({"order": i + 1, "description": str(step)})
            continue
        # Always ensure order and description are present
        order = step.get("order")
        if order is None:
            order = i + 1
        try:
            order = int(order)
        except (TypeError, ValueError):
            order = i + 1
        description = step.get("description", "")
        if not description:
            description = (
                step.get("action", "") or step.get("id", "") or f"Step {order}"
            )
        # Rebuild: keep order + description first, then any extra keys
        normalized_step = {"order": order, "description": str(description)}
        for k, v in step.items():
            if k not in ("order", "description"):
                normalized_step[k] = v
        normalized.append(normalized_step)
    return normalized


# ── Save Endpoint ─────────────────────────────────────────────────────────────


@router.post("/api/scenes/save-generated")
async def save_generated_scene(body: dict, db: AsyncSession = Depends(get_db)):
    """
    Save all generated content:
    1. Create scene in kinship-assets
    2. Upload full manifest JSON to GCS (tile_map_url)
    3. Save NPCs, Challenges, Quests, Routes, Prompt in kinship-knowledge DB
    """
    import json as json_lib
    from app.services import assets_client
    from app.db.models import NPC, Challenge, Quest, Route, Prompt

    created_ids = {
        "scene_id": None,
        "manifest_url": None,
        "npc_ids": [],
        "challenge_ids": [],
        "quest_ids": [],
        "route_ids": [],
    }

    logger.info("=== save-generated: START ===")
    logger.info(
        f"Payload summary — NPCs: {len(body.get('npcs', []))}, "
        f"Challenges: {len(body.get('challenges', []))}, "
        f"Quests: {len(body.get('quests', []))}, "
        f"Routes: {len(body.get('routes', []))}, "
        f"Asset placements: {len(body.get('asset_placements', []))}"
    )

    try:
        scene_data = body.get("scene", {})
        logger.info(
            f"Scene: name={scene_data.get('scene_name')!r}, "
            f"type={scene_data.get('scene_type')!r}, "
            f"lighting={scene_data.get('lighting')!r}, "
            f"weather={scene_data.get('weather')!r}"
        )

        placements = body.get("asset_placements", [])
        asset_ids = list(
            set(p.get("asset_id") for p in placements if p.get("asset_id"))
        )

        # ── Step 1: Create Scene ──
        logger.info("Step 1: Creating scene in kinship-assets...")
        raw_spawns = scene_data.get("spawn_points", [])
        formatted_spawns = [
            {
                "id": sp.get("id", "default"),
                "label": sp.get("id", "spawn"),
                "position": {"x": sp.get("x", 0), "y": sp.get("y", 0)},
                "type": "player",
                "assigned_asset_id": None,
            }
            for sp in raw_spawns
        ]

        # Normalize lighting/weather to values accepted by CreateSceneSchema.
        # The AI may generate free-text values (e.g. "morning", "sunny") that
        # fail Zod enum validation on kinship-assets.
        VALID_LIGHTING = {"day", "night", "dawn", "dusk"}
        VALID_WEATHER = {"clear", "rain", "fog", "snow", "none"}

        raw_lighting = str(scene_data.get("lighting", "day")).lower().strip()
        raw_weather = str(scene_data.get("weather", "clear")).lower().strip()

        # Map common AI aliases to valid enum values
        LIGHTING_MAP = {
            "morning": "dawn",
            "sunrise": "dawn",
            "afternoon": "day",
            "evening": "dusk",
            "sunset": "dusk",
            "midnight": "night",
            "dark": "night",
            "bright": "day",
            "sunny": "day",
        }
        WEATHER_MAP = {
            "sunny": "clear",
            "cloudy": "clear",
            "overcast": "clear",
            "windy": "clear",
            "stormy": "rain",
            "rainy": "rain",
            "drizzle": "rain",
            "mist": "fog",
            "misty": "fog",
            "hazy": "fog",
            "snowy": "snow",
            "blizzard": "snow",
        }

        lighting = (
            raw_lighting
            if raw_lighting in VALID_LIGHTING
            else LIGHTING_MAP.get(raw_lighting, "day")
        )
        weather = (
            raw_weather
            if raw_weather in VALID_WEATHER
            else WEATHER_MAP.get(raw_weather, "clear")
        )

        if lighting != raw_lighting:
            logger.warning(f"Lighting {raw_lighting!r} mapped to {lighting!r}")
        if weather != raw_weather:
            logger.warning(f"Weather {raw_weather!r} mapped to {weather!r}")

        # Note: asset_ids is intentionally excluded — CreateSceneSchema does not
        # accept it and kinship-assets will return 400 if it is present.
        scene_payload = {
            "scene_name": scene_data.get("scene_name", "Generated Scene"),
            "scene_type": scene_data.get("scene_type", "forest"),
            "description": scene_data.get("description", ""),
            "system_prompt": body.get("system_prompt", ""),
            "ambient": {
                "lighting": lighting,
                "weather": weather,
                "background_color": scene_data.get("background_color"),
            },
            "spawn_points": formatted_spawns,
            "created_by": body.get("created_by", "studio"),
        }
        # Attach game_id if provided (links scene to a specific game)
        if body.get("game_id"):
            scene_payload["game_id"] = body["game_id"]
        scene = await assets_client.create_scene(scene_payload)
        scene_id = scene.get("id", "")
        created_ids["scene_id"] = scene_id
        logger.info(f"Step 1: OK — scene_id={scene_id!r}")

        # ── Step 2: Upload manifest ──
        logger.info("Step 2: Building and uploading manifest JSON to GCS...")
        full_manifest = {
            "scene": {
                "scene_name": scene_data.get("scene_name"),
                "scene_type": scene_data.get("scene_type"),
                "description": scene_data.get("description"),
                "lighting": scene_data.get("lighting", "day"),
                "weather": scene_data.get("weather", "clear"),
                "background_color": scene_data.get("background_color"),
                "target_facets": scene_data.get("target_facets", []),
                "dimensions": scene_data.get("dimensions", {"width": 16, "height": 16}),
                "spawn_points": scene_data.get("spawn_points", []),
                "zone_descriptions": scene_data.get("zone_descriptions", []),
            },
            "asset_placements": body.get("asset_placements", []),
            "npcs": body.get("npcs", []),
            "challenges": body.get("challenges", []),
            "quests": body.get("quests", []),
            "routes": body.get("routes", []),
            "system_prompt": body.get("system_prompt", ""),
            "generation_notes": body.get("generation_notes", ""),
        }

        manifest_json = json_lib.dumps(full_manifest, ensure_ascii=False)
        manifest_bytes = manifest_json.encode("utf-8")
        manifest_filename = f"scene_{scene_id}_manifest.json"

        upload_result = await assets_client.upload_file(
            file_data=manifest_bytes,
            filename=manifest_filename,
            content_type="application/json",
            folder="scenes",
        )
        manifest_url = upload_result.get("file_url", "")
        created_ids["manifest_url"] = manifest_url
        logger.info(f"Step 2: OK — manifest_url={manifest_url!r}")

        # ── Step 3: Update scene tile_map_url ──
        logger.info("Step 3: Updating scene tile_map_url...")
        await assets_client.update_scene(scene_id, {"tile_map_url": manifest_url})
        logger.info("Step 3: OK")

        # ── Step 4: NPCs ──
        npcs_data = body.get("npcs", [])
        logger.info(f"Step 4: Creating {len(npcs_data)} NPCs...")
        for i, npc_data in enumerate(npcs_data):
            logger.debug(
                f"  NPC[{i}]: name={npc_data.get('name')!r}, "
                f"facet={npc_data.get('facet')!r}"
            )
            npc = NPC(
                name=_str(npc_data.get("name"), "NPC"),
                role=_str(npc_data.get("role")) or None,
                game_id=body.get("game_id") or None,
                scene_id=scene_id,
                facet=_str(npc_data.get("facet"), "E"),
                personality=_str(npc_data.get("personality")) or None,
                background=_str(npc_data.get("background")) or None,
                dialogue_style=_str(npc_data.get("dialogue_style")) or None,
                catchphrases=_list(npc_data.get("catchphrases")),
                status="draft",
            )
            db.add(npc)
            await db.flush()
            created_ids["npc_ids"].append(str(npc.id))
            logger.debug(f"  NPC[{i}] OK — id={npc.id}")
        logger.info(f"Step 4: OK — {len(created_ids['npc_ids'])} NPCs saved")

        # ── Step 5: Challenges ──
        challenges_data = body.get("challenges", [])
        logger.info(f"Step 5: Creating {len(challenges_data)} Challenges...")
        for i, ch_data in enumerate(challenges_data):
            raw_diff = ch_data.get("difficulty", "medium")
            raw_time = ch_data.get("time_limit_sec", 0)
            raw_delta = ch_data.get("base_delta", 5.0)
            raw_steps = ch_data.get("steps", [])
            raw_facets = ch_data.get("facets", [])

            logger.debug(
                f"  Challenge[{i}]: name={ch_data.get('name')!r}, "
                f"difficulty={raw_diff!r} ({type(raw_diff).__name__}), "
                f"time_limit_sec={raw_time!r} ({type(raw_time).__name__}), "
                f"base_delta={raw_delta!r}, "
                f"facets={raw_facets!r}, "
                f"steps_count={len(raw_steps) if isinstance(raw_steps, list) else repr(raw_steps)}"
            )

            ch = Challenge(
                name=_str(ch_data.get("name"), "Challenge"),
                description=_str(ch_data.get("description")) or None,
                game_id=body.get("game_id") or None,
                scene_id=scene_id,
                facets=_list(raw_facets),
                difficulty=_difficulty(raw_diff),
                steps=_normalize_steps(raw_steps),
                success_criteria=_str(ch_data.get("success_criteria")) or None,
                base_delta=_float(raw_delta, 5.0),
                time_limit_sec=_int(raw_time, 0),
                status="draft",
            )
            db.add(ch)
            await db.flush()
            created_ids["challenge_ids"].append(str(ch.id))
            logger.debug(f"  Challenge[{i}] OK — id={ch.id}")
        logger.info(
            f"Step 5: OK — {len(created_ids['challenge_ids'])} Challenges saved"
        )

        # ── Step 6: Quests ──
        quests_data = body.get("quests", [])
        logger.info(f"Step 6: Creating {len(quests_data)} Quests...")
        for i, q_data in enumerate(quests_data):
            raw_seq = q_data.get("sequence_order", 1)
            logger.debug(
                f"  Quest[{i}]: name={q_data.get('name')!r}, "
                f"beat_type={q_data.get('beat_type')!r}, "
                f"facet={q_data.get('facet')!r}, "
                f"sequence_order={raw_seq!r} ({type(raw_seq).__name__})"
            )
            q = Quest(
                name=_str(q_data.get("name"), "Quest"),
                beat_type=_str(q_data.get("beat_type")) or None,
                facet=_str(q_data.get("facet"), "E"),
                game_id=body.get("game_id") or None,
                scene_id=scene_id,
                description=_str(q_data.get("description")) or None,
                narrative_content=_str(q_data.get("narrative_content")) or None,
                sequence_order=_int(raw_seq, 1),
                status="draft",
            )
            db.add(q)
            await db.flush()
            created_ids["quest_ids"].append(str(q.id))
            logger.debug(f"  Quest[{i}] OK — id={q.id}")
        logger.info(f"Step 6: OK — {len(created_ids['quest_ids'])} Quests saved")

        # ── Step 7: Routes ──
        routes_data = body.get("routes", [])
        logger.info(f"Step 7: Creating {len(routes_data)} Routes...")
        for i, r_data in enumerate(routes_data):
            logger.debug(
                f"  Route[{i}]: name={r_data.get('name')!r}, "
                f"to_scene={r_data.get('to_scene')!r}, "
                f"trigger_type={r_data.get('trigger_type')!r}, "
                f"bidirectional={r_data.get('bidirectional')!r}"
            )
            r = Route(
                name=_str(r_data.get("name"), "Route"),
                game_id=body.get("game_id") or None,
                from_scene=scene_id,
                to_scene=_str(r_data.get("to_scene")) or None,
                description=_str(r_data.get("description")) or None,
                trigger_type=_str(r_data.get("trigger_type"), "auto"),
                conditions=_list(r_data.get("conditions")),
                bidirectional=bool(r_data.get("bidirectional", False)),
                status="draft",
            )
            db.add(r)
            await db.flush()
            created_ids["route_ids"].append(str(r.id))
            logger.debug(f"  Route[{i}] OK — id={r.id}")
        logger.info(f"Step 7: OK — {len(created_ids['route_ids'])} Routes saved")

        # ── Step 8: System Prompt ──
        sys_prompt = body.get("system_prompt", "")
        if sys_prompt:
            logger.info("Step 8: Creating system prompt...")
            prompt = Prompt(
                tier=2,
                name=f"{scene_data.get('scene_name', 'Scene')} — System Prompt",
                content=sys_prompt,
                scene_type=scene_data.get("scene_type", "forest"),
                status="active",
            )
            db.add(prompt)
            logger.info("Step 8: OK")
        else:
            logger.info("Step 8: No system prompt, skipping")

        logger.info("Committing transaction...")
        await db.commit()
        logger.info("=== save-generated: SUCCESS ===")

        return {
            "status": "saved",
            "scene_id": scene_id,
            "manifest_url": manifest_url,
            "created": created_ids,
        }

    except Exception as e:
        logger.error("=== save-generated: FAILED ===")
        logger.error(f"Error type : {type(e).__name__}")
        logger.error(f"Error msg  : {str(e)}")
        logger.error(f"Traceback  :\n{traceback.format_exc()}")
        logger.error(f"created_ids: {created_ids}")
        await db.rollback()
        raise HTTPException(500, f"Failed to save: {type(e).__name__}: {str(e)}")
