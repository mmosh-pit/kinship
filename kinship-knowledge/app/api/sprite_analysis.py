"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║                    SPRITE ANALYSIS — ENHANCED                                 ║
║                                                                               ║
║  Drop-in replacement for app/api/sprite_analysis.py                           ║
║                                                                               ║
║  WHAT CHANGED:                                                                ║
║  1. After sprite_analyzer returns, automatically runs knowledge_generator     ║
║     to extract affordances + capabilities from the same image                 ║
║  2. Merges sprite metadata + knowledge into a single response                 ║
║  3. Normalizes all affordances using canonical vocabulary                     ║
║  4. Falls back to affordance_deriver if knowledge_generator fails             ║
║  5. Returns affordance coverage in response so Studio can show warnings       ║
║                                                                               ║
║  The Studio still gets the same response shape — analysis field —             ║
║  but now it includes affordances and capabilities.                            ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from fastapi import APIRouter, UploadFile, File, Form
from app.services.sprite_analyzer import analyze_sprite_image

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["Sprite Analysis"])


@router.post("/analyze-sprite")
async def analyze_sprite(
    file: UploadFile = File(...),
    filename: str = Form("sprite.png"),
    width: int = Form(0),
    height: int = Form(0),
):
    """
    Analyze a sprite sheet image with AI and return COMPLETE metadata.

    Now includes affordances and capabilities from knowledge_generator.

    Flow:
    1. sprite_analyzer: sprite sheets, movement, personality, hitbox, tags
    2. knowledge_generator: affordances, capabilities, placement rules
    3. affordance_deriver: deterministic fallback if #2 fails
    4. normalization: canonical vocabulary for mechanic_matcher
    """
    image_data = await file.read()

    # Determine media type
    media_type = file.content_type or "image/png"
    if media_type not in ("image/png", "image/jpeg", "image/webp", "image/gif"):
        media_type = "image/png"

    resolved_filename = filename or file.filename or "sprite.png"

    # ─── Step 1: Run sprite analyzer (original behavior) ───────────────
    result = await analyze_sprite_image(
        image_data=image_data,
        filename=resolved_filename,
        width=width,
        height=height,
        media_type=media_type,
    )

    if result.get("status") != "ok":
        return result

    analysis = result.get("analysis", {})

    # ─── Step 2: Run knowledge generator for affordances ───────────────
    affordances = []
    capabilities = []
    knowledge_status = "skipped"

    try:
        knowledge = await _generate_knowledge_from_image(
            image_data=image_data,
            filename=resolved_filename,
            asset_type=analysis.get("asset_type", "object"),
            tags=analysis.get("tags", []),
            media_type=media_type,
        )

        if knowledge:
            # Normalize
            from app.services.knowledge_generator import (
                normalize_and_validate_affordances,
                normalize_and_validate_capabilities,
            )

            raw_affordances = knowledge.get("affordances", [])
            raw_capabilities = knowledge.get("capabilities", [])

            affordances = normalize_and_validate_affordances(raw_affordances)
            capabilities = normalize_and_validate_capabilities(raw_capabilities)

            knowledge_status = "generated"
            logger.info(
                f"Knowledge generated for {resolved_filename}: "
                f"affordances={affordances}, capabilities={capabilities}"
            )

    except Exception as e:
        logger.warning(f"Knowledge generation failed for {resolved_filename}: {e}")
        knowledge_status = "failed"

    # ─── Step 3: Fallback to affordance_deriver if needed ──────────────
    if not affordances and not capabilities:
        try:
            from app.services.affordance_deriver import ensure_affordances

            # Build a temporary asset dict from the analysis
            temp_asset = {
                "name": resolved_filename,
                "type": analysis.get("asset_type", "object"),
                "tags": analysis.get("tags", []),
                "rules": analysis.get("rules", {}),
                "interaction": analysis.get("interaction", {}),
                "tile_config": analysis.get("tile_config", {}),
                "movement": analysis.get("movement", {}),
                "knowledge": {},
            }

            ensure_affordances([temp_asset])

            derived_knowledge = temp_asset.get("knowledge", {})
            affordances = derived_knowledge.get("affordances", [])
            capabilities = derived_knowledge.get("capabilities", [])

            if affordances or capabilities:
                knowledge_status = "derived"
                logger.info(
                    f"Affordances derived for {resolved_filename}: "
                    f"affordances={affordances}, capabilities={capabilities}"
                )

        except Exception as e:
            logger.warning(f"Affordance derivation failed: {e}")

    # ─── Step 4: Merge into analysis response ──────────────────────────
    analysis["affordances"] = affordances
    analysis["capabilities"] = capabilities

    # Also add to a knowledge sub-object for consistency with knowledge_generator
    if "knowledge" not in analysis:
        analysis["knowledge"] = {}
    analysis["knowledge"]["affordances"] = affordances
    analysis["knowledge"]["capabilities"] = capabilities

    result["analysis"] = analysis
    result["affordance_status"] = knowledge_status
    result["affordance_count"] = len(affordances)
    result["capability_count"] = len(capabilities)

    return result


