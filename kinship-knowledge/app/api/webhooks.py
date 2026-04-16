"""
╔═══════════════════════════════════════════════════════════════════════════════╗
║  WEBHOOK — ENHANCED                                                           ║
║                                                                               ║
║  Drop-in replacement for app/api/webhooks.py                                  ║
║                                                                               ║
║  WHAT CHANGED:                                                                ║
║  1. _generate_and_embed now normalizes affordances after Claude Vision         ║
║  2. Logs affordance/capability counts for monitoring                          ║
║  3. Falls back to affordance_deriver if Vision returns empty affordances      ║
╚═══════════════════════════════════════════════════════════════════════════════╝
"""

import logging
from fastapi import APIRouter, BackgroundTasks

logger = logging.getLogger(__name__)
router = APIRouter(tags=["Webhooks"])


@router.post("/api/webhooks/asset-changed")
async def handle_asset_webhook(body: dict, background_tasks: BackgroundTasks):
    event = body.get("event", "")
    asset_id = body.get("asset_id", "")
    if not event or not asset_id:
        return {"status": "ignored", "reason": "missing event or asset_id"}
    logger.info(f"Webhook received: {event} for asset {asset_id}")
    background_tasks.add_task(_process_webhook, event, asset_id)
    return {"status": "accepted", "event": event, "asset_id": asset_id}


async def _process_webhook(event: str, asset_id: str):
    try:
        if event in ("asset.created", "asset.updated"):
            await _generate_and_embed(asset_id)
        elif event == "asset.deleted":
            from app.services.pinecone_client import get_pinecone_index

            index = get_pinecone_index()
            index.delete(ids=[f"asset_{asset_id}"], namespace="kinship-assets")
            logger.info(f"Deleted embedding for asset: {asset_id}")
        elif event == "metadata.updated":
            await _reembed_only(asset_id)
    except Exception as e:
        logger.error(f"Webhook processing failed for {event}/{asset_id}: {e}")


async def _generate_and_embed(asset_id: str):
    from app.services import assets_client
    from app.services.knowledge_generator import (
        generate_knowledge_for_asset,
        embed_asset_knowledge,
        _save_knowledge,
        normalize_and_validate_affordances,
        normalize_and_validate_capabilities,
    )

    asset = await assets_client.get_asset(asset_id)
    if not asset:
        logger.warning(f"Asset {asset_id} not found")
        return

    all_assets = await assets_client.fetch_all_assets()
    catalog_names = [a.get("name", "") for a in all_assets if a.get("name")]

    result = await generate_knowledge_for_asset(
        asset=asset, catalog_names=catalog_names
    )

    # ═══ ENHANCEMENT: Normalize affordances ═══
    knowledge = result.get("knowledge", {})
    if knowledge:
        # Normalize Vision output to canonical vocabulary
        raw_affordances = knowledge.get("affordances", [])
        raw_capabilities = knowledge.get("capabilities", [])

        if raw_affordances:
            knowledge["affordances"] = normalize_and_validate_affordances(
                raw_affordances
            )
        if raw_capabilities:
            knowledge["capabilities"] = normalize_and_validate_capabilities(
                raw_capabilities
            )

        # If Vision returned nothing, derive from metadata
        if not knowledge.get("affordances") and not knowledge.get("capabilities"):
            try:
                from app.services.affordance_deriver import ensure_affordances

                temp_asset = {**asset, "knowledge": knowledge}
                ensure_affordances([temp_asset])
                knowledge = temp_asset.get("knowledge", knowledge)
                logger.info(
                    f"Derived affordances for {asset.get('name', asset_id)}: "
                    f"{knowledge.get('affordances', [])}"
                )
            except Exception as e:
                logger.warning(f"Affordance derivation failed: {e}")

        result["knowledge"] = knowledge

    # Log affordance quality
    aff_count = len(knowledge.get("affordances", []))
    cap_count = len(knowledge.get("capabilities", []))
    logger.info(
        f"Knowledge for {asset.get('name', asset_id)}: "
        f"{aff_count} affordances, {cap_count} capabilities"
    )
    if aff_count == 0:
        logger.warning(
            f"⚠ Asset {asset.get('name', asset_id)} has ZERO affordances — "
            f"mechanic matching will skip this asset"
        )

    await _save_knowledge(asset_id, result)
    await embed_asset_knowledge(asset, result.get("knowledge", {}))
    logger.info(f"Knowledge generated + embedded for {asset.get('name', asset_id)}")


async def _reembed_only(asset_id: str):
    from app.services import assets_client
    from app.services.knowledge_generator import embed_asset_knowledge

    asset = await assets_client.get_asset(asset_id)
    if not asset:
        return
    knowledge = asset.get("knowledge", {})
    if not knowledge:
        await _generate_and_embed(asset_id)
        return
    await embed_asset_knowledge(asset, knowledge)
