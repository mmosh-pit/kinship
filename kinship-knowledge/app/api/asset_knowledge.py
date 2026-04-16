"""API routes for asset knowledge generation (Claude Vision analysis)."""

import logging
from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/asset-knowledge", tags=["Asset Knowledge"])


@router.post("/generate/{asset_id}")
async def generate_single_knowledge(asset_id: str):
    """Generate knowledge for a single asset using Claude Vision.

    NOTE: This does NOT save to the database. The Studio frontend will
    populate the form with the result, and the user clicks "Save Knowledge"
    to persist it.
    """
    from app.services import assets_client
    from app.services.knowledge_generator import (
        generate_knowledge_for_asset,
    )

    asset = await assets_client.get_asset(asset_id)
    if not asset:
        return {"status": "error", "message": f"Asset {asset_id} not found"}
    all_assets = await assets_client.fetch_all_assets()
    catalog_names = [a.get("name", "") for a in all_assets if a.get("name")]
    result = await generate_knowledge_for_asset(
        asset=asset, catalog_names=catalog_names
    )
    knowledge = result.get("knowledge", {})

    # Return generated knowledge WITHOUT saving - user will click "Save Knowledge"
    return {
        "status": "ok",
        "asset_id": asset_id,
        "asset_name": asset.get("name"),
        "knowledge": knowledge,
    }


@router.post("/generate-all")
async def generate_all_knowledge(body: dict = {}):
    """Generate knowledge for ALL assets, then embed. Body: {"skip_existing": true, "regenerate_design": true}"""
    from app.services.knowledge_generator import generate_knowledge_for_all
    from app.services.asset_embeddings import embed_all_assets

    skip_existing = body.get("skip_existing", True)
    regenerate_design = body.get("regenerate_design", True)

    # Generate knowledge
    result = await generate_knowledge_for_all(skip_existing=skip_existing)

    # Embed all assets into Pinecone
    try:
        embed_result = await embed_all_assets()
        result["embeddings"] = embed_result
    except Exception as e:
        result["embeddings"] = {"status": "error", "message": str(e)}

    # Regenerate design knowledge
    if regenerate_design and result.get("generated", 0) > 0:
        try:
            from app.services.design_knowledge_generator import (
                generate_design_knowledge,
            )

            result["design_knowledge"] = await generate_design_knowledge()
        except Exception as e:
            result["design_knowledge"] = {"status": "error", "message": str(e)}

    return result


@router.post("/sync")
async def sync_knowledge(body: dict = {}):
    """Full sync: generate knowledge → embed assets → design knowledge.

    By default, SKIPS assets that already have knowledge (fast re-runs).
    Pass {"force_regenerate": true} to regenerate all.
    Pass {"skip_knowledge": true} to only embed + design (fastest).

    Steps:
      1. Fetch all assets from kinship-assets
      2. Generate Claude Vision knowledge for NEW assets only (saves to DB)
      3. Embed all assets WITH knowledge into Pinecone
      4. Generate design knowledge patterns
    """
    from app.services import assets_client
    from app.services.knowledge_generator import generate_knowledge_for_all
    from app.services.asset_embeddings import embed_all_assets
    from app.services.design_knowledge_generator import generate_design_knowledge

    force_regenerate = body.get("force_regenerate", False)
    skip_knowledge = body.get("skip_knowledge", False)
    skip_design = body.get("skip_design", False)

    results = {}

    # Step 1: Fetch assets
    logger.info("Step 1: Fetching assets...")
    assets = await assets_client.fetch_all_assets()
    results["total_assets"] = len(assets)
    logger.info(f"Step 1: ✅ Found {len(assets)} assets")

    # Step 2: Generate knowledge (SKIP existing by default)
    if not skip_knowledge:
        logger.info(
            f"Step 2: Generating knowledge (force_regenerate={force_regenerate})..."
        )
        skip_existing = not force_regenerate
        knowledge_result = await generate_knowledge_for_all(
            assets=assets, skip_existing=skip_existing
        )
        results["knowledge"] = knowledge_result
        logger.info(
            f"Step 2: ✅ Generated: {knowledge_result.get('generated', 0)}, Skipped: {knowledge_result.get('skipped', 0)}"
        )
    else:
        results["knowledge"] = {"status": "skipped"}
        logger.info("Step 2: ⏭️ Skipped (skip_knowledge=true)")

    # Step 3: Embed all assets into Pinecone
    logger.info("Step 3: Embedding assets into Pinecone...")
    try:
        embed_result = await embed_all_assets()
        results["embeddings"] = embed_result
        logger.info(f"Step 3: ✅ Embedded {embed_result.get('total', 0)} assets")
    except Exception as e:
        logger.error(f"Step 3: ❌ Embedding failed: {e}")
        results["embeddings"] = {"status": "error", "message": str(e)}

    # Step 4: Generate design patterns
    if not skip_design:
        logger.info("Step 4: Generating design patterns...")
        try:
            design_result = await generate_design_knowledge()
            results["design"] = design_result
            logger.info("Step 4: ✅ Design patterns generated")
        except Exception as e:
            logger.error(f"Step 4: ❌ Design generation failed: {e}")
            results["design"] = {"status": "error", "message": str(e)}
    else:
        results["design"] = {"status": "skipped"}

    return {"status": "ok", **results}


@router.get("/coverage")
async def knowledge_coverage():
    """Check knowledge coverage — how many assets have knowledge generated."""
    from app.services import assets_client

    assets = await assets_client.fetch_all_assets()
    total = len(assets)
    with_knowledge = 0
    without_knowledge = []
    by_role = {}
    for a in assets:
        knowledge = a.get("knowledge")
        if knowledge and knowledge.get("visual_description"):
            with_knowledge += 1
            role = knowledge.get("scene_role", "unknown")
            by_role[role] = by_role.get(role, 0) + 1
        else:
            without_knowledge.append(a.get("name", "?"))
    return {
        "total_assets": total,
        "with_knowledge": with_knowledge,
        "without_knowledge": len(without_knowledge),
        "coverage_pct": round(with_knowledge / total * 100) if total else 0,
        "missing": without_knowledge[:20],
        "by_scene_role": by_role,
    }