async def _generate_knowledge_from_image(
    image_data: bytes,
    filename: str,
    asset_type: str,
    tags: list[str],
    media_type: str,
) -> dict:
    """
    Run knowledge_generator on raw image data.

    This is a lightweight version that doesn't need a saved asset or URL.
    Calls Claude Vision directly with the affordance-aware prompt.
    """
    import base64
    import json
    from app.config import get_settings
    from app.services.knowledge_generator import (
        ANALYSIS_SYSTEM_PROMPT,
        build_analysis_prompt,
    )

    settings = get_settings()
    api_key = settings.anthropic_api_key

    if not api_key:
        logger.warning("No API key — skipping knowledge generation")
        return {}

    b64 = base64.b64encode(image_data).decode("utf-8")
    prompt = build_analysis_prompt(filename, asset_type, tags)

    try:
        import httpx

        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": (
                        settings.claude_sonnet_model
                        if hasattr(settings, "claude_sonnet_model")
                        else "claude-sonnet-4-20250514"
                    ),
                    "max_tokens": 2000,
                    "system": ANALYSIS_SYSTEM_PROMPT,
                    "messages": [
                        {
                            "role": "user",
                            "content": [
                                {
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": b64,
                                    },
                                },
                                {"type": "text", "text": prompt},
                            ],
                        }
                    ],
                },
            )
            response.raise_for_status()
            result = response.json()

        content = result.get("content", [{}])[0].get("text", "{}")

        # Clean markdown
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0]
        elif "```" in content:
            content = content.split("```")[1].split("```")[0]

        knowledge = json.loads(content.strip())
        return knowledge

    except Exception as e:
        logger.error(f"Knowledge from image failed: {e}")
        return {}


# ═══════════════════════════════════════════════════════════════════════════════
#  ENHANCED WEBHOOK — add normalization
# ═══════════════════════════════════════════════════════════════════════════════
# Apply this patch to app/api/webhooks.py → _generate_and_embed()
#
# After: result = await generate_knowledge_for_asset(asset=asset, catalog_names=catalog_names)
# Add:
#
#     # Normalize affordances
#     knowledge = result.get("knowledge", {})
#     if knowledge:
#         from app.services.knowledge_generator import (
#             normalize_and_validate_affordances,
#             normalize_and_validate_capabilities,
#         )
#         if knowledge.get("affordances"):
#             knowledge["affordances"] = normalize_and_validate_affordances(
#                 knowledge["affordances"]
#             )
#         if knowledge.get("capabilities"):
#             knowledge["capabilities"] = normalize_and_validate_capabilities(
#                 knowledge["capabilities"]
#             )
#         result["knowledge"] = knowledge
